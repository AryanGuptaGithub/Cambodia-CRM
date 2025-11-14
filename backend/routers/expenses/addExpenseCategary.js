// routes/expenseCategories.js
import express from "express";
const router = express.Router();
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
import Expense from "../../models/expenses/addExpense.js";

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
      id: category._id,
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

// Create new expense category
router.post("/expense-categary", async (req, res) => {
  try {
    const categoryData = req.body;

    const newCategory = new addExpenseCategary(categoryData);
    const savedCategory = await newCategory.save();

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: savedCategory,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create category",
      error: error.message,
    });
  }
});

// Update expense category
router.put("/expense-categary/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedCategory = await addExpenseCategary.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update category",
      error: error.message,
    });
  }
});

// Delete expense category
router.delete("/expense-categary/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCategory = await addExpenseCategary.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.json({
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

export default router;
