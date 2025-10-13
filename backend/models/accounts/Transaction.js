// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: false,
      trim: true,
    },
    categoryType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CategoryType", // ✅ Corrected
      required: true,
    },
    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination", // ✅ Ensure you have an Account model
      required: false,
       default: null,
    },
    destination: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination", // ✅ Same here
      required: true,
      default: null,
    },
    date: {
      type: Date,
      required: true,
    },
    invoiceDate: {
      type: Date,
      required: false,
    },
    customerName: {
      type: String,
      required: false,
      trim: true,
    },
    customerAddress: {
      type: String,
      trim: false,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    exchangeLoss: {
      type: Number,
      default: 0,
      min: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    accountType: {
      type: String,
      enum: ["Cash Balance", "Personal Account", "Company Account"],
      required: true,
    },
    description: {
      type: String,
      trim: true,
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

// Indexes
transactionSchema.index({ invoiceNumber: 1 });
transactionSchema.index({ accountType: 1 });
transactionSchema.index({ date: -1 });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;
