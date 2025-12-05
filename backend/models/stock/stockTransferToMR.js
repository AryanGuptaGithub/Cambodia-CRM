import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: String,
  boxQuantity: { type: Number, required: true, default: 0 },
  lc: { type: Number, required: true, default: 0 }, // Landed cost per box
  productCost: { type: Number, default: 0 }, // Math.ceil(lc * boxQuantity)
});

const stockTransferToMRSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    transferType: { type: String, enum: ["send", "receive"], required: true },

    stockTransferToMr: { type: String, default: "" },
    stockTransferFromMrToMain: { type: String, default: "" },

    items: [itemSchema],
    
    remarks: { type: String, default: "" }, // Added remarks field

    // Total cost fields
    totalTransferCost: { type: Number, default: 0 }, // Sum of all productCost
  },
  { timestamps: true }
);

// Pre-save middleware to calculate costs
stockTransferToMRSchema.pre("save", async function (next) {
  try {
    let totalCost = 0;

    // Calculate cost for each item
    for (const item of this.items) {
      // If lc is not provided, fetch it from Product
      if (!item.lc && item.productId) {
        const Product = mongoose.model("Product");
        const product = await Product.findById(item.productId);
        if (product) {
          item.lc = product.lc || product.costPrice || 0;
        }
      }

      // Calculate product cost with Math.ceil
      const rawCost = (item.lc || 0) * (item.boxQuantity || 0);
      item.productCost = Math.ceil(rawCost);
      totalCost += item.productCost;
    }

    // Also apply Math.ceil to totalTransferCost for consistency
    this.totalTransferCost = Math.ceil(totalCost);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-update middleware for findOneAndUpdate operations
stockTransferToMRSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    if (update.$set && update.$set.items) {
      let totalCost = 0;

      for (const item of update.$set.items) {
        // If lc is not provided, fetch it from Product
        if (!item.lc && item.productId) {
          const Product = mongoose.model("Product");
          const product = await Product.findById(item.productId);
          if (product) {
            item.lc = product.lc || product.costPrice || 0;
          }
        }

        // Calculate product cost with Math.ceil
        const rawCost = (item.lc || 0) * (item.boxQuantity || 0);
        item.productCost = Math.ceil(rawCost);
        totalCost += item.productCost;
      }

      // Apply Math.ceil to totalTransferCost
      update.$set.totalTransferCost = Math.ceil(totalCost);
    }
    
    // Also handle direct updates to items array
    if (update.items) {
      let totalCost = 0;

      for (const item of update.items) {
        // If lc is not provided, fetch it from Product
        if (!item.lc && item.productId) {
          const Product = mongoose.model("Product");
          const product = await Product.findById(item.productId);
          if (product) {
            item.lc = product.lc || product.costPrice || 0;
          }
        }

        // Calculate product cost with Math.ceil
        const rawCost = (item.lc || 0) * (item.boxQuantity || 0);
        item.productCost = Math.ceil(rawCost);
        totalCost += item.productCost;
      }

      update.totalTransferCost = Math.ceil(totalCost);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("StockTransferToMR", stockTransferToMRSchema);