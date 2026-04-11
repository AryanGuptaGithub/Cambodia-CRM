// routes/reports/tourExpenseSalesRatio.js
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
    const allCategories = await ExpenseCategory.find({ isActive: true }).select(
      "_id category",
    );
    const tourExpenseCategoryIds = [];
    const incentiveCategoryIds = [];

    for (const cat of allCategories) {
      const name = (cat.category || "").toLowerCase().trim();
      if (name === "incentive") {
        incentiveCategoryIds.push(cat._id);
        continue;
      }
      if (
        name.includes("tour") ||
        name.includes("van") ||
        name.includes("province marketing") ||
        name.includes("petrol")
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

// ─── GET /mr-list — return all MRs who have tour expenses ────────────────────
router.get("/mr-list", async (req, res) => {
  try {
    const { tourExpenseCategoryIds } = await getExpenseCategoryIds();

    const mrMatch = {};
    if (tourExpenseCategoryIds.length > 0) {
      mrMatch.$or = [
        { category: { $in: tourExpenseCategoryIds } },
        { remarks: { $regex: /tour/i } },
      ];
    } else {
      mrMatch.remarks = { $regex: /tour/i };
    }

    // Only expenses that have an mrId linked
    mrMatch.mrId = { $ne: null, $exists: true };

    const mrList = await Expense.aggregate([
      { $match: mrMatch },
      {
        $group: {
          _id: "$mrId",
          mrName: { $first: "$mrName" },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { mrName: 1 } },
    ]);

    res.json({ success: true, data: mrList });
  } catch (error) {
    console.error("Error fetching MR list:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── Build MR-wise aggregated records ────────────────────────────────────────
const buildMRWiseRecords = async (dateRange, filterMrId = null) => {
  const { startDate, endDate } = dateRange;
  const { tourExpenseCategoryIds, incentiveCategoryIds } =
    await getExpenseCategoryIds();

  const expenseDateMatch = {};
  if (startDate && endDate) {
    expenseDateMatch.date = { $gte: startDate, $lte: endDate };
  }

  // Base tour expense match
  const tourOrConditions = [];
  if (tourExpenseCategoryIds.length > 0) {
    tourOrConditions.push({ category: { $in: tourExpenseCategoryIds } });
  }
  tourOrConditions.push({ remarks: { $regex: /tour/i } });

  const tourExpenseMatch = {
    ...expenseDateMatch,
    mrId: { $ne: null, $exists: true },
    $or: tourOrConditions,
  };

  // Filter by specific MR if provided
  if (filterMrId) {
    tourExpenseMatch.mrId = filterMrId;
  }

  // Aggregate tour expenses grouped by MR
  const mrTourExpenses = await Expense.aggregate([
    { $match: tourExpenseMatch },
    {
      $group: {
        _id: "$mrId",
        mrName: { $first: "$mrName" },
        tourExpense: { $sum: "$amount" },
        expenseCount: { $sum: 1 },
        expenses: {
          $push: {
            date: "$date",
            amount: "$amount",
            remarks: "$remarks",
            category: "$category",
          },
        },
      },
    },
    { $sort: { mrName: 1 } },
  ]);

  return mrTourExpenses;
};

// ─── Build single aggregated record (overall, optionally filtered by MR) ─────
const buildAggregatedRecord = async (dateRange, filterMrId = null) => {
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

  // ── Expense category IDs ──
  const { tourExpenseCategoryIds, incentiveCategoryIds } =
    await getExpenseCategoryIds();

  const expenseDateMatch = {};
  if (startDate && endDate) {
    expenseDateMatch.date = { $gte: startDate, $lte: endDate };
  }

  // ── Tour Expenses ──
  const tourExpenseMatch = { ...expenseDateMatch };
  const tourOrConditions = [];
  if (tourExpenseCategoryIds.length > 0) {
    tourOrConditions.push({ category: { $in: tourExpenseCategoryIds } });
  }
  tourOrConditions.push({ remarks: { $regex: /tour/i } });
  tourExpenseMatch.$or = tourOrConditions;

  // Apply MR filter if provided
  if (filterMrId) {
    tourExpenseMatch.mrId = filterMrId;
  }

  const tourExpenseAgg = await Expense.aggregate([
    { $match: tourExpenseMatch },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalExpenseTour = tourExpenseAgg[0]?.total || 0;

  // ── Incentive from Expense ──
  let totalExpenseIncentive = 0;
  if (incentiveCategoryIds.length > 0 && !filterMrId) {
    // Incentive is not MR-specific, skip when filtering by MR
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

  // ── Payroll allowances ──
  const periods = buildPayrollPeriods(startDate, endDate);
  const payrollMatch = {};
  if (periods && periods.length > 0) {
    payrollMatch.period = { $in: periods };
  }

  // Apply MR filter to payroll if filterMrId provided
  if (filterMrId) {
    payrollMatch.employeeId = filterMrId;
  }

  // Travel Allowance from payroll
  const travelAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    { $match: { "allowances.type": { $regex: /^travel allowance$/i } } },
    {
      $group: {
        _id: null,
        totalTravelAllowance: { $sum: "$allowances.amount" },
      },
    },
  ]);
  const totalTravelAllowance = travelAllowanceAgg[0]?.totalTravelAllowance || 0;

  // Tour Allowance from payroll
  const tourAllowanceAgg = await Payroll.aggregate([
    { $match: payrollMatch },
    { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
    { $match: { "allowances.type": { $regex: /^tour allowance$/i } } },
    {
      $group: { _id: null, totalTourAllowance: { $sum: "$allowances.amount" } },
    },
  ]);
  const totalTourAllowance = tourAllowanceAgg[0]?.totalTourAllowance || 0;

  // Incentive from payroll
  let totalPayrollIncentive = 0;
  if (!filterMrId) {
    const incentiveAllowanceAgg = await Payroll.aggregate([
      { $match: payrollMatch },
      { $unwind: { path: "$allowances", preserveNullAndEmptyArrays: false } },
      { $match: { "allowances.type": { $regex: /^incentive$/i } } },
      { $group: { _id: null, totalIncentive: { $sum: "$allowances.amount" } } },
    ]);
    totalPayrollIncentive = incentiveAllowanceAgg[0]?.totalIncentive || 0;
  }

  // ── Combined totals ──
  const totalTourExpense = totalExpenseTour + totalTravelAllowance;
  const totalIncentive = totalExpenseIncentive + totalPayrollIncentive;
  const totalTourCost = totalTourExpense + totalTourAllowance + totalIncentive;
  const ratio = totalSale > 0 ? totalTourCost / totalSale : 0;
  const percentage = totalSale > 0 ? (totalTourCost / totalSale) * 100 : 0;

  return {
    summary: {
      tourExpense: parseFloat(totalTourExpense.toFixed(2)),
      tourAllowance: parseFloat(totalTourAllowance.toFixed(2)),
      incentive: parseFloat(totalIncentive.toFixed(2)),
      totalTourCost: parseFloat(totalTourCost.toFixed(2)),
      totalSales: parseFloat(totalSale.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(4)),
      expenseTour: parseFloat(totalExpenseTour.toFixed(2)),
      travelAllowance: parseFloat(totalTravelAllowance.toFixed(2)),
      provinceMarketing: 0,
    },
    record: {
      id: 1,
      sale: parseFloat(totalSale.toFixed(2)),
      cog: parseFloat(totalCOG.toFixed(2)),
      tourExpense: parseFloat(totalTourExpense.toFixed(2)),
      tourAllowance: parseFloat(totalTourAllowance.toFixed(2)),
      incentive: parseFloat(totalIncentive.toFixed(2)),
      totalTourCost: parseFloat(totalTourCost.toFixed(2)),
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

// ─── GET / — main report (supports ?mrId=xxx for MR-wise filter) ──────────────
router.get("/", async (req, res) => {
  try {
    const {
      dateFilter = "currentMonth",
      startDate,
      endDate,
      mrId,
      viewMode,
    } = req.query;

    const dateRange = getDateRange(dateFilter, startDate, endDate);

    // MR-wise breakdown mode
    if (viewMode === "mrWise") {
      const mrRecords = await buildMRWiseRecords(dateRange, mrId || null);

      // Also get overall sales for ratio calculation
      const salesMatch = {};
      if (dateRange.startDate && dateRange.endDate) {
        salesMatch.recordingDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate,
        };
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

      const records = mrRecords.map((mr, index) => {
        const tourExpense = parseFloat(mr.tourExpense.toFixed(2));
        const percentage =
          totalSale > 0
            ? parseFloat(((tourExpense / totalSale) * 100).toFixed(2))
            : 0;
        return {
          id: index + 1,
          mrId: mr._id,
          mrName: mr.mrName || "Unknown MR",
          sale: parseFloat(totalSale.toFixed(2)),
          cog: parseFloat((totalSale - totalProfit).toFixed(2)),
          tourExpense,
          tourAllowance: 0, // payroll allowance not split by MR in this view
          incentive: 0,
          totalTourCost: tourExpense,
          percentage,
          profit: parseFloat(totalProfit.toFixed(2)),
          invoiceCount: saleCount,
          expenseCount: mr.expenseCount,
        };
      });

      const grandTourExpense = records.reduce((s, r) => s + r.tourExpense, 0);
      const grandPercentage =
        totalSale > 0 ? (grandTourExpense / totalSale) * 100 : 0;

      return res.json({
        success: true,
        data: {
          summary: {
            tourExpense: parseFloat(grandTourExpense.toFixed(2)),
            tourAllowance: 0,
            incentive: 0,
            totalTourCost: parseFloat(grandTourExpense.toFixed(2)),
            totalSales: parseFloat(totalSale.toFixed(2)),
            totalProfit: parseFloat(totalProfit.toFixed(2)),
            ratio:
              totalSale > 0
                ? parseFloat((grandTourExpense / totalSale).toFixed(4))
                : 0,
          },
          records,
          totals: {
            totalSale: parseFloat(totalSale.toFixed(2)),
            totalCOG: parseFloat((totalSale - totalProfit).toFixed(2)),
            totalTourExpense: parseFloat(grandTourExpense.toFixed(2)),
            totalTourAllowance: 0,
            totalIncentive: 0,
            totalTourCost: parseFloat(grandTourExpense.toFixed(2)),
            totalProfit: parseFloat(totalProfit.toFixed(2)),
            totalSaleCount: saleCount,
          },
        },
        pagination: {
          currentPage: 1,
          totalPages: 1,
          totalRecords: records.length,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Default: overall aggregated view (optionally filtered by MR)
    const filterMrId = mrId || null;
    const { summary, record, totals } = await buildAggregatedRecord(
      dateRange,
      filterMrId,
    );

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
    const {
      dateFilter = "currentMonth",
      startDate,
      endDate,
      mrId,
      viewMode,
    } = req.query;
    const dateRange = getDateRange(dateFilter, startDate, endDate);

    let records = [];
    let summary = {};
    let totals = {};
    let isMRWise = viewMode === "mrWise";

    if (isMRWise) {
      const mrRecords = await buildMRWiseRecords(dateRange, mrId || null);
      const salesMatch = {};
      if (dateRange.startDate && dateRange.endDate) {
        salesMatch.recordingDate = {
          $gte: dateRange.startDate,
          $lte: dateRange.endDate,
        };
      }
      const salesAgg = await SaleSummary.aggregate([
        { $match: salesMatch },
        {
          $group: {
            _id: null,
            totalSale: { $sum: "$totalAmount" },
            totalProfit: { $sum: "$totalProfitLoss" },
          },
        },
      ]);
      const totalSale = salesAgg[0]?.totalSale || 0;
      const totalProfit = salesAgg[0]?.totalProfit || 0;

      records = mrRecords.map((mr, i) => ({
        id: i + 1,
        mrName: mr.mrName || "Unknown MR",
        tourExpense: parseFloat(mr.tourExpense.toFixed(2)),
        sale: parseFloat(totalSale.toFixed(2)),
        profit: parseFloat(totalProfit.toFixed(2)),
        percentage:
          totalSale > 0
            ? parseFloat(((mr.tourExpense / totalSale) * 100).toFixed(2))
            : 0,
        expenseCount: mr.expenseCount,
      }));

      const grandTourExpense = records.reduce((s, r) => s + r.tourExpense, 0);
      summary = {
        totalSales: totalSale,
        totalProfit,
        tourExpense: grandTourExpense,
      };
      totals = { totalSale, totalTourExpense: grandTourExpense, totalProfit };
    } else {
      const result = await buildAggregatedRecord(dateRange, mrId || null);
      records = [result.record];
      summary = result.summary;
      totals = result.totals;
    }

    if (records.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "No data found for export" });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tour Expense Sales Ratio");

    const titleRow = worksheet.addRow([
      isMRWise
        ? "Tour Expense / Sales Ratio Report (MR-wise)"
        : "Tour Expense / Sales Ratio Report",
    ]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center" };
    worksheet.mergeCells(`A1:${isMRWise ? "I" : "I"}1`);

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

    if (isMRWise) {
      // MR-wise table
      const headerRow = worksheet.addRow([
        "Sr.No",
        "Medical Representative",
        "Tour Expense ($)",
        "Sale ($)",
        "Percentage (%)",
        "Profit ($)",
        "Expense Entries",
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
      headerRow.height = 36;

      records.forEach((record) => {
        const row = worksheet.addRow([
          record.id,
          record.mrName,
          record.tourExpense,
          record.sale,
          record.percentage / 100,
          record.profit,
          record.expenseCount,
        ]);
        [3, 4, 6].forEach((col) => {
          row.getCell(col).numFmt = "$#,##0.00";
        });
        row.getCell(5).numFmt = "0.00%";
      });

      const totalsRow = worksheet.addRow([
        "TOTAL",
        `${records.length} MRs`,
        records.reduce((s, r) => s + r.tourExpense, 0),
        records[0]?.sale || 0,
        totals.totalSale > 0 ? totals.totalTourExpense / totals.totalSale : 0,
        totals.totalProfit,
        records.reduce((s, r) => s + r.expenseCount, 0),
      ]);
      totalsRow.font = { bold: true };
      totalsRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEF3C7" },
      };
      [3, 4, 6].forEach((col) => {
        totalsRow.getCell(col).numFmt = "$#,##0.00";
      });
      totalsRow.getCell(5).numFmt = "0.00%";

      worksheet.columns = [
        { width: 8 },
        { width: 25 },
        { width: 18 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
        { width: 15 },
      ];
    } else {
      const record = records[0];
      const headerRow = worksheet.addRow([
        "Sr.No",
        "Sale ($)",
        "Tour Expense ($)",
        "Tour Allowance ($)",
        "Incentive ($)",
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
      row.getCell(7).numFmt = "0.00%";

      worksheet.columns = [
        { width: 8 },
        { width: 15 },
        { width: 22 },
        { width: 22 },
        { width: 18 },
        { width: 18 },
        { width: 15 },
        { width: 15 },
      ];
    }

    worksheet.addRow([]);
    const tsRow = worksheet.addRow([
      `Report Generated: ${new Date().toLocaleString()}`,
    ]);
    tsRow.font = { italic: true };
    tsRow.alignment = { horizontal: "center" };
    worksheet.mergeCells(`A${tsRow.number}:I${tsRow.number}`);

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
