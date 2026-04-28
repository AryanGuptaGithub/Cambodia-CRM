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
    categoryType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
    },
    remarks: {
      type: String,
      trim: true,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function (v) {
          return v >= 0;
        },
        message: "Amount must be greater than or equal to 0",
      },
    },
    finalAmount: {
      type: Number,
      default: 0,
    },
    exchangeLoss: {
      type: Number,
      default: 0,
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    reference: {
      type: String,
      trim: true,
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
    // ─────────────────────────────────────────────────────────────────
    // NEW: Payroll linking fields
    // ─────────────────────────────────────────────────────────────────
    payrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      default: null,
      index: true,
    },
    payrollCode: {
      type: String,
      default: null,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    period: {
      type: String,
      default: null,
    },
    transactionType: {
      type: String,
      default: "payment outward",
    },
    accountType: {
      type: String,
      default: "Company Account",
    },
    importStatus: {
      type: String,
      default: "imported",
    },
    importErrors: {
      type: Array,
      default: [],
    },
    invoiceNo: {
      type: String,
      default: "NA",
    },
    isConversionLoss: {
      type: Boolean,
      default: false,
    },
    sources: {
      type: Array,
      default: [],
    },
    // ─────────────────────────────────────────────────────────────────
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
expenseSchema.index({ payrollId: 1 });
expenseSchema.index({ payrollCode: 1 });

expenseSchema.pre("save", function (next) {
  if (this.amount < 0) {
    next(new Error("Amount cannot be negative"));
  } else {
    next();
  }
});

export default mongoose.model("Expense", expenseSchema);
