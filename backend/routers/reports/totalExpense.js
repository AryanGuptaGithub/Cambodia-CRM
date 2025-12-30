import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Expense from "../../models/expenses/addExpense.js";
import Purchase from "../../models/purcharsing/purchaseInventory.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to safely format dates
const safeDateToString = (date) => {
  if (!date) return null;
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString().split("T")[0];
  } catch (error) {
    return null;
  }
};

// Helper function for date comparison in sorting
const safeDateCompare = (a, b) => {
  try {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;

    return dateB - dateA;
  } catch (error) {
    return 0;
  }
};

// Helper function to get financial data (reusable for both API and export)
const getFinancialData = async (filters) => {
  const { startDate, endDate, search, expenseType } = filters;

  // Build date filter
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        dateFilter.date.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = end;
      }
    }
  }

  // Get category IDs
  const remittanceCategory = await Category.findOne({ code: "remittance" });
  const salaryCategory = await Category.findOne({ code: "salary" });

  // Fetch data from all sources
  const [
    purchaseData,
    remittanceData,
    expenseData,
    salaryData,
    exchangeLossData,
  ] = await Promise.all([
    // 1. Purchase Data
    Purchase.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            date: "$date",
            amount: "$amount",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: { $literal: "purchase" },
          description: 1,
          amount: 1,
          referenceNumber: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]),

    // 2. Remittance Data (ONLY from transactions with remittance category)
    Transaction.aggregate([
      {
        $match: {
          ...dateFilter,
          categoryType: remittanceCategory?._id,
        },
      },
      {
        $group: {
          _id: {
            date: "$date",
            description: "$description",
            amount: "$amount",
            referenceNumber: "$referenceNumber",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: { $literal: "remittance" },
          description: 1,
          amount: 1,
          referenceNumber: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]),

    // 3. Expense Data
    Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            date: "$date",
            description: "$description",
            amount: "$amount",
            referenceNumber: "$referenceNumber",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: { $literal: "expense" },
          description: 1,
          amount: 1,
          referenceNumber: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]),

    // 4. Salary Data (transactions with salary category)
    Transaction.aggregate([
      {
        $match: {
          ...dateFilter,
          categoryType: salaryCategory?._id,
        },
      },
      {
        $group: {
          _id: {
            date: "$date",
            description: "$description",
            amount: "$amount",
            referenceNumber: "$referenceNumber",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: { $literal: "salary" },
          description: 1,
          amount: 1,
          referenceNumber: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]),

    // 5. Exchange Loss Data (from transactions)
    Transaction.aggregate([
      {
        $match: {
          ...dateFilter,
          exchangeLoss: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            date: "$date",
            description: "$description",
            exchangeLoss: "$exchangeLoss",
            referenceNumber: "$referenceNumber",
          },
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          type: { $literal: "exchange_loss" },
          description: 1,
          amount: "$exchangeLoss",
          referenceNumber: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]),
  ]);

  let allData = [];
  const seenKeys = new Set();

  const processDataWithPriority = (dataArray, type) => {
    dataArray.forEach((item) => {
      try {
        const normalizedDate = safeDateToString(item.date);
        const normalizedDescription = (item.description || "")
          .toString()
          .trim()
          .toLowerCase();
        const normalizedAmount = parseFloat(item.amount || 0).toFixed(2);
        const normalizedRef = (item.referenceNumber || "")
          .toString()
          .trim()
          .toLowerCase();

        const exactKey = `${normalizedDate}|${normalizedDescription}|${normalizedAmount}|${normalizedRef}|${type}`;
        const amountDateKey = `${normalizedDate}|${normalizedAmount}|${type}`;
        const descriptionAmountKey = `${normalizedDescription}|${normalizedAmount}|${type}`;

        const isDuplicate =
          seenKeys.has(exactKey) ||
          seenKeys.has(amountDateKey) ||
          seenKeys.has(descriptionAmountKey);

        if (!isDuplicate) {
          // Add to all keys to prevent future duplicates
          seenKeys.add(exactKey);
          seenKeys.add(amountDateKey);
          seenKeys.add(descriptionAmountKey);

          allData.push({
            ...item,
            type: type,
            // Ensure consistent data structure
            date: normalizedDate ? new Date(normalizedDate) : item.date,
            description: normalizedDescription,
            amount: parseFloat(normalizedAmount),
            referenceNumber: normalizedRef,
          });
        }
      } catch (error) {
        console.error(`Error processing ${type} item:`, error, item);
        // Add with fallback key to avoid data loss
        const fallbackKey = `${item._id}-${type}`;
        if (!seenKeys.has(fallbackKey)) {
          seenKeys.add(fallbackKey);
          allData.push({
            ...item,
            type: type,
          });
        }
      }
    });
  };

  processDataWithPriority(remittanceData, "remittance");
  processDataWithPriority(purchaseData, "purchase");
  processDataWithPriority(expenseData, "expense");
  processDataWithPriority(salaryData, "salary");
  processDataWithPriority(exchangeLossData, "exchange_loss");

  if (search && search.trim() !== "") {
    const searchRegex = new RegExp(search.trim(), "i");
    allData = allData.filter(
      (item) =>
        (item.description && item.description.match(searchRegex)) ||
        (item.referenceNumber && item.referenceNumber.match(searchRegex))
    );
  }

  if (expenseType && expenseType !== "all") {
    allData = allData.filter((item) => item.type === expenseType);
  }

  allData.sort(safeDateCompare);

  // Calculate summary
  const summary = {
    totalPurchase: allData
      .filter((item) => item.type === "purchase")
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    totalExchangeLoss: allData
      .filter((item) => item.type === "exchange_loss")
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    totalRemittance: allData
      .filter((item) => item.type === "remittance")
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    totalExpense: allData
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    totalSalary: allData
      .filter((item) => item.type === "salary")
      .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
    totalTransactions: allData.length,
  };

  return { allData, summary };
};

router.get("/reports/financial-summary", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      expenseType,
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const { allData, summary } = await getFinancialData({
      startDate,
      endDate,
      search,
      expenseType,
    });

    const totalCount = allData.length;
    const paginatedData = allData.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    return res.json({
      success: true,
      data: paginatedData,
      summary: summary,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error in financial summary report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching financial summary data",
      error: error.message,
    });
  }
});

