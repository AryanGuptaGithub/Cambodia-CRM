import express from "express";
import mongoose from "mongoose";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import Transfer from "../../models/accounts/transfer.js";
import Account from "../../models/accounts/Destination.js";
import User from "../../models/User.js";
import Transaction from "../../models/accounts/Transaction.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import stockInMRHand from "../../models/stock/stockInMRHand.js";
import Product from "../../models/projectManger/product.js";
import stockTransferToMR from "../../models/stock/stockTransferToMR.js";
import Sale from "../../models/sale/saleSummary.js";
import { logActivity } from "../activity/activityLog.js"; // Add this import

const router = express.Router();

const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

// Helper to get user ID from request
const getUserIdFromRequest = (req) => {
  return req.user?.id || req.user?._id || null;
};

// ─── helper: recalculate and save sale payment fields ─────────────────────────
async function recalculateSalePayment(sale, session) {
  const total = parseFloat(sale.totalAmount) || 0;
  const paid = parseFloat(Math.max(0, sale.paidAmount).toFixed(4));
  const due = parseFloat(Math.max(0, total - paid).toFixed(4));

  sale.paidAmount = paid;
  sale.dueAmount = due;

  if (due <= 0) {
    sale.paymentStatus = "Paid";
    sale.pendingAmountPaid = "paid";
  } else if (paid > 0) {
    sale.paymentStatus = "Partial Paid";
    sale.pendingAmountPaid = "pending";
  } else {
    sale.paymentStatus = "Unpaid";
    sale.pendingAmountPaid = "pending";
  }

  sale.updatedAt = new Date();
  await sale.save({ session });
  return sale;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /  — all active MR Cash records
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const stockTransfers = await stockTransferToMR.find({}, { mrId: 1 }).lean();
    const mrIds = stockTransfers.map((item) => item.mrId);

    const query = { isActive: true, mrId: { $in: mrIds } };

    if (search) {
      query.$or = [
        { mrName: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await MRCash.countDocuments(query);

    const totals = await MRCash.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCurrentCash: { $sum: "$currentCash" },
          totalTransferred: { $sum: "$cashTransferredToAdmin" },
          totalAll: {
            $sum: { $add: ["$currentCash", "$cashTransferredToAdmin"] },
          },
        },
      },
    ]);

    const mrCashes = await MRCash.find(query)
      .populate(
        "mrId",
        "medicalRepName employeeName phone email MRId teamName contactNo",
      )
      .populate("categoryType", "name code")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const formattedData = mrCashes.map((mr) => ({
      _id: mr._id,
      mrId: mr.mrId?._id || mr.mrId,
      mrName: mr.mrName,
      mrDetails: mr.mrId
        ? {
            name: mr.mrId.medicalRepName || mr.mrId.employeeName,
            phone: mr.mrId.phone || mr.mrId.contactNo,
            email: mr.mrId.email,
            MRId: mr.mrId.MRId,
            teamName: mr.mrId.teamName,
          }
        : null,
      categoryType: mr.categoryType
        ? {
            _id: mr.categoryType._id,
            name: mr.categoryType.name,
            code: mr.categoryType.code,
          }
        : null,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      totalCash: mr.currentCash + mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      isActive: mr.isActive,
      createdAt: mr.createdAt,
      updatedAt: mr.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      totals: totals[0] || {
        totalCurrentCash: 0,
        totalTransferred: 0,
        totalAll: 0,
      },
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching MR Cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  — create new MR Cash record
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const {
      mrId,
      currentCash = 0,
      cashTransferredToAdmin = 0,
      notes = "",
      categoryType,
    } = req.body;

    const staff = await Staff.findById(mrId);
    if (!staff)
      return res.status(404).json({ success: false, message: "MR not found" });

    if (categoryType) {
      const category = await CategoryType.findById(categoryType);
      if (!category)
        return res
          .status(404)
          .json({ success: false, message: "Category type not found" });
    }

    const existingMRCash = await MRCash.findOne({ mrId, isActive: true });
    if (existingMRCash)
      return res.status(400).json({
        success: false,
        message: "Cash record already exists for this MR",
      });

    const mrCash = new MRCash({
      mrId,
      mrName: staff.medicalRepName || staff.employeeName,
      currentCash,
      cashTransferredToAdmin,
      notes,
      categoryType: categoryType || null,
      createdBy: req.user?.id || staff.userId,
      updatedBy: req.user?.id || staff.userId,
    });

    await mrCash.save();
    await mrCash.populate("categoryType", "name code");

    // Log activity for CREATE
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created MR Cash Record for ${staff.medicalRepName || staff.employeeName}`,
      tableName: "mrcashes",
      tableLabel: "MR Cash",
      recordId: mrCash._id,
      referenceNumber: staff.MRId || mrCash.mrName,
      newData: mrCash.toObject(),
      description: `MR Cash record created for ${mrCash.mrName} with initial cash ${formatCurrency(currentCash)}`,
      refField: "mrName",
    });

    res.status(201).json({
      success: true,
      message: "MR Cash record created successfully",
      data: mrCash,
    });
  } catch (error) {
    console.error("Error creating MR Cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /summary
// ─────────────────────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const totals = await MRCash.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: null,
          totalCurrentCash: { $sum: "$currentCash" },
          totalTransferred: { $sum: "$cashTransferredToAdmin" },
          totalRecords: { $sum: 1 },
          avgCurrentCash: { $avg: "$currentCash" },
          maxCurrentCash: { $max: "$currentCash" },
          minCurrentCash: { $min: "$currentCash" },
        },
      },
    ]);

    const positiveCashCount = await MRCash.countDocuments({
      isActive: true,
      currentCash: { $gt: 0 },
    });
    const zeroCashCount = await MRCash.countDocuments({
      isActive: true,
      currentCash: { $eq: 0 },
    });

    const recentTransfers = await MRCash.find({
      isActive: true,
      lastTransferDate: { $exists: true, $ne: null },
    })
      .sort({ lastTransferDate: -1 })
      .limit(5)
      .select("mrName currentCash cashTransferredToAdmin lastTransferDate")
      .lean();

    const destinationAccounts = await Account.find({
      code: { $in: ["cash_balance"] },
    }).select("name code totalAmount");

    res.status(200).json({
      success: true,
      data: {
        ...(totals[0] || {
          totalCurrentCash: 0,
          totalTransferred: 0,
          totalRecords: 0,
          avgCurrentCash: 0,
          maxCurrentCash: 0,
          minCurrentCash: 0,
        }),
        positiveCashCount,
        zeroCashCount,
        recentTransfers,
        destinationAccounts,
      },
    });
  } catch (error) {
    console.error("Error fetching MR Cash summary:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /destination-accounts
// ─────────────────────────────────────────────────────────────────────────────
router.get("/destination-accounts", async (req, res) => {
  try {
    const accounts = await Account.find()
      .select("name code totalAmount accountType")
      .sort({ name: 1 });
    res
      .status(200)
      .json({ success: true, data: accounts, count: accounts.length });
  } catch (error) {
    console.error("Error fetching destination accounts:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-list", async (req, res) => {
  try {
    const mrsWithCash = await MRCash.find({
      isActive: true,
      currentCash: { $gt: 0 },
    })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code")
      .select(
        "mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes categoryType",
      )
      .sort({ currentCash: -1 });

    const formattedMRs = mrsWithCash.map((mr) => ({
      value: mr._id,
      label: `${mr.mrName} - ${formatCurrency(mr.currentCash)}`,
      mrName: mr.mrName,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      category: mr.categoryType
        ? {
            id: mr.categoryType._id,
            name: mr.categoryType.name,
            code: mr.categoryType.code,
          }
        : null,
      ...(mr.mrId && {
        staffId: mr.mrId._id,
        phone: mr.mrId.contactNo,
        email: mr.mrId.email,
        MRId: mr.mrId.MRId,
        teamName: mr.mrId.teamName,
      }),
    }));

    res
      .status(200)
      .json({ success: true, data: formattedMRs, count: formattedMRs.length });
  } catch (error) {
    console.error("Error fetching MR list from MRCash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-list-with-cash
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-list-with-cash", async (req, res) => {
  try {
    const { minCash = 0 } = req.query;

    const stockTransfers = await stockTransferToMR.find({}, { mrId: 1 }).lean();
    const mrIdsWithStock = stockTransfers.map((t) => t.mrId).filter(Boolean);

    if (mrIdsWithStock.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        count: 0,
        message: "No MRs found with stock transfers",
      });
    }

    const mrsWithCash = await MRCash.find({
      isActive: true,
      mrId: { $in: mrIdsWithStock },
      currentCash: { $gt: parseFloat(minCash) >= 0 ? parseFloat(minCash) : 0 },
    })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code")
      .select(
        "mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes categoryType",
      )
      .sort({ currentCash: -1 });

    const formattedMRs = mrsWithCash.map((mr) => ({
      value: mr._id,
      label: `${mr.mrName} - Available: ${formatCurrency(mr.currentCash)}`,
      mrName: mr.mrName,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      category: mr.categoryType
        ? {
            id: mr.categoryType._id,
            name: mr.categoryType.name,
            code: mr.categoryType.code,
          }
        : null,
      ...(mr.mrId && {
        staffId: mr.mrId._id,
        phone: mr.mrId.contactNo,
        email: mr.mrId.email,
        MRId: mr.mrId.MRId,
        teamName: mr.mrId.teamName,
      }),
    }));

    res.status(200).json({
      success: true,
      data: formattedMRs,
      count: formattedMRs.length,
      message: `Found ${formattedMRs.length} MRs with positive cash balance and stock transfers`,
    });
  } catch (error) {
    console.error("Error fetching MR list with cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr/:mrId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;
    const mrCash = await MRCash.findOne({ mrId, isActive: true })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code");

    if (!mrCash)
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found for this MR",
      });

    res.status(200).json({
      success: true,
      data: {
        _id: mrCash._id,
        mrId: mrCash.mrId?._id || mrCash.mrId,
        mrName: mrCash.mrName,
        categoryType: mrCash.categoryType
          ? {
              _id: mrCash.categoryType._id,
              name: mrCash.categoryType.name,
              code: mrCash.categoryType.code,
            }
          : null,
        currentCash: mrCash.currentCash,
        cashTransferredToAdmin: mrCash.cashTransferredToAdmin,
        totalCash: mrCash.currentCash + mrCash.cashTransferredToAdmin,
        lastTransferDate: mrCash.lastTransferDate,
        notes: mrCash.notes,
        isActive: mrCash.isActive,
        createdAt: mrCash.createdAt,
        updatedAt: mrCash.updatedAt,
        ...(mrCash.mrId && {
          mrDetails: {
            name: mrCash.mrId.medicalRepName,
            phone: mrCash.mrId.contactNo,
            email: mrCash.mrId.email,
            MRId: mrCash.mrId.MRId,
            teamName: mrCash.mrId.teamName,
          },
        }),
      },
    });
  } catch (error) {
    console.error("Error fetching MR cash details:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Get previous record for logging
    const previousRecord = await MRCash.findById(id).lean();
    if (!previousRecord)
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });

    if (updateData.categoryType) {
      const category = await CategoryType.findById(updateData.categoryType);
      if (!category)
        return res
          .status(404)
          .json({ success: false, message: "Category type not found" });
    }

    if (updateData.mrId && updateData.mrId !== previousRecord.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff)
        return res
          .status(404)
          .json({ success: false, message: "New MR not found" });
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    const mrCash = await MRCash.findById(id);
    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    mrCash.updatedAt = new Date();

    await mrCash.save();
    await mrCash.populate("categoryType", "name code");

    // Log activity for UPDATE
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated MR Cash Record for ${mrCash.mrName}`,
      tableName: "mrcashes",
      tableLabel: "MR Cash",
      recordId: mrCash._id,
      referenceNumber: mrCash.mrName,
      previousData: previousRecord,
      newData: mrCash.toObject(),
      description: `MR Cash record for ${mrCash.mrName} was updated`,
      refField: "mrName",
    });

    res.status(200).json({
      success: true,
      message: "MR Cash record updated successfully",
      data: mrCash,
    });
  } catch (error) {
    console.error("Error updating MR Cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:mrCashId/transfer
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:mrCashId/transfer", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId } = req.params;
    const { amount, notes, destinationAccount, transferDate } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Valid transfer amount is required" });
    }
    if (!destinationAccount) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Destination account is required" });
    }

    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    if (amount > mrCash.currentCash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient cash. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}`,
      });
    }

    const destinationAcc =
      await Account.findById(destinationAccount).session(session);
    if (!destinationAcc) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Destination account not found" });
    }

    let transferredBy = null;
    if (req.user?.id) {
      transferredBy = req.user.id;
    } else {
      const defaultUser = await User.findOne({ role: "admin" }).session(
        session,
      );
      if (defaultUser) transferredBy = defaultUser._id;
    }

    const transferAmount = parseFloat(amount);
    const effectiveDate = transferDate ? new Date(transferDate) : new Date();

    // Store previous values for logging
    const previousCurrentCash = mrCash.currentCash;
    const previousTransferredToAdmin = mrCash.cashTransferredToAdmin;
    const previousDestTotal = destinationAcc.totalAmount;

    mrCash.currentCash -= transferAmount;
    mrCash.cashTransferredToAdmin += transferAmount;
    mrCash.lastTransferDate = effectiveDate;
    mrCash.updatedAt = new Date();

    destinationAcc.totalAmount += transferAmount;
    destinationAcc.updatedAt = new Date();

    const transferData = {
      fromAccount: mrCash._id,
      fromAccountName: mrCash.mrName,
      toAccount: destinationAcc._id,
      toAccountName: destinationAcc.name,
      toAccountCode: destinationAcc.code,
      amount: transferAmount,
      notes:
        notes || `Transfer from ${mrCash.mrName} to ${destinationAcc.name}`,
      transferredAt: effectiveDate,
    };
    if (transferredBy) transferData.transferredBy = transferredBy;

    const transferRecord = new Transfer(transferData);

    const transaction = new Transaction({
      categoryType: "tour collection",
      sourceAccount: mrCash.mrName,
      destination: destinationAcc.name,
      amount: transferAmount,
      exchangeLoss: 0,
      finalAmount: transferAmount,
      date: effectiveDate,
      invoiceNo: "NA",
      accountType: destinationAcc.accountType || "Cash Balance",
      description: notes || `Transfer from MR ${mrCash.mrName}`,
      remarks: notes || `Transfer from MR ${mrCash.mrName}`,
      transactionType: "deposit",
    });

    await mrCash.save({ session });
    await destinationAcc.save({ session });
    await transferRecord.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for TRANSFER
    await logActivity(req, {
      action: "TRANSFER",
      actionLabel: `Cash Transfer: ${mrCash.mrName} → ${destinationAcc.name}`,
      tableName: "mrcashes",
      tableLabel: "MR Cash",
      recordId: mrCash._id,
      referenceNumber: mrCash.mrName,
      previousData: {
        currentCash: previousCurrentCash,
        cashTransferredToAdmin: previousTransferredToAdmin,
        destinationTotal: previousDestTotal,
      },
      newData: {
        currentCash: mrCash.currentCash,
        cashTransferredToAdmin: mrCash.cashTransferredToAdmin,
        destinationTotal: destinationAcc.totalAmount,
        transferAmount,
        destinationAccount: destinationAcc.name,
      },
      description: `Transferred ${formatCurrency(transferAmount)} from ${mrCash.mrName} to ${destinationAcc.name}`,
      refField: "mrName",
    });

    res.status(200).json({
      success: true,
      message: `${formatCurrency(amount)} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
      data: {
        mrCash,
        destinationAccount: destinationAcc,
        transferRecord,
        transaction,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:mrCashId/transfer-to/:destinationCode
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:mrCashId/transfer-to/:destinationCode", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId, destinationCode } = req.params;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Valid transfer amount is required" });
    }

    const destinationAcc = await Account.findOne({
      code: destinationCode,
    }).session(session);
    if (!destinationAcc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Destination account (${destinationCode}) not found`,
      });
    }

    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    if (amount > mrCash.currentCash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient cash. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}`,
      });
    }

    let transferredBy = null;
    if (req.user?.id) {
      transferredBy = req.user.id;
    } else {
      const defaultUser = await User.findOne({ role: "admin" }).session(
        session,
      );
      if (defaultUser) transferredBy = defaultUser._id;
    }

    const transferAmount = parseFloat(amount);

    // Store previous values for logging
    const previousCurrentCash = mrCash.currentCash;
    const previousTransferredToAdmin = mrCash.cashTransferredToAdmin;
    const previousDestTotal = destinationAcc.totalAmount;

    mrCash.currentCash -= transferAmount;
    mrCash.cashTransferredToAdmin += transferAmount;
    mrCash.lastTransferDate = new Date();
    mrCash.updatedAt = new Date();

    destinationAcc.totalAmount += transferAmount;
    destinationAcc.updatedAt = new Date();

    const transferData = {
      fromAccount: mrCash._id,
      fromAccountName: mrCash.mrName,
      toAccount: destinationAcc._id,
      toAccountName: destinationAcc.name,
      toAccountCode: destinationAcc.code,
      amount: transferAmount,
      notes:
        notes || `Transfer from ${mrCash.mrName} to ${destinationAcc.name}`,
      transferredAt: new Date(),
    };
    if (transferredBy) transferData.transferredBy = transferredBy;

    const transferRecord = new Transfer(transferData);

    const transaction = new Transaction({
      categoryType: "transfer",
      sourceAccount: mrCash.mrName,
      destination: destinationAcc.name,
      amount: transferAmount,
      exchangeLoss: 0,
      finalAmount: transferAmount,
      date: new Date(),
      invoiceNo: "NA",
      accountType: destinationAcc.accountType || "Cash Balance",
      description: notes || `Transfer from MR ${mrCash.mrName}`,
      remarks: notes || `Transfer from MR ${mrCash.mrName}`,
      transactionType: "deposit",
    });

    await mrCash.save({ session });
    await destinationAcc.save({ session });
    await transferRecord.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for TRANSFER
    await logActivity(req, {
      action: "TRANSFER",
      actionLabel: `Cash Transfer: ${mrCash.mrName} → ${destinationAcc.name}`,
      tableName: "mrcashes",
      tableLabel: "MR Cash",
      recordId: mrCash._id,
      referenceNumber: mrCash.mrName,
      previousData: {
        currentCash: previousCurrentCash,
        cashTransferredToAdmin: previousTransferredToAdmin,
        destinationTotal: previousDestTotal,
      },
      newData: {
        currentCash: mrCash.currentCash,
        cashTransferredToAdmin: mrCash.cashTransferredToAdmin,
        destinationTotal: destinationAcc.totalAmount,
        transferAmount,
        destinationAccount: destinationAcc.name,
      },
      description: `Transferred ${formatCurrency(transferAmount)} from ${mrCash.mrName} to ${destinationAcc.name}`,
      refField: "mrName",
    });

    res.status(200).json({
      success: true,
      message: `${formatCurrency(amount)} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
      data: {
        mrCash,
        destinationAccount: destinationAcc,
        transferRecord,
        transaction,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:mrCashId/transfers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:mrCashId/transfers", async (req, res) => {
  try {
    const { mrCashId } = req.params;
    const { limit = 30, page = 1, destinationCode } = req.query;

    const mrCash = await MRCash.findById(mrCashId);
    if (!mrCash)
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });

    const query = { fromAccount: mrCashId };
    if (destinationCode) query.toAccountCode = destinationCode;

    const transfers = await Transfer.find(query)
      .sort({ transferredAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("transferredBy", "name email")
      .populate("toAccount", "name code")
      .lean();

    const total = await Transfer.countDocuments(query);

    res.status(200).json({
      success: true,
      data: transfers,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching transfer history:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /transfers/:transferId
// ─────────────────────────────────────────────────────────────────────────────
router.put("/transfers/:transferId", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transferId } = req.params;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Valid amount is required" });
    }

    const transfer = await Transfer.findById(transferId).session(session);
    if (!transfer) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transfer record not found" });
    }

    const oldAmount = transfer.amount;
    const newAmount = parseFloat(amount);
    const difference = newAmount - oldAmount;

    if (Math.abs(difference) < 0.001) {
      transfer.notes = notes || transfer.notes;
      await transfer.save({ session });
      await session.commitTransaction();
      session.endSession();
      return res.json({
        success: true,
        message: "Transfer updated",
        data: transfer,
      });
    }

    const mrCash = await MRCash.findById(transfer.fromAccount).session(session);
    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    const destAcc = await Account.findById(transfer.toAccount).session(session);
    if (!destAcc) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Destination account not found" });
    }

    // Store previous values for logging
    const previousMrCashCurrent = mrCash.currentCash;
    const previousMrCashTransferred = mrCash.cashTransferredToAdmin;
    const previousDestTotal = destAcc.totalAmount;

    if (difference > 0) {
      if (mrCash.currentCash < difference) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient MR cash. Available: ${formatCurrency(mrCash.currentCash)}, Required additional: ${formatCurrency(difference)}`,
        });
      }
      mrCash.currentCash -= difference;
      mrCash.cashTransferredToAdmin += difference;
      destAcc.totalAmount += difference;
    } else {
      const refund = -difference;
      mrCash.currentCash += refund;
      mrCash.cashTransferredToAdmin -= refund;
      destAcc.totalAmount -= refund;
      if (destAcc.totalAmount < 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Destination account would go negative.",
        });
      }
    }

    mrCash.updatedAt = new Date();
    destAcc.updatedAt = new Date();
    transfer.amount = newAmount;
    transfer.notes = notes || transfer.notes;
    transfer.updatedAt = new Date();

    await Transaction.updateOne(
      {
        sourceAccount: mrCash.mrName,
        destination: destAcc.name,
        amount: oldAmount,
        date: {
          $gte: new Date(new Date(transfer.transferredAt).getTime() - 10000),
        },
      },
      {
        $set: {
          amount: newAmount,
          finalAmount: newAmount,
          remarks: notes || transfer.notes,
          description: notes || transfer.notes,
        },
      },
    ).session(session);

    await mrCash.save({ session });
    await destAcc.save({ session });
    await transfer.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for TRANSFER UPDATE
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Cash Transfer: ${mrCash.mrName} → ${destAcc.name}`,
      tableName: "transfers",
      tableLabel: "Transfer",
      recordId: transfer._id,
      referenceNumber: transfer._id,
      previousData: {
        amount: oldAmount,
        mrCashCurrent: previousMrCashCurrent,
        mrCashTransferred: previousMrCashTransferred,
        destTotal: previousDestTotal,
      },
      newData: {
        amount: newAmount,
        mrCashCurrent: mrCash.currentCash,
        mrCashTransferred: mrCash.cashTransferredToAdmin,
        destTotal: destAcc.totalAmount,
      },
      description: `Transfer amount updated from ${formatCurrency(oldAmount)} to ${formatCurrency(newAmount)}`,
      refField: "fromAccountName",
    });

    res.json({
      success: true,
      message: "Transfer updated successfully",
      data: { transfer, mrCash, destinationAccount: destAcc },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating transfer:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:mrCashId/transfers/:transferId
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:mrCashId/transfers/:transferId", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId, transferId } = req.params;

    const transferRecord = await Transfer.findById(transferId).session(session);
    if (!transferRecord) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transfer record not found" });
    }

    if (transferRecord.fromAccount.toString() !== mrCashId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Transfer does not belong to this MR Cash record",
      });
    }

    const refundAmount = transferRecord.amount;

    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    // Store previous values for logging
    const previousCurrentCash = mrCash.currentCash;
    const previousTransferredToAdmin = mrCash.cashTransferredToAdmin;

    mrCash.currentCash = parseFloat(
      (mrCash.currentCash + refundAmount).toFixed(2),
    );
    mrCash.cashTransferredToAdmin = parseFloat(
      Math.max(0, mrCash.cashTransferredToAdmin - refundAmount).toFixed(2),
    );
    mrCash.updatedAt = new Date();

    const destinationAcc = await Account.findById(
      transferRecord.toAccount,
    ).session(session);
    let previousDestTotal = 0;
    if (destinationAcc) {
      previousDestTotal = destinationAcc.totalAmount;
      destinationAcc.totalAmount = parseFloat(
        Math.max(0, destinationAcc.totalAmount - refundAmount).toFixed(2),
      );
      destinationAcc.updatedAt = new Date();
      await destinationAcc.save({ session });
    }

    await Transaction.deleteOne({
      sourceAccount: mrCash.mrName,
      destination: destinationAcc?.name,
      amount: refundAmount,
      date: {
        $gte: new Date(
          new Date(transferRecord.transferredAt).getTime() - 10000,
        ),
        $lte: new Date(
          new Date(transferRecord.transferredAt).getTime() + 10000,
        ),
      },
    }).session(session);

    await Transfer.findByIdAndDelete(transferId).session(session);
    await mrCash.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for TRANSFER DELETE
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Cash Transfer: ${mrCash.mrName} → ${destinationAcc?.name || "Unknown"}`,
      tableName: "transfers",
      tableLabel: "Transfer",
      recordId: transferId,
      referenceNumber: transferId,
      previousData: {
        amount: refundAmount,
        mrCashCurrent: previousCurrentCash,
        mrCashTransferred: previousTransferredToAdmin,
        destTotal: previousDestTotal,
      },
      description: `Deleted transfer of ${formatCurrency(refundAmount)} from ${mrCash.mrName}. Amount returned to MR cash.`,
      refField: "fromAccountName",
    });

    res.status(200).json({
      success: true,
      message: `Transfer of ${formatCurrency(refundAmount)} deleted. Amount returned to ${mrCash.mrName}.`,
      data: {
        mrCashId,
        refundedAmount: refundAmount,
        newCurrentCash: mrCash.currentCash,
        newCashTransferredToAdmin: mrCash.cashTransferredToAdmin,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting transfer:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id  — deactivate MR Cash record
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash)
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });

    // Store previous state for logging
    const previousRecord = mrCash.toObject();

    mrCash.isActive = false;
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    await mrCash.save();

    // Log activity for DELETE (deactivate)
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deactivated MR Cash Record for ${mrCash.mrName}`,
      tableName: "mrcashes",
      tableLabel: "MR Cash",
      recordId: mrCash._id,
      referenceNumber: mrCash.mrName,
      previousData: previousRecord,
      description: `MR Cash record for ${mrCash.mrName} was deactivated (soft delete)`,
      refField: "mrName",
    });

    res.status(200).json({
      success: true,
      message: "MR Cash record deactivated successfully",
    });
  } catch (error) {
    console.error("Error deleting MR Cash:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /stock-transfer-to-mr
// ─────────────────────────────────────────────────────────────────────────────
router.post("/stock-transfer-to-mr", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrId, productName, quantity } = req.body;

    if (!mrId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "MR ID is required" });
    }
    if (!productName || !productName.trim()) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Product name is required" });
    }
    const transferQty = parseFloat(quantity);
    if (isNaN(transferQty) || transferQty <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Valid positive quantity is required",
      });
    }

    const mr = await Staff.findById(mrId).session(session);
    if (!mr) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "MR not found" });
    }
    const mrName = mr.medicalRepName || mr.employeeName;

    const warehouseStock = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
    }).session(session);
    if (!warehouseStock) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found in warehouse`,
      });
    }

    const realBatches = (warehouseStock.batches || []).filter(
      (b) => !b.adjustmentType || b.adjustmentType === "batch",
    );
    const availableInWarehouse =
      realBatches.reduce((sum, b) => sum + (b.boxes || 0), 0) +
      (warehouseStock.addStockAdjustment || 0) -
      (warehouseStock.removeStockAdjustment || 0);
    if (availableInWarehouse < transferQty) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient warehouse stock. Available: ${availableInWarehouse}, Requested: ${transferQty}`,
      });
    }

    let mrStock = await stockInMRHand.findOne({ mrId }).session(session);
    if (!mrStock)
      mrStock = new stockInMRHand({
        mrId,
        mrName,
        productsInHand: [],
        totalAmount: 0,
      });

    const productRecord = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName.trim()}$`, "i") },
    }).session(session);
    const lc = productRecord?.lc || 0;

    let remainingToDeduct = transferQty;
    const realBatchIndices = warehouseStock.batches
      .map((b, idx) => ({
        idx,
        boxes: b.boxes || 0,
        adjustmentType: b.adjustmentType,
      }))
      .filter((b) => !b.adjustmentType || b.adjustmentType === "batch")
      .sort(
        (a, b) =>
          new Date(warehouseStock.batches[a.idx].date) -
          new Date(warehouseStock.batches[b.idx].date),
      );

    for (const { idx } of realBatchIndices) {
      if (remainingToDeduct <= 0) break;
      const batch = warehouseStock.batches[idx];
      const batchQty = batch.boxes || 0;
      const deduct = Math.min(batchQty, remainingToDeduct);
      batch.boxes = batchQty - deduct;
      batch.amount = (batch.boxes || 0) * (batch.lc || 0);
      remainingToDeduct -= deduct;
    }

    if (remainingToDeduct > 0)
      warehouseStock.addStockAdjustment = Math.max(
        0,
        (warehouseStock.addStockAdjustment || 0) - remainingToDeduct,
      );

    let newTotalBoxes = 0,
      newTotalAmount = 0;
    for (const batch of warehouseStock.batches) {
      if (!batch.adjustmentType || batch.adjustmentType === "batch") {
        newTotalBoxes += batch.boxes || 0;
        newTotalAmount += (batch.boxes || 0) * (batch.lc || 0);
      }
    }
    newTotalBoxes +=
      (warehouseStock.addStockAdjustment || 0) -
      (warehouseStock.removeStockAdjustment || 0);
    warehouseStock.totalBoxesFromBatches = newTotalBoxes;
    warehouseStock.totalAmount = newTotalAmount;
    warehouseStock.averagePrice =
      newTotalBoxes > 0 ? newTotalAmount / newTotalBoxes : 0;
    warehouseStock.status =
      newTotalBoxes <= 0
        ? "Out of Stock"
        : newTotalBoxes < (warehouseStock.minStockLevel || 10)
          ? "Low Stock"
          : "In Stock";

    const existingProductIndex = mrStock.productsInHand.findIndex(
      (p) =>
        p.productName.toLowerCase().trim() === productName.toLowerCase().trim(),
    );
    if (existingProductIndex >= 0) {
      mrStock.productsInHand[existingProductIndex].quantity += transferQty;
      mrStock.productsInHand[existingProductIndex].amount += transferQty * lc;
      mrStock.productsInHand[existingProductIndex].lastUpdated = new Date();
    } else {
      mrStock.productsInHand.push({
        productName: productRecord?.productName || productName,
        productId: productRecord?._id,
        quantity: transferQty,
        lc,
        amount: transferQty * lc,
        lastUpdated: new Date(),
      });
    }

    mrStock.totalAmount = mrStock.productsInHand.reduce(
      (sum, p) => sum + (p.amount || 0),
      0,
    );

    await warehouseStock.save({ session });
    await mrStock.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Log activity for STOCK TRANSFER
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Stock Transfer to MR: ${productName} x${transferQty}`,
      tableName: "stockinmrhands",
      tableLabel: "Stock in MR Hand",
      recordId: mrStock._id,
      referenceNumber: mrName,
      newData: {
        mrName,
        productName,
        quantity: transferQty,
        lc,
        totalAmount: transferQty * lc,
      },
      description: `Transferred ${transferQty} units of "${productName}" to ${mrName}`,
      refField: "mrName",
    });

    res.status(200).json({
      success: true,
      message: `Successfully transferred ${transferQty} units of "${productName}" to ${mrName}`,
      data: { warehouseStock, mrStock },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring stock to MR:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /credit-collection-invoices/:mrName
// ─────────────────────────────────────────────────────────────────────────────
router.get("/credit-collection-invoices/:mrName", async (req, res) => {
  try {
    const { mrName } = req.params;

    const mrCashRecord = await MRCash.findOne({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
      isActive: true,
    }).lean();

    if (!mrCashRecord) return res.status(200).json({ success: true, data: [] });

    const mrSales = await Sale.find({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
    })
      .select("invoiceNumber")
      .lean();

    const mrInvoiceNumbers = mrSales
      .map((s) => s.invoiceNumber)
      .filter(Boolean);

    const creditCollectionTxns = await Transaction.find({
      transactionType: "credit collection",
      invoiceNo: { $in: mrInvoiceNumbers, $ne: "NA" },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const formatted = creditCollectionTxns.map((tx) => ({
      _id: tx._id,
      invoiceNumber: tx.invoiceNo,
      amount: tx.amount,
      finalAmount: tx.finalAmount,
      date: tx.date || tx.createdAt,
      destination: tx.destination,
      customerName: tx.customerName || "",
      remarks: tx.remarks || "",
      accountType: tx.accountType,
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error("Error fetching credit collection invoices:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

router.get("/sales-by-mr/:mrName", async (req, res) => {
  try {
    const { mrName } = req.params;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const mrSaleInvoiceNos = await Sale.distinct("invoiceNumber", {
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
    });

    const creditCollectedInvoiceNos = await Transaction.distinct("invoiceNo", {
      transactionType: "credit collection",
      invoiceNo: { $in: mrSaleInvoiceNos },
    });

    const sales = await Sale.find({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
      paymentStatus: { $in: ["Partial Paid", "Cash", "Paid"] },
      invoiceDate: { $gte: startOfMonth, $lte: endOfMonth },
      invoiceNumber: { $nin: creditCollectedInvoiceNos },
    })
      .select(
        "invoiceNumber invoiceDate customerName dueAmount totalAmount paidAmount paymentStatus mrName recordingDate dueDate",
      )
      .sort({ invoiceDate: -1 })
      .lean();

    res.status(200).json({ success: true, data: sales });
  } catch (error) {
    console.error("Error fetching sales by MR:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// =============================================================================
// PUT /credit-collection-invoices/:transactionId
// Edit a credit collection Transaction.
// =============================================================================
router.put("/credit-collection-invoices/:transactionId", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { amount, finalAmount, customerName, remarks } = req.body;

    const newAmount = parseFloat(amount ?? finalAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Valid positive amount is required" });
    }

    const txn = await Transaction.findById(transactionId).session(session);
    if (!txn) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }
    if (txn.transactionType !== "credit collection") {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Only credit collection transactions can be edited here",
      });
    }

    const oldAmount = parseFloat(txn.amount) || 0;
    const difference = parseFloat((newAmount - oldAmount).toFixed(4));

    const mrName = txn.destination;
    const mrCash = await MRCash.findOne({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
      isActive: true,
    }).session(session);

    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    // Store previous values for logging
    const previousCurrentCash = mrCash.currentCash;
    const previousTxnAmount = txn.amount;

    const newCurrentCash = parseFloat(
      (mrCash.currentCash + difference).toFixed(4),
    );
    if (newCurrentCash < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Cannot reduce amount: MR cash would go negative. Current cash: ${formatCurrency(mrCash.currentCash)}, Reduction: ${formatCurrency(Math.abs(difference))}`,
      });
    }

    mrCash.currentCash = newCurrentCash;
    mrCash.updatedAt = new Date();

    const sale = await Sale.findOne({
      invoiceNumber: String(txn.invoiceNo),
    }).session(session);

    let previousSalePaidAmount = null;
    if (sale) {
      previousSalePaidAmount = sale.paidAmount;
      sale.paidAmount = parseFloat(
        ((sale.paidAmount || 0) + difference).toFixed(4),
      );
      await recalculateSalePayment(sale, session);
    }

    txn.amount = newAmount;
    txn.finalAmount = newAmount;
    if (customerName !== undefined) txn.customerName = customerName;
    if (remarks !== undefined) txn.remarks = remarks;
    txn.updatedAt = new Date();

    await mrCash.save({ session });
    await txn.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for CREDIT COLLECTION UPDATE
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Credit Collection: Invoice ${txn.invoiceNo}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: txn._id,
      referenceNumber: txn.invoiceNo,
      previousData: {
        amount: previousTxnAmount,
        mrCashCurrent: previousCurrentCash,
        salePaidAmount: previousSalePaidAmount,
      },
      newData: {
        amount: newAmount,
        mrCashCurrent: mrCash.currentCash,
        salePaidAmount: sale?.paidAmount,
      },
      description: `Credit collection for invoice ${txn.invoiceNo} updated from ${formatCurrency(previousTxnAmount)} to ${formatCurrency(newAmount)}`,
      refField: "invoiceNo",
    });

    res.status(200).json({
      success: true,
      message: `Credit invoice updated. MR cash adjusted by ${formatCurrency(difference)}. Sale updated.`,
      data: {
        transaction: txn,
        mrCash,
        sale: sale
          ? {
              _id: sale._id,
              invoiceNumber: sale.invoiceNumber,
              paidAmount: sale.paidAmount,
              dueAmount: sale.dueAmount,
              totalAmount: sale.totalAmount,
              paymentStatus: sale.paymentStatus,
              pendingAmountPaid: sale.pendingAmountPaid,
            }
          : null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating credit collection invoice:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// =============================================================================
// DELETE /credit-collection-invoices/:transactionId
// Delete a credit collection Transaction.
// =============================================================================
router.delete(
  "/credit-collection-invoices/:transactionId",
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { transactionId } = req.params;

      const txn = await Transaction.findById(transactionId).session(session);
      if (!txn) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "Transaction not found" });
      }
      if (txn.transactionType !== "credit collection") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Only credit collection transactions can be deleted here",
        });
      }

      const collectedAmount = parseFloat(txn.amount) || 0;

      const mrName = txn.destination;
      const mrCash = await MRCash.findOne({
        mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
        isActive: true,
      }).session(session);

      if (!mrCash) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "MR Cash record not found" });
      }

      // Store previous values for logging
      const previousCurrentCash = mrCash.currentCash;

      mrCash.currentCash = parseFloat(
        Math.max(0, mrCash.currentCash - collectedAmount).toFixed(4),
      );
      mrCash.updatedAt = new Date();

      const sale = await Sale.findOne({
        invoiceNumber: String(txn.invoiceNo),
      }).session(session);

      let previousSalePaidAmount = null;
      if (sale) {
        previousSalePaidAmount = sale.paidAmount;
        sale.paidAmount = parseFloat(
          Math.max(0, (sale.paidAmount || 0) - collectedAmount).toFixed(4),
        );
        await recalculateSalePayment(sale, session);
      }

      const dest = await Account.findOne({ name: mrCash.mrName }).session(
        session,
      );
      let previousDestTotal = null;
      if (dest) {
        previousDestTotal = dest.totalAmount;
        dest.totalAmount = parseFloat(
          Math.max(0, dest.totalAmount - collectedAmount).toFixed(4),
        );
        await dest.save({ session });
      }

      await Transaction.findByIdAndDelete(transactionId).session(session);
      await mrCash.save({ session });

      await session.commitTransaction();
      session.endSession();

      // Log activity for CREDIT COLLECTION DELETE
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Deleted Credit Collection: Invoice ${txn.invoiceNo}`,
        tableName: "transactions",
        tableLabel: "Transaction",
        recordId: transactionId,
        referenceNumber: txn.invoiceNo,
        previousData: {
          amount: collectedAmount,
          mrCashCurrent: previousCurrentCash,
          salePaidAmount: previousSalePaidAmount,
          destTotal: previousDestTotal,
        },
        description: `Credit collection for invoice ${txn.invoiceNo} of ${formatCurrency(collectedAmount)} deleted. Amount reversed from ${mrCash.mrName}'s cash.`,
        refField: "invoiceNo",
      });

      res.status(200).json({
        success: true,
        message: `Credit invoice deleted. ${formatCurrency(collectedAmount)} reversed from ${mrCash.mrName}'s cash. Sale restored.`,
        data: {
          deletedTransactionId: transactionId,
          reversedAmount: collectedAmount,
          newCurrentCash: mrCash.currentCash,
          sale: sale
            ? {
                _id: sale._id,
                invoiceNumber: sale.invoiceNumber,
                paidAmount: sale.paidAmount,
                dueAmount: sale.dueAmount,
                totalAmount: sale.totalAmount,
                paymentStatus: sale.paymentStatus,
                pendingAmountPaid: sale.pendingAmountPaid,
              }
            : null,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error deleting credit collection invoice:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
);

router.get("/combined-cash-summary", async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const creditTotals = await Transaction.aggregate([
      { $match: { transactionType: "credit collection" } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$destination" } } },
          creditCollectionTotal: { $sum: "$amount" },
        },
      },
    ]);

    const creditCollectedInvoiceNos = await Transaction.distinct("invoiceNo", {
      transactionType: "credit collection",
    });

    const saleTotals = await Sale.aggregate([
      {
        $match: {
          paymentStatus: { $in: ["Cash", "Paid", "Partial Paid"] },
          invoiceDate: { $gte: startOfMonth, $lte: endOfMonth },
          paidAmount: { $gt: 0 },
          invoiceNumber: { $nin: creditCollectedInvoiceNos },
        },
      },
      {
        $group: {
          _id: { $toLower: { $trim: { input: "$mrName" } } },
          salePaidTotal: { $sum: "$paidAmount" },
        },
      },
    ]);

    const creditMap = new Map(
      creditTotals.map((c) => [c._id, c.creditCollectionTotal]),
    );
    const saleMap = new Map(saleTotals.map((s) => [s._id, s.salePaidTotal]));

    const allKeys = new Set([...creditMap.keys(), ...saleMap.keys()]);

    const combined = Array.from(allKeys).map((key) => ({
      mrNameKey: key,
      creditCollectionTotal: creditMap.get(key) || 0,
      salePaidTotal: saleMap.get(key) || 0,
      combinedTotal: (creditMap.get(key) || 0) + (saleMap.get(key) || 0),
    }));

    res.status(200).json({ success: true, data: combined });
  } catch (error) {
    console.error("Error fetching combined cash summary:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /collect-payment
// ─────────────────────────────────────────────────────────────────────────────
router.post("/collect-payment", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrName, invoiceNumber, collectedAmount, notes = "" } = req.body;

    if (!mrName || !invoiceNumber || !collectedAmount || collectedAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Invalid input: mrName, invoiceNumber, collectedAmount are required",
      });
    }

    const nameRegex = new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i");

    const sale = await Sale.findOne({
      mrName: nameRegex,
      invoiceNumber,
      dueAmount: { $gt: 0 },
    }).session(session);

    if (!sale) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Due invoice not found or already fully paid",
      });
    }

    if (collectedAmount > sale.dueAmount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Collected amount (${formatCurrency(collectedAmount)}) exceeds due amount (${formatCurrency(sale.dueAmount)})`,
      });
    }

    // Store previous values for logging
    const previousSalePaidAmount = sale.paidAmount;
    const previousSaleDueAmount = sale.dueAmount;
    const previousSaleStatus = sale.paymentStatus;

    sale.paidAmount = parseFloat(
      ((sale.paidAmount || 0) + collectedAmount).toFixed(4),
    );
    await recalculateSalePayment(sale, session);

    let mrCash = await MRCash.findOne({
      mrName: nameRegex,
      isActive: true,
    }).session(session);
    let isNewMRCash = false;
    let previousMrCashCurrent = 0;

    if (!mrCash) {
      const staff = await Staff.findOne({
        $or: [{ medicalRepName: nameRegex }, { employeeName: nameRegex }],
      }).session(session);
      if (!staff) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "MR staff record not found" });
      }
      mrCash = new MRCash({
        mrId: staff._id,
        mrName: staff.medicalRepName || staff.employeeName,
        currentCash: 0,
        cashTransferredToAdmin: 0,
        isActive: true,
      });
      isNewMRCash = true;
    } else {
      previousMrCashCurrent = mrCash.currentCash;
    }

    mrCash.currentCash = parseFloat(
      (mrCash.currentCash + collectedAmount).toFixed(4),
    );
    mrCash.updatedAt = new Date();

    const transaction = new Transaction({
      categoryType: "Credit Collection",
      transactionType: "credit collection",
      sourceAccount: sale.customerName || "Customer",
      destination: mrCash.mrName,
      amount: collectedAmount,
      exchangeLoss: 0,
      finalAmount: collectedAmount,
      date: new Date(),
      invoiceNo: invoiceNumber,
      invoiceDate: sale.invoiceDate || undefined,
      customerName: sale.customerName || "",
      customerAddress: sale.customerAddress || "",
      accountType: "MR Cash",
      remarks: notes || `Credit collection from invoice ${invoiceNumber}`,
    });

    const dest = await Account.findOne({ name: mrCash.mrName }).session(
      session,
    );
    let previousDestTotal = null;
    if (dest) {
      previousDestTotal = dest.totalAmount;
      dest.totalAmount = parseFloat(
        (dest.totalAmount + collectedAmount).toFixed(4),
      );
      await dest.save({ session });
    }

    await mrCash.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity for COLLECT PAYMENT
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Credit Collection: Invoice ${invoiceNumber}`,
      tableName: "transactions",
      tableLabel: "Transaction",
      recordId: transaction._id,
      referenceNumber: invoiceNumber,
      newData: {
        invoiceNumber,
        collectedAmount,
        mrName: mrCash.mrName,
        previousSalePaid: previousSalePaidAmount,
        newSalePaid: sale.paidAmount,
        previousMrCash: previousMrCashCurrent,
        newMrCash: mrCash.currentCash,
      },
      description: `Collected ${formatCurrency(collectedAmount)} from invoice ${invoiceNumber} for ${mrName}. Added to MR cash.`,
      refField: "invoiceNo",
    });

    res.status(200).json({
      success: true,
      message: `Successfully collected ${formatCurrency(collectedAmount)} from invoice ${invoiceNumber}. Added to ${mrName}'s current cash.`,
      data: {
        sale: {
          _id: sale._id,
          invoiceNumber: sale.invoiceNumber,
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          pendingAmountPaid: sale.pendingAmountPaid,
        },
        mrCash,
        transaction,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error collecting payment:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
