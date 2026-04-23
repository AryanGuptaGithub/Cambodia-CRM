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
    remarks: {
      type: String,
      trim: true,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0, // Changed from 0.01 to 0 to allow zero amounts
      validate: {
        validator: function (v) {
          return v >= 0; // Changed from > 0 to >= 0 to allow zero
        },
        message: "Amount must be greater than or equal to 0",
      },
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: true,
    },
    // ── MR linkage (only for tour-related expense categories) ──────────────
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalRepresentative",
      default: null,
    },
    mrName: {
      type: String,
      trim: true,
      default: null,
    },
    // ───────────────────────────────────────────────────────────────────────
    paymentMethod: {
      type: String,
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
  },
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ sourceAccount: 1 });
expenseSchema.index({ createdAt: -1 });
expenseSchema.index({ mrId: 1 });

// Updated pre-save hook to allow zero amounts but prevent negative amounts
expenseSchema.pre("save", function (next) {
  if (this.amount < 0) {
    next(new Error("Amount cannot be negative"));
  } else {
    next();
  }
});

export default mongoose.model("Expense", expenseSchema);
