import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import Supplier from "../../models/master/supplier.js";
import Customer from "../../models/master/customer.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import multer from "multer";

const router = express.Router();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      'application/x-excel',
      'application/x-msexcel',
      'text/csv',
      'text/plain',
      'application/csv',
      'text/comma-separated-values',
      'application/octet-stream'
    ];
    
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files only.`));
    }
  },
});

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
    case "cash sale":
      return "cash sale";
    case "credit collection":
      return "credit collection";
    default:
      return "sale";
  }
}

// Helper function to map category name to transaction type
function mapCategoryToTransactionType(categoryName) {
  const name = categoryName.toLowerCase();

  switch (name) {
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
    case "cash sale":
      return "cash sale";
    case "credit collection":
      return "credit collection";
    default:
      return "sale";
  }
}

// Helper function to find or create category
async function findOrCreateCategory(categoryName, userId) {
  if (!categoryName || categoryName === '--') return null;
  
  let category = await CategoryType.findOne({ 
    name: { $regex: new RegExp(`^${categoryName.trim()}$`, 'i') }
  });
  
  if (!category) {
    category = new CategoryType({
      name: categoryName.trim(),
      createdBy: userId,
      isActive: true
    });
    await category.save();
  }
  
  return category;
}

// Enhanced balance adjustment function with consistent logic
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
        // Revert: Add amount back to source, remove from destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        const destinationAdjustment = finalAmount || amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) - destinationAdjustment;
      } else {
        // Deduct from source, add to destination
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        const destinationAdjustment = finalAmount || amount;
        destAcc.totalAmount = (destAcc.totalAmount || 0) + destinationAdjustment;

        if (sourceAcc.totalAmount < 0) {
          throw new Error(`Insufficient balance in source account. Available: $${sourceAcc.totalAmount + amount}, Required: $${amount}`);
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
          throw new Error(`Insufficient balance in source account. Available: $${sourceAcc.totalAmount + amount}, Required: $${amount}`);
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

    case "cash sale":
    case "credit collection":
      if (!destAcc)
        throw new Error("Destination account missing for sale transaction");

      if (isDelete) {
        destAcc.totalAmount = (destAcc.totalAmount || 0) - amount;
      } else {
        destAcc.totalAmount = (destAcc.totalAmount || 0) + amount;
      }

      await destAcc.save({ session });
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
const findOrCreateDestination = async (destinationName, userId) => {
  if (!destinationName || destinationName === '--') return null;
  
  let destination = await Destination.findOne({ 
    name: { $regex: new RegExp(`^${destinationName.trim()}$`, 'i') }
  });
  
  if (!destination) {
    destination = new Destination({
      name: destinationName.trim(),
      accountType: 'Cash Balance',
      createdBy: userId,
      isActive: true,
      totalAmount: 0
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

// Helper function to find or create Customer
const findOrCreateCustomer = async (customerName, userId) => {
  if (!customerName || customerName === '--') return null;
  
  let customer = await Customer.findOne({ 
    name: { $regex: new RegExp(`^${customerName.trim()}$`, 'i') }
  });
  
  if (!customer) {
    customer = new Customer({
      name: customerName.trim(),
      createdBy: userId,
      isActive: true
    });
    await customer.save();
  }
  
  return customer;
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
    
    // Try parsing with Excel date format (YYYY-MM-DD)
    const parts = dateValue.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      const date = new Date(year, month, day);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    // Try DD-MM-YYYY
    if (dateValue.includes('/')) {
      const parts = dateValue.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const year = parseInt(parts[2]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
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

// Improved getCellValue function to handle Excel formulas properly
const getCellValue = (cell) => {
  if (!cell) return null;
  
  // Check if cell is actually empty (ExcelJS specific)
  if (cell.type === 6) { // 6 = empty cell type in ExcelJS
    return null;
  }
  
  // Handle formula cells
  if (cell.type === 2 || cell.formula) { // 2 = formula cell type
    // Return result if available
    if (cell.result !== undefined && cell.result !== null) {
      return cell.result;
    }
    
    // For template formulas that haven't been calculated
    if (cell.value && typeof cell.value === 'string' && cell.value.startsWith('=')) {
      // Check if it's an IF formula from your template
      if (cell.value.startsWith('=IF(D') || cell.value.includes('=IF(')) {
        return null; // Treat template formulas as empty
      }
    }
    
    return '';
  }
  
  // Handle raw values
  const value = cell.value;
  
  if (value === undefined || value === null) {
    return null;
  }
  
  // If it's an object but not a Date
  if (typeof value === 'object' && !(value instanceof Date)) {
    // Check if it's a shared formula or other object
    if (value.formula || value.sharedFormula) {
      return cell.result || '';
    }
    return String(value);
  }
  
  return value;
};

// Validation function for each category type
const validateTransactionByCategory = (categoryName, rowData) => {
  const errors = [];
  const categoryLower = categoryName.toLowerCase();

  // Required fields for all categories
  if (!rowData['Date']) {
    errors.push('Date is required');
  }
  
  const amount = parseFloat(rowData['Amount']);
  if (!amount || amount <= 0 || isNaN(amount)) {
    errors.push('Valid Amount is required');
  }

  // Category-specific validations based on frontend logic
  switch (categoryLower) {
    case 'cash sale':
      if (!rowData['Destination Account']) {
        errors.push('Destination Account is required for Cash Sale');
      }
      if (!rowData['Customer Name']) {
        errors.push('Customer Name is required for Cash Sale');
      }
      if (!rowData['Invoice Number']) {
        errors.push('Invoice Number is required for Cash Sale');
      }
      break;

    case 'credit collection':
      if (!rowData['Destination Account']) {
        errors.push('Destination Account is required for Credit Collection');
      }
      if (!rowData['Customer Name']) {
        errors.push('Customer Name is required for Credit Collection');
      }
      if (!rowData['Invoice Number']) {
        errors.push('Invoice Number is required for Credit Collection');
      }
      break;

    case 'deposit':
      if (!rowData['Source Account']) {
        errors.push('Source Account is required for Deposit');
      }
      if (!rowData['Destination Account']) {
        errors.push('Destination Account is required for Deposit');
      }
      // Validate exchange loss
      if (rowData['Exchange Loss'] && (isNaN(parseFloat(rowData['Exchange Loss'])) || parseFloat(rowData['Exchange Loss']) < 0)) {
        errors.push('Exchange Loss must be a valid non-negative number');
      }
      if (rowData['Exchange Loss'] && parseFloat(rowData['Exchange Loss']) > amount) {
        errors.push('Exchange Loss cannot exceed Amount');
      }
      break;

    case 'withdraw':
      if (!rowData['Source Account']) {
        errors.push('Source Account is required for Withdraw');
      }
      if (!rowData['Destination Account']) {
        errors.push('Destination Account is required for Withdraw');
      }
      break;

    case 'payment inward':
      if (!rowData['Supplier Name']) {
        errors.push('Supplier Name is required for Payment Inward');
      }
      if (!rowData['Destination Account']) {
        errors.push('Destination Account is required for Payment Inward');
      }
      break;

    case 'remittance':
      if (!rowData['Supplier Name']) {
        errors.push('Supplier Name is required for Remittance');
      }
      if (!rowData['Source Account']) {
        errors.push('Source Account is required for Remittance');
      }
      break;

    default:
      errors.push(`Unknown category type: ${categoryName}`);
      break;
  }

  return errors;
};

// Check if source account has sufficient balance
const checkSourceAccountBalance = async (sourceAccountId, amount, transactionType) => {
  if (!sourceAccountId) return true;
  
  const sourceAccount = await Destination.findById(sourceAccountId);
  if (!sourceAccount) {
    throw new Error(`Source account not found: ${sourceAccountId}`);
  }
  
  const currentBalance = sourceAccount.totalAmount || 0;
  
  // For deposit/withdraw/remittance/payment outward, check balance
  const requiresBalanceCheck = ['deposit', 'withdraw', 'remittance', 'payment outward'].includes(transactionType);
  
  if (requiresBalanceCheck) {
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance in source account "${sourceAccount.name}". Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`);
    }
  }
  
  return true;
};

