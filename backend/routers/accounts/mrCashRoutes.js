import express from "express";
import mongoose from "mongoose";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import Transfer from "../../models/accounts/transfer.js";
import Account from "../../models/accounts/Destination.js";
import User from "../../models/User.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";

const router = express.Router();

// Helper function to format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

// Helper: Get mrIds that have at least one stocktransfertomrs record with transferType = "send"
const getMrIdsWithSendTransfers = async () => {
  const db = mongoose.connection.db;
  const sendRecords = await db
    .collection("stocktransfertomrs")
    .distinct("mrId", { transferType: "send" });
  return sendRecords.map((id) => id.toString());
};

// Helper: Get or create the category ID for MR transfers (by code "MR_TRANSFER")
const getMrTransferCategoryId = async (session, userId = null) => {
  let category = await CategoryType.findOne({ code: "MR_TRANSFER" }).session(
    session,
  );
  if (!category) {
    // Create the category if it doesn't exist
    category = new CategoryType({
      name: "MR Transfer",
      code: "MR_TRANSFER",
      description: "Transfer from MR to admin",
      isActive: true,
      createdBy: userId,
    });
    await category.save({ session });
  }
  return category._id;
};

// GET all MR Cash records — only MRs that have stocktransfertomrs with transferType="send"
router.get("/", async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const mrIdsWithSend = await getMrIdsWithSendTransfers();

    if (mrIdsWithSend.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        totals: { totalCurrentCash: 0, totalTransferred: 0, totalAll: 0 },
        pagination: {
          total: 0,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: 0,
        },
      });
    }

    const query = {
      isActive: true,
      mrId: {
        $in: mrIdsWithSend.map((id) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return id;
          }
        }),
      },
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

    // Populate categoryType
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

// POST create new MR Cash record (with categoryType)
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
    if (!staff) {
      return res.status(404).json({ success: false, message: "MR not found" });
    }

    if (categoryType) {
      const category = await CategoryType.findById(categoryType);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category type not found",
        });
      }
    }

    const existingMRCash = await MRCash.findOne({ mrId, isActive: true });
    if (existingMRCash) {
      return res.status(400).json({
        success: false,
        message: "Cash record already exists for this MR",
      });
    }

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

