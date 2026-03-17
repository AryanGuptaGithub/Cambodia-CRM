import express from "express";
import Expense from "../../models/expenses/addExpense.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─── Date Range Helper (UTC) ─────────────────────────────────────────────────
const getDateRange = (dateFilter = "currentMonth", startDate, endDate) => {
  if (startDate && endDate) {
    // Parse incoming strings "YYYY-MM-DD" as UTC
    const start = new Date(
      Date.UTC(
        parseInt(startDate.substring(0, 4)),
        parseInt(startDate.substring(5, 7)) - 1,
        parseInt(startDate.substring(8, 10)),
        0,
        0,
        0,
        0,
      ),
    );
    const end = new Date(
      Date.UTC(
        parseInt(endDate.substring(0, 4)),
        parseInt(endDate.substring(5, 7)) - 1,
        parseInt(endDate.substring(8, 10)),
        23,
        59,
        59,
        999,
      ),
    );
    return { startDate: start, endDate: end };
  }

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-11

  switch (dateFilter) {
    case "today": {
      const today = new Date(
        Date.UTC(year, month, now.getUTCDate(), 0, 0, 0, 0),
      );
      const tomorrow = new Date(
        Date.UTC(year, month, now.getUTCDate() + 1, 0, 0, 0, 0),
      );
      return { startDate: today, endDate: tomorrow };
    }
    case "currentMonth": {
      const first = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const last = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
      return { startDate: first, endDate: last };
    }
    case "janToPreviousMonth": {
      if (month === 0) {
        return {
          startDate: new Date(Date.UTC(year - 1, 0, 1, 0, 0, 0, 0)),
          endDate: new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59, 999)),
        };
      }
      return {
        startDate: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
        endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
      };
    }
    case "all":
      return { startDate: null, endDate: null };
    default: {
      const first = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
      const last = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
      return { startDate: first, endDate: last };
    }
  }
};

// ─── Find tour-related expense category IDs ───────────────────────────────────
const getTourCategoryIds = async () => {
  try {
    const tourCategories = await ExpenseCategory.find({
      category: { $regex: /tour/i },
    }).select("_id");
    return tourCategories.map((c) => c._id);
  } catch {
    return [];
  }
};

// ─── Build period strings for payroll matching (YYYY-MM) using UTC ───────────
const buildPayrollPeriods = (startDate, endDate) => {
  if (!startDate || !endDate) return null;

  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth(); // 0-11
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();

  const periods = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const m = (month + 1).toString().padStart(2, "0");
    periods.push(`${year}-${m}`);
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return periods;
};

