import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    // Invoice details
    invoiceNo: { type: String, default: "NA" },
    invoiceDate: { type: Date },
    customerName: { type: String },
    customerAddress: { type: String },

    // Category type (string, not ObjectId)
    categoryType: {
      type: String,
      enum: ["withdraw", "deposit", "tour collection"],
      required: true,
    },

    // Source account (stores the account name as a string)
    sourceAccount: { type: String, required: true },
    // Destination (string, default "--")
    destination: { type: String, default: "--" },

    // Supplier (string, optional)
    supplier: { type: String },

    // Monetary fields
    amount: { type: Number, required: true },
    exchangeLoss: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    // Dates
    date: { type: Date, required: true },

    // Description / remarks
    description: { type: String },
    remarks: { type: String, default: "" },

    // Transaction classification (expense, deposit, etc.)
    transactionType: {
      type: String,
      enum: [
        "expense",
        "deposit",
        "withdraw",
        "remittance",
        "payment inward",
        "payment outward",
        "cash sale",
        "credit collection",
        "tour collection",
        "sale",
      ],
      required: true,
    },

    // Account type (tab name: "Cash Balance", "Personal Account", "Company Account")
    accountType: { type: String, required: true },

    // Reference to expense (for expense transactions)
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Expense",
    },

    // Import metadata (for bulk imports)
    importBatchId: { type: String },
    importStatus: { type: String, enum: ["pending", "imported", "failed"] },

    // User who created/imported
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

// Indexes for better query performance
transactionSchema.index({ date: -1 });
transactionSchema.index({ invoiceNo: 1 });
transactionSchema.index({ categoryType: 1 });
transactionSchema.index({ sourceAccount: 1 });
transactionSchema.index({ destination: 1 });
transactionSchema.index({ accountType: 1 });
transactionSchema.index({ transactionType: 1 });

export default mongoose.model("Transaction", transactionSchema);
