// routes/expenses/addExpense.js  (full corrected file)
import express from "express";
const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import Destination from "../../models/accounts/Destination.js";
import Transaction from "../../models/accounts/Transaction.js";

// ─── Tour-related category names that require an MR selection ───────────────
const TOUR_MR_CATEGORY_KEYWORDS = [
  "tour allowance",
  "tour petrol expense",
  "province marketing expense",
  "rent expense - vans",
];

const isTourMRCategory = (categoryName = "") => {
  const lower = categoryName.toLowerCase().trim();
  return TOUR_MR_CATEGORY_KEYWORDS.some((kw) => lower === kw);
};

// Helper function to convert Sr number to category ObjectId
const convertSrToCategoryId = async (categoryValue) => {
  if (typeof categoryValue === "string" && /^\d+$/.test(categoryValue)) {
    const categories = await addExpenseCategary.find().sort({ category: 1 });
    const srNumber = parseInt(categoryValue);
    if (srNumber >= 1 && srNumber <= categories.length) {
      return categories[srNumber - 1]._id;
    } else {
      throw new Error(
        `Invalid category Sr number: ${categoryValue}. Please select a valid category.`,
      );
    }
  }
  return categoryValue;
};

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

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

  return { date: { $gte: startDate, $lte: endDate } };
};

// ─── GET /statistics/summary ─────────────────────────────────────────────────
router.get("/statistics/summary", async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;
    let matchStage = {};

    if (period)
      matchStage = { ...matchStage, ...getDateRangeForPeriod(period) };
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch expense statistics",
        error: error.message,
      });
  }
});

// ─── GET /categories ──────────────────────────────────────────────────────────
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
      { $match: { date: { $gte: yearStart, $lt: monthStart } } },
      { $group: { _id: "$category", amountUntilYear: { $sum: "$amount" } } },
    ]);

    const monthlyExpenses = await Expense.aggregate([
      { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: "$category", monthlyAmount: { $sum: "$amount" } } },
    ]);

    const ytdMap = new Map();
    ytdExpenses.forEach((exp) =>
      ytdMap.set(exp._id.toString(), exp.amountUntilYear),
    );

    const monthlyMap = new Map();
    monthlyExpenses.forEach((exp) =>
      monthlyMap.set(exp._id.toString(), exp.monthlyAmount),
    );

    const responseData = categories.map((category, index) => ({
      Sr: index + 1,
      _id: category._id,
      Category: category.category,
      Remarks: category.description,
      // Flag so frontend can know which categories need MR
      requiresMR: isTourMRCategory(category.category),
      "Amount Until Year (₹)": ytdMap.get(category._id.toString()) || 0,
      "Monthly Amount (₹)": monthlyMap.get(category._id.toString()) || 0,
    }));

    res.json({ success: true, data: responseData, count: categories.length });
  } catch (error) {
    console.error("Error fetching categories with expenses:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch categories with expense data",
        error: error.message,
      });
  }
});

