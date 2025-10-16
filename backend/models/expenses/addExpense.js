import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },
    remarks: { // Changed from description to remarks
      type: String,
      trim: true,
      // Removed required: true to make it optional
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: true,
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["cash", "card", "bank transfer", "digital wallet", "other"],
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
expenseSchema.index({ sourceAccount: 1 });
expenseSchema.index({ paymentMethod: 1 });
expenseSchema.index({ createdAt: -1 });

export default mongoose.model("Expense", expenseSchema);