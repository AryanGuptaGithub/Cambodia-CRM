import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: String,
  boxQuantity: { type: Number, required: true, default: 0 },
  lc: { type: Number, required: true, default: 0 },
  // amount = lc * boxQuantity (auto-calculated in pre-save hooks)
  amount: { type: Number, default: 0 },
  productCost: { type: Number, default: 0 },
});

const stockTransferToMRSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    transferType: { type: String, enum: ["send", "receive"], required: true },

    stockTransferToMr: { type: String, default: "" },
    stockTransferFromMrToMain: { type: String, default: "" },

    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },

    items: [itemSchema],
    remarks: { type: String, default: "" },
    totalTransferCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Calculate costs for a list of items.
// Sets item.lc (from Product if missing), item.amount = lc * boxQuantity,
// item.productCost = ceil(amount), and returns the total transfer cost.
// ─────────────────────────────────────────────────────────────────────────────
const calculateItemCosts = async (items) => {
  let totalCost = 0;

  for (const item of items) {
    // Resolve LC from Product if not already set
    if (!item.lc && item.productId) {
      const Product = mongoose.model("Product");
      const product = await Product.findById(item.productId);
      if (product) {
        item.lc = product.lc || product.costPrice || 0;
      }
    }

    const lc = item.lc || 0;
    const qty = item.boxQuantity || 0;

    // amount = lc * boxQuantity (exact, not rounded)
    item.amount = lc * qty;

    // productCost = ceil(amount) for display/totalling
    item.productCost = Math.ceil(item.amount);

    totalCost += item.productCost;
  }

  return Math.ceil(totalCost);
};

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook
// ─────────────────────────────────────────────────────────────────────────────
stockTransferToMRSchema.pre("save", async function (next) {
  try {
    this.totalTransferCost = await calculateItemCosts(this.items);
    next();
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-findOneAndUpdate hook – handles both $set operators and direct updates
// ─────────────────────────────────────────────────────────────────────────────
stockTransferToMRSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    // If the update uses $set (e.g., { $set: { items: [...] } })
    if (update.$set?.items) {
      update.$set.totalTransferCost = await calculateItemCosts(
        update.$set.items
      );
    }
    // If the update directly sets the items field (e.g., { items: [...] })
    else if (update.items) {
      update.totalTransferCost = await calculateItemCosts(update.items);
    }

    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("StockTransferToMR", stockTransferToMRSchema);