// ─── GET / ────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    let query = {};

    if (period === "custom" && startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
      };
    } else if (period === "All") {
      query = {};
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
        latestExpenses,
      },
    });
  } catch (error) {
    console.error("Error fetching expenses:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch expenses",
        error: error.message,
      });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id))
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID format" });

    const expense = await Expense.findById(id)
      .populate("category", "category description")
      .populate("sourceAccount", "name");

    if (!expense)
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });

    res.json({ success: true, data: expense });
  } catch (error) {
    console.error("Error fetching expense:", error);
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID format" });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch expense",
        error: error.message,
      });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const expenseData = req.body;

    if (
      !expenseData.date ||
      !expenseData.category ||
      !expenseData.amount ||
      !expenseData.sourceAccount
    ) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Date, category, amount, and source account are required fields",
        });
    }

    const amount = parseFloat(expenseData.amount);
    if (isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
          success: false,
          message: "Amount must be a valid positive number",
        });
    }

    const categoryId = await convertSrToCategoryId(expenseData.category);
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

    // ── MR validation for tour-related categories ────────────────────────
    const needsMR = isTourMRCategory(categoryExists.category);
    if (needsMR && !expenseData.mrId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Medical Representative is required for category "${categoryExists.category}"`,
      });
    }

    if (!isValidObjectId(expenseData.sourceAccount)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid source account ID format" });
    }

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

    await Destination.findByIdAndUpdate(
      expenseData.sourceAccount,
      { $inc: { totalAmount: -amount } },
      { session },
    );

    const newExpense = new Expense({
      ...expenseData,
      category: categoryId,
      amount,
      // Save MR info only when relevant
      mrId: needsMR && expenseData.mrId ? expenseData.mrId : null,
      mrName: needsMR && expenseData.mrName ? expenseData.mrName : null,
    });
    let savedExpense = await newExpense.save({ session });

    const transaction = new Transaction({
      invoiceNo: "NA",
      categoryType: "withdraw",
      sourceAccount: sourceAccount.name,
      destination: "--",
      amount,
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

    const successMessage = `Added expense <b>${savedExpense.category.category}</b> of <b>₹${savedExpense.amount}</b> from <b>${savedExpense.sourceAccount.name}</b> successfully${needsMR && expenseData.mrName ? ` for MR <b>${expenseData.mrName}</b>` : ""}`;

    res
      .status(201)
      .json({ success: true, message: successMessage, data: savedExpense });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating expense:", error);

    if (
      error.message.includes("Invalid category Sr number") ||
      error.message.includes("Insufficient balance") ||
      error.message.includes("Medical Representative is required")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError")
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation error",
          error: error.message,
        });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: `Invalid ID format: ${error.value}` });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to create expense",
        error: error.message,
      });
  }
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────
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
      return res
        .status(400)
        .json({
          success: false,
          message: "Date, category, source account, and amount are required",
        });
    }

    const newAmount = parseFloat(updateData.amount);
    if (isNaN(newAmount) || newAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({
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

    // ── MR validation for tour-related categories ────────────────────────
    const needsMR = isTourMRCategory(categoryExists.category);
    if (needsMR && !updateData.mrId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Medical Representative is required for category "${categoryExists.category}"`,
      });
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
    let newSourceAccountName = null;
    let newSourceAccountType = "bank";

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
        return res
          .status(400)
          .json({
            success: false,
            message: `Insufficient balance in new source account. Available: ₹${newSourceAccount.totalAmount}, Required: ₹${newAmount}`,
          });
      }

      if (oldSourceAccountId) {
        await Destination.findByIdAndUpdate(
          oldSourceAccountId,
          { $inc: { totalAmount: oldAmount } },
          { session },
        );
      }
      await Destination.findByIdAndUpdate(
        newSourceAccountId,
        { $inc: { totalAmount: -newAmount } },
        { session },
      );

      newSourceAccountName = newSourceAccount.name;
      newSourceAccountType = newSourceAccount.type || "bank";
    } else {
      const currentSourceAccount =
        await Destination.findById(newSourceAccountId).session(session);
      const amountDifference = newAmount - oldAmount;

      if (
        amountDifference > 0 &&
        currentSourceAccount.totalAmount < amountDifference
      ) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({
            success: false,
            message: `Insufficient balance. Available: ₹${currentSourceAccount.totalAmount}, Additional required: ₹${amountDifference}`,
          });
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

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        ...updateData,
        category: categoryId,
        amount: newAmount,
        mrId: needsMR && updateData.mrId ? updateData.mrId : null,
        mrName: needsMR && updateData.mrName ? updateData.mrName : null,
      },
      { new: true, runValidators: true, session },
    )
      .populate("category", "category")
      .populate("sourceAccount", "name");

    await Transaction.deleteOne({ referenceId: id }).session(session);

    const newTransaction = new Transaction({
      invoiceNo: "NA",
      categoryType: "withdraw",
      sourceAccount: newSourceAccountName,
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
      error.message.includes("Insufficient balance") ||
      error.message.includes("Medical Representative is required")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError")
      return res
        .status(400)
        .json({
          success: false,
          message: "Validation error",
          error: error.message,
        });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID" });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update expense",
        error: error.message,
      });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID" });
    }

    const expense = await Expense.findById(id).session(session);
    if (!expense) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    const { amount, sourceAccount } = expense;
    if (sourceAccount) {
      await Destination.findByIdAndUpdate(
        sourceAccount,
        { $inc: { totalAmount: amount } },
        { session },
      );
    }

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
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID" });
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete expense",
        error: error.message,
      });
  }
});

export default router;
