import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import MRCash from "../../models/accounts/MRCash.js";
import Sale from "../../models/sale/saleSummary.js";
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import multer from "multer";
import { logActivity } from "../activity/activityLog.js";
import { emitEvent, EVENT_TYPES } from "../../observability/auditLogger.js";

const router = express.Router();

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/x-excel",
      "application/x-msexcel",
      "text/csv",
      "text/plain",
      "application/csv",
      "text/comma-separated-values",
      "application/octet-stream",
    ];
    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const ext = file.originalname
      .toLowerCase()
      .slice(file.originalname.lastIndexOf("."));
    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
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

// =============================================================================
// deriveTransactionType
// =============================================================================
function deriveTransactionType(label = "") {
  const s = label.toLowerCase().trim();
  if (s.includes("remittance")) return "remittance";
  if (s.includes("payment inward")) return "payment inward";
  if (s.includes("payment outward")) return "payment outward";
  if (s.includes("credit collection")) return "credit collection";
  if (s.includes("cash sale")) return "cash sale";
  if (s.includes("tour collection")) return "tour collection";
  if (s.includes("collection")) return "collection";
  if (s.includes("deposit")) return "deposit";
  if (s.includes("withdraw")) return "withdraw";
  if (s.includes("transfer")) return "transfer";
  if (s.includes("expense")) return "expense";
  return "sale";
}

// =============================================================================
// Helper: Check if an MR (by name) is in stockTransferToMR
// =============================================================================
async function isMRInStockTransfer(mrName) {
  if (!mrName || mrName.trim() === "") return false;
  try {
    const nameRegex = new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i");
    const mrCashRecord = await MRCash.findOne({
      mrName: nameRegex,
      isActive: true,
    }).lean();
    if (!mrCashRecord) return false;
    const stockTransfer = await stockTransferToMR
      .findOne({ mrId: mrCashRecord.mrId })
      .lean();
    return !!stockTransfer;
  } catch (err) {
    console.warn("isMRInStockTransfer error:", err.message);
    return false;
  }
}

async function adjustBalances(transaction, session, isDelete = false) {
  const {
    transactionType,
    amount,
    sourceAccount,
    destination,
    finalAmount,
    categoryType,
  } = transaction;

  const amountValue = amount;
  const finalValue = finalAmount || amount;

  if (typeof amountValue !== "number" || amountValue <= 0) return;

  const sourceAcc =
    sourceAccount && sourceAccount !== "--" && sourceAccount.trim() !== ""
      ? await Destination.findOne({ name: sourceAccount }).session(session)
      : null;

  const destAcc =
    destination && destination !== "--" && destination.trim() !== ""
      ? await Destination.findOne({ name: destination }).session(session)
      : null;

  const cat = (categoryType || "").toLowerCase();
  const txType = (transactionType || "").toLowerCase();

  const isDeposit = cat.includes("deposit") || txType === "deposit";
  const isWithdraw = cat.includes("withdraw") || txType === "withdraw";
  const isCashSale = cat.includes("cash sale") || txType === "cash sale";
  const isCreditCol =
    cat.includes("credit collection") || txType === "credit collection";
  const isRemittance = cat.includes("remittance") || txType === "remittance";
  const isPaymentInward =
    cat.includes("payment inward") || txType === "payment inward";
  const isPaymentOutward =
    cat.includes("payment outward") || txType === "payment outward";

  const m = isDelete ? -1 : 1;

  if (isDeposit) {
    if (sourceAcc) {
      sourceAcc.totalAmount = Math.max(
        0,
        (sourceAcc.totalAmount || 0) - amountValue * m,
      );
      await sourceAcc.save({ session });
    }
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + finalValue * m;
      await destAcc.save({ session });
    }
  } else if (isRemittance) {
    if (sourceAcc) {
      sourceAcc.totalAmount = Math.max(
        0,
        (sourceAcc.totalAmount || 0) - amountValue * m,
      );
      await sourceAcc.save({ session });
    }
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + amountValue * m;
      await destAcc.save({ session });
    }
  } else if (isWithdraw) {
    if (sourceAcc) {
      sourceAcc.totalAmount = Math.max(
        0,
        (sourceAcc.totalAmount || 0) - amountValue * m,
      );
      await sourceAcc.save({ session });
    }
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + finalValue * m;
      await destAcc.save({ session });
    }
  } else if (isPaymentInward) {
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + finalValue * m;
      await destAcc.save({ session });
    }
  } else if (isPaymentOutward) {
    if (sourceAcc) {
      sourceAcc.totalAmount = Math.max(
        0,
        (sourceAcc.totalAmount || 0) - amountValue * m,
      );
      await sourceAcc.save({ session });
    }
  } else if (isCashSale || isCreditCol) {
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + finalValue * m;
      await destAcc.save({ session });
    }
  } else {
    if (destAcc) {
      destAcc.totalAmount = (destAcc.totalAmount || 0) + finalValue * m;
      await destAcc.save({ session });
    }
  }
}

