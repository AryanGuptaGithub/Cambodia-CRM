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

const router = express.Router();

const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

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

    const query = {
      isActive: true,
      mrId: { $in: mrIds },
    };

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
      return res
        .status(400)
        .json({
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

    res
      .status(201)
      .json({
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

    const mrsWithCash = await MRCash.find({
      isActive: true,
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
      message: `Found ${formattedMRs.length} MRs with positive cash balance`,
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
      return res
        .status(404)
        .json({
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

    const mrCash = await MRCash.findById(id);
    if (!mrCash)
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

    if (updateData.mrId && updateData.mrId !== mrCash.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff)
        return res
          .status(404)
          .json({ success: false, message: "New MR not found" });
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    mrCash.updatedAt = new Date();

    await mrCash.save();
    await mrCash.populate("categoryType", "name code");

    res
      .status(200)
      .json({
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
    const { amount, notes, destinationAccount } = req.body;

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
      categoryType: "tour collection",
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

    res.status(200).json({
      success: true,
      message: `$${amount} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
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
      return res
        .status(404)
        .json({
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

    res.status(200).json({
      success: true,
      message: `$${amount} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
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
        return res
          .status(400)
          .json({
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
      return res
        .status(400)
        .json({
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
    if (destinationAcc) {
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
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash)
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });

    mrCash.isActive = false;
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    await mrCash.save();

    res
      .status(200)
      .json({
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
      return res
        .status(400)
        .json({
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
      return res
        .status(404)
        .json({
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
      return res
        .status(400)
        .json({
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

    if (remainingToDeduct > 0) {
      warehouseStock.addStockAdjustment = Math.max(
        0,
        (warehouseStock.addStockAdjustment || 0) - remainingToDeduct,
      );
    }

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

    res
      .status(200)
      .json({
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

// =============================================================================
// FIX: GET /credit-collection-invoices/:mrName
// Returns all Credit Collection transactions for the given MR name.
// These are transactions where:
//   - transactionType = "credit collection"
//   - destination matches the MR's destination account name (Cash Balance tab etc.)
//     OR we look up by the source MR name stored on the transaction.
// We show: invoiceNo, amount, finalAmount, date, destination, customerName
// =============================================================================
router.get("/credit-collection-invoices/:mrName", async (req, res) => {
  try {
    const { mrName } = req.params;

    // Find the MRCash record to get this MR's name exactly
    const mrCashRecord = await MRCash.findOne({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
      isActive: true,
    }).lean();

    if (!mrCashRecord) {
      return res.status(200).json({ success: true, data: [] });
    }

    // Look for Credit Collection transactions where:
    // 1. destination matches one of the account tabs (Cash Balance, Personal Account, Company Account)
    // 2. AND the invoiceNo is not "NA" (meaning it has a real invoice)
    // We identify the MR's transactions by checking the Sale's mrName field
    // or by looking for transactions whose invoiceNo belongs to sales by this MR

    // Get all invoices from sales that belong to this MR
    const mrSales = await Sale.find({
      mrName: new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i"),
    })
      .select("invoiceNumber")
      .lean();

    const mrInvoiceNumbers = mrSales
      .map((s) => s.invoiceNumber)
      .filter(Boolean);

    // Now find Credit Collection transactions for those invoice numbers
    const creditCollectionTxns = await Transaction.find({
      transactionType: "credit collection",
      invoiceNo: { $in: mrInvoiceNumbers, $ne: "NA" },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    // Format the response
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

// =============================================================================
// FIX: POST /collect-payment
// When Credit Collection is added via Cash & Bank → this endpoint is called
// from the due invoices modal "Collect Full" button.
// It:
//   1. Updates the Sale (paidAmount, dueAmount, paymentStatus, pendingAmountPaid)
//   2. Adds the collectedAmount to MRCash.currentCash  ← KEY FIX
//   3. Creates a Transaction record with transactionType = "credit collection"
// =============================================================================
router.post("/collect-payment", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrName, invoiceNumber, collectedAmount, notes = "" } = req.body;

    if (!mrName || !invoiceNumber || !collectedAmount || collectedAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Invalid input: mrName, invoiceNumber, collectedAmount are required",
        });
    }

    const nameRegex = new RegExp(`^\\s*${mrName.trim()}\\s*$`, "i");

    // Find the sale — allow any non-fully-paid status
    const sale = await Sale.findOne({
      mrName: nameRegex,
      invoiceNumber,
      dueAmount: { $gt: 0 },
    }).session(session);

    if (!sale) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({
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

    // --- Update Sale ---
    const newPaid = parseFloat(
      ((sale.paidAmount || 0) + collectedAmount).toFixed(4),
    );
    const newDue = parseFloat(
      Math.max(0, sale.totalAmount - newPaid).toFixed(4),
    );
    sale.paidAmount = newPaid;
    sale.dueAmount = newDue;

    if (newDue <= 0) {
      sale.paymentStatus = "Paid";
      sale.pendingAmountPaid = "paid"; // hides from Credit Collection dropdown
    } else {
      sale.paymentStatus = "Partial Paid";
      sale.pendingAmountPaid = "pending";
    }
    sale.updatedAt = new Date();

    // --- Find or create MRCash record ---
    let mrCash = await MRCash.findOne({
      mrName: nameRegex,
      isActive: true,
    }).session(session);
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
    }

    // FIX: Add collected amount to MR's current cash
    mrCash.currentCash = parseFloat(
      (mrCash.currentCash + collectedAmount).toFixed(4),
    );
    mrCash.updatedAt = new Date();

    // --- Create Transaction record ---
    const transaction = new Transaction({
      categoryType: "Credit Collection", // human-readable label
      transactionType: "credit collection", // valid enum value
      sourceAccount: sale.customerName || "Customer",
      destination: mrCash.mrName, // goes to MR's cash (not a bank account)
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

    // --- Optionally update Destination account if MR has a linked Destination doc ---
    const dest = await Account.findOne({ name: mrCash.mrName }).session(
      session,
    );
    if (dest) {
      dest.totalAmount = parseFloat(
        (dest.totalAmount + collectedAmount).toFixed(4),
      );
      await dest.save({ session });
    }

    await sale.save({ session });
    await mrCash.save({ session });
    await transaction.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Successfully collected ${formatCurrency(collectedAmount)} from invoice ${invoiceNumber}. Added to ${mrName}'s current cash.`,
      data: { sale, mrCash, transaction },
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
