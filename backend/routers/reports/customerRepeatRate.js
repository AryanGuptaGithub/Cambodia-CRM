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

// ── Values that mean "nothing was entered" ─────────────────────────────────
const BLANK_VALUES = new Set([
  "",
  "-",
  "--",
  "---",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
  "unknown",
  "not provided",
  "notprovided",
  "not_provided",
  ".",
  "/",
  "0",
]);

/**
 * Returns true when a field actually contains a meaningful value.
 */
function isRealValue(val) {
  if (val === null || val === undefined) return false;
  const cleaned = String(val).trim().toLowerCase();
  return cleaned.length > 0 && !BLANK_VALUES.has(cleaned);
}

/**
 * Resolve the display label for a customer's location.
 * Priority: zone → province → address → "Not Provided"
 * Skips any value that is blank / a placeholder like "-", "N/A", etc.
 */
function resolveZoneLabel(masterInfo) {
  if (!masterInfo) return "Not Provided";

  const zone = String(masterInfo.zone || "").trim();
  const province = String(masterInfo.province || "").trim();
  const address = String(masterInfo.address || "").trim();

  if (isRealValue(zone)) return zone;
  if (isRealValue(province)) return province;
  if (isRealValue(address)) return address;
  return "Not Provided";
}

/**
 * Return the analysis year.
 * Rule: always analyse the PREVIOUS completed calendar year
 * (e.g. if today is 2026-xx-xx → analyse 2025).
 */
function getAnalysisYear() {
  return new Date().getFullYear() - 1;
}

