import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-schema: one product entry inside an MR's hand stock
// NEW FIELDS:
//   sellingPrice    — passed from the ReportInHand batch via the transfer route
//   assignedQuantity — total ever sent to this MR for this product
//   amount          — lc * quantity  (kept in sync by the route)
//   productCost     — ceil(amount)   (whole-number for reporting)
// ─────────────────────────────────────────────────────────────────────────────
const productInHandSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    productName: {
      type: String,
      required: true,
    },

    // Current boxes remaining in MR's hand
    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    // Total boxes ever assigned (sent) to this MR for this product
    assignedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Landed cost per unit (purchase cost)
    lc: {
      type: Number,
      default: 0,
    },

    // Selling price per unit — sourced from ReportInHand batch at transfer time
    sellingPrice: {
      type: Number,
      default: 0,
    },

    // amount = lc * quantity  (kept in sync by the transfer route)
    amount: {
      type: Number,
      default: 0,
    },

    // productCost = ceil(amount)  — whole-number cost for display/reports
    productCost: {
      type: Number,
      default: 0,
    },

    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true },
);

// ─────────────────────────────────────────────────────────────────────────────
// Main schema: one document per MR
// ─────────────────────────────────────────────────────────────────────────────
const mrStockInHandSchema = new mongoose.Schema(
  {
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
      unique: true,
    },
    mrName: {
      type: String,
      required: true,
    },

    productsInHand: [productInHandSchema],

    // Document-level totals — recomputed by the route after every change
    totalAmount: {
      type: Number,
      default: 0,
    },
    totalProductCost: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: "stockinmrhands",
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────────────────────
mrStockInHandSchema.virtual("totalQuantity").get(function () {
  return this.productsInHand.reduce((sum, p) => sum + (p.quantity || 0), 0);
});

mrStockInHandSchema.virtual("totalProducts").get(function () {
  return this.productsInHand.filter((p) => p.quantity > 0).length;
});

mrStockInHandSchema.set("toJSON", { virtuals: true });
mrStockInHandSchema.set("toObject", { virtuals: true });

// ─────────────────────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────────────────────
mrStockInHandSchema.index({ mrId: 1 });
mrStockInHandSchema.index({ mrName: 1 });
mrStockInHandSchema.index({ "productsInHand.productName": 1 });

export default mongoose.model("MRStockInHand", mrStockInHandSchema);
