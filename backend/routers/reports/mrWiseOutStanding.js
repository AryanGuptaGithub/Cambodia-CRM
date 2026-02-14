import express from "express";
import ExcelJS from 'exceljs';
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper function to generate MR ID
const generateMRId = (index) => {
  return `MR${String(index + 1).padStart(3, "0")}`;
};

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 7, search, startDate, endDate } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = { dueAmount: { $gt: 0 } };

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

    // Base aggregation pipeline
    const basePipeline = [
      { $match: matchConditions },

      {
        $group: {
          _id: "$mrName",
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
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
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
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

      { $sort: { totalOutstandingAmount: -1 } },
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
            totalOutstandingAmount: { $sum: "$dueAmount" },
            uniqueCustomers: { $addToSet: "$customerCode" },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstandingAmount: {
              $sum: { $round: ["$totalOutstandingAmount", 2] },
            },
            totalCustomers: { $sum: { $size: "$uniqueCustomers" } },
            totalMRs: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalRecords = countResult[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalRecords / limitNum);

    const records = mrData.map((mr, index) => ({
      mrId: generateMRId(skip + index),
      mrName: mr.mrName,
      totalOutstandingAmount: mr.totalOutstandingAmount,
      totalCustomers: mr.totalCustomers,
      staff: mr.staff,
    }));

    const summary = summaryResult[0] || {
      totalOutstandingAmount: 0,
      totalCustomers: 0,
      totalMRs: 0,
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
    console.error("Error in MR wise outstanding:", err);
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

router.get("/export/excel", async (req, res) => {
  try {
    const { search, startDate, endDate } = req.query;
    const matchConditions = { dueAmount: { $gt: 0 } };

    // Handle date parameters
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

    // Get all MR data without pagination for export
    const mrData = await SaleSummary.aggregate([
      { $match: matchConditions },

      {
        $group: {
          _id: "$mrName",
          totalOutstandingAmount: { $sum: "$dueAmount" },
          uniqueCustomers: { $addToSet: "$customerCode" },
        },
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
          totalOutstandingAmount: { $round: ["$totalOutstandingAmount", 2] },
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

      { $sort: { totalOutstandingAmount: -1 } },
    ]);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MR Wise Outstanding System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('MR Wise Outstanding');
    
    // Define columns
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 10 },
      { header: 'MR ID', key: 'mrId', width: 15 },
      { header: 'MR Name', key: 'mrName', width: 30 },
      { header: 'Contact', key: 'contact', width: 20 },
      { header: 'Total Customers', key: 'totalCustomers', width: 15 },
      { header: 'Total Outstanding ($)', key: 'totalOutstanding', width: 20 }
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
      const rowNumber = index + 2;
      const row = worksheet.addRow({
        serialNo: index + 1,
        mrId: generateMRId(index),
        mrName: mr.mrName || 'N/A',
        contact: mr.staff?.contactNo || 'Not Available',
        totalCustomers: mr.totalCustomers || 0,
        totalOutstanding: mr.totalOutstandingAmount || 0
      });

      // Style the row
      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle'
      };
      
      // Format outstanding amount as currency
      const outstandingCell = row.getCell('totalOutstanding');
      outstandingCell.numFmt = '$#,##0.00';
    });

    // Calculate totals
    const totalOutstanding = mrData.reduce((sum, mr) => sum + (mr.totalOutstandingAmount || 0), 0);
    const totalCustomers = mrData.reduce((sum, mr) => sum + (mr.totalCustomers || 0), 0);

    // Add summary section only if there's data
    if (mrData.length > 0) {
      worksheet.addRow({});
      
      // Add summary row
      const summaryRow = worksheet.addRow({});
      
      // Fill specific cells for summary
      summaryRow.getCell('mrName').value = 'TOTAL SUMMARY';
      summaryRow.getCell('totalCustomers').value = totalCustomers;
      summaryRow.getCell('totalOutstanding').value = totalOutstanding;

      // Style the summary row
      summaryRow.font = { bold: true, size: 12 };
      
      // Format summary outstanding amount as currency
      const summaryOutstandingCell = summaryRow.getCell('totalOutstanding');
      summaryOutstandingCell.numFmt = '$#,##0.00';
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
    
    let fileName = 'mr-wise-outstanding';
    if (startDate && endDate) {
      fileName = `mr-wise-outstanding-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `mr-wise-outstanding-${formattedDate.replace(/-/g, '')}`;
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
    console.error("Error in Excel export:", err);
    res.status(500).json({
      error: "Failed to generate Excel export",
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

export default router;
