import express from "express";
import ExcelJS from 'exceljs';
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function to generate MR ID
const generateMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

// Main endpoint for MR wise sales - FIXED VERSION
router.get("/mr-wise-sales", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // ✅ FIXED: Check which amount fields exist in your SaleSummary model
    // Try different possible amount field names
    const amountField = await getAmountFieldName();
    
    // Base aggregation pipeline for all sales
    const basePipeline = [
      { $match: matchConditions },

      // Group by MR to get sales summary
      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: { 
            $sum: { 
              $ifNull: [
                "$netSellingAmount", // Try this first
                "$totalAmount",      // Try alternative field names
                "$amount",
                "$salesAmount",
                0
              ] 
            } 
          },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      // Calculate average order value
      {
        $addFields: {
          averageOrderValue: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalOrders", 0] },
                  { $divide: ["$totalSalesAmount", "$totalOrders"] },
                  0
                ]
              },
              2
            ]
          }
        }
      },

      // Lookup staff details
      {
        $lookup: {
          from: "staffs",
          let: { mrName: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$medicalRepName", "$$mrName"] },
                    { $eq: ["$enabled", true] },
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      // Format output - Ensure zeros are properly formatted
      {
        $project: {
          mrName: { $ifNull: ["$_id", "Unknown"] },
          totalSalesAmount: { 
            $round: [
              { $ifNull: ["$totalSalesAmount", 0] },
              2
            ] 
          },
          totalOrders: { $ifNull: ["$totalOrders", 0] },
          averageOrderValue: { $ifNull: ["$averageOrderValue", 0] },
          totalCustomers: { 
            $cond: {
              if: { $isArray: "$uniqueCustomers" },
              then: { $size: "$uniqueCustomers" },
              else: 0
            }
          },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$_id",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
              },
            },
          },
        },
      },

      { $sort: { totalSalesAmount: -1 } },
    ];

    // Execute aggregations in parallel
    const [countResult, mrData, summaryResult] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),
      
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      
      // Summary aggregation with proper zero handling
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$mrName",
            totalSalesAmount: { 
              $sum: { 
                $ifNull: [
                  "$netSellingAmount",
                  "$totalAmount",
                  "$amount",
                  "$salesAmount",
                  0
                ] 
              } 
            },
            totalOrders: { $sum: 1 },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalSalesAmount: { 
              $sum: { 
                $round: [
                  { $ifNull: ["$totalSalesAmount", 0] },
                  2
                ]
              } 
            },
            totalOrders: { $sum: "$totalOrders" },
            totalCustomers: { 
              $sum: { 
                $cond: {
                  if: { $isArray: "$uniqueCustomers" },
                  then: { $size: "$uniqueCustomers" },
                  else: 0
                }
              } 
            },
            totalMRs: { $sum: 1 },
          },
        },
        {
          $addFields: {
            averageOrderValue: {
              $round: [
                {
                  $cond: [
                    { $gt: ["$totalOrders", 0] },
                    { $divide: ["$totalSalesAmount", "$totalOrders"] },
                    0
                  ]
                },
                2
              ]
            }
          }
        }
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // ✅ FIXED: Format records with proper zero handling
    const records = mrData.map((mr, index) => ({
      mrId: generateMRId(skip + index),
      mrName: mr.mrName || "Not Available",
      totalSalesAmount: parseFloat(mr.totalSalesAmount || 0).toFixed(2),
      totalOrders: mr.totalOrders || 0,
      averageOrderValue: parseFloat(mr.averageOrderValue || 0).toFixed(2),
      totalCustomers: mr.totalCustomers || 0,
      staff: mr.staff || {},
      region: mr.staff?.teamName || "Not Available",
      email: mr.staff?.email || "Not Available",
      contactNumber: mr.staff?.contactNo || "Not Available",
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalMRs: 0,
      averageOrderValue: 0,
    };

    // ✅ FIXED: Ensure summary values are properly formatted
    const formattedSummary = {
      totalSalesAmount: parseFloat(summary.totalSalesAmount || 0).toFixed(2),
      totalOrders: summary.totalOrders || 0,
      totalCustomers: summary.totalCustomers || 0,
      totalMRs: summary.totalMRs || 0,
      averageOrderValue: parseFloat(summary.averageOrderValue || 0).toFixed(2),
    };

    res.json({
      data: {
        summary: formattedSummary,
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
  } catch (err) {
    console.error("Error in /mr-wise-sales:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

// Helper function to determine the correct amount field name
async function getAmountFieldName() {
  try {
    // Sample one document to see what fields exist
    const sampleDoc = await SaleSummary.findOne({});
    
    if (sampleDoc) {
      const doc = sampleDoc.toObject();
      
      // Check which amount field exists
      if (doc.netSellingAmount !== undefined) return "$netSellingAmount";
      if (doc.totalAmount !== undefined) return "$totalAmount";
      if (doc.amount !== undefined) return "$amount";
      if (doc.salesAmount !== undefined) return "$salesAmount";
      if (doc.grandTotal !== undefined) return "$grandTotal";
      if (doc.invoiceAmount !== undefined) return "$invoiceAmount";
    }
    
    return "$netSellingAmount"; // Default
  } catch (error) {
    console.error("Error detecting amount field:", error);
    return "$netSellingAmount"; // Default
  }
}

// Export to Excel endpoint - FIXED VERSION
router.get("/mr-wise-sales/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const matchConditions = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          error: "Invalid date format. Please use YYYY-MM-DD format.",
        });
      }

      matchConditions.invoiceDate = {
        $gte: start,
        $lte: end,
      };
    }

    if (search?.trim()) {
      matchConditions.mrName = { $regex: search.trim(), $options: "i" };
    }

    // Get all MR sales data without pagination for export
    const mrData = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: { 
            $sum: { 
              $ifNull: [
                "$netSellingAmount",
                "$totalAmount",
                "$amount",
                "$salesAmount",
                0
              ] 
            } 
          },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      {
        $addFields: {
          averageOrderValue: {
            $round: [
              {
                $cond: [
                  { $gt: ["$totalOrders", 0] },
                  { $divide: ["$totalSalesAmount", "$totalOrders"] },
                  0
                ]
              },
              2
            ]
          }
        }
      },

      {
        $lookup: {
          from: "staffs",
          let: { mrName: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$medicalRepName", "$$mrName"] },
                    { $eq: ["$enabled", true] },
                  ],
                },
              },
            },
            {
              $project: {
                medicalRepName: 1,
                teamName: 1,
                contactNo: 1,
                email: 1,
              },
            },
          ],
          as: "staffDetails",
        },
      },

      {
        $project: {
          mrName: { $ifNull: ["$_id", "Unknown"] },
          totalSalesAmount: { 
            $round: [
              { $ifNull: ["$totalSalesAmount", 0] },
              2
            ] 
          },
          totalOrders: { $ifNull: ["$totalOrders", 0] },
          averageOrderValue: { $ifNull: ["$averageOrderValue", 0] },
          totalCustomers: { 
            $cond: {
              if: { $isArray: "$uniqueCustomers" },
              then: { $size: "$uniqueCustomers" },
              else: 0
            }
          },
          staff: {
            $cond: {
              if: { $gt: [{ $size: "$staffDetails" }, 0] },
              then: { $arrayElemAt: ["$staffDetails", 0] },
              else: {
                medicalRepName: "$_id",
                contactNo: "Not Available",
                email: "Not Available",
                teamName: "Not Available",
              },
            },
          },
        },
      },

      { $sort: { totalSalesAmount: -1 } },
    ]);

    // ✅ FIXED: Calculate totals with proper zero handling
    const totalSales = mrData.reduce((sum, mr) => {
      return sum + parseFloat(mr.totalSalesAmount || 0);
    }, 0);
    
    const totalOrders = mrData.reduce((sum, mr) => {
      return sum + (mr.totalOrders || 0);
    }, 0);
    
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MR Wise Sales System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('MR Wise Sales');
    
    // ✅ FIXED: Add title row matching your screenshot
    worksheet.mergeCells('A1:G1');
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = 'MR Wise Sales Report';
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };
    
    // ✅ FIXED: Add summary statistics like your screenshot
    worksheet.mergeCells('A3:C3');
    worksheet.getCell('A3').value = `Total Sales: $${parseFloat(totalSales).toFixed(2)}`;
    worksheet.getCell('A3').font = { bold: true, size: 12 };
    
    worksheet.mergeCells('A4:C4');
    worksheet.getCell('A4').value = `Total Orders: ${totalOrders}`;
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    
    worksheet.mergeCells('A5:C5');
    worksheet.getCell('A5').value = `Avg Order Value: $${parseFloat(avgOrderValue).toFixed(2)}`;
    worksheet.getCell('A5').font = { bold: true, size: 12 };
    
    // Empty row for spacing
    worksheet.addRow({});

    // Define columns - matching your screenshot format
    const headerRowNum = 7;
    worksheet.getCell(`A${headerRowNum}`).value = 'Sr.No';
    worksheet.getCell(`B${headerRowNum}`).value = 'MR Name';
    worksheet.getCell(`C${headerRowNum}`).value = 'Region';
    worksheet.getCell(`D${headerRowNum}`).value = 'Total Orders';
    worksheet.getCell(`E${headerRowNum}`).value = 'Total Sales';
    worksheet.getCell(`F${headerRowNum}`).value = 'Avg Order Value';

    // Style the header row
    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle'
    };
    headerRow.height = 25;
    
    // Style header cells background
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    // Add data rows with serial numbers
    mrData.forEach((mr, index) => {
      const rowNum = headerRowNum + index + 1;
      const row = worksheet.getRow(rowNum);

      row.getCell(1).value = index + 1; // Sr.No
      row.getCell(2).value = mr.mrName || 'N/A';
      row.getCell(3).value = mr.staff?.teamName || 'Not Available';
      row.getCell(4).value = mr.totalOrders || 0;
      row.getCell(5).value = parseFloat(mr.totalSalesAmount || 0);
      row.getCell(5).numFmt = '$#,##0.00';
      row.getCell(6).value = parseFloat(mr.averageOrderValue || 0);
      row.getCell(6).numFmt = '$#,##0.00';

      // Center align serial numbers and orders
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
    });

    // Auto-fit columns
    worksheet.columns = [
      { key: 'serialNo', width: 10 },
      { key: 'mrName', width: 25 },
      { key: 'region', width: 20 },
      { key: 'totalOrders', width: 15 },
      { key: 'totalSales', width: 20 },
      { key: 'avgOrderValue', width: 18 },
    ];

    // Apply borders to all cells
    const dataEndRow = headerRowNum + mrData.length;
    for (let i = headerRowNum; i <= dataEndRow; i++) {
      const row = worksheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // Generate filename
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = 'mr-wise-sales';
    if (startDate && endDate) {
      fileName = `mr-wise-sales-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `mr-wise-sales-${formattedDate.replace(/-/g, '')}`;
    }
    fileName += '.xlsx';

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    // Write workbook to buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (err) {
    console.error("Error in /mr-wise-sales/export/excel:", err);
    res.status(500).json({
      error: "Failed to generate Excel export",
      message: err.message,
    });
  }
});

// ✅ NEW: Debug endpoint to check SaleSummary data structure
router.get("/debug-sales-data", async (req, res) => {
  try {
    const sampleDocs = await SaleSummary.find({}).limit(5);
    
    // Check what fields exist in the documents
    const fieldAnalysis = sampleDocs.map(doc => {
      const docObj = doc.toObject();
      return {
        _id: doc._id,
        mrName: doc.mrName,
        fields: Object.keys(docObj).filter(key => 
          key.toLowerCase().includes('amount') || 
          key.toLowerCase().includes('total') ||
          key.toLowerCase().includes('price')
        ).map(key => ({
          field: key,
          value: docObj[key],
          type: typeof docObj[key]
        }))
      };
    });

    res.json({
      success: true,
      sampleCount: sampleDocs.length,
      fieldAnalysis,
      allFields: sampleDocs.length > 0 ? Object.keys(sampleDocs[0].toObject()) : []
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;