import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import PurchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import Expense from "../../models/expenses/addExpense.js";
import Payroll from "../../models/Hrm/Payroll.js";
import mongoose from "mongoose";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to get date ranges
const getDateRange = (dateFilter = "currentMonth") => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  switch(dateFilter) {
    case 'today':
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        startDate: today,
        endDate: tomorrow
      };
      
    case 'currentMonth':
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      lastDay.setHours(23, 59, 59, 999);
      return {
        startDate: firstDay,
        endDate: lastDay
      };
      
    case 'janToPreviousMonth':
      if (month === 0) {
        // If January, use previous year
        return {
          startDate: new Date(year - 1, 0, 1),
          endDate: new Date(year - 1, 11, 31, 23, 59, 59, 999)
        };
      } else {
        return {
          startDate: new Date(year, 0, 1),
          endDate: new Date(year, month, 0, 23, 59, 59, 999)
        };
      }
      
    case 'all':
      return {
        startDate: null,
        endDate: null
      };
      
    default:
      const defaultFirstDay = new Date(year, month, 1);
      const defaultLastDay = new Date(year, month + 1, 0);
      defaultLastDay.setHours(23, 59, 59, 999);
      return {
        startDate: defaultFirstDay,
        endDate: defaultLastDay
      };
  }
};

// Calculate COGS from purchase inventories - CORRECTED VERSION
const calculateCOGS = async (startDate, endDate) => {
  try {
    const matchConditions = {};
    
    if (startDate && endDate) {
      matchConditions.invoiceDate = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    const purchases = await PurchaseInventory.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } 
          },
          totalCOGS: { $sum: "$totalAmount" },
          productCount: { $sum: 1 }
        }
      }
    ]);
    
    // Sum total COGS
    const totalCOGS = purchases.reduce((sum, purchase) => sum + (purchase.totalCOGS || 0), 0);
    
    // Return daily breakdown
    const dailyCOGS = {};
    purchases.forEach(purchase => {
      dailyCOGS[purchase._id] = purchase.totalCOGS || 0;
    });
    
    return { totalCOGS, dailyCOGS };
    
  } catch (error) {
    console.error("Error calculating COGS:", error);
    return { totalCOGS: 0, dailyCOGS: {} };
  }
};

