// routes/expenses.js
import express from "express";
const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";
import mongoose from "mongoose";
import Destination from "../../models/accounts/Destination.js";

router.get("/expenses", async (req, res) => {
  try {
    const expenses = await Expense.find()
      .populate("category", "category description")
      .populate("sourceAccount", "name")
      .sort({ date: -1, createdAt: -1 });

    res.json({
      success: true,
      data: expenses,
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expenses",
      error: error.message,
    });
  }
});

// Get single expense by ID
router.get("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findById(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      data: expense,
    });
  } catch (error) {
    console.error("Error fetching expense:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expense",
      error: error.message,
    });
  }
});

// Create new expense
router.post("/expenses", async (req, res) => {
  try {
    const expenseData = req.body;

    // Validate required fields
    if (
      !expenseData.date ||
      !expenseData.category ||
      !expenseData.amount ||
      !expenseData.sourceAccount
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Date, category, amount, and source account are required fields",
      });
    }

    // Handle optional remarks field - ensure it's not empty string if provided
    if (expenseData.remarks && expenseData.remarks.trim() === "") {
      expenseData.remarks = undefined;
    }

    const newExpense = new Expense(expenseData);
    let savedExpense = await newExpense.save();

    savedExpense = await savedExpense.populate([
      { path: "category", select: "category" },
      { path: "sourceAccount", select: "name" },
    ]);

    // Construct the success message
    const successMessage = `Added expense <b>${savedExpense.category.category}</b> of <b>$${savedExpense.amount}</b> from <b>${savedExpense.sourceAccount.name}</b> successfully`;

    res.status(201).json({
      success: true,
      message: successMessage,
      data: savedExpense,
    });
  } catch (error) {
    console.error("Error creating expense:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create expense",
      error: error.message,
    });
  }
});

// UPDATE EXPENSE
router.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (
      !updateData.date ||
      !updateData.category ||
      !updateData.amount ||
      !updateData.sourceAccount
    ) {
      return res.status(400).json({
        success: false,
        message: "Date, category, source account, and amount are required",
      });
    }

    const newAmount = parseFloat(updateData.amount);
    if (isNaN(newAmount)) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid number",
      });
    }

    const existingExpense = await Expense.findById(id);
    if (!existingExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    const oldAmount = existingExpense.amount || 0;
    const oldCategoryId = existingExpense.category?.toString();
    const oldSourceAccountId = existingExpense.sourceAccount?.toString();

    const newCategoryId = updateData.category;
    const newSourceAccountId = updateData.sourceAccount;

    if (oldCategoryId) {
      await Destination.findByIdAndUpdate(oldCategoryId, {
        $inc: { totalAmount: oldAmount },
      });
    }

    if (oldSourceAccountId) {
      await Destination.findByIdAndUpdate(oldSourceAccountId, {
        $inc: { totalAmount: oldAmount },
      });
    }

    await Destination.findByIdAndUpdate(newCategoryId, {
      $inc: { totalAmount: -newAmount },
    });

    await Destination.findByIdAndUpdate(newSourceAccountId, {
      $inc: { totalAmount: -newAmount },
    });

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        ...updateData,
        amount: newAmount,
        category: newCategoryId,
        sourceAccount: newSourceAccountId,
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("category")
      .populate("sourceAccount");

    console.log("values of populatedExpense", updatedExpense);

    res.json({
      success: true,
      message: "Expense updated successfully",
      data: updatedExpense,
    });
  } catch (error) {
    console.error("Error updating expense:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message,
      });
    }

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update expense",
      error: error.message,
    });
  }
});

// Delete expense
router.delete("/expenses/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    // Fetch the expense to get amount and sourceAccount
    const expense = await Expense.findById(id).session(session);
    if (!expense) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    const { amount, sourceAccount } = expense;

    // If there is a source account, refund the amount
    if (sourceAccount) {
      const account = await Destination.findById(sourceAccount).session(
        session
      );
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          success: false,
          message: "Source account not found to refund the amount",
        });
      }
      account.totalAmount = (account.totalAmount || 0) + amount;
      await account.save({ session });
    }

    // Delete the expense
    const deletedExpense = await Expense.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message: "Expense deleted and amount refunded successfully",
      data: deletedExpense,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error deleting expense:", error);
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to delete expense",
      error: error.message,
    });
  }
});

// Get expense statistics
router.get("/expenses/statistics/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let matchStage = {};

    // Date range filtering
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const statistics = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amount" },
          averageExpense: { $avg: "$amount" },
          expenseCount: { $sum: 1 },
          minExpense: { $min: "$amount" },
          maxExpense: { $max: "$amount" },
        },
      },
    ]);

    const categoryStats = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        summary: statistics[0] || {
          totalExpenses: 0,
          averageExpense: 0,
          expenseCount: 0,
          minExpense: 0,
          maxExpense: 0,
        },
        byCategory: categoryStats,
      },
    });
  } catch (error) {
    console.error("Error fetching expense statistics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch expense statistics",
      error: error.message,
    });
  }
});

router.patch("/expenses/destinations/:id/balance", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, operation } = req.body; // operation: "add" or "subtract"

    // Validate MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid account ID format",
      });
    }

    // Validate amount
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be a positive number",
      });
    }

    // Validate operation
    if (!["add", "subtract"].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: "Invalid operation. Use 'add' or 'subtract'",
      });
    }

    // Find the account
    const account = await Destination.findById(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Destination account not found",
      });
    }

    // Check account status
    if (!account.isActive) {
      return res.status(400).json({
        success: false,
        message: "Cannot update inactive account",
      });
    }

    const previousBalance = account.totalAmount;
    let newBalance;

    if (operation === "add") {
      newBalance = previousBalance + amount;
    } else {
      // "subtract"
      newBalance = previousBalance - amount;
      if (newBalance < 0) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance",
        });
      }
    }

    account.totalAmount = newBalance;
    await account.save();

    res.status(200).json({
      success: true,
      message:
        operation === "add"
          ? "Amount added to balance successfully"
          : "Amount subtracted from balance successfully",
      data: {
        previousBalance,
        newBalance,
        operation,
        amount,
      },
    });
  } catch (error) {
    console.error("Error updating account balance:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update account balance",
      error: error.message,
    });
  }
});

export default router;