// =============================================================================
// updateMRCashOnCreditCollection
// =============================================================================
async function updateMRCashOnCreditCollection(tx, session, add = true) {
  const { invoiceNo, finalAmount, amount, categoryType, transactionType } = tx;

  const cat = (categoryType || "").toLowerCase();
  const txType = (transactionType || "").toLowerCase();
  const isCreditCol =
    cat.includes("credit collection") || txType === "credit collection";

  if (!isCreditCol) return;
  if (!invoiceNo || invoiceNo === "NA" || invoiceNo === "") return;

  const collected = finalAmount || amount || 0;
  if (collected <= 0) return;

  const change = add ? collected : -collected;

  const sale = await Sale.findOne({ invoiceNumber: invoiceNo }).lean();
  if (!sale || !sale.mrName) {
    console.warn(
      `updateMRCashOnCreditCollection: no sale/mrName for invoice ${invoiceNo}`,
    );
    return;
  }

  const mrName = sale.mrName.trim();
  const isFieldMR = await isMRInStockTransfer(mrName);

  if (isFieldMR) {
    const nameRegex = new RegExp(`^\\s*${mrName}\\s*$`, "i");
    const mrCash = await MRCash.findOne({
      mrName: nameRegex,
      isActive: true,
    }).session(session);
    if (!mrCash) {
      console.warn(
        `updateMRCashOnCreditCollection: no MRCash record for mrName="${mrName}"`,
      );
      return;
    }
    mrCash.currentCash = parseFloat(
      Math.max(0, (mrCash.currentCash || 0) + change).toFixed(4),
    );
    mrCash.updatedAt = new Date();
    await mrCash.save({ session });
    console.log(`[Credit Collection] Added $${change} to MRCash for ${mrName}`);
  } else {
    console.log(
      `[Credit Collection] MR "${mrName}" not in stockTransferToMR — amount goes to Destination account`,
    );
  }
}

// =============================================================================
// updateSaleFromTransaction
// =============================================================================
async function updateSaleFromTransaction(tx, session, add = true) {
  const { invoiceNo, finalAmount, amount, categoryType, transactionType } = tx;
  if (!invoiceNo || invoiceNo === "NA" || invoiceNo === "") return;

  const cat = (categoryType || "").toLowerCase();
  const txType = (transactionType || "").toLowerCase();
  const isCashSale = cat.includes("cash sale") || txType === "cash sale";
  const isCreditCol =
    cat.includes("credit collection") || txType === "credit collection";
  if (!isCashSale && !isCreditCol) return;

  const sale = await Sale.findOne({ invoiceNumber: invoiceNo }).session(
    session,
  );
  if (!sale) {
    console.warn(`Sale not found for invoice: ${invoiceNo}`);
    return;
  }

  const collected = finalAmount || amount || 0;
  const change = add ? collected : -collected;

  if (isCashSale) {
    if (add) {
      sale.paidAmount = sale.totalAmount;
      sale.dueAmount = 0;
      sale.paymentStatus = "Paid";
      sale.pendingAmountPaid = "paid";
    } else {
      sale.paidAmount = 0;
      sale.dueAmount = sale.totalAmount;
      sale.paymentStatus = "Cash";
      sale.pendingAmountPaid = "pending";
    }
  } else if (isCreditCol) {
    const newPaid = Math.max(0, (sale.paidAmount || 0) + change);
    const newDue = Math.max(0, sale.totalAmount - newPaid);
    sale.paidAmount = parseFloat(newPaid.toFixed(4));
    sale.dueAmount = parseFloat(newDue.toFixed(4));

    if (newDue <= 0) {
      sale.paymentStatus = "Paid";
      sale.pendingAmountPaid = "paid";
    } else if (newPaid > 0) {
      sale.paymentStatus = "Partial Paid";
      sale.pendingAmountPaid = "pending";
    } else {
      sale.paymentStatus = "Credit";
      sale.pendingAmountPaid = "pending";
    }
  }

  await sale.save({ session });
}

// =============================================================================
// checkSourceAccountBalance
// =============================================================================
async function checkSourceAccountBalance(name, amount, txType) {
  if (!name || name === "--" || name.trim() === "") return true;
  const acc = await Destination.findOne({ name });
  if (!acc) throw new Error(`Source account not found: "${name}"`);
  const balance = acc.totalAmount || 0;

  const needsCheck = [
    "deposit",
    "withdraw",
    "remittance",
    "payment outward",
  ].includes(txType);
  if (needsCheck && balance < amount) {
    throw new Error(
      `Insufficient balance in "${name}". Available: $${balance.toFixed(2)}, Required: $${amount.toFixed(2)}`,
    );
  }
  return true;
}

