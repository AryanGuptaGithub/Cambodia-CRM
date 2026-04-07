import express from "express";
import Expense from "../../models/expenses/addExpense.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
//  EXPENSE CATEGORY MAPPING
//
//  Tour Expense ($)      → Expense categories matching:
//                            • "Tour Petrol Expense"
//                            • "Province Marketing Expense"
//                            • any category with "tour" in name
//                            • any category with "van" in name
//                            • remarks containing "tour"
//                          + Travel Allowance from Payroll.allowances[]
//                            where allowances[].type === "Travel Allowance"
//
//  Tour Allowance ($)    → Payroll.allowances[] where type === "Tour Allowance"
//                          (Daily Allowance to Medical Reps / Drivers / Supervisors)
//
//  Incentive ($)         → Expense category: "Incentive"
//                          (Sales and other Incentives for Sales Team)
//
//  totalTourCost         → Tour Expense + Tour Allowance + Incentive
// ─────────────────────────────────────────────────────────────────────────────

// ─── Date Range Helper (UTC) ─────────────────────────────────────────────────
const getDateRange = (dateFilter = "currentMonth", startDate, endDate) => {
  if (startDate && endDate) {
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
  const month = now.getUTCMonth();

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

// ─── Build period strings for payroll matching (YYYY-MM) ─────────────────────
const buildPayrollPeriods = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const startYear = startDate.getUTCFullYear();
  const startMonth = startDate.getUTCMonth();
  const endYear = endDate.getUTCFullYear();
  const endMonth = endDate.getUTCMonth();
  const periods = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    periods.push(`${year}-${(month + 1).toString().padStart(2, "0")}`);
    month++;
    if (month > 11) {
      month = 0;
      year++;
    }
  }
  return periods;
};

// ─── Get expense category IDs by type ────────────────────────────────────────
const getExpenseCategoryIds = async () => {
  try {
    // Fetch ALL active categories once
    const allCategories = await ExpenseCategory.find({ isActive: true }).select(
      "_id category",
    );

    const tourExpenseCategoryIds = []; // Tour Expense: petrol, vans, province marketing, tour-named
    const incentiveCategoryIds = []; // Incentive: "Incentive" category

    for (const cat of allCategories) {
      const name = (cat.category || "").toLowerCase().trim();

      // ── Incentive category ──
      if (name === "incentive") {
        incentiveCategoryIds.push(cat._id);
        continue;
      }

      // ── Tour Expense categories ──
      // Matches: "Tour Petrol Expense", "Province Marketing Expense",
      //          any category with "tour" or "van" or "province" in the name
      if (
        name.includes("tour") || // Tour Petrol Expense, Tour Allowance expense type
        name.includes("van") || // Rent Expense - Vans
        name.includes("province marketing") || // Province Marketing Expense ← NEW
        name.includes("petrol") // any petrol expenses
      ) {
        tourExpenseCategoryIds.push(cat._id);
      }
    }

    return { tourExpenseCategoryIds, incentiveCategoryIds };
  } catch (err) {
    console.error("Error fetching expense categories:", err);
    return { tourExpenseCategoryIds: [], incentiveCategoryIds: [] };
  }
};

