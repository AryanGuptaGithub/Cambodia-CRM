// routes/expenses/addExpense.js (full corrected file with activity logging)
import express from "express";
import { invalidateReportCaches } from "../../utils/reportCache.js";

const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import mongoose from "mongoose";
import Destination from "../../models/accounts/Destination.js";
import Transaction from "../../models/accounts/Transaction.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js";
import { emitEvent, EVENT_TYPES, captureSnapshotBefore } from "../../observability/auditLogger.js";

// ─── Utility helpers ──────────────────────────────────────────────────────────

const handleServerError = (res, err, message = "Server error", code = 500) => {
  console.error("ERROR:", err);
  res.status(code).json({ success: false, message, error: err.message });
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDateForResponse = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Safely extract an ObjectId string from a value that could be:
 *  - a plain ObjectId string  "abc123..."
 *  - a populated object       { _id: "abc123...", name: "..." }
 *  - a Mongoose ObjectId instance
 *  - a numeric Sr number string "3"
 */
const extractId = (value) => {
  if (!value) return null;
  if (typeof value === "object" && value !== null) {
    // populated object or ObjectId instance
    return value._id ? String(value._id) : String(value);
  }
  return String(value);
};

/**
 * Convert a category value to a valid ObjectId.
 * Handles: ObjectId string, populated object {_id, category}, numeric Sr number.
 */
const convertSrToCategoryId = async (categoryValue) => {
  // Handle populated object { _id, category }
  if (
    typeof categoryValue === "object" &&
    categoryValue !== null &&
    categoryValue._id
  ) {
    return categoryValue._id;
  }

  const strVal = String(categoryValue).trim();

  // If it is already a valid ObjectId string, return as-is
  if (isValidObjectId(strVal)) {
    return strVal;
  }

  // If it is a numeric Sr number
  if (/^\d+$/.test(strVal)) {
    const categories = await addExpenseCategary.find().sort({ category: 1 });
    const srNumber = parseInt(strVal);
    if (srNumber >= 1 && srNumber <= categories.length) {
      return categories[srNumber - 1]._id;
    } else {
      throw new Error(
        `Invalid category Sr number: ${strVal}. Please select a valid category.`,
      );
    }
  }

  throw new Error(
    `Invalid category value: ${strVal}. Must be a valid ID or Sr number.`,
  );
};

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
    res.status(500).json({
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
      requiresMR: isTourMRCategory(category.category),
      "Amount Until Year (₹)": ytdMap.get(category._id.toString()) || 0,
      "Monthly Amount (₹)": monthlyMap.get(category._id.toString()) || 0,
    }));

    res.json({ success: true, data: responseData, count: categories.length });
  } catch (error) {
    console.error("Error fetching categories with expenses:", error);
    res.status(500).json({
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
    res.status(500).json({
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch expense",
      error: error.message,
    });
  }
});

// ─── POST / – Create expense ──────────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();

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

    const needsMR = isTourMRCategory(categoryExists.category);
    if (needsMR && !expenseData.mrId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Medical Representative is required for category "${categoryExists.category}"`,
      });
    }

    // Extract plain ID from sourceAccount (handles populated object or string)
    const sourceAccountId = extractId(expenseData.sourceAccount);
    if (!isValidObjectId(sourceAccountId)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid source account ID format" });
    }

    const sourceAccount = await Destination.findById(sourceAccountId).session(
      session,
    );
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
      sourceAccountId,
      { $inc: { totalAmount: -amount } },
      { session },
    );

    const newExpense = new Expense({
      ...expenseData,
      category: categoryId,
      sourceAccount: sourceAccountId,
      amount,
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

    // ── Invalidate P&L cache (expenses affect profit) ─────────────────────
    invalidateReportCaches("pl:");
    // ─────────────────────────────────────────────────────────────────────

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Expense: ${toTitleCase(savedExpense.category.category)} - ₹${savedExpense.amount}`,
      tableName: "expenses",
      tableLabel: "Expense",
      recordId: savedExpense._id,
      referenceNumber: savedExpense.invoiceNo || savedExpense._id.toString(),
      newData: savedExpense.toObject(),
      description: `Expense of ₹${savedExpense.amount} added for category "${savedExpense.category.category}" from ${savedExpense.sourceAccount.name}${needsMR && expenseData.mrName ? ` for MR ${expenseData.mrName}` : ""}`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.EXPENSE_ADDED,
      entityType: 'Expense',
      entityId:   savedExpense._id?.toString(),
      status:     'SUCCESS',
      metadata: {
        category:      savedExpense.category?.category,
        amount:        savedExpense.amount,
        sourceAccount: savedExpense.sourceAccount?.name,
        mrName:        expenseData.mrName || null,
        snapshotBefore,  // ← ADD
      },
    });

    const successMessage = `Added expense <b>${savedExpense.category.category}</b> of <b>₹${savedExpense.amount}</b> from <b>${savedExpense.sourceAccount.name}</b> successfully${needsMR && expenseData.mrName ? ` for MR <b>${expenseData.mrName}</b>` : ""}`;

    res
      .status(201)
      .json({ success: true, message: successMessage, data: savedExpense });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating expense:", error);

    if (
      error.message?.includes("Invalid category") ||
      error.message?.includes("Insufficient balance") ||
      error.message?.includes("Medical Representative is required")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message,
      });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: `Invalid ID format: ${error.value}` });
    await emitEvent(req, {
      eventType:    EVENT_TYPES.EXPENSE_ADDED,
      status:       'FAILED',
      errorMessage: error.message,
    });
    res.status(500).json({
      success: false,
      message: "Failed to create expense",
      error: error.message,
    });
  }
});

