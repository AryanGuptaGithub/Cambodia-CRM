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

// Enhanced name normalization function - FIXED to handle Phanda variations
const normalizeMrName = (name) => {
  if (!name) return "";
  
  // Remove common prefixes and normalize
  let normalized = name
    .replace(/^(mr|mrs|ms|miss|dr|prof)\s+/i, '') // Remove titles
    .replace(/[^\w\s]/g, ' ') // Remove special characters
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim()
    .toLowerCase();
  
  // Special handling for specific names
  if (normalized.includes('makara')) {
    normalized = 'makara';
  }
  
  // Handle Phanda variations
  if (normalized.includes('phanda')) {
    normalized = 'phanda';
  }
  
  return normalized;
};

// Function to normalize MR name in JavaScript (for post-processing)
const normalizeNameInJS = (name) => {
  if (!name) return "";
  
  // Simple normalization: lowercase and remove common prefixes
  let normalized = name.toLowerCase().trim();
  
  // Remove common prefixes
  const prefixes = ['mr ', 'mrs ', 'ms ', 'miss ', 'dr ', 'prof '];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.substring(prefix.length);
      break;
    }
  }
  
  // Remove extra spaces
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // Special cases
  if (normalized.includes('makara')) {
    normalized = 'makara';
  }
  
  if (normalized.includes('phanda')) {
    normalized = 'phanda';
  }
  
  return normalized;
};

// Calculate Salary/Sale ratio as (Profit - Total Expense) / Expense * 100
const calculateSalarySaleRatio = (profit, totalExpense) => {
  if (totalExpense === 0) return 0;
  return ((profit - totalExpense) / totalExpense) * 100;
};

// Calculate Performance as (Profit / Total Expense) * 100
const calculatePerformance = (profit, totalExpense) => {
  if (totalExpense === 0) return profit > 0 ? 1000 : 0;
  return (profit / totalExpense) * 100;
};

