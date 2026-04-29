import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    categoryType: {
      type: String,
      required: true,
    },
    sourceAccount: {
      type: String,
    },
    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
    },
    destination: {
      type: String,
    },
    destinationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
    },
    supplier: {
      type: String,
    },
    date: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    exchangeLoss: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    accountType: {
      type: String,
      enum: ["Cash Balance", "Personal Account", "Company Account"],
      required: true,
    },
    remarks: {
      type: String,
    },
    description: {
      type: String,
    },
    invoiceNo: {
      type: String,
      default: "NA",
    },
    invoiceDate: {
      type: Date,
    },
    customerName: {
      type: String,
    },
    customerAddress: {
      type: String,
    },
    transactionType: {
      type: String,
      enum: [
        "sale",
        "deposit",
        "withdraw",
        "remittance",
        "payment inward",
        "payment outward",
        "cash sale",
        "credit collection",
      ],
      required: true,
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
    // ✅ New flag to identify payroll-related transactions
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
  },
  {
    timestamps: true,
  },
);

// Indexes
transactionSchema.index({ invoiceNo: 1 });
transactionSchema.index({ date: 1 });
transactionSchema.index({ accountType: 1 });
transactionSchema.index({ isPayroll: 1 });
transactionSchema.index({ payrollCode: 1 });
transactionSchema.index({ payrollId: 1 });

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