// ─── Build single aggregated record ──────────────────────────────────────────
// Tour Expense = tour-related Expense records
//              + Travel Allowance from Payroll.allowances[]
//                where allowances[].type === "Travel Allowance"
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
  const totalCOG = totalSale - totalProfit;

  // ── Tour Expenses (Expense collection) ──
  const tourCategoryIds = await getTourCategoryIds();
  const expenseMatch = {};
  if (startDate && endDate) {
    expenseMatch.date = { $gte: startDate, $lte: endDate };
  }
  const orConditions = [];
  if (tourCategoryIds.length > 0) {
    orConditions.push({ category: { $in: tourCategoryIds } });
  }
  orConditions.push({ remarks: { $regex: /tour/i } });
  expenseMatch.$or = orConditions;

  const expenseAgg = await Expense.aggregate([
    { $match: expenseMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalExpenseTour = expenseAgg[0]?.total || 0;

  // ── Travel Allowance from Payroll ──
  // Sum all "Travel Allowance" amounts from all payroll records in the period list
  const periods = buildPayrollPeriods(startDate, endDate);
  const payrollMatch = {};
  if (periods && periods.length > 0) {
    payrollMatch.period = { $in: periods };
  }

  const travelAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    { $match: { "allowances.type": "Travel Allowance" } },
    {
      $group: {
        _id: null,
        totalTravelAllowance: { $sum: "$allowances.amount" },
      },
    },
  ]);
  const totalTravelAllowance = travelAllowanceAgg[0]?.totalTravelAllowance || 0;

  // ── Combined Tour Expense ──
  const totalTourExpense = totalExpenseTour + totalTravelAllowance;

  // ── Derived metrics ──
  const ratio = totalSale > 0 ? totalTourExpense / totalSale : 0;
  const percentage = totalSale > 0 ? (totalTourExpense / totalSale) * 100 : 0;

  return {
    summary: {
      tourExpense: parseFloat(totalTourExpense.toFixed(2)),
      totalSales: parseFloat(totalSale.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(4)),
      expenseTour: parseFloat(totalExpenseTour.toFixed(2)),
      travelAllowance: parseFloat(totalTravelAllowance.toFixed(2)),
    },
    record: {
      id: 1,
      sale: parseFloat(totalSale.toFixed(2)),
      cog: parseFloat(totalCOG.toFixed(2)),
      tourExpense: parseFloat(totalTourExpense.toFixed(2)),
      expenseTour: parseFloat(totalExpenseTour.toFixed(2)),
      travelAllowance: parseFloat(totalTravelAllowance.toFixed(2)),
      percentage: parseFloat(percentage.toFixed(2)),
      profit: parseFloat(totalProfit.toFixed(2)),
      invoiceCount: saleCount,
    },
    totals: {
      totalSale: parseFloat(totalSale.toFixed(2)),
      totalCOG: parseFloat(totalCOG.toFixed(2)),
      totalTourExpense: parseFloat(totalTourExpense.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalSaleCount: saleCount,
    },
  };
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { dateFilter = "currentMonth", startDate, endDate } = req.query;
    console.log('values of datefilter', dateFilter);
    console.log('values of startDate', startDate);
    console.log('values of endDAte', endDate);
    const dateRange = getDateRange(dateFilter, startDate, endDate);
    const { summary, record, totals } = await buildAggregatedRecord(dateRange);

    res.json({
      success: true,
      data: { summary, records: [record], totals },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalRecords: 1,
        hasNext: false,
        hasPrev: false,
      },
    });
  } catch (error) {
    console.error("Error fetching tour expense sales ratio:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /export ──────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const { dateFilter = "currentMonth", startDate, endDate } = req.query;
    const dateRange = getDateRange(dateFilter, startDate, endDate);
    const { summary, record, totals } = await buildAggregatedRecord(dateRange);

    if (!record.sale && !record.tourExpense) {
      return res.status(404).json({
        success: false,
        message: "No data found for export",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tour Expense Sales Ratio");

    // Title
    const titleRow = worksheet.addRow(["Tour Expense / Sales Ratio Report"]);
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

    // Summary
    const summaryHeader = worksheet.addRow(["Summary"]);
    summaryHeader.font = { bold: true, size: 13 };
    worksheet.mergeCells("A4:G4");

    worksheet.addRow(["Total Sales", `$${summary.totalSales.toFixed(2)}`]);
    worksheet.addRow([
      "  Tour Expense (Expense Records)",
      `$${summary.expenseTour.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "  Travel Allowance (Payroll)",
      `$${summary.travelAllowance.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Total Tour Expense (Combined)",
      `$${summary.tourExpense.toFixed(2)}`,
    ]);
    worksheet.addRow(["Tour Expense / Sales Ratio", summary.ratio.toFixed(4)]);
    worksheet.addRow(["Total Profit", `$${summary.totalProfit.toFixed(2)}`]);
    worksheet.addRow([]);

    // Table header
    const headerRow = worksheet.addRow([
      "Sr.No",
      "Sale ($)",
      "Expense Tour ($)",
      "Travel Allowance ($)",
      "Tour Expense Total ($)",
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

    // Data row
    const row = worksheet.addRow([
      record.id,
      record.sale,
      record.expenseTour,
      record.travelAllowance,
      record.tourExpense,
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
      record.expenseTour,
      record.travelAllowance,
      totals.totalTourExpense,
      totals.totalSale > 0 ? totals.totalTourExpense / totals.totalSale : 0,
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
      { width: 20 },
      { width: 22 },
      { width: 22 },
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
      `attachment; filename="tour-expense-sales-ratio-${timestamp}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting tour expense sales ratio:", error);
    res.status(500).json({ success: false, message: "Failed to export data" });
  }
});

export default router;
