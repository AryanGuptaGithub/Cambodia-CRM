import mongoose from "mongoose";

const productInHandSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: { type: String, default: "" },
  quantity: { type: Number, default: 0 },
  assignedQuantity: { type: Number, default: 0 },
  lc: { type: Number, default: 0 },
  amount: { type: Number, default: 0 },
  productCost: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

const StockInMRHandSchema = new mongoose.Schema(
  {
    mrId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
    mrName: { type: String, default: "" },
    productsInHand: [productInHandSchema],
    totalAmount: { type: Number, default: 0 },
    totalProductCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Pre-save hook to recalculate amounts
StockInMRHandSchema.pre("save", function (next) {
  let totalAmount = 0;
  let totalProductCost = 0;

  for (const product of this.productsInHand) {
    const lc = product.lc || 0;
    const qty = product.quantity || 0;

    product.amount = lc * qty;
    product.productCost = Math.ceil(product.amount);

    totalAmount += product.amount;
    totalProductCost += product.productCost;
  }

  this.totalAmount = totalAmount;
  this.totalProductCost = totalProductCost;

  next();
});

// ✅ Safe export – reuse existing model if already compiled
const stockInMRHand =
  mongoose.models.stockInMRHand || mongoose.model("stockInMRHand", StockInMRHandSchema);

export default stockInMRHand;