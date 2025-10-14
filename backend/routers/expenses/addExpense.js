// routes/expenses.js
import express from "express";
const router = express.Router();
import Expense from "../../models/expenses/addExpense.js";

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
    console.log("Received expense data:", expenseData);

    // Validate required fields
    if (!expenseData.date || !expenseData.category || !expenseData.amount) {
      return res.status(400).json({
        success: false,
        message: "Date, category, and amount are required fields",
      });
    }

    // Create & save the new expense
    const newExpense = new Expense(expenseData);
    let savedExpense = await newExpense.save();

    // Populate the category & sourceAccount fields
    // Instead of chaining .populate().execPopulate(), do:
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

// Update expense
router.put("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate required fields if they are being updated
    if (
      updateData.date === "" ||
      updateData.category === "" ||
      updateData.amount === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Date, category, and amount cannot be empty",
      });
    }

    const updatedExpense = await Expense.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

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
  try {
    const { id } = req.params;

    const deletedExpense = await Expense.findByIdAndDelete(id);

    if (!deletedExpense) {
      return res.status(404).json({
        success: false,
        message: "Expense not found",
      });
    }

    res.json({
      success: true,
      message: "Expense deleted successfully",
      data: deletedExpense,
    });
  } catch (error) {
    console.error("Error deleting expense:", error);

    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid expense ID",
      });
    }

    res.status(500).json({
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

export default router;
