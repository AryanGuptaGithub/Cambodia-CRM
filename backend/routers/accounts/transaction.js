import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import multer from "multer";

const router = express.Router();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
      "application/x-excel",
      "application/x-msexcel",
      "text/csv",
      "text/plain",
      "application/csv",
      "text/comma-separated-values",
      "application/octet-stream",
    ];
    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf("."));
    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Please upload Excel (.xlsx, .xls) or CSV files only.",
        ),
      );
    }
  },
});

// Helper: Update account balances by account name
async function adjustBalances(transaction, session, isDelete = false) {
  const {
    transactionType,
    amount,
    sourceAccount,
    destination,
    finalAmount,
    categoryType,
  } = transaction;

  if (typeof amount !== "number" || amount <= 0)
    throw new Error("Invalid amount in transaction");

  // Find source account by name (if provided and not "--")
  const sourceAcc =
    sourceAccount && sourceAccount !== "--"
      ? await Destination.findOne({ name: sourceAccount }).session(session)
      : null;
  const destAcc =
    destination && destination !== "--"
      ? await Destination.findOne({ name: destination }).session(session)
      : null;

  switch (transactionType) {
    case "deposit":
      if (!sourceAcc || !destAcc)
        throw new Error("Source or destination account missing for deposit");
      if (isDelete) {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) + amount;
        destAcc.totalAmount =
          (destAcc.totalAmount || 0) - (finalAmount || amount);
      } else {
        sourceAcc.totalAmount = (sourceAcc.totalAmount || 0) - amount;
        destAcc.totalAmount =
          (destAcc.totalAmount || 0) + (finalAmount || amount);
        if (sourceAcc.totalAmount < 0)
          throw new Error(
            `Insufficient balance in source account. Available: $${sourceAcc.totalAmount + amount}, Required: $${amount}`,
          );
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
        if (sourceAcc.totalAmount < 0)
          throw new Error(
            `Insufficient balance in source account. Available: $${sourceAcc.totalAmount + amount}, Required: $${amount}`,
          );
      }
      await sourceAcc.save({ session });
      await destAcc.save({ session });
      break;

    case "payment inward":
      if (!destAcc)
        throw new Error("Destination account missing for payment inward");
      destAcc.totalAmount = isDelete
        ? (destAcc.totalAmount || 0) - amount
        : (destAcc.totalAmount || 0) + amount;
      await destAcc.save({ session });
      break;

    case "payment outward":
      if (!sourceAcc)
        throw new Error("Source account missing for payment outward");
      sourceAcc.totalAmount = isDelete
        ? (sourceAcc.totalAmount || 0) + amount
        : (sourceAcc.totalAmount || 0) - amount;
      await sourceAcc.save({ session });
      break;

    case "remittance":
      if (!sourceAcc) throw new Error("Source account missing for remittance");
      sourceAcc.totalAmount = isDelete
        ? (sourceAcc.totalAmount || 0) + amount
        : (sourceAcc.totalAmount || 0) - amount;
      await sourceAcc.save({ session });
      break;

    case "cash sale":
    case "credit collection":
      if (!destAcc)
        throw new Error("Destination account missing for sale transaction");
      destAcc.totalAmount = isDelete
        ? (destAcc.totalAmount || 0) - amount
        : (destAcc.totalAmount || 0) + amount;
      await destAcc.save({ session });
      break;

    default:
      if (destAcc) {
        destAcc.totalAmount = isDelete
          ? (destAcc.totalAmount || 0) - amount
          : (destAcc.totalAmount || 0) + amount;
        await destAcc.save({ session });
      }
      break;
  }
}

// Helper: Check if source account has sufficient balance (by name)
async function checkSourceAccountBalance(
  sourceAccountName,
  amount,
  transactionType,
) {
  if (!sourceAccountName || sourceAccountName === "--") return true;
  const sourceAccount = await Destination.findOne({ name: sourceAccountName });
  if (!sourceAccount)
    throw new Error(`Source account not found: ${sourceAccountName}`);
  const currentBalance = sourceAccount.totalAmount || 0;
  if (
    ["deposit", "withdraw", "remittance", "payment outward"].includes(
      transactionType,
    )
  ) {
    if (currentBalance < amount)
      throw new Error(
        `Insufficient balance in source account "${sourceAccountName}". Available: $${currentBalance.toFixed(2)}, Required: $${amount.toFixed(2)}`,
      );
  }
  return true;
}

// Helper: Parse date from various formats
const parseDate = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === "string") {
    const date = new Date(dateValue);
    if (!isNaN(date.getTime())) return date;
    const parts = dateValue.split("-");
    if (parts.length === 3) {
      const d = new Date(
        parseInt(parts[0]),
        parseInt(parts[1]) - 1,
        parseInt(parts[2]),
      );
      if (!isNaN(d.getTime())) return d;
    }
    if (dateValue.includes("/")) {
      const p = dateValue.split("/");
      if (p.length === 3) {
        const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
        if (!isNaN(d.getTime())) return d;
      }
    }
  }
  if (typeof dateValue === "number") {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
};

// Helper: Get cell value from Excel
const getCellValue = (cell) => {
  if (!cell) return null;
  if (cell.type === 6) return null;
  if (cell.type === 2 || cell.formula) {
    if (cell.result !== undefined && cell.result !== null) return cell.result;
    if (
      cell.value &&
      typeof cell.value === "string" &&
      cell.value.startsWith("=")
    ) {
      if (cell.value.startsWith("=IF(D") || cell.value.includes("=IF("))
        return null;
    }
    return "";
  }
  const value = cell.value;
  if (value === undefined || value === null) return null;
  if (typeof value === "object" && !(value instanceof Date)) {
    if (value.formula || value.sharedFormula) return cell.result || "";
    return String(value);
  }
  return value;
};

// Helper: Validate transaction by category
const validateTransactionByCategory = (categoryName, rowData) => {
  const errors = [];
  const categoryLower = categoryName.toLowerCase();
  if (!rowData["Date"]) errors.push("Date is required");
  const amount = parseFloat(rowData["Amount"]);
  if (!amount || amount <= 0 || isNaN(amount))
    errors.push("Valid Amount is required");
  switch (categoryLower) {
    case "cash sale":
    case "credit collection":
      if (!rowData["Destination Account"])
        errors.push(`Destination Account is required for ${categoryName}`);
      if (!rowData["Customer Name"])
        errors.push(`Customer Name is required for ${categoryName}`);
      if (!rowData["Invoice Number"])
        errors.push(`Invoice Number is required for ${categoryName}`);
      break;
    case "deposit":
      if (!rowData["Source Account"])
        errors.push("Source Account is required for Deposit");
      if (!rowData["Destination Account"])
        errors.push("Destination Account is required for Deposit");
      if (
        rowData["Exchange Loss"] &&
        (isNaN(parseFloat(rowData["Exchange Loss"])) ||
          parseFloat(rowData["Exchange Loss"]) < 0)
      )
        errors.push("Exchange Loss must be a valid non-negative number");
      if (
        rowData["Exchange Loss"] &&
        parseFloat(rowData["Exchange Loss"]) > amount
      )
        errors.push("Exchange Loss cannot exceed Amount");
      break;
    case "withdraw":
      if (!rowData["Source Account"])
        errors.push("Source Account is required for Withdraw");
      if (!rowData["Destination Account"])
        errors.push("Destination Account is required for Withdraw");
      break;
    case "payment inward":
      if (!rowData["Supplier Name"])
        errors.push("Supplier Name is required for Payment Inward");
      if (!rowData["Destination Account"])
        errors.push("Destination Account is required for Payment Inward");
      break;
    case "remittance":
      if (!rowData["Supplier Name"])
        errors.push("Supplier Name is required for Remittance");
      if (!rowData["Source Account"])
        errors.push("Source Account is required for Remittance");
      break;
    default:
      errors.push(`Unknown category type: ${categoryName}`);
      break;
  }
  return errors;
};

// =============================================================================
// CHECK INVOICE UNIQUENESS
// =============================================================================
router.get("/check-invoice", async (req, res) => {
  try {
    const { invoiceNumber, excludeId } = req.query;

    if (!invoiceNumber || invoiceNumber.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Invoice number is required" });
    }

    const query = { invoiceNo: invoiceNumber.trim() };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    const existing = await Transaction.findOne(query).lean();

    if (existing) {
      return res.status(200).json({
        success: true,
        exists: true,
        message: `Invoice ${invoiceNumber} already has a transaction`,
        existingTransaction: {
          id: existing._id,
          invoiceNo: existing.invoiceNo,
          categoryType: existing.categoryType,
          accountType: existing.accountType,
          destination: existing.destination,
          amount: existing.amount,
          date: existing.date,
        },
      });
    }

    return res.status(200).json({ success: true, exists: false });
  } catch (error) {
    console.error("Check invoice error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// GET ALL TRANSACTIONS
// =============================================================================
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      categoryType,
      accountType,
      page = 1,
      limit = 50,
    } = req.query;

    let query = {};

    // Safe date parsing
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const parsedStart = new Date(startDate);
        if (!isNaN(parsedStart.getTime())) {
          query.date.$gte = parsedStart;
        }
      }
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (!isNaN(parsedEnd.getTime())) {
          query.date.$lte = parsedEnd;
        }
      }
      if (Object.keys(query.date).length === 0) delete query.date;
    }

    if (categoryType) query.categoryType = categoryType;
    if (accountType) query.accountType = accountType;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 50);
    const skip = (pageNum - 1) * limitNum;

    const transactions = await Transaction.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const total = await Transaction.countDocuments(query);
    const destinations = await Destination.find();

    res.json({
      success: true,
      data: transactions,
      destinations,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("GET /transactions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET single transaction
router.get("/:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id);
    if (!transaction)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error("GET /:id error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST create transaction
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const {
      categoryType,
      sourceAccount, // string (account name)
      destination, // string (account name or "--")
      supplier, // string (optional)
      amount,
      exchangeLoss = 0,
      finalAmount,
      date,
      invoiceDate,
      invoiceNo, // string
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
      transactionType, // must be provided (e.g., "expense", "deposit", etc.)
    } = req.body;

    // Basic validation
    if (!categoryType || !amount || !date || !accountType || !transactionType) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Check invoice uniqueness globally
    if (invoiceNo && invoiceNo.trim() !== "") {
      const duplicateInvoice = await Transaction.findOne({
        invoiceNo: invoiceNo.trim(),
      });
      if (duplicateInvoice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invoice number "${invoiceNo}" already has a transaction in "${duplicateInvoice.accountType || "another tab"}".`,
        });
      }
    }

    let calculatedFinalAmount = parseFloat(finalAmount) || parseFloat(amount);
    if (transactionType === "deposit") {
      const exchangeLossValue = parseFloat(exchangeLoss) || 0;
      calculatedFinalAmount = parseFloat(amount) - exchangeLossValue;
    }

    if (sourceAccount && sourceAccount !== "--")
      await checkSourceAccountBalance(
        sourceAccount,
        parseFloat(amount),
        transactionType,
      );

    const transactionData = {
      invoiceNo: invoiceNo?.trim() || "NA",
      categoryType,
      sourceAccount: sourceAccount || "--",
      destination: destination || "--",
      supplier: supplier || "",
      amount: parseFloat(amount),
      exchangeLoss: parseFloat(exchangeLoss) || 0,
      finalAmount: calculatedFinalAmount,
      date: new Date(date),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
      transactionType,
    };

    const transaction = new Transaction(transactionData);
    await transaction.save({ session });
    await adjustBalances(transaction, session, false);
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: transaction,
      message: "Transaction created successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Transaction creation error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// Helper: Check if row is template row
const isTemplateRow = (rowData) => {
  const requiredFields = ["Category Type", "Amount", "Date", "Invoice Number"];
  for (const field of requiredFields) {
    const value = rowData[field];
    if (value && typeof value === "string") {
      const trimmed = value.trim();
      if (
        trimmed &&
        trimmed !== "--" &&
        !trimmed.startsWith("=IF(") &&
        !trimmed.startsWith("Select")
      )
        return false;
    } else if (value && typeof value === "number") {
      if (value !== 0) return false;
    }
  }
  return true;
};

// POST /import
router.post("/import", upload.single("file"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const userId = req.user?.id || new mongoose.Types.ObjectId();
    const file = req.file;
    if (!file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });

    const workbook = new ExcelJS.Workbook();
    try {
      if (file.originalname.toLowerCase().endsWith(".csv")) {
        await workbook.csv.read(file.buffer);
      } else {
        await workbook.xlsx.load(file.buffer, {
          ignoreNodes: ["calcChain"],
          ignoreStyles: true,
        });
      }
    } catch (excelError) {
      return res.status(400).json({
        success: false,
        message: "Error reading Excel file.",
        error: excelError.message,
      });
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet)
      return res
        .status(400)
        .json({ success: false, message: "No worksheet found" });

    const headerRow = worksheet.getRow(3);
    const headers = [];
    headerRow.eachCell((cell, colNumber) => {
      headers[colNumber - 1] =
        getCellValue(cell)?.toString()?.trim() || `Column ${colNumber}`;
    });

    const headerMapping = {
      "Invoice No": "Invoice Number",
      "Invoice Number": "Invoice Number",
      "Invoice #": "Invoice Number",
      "Category Type*": "Category Type",
      "Category Type": "Category Type",
      Category: "Category Type",
      "Source Account": "Source Account",
      Source: "Source Account",
      "Destination Account": "Destination Account",
      Destination: "Destination Account",
      "Amount*": "Amount",
      Amount: "Amount",
      "Exchange Loss": "Exchange Loss",
      "Final Amount (Auto)": "Final Amount",
      "Final Amount": "Final Amount",
      "Date* (YYYY-MM-DD)": "Date",
      Date: "Date",
      "Transaction Date": "Date",
      "Invoice Date (YYYY-MM-DD)": "Invoice Date",
      "Invoice Date": "Invoice Date",
      "Customer Name": "Customer Name",
      Customer: "Customer Name",
      "Customer Address": "Customer Address",
      Remarks: "Remarks",
      Notes: "Remarks",
      "Supplier Name": "Supplier Name",
      Supplier: "Supplier Name",
      "Payment To": "Supplier Name",
    };

    const importedTransactions = [];
    const errors = [];
    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    let rowNumber = 4;
    let processedRows = 0;
    let skippedRows = 0;
    let dataRowsProcessed = 0;
    const maxRowsToProcess = Math.min(worksheet.rowCount, 1000);

    while (rowNumber <= maxRowsToProcess) {
      const row = worksheet.getRow(rowNumber);
      const rowData = {};
      let hasAnyData = false;

      headers.forEach((header, index) => {
        const cell = row.getCell(index + 1);
        let value = getCellValue(cell);
        if (value !== null && value !== undefined && value !== "") {
          if (typeof value === "string") {
            value = value.trim();
            if (
              value === "--" ||
              value === "Select" ||
              value.startsWith("Select ") ||
              value.startsWith("=IF(") ||
              value === "0" ||
              value === "0.00"
            ) {
              value = "";
            } else if (value) hasAnyData = true;
          } else if (typeof value === "number") {
            if (value !== 0) hasAnyData = true;
          } else if (value instanceof Date) hasAnyData = true;
        } else value = "";
        const mappedHeader = headerMapping[header] || header;
        if (!rowData[mappedHeader]) rowData[mappedHeader] = value;
      });

      if (!hasAnyData || isTemplateRow(rowData)) {
        rowNumber++;
        skippedRows++;
        continue;
      }

      processedRows++;
      dataRowsProcessed++;
      const rowErrors = [];

      try {
        if (!rowData["Category Type"] || rowData["Category Type"].trim() === "")
          rowErrors.push("Category Type is required");
        const date = parseDate(rowData["Date"]);
        if (!date) rowErrors.push("Invalid Date format");
        const amount = parseFloat(rowData["Amount"]);
        if (isNaN(amount) || amount <= 0)
          rowErrors.push("Valid Amount is required");

        if (rowErrors.length > 0) {
          errors.push({ row: rowNumber, errors: rowErrors, data: rowData });
          rowNumber++;
          continue;
        }

        const categoryName = rowData["Category Type"].trim();
        const categoryErrors = validateTransactionByCategory(
          categoryName,
          rowData,
        );
        if (categoryErrors.length > 0) {
          errors.push({
            row: rowNumber,
            errors: categoryErrors,
            data: rowData,
          });
          rowNumber++;
          continue;
        }

        // Determine transaction type based on category name
        let transactionType = "sale";
        const catLower = categoryName.toLowerCase();
        if (catLower.includes("deposit")) transactionType = "deposit";
        else if (catLower.includes("withdraw")) transactionType = "withdraw";
        else if (catLower.includes("remittance"))
          transactionType = "remittance";
        else if (catLower.includes("payment inward"))
          transactionType = "payment inward";
        else if (catLower.includes("payment outward"))
          transactionType = "payment outward";
        else if (catLower.includes("cash sale")) transactionType = "cash sale";
        else if (catLower.includes("credit collection"))
          transactionType = "credit collection";

        const sourceAccount = rowData["Source Account"]?.trim() || "";
        const destination = rowData["Destination Account"]?.trim() || "";
        const supplier = rowData["Supplier Name"]?.trim() || "";
        const customerName = rowData["Customer Name"]?.trim() || "";
        const customerAddress = rowData["Customer Address"]?.trim() || "";
        const invoiceDate = rowData["Invoice Date"]?.trim()
          ? parseDate(rowData["Invoice Date"])
          : date;
        const exchangeLoss = parseFloat(rowData["Exchange Loss"]) || 0;
        let finalAmount = amount;
        if (transactionType === "deposit") {
          finalAmount = amount - exchangeLoss;
          if (finalAmount < 0) {
            errors.push({
              row: rowNumber,
              errors: ["Final Amount cannot be negative"],
              data: rowData,
            });
            rowNumber++;
            continue;
          }
        }

        // Check invoice uniqueness globally
        const invoiceNo = rowData["Invoice Number"]?.trim() || "";
        if (invoiceNo) {
          const exists = await Transaction.findOne({ invoiceNo });
          if (exists) {
            errors.push({
              row: rowNumber,
              errors: [
                `Invoice number "${invoiceNo}" already exists in "${exists.accountType || "another tab"}"`,
              ],
              data: rowData,
            });
            rowNumber++;
            continue;
          }
        } else if (
          ["cash sale", "credit collection"].includes(transactionType)
        ) {
          errors.push({
            row: rowNumber,
            errors: ["Invoice Number is required"],
            data: rowData,
          });
          rowNumber++;
          continue;
        }

        if (
          sourceAccount &&
          sourceAccount !== "--" &&
          ["deposit", "withdraw", "remittance", "payment outward"].includes(
            transactionType,
          )
        ) {
          try {
            await checkSourceAccountBalance(
              sourceAccount,
              amount,
              transactionType,
            );
          } catch (balanceError) {
            errors.push({
              row: rowNumber,
              errors: [balanceError.message],
              data: rowData,
            });
            rowNumber++;
            continue;
          }
        }

        const transaction = new Transaction({
          invoiceNo: invoiceNo || "NA",
          categoryType: categoryName,
          sourceAccount,
          destination,
          supplier,
          date,
          invoiceDate,
          customerName,
          customerAddress,
          amount,
          exchangeLoss,
          finalAmount,
          remarks: rowData["Remarks"]?.trim() || "",
          transactionType,
          accountType: "Cash Balance", // or could be dynamic
          createdBy: userId,
          importBatchId: batchId,
          importStatus: "imported",
        });

        await transaction.save({ session });
        await adjustBalances(transaction, session, false);
        importedTransactions.push({
          id: transaction._id,
          invoiceNo: transaction.invoiceNo,
          amount,
          category: categoryName,
        });
      } catch (err) {
        console.error(`Error processing row ${rowNumber}:`, err);
        errors.push({
          row: rowNumber,
          errors: [err.message || "Unknown error"],
          data: rowData,
        });
      }
      rowNumber++;
    }

    if (errors.length > 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Import failed with errors",
        summary: {
          totalDataRows: dataRowsProcessed,
          successCount: importedTransactions.length,
          errorCount: errors.length,
          skippedRows,
          errors: errors.slice(0, 20),
        },
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
        skippedRows,
      },
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    session.endSession();
    res.status(500).json({
      success: false,
      message: "Import failed due to server error",
      error: error.message,
    });
  }
});

// POST import test
router.post("/import/test", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    res.json({
      success: true,
      message: "File received successfully",
      fileInfo: {
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Test failed", error: error.message });
  }
});

// PUT update transaction
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }

    const existingTransaction = await Transaction.findById(id).session(session);
    if (!existingTransaction) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const newInvoiceNo = req.body.invoiceNo?.trim();
    if (newInvoiceNo && newInvoiceNo !== existingTransaction.invoiceNo) {
      const duplicateInvoice = await Transaction.findOne({
        invoiceNo: newInvoiceNo,
        _id: { $ne: new mongoose.Types.ObjectId(id) },
      }).session(session);
      if (duplicateInvoice) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invoice number "${newInvoiceNo}" already has a transaction in "${duplicateInvoice.accountType || "another tab"}".`,
        });
      }
    }

    // Reverse old balances
    await adjustBalances(existingTransaction, session, true);

    // Prepare update data
    const updateData = {
      ...req.body,
      amount: parseFloat(req.body.amount || existingTransaction.amount),
      exchangeLoss: parseFloat(
        req.body.exchangeLoss || existingTransaction.exchangeLoss,
      ),
      finalAmount: parseFloat(
        req.body.finalAmount || existingTransaction.finalAmount,
      ),
      date: req.body.date ? new Date(req.body.date) : existingTransaction.date,
      invoiceDate: req.body.invoiceDate
        ? new Date(req.body.invoiceDate)
        : existingTransaction.invoiceDate,
    };

    // Check new source account balance if changed
    if (
      updateData.sourceAccount &&
      updateData.sourceAccount !== existingTransaction.sourceAccount
    ) {
      await checkSourceAccountBalance(
        updateData.sourceAccount,
        updateData.amount,
        updateData.transactionType || existingTransaction.transactionType,
      );
    }

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    // Apply new balances
    await adjustBalances(updatedTransaction, session, false);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      data: updatedTransaction,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("PUT /:id error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE single transaction
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }
    const transaction = await Transaction.findById(id).session(session);
    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }
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
    console.error("DELETE /:id error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  }
});

// DELETE bulk
router.delete("/bulk-delete", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: "No IDs provided" });
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
      session,
    );
    if (transactions.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "No transactions found" });
    }
    for (const tx of transactions) await adjustBalances(tx, session, true);
    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(
      session,
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
    console.error("DELETE /bulk-delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

export default router;
