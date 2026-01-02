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
      required: true, // Added required back as per your frontend validation
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01, // Changed from 0 to 0.01 to ensure positive amount
      validate: {
        validator: function(v) {
          return v > 0;
        },
        message: 'Amount must be greater than 0'
      }
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Destination",
      required: true,
    },
    // Optional fields (you can add these later)
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
  }
);

// Index for better query performance
expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1 });
expenseSchema.index({ sourceAccount: 1 });
expenseSchema.index({ createdAt: -1 });

// Pre-save middleware to ensure amount is positive
expenseSchema.pre('save', function(next) {
  if (this.amount <= 0) {
    next(new Error('Amount must be greater than 0'));
  } else {
    next();
  }
});

export default mongoose.model("Expense", expenseSchema);