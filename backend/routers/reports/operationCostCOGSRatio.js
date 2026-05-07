import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import PurchaseInventory from "../../models/purchasing/purchaseInventory.js";
import Expense from "../../models/expenses/addExpense.js";
import Payroll from "../../models/Hrm/Payroll.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─── Date Range Helper ────────────────────────────────────────────────────────
const getDateRange = (dateFilter = "currentMonth", startDate, endDate) => {
  // If explicit startDate/endDate were passed in (custom range), use them directly
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

// ─── Sales Data  (fixes the missing sale amount bug) ─────────────────────────
// Uses SaleSummary.totalAmount → mapped to record.sale on the frontend.
const getSalesData = async (startDate, endDate) => {
  try {
    const matchConditions = {};
    if (startDate && endDate) {
      matchConditions.recordingDate = { $gte: startDate, $lte: endDate };
    }

    const sales = await SaleSummary.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" },
          },
          // ✅ FIX: sum totalAmount from SaleSummary (not PurchaseInventory)
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfitLoss" },
          saleCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailySales = {};
    sales.forEach((s) => {
      dailySales[s._id] = {
        totalSales: s.totalSales || 0,
        totalProfit: s.totalProfit || 0,
        saleCount: s.saleCount || 0,
      };
    });

    return dailySales;
  } catch (error) {
    console.error("Error getting sales data:", error);
    return {};
  }
};

// ─── COGS from PurchaseInventory ──────────────────────────────────────────────
const calculateCOGS = async (startDate, endDate) => {
  try {
    const matchConditions = {};
    if (startDate && endDate) {
      matchConditions.invoiceDate = { $gte: startDate, $lte: endDate };
    }

    const purchases = await PurchaseInventory.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" },
          },
          // Sum product-level cost: quantity × unitPrice
          totalCOGS: {
            $sum: {
              $multiply: ["$products.quantity", "$products.unitPrice"],
            },
          },
        },
      },
    ]);

    let totalCOGS = 0;
    const dailyCOGS = {};
    purchases.forEach((p) => {
      dailyCOGS[p._id] = p.totalCOGS || 0;
      totalCOGS += p.totalCOGS || 0;
    });

    return { totalCOGS, dailyCOGS };
  } catch (error) {
    console.error("Error calculating COGS:", error);
    return { totalCOGS: 0, dailyCOGS: {} };
  }
};

// ─── Operation Cost (Expenses + Payroll) ──────────────────────────────────────
const calculateOperationCost = async (startDate, endDate) => {
  try {
    const expenseMatch = {};
    const payrollMatch = {};

    if (startDate && endDate) {
      expenseMatch.date = { $gte: startDate, $lte: endDate };

      // Build period list for payroll (period format: "YYYY-MM")
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

    const dailyExpenses = await Expense.aggregate([
      { $match: expenseMatch },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          totalExpense: { $sum: "$amount" },
        },
      },
    ]);

    const payrollAggregate = await Payroll.aggregate([
      { $match: payrollMatch },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            employeeId: "$employeeId",
          },
          totalSalary: { $sum: "$basicSalary" },
          totalAllowance: { $sum: "$totalAllowance" },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          totalPayroll: {
            $sum: { $add: ["$totalSalary", "$totalAllowance"] },
          },
        },
      },
    ]);

    const dailyOperationCost = {};
    let totalOperationCost = 0;

    dailyExpenses.forEach((e) => {
      dailyOperationCost[e._id] =
        (dailyOperationCost[e._id] || 0) + (e.totalExpense || 0);
      totalOperationCost += e.totalExpense || 0;
    });

    payrollAggregate.forEach((p) => {
      dailyOperationCost[p._id] =
        (dailyOperationCost[p._id] || 0) + (p.totalPayroll || 0);
      totalOperationCost += p.totalPayroll || 0;
    });

    return { totalOperationCost, dailyOperationCost };
  } catch (error) {
    console.error("Error calculating operation cost:", error);
    return { totalOperationCost: 0, dailyOperationCost: {} };
  }
};

