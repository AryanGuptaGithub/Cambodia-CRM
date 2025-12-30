import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SaleType from "../../models/reports/saleType.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";

const router = express.Router();

// Helper function to format currency
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
};

// Helper function to generate filename
const generateFilename = (selectedTab, selectedSaleType, dateRange) => {
  const dateStr = new Date().toISOString().split('T')[0];
  let filename = `Daily_Report_${dateStr}`;
  
  if (selectedSaleType && selectedSaleType !== "Total sales") {
    filename += `_${selectedSaleType.replace(/\s+/g, '_')}`;
  }
  
  if (selectedTab) {
    filename += `_${selectedTab}`;
  }
  
  if (dateRange) {
    filename += `_${dateRange}`;
  }
  
  return `${filename}.xlsx`;
};

router.get("/dailyReports", async (req, res) => {
  try {
    const {
      saleType,
      startDate,
      endDate,
      dateFilter,
      search,
      page = 1,
      limit = 7,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // Build match conditions
    const matchConditions = {};

    // 1. Payment Status Condition based on active sale type tab
    if (saleType && saleType !== "Total sales") {
      if (saleType.toLowerCase().includes("cash")) {
        matchConditions.paymentStatus = "Cash";
      } else if (saleType.toLowerCase().includes("credit")) {
        matchConditions.paymentStatus = "Credit";
      }
    }

    // 2. Search Condition
    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // 3. Date Condition - USING invoiceDate INSTEAD OF recordingDate
    if (dateFilter && dateFilter !== "all") {
      const today = new Date();
      
      const todayStr = today.toISOString().split('T')[0];
      let startDateStr, endDateStr;
      
      switch (dateFilter) {
        case "today":
          startDateStr = todayStr;
          endDateStr = todayStr;
          break;

        case "currentMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          startDateStr = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
          endDateStr = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
          break;

        case "janToPreviousMonth":
          const year = today.getFullYear();
          const month = today.getMonth();
          
          if (month === 0) {
            startDateStr = `${year - 1}-01-01`;
            endDateStr = `${year - 1}-12-31`;
          } else {
            startDateStr = `${year}-01-01`;
            const lastMonth = new Date(year, month, 0);
            endDateStr = lastMonth.toISOString().split('T')[0];
          }
          break;

        case "custom":
          if (startDate && endDate) {
            startDateStr = startDate;
            endDateStr = endDate;
          }
          break;

        default:
          break;
      }

      if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);
        
        // USING invoiceDate FOR DATE FILTERING
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    // Build base pipeline
    const basePipeline = [];
    
    if (Object.keys(matchConditions).length > 0) {
      basePipeline.push({ $match: matchConditions });
    }

    // Group by MR name and MR ID to preserve both
    basePipeline.push({
      $group: {
        _id: {
          mrName: "$mrName",
          mrId: "$mrId"
        },
        totalSalesAmount: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        totalPaidAmount: { $sum: "$paidAmount" },
        totalDueAmount: { $sum: "$dueAmount" },
        totalSalesQty: { $sum: "$salesQty" },
        totalBonusQty: { $sum: "$bonusQty" },
        totalQty: { $sum: "$totalQty" },
        credits: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Credit"] },
              "$totalAmount",
              0,
            ],
          },
        },
        cash: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Cash"] },
              "$totalAmount",
              0,
            ],
          },
        },
        uniqueCustomers: { $addToSet: "$customerCode" },
        // USING invoiceDate FOR DATE DISPLAY
        latestInvoiceDate: { $max: "$invoiceDate" },
        earliestInvoiceDate: { $min: "$invoiceDate" },
      },
    });

    // Lookup staff details - SIMPLIFIED APPROACH
    basePipeline.push({
      $lookup: {
        from: "staffs",
        let: { searchMrId: "$_id.mrId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  // Match by _id field (ObjectId to ObjectId)
                  { $eq: ["$_id", { $toObjectId: "$$searchMrId" }] },
                  // Match by MRId field (if mrId is string like "810")
                  { $eq: ["$MRId", { $toString: "$$searchMrId" }] }
                ]
              }
            }
          }
        ],
        as: "staffDetails",
      },
    });

    // Format output with staff details
    basePipeline.push({
      $project: {
        _id: 0,
        mrName: "$_id.mrName",
        mrId: "$_id.mrId",
        totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
        totalOrders: 1,
        totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
        totalDueAmount: { $round: ["$totalDueAmount", 2] },
        totalSalesQty: 1,
        totalBonusQty: 1,
        totalQty: 1,
        credits: { $round: ["$credits", 2] },
        cash: { $round: ["$cash", 2] },
        totalCustomers: { $size: "$uniqueCustomers" },
        // USING invoiceDate FOR DATE DISPLAY
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$latestInvoiceDate",
            timezone: "Asia/Dhaka"
          }
        },
        latestInvoiceDate: 1,
        // Staff details
        mrContactNo: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.contactNo", 0] },
            else: "Not Available"
          }
        },
        mrEmail: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.email", 0] },
            else: "Not Available"
          }
        },
        mrTeamName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.teamName", 0] },
            else: "Not Available"
          }
        },
        mrMedicalRepName: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.medicalRepName", 0] },
            else: "Not Available"
          }
        },
      },
    });

    basePipeline.push({ $sort: { totalSalesAmount: -1 } });

    // Get total count
    const countPipeline = [
      ...(Object.keys(matchConditions).length > 0 ? [{ $match: matchConditions }] : []),
      {
        $group: {
          _id: {
            mrName: "$mrName",
            mrId: "$mrId"
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 }
        }
      }
    ];

    // Execute pipelines
    const [countResult, reportsData, summaryResult] = await Promise.all([
      SaleSummary.aggregate(countPipeline),
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      // Update summary pipeline to also use invoiceDate
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: "$totalAmount" },
            totalOrders: { $sum: 1 },
            totalPaidAmount: { $sum: "$paidAmount" },
            totalDueAmount: { $sum: "$dueAmount" },
            credits: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Credit"] },
                  "$totalAmount",
                  0,
                ],
              },
            },
            cash: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Cash"] },
                  "$totalAmount",
                  0,
                ],
              },
            },
            uniqueCustomers: { $addToSet: "$customerCode" },
            uniqueMRs: { $addToSet: "$mrName" },
            // Also track invoiceDate range for summary
            latestInvoiceDate: { $max: "$invoiceDate" },
            earliestInvoiceDate: { $min: "$invoiceDate" },
          },
        },
        {
          $project: {
            _id: 0,
            totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
            totalOrders: 1,
            totalPaidAmount: { $round: ["$totalPaidAmount", 2] },
            totalDueAmount: { $round: ["$totalDueAmount", 2] },
            credits: { $round: ["$credits", 2] },
            cash: { $round: ["$cash", 2] },
            totalCustomers: { $size: "$uniqueCustomers" },
            totalMRs: { $size: "$uniqueMRs" },
            dateRange: {
              $cond: {
                if: { $eq: ["$earliestInvoiceDate", "$latestInvoiceDate"] },
                then: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$earliestInvoiceDate",
                    timezone: "Asia/Dhaka"
                  }
                },
                else: {
                  $concat: [
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$earliestInvoiceDate",
                        timezone: "Asia/Dhaka"
                      }
                    },
                    " to ",
                    {
                      $dateToString: {
                        format: "%Y-%m-%d",
                        date: "$latestInvoiceDate",
                        timezone: "Asia/Dhaka"
                      }
                    }
                  ]
                }
              }
            }
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Check if staff lookup worked, if not, manually fetch staff details
    let enhancedRecords = [...reportsData];
    
    // Find reports where staff details are missing
    const reportsMissingStaff = enhancedRecords.filter(
      report => report.mrContactNo === "Not Available" && report.mrId
    );

    if (reportsMissingStaff.length > 0) {
      // Collect all mrIds that need staff lookup
      const mrIdsToLookup = reportsMissingStaff.map(report => report.mrId);
      
      // Fetch staff details manually
      const staffDetails = await mongoose.connection.db.collection("staffs").find({
        $or: [
          { _id: { $in: mrIdsToLookup.map(id => new mongoose.Types.ObjectId(id)) } },
          { MRId: { $in: mrIdsToLookup } }
        ]
      }).toArray();

      // Create a lookup map
      const staffMap = {};
      staffDetails.forEach(staff => {
        // Map by _id
        if (staff._id) {
          staffMap[staff._id.toString()] = staff;
        }
        // Map by MRId
        if (staff.MRId) {
          staffMap[staff.MRId] = staff;
        }
      });

      // Enhance the records with staff details
      enhancedRecords = enhancedRecords.map(report => {
        if (report.mrContactNo === "Not Available" && report.mrId) {
          const staff = staffMap[report.mrId];
          
          if (staff) {
            return {
              ...report,
              mrContactNo: staff.contactNo || "Not Available",
              mrEmail: staff.email || "Not Available",
              mrTeamName: staff.teamName || "Not Available",
              mrMedicalRepName: staff.medicalRepName || "Not Available",
            };
          }
        }
        return report;
      });
    }

    // Format records
    const records = enhancedRecords.map((report, index) => ({
      mrId: report.mrId || `MR${String(skip + index + 1).padStart(3, "0")}`,
      mrName: report.mrName,
      totalSalesAmount: report.totalSalesAmount,
      totalOrders: report.totalOrders,
      totalPaidAmount: report.totalPaidAmount,
      totalDueAmount: report.totalDueAmount,
      totalSalesQty: report.totalSalesQty,
      totalBonusQty: report.totalBonusQty,
      totalQty: report.totalQty,
      credits: report.credits,
      cash: report.cash,
      totalCustomers: report.totalCustomers,
      date: report.date,
      // Staff details
      mrContactNo: report.mrContactNo,
      mrEmail: report.mrEmail,
      mrTeamName: report.mrTeamName,
      mrMedicalRepName: report.mrMedicalRepName,
    }));

    // Get the summary result and add date range info
    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
      credits: 0,
      cash: 0,
      totalCustomers: 0,
      totalMRs: 0,
      dateRange: "N/A",
    };
    
    res.status(200).json({
      data: {
        summary,
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching daily reports:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// New route for Excel export
router.get("/dailyReports/export", async (req, res) => {
  try {
    const {
      saleType,
      startDate,
      endDate,
      dateFilter,
      search,
    } = req.query;

    // Build match conditions (same as regular endpoint but without pagination)
    const matchConditions = {};

    // 1. Payment Status Condition based on active sale type tab
    if (saleType && saleType !== "Total sales") {
      if (saleType.toLowerCase().includes("cash")) {
        matchConditions.paymentStatus = "Cash";
      } else if (saleType.toLowerCase().includes("credit")) {
        matchConditions.paymentStatus = "Credit";
      }
    }

    // 2. Search Condition
    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // 3. Date Condition
    if (dateFilter && dateFilter !== "all") {
      const today = new Date();
      
      const todayStr = today.toISOString().split('T')[0];
      let startDateStr, endDateStr;
      
      switch (dateFilter) {
        case "today":
          startDateStr = todayStr;
          endDateStr = todayStr;
          break;

        case "currentMonth":
          const currentYear = today.getFullYear();
          const currentMonth = today.getMonth();
          startDateStr = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
          endDateStr = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];
          break;

        case "janToPreviousMonth":
          const year = today.getFullYear();
          const month = today.getMonth();
          
          if (month === 0) {
            startDateStr = `${year - 1}-01-01`;
            endDateStr = `${year - 1}-12-31`;
          } else {
            startDateStr = `${year}-01-01`;
            const lastMonth = new Date(year, month, 0);
            endDateStr = lastMonth.toISOString().split('T')[0];
          }
          break;

        case "custom":
          if (startDate && endDate) {
            startDateStr = startDate;
            endDateStr = endDate;
          }
          break;

        default:
          break;
      }

      if (startDateStr && endDateStr) {
        const start = new Date(startDateStr);
        const end = new Date(endDateStr);
        end.setHours(23, 59, 59, 999);
        
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }

    // Build export pipeline (get all records without pagination)
    const exportPipeline = [];
    
    if (Object.keys(matchConditions).length > 0) {
      exportPipeline.push({ $match: matchConditions });
    }

    exportPipeline.push({
      $group: {
        _id: {
          mrName: "$mrName",
          mrId: "$mrId"
        },
        totalSalesAmount: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
        credits: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Credit"] },
              "$totalAmount",
              0,
            ],
          },
        },
        cash: {
          $sum: {
            $cond: [
              { $eq: ["$paymentStatus", "Cash"] },
              "$totalAmount",
              0,
            ],
          },
        },
        latestInvoiceDate: { $max: "$invoiceDate" },
      },
    });

    // Lookup staff details
    exportPipeline.push({
      $lookup: {
        from: "staffs",
        let: { searchMrId: "$_id.mrId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$_id", { $toObjectId: "$$searchMrId" }] },
                  { $eq: ["$MRId", { $toString: "$$searchMrId" }] }
                ]
              }
            }
          }
        ],
        as: "staffDetails",
      },
    });

    exportPipeline.push({
      $project: {
        _id: 0,
        mrName: "$_id.mrName",
        mrId: "$_id.mrId",
        totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
        totalOrders: 1,
        credits: { $round: ["$credits", 2] },
        cash: { $round: ["$cash", 2] },
        date: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$latestInvoiceDate",
            timezone: "Asia/Dhaka"
          }
        },
        mrContactNo: {
          $cond: {
            if: { $gt: [{ $size: "$staffDetails" }, 0] },
            then: { $arrayElemAt: ["$staffDetails.contactNo", 0] },
            else: "Not Available"
          }
        },
      },
    });

    exportPipeline.push({ $sort: { totalSalesAmount: -1 } });

    // Execute export query
    const exportData = await SaleSummary.aggregate(exportPipeline);

    // Check if data exists
    if (!exportData || exportData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found for the selected filters"
      });
    }

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Daily Report');

    // Add title row
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = 'DAILY REPORTS';
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };
    titleRow.height = 25;

    // Determine column count based on sale type
    let columnCount = 7; // Default: Sr.No, MR Name, Contact, Credits, Cash, Total Sales, Date
    if (saleType === 'Cash Sales') {
      columnCount = 6; // Remove Credits column
    } else if (saleType === 'Credit Sales') {
      columnCount = 6; // Remove Cash column
    }
    
    // Merge cells for title
    worksheet.mergeCells(1, 1, 1, columnCount);

    // Add filter info
    let filterInfo = `Filters: ${dateFilter || 'All Records'}`;
    if (saleType && saleType !== 'Total sales') {
      filterInfo += ` | ${saleType}`;
    }
    if (search) {
      filterInfo += ` | Search: ${search}`;
    }
    
    const filterRow = worksheet.getRow(2);
    filterRow.getCell(1).value = filterInfo;
    filterRow.getCell(1).font = { italic: true };
    filterRow.getCell(1).alignment = { horizontal: 'center' };
    worksheet.mergeCells(2, 1, 2, columnCount);

    // Add summary row
    const summaryPipeline = [
      { $match: matchConditions },
      {
        $group: {
          _id: null,
          totalSalesAmount: { $sum: "$totalAmount" },
          totalOrders: { $sum: 1 },
          credits: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "Credit"] },
                "$totalAmount",
                0,
              ],
            },
          },
          cash: {
            $sum: {
              $cond: [
                { $eq: ["$paymentStatus", "Cash"] },
                "$totalAmount",
                0,
              ],
            },
          },
          uniqueCustomers: { $addToSet: "$customerCode" },
          uniqueMRs: { $addToSet: "$mrName" },
        },
      },
      {
        $project: {
          _id: 0,
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalOrders: 1,
          credits: { $round: ["$credits", 2] },
          cash: { $round: ["$cash", 2] },
          totalCustomers: { $size: "$uniqueCustomers" },
          totalMRs: { $size: "$uniqueMRs" },
        },
      },
    ];

    const summaryResult = await SaleSummary.aggregate(summaryPipeline);
    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      credits: 0,
      cash: 0,
      totalCustomers: 0,
      totalMRs: 0,
    };

    const summaryRow = worksheet.getRow(3);
    summaryRow.getCell(1).value = `Summary: Total Sales: ${formatCurrency(summary.totalSalesAmount)} | Total Orders: ${summary.totalOrders} | Total MRs: ${summary.totalMRs} | Total Customers: ${summary.totalCustomers} | Credits: ${formatCurrency(summary.credits)} | Cash: ${formatCurrency(summary.cash)}`;
    summaryRow.getCell(1).font = { bold: true };
    summaryRow.getCell(1).alignment = { horizontal: 'center' };
    worksheet.mergeCells(3, 1, 3, columnCount);

    // Add empty row
    worksheet.getRow(4);

    // Define headers based on sale type
    let headers = [];
    if (saleType === 'Cash Sales') {
      headers = ['Sr.No', 'MR Name', 'Contact', 'Cash ($)', 'Total Sales ($)', 'Date'];
    } else if (saleType === 'Credit Sales') {
      headers = ['Sr.No', 'MR Name', 'Contact', 'Credits ($)', 'Total Sales ($)', 'Date'];
    } else {
      // Total sales
      headers = ['Sr.No', 'MR Name', 'Contact', 'Credits ($)', 'Cash ($)', 'Total Sales ($)', 'Date'];
    }

    // Add headers (row 5)
    const headerRow = worksheet.getRow(5);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Add data rows
    exportData.forEach((record, index) => {
      const rowNumber = 6 + index; // Start from row 6
      const row = worksheet.getRow(rowNumber);
      
      if (saleType === 'Cash Sales') {
        // Cash Sales: Sr.No, MR Name, Contact, Cash, Total Sales, Date
        row.getCell(1).value = index + 1; // Sr.No
        row.getCell(2).value = record.mrName; // MR Name
        row.getCell(3).value = record.mrContactNo; // Contact
        row.getCell(4).value = record.cash; // Cash
        row.getCell(5).value = record.totalSalesAmount; // Total Sales
        row.getCell(6).value = record.date; // Date
        
        // Format currency cells
        row.getCell(4).numFmt = '$#,##0.00'; // Cash
        row.getCell(5).numFmt = '$#,##0.00'; // Total Sales
        
      } else if (saleType === 'Credit Sales') {
        // Credit Sales: Sr.No, MR Name, Contact, Credits, Total Sales, Date
        row.getCell(1).value = index + 1; // Sr.No
        row.getCell(2).value = record.mrName; // MR Name
        row.getCell(3).value = record.mrContactNo; // Contact
        row.getCell(4).value = record.credits; // Credits
        row.getCell(5).value = record.totalSalesAmount; // Total Sales
        row.getCell(6).value = record.date; // Date
        
        // Format currency cells
        row.getCell(4).numFmt = '$#,##0.00'; // Credits
        row.getCell(5).numFmt = '$#,##0.00'; // Total Sales
        
      } else {
        // Total Sales: Sr.No, MR Name, Contact, Credits, Cash, Total Sales, Date
        row.getCell(1).value = index + 1; // Sr.No
        row.getCell(2).value = record.mrName; // MR Name
        row.getCell(3).value = record.mrContactNo; // Contact
        row.getCell(4).value = record.credits; // Credits
        row.getCell(5).value = record.cash; // Cash
        row.getCell(6).value = record.totalSalesAmount; // Total Sales
        row.getCell(7).value = record.date; // Date
        
        // Format currency cells
        row.getCell(4).numFmt = '$#,##0.00'; // Credits
        row.getCell(5).numFmt = '$#,##0.00'; // Cash
        row.getCell(6).numFmt = '$#,##0.00'; // Total Sales
      }

      // Add borders to all cells
      for (let i = 1; i <= columnCount; i++) {
        const cell = row.getCell(i);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      }
    });

    // Auto-fit columns
    for (let i = 1; i <= columnCount; i++) {
      let maxLength = 0;
      for (let row = 1; row <= worksheet.rowCount; row++) {
        const cell = worksheet.getRow(row).getCell(i);
        if (cell.value) {
          const cellLength = cell.value.toString().length;
          if (cellLength > maxLength) {
            maxLength = cellLength;
          }
        }
      }
      worksheet.getColumn(i).width = Math.min(maxLength + 2, 30);
    }

    // Generate filename
    const dateRangeStr = dateFilter === 'custom' && startDate && endDate 
      ? `${startDate}_to_${endDate}`
      : dateFilter || 'All_Records';
    
    const filename = generateFilename(dateFilter, saleType, dateRangeStr);

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Send the Excel file
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export data to Excel",
      error: error.message
    });
  }
});

router.get("/dailyReports/types", async (req, res) => {
  try {
    const types = await SaleType.find(
      {},
      { type: 1, sequenceNumber: 1, _id: 0 }
    ).sort({ sequenceNumber: 1 });

    res.json(types);
  } catch (err) {
    console.error("Error fetching sale types:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;