// ─────────────────────────────────────────────────────────
// CORE: Build zone-wise retention data (year-based)
// ─────────────────────────────────────────────────────────
async function buildZoneData(search = "") {
  const analysisYear = getAnalysisYear();

  const periodStart = new Date(Date.UTC(analysisYear, 0, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(analysisYear, 11, 31, 23, 59, 59, 999));

  // ── 1. Aggregate all-time + period stats per customer ─────────────────────
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
        customerCode: { $first: "$customerCode" },
        customerName: { $first: "$customerName" },
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
              {
                $and: [
                  { $gte: ["$invoiceDate", periodStart] },
                  { $lte: ["$invoiceDate", periodEnd] },
                ],
              },
              "$invoiceDate",
              null,
            ],
          },
        },
        lastPurchaseInPeriod: {
          $max: {
            $cond: [
              {
                $and: [
                  { $gte: ["$invoiceDate", periodStart] },
                  { $lte: ["$invoiceDate", periodEnd] },
                ],
              },
              "$invoiceDate",
              null,
            ],
          },
        },
      },
    },
  ]);

  if (allCustomersAgg.length === 0) return [];

  // ── 2. Fetch enabled Customer master records ───────────────────────────────
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
      enabled: true,
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

  // Build lookup maps
  const masterById = {};
  const masterByCode = {};
  const validIds = new Set();
  const validCodes = new Set();

  customerMasterData.forEach((c) => {
    const idKey = c._id.toString();
    validIds.add(idKey);
    masterById[idKey] = c;
    if (c.customerCode) {
      validCodes.add(c.customerCode);
      masterByCode[c.customerCode] = c;
    }
  });

  // ── 3. Classify & group by resolved zone label ────────────────────────────
  const zoneMap = new Map();

  for (const cust of allCustomersAgg) {
    const inMaster =
      (cust.customerId && validIds.has(cust.customerId.toString())) ||
      (cust.customerCode && validCodes.has(cust.customerCode));

    if (!inMaster) continue;

    const masterInfo =
      (cust.customerId && masterById[cust.customerId.toString()]) ||
      (cust.customerCode && masterByCode[cust.customerCode]) ||
      null;

    // ── Zone label: zone → province → address → "Not Provided" ──────────────
    const zoneLabel = resolveZoneLabel(masterInfo);

    // ── Classification ───────────────────────────────────────────────────────
    const absFirst = cust.absoluteFirstPurchase
      ? new Date(cust.absoluteFirstPurchase)
      : null;

    const isExisting = absFirst !== null && absFirst < periodStart;
    const isNew =
      absFirst !== null && absFirst >= periodStart && absFirst <= periodEnd;

    if (!isExisting && !isNew) continue;

    // ── Initialise zone bucket ───────────────────────────────────────────────
    if (!zoneMap.has(zoneLabel)) {
      zoneMap.set(zoneLabel, {
        zoneName: zoneLabel,
        totalCustomers: 0,
        newCustomers: 0,
        existingCustomers: 0,

        totalPeriodOrders: 0,
        newCustomerPeriodOrders: 0,
        existingCustomerPeriodOrders: 0,
        totalPeriodSalesAmount: 0,
        newCustomerPeriodSales: 0,
        existingCustomerPeriodSales: 0,
        totalSalesAmountAllTime: 0,

        customers: [],
      });
    }

    const zoneData = zoneMap.get(zoneLabel);

    if (isExisting) {
      zoneData.existingCustomers++;
      zoneData.totalCustomers++;
      zoneData.existingCustomerPeriodOrders += cust.periodOrders || 0;
      zoneData.existingCustomerPeriodSales += cust.periodSalesAmount || 0;
    } else {
      zoneData.newCustomers++;
      zoneData.newCustomerPeriodOrders += cust.periodOrders || 0;
      zoneData.newCustomerPeriodSales += cust.periodSalesAmount || 0;
    }

    zoneData.totalPeriodOrders += cust.periodOrders || 0;
    zoneData.totalPeriodSalesAmount += cust.periodSalesAmount || 0;
    zoneData.totalSalesAmountAllTime += cust.totalSalesAmountAllTime || 0;

    // ── Search filter ────────────────────────────────────────────────────────
    if (search && search.trim()) {
      const s = search.toLowerCase();
      const match =
        (cust.customerName && cust.customerName.toLowerCase().includes(s)) ||
        (cust.customerCode && cust.customerCode.toLowerCase().includes(s)) ||
        (cust.mrName && cust.mrName.toLowerCase().includes(s));
      if (!match) continue;
    }

    zoneData.customers.push({
      customerId: cust.customerId,
      customerCode: cust.customerCode,
      customerName: cust.customerName || "N/A",
      mrName: cust.mrName || "N/A",
      // Use isRealValue so "-" or "N/A" stored in DB becomes "N/A" in output
      province: isRealValue(masterInfo?.province) ? masterInfo.province : "N/A",
      address: isRealValue(masterInfo?.address) ? masterInfo.address : "N/A",
      typeOfBusiness: masterInfo?.typeOfBusiness || "N/A",
      absoluteFirstPurchase: cust.absoluteFirstPurchase,
      absoluteLastPurchase: cust.absoluteLastPurchase,
      totalOrdersAllTime: cust.totalOrdersAllTime || 0,
      totalSalesAmountAllTime: cust.totalSalesAmountAllTime || 0,
      periodOrders: cust.periodOrders || 0,
      periodSalesAmount: cust.periodSalesAmount || 0,
      firstPurchaseInPeriod: cust.firstPurchaseInPeriod,
      lastPurchaseInPeriod: cust.lastPurchaseInPeriod,
      isNew,
      isExisting,
    });
  }

  // ── 4. Derive per-zone metrics ─────────────────────────────────────────────
  const result = Array.from(zoneMap.values()).map((zone) => {
    const grandTotal = zone.existingCustomers + zone.newCustomers;
    const retentionRate =
      grandTotal > 0
        ? parseFloat(((zone.existingCustomers / grandTotal) * 100).toFixed(2))
        : 0;

    const avgOrdersPerExistingCustomer =
      zone.existingCustomers > 0
        ? parseFloat(
            (
              zone.existingCustomerPeriodOrders / zone.existingCustomers
            ).toFixed(2),
          )
        : 0;

    return {
      ...zone,
      totalCustomers: grandTotal,
      retentionRate,
      avgOrdersPerExistingCustomer,
    };
  });

  result.sort((a, b) => b.totalCustomers - a.totalCustomers);
  return result;
}

