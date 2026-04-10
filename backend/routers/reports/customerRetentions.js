import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// buildDateFilter — returns { start, end } for the selected period
// Uses UTC to avoid timezone drift
// ─────────────────────────────────────────────────────────────────────────────
function buildDateRange(period, startDate, endDate) {
  const now = new Date();
  const yr = now.getUTCFullYear();
  const mo = now.getUTCMonth(); // 0-based
  const day = now.getUTCDate();

  const utcStart = (y, m, d) => new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const utcEnd = (y, m, d) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  switch (period) {
    case "today":
      return { start: utcStart(yr, mo, day), end: utcEnd(yr, mo, day) };

    case "month":
    case "currentMonth": {
      // First day of current month → today
      return { start: utcStart(yr, mo, 1), end: utcEnd(yr, mo, day) };
    }

    case "jan_feb":
    case "janToPreviousMonth": {
      // Jan 1 of current year → last day of previous month
      if (mo === 0) {
        // Jan: go to prev year full
        return {
          start: utcStart(yr - 1, 0, 1),
          end: utcEnd(yr - 1, 11, 31),
        };
      }
      const lastDayPrevMonth = new Date(Date.UTC(yr, mo, 0)); // day 0 = last of prev month
      return {
        start: utcStart(yr, 0, 1),
        end: utcEnd(
          lastDayPrevMonth.getUTCFullYear(),
          lastDayPrevMonth.getUTCMonth(),
          lastDayPrevMonth.getUTCDate(),
        ),
      };
    }

    case "last_month": {
      const firstOfLastMonth = new Date(Date.UTC(yr, mo - 1, 1));
      const lastOfLastMonth = new Date(Date.UTC(yr, mo, 0));
      return {
        start: utcStart(
          firstOfLastMonth.getUTCFullYear(),
          firstOfLastMonth.getUTCMonth(),
          1,
        ),
        end: utcEnd(
          lastOfLastMonth.getUTCFullYear(),
          lastOfLastMonth.getUTCMonth(),
          lastOfLastMonth.getUTCDate(),
        ),
      };
    }

    case "last_year": {
      return {
        start: utcStart(yr - 1, 0, 1),
        end: utcEnd(yr - 1, 11, 31),
      };
    }

    case "custom": {
      if (!startDate || !endDate) return null;
      const [sy, sm, sd] = startDate.split("-").map(Number);
      const [ey, em, ed] = endDate.split("-").map(Number);
      return {
        start: new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0)),
        end: new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999)),
      };
    }

    case "all":
    default:
      return null; // no date restriction
  }
}