// =============================================================================
// Date parsers / Excel helpers
// =============================================================================
const parseDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "string") {
    const d1 = new Date(v);
    if (!isNaN(d1)) return d1;
    const p = v.split("-");
    if (p.length === 3) {
      const d2 = new Date(+p[0], +p[1] - 1, +p[2]);
      if (!isNaN(d2)) return d2;
    }
    if (v.includes("/")) {
      const q = v.split("/");
      if (q.length === 3) {
        const d3 = new Date(+q[2], +q[1] - 1, +q[0]);
        if (!isNaN(d3)) return d3;
      }
    }
  }
  if (typeof v === "number") {
    const d4 = new Date((v - 25569) * 86400 * 1000);
    if (!isNaN(d4)) return d4;
  }
  return null;
};

const getCellValue = (cell) => {
  if (!cell) return null;
  if (cell.type === 6) return null;
  if (cell.type === 2 || cell.formula) {
    if (cell.result !== undefined && cell.result !== null) return cell.result;
    if (
      cell.value &&
      typeof cell.value === "string" &&
      cell.value.startsWith("=")
    )
      return null;
    return "";
  }
  const v = cell.value;
  if (v === undefined || v === null) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if (v.formula || v.sharedFormula) return cell.result || "";
    return String(v);
  }
  return v;
};

// =============================================================================
// validateTransactionByCategory
// =============================================================================
const validateTransactionByCategory = (categoryName, rowData) => {
  const errors = [];
  const cat = categoryName.toLowerCase();
  if (!rowData["Date"]) errors.push("Date is required");
  const amount = parseFloat(rowData["Amount"]);
  if (isNaN(amount) || amount <= 0) errors.push("Valid Amount is required");

  if (cat.includes("cash sale") || cat.includes("credit collection")) {
    if (!rowData["Destination Account"])
      errors.push(`Destination Account is required for ${categoryName}`);
    if (!rowData["Customer Name"])
      errors.push(`Customer Name is required for ${categoryName}`);
    if (!rowData["Invoice Number"])
      errors.push(`Invoice Number is required for ${categoryName}`);
  } else if (cat.includes("deposit")) {
    if (!rowData["Source Account"])
      errors.push("Source Account is required for Deposit");
    if (!rowData["Destination Account"])
      errors.push("Destination Account is required for Deposit");
    const xl = parseFloat(rowData["Exchange Loss"]);
    if (rowData["Exchange Loss"] && (isNaN(xl) || xl < 0))
      errors.push("Exchange Loss must be a valid non-negative number");
    if (rowData["Exchange Loss"] && xl > amount)
      errors.push("Exchange Loss cannot exceed Amount");
  } else if (cat.includes("withdraw")) {
    if (!rowData["Source Account"])
      errors.push("Source Account is required for Withdraw");
    if (!rowData["Destination Account"])
      errors.push("Destination Account is required for Withdraw");
  } else if (cat.includes("payment inward")) {
    if (!rowData["Supplier Name"])
      errors.push("Supplier Name is required for Payment Inward");
    if (!rowData["Destination Account"])
      errors.push("Destination Account is required for Payment Inward");
  } else if (cat.includes("payment outward")) {
    if (!rowData["Source Account"])
      errors.push("Source Account is required for Payment Outward");
  } else if (cat.includes("remittance")) {
    if (!rowData["Supplier Name"])
      errors.push("Supplier Name is required for Remittance");
    if (!rowData["Source Account"])
      errors.push("Source Account is required for Remittance");
  } else {
    errors.push(`Unknown category type: ${categoryName}`);
  }
  return errors;
};

// =============================================================================
// GET /check-invoice
// =============================================================================
router.get("/check-invoice", async (req, res) => {
  try {
    const { invoiceNumber, excludeId } = req.query;
    if (!invoiceNumber?.trim())
      return res
        .status(400)
        .json({ success: false, message: "Invoice number is required" });
    const query = { invoiceNo: invoiceNumber.trim() };
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId))
      query._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
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
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// GET / — all transactions
// =============================================================================
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      categoryType,
      accountType,
      page = 1,
      limit = 500,
    } = req.query;

    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        const d = new Date(startDate);
        if (!isNaN(d)) query.date.$gte = d;
      }
      if (endDate) {
        const d = new Date(endDate);
        if (!isNaN(d)) query.date.$lte = d;
      }
      if (!Object.keys(query.date).length) delete query.date;
    }
    if (categoryType) query.categoryType = categoryType;
    if (accountType) query.accountType = accountType;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, parseInt(limit) || 500);

    const transactions = await Transaction.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
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
    const tx = await Transaction.findById(req.params.id);
    if (!tx)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    res.json({ success: true, data: tx });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================================================
