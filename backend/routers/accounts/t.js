import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import MRCash from "../../models/accounts/MRCash.js";
import Sale from "../../models/sale/saleSummary.js";
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import multer from "multer";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";

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
// NOTE: "remittance" must be checked BEFORE generic terms so it is never missed
// =============================================================================
function deriveTransactionType(label = "") {
  const s = label.toLowerCase().trim();
  if (s.includes("remittance")) return "remittance"; // ← must come first
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
// POST / — create transaction (with activity log)
// =============================================================================
router.post("/", protect, async (req, res) => {
  console.log("=== [TRANSACTION POST] Request received ===");
  console.log("[REQ BODY]:", JSON.stringify(req.body, null, 2));

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

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Transaction: ${tx.invoiceNo || "NA"} (${tx.categoryType})`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: tx._id,
      referenceNumber: tx.invoiceNo !== "NA" ? tx.invoiceNo : tx._id.toString(),
      newData: tx.toObject(),
      description: `Transaction ${tx.categoryType} of amount ${tx.amount} created`,
      refField: "invoiceNo",
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: tx,
      message: "Transaction created successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post("/import", protect, upload.single("file"), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    // ... (all import logic, keep as is) ...

    // After successful import, log:
    await logActivity(req, {
      action: "IMPORT",
      actionLabel: `Bulk Imported ${imported.length} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      description: `Imported ${imported.length} transactions. Errors: ${errors.length}`,
      newData: { importedCount: imported.length, batchId },
    });

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, message: `Imported ${imported.length} transactions` });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const existing = await Transaction.findById(id).session(session);
    if (!existing) throw new Error("Transaction not found");

    // Reverse old effects, apply updates (same as original)
    // ...

    const updated = await Transaction.findByIdAndUpdate(id, updateData, { new: true, session });

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Transaction: ${updated.invoiceNo || "NA"}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: updated._id,
      referenceNumber: updated.invoiceNo !== "NA" ? updated.invoiceNo : updated._id.toString(),
      previousData: existing.toObject(),
      newData: updated.toObject(),
      description: `Transaction ${existing._id} updated`,
      refField: "invoiceNo",
    });

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, data: updated });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const tx = await Transaction.findById(id).session(session);
    if (!tx) throw new Error("Transaction not found");

    // Reverse balances, then delete
    await adjustBalances(tx, session, true);
    await updateSaleFromTransaction(tx, session, false);
    await updateMRCashOnCreditCollection(tx, session, false);
    await Transaction.findByIdAndDelete(id, { session });

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Transaction: ${tx.invoiceNo || "NA"}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: tx._id,
      referenceNumber: tx.invoiceNo !== "NA" ? tx.invoiceNo : tx._id.toString(),
      previousData: tx.toObject(),
      description: `Transaction ${tx._id} permanently deleted`,
      refField: "invoiceNo",
    });

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, message: "Transaction deleted" });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/", protect, allowAdminOnly, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: "No IDs provided" });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const txs = await Transaction.find({ _id: { $in: ids } }).session(session);
    if (!txs.length) throw new Error("No transactions found");

    for (const tx of txs) {
      await adjustBalances(tx, session, true);
      await updateSaleFromTransaction(tx, session, false);
      await updateMRCashOnCreditCollection(tx, session, false);
    }
    const result = await Transaction.deleteMany({ _id: { $in: ids } }).session(session);

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      previousData: txs.map(t => t.toObject()),
      description: `Deleted ${result.deletedCount} transactions`,
      refField: "invoiceNo",
    });

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, message: `${result.deletedCount} transactions deleted` });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/bulk", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { transactions } = req.body;
    const created = [];
    // ... bulk creation logic ...

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Bulk Created ${created.length} Transaction(s)`,
      tableName: "transactions",
      tableLabel: "Transaction",
      newData: { count: created.length, firstFew: created.slice(0,5).map(t => t.toObject()) },
      description: `Bulk created ${created.length} transactions`,
    });

    await session.commitTransaction();
    session.endSession();
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;