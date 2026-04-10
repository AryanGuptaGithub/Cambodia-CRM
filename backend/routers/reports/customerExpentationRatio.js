import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import DailySampleReport from "../../models/reports/dailysample.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const normalizeProductName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
};

/**
 * buildDateQuery — returns a MongoDB date range object for the `date` field
 */
function buildSampleDateQuery(period, month, year, startDate, endDate) {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const filterMonth = month ? parseInt(month) : currentMonth;
  const filterYear = year ? parseInt(year) : currentYear;

  if (period === "custom" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (period === "month") {
    const start = new Date(filterYear, filterMonth - 1, 1);
    const end = new Date(filterYear, filterMonth, 0, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  if (period === "year") {
    const start = new Date(filterYear, 0, 1);
    const end = new Date(filterYear, 11, 31, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }

  return null;
}

/**
 * Core data builder.
 * Now properly flattens products from DailySampleReport and counts each product line as 1 sample unit.
 */
async function buildAcceptanceData({
  period,
  month,
  year,
  startDate,
  endDate,
  search = "",
}) {
  const dateRange = buildSampleDateQuery(
    period,
    month,
    year,
    startDate,
    endDate,
  );

  // 1. Fetch samples in period
  const sampleDateQuery = dateRange ? { date: dateRange } : {};
  const samples = await DailySampleReport.find(sampleDateQuery)
    .sort({ date: 1 })
    .lean();

  if (samples.length === 0) {
    return {
      summary: {
        totalCustomers: 0,
        totalSamples: 0,
        totalAccepted: 0,
        totalRejected: 0,
        acceptanceRate: 0,
      },
      records: [],
      totalRecords: 0,
    };
  }

  // 2. Fetch all sales in the same date period
  const saleDateQuery = dateRange ? { invoiceDate: dateRange } : {};
  const sales = await SaleSummary.find(saleDateQuery)
    .select(
      "products invoiceDate invoiceNumber customerId customerCode customerName",
    )
    .lean();

  // 3. Index sales by (customerCode | normalizedProductName)
  const salesIndex = new Map(); // key: `${customerCode}|${productNorm}`

  for (const sale of sales) {
    if (!sale.products?.length) continue;
    const saleDate = new Date(sale.invoiceDate);
    if (isNaN(saleDate.getTime())) continue;

    for (const prod of sale.products) {
      if (!prod.productName) continue;
      const productNorm = normalizeProductName(prod.productName);
      const key = `${sale.customerCode}|${productNorm}`;
      if (!salesIndex.has(key)) salesIndex.set(key, []);
      salesIndex.get(key).push({
        date: saleDate,
        totalQty: (prod.salesQty || 0) + (prod.bonusQty || 0),
        invoiceNumber: sale.invoiceNumber,
      });
    }
  }

  // 4. Flatten samples: each product inside a sample becomes a separate entry
  //    Also store the original product details (like sample date, MR name, etc.) for the modal
  const flattenedSamples = [];
  for (const sample of samples) {
    const customerCode = sample.customerCode || "";
    const customerName = sample.customerName || "N/A";
    const sampleDate = new Date(sample.date);
    const mrName = sample.mrName || "";
    const remark = sample.remark || "";

    const productsArray = sample.products || [];
    for (const product of productsArray) {
      const productName = product.productName || "Unknown";
      const productNorm = normalizeProductName(productName);
      // Each product line counts as 1 sample unit (change to product.totalQty if you need sum)
      const sampleQty = 1;

      flattenedSamples.push({
        customerCode,
        customerName,
        productName,
        productNorm,
        sampleDate,
        sampleQty,
        mrName,
        remark,
        sampleId: sample._id,
        originalQty: product.totalQty || 0,
      });
    }
  }

  if (flattenedSamples.length === 0) {
    return {
      summary: {
        totalCustomers: 0,
        totalSamples: 0,
        totalAccepted: 0,
        totalRejected: 0,
        acceptanceRate: 0,
      },
      records: [],
      totalRecords: 0,
    };
  }

  // 5. Group by customer + product and evaluate acceptance
  const grouped = new Map(); // key: `${customerCode}|${productNorm}`
  const customerSet = new Set();

  for (const item of flattenedSamples) {
    const {
      customerCode,
      customerName,
      productName,
      productNorm,
      sampleDate,
      sampleQty,
      mrName,
      remark,
      sampleId,
      originalQty,
    } = item;
    customerSet.add(customerCode || customerName);

    const saleKey = `${customerCode}|${productNorm}`;
    const matchingSales = (salesIndex.get(saleKey) || []).filter(
      (s) => s.date >= sampleDate,
    );
    const totalOrderQty = matchingSales.reduce((sum, s) => sum + s.totalQty, 0);
    const isAccepted = totalOrderQty > 0;

    const groupKey = `${customerCode}|${productNorm}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        customerCode,
        customerName,
        productName,
        totalSamples: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        sampleDetails: [], // store details for modal
      });
    }
    const g = grouped.get(groupKey);
    g.totalSamples += sampleQty;
    if (isAccepted) g.acceptedCount += sampleQty;
    else g.rejectedCount += sampleQty;

    // Store sample details for modal (only store first few? keep all for now)
    g.sampleDetails.push({
      date: sampleDate,
      mrName,
      remark,
      quantity: originalQty,
      sampleId,
    });
  }

  // 6. Build records array
  let records = Array.from(grouped.values()).map((g) => ({
    customerCode: g.customerCode,
    customerName: g.customerName,
    productName: g.productName,
    totalProducts: g.totalSamples,
    acceptedCount: g.acceptedCount,
    rejectedCount: g.rejectedCount,
    acceptanceRate:
      g.totalSamples > 0
        ? parseFloat(((g.acceptedCount / g.totalSamples) * 100).toFixed(2))
        : 0,
    sampleDetails: g.sampleDetails,
  }));

  // 7. Apply search filter
  if (search.trim()) {
    const q = search.toLowerCase();
    records = records.filter(
      (r) =>
        r.customerName?.toLowerCase().includes(q) ||
        r.customerCode?.toLowerCase().includes(q) ||
        r.productName?.toLowerCase().includes(q),
    );
  }

  // 8. Sort
  records.sort((a, b) => {
    const cn = (a.customerName || "").localeCompare(b.customerName || "");
    if (cn !== 0) return cn;
    return (a.productName || "").localeCompare(b.productName || "");
  });

  // 9. Summary
  const totalSamples = records.reduce((s, r) => s + r.totalProducts, 0);
  const totalAccepted = records.reduce((s, r) => s + r.acceptedCount, 0);
  const totalRejected = records.reduce((s, r) => s + r.rejectedCount, 0);
  const acceptanceRate =
    totalSamples > 0
      ? parseFloat(((totalAccepted / totalSamples) * 100).toFixed(2))
      : 0;

  return {
    summary: {
      totalCustomers: customerSet.size,
      totalSamples,
      totalAccepted,
      totalRejected,
      acceptanceRate,
    },
    records,
    totalRecords: records.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET / — paginated data
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      period = "month",
      month,
      year,
      startDate,
      endDate,
      search = "",
      page = 1,
      limit = 7,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));

    const { summary, records, totalRecords } = await buildAcceptanceData({
      period,
      month,
      year,
      startDate,
      endDate,
      search,
    });

    const totalPages = Math.ceil(totalRecords / limitNum);
    const paginatedRecs = records.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    // Add srNo
    const formattedRecords = paginatedRecs.map((r, idx) => ({
      srNo: (pageNum - 1) * limitNum + idx + 1,
      ...r,
    }));

    res.status(200).json({
      success: true,
      data: {
        summary,
        records: formattedRecords,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Acceptance rate error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching acceptance rate data",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export — Excel download (all records, no pagination)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const {
      period = "month",
      month,
      year,
      startDate,
      endDate,
      search = "",
    } = req.query;

    const { summary, records } = await buildAcceptanceData({
      period,
      month,
      year,
      startDate,
      endDate,
      search,
    });

    // Build filter label
    const filterLabel = (() => {
      if (period === "custom" && startDate && endDate)
        return `${startDate} to ${endDate}`;
      if (period === "year") return `Year ${year || new Date().getFullYear()}`;
      const m = month ? parseInt(month) : new Date().getMonth() + 1;
      const y = year ? parseInt(year) : new Date().getFullYear();
      return `${new Date(y, m - 1, 1).toLocaleString("default", { month: "long" })} ${y}`;
    })();

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Customer Product Acceptance Rate");

    // Title
    worksheet.mergeCells("A1:H1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = `Customer Product Acceptance Rate — ${filterLabel}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };
    worksheet.addRow([]);

    // Summary section
    const summaryHeaderRow = worksheet.addRow(["SUMMARY"]);
    summaryHeaderRow.font = {
      bold: true,
      size: 13,
      color: { argb: "FF4F46E5" },
    };
    worksheet.mergeCells(
      `A${summaryHeaderRow.number}:H${summaryHeaderRow.number}`,
    );
    worksheet.addRow([]);

    const summaryData = [
      ["Total Customers", summary.totalCustomers],
      ["Total Samples", summary.totalSamples],
      ["Accepted Samples", summary.totalAccepted],
      ["Rejected Samples", summary.totalRejected],
      ["Acceptance Rate", `${summary.acceptanceRate?.toFixed(2) || 0}%`],
      ["Period", filterLabel],
      ["Generated On", new Date().toLocaleString()],
    ];
    for (const [label, value] of summaryData) {
      const row = worksheet.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    }

    worksheet.addRow([]);
    worksheet.addRow([]);

    // Detail section header
    const detailHeaderRow = worksheet.addRow(["DETAILED DATA"]);
    detailHeaderRow.font = {
      bold: true,
      size: 13,
      color: { argb: "FF4F46E5" },
    };
    worksheet.mergeCells(
      `A${detailHeaderRow.number}:H${detailHeaderRow.number}`,
    );
    worksheet.addRow([]);

    // Column headers
    const colHeaderRow = worksheet.addRow([
      "Sr. No.",
      "Customer Code",
      "Customer Name",
      "Product Name",
      "Total Samples",
      "Accepted",
      "Rejected",
      "Acceptance Rate %",
    ]);
    colHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    colHeaderRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F81BD" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Data rows
    records.forEach((record, index) => {
      const row = worksheet.addRow([
        index + 1,
        record.customerCode || "N/A",
        record.customerName || "N/A",
        record.productName || "N/A",
        record.totalProducts,
        record.acceptedCount,
        record.rejectedCount,
        record.acceptanceRate,
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });

      // Colour-code acceptance rate
      const rateCell = row.getCell(8);
      const rate = record.acceptanceRate;
      if (rate >= 75) {
        rateCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" },
        };
        rateCell.font = { bold: true, color: { argb: "FF006100" } };
      } else if (rate >= 40) {
        rateCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEB9C" },
        };
        rateCell.font = { bold: true, color: { argb: "FF9C6500" } };
      } else {
        rateCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" },
        };
        rateCell.font = { bold: true, color: { argb: "FF9C0006" } };
      }
    });

    // Column widths
    worksheet.getColumn(1).width = 10;
    worksheet.getColumn(2).width = 18;
    worksheet.getColumn(3).width = 30;
    worksheet.getColumn(4).width = 30;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 15;
    worksheet.getColumn(7).width = 15;
    worksheet.getColumn(8).width = 18;

    worksheet.getColumn(5).numFmt = "#,##0";
    worksheet.getColumn(6).numFmt = "#,##0";
    worksheet.getColumn(7).numFmt = "#,##0";
    worksheet.getColumn(8).numFmt = '0.00"%"';

    const fileName = `customer_product_acceptance_rate_${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ Export error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: error.message,
    });
  }
});

export default router;