// ─── Core Data Builder ────────────────────────────────────────────────────────
// Returns ONE aggregated record for the selected period.
// Date-wise breakdown caused COG=$0 because purchase dates != sale dates.
const fetchOperationCostCOGSData = async (params) => {
  try {
    const {
      dateFilter = "currentMonth",
      startDate: rawStart,
      endDate: rawEnd,
      export: isExport = false,
    } = params;

    const dateRange = getDateRange(dateFilter, rawStart, rawEnd);

    const [cogsData, operationCostData, salesData] = await Promise.all([
      calculateCOGS(dateRange.startDate, dateRange.endDate),
      calculateOperationCost(dateRange.startDate, dateRange.endDate),
      getSalesData(dateRange.startDate, dateRange.endDate),
    ]);

    // ── Aggregate into single period totals ──
    const totalSale = Object.values(salesData).reduce(
      (sum, s) => sum + (s.totalSales || 0),
      0,
    );
    const totalCOGS = cogsData.totalCOGS || 0;
    const totalExpense = operationCostData.totalOperationCost || 0;
    const percentage = totalCOGS > 0 ? (totalExpense / totalCOGS) * 100 : 0;

    const summary = {
      operationCost: parseFloat(totalExpense.toFixed(2)),
      cogs: parseFloat(totalCOGS.toFixed(2)),
      ratio:
        totalCOGS > 0 ? parseFloat((totalExpense / totalCOGS).toFixed(4)) : 0,
      totalSales: parseFloat(totalSale.toFixed(2)),
    };

    // ── Single row for the whole period ──
    const record = {
      id: 1,
      sale: parseFloat(totalSale.toFixed(2)),
      cog: parseFloat(totalCOGS.toFixed(2)),
      expense: parseFloat(totalExpense.toFixed(2)),
      percentage: parseFloat(percentage.toFixed(2)),
    };

    const totals = {
      totalSale: record.sale,
      totalCOG: record.cog,
      totalExpense: record.expense,
    };

    return {
      success: true,
      data: { summary, records: [record], totals },
      pagination: !isExport
        ? {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 1,
            hasNext: false,
            hasPrev: false,
          }
        : undefined,
    };
  } catch (error) {
    console.error("Error in fetchOperationCostCOGSData:", error);
    throw error;
  }
};

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const result = await fetchOperationCostCOGSData(req.query);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error in operation cost COGS ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch operation cost COGS ratio data",
      error: error.message,
    });
  }
});

// ─── GET /export ──────────────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  try {
    const result = await fetchOperationCostCOGSData({
      ...req.query,
      export: "true",
      limit: 10000,
    });

    if (!result.success) throw new Error("Failed to fetch data for export");

    const { summary, records, totals } = result.data;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Operation Cost COGS Ratio Report");

    // Title
    const titleRow = worksheet.addRow(["Operation Cost / COGS Ratio Report"]);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center" };
    worksheet.mergeCells("A1:E1");

    // Filter info
    const dateLabel =
      req.query.startDate && req.query.endDate
        ? `${req.query.startDate} to ${req.query.endDate}`
        : req.query.dateFilter || "Current Month";
    worksheet.addRow([`Period: ${dateLabel}`]).alignment = {
      horizontal: "center",
    };
    worksheet.mergeCells("A2:E2");
    worksheet.addRow([]);

    // Summary
    const summaryHeader = worksheet.addRow(["Summary"]);
    summaryHeader.font = { bold: true, size: 13 };
    worksheet.mergeCells("A4:E4");

    worksheet.addRow(["Total Sales", `$${summary.totalSales.toFixed(2)}`]);
    worksheet.addRow(["Total COGS", `$${summary.cogs.toFixed(2)}`]);
    worksheet.addRow([
      "Total Operation Cost",
      `$${summary.operationCost.toFixed(2)}`,
    ]);
    worksheet.addRow(["Operation Cost / COGS Ratio", summary.ratio.toFixed(4)]);
    worksheet.addRow([]);

    // Table header
    const headerRow = worksheet.addRow([
      "Sr.No",
      "Sale ($)",
      "COG ($)",
      "Expense ($)",
      "Percentage (%)",
    ]);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Data rows
    records.forEach((record) => {
      const row = worksheet.addRow([
        record.id,
        record.sale,
        record.cog,
        record.expense,
        record.percentage / 100,
      ]);
      [2, 3, 4].forEach((col) => {
        row.getCell(col).numFmt = "$#,##0.00";
      });
      const pctCell = row.getCell(5);
      pctCell.numFmt = "0.00%";
      if (record.percentage < 10) {
        pctCell.font = { color: { argb: "FF16A34A" } };
      } else if (record.percentage < 20) {
        pctCell.font = { color: { argb: "FFCA8A04" } };
      } else {
        pctCell.font = { color: { argb: "FFDC2626" } };
      }
    });

    // Totals row
    const totalsRow = worksheet.addRow([
      "TOTAL",
      totals.totalSale,
      totals.totalCOG,
      totals.totalExpense,
      totals.totalCOG > 0 ? totals.totalExpense / totals.totalCOG : 0,
    ]);
    totalsRow.font = { bold: true };
    totalsRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF3C7" },
    };
    [2, 3, 4].forEach((col) => {
      totalsRow.getCell(col).numFmt = "$#,##0.00";
    });
    totalsRow.getCell(5).numFmt = "0.00%";

    worksheet.addRow([]);
    const tsRow = worksheet.addRow([
      `Report Generated: ${new Date().toLocaleString()} | Total Records: ${records.length}`,
    ]);
    tsRow.font = { italic: true };
    tsRow.alignment = { horizontal: "center" };
    worksheet.mergeCells(`A${tsRow.number}:E${tsRow.number}`);

    worksheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
    ];

    worksheet.eachRow((row) => {
      row.alignment = { vertical: "middle", horizontal: "center" };
    });

    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `operation-cost-cogs-ratio-${timestamp}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error in export API:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

export default router;