// ─────────────────────────────────────────────────────────
// OVERALL SUMMARY
// ─────────────────────────────────────────────────────────
async function getOverallSummary() {
  const analysisYear = getAnalysisYear();
  const records = await buildZoneData();

  const existingCustomers = records.reduce(
    (s, z) => s + z.existingCustomers,
    0,
  );
  const newCustomers = records.reduce((s, z) => s + z.newCustomers, 0);
  const totalCustomers = existingCustomers + newCustomers;
  const totalPeriodOrders = records.reduce(
    (s, z) => s + z.totalPeriodOrders,
    0,
  );
  const newCustomerPeriodOrders = records.reduce(
    (s, z) => s + z.newCustomerPeriodOrders,
    0,
  );
  const existingCustomerPeriodOrders = records.reduce(
    (s, z) => s + z.existingCustomerPeriodOrders,
    0,
  );
  const totalPeriodSalesAmount = records.reduce(
    (s, z) => s + z.totalPeriodSalesAmount,
    0,
  );
  const newCustomerPeriodSales = records.reduce(
    (s, z) => s + z.newCustomerPeriodSales,
    0,
  );
  const existingCustomerPeriodSales = records.reduce(
    (s, z) => s + z.existingCustomerPeriodSales,
    0,
  );
  const totalSalesAmountAllTime = records.reduce(
    (s, z) => s + z.totalSalesAmountAllTime,
    0,
  );

  const retentionRate =
    totalCustomers > 0
      ? parseFloat(((existingCustomers / totalCustomers) * 100).toFixed(2))
      : 0;

  const avgOrdersPerExistingCustomer =
    existingCustomers > 0
      ? parseFloat(
          (existingCustomerPeriodOrders / existingCustomers).toFixed(2),
        )
      : 0;

  return {
    analysisYear,
    totalCustomers,
    existingCustomers,
    newCustomers,
    retentionRate,
    totalPeriodOrders,
    newCustomerPeriodOrders,
    existingCustomerPeriodOrders,
    avgOrdersPerExistingCustomer,
    totalPeriodSalesAmount,
    newCustomerPeriodSales,
    existingCustomerPeriodSales,
    totalSalesAmountAllTime,
  };
}

