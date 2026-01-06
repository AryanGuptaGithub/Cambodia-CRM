import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";
import ExcelJS from 'exceljs';
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";

const router = express.Router();

const getYearMonthFromDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
};

const getPeriodsFromDateRange = (startDate, endDate) => {
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
  
  return periods;
};

const normalizeMrName = (name) => {
  if (!name) return "";
  
  let normalized = name
    .replace(/^(mr|mrs|ms|miss|dr|prof)\s+/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  if (normalized.includes('makara')) {
    normalized = 'makara';
  }
  
  if (normalized.includes('phanda')) {
    normalized = 'phanda';
  }
  
  return normalized;
};

const normalizeNameInJS = (name) => {
  if (!name) return "";
  
  let normalized = name.toLowerCase().trim();
  
  const prefixes = ['mr ', 'mrs ', 'ms ', 'miss ', 'dr ', 'prof '];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  if (normalized.includes('makara')) {
    normalized = 'makara';
  }
  
  if (normalized.includes('phanda')) {
    normalized = 'phanda';
  }
  
  return normalized;
};

const calculateSalarySaleRatio = (profit, totalExpense) => {
  if (totalExpense === 0) return 0;
  return ((profit - totalExpense) / totalExpense) * 100;
};

const calculatePerformance = (profit, totalExpense) => {
  if (totalExpense === 0) return profit > 0 ? 1000 : 0;
  return (profit / totalExpense) * 100;
};

const fetchSalesSalaryData = async (params) => {
  try {
    const { 
      page = 1, 
      limit = 120, 
      search = "",
      startDate,
      endDate,
      period,
      dateFilter = "currentMonth",
      export: isExport = false
    } = params;
    
    const pageNum = parseInt(page);
    const limitNum = isExport ? 10000 : parseInt(limit);
    const skip = isExport ? 0 : (pageNum - 1) * limitNum;
    
    const salesDateConditions = {};
    
    if (startDate && endDate) {
      salesDateConditions.recordingDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      
      switch(dateFilter) {
        case 'today':
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          salesDateConditions.recordingDate = {
            $gte: today,
            $lt: tomorrow
          };
          break;
          
        case 'currentMonth':
          const firstDay = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);
          salesDateConditions.recordingDate = {
            $gte: firstDay,
            $lte: lastDay
          };
          break;
          
        case 'janToPreviousMonth':
          const currentMonth = now.getMonth();
          if (currentMonth === 0) {
            salesDateConditions.recordingDate = {
              $gte: new Date(year - 1, 0, 1),
              $lte: new Date(year - 1, 11, 31)
            };
          } else {
            salesDateConditions.recordingDate = {
              $gte: new Date(year, 0, 1),
              $lte: new Date(year, currentMonth, 0)
            };
          }
          break;
          
        case 'all':
          break;
          
        default:
          const defaultFirstDay = new Date(year, month, 1);
          const defaultLastDay = new Date(year, month + 1, 0);
          salesDateConditions.recordingDate = {
            $gte: defaultFirstDay,
            $lte: defaultLastDay
          };
      }
    }

    const salesMatchConditions = { ...salesDateConditions };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      salesMatchConditions.mrName = searchRegex;
    }

    const allSalesForSummary = await SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          totalProfit: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }] }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$totalProfit" },
          saleCount: { $sum: 1 }
        }
      }
    ]);

    const totalSalesFromAllRecords = allSalesForSummary[0]?.totalSales || 0;
    const totalProfitFromAllRecords = allSalesForSummary[0]?.totalProfit || 0;

    const salesAggregate = await SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          saleProfit: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: { $add: ["$$value", { $ifNull: ["$$this.profitLoss", 0] }] }
            }
          }
        }
      },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId",
          },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$saleProfit" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
          lastSaleDate: { $max: "$recordingDate" }
        },
      },
      {
        $project: {
          _id: 0,
          mrName: "$_id.mrName",
          mrId: "$_id.mrId",
          sale: "$totalSales",
          profit: "$totalProfit",
          saleCount: 1,
          customerCount: { $size: "$customers" },
          lastSaleDate: 1
        },
      },
      { $sort: { sale: -1 } }
    ]);

    const groupedSales = {};
    salesAggregate.forEach(record => {
      const normalizedName = normalizeNameInJS(record.mrName);
      
      if (!groupedSales[normalizedName]) {
        groupedSales[normalizedName] = {
          normalizedName: normalizedName,
          mrName: record.mrName,
          mrId: record.mrId,
          originalNames: [record.mrName],
          sale: parseFloat(record.sale) || 0,
          profit: parseFloat(record.profit) || 0,
          saleCount: parseInt(record.saleCount) || 0,
          customerCount: parseInt(record.customerCount) || 0,
          lastSaleDate: record.lastSaleDate,
          records: [record]
        };
      } else {
        groupedSales[normalizedName].sale += parseFloat(record.sale) || 0;
        groupedSales[normalizedName].profit += parseFloat(record.profit) || 0;
        groupedSales[normalizedName].saleCount += parseInt(record.saleCount) || 0;
        groupedSales[normalizedName].customerCount = Math.max(
          groupedSales[normalizedName].customerCount,
          parseInt(record.customerCount) || 0
        );
        
        if (record.lastSaleDate && (!groupedSales[normalizedName].lastSaleDate || 
            record.lastSaleDate > groupedSales[normalizedName].lastSaleDate)) {
          groupedSales[normalizedName].lastSaleDate = record.lastSaleDate;
        }
        
        if (record.mrName && !groupedSales[normalizedName].originalNames.includes(record.mrName)) {
          groupedSales[normalizedName].originalNames.push(record.mrName);
        }
        
        if (parseFloat(record.sale) > parseFloat(groupedSales[normalizedName].records[0].sale)) {
          groupedSales[normalizedName].mrName = record.mrName;
        }
        
        groupedSales[normalizedName].records.push(record);
      }
    });

    const salesAggregateGrouped = Object.values(groupedSales);

    const allStaffMembers = await Staff.find({}).select("_id medicalRepName employeeId");
    
    const staffMap = {
      idToName: {},
      nameToId: {},
      normalizedNameToId: {}
    };
    
    allStaffMembers.forEach((staff) => {
      const originalName = staff.medicalRepName;
      const staffId = staff._id.toString();
      
      if (originalName) {
        staffMap.idToName[staffId] = originalName;
        
        const normalizedStaffName = normalizeMrName(originalName);
        staffMap.normalizedNameToId[normalizedStaffName] = staffId;
        
        const simpleName = originalName.toLowerCase().trim();
        staffMap.nameToId[simpleName] = staffId;
      }
    });

    let payrollAggregate = [];
    
    const allStaffIds = allStaffMembers.map(s => new mongoose.Types.ObjectId(s._id));
    
    if (allStaffIds.length > 0) {
      const payrollMatchConditions = { employeeId: { $in: allStaffIds } };
      
      let payrollPeriods = [];
      
      if (period) {
        payrollMatchConditions.period = period;
        payrollPeriods = [period];
      } else if (startDate && endDate) {
        payrollPeriods = getPeriodsFromDateRange(startDate, endDate);
        payrollMatchConditions.period = { $in: payrollPeriods };
      } else {
        const now = new Date();
        const currentPeriod = getYearMonthFromDate(now);
        
        switch(dateFilter) {
          case 'today':
            payrollMatchConditions.period = currentPeriod;
            payrollPeriods = [currentPeriod];
            break;
            
          case 'currentMonth':
            payrollMatchConditions.period = currentPeriod;
            payrollPeriods = [currentPeriod];
            break;
            
          case 'janToPreviousMonth':
            if (now.getMonth() === 0) {
              const prevYear = now.getFullYear() - 1;
              payrollPeriods = [];
              for (let i = 1; i <= 12; i++) {
                payrollPeriods.push(`${prevYear}-${i.toString().padStart(2, '0')}`);
              }
            } else {
              const currentYear = now.getFullYear();
              payrollPeriods = [];
              for (let i = 1; i <= now.getMonth(); i++) {
                payrollPeriods.push(`${currentYear}-${i.toString().padStart(2, '0')}`);
              }
            }
            payrollMatchConditions.period = { $in: payrollPeriods };
            break;
            
          case 'all':
            break;
        }
      }
      
      payrollAggregate = await Payroll.aggregate([
        { $match: payrollMatchConditions },
        {
          $group: {
            _id: "$employeeId",
            salary: { $sum: "$basicSalary" },
            incentive: { $sum: { $ifNull: ["$incentive", 0] } },
            allowance: { $sum: { $ifNull: ["$totalAllowance", 0] } },
            tourExpense: { $sum: { $ifNull: ["$tourExpense", 0] } },
            otherExpense: { $sum: { $ifNull: ["$otherExpense", 0] } },
            payrollCount: { $sum: 1 }
          },
        },
      ]);
    }

    const totalPayrollSummary = payrollAggregate.reduce(
      (acc, payroll) => {
        return {
          totalSalary: acc.totalSalary + (parseFloat(payroll.salary) || 0),
          totalIncentive: acc.totalIncentive + (parseFloat(payroll.incentive) || 0),
          totalAllowance: acc.totalAllowance + (parseFloat(payroll.allowance) || 0),
          totalTourExpense: acc.totalTourExpense + (parseFloat(payroll.tourExpense) || 0),
          totalOtherExpense: acc.totalOtherExpense + (parseFloat(payroll.otherExpense) || 0),
        };
      },
      { 
        totalSalary: 0, 
        totalIncentive: 0, 
        totalAllowance: 0, 
        totalTourExpense: 0, 
        totalOtherExpense: 0 
      }
    );

    const totalExpenseFromAllRecords = 
      totalPayrollSummary.totalSalary +
      totalPayrollSummary.totalIncentive +
      totalPayrollSummary.totalAllowance +
      totalPayrollSummary.totalTourExpense +
      totalPayrollSummary.totalOtherExpense;

    const ratio = totalSalesFromAllRecords > 0 
      ? parseFloat((totalExpenseFromAllRecords / totalSalesFromAllRecords).toFixed(4))
      : 0;

    const summary = {
      totalSales: parseFloat(totalSalesFromAllRecords) || 0,
      totalSalary: parseFloat(totalPayrollSummary.totalSalary) || 0,
      totalExpense: parseFloat(totalExpenseFromAllRecords) || 0,
      totalProfit: parseFloat(totalProfitFromAllRecords) || 0,
      ratio: ratio,
    };

    const payrollByStaffId = {};
    payrollAggregate.forEach((p) => {
      payrollByStaffId[p._id.toString()] = p;
    });

    let combinedData = salesAggregateGrouped.map((record) => {
      let matchedStaffId = null;
      
      const normalizedSalesName = record.normalizedName;
      if (normalizedSalesName && staffMap.normalizedNameToId[normalizedSalesName]) {
        matchedStaffId = staffMap.normalizedNameToId[normalizedSalesName];
      }
      
      if (!matchedStaffId && normalizedSalesName) {
        for (const [staffNormalizedName, staffId] of Object.entries(staffMap.normalizedNameToId)) {
          if (staffNormalizedName.includes(normalizedSalesName) || 
              normalizedSalesName.includes(staffNormalizedName)) {
            matchedStaffId = staffId;
            break;
          }
        }
      }
      
      if (!matchedStaffId && record.originalNames && record.originalNames.length > 0) {
        for (const originalName of record.originalNames) {
          if (!originalName) continue;
          
          const simpleName = originalName.toLowerCase().trim();
          if (staffMap.nameToId[simpleName]) {
            matchedStaffId = staffMap.nameToId[simpleName];
            break;
          }
        }
      }
      
      let payroll = {};
      if (matchedStaffId) {
        payroll = payrollByStaffId[matchedStaffId] || {};
      }

      const salary = parseFloat(payroll.salary) || 0;
      const incentive = parseFloat(payroll.incentive) || 0;
      const allowance = parseFloat(payroll.allowance) || 0;
      const tourExpense = parseFloat(payroll.tourExpense) || 0;
      const otherExpense = parseFloat(payroll.otherExpense) || 0;
      const sale = parseFloat(record.sale) || 0;
      const profit = parseFloat(record.profit) || 0;

      const totalExpense = salary + incentive + allowance + tourExpense + otherExpense;
      
      const salarySaleRatio = calculateSalarySaleRatio(profit, totalExpense);
      const performance = calculatePerformance(profit, totalExpense);

      return {
        srDate: record.lastSaleDate || "",
        mrName: record.mrName || "",
        mrId: record.mrId || matchedStaffId || "",
        sale: sale,
        profit: profit,
        salary: salary,
        incentive: incentive,
        allowance: allowance,
        tourExpense: tourExpense,
        otherExpense: otherExpense,
        totalExpense: totalExpense,
        salarySaleRatio: parseFloat(salarySaleRatio.toFixed(2)),
        performance: parseFloat(performance.toFixed(2)),
        saleCount: parseInt(record.saleCount) || 0,
        customerCount: parseInt(record.customerCount) || 0,
      };
    });

    Object.keys(staffMap.normalizedNameToId).forEach(normalizedName => {
      const staffId = staffMap.normalizedNameToId[normalizedName];
      const payroll = payrollByStaffId[staffId];
      
      if (payroll && !combinedData.find(item => 
        normalizeNameInJS(item.mrName) === normalizedName)) {
        
        const salary = parseFloat(payroll.salary) || 0;
        const incentive = parseFloat(payroll.incentive) || 0;
        const allowance = parseFloat(payroll.allowance) || 0;
        const tourExpense = parseFloat(payroll.tourExpense) || 0;
        const otherExpense = parseFloat(payroll.otherExpense) || 0;
        const totalExpense = salary + incentive + allowance + tourExpense + otherExpense;
        
        const staffEntry = allStaffMembers.find(s => 
          s._id.toString() === staffId);
        const mrName = staffEntry?.medicalRepName || normalizedName;
        
        combinedData.push({
          srDate: new Date(),
          mrName: mrName,
          mrId: staffId,
          sale: 0,
          profit: 0,
          salary: salary,
          incentive: incentive,
          allowance: allowance,
          tourExpense: tourExpense,
          otherExpense: otherExpense,
          totalExpense: totalExpense,
          salarySaleRatio: 0,
          performance: 0,
          saleCount: 0,
          customerCount: 0,
        });
      }
    });

    combinedData.sort((a, b) => b.sale - a.sale);

    const totalRecords = combinedData.length;
    const totalPages = Math.ceil(totalRecords / limitNum);

    if (isExport) {
      return {
        success: true,
        data: {
          summary,
          records: combinedData,
        }
      };
    } else {
      const startIndex = skip;
      const endIndex = Math.min(skip + limitNum, totalRecords);
      const paginatedData = combinedData.slice(startIndex, endIndex);
      
      return {
        success: true,
        data: {
          summary,
          records: paginatedData,
        },
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalRecords: totalRecords,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        filterInfo: {
          type: dateFilter,
          startDate: salesDateConditions.recordingDate?.$gte,
          endDate: salesDateConditions.recordingDate?.$lte,
          period: period,
        }
      };
    }
    
  } catch (error) {
    console.error("❌ Error in fetchSalesSalaryData:", error);
    throw error;
  }
};

