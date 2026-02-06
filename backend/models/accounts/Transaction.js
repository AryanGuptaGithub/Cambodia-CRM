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
        const categoryName = this.transactionType?.toLowerCase() || '';
        return ['deposit', 'withdraw', 'remittance', 'payment outward'].includes(categoryName);
      },
      default: null,
    },
    destination: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: function() {
        // Required for: deposit, withdraw, payment inward, cash sale, credit collection
        const categoryName = this.transactionType?.toLowerCase() || '';
        return ['deposit', 'withdraw', 'payment inward', 'cash sale', 'credit collection'].includes(categoryName);
      },
      default: null,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: function() {
        // Required for: payment inward, remittance, payment outward
        const categoryName = this.transactionType?.toLowerCase() || '';
        return ['payment inward', 'remittance', 'payment outward'].includes(categoryName);
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
      required: function() {
        // Required for: cash sale, credit collection
        const categoryName = this.transactionType?.toLowerCase() || '';
        return ['cash sale', 'credit collection'].includes(categoryName);
      },
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
      validate: {
        validator: function(value) {
          // Exchange loss cannot be greater than amount
          return value <= this.amount;
        },
        message: 'Exchange loss cannot be greater than amount'
      }
    },
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: function(value) {
          // finalAmount should equal amount - exchangeLoss
          const expected = this.amount - (this.exchangeLoss || 0);
          return Math.abs(value - expected) < 0.01; // Allow small floating point differences
        },
        message: 'Final amount must equal amount minus exchange loss'
      }
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
        'cash sale',
        'credit collection'
      ],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    importBatchId: {
      type: String,
      required: false,
    },
    importStatus: {
      type: String,
      enum: ['pending', 'imported', 'error'],
      default: 'imported'
    },
    importErrors: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
  }
);

// Middleware to calculate finalAmount before saving
transactionSchema.pre('save', function(next) {
  if (this.isModified('amount') || this.isModified('exchangeLoss')) {
    this.finalAmount = this.amount - (this.exchangeLoss || 0);
  }
  next();
});

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
transactionSchema.index({ importBatchId: 1 });

// Ensure virtual fields are serialized
transactionSchema.set('toJSON', { virtuals: true });
transactionSchema.set('toObject', { virtuals: true });

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;