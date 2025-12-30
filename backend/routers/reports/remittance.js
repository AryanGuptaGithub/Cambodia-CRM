import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Supplier from "../../models/master/supplier.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to get remittance data (reusable for both API and export)
const getRemittanceData = async (filters) => {
  const { startDate, endDate, search, supplierId, period, year, month } = filters;

  // First, get the remittance category ID
  const remittanceCategory = await Category.findOne({ code: "remittance" });

  if (!remittanceCategory) {
    throw new Error("Remittance category not found");
  }

  const matchStage = {
    categoryType: remittanceCategory._id,
  };

  // Handle supplier filter
  if (supplierId) {
    matchStage.supplier = supplierId;
  }

  // Handle period filtering
  if (period || year || month) {
    matchStage.date = {};

    let start, end;

    if (period === "monthly" && year && month) {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === "quarterly" && year) {
      const quarter = Math.floor((month - 1) / 3);
      start = new Date(year, quarter * 3, 1);
      end = new Date(year, (quarter + 1) * 3, 0);
      end.setHours(23, 59, 59, 999);
    } else if (period === "yearly" && year) {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      end.setHours(23, 59, 59, 999);
    }

    if (start && end) {
      matchStage.date.$gte = start;
      matchStage.date.$lte = end;
    }
  }

  // Handle custom date range
  if (startDate || endDate) {
    matchStage.date = matchStage.date || {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        matchStage.date.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        matchStage.date.$lte = end;
      }
    }
  }

  // Build aggregation pipeline with grouping by supplier
  const pipeline = [
    { $match: matchStage },
    // Lookup supplier details first for grouping
    {
      $lookup: {
        from: "suppliers",
        localField: "supplier",
        foreignField: "_id",
        as: "supplierInfo",
      },
    },
    {
      $unwind: {
        path: "$supplierInfo",
        preserveNullAndEmptyArrays: true,
      },
    },
    // Group by supplier
    {
      $group: {
        _id: "$supplier",
        supplierName: { $first: "$supplierInfo.name" },
        supplierCode: { $first: "$supplierInfo.code" }, // Added supplier code
        totalRemittanceAmount: { $sum: "$amount" },
        totalFinalAmount: { $sum: "$finalAmount" },
        totalExchangeLoss: { $sum: "$exchangeLoss" },
        transactionCount: { $sum: 1 },
        latestTransactionDate: { $max: "$date" },
      },
    },
  ];

  // Apply search filter after grouping
  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        $or: [
          { supplierName: { $regex: searchRegex } },
          { supplierCode: { $regex: searchRegex } }, // Added search by supplier code
        ],
      },
    });
  }

  // Add sorting
  pipeline.push({ $sort: { totalRemittanceAmount: -1 } });

  const records = await Transaction.aggregate(pipeline);

  // Calculate summary
  const summary = {
    totalRemittanceAmount: records.reduce((sum, record) => sum + (record.totalRemittanceAmount || 0), 0),
    totalFinalAmount: records.reduce((sum, record) => sum + (record.totalFinalAmount || 0), 0),
    totalExchangeLoss: records.reduce((sum, record) => sum + (record.totalExchangeLoss || 0), 0),
    totalSuppliers: records.length,
    totalTransactions: records.reduce((sum, record) => sum + (record.transactionCount || 0), 0),
  };

  return { records, summary };
};

// Existing API route
router.get("/reports/remittance", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      period,
      year,
      month,
      supplierId,
    } = req.query;

    // Validate date parameters
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate format. Use YYYY-MM-DD format.",
        });
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate format. Use YYYY-MM-DD format.",
        });
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const { records, summary } = await getRemittanceData({
      startDate,
      endDate,
      search,
      supplierId,
      period,
      year,
      month,
    });

    const totalCount = records.length;
    const paginatedData = records.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data: {
        summary: {
          ...summary,
          totalRecords: totalCount,
        },
        records: paginatedData.map(record => ({
          supplierId: record._id,
          supplierName: record.supplierName,
          supplierCode: record.supplierCode, // Include supplierCode in API response
          totalRemittanceAmount: record.totalRemittanceAmount,
          totalFinalAmount: record.totalFinalAmount,
          totalExchangeLoss: record.totalExchangeLoss,
          transactionCount: record.transactionCount,
          latestTransactionDate: record.latestTransactionDate,
        })),
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: paginatedData.length,
    });
  } catch (error) {
    console.error("Error in remittance report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching remittance data",
      error: error.message,
    });
  }
});