// Calculate COGS based on sale quantity (simplified average cost method)
const calculateCOGSFromSales = async (startDate, endDate) => {
  try {
    // First, get purchase data to calculate average cost
    const purchaseMatch = {};
    if (startDate && endDate) {
      purchaseMatch.invoiceDate = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    const purchases = await PurchaseInventory.aggregate([
      { $match: purchaseMatch },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.productId",
          totalQuantity: { $sum: "$products.quantity" },
          totalCost: { $sum: { $multiply: ["$products.quantity", "$products.unitPrice"] } },
          avgUnitCost: { $avg: "$products.unitPrice" }
        }
      }
    ]);
    
    // Create a map of productId to average unit cost
    const productCostMap = {};
    purchases.forEach(purchase => {
      productCostMap[purchase._id] = purchase.totalQuantity > 0 
        ? purchase.totalCost / purchase.totalQuantity 
        : purchase.avgUnitCost || 0;
    });
    
    // Now get sales data
    const salesMatch = {};
    if (startDate && endDate) {
      salesMatch.recordingDate = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    const sales = await SaleSummary.aggregate([
      { $match: salesMatch },
      { $unwind: "$products" },
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" } 
          },
          totalSales: { 
            $sum: { 
              $multiply: ["$products.quantity", "$products.unitPrice"] 
            } 
          },
          totalSaleQuantity: { $sum: "$products.quantity" },
          totalCOGS: {
            $sum: {
              $cond: [
                { $and: [
                  { $ne: ["$products.productId", null] },
                  { $ne: ["$products.productId", undefined] }
                ]},
                { 
                  $multiply: [
                    "$products.quantity",
                    { 
                      $ifNull: [
                        productCostMap["$products.productId"],
                        { $avg: "$products.unitPrice" } // Fallback if no purchase data
                      ]
                    }
                  ]
                },
                0 // If productId is null or undefined
              ]
            }
          },
          saleCount: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    const dailyData = {};
    let totalSales = 0;
    let totalSaleQuantity = 0;
    let totalCOGS = 0;
    
    sales.forEach(sale => {
      dailyData[sale._id] = {
        salesAmount: sale.totalSales || 0,
        saleQuantity: sale.totalSaleQuantity || 0,
        cogs: sale.totalCOGS || 0,
        saleCount: sale.saleCount || 0
      };
      
      totalSales += sale.totalSales || 0;
      totalSaleQuantity += sale.totalSaleQuantity || 0;
      totalCOGS += sale.totalCOGS || 0;
    });
    
    return { 
      dailyData, 
      totals: { totalSales, totalSaleQuantity, totalCOGS } 
    };
    
  } catch (error) {
    console.error("Error calculating COGS from sales:", error);
    return { dailyData: {}, totals: { totalSales: 0, totalSaleQuantity: 0, totalCOGS: 0 } };
  }
};

// Calculate Operation Cost (Expenses + Payroll)
const calculateOperationCost = async (startDate, endDate) => {
  try {
    // Match conditions for both expenses and payroll
    const expenseMatchConditions = {};
    const payrollMatchConditions = {};
    
    if (startDate && endDate) {
      expenseMatchConditions.date = {
        $gte: startDate,
        $lte: endDate
      };
      
      // For payroll, we need to match by period
      const periods = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      let current = new Date(start.getFullYear(), start.getMonth(), 1);
      while (current <= end) {
        const year = current.getFullYear();
        const month = (current.getMonth() + 1).toString().padStart(2, '0');
        periods.push(`${year}-${month}`);
        current.setMonth(current.getMonth() + 1);
      }
      
      if (periods.length > 0) {
        payrollMatchConditions.period = { $in: periods };
      }
    }
    
    // Get daily expenses
    const dailyExpenses = await Expense.aggregate([
      { $match: expenseMatchConditions },
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$date" } 
          },
          totalExpense: { $sum: "$amount" }
        }
      }
    ]);
    
    // Get payroll data grouped by employee and date
    const payrollAggregate = await Payroll.aggregate([
      { $match: payrollMatchConditions },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            employeeId: "$employeeId"
          },
          totalSalary: { $sum: "$basicSalary" },
          totalAllowance: { $sum: "$totalAllowance" },
          netSalary: { $sum: "$netSalary" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          totalPayroll: { $sum: { $add: ["$totalSalary", "$totalAllowance"] } }
        }
      }
    ]);
    
    // Combine daily expenses and payroll
    const dailyOperationCost = {};
    let totalOperationCost = 0;
    
    // Add expenses
    dailyExpenses.forEach(expense => {
      dailyOperationCost[expense._id] = (dailyOperationCost[expense._id] || 0) + (expense.totalExpense || 0);
      totalOperationCost += expense.totalExpense || 0;
    });
    
    // Add payroll
    payrollAggregate.forEach(payroll => {
      dailyOperationCost[payroll._id] = (dailyOperationCost[payroll._id] || 0) + (payroll.totalPayroll || 0);
      totalOperationCost += payroll.totalPayroll || 0;
    });
    
    return { totalOperationCost, dailyOperationCost };
    
  } catch (error) {
    console.error("Error calculating operation cost:", error);
    return { totalOperationCost: 0, dailyOperationCost: {} };
  }
};

