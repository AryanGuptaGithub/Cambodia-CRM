import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ======================= HELPERS =======================
function formatDateForExcel(date) {
  if (!date) return "N/A";
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = d.toLocaleString("default", { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

function capitalizeFirstLetter(str) {
  if (!str) return "N/A";
  str = str.toString();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─────────────────────────────────────────────────────────
// CORE: Build zone-wise data based on new definition
// ─────────────────────────────────────────────────────────
async function buildZoneData(search = "") {
  // Fixed period: from Jan 1 of current year to today
  const now = new Date();
  const currentYear = now.getFullYear();
  const periodStart = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
  const periodEnd = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  // 1. Get ALL customers who have ever purchased (any sale, not return/exchange)
  const allCustomersAgg = await SaleSummary.aggregate([
    {
      $match: {
        isReturn: { $ne: true },
        isExchange: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$customerCode",
        customerName: { $first: "$customerName" },
        customerCode: { $first: "$customerCode" },
        customerId: { $first: "$customerId" },
        mrName: { $first: "$mrName" },
        absoluteFirstPurchase: { $min: "$invoiceDate" },
        absoluteLastPurchase: { $max: "$invoiceDate" },
        totalOrdersAllTime: { $sum: 1 },
        totalSalesAmountAllTime: { $sum: "$totalAmount" },
        periodOrders: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$invoiceDate", periodStart] },
                  { $lte: ["$invoiceDate", periodEnd] },
                ],
              },
              1,
              0,
            ],
          },
        },
        periodSalesAmount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ["$invoiceDate", periodStart] },
                  { $lte: ["$invoiceDate", periodEnd] },
                ],
              },
              "$totalAmount",
              0,
            ],
          },
        },
        firstPurchaseInPeriod: {
          $min: {
            $cond: [
              { $gte: ["$invoiceDate", periodStart] },
              "$invoiceDate",
              null,
            ],
          },
        },
        lastPurchaseInPeriod: {
          $max: {
            $cond: [
              { $gte: ["$invoiceDate", periodStart] },
              "$invoiceDate",
              null,
            ],
          },
        },
      },
    },
  ]);

  if (allCustomersAgg.length === 0) return [];

  // 2. Get zone info from Customer master (enabled only)
  const customerIds = allCustomersAgg.map((c) => c.customerId).filter(Boolean);
  const customerCodes = allCustomersAgg
    .map((c) => c.customerCode)
    .filter(Boolean);

  const customerMasterData = await Customer.find(
    {
      $or: [
        { _id: { $in: customerIds } },
        { customerCode: { $in: customerCodes } },
      ],
      enabled: true, // 👈 only enabled customers
    },
    {
      _id: 1,
      customerCode: 1,
      zone: 1,
      province: 1,
      address: 1,
      customerNumber: 1,
      typeOfBusiness: 1,
    },
  ).lean();

  // Build a Set of valid customer identifiers (both _id and customerCode)
  const validCustomerIds = new Set();
  const validCustomerCodes = new Set();
  const zoneByCustomer = {};

  customerMasterData.forEach((c) => {
    const idKey = c._id.toString();
    validCustomerIds.add(idKey);
    zoneByCustomer[idKey] = {
      zone: c.zone || "Unknown Zone",
      province: c.province,
      address: c.address,
      typeOfBusiness: c.typeOfBusiness,
    };
    if (c.customerCode) {
      validCustomerCodes.add(c.customerCode);
      zoneByCustomer[c.customerCode] = {
        zone: c.zone || "Unknown Zone",
        province: c.province,
        address: c.address,
        typeOfBusiness: c.typeOfBusiness,
      };
    }
  });

  // 3. Classify customers – but ONLY those present in enabled Customer master
  const zoneMap = new Map();

  for (const cust of allCustomersAgg) {
    // Check if this customer exists in the enabled master list
    const isInMaster =
      (cust.customerId && validCustomerIds.has(cust.customerId.toString())) ||
      (cust.customerCode && validCustomerCodes.has(cust.customerCode));

    if (!isInMaster) {
      // Skip customers that are not in the enabled Customer collection
      continue;
    }

    const absFirst = cust.absoluteFirstPurchase;
    const isNew = absFirst && new Date(absFirst) >= periodStart;

    // Resolve zone (now guaranteed to exist because customer is in master)
    let zoneName = "Unknown Zone";
    if (cust.customerId && zoneByCustomer[cust.customerId.toString()]) {
      zoneName = zoneByCustomer[cust.customerId.toString()].zone;
    } else if (cust.customerCode && zoneByCustomer[cust.customerCode]) {
      zoneName = zoneByCustomer[cust.customerCode].zone;
    }

    if (!zoneMap.has(zoneName)) {
      zoneMap.set(zoneName, {
        zoneName,
        totalCustomers: 0,
        newCustomers: 0,
        existingCustomers: 0,
        totalSalesAmount: 0,
        customers: [],
      });
    }

    const zoneData = zoneMap.get(zoneName);
    zoneData.totalCustomers++;
    if (isNew) zoneData.newCustomers++;
    else zoneData.existingCustomers++;
    zoneData.totalSalesAmount += cust.totalSalesAmountAllTime || 0;

    // Apply search filter on customer name, code, MR name
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      const match =
        (cust.customerName &&
          cust.customerName.toLowerCase().includes(searchLower)) ||
        (cust.customerCode &&
          cust.customerCode.toLowerCase().includes(searchLower)) ||
        (cust.mrName && cust.mrName.toLowerCase().includes(searchLower));
      if (!match) continue;
    }

    zoneData.customers.push({
      customerId: cust.customerId,
      customerCode: cust.customerCode,
      customerName: cust.customerName || "N/A",
      mrName: cust.mrName || "N/A",
      province: zoneByCustomer[cust.customerId?.toString()]?.province || "N/A",
      address: zoneByCustomer[cust.customerId?.toString()]?.address || "N/A",
      typeOfBusiness:
        zoneByCustomer[cust.customerId?.toString()]?.typeOfBusiness || "N/A",
      absoluteFirstPurchase: absFirst,
      absoluteLastPurchase: cust.absoluteLastPurchase,
      totalOrdersAllTime: cust.totalOrdersAllTime || 0,
      totalSalesAmountAllTime: cust.totalSalesAmountAllTime || 0,
      periodOrders: cust.periodOrders || 0,
      periodSalesAmount: cust.periodSalesAmount || 0,
      firstPurchaseInPeriod: cust.firstPurchaseInPeriod,
      lastPurchaseInPeriod: cust.lastPurchaseInPeriod,
      isNew,
      isExisting: !isNew,
    });
  }

  // 4. Compute retention rate per zone = newCustomers / existingCustomers * 100
  const result = Array.from(zoneMap.values()).map((zone) => {
    const retentionRate =
      zone.existingCustomers > 0
        ? parseFloat(
            ((zone.newCustomers / zone.existingCustomers) * 100).toFixed(2),
          )
        : zone.newCustomers > 0
          ? 100
          : 0;
    return { ...zone, retentionRate };
  });

  // Sort by totalCustomers desc
  result.sort((a, b) => b.totalCustomers - a.totalCustomers);
  return result;
}

