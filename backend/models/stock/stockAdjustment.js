import mongoose from "mongoose";

const stockAdjustmentSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    boxQuantity: {
      type: Number,
      required: true,
    },
    totalQuantity: {
      type: Number,
      required: true,
    },
    adjustmentType: {
      type: String,
      enum: ["add", "remove", "deduct"],
      required: true,
    },
    remarks: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

export default mongoose.model("StockAdjustment", stockAdjustmentSchema);