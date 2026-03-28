import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    // Invoice details
    invoiceNo: { type: String, default: "NA" },
    invoiceDate: { type: Date },
    customerName: { type: String },
    customerAddress: { type: String },

    // -------------------------------------------------------------------------
    // FIX: categoryType now stores the actual category label string from the
    // CategoryType master (e.g. "Credit Collection", "Cash Sale", "Deposit").
    // Removed the restrictive enum so any label saved in the master is accepted.
    // -------------------------------------------------------------------------
    categoryType: {
      type: String,
      required: true,
      trim: true,
    },

    // Source account (stores the account name as a string)
    sourceAccount: { type: String, default: "--" },

    // Destination (string, default "--")
    destination: { type: String, default: "--" },

    // Supplier (string, optional)
    supplier: { type: String, default: "" },

    // Monetary fields
    amount: { type: Number, required: true },
   // exchangeLoss: { type: Number, default: 0 },
    finalAmount: { type: Number, required: true },

    // Dates
    date: { type: Date, required: true },

    // Description / remarks
    description: { type: String, default: "" },
    remarks: { type: String, default: "" },

    // -------------------------------------------------------------------------
    // FIX: transactionType enum expanded to cover all types used by the app.
    // Values are lowercase and match what the frontend/backend derives from
    // the category label.
    // -------------------------------------------------------------------------
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
        "credit collection", // FIX: was "credit collections" — now singular
        "tour collection",
        "collection",
        "sale",
        "transfer",
      ],
      required: true,
    },

    // Account type (tab name: "Cash Balance", "Personal Account", "Company Account")
    accountType: { type: String, required: true },
     isConversionLoss: { type: Boolean, default: false },

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
