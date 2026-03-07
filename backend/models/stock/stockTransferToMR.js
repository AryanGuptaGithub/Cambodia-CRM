import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Item sub-schema  (one product line inside a transfer)
// NEW: sellingPrice — fetched from the matching ReportInHand batch and stored
//      here so the transfer record is self-contained for reporting.
// ─────────────────────────────────────────────────────────────────────────────
const itemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  productName: { type: String, default: "" },

  boxQuantity: { type: Number, required: true, default: 0 },
  lc: { type: Number, required: true, default: 0 },

  // sellingPrice from the ReportInHand batch (passed in by the route)
  sellingPrice: { type: Number, default: 0 },

  // amount = lc * boxQuantity  (calculated in pre-save / route)
  amount: { type: Number, default: 0 },

  // productCost = ceil(amount)  — whole-number for display/totalling
  productCost: { type: Number, default: 0 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main transfer schema
// ─────────────────────────────────────────────────────────────────────────────
const stockTransferToMRSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    transferType: {
      type: String,
      enum: ["send", "receive"],
      required: true,
    },

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
  { timestamps: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Calculate costs for every item in-place.
// Sets  item.lc (from Product master if missing),
//       item.amount      = lc * boxQuantity,
//       item.productCost = ceil(amount)
// Returns the summed totalTransferCost.
// NOTE: sellingPrice is NOT recalculated here — it is set by the route before
//       the document is saved (fetched from ReportInHand batches).
// ─────────────────────────────────────────────────────────────────────────────
const calculateItemCosts = async (items) => {
  let totalCost = 0;

  for (const item of items) {
    // Resolve LC from Product master when the route didn't provide it
    if (!item.lc && item.productId) {
      const ProductModel = mongoose.model("Product");
      const product = await ProductModel.findById(item.productId);
      if (product) {
        item.lc = product.lc || product.costPrice || 0;
      }
    }

    const lc = item.lc || 0;
    const qty = item.boxQuantity || 0;

    item.amount = lc * qty; // exact
    item.productCost = Math.ceil(item.amount); // whole number

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
// Pre-findOneAndUpdate hook
// ─────────────────────────────────────────────────────────────────────────────
stockTransferToMRSchema.pre("findOneAndUpdate", async function (next) {
  try {
    const update = this.getUpdate();

    if (update.$set?.items) {
      update.$set.totalTransferCost = await calculateItemCosts(
        update.$set.items,
      );
    } else if (update.items) {
      update.totalTransferCost = await calculateItemCosts(update.items);
    }

    next();
  } catch (error) {
    next(error);
  }
});

export default mongoose.model("StockTransferToMR", stockTransferToMRSchema);
