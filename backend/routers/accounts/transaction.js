import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import mongoose from "mongoose";
const router = express.Router();

router.post("/transaction", async (req, res) => {
  try {
    const { categoryType, source, destination } = req.body;
    // Validate ObjectIds
    const validateObjectId = (id, name) => {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name} ID`);
      }
    };

    validateObjectId(categoryType, "categoryType");
    validateObjectId(source, "source");
    if (destination) validateObjectId(destination, "destination");

    // Prepare transaction data
    const amount = parseFloat(req.body.amount);
    const exchangeLoss = parseFloat(req.body.exchangeLoss) || 0;
    const finalAmount = parseFloat(req.body.finalAmount) || 0;

    const transactionData = {
      ...req.body,
      amount,
      exchangeLoss,
      finalAmount,
    };

    // Save transaction
    const transaction = new Transaction(transactionData);
    await transaction.save();

    // ✅ Update destination totalAmount if destination is provided
    if (destination) {
      const updatedDestination = await Destination.findByIdAndUpdate(
        destination,
        { $inc: { totalAmount: amount } }, // Increment totalAmount
        { new: true }
      );

      if (!updatedDestination) {
        throw new Error("Destination not found to update totalAmount");
      }
    }

    // Populate transaction for response
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name")
      .populate("destination", "name");

    res.status(201).json({
      success: true,
      data: populatedTransaction,
      message: "Transaction created successfully",
    });
  } catch (error) {
    console.error("Transaction submission error:", error.message);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Get all transactions with pagination and filtering
router.get("/transaction", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      accountType,
      search,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (accountType) query.accountType = accountType;

    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } },
      ];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }

    const transactions = await Transaction.find(query)
      .populate("categoryType", "name")
      .populate("source", "name")
      .populate("destination", "name")
      .sort({ date: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Transaction.countDocuments(query);
    console.log("values of transactions", transactions);
    res.json({
      success: true,
      data: transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
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
router.get("/transaction:id", async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate("categoryType", "name")
      .populate("source", "name")
      .populate("destination", "name");

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

// Update transaction
router.put("/transaction:id", async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        amount: parseFloat(req.body.amount),
        exchangeLoss: parseFloat(req.body.exchangeLoss) || 0,
        finalAmount: parseFloat(req.body.finalAmount) || 0,
      },
      { new: true, runValidators: true }
    )
      .populate("categoryType", "name")
      .populate("source", "name")
      .populate("destination", "name");

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.json({
      success: true,
      data: transaction,
      message: "Transaction updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

// Delete transaction
router.delete("/transaction:id", async (req, res) => {
  try {
    const transaction = await Transaction.findByIdAndDelete(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
