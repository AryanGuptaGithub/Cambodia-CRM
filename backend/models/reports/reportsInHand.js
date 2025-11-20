import mongoose from "mongoose";

const batchSchema = new mongoose.Schema({
  boxes: { type: Number, required: true, min: 0 },
  lc: { type: Number, required: true, min: 0 },
  fob: { type: Number, required: true, min: 0 },
  cif: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date },
  date: { type: Date, default: Date.now },
});

const reportInHandSchema = new mongoose.Schema(
  {
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
      unique: true, // One document per product
    },

    // multiple purchase batches
    batches: {
      type: [batchSchema],
      default: [],
    },

    // total stock from all batches
    totalBoxes: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ["In Stock", "Low Stock", "Critical", "Out of Stock"],
      default: "In Stock",
    },

    minStockLevel: {
      type: Number,
      default: 10,
      min: 0,
    },
  },
  { timestamps: true }
);

// Auto-update status before saving
reportInHandSchema.pre("save", function (next) {
  const boxes = this.totalBoxes || 0;

  if (boxes === 0) {
    this.status = "Out of Stock";
  } else if (boxes < 5) {
    this.status = "Critical";
  } else if (boxes < 15) {
    this.status = "Low Stock";
  } else {
    this.status = "In Stock";
  }

  next();
});

export default mongoose.model("ReportInHand", reportInHandSchema);
