import express from "express";
import Expense from "../../models/expenses/addExpense.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─── Date Range Helper ────────────────────────────────────────────────────────
const getDateRange = (dateFilter = "currentMonth", startDate, endDate) => {
  // Explicit custom range passed in
  if (startDate && endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return { startDate: start, endDate: end };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (dateFilter) {
    case "today": {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return { startDate: today, endDate: tomorrow };
    }
    case "currentMonth": {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      last.setHours(23, 59, 59, 999);
      return { startDate: first, endDate: last };
    }
    case "janToPreviousMonth": {
      if (month === 0) {
        return {
          startDate: new Date(year - 1, 0, 1),
          endDate: new Date(year - 1, 11, 31, 23, 59, 59, 999),
        };
      }
      return {
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, month, 0, 23, 59, 59, 999),
      };
    }
    case "all":
      return { startDate: null, endDate: null };
    default: {
      const first = new Date(year, month, 1);
      const last = new Date(year, month + 1, 0);
      last.setHours(23, 59, 59, 999);
      return { startDate: first, endDate: last };
    }
  }
};

// ─── Aggregate all data into ONE record ──────────────────────────────────────
// Fixes expense = $0 bug: previously expenses were queried using the date range
// derived from the earliest/latest sale dates, which could miss expenses that
// fall outside that narrow window. Now we always query expenses using the same
// date range that the filter specifies.
const buildAggregatedRecord = async (dateRange) => {
  const { startDate, endDate } = dateRange;

  // ── Sales ──
  const salesMatch = {};
  if (startDate && endDate) {
    salesMatch.recordingDate = { $gte: startDate, $lte: endDate };
  }

  const salesAgg = await SaleSummary.aggregate([
    { $match: salesMatch },
    {
      $group: {
        _id: null,
        totalSale: { $sum: "$totalAmount" },
        totalProfit: { $sum: "$totalProfitLoss" },
        saleCount: { $sum: 1 },
      },
    },
  ]);

  const totalSale = salesAgg[0]?.totalSale || 0;
  const totalProfit = salesAgg[0]?.totalProfit || 0;
  const saleCount = salesAgg[0]?.saleCount || 0;
  // COGS = Revenue - Profit (gross profit approach)
  const totalCOG = totalSale - totalProfit;

  // ── Expenses ── (✅ FIX: use the filter date range, not sales-derived range)
  const expenseMatch = {};
  if (startDate && endDate) {
    expenseMatch.date = { $gte: startDate, $lte: endDate };
  }

  const expenseAgg = await Expense.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: null,
        totalExpense: { $sum: "$amount" },
      },
    },
  ]);

  const totalExpense = expenseAgg[0]?.totalExpense || 0;

  // ── Payroll ── (matched by period string "YYYY-MM")
  const payrollMatch = {};
  if (startDate && endDate) {
    const periods = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      const y = current.getFullYear();
      const m = (current.getMonth() + 1).toString().padStart(2, "0");
      periods.push(`${y}-${m}`);
      current.setMonth(current.getMonth() + 1);
    }
    if (periods.length > 0) payrollMatch.period = { $in: periods };
  }

  const payrollAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    {
      $group: {
        _id: null,
        totalPayroll: { $sum: "$netSalary" },
      },
    },
  ]);

  const totalPayroll = payrollAgg[0]?.totalPayroll || 0;

  // ── Derived metrics ──
  const operationCost = totalExpense + totalPayroll;
  const ratio = totalSale > 0 ? operationCost / totalSale : 0;
  const percentage = totalSale > 0 ? (operationCost / totalSale) * 100 : 0;

  return {
    summary: {
      operationCost: parseFloat(operationCost.toFixed(2)),
      totalSales: parseFloat(totalSale.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(4)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
    },
    record: {
      id: 1,
      sale: parseFloat(totalSale.toFixed(2)),
      cog: parseFloat(totalCOG.toFixed(2)),
      expense: parseFloat(totalExpense.toFixed(2)),
      payroll: parseFloat(totalPayroll.toFixed(2)),
      operationCost: parseFloat(operationCost.toFixed(2)),
      percentage: parseFloat(percentage.toFixed(2)),
      profit: parseFloat(totalProfit.toFixed(2)),
      invoiceCount: saleCount,
    },
    totals: {
      totalSale: parseFloat(totalSale.toFixed(2)),
      totalCOG: parseFloat(totalCOG.toFixed(2)),
      totalExpense: parseFloat(totalExpense.toFixed(2)),
      totalPayroll: parseFloat(totalPayroll.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalSaleCount: saleCount,
    },
  };
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { dateFilter = "currentMonth", startDate, endDate } = req.query;

    const dateRange = getDateRange(dateFilter, startDate, endDate);
    const { summary, record, totals } = await buildAggregatedRecord(dateRange);

    res.json({
      success: true,
      data: {
        summary,
        records: [record],
        totals,
      },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalRecords: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  } catch (error) {
    console.error("Error fetching operation cost sales ratio:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /export ──────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const { dateFilter = "currentMonth", startDate, endDate } = req.query;

    const dateRange = getDateRange(dateFilter, startDate, endDate);
    const { summary, record, totals } = await buildAggregatedRecord(dateRange);

    if (!record.sale && !record.expense && !record.payroll) {
      return res.status(404).json({
        success: false,
        message: "No data found for export",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Operation Cost Sales Ratio");

    // Title
    const titleRow = worksheet.addRow(["Operation Cost / Sales Ratio Report"]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center" };
    worksheet.mergeCells("A1:G1");

    // Period info
    const dateLabel =
      startDate && endDate
        ? `${startDate} to ${endDate}`
        : dateFilter === "currentMonth"
          ? `${new Date().toLocaleString("default", { month: "long" })} ${new Date().getFullYear()}`
          : dateFilter;
    const periodRow = worksheet.addRow([`Period: ${dateLabel}`]);
    periodRow.alignment = { horizontal: "center" };
    worksheet.mergeCells("A2:G2");
    worksheet.addRow([]);

    // Summary section
    const summaryHeader = worksheet.addRow(["Summary"]);
    summaryHeader.font = { bold: true, size: 13 };
    worksheet.mergeCells("A4:G4");

    worksheet.addRow(["Total Sales", `$${summary.totalSales.toFixed(2)}`]);
    worksheet.addRow(["Total Expense", `$${totals.totalExpense.toFixed(2)}`]);
    worksheet.addRow(["Total Payroll", `$${totals.totalPayroll.toFixed(2)}`]);
    worksheet.addRow([
      "Total Operation Cost",
      `$${summary.operationCost.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Operation Cost / Sales Ratio",
      summary.ratio.toFixed(4),
    ]);
    worksheet.addRow(["Total Profit", `$${summary.totalProfit.toFixed(2)}`]);
    worksheet.addRow([]);

    // Table header — no Date column
    const headerRow = worksheet.addRow([
      "Sr.No",
      "Sale ($)",
      "COG ($)",
      "Expense ($)",
      "Payroll ($)",
      "Percentage (%)",
      "Profit ($)",
    ]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Single data row
    const row = worksheet.addRow([
      record.id,
      record.sale,
      record.cog,
      record.expense,
      record.payroll,
      record.percentage / 100,
      record.profit,
    ]);
    [2, 3, 4, 5, 7].forEach((col) => {
      row.getCell(col).numFmt = "$#,##0.00";
    });
    const pctCell = row.getCell(6);
    pctCell.numFmt = "0.00%";
    if (record.percentage < 10) {
      pctCell.font = { color: { argb: "FF16A34A" } };
    } else if (record.percentage < 20) {
      pctCell.font = { color: { argb: "FFCA8A04" } };
    } else {
      pctCell.font = { color: { argb: "FFDC2626" } };
    }

    // Totals row
    const totalsRow = worksheet.addRow([
      "TOTAL",
      totals.totalSale,
      totals.totalCOG,
      totals.totalExpense,
      totals.totalPayroll,
      totals.totalSale > 0
        ? (totals.totalExpense + totals.totalPayroll) / totals.totalSale
        : 0,
      totals.totalProfit,
    ]);
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    [2, 3, 4, 5, 7].forEach((col) => {
      totalsRow.getCell(col).numFmt = "$#,##0.00";
    });
    totalsRow.getCell(6).numFmt = "0.00%";

    worksheet.addRow([]);
    const tsRow = worksheet.addRow([
      `Report Generated: ${new Date().toLocaleString()} | Total Invoices: ${record.invoiceCount}`,
    ]);
    tsRow.font = { italic: true };
    tsRow.alignment = { horizontal: "center" };
    worksheet.mergeCells(`A${tsRow.number}:G${tsRow.number}`);

    worksheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    worksheet.eachRow((row) => {
      row.alignment = { vertical: "middle", horizontal: "center" };
    });

    const timestamp = new Date().toISOString().split("T")[0];
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="operation-cost-sales-ratio-${timestamp}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting operation cost sales ratio:", error);
    res.status(500).json({ success: false, message: "Failed to export data" });
  }
});

export default router;
