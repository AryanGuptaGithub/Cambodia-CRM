import mongoose from "mongoose";
import express from "express";
import Expense from "../../models/expenses/addExpense.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import ExpenseCategory from "../../models/expenses/addExpenseCategary.js";
import ExcelJS from "exceljs";

const router = express.Router();

const getTourExpenseSalesRatio = async (req, res) => {
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
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        };
        break;

      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: firstDay,
            $lte: lastDay,
          },
        };
        break;

      case "janToPreviousMonth":
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0);
        lastMonthLastDay.setHours(23, 59, 59, 999);
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
    if (search && search.trim() !== "") {
      salesQuery.$or = [
        { invoiceNumber: { $regex: search.trim(), $options: "i" } },
        { customerName: { $regex: search.trim(), $options: "i" } },
        { customerCode: { $regex: search.trim(), $options: "i" } },
        { mrName: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (Object.keys(dateQuery).length > 0) {
      salesQuery.recordingDate = dateQuery.recordingDate;
    }

    const totalSalesCount = await SaleSummary.countDocuments(salesQuery);
    const allSales = await SaleSummary.find(salesQuery)
      .sort({ recordingDate: -1 });

    if (allSales.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            tourExpense: 0,
            totalSales: 0,
            totalProfit: 0,
            ratio: 0,
          },
          records: [],
          totals: {
            totalSale: 0,
            totalCOG: 0,
            totalTourExpense: 0,
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

    // Get the overall date range for tour expenses
    const earliestDate = new Date(Math.min(...allSales.map(s => s.recordingDate.getTime())));
    const latestDate = new Date(Math.max(...allSales.map(s => s.recordingDate.getTime())));
    
    earliestDate.setHours(0, 0, 0, 0);
    latestDate.setHours(23, 59, 59, 999);

    // Find tour categories
    const tourCategories = await ExpenseCategory.find({
      category: { $regex: /tour/i }
    }).select('_id category');

    const tourCategoryIds = tourCategories.map(cat => cat._id);

    // Build expense query - get expenses for the ENTIRE selected period
    let expenseQuery = {
      date: {
        $gte: earliestDate,
        $lte: latestDate,
      }
    };

    // Create conditions array for $or
    const orConditions = [];

    // Add category filter if tour categories exist
    if (tourCategoryIds.length > 0) {
      orConditions.push({ 
        category: { 
          $in: tourCategoryIds
        } 
      });
    }

    // Add remarks filter
    orConditions.push({ 
      remarks: { 
        $regex: /tour/i
      } 
    });

    // Only add $or if we have conditions
    if (orConditions.length > 0) {
      expenseQuery.$or = orConditions;
    }

    // Fetch tour expenses for the period
    const expenses = await Expense.find(expenseQuery).populate('category', 'category');

    // Group sales by date
    const salesByDate = {};
    allSales.forEach(sale => {
      if (sale.recordingDate) {
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
        const profit = sale.totalProfitLoss || 0;
        const cogs = (sale.totalAmount || 0) - profit;
        
        salesByDate[dateStr].sale += sale.totalAmount || 0;
        salesByDate[dateStr].cog += cogs;
        salesByDate[dateStr].profit += profit;
        salesByDate[dateStr].invoiceCount++;
        salesByDate[dateStr].invoices.push(sale.invoiceNumber || 'Unknown');
      }
    });

    // Get unique dates and sort them
    const uniqueDates = Object.keys(salesByDate).sort((a, b) => 
      new Date(b) - new Date(a)
    );

    // Calculate total tour expenses for the period
    let totalTourExpensesAmount = 0;
    expenses.forEach(expense => {
      totalTourExpensesAmount += expense.amount || 0;
    });

    // Calculate total sales for the period
    let totalSalesForPeriod = 0;
    Object.values(salesByDate).forEach(daily => {
      totalSalesForPeriod += daily.sale;
    });

    // NEW LOGIC: Distribute tour expenses across sales days based on sales proportion
    const tourExpensesByDate = {};
    
    if (totalSalesForPeriod > 0 && totalTourExpensesAmount > 0) {
      // Distribute tour expenses proportionally based on each day's sales
      Object.keys(salesByDate).forEach(dateStr => {
        const dailySales = salesByDate[dateStr];
        const dailyProportion = dailySales.sale / totalSalesForPeriod;
        const allocatedTourExpense = totalTourExpensesAmount * dailyProportion;
        
        tourExpensesByDate[dateStr] = allocatedTourExpense;
      });
    }

    // Paginate the aggregated dates
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
    let totalTourExpense = 0;
    let totalProfit = 0;
    let totalInvoiceCount = 0;

    paginatedDates.forEach(dateStr => {
      const dailySales = salesByDate[dateStr];
      const tourExpense = tourExpensesByDate[dateStr] || 0;
      const percentage = dailySales.sale > 0 ? (tourExpense / dailySales.sale) * 100 : 0;

      const record = {
        date: dateStr,
        sale: dailySales.sale,
        cog: dailySales.cog,
        tourExpense: parseFloat(tourExpense.toFixed(2)),
        percentage: parseFloat(percentage.toFixed(2)),
        profit: dailySales.profit,
        invoiceCount: dailySales.invoiceCount,
      };

      records.push(record);

      totalSale += dailySales.sale;
      totalCOGS += dailySales.cog;
      totalTourExpense += tourExpense;
      totalProfit += dailySales.profit;
      totalInvoiceCount += dailySales.invoiceCount;
    });

    // Calculate summary for ALL data
    let grandTotalSale = 0;
    let grandTotalCOGS = 0;
    let grandTotalProfit = 0;
    
    Object.values(salesByDate).forEach(daily => {
      grandTotalSale += daily.sale;
      grandTotalCOGS += daily.cog;
      grandTotalProfit += daily.profit;
    });

    const grandTotalTourExpense = totalTourExpensesAmount;
    const ratio = grandTotalSale > 0 ? grandTotalTourExpense / grandTotalSale : 0;

    const summary = {
      tourExpense: parseFloat(grandTotalTourExpense.toFixed(2)),
      totalSales: parseFloat(grandTotalSale.toFixed(2)),
      totalProfit: parseFloat(grandTotalProfit.toFixed(2)),
      ratio: parseFloat(ratio.toFixed(4)),
    };

    const totals = {
      totalSale: parseFloat(grandTotalSale.toFixed(2)),
      totalCOG: parseFloat(grandTotalCOGS.toFixed(2)),
      totalTourExpense: parseFloat(grandTotalTourExpense.toFixed(2)),
      totalProfit: parseFloat(grandTotalProfit.toFixed(2)),
      totalSaleCount: totalSalesCount,
    };

    const response = {
      success: true,
      data: {
        summary,
        records,
        totals,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalDateRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching tour expense sales ratio:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

const exportTourExpenseSalesRatio = async (req, res) => {
  try {
    const { search = "", dateFilter = "currentMonth", startDate, endDate } = req.query;

    // Build date filter
    let dateQuery = {};
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (dateFilter) {
      case "today":
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        };
        break;

      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        lastDay.setHours(23, 59, 59, 999);
        dateQuery = {
          recordingDate: {
            $gte: firstDay,
            $lte: lastDay,
          },
        };
        break;

      case "janToPreviousMonth":
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0);
        lastMonthLastDay.setHours(23, 59, 59, 999);
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
    if (search && search.trim() !== "") {
      salesQuery.$or = [
        { invoiceNumber: { $regex: search.trim(), $options: "i" } },
        { customerName: { $regex: search.trim(), $options: "i" } },
        { customerCode: { $regex: search.trim(), $options: "i" } },
        { mrName: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (Object.keys(dateQuery).length > 0) {
      salesQuery.recordingDate = dateQuery.recordingDate;
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

    // Find tour categories
    const tourCategories = await ExpenseCategory.find({
      category: { $regex: /tour/i }
    }).select('_id');

    const tourCategoryIds = tourCategories.map(cat => cat._id);

    // Build expense query
    let expenseQuery = {
      date: {
        $gte: earliestDate,
        $lte: latestDate,
      },
      $or: []
    };

    if (tourCategoryIds.length > 0) {
      expenseQuery.$or.push({ 
        category: { 
          $in: tourCategoryIds
        } 
      });
    }

    expenseQuery.$or.push({ 
      remarks: { 
        $regex: /tour/i
      } 
    });

    // Fetch tour expenses
    const expenses = await Expense.find(expenseQuery);

    // Group sales by date
    const salesByDate = {};
    sales.forEach(sale => {
      if (sale.recordingDate) {
        const dateStr = sale.recordingDate.toISOString().split('T')[0];
        if (!salesByDate[dateStr]) {
          salesByDate[dateStr] = {
            sale: 0,
            cog: 0,
            profit: 0,
            invoiceCount: 0,
          };
        }
        const profit = sale.totalProfitLoss || 0;
        const cogs = (sale.totalAmount || 0) - profit;
        
        salesByDate[dateStr].sale += sale.totalAmount || 0;
        salesByDate[dateStr].cog += cogs;
        salesByDate[dateStr].profit += profit;
        salesByDate[dateStr].invoiceCount++;
      }
    });

    // Calculate total tour expenses and total sales
    let totalTourExpensesAmount = 0;
    expenses.forEach(expense => {
      totalTourExpensesAmount += expense.amount || 0;
    });

    let totalSalesForPeriod = 0;
    Object.values(salesByDate).forEach(daily => {
      totalSalesForPeriod += daily.sale;
    });

    // Distribute tour expenses across sales days based on sales proportion
    const tourExpensesByDate = {};
    
    if (totalSalesForPeriod > 0 && totalTourExpensesAmount > 0) {
      Object.keys(salesByDate).forEach(dateStr => {
        const dailySales = salesByDate[dateStr];
        const dailyProportion = dailySales.sale / totalSalesForPeriod;
        const allocatedTourExpense = totalTourExpensesAmount * dailyProportion;
        
        tourExpensesByDate[dateStr] = allocatedTourExpense;
      });
    }

    // Get unique dates
    const uniqueDates = Object.keys(salesByDate).sort((a, b) => 
      new Date(b) - new Date(a)
    );

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tour Expense Sales Ratio");

    // Add headers
    worksheet.columns = [
      { header: "Date", key: "date", width: 12 },
      { header: "No. of Invoices", key: "invoiceCount", width: 15 },
      { header: "Sale ($)", key: "sale", width: 15 },
      { header: "COG ($)", key: "cog", width: 15 },
      { header: "Tour Expense ($)", key: "tourExpense", width: 18 },
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
    let totalTourExpense = 0;
    let totalProfit = 0;
    let totalInvoiceCount = 0;

    uniqueDates.forEach(dateStr => {
      const dailySales = salesByDate[dateStr];
      const tourExpense = tourExpensesByDate[dateStr] || 0;
      const percentage = dailySales.sale > 0 ? (tourExpense / dailySales.sale) * 100 : 0;

      worksheet.addRow({
        date: dateStr,
        invoiceCount: dailySales.invoiceCount,
        sale: dailySales.sale,
        cog: dailySales.cog,
        tourExpense: tourExpense,
        percentage: percentage.toFixed(2),
        profit: dailySales.profit,
      });

      totalSale += dailySales.sale;
      totalCOGS += dailySales.cog;
      totalTourExpense += tourExpense;
      totalProfit += dailySales.profit;
      totalInvoiceCount += dailySales.invoiceCount;
    });

    // Add totals row
    const totalPercentage = totalSale > 0 ? (totalTourExpense / totalSale) * 100 : 0;

    worksheet.addRow({});
    worksheet.addRow({
      date: "TOTAL",
      invoiceCount: totalInvoiceCount,
      sale: totalSale,
      cog: totalCOGS,
      tourExpense: totalTourExpense,
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
    worksheet.getColumn(7).numFmt = '"$"#,##0.00';

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    
    const filenameDate = new Date().toISOString().split('T')[0];
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tour-expense-sales-ratio-${filenameDate}.xlsx"`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting tour expense sales ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
    });
  }
};

// Corrected router mappings to match the base path "/api/reports/tour-expense-sales"
router.get("/", getTourExpenseSalesRatio);
router.get("/export", exportTourExpenseSalesRatio);

export default router;