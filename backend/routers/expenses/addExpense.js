// routes/expenses.js
import express from "express";
const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";
// Add the missing import for expense category model
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import Destination from "../../models/accounts/Destination.js";

// Helper function to convert Sr number to category ObjectId
const convertSrToCategoryId = async (categoryValue) => {
  if (typeof categoryValue === "string" && /^\d+$/.test(categoryValue)) {
    // Get all categories sorted the same way as in the expense-categary route
    const categories = await addExpenseCategary.find().sort({ category: 1 });

    const srNumber = parseInt(categoryValue);
    if (srNumber >= 1 && srNumber <= categories.length) {
      const categoryId = categories[srNumber - 1]._id;
      return categoryId;
    } else {
      throw new Error(
        `Invalid category Sr number: ${categoryValue}. Please select a valid category.`
      );
    }
  }
  return categoryValue;
};

// Validate MongoDB ID
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

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

// Get single expense by ID - FIXED
router.get("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Validate if the ID is a valid MongoDB ObjectId
    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID format",
      });
    }

    const expense = await Expense.findById(id)
      .populate("category", "category description")
      .populate("sourceAccount", "name");

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

    // Handle CastError specifically
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID format",
      });
    }

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

    // Handle optional remarks field
    if (expenseData.remarks && expenseData.remarks.trim() === "") {
      expenseData.remarks = undefined;
    }

    // Convert Sr number to actual category ObjectId if needed
    const categoryId = await convertSrToCategoryId(expenseData.category);

    // Validate that categoryId is now a valid ObjectId
    if (!isValidObjectId(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    // Verify the category exists
    const categoryExists = await addExpenseCategary.findById(categoryId);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist",
      });
    }

    // Validate source account ID
    if (!isValidObjectId(expenseData.sourceAccount)) {
      return res.status(400).json({
        success: false,
        message: "Invalid source account ID format",
      });
    }

    // Create the expense with the proper category ID
    const newExpense = new Expense({
      ...expenseData,
      category: categoryId,
    });

    let savedExpense = await newExpense.save();

    // Deduct amount from source account
    await Destination.findByIdAndUpdate(expenseData.sourceAccount, {
      $inc: { totalAmount: -parseFloat(expenseData.amount) },
    });

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

    if (error.message.includes("Invalid category Sr number")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

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
        message: `Invalid ID format: ${error.value}`,
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

// Get expense categories
router.get("/expense-categary", async (req, res) => {
  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const yearStart = new Date(currentYear, 0, 1);
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const categories = await addExpenseCategary.find().sort({ category: 1 });

    const ytdExpenses = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: yearStart,
            $lt: monthStart,
          },
        },
      },
      {
        $group: {
          _id: "$category",
          amountUntilYear: { $sum: "$amount" },
        },
      },
    ]);

    const monthlyExpenses = await Expense.aggregate([
      {
        $match: {
          date: {
            $gte: monthStart,
            $lte: monthEnd,
          },
        },
      },
      {
        $group: {
          _id: "$category",
          monthlyAmount: { $sum: "$amount" },
        },
      },
    ]);

    const ytdMap = new Map();
    ytdExpenses.forEach((exp) => {
      ytdMap.set(exp._id.toString(), exp.amountUntilYear);
    });

    const monthlyMap = new Map();
    monthlyExpenses.forEach((exp) => {
      monthlyMap.set(exp._id.toString(), exp.monthlyAmount);
    });

    const responseData = categories.map((category, index) => ({
      Sr: index + 1,
      _id: category._id, // Include the actual ObjectId
      Category: category.category,
      Remarks: category.description,
      "Amount Until Year ($)": ytdMap.get(category._id.toString()) || 0,
      "Monthly Amount ($)": monthlyMap.get(category._id.toString()) || 0,
    }));

    res.json({
      success: true,
      data: responseData,
      count: categories.length,
    });
  } catch (error) {
    console.error("Error fetching categories with expenses:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories with expense data",
      error: error.message,
    });
  }
});

// UPDATE EXPENSE - CORRECTED LOGIC
router.put("/expenses/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate expense ID
    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID format",
      });
    }

    if (
      !updateData.date ||
      !updateData.category ||
      !updateData.amount ||
      !updateData.sourceAccount
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Date, category, source account, and amount are required",
      });
    }

    const newAmount = parseFloat(updateData.amount);
    if (isNaN(newAmount) || newAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid positive number",
      });
    }

    // Convert Sr number to actual category ObjectId if needed
    const categoryId = await convertSrToCategoryId(updateData.category);

    // Validate that categoryId is now a valid ObjectId
    if (!isValidObjectId(categoryId)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    // Verify the category exists
    const categoryExists = await addExpenseCategary.findById(categoryId);
    if (!categoryExists) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Selected category does not exist",
      });
    }

    // Validate source account ID
    if (!isValidObjectId(updateData.sourceAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid source account ID format",
      });
    }

    const existingExpense = await Expense.findById(id).session(session);
    if (!existingExpense) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    const oldAmount = existingExpense.amount || 0;
    const oldSourceAccountId = existingExpense.sourceAccount?.toString();
    const newSourceAccountId = updateData.sourceAccount;

    // Handle source account balance changes
    if (oldSourceAccountId !== newSourceAccountId) {
      // If source account changed, refund old account and deduct from new account
      if (oldSourceAccountId) {
        await Destination.findByIdAndUpdate(
          oldSourceAccountId,
          { $inc: { totalAmount: oldAmount } },
          { session }
        );
      }

      // Deduct from new source account
      await Destination.findByIdAndUpdate(
        newSourceAccountId,
        { $inc: { totalAmount: -newAmount } },
        { session }
      );
    } else {
      // Same source account, adjust balance based on amount difference
      const amountDifference = oldAmount - newAmount;
      if (amountDifference !== 0) {
        await Destination.findByIdAndUpdate(
          newSourceAccountId,
          { $inc: { totalAmount: amountDifference } },
          { session }
        );
      }
    }

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        ...updateData,
        category: categoryId,
        amount: newAmount,
      },
      {
        new: true,
        runValidators: true,
        session,
      }
    )
      .populate("category", "category")
      .populate("sourceAccount", "name");

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Expense updated successfully",
      data: updatedExpense,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error updating expense:", error);

    if (error.message.includes("Invalid category Sr number")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

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
    if (!isValidObjectId(id)) {
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
      await Destination.findByIdAndUpdate(
        sourceAccount,
        { $inc: { totalAmount: amount } },
        { session }
      );
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
        $lookup: {
          from: "addexpensecategaries", // Make sure this matches your collection name
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: "$categoryInfo",
      },
      {
        $group: {
          _id: "$category",
          categoryName: { $first: "$categoryInfo.category" },
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
    if (!isValidObjectId(id)) {
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