// Add Excel export route
router.get("/reports/remittance/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, supplierId } = req.query;

    console.log("Remittance Excel export request received with params:", {
      startDate,
      endDate,
      search,
      supplierId
    });

    // Validate date parameters for export
    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate format for export. Use YYYY-MM-DD format.",
        });
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate format for export. Use YYYY-MM-DD format.",
        });
      }
    }

    // Get remittance data using the same helper function
    const { records, summary } = await getRemittanceData({
      startDate,
      endDate,
      search,
      supplierId,
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Remittance Report System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Remittance Report');
    
    // Define columns
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 8 },
      { header: 'Supplier Code', key: 'supplierCode', width: 15 },
      { header: 'Supplier Name', key: 'supplierName', width: 25 },
      { header: 'Total Remittance Amount ($)', key: 'totalRemittanceAmount', width: 22 },
      { header: 'Total Final Amount ($)', key: 'totalFinalAmount', width: 20 },
      { header: 'Total Exchange Loss ($)', key: 'totalExchangeLoss', width: 20 },
      { header: 'Total Transactions', key: 'transactionCount', width: 15 },
      { header: 'Last Transaction Date', key: 'latestTransactionDate', width: 18 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle'
    };
    headerRow.height = 25;
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows with serial numbers
    records.forEach((record, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        supplierCode: record.supplierCode || 'N/A',
        supplierName: record.supplierName || 'N/A',
        totalRemittanceAmount: record.totalRemittanceAmount || 0,
        totalFinalAmount: record.totalFinalAmount || 0,
        totalExchangeLoss: record.totalExchangeLoss || 0,
        transactionCount: record.transactionCount || 0,
        latestTransactionDate: record.latestTransactionDate,
      });

      // Style the row
      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle',
        horizontal: 'center'
      };

      // Format date cell
      const dateCell = row.getCell('latestTransactionDate');
      if (record.latestTransactionDate) {
        dateCell.value = new Date(record.latestTransactionDate);
        dateCell.numFmt = 'dd-mm-yyyy';
        dateCell.alignment = { horizontal: 'center' };
      }
      
      // Format currency cells
      const remittanceCell = row.getCell('totalRemittanceAmount');
      remittanceCell.numFmt = '$#,##0.00';
      remittanceCell.alignment = { horizontal: 'center' };
      
      const finalAmountCell = row.getCell('totalFinalAmount');
      finalAmountCell.numFmt = '$#,##0.00';
      finalAmountCell.alignment = { horizontal: 'center' };
      
      const exchangeLossCell = row.getCell('totalExchangeLoss');
      exchangeLossCell.numFmt = '$#,##0.00';
      exchangeLossCell.alignment = { horizontal: 'center' };
      
      // Format transaction count
      const transactionCell = row.getCell('transactionCount');
      transactionCell.alignment = { horizontal: 'center' };
    });

    // Add summary section if there's data or even if empty
    if (records.length > 0) {
      // Add empty row for spacing
      worksheet.addRow({});

      // Add summary header
      const summaryHeader = worksheet.addRow(['SUMMARY']);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: 'center' };
      summaryHeader.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD0D0D0' }
      };
      worksheet.mergeCells(`A${summaryHeader.number}:H${summaryHeader.number}`);

      // Add summary data
      const summaryData = [
        { label: 'Total Suppliers:', value: summary.totalSuppliers },
        { label: 'Total Transactions:', value: summary.totalTransactions },
        { label: 'Total Remittance Amount:', value: summary.totalRemittanceAmount },
        { label: 'Total Exchange Loss:', value: summary.totalExchangeLoss },
        { label: 'Grand Total:', value: summary.totalRemittanceAmount  + summary.totalExchangeLoss }
      ];

      summaryData.forEach((item, index) => {
        const row = worksheet.addRow({
          serialNo: item.label,
          supplierName: item.value
        });
        row.font = { bold: true };
        
        // Format value cells
        const valueCell = row.getCell('supplierName');
        if (item.label.includes('Amount') || item.label.includes('Loss') || item.label.includes('Grand Total')) {
          valueCell.numFmt = '$#,##0.00';
          valueCell.alignment = { horizontal: 'right' };
        } else {
          valueCell.alignment = { horizontal: 'right' };
        }
      });
    } else {
      // Add "No Data" message if empty
      const noDataRow = worksheet.addRow(['No remittance data found for the selected criteria']);
      noDataRow.font = { italic: true, color: { argb: 'FF666666' } };
      noDataRow.alignment = { horizontal: 'center' };
      noDataRow.height = 30;
      worksheet.mergeCells(`A${noDataRow.number}:H${noDataRow.number}`);
    }

    // Apply borders to all cells
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Auto-filter on header row if there's data
    if (records.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount }
      };
    }

    // Auto-size columns for better fit
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value ? cell.value.toString().length : 10;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });
      column.width = Math.min(maxLength + 2, 30); // Cap at 30 characters
    });

    // Generate filename with timestamp
    const currentDate = new Date();
    const timestamp = currentDate.getTime();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = `remittance-report-${timestamp}`;
    if (startDate && endDate) {
      fileName = `remittance-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}-${timestamp}`;
    } else if (startDate) {
      fileName = `remittance-from-${startDate.replace(/-/g, '')}-${timestamp}`;
    } else if (endDate) {
      fileName = `remittance-to-${endDate.replace(/-/g, '')}-${timestamp}`;
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

  } catch (error) {
    console.error("Error in /reports/remittance/export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;