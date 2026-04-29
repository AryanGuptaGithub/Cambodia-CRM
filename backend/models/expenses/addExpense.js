import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },
    categoryType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
    },
    amount: {
      type: Number,
      required: true,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    exchangeLoss: {
      type: Number,
      default: 0,
    },
    description: {
      type: String,
    },
    remarks: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
    },
    reference: {
      type: String,
    },
    transactionType: {
      type: String,
      enum: ["payment outward", "deposit", "withdraw", "expense"],
      default: "expense",
    },
    accountType: {
      type: String,
      enum: ["Cash Balance", "Personal Account", "Company Account"],
      default: "Company Account",
    },
    importStatus: {
      type: String,
      enum: ["pending", "imported", "failed"],
      default: "pending",
    },
    importErrors: {
      type: [String],
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
    // For MR-related expenses
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
    },
    mrName: {
      type: String,
    },
    // For payroll linking
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
    },
    sources: [
      {
        accountId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Destination",
        },
        accountName: String,
        amount: Number,
        finalAmount: Number,
      },
    ],
    // ✅ New flag to identify payroll-related expenses
    isPayroll: {
      type: Boolean,
      default: false,
    },
    payrollCode: {
      type: String,
      default: null,
    },
    payrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payroll",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    period: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
expenseSchema.index({ isPayroll: 1 });
expenseSchema.index({ payrollCode: 1 });
expenseSchema.index({ payrollId: 1 });
expenseSchema.index({ employeeId: 1 });
expenseSchema.index({ date: 1 });

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;
