import mongoose from "mongoose";

const productInHandSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  productName: { type: String, default: "" },
  quantity: { type: Number, default: 0 }, // remaining boxes with MR
  assignedQuantity: { type: Number, default: 0 }, // total ever sent (never decrements)
  lc: { type: Number, default: 0 }, // landing cost per box
  amount: { type: Number, default: 0 }, // lc * quantity  (exact, e.g. 193.766)
  productCost: { type: Number, default: 0 }, // Math.ceil(amount) (e.g. 194)
  lastUpdated: { type: Date, default: Date.now },
});

const StockInMRHandSchema = new mongoose.Schema(
  {
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
    mrName: { type: String, default: "" },
    productsInHand: [productInHandSchema],
    totalAmount: { type: Number, default: 0 }, // sum of all product amounts
    totalProductCost: { type: Number, default: 0 }, // sum of all product productCosts
  },
  { timestamps: true },
);

// Pre-save: recalculate amount and productCost per product, then sum document totals
StockInMRHandSchema.pre("save", function (next) {
  let totalAmount = 0;
  let totalProductCost = 0;

  for (const product of this.productsInHand) {
    const lc = product.lc || 0;
    const qty = product.quantity || 0;

    product.amount = lc * qty; // exact
    product.productCost = Math.ceil(product.amount); // ceiled

    totalAmount += product.amount;
    totalProductCost += product.productCost;
  }

  this.totalAmount = totalAmount;
  this.totalProductCost = totalProductCost;

  next();
});

// ✅ Safe export: use existing model if already defined
const StockInMRHand =
  mongoose.models.StockInMRHand ||
  mongoose.model("StockInMRHand", StockInMRHandSchema);

export default StockInMRHand;
