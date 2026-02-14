// Backend: salaryCOGSRatio.js - Fixed version with proper pagination
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Payroll from "../../models/Hrm/Payroll.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";
import ExcelJS from 'exceljs';

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

// Enhanced name normalization function
const normalizeMrName = (name) => {
  if (!name) return "";
  
  let normalized = name
    .replace(/^(mr|mrs|ms|miss|dr|prof)\s+/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  
  // Special handling for specific names
  if (normalized.includes('makara')) {
    normalized = 'makara';
  }
  
  if (normalized.includes('phanda')) {
    normalized = 'phanda';
  }
  
  return normalized;
};

// Function to normalize MR name in JavaScript
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

// Main function to fetch Salary/COGS ratio data with proper pagination
const fetchSalaryCOGSData = async (params) => {
  try {
    const { 
      page = 1, 
      limit = 7, 
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
    
    // 🔍 Step 1: Build date filter conditions for sales
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
          // No date filter for 'all'
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

    // 🔍 Step 2: Combine search and date conditions for sales
    const salesMatchConditions = { ...salesDateConditions };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      salesMatchConditions.mrName = searchRegex;
    }

    // 📊 Step 3: Get ALL sales data for summary calculation with COGS
    const allSalesForSummary = await SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          totalCOGS: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  {
                    $cond: [
                      { $and: [
                        { $ifNull: ["$$this.lc", false] },
                        { $ifNull: ["$$this.totalQty", false] }
                      ]},
                      { $multiply: ["$$this.lc", "$$this.totalQty"] },
                      {
                        $cond: [
                          { $and: [
                            { $ifNull: ["$$this.amount", false] },
                            { $ifNull: ["$$this.profitLoss", false] }
                          ]},
                          { $subtract: ["$$this.amount", "$$this.profitLoss"] },
                          0
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalCOGS: { $sum: "$totalCOGS" },
          totalProfit: { $sum: "$totalProfitLoss" },
          saleCount: { $sum: 1 }
        }
      }
    ]);

    const totalSalesFromAllRecords = allSalesForSummary[0]?.totalSales || 0;
    const totalCOGSFromAllRecords = allSalesForSummary[0]?.totalCOGS || 0;
    const totalProfitFromAllRecords = allSalesForSummary[0]?.totalProfit || 0;

    // 📊 Step 4: Get sales data with MR grouping including COGS - NO PAGINATION HERE
    const salesAggregate = await SaleSummary.aggregate([
      { $match: salesMatchConditions },
      {
        $addFields: {
          saleCOGS: {
            $reduce: {
              input: "$products",
              initialValue: 0,
              in: {
                $add: [
                  "$$value",
                  {
                    $cond: [
                      { $and: [
                        { $ifNull: ["$$this.lc", false] },
                        { $ifNull: ["$$this.totalQty", false] }
                      ]},
                      { $multiply: ["$$this.lc", "$$this.totalQty"] },
                      {
                        $cond: [
                          { $and: [
                            { $ifNull: ["$$this.amount", false] },
                            { $ifNull: ["$$this.profitLoss", false] }
                          ]},
                          { $subtract: ["$$this.amount", "$$this.profitLoss"] },
                          0
                        ]
                      }
                    ]
                  }
                ]
              }
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
          totalCOGS: { $sum: "$saleCOGS" },
          totalProfit: { $sum: "$totalProfitLoss" },
          saleCount: { $sum: 1 },
          customers: { $addToSet: "$customerCode" },
          lastSaleDate: { $max: "$recordingDate" },
          productsSold: { $push: "$products" }
        },
      },
      {
        $project: {
          _id: 0,
          mrName: "$_id.mrName",
          mrId: "$_id.mrId",
          totalSales: "$totalSales",
          totalCOGS: "$totalCOGS",
          totalProfit: "$totalProfit",
          saleCount: 1,
          customerCount: { $size: "$customers" },
          lastSaleDate: 1,
          productsSold: 1
        },
      },
      { $sort: { totalSales: -1 } }
      // NO SKIP/LIMIT HERE - we need all data to group by normalized names
    ]);

    // Now group by normalized name in JavaScript
    const groupedSales = {};
    salesAggregate.forEach(record => {
      const normalizedName = normalizeNameInJS(record.mrName);
      
      if (!groupedSales[normalizedName]) {
        groupedSales[normalizedName] = {
          normalizedName: normalizedName,
          mrName: record.mrName,
          mrId: record.mrId,
          originalNames: [record.mrName],
          totalSales: parseFloat(record.totalSales) || 0,
          totalCOGS: parseFloat(record.totalCOGS) || 0,
          totalProfit: parseFloat(record.totalProfit) || 0,
          saleCount: parseInt(record.saleCount) || 0,
          customerCount: parseInt(record.customerCount) || 0,
          lastSaleDate: record.lastSaleDate,
          records: [record]
        };
      } else {
        groupedSales[normalizedName].totalSales += parseFloat(record.totalSales) || 0;
        groupedSales[normalizedName].totalCOGS += parseFloat(record.totalCOGS) || 0;
        groupedSales[normalizedName].totalProfit += parseFloat(record.totalProfit) || 0;
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
        
        if (parseFloat(record.totalSales) > parseFloat(groupedSales[normalizedName].records[0].totalSales)) {
          groupedSales[normalizedName].mrName = record.mrName;
        }
        
        groupedSales[normalizedName].records.push(record);
      }
    });

    // Convert grouped object to array
    const salesAggregateGrouped = Object.values(groupedSales);

    // 👥 Step 5: Get ALL staff members
    const allStaffMembers = await Staff.find({}).select("_id medicalRepName employeeId");
    
    // Build staff maps
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

    // 💰 Step 6: Get payroll data for ALL staff
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
            // No period filter for all records
            break;
        }
      }
      
      payrollAggregate = await Payroll.aggregate([
        { $match: payrollMatchConditions },
        {
          $group: {
            _id: "$employeeId",
            salary: { $sum: "$basicSalary" },
            incentive: { 
              $sum: {
                $reduce: {
                  input: "$allowances",
                  initialValue: 0,
                  in: {
                    $add: [
                      "$$value",
                      {
                        $cond: [
                          {
                            $regexMatch: {
                              input: { $ifNull: ["$$this.type", ""] },
                              regex: "incentive",
                              options: "i"
                            }
                          },
                          { $ifNull: ["$$this.amount", 0] },
                          0
                        ]
                      }
                    ]
                  }
                }
              }
            },
            allowance: { 
              $sum: {
                $subtract: [
                  { $ifNull: ["$totalAllowance", 0] },
                  {
                    $reduce: {
                      input: "$allowances",
                      initialValue: 0,
                      in: {
                        $add: [
                          "$$value",
                          {
                            $cond: [
                              {
                                $regexMatch: {
                                  input: { $ifNull: ["$$this.type", ""] },
                                  regex: "incentive",
                                  options: "i"
                                }
                              },
                              { $ifNull: ["$$this.amount", 0] },
                              0
                            ]
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            },
            tourExpense: { $sum: { $ifNull: ["$tourExpense", 0] } },
            payrollCount: { $sum: 1 }
          },
        },
      ]);
    }

    // 📊 Step 7: Calculate TOTAL summary from ALL payroll data
    const totalPayrollSummary = payrollAggregate.reduce(
      (acc, payroll) => {
        return {
          totalSalary: acc.totalSalary + (parseFloat(payroll.salary) || 0),
          totalIncentive: acc.totalIncentive + (parseFloat(payroll.incentive) || 0),
          totalAllowance: acc.totalAllowance + (parseFloat(payroll.allowance) || 0),
          totalTourExpense: acc.totalTourExpense + (parseFloat(payroll.tourExpense) || 0),
        };
      },
      { 
        totalSalary: 0, 
        totalIncentive: 0, 
        totalAllowance: 0, 
        totalTourExpense: 0
      }
    );

    const totalExpenseFromAllRecords = 
      totalPayrollSummary.totalSalary +
      totalPayrollSummary.totalIncentive +
      totalPayrollSummary.totalAllowance +
      totalPayrollSummary.totalTourExpense;

    // Calculate Salary/COGS Ratio
    const salaryCOGSRatio = totalCOGSFromAllRecords > 0 
      ? parseFloat((totalPayrollSummary.totalSalary / totalCOGSFromAllRecords).toFixed(4))
      : 0;

    // Calculate Expense/COGS Ratio
    const expenseCOGSRatio = totalCOGSFromAllRecords > 0 
      ? parseFloat((totalExpenseFromAllRecords / totalCOGSFromAllRecords).toFixed(4))
      : 0;

    // Calculate Salary/Sale Ratio
    const salarySaleRatio = totalSalesFromAllRecords > 0 
      ? parseFloat((totalPayrollSummary.totalSalary / totalSalesFromAllRecords).toFixed(4))
      : 0;

    // Calculate Profit Margin
    const profitMargin = totalSalesFromAllRecords > 0
      ? parseFloat(((totalProfitFromAllRecords / totalSalesFromAllRecords) * 100).toFixed(2))
      : 0;

    // Calculate COGS Percentage
    const cogsPercentage = totalSalesFromAllRecords > 0
      ? parseFloat(((totalCOGSFromAllRecords / totalSalesFromAllRecords) * 100).toFixed(2))
      : 0;

    const summary = {
      totalSalary: parseFloat(totalPayrollSummary.totalSalary) || 0,
      totalCOGS: parseFloat(totalCOGSFromAllRecords) || 0,
      totalSales: parseFloat(totalSalesFromAllRecords) || 0,
      totalProfit: parseFloat(totalProfitFromAllRecords) || 0,
      totalExpense: parseFloat(totalExpenseFromAllRecords) || 0,
      salaryCOGSRatio: salaryCOGSRatio,
      expenseCOGSRatio: expenseCOGSRatio,
      salarySaleRatio: salarySaleRatio,
      totalAllowance: parseFloat(totalPayrollSummary.totalAllowance) || 0,
      totalIncentive: parseFloat(totalPayrollSummary.totalIncentive) || 0,
      totalTourExpense: parseFloat(totalPayrollSummary.totalTourExpense) || 0,
      profitMargin: profitMargin,
      cogsPercentage: cogsPercentage
    };

    // 📘 Convert payroll to map by staff ID
    const payrollByStaffId = {};
    payrollAggregate.forEach((p) => {
      payrollByStaffId[p._id.toString()] = p;
    });

    // 🔗 Step 8: Combine sales + payroll with normalized matching
    const combinedData = salesAggregateGrouped.map((record) => {
      let matchedStaffId = null;
      
      // First try to match by normalized name
      const normalizedSalesName = record.normalizedName;
      if (normalizedSalesName && staffMap.normalizedNameToId[normalizedSalesName]) {
        matchedStaffId = staffMap.normalizedNameToId[normalizedSalesName];
      }
      
      // If no match, try to match with staff names that contain the sales name
      if (!matchedStaffId && normalizedSalesName) {
        for (const [staffNormalizedName, staffId] of Object.entries(staffMap.normalizedNameToId)) {
          if (staffNormalizedName.includes(normalizedSalesName) || 
              normalizedSalesName.includes(staffNormalizedName)) {
            matchedStaffId = staffId;
            break;
          }
        }
      }
      
      // If still no match, try original names
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
      const cogs = parseFloat(record.totalCOGS) || 0;
      const sales = parseFloat(record.totalSales) || 0;
      const profit = parseFloat(record.totalProfit) || 0;

      const totalExpense = salary + incentive + allowance + tourExpense;
      
      // Calculate various ratios
      const salaryCogsRatio = cogs > 0 ? parseFloat((salary / cogs).toFixed(4)) : 0;
      const expenseCogsRatio = cogs > 0 ? parseFloat((totalExpense / cogs).toFixed(4)) : 0;
      const salarySaleRatio = sales > 0 ? parseFloat((salary / sales).toFixed(4)) : 0;
      const profitMargin = sales > 0 ? parseFloat(((profit / sales) * 100).toFixed(2)) : 0;
      const cogsPercentage = sales > 0 ? parseFloat(((cogs / sales) * 100).toFixed(2)) : 0;
      const salaryPercentage = sales > 0 ? parseFloat(((salary / sales) * 100).toFixed(2)) : 0;

      return {
        srDate: record.lastSaleDate || new Date(),
        mrName: record.mrName || "",
        mrId: record.mrId || matchedStaffId || "",
        cogs: cogs,
        totalSales: sales,
        profit: profit,
        salary: salary,
        incentive: incentive,
        allowance: allowance,
        tourExpense: tourExpense,
        totalExpense: totalExpense,
        salaryCOGSRatio: salaryCogsRatio,
        expenseCOGSRatio: expenseCogsRatio,
        salarySaleRatio: salarySaleRatio,
        profitMargin: profitMargin,
        cogsPercentage: cogsPercentage,
        salaryPercentage: salaryPercentage,
        saleCount: parseInt(record.saleCount) || 0,
        customerCount: parseInt(record.customerCount) || 0,
      };
    });

    // Add MRs that have salary but no sales
    Object.keys(staffMap.normalizedNameToId).forEach(normalizedName => {
      const staffId = staffMap.normalizedNameToId[normalizedName];
      const payroll = payrollByStaffId[staffId];
      
      if (payroll && !combinedData.find(item => 
        normalizeNameInJS(item.mrName) === normalizedName)) {
        
        const salary = parseFloat(payroll.salary) || 0;
        const incentive = parseFloat(payroll.incentive) || 0;
        const allowance = parseFloat(payroll.allowance) || 0;
        const tourExpense = parseFloat(payroll.tourExpense) || 0;
        const totalExpense = salary + incentive + allowance + tourExpense;
        
        // Find the actual staff name
        const staffEntry = allStaffMembers.find(s => 
          s._id.toString() === staffId);
        const mrName = staffEntry?.medicalRepName || normalizedName;
        
        combinedData.push({
          srDate: new Date(),
          mrName: mrName,
          mrId: staffId,
          cogs: 0,
          totalSales: 0,
          profit: 0,
          salary: salary,
          incentive: incentive,
          allowance: allowance,
          tourExpense: tourExpense,
          totalExpense: totalExpense,
          salaryCOGSRatio: 0,
          expenseCOGSRatio: 0,
          salarySaleRatio: 0,
          profitMargin: 0,
          cogsPercentage: 0,
          salaryPercentage: 0,
          saleCount: 0,
          customerCount: 0,
        });
      }
    });

    // Sort by total sales descending
    combinedData.sort((a, b) => b.totalSales - a.totalSales);

    // For pagination: get total count
    const totalRecords = combinedData.length;
    const totalPages = Math.ceil(totalRecords / limitNum);

    if (isExport) {
      // For export, return all data
      return {
        success: true,
        data: {
          summary,
          records: combinedData,
        }
      };
    } else {
      // Apply pagination to the final combined data
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
    console.error("❌ Error in fetchSalaryCOGSData:", error);
    throw error;
  }
};

// Main API endpoint for Salary/COGS Ratio (mounted at /api/reports/salary-cogs-ratio)
router.get("/", async (req, res) => {
  try {    
    const result = await fetchSalaryCOGSData(req.query);
    res.status(200).json(result);
  } catch (error) {
    console.error("❌ Error in /salary-cogs-ratio:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch salary COGS ratio data",
      error: error.message,
    });
  }
});

// Export endpoint for Salary/COGS Ratio (mounted at /api/reports/salary-cogs-ratio/export)
router.get("/export", async (req, res) => {
  try {    
    const result = await fetchSalaryCOGSData({
      ...req.query,
      export: "true",
      limit: 10000
    });
    
    if (!result.success) {
      throw new Error("Failed to fetch data for export");
    }
    
    const { summary, records } = result.data;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Salary COGS Ratio Report');
    
    // Define columns for Salary/COGS Ratio Report
    worksheet.columns = [
      { header: 'Sr. No', key: 'srNo', width: 10 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'MR Name', key: 'mrName', width: 25 },
      { header: 'COGS ($)', key: 'cogs', width: 15 },
      { header: 'Sales ($)', key: 'sales', width: 15 },
      { header: 'Profit ($)', key: 'profit', width: 15 },
      { header: 'Salary ($)', key: 'salary', width: 15 },
      { header: 'Incentive ($)', key: 'incentive', width: 15 },
      { header: 'Allowance ($)', key: 'allowance', width: 15 },
      { header: 'Tour Expense ($)', key: 'tourExpense', width: 15 },
      { header: 'Total Expense ($)', key: 'totalExpense', width: 15 },
      { header: 'Salary/COGS Ratio', key: 'salaryCOGSRatio', width: 15 },
      { header: 'Expense/COGS Ratio', key: 'expenseCOGSRatio', width: 15 },
      { header: 'Salary/Sale Ratio', key: 'salarySaleRatio', width: 15 },
      { header: 'Profit Margin (%)', key: 'profitMargin', width: 15 },
      { header: 'Sale Count', key: 'saleCount', width: 12 },
      { header: 'Customer Count', key: 'customerCount', width: 12 }
    ];
    
    // Add header row with styling
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4F46E5' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    
    // Add data rows
    records.forEach((record, index) => {
      const row = worksheet.addRow({
        srNo: index + 1,
        date: record.srDate ? new Date(record.srDate).toLocaleDateString() : '',
        mrName: record.mrName || 'N/A',
        cogs: parseFloat(record.cogs) || 0,
        sales: parseFloat(record.totalSales) || 0,
        profit: parseFloat(record.profit) || 0,
        salary: parseFloat(record.salary) || 0,
        incentive: parseFloat(record.incentive) || 0,
        allowance: parseFloat(record.allowance) || 0,
        tourExpense: parseFloat(record.tourExpense) || 0,
        totalExpense: parseFloat(record.totalExpense) || 0,
        salaryCOGSRatio: parseFloat(record.salaryCOGSRatio) || 0,
        expenseCOGSRatio: parseFloat(record.expenseCOGSRatio) || 0,
        salarySaleRatio: parseFloat(record.salarySaleRatio) || 0,
        profitMargin: parseFloat(record.profitMargin) || 0,
        saleCount: record.saleCount || 0,
        customerCount: record.customerCount || 0
      });
      
      // Format currency columns
      const currencyColumns = ['cogs', 'sales', 'profit', 'salary', 'incentive', 'allowance', 'tourExpense', 'totalExpense'];
      currencyColumns.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '$#,##0.00';
      });
      
      // Format ratio columns (as decimals)
      const ratioColumns = ['salaryCOGSRatio', 'expenseCOGSRatio', 'salarySaleRatio'];
      ratioColumns.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '0.0000';
      });
      
      // Format percentage columns
      const percentageColumns = ['profitMargin'];
      percentageColumns.forEach(col => {
        const cell = row.getCell(col);
        cell.numFmt = '0.00%';
      });
      
      // Color coding for ratios
      const salaryCogsCell = row.getCell('salaryCOGSRatio');
      const salaryCogsValue = parseFloat(record.salaryCOGSRatio) || 0;
      salaryCogsCell.font = {
        color: { argb: salaryCogsValue <= 1 ? 'FF16A34A' : 'FFDC2626' }
      };
      
      const profitMarginCell = row.getCell('profitMargin');
      const profitMarginValue = parseFloat(record.profitMargin) || 0;
      profitMarginCell.font = {
        color: { argb: profitMarginValue >= 0 ? 'FF16A34A' : 'FFDC2626' }
      };
    });
    
    // Add summary section
    worksheet.addRow({});
    worksheet.addRow({
      mrName: 'SUMMARY SECTION',
      sales: 'Metric',
      profit: 'Value'
    });
    
    const summaryRows = [
      { metric: 'Total Salary', value: summary.totalSalary },
      { metric: 'Total COGS', value: summary.totalCOGS },
      { metric: 'Total Sales', value: summary.totalSales },
      { metric: 'Total Profit', value: summary.totalProfit },
      { metric: 'Total Expense', value: summary.totalExpense },
      { metric: 'Salary/COGS Ratio', value: summary.salaryCOGSRatio },
      { metric: 'Expense/COGS Ratio', value: summary.expenseCOGSRatio },
      { metric: 'Salary/Sale Ratio', value: summary.salarySaleRatio },
      { metric: 'Total Allowance', value: summary.totalAllowance },
      { metric: 'Total Incentive', value: summary.totalIncentive },
      { metric: 'Total Tour Expense', value: summary.totalTourExpense },
      { metric: 'Profit Margin', value: summary.profitMargin / 100 } // Convert to decimal for Excel percentage
    ];
    
    summaryRows.forEach((summaryRow, index) => {
      const row = worksheet.addRow({
        mrName: summaryRow.metric,
        sales: summaryRow.value
      });
      
      // Style summary rows
      row.font = { bold: true };
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFFEF3C7' : 'FFE5E7EB' }
      };
      
      // Format currency and ratio cells
      if (summaryRow.value !== undefined) {
        const valueCell = row.getCell('sales');
        if (summaryRow.metric.includes('Ratio')) {
          valueCell.numFmt = '0.0000';
        } else if (summaryRow.metric === 'Profit Margin') {
          valueCell.numFmt = '0.00%';
        } else {
          valueCell.numFmt = '$#,##0.00';
        }
      }
    });
    
    // Add filter info
    worksheet.addRow({});
    const filterInfoRow = worksheet.addRow({
      mrName: `Report: Salary/COGS Ratio`,
      sales: `Period: ${req.query.period || req.query.dateFilter || 'currentMonth'}`,
      profit: req.query.startDate ? `From: ${req.query.startDate}` : '',
      salary: req.query.endDate ? `To: ${req.query.endDate}` : '',
      incentive: req.query.search ? `Search: ${req.query.search}` : ''
    });
    filterInfoRow.font = { italic: true };
    
    // Set column widths and alignment
    worksheet.columns.forEach(column => {
      column.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    
    // Generate filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `salary-cogs-ratio-report-${timestamp}.xlsx`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Write to response
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

export default router;