// ======================= ROUTES =======================
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

          totalPeriodOrders: z.totalPeriodOrders,
          newCustomerPeriodOrders: z.newCustomerPeriodOrders,
          existingCustomerPeriodOrders: z.existingCustomerPeriodOrders,
          avgOrdersPerExistingCustomer: z.avgOrdersPerExistingCustomer,

          totalPeriodSalesAmount: z.totalPeriodSalesAmount,
          newCustomerPeriodSales: z.newCustomerPeriodSales,
          existingCustomerPeriodSales: z.existingCustomerPeriodSales,
          totalSalesAmountAllTime: z.totalSalesAmountAllTime,

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
    const analysisYear = summary.analysisYear;

    const workbook = new ExcelJS.Workbook();

    // ── Summary Sheet ──────────────────────────────────────────────────────
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:C1");
    summarySheet.getCell("A1").value =
      `Customer Retention Report — ${analysisYear} (Jan 1 – Dec 31)`;
    summarySheet.getCell("A1").font = { size: 16, bold: true };
    summarySheet.getCell("A1").alignment = { horizontal: "center" };
    summarySheet.addRow([]);

    const sumHeader = summarySheet.addRow(["Metric", "Value", "Note"]);
    sumHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
    });

    const summaryRows = [
      [
        "Analysis Year",
        analysisYear,
        `Full year: 1 Jan ${analysisYear} – 31 Dec ${analysisYear}`,
      ],
      ["Total Customers", summary.totalCustomers, "Existing + New customers"],
      [
        `Existing Customers (before 1 Jan ${analysisYear})`,
        summary.existingCustomers,
        "First purchase before analysis year",
      ],
      [
        `New Customers (${analysisYear})`,
        summary.newCustomers,
        `First-ever purchase in ${analysisYear}`,
      ],
      ["Retention Rate", `${summary.retentionRate}%`, "Existing / Total × 100"],
      ["─── Period Orders ───", "", ""],
      [`Total Orders in ${analysisYear}`, summary.totalPeriodOrders, ""],
      [
        `  Orders from New Customers`,
        summary.newCustomerPeriodOrders,
        `New customers' orders in ${analysisYear}`,
      ],
      [
        `  Orders from Existing Customers`,
        summary.existingCustomerPeriodOrders,
        `Existing customers' orders in ${analysisYear}`,
      ],
      [
        "Avg Orders per Existing Customer",
        summary.avgOrdersPerExistingCustomer,
        `${summary.existingCustomerPeriodOrders} orders ÷ ${summary.existingCustomers} customers`,
      ],
      ["─── Period Sales ───", "", ""],
      [
        `Total Sales in ${analysisYear}`,
        `$${summary.totalPeriodSalesAmount.toFixed(2)}`,
        "",
      ],
      [
        `  Sales from New Customers`,
        `$${summary.newCustomerPeriodSales.toFixed(2)}`,
        "",
      ],
      [
        `  Sales from Existing Customers`,
        `$${summary.existingCustomerPeriodSales.toFixed(2)}`,
        "",
      ],
      [
        "Total Sales (All Time)",
        `$${summary.totalSalesAmountAllTime.toFixed(2)}`,
        "Across all years",
      ],
      ["Generated On", new Date().toLocaleString(), ""],
    ];

    summaryRows.forEach((rowData) => {
      const row = summarySheet.addRow(rowData);
      if (String(rowData[0]).startsWith("───")) {
        row.eachCell((cell) => {
          cell.font = { bold: true, italic: true, color: { argb: "FF4F81BD" } };
        });
      }
    });
    summarySheet.columns = [{ width: 42 }, { width: 22 }, { width: 48 }];

    // ── Zones Sheet ────────────────────────────────────────────────────────
    const zonesSheet = workbook.addWorksheet("Zones");
    zonesSheet.mergeCells("A1:K1");
    zonesSheet.getCell("A1").value =
      `Zone-wise Retention Summary — ${analysisYear}`;
    zonesSheet.getCell("A1").font = { size: 16, bold: true };
    zonesSheet.getCell("A1").alignment = { horizontal: "center" };
    zonesSheet.addRow([]);

    const zoneHeader = zonesSheet.addRow([
      "Sr.No",
      "Zone / Province / Address",
      "Total Customers",
      `Existing (before ${analysisYear})`,
      `New (${analysisYear})`,
      "Retention Rate (%)",
      `Total Orders (${analysisYear})`,
      `Existing Cust. Orders (${analysisYear})`,
      `New Cust. Orders (${analysisYear})`,
      "Avg Orders/Existing Cust.",
      `Total Sales (${analysisYear})`,
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
      cell.alignment = { horizontal: "center", wrapText: true };
    });

    records.forEach((zone, idx) => {
      const row = zonesSheet.addRow([
        idx + 1,
        zone.zoneName,
        zone.totalCustomers,
        zone.existingCustomers,
        zone.newCustomers,
        `${zone.retentionRate}%`,
        zone.totalPeriodOrders,
        zone.existingCustomerPeriodOrders,
        zone.newCustomerPeriodOrders,
        zone.avgOrdersPerExistingCustomer,
        `$${zone.totalPeriodSalesAmount.toFixed(2)}`,
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
      { width: 8 },
      { width: 30 },
      { width: 16 },
      { width: 22 },
      { width: 16 },
      { width: 18 },
      { width: 18 },
      { width: 24 },
      { width: 20 },
      { width: 22 },
      { width: 20 },
    ];

    // ── Customer Details Sheet ─────────────────────────────────────────────
    const detailsSheet = workbook.addWorksheet("Customer Details");
    detailsSheet.mergeCells("A1:O1");
    detailsSheet.getCell("A1").value = `All Customer Details — ${analysisYear}`;
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
      "Total Orders (All Time)",
      "Total Sales (All Time)",
      `First Purchase (${analysisYear})`,
      `Last Purchase (${analysisYear})`,
      `Orders (${analysisYear})`,
      `Sales (${analysisYear})`,
      "Type",
    ]);
    detailHeader.eachCell((cell) => {
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
      cell.alignment = { horizontal: "center", wrapText: true };
    });

    let srNo = 1;
    records.forEach((zone) => {
      zone.customers.forEach((c) => {
        const typeLabel = c.isNew ? `New (${analysisYear})` : "Existing";
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
          typeLabel,
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
      { width: 22 },
      { width: 22 },
      { width: 18 },
      { width: 20 },
      { width: 22 },
      { width: 22 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
    ];
    detailsSheet.autoFilter = "A2:O2";

    const fileName = `customer_retention_${analysisYear}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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