// GET summary statistics
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

    const summary = {
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
    };

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Error fetching MR Cash summary:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// GET destination accounts list
router.get("/destination-accounts", async (req, res) => {
  try {
    const accounts = await Account.find({ code: { $in: ["cash_balance"] } })
      .select("name code totalAmount")
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

// GET MR list for dropdown (with category)
router.get("/mr-list", async (req, res) => {
  try {
    const mrIdsWithSend = await getMrIdsWithSendTransfers();

    const query = {
      isActive: true,
      currentCash: { $gt: 0 },
      ...(mrIdsWithSend.length > 0 && {
        mrId: {
          $in: mrIdsWithSend.map((id) => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch {
              return id;
            }
          }),
        },
      }),
    };

    const mrsWithCash = await MRCash.find(query)
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

// GET MRs with positive current cash (with category)
router.get("/mr-list-with-cash", async (req, res) => {
  try {
    const { minCash = 0 } = req.query;

    const mrIdsWithSend = await getMrIdsWithSendTransfers();

    const query = {
      isActive: true,
      currentCash: { $gt: parseFloat(minCash) > 0 ? parseFloat(minCash) : 0 },
      ...(mrIdsWithSend.length > 0 && {
        mrId: {
          $in: mrIdsWithSend.map((id) => {
            try {
              return new mongoose.Types.ObjectId(id);
            } catch {
              return id;
            }
          }),
        },
      }),
    };

    const mrsWithCash = await MRCash.find(query)
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

// GET specific MR's cash details (with category)
router.get("/mr/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;

    const mrCash = await MRCash.findOne({ mrId, isActive: true })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .populate("categoryType", "name code");

    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found for this MR",
      });
    }

    const response = {
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
    };

    res.status(200).json({ success: true, data: response });
  } catch (error) {
    console.error("Error fetching MR cash details:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// PUT update MR Cash record (can update categoryType)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    if (updateData.categoryType) {
      const category = await CategoryType.findById(updateData.categoryType);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: "Category type not found",
        });
      }
    }

    if (updateData.mrId && updateData.mrId !== mrCash.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff) {
        return res
          .status(404)
          .json({ success: false, message: "New MR not found" });
      }
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    mrCash.updatedAt = new Date();

    await mrCash.save();
    await mrCash.populate("categoryType", "name code");

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

// POST transfer cash to admin (with Transaction creation)
router.post("/:mrCashId/transfer", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId } = req.params;
    const { amount, notes, destinationAccount = "cash_balance" } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Valid transfer amount is required" });
    }

    const validDestinations = ["company_account", "cash_balance"];
    if (!validDestinations.includes(destinationAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid destination account. Must be one of: ${validDestinations.join(", ")}`,
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
        message: `Insufficient cash available. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}`,
      });
    }

    const destinationAcc = await Account.findOne({
      code: destinationAccount,
    }).session(session);
    if (!destinationAcc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Destination account (${destinationAccount}) not found.`,
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

    // ─── Create a Transaction record for the cash module ─────────────────
    // Get or create the MR_TRANSFER category
    const categoryId = await getMrTransferCategoryId(session, transferredBy);
    const transaction = new Transaction({
      categoryType: categoryId,
      source: mrCash._id, // ✅ Use MR Cash ID as source (not null)
      destination: destinationAcc._id,
      amount: transferAmount,
      exchangeLoss: 0,
      finalAmount: transferAmount,
      date: new Date(),
      invoiceDate: null,
      invoiceNumber: null,
      customerName: null,
      customerAddress: null,
      accountType: destinationAcc.accountType || "Cash Balance",
      description: notes || `Transfer from MR ${mrCash.mrName}`,
      remarks: notes || `Transfer from MR ${mrCash.mrName}`,
      createdBy: transferredBy,
      transactionType: "deposit", // adjust if needed
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

// POST transfer cash to specific destination (with Transaction creation)
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

    const validDestinations = ["company_account", "cash_balance"];
    if (!validDestinations.includes(destinationCode)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid destination account. Must be one of: ${validDestinations.join(", ")}`,
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
        message: `Insufficient cash available. Available: ${formatCurrency(mrCash.currentCash)}, Requested: ${formatCurrency(amount)}`,
      });
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

    // ─── Create a Transaction record for the cash module ─────────────────
    const categoryId = await getMrTransferCategoryId(session, transferredBy);
    const transaction = new Transaction({
      categoryType: categoryId,
      source: mrCash._id, // ✅ Use MR Cash ID as source
      destination: destinationAcc._id,
      amount: transferAmount,
      exchangeLoss: 0,
      finalAmount: transferAmount,
      date: new Date(),
      invoiceDate: null,
      invoiceNumber: null,
      customerName: null,
      customerAddress: null,
      accountType: destinationAcc.accountType || "Cash Balance",
      description: notes || `Transfer from MR ${mrCash.mrName}`,
      remarks: notes || `Transfer from MR ${mrCash.mrName}`,
      createdBy: transferredBy,
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

// GET transfer history for an MR (unchanged)
router.get("/:mrCashId/transfers", async (req, res) => {
  try {
    const { mrCashId } = req.params;
    const { limit = 30, page = 1, destinationCode } = req.query;

    const query = { fromAccount: mrCashId };
    if (destinationCode) query.toAccountCode = destinationCode;

    const mrCash = await MRCash.findById(mrCashId);
    if (!mrCash) {
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

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

// DELETE (deactivate) MR Cash record (unchanged)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res
        .status(404)
        .json({ success: false, message: "MR Cash record not found" });
    }

    mrCash.isActive = false;
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    await mrCash.save();

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

export default router;
