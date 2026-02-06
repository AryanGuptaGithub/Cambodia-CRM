import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
const router = express.Router();

// Helper function to determine transaction type from category
async function getTransactionType(categoryTypeId) {
  const category = await CategoryType.findById(categoryTypeId);
  if (!category) throw new Error("Category type not found");

  const categoryName = category.name.toLowerCase();

  switch (categoryName) {
    case "deposit":
      return "deposit";
    case "withdraw":
      return "withdraw";
    case "remittance":
      return "remittance";
    case "payment inward":
      return "payment inward";
    case "payment outward":
      return "payment outward";
    case "sale":
    case "cash sale":
      return "sale";
    case "credit collection":
      return "credit collection";
    default:
      return "sale";
  }
}

// Enhanced balance adjustment function - CORRECTED FOR DEPOSIT
async function adjustBalances(transaction, session, isDelete = false) {
  const {
    transactionType,
    amount,
    source,
    destination,
    finalAmount,
    categoryType,
  } = transaction;

  if (typeof amount !== "number" || amount <= 0) {
    throw new Error("Invalid amount in transaction");
  }

  const sourceAcc = source
    ? await Destination.findById(source).session(session)
    : null;
  const destAcc = destination
    ? await Destination.findById(destination).session(session)
    : null;

  // Get category name for special handling
  let categoryName = "";
  if (categoryType && mongoose.Types.ObjectId.isValid(categoryType)) {
    const category = await CategoryType.findById(categoryType);
    categoryName = category ? category.name.toLowerCase() : "";
  }

  switch (transactionType) {
    case "deposit":
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for deposit");

      if (isDelete) {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        const destinationAdjustment =
          finalAmount !== undefined ? finalAmount : amount;
        destAcc.totalAmount =
          (destAcc.totalAmount || 0) - destinationAdjustment;
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;

        const destinationAdjustment =
          finalAmount !== undefined ? finalAmount : amount;
        destAcc.totalAmount =
          (destAcc.totalAmount || 0) + destinationAdjustment;

        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      await destAcc.save({ session });
      break;

    case "withdraw":
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for withdraw");

      if (isDelete) {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;

        if (sourceAcc.totalAmount < 0) {
          throw new Error("Insufficient balance in source account");
        }
      }

      await sourceAcc.save({ session });
      await destAcc.save({ session });
      break;

    case "payment inward":
      if (!destAcc)
        throw new Error("Destination account missing for payment inward");

      if (isDelete) {
        destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
      } else {
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
      }

      await destAcc.save({ session });
      break;

    case "payment outward":
      if (!sourceAcc)
        throw new Error("Source account missing for payment outward");

      if (isDelete) {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
      }

      await sourceAcc.save({ session });
      break;

    case "remittance":
      if (!sourceAcc) throw new Error("Source account missing for remittance");

      if (isDelete) {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
      }

      await sourceAcc.save({ session });
      break;

    default:
      if (destAcc) {
        if (isDelete) {
          destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
        } else {
          destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
        }

        await destAcc.save({ session });
      }
      break;
  }
}

// Helper function to find or create Destination
const findOrCreateDestination = async (destinationName, accountType, userId) => {
  if (!destinationName || destinationName === '--') return null;
  
  let destination = await Destination.findOne({ 
    name: { $regex: new RegExp(`^${destinationName.trim()}$`, 'i') }
  });
  
  if (!destination) {
    destination = new Destination({
      name: destinationName.trim(),
      accountType: accountType || 'Cash Balance',
      createdBy: userId,
      isActive: true
    });
    await destination.save();
  }
  
  return destination;
};

// Helper function to find or create Supplier
const findOrCreateSupplier = async (supplierName, userId) => {
  if (!supplierName || supplierName === '--') return null;
  
  let supplier = await Supplier.findOne({ 
    name: { $regex: new RegExp(`^${supplierName.trim()}$`, 'i') }
  });
  
  if (!supplier) {
    supplier = new Supplier({
      name: supplierName.trim(),
      createdBy: userId,
      isActive: true
    });
    await supplier.save();
  }
  
  return supplier;
};

// Helper function to parse date
const parseDate = (dateValue) => {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return dateValue;
  }
  
  if (typeof dateValue === 'string') {
    // Try different date formats
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // If Excel serial number
  if (typeof dateValue === 'number') {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
};

// Create transaction - UPDATED TO ENSURE FINAL AMOUNT IS CALCULATED
router.post("/transaction", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      categoryType,
      source,
      destination,
      supplier,
      amount,
      exchangeLoss = 0,
      finalAmount,
      date,
      invoiceDate,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    } = req.body;

    // Validate ObjectIds
    const validateObjectId = (id, name) => {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name} ID`);
      }
    };

    validateObjectId(categoryType, "categoryType");
    validateObjectId(source, "source");
    validateObjectId(destination, "destination");
    validateObjectId(supplier, "supplier");

    const transactionType = await getTransactionType(categoryType);

    // Calculate final amount for deposit transactions
    let calculatedFinalAmount = parseFloat(finalAmount) || parseFloat(amount);
    if (transactionType === "deposit") {
      const exchangeLossValue = parseFloat(exchangeLoss) || 0;
      calculatedFinalAmount = parseFloat(amount) - exchangeLossValue;
    }

    const transactionData = {
      categoryType,
      source,
      destination,
      supplier,
      transactionType,
      amount: parseFloat(amount),
      exchangeLoss: parseFloat(exchangeLoss) || 0,
      finalAmount: calculatedFinalAmount,
      date: new Date(date),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      invoiceNumber,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
    };

    const transaction = new Transaction(transactionData);
    await transaction.save({ session });

    await adjustBalances(transaction, session, false);

    await session.commitTransaction();
    session.endSession();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    res.status(201).json({
      success: true,
      data: populatedTransaction,
      message: "Transaction created successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

router.post('/transaction/import', async (req, res) => {
  try {
    const { accountType } = req.body;
    const userId = req.user.id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    if (!accountType) {
      return res.status(400).json({
        success: false,
        message: 'Account type is required'
      });
    }
    
    // Validate account type
    const validAccountTypes = ['Cash Balance', 'Personal Account', 'Company Account'];
    if (!validAccountTypes.includes(accountType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid account type'
      });
    }
    
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: 'No worksheet found in the file'
      });
    }
    
    // Get headers
    const headerRow = worksheet.getRow(4);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value?.toString()?.split('*')[0]?.trim() || '';
    });
    
    // Map Excel headers to model fields
    const headerMapping = {
      'Invoice Number': 'invoiceNumber',
      'Category Type': 'categoryType',
      'Date (YYYY-MM-DD)': 'date',
      'Amount': 'amount',
      'Source Account': 'source',
      'Destination Account': 'destination',
      'Supplier Name': 'supplier',
      'Exchange Loss': 'exchangeLoss',
      'Final Amount': 'finalAmount',
      'Invoice Date': 'invoiceDate',
      'Customer Name': 'customerName',
      'Customer Address': 'customerAddress',
      'Remarks': 'remarks'
    };
    
    // Process rows starting from row 5
    const importedTransactions = [];
    const errors = [];
    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    for (let rowNumber = 5; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      
      // Skip empty rows
      const firstCellValue = row.getCell(1).value;
      if (!firstCellValue || firstCellValue.toString().trim() === '') {
        continue;
      }
      
      const rowData = {};
      const rowErrors = [];
      
      // Extract data from each column
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        let value = cell.value;
        
        if (value !== undefined && value !== null) {
          // Clean up the value
          if (typeof value === 'string') {
            value = value.trim();
            if (value === '--') value = '';
          }
          rowData[header] = value;
        }
      });
      
      try {
        // Validate required fields
        if (!rowData['Invoice Number']) {
          rowErrors.push('Invoice Number is required');
        }
        
        if (!rowData['Category Type']) {
          rowErrors.push('Category Type is required');
        }
        
        if (!rowData['Date (YYYY-MM-DD)']) {
          rowErrors.push('Date is required');
        }
        
        if (!rowData['Amount'] || isNaN(parseFloat(rowData['Amount']))) {
          rowErrors.push('Valid Amount is required');
        }
        
        if (rowErrors.length > 0) {
          errors.push({
            row: rowNumber,
            invoice: rowData['Invoice Number'] || 'N/A',
            errors: rowErrors
          });
          continue;
        }
        
        // Parse category type
        const category = await findOrCreateCategory(rowData['Category Type'], userId);
        if (!category) {
          errors.push({
            row: rowNumber,
            invoice: rowData['Invoice Number'],
            errors: [`Invalid category type: ${rowData['Category Type']}`]
          });
          continue;
        }
        
        // Parse source account
        let source = null;
        if (rowData['Source Account'] && rowData['Source Account'] !== '') {
          source = await findOrCreateDestination(rowData['Source Account'], accountType, userId);
        }
        
        // Parse destination account
        let destination = null;
        if (rowData['Destination Account'] && rowData['Destination Account'] !== '') {
          destination = await findOrCreateDestination(rowData['Destination Account'], accountType, userId);
        }
        
        // Parse supplier
        let supplier = null;
        if (rowData['Supplier Name'] && rowData['Supplier Name'] !== '') {
          supplier = await findOrCreateSupplier(rowData['Supplier Name'], userId);
        }
        
        // Parse dates
        const date = parseDate(rowData['Date (YYYY-MM-DD)']);
        const invoiceDate = rowData['Invoice Date'] ? parseDate(rowData['Invoice Date']) : null;
        
        if (!date) {
          errors.push({
            row: rowNumber,
            invoice: rowData['Invoice Number'],
            errors: ['Invalid date format']
          });
          continue;
        }
        
        // Parse amounts
        const amount = parseFloat(rowData['Amount']);
        const exchangeLoss = rowData['Exchange Loss'] ? parseFloat(rowData['Exchange Loss']) : 0;
        const finalAmount = rowData['Final Amount'] ? parseFloat(rowData['Final Amount']) : (amount - exchangeLoss);
        
        // Validate final amount calculation
        const calculatedFinalAmount = amount - exchangeLoss;
        if (Math.abs(finalAmount - calculatedFinalAmount) > 0.01) {
          rowErrors.push(`Final amount mismatch. Expected ${calculatedFinalAmount}, got ${finalAmount}`);
        }
        
        // Check for duplicate invoice number
        const existingTransaction = await Transaction.findOne({
          invoiceNumber: rowData['Invoice Number'].trim()
        });
        
        if (existingTransaction) {
          errors.push({
            row: rowNumber,
            invoice: rowData['Invoice Number'],
            errors: ['Invoice number already exists']
          });
          continue;
        }
        
        // Get transaction type from category
        const transactionType = mapCategoryToTransactionType(category.name);
        
        // Create transaction object
        const transactionData = {
          invoiceNumber: rowData['Invoice Number'].trim(),
          categoryType: category._id,
          source: source?._id || null,
          destination: destination?._id || null,
          supplier: supplier?._id || null,
          date: date,
          invoiceDate: invoiceDate,
          customerName: rowData['Customer Name'] || '',
          customerAddress: rowData['Customer Address'] || '',
          amount: amount,
          exchangeLoss: exchangeLoss,
          finalAmount: finalAmount,
          accountType: accountType,
          remarks: rowData['Remarks'] || '',
          transactionType: transactionType,
          createdBy: userId,
          importBatchId: batchId,
          importStatus: 'imported'
        };
        
        // Validate transaction based on transaction type
        const validationErrors = [];
        
        // Check required fields based on transaction type
        switch (transactionType) {
          case 'cash sale':
          case 'credit collection':
            if (!rowData['Customer Name']) {
              validationErrors.push('Customer Name is required for this category');
            }
            if (!destination) {
              validationErrors.push('Destination Account is required for this category');
            }
            break;
            
          case 'payment inward':
            if (!supplier) {
              validationErrors.push('Supplier Name is required for this category');
            }
            if (!destination) {
              validationErrors.push('Destination Account is required for this category');
            }
            break;
            
          case 'payment outward':
          case 'remittance':
            if (!supplier) {
              validationErrors.push('Supplier Name is required for this category');
            }
            if (!source) {
              validationErrors.push('Source Account is required for this category');
            }
            break;
            
          case 'deposit':
          case 'withdraw':
            if (!source) {
              validationErrors.push('Source Account is required for this category');
            }
            if (!destination) {
              validationErrors.push('Destination Account is required for this category');
            }
            break;
        }
        
        if (validationErrors.length > 0) {
          errors.push({
            row: rowNumber,
            invoice: rowData['Invoice Number'],
            errors: validationErrors
          });
          continue;
        }
        
        // Create transaction
        const transaction = new Transaction(transactionData);
        await transaction.save();
        
        importedTransactions.push({
          invoiceNumber: transaction.invoiceNumber,
          id: transaction._id,
          date: transaction.date
        });
        
      } catch (error) {
        errors.push({
          row: rowNumber,
          invoice: rowData['Invoice Number'] || 'N/A',
          errors: [error.message]
        });
      }
    }
    
    // Return import summary
    const summary = {
      totalProcessed: importedTransactions.length + errors.length,
      successCount: importedTransactions.length,
      errorCount: errors.length,
      batchId: batchId,
      importedTransactions: importedTransactions.slice(0, 10), // Return first 10 for preview
      errors: errors.slice(0, 20) // Return first 20 errors
    };
    
    res.json({
      success: true,
      message: `Imported ${importedTransactions.length} transactions successfully`,
      summary: summary
    });
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to import transactions',
      error: error.message
    });
  }
});

// Get import template (no sample data)
router.get('/transaction/import-template', async (req, res) => {
  try {
    const { accountType = 'Cash Balance' } = req.query;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transaction Template');

    // ===== Company Header =====
    worksheet.mergeCells('A1:M1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'HEALTHCARE SOUTH EAST ASIA';
    titleCell.font = { bold: true, size: 16, color: { argb: '000000' } };
    titleCell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center' 
    };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E6F3FF' }
    };

    // ===== Worksheet Title =====
    worksheet.mergeCells('A2:M2');
    const subtitleCell = worksheet.getCell('A2');
    subtitleCell.value = `Transaction Import Template - ${accountType}`;
    subtitleCell.font = { bold: true, size: 14, color: { argb: '000000' } };
    subtitleCell.alignment = { 
      vertical: 'middle', 
      horizontal: 'center' 
    };
    subtitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F0F8FF' }
    };

    // ===== Instructions =====
    worksheet.mergeCells('A3:M3');
    const instructionCell = worksheet.getCell('A3');
    instructionCell.value = 'Instructions: Fill in the required fields below. Fields marked with * are required. For conditional fields, refer to the notes.';
    instructionCell.font = { italic: true, size: 10, color: { argb: 'FF0000' } };
    instructionCell.alignment = { 
      vertical: 'middle', 
      horizontal: 'left',
      wrapText: true 
    };
    instructionCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0' }
    };

    // ===== Column Headers =====
    const headers = [
      { header: 'Invoice Number*', key: 'invoiceNumber', width: 20 },
      { header: 'Category Type*', key: 'categoryType', width: 20 },
      { header: 'Date* (YYYY-MM-DD)', key: 'date', width: 15 },
      { header: 'Amount*', key: 'amount', width: 15 },
      { header: 'Source Account', key: 'source', width: 20 },
      { header: 'Destination Account', key: 'destination', width: 20 },
      { header: 'Supplier Name', key: 'supplier', width: 25 },
      { header: 'Exchange Loss', key: 'exchangeLoss', width: 15 },
      { header: 'Final Amount (Auto)', key: 'finalAmount', width: 15 },
      { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Customer Address', key: 'customerAddress', width: 30 },
      { header: 'Remarks', key: 'remarks', width: 30 }
    ];

    // Add headers at row 4
    const headerRow = worksheet.getRow(4);
    headers.forEach((header, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = header.header;
      cell.font = { bold: true, color: { argb: 'FFFFFF' } };
      cell.alignment = { 
        vertical: 'middle', 
        horizontal: 'center',
        wrapText: true 
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '4472C4' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: '000000' } },
        left: { style: 'thin', color: { argb: '000000' } },
        bottom: { style: 'thin', color: { argb: '000000' } },
        right: { style: 'thin', color: { argb: '000000' } }
      };
    });

    // Set column widths
    worksheet.columns = headers;

    // ===== Add Data Validation =====
    // Validate amount column (positive numbers)
    for (let i = 5; i <= 100; i++) {
      const amountCell = worksheet.getCell(`D${i}`);
      amountCell.dataValidation = {
        type: 'decimal',
        operator: 'greaterThan',
        formula1: '0',
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: 'Invalid Amount',
        error: 'Amount must be a positive number'
      };

      // Validate exchange loss (non-negative)
      const exchangeCell = worksheet.getCell(`H${i}`);
      exchangeCell.dataValidation = {
        type: 'decimal',
        operator: 'greaterThanOrEqual',
        formula1: '0',
        allowBlank: true,
        showErrorMessage: true,
        errorTitle: 'Invalid Exchange Loss',
        error: 'Exchange loss cannot be negative'
      };
      
      // Add date validation
      const dateCell = worksheet.getCell(`C${i}`);
      dateCell.dataValidation = {
        type: 'date',
        operator: 'greaterThan',
        formula1: 'DATE(2000,1,1)',
        allowBlank: false,
        showErrorMessage: true,
        errorTitle: 'Invalid Date',
        error: 'Please enter a valid date (YYYY-MM-DD)'
      };
    }

    // ===== Add Auto-calculation for Final Amount =====
    for (let i = 5; i <= 100; i++) {
      const finalAmountCell = worksheet.getCell(`I${i}`);
      finalAmountCell.value = {
        formula: `IF(AND(ISNUMBER(D${i}), ISNUMBER(H${i})), D${i}-H${i}, IF(ISNUMBER(D${i}), D${i}, 0))`
      };
      finalAmountCell.numFmt = '#,##0.00';
      finalAmountCell.font = { bold: true, color: { argb: '008000' } };
      finalAmountCell.protection = { locked: true };
    }

    // ===== Add Category Rules Section =====
    const notesStartRow = 8;
    
    worksheet.mergeCells(`A${notesStartRow}:M${notesStartRow}`);
    const rulesTitle = worksheet.getCell(`A${notesStartRow}`);
    rulesTitle.value = 'CATEGORY-SPECIFIC REQUIREMENTS:';
    rulesTitle.font = { bold: true, size: 12, color: { argb: '0000FF' } };
    rulesTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E6F3FF' }
    };

    const categoryRules = [
      { category: 'Cash Sale', rules: 'Requires: Invoice Number, Destination Account, Customer Name' },
      { category: 'Credit Collection', rules: 'Requires: Invoice Number, Destination Account, Customer Name' },
      { category: 'Payment Inward', rules: 'Requires: Supplier Name, Destination Account' },
      { category: 'Payment Outward', rules: 'Requires: Supplier Name, Source Account' },
      { category: 'Deposit', rules: 'Requires: Source Account, Destination Account. Exchange Loss is optional.' },
      { category: 'Withdraw', rules: 'Requires: Source Account, Destination Account' },
      { category: 'Remittance', rules: 'Requires: Supplier Name, Source Account' }
    ];

    categoryRules.forEach((rule, index) => {
      const ruleRow = notesStartRow + 1 + index;
      
      // Category column
      const catCell = worksheet.getCell(`A${ruleRow}`);
      catCell.value = `• ${rule.category}:`;
      catCell.font = { bold: true };
      
      // Rules column
      worksheet.mergeCells(`B${ruleRow}:M${ruleRow}`);
      const rulesCell = worksheet.getCell(`B${ruleRow}`);
      rulesCell.value = rule.rules;
      rulesCell.font = { italic: true };
    });

    // ===== Add General Instructions =====
    const instructionsStartRow = notesStartRow + categoryRules.length + 3;
    
    worksheet.mergeCells(`A${instructionsStartRow}:M${instructionsStartRow}`);
    const instructionsTitle = worksheet.getCell(`A${instructionsStartRow}`);
    instructionsTitle.value = 'GENERAL INSTRUCTIONS:';
    instructionsTitle.font = { bold: true, size: 12, color: { argb: '008000' } };
    instructionsTitle.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F0FFF0' }
    };

    const instructions = [
      '1. Fields marked with * are mandatory for all transactions',
      '2. Date must be in YYYY-MM-DD format',
      '3. Amount must be a positive number',
      '4. Exchange Loss is deducted from Amount to calculate Final Amount',
      '5. For invoice-based categories, Invoice Date, Customer Name are auto-filled',
      '6. Duplicate invoice numbers will be rejected during import',
      '7. Source/Destination accounts must exist in the system or will be created',
      '8. For Deposit/Withdraw: Both Source and Destination accounts required',
      '9. For Payment Inward/Remittance: Supplier Name is required',
      '10. Remarks are optional but recommended for tracking',
      '11. Fields marked "--" are not applicable for the category type'
    ];

    instructions.forEach((instruction, index) => {
      const instrRow = instructionsStartRow + 1 + index;
      worksheet.mergeCells(`A${instrRow}:M${instrRow}`);
      const instrCell = worksheet.getCell(`A${instrRow}`);
      instrCell.value = instruction;
      instrCell.font = { size: 10 };
    });

    // ===== Prepare Excel Buffer for Response =====
    const buffer = await workbook.xlsx.writeBuffer();

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=transaction-import-template-${accountType.toLowerCase().replace(/\s+/g, '-')}.xlsx`);
    res.setHeader('Content-Length', buffer.length);

    // Send the buffer
    res.send(buffer);

  } catch (error) {
    console.error('Error generating import template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate import template'
    });
  }
});