// ─────────────────────────────────────────────────────────
// OVERALL SUMMARY (based on new logic)
// ─────────────────────────────────────────────────────────
async function getOverallSummary() {
  const records = await buildZoneData();
  const totalCustomers = records.reduce((s, z) => s + z.totalCustomers, 0);
  const newCustomers = records.reduce((s, z) => s + z.newCustomers, 0);
  const existingCustomers = records.reduce(
    (s, z) => s + z.existingCustomers,
    0,
  );
  const totalSalesAmount = records.reduce((s, z) => s + z.totalSalesAmount, 0);
  const retentionRate =
    existingCustomers > 0
      ? parseFloat(((newCustomers / existingCustomers) * 100).toFixed(2))
      : newCustomers > 0
        ? 100
        : 0;

  return {
    totalCustomers,
    newCustomers,
    existingCustomers,
    retentionRate,
    totalSalesAmount,
  };
}

// ======================= ROUTES (unchanged) =======================
router.get("/", async (req, res) => {
  try {
    const { search = "", page = 1, limit = 7 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const allZoneRecords = await buildZoneData(search);
    const summary = await getOverallSummary();

    const totalRecords = allZoneRecords.length;
    const totalPages = Math.ceil(totalRecords / limitNum);
    const paginatedRecords = allZoneRecords.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    res.json({
      success: true,
      data: {
        summary,
        records: paginatedRecords.map((z) => ({
          zoneId: z.zoneName.replace(/\s+/g, "_").toUpperCase(),
          zoneName: z.zoneName,
          totalCustomers: z.totalCustomers,
          newCustomers: z.newCustomers,
          existingCustomers: z.existingCustomers,
          retentionRate: z.retentionRate,
          totalSalesAmount: z.totalSalesAmount,
          customers: z.customers.map((c) => ({
            customerId: c.customerId,
            customerName: c.customerName,
            customerCode: c.customerCode,
            mrName: c.mrName,
            province: c.province,
            address: c.address,
            typeOfBusiness: c.typeOfBusiness,
            absoluteFirstPurchase: c.absoluteFirstPurchase,
            absoluteLastPurchase: c.absoluteLastPurchase,
            totalOrdersAllTime: c.totalOrdersAllTime,
            totalSalesAmountAllTime: c.totalSalesAmountAllTime,
            periodOrders: c.periodOrders,
            periodSalesAmount: c.periodSalesAmount,
            firstPurchaseInPeriod: c.firstPurchaseInPeriod,
            lastPurchaseInPeriod: c.lastPurchaseInPeriod,
            isNew: c.isNew,
            isExisting: c.isExisting,
          })),
        })),
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/export", async (req, res) => {
  try {
    const { search = "" } = req.query;
    const records = await buildZoneData(search);
    const summary = await getOverallSummary();

    const workbook = new ExcelJS.Workbook();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:E1");
    summarySheet.getCell("A1").value =
      "Customer Retention Report (Year-to-Date)";
    summarySheet.getCell("A1").font = { size: 16, bold: true };
    summarySheet.getCell("A1").alignment = { horizontal: "center" };
    summarySheet.addRow([]);
    const sumHeader = summarySheet.addRow(["Metric", "Value"]);
    sumHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
    });
    summarySheet.addRow(["Total Customers (all time)", summary.totalCustomers]);
    summarySheet.addRow([
      "Existing Customers (before Jan 1)",
      summary.existingCustomers,
    ]);
    summarySheet.addRow([
      "New Customers (from Jan 1 to today)",
      summary.newCustomers,
    ]);
    summarySheet.addRow(["Retention Rate", `${summary.retentionRate}%`]);
    summarySheet.addRow([
      "Total Sales Amount (all time)",
      `$${summary.totalSalesAmount.toFixed(2)}`,
    ]);
    summarySheet.addRow(["Generated On", new Date().toLocaleString()]);
    summarySheet.columns = [{ width: 30 }, { width: 30 }];

    // Zones Sheet
    const zonesSheet = workbook.addWorksheet("Zones");
    zonesSheet.mergeCells("A1:G1");
    zonesSheet.getCell("A1").value = "Zone-wise Retention Summary";
    zonesSheet.getCell("A1").font = { size: 16, bold: true };
    zonesSheet.getCell("A1").alignment = { horizontal: "center" };
    zonesSheet.addRow([]);
    const zoneHeader = zonesSheet.addRow([
      "Sr.No",
      "Zone Name",
      "Total Customers",
      "New Customers",
      "Existing Customers",
      "Retention Rate (%)",
      "Total Sales Amount (All Time)",
    ]);
    zoneHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    records.forEach((zone, idx) => {
      const row = zonesSheet.addRow([
        idx + 1,
        zone.zoneName,
        zone.totalCustomers,
        zone.newCustomers,
        zone.existingCustomers,
        `${zone.retentionRate}%`,
        `$${zone.totalSalesAmount.toFixed(2)}`,
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        cell.alignment = { horizontal: "center" };
      });
    });
    zonesSheet.columns = [
      { width: 10 },
      { width: 30 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
      { width: 18 },
      { width: 25 },
    ];

    // Customer Details Sheet
    const detailsSheet = workbook.addWorksheet("Customer Details");
    detailsSheet.mergeCells("A1:L1");
    detailsSheet.getCell("A1").value = "All Customers Details";
    detailsSheet.getCell("A1").font = { size: 16, bold: true };
    detailsSheet.getCell("A1").alignment = { horizontal: "center" };
    detailsSheet.addRow([]);
    const detailHeader = detailsSheet.addRow([
      "Sr.No",
      "Zone",
      "Customer Name",
      "Customer Code",
      "MR Name",
      "Type of Business",
      "First Purchase (All Time)",
      "Last Purchase (All Time)",
      "Total Orders",
      "Total Sales Amount",
      "First Purchase in Period",
      "Last Purchase in Period",
      "Period Orders",
      "Period Sales",
      "Type",
    ]);
    detailHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
    });
    let srNo = 1;
    records.forEach((zone) => {
      zone.customers.forEach((c) => {
        const row = detailsSheet.addRow([
          srNo++,
          zone.zoneName,
          capitalizeFirstLetter(c.customerName),
          c.customerCode || "N/A",
          c.mrName || "N/A",
          c.typeOfBusiness || "N/A",
          formatDateForExcel(c.absoluteFirstPurchase),
          formatDateForExcel(c.absoluteLastPurchase),
          c.totalOrdersAllTime || 0,
          `$${(c.totalSalesAmountAllTime || 0).toFixed(2)}`,
          formatDateForExcel(c.firstPurchaseInPeriod),
          formatDateForExcel(c.lastPurchaseInPeriod),
          c.periodOrders || 0,
          `$${(c.periodSalesAmount || 0).toFixed(2)}`,
          c.isNew ? "New (YTD)" : "Existing",
        ]);
        const typeCell = row.getCell(15);
        if (c.isNew) {
          typeCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DBEAFE" },
          };
          typeCell.font = { color: { argb: "1E3A5F" }, bold: true };
        } else {
          typeCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DCFCE7" },
          };
          typeCell.font = { color: { argb: "166534" }, bold: true };
        }
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });
    });
    detailsSheet.columns = [
      { width: 8 },
      { width: 25 },
      { width: 30 },
      { width: 18 },
      { width: 20 },
      { width: 20 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
    ];
    detailsSheet.autoFilter = "A2:O2";

    const fileName = `customer_retention_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Export error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
