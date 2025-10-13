// models/ExpenseCategory.js
import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      unique: true,
      maxlength: [100, "Category name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better search performance
expenseCategorySchema.index({ category: 1 });
expenseCategorySchema.index({ isActive: 1 });

// Virtual for formatted category display
expenseCategorySchema.virtual("displayName").get(function () {
  return `${this.category} - ${this.description}`;
});

// Method to update amounts from expenses
expenseCategorySchema.methods.updateAmounts = function (
  yearlyAmount,
  monthlyAmount
) {
  this.amountUntilYear = yearlyAmount || 0;
  this.amountMonthly = monthlyAmount || 0;
  return this.save();
};

// Static method to find active categories
expenseCategorySchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

export default mongoose.model("ExpenseCategory", expenseCategorySchema);