router.get("/sales-salary-ratio", async (req, res) => {
  try {    
    const result = await fetchSalesSalaryData(req.query);
    res.status(200).json(result);
  } catch (error) {
    console.error("❌ Error in /sales-salary-ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales salary ratio data",
      error: error.message,
    });
  }
});

router.get("/sales-salary-ratio/export", async (req, res) => {
  try {    
    const result = await fetchSalesSalaryData({
      ...req.query,
      export: "true",
      limit: 10000
    });
    
    if (!result.success) {
      throw new Error("Failed to fetch data for export");
    }
    
    const { summary, records } = result.data;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Salary Ratio Report');
    
    worksheet.columns = [
      { header: 'Sr. No', key: 'srNo', width: 10 },
      { header: 'MR Name', key: 'mrName', width: 25 },
      { header: 'Sale ($)', key: 'sale', width: 15 },
      { header: 'Profit ($)', key: 'profit', width: 15 },
      { header: 'Salary ($)', key: 'salary', width: 15 },
      { header: 'Incentive ($)', key: 'incentive', width: 15 },
      { header: 'Allowance ($)', key: 'allowance', width: 15 },
      { header: 'Tour Expense ($)', key: 'tourExpense', width: 15 },
      { header: 'Other Expense ($)', key: 'otherExpense', width: 15 },
      { header: 'Total Expense ($)', key: 'totalExpense', width: 15 },
      { header: 'Salary/Sale (%)', key: 'salarySaleRatio', width: 15 },
      { header: 'Performance (%)', key: 'performance', width: 15 },
      { header: 'Sale Count', key: 'saleCount', width: 12 },
      { header: 'Customer Count', key: 'customerCount', width: 12 }
    ];
    
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    records.forEach((record, index) => {
      const row = worksheet.addRow({
        srNo: index + 1,
        mrName: record.mrName || 'N/A',
        sale: parseFloat(record.sale) || 0,
        profit: parseFloat(record.profit) || 0,
        salary: parseFloat(record.salary) || 0,
        incentive: parseFloat(record.incentive) || 0,
        allowance: parseFloat(record.allowance) || 0,
        tourExpense: parseFloat(record.tourExpense) || 0,
        otherExpense: parseFloat(record.otherExpense) || 0,
        totalExpense: parseFloat(record.totalExpense) || 0,
        salarySaleRatio: parseFloat(record.salarySaleRatio) || 0,
        performance: parseFloat(record.performance) || 0,
        saleCount: record.saleCount || 0,
        customerCount: record.customerCount || 0
      });
      
      const currencyColumns = ['sale', 'profit', 'salary', 'incentive', 'allowance', 'tourExpense', 'otherExpense', 'totalExpense'];
      currencyColumns.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '$#,##0.00';
      });
      
      const percentageColumns = ['salarySaleRatio', 'performance'];
      percentageColumns.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '0.00%';
      });
      
      const salarySaleCell = row.getCell('salarySaleRatio');
      const performanceCell = row.getCell('performance');
      
      const salarySaleValue = parseFloat(record.salarySaleRatio) || 0;
      salarySaleCell.font = {
        color: { argb: salarySaleValue >= 0 ? 'FF16A34A' : 'FFDC2626' }
      };
      
      const performanceValue = parseFloat(record.performance) || 0;
      performanceCell.font = {
        color: { argb: performanceValue >= 0 ? 'FF16A34A' : 'FFDC2626' }
      };
    });
    
    worksheet.addRow({});
    const summaryRow = worksheet.addRow({
      mrName: 'TOTAL SUMMARY',
      sale: summary.totalSales,
      profit: summary.totalProfit,
      salary: summary.totalSalary,
      totalExpense: summary.totalExpense,
      salarySaleRatio: summary.totalExpense > 0 ? 
        ((summary.totalProfit - summary.totalExpense) / summary.totalExpense) * 100 : 0,
      performance: summary.totalExpense > 0 ? 
        (summary.totalProfit / summary.totalExpense) * 100 : 0
    });
    
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFEF3C7' }
    };
    
    const summaryCurrencyCells = ['sale', 'profit', 'salary', 'totalExpense'];
    summaryCurrencyCells.forEach(col => {
      const cell = summaryRow.getCell(col);
      cell.numFmt = '$#,##0.00';
    });
    
    const summaryPercentageCells = ['salarySaleRatio', 'performance'];
    summaryPercentageCells.forEach(col => {
      const cell = summaryRow.getCell(col);
      cell.numFmt = '0.00%';
    });
    
    worksheet.addRow({});
    const filterInfoRow = worksheet.addRow({
      mrName: `Filter: ${req.query.dateFilter || 'currentMonth'}`,
      sale: req.query.startDate ? `From: ${req.query.startDate}` : '',
      profit: req.query.endDate ? `To: ${req.query.endDate}` : '',
      salary: req.query.search ? `Search: ${req.query.search}` : ''
    });
    filterInfoRow.font = { italic: true };
    
    worksheet.columns.forEach(column => {
      column.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `sales-salary-ratio-report-${timestamp}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    await workbook.xlsx.write(res);
  
  } catch (error) {
    console.error("❌ Error in export API:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data",
      error: error.message,
    });
  }
});

router.get("/mrs", async (req, res) => {
  try {
    const mrList = await stockTransferToMR.aggregate([
      {
        // Normalize spaces first
        $project: {
          cleanedMrName: {
            $trim: {
              input: {
                $replaceAll: {
                  input: "$stockTransferToMr",
                  find: "  ",
                  replacement: " ",
                },
              },
            },
          },
        },
      },
      {
        // Group by cleaned MR name
        $group: {
          _id: "$cleanedMrName",
        },
      },
      {
        $project: {
          _id: 0,
          mrName: "$_id",
        },
      },
      { $sort: { mrName: 1 } },
    ]);
    
    res.status(200).json({
      success: true,
      data: mrList,
    });
  } catch (error) {
    console.error("❌ Error fetching MR list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR list",
      error: error.message,
    });
  }
});

export default router;