// Get import summary
router.get('/transaction/import-summary/:batchId' , async (req, res) => {
  try {
    const { batchId } = req.params;
    
    const transactions = await Transaction.find({ importBatchId: batchId })
      .populate('categoryType', 'name')
      .populate('source', 'name')
      .populate('destination', 'name')
      .populate('supplier', 'name')
      .sort({ date: -1 });
    
    const summary = {
      total: transactions.length,
      imported: transactions.filter(t => t.importStatus === 'imported').length,
      pending: transactions.filter(t => t.importStatus === 'pending').length,
      errors: transactions.filter(t => t.importStatus === 'error').length,
      transactions: transactions
    };
    
    res.json({
      success: true,
      summary
    });
    
  } catch (error) {
    console.error('Error getting import summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get import summary'
    });
  }
});

// Get all transactions with pagination and filtering
router.get("/transaction", async (req, res) => {
  try {
    const transactions = await Transaction.find({})
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name")
      .sort({ date: -1, createdAt: -1 });

    const destinations = await Destination.find();
    const total = transactions.length;

    res.json({
      success: true,
      data: transactions,
      destinations,
      totalPages: 1,
      currentPage: 1,
      total,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get single transaction by ID
router.get("/transaction/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Update transaction - CORRECTED FOR FINAL AMOUNT HANDLING
router.put("/transaction/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const existingTransaction = await Transaction.findById(id).session(session);

    if (!existingTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Check if category type is changing
    const categoryTypeChanged =
      req.body.categoryType &&
      req.body.categoryType !== existingTransaction.categoryType.toString();

    let newTransactionType = existingTransaction.transactionType;
    if (categoryTypeChanged) {
      newTransactionType = await getTransactionType(req.body.categoryType);
    }

    await adjustBalances(existingTransaction, session, true);

    let calculatedFinalAmount =
      parseFloat(req.body.finalAmount) ||
      parseFloat(req.body.amount) ||
      existingTransaction.finalAmount;
    if (newTransactionType === "deposit") {
      const amountValue =
        parseFloat(req.body.amount) || existingTransaction.amount;
      const exchangeLossValue =
        parseFloat(req.body.exchangeLoss) ||
        existingTransaction.exchangeLoss ||
        0;
      calculatedFinalAmount = amountValue - exchangeLossValue;
    }

    const updateData = {
      ...req.body,
      transactionType: newTransactionType,
      amount: parseFloat(req.body.amount || existingTransaction.amount),
      exchangeLoss: parseFloat(
        req.body.exchangeLoss || existingTransaction.exchangeLoss
      ),
      finalAmount: calculatedFinalAmount,
    };

    // For category changes, ensure proper source/destination handling
    if (categoryTypeChanged) {
      const newCategory = await CategoryType.findById(req.body.categoryType);
      const newCategoryName = newCategory ? newCategory.name.toLowerCase() : "";

      // Clear inappropriate fields based on new category
      if (
        newCategoryName === "cash sale" ||
        newCategoryName === "sale" ||
        newCategoryName === "credit collection"
      ) {
        // Sales categories only need destination
        updateData.source = undefined;
        if (!updateData.destination) {
          throw new Error(
            "Destination account is required for sales transactions"
          );
        }
      } else if (
        newCategoryName === "remittance" ||
        newCategoryName === "payment outward"
      ) {
        // These categories need source only
        updateData.destination = undefined;
        if (!updateData.source) {
          throw new Error(
            "Source account is required for this transaction type"
          );
        }
      } else if (newCategoryName === "payment inward") {
        // Payment inward needs destination only
        updateData.source = undefined;
        if (!updateData.destination) {
          throw new Error("Destination account is required for payment inward");
        }
      }
      // For deposit/withdraw, both source and destination should be provided
    }

    const newTransactionData = {
      ...updateData,
      _id: existingTransaction._id,
      transactionType: newTransactionType,
    };

    await adjustBalances(newTransactionData, session, false);

    const transaction = await Transaction.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });

    await session.commitTransaction();
    session.endSession();

    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name");

    res.json({
      success: true,
      data: populatedTransaction,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transaction update error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Delete single transaction
router.delete("/transaction/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const transaction = await Transaction.findById(id).session(session);
    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Reverse the balances
    await adjustBalances(transaction, session, true);
    await Transaction.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Transaction deleted and balances updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  }
});

// Bulk delete transactions
router.delete("/transactions", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No IDs provided",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid transaction ID(s): ${invalidIds.join(", ")}`,
      });
    }

    const transactions = await Transaction.find({ _id: { $in: ids } }).session(
      session
    );
    if (transactions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "No transactions found",
      });
    }

    for (const tx of transactions) {
      await adjustBalances(tx, session, true);
    }

    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `${result.deletedCount} transaction(s) deleted and balances updated successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

export default router;
