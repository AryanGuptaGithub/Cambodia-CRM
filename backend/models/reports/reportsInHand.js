// In your ReportInHand model (models/reports/reportsInHand.js)
import mongoose from "mongoose";

const ReportInHandSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierName: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    batches: [
      {
        boxes: {
          type: Number,
          default: 0,
        },
        lc: {
          type: Number,
          default: 0,
        },
        fob: {
          type: Number,
          default: 0,
        },
        cif: {
          type: Number,
          default: 0,
        },
        amount: {
          type: Number,
          default: 0,
        },
        expiryDate: {
          type: Date,
        },
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    totalBoxes: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    averagePrice: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Out of Stock", "Critical", "Low Stock", "In Stock"],
      default: "In Stock",
    },
    minStockLevel: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true }
);

export default mongoose.model("ReportInHand", ReportInHandSchema);