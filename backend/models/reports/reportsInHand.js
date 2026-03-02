import mongoose from "mongoose";

const ReportInHandSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    supplierName: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      trim: true,
    },
    batches: [
      {
        boxes: {
          type: Number,
          default: 0,
        },
        lc: {
          type: Number,
          default: 0,
        },
        fob: {
          type: Number,
          default: 0,
        },
        cif: {
          type: Number,
          default: 0,
        },
        amount: {
          type: Number,
          default: 0,
        },
        expiryDate: {
          type: Date,
        },
        date: {
          type: Date,
          default: Date.now,
        },
        adjustmentType: {
          type: String,
          enum: ["batch", "add", "remove"],
          default: "batch",
        },
        adjustmentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "StockAdjustment",
        },
      },
    ],
    totalBoxes: {
      type: Number,
      default: 0,
    },
    totalBoxesFromBatches: {
      type: Number,
      default: 0,
    },
    addStockAdjustment: {
      type: Number,
      default: 0,
    },
    removeStockAdjustment: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    averagePrice: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Out of Stock", "Critical", "Low Stock", "In Stock"],
      default: "In Stock",
    },
    minStockLevel: {
      type: Number,
      default: 10,
    },
  },
  { timestamps: true },
);

// Calculate totals before saving
ReportInHandSchema.pre("save", function (next) {
  // Total boxes from real batches only
  const batchBoxes = this.batches
    .filter((batch) => batch.adjustmentType === "batch")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);

  this.totalBoxesFromBatches = batchBoxes;

  // Adjustment totals
  this.addStockAdjustment = this.batches
    .filter((batch) => batch.adjustmentType === "add")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);

  this.removeStockAdjustment = this.batches
    .filter((batch) => batch.adjustmentType === "remove")
    .reduce((sum, batch) => sum + (batch.boxes || 0), 0);

  // Total boxes (batches + add adjustments − remove adjustments)
  this.totalBoxes =
    this.totalBoxesFromBatches +
    this.addStockAdjustment -
    this.removeStockAdjustment;

  // Total amount and average price from real batches only
  const batchEntries = this.batches.filter(
    (batch) => batch.adjustmentType === "batch",
  );
  const totalBatchAmount = batchEntries.reduce(
    (sum, batch) => sum + (batch.amount || 0),
    0,
  );
  const totalBatchBoxes = batchEntries.reduce(
    (sum, batch) => sum + (batch.boxes || 0),
    0,
  );

  this.totalAmount = totalBatchAmount;
  this.averagePrice =
    totalBatchBoxes > 0 ? totalBatchAmount / totalBatchBoxes : 0;

  next();
});

export default mongoose.model("ReportInHand", ReportInHandSchema);
