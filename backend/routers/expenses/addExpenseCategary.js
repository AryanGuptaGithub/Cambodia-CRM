import express from "express";
import mongoose from "mongoose";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import Expense from "../../models/expenses/addExpense.js";

const router = express.Router();

/**
 * GET /
 * Get all expense categories with YTD and monthly expense amounts
 * Accessible at: /api/expense-categories
 */
router.get("/", async (req, res) => {
  try {
    const { year, month, page = 1, limit = 100 } = req.query;

    // Determine the date range
    const currentDate = new Date();
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const targetMonth = month !== undefined ? parseInt(month) : currentDate.getMonth();

    const yearStart = new Date(targetYear, 0, 1);
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0);

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get all categories with pagination
    const categories = await addExpenseCategary
      .find()
      .sort({ category: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get YTD expenses (from year start until beginning of current month)
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

    // Get monthly expenses
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

    // Create maps for quick lookup
    const ytdMap = new Map();
    ytdExpenses.forEach((exp) => {
      ytdMap.set(exp._id.toString(), exp.amountUntilYear);
    });

    const monthlyMap = new Map();
    monthlyExpenses.forEach((exp) => {
      monthlyMap.set(exp._id.toString(), exp.monthlyAmount);
    });

    // Build response data
    const responseData = categories.map((category, index) => ({
      Sr: skip + index + 1,
      id: category._id,
      Category: category.category,
      Remarks: category.description || "",
      "Amount Until Year ($)": ytdMap.get(category._id.toString()) || 0,
      "Monthly Amount ($)": monthlyMap.get(category._id.toString()) || 0,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    }));

    const total = await addExpenseCategary.countDocuments();

    res.status(200).json({
      success: true,
      data: responseData,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
      dateRange: {
        year: targetYear,
        month: targetMonth,
        yearStart: yearStart.toISOString(),
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
      },
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

/**
 * GET /list
 * Get simple list of all expense categories (without expense calculations)
 * Accessible at: /api/expense-categories/list
 */
router.get("/list", async (req, res) => {
  try {
    const categories = await addExpenseCategary
      .find()
      .sort({ category: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: categories,
      count: categories.length,
    });
  } catch (error) {
    console.error("Error fetching category list:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch category list",
      error: error.message,
    });
  }
});

/**
 * GET /statistics
 * Get expense statistics by category
 * Accessible at: /api/expense-categories/statistics
 */
router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {};

    // Date range filter
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const expensesByCategory = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$category",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          avgAmount: { $avg: "$amount" },
        },
      },
      {
        $lookup: {
          from: "addexpensecategaries", // MongoDB collection name
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: {
          path: "$categoryInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          categoryId: "$_id",
          categoryName: "$categoryInfo.category",
          totalAmount: 1,
          count: 1,
          avgAmount: 1,
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    const totalExpenses = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      data: {
        byCategory: expensesByCategory,
        summary: totalExpenses[0] || {
          totalAmount: 0,
          totalCount: 0,
        },
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

/**
 * GET /:id
 * Get single expense category by ID
 * Accessible at: /api/expense-categories/:id
 */
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    const category = await addExpenseCategary.findById(id).lean();

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Get total expenses for this category
    const expenseStats = await Expense.aggregate([
      {
        $match: {
          category: new mongoose.Types.ObjectId(id),
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = expenseStats[0] || { totalAmount: 0, count: 0 };

    res.status(200).json({
      success: true,
      data: {
        ...category,
        totalExpenses: stats.totalAmount,
        expenseCount: stats.count,
      },
    });
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch category",
      error: error.message,
    });
  }
});

/**
 * POST /
 * Create new expense category
 * Accessible at: /api/expense-categories
 */
router.post("/", async (req, res) => {
  try {
    const { category, description } = req.body;

    // Validation
    if (!category) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    // Check for duplicate category name
    const existingCategory = await addExpenseCategary.findOne({
      category: category.trim(),
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    const newCategory = new addExpenseCategary({
      category: category.trim(),
      description: description?.trim() || "",
    });

    const savedCategory = await newCategory.save();

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: savedCategory,
    });
  } catch (error) {
    console.error("Error creating category:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate category name",
      });
    }

    if (error.name === "ValidationError") {
      const validationErrors = {};
      for (const field in error.errors) {
        validationErrors[field] = error.errors[field].message;
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message,
    });
  }
});

/**
 * PUT /:id
 * Update expense category
 * Accessible at: /api/expense-categories/:id
 */
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { category, description } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    // Check if category exists
    const existingCategory = await addExpenseCategary.findById(id);

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check for duplicate category name (excluding current category)
    if (category) {
      const duplicateCategory = await addExpenseCategary.findOne({
        category: category.trim(),
        _id: { $ne: id },
      });

      if (duplicateCategory) {
        return res.status(400).json({
          success: false,
          message: "Another category with this name already exists",
        });
      }
    }

    // Update fields
    if (category !== undefined) existingCategory.category = category.trim();
    if (description !== undefined)
      existingCategory.description = description.trim();

    const updatedCategory = await existingCategory.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Duplicate category name",
      });
    }

    if (error.name === "ValidationError") {
      const validationErrors = {};
      for (const field in error.errors) {
        validationErrors[field] = error.errors[field].message;
      }

      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: error.message,
    });
  }
});

/**
 * DELETE /:id
 * Delete expense category
 * Accessible at: /api/expense-categories/:id
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID format",
      });
    }

    // Check if category has associated expenses
    const expenseCount = await Expense.countDocuments({
      category: new mongoose.Types.ObjectId(id),
    });

    if (expenseCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. It has ${expenseCount} associated expense(s)`,
        expenseCount,
      });
    }

    const deletedCategory = await addExpenseCategary.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
      data: deletedCategory,
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete category",
      error: error.message,
    });
  }
});

/**
 * DELETE /bulk
 * Bulk delete expense categories
 * Accessible at: /api/expense-categories/bulk
 */
router.delete("/bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide category IDs to delete",
      });
    }

    // Validate all IDs
    const validIds = [];
    const invalidIds = [];

    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(new mongoose.Types.ObjectId(id));
      } else {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided",
        invalidIds,
      });
    }

    // Check if any categories have associated expenses
    const categoriesWithExpenses = await Expense.aggregate([
      {
        $match: {
          category: { $in: validIds },
        },
      },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
    ]);

    if (categoriesWithExpenses.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some categories have associated expenses and cannot be deleted",
        categoriesWithExpenses: categoriesWithExpenses.map((c) => ({
          categoryId: c._id,
          expenseCount: c.count,
        })),
      });
    }

    const result = await addExpenseCategary.deleteMany({
      _id: { $in: validIds },
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} category(ies) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting categories:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete categories",
      error: error.message,
    });
  }
});

export default router;
