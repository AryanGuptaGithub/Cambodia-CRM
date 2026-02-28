import mongoose from "mongoose";

const productInHandSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  productName: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  assignedQuantity: { type: Number, default: 0 },

  lc: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

const stockInMRHandSchema = new mongoose.Schema(
  {
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
    },
    mrName: { type: String, required: true },
    productsInHand: [productInHandSchema],
  },
  { timestamps: true }
);

export default mongoose.model("StockInMRHand", stockInMRHandSchema);
