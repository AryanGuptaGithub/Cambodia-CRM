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
  productCost: { type: Number, default: 0 },
});

const stockTransferToMRSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    transferType: { type: String, enum: ["send", "receive"], required: true },

    stockTransferToMr: { type: String, default: "" },
    stockTransferFromMrToMain: { type: String, default: "" },

    // ✅ FIX: mrId was missing — required by route for MR stock recompute
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

// ── Pre-save: calculate costs ─────────────────────────────────────────────────
stockTransferToMRSchema.pre("save", async function (next) {
  try {
    let totalCost = 0;
    for (const item of this.items) {
      if (!item.lc && item.productId) {
        const Product = mongoose.model("Product");
        const product = await Product.findById(item.productId);
        if (product) item.lc = product.lc || product.costPrice || 0;
      }
      const rawCost = (item.lc || 0) * (item.boxQuantity || 0);
      item.productCost = Math.ceil(rawCost);
      totalCost += item.productCost;
    }
    this.totalTransferCost = Math.ceil(totalCost);
    next();
  } catch (error) {
    next(error);
  }
});

// ── Pre-update: calculate costs ───────────────────────────────────────────────
stockTransferToMRSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    const processItems = async (items) => {
      let totalCost = 0;
      for (const item of items) {
        if (!item.lc && item.productId) {
          const Product = mongoose.model("Product");
          const product = await Product.findById(item.productId);
          if (product) item.lc = product.lc || product.costPrice || 0;
        }
        const rawCost = (item.lc || 0) * (item.boxQuantity || 0);
        item.productCost = Math.ceil(rawCost);
        totalCost += item.productCost;
      }
      return Math.ceil(totalCost);
    };

    if (update.$set?.items) {
      update.$set.totalTransferCost = await processItems(update.$set.items);
    }
    if (update.items) {
      update.totalTransferCost = await processItems(update.items);
    }

    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("StockTransferToMR", stockTransferToMRSchema);