// ─── Build single aggregated record ──────────────────────────────────────────
const buildAggregatedRecord = async (dateRange) => {
  const { startDate, endDate } = dateRange;

  // ── Sales ──────────────────────────────────────────────────────────────────
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

  // ── Expense category IDs ───────────────────────────────────────────────────
  const { tourExpenseCategoryIds, incentiveCategoryIds } =
    await getExpenseCategoryIds();

  const expenseDateMatch = {};
  if (startDate && endDate) {
    expenseDateMatch.date = { $gte: startDate, $lte: endDate };
  }

  // ── Tour Expenses from Expense collection ──────────────────────────────────
  //    Categories: Tour Petrol Expense, Province Marketing Expense,
  //                Rent Expense - Vans, any with "tour"/"van"/"petrol" in name
  //    OR remarks containing "tour"
  const tourExpenseMatch = { ...expenseDateMatch };
  const tourOrConditions = [];
  if (tourExpenseCategoryIds.length > 0) {
    tourOrConditions.push({ category: { $in: tourExpenseCategoryIds } });
  }
  tourOrConditions.push({ remarks: { $regex: /tour/i } });
  tourExpenseMatch.$or = tourOrConditions;

  const tourExpenseAgg = await Expense.aggregate([
    { $match: tourExpenseMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalExpenseTour = tourExpenseAgg[0]?.total || 0;

  // ── Incentive from Expense collection ─────────────────────────────────────
  //    Category: "Incentive" (Sales and other Incentives for Sales Team)
  let totalExpenseIncentive = 0;
  if (incentiveCategoryIds.length > 0) {
    const incentiveExpenseAgg = await Expense.aggregate([
      {
        $match: {
          ...expenseDateMatch,
          category: { $in: incentiveCategoryIds },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    totalExpenseIncentive = incentiveExpenseAgg[0]?.total || 0;
  }

  // ── Payroll allowances ─────────────────────────────────────────────────────
  const periods = buildPayrollPeriods(startDate, endDate);
  const payrollMatch = {};
  if (periods && periods.length > 0) {
    payrollMatch.period = { $in: periods };
  }

  // Travel Allowance from payroll → contributes to Tour Expense
  const travelAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "allowances.type": { $regex: /^travel allowance$/i },
      },
    },
    {
      $group: {
        _id: null,
        totalTravelAllowance: { $sum: "$allowances.amount" },
      },
    },
  ]);
  const totalTravelAllowance = travelAllowanceAgg[0]?.totalTravelAllowance || 0;

  // Tour Allowance from payroll → Daily Allowance to MRs / Drivers / Supervisors
  const tourAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "allowances.type": { $regex: /^tour allowance$/i },
      },
    },
    {
      $group: {
        _id: null,
        totalTourAllowance: { $sum: "$allowances.amount" },
      },
    },
  ]);
  const totalTourAllowance = tourAllowanceAgg[0]?.totalTourAllowance || 0;

  // Incentive from payroll allowances
  const incentiveAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "allowances.type": { $regex: /^incentive$/i },
      },
    },
    {
      $group: {
        _id: null,
        totalIncentive: { $sum: "$allowances.amount" },
      },
    },
  ]);
  const totalPayrollIncentive = incentiveAllowanceAgg[0]?.totalIncentive || 0;

  // ── Combined totals ────────────────────────────────────────────────────────
  //  Tour Expense   = expense records (tour/van/petrol/province marketing)
  //                 + Travel Allowance from payroll
  const totalTourExpense = totalExpenseTour + totalTravelAllowance;

  //  Incentive      = Incentive expense records + Incentive payroll allowances
  const totalIncentive = totalExpenseIncentive + totalPayrollIncentive;

  //  Total Tour Cost = Tour Expense + Tour Allowance + Incentive
  const totalTourCost = totalTourExpense + totalTourAllowance + totalIncentive;

  // ── Ratios ─────────────────────────────────────────────────────────────────
  const ratio = totalSale > 0 ? totalTourCost / totalSale : 0;
  const percentage = totalSale > 0 ? (totalTourCost / totalSale) * 100 : 0;

  return {
    summary: {
      // Tour Expense = Rent Expense-Vans + Tour Petrol Expense + Province Marketing + Travel Allowance
      tourExpense: parseFloat(totalTourExpense.toFixed(2)),
      // Tour Allowance = Daily Allowance for MRs / Drivers / Supervisors
      tourAllowance: parseFloat(totalTourAllowance.toFixed(2)),
      // Incentive = Sales and other Incentives for Sales Team
      incentive: parseFloat(totalIncentive.toFixed(2)),
      // Total Tour Cost = tourExpense + tourAllowance + incentive
      totalTourCost: parseFloat(totalTourCost.toFixed(2)),
      totalSales: parseFloat(totalSale.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(4)),
      // Breakdown details for summary card subtitle
      expenseTour: parseFloat(totalExpenseTour.toFixed(2)),
      travelAllowance: parseFloat(totalTravelAllowance.toFixed(2)),
      provinceMarketing: 0, // already included in expenseTour via category match
    },
    record: {
      id: 1,
      sale: parseFloat(totalSale.toFixed(2)),
      cog: parseFloat(totalCOG.toFixed(2)),
      // Flat fields for the table row
      tourExpense: parseFloat(totalTourExpense.toFixed(2)), // Vans + Petrol + Province Marketing + Travel Allowance
      tourAllowance: parseFloat(totalTourAllowance.toFixed(2)), // Daily Allowance
      incentive: parseFloat(totalIncentive.toFixed(2)), // Incentive
      totalTourCost: parseFloat(totalTourCost.toFixed(2)), // All three combined
      percentage: parseFloat(percentage.toFixed(2)),
      profit: parseFloat(totalProfit.toFixed(2)),
      invoiceCount: saleCount,
    },
    totals: {
      totalSale: parseFloat(totalSale.toFixed(2)),
      totalCOG: parseFloat(totalCOG.toFixed(2)),
      totalTourExpense: parseFloat(totalTourExpense.toFixed(2)),
      totalTourAllowance: parseFloat(totalTourAllowance.toFixed(2)),
      totalIncentive: parseFloat(totalIncentive.toFixed(2)),
      totalTourCost: parseFloat(totalTourCost.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalSaleCount: saleCount,
    },
  };
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { dateFilter = "currentMonth", startDate, endDate } = req.query;
    console.log(
      "Tour Expense Route → dateFilter:",
      dateFilter,
      "| startDate:",
      startDate,
      "| endDate:",
      endDate,
    );

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

    if (!record.sale && !record.tourExpense && !record.incentive) {
      return res
        .status(404)
        .json({ success: false, message: "No data found for export" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tour Expense Sales Ratio");

    // ── Title ──
    const titleRow = worksheet.addRow(["Tour Expense / Sales Ratio Report"]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center" };
    worksheet.mergeCells("A1:I1");

    // ── Period ──
    const dateLabel =
      startDate && endDate
        ? `${startDate} to ${endDate}`
        : dateFilter === "currentMonth"
          ? `${new Date().toLocaleString("default", { month: "long" })} ${new Date().getFullYear()}`
          : dateFilter;
    const periodRow = worksheet.addRow([`Period: ${dateLabel}`]);
    periodRow.alignment = { horizontal: "center" };
    worksheet.mergeCells("A2:I2");
    worksheet.addRow([]);

    // ── Summary section ──
    const summaryHeader = worksheet.addRow(["Summary"]);
    summaryHeader.font = { bold: true, size: 13 };
    worksheet.mergeCells("A4:I4");

    worksheet.addRow(["Total Sales", `$${summary.totalSales.toFixed(2)}`]);
    worksheet.addRow([
      "Tour Expense (Vans + Petrol + Province Mktg)",
      `$${summary.expenseTour.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "  + Travel Allowance (Payroll)",
      `$${summary.travelAllowance.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Tour Expense Total",
      `$${summary.tourExpense.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Tour Allowance (Daily - MRs/Drivers/Supvr)",
      `$${summary.tourAllowance.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Incentive (Sales Team)",
      `$${summary.incentive.toFixed(2)}`,
    ]);
    worksheet.addRow([
      "Total Tour Cost",
      `$${summary.totalTourCost.toFixed(2)}`,
    ]);
    worksheet.addRow(["Tour Cost / Sales Ratio", summary.ratio.toFixed(4)]);
    worksheet.addRow(["Total Profit", `$${summary.totalProfit.toFixed(2)}`]);
    worksheet.addRow([]);

    // ── Table header ──
    const headerRow = worksheet.addRow([
      "Sr.No",
      "Sale ($)",
      "Tour Expense ($)\nVans+Petrol+Province Mktg+Travel Allow.",
      "Tour Allowance ($)\nDaily Allow. MRs/Drivers/Supervisors",
      "Incentive ($)\nSales Team",
      "Total Tour Cost ($)",
      "Percentage (%)",
      "Profit ($)",
    ]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    headerRow.height = 40;

    // ── Data row ──
    const row = worksheet.addRow([
      record.id,
      record.sale,
      record.tourExpense,
      record.tourAllowance,
      record.incentive,
      record.totalTourCost,
      record.percentage / 100,
      record.profit,
    ]);
    [2, 3, 4, 5, 6, 8].forEach((col) => {
      row.getCell(col).numFmt = "$#,##0.00";
    });
    const pctCell = row.getCell(7);
    pctCell.numFmt = "0.00%";
    pctCell.font = {
      color: {
        argb:
          record.percentage < 10
            ? "FF16A34A"
            : record.percentage < 20
              ? "FFCA8A04"
              : "FFDC2626",
      },
    };

    // ── Totals row ──
    const totalsRow = worksheet.addRow([
      "TOTAL",
      totals.totalSale,
      totals.totalTourExpense,
      totals.totalTourAllowance,
      totals.totalIncentive,
      totals.totalTourCost,
      totals.totalSale > 0 ? totals.totalTourCost / totals.totalSale : 0,
      totals.totalProfit,
    ]);
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    [2, 3, 4, 5, 6, 8].forEach((col) => {
      totalsRow.getCell(col).numFmt = "$#,##0.00";
    });
    totalsRow.getCell(7).numFmt = "0.00%";

    worksheet.addRow([]);
    const tsRow = worksheet.addRow([
      `Report Generated: ${new Date().toLocaleString()} | Total Invoices: ${record.invoiceCount}`,
    ]);
    tsRow.font = { italic: true };
    tsRow.alignment = { horizontal: "center" };
    worksheet.mergeCells(`A${tsRow.number}:I${tsRow.number}`);

    worksheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 28 },
      { width: 28 },
      { width: 20 },
      { width: 18 },
      { width: 15 },
      { width: 15 },
    ];

    worksheet.eachRow((row) => {
      row.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true,
      };
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
