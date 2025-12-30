import express from "express";
import ExcelJS from 'exceljs';
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function to generate MR ID
const generateMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

// Main endpoint for MR wise sales
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

    // Base aggregation pipeline for all sales
    const basePipeline = [
      { $match: matchConditions },

      // Group by MR to get sales summary
      {
        $group: {
          _id: "$mrName",
          totalSalesAmount: { $sum: "$netSellingAmount" },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      // Calculate average order value
      {
        $addFields: {
          averageOrderValue: {
            $round: [{ $divide: ["$totalSalesAmount", "$totalOrders"] }, 2]
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

      // Format output
      {
        $project: {
          mrName: "$_id",
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalOrders: 1,
          averageOrderValue: 1,
          totalCustomers: { $size: "$uniqueCustomers" },
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

    const [countResult, mrData, summaryResult] = await Promise.all([
      SaleSummary.aggregate([...basePipeline, { $count: "totalCount" }]),
      
      SaleSummary.aggregate([
        ...basePipeline,
        { $skip: skip },
        { $limit: limitNum },
      ]),
      
      SaleSummary.aggregate([
        { $match: matchConditions },
        {
          $group: {
            _id: "$mrName",
            totalSalesAmount: { $sum: "$netSellingAmount" },
            totalOrders: { $sum: 1 },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalSalesAmount: { $sum: { $round: ["$totalSalesAmount", 2] } },
            totalOrders: { $sum: "$totalOrders" },
            totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
            totalMRs: { $sum: 1 },
          },
        },
        {
          $addFields: {
            averageOrderValue: {
              $round: [{ $divide: ["$totalSalesAmount", "$totalOrders"] }, 2]
            }
          }
        }
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    // Format records with sequential IDs
    const records = mrData.map((mr, index) => ({
      mrId: generateMRId(skip + index),
      mrName: mr.mrName,
      totalSalesAmount: mr.totalSalesAmount,
      totalOrders: mr.totalOrders,
      averageOrderValue: mr.averageOrderValue,
      totalCustomers: mr.totalCustomers,
      staff: mr.staff,
      region: mr.staff.teamName || "Not Available",
      email: mr.staff.email,
      contactNumber: mr.staff.contactNo,
    }));

    const summary = summaryResult[0] || {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalCustomers: 0,
      totalMRs: 0,
      averageOrderValue: 0,
    };

    res.json({
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
  } catch (err) {
    console.error("Error in /mr-wise-sales:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

// Export to Excel endpoint
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
          totalSalesAmount: { $sum: "$netSellingAmount" },
          totalOrders: { $sum: 1 },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
      },

      {
        $addFields: {
          averageOrderValue: {
            $round: [{ $divide: ["$totalSalesAmount", "$totalOrders"] }, 2]
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
          mrName: "$_id",
          totalSalesAmount: { $round: ["$totalSalesAmount", 2] },
          totalOrders: 1,
          averageOrderValue: 1,
          totalCustomers: { $size: "$uniqueCustomers" },
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

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MR Wise Sales System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('MR Wise Sales');
    
    // Define columns
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 10 },
      { header: 'MR ID', key: 'mrId', width: 15 },
      { header: 'MR Name', key: 'mrName', width: 25 },
      { header: 'Region', key: 'region', width: 20 },
      { header: 'Total Orders', key: 'totalOrders', width: 15 },
      { header: 'Total Sales ($)', key: 'totalSales', width: 20 },
      { header: 'Avg Order Value ($)', key: 'avgOrderValue', width: 20 }
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle'
    };
    headerRow.height = 25;

    // Add data rows with serial numbers
    mrData.forEach((mr, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        mrId: generateMRId(index),
        mrName: mr.mrName || 'N/A',
        region: mr.staff?.teamName || 'Not Available',
        totalOrders: mr.totalOrders || 0,
        totalSales: mr.totalSalesAmount || 0,
        avgOrderValue: mr.averageOrderValue || 0
      });

      // Style the row
      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle'
      };
      
      // Format currency cells
      const salesCell = row.getCell('totalSales');
      salesCell.numFmt = '$#,##0.00';
      
      const avgCell = row.getCell('avgOrderValue');
      avgCell.numFmt = '$#,##0.00';
    });

    // Calculate totals
    const totalSales = mrData.reduce((sum, mr) => sum + (mr.totalSalesAmount || 0), 0);
    const totalOrders = mrData.reduce((sum, mr) => sum + (mr.totalOrders || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    // Add summary section only if there's data
    if (mrData.length > 0) {
      worksheet.addRow({}); // Empty row for spacing
      
      // Add summary row
      const summaryRow = worksheet.addRow({});
      
      // Fill specific cells for summary
      summaryRow.getCell('mrName').value = 'TOTAL SUMMARY';
      summaryRow.getCell('totalOrders').value = totalOrders;
      summaryRow.getCell('totalSales').value = totalSales;
      summaryRow.getCell('avgOrderValue').value = avgOrderValue;

      // Style the summary row
      summaryRow.font = { bold: true, size: 12 };
      
      // Format summary currency cells
      const summarySalesCell = summaryRow.getCell('totalSales');
      summarySalesCell.numFmt = '$#,##0.00';
      
      const summaryAvgCell = summaryRow.getCell('avgOrderValue');
      summaryAvgCell.numFmt = '$#,##0.00';
    }

    // Apply borders to all cells
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

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
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

export default router;