// ─── PUT /:id – Update expense ────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
   const snapshotBefore = await captureSnapshotBefore();

  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID format" });
    }

    // ── Validate required fields ──────────────────────────────────────────
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

    // ── Resolve category — handles ObjectId string, populated obj, or Sr# ──
    let categoryId;
    try {
      categoryId = await convertSrToCategoryId(updateData.category);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: err.message });
    }

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

    const needsMR = isTourMRCategory(categoryExists.category);
    if (needsMR && !updateData.mrId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Medical Representative is required for category "${categoryExists.category}"`,
      });
    }

    // ── Resolve sourceAccount — handles populated obj {_id, name} or string ──
    const newSourceAccountId = extractId(updateData.sourceAccount);
    if (!isValidObjectId(newSourceAccountId)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid source account ID format" });
    }

    // ── Fetch existing expense ────────────────────────────────────────────
    const existingExpense = await Expense.findById(id).session(session);
    if (!existingExpense) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(404)
        .json({ success: false, message: "Expense not found" });
    }

    // Capture previous state for activity log (before any mutation)
    const previousRecord = await Expense.findById(id)
      .populate("category", "category")
      .populate("sourceAccount", "name")
      .lean();

    const oldAmount = existingExpense.amount || 0;
    const oldSourceAccountId = extractId(existingExpense.sourceAccount);
    let newSourceAccountName = null;
    let newSourceAccountType = "bank";

    if (oldSourceAccountId !== newSourceAccountId) {
      // ── Source account changed ────────────────────────────────────────
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

      // Refund old account
      if (oldSourceAccountId && isValidObjectId(oldSourceAccountId)) {
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
      // ── Same source account — adjust for amount difference ────────────
      const currentSourceAccount =
        await Destination.findById(newSourceAccountId).session(session);
      if (!currentSourceAccount) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(404)
          .json({ success: false, message: "Source account not found" });
      }

      const amountDifference = newAmount - oldAmount;

      if (
        amountDifference > 0 &&
        currentSourceAccount.totalAmount < amountDifference
      ) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
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

    // ── Apply update ──────────────────────────────────────────────────────
    // Remove populated objects from updateData before saving
    delete updateData.category;
    delete updateData.sourceAccount;

    const updatedExpense = await Expense.findByIdAndUpdate(
      id,
      {
        ...updateData,
        category: categoryId,
        sourceAccount: newSourceAccountId,
        amount: newAmount,
        mrId: needsMR && updateData.mrId ? updateData.mrId : null,
        mrName: needsMR && updateData.mrName ? updateData.mrName : null,
      },
      { new: true, runValidators: true, session },
    )
      .populate("category", "category")
      .populate("sourceAccount", "name");

    // ── Replace transaction ───────────────────────────────────────────────
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

    // ── Invalidate P&L cache ───────────────────────────────────────────────
    invalidateReportCaches("pl:");
    // ─────────────────────────────────────────────────────────────────────

    // ── Log activity ──────────────────────────────────────────────────────
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Expense: ${toTitleCase(updatedExpense.category.category)} - ₹${updatedExpense.amount}`,
      tableName: "expenses",
      tableLabel: "Expense",
      recordId: updatedExpense._id,
      referenceNumber:
        updatedExpense.invoiceNo || updatedExpense._id.toString(),
      previousData: previousRecord,
      newData: updatedExpense.toObject(),
      description: `Expense updated from ₹${oldAmount} to ₹${newAmount} for category "${updatedExpense.category.category}"`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.EXPENSE_UPDATED,
      entityType: 'Expense',
      entityId:   updatedExpense._id?.toString(),
      status:     'SUCCESS',
      metadata: {
        category: updatedExpense.category?.category,
        oldAmount: previousRecord?.amount,
        newAmount: updatedExpense.amount,
        snapshotBefore,  // ← ADD
      },
    });

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
      error.message?.includes("Invalid category") ||
      error.message?.includes("Insufficient balance") ||
      error.message?.includes("Medical Representative is required")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }
    if (error.name === "ValidationError")
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message,
      });
    if (error.name === "CastError")
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID" });
    await emitEvent(req, { eventType: EVENT_TYPES.EXPENSE_UPDATED, status: 'FAILED', errorMessage: error.message });
    res.status(500).json({
      success: false,
      message: "Failed to update expense",
      error: error.message,
    });
  }
});

