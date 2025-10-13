import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId, // Changed from String to ObjectId
      ref: "ExpenseCategory", // Add reference to ExpenseCategory model
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    sourceAccount: { // ADD THIS FIELD - was missing from schema
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination", // Reference to your destinations/accounts model
      required: true,
    },
    paymentMethod: { // ADD THIS FIELD - was missing from schema
      type: String,
      required: true,
      enum: ["cash", "card", "bank transfer", "digital wallet", "other"], // Add validation
      default: "cash",
    },
    notes: {
      type: String,
      trim: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    receipt: {
      filename: String,
      originalName: String,
      mimetype: String,
      size: Number,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ sourceAccount: 1 }); // ADD THIS INDEX
expenseSchema.index({ paymentMethod: 1 }); // ADD THIS INDEX
expenseSchema.index({ createdAt: -1 });

export default mongoose.model("Expense", expenseSchema);