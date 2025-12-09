import express from "express";
import mongoose from "mongoose";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import Transfer from "../../models/accounts/transfer.js";
import Account from "../../models/accounts/Destination.js";
import User from "../../models/User.js";

const router = express.Router();

// Helper function to format currency
const formatCurrency = (value) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
};

// GET all MR Cash records with totals
router.get("/mrcash", async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isActive: true };

    // Search functionality
    if (search) {
      query.$or = [
        { mrName: { $regex: search, $options: "i" } },
        { notes: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const total = await MRCash.countDocuments(query);

    // Get aggregated totals for ALL MRs (not just current page)
    const totals = await MRCash.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalCurrentCash: { $sum: "$currentCash" },
          totalTransferred: { $sum: "$cashTransferredToAdmin" },
          totalAll: {
            $sum: {
              $add: ["$currentCash", "$cashTransferredToAdmin"],
            },
          },
        },
      },
    ]);

    // Get paginated data
    const mrCashes = await MRCash.find(query)
      .populate(
        "mrId",
        "medicalRepName employeeName phone email MRId teamName contactNo"
      )
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format the response
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
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST create new MR Cash record
router.post("/mrcash", async (req, res) => {
  try {
    const {
      mrId,
      currentCash = 0,
      cashTransferredToAdmin = 0,
      notes = "",
    } = req.body;

    // Validate MR exists
    const staff = await Staff.findById(mrId);
    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "MR not found",
      });
    }

    // Check if MR already has a cash record
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
      createdBy: req.user?.id || staff.userId,
      updatedBy: req.user?.id || staff.userId,
    });

    await mrCash.save();

    res.status(201).json({
      success: true,
      message: "MR Cash record created successfully",
      data: mrCash,
    });
  } catch (error) {
    console.error("Error creating MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// PUT update MR Cash record
router.put("/mrcash/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found",
      });
    }

    // If updating MR ID, validate new MR exists
    if (updateData.mrId && updateData.mrId !== mrCash.mrId.toString()) {
      const staff = await Staff.findById(updateData.mrId);
      if (!staff) {
        return res.status(404).json({
          success: false,
          message: "New MR not found",
        });
      }
      updateData.mrName = staff.medicalRepName || staff.employeeName;
    }

    // Update record
    Object.assign(mrCash, updateData);
    mrCash.updatedBy = req.user?.id || mrCash.updatedBy;
    mrCash.updatedAt = new Date();

    await mrCash.save();

    res.status(200).json({
      success: true,
      message: "MR Cash record updated successfully",
      data: mrCash,
    });
  } catch (error) {
    console.error("Error updating MR Cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// POST transfer cash to admin/company account - UPDATED TO HANDLE BOTH ACCOUNTS
router.post("/mrcash/:mrCashId/transfer", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrCashId } = req.params;
    const { amount, notes, destinationAccount = "cash_balance" } = req.body;

    if (!amount || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Valid transfer amount is required",
      });
    }

    // Validate destination account type
    const validDestinations = ["company_account", "cash_balance"];
    if (!validDestinations.includes(destinationAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Invalid destination account. Must be one of: ${validDestinations.join(
          ", "
        )}`,
      });
    }

    // Find the MR Cash record
    const mrCash = await MRCash.findById(mrCashId).session(session);
    if (!mrCash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found",
      });
    }

    // Check if MR has enough cash
    if (amount > mrCash.currentCash) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient cash available. Available: ${formatCurrency(
          mrCash.currentCash
        )}, Requested: ${formatCurrency(amount)}`,
      });
    }

    // Find the destination account based on the provided code
    const destinationAcc = await Account.findOne({
      code: destinationAccount,
    }).session(session);

    if (!destinationAcc) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: `Destination account (${destinationAccount}) not found. Please create it first.`,
      });
    }

    // Get the user who is making the transfer (from token or default)
    let transferredBy = null;
    if (req.user?.id) {
      transferredBy = req.user.id;
    } else {
      // If no user from token, try to find a default admin user
      const defaultUser = await User.findOne({ role: "admin" }).session(
        session
      );
      if (defaultUser) {
        transferredBy = defaultUser._id;
      }
    }

    // Deduct from MR's current cash and add to transferred amount
    const transferAmount = parseFloat(amount);
    mrCash.currentCash -= transferAmount;
    mrCash.cashTransferredToAdmin += transferAmount;
    mrCash.lastTransferDate = new Date();
    mrCash.updatedAt = new Date();

    // Add to destination account
    destinationAcc.totalAmount += transferAmount;
    destinationAcc.updatedAt = new Date();

    // Create transfer record with destination account info
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

    // Only add transferredBy if we have a valid user ID
    if (transferredBy) {
      transferData.transferredBy = transferredBy;
    }

    const transferRecord = new Transfer(transferData);

    // Save all changes
    await mrCash.save({ session });
    await destinationAcc.save({ session });
    await transferRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `$${amount} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
      data: {
        mrCash,
        destinationAccount: destinationAcc,
        transferRecord,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error transferring cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// NEW: Transfer cash to specific destination (explicit endpoint)
router.post(
  "/mrcash/:mrCashId/transfer-to/:destinationCode",
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { mrCashId, destinationCode } = req.params;
      const { amount, notes } = req.body;

      if (!amount || amount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Valid transfer amount is required",
        });
      }

      // Validate destination account type
      const validDestinations = ["company_account", "cash_balance"];
      if (!validDestinations.includes(destinationCode)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Invalid destination account. Must be one of: ${validDestinations.join(
            ", "
          )}`,
        });
      }

      // Find the MR Cash record
      const mrCash = await MRCash.findById(mrCashId).session(session);
      if (!mrCash) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "MR Cash record not found",
        });
      }

      // Check if MR has enough cash
      if (amount > mrCash.currentCash) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient cash available. Available: ${formatCurrency(
            mrCash.currentCash
          )}, Requested: ${formatCurrency(amount)}`,
        });
      }

      // Find the destination account
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

      // Get the user who is making the transfer
      let transferredBy = null;
      if (req.user?.id) {
        transferredBy = req.user.id;
      } else {
        const defaultUser = await User.findOne({ role: "admin" }).session(
          session
        );
        if (defaultUser) {
          transferredBy = defaultUser._id;
        }
      }

      // Perform the transfer
      const transferAmount = parseFloat(amount);
      mrCash.currentCash -= transferAmount;
      mrCash.cashTransferredToAdmin += transferAmount;
      mrCash.lastTransferDate = new Date();
      mrCash.updatedAt = new Date();

      // Update destination account
      destinationAcc.totalAmount += transferAmount;
      destinationAcc.updatedAt = new Date();

      // Create transfer record
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

      if (transferredBy) {
        transferData.transferredBy = transferredBy;
      }

      const transferRecord = new Transfer(transferData);

      // Save all changes
      await mrCash.save({ session });
      await destinationAcc.save({ session });
      await transferRecord.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: `$${amount} transferred from ${mrCash.mrName} to ${destinationAcc.name} successfully`,
        data: {
          mrCash,
          destinationAccount: destinationAcc,
          transferRecord,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error transferring cash:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// GET transfer history for an MR
router.get("/mrcash/:mrCashId/transfers", async (req, res) => {
  try {
    const { mrCashId } = req.params;
    const { limit = 30, page = 1, destinationCode } = req.query;

    // Build query
    const query = { fromAccount: mrCashId };

    // Filter by destination account code if provided
    if (destinationCode) {
      query.toAccountCode = destinationCode;
    }

    // Find MR Cash record
    const mrCash = await MRCash.findById(mrCashId);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found",
      });
    }

    // Find transfers
    const transfers = await Transfer.find(query)
      .sort({ transferredAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate("transferredBy", "name email")
      .populate("toAccount", "name code")
      .lean();

    // Get total count for pagination
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
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET destination accounts list
router.get("/mrcash/destination-accounts", async (req, res) => {
  try {
    const accounts = await Account.find({
      code: { $in: ["cash_balance"] },
    })
      .select("name code totalAmount")
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: accounts,
      count: accounts.length,
    });
  } catch (error) {
    console.error("Error fetching destination accounts:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// DELETE (deactivate) MR Cash record
router.delete("/mrcash/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const mrCash = await MRCash.findById(id);
    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found",
      });
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
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// GET MR list for dropdown (only MRs with current cash > 0)
router.get("/mrcash/mr-list", async (req, res) => {
  try {
    // Find MRs from MRCash collection where currentCash > 0
    const mrsWithCash = await MRCash.find({
      isActive: true,
      currentCash: { $gt: 0 },
    })
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .select(
        "mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes"
      )
      .sort({ currentCash: -1 });

    // Format the response
    const formattedMRs = mrsWithCash.map((mr) => ({
      value: mr._id, // MRCash record ID
      label: `${mr.mrName} - ${formatCurrency(mr.currentCash)}`,
      mrName: mr.mrName,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      // Include staff details if available
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
    console.error("Error fetching MR list from MRCash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// NEW: GET MRs with positive current cash (for transfer operations)
router.get("/mrcash/mr-list-with-cash", async (req, res) => {
  try {
    const { minCash = 0 } = req.query; // Optional: minimum cash amount

    // Build query - only MRs with currentCash > 0
    const query = {
      isActive: true,
      currentCash: { $gt: 0 }, // Greater than 0
    };

    // Add minimum cash filter if provided
    if (parseFloat(minCash) > 0) {
      query.currentCash = { $gte: parseFloat(minCash) };
    }

    // Find MRs from MRCash collection with positive cash
    const mrsWithCash = await MRCash.find(query)
      .populate("mrId", "medicalRepName contactNo email MRId teamName")
      .select(
        "mrId mrName currentCash cashTransferredToAdmin lastTransferDate notes"
      )
      .sort({ currentCash: -1 }); // Sort by highest cash first

    // Format the response
    const formattedMRs = mrsWithCash.map((mr) => ({
      value: mr._id, // MRCash record ID
      label: `${mr.mrName} - Available: ${formatCurrency(mr.currentCash)}`,
      mrName: mr.mrName,
      currentCash: mr.currentCash,
      cashTransferredToAdmin: mr.cashTransferredToAdmin,
      lastTransferDate: mr.lastTransferDate,
      notes: mr.notes,
      // Include staff details if available
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
      filter: {
        minCash: parseFloat(minCash) || 0,
        description:
          minCash > 0
            ? `MRs with cash ≥ ${formatCurrency(minCash)}`
            : "MRs with positive cash balance",
      },
    });
  } catch (error) {
    console.error("Error fetching MR list with cash:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// NEW: GET specific MR's cash details
router.get("/mrcash/mr/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;

    const mrCash = await MRCash.findOne({
      mrId: mrId,
      isActive: true,
    }).populate("mrId", "medicalRepName contactNo email MRId teamName");

    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record not found for this MR",
      });
    }

    // Format the response
    const response = {
      _id: mrCash._id,
      mrId: mrCash.mrId?._id || mrCash.mrId,
      mrName: mrCash.mrName,
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

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error fetching MR cash details:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

// NEW: GET summary statistics for MR Cash
router.get("/mrcash/summary", async (req, res) => {
  try {
    // Get basic totals
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

    // Get MRs with positive cash count
    const positiveCashCount = await MRCash.countDocuments({
      isActive: true,
      currentCash: { $gt: 0 },
    });

    // Get MRs with no cash count
    const zeroCashCount = await MRCash.countDocuments({
      isActive: true,
      currentCash: { $eq: 0 },
    });

    // Get recent transfers
    const recentTransfers = await MRCash.find({
      isActive: true,
      lastTransferDate: { $exists: true, $ne: null },
    })
      .sort({ lastTransferDate: -1 })
      .limit(5)
      .select("mrName currentCash cashTransferredToAdmin lastTransferDate")
      .lean();

    // Get destination account balances
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

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Error fetching MR Cash summary:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

export default router;
