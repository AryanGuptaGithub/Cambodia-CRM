import mongoose from "mongoose";

const productInMR = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, default: 0 }, // Changed from boxQuantity to quantity for consistency
  lc: { type: Number, default: 0 }, // Landed cost value
  lastUpdated: { type: Date, default: Date.now }
});

const stockInMRHandSchema = new mongoose.Schema(
  {
    mrId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Staff", 
      required: true 
    },
    mrName: { type: String, required: true },
    productsInHand: [productInMR], 
  },
  { timestamps: true }
);

stockInMRHandSchema.index({ mrId: 1 }, { unique: true });

export default mongoose.model("StockInMRHand", stockInMRHandSchema);