// ─── DELETE /:id – Delete expense ─────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const snapshotBefore = await captureSnapshotBefore();

  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ success: false, message: "Invalid expense ID" });
    }

    const expense = await Expense.findById(id)
      .populate("category", "category")
      .populate("sourceAccount", "name")
      .session(session);

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

    // ── Invalidate P&L cache ───────────────────────────────────────────────
    invalidateReportCaches("pl:");
    // ─────────────────────────────────────────────────────────────────────

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Expense: ${toTitleCase(expense.category?.category || "Unknown")} - ₹${expense.amount}`,
      tableName: "expenses",
      tableLabel: "Expense",
      recordId: expense._id,
      referenceNumber: expense.invoiceNo || expense._id.toString(),
      previousData: expense.toObject(),
      description: `Expense of ₹${expense.amount} for category "${expense.category?.category || "Unknown"}" from ${expense.sourceAccount?.name || "Unknown"} deleted and amount refunded`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.EXPENSE_DELETED,
      entityType: 'Expense',
      entityId:   req.params.id,
      status:     'SUCCESS',
      metadata:   { category: expense.category?.category, amount: expense.amount },
       snapshotBefore,
    });

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
    await emitEvent(req, { eventType: EVENT_TYPES.EXPENSE_DELETED, status: 'FAILED', errorMessage: error.message });
    return res.status(500).json({
      success: false,
      message: "Failed to delete expense",
      error: error.message,
    });
  }
});

// ─── DELETE /bulk – Bulk delete expenses ─────────────────────────────────────
router.delete("/bulk", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
   const snapshotBefore = await captureSnapshotBefore();
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No IDs provided",
      });
    }

    const validIds = ids.filter((id) => isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid expense IDs provided",
      });
    }

    const toDelete = await Expense.find({ _id: { $in: validIds } })
      .populate("category", "category")
      .populate("sourceAccount", "name")
      .session(session);

    for (const expense of toDelete) {
      if (expense.sourceAccount) {
        await Destination.findByIdAndUpdate(
          expense.sourceAccount,
          { $inc: { totalAmount: expense.amount } },
          { session },
        );
      }
      await Transaction.deleteOne({ referenceId: expense._id }).session(
        session,
      );
    }

    const result = await Expense.deleteMany(
      { _id: { $in: validIds } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Expense(s)`,
      tableName: "expenses",
      tableLabel: "Expense",
      previousData: toDelete.map((exp) => exp.toObject()),
      description: `Deleted ${result.deletedCount} expenses totaling ₹${toDelete.reduce((sum, exp) => sum + exp.amount, 0)}`,
      refField: "invoiceNo",
    });

    await emitEvent(req, {
      eventType:  EVENT_TYPES.EXPENSE_DELETED,
      entityType: 'Expense',
      status:     'SUCCESS',
      metadata:   { action: 'BULK_DELETE', deletedCount: result.deletedCount, snapshotBefore,  },
    });

    res.json({
      success: true,
      message: `${result.deletedCount} expense(s) deleted successfully`,
      deletedCount: result.deletedCount,
      totalAmountRefunded: toDelete.reduce((sum, exp) => sum + exp.amount, 0),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error bulk deleting expenses:", error);
    await emitEvent(req, { eventType: EVENT_TYPES.EXPENSE_DELETED, status: 'FAILED', errorMessage: error.message });
    handleServerError(res, error, "Failed to bulk delete expenses");
  }
});

export default router;