import express from "express";
const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import Destination from "../../models/accounts/Destination.js";
import Transaction from "../../models/accounts/Transaction.js";

// Helper function to convert Sr number to category ObjectId
const convertSrToCategoryId = async (categoryValue) => {
  if (typeof categoryValue === "string" && /^\d+$/.test(categoryValue)) {
    const categories = await addExpenseCategary.find().sort({ category: 1 });
    const srNumber = parseInt(categoryValue);
    if (srNumber >= 1 && srNumber <= categories.length) {
      const categoryId = categories[srNumber - 1]._id;
      return categoryId;
    } else {
      throw new Error(
        `Invalid category Sr number: ${categoryValue}. Please select a valid category.`,
      );
    }
  }
  return categoryValue;
};

// Validate MongoDB ID
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Helper function to get date ranges for period filtering
const getDateRangeForPeriod = (period) => {
  const currentDate = new Date();
  let startDate, endDate;

  switch (period) {
    case "Today":
      startDate = new Date(currentDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(currentDate);
      endDate.setHours(23, 59, 59, 999);
      break;

    case "Month":
      startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1,
      );
      endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        0,
      );
      endDate.setHours(23, 59, 59, 999);
      break;

    case "Year":
      startDate = new Date(currentDate.getFullYear(), 0, 1);
      endDate = new Date(currentDate.getFullYear(), 11, 31);
      endDate.setHours(23, 59, 59, 999);
      break;

    default:
      return {};
  }

  return {
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  };
};

