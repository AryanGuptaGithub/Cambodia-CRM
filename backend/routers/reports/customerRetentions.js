import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js"; // adjust path as needed
import ExcelJS from "exceljs";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
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

function buildDateFilter(period, startDate, endDate) {
  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth();

  const dayStart = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const dayEnd = (d) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  switch (period) {
    case "today":
      return { invoiceDate: { $gte: dayStart(now), $lte: dayEnd(now) } };

    case "month":
    case "currentMonth": {
      const first = new Date(yr, mo, 1);
      const last = new Date(yr, mo + 1, 0);
      return { invoiceDate: { $gte: dayStart(first), $lte: dayEnd(last) } };
    }

    case "jan_feb":
    case "janToPreviousMonth": {
      if (mo === 0) {
        return {
          invoiceDate: {
            $gte: dayStart(new Date(yr - 1, 0, 1)),
            $lte: dayEnd(new Date(yr - 1, 11, 31)),
          },
        };
      }
      return {
        invoiceDate: {
          $gte: dayStart(new Date(yr, 0, 1)),
          $lte: dayEnd(new Date(yr, mo, 0)),
        },
      };
    }

    case "last_month": {
      const first = new Date(yr, mo - 1, 1);
      const last = new Date(yr, mo, 0);
      return { invoiceDate: { $gte: dayStart(first), $lte: dayEnd(last) } };
    }

    case "last_year": {
      const first = new Date(yr - 1, 0, 1);
      const last = new Date(yr - 1, 11, 31);
      return { invoiceDate: { $gte: dayStart(first), $lte: dayEnd(last) } };
    }

    case "custom": {
      if (!startDate || !endDate) return {};
      return {
        invoiceDate: {
          $gte: dayStart(new Date(startDate)),
          $lte: dayEnd(new Date(endDate)),
        },
      };
    }

    case "all":
    default:
      return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATION — groups by mrName, then by customer within each MR
// FIX: Total Customers = customers with ≥1 order
//      Retained Customers = customers with ≥2 orders (repeat only)
// ─────────────────────────────────────────────────────────────────────────────
function buildMRPipeline(period, startDate, endDate, search) {
  const dateFilter = buildDateFilter(period, startDate, endDate);

  const matchQuery = {
    ...dateFilter,
    isReturn: { $ne: true },
    isExchange: { $ne: true },
  };

  const searchFilter =
    search && search.trim()
      ? {
          $or: [
            { customerName: { $regex: search.trim(), $options: "i" } },
            { customerCode: { $regex: search.trim(), $options: "i" } },
            { mrName: { $regex: search.trim(), $options: "i" } },
          ],
        }
      : null;

  const pipeline = [
    { $match: { ...matchQuery, ...(searchFilter || {}) } },

    // Group by customer first — count total orders per customer
    {
      $group: {
        _id: "$customerCode",
        customerName: { $first: "$customerName" },
        customerCode: { $first: "$customerCode" },
        customerId: { $first: "$customerId" },
        mrName: { $first: "$mrName" },
        totalOrders: { $sum: 1 },
        firstPurchaseDate: { $min: "$invoiceDate" },
        lastPurchaseDate: { $max: "$invoiceDate" },
      },
    },

    // A customer is "retained" only if they have 2+ orders
    {
      $addFields: {
        isRetained: { $gte: ["$totalOrders", 2] },
      },
    },

    // Group by MR name
    {
      $group: {
        _id: "$mrName",
        mrName: { $first: "$mrName" },
        // Total customers = ALL unique customers (1+ orders)
        totalCustomers: { $sum: 1 },
        // Retained = only those with 2+ orders
        retainedCustomers: {
          $sum: { $cond: ["$isRetained", 1, 0] },
        },
        customers: {
          $push: {
            customerId: "$customerId",
            customerName: "$customerName",
            customerCode: "$customerCode",
            mrName: "$mrName",
            totalOrders: "$totalOrders",
            firstPurchaseDate: "$firstPurchaseDate",
            lastPurchaseDate: "$lastPurchaseDate",
            isRetained: "$isRetained",
          },
        },
      },
    },

    {
      $addFields: {
        retentionRate: {
          $cond: [
            { $eq: ["$totalCustomers", 0] },
            0,
            {
              $multiply: [
                { $divide: ["$retainedCustomers", "$totalCustomers"] },
                100,
              ],
            },
          ],
        },
      },
    },
    { $sort: { retentionRate: -1, totalCustomers: -1 } },
  ];

  return pipeline;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// Total Customers = unique customers with ≥1 order
// Retained Customers = unique customers with ≥2 orders
// New Customers = unique customers with exactly 1 order
// ─────────────────────────────────────────────────────────────────────────────
async function getSummary(period, startDate, endDate) {
  const dateFilter = buildDateFilter(period, startDate, endDate);

  const result = await SaleSummary.aggregate([
    {
      $match: {
        ...dateFilter,
        isReturn: { $ne: true },
        isExchange: { $ne: true },
      },
    },
    // Count orders per customer
    { $group: { _id: "$customerCode", totalOrders: { $sum: 1 } } },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        // Retained = 2+ orders
        retainedCustomers: {
          $sum: { $cond: [{ $gte: ["$totalOrders", 2] }, 1, 0] },
        },
        // New = exactly 1 order
        newCustomers: {
          $sum: { $cond: [{ $eq: ["$totalOrders", 1] }, 1, 0] },
        },
      },
    },
    {
      $project: {
        totalCustomers: 1,
        retainedCustomers: 1,
        newCustomers: 1,
        retentionRate: {
          $cond: [
            { $eq: ["$totalCustomers", 0] },
            0,
            {
              $multiply: [
                { $divide: ["$retainedCustomers", "$totalCustomers"] },
                100,
              ],
            },
          ],
        },
      },
    },
  ]);

  const raw = result[0] || {
    totalCustomers: 0,
    retainedCustomers: 0,
    newCustomers: 0,
    retentionRate: 0,
  };

  return {
    totalCustomers: raw.totalCustomers,
    retainedCustomers: raw.retainedCustomers,
    newCustomers: raw.newCustomers,
    retentionRate: parseFloat((raw.retentionRate || 0).toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER DETAIL MODAL — fetch all sales + customer info for a specific
// customer or all customers (filtered by retained/all)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/customer-details", async (req, res) => {
  try {
    const {
      period = "all",
      startDate,
      endDate,
      filterType = "all", // "all" | "retained"
      mrName,
    } = req.query;

    const dateFilter = buildDateFilter(period, startDate, endDate);

    const matchQuery = {
      ...dateFilter,
      isReturn: { $ne: true },
      isExchange: { $ne: true },
    };

    if (mrName) matchQuery.mrName = mrName;

    // Get all sales grouped by customer
    const customerGroups = await SaleSummary.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$customerCode",
          customerName: { $first: "$customerName" },
          customerCode: { $first: "$customerCode" },
          customerId: { $first: "$customerId" },
          mrName: { $first: "$mrName" },
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          firstPurchaseDate: { $min: "$invoiceDate" },
          lastPurchaseDate: { $max: "$invoiceDate" },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              invoiceDate: "$invoiceDate",
              totalAmount: "$totalAmount",
              paymentStatus: "$paymentStatus",
              saleType: "$saleType",
            },
          },
        },
      },
      {
        $addFields: {
          isRetained: { $gte: ["$totalOrders", 2] },
        },
      },
    ]);

    // Filter based on filterType
    let filtered = customerGroups;
    if (filterType === "retained") {
      filtered = customerGroups.filter((c) => c.isRetained);
    }
    // "all" includes everyone (both new and retained)

    // Enrich with Customer collection data
    const customerIds = filtered.map((c) => c.customerId).filter(Boolean);

    let customerMap = {};
    if (customerIds.length > 0) {
      const customers = await Customer.find(
        { _id: { $in: customerIds } },
        {
          name: 1,
          customerCode: 1,
          medicalRepName: 1,
          zone: 1,
          province: 1,
          address: 1,
          customerNumber: 1,
          typeOfBusiness: 1,
        },
      );
      customers.forEach((c) => {
        customerMap[c._id.toString()] = c;
      });
    }

    const enriched = filtered.map((c) => {
      const custInfo = c.customerId
        ? customerMap[c.customerId.toString()]
        : null;
      return {
        customerCode: c.customerCode,
        customerId: c.customerId,
        customerName: custInfo?.name || c.customerName || "N/A",
        mrName: c.mrName || "N/A",
        zone: custInfo?.zone || "N/A",
        province: custInfo?.province || "N/A",
        address: custInfo?.address || "N/A",
        customerNumber: custInfo?.customerNumber || "N/A",
        typeOfBusiness: custInfo?.typeOfBusiness || "N/A",
        totalOrders: c.totalOrders,
        totalAmount: c.totalAmount,
        firstPurchaseDate: c.firstPurchaseDate,
        lastPurchaseDate: c.lastPurchaseDate,
        isRetained: c.isRetained,
        invoices: c.invoices || [],
      };
    });

    // Sort: retained first, then by totalOrders desc
    enriched.sort((a, b) => {
      if (b.isRetained !== a.isRetained) return b.isRetained ? 1 : -1;
      return b.totalOrders - a.totalOrders;
    });

    res.json({ success: true, data: enriched, total: enriched.length });
  } catch (err) {
    console.error("❌ Error fetching customer details:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BASE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleGetRequest(req, res, defaultPeriod) {
  try {
    const {
      period = defaultPeriod,
      startDate,
      endDate,
      search = "",
      page = 1,
      limit = 7,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const basePipeline = buildMRPipeline(period, startDate, endDate, search);

    const [countResult, records, summary] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "total" }]),
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
      ]),
      getSummary(period, startDate, endDate),
    ]);

    const totalRecords = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    res.json({
      success: true,
      data: {
        summary,
        records: records.map((r) => ({
          _id: r._id,
          mrName: r.mrName || r._id || "N/A",
          totalCustomers: r.totalCustomers || 0,
          retainedCustomers: r.retainedCustomers || 0,
          retentionRate: parseFloat((r.retentionRate || 0).toFixed(2)),
          customers: (r.customers || []).map((c) => ({
            customerId: c.customerId,
            customerName: c.customerName || "N/A",
            customerCode: c.customerCode || "",
            mrName: c.mrName || "",
            totalOrders: c.totalOrders || 0,
            firstPurchaseDate: c.firstPurchaseDate || null,
            lastPurchaseDate: c.lastPurchaseDate || null,
            isRetained: c.isRetained,
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
    console.error("❌ Error fetching customer retention data:", err);
    res.status(500).json({ success: false, message: err.message });
  }
}

async function handleExportRequest(req, res, defaultPeriod, sheetTitle) {
  try {
    const {
      period = defaultPeriod,
      startDate,
      endDate,
      search = "",
    } = req.query;

    const [records, summary] = await Promise.all([
      SaleSummary.aggregate(
        buildMRPipeline(period, startDate, endDate, search),
      ),
      getSummary(period, startDate, endDate),
    ]);

    const workbook = new ExcelJS.Workbook();

    // Summary Sheet
    const summarySheet = workbook.addWorksheet("Summary");
    summarySheet.mergeCells("A1:E1");
    const titleCell = summarySheet.getCell("A1");
    titleCell.value = `${sheetTitle} - Summary`;
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: "center" };
    summarySheet.addRow([]);
    const summaryHeaderRow = summarySheet.addRow(["Metric", "Value"]);
    summaryHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });
    summarySheet.addRow(["Total Customers", summary.totalCustomers]);
    summarySheet.addRow(["Retained Customers", summary.retainedCustomers]);
    summarySheet.addRow(["New Customers", summary.newCustomers]);
    summarySheet.addRow([
      "Retention Rate",
      `${summary.retentionRate?.toFixed(2) || 0}%`,
    ]);
    summarySheet.addRow(["Period", period]);
    summarySheet.addRow(["Generated On", new Date().toLocaleString()]);
    summarySheet.columns.forEach((col) => (col.width = 25));

    // Details Sheet
    const detailsSheet = workbook.addWorksheet("Details");
    detailsSheet.mergeCells("A1:I1");
    const detailsTitle = detailsSheet.getCell("A1");
    detailsTitle.value = `${sheetTitle} - Details`;
    detailsTitle.font = { size: 16, bold: true };
    detailsTitle.alignment = { horizontal: "center" };
    detailsSheet.addRow([]);
    const detailsHeaderRow = detailsSheet.addRow([
      "Sr.No",
      "MR Name",
      "Customer Name",
      "Customer Code",
      "Total Orders",
      "First Purchase",
      "Last Purchase",
      "Status",
      "MR Retention Rate",
    ]);
    detailsHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center" };
    });

    let srNo = 1;
    records.forEach((mr) => {
      (mr.customers || []).forEach((customer) => {
        const row = detailsSheet.addRow([
          srNo++,
          mr.mrName || "N/A",
          capitalizeFirstLetter(customer.customerName),
          customer.customerCode || "N/A",
          customer.totalOrders || 0,
          formatDateForExcel(customer.firstPurchaseDate),
          formatDateForExcel(customer.lastPurchaseDate),
          customer.isRetained ? "Retained" : "New",
          `${(mr.retentionRate || 0).toFixed(1)}%`,
        ]);

        const statusCell = row.getCell(8);
        if (customer.isRetained) {
          statusCell.font = { bold: true, color: { argb: "166534" } };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DCFCE7" },
          };
        } else {
          statusCell.font = { bold: true, color: { argb: "991B1B" } };
          statusCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FEE2E2" },
          };
        }
      });
    });

    detailsSheet.columns.forEach((col) => {
      let maxLen = 10;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 2, 30);
    });

    const fileName = `${sheetTitle.replace(/ /g, "_")}_${period}_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error exporting customer retention:", err);
    res.status(500).json({
      success: false,
      message: "Failed to export",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", (req, res) => handleGetRequest(req, res, "all"));
router.get("/export", (req, res) =>
  handleExportRequest(req, res, "all", "Customer Retention Rate"),
);

// Legacy routes
router.get("/monthly", (req, res) => handleGetRequest(req, res, "last_month"));
router.get("/monthly/export", (req, res) =>
  handleExportRequest(req, res, "last_month", "Monthly Customer Repeat Rate"),
);
router.get("/annual", (req, res) => handleGetRequest(req, res, "last_year"));
router.get("/annual/export", (req, res) =>
  handleExportRequest(req, res, "last_year", "Annual Customer Repeat Rate"),
);

export default router;
