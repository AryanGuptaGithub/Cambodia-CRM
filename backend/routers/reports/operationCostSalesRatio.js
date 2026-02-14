import express from "express";
import Expense from "../../models/expenses/addExpense.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import { Parser } from "json2csv";
import ExcelJS from "exceljs";

const router = express.Router();

const getOperationCostSalesRatio = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 7,
      search = "",
      dateFilter = "currentMonth",
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build date filter
    let dateQuery = {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (dateFilter) {
      case "today":
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const todayEnd = new Date(today.setHours(23, 59, 59, 999));
        dateQuery = {
          recordingDate: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        };
        break;

      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: firstDay,
            $lte: lastDay,
          },
        };
        break;

      case "janToPreviousMonth":
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: janFirst,
            $lte: lastMonthLastDay,
          },
        };
        break;

      case "custom":
        if (startDate && endDate) {
          const customStart = new Date(startDate);
          customStart.setHours(0, 0, 0, 0);
          const customEnd = new Date(endDate);
          customEnd.setHours(23, 59, 59, 999);
          dateQuery = {
            recordingDate: {
              $gte: customStart,
              $lte: customEnd,
            },
          };
        }
        break;

      case "all":
      default:
        // No date filter for "all"
        break;
    }

    // Build sales query
    let salesQuery = {};
    if (search) {
      salesQuery.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    if (Object.keys(dateQuery).length > 0) {
      salesQuery = { ...salesQuery, ...dateQuery };
    }

    // First, get total count for pagination
    const totalSalesCount = await SaleSummary.countDocuments(salesQuery);

    // Fetch ALL sales for the date range (we'll aggregate by date)
    const allSales = await SaleSummary.find(salesQuery)
      .sort({ recordingDate: -1 });

    if (allSales.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            operationCost: 0,
            totalSales: 0,
            ratio: 0,
            totalProfit: 0,
          },
          records: [],
          totals: {
            totalSale: 0,
            totalCOG: 0,
            totalExpense: 0,
            totalPayroll: 0,
            totalProfit: 0,
            totalSaleCount: 0,
          },
        },
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Get the overall date range for expenses and payroll
    const earliestDate = new Date(Math.min(...allSales.map(s => s.recordingDate.getTime())));
    const latestDate = new Date(Math.max(...allSales.map(s => s.recordingDate.getTime())));
    
    earliestDate.setHours(0, 0, 0, 0);
    latestDate.setHours(23, 59, 59, 999);

    // Fetch expenses for the period
    const expenses = await Expense.find({
      date: {
        $gte: earliestDate,
        $lte: latestDate,
      },
    });

    // Group expenses by date
    const expensesByDate = {};
    expenses.forEach(expense => {
      const dateStr = expense.date.toISOString().split('T')[0];
      if (!expensesByDate[dateStr]) {
        expensesByDate[dateStr] = 0;
      }
      expensesByDate[dateStr] += expense.amount;
    });

    // Fetch payroll for the period (by month)
    const startMonth = earliestDate.toISOString().substring(0, 7); // YYYY-MM
    const endMonth = latestDate.toISOString().substring(0, 7);
    
    const payrolls = await Payroll.find({
      period: {
        $gte: startMonth,
        $lte: endMonth,
      },
    });

    // Calculate total payroll per month
    const payrollByMonth = {};
    payrolls.forEach(payroll => {
      if (!payrollByMonth[payroll.period]) {
        payrollByMonth[payroll.period] = 0;
      }
      payrollByMonth[payroll.period] += payroll.netSalary;
    });

    // Group sales by date FIRST
    const salesByDate = {};
    allSales.forEach(sale => {
      const dateStr = sale.recordingDate.toISOString().split('T')[0];
      if (!salesByDate[dateStr]) {
        salesByDate[dateStr] = {
          date: dateStr,
          sale: 0,
          cog: 0,
          profit: 0,
          invoiceCount: 0,
          invoices: []
        };
      }
      const profit = sale.totalProfitLoss;
      const cogs = sale.totalAmount - profit;
      
      salesByDate[dateStr].sale += sale.totalAmount;
      salesByDate[dateStr].cog += cogs;
      salesByDate[dateStr].profit += profit;
      salesByDate[dateStr].invoiceCount++;
      salesByDate[dateStr].invoices.push(sale.invoiceNumber);
    });

    // Get unique dates and sort them
    const uniqueDates = Object.keys(salesByDate).sort((a, b) => 
      new Date(b) - new Date(a)
    );

    // Calculate days in each month for payroll distribution
    const monthDays = {};
    uniqueDates.forEach(dateStr => {
      const month = dateStr.substring(0, 7);
      if (!monthDays[month]) {
        monthDays[month] = new Set();
      }
      monthDays[month].add(dateStr);
    });

    // Distribute monthly payroll evenly across days
    const payrollByDate = {};
    Object.keys(monthDays).forEach(month => {
      const totalPayroll = payrollByMonth[month] || 0;
      const daysInMonth = Array.from(monthDays[month]);
      const dailyPayroll = daysInMonth.length > 0 ? totalPayroll / daysInMonth.length : 0;
      
      daysInMonth.forEach(dateStr => {
        payrollByDate[dateStr] = dailyPayroll;
      });
    });

    // Paginate the aggregated dates (not individual sales)
    const totalDateRecords = uniqueDates.length;
    const totalPages = Math.ceil(totalDateRecords / limitNum);
    
    // Get dates for current page
    const startIdx = (pageNum - 1) * limitNum;
    const endIdx = startIdx + limitNum;
    const paginatedDates = uniqueDates.slice(startIdx, endIdx);

    // Create records from paginated dates
    const records = [];
    let totalSale = 0;
    let totalCOGS = 0;
    let totalExpense = 0;
    let totalPayroll = 0;
    let totalProfit = 0;
    let totalInvoiceCount = 0;

    paginatedDates.forEach(dateStr => {
      const dailySales = salesByDate[dateStr];
      const expense = expensesByDate[dateStr] || 0;
      const payroll = payrollByDate[dateStr] || 0;
      const operationCost = expense + payroll;
      const percentage = dailySales.sale > 0 ? (operationCost / dailySales.sale) * 100 : 0;

      records.push({
        date: dateStr,
        sale: dailySales.sale,
        cog: dailySales.cog,
        expense: expense,
        payroll: payroll,
        operationCost,
        percentage: parseFloat(percentage.toFixed(2)),
        profit: dailySales.profit,
        invoiceCount: dailySales.invoiceCount,
      });

      totalSale += dailySales.sale;
      totalCOGS += dailySales.cog;
      totalExpense += expense;
      totalPayroll += payroll;
      totalProfit += dailySales.profit;
      totalInvoiceCount += dailySales.invoiceCount;
    });

    // Calculate summary for ALL data (not just current page)
    let grandTotalSale = 0;
    let grandTotalCOGS = 0;
    let grandTotalProfit = 0;
    
    Object.values(salesByDate).forEach(daily => {
      grandTotalSale += daily.sale;
      grandTotalCOGS += daily.cog;
      grandTotalProfit += daily.profit;
    });

    const grandTotalExpense = Object.values(expensesByDate).reduce((sum, val) => sum + val, 0);
    const grandTotalPayroll = Object.values(payrollByDate).reduce((sum, val) => sum + val, 0);
    
    const grandTotalOperationCost = grandTotalExpense + grandTotalPayroll;
    const ratio = grandTotalSale > 0 ? grandTotalOperationCost / grandTotalSale : 0;

    const summary = {
      operationCost: grandTotalOperationCost,
      totalSales: grandTotalSale,
      ratio: ratio.toFixed(4),
      totalProfit: grandTotalProfit,
    };

    const totals = {
      totalSale: grandTotalSale,
      totalCOG: grandTotalCOGS,
      totalExpense: grandTotalExpense,
      totalPayroll: grandTotalPayroll,
      totalProfit: grandTotalProfit,
      totalSaleCount: totalSalesCount,
    };

    res.json({
      success: true,
      data: {
        summary,
        records,
        totals,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalDateRecords, // Number of date records, not individual sales
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching operation cost sales ratio:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const exportOperationCostSalesRatio = async (req, res) => {
  try {
    const { search = "", dateFilter = "currentMonth", startDate, endDate } = req.query;

    // Build date filter (same as getOperationCostSalesRatio)
    let dateQuery = {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (dateFilter) {
      case "today":
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const todayEnd = new Date(today.setHours(23, 59, 59, 999));
        dateQuery = {
          recordingDate: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        };
        break;

      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: firstDay,
            $lte: lastDay,
          },
        };
        break;

      case "janToPreviousMonth":
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: janFirst,
            $lte: lastMonthLastDay,
          },
        };
        break;

      case "custom":
        if (startDate && endDate) {
          const customStart = new Date(startDate);
          customStart.setHours(0, 0, 0, 0);
          const customEnd = new Date(endDate);
          customEnd.setHours(23, 59, 59, 999);
          dateQuery = {
            recordingDate: {
              $gte: customStart,
              $lte: customEnd,
            },
          };
        }
        break;
    }

    let salesQuery = {};
    if (search) {
      salesQuery.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
        { customerCode: { $regex: search, $options: "i" } },
        { mrName: { $regex: search, $options: "i" } },
      ];
    }

    if (Object.keys(dateQuery).length > 0) {
      salesQuery = { ...salesQuery, ...dateQuery };
    }

    // Fetch all sales
    const sales = await SaleSummary.find(salesQuery).sort({ recordingDate: -1 });

    if (sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found for export",
      });
    }

    // Get date range
    const earliestDate = new Date(Math.min(...sales.map(s => s.recordingDate.getTime())));
    const latestDate = new Date(Math.max(...sales.map(s => s.recordingDate.getTime())));
    
    earliestDate.setHours(0, 0, 0, 0);
    latestDate.setHours(23, 59, 59, 999);

    // Fetch expenses and payroll
    const [expenses, payrolls] = await Promise.all([
      Expense.find({
        date: {
          $gte: earliestDate,
          $lte: latestDate,
        },
      }),
      Payroll.find({
        period: {
          $gte: earliestDate.toISOString().substring(0, 7),
          $lte: latestDate.toISOString().substring(0, 7),
        },
      }),
    ]);

    // Group expenses by date
    const expensesByDate = {};
    expenses.forEach(expense => {
      const dateStr = expense.date.toISOString().split('T')[0];
      if (!expensesByDate[dateStr]) {
        expensesByDate[dateStr] = 0;
      }
      expensesByDate[dateStr] += expense.amount;
    });

    // Calculate payroll by month
    const payrollByMonth = {};
    payrolls.forEach(payroll => {
      if (!payrollByMonth[payroll.period]) {
        payrollByMonth[payroll.period] = 0;
      }
      payrollByMonth[payroll.period] += payroll.netSalary;
    });

    // Group sales by date
    const salesByDate = {};
    sales.forEach(sale => {
      const dateStr = sale.recordingDate.toISOString().split('T')[0];
      if (!salesByDate[dateStr]) {
        salesByDate[dateStr] = {
          sale: 0,
          cog: 0,
          profit: 0,
          invoiceCount: 0,
        };
      }
      const profit = sale.totalProfitLoss;
      const cogs = sale.totalAmount - profit;
      
      salesByDate[dateStr].sale += sale.totalAmount;
      salesByDate[dateStr].cog += cogs;
      salesByDate[dateStr].profit += profit;
      salesByDate[dateStr].invoiceCount++;
    });

    // Get unique dates
    const uniqueDates = Object.keys(salesByDate).sort((a, b) => 
      new Date(b) - new Date(a)
    );

    // Calculate month days for payroll distribution
    const monthDays = {};
    uniqueDates.forEach(dateStr => {
      const month = dateStr.substring(0, 7);
      if (!monthDays[month]) {
        monthDays[month] = new Set();
      }
      monthDays[month].add(dateStr);
    });

    // Distribute payroll
    const payrollByDate = {};
    Object.keys(monthDays).forEach(month => {
      const totalPayroll = payrollByMonth[month] || 0;
      const daysInMonth = Array.from(monthDays[month]);
      const dailyPayroll = daysInMonth.length > 0 ? totalPayroll / daysInMonth.length : 0;
      
      daysInMonth.forEach(dateStr => {
        payrollByDate[dateStr] = dailyPayroll;
      });
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Operation Cost Sales Ratio");

    // Add headers
    worksheet.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "No. of Invoices", key: "invoiceCount", width: 15 },
      { header: "Sale ($)", key: "sale", width: 15 },
      { header: "COG ($)", key: "cog", width: 15 },
      { header: "Expense ($)", key: "expense", width: 15 },
      { header: "Payroll ($)", key: "payroll", width: 15 },
      { header: "Percentage (%)", key: "percentage", width: 15 },
      { header: "Profit ($)", key: "profit", width: 15 },
    ];

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add daily aggregated records
    let totalSale = 0;
    let totalCOGS = 0;
    let totalExpense = 0;
    let totalPayroll = 0;
    let totalProfit = 0;
    let totalInvoiceCount = 0;

    uniqueDates.forEach(dateStr => {
      const dailySales = salesByDate[dateStr];
      const expense = expensesByDate[dateStr] || 0;
      const payroll = payrollByDate[dateStr] || 0;
      const operationCost = expense + payroll;
      const percentage = dailySales.sale > 0 ? (operationCost / dailySales.sale) * 100 : 0;

      worksheet.addRow({
        date: dateStr,
        invoiceCount: dailySales.invoiceCount,
        sale: dailySales.sale,
        cog: dailySales.cog,
        expense: expense,
        payroll: payroll,
        percentage: percentage.toFixed(2),
        profit: dailySales.profit,
      });

      totalSale += dailySales.sale;
      totalCOGS += dailySales.cog;
      totalExpense += expense;
      totalPayroll += payroll;
      totalProfit += dailySales.profit;
      totalInvoiceCount += dailySales.invoiceCount;
    });

    // Add totals row
    const totalOperationCost = totalExpense + totalPayroll;
    const totalPercentage = totalSale > 0 ? (totalOperationCost / totalSale) * 100 : 0;

    worksheet.addRow({});
    worksheet.addRow({
      date: "TOTAL",
      invoiceCount: totalInvoiceCount,
      sale: totalSale,
      cog: totalCOGS,
      expense: totalExpense,
      payroll: totalPayroll,
      percentage: totalPercentage.toFixed(2),
      profit: totalProfit,
    });

    // Style total row
    const lastRow = worksheet.rowCount;
    worksheet.getRow(lastRow).font = { bold: true };
    worksheet.getRow(lastRow).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFE0B2" },
    };

    // Format currency cells
    worksheet.getColumn(3).numFmt = '"$"#,##0.00';
    worksheet.getColumn(4).numFmt = '"$"#,##0.00';
    worksheet.getColumn(5).numFmt = '"$"#,##0.00';
    worksheet.getColumn(6).numFmt = '"$"#,##0.00';
    worksheet.getColumn(8).numFmt = '"$"#,##0.00';

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="operation-cost-sales-ratio-${new Date().toISOString().split('T')[0]}.xlsx"`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting operation cost sales ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
    });
  }
};

router.get("/", getOperationCostSalesRatio);
router.get("/export", exportOperationCostSalesRatio);

export default router;