// Get expense statistics
router.get("/statistics/summary", async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;

    let matchStage = {};

    if (period) {
      const dateRange = getDateRangeForPeriod(period);
      matchStage = { ...matchStage, ...dateRange };
    }

    if (startDate || endDate) {
      matchStage.date = matchStage.date || {};
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
          from: "addexpensecategaries",
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      { $unwind: "$categoryInfo" },
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

// Get expense categories
router.get("/categories", async (req, res) => {
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
          date: { $gte: yearStart, $lt: monthStart },
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
          date: { $gte: monthStart, $lte: monthEnd },
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
      _id: category._id,
      Category: category.category,
      Remarks: category.description,
      "Amount Until Year (₹)": ytdMap.get(category._id.toString()) || 0,
      "Monthly Amount (₹)": monthlyMap.get(category._id.toString()) || 0,
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

// GET /api/expenses
router.get("/", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let query = {};

    if (period === "custom" && startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else if (period) {
      query = getDateRangeForPeriod(period);
    }

    const expenses = await Expense.find(query)
      .populate("category", "category description")
      .populate("sourceAccount", "name")
      .sort({ date: -1, createdAt: -1 });

    const currentDate = new Date();

    const currentMonthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    const currentMonthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const currentYearStart = new Date(currentDate.getFullYear(), 0, 1);
    const currentYearEnd = new Date(
      currentDate.getFullYear(),
      11,
      31,
      23,
      59,
      59,
      999,
    );

    const [
      monthlyAgg,
      yearlyAgg,
      pendingAgg,
      approvedAgg,
      rejectedAgg,
      latestExpenses,
    ] = await Promise.all([
      Expense.aggregate([
        {
          $match: { date: { $gte: currentMonthStart, $lte: currentMonthEnd } },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: currentYearStart, $lte: currentYearEnd } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: { status: "Pending" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: { status: "Approved" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.aggregate([
        { $match: { status: "Rejected" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Expense.find()
        .populate("category", "category description")
        .populate("sourceAccount", "name")
        .sort({ date: -1, createdAt: -1 })
        .limit(10),
    ]);

    res.json({
      success: true,
      data: expenses,
      summary: {
        monthlyExpense: monthlyAgg[0]?.total || 0,
        yearExpense: yearlyAgg[0]?.total || 0,
        pendingExpense: pendingAgg[0]?.total || 0,
        approvedExpense: approvedAgg[0]?.total || 0,
        rejectedExpense: rejectedAgg[0]?.total || 0,
        latestExpenses: latestExpenses,
      },
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
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

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

// =============================================================
// Create new expense + generate transaction
// FIX: sourceAccount in transaction stores the account NAME, not ID
// =============================================================
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseData = req.body;

    // Basic validation
    if (
      !expenseData.date ||
      !expenseData.category ||
      !expenseData.amount ||
      !expenseData.sourceAccount
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message:
          "Date, category, amount, and source account are required fields",
      });
    }

    const amount = parseFloat(expenseData.amount);
    if (isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Amount must be a valid positive number",
      });
    }

    // Convert Sr number to category ID if needed
    const categoryId = await convertSrToCategoryId(expenseData.category);
    if (!isValidObjectId(categoryId)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid category ID format" });
    }

    // Check if category exists
    const categoryExists = await addExpenseCategary
      .findById(categoryId)
      .session(session);
    if (!categoryExists) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Selected category does not exist" });
    }

    if (!isValidObjectId(expenseData.sourceAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid source account ID format" });
    }

    // Get source account to check balance and retrieve its NAME
    const sourceAccount = await Destination.findById(
      expenseData.sourceAccount,
    ).session(session);
    if (!sourceAccount) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Source account not found" });
    }

    if (sourceAccount.totalAmount < amount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Insufficient balance in source account. Available: ₹${sourceAccount.totalAmount}, Required: ₹${amount}`,
      });
    }

    // Deduct from source account
    await Destination.findByIdAndUpdate(
      expenseData.sourceAccount,
      { $inc: { totalAmount: -amount } },
      { session },
    );

    // Create expense
    const newExpense = new Expense({
      ...expenseData,
      category: categoryId,
      amount: amount,
    });
    let savedExpense = await newExpense.save({ session });

    // ✅ Create transaction record with sourceAccount = NAME (not ID)
    const transaction = new Transaction({
      invoiceNo: "NA",
      categoryType: "withdraw",
      sourceAccount: sourceAccount.name, // ← store the account NAME
      destination: "--",
      amount: amount,
      finalAmount: -amount,
      date: expenseData.date,
      remarks: expenseData.description || expenseData.remarks || "",
      transactionType: "expense",
      accountType: sourceAccount.type || "bank",
      referenceId: savedExpense._id,
    });
    await transaction.save({ session });

    savedExpense = await Expense.findById(savedExpense._id)
      .populate("category", "category")
      .populate("sourceAccount", "name")
      .session(session);

    await session.commitTransaction();
    session.endSession();

    const successMessage = `Added expense <b>${savedExpense.category.category}</b> of <b>₹${savedExpense.amount}</b> from <b>${savedExpense.sourceAccount.name}</b> successfully`;

    res.status(201).json({
      success: true,
      message: successMessage,
      data: savedExpense,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating expense:", error);

    if (
      error.message.includes("Invalid category Sr number") ||
      error.message.includes("Insufficient balance")
    ) {
      return res.status(400).json({ success: false, message: error.message });
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
      });
    }
    res.status(500).json({
      success: false,
      message: "Failed to create expense",
      error: error.message,
    });
  }
});

// =============================================================
// Update expense + adjust transaction
// FIX: sourceAccount in transaction stores the account NAME, not ID
// =============================================================
router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID format" });
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

    const categoryId = await convertSrToCategoryId(updateData.category);
    if (!isValidObjectId(categoryId)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid category ID format" });
    }

    const categoryExists = await addExpenseCategary
      .findById(categoryId)
      .session(session);
    if (!categoryExists) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Selected category does not exist" });
    }

    if (!isValidObjectId(updateData.sourceAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid source account ID format" });
    }

    const existingExpense = await Expense.findById(id).session(session);
    if (!existingExpense) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    const oldAmount = existingExpense.amount || 0;
    const oldSourceAccountId = existingExpense.sourceAccount?.toString();
    const newSourceAccountId = updateData.sourceAccount;

    // We'll need the name of the new source account (if changed) for the transaction
    let newSourceAccountName = null;
    let newSourceAccountType = "bank";

    // Handle account balance adjustments
    if (oldSourceAccountId !== newSourceAccountId) {
      const newSourceAccount =
        await Destination.findById(newSourceAccountId).session(session);
      if (!newSourceAccount) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "New source account not found" });
      }

      if (newSourceAccount.totalAmount < newAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Insufficient balance in new source account. Available: ₹${newSourceAccount.totalAmount}, Required: ₹${newAmount}`,
        });
      }

      // Add back to old account
      if (oldSourceAccountId) {
        await Destination.findByIdAndUpdate(
          oldSourceAccountId,
          { $inc: { totalAmount: oldAmount } },
          { session },
        );
      }

      // Deduct from new account
      await Destination.findByIdAndUpdate(
        newSourceAccountId,
        { $inc: { totalAmount: -newAmount } },
        { session },
      );

      newSourceAccountName = newSourceAccount.name;
      newSourceAccountType = newSourceAccount.type || "bank";
    } else {
      // Same account – adjust by difference
      const currentSourceAccount =
        await Destination.findById(newSourceAccountId).session(session);
      const amountDifference = newAmount - oldAmount;

      if (amountDifference > 0) {
        if (currentSourceAccount.totalAmount < amountDifference) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            success: false,
            message: `Insufficient balance. Available: ₹${currentSourceAccount.totalAmount}, Additional required: ₹${amountDifference}`,
          });
        }
      }

      if (amountDifference !== 0) {
        await Destination.findByIdAndUpdate(
          newSourceAccountId,
          { $inc: { totalAmount: -amountDifference } },
          { session },
        );
      }

      newSourceAccountName = currentSourceAccount.name;
      newSourceAccountType = currentSourceAccount.type || "bank";
    }

    // Update expense
    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        ...updateData,
        category: categoryId,
        amount: newAmount,
      },
      { new: true, runValidators: true, session },
    )
      .populate("category", "category")
      .populate("sourceAccount", "name");

    // Delete old transaction
    await Transaction.deleteOne({ referenceId: id }).session(session);

    // ✅ Create new transaction with sourceAccount = NAME
    const newTransaction = new Transaction({
      invoiceNo: "NA",
      categoryType: "withdraw",
      sourceAccount: newSourceAccountName, // ← store the account NAME
      destination: "--",
      amount: newAmount,
      finalAmount: -newAmount,
      date: updateData.date,
      remarks: updateData.description || updateData.remarks || "",
      transactionType: "expense",
      accountType: newSourceAccountType,
      referenceId: id,
    });
    await newTransaction.save({ session });

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

    if (
      error.message.includes("Invalid category Sr number") ||
      error.message.includes("Insufficient balance")
    ) {
      return res.status(400).json({ success: false, message: error.message });
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

// =============================================================
// Delete expense + remove transaction
// =============================================================
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

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

    // Refund to source account
    if (sourceAccount) {
      await Destination.findByIdAndUpdate(
        sourceAccount,
        { $inc: { totalAmount: amount } },
        { session },
      );
    }

    // Delete associated transaction
    await Transaction.deleteOne({ referenceId: id }).session(session);

    const deletedExpense = await Expense.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    return res.json({
      success: true,
      message:
        "Expense deleted, amount refunded, and transaction removed successfully",
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

export default router;