router.get("/sales-salary-ratio", async (req, res) => {
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
    } = req.query;
    
    console.log("🔍 API Parameters:", {
      page, limit, search, startDate, endDate, period, dateFilter, isExport
    });
    
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
      console.log("📅 Custom date range:", startDate, "to", endDate);
    } else {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      
      console.log("📅 Building date filter for:", dateFilter);
      
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
          console.log("📅 Today filter applied");
          break;
          
        case 'currentMonth':
          const firstDay = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);
          salesDateConditions.recordingDate = {
            $gte: firstDay,
            $lte: lastDay
          };
          console.log("📅 Current month filter:", firstDay, "to", lastDay);
          break;
          
        case 'janToPreviousMonth':
          const currentMonth = now.getMonth();
          if (currentMonth === 0) {
            salesDateConditions.recordingDate = {
              $gte: new Date(year - 1, 0, 1),
              $lte: new Date(year - 1, 11, 31)
            };
            console.log("📅 Jan to Dec of previous year (2025)");
          } else {
            salesDateConditions.recordingDate = {
              $gte: new Date(year, 0, 1),
              $lte: new Date(year, currentMonth, 0)
            };
            console.log(`📅 Jan to ${currentMonth} of current year`);
          }
          break;
          
        case 'all':
          console.log("📅 All records - no date filter");
          break;
          
        default:
          const defaultFirstDay = new Date(year, month, 1);
          const defaultLastDay = new Date(year, month + 1, 0);
          salesDateConditions.recordingDate = {
            $gte: defaultFirstDay,
            $lte: defaultLastDay
          };
          console.log("📅 Default filter (current month)");
      }
    }

    // 🔍 Step 2: Combine search and date conditions for sales
    const salesMatchConditions = { ...salesDateConditions };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      salesMatchConditions.mrName = searchRegex;
      console.log("🔍 Search filter applied:", search.trim());
    }

    console.log("🔍 Final sales match conditions:", salesMatchConditions);

    // 📊 Step 3: Get ALL sales data for summary calculation
    console.log("📊 Getting ALL sales data for summary...");
    const allSalesForSummary = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: salesMatchConditions },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$products.profitLoss" },
          saleCount: { $sum: 1 }
        }
      }
    ]);

    console.log("📊 All sales summary result:", allSalesForSummary);

    const totalSalesFromAllRecords = allSalesForSummary[0]?.totalSales || 0;
    const totalProfitFromAllRecords = allSalesForSummary[0]?.totalProfit || 0;

    // 📊 Step 4: Get sales data with MR grouping - SIMPLIFIED aggregation
    console.log("📊 Getting sales data with MR grouping...");
    const salesAggregate = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: salesMatchConditions },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId",
          },
          totalSales: { $sum: "$totalAmount" },
          totalProfit: { $sum: "$products.profitLoss" },
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
      { $sort: { sale: -1 } },
      ...(isExport ? [] : [{ $skip: skip }, { $limit: limitNum }])
    ]);

    console.log(`📊 Found ${salesAggregate.length} sales records before grouping`);
    
    // Now group by normalized name in JavaScript
    const groupedSales = {};
    salesAggregate.forEach(record => {
      const normalizedName = normalizeNameInJS(record.mrName);
      
      if (!groupedSales[normalizedName]) {
        // Create new grouped record
        groupedSales[normalizedName] = {
          normalizedName: normalizedName,
          mrName: record.mrName, // Keep the first original name
          mrId: record.mrId,
          originalNames: [record.mrName],
          sale: parseFloat(record.sale) || 0,
          profit: parseFloat(record.profit) || 0,
          saleCount: parseInt(record.saleCount) || 0,
          customerCount: parseInt(record.customerCount) || 0,
          lastSaleDate: record.lastSaleDate,
          // Keep track of all sales records for this normalized name
          records: [record]
        };
      } else {
        // Add to existing grouped record
        groupedSales[normalizedName].sale += parseFloat(record.sale) || 0;
        groupedSales[normalizedName].profit += parseFloat(record.profit) || 0;
        groupedSales[normalizedName].saleCount += parseInt(record.saleCount) || 0;
        groupedSales[normalizedName].customerCount = Math.max(
          groupedSales[normalizedName].customerCount,
          parseInt(record.customerCount) || 0
        );
        
        // Update to the most recent sale date
        if (record.lastSaleDate && (!groupedSales[normalizedName].lastSaleDate || 
            record.lastSaleDate > groupedSales[normalizedName].lastSaleDate)) {
          groupedSales[normalizedName].lastSaleDate = record.lastSaleDate;
        }
        
        // Add original name if not already in the list
        if (record.mrName && !groupedSales[normalizedName].originalNames.includes(record.mrName)) {
          groupedSales[normalizedName].originalNames.push(record.mrName);
        }
        
        // Keep the most common name (the one with highest sales)
        if (parseFloat(record.sale) > parseFloat(groupedSales[normalizedName].records[0].sale)) {
          groupedSales[normalizedName].mrName = record.mrName;
        }
        
        groupedSales[normalizedName].records.push(record);
      }
    });

    // Convert grouped object to array
    const salesAggregateGrouped = Object.values(groupedSales);
    
    console.log(`📊 Found ${salesAggregateGrouped.length} sales records after grouping`);
    if (!isExport && salesAggregateGrouped.length > 0) {
      console.log("📊 Sales records after grouping:", salesAggregateGrouped.map(r => ({ 
        normalizedName: r.normalizedName,
        mrName: r.mrName, 
        sale: r.sale,
        originalNames: r.originalNames
      })));
    }

    // 👥 Step 5: Get ALL staff members
    console.log("👥 Fetching ALL staff members...");
    const allStaffMembers = await Staff.find({}).select("_id medicalRepName employeeId");
    console.log(`👥 Total staff members in database: ${allStaffMembers.length}`);
    
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
        // Store original mapping
        staffMap.idToName[staffId] = originalName;
        
        // Store normalized name mapping
        const normalizedStaffName = normalizeMrName(originalName);
        staffMap.normalizedNameToId[normalizedStaffName] = staffId;
        
        // Also store simple lowercase for matching
        const simpleName = originalName.toLowerCase().trim();
        staffMap.nameToId[simpleName] = staffId;
        
        if (!isExport) {
          console.log(`👥 Staff: ${originalName} -> ID: ${staffId}, Normalized: ${normalizedStaffName}`);
        }
      }
    });

    if (!isExport) {
      console.log(`👥 Staff map created with ${Object.keys(staffMap.normalizedNameToId).length} normalized names`);
    }

    // 💰 Step 6: Get payroll data for ALL staff
    console.log("💰 Getting payroll data for ALL staff...");
    let payrollAggregate = [];
    
    const allStaffIds = allStaffMembers.map(s => new mongoose.Types.ObjectId(s._id));
    console.log(`💰 Total staff IDs: ${allStaffIds.length}`);
    
    if (allStaffIds.length > 0) {
      const payrollMatchConditions = { employeeId: { $in: allStaffIds } };
      
      let payrollPeriods = [];
      
      if (period) {
        payrollMatchConditions.period = period;
        payrollPeriods = [period];
        console.log(`💰 Filtering payroll by single period: ${period}`);
      } else if (startDate && endDate) {
        payrollPeriods = getPeriodsFromDateRange(startDate, endDate);
        payrollMatchConditions.period = { $in: payrollPeriods };
        console.log(`💰 Filtering payroll by multiple periods:`, payrollPeriods);
      } else {
        const now = new Date();
        const currentPeriod = getYearMonthFromDate(now);
        
        switch(dateFilter) {
          case 'today':
            payrollMatchConditions.period = currentPeriod;
            payrollPeriods = [currentPeriod];
            console.log(`💰 Today filter - using current period: ${currentPeriod}`);
            break;
            
          case 'currentMonth':
            payrollMatchConditions.period = currentPeriod;
            payrollPeriods = [currentPeriod];
            console.log(`💰 Current month filter - using period: ${currentPeriod}`);
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
            console.log(`💰 Jan-Previous Month filter - using periods:`, payrollPeriods);
            break;
            
          case 'all':
            console.log("💰 All records - getting all payroll data");
            break;
        }
      }
      
      console.log("💰 Payroll match conditions:", payrollMatchConditions);
      
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
      
      console.log(`💰 Payroll aggregation complete. Found ${payrollAggregate.length} payroll records`);
    }

    // 📊 Step 7: Calculate TOTAL summary from ALL payroll data
    console.log("📊 Calculating TOTAL summary from ALL payroll data...");
    
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

    console.log("📊 Final summary for selected period:", summary);

    // 📘 Convert payroll to map by staff ID
    const payrollByStaffId = {};
    payrollAggregate.forEach((p) => {
      payrollByStaffId[p._id.toString()] = p;
    });

    if (!isExport) {
      console.log(`📘 Payroll map has ${Object.keys(payrollByStaffId).length} entries`);
    }

    // 🔗 Step 8: Combine sales + payroll with normalized matching
    console.log("🔗 Combining sales and payroll data...");
    const combinedData = salesAggregateGrouped.map((record, index) => {
      if (!isExport && index < 5) {
        console.log(`\n🔗 Processing record ${index + 1}: "${record.mrName}" (Normalized: "${record.normalizedName}")`);
      }
      
      let matchedStaffId = null;
      let matchType = 'none';
      
      // First try to match by normalized name
      const normalizedSalesName = record.normalizedName;
      if (normalizedSalesName && staffMap.normalizedNameToId[normalizedSalesName]) {
        matchedStaffId = staffMap.normalizedNameToId[normalizedSalesName];
        matchType = 'normalized_exact';
        if (!isExport && index < 5) {
          console.log(`   ✅ Matched by normalized name: ${matchedStaffId}`);
        }
      }
      
      // If no match, try to match with staff names that contain the sales name
      if (!matchedStaffId && normalizedSalesName) {
        for (const [staffNormalizedName, staffId] of Object.entries(staffMap.normalizedNameToId)) {
          if (staffNormalizedName.includes(normalizedSalesName) || 
              normalizedSalesName.includes(staffNormalizedName)) {
            matchedStaffId = staffId;
            matchType = 'normalized_contains';
            if (!isExport && index < 5) {
              console.log(`   ✅ Matched by normalized contains: ${staffId}`);
            }
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
            matchType = 'original_name';
            if (!isExport && index < 5) {
              console.log(`   ✅ Matched by original name: ${originalName} -> ${matchedStaffId}`);
            }
            break;
          }
        }
      }
      
      let payroll = {};
      if (matchedStaffId) {
        payroll = payrollByStaffId[matchedStaffId] || {};
        if (!isExport && index < 5) {
          console.log(`   💰 Found payroll for ${matchedStaffId}:`, {
            salary: payroll.salary || 0,
            incentive: payroll.incentive || 0,
            allowance: payroll.allowance || 0
          });
        }
      } else if (!isExport && index < 5) {
        console.log(`   ❌ No staff match found for "${record.mrName}" (Normalized: "${record.normalizedName}")`);
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
        normalizedName: record.normalizedName || "",
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
        matchType: matchType,
        matchedStaffId: matchedStaffId
      };
    });

    // Log matching statistics
    if (!isExport) {
      const matchedCount = combinedData.filter(r => r.matchedStaffId).length;
      const payrollMatchedCount = combinedData.filter(r => r.salary > 0).length;
      console.log(`\n📊 Matching Summary:`);
      console.log(`📊 Total sales records (after grouping): ${combinedData.length}`);
      console.log(`📊 Records matched to staff: ${matchedCount}`);
      console.log(`📊 Records with payroll data: ${payrollMatchedCount}`);
      console.log(`📊 Total salary in table: $${combinedData.reduce((sum, r) => sum + r.salary, 0)}`);
      console.log(`📊 Expected total salary: $${summary.totalSalary}`);
    }

    // For export, return the data directly
    if (isExport) {
      return res.status(200).json({
        success: true,
        data: {
          summary,
          records: combinedData,
        },
        totalRecords: combinedData.length
      });
    }

    // 📄 Step 9: Get total count for pagination (simplified)
    const totalCountAggregate = await SaleSummary.aggregate([
      { $unwind: "$products" },
      { $match: salesMatchConditions },
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId",
          },
        },
      },
      { $count: "total" },
    ]);

    // Since we're grouping by normalized name in JS, we need to adjust the total
    // This is an approximation - for accurate count we'd need to fetch all and group
    const totalRecordsBeforeGrouping = totalCountAggregate[0]?.total || 0;
    
    // For pagination purposes, we'll use the grouped count
    const totalRecords = salesAggregateGrouped.length;
    const totalPages = Math.ceil(totalRecords / limitNum);

    console.log(`📄 Pagination: Total Records (before grouping): ${totalRecordsBeforeGrouping}, After grouping: ${totalRecords}, Total Pages: ${totalPages}`);

    // 📤 Step 10: Response
    const responseData = combinedData.map(record => ({
      srDate: record.srDate,
      mrName: record.mrName,
      mrId: record.mrId,
      sale: record.sale,
      profit: record.profit,
      salary: record.salary,
      incentive: record.incentive,
      allowance: record.allowance,
      tourExpense: record.tourExpense,
      otherExpense: record.otherExpense,
      totalExpense: record.totalExpense,
      salarySaleRatio: record.salarySaleRatio,
      performance: record.performance,
      saleCount: record.saleCount,
      customerCount: record.customerCount,
    }));

    res.status(200).json({
      success: true,
      data: {
        summary,
        records: responseData,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      filterInfo: {
        type: dateFilter,
        startDate: salesDateConditions.recordingDate?.$gte,
        endDate: salesDateConditions.recordingDate?.$lte,
        period: period,
      },
      debugInfo: {
        totalStaff: allStaffMembers.length,
        totalPayroll: payrollAggregate.length,
        staffMatches: combinedData.filter(r => r.matchedStaffId).length,
        payrollMatches: combinedData.filter(r => r.salary > 0).length,
        tableSalaryTotal: combinedData.reduce((sum, r) => sum + r.salary, 0),
        originalRecordCount: totalRecordsBeforeGrouping,
        groupedRecordCount: totalRecords
      }
    });
    
    console.log("✅ API call completed successfully!");
  } catch (error) {
    console.error("❌ Error in /sales-salary-ratio:", error);
    console.error("❌ Error stack:", error.stack);
    
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales salary ratio data",
      error: error.message,
    });
  }
});

// Export endpoint


export default router;