// Add Excel export route
router.get("/reports/financial-summary/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, expenseType } = req.query;

    // Get financial data using the same helper function
    const { allData, summary } = await getFinancialData({
      startDate,
      endDate,
      search,
      expenseType,
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Financial Summary System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Financial Summary Report');
    
    // Define columns - REMOVED Description and Reference Number columns
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 8 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Amount ($)', key: 'amount', width: 15 },
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
    allData.forEach((item, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        date: item.date,
        type: getTypeDisplayName(item.type),
        amount: item.amount || 0
      });

      // Style the row
      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle',
        horizontal: 'center'
      };

      // Format date cell
      const dateCell = row.getCell('date');
      if (item.date) {
        dateCell.value = new Date(item.date);
        dateCell.numFmt = 'dd-mm-yyyy';
        dateCell.alignment = { horizontal: 'center' };
      }
      
      // Format type cell
      const typeCell = row.getCell('type');
      typeCell.alignment = { horizontal: 'center' };
      
      // Format amount cell
      const amountCell = row.getCell('amount');
      amountCell.numFmt = '$#,##0.00';
      amountCell.alignment = { horizontal: 'center' };
    });

    // Add summary section if there's data or even if empty
    if (allData.length > 0) {
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
      worksheet.mergeCells(`A${summaryHeader.number}:D${summaryHeader.number}`); // Changed to D (4 columns)

      // Add summary data
      const summaryData = [
        { label: 'Total Purchase:', value: summary.totalPurchase },
        { label: 'Total Exchange Loss:', value: summary.totalExchangeLoss },
        { label: 'Total Remittance:', value: summary.totalRemittance },
        { label: 'Total Expense:', value: summary.totalExpense },
        { label: 'Total Salary:', value: summary.totalSalary },
        { label: 'Total Transactions:', value: summary.totalTransactions },
        { label: 'Grand Total:', value: 
          summary.totalPurchase + 
          summary.totalExchangeLoss + 
          summary.totalRemittance + 
          summary.totalExpense + 
          summary.totalSalary 
        }
      ];

      summaryData.forEach((item, index) => {
        const row = worksheet.addRow({
          serialNo: item.label,
          type: item.value
        });
        row.font = { bold: true };
        
        // Format value cells
        const valueCell = row.getCell('type');
        if (item.label.includes('Total') && !item.label.includes('Transactions')) {
          valueCell.numFmt = '$#,##0.00';
          valueCell.alignment = { horizontal: 'right' };
        } else {
          valueCell.alignment = { horizontal: 'right' };
        }
      });
    } else {
      // Add "No Data" message if empty
      const noDataRow = worksheet.addRow(['No financial data found for the selected criteria']);
      noDataRow.font = { italic: true, color: { argb: 'FF666666' } };
      noDataRow.alignment = { horizontal: 'center' };
      noDataRow.height = 30;
      worksheet.mergeCells(`A${noDataRow.number}:D${noDataRow.number}`); // Changed to D (4 columns)
    }

    // Apply borders to all cells
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (rowNumber === 1 || row.values.some(cell => cell !== undefined && cell !== '')) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });

    // Auto-filter on header row if there's data
    if (allData.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount }
      };
    }

    // Generate filename
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = 'financial-summary-report';
    if (startDate && endDate) {
      fileName = `financial-summary-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `financial-summary-${formattedDate.replace(/-/g, '')}`;
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
    console.error("Error in /reports/financial-summary/export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to get display names for types
const getTypeDisplayName = (type) => {
  const typeMap = {
    'purchase': 'Purchase',
    'exchange_loss': 'Exchange Loss',
    'remittance': 'Remittance',
    'expense': 'Expense',
    'salary': 'Salary'
  };
  return typeMap[type] || type;
};

export default router;