// FIXED: Changed from '/transaction' to '/'
// Create transaction
router.post("/", async (req, res) => {
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

    // Check source account balance
    if (source) {
      await checkSourceAccountBalance(source, parseFloat(amount), transactionType);
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
    console.error("Transaction creation error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Helper function to check if a row is a template/formula row
const isTemplateRow = (rowData) => {
  const requiredFields = ['Category Type', 'Amount', 'Date', 'Invoice Number'];
  
  // If ALL required fields are empty or only contain formula-like content
  for (const field of requiredFields) {
    const value = rowData[field];
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && 
          trimmed !== '--' && 
          !trimmed.startsWith('=IF(') &&
          !trimmed.startsWith('Select')) {
        return false; // This has actual data
      }
    } else if (value && typeof value === 'number') {
      if (value !== 0) {
        return false; // This has actual data
      }
    }
  }
  
  return true; // This is a template row
};

// FIXED: Changed from '/transaction/import' to '/import'
// Enhanced Import Route with better formula handling
router.post('/import', upload.single('file'), async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    // For testing, use a default user ID if not available
    const userId = req.user?.id || new mongoose.Types.ObjectId();

    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const workbook = new ExcelJS.Workbook();
    
    // Handle different file types
    try {
      if (file.originalname.toLowerCase().endsWith('.csv')) {
        await workbook.csv.read(file.buffer);
      } else {
        // Load without formula calculation to avoid issues
        await workbook.xlsx.load(file.buffer, {
          ignoreNodes: ['calcChain'],
          ignoreStyles: true
        });
      }
    } catch (excelError) {
      console.error('Error reading Excel file:', excelError);
      return res.status(400).json({
        success: false,
        message: 'Error reading Excel file. Please ensure the file is not corrupted and is in correct format.',
        error: excelError.message
      });
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({
        success: false,
        message: 'No worksheet found in the file'
      });
    }

    // Read headers from row 3 (based on your template)
    const headerRow = worksheet.getRow(3);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      const headerValue = getCellValue(cell)?.toString()?.trim() || `Column ${colNumber}`;
      headers[colNumber - 1] = headerValue;
    });

    // Flexible header mapping to handle different column names
    const headerMapping = {
      'Invoice No': 'Invoice Number',
      'Invoice Number': 'Invoice Number',
      'Invoice #': 'Invoice Number',
      'Category Type*': 'Category Type',
      'Category Type': 'Category Type',
      'Category': 'Category Type',
      'Source Account': 'Source Account',
      'Source': 'Source Account',
      'Destination Account': 'Destination Account',
      'Destination': 'Destination Account',
      'Amount*': 'Amount',
      'Amount': 'Amount',
      'Exchange Loss': 'Exchange Loss',
      'Final Amount (Auto)': 'Final Amount',
      'Final Amount': 'Final Amount',
      'Date* (YYYY-MM-DD)': 'Date',
      'Date': 'Date',
      'Transaction Date': 'Date',
      'Invoice Date (YYYY-MM-DD)': 'Invoice Date',
      'Invoice Date': 'Invoice Date',
      'Customer Name': 'Customer Name',
      'Customer': 'Customer Name',
      'Customer Address': 'Customer Address',
      'Remarks': 'Remarks',
      'Notes': 'Remarks',
      'Supplier Name': 'Supplier Name',
      'Supplier': 'Supplier Name',
      'Payment To': 'Supplier Name'
    };

    const importedTransactions = [];
    const errors = [];
    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Start from row 4 (after headers in your template)
    let rowNumber = 4;
    let processedRows = 0;
    let skippedRows = 0;
    let dataRowsProcessed = 0;
    
    // Process only first 1000 rows to avoid infinite loops
    const maxRowsToProcess = Math.min(worksheet.rowCount, 1000);
      
    while (rowNumber <= maxRowsToProcess) {
      const row = worksheet.getRow(rowNumber);
      
      // Get row data using improved getCellValue
      const rowData = {};
      let hasAnyData = false;
      
      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        let value = getCellValue(cell);

        if (value !== null && value !== undefined && value !== '') {
          if (typeof value === 'string') {
            value = value.trim();
            // Skip placeholder values
            if (value === '--' || value === 'Select' || value.startsWith('Select ') || 
                value.startsWith('=IF(') || value === '0' || value === '0.00') {
              value = '';
            } else if (value) {
              hasAnyData = true;
            }
          } else if (typeof value === 'number') {
            if (value !== 0) {
              hasAnyData = true;
            }
          } else if (value instanceof Date) {
            hasAnyData = true;
          }
        } else {
          value = '';
        }

        const mappedHeader = headerMapping[header] || header;
        if (!rowData[mappedHeader]) {
          rowData[mappedHeader] = value;
        }
      });

      // Skip if row has no data or is a template row
      if (!hasAnyData || isTemplateRow(rowData)) {
        rowNumber++;
        skippedRows++;
        continue;
      }

      // This row has data, process it
      processedRows++;
      dataRowsProcessed++;
      
      const rowErrors = [];

      try {
        // Required validations
        if (!rowData['Category Type'] || rowData['Category Type'].trim() === '') {
          rowErrors.push('Category Type is required');
        }

        const date = parseDate(rowData['Date']);
        if (!date) {
          rowErrors.push('Invalid Date format. Please use YYYY-MM-DD format');
        }

        const amount = parseFloat(rowData['Amount']);
        if (isNaN(amount) || amount <= 0) {
          rowErrors.push('Valid Amount is required and must be greater than 0');
        }

        if (rowErrors.length > 0) {
          errors.push({ 
            row: rowNumber, 
            errors: rowErrors,
            data: rowData
          });
          rowNumber++;
          continue;
        }

        const categoryName = rowData['Category Type'].trim();
        const category = await findOrCreateCategory(categoryName, userId);
        
        if (!category) {
          errors.push({
            row: rowNumber,
            errors: [`Invalid category type: ${categoryName}`],
            data: rowData
          });
          rowNumber++;
          continue;
        }

        const categoryErrors = validateTransactionByCategory(category.name, rowData);
        if (categoryErrors.length > 0) {
          errors.push({ 
            row: rowNumber, 
            errors: categoryErrors,
            data: rowData
          });
          rowNumber++;
          continue;
        }

        // Find or create related entities
        const source = rowData['Source Account'] && rowData['Source Account'].trim() !== ''
          ? await findOrCreateDestination(rowData['Source Account'].trim(), userId)
          : null;

        const destination = rowData['Destination Account'] && rowData['Destination Account'].trim() !== ''
          ? await findOrCreateDestination(rowData['Destination Account'].trim(), userId)
          : null;

        const supplier = rowData['Supplier Name'] && rowData['Supplier Name'].trim() !== ''
          ? await findOrCreateSupplier(rowData['Supplier Name'].trim(), userId)
          : null;

        const customer = rowData['Customer Name'] && rowData['Customer Name'].trim() !== ''
          ? await findOrCreateCustomer(rowData['Customer Name'].trim(), userId)
          : null;

        const invoiceDate = rowData['Invoice Date'] && rowData['Invoice Date'].trim() !== ''
          ? parseDate(rowData['Invoice Date'])
          : date;

        const exchangeLoss = parseFloat(rowData['Exchange Loss']) || 0;

        let finalAmount = amount;
        if (category.name.toLowerCase() === 'deposit') {
          finalAmount = amount - exchangeLoss;
          if (finalAmount < 0) {
            errors.push({
              row: rowNumber,
              errors: ['Final Amount cannot be negative'],
              data: rowData
            });
            rowNumber++;
            continue;
          }
        }

        const transactionType = mapCategoryToTransactionType(category.name);

        // Check for duplicate invoice numbers for cash sale and credit collection
        if (['cash sale', 'credit collection'].includes(transactionType)) {
          if (!rowData['Invoice Number'] || rowData['Invoice Number'].trim() === '') {
            errors.push({
              row: rowNumber,
              errors: ['Invoice Number is required'],
              data: rowData
            });
            rowNumber++;
            continue;
          }

          const invoiceNum = rowData['Invoice Number'].trim();
          if (invoiceNum) {
            const exists = await Transaction.findOne({
              invoiceNumber: invoiceNum
            });

            if (exists) {
              errors.push({
                row: rowNumber,
                errors: [`Invoice number "${invoiceNum}" already exists`],
                data: rowData
              });
              rowNumber++;
              continue;
            }
          }
        }

        // Check source account balance
        if (source && ['deposit', 'withdraw', 'remittance', 'payment outward'].includes(transactionType)) {
          try {
            await checkSourceAccountBalance(source._id, amount, transactionType);
          } catch (balanceError) {
            errors.push({
              row: rowNumber,
              errors: [balanceError.message],
              data: rowData
            });
            rowNumber++;
            continue;
          }
        }

        // Create transaction
        const transaction = new Transaction({
          invoiceNumber: rowData['Invoice Number']?.trim() || '',
          categoryType: category._id,
          source: source?._id || null,
          destination: destination?._id || null,
          supplier: supplier?._id || null,
          date,
          invoiceDate,
          customerName: customer?.name || rowData['Customer Name']?.trim() || '',
          customerAddress: rowData['Customer Address']?.trim() || '',
          amount,
          exchangeLoss,
          finalAmount,
          remarks: rowData['Remarks']?.trim() || '',
          transactionType,
          accountType: 'Cash Balance',
          createdBy: userId,
          importBatchId: batchId,
          importStatus: 'imported'
        });

        await transaction.save({ session });
        await adjustBalances(transaction, session, false);

        importedTransactions.push({
          id: transaction._id,
          invoiceNumber: transaction.invoiceNumber,
          amount,
          category: category.name
        });
      } catch (err) {
        console.error(`Error processing row ${rowNumber}:`, err);
        errors.push({
          row: rowNumber,
          errors: [err.message || 'Unknown error processing this row'],
          data: rowData
        });
      }
      
      rowNumber++;
    }

    if (errors.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: 'Import failed with errors',
        summary: {
          totalDataRows: dataRowsProcessed,
          successCount: importedTransactions.length,
          errorCount: errors.length,
          skippedRows: skippedRows,
          errors: errors.slice(0, 20) // Limit errors in response
        }
      });
    }

    await session.commitTransaction();
    session.endSession();
    res.json({
      success: true,
      message: `Successfully imported ${importedTransactions.length} transaction(s)`,
      batchId,
      importedTransactions,
      summary: {
        totalDataRows: dataRowsProcessed,
        totalImported: importedTransactions.length,
        skippedRows: skippedRows
      }
    });

  } catch (error) {
    console.error('Import route error:', error);
    
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    res.status(500).json({
      success: false,
      message: 'Import failed due to server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// FIXED: Changed from '/transaction' to '/'
// Get all transactions with pagination and filtering
router.get("/", async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      categoryType, 
      accountType,
      page = 1, 
      limit = 50 
    } = req.query;
    
    let query = {};
    
    // Date filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    // Category filter
    if (categoryType) {
      query.categoryType = categoryType;
    }
    
    // Account type filter
    if (accountType) {
      query.accountType = accountType;
    }
    
    const skip = (page - 1) * limit;
    
    const transactions = await Transaction.find(query)
      .populate("categoryType", "name")
      .populate("source", "name totalAmount")
      .populate("destination", "name totalAmount")
      .populate("supplier", "name")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);
    const destinations = await Destination.find();

    res.json({
      success: true,
      data: transactions,
      destinations,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// FIXED: Route remains '/:id' (correct as is)
// Get single transaction by ID
router.get("/:id", async (req, res) => {
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
    console.error('Get single transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// FIXED: Route remains '/:id' (correct as is)
// Update transaction
router.put("/:id", async (req, res) => {
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

    // Reverse old balances
    await adjustBalances(existingTransaction, session, true);

    let calculatedFinalAmount =
      parseFloat(req.body.finalAmount) ||
      parseFloat(req.body.amount) ||
      existingTransaction.finalAmount;
    
    if (newTransactionType === "deposit") {
      const amountValue = parseFloat(req.body.amount) || existingTransaction.amount;
      const exchangeLossValue = parseFloat(req.body.exchangeLoss) || existingTransaction.exchangeLoss || 0;
      calculatedFinalAmount = amountValue - exchangeLossValue;
    }

    // Check source account balance for new transaction
    if (req.body.source && req.body.amount) {
      await checkSourceAccountBalance(
        req.body.source, 
        parseFloat(req.body.amount), 
        newTransactionType
      );
    }

    const updateData = {
      ...req.body,
      transactionType: newTransactionType,
      amount: parseFloat(req.body.amount || existingTransaction.amount),
      exchangeLoss: parseFloat(req.body.exchangeLoss || existingTransaction.exchangeLoss),
      finalAmount: calculatedFinalAmount,
    };

    const newTransactionData = {
      ...updateData,
      _id: existingTransaction._id,
      transactionType: newTransactionType,
    };

    // Apply new balances
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

// FIXED: Route remains '/:id' (correct as is)
// Delete single transaction
router.delete("/:id", async (req, res) => {
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
    console.error("Delete transaction error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  }
});

// FIXED: Changed from '/transactions' to '/bulk-delete'
// Bulk delete transactions
router.delete("/bulk-delete", async (req, res) => {
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

    const transactions = await Transaction.find({ _id: { $in: ids } }).session(session);
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

    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `${result.deletedCount} transaction(s) deleted and balances updated successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

// FIXED: Changed from '/transaction/import/test' to '/import/test'
// Test import endpoint for debugging
router.post('/import/test', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File received successfully',
      fileInfo: {
        name: file.originalname,
        size: file.size,
        type: file.mimetype
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message
    });
  }
});

export default router;