// Get sales data for daily breakdown
const getSalesData = async (startDate, endDate) => {
  try {
    const matchConditions = {};
    
    if (startDate && endDate) {
      matchConditions.recordingDate = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    const sales = await SaleSummary.aggregate([
      { $match: matchConditions },
      {
        $group: {
          _id: { 
            $dateToString: { format: "%Y-%m-%d", date: "$recordingDate" } 
          },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfitLoss" },
          saleCount: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);
    
    const dailySales = {};
    sales.forEach(sale => {
      dailySales[sale._id] = {
        totalSales: sale.totalSales || 0,
        totalProfit: sale.totalProfit || 0,
        saleCount: sale.saleCount || 0
      };
    });
    
    return dailySales;
    
  } catch (error) {
    console.error("Error getting sales data:", error);
    return {};
  }
};

// Main function to fetch operation cost COGS data with both calculation methods
const fetchOperationCostCOGSData = async (params) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      startDate,
      endDate,
      dateFilter = "currentMonth",
      export: isExport = false,
      useSaleBasedCOGS = true // New parameter to choose calculation method
    } = params;
    
    const pageNum = parseInt(page);
    const limitNum = isExport ? 10000 : parseInt(limit);
    const skip = isExport ? 0 : (pageNum - 1) * limitNum;
    
    // Determine date range
    let dateRange;
    if (startDate && endDate) {
      dateRange = {
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      };
    } else {
      dateRange = getDateRange(dateFilter);
    }
    
    // Fetch all data based on chosen method
    let cogsData, operationCostData, salesData;
    
    if (useSaleBasedCOGS) {
      // Use sale-based COGS calculation
      [cogsData, operationCostData, salesData] = await Promise.all([
        calculateCOGSFromSales(dateRange.startDate, dateRange.endDate),
        calculateOperationCost(dateRange.startDate, dateRange.endDate),
        getSalesData(dateRange.startDate, dateRange.endDate)
      ]);
    } else {
      // Use original purchase-based COGS calculation
      [cogsData, operationCostData, salesData] = await Promise.all([
        calculateCOGS(dateRange.startDate, dateRange.endDate),
        calculateOperationCost(dateRange.startDate, dateRange.endDate),
        getSalesData(dateRange.startDate, dateRange.endDate)
      ]);
    }
    
    // Calculate summary based on chosen method
    let summary, allDates, tableData;
    
    if (useSaleBasedCOGS) {
      // Using sale-based COGS
      const { totals: cogsTotals, dailyData: cogsDailyData } = cogsData;
      
      // Calculate profit metrics
      const grossProfit = cogsTotals.totalSales - cogsTotals.totalCOGS;
      const netProfit = grossProfit - operationCostData.totalOperationCost;
      const grossProfitMargin = cogsTotals.totalSales > 0 ? (grossProfit / cogsTotals.totalSales) * 100 : 0;
      const netProfitMargin = cogsTotals.totalSales > 0 ? (netProfit / cogsTotals.totalSales) * 100 : 0;
      const operationCostCOGSRatio = cogsTotals.totalCOGS > 0 ? (operationCostData.totalOperationCost / cogsTotals.totalCOGS) * 100 : 0;
      
      summary = {
        totalSales: parseFloat(cogsTotals.totalSales.toFixed(2)),
        totalSaleQuantity: cogsTotals.totalSaleQuantity,
        totalCOGS: parseFloat(cogsTotals.totalCOGS.toFixed(2)),
        totalExpenses: parseFloat(operationCostData.totalOperationCost.toFixed(2)),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        grossProfitMargin: parseFloat(grossProfitMargin.toFixed(2)),
        netProfitMargin: parseFloat(netProfitMargin.toFixed(2)),
        operationCostCOGSRatio: parseFloat(operationCostCOGSRatio.toFixed(2))
      };
      
      // Get all unique dates
      allDates = new Set([
        ...Object.keys(cogsDailyData),
        ...Object.keys(operationCostData.dailyOperationCost),
        ...Object.keys(salesData)
      ]);
      
      // Create table data
      const allDatesArray = Array.from(allDates).sort();
      tableData = [];
      
      allDatesArray.forEach((date, index) => {
        const saleData = cogsDailyData[date] || {};
        const salesAmount = saleData.salesAmount || 0;
        const saleQuantity = saleData.saleQuantity || 0;
        const cogs = saleData.cogs || 0;
        const expense = operationCostData.dailyOperationCost[date] || 0;
        
        // Calculate metrics
        const grossProfit = salesAmount - cogs;
        const profitMargin = salesAmount > 0 ? (grossProfit / salesAmount) * 100 : 0;
        const avgUnitCost = saleQuantity > 0 ? (cogs / saleQuantity) : 0;
        const ocCogsRatio = cogs > 0 ? (expense / cogs) * 100 : 0;
        
        tableData.push({
          id: index + 1,
          date: date,
          salesAmount: parseFloat(salesAmount.toFixed(2)),
          saleQuantity: saleQuantity,
          avgUnitCost: parseFloat(avgUnitCost.toFixed(2)),
          cogs: parseFloat(cogs.toFixed(2)),
          expenses: parseFloat(expense.toFixed(2)),
          grossProfit: parseFloat(grossProfit.toFixed(2)),
          profitMargin: parseFloat(profitMargin.toFixed(2)),
          ocCogsRatio: parseFloat(ocCogsRatio.toFixed(2))
        });
      });
    } else {
      // Using original purchase-based COGS
      const totalCOGS = cogsData.totalCOGS || 0;
      const totalSales = Object.values(salesData).reduce((sum, sale) => sum + (sale.totalSales || 0), 0);
      const totalExpenses = operationCostData.totalOperationCost || 0;
      
      summary = {
        operationCost: parseFloat(totalExpenses.toFixed(2)),
        cogs: parseFloat(totalCOGS.toFixed(2)),
        ratio: totalCOGS > 0 ? parseFloat((totalExpenses / totalCOGS).toFixed(4)) : 0,
        totalSales: parseFloat(totalSales.toFixed(2)),
        totalExpenses: parseFloat(totalExpenses.toFixed(2))
      };
      
      // Get all unique dates
      allDates = new Set([
        ...Object.keys(cogsData.dailyCOGS),
        ...Object.keys(operationCostData.dailyOperationCost),
        ...Object.keys(salesData)
      ]);
      
      // Create table data
      const allDatesArray = Array.from(allDates).sort();
      tableData = [];
      
      allDatesArray.forEach((date, index) => {
        const sale = salesData[date]?.totalSales || 0;
        const cog = cogsData.dailyCOGS[date] || 0;
        const expense = operationCostData.dailyOperationCost[date] || 0;
        const percentage = cog > 0 ? (expense / cog) * 100 : 0;
        
        tableData.push({
          id: index + 1,
          date: date,
          sale: parseFloat(sale.toFixed(2)),
          cog: parseFloat(cog.toFixed(2)),
          expense: parseFloat(expense.toFixed(2)),
          percentage: parseFloat(percentage.toFixed(2))
        });
      });
    }
    
    // Apply pagination if not exporting
    let paginatedData = tableData;
    if (!isExport) {
      paginatedData = tableData.slice(skip, skip + limitNum);
    }
    
    // Calculate totals for paginated data
    let totals;
    if (useSaleBasedCOGS) {
      totals = paginatedData.reduce(
        (acc, record) => {
          acc.totalSales += record.salesAmount;
          acc.totalSaleQuantity += record.saleQuantity;
          acc.totalCOGS += record.cogs;
          acc.totalExpenses += record.expenses;
          acc.totalGrossProfit += record.grossProfit;
          return acc;
        },
        { 
          totalSales: 0, 
          totalSaleQuantity: 0, 
          totalCOGS: 0, 
          totalExpenses: 0, 
          totalGrossProfit: 0 
        }
      );
    } else {
      totals = paginatedData.reduce(
        (acc, record) => {
          acc.totalSale += record.sale;
          acc.totalCOG += record.cog;
          acc.totalExpense += record.expense;
          return acc;
        },
        { totalSale: 0, totalCOG: 0, totalExpense: 0 }
      );
    }
    
    return {
      success: true,
      data: {
        summary,
        records: paginatedData,
        totals,
        filterInfo: {
          dateFilter,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          calculationMethod: useSaleBasedCOGS ? "sale_based" : "purchase_based"
        }
      },
      pagination: !isExport ? {
        currentPage: pageNum,
        totalPages: Math.ceil(tableData.length / limitNum),
        totalRecords: tableData.length,
        hasNext: pageNum < Math.ceil(tableData.length / limitNum),
        hasPrev: pageNum > 1,
      } : undefined
    };
    
  } catch (error) {
    console.error("Error in fetchOperationCostCOGSData:", error);
    throw error;
  }
};

// Main API endpoint
router.get("/operation-cost-cogs-ratio", async (req, res) => {
  try {    
    const result = await fetchOperationCostCOGSData({
      ...req.query,
      useSaleBasedCOGS: req.query.calculationMethod === 'sale_based'
    });
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

// Export endpoint - supports both calculation methods
router.get("/operation-cost-cogs-ratio/export", async (req, res) => {
  try {    
    const useSaleBasedCOGS = req.query.calculationMethod === 'sale_based';
    
    const result = await fetchOperationCostCOGSData({
      ...req.query,
      export: "true",
      limit: 10000,
      useSaleBasedCOGS
    });
    
    if (!result.success) {
      throw new Error("Failed to fetch data for export");
    }
    
    const { summary, records, totals, filterInfo } = result.data;
    const workbook = new ExcelJS.Workbook();
    const worksheetName = useSaleBasedCOGS 
      ? 'Profit & COGS Analysis Report' 
      : 'Operation Cost COGS Ratio Report';
    const worksheet = workbook.addWorksheet(worksheetName);
    
    if (useSaleBasedCOGS) {
      // Export for sale-based COGS calculation
      const titleRow = worksheet.addRow(['PROFIT & COGS ANALYSIS REPORT']);
      titleRow.font = { bold: true, size: 16, color: { argb: 'FF1E40AF' } };
      titleRow.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells('A1:J1');
      
      // Add filter info
      const periodInfo = [
        `Period: ${req.query.dateFilter || 'Current Month'}`,
        ...(req.query.startDate ? [`From: ${req.query.startDate}`] : []),
        ...(req.query.endDate ? [`To: ${req.query.endDate}`] : []),
        `Calculation: Sale-based COGS`
      ].join(' | ');
      
      const filterRow = worksheet.addRow([periodInfo]);
      filterRow.font = { italic: true };
      filterRow.alignment = { horizontal: 'center' };
      worksheet.mergeCells('A2:J2');
      worksheet.addRow([]);
      
      // Summary section
      const summaryHeader = worksheet.addRow(['FINANCIAL SUMMARY']);
      summaryHeader.font = { bold: true, size: 14, color: { argb: 'FF059669' } };
      summaryHeader.alignment = { horizontal: 'center' };
      worksheet.mergeCells('A4:J4');
      
      // Summary metrics in two columns
      worksheet.addRow([
        'Total Sales Revenue:', `$${summary.totalSales.toFixed(2)}`, 
        '', 
        'Total Sale Quantity:', summary.totalSaleQuantity.toLocaleString()
      ]);
      worksheet.addRow([
        'Total COGS (based on sales):', `$${summary.totalCOGS.toFixed(2)}`, 
        '', 
        'Avg Unit Cost:', summary.totalSaleQuantity > 0 ? `$${(summary.totalCOGS / summary.totalSaleQuantity).toFixed(2)}` : '$0.00'
      ]);
      worksheet.addRow([
        'Gross Profit:', `$${summary.grossProfit.toFixed(2)}`, 
        '', 
        'Gross Profit Margin:', `${summary.grossProfitMargin.toFixed(2)}%`
      ]);
      worksheet.addRow([
        'Total Expenses:', `$${summary.totalExpenses.toFixed(2)}`, 
        '', 
        'Net Profit Margin:', `${summary.netProfitMargin.toFixed(2)}%`
      ]);
      worksheet.addRow([
        'Net Profit:', `$${summary.netProfit.toFixed(2)}`, 
        '', 
        'OC/COGS Ratio:', `${summary.operationCostCOGSRatio.toFixed(2)}%`
      ]);
      
      // Format summary rows
      for (let i = 5; i <= 9; i++) {
        const row = worksheet.getRow(i);
        row.getCell(1).font = { bold: true };
        if (row.getCell(2).value && typeof row.getCell(2).value === 'string' && row.getCell(2).value.includes('$')) {
          // Already formatted
        } else if (row.getCell(2).value && typeof row.getCell(2).value === 'number') {
          row.getCell(2).numFmt = '$#,##0.00';
        }
        row.getCell(4).font = { bold: true };
      }
      
      worksheet.addRow([]);
      worksheet.addRow([]);
      
      // Table headers for sale-based COGS
      const headers = [
        'Sr.No', 
        'Date', 
        'Sales ($)', 
        'Sale Qty',
        'Avg Unit Cost ($)',
        'COGS ($)', 
        'Expenses ($)', 
        'Gross Profit ($)',
        'Profit Margin (%)',
        'OC/COGS Ratio (%)'
      ];
      
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Add data rows
      records.forEach((record, index) => {
        const row = worksheet.addRow([
          index + 1,
          record.date,
          record.salesAmount,
          record.saleQuantity,
          record.avgUnitCost,
          record.cogs,
          record.expenses,
          record.grossProfit,
          record.profitMargin / 100, // Convert to decimal for Excel
          record.ocCogsRatio / 100   // Convert to decimal for Excel
        ]);
        
        // Format currency columns
        [3, 6, 7, 8].forEach(colIndex => {
          row.getCell(colIndex).numFmt = '$#,##0.00';
        });
        
        // Format unit cost
        row.getCell(5).numFmt = '$#,##0.00';
        
        // Format sale quantity
        row.getCell(4).numFmt = '#,##0';
        
        // Format percentage columns
        [9, 10].forEach(colIndex => {
          row.getCell(colIndex).numFmt = '0.00%';
        });
        
        // Color coding for profit margin
        const profitMarginCell = row.getCell(9);
        if (record.profitMargin > 30) {
          profitMarginCell.font = { color: { argb: 'FF16A34A' }, bold: true };
        } else if (record.profitMargin > 15) {
          profitMarginCell.font = { color: { argb: 'FFCA8A04' } };
        } else if (record.profitMargin > 0) {
          profitMarginCell.font = { color: { argb: 'FFDC2626' } };
        } else {
          profitMarginCell.font = { color: { argb: 'FF991B1B' }, bold: true };
        }
        
        // Color coding for OC/COGS ratio
        const ocCogsCell = row.getCell(10);
        if (record.ocCogsRatio < 50) {
          ocCogsCell.font = { color: { argb: 'FF16A34A' }, bold: true };
        } else if (record.ocCogsRatio < 100) {
          ocCogsCell.font = { color: { argb: 'FFCA8A04' } };
        } else {
          ocCogsCell.font = { color: { argb: 'FFDC2626' }, bold: true };
        }
      });
      
      // Add totals row
      const totalsRow = worksheet.addRow([
        'TOTAL',
        '',
        totals.totalSales,
        totals.totalSaleQuantity,
        totals.totalSaleQuantity > 0 ? totals.totalCOGS / totals.totalSaleQuantity : 0,
        totals.totalCOGS,
        totals.totalExpenses,
        totals.totalGrossProfit,
        totals.totalSales > 0 ? totals.totalGrossProfit / totals.totalSales : 0,
        totals.totalCOGS > 0 ? totals.totalExpenses / totals.totalCOGS : 0
      ]);
      
      totalsRow.font = { bold: true };
      totalsRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }
      };
      
      // Format totals row
      [3, 6, 7, 8].forEach(colIndex => {
        totalsRow.getCell(colIndex).numFmt = '$#,##0.00';
      });
      totalsRow.getCell(4).numFmt = '#,##0';
      totalsRow.getCell(5).numFmt = '$#,##0.00';
      totalsRow.getCell(9).numFmt = '0.00%';
      totalsRow.getCell(10).numFmt = '0.00%';
      
      // Set column widths
      worksheet.columns = [
        { width: 8 },   // Sr.No
        { width: 12 },  // Date
        { width: 15 },  // Sales
        { width: 10 },  // Sale Qty
        { width: 15 },  // Avg Unit Cost
        { width: 15 },  // COGS
        { width: 15 },  // Expenses
        { width: 15 },  // Gross Profit
        { width: 15 },  // Profit Margin
        { width: 15 }   // OC/COGS Ratio
      ];
    } else {
      // Export for original purchase-based COGS calculation
      const titleRow = worksheet.addRow(['Operation Cost / COGS Ratio Report']);
      titleRow.font = { bold: true, size: 16 };
      titleRow.alignment = { horizontal: 'center' };
      worksheet.mergeCells('A1:F1');
      
      // Add filter info
      const periodInfo = [
        `Period: ${req.query.dateFilter || 'Current Month'}`,
        ...(req.query.startDate ? [`From: ${req.query.startDate}`] : []),
        ...(req.query.endDate ? [`To: ${req.query.endDate}`] : []),
        `Calculation: Purchase-based COGS`
      ].join(' | ');
      
      worksheet.addRow([periodInfo]);
      worksheet.addRow([]);
      
      // Summary section
      const summaryRow = worksheet.addRow(['Summary']);
      summaryRow.font = { bold: true, size: 14 };
      worksheet.mergeCells('A4:F4');
      
      worksheet.addRow(['Total Operation Cost', `$${summary.operationCost.toFixed(2)}`]);
      worksheet.addRow(['Total COGS', `$${summary.cogs.toFixed(2)}`]);
      worksheet.addRow(['Operation Cost/COGS Ratio', summary.ratio.toFixed(4)]);
      worksheet.addRow(['Total Sales', `$${summary.totalSales.toFixed(2)}`]);
      worksheet.addRow(['Total Expenses', `$${summary.totalExpenses.toFixed(2)}`]);
      worksheet.addRow([]);
      
      // Table headers
      worksheet.addRow(['Sr', 'Date', 'Sale ($)', 'COG ($)', 'Expense ($)', 'Percentage (%)']);
      const headerRow = worksheet.lastRow;
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' }
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Add data rows
      records.forEach((record) => {
        const row = worksheet.addRow([
          record.id,
          record.date,
          record.sale,
          record.cog,
          record.expense,
          record.percentage
        ]);
        
        // Format currency columns
        const currencyColumns = [3, 4, 5]; // Sale, COG, Expense columns (1-based index)
        currencyColumns.forEach(colIndex => {
          const cell = row.getCell(colIndex);
          cell.numFmt = '$#,##0.00';
        });
        
        // Format percentage column
        const percentageCell = row.getCell(6);
        percentageCell.numFmt = '0.00%';
        
        // Add color coding for percentage
        if (record.percentage < 10) {
          percentageCell.font = { color: { argb: 'FF16A34A' } }; // Green
        } else if (record.percentage < 20) {
          percentageCell.font = { color: { argb: 'FFCA8A04' } }; // Yellow
        } else {
          percentageCell.font = { color: { argb: 'FFDC2626' } }; // Red
        }
      });
      
      // Add totals row
      const totalsRow = worksheet.addRow([
        'TOTAL',
        '',
        totals.totalSale,
        totals.totalCOG,
        totals.totalExpense,
        totals.totalCOG > 0 ? (totals.totalExpense / totals.totalCOG) * 100 : 0
      ]);
      
      totalsRow.font = { bold: true };
      totalsRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }
      };
      
      // Format totals row
      const totalsCurrencyColumns = [3, 4, 5];
      totalsCurrencyColumns.forEach(colIndex => {
        const cell = totalsRow.getCell(colIndex);
        cell.numFmt = '$#,##0.00';
      });
      
      const totalsPercentageCell = totalsRow.getCell(6);
      totalsPercentageCell.numFmt = '0.00%';
      
      // Set column widths
      worksheet.columns = [
        { width: 10 }, // Sr
        { width: 15 }, // Date
        { width: 15 }, // Sale
        { width: 15 }, // COG
        { width: 15 }, // Expense
        { width: 15 }  // Percentage
      ];
    }
    
    worksheet.addRow([]);
    
    // Add generated timestamp
    const timestampRow = worksheet.addRow([
      `Report Generated: ${new Date().toLocaleString()} | Total Records: ${records.length}`
    ]);
    timestampRow.font = { italic: true };
    timestampRow.alignment = { horizontal: 'center' };
    worksheet.mergeCells(`A${timestampRow.number}:${useSaleBasedCOGS ? 'J' : 'F'}${timestampRow.number}`);
    
    // Center align all cells
    worksheet.eachRow((row) => {
      row.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const method = useSaleBasedCOGS ? 'sale-based' : 'purchase-based';
    const filename = `operation-cost-cogs-ratio-${method}-${timestamp}.xlsx`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Write to response
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