// POST / — create transaction
// =============================================================================
router.post("/", async (req, res) => {
  console.log("=== [TRANSACTION POST] Request received ===");
  const _startMs = Date.now(); // ── NEW ──

  const session = await mongoose.startSession();
  console.log("[SESSION] MongoDB session started");

  try {
    session.startTransaction();
    console.log("[SESSION] Transaction started");

    const {
      categoryType,
      sourceAccount,
      destination,
      supplier,
      amount,
      finalAmount,
      date,
      invoiceDate,
      invoiceNo,
      customerName,
      customerAddress,
      accountType,
      description,
      remarks,
      transactionType,
    } = req.body;

    if (!categoryType || !amount || !date || !accountType) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: categoryType, amount, date, accountType",
      });
    }

    const normalizedTxType = deriveTransactionType(
      categoryType || transactionType || "",
    );

    const isPaymentInward = normalizedTxType === "payment inward";
    const isPaymentOutward = normalizedTxType === "payment outward";
    const isRemittance = normalizedTxType === "remittance";

    if (isPaymentInward) {
      if (!supplier || supplier.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Supplier Name is required for Payment Inward",
        });
      }
      if (!destination || destination === "--" || destination.trim() === "") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Destination Account is required for Payment Inward",
        });
      }
    }

    if (isPaymentOutward) {
      if (
        !sourceAccount ||
        sourceAccount === "--" ||
        sourceAccount.trim() === ""
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Source Account is required for Payment Outward",
        });
      }
    }

    const invoiceNoClean =
      invoiceNo && invoiceNo.trim() && invoiceNo.trim() !== "NA"
        ? invoiceNo.trim()
        : "NA";

    if (invoiceNoClean !== "NA" && !isPaymentInward && !isPaymentOutward) {
      const sale = await Sale.findOne({
        invoiceNumber: invoiceNoClean,
      }).session(session);
      const isCreditCollection = normalizedTxType === "credit collection";

      if (accountType === "MR Cash") {
        if (!sale) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            success: false,
            message: `Sale with invoice "${invoiceNoClean}" not found.`,
          });
        }
        const dueAmount = sale.dueAmount || 0;
        if (dueAmount <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Invoice "${invoiceNoClean}" is already fully paid.`,
          });
        }
        const paymentAmount = parseFloat(amount);
        if (paymentAmount > dueAmount) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Payment amount (${paymentAmount}) exceeds remaining due amount (${dueAmount}) for invoice "${invoiceNoClean}".`,
          });
        }
      } else {
        if (!isCreditCollection) {
          const dup = await Transaction.findOne({
            invoiceNo: invoiceNoClean,
          }).session(session);
          if (dup) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              success: false,
              message: `Invoice "${invoiceNoClean}" already has a transaction in "${dup.accountType || "another tab"}".`,
            });
          }
        }
      }
    }

    const amountNum = parseFloat(amount);
    let calcFinal;
    if (isRemittance) {
      calcFinal = amountNum;
    } else {
      calcFinal = parseFloat(finalAmount) || amountNum;
    }

    const isConversionLoss = isRemittance;

    if (
      sourceAccount &&
      sourceAccount !== "--" &&
      sourceAccount.trim() !== ""
    ) {
      await checkSourceAccountBalance(
        sourceAccount,
        amountNum,
        normalizedTxType,
      );
    }

    const txData = {
      invoiceNo: invoiceNoClean,
      categoryType,
      sourceAccount: sourceAccount || "--",
      destination: destination || "--",
      supplier: supplier || "",
      amount: amountNum,
      finalAmount: calcFinal,
      isConversionLoss,
      date: new Date(date),
      invoiceDate: invoiceDate ? new Date(invoiceDate) : undefined,
      customerName: customerName || "",
      customerAddress: customerAddress || "",
      accountType,
      description: description || "",
      remarks: remarks || "",
      transactionType: normalizedTxType,
    };

    const tx = new Transaction(txData);
    await tx.save({ session });

    await adjustBalances(tx, session, false);
    await updateSaleFromTransaction(tx, session, true);
    await updateMRCashOnCreditCollection(tx, session, true);

    await session.commitTransaction();
    session.endSession();

    // ── Log CREATE activity ──
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Transaction: ${categoryType} — $${amountNum}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: tx._id,
      referenceNumber:
        invoiceNoClean !== "NA" ? invoiceNoClean : tx._id.toString(),
      newData: tx.toObject(),
      description: `New ${categoryType} transaction created. Amount: $${amountNum}, Account: ${accountType}${invoiceNoClean !== "NA" ? `, Invoice: ${invoiceNoClean}` : ""}`,
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.TRANSACTION_CREATED,
      entityType: "Transaction",
      entityId:   tx._id.toString(),
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        categoryType,
        transactionType: normalizedTxType,
        amount:          amountNum,
        finalAmount:     calcFinal,
        accountType,
        invoiceNo:       invoiceNoClean !== "NA" ? invoiceNoClean : null,
        sourceAccount:   sourceAccount || null,
        destination:     destination || null,
      },
    });
    // ─────────

    res.status(201).json({
      success: true,
      data: tx,
      message: "Transaction created successfully",
    });
  } catch (error) {
    console.log("=== [TRANSACTION POST] ERROR ===", error.message);
    await session.abortTransaction();
    session.endSession();
    // ── NEW ──
    await emitEvent(req, {
      eventType:    EVENT_TYPES.TRANSACTION_CREATED,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
      metadata: { categoryType: req.body?.categoryType },
    });
    // ─────────
    res.status(400).json({ success: false, message: error.message });
  }
});

// =============================================================================
// POST /import
// =============================================================================
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
      if (file.originalname.toLowerCase().endsWith(".csv"))
        await workbook.csv.read(file.buffer);
      else
        await workbook.xlsx.load(file.buffer, {
          ignoreNodes: ["calcChain"],
          ignoreStyles: true,
        });
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Error reading Excel file.",
        error: e.message,
      });
    }

    const ws = workbook.worksheets[0];
    if (!ws)
      return res
        .status(400)
        .json({ success: false, message: "No worksheet found" });

    const headerRow = ws.getRow(3);
    const headers = [];
    headerRow.eachCell((cell, col) => {
      headers[col - 1] =
        getCellValue(cell)?.toString()?.trim() || `Column ${col}`;
    });

    const headerMap = {
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

    const imported = [],
      errors = [];
    const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let rowNumber = 4,
      dataRows = 0,
      skipped = 0;
    const maxRows = Math.min(ws.rowCount, 1000);

    while (rowNumber <= maxRows) {
      const row = ws.getRow(rowNumber);
      const rowData = {};
      let hasData = false;

      headers.forEach((h, i) => {
        const cell = row.getCell(i + 1);
        let v = getCellValue(cell);
        if (v !== null && v !== undefined && v !== "") {
          if (typeof v === "string") {
            v = v.trim();
            if (
              v === "--" ||
              v === "Select" ||
              v.startsWith("Select ") ||
              v.startsWith("=IF(") ||
              v === "0" ||
              v === "0.00"
            )
              v = "";
            else if (v) hasData = true;
          } else if (typeof v === "number" && v !== 0) hasData = true;
          else if (v instanceof Date) hasData = true;
        } else v = "";
        const mh = headerMap[h] || h;
        if (!rowData[mh]) rowData[mh] = v;
      });

      if (!hasData || isTemplateRow(rowData)) {
        rowNumber++;
        skipped++;
        continue;
      }
      dataRows++;

      try {
        const rowErrors = [];
        if (!rowData["Category Type"]?.trim())
          rowErrors.push("Category Type is required");
        const dt = parseDate(rowData["Date"]);
        if (!dt) rowErrors.push("Invalid Date format");
        const amt = parseFloat(rowData["Amount"]);
        if (isNaN(amt) || amt <= 0) rowErrors.push("Valid Amount is required");
        if (rowErrors.length) {
          errors.push({ row: rowNumber, errors: rowErrors, data: rowData });
          rowNumber++;
          continue;
        }

        const catName = rowData["Category Type"].trim();
        const catErrors = validateTransactionByCategory(catName, rowData);
        if (catErrors.length) {
          errors.push({ row: rowNumber, errors: catErrors, data: rowData });
          rowNumber++;
          continue;
        }

        const normTxType = deriveTransactionType(catName);
        const isImportRemittance = normTxType === "remittance";
        const srcAcc = rowData["Source Account"]?.trim() || "";
        const destAcc = rowData["Destination Account"]?.trim() || "";
        const supplier = rowData["Supplier Name"]?.trim() || "";
        const custName = rowData["Customer Name"]?.trim() || "";
        const custAddr = rowData["Customer Address"]?.trim() || "";
        const invDate = rowData["Invoice Date"]?.trim()
          ? parseDate(rowData["Invoice Date"])
          : dt;
        const exLoss = parseFloat(rowData["Exchange Loss"]) || 0;

        let final = amt;
        if (normTxType === "deposit") {
          final = amt - exLoss;
          if (final < 0) {
            errors.push({
              row: rowNumber,
              errors: ["Final Amount cannot be negative"],
              data: rowData,
            });
            rowNumber++;
            continue;
          }
        } else if (isImportRemittance) {
          final = amt;
        }

        const isConversionLoss = isImportRemittance;

        const invNo = rowData["Invoice Number"]?.trim() || "";
        const invNoClean = invNo || "NA";
        const isPI = normTxType === "payment inward";
        const isPO = normTxType === "payment outward";
        const isCreditCollection = normTxType === "credit collection";

        if (invNoClean !== "NA" && !isPI && !isPO) {
          if (!isCreditCollection) {
            const exists = await Transaction.findOne({ invoiceNo: invNoClean });
            if (exists) {
              errors.push({
                row: rowNumber,
                errors: [
                  `Invoice "${invNoClean}" already exists in "${exists.accountType || "another tab"}"`,
                ],
                data: rowData,
              });
              rowNumber++;
              continue;
            }
          }
          if (normTxType === "credit collection") {
            const s = await Sale.findOne({ invoiceNumber: invNoClean });
            if (s && s.pendingAmountPaid === "paid") {
              errors.push({
                row: rowNumber,
                errors: [`Invoice "${invNoClean}" is already fully paid`],
                data: rowData,
              });
              rowNumber++;
              continue;
            }
          }
        } else if (
          ["cash sale", "credit collection"].includes(normTxType) &&
          invNoClean === "NA"
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
          srcAcc &&
          srcAcc !== "--" &&
          ["deposit", "withdraw", "remittance", "payment outward"].includes(
            normTxType,
          )
        ) {
          try {
            await checkSourceAccountBalance(srcAcc, amt, normTxType);
          } catch (be) {
            errors.push({
              row: rowNumber,
              errors: [be.message],
              data: rowData,
            });
            rowNumber++;
            continue;
          }
        }

        const tx = new Transaction({
          invoiceNo: invNoClean,
          categoryType: catName,
          sourceAccount: srcAcc,
          destination: destAcc,
          supplier,
          date: dt,
          invoiceDate: invDate,
          customerName: custName,
          customerAddress: custAddr,
          amount: amt,
          exchangeLoss: exLoss,
          finalAmount: final,
          isConversionLoss,
          remarks: rowData["Remarks"]?.trim() || "",
          transactionType: normTxType,
          accountType: req.body.accountType || "Cash Balance",
          createdBy: userId,
          importBatchId: batchId,
          importStatus: "imported",
        });

        await tx.save({ session });
        await adjustBalances(tx, session, false);
        await updateSaleFromTransaction(tx, session, true);
        await updateMRCashOnCreditCollection(tx, session, true);
        imported.push({
          id: tx._id,
          invoiceNo: tx.invoiceNo,
          amount: amt,
          category: catName,
          isConversionLoss,
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

    if (errors.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Import failed with errors",
        summary: {
          totalDataRows: dataRows,
          successCount: imported.length,
          errorCount: errors.length,
          skippedRows: skipped,
          errors: errors.slice(0, 20),
        },
      });
    }

    await session.commitTransaction();
    session.endSession();

    // ── Log IMPORT activity ──
    await logActivity(req, {
      action: "IMPORT",
      actionLabel: `Bulk Imported ${imported.length} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      description: `Imported ${imported.length} transactions from Excel. Batch ID: ${batchId}. Skipped rows: ${skipped}.`,
      newData: {
        importedCount: imported.length,
        skippedRows: skipped,
        totalDataRows: dataRows,
        batchId,
        accountType: req.body.accountType || "Cash Balance",
      },
    });

    res.json({
      success: true,
      message: `Successfully imported ${imported.length} transaction(s)`,
      batchId,
      importedTransactions: imported,
      summary: {
        totalDataRows: dataRows,
        totalImported: imported.length,
        skippedRows: skipped,
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

router.post("/import/test", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file)
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    res.json({
      success: true,
      message: "File received",
      fileInfo: {
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
      },
    });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, message: "Test failed", error: e.message });
  }
});

// =============================================================================
// PUT /:id — update transaction
// =============================================================================
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const _startMs = Date.now(); // ── NEW ──
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }

    const existing = await Transaction.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    // ── Snapshot before update ──
    const previousData = existing.toObject();

    const newCategoryType =
      req.body.categoryType || existing.categoryType || "";
    const newNormTxType = deriveTransactionType(
      req.body.categoryType ||
        req.body.transactionType ||
        existing.transactionType ||
        "",
    );

    const isPaymentInward = newNormTxType === "payment inward";
    const isPaymentOutward = newNormTxType === "payment outward";
    const isRemittance = newNormTxType === "remittance";

    const newInvoiceNo = (
      req.body.invoiceNo ||
      existing.invoiceNo ||
      ""
    ).trim();
    if (
      newInvoiceNo &&
      newInvoiceNo !== "NA" &&
      newInvoiceNo !== existing.invoiceNo &&
      !isPaymentInward &&
      !isPaymentOutward
    ) {
      const dup = await Transaction.findOne({
        invoiceNo: newInvoiceNo,
        _id: { $ne: id },
      }).session(session);
      if (dup) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invoice "${newInvoiceNo}" already has a transaction in "${dup.accountType || "another tab"}".`,
        });
      }
    }

    if (isPaymentInward) {
      const supplierVal = req.body.supplier || existing.supplier || "";
      if (!supplierVal.trim()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Supplier Name is required for Payment Inward",
        });
      }
    }

    if (isPaymentOutward) {
      const srcVal = req.body.sourceAccount || existing.sourceAccount || "";
      if (!srcVal || srcVal === "--" || !srcVal.trim()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Source Account is required for Payment Outward",
        });
      }
    }

    await adjustBalances(existing, session, true);
    await updateSaleFromTransaction(existing, session, false);
    await updateMRCashOnCreditCollection(existing, session, false);

    const newAmount = parseFloat(req.body.amount ?? existing.amount);
    const newExchangeLoss = parseFloat(
      req.body.exchangeLoss ?? existing.exchangeLoss ?? 0,
    );

    let newFinalAmount = parseFloat(
      req.body.finalAmount ?? existing.finalAmount,
    );
    if (newNormTxType === "deposit") {
      newFinalAmount = newAmount - newExchangeLoss;
    } else if (isRemittance) {
      newFinalAmount = newAmount;
    }

    const isConversionLoss = isRemittance;

    const updateData = {
      categoryType: newCategoryType,
      transactionType: newNormTxType,
      amount: newAmount,
      exchangeLoss: newExchangeLoss,
      finalAmount: newFinalAmount,
      isConversionLoss,
      date: req.body.date ? new Date(req.body.date) : existing.date,
      invoiceDate: req.body.invoiceDate
        ? new Date(req.body.invoiceDate)
        : existing.invoiceDate,
      invoiceNo: newInvoiceNo || "NA",
      sourceAccount: req.body.sourceAccount ?? existing.sourceAccount ?? "--",
      destination: req.body.destination ?? existing.destination ?? "--",
      supplier: req.body.supplier ?? existing.supplier ?? "",
      customerName: req.body.customerName ?? existing.customerName ?? "",
      customerAddress:
        req.body.customerAddress ?? existing.customerAddress ?? "",
      remarks: req.body.remarks ?? existing.remarks ?? "",
      accountType: req.body.accountType || existing.accountType,
    };

    if (updateData.sourceAccount && updateData.sourceAccount !== "--") {
      await checkSourceAccountBalance(
        updateData.sourceAccount,
        updateData.finalAmount || updateData.amount || 0,
        newNormTxType,
      );
    }

    const updated = await Transaction.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });
    if (!updated) throw new Error("Failed to update transaction");

    await adjustBalances(updated, session, false);
    await updateSaleFromTransaction(updated, session, true);
    await updateMRCashOnCreditCollection(updated, session, true);

    await session.commitTransaction();
    session.endSession();

    // ── Log UPDATE activity ──
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Transaction: ${newCategoryType} — $${newAmount}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: updated._id,
      referenceNumber:
        updated.invoiceNo !== "NA" ? updated.invoiceNo : updated._id.toString(),
      previousData,
      newData: updated.toObject(),
      description: `Transaction updated. Category: ${newCategoryType}, Amount: $${newAmount}, Account: ${updated.accountType}${updated.invoiceNo !== "NA" ? `, Invoice: ${updated.invoiceNo}` : ""}`,
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.TRANSACTION_UPDATED,
      entityType: "Transaction",
      entityId:   updated._id.toString(),
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        categoryType:    newCategoryType,
        transactionType: newNormTxType,
        amountBefore:    previousData.amount,
        amountAfter:     newAmount,
        accountType:     updated.accountType,
        invoiceNo:       updated.invoiceNo !== "NA" ? updated.invoiceNo : null,
      },
    });
    // ─────────

    res.json({
      success: true,
      data: updated,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("PUT /:id error:", error);
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.TRANSACTION_UPDATED,
      entityType:   "Transaction",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    res.status(400).json({
      success: false,
      message: error.message || "Update failed",
      details: error.errors || null,
    });
  }
});

