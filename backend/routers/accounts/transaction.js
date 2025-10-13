import express from "express";
import Transaction from "../../models/accounts/Transaction.js";
import Destination from "../../models/accounts/Destination.js";
import CategoryType from "../../models/accounts/CategoryType.js";
import mongoose from "mongoose";
const router = express.Router();

router.post("/transaction", async (req, res) => {
  try {
    const { categoryType, source, destination } = req.body;

    // ✅ Validate ObjectIds
    const validateObjectId = (id, name) => {
      if (id && !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error(`Invalid ${name} ID`);
      }
    };

    validateObjectId(categoryType, "categoryType");
    validateObjectId(source, "source");
    if (destination) validateObjectId(destination, "destination");

    const amount = parseFloat(req.body.amount);
    const exchangeLoss = parseFloat(req.body.exchangeLoss) || 0;
    const finalAmount = parseFloat(req.body.finalAmount) || 0;

    const transactionData = {
      ...req.body,
      amount,
      exchangeLoss,
      finalAmount,
    };

    // ✅ Save transaction
    const transaction = new Transaction(transactionData);
    await transaction.save();

    // ✅ Fetch the category type to check its name
    const category = await CategoryType.findById(categoryType);
    if (!category) throw new Error("Category type not found");

    const categoryName = category.name.toLowerCase();

    if (
      source &&
      destination &&
      (categoryName === "deposit" || categoryName === "withdraw")
    ) {
      // Subtract from source
      const updatedSource = await Destination.findByIdAndUpdate(
        source,
        { $inc: { totalAmount: -amount } },
        { new: true }
      );

      if (!updatedSource)
        throw new Error("Source not found to update totalAmount");

      // Add to destination
      const updatedDestination = await Destination.findByIdAndUpdate(
        destination,
        { $inc: { totalAmount: -amount - exchangeLoss } },
        { new: true }
      );
      if (!updatedDestination)
        throw new Error("Destination not found to update totalAmount");
    } else if (destination) {
      // ✅ Only update destination if no transfer involved
      const updatedDestination = await Destination.findByIdAndUpdate(
        destination,
        { $inc: { totalAmount: amount } },
        { new: true }
      );
      if (!updatedDestination)
        throw new Error("Destination not found to update totalAmount");
    }

    // ✅ Populate and return the saved transaction
    const populatedTransaction = await Transaction.findById(transaction._id)
      .populate("categoryType", "name")
      .populate("source", "name")
      .populate("destination", "name");

    res.status(201).json({
      success: true,
      data: populatedTransaction,
      message: `Transaction created successfully in <b>${destination.name}</b>`,
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

    // ✅ Get full list of destinations
    const updatedDestinations = await Destination.find();

    res.json({
      success: true,
      data: transactions,
      destinations: updatedDestinations, // ✅ Include in response
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total,
    });
  } catch (error) {
    console.error("Transaction fetch error:", error);
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

// DELETE single transaction by ID
router.delete("/transaction/:id", async (req, res) => {
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

// DELETE multiple transactions by array of IDs
router.delete("/transactions", async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: "No IDs provided" });
  }

  try {
    const result = await Transaction.deleteMany({ _id: { $in: ids } });

    res.json({
      success: true,
      message: `${result.deletedCount} transaction(s) deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting transactions:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
