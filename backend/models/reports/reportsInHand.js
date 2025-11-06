import mongoose from "mongoose";

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
    },
    quantity: {
      boxes: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    status: {
      type: String,
      enum: ["In Stock", "Low Stock", "Critical", "Out of Stock"],
      default: "In Stock",
    },
    category: {
      type: String,
      trim: true,
      default: "Uncategorized",
    },

    minStockLevel: {
      type: Number,
      default: 10,
      min: 0,
    },
    // New fields for LC and FOB
    lc: {
      type: Number,
      default: 0,
      min: 0,
    },
    fob: {
      type: Number,
      default: 0,
      min: 0,
    },
    cif: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-calculate status based on boxes quantity
reportInHandSchema.pre("save", function (next) {
  const boxes = this.quantity.boxes || 0;

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