// =============================================================================
// DELETE /:id
// =============================================================================
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const _startMs = Date.now(); // ── NEW ──
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid transaction ID" });
    }
    const tx = await Transaction.findById(id).session(session);
    if (!tx) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    // ── Snapshot before deletion ──
    const previousData = tx.toObject();

    await adjustBalances(tx, session, true);
    await updateSaleFromTransaction(tx, session, false);
    await updateMRCashOnCreditCollection(tx, session, false);
    await Transaction.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    // ── Log DELETE activity ──
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Transaction: ${previousData.categoryType} — $${previousData.amount}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: previousData._id,
      referenceNumber:
        previousData.invoiceNo !== "NA"
          ? previousData.invoiceNo
          : previousData._id.toString(),
      previousData,
      description: `Transaction deleted. Category: ${previousData.categoryType}, Amount: $${previousData.amount}, Account: ${previousData.accountType}${previousData.invoiceNo !== "NA" ? `, Invoice: ${previousData.invoiceNo}` : ""}`,
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.TRANSACTION_DELETED,
      entityType: "Transaction",
      entityId:   id,
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        categoryType:    previousData.categoryType,
        transactionType: previousData.transactionType,
        amount:          previousData.amount,
        accountType:     previousData.accountType,
        invoiceNo:       previousData.invoiceNo !== "NA" ? previousData.invoiceNo : null,
        deleted:         true,
      },
    });
    // ─────────

    res.json({
      success: true,
      message: "Transaction deleted and balances updated successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.TRANSACTION_DELETED,
      entityType:   "Transaction",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
      error: error.message,
    });
  }
});