function buildDateFilter(period, startDate, endDate) {
  const range = buildDateRange(period, startDate, endDate);
  if (!range) return {};
  return { invoiceDate: { $gte: range.start, $lte: range.end } };
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE LOGIC
//
// Definitions:
//   period = the selected date window
//
//   "New Customers" (called "Retained" in UI per your spec) =
//       customers whose FIRST EVER purchase falls within the selected period.
//       i.e. first purchase date >= period start
//
//   "Existing Customers" =
//       customers who had at least one purchase BEFORE the period start.
//       (they appear in the period too, but their first purchase is before it)
//
//   Total Customers (in period) = all unique customers who bought in period
//       = New + Existing
//
//   Retention Rate = New in Period / Existing (before period)
//       e.g. 15 new / 33 existing = 45.45%
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For a given date range, find:
 *   - all customers who purchased in the period (totalCustomers)
 *   - of those, which ones had their FIRST EVER purchase in this period (newInPeriod)
 *   - of those, which ones had purchases BEFORE this period (existingCustomers)
 *   - retentionRate = newInPeriod / existingCustomers * 100
 *
 * @param {Date|null} periodStart
 * @param {Date|null} periodEnd
 * @param {string|null} mrNameFilter
 * @param {string} search
 */
async function computeRetentionData(
  periodStart,
  periodEnd,
  mrNameFilter = null,
  search = "",
) {
  // Step 1: Get all customers who purchased in this period
  const periodMatchQuery = {
    isReturn: { $ne: true },
    isExchange: { $ne: true },
  };
  if (periodStart && periodEnd) {
    periodMatchQuery.invoiceDate = { $gte: periodStart, $lte: periodEnd };
  }
  if (mrNameFilter) periodMatchQuery.mrName = mrNameFilter;
  if (search && search.trim()) {
    periodMatchQuery.$or = [
      { customerName: { $regex: search.trim(), $options: "i" } },
      { customerCode: { $regex: search.trim(), $options: "i" } },
      { mrName: { $regex: search.trim(), $options: "i" } },
    ];
  }

  // Get unique customers in period + their order count in period
  const periodCustomers = await SaleSummary.aggregate([
    { $match: periodMatchQuery },
    {
      $group: {
        _id: "$customerCode",
        customerName: { $first: "$customerName" },
        customerCode: { $first: "$customerCode" },
        customerId: { $first: "$customerId" },
        mrName: { $first: "$mrName" },
        ordersInPeriod: { $sum: 1 },
        totalAmountInPeriod: { $sum: "$totalAmount" },
        firstPurchaseDateInPeriod: { $min: "$invoiceDate" },
        lastPurchaseDateInPeriod: { $max: "$invoiceDate" },
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
  ]);

  if (periodCustomers.length === 0) {
    return {
      customers: [],
      totalCustomers: 0,
      newInPeriod: 0,
      existingCustomers: 0,
      retentionRate: 0,
    };
  }

  // Step 2: For each customer, find their absolute first purchase date across ALL time
  const customerCodes = periodCustomers.map((c) => c._id).filter(Boolean);

  const allTimeFirstPurchase = await SaleSummary.aggregate([
    {
      $match: {
        customerCode: { $in: customerCodes },
        isReturn: { $ne: true },
        isExchange: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$customerCode",
        absoluteFirstPurchase: { $min: "$invoiceDate" },
        absoluteLastPurchase: { $max: "$invoiceDate" },
        totalOrdersAllTime: { $sum: 1 },
      },
    },
  ]);

  const firstPurchaseMap = {};
  allTimeFirstPurchase.forEach((r) => {
    firstPurchaseMap[r._id] = {
      absoluteFirstPurchase: r.absoluteFirstPurchase,
      absoluteLastPurchase: r.absoluteLastPurchase,
      totalOrdersAllTime: r.totalOrdersAllTime,
    };
  });

  // Step 3: Classify each customer
  // isNewInPeriod = their absolute first purchase is >= periodStart (they never bought before)
  // isExisting    = they had purchases before the period start
  const enrichedCustomers = periodCustomers.map((c) => {
    const allTime = firstPurchaseMap[c._id] || {};
    const absFirst =
      allTime.absoluteFirstPurchase || c.firstPurchaseDateInPeriod;

    let isNewInPeriod = true;
    if (periodStart && absFirst) {
      // If their very first purchase is before the period, they're "existing"
      isNewInPeriod = new Date(absFirst) >= periodStart;
    }

    return {
      ...c,
      absoluteFirstPurchase: absFirst,
      absoluteLastPurchase: allTime.absoluteLastPurchase,
      totalOrdersAllTime: allTime.totalOrdersAllTime || c.ordersInPeriod,
      isNewInPeriod, // true = new customer (first purchase is in this period)
      isExisting: !isNewInPeriod, // true = was already a customer before period
    };
  });

  const totalCustomers = enrichedCustomers.length;
  const newInPeriod = enrichedCustomers.filter((c) => c.isNewInPeriod).length;
  const existingCustomers = totalCustomers - newInPeriod;

  // Retention Rate = New customers acquired in period / Existing customers before period
  // Per your spec: 15 new / 33 existing = 45.45%
  const retentionRate =
    existingCustomers > 0
      ? parseFloat(((newInPeriod / existingCustomers) * 100).toFixed(2))
      : newInPeriod > 0
        ? 100 // all new, no existing → 100% acquisition
        : 0;

  return {
    customers: enrichedCustomers,
    totalCustomers,
    newInPeriod,
    existingCustomers,
    retentionRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD MR-LEVEL PIPELINE using the same logic
// ─────────────────────────────────────────────────────────────────────────────
async function buildMRData(period, startDate, endDate, search = "") {
  const range = buildDateRange(period, startDate, endDate);
  const periodStart = range?.start || null;
  const periodEnd = range?.end || null;

  // Step 1: Get all purchases in period grouped by MR then customer
  const periodMatchQuery = {
    isReturn: { $ne: true },
    isExchange: { $ne: true },
  };
  if (periodStart && periodEnd) {
    periodMatchQuery.invoiceDate = { $gte: periodStart, $lte: periodEnd };
  }
  if (search && search.trim()) {
    periodMatchQuery.$or = [
      { customerName: { $regex: search.trim(), $options: "i" } },
      { mrName: { $regex: search.trim(), $options: "i" } },
      { customerCode: { $regex: search.trim(), $options: "i" } },
    ];
  }

  // Group by MR → customer
  const mrCustomerGroups = await SaleSummary.aggregate([
    { $match: periodMatchQuery },
    {
      $group: {
        _id: { mrName: "$mrName", customerCode: "$customerCode" },
        mrName: { $first: "$mrName" },
        customerName: { $first: "$customerName" },
        customerCode: { $first: "$customerCode" },
        customerId: { $first: "$customerId" },
        ordersInPeriod: { $sum: 1 },
        firstPurchaseDateInPeriod: { $min: "$invoiceDate" },
        lastPurchaseDateInPeriod: { $max: "$invoiceDate" },
      },
    },
  ]);

  if (mrCustomerGroups.length === 0) return [];

  // Step 2: Get all-time first purchase for each customer
  const customerCodes = [
    ...new Set(mrCustomerGroups.map((r) => r.customerCode).filter(Boolean)),
  ];

  const allTimeData = await SaleSummary.aggregate([
    {
      $match: {
        customerCode: { $in: customerCodes },
        isReturn: { $ne: true },
        isExchange: { $ne: true },
      },
    },
    {
      $group: {
        _id: "$customerCode",
        absoluteFirstPurchase: { $min: "$invoiceDate" },
      },
    },
  ]);

  const firstPurchaseMap = {};
  allTimeData.forEach((r) => {
    firstPurchaseMap[r._id] = r.absoluteFirstPurchase;
  });

  // Step 3: Classify each customer as new or existing per MR
  // Then group by MR
  const mrMap = new Map();

  mrCustomerGroups.forEach((row) => {
    const mrName = row.mrName || "Unknown";
    const absFirst =
      firstPurchaseMap[row.customerCode] || row.firstPurchaseDateInPeriod;

    let isNewInPeriod = true;
    if (periodStart && absFirst) {
      isNewInPeriod = new Date(absFirst) >= periodStart;
    }

    if (!mrMap.has(mrName)) {
      mrMap.set(mrName, {
        mrName,
        customers: [],
        totalCustomers: 0,
        newInPeriod: 0,
        existingCustomers: 0,
      });
    }

    const mrData = mrMap.get(mrName);
    mrData.totalCustomers++;
    if (isNewInPeriod) mrData.newInPeriod++;
    else mrData.existingCustomers++;

    mrData.customers.push({
      customerCode: row.customerCode,
      customerName: row.customerName,
      customerId: row.customerId,
      mrName: row.mrName,
      ordersInPeriod: row.ordersInPeriod,
      firstPurchaseDate: row.firstPurchaseDateInPeriod,
      lastPurchaseDate: row.lastPurchaseDateInPeriod,
      absoluteFirstPurchase: absFirst,
      isNewInPeriod,
      isExisting: !isNewInPeriod,
    });
  });

  // Step 4: Compute retention rate per MR and convert to array
  const result = Array.from(mrMap.values()).map((mr) => {
    const retentionRate =
      mr.existingCustomers > 0
        ? parseFloat(((mr.newInPeriod / mr.existingCustomers) * 100).toFixed(2))
        : mr.newInPeriod > 0
          ? 100
          : 0;
    return { ...mr, retentionRate };
  });

  // Sort by retentionRate desc, then totalCustomers desc
  result.sort(
    (a, b) =>
      b.retentionRate - a.retentionRate || b.totalCustomers - a.totalCustomers,
  );

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERALL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
async function getSummary(period, startDate, endDate) {
  const result = await computeRetentionData(
    buildDateRange(period, startDate, endDate)?.start || null,
    buildDateRange(period, startDate, endDate)?.end || null,
  );
  return {
    totalCustomers: result.totalCustomers,
    retainedCustomers: result.newInPeriod, // "Retained" in UI = new in period
    newCustomers: result.newInPeriod,
    existingCustomers: result.existingCustomers,
    retentionRate: result.retentionRate,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER DETAIL MODAL ENDPOINT
// filterType="all"      → all customers who bought in period
// filterType="retained" → only new-in-period customers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/customer-details", async (req, res) => {
  try {
    const {
      period = "all",
      startDate,
      endDate,
      filterType = "all",
      mrName,
    } = req.query;

    const range = buildDateRange(period, startDate, endDate);
    const periodStart = range?.start || null;
    const periodEnd = range?.end || null;

    const result = await computeRetentionData(
      periodStart,
      periodEnd,
      mrName || null,
    );

    let filtered = result.customers;
    if (filterType === "retained") {
      // "retained" in the modal means "new customers acquired in this period"
      filtered = result.customers.filter((c) => c.isNewInPeriod);
    }
    // "all" → every customer who bought in period

    // Sort: new-in-period first, then by ordersInPeriod desc
    filtered.sort((a, b) => {
      if (b.isNewInPeriod !== a.isNewInPeriod) return b.isNewInPeriod ? 1 : -1;
      return b.ordersInPeriod - a.ordersInPeriod;
    });

    // Enrich with Customer collection
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
        totalOrders: c.ordersInPeriod,
        totalAmount: c.totalAmountInPeriod || 0,
        firstPurchaseDate:
          c.firstPurchaseDateInPeriod || c.absoluteFirstPurchase,
        lastPurchaseDate: c.lastPurchaseDateInPeriod || c.absoluteLastPurchase,
        absoluteFirstPurchase: c.absoluteFirstPurchase,
        isRetained: c.isNewInPeriod, // UI calls new-in-period "retained"
        isNewInPeriod: c.isNewInPeriod,
        isExisting: c.isExisting,
        invoices: c.invoices || [],
      };
    });

    res.json({ success: true, data: enriched, total: enriched.length });
  } catch (err) {
    console.error("❌ Error fetching customer details:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BASE HANDLER (shared by monthly & annual routes)
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

    const [allMRRecords, summary] = await Promise.all([
      buildMRData(period, startDate, endDate, search),
      getSummary(period, startDate, endDate),
    ]);

    const totalRecords = allMRRecords.length;
    const totalPages = Math.ceil(totalRecords / limitNum);
    const paginatedRecords = allMRRecords.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    res.json({
      success: true,
      data: {
        summary,
        records: paginatedRecords.map((r) => ({
          _id: r.mrName,
          mrName: r.mrName || "N/A",
          totalCustomers: r.totalCustomers || 0,
          retainedCustomers: r.newInPeriod || 0, // UI label "Retained" = new in period
          existingCustomers: r.existingCustomers || 0,
          retentionRate: r.retentionRate || 0,
          customers: (r.customers || []).map((c) => ({
            customerId: c.customerId,
            customerName: c.customerName || "N/A",
            customerCode: c.customerCode || "",
            mrName: c.mrName || "",
            totalOrders: c.ordersInPeriod || 0,
            firstPurchaseDate: c.firstPurchaseDate || null,
            lastPurchaseDate: c.lastPurchaseDate || null,
            isRetained: c.isNewInPeriod,
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

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleExportRequest(req, res, defaultPeriod, sheetTitle) {
  try {
    const {
      period = defaultPeriod,
      startDate,
      endDate,
      search = "",
    } = req.query;

    const [records, summary] = await Promise.all([
      buildMRData(period, startDate, endDate, search),
      getSummary(period, startDate, endDate),
    ]);

    const workbook = new ExcelJS.Workbook();

    // ── Summary Sheet ──
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
    summarySheet.addRow([
      "Total Customers (in period)",
      summary.totalCustomers,
    ]);
    summarySheet.addRow([
      "New Customers (first purchase in period)",
      summary.newCustomers,
    ]);
    summarySheet.addRow([
      "Existing Customers (bought before period)",
      summary.existingCustomers,
    ]);
    summarySheet.addRow([
      "Retention Rate (New / Existing × 100)",
      `${summary.retentionRate?.toFixed(2) || 0}%`,
    ]);
    summarySheet.addRow(["Period", period]);
    summarySheet.addRow(["Generated On", new Date().toLocaleString()]);
    summarySheet.columns.forEach((col) => (col.width = 35));

    // ── Details Sheet ──
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
      "Orders in Period",
      "First Purchase (all time)",
      "Last Purchase (in period)",
      "Type",
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
          customer.ordersInPeriod || 0,
          formatDateForExcel(customer.absoluteFirstPurchase),
          formatDateForExcel(customer.lastPurchaseDate),
          customer.isNewInPeriod ? "New in Period" : "Existing",
          `${(mr.retentionRate || 0).toFixed(1)}%`,
        ]);

        const typeCell = row.getCell(8);
        if (customer.isNewInPeriod) {
          typeCell.font = { bold: true, color: { argb: "1E3A5F" } };
          typeCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DBEAFE" },
          };
        } else {
          typeCell.font = { bold: true, color: { argb: "166534" } };
          typeCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "DCFCE7" },
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
      col.width = Math.min(maxLen + 2, 35);
    });

    const fileName = `${sheetTitle.replace(/ /g, "_")}_${period}_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

// Monthly — default period is current month
router.get("/monthly", (req, res) => handleGetRequest(req, res, "month"));
router.get("/monthly/export", (req, res) =>
  handleExportRequest(req, res, "month", "Monthly Customer Repeat Rate"),
);

// Annual — default period is last year
router.get("/annual", (req, res) => handleGetRequest(req, res, "last_year"));
router.get("/annual/export", (req, res) =>
  handleExportRequest(req, res, "last_year", "Annual Customer Repeat Rate"),
);

export default router;
