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
      ref: "CategoryType",
      required: true,
    },
    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: function() {
        // Required for: deposit, withdraw, remittance, payment outward
        return ['deposit', 'withdraw', 'remittance', 'payment outward'].includes(this.transactionType);
      },
      default: null,
    },
    destination: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: function() {
        // Required for: deposit, withdraw, payment inward, sales
        return ['deposit', 'withdraw', 'payment inward', 'sale'].includes(this.transactionType);
      },
      default: null,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: function() {
        // Required for: payment inward, remittance, payment outward
        return ['payment inward', 'remittance', 'payment outward'].includes(this.transactionType);
      },
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
      trim: true,
      required: false,
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
      required: false,
    },
    remarks: {
      type: String,
      trim: true,
      required: false,
    },
    transactionType: {
      type: String,
      enum: [
        'deposit', 
        'withdraw', 
        'remittance', 
        'payment inward', 
        'payment outward',
        'sale',
        'cash sale',
        'credit collection'
      ],
      required: true,
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

// Virtual to get category name
transactionSchema.virtual('categoryName').get(function() {
  return this.categoryType?.name;
});

// Indexes
transactionSchema.index({ invoiceNumber: 1 });
transactionSchema.index({ accountType: 1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ transactionType: 1 });
transactionSchema.index({ source: 1 });
transactionSchema.index({ destination: 1 });
transactionSchema.index({ supplier: 1 });

// Ensure virtual fields are serialized
transactionSchema.set('toJSON', { virtuals: true });
transactionSchema.set('toObject', { virtuals: true });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;