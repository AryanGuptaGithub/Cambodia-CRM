import express from "express";
import mongoose from "mongoose";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import Transfer from "../../models/accounts/transfer.js";
import Account from "../../models/accounts/Destination.js";
import User from "../../models/User.js";
import Transaction from "../../models/accounts/Transaction.js";
import CategoryType from "../../models/accounts/CategoryType.js";

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

    const query = { isActive: true };

    if (search) {
      query.$or = [
        { mrName: { $regex: search, $options: "i" } },
        { notes:  { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const total = await MRCash.countDocuments(query);

    const totals = await MRCash.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCurrentCash: { $sum: "$currentCash" },
          totalTransferred:  { $sum: "$cashTransferredToAdmin" },
          totalAll: { $sum: { $add: ["$currentCash", "$cashTransferredToAdmin"] } },
        },
      },
    ]);

    const mrCashes = await MRCash.find(query)
      .populate("mrId", "medicalRepName employeeName phone email MRId teamName contactNo")
      .populate("categoryType", "name code")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const formattedData = mrCashes.map((mr) => ({
      _id:     mr._id,
      mrId:    mr.mrId?._id || mr.mrId,
      mrName:  mr.mrName,
      mrDetails: mr.mrId
        ? {
            name:     mr.mrId.medicalRepName || mr.mrId.employeeName,
            phone:    mr.mrId.phone || mr.mrId.contactNo,
            email:    mr.mrId.email,
            MRId:     mr.mrId.MRId,
            teamName: mr.mrId.teamName,
          }
        : null,
      categoryType: mr.categoryType
        ? { _id: mr.categoryType._id, name: mr.categoryType.name, code: mr.categoryType.code }
        : null,
      currentCash:            mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      totalCash:              mr.currentCash + mr.cashTransferredToAdmin,
      lastTransferDate:       mr.lastTransferDate,
      notes:    mr.notes,
      isActive: mr.isActive,
      createdAt: mr.createdAt,
      updatedAt: mr.updatedAt,
    }));

    res.status(200).json({
      success: true,
      data: formattedData,
      totals: totals[0] || { totalCurrentCash: 0, totalTransferred: 0, totalAll: 0 },
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching MR Cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  — create new MR Cash record
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const { mrId, currentCash = 0, cashTransferredToAdmin = 0, notes = "", categoryType } = req.body;
    console.log('values of ')

    const staff = await Staff.findById(mrId);
    if (!staff) return res.status(404).json({ success: false, message: "MR not found" });

    if (categoryType) {
      const category = await CategoryType.findById(categoryType);
      if (!category) return res.status(404).json({ success: false, message: "Category type not found" });
    }

    const existingMRCash = await MRCash.findOne({ mrId, isActive: true });
    if (existingMRCash) return res.status(400).json({ success: false, message: "Cash record already exists for this MR" });

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

    res.status(201).json({ success: true, message: "MR Cash record created successfully", data: mrCash });
  } catch (error) {
    console.error("Error creating MR Cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
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
          totalTransferred:  { $sum: "$cashTransferredToAdmin" },
          totalRecords:      { $sum: 1 },
          avgCurrentCash:    { $avg: "$currentCash" },
          maxCurrentCash:    { $max: "$currentCash" },
          minCurrentCash:    { $min: "$currentCash" },
        },
      },
    ]);

    const positiveCashCount = await MRCash.countDocuments({ isActive: true, currentCash: { $gt: 0 } });
    const zeroCashCount     = await MRCash.countDocuments({ isActive: true, currentCash: { $eq: 0 } });

    const recentTransfers = await MRCash.find({
      isActive: true,
      lastTransferDate: { $exists: true, $ne: null },
    })
      .sort({ lastTransferDate: -1 })
      .limit(5)
      .select("mrName currentCash cashTransferredToAdmin lastTransferDate")
      .lean();

    const destinationAccounts = await Account.find({ code: { $in: ["cash_balance"] } })
      .select("name code totalAmount");

    res.status(200).json({
      success: true,
      data: {
        ...(totals[0] || { totalCurrentCash: 0, totalTransferred: 0, totalRecords: 0, avgCurrentCash: 0, maxCurrentCash: 0, minCurrentCash: 0 }),
        positiveCashCount,
        zeroCashCount,
        recentTransfers,
        destinationAccounts,
      },
    });
  } catch (error) {
    console.error("Error fetching MR Cash summary:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /destination-accounts  (return all destinations, not just cash_balance)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/destination-accounts", async (req, res) => {
  try {
    const accounts = await Account.find()
      .select("name code totalAmount accountType")
      .sort({ name: 1 });
    res.status(200).json({ success: true, data: accounts, count: accounts.length });
  } catch (error) {
    console.error("Error fetching destination accounts:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-list  — MRs with positive cash for dropdown
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-list", async (req, res) => {
  try {
    const mrsWithCash = await MRCash.find({ isActive: true, currentCash: { $gt: 0 } })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code")
      .select("mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes categoryType")
      .sort({ currentCash: -1 });

    const formattedMRs = mrsWithCash.map((mr) => ({
      value:                  mr._id,
      label:                  `${mr.mrName} - ${formatCurrency(mr.currentCash)}`,
      mrName:                 mr.mrName,
      currentCash:            mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate:       mr.lastTransferDate,
      notes:                  mr.notes,
      category: mr.categoryType
        ? { id: mr.categoryType._id, name: mr.categoryType.name, code: mr.categoryType.code }
        : null,
      ...(mr.mrId && {
        staffId:  mr.mrId._id,
        phone:    mr.mrId.contactNo,
        email:    mr.mrId.email,
        MRId:     mr.mrId.MRId,
        teamName: mr.mrId.teamName,
      }),
    }));

    res.status(200).json({ success: true, data: formattedMRs, count: formattedMRs.length });
  } catch (error) {
    console.error("Error fetching MR list from MRCash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-list-with-cash  — used by Transfer to Admin modal
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
      .select("mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes categoryType")
      .sort({ currentCash: -1 });

    const formattedMRs = mrsWithCash.map((mr) => ({
      value:                  mr._id,
      label:                  `${mr.mrName} - Available: ${formatCurrency(mr.currentCash)}`,
      mrName:                 mr.mrName,
      currentCash:            mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate:       mr.lastTransferDate,
      notes:                  mr.notes,
      category: mr.categoryType
        ? { id: mr.categoryType._id, name: mr.categoryType.name, code: mr.categoryType.code }
        : null,
      ...(mr.mrId && {
        staffId:  mr.mrId._id,
        phone:    mr.mrId.contactNo,
        email:    mr.mrId.email,
        MRId:     mr.mrId.MRId,
        teamName: mr.mrId.teamName,
      }),
    }));

    res.status(200).json({
      success: true,
      data:    formattedMRs,
      count:   formattedMRs.length,
      message: `Found ${formattedMRs.length} MRs with positive cash balance`,
    });
  } catch (error) {
    console.error("Error fetching MR list with cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr/:mrId  — specific MR cash details
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;
    const mrCash = await MRCash.findOne({ mrId, isActive: true })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code");

    if (!mrCash) return res.status(404).json({ success: false, message: "MR Cash record not found for this MR" });

    res.status(200).json({
      success: true,
      data: {
        _id:     mrCash._id,
        mrId:    mrCash.mrId?._id || mrCash.mrId,
        mrName:  mrCash.mrName,
        categoryType: mrCash.categoryType
          ? { _id: mrCash.categoryType._id, name: mrCash.categoryType.name, code: mrCash.categoryType.code }
          : null,
        currentCash:            mrCash.currentCash,
        cashTransferredToAdmin: mrCash.cashTransferredToAdmin,
        totalCash:              mrCash.currentCash + mrCash.cashTransferredToAdmin,
        lastTransferDate:       mrCash.lastTransferDate,
        notes:    mrCash.notes,
        isActive: mrCash.isActive,
        createdAt: mrCash.createdAt,
        updatedAt: mrCash.updatedAt,
        ...(mrCash.mrId && {
          mrDetails: {
            name:     mrCash.mrId.medicalRepName,
            phone:    mrCash.mrId.contactNo,
            email:    mrCash.mrId.email,
            MRId:     mrCash.mrId.MRId,
            teamName: mrCash.mrId.teamName,
          },
        }),
      },
    });
  } catch (error) {
    console.error("Error fetching MR cash details:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id  — update MR Cash record
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) return res.status(404).json({ success: false, message: "MR Cash record not found" });

    if (updateData.categoryType) {
      const category = await CategoryType.findById(updateData.categoryType);
      if (!category) return res.status(404).json({ success: false, message: "Category type not found" });
    }

    if (updateData.mrId && updateData.mrId !== mrCash.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff) return res.status(404).json({ success: false, message: "New MR not found" });
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    mrCash.updatedAt = new Date();

    await mrCash.save();
    await mrCash.populate("categoryType", "name code");

    res.status(200).json({ success: true, message: "MR Cash record updated successfully", data: mrCash });
  } catch (error) {
    console.error("Error updating MR Cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});


router.post("/:mrCashId/transfer", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId } = req.params;
    const { amount, notes, destinationAccount } = req.body; // destinationAccount is the Account ID

    if (!amount || amount <= 0) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: "Valid transfer amount is required" });
    }

    if (!destinationAccount) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: "Destination account is required" });
    }

    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: "MR Cash record not found" });
    }

    if (amount > mrCash.currentCash) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: `Insufficient cash. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}` });
    }

    const destinationAcc = await Account.findById(destinationAccount).session(session);
    if (!destinationAcc) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: `Destination account not found` });
    }

    let transferredBy = null;
    if (req.user?.id) {
      transferredBy = req.user.id;
    } else {
      const defaultUser = await User.findOne({ role: "admin" }).session(session);
      if (defaultUser) transferredBy = defaultUser._id;
    }

    const transferAmount = parseFloat(amount);
    mrCash.currentCash            -= transferAmount;
    mrCash.cashTransferredToAdmin += transferAmount;
    mrCash.lastTransferDate        = new Date();
    mrCash.updatedAt               = new Date();

    destinationAcc.totalAmount += transferAmount;
    destinationAcc.updatedAt    = new Date();

    const transferData = {
      fromAccount:     mrCash._id,
      fromAccountName: mrCash.mrName,
      toAccount:       destinationAcc._id,
      toAccountName:   destinationAcc.name,
      toAccountCode:   destinationAcc.code,
      amount:          transferAmount,
      notes:           notes || `Transfer from ${mrCash.mrName} to ${destinationAcc.name}`,
      transferredAt:   new Date(),
    };
    if (transferredBy) transferData.transferredBy = transferredBy;

    const transferRecord = new Transfer(transferData);

    // Create transaction record (using updated Transaction schema)
    const transaction = new Transaction({
      categoryType:   "tour collection", 
      sourceAccount:  mrCash.mrName,
      destination:    destinationAcc.name,
      amount:         transferAmount,
      exchangeLoss:   0,
      finalAmount:    transferAmount,
      date:           new Date(),
      invoiceNo:      "NA",
      accountType:    destinationAcc.accountType || "Cash Balance",
      description:    notes || `Transfer from MR ${mrCash.mrName}`,
      remarks:        notes || `Transfer from MR ${mrCash.mrName}`,
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
      data:    { mrCash, destinationAccount: destinationAcc, transferRecord, transaction },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /:mrCashId/transfer-to/:destinationCode  (legacy route, keep for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:mrCashId/transfer-to/:destinationCode", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId, destinationCode } = req.params;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: "Valid transfer amount is required" });
    }

    const destinationAcc = await Account.findOne({ code: destinationCode }).session(session);
    if (!destinationAcc) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: `Destination account (${destinationCode}) not found` });
    }

    // Reuse the main transfer logic by calling the common handler (or copy logic)
    // For simplicity, we'll copy the core logic here, but you could refactor.
    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: "MR Cash record not found" });
    }

    if (amount > mrCash.currentCash) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: `Insufficient cash. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}` });
    }

    let transferredBy = null;
    if (req.user?.id) {
      transferredBy = req.user.id;
    } else {
      const defaultUser = await User.findOne({ role: "admin" }).session(session);
      if (defaultUser) transferredBy = defaultUser._id;
    }

    const transferAmount = parseFloat(amount);
    mrCash.currentCash            -= transferAmount;
    mrCash.cashTransferredToAdmin += transferAmount;
    mrCash.lastTransferDate        = new Date();
    mrCash.updatedAt               = new Date();

    destinationAcc.totalAmount += transferAmount;
    destinationAcc.updatedAt    = new Date();

    const transferData = {
      fromAccount:     mrCash._id,
      fromAccountName: mrCash.mrName,
      toAccount:       destinationAcc._id,
      toAccountName:   destinationAcc.name,
      toAccountCode:   destinationAcc.code,
      amount:          transferAmount,
      notes:           notes || `Transfer from ${mrCash.mrName} to ${destinationAcc.name}`,
      transferredAt:   new Date(),
    };
    if (transferredBy) transferData.transferredBy = transferredBy;

    const transferRecord = new Transfer(transferData);

    const transaction = new Transaction({
      categoryType:   "transfer",
      sourceAccount:  mrCash.mrName,
      destination:    destinationAcc.name,
      amount:         transferAmount,
      exchangeLoss:   0,
      finalAmount:    transferAmount,
      date:           new Date(),
      invoiceNo:      "NA",
      accountType:    destinationAcc.accountType || "Cash Balance",
      description:    notes || `Transfer from MR ${mrCash.mrName}`,
      remarks:        notes || `Transfer from MR ${mrCash.mrName}`,
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
      data:    { mrCash, destinationAccount: destinationAcc, transferRecord, transaction },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /:mrCashId/transfers  — transfer history
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:mrCashId/transfers", async (req, res) => {
  try {
    const { mrCashId } = req.params;
    const { limit = 30, page = 1, destinationCode } = req.query;

    const mrCash = await MRCash.findById(mrCashId);
    if (!mrCash) return res.status(404).json({ success: false, message: "MR Cash record not found" });

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
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Error fetching transfer history:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:mrCashId/transfers/:transferId  — delete transfer (refund)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:mrCashId/transfers/:transferId", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId, transferId } = req.params;

    const transferRecord = await Transfer.findById(transferId).session(session);
    if (!transferRecord) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: "Transfer record not found" });
    }

    if (transferRecord.fromAccount.toString() !== mrCashId) {
      await session.abortTransaction(); session.endSession();
      return res.status(400).json({ success: false, message: "Transfer does not belong to this MR Cash record" });
    }

    const refundAmount = transferRecord.amount;

    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction(); session.endSession();
      return res.status(404).json({ success: false, message: "MR Cash record not found" });
    }

    mrCash.currentCash            = parseFloat((mrCash.currentCash + refundAmount).toFixed(2));
    mrCash.cashTransferredToAdmin = parseFloat(Math.max(0, mrCash.cashTransferredToAdmin - refundAmount).toFixed(2));
    mrCash.updatedAt              = new Date();

    const destinationAcc = await Account.findById(transferRecord.toAccount).session(session);
    if (destinationAcc) {
      destinationAcc.totalAmount = parseFloat(Math.max(0, destinationAcc.totalAmount - refundAmount).toFixed(2));
      destinationAcc.updatedAt   = new Date();
      await destinationAcc.save({ session });
    }

    await Transaction.deleteOne({
      sourceAccount: mrCash.mrName,
      destination:   destinationAcc?.name,
      amount:        refundAmount,
      date: {
        $gte: new Date(new Date(transferRecord.transferredAt).getTime() - 10000),
        $lte: new Date(new Date(transferRecord.transferredAt).getTime() + 10000),
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
        refundedAmount:             refundAmount,
        newCurrentCash:             mrCash.currentCash,
        newCashTransferredToAdmin:  mrCash.cashTransferredToAdmin,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting transfer:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id  — deactivate MR Cash record
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) return res.status(404).json({ success: false, message: "MR Cash record not found" });

    mrCash.isActive  = false;
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    await mrCash.save();

    res.status(200).json({ success: true, message: "MR Cash record deactivated successfully" });
  } catch (error) {
    console.error("Error deleting MR Cash:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;