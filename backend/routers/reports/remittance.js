import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Supplier from "../../models/master/supplier.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to get remittance data (reusable for both API and export)
const getRemittanceData = async (filters) => {
  const { startDate, endDate, search, supplierId, period, year, month } = filters;

  // First, get the remittance category
  const remittanceCategory = await Category.findOne({ code: "remittance" });
  if (!remittanceCategory) {
    throw new Error("Remittance category not found");
  }

  // Build match condition for remittance transactions
  // Allow multiple ways: categoryType as ObjectId, categoryType as string "Remittance", or transactionType as "remittance"
  const categoryMatch = {
    $or: [
      { categoryType: remittanceCategory._id },
      { categoryType: { $regex: /^remittance$/i } },
      { transactionType: "remittance" }
    ]
  };

  let matchStage = { ...categoryMatch };

  // Date filters
  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) matchStage.date.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        matchStage.date.$lte = end;
      }
    }
  }

  // Period filtering (if used)
  if (period || year || month) {
    matchStage.date = matchStage.date || {};
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

  // Supplier filter: if supplierId is provided, fetch the supplier name and filter by name
  let supplierName = null;
  if (supplierId) {
    const supplier = await Supplier.findById(supplierId);
    if (supplier) {
      supplierName = supplier.name;
      matchStage.supplier = supplierName; // Assuming supplier field contains the name string
    }
  }

  // Build aggregation pipeline
  const pipeline = [
    { $match: matchStage },
    // Group by supplier (which is a string name)
    {
      $group: {
        _id: "$supplier",
        totalRemittanceAmount: { $sum: "$amount" },
        totalFinalAmount: { $sum: "$finalAmount" },
        totalExchangeLoss: { $sum: "$exchangeLoss" },
        transactionCount: { $sum: 1 },
        latestTransactionDate: { $max: "$date" },
      }
    }
  ];

  // Apply search filter after grouping (search by supplier name)
  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    pipeline.push({
      $match: {
        _id: { $regex: searchRegex } // _id is the supplier name
      }
    });
  }

  // Add sorting
  pipeline.push({ $sort: { totalRemittanceAmount: -1 } });

  const records = await Transaction.aggregate(pipeline);

  // Prepare records with supplier name
  const formattedRecords = records.map(record => ({
    supplierId: null, // we don't have ObjectId; could be set if we had a way to map name to id
    supplierName: record._id || "Unknown Supplier",
    totalRemittanceAmount: record.totalRemittanceAmount,
    totalFinalAmount: record.totalFinalAmount,
    totalExchangeLoss: record.totalExchangeLoss,
    transactionCount: record.transactionCount,
    latestTransactionDate: record.latestTransactionDate,
  }));

  // Calculate summary
  const summary = {
    totalRemittanceAmount: formattedRecords.reduce((sum, rec) => sum + (rec.totalRemittanceAmount || 0), 0),
    totalFinalAmount: formattedRecords.reduce((sum, rec) => sum + (rec.totalFinalAmount || 0), 0),
    totalExchangeLoss: formattedRecords.reduce((sum, rec) => sum + (rec.totalExchangeLoss || 0), 0),
    totalSuppliers: formattedRecords.length,
    totalTransactions: formattedRecords.reduce((sum, rec) => sum + (rec.transactionCount || 0), 0),
  };

  return { records: formattedRecords, summary };
};

// Route: GET / (now mounted at /api/reports/remittance)
router.get("/", async (req, res) => {
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
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format. Use YYYY-MM-DD format.",
      });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format. Use YYYY-MM-DD format.",
      });
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
          supplierId: record.supplierId,
          supplierName: record.supplierName,
          supplierCode: record.supplierCode,
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

// Export to Excel route
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, supplierId } = req.query;

    if (startDate && isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid startDate format for export. Use YYYY-MM-DD format.",
      });
    }
    if (endDate && isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid endDate format for export. Use YYYY-MM-DD format.",
      });
    }

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

    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 8 },
      { header: 'Supplier Name', key: 'supplierName', width: 25 },
      { header: 'Total Remittance Amount ($)', key: 'totalRemittanceAmount', width: 22 },
      { header: 'Total Final Amount ($)', key: 'totalFinalAmount', width: 20 },
      { header: 'Total Exchange Loss ($)', key: 'totalExchangeLoss', width: 20 },
      { header: 'Total Transactions', key: 'transactionCount', width: 15 },
      { header: 'Last Transaction Date', key: 'latestTransactionDate', width: 18 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    records.forEach((record, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        supplierName: record.supplierName || 'N/A',
        totalRemittanceAmount: record.totalRemittanceAmount || 0,
        totalFinalAmount: record.totalFinalAmount || 0,
        totalExchangeLoss: record.totalExchangeLoss || 0,
        transactionCount: record.transactionCount || 0,
        latestTransactionDate: record.latestTransactionDate,
      });

      row.font = { size: 11 };
      row.alignment = { vertical: 'middle', horizontal: 'center' };

      const dateCell = row.getCell('latestTransactionDate');
      if (record.latestTransactionDate) {
        dateCell.value = new Date(record.latestTransactionDate);
        dateCell.numFmt = 'dd-mm-yyyy';
        dateCell.alignment = { horizontal: 'center' };
      }

      const remittanceCell = row.getCell('totalRemittanceAmount');
      remittanceCell.numFmt = '$#,##0.00';
      const finalAmountCell = row.getCell('totalFinalAmount');
      finalAmountCell.numFmt = '$#,##0.00';
      const exchangeLossCell = row.getCell('totalExchangeLoss');
      exchangeLossCell.numFmt = '$#,##0.00';
    });

    // Summary section
    if (records.length > 0) {
      worksheet.addRow({});
      const summaryHeader = worksheet.addRow(['SUMMARY']);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: 'center' };
      summaryHeader.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD0D0D0' }
      };
      worksheet.mergeCells(`A${summaryHeader.number}:G${summaryHeader.number}`);

      const summaryData = [
        { label: 'Total Suppliers:', value: summary.totalSuppliers },
        { label: 'Total Transactions:', value: summary.totalTransactions },
        { label: 'Total Remittance Amount:', value: summary.totalRemittanceAmount },
        { label: 'Total Exchange Loss:', value: summary.totalExchangeLoss },
        { label: 'Grand Total:', value: summary.totalRemittanceAmount + summary.totalExchangeLoss }
      ];

      summaryData.forEach((item) => {
        const row = worksheet.addRow({ serialNo: item.label, supplierName: item.value });
        row.font = { bold: true };
        const valueCell = row.getCell('supplierName');
        if (item.label.includes('Amount') || item.label.includes('Loss') || item.label.includes('Grand Total')) {
          valueCell.numFmt = '$#,##0.00';
        }
        valueCell.alignment = { horizontal: 'right' };
      });
    } else {
      const noDataRow = worksheet.addRow(['No remittance data found for the selected criteria']);
      noDataRow.font = { italic: true, color: { argb: 'FF666666' } };
      noDataRow.alignment = { horizontal: 'center' };
      noDataRow.height = 30;
      worksheet.mergeCells(`A${noDataRow.number}:G${noDataRow.number}`);
    }

    // Borders
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    if (records.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount }
      };
    }

    // Auto-size columns
    worksheet.columns.forEach(column => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const cellLength = cell.value ? cell.value.toString().length : 10;
        if (cellLength > maxLength) maxLength = cellLength;
      });
      column.width = Math.min(maxLength + 2, 30);
    });

    const timestamp = Date.now();
    const fileName = `remittance-report-${timestamp}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("Error in /export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;