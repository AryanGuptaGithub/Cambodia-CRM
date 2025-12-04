import mongoose from "mongoose";

const productInMR = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: { type: String, required: true },
  boxQuantity: { type: Number, required: true, default: 0 },
});

const stockInMRHandSchema = new mongoose.Schema(
  {
    mrName: { type: String, required: true, unique: true },
    products: [productInMR],
  },
  { timestamps: true }
);

export default mongoose.model("StockInMRHand", stockInMRHandSchema);