import mongoose from "mongoose";

const profitLossSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
    },
    expense: {
      type: Number,
      required: true,
      min: 0,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    category: {
      type: String,
      enum: ["sales", "service", "refund", "other"],
      default: "sales",
    },
    status: {
      type: String,
      enum: ["completed", "pending", "cancelled"],
      default: "completed",
    },
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
profitLossSchema.index({ date: -1 });
profitLossSchema.index({ orderId: 1 });
export default mongoose.model("ProfitLoss", profitLossSchema);