// =============================================================================
// DELETE / — bulk delete
// =============================================================================
router.delete("/", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: "No IDs provided" });

  const session = await mongoose.startSession();
  session.startTransaction();
  const _startMs = Date.now(); // ── NEW ──
  try {
    const invalid = ids.filter((i) => !mongoose.Types.ObjectId.isValid(i));
    if (invalid.length) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid IDs: ${invalid.join(", ")}`,
      });
    }
    const txs = await Transaction.find({ _id: { $in: ids } }).session(session);
    if (!txs.length) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "No transactions found" });
    }

    // ── Snapshot all before deletion ──
    const previousData = txs.map((t) => t.toObject());

    for (const tx of txs) {
      await adjustBalances(tx, session, true);
      await updateSaleFromTransaction(tx, session, false);
      await updateMRCashOnCreditCollection(tx, session, false);
    }
    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(
      session,
    );

    await session.commitTransaction();
    session.endSession();

    // ── Log BULK DELETE activity ──
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      previousData,
      description: `Deleted ${result.deletedCount} transactions. Balances and sale records updated.`,
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.TRANSACTION_DELETED,
      entityType: "Transaction",
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        deletedCount: result.deletedCount,
        ids,
        bulk: true,
      },
    });
    // ─────────

    res.json({
      success: true,
      message: `${result.deletedCount} transaction(s) deleted successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.TRANSACTION_DELETED,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
      metadata: { bulk: true },
    });
    res.status(500).json({
      success: false,
      message: "Failed to delete transactions",
      error: error.message,
    });
  }
});

// =============================================================================
// POST /bulk
// =============================================================================
router.post("/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0)
      throw new Error("Invalid or empty transactions array");

    const created = [];

    for (const txData of transactions) {
      const {
        categoryType,
        sourceAccount,
        destination,
        supplier,
        amount,
        exchangeLoss = 0,
        finalAmount,
        date,
        invoiceNo,
        accountType,
        remarks,
        transactionType,
      } = txData;

      if (!categoryType || !amount || !date || !accountType)
        throw new Error("Missing required fields in one of the transactions");

      const normalizedTxType = deriveTransactionType(
        categoryType || transactionType || "",
      );
      const isBulkRemittance = normalizedTxType === "remittance";
      const amountNum = parseFloat(amount);
      const exchangeLossNum = parseFloat(exchangeLoss) || 0;

      let calcFinal = parseFloat(finalAmount) || amountNum;
      if (normalizedTxType === "deposit") {
        calcFinal = amountNum - exchangeLossNum;
      } else if (isBulkRemittance) {
        calcFinal = amountNum;
      }

      const isConversionLoss = isBulkRemittance;

      if (
        sourceAccount &&
        sourceAccount !== "--" &&
        sourceAccount.trim() !== ""
      ) {
        await checkSourceAccountBalance(
          sourceAccount,
          amountNum,
          normalizedTxType,
        );
      }

      const tx = new Transaction({
        invoiceNo: invoiceNo || "NA",
        categoryType,
        sourceAccount: sourceAccount || "--",
        destination: destination || "--",
        supplier: supplier || "",
        amount: amountNum,
        exchangeLoss: exchangeLossNum,
        finalAmount: calcFinal,
        isConversionLoss,
        date: new Date(date),
        customerName: txData.customerName || "",
        customerAddress: txData.customerAddress || "",
        accountType,
        remarks: remarks || "",
        transactionType: normalizedTxType,
      });

      await tx.save({ session });
      await adjustBalances(tx, session, false);
      await updateSaleFromTransaction(tx, session, true);
      await updateMRCashOnCreditCollection(tx, session, true);
      created.push(tx);
    }

    await session.commitTransaction();
    session.endSession();

    // ── Log BULK CREATE activity ──
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Bulk Created ${created.length} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      newData: {
        count: created.length,
        transactions: created.map((t) => ({
          id: t._id,
          categoryType: t.categoryType,
          amount: t.amount,
          accountType: t.accountType,
          invoiceNo: t.invoiceNo,
        })),
      },
      description: `Bulk created ${created.length} transactions.`,
    });

    res.status(201).json({
      success: true,
      data: created,
      message: `${created.length} transaction(s) created successfully`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk transaction error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;