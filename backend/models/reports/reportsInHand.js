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
      piecesPerBox: {
        type: Number,
        default: 0,
        min: 0,
      },
      totalPieces: {
        type: Number,
        default: 0,
        min: 0,
      },
    },
    status: {
      type: String,
      enum: ['In Stock', 'Low Stock', 'Critical', 'Out of Stock'],
      default: 'In Stock'
    },
    category: {
      type: String,
      trim: true,
      default: "Uncategorized"
    },
    pricePerPiece: {
      type: Number,
      default: 0,
      min: 0
    },
    pricePerBox: {
      type: Number,
      default: 0,
      min: 0
    },
    minStockLevel: {
      type: Number,
      default: 10,
      min: 0
    },
    // New fields for LC and FOB
    lc: {
      type: Number,
      default: 0,
      min: 0
    },
    fob: {
      type: Number,
      default: 0,
      min: 0
    },
    cif: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  {
    timestamps: true,
  }
);

// Calculate total pieces before saving
reportInHandSchema.pre("save", function (next) {
  if (this.quantity.boxes && this.quantity.piecesPerBox) {
    this.quantity.totalPieces = this.quantity.boxes * this.quantity.piecesPerBox;
  }
  
  // Auto-calculate status based on total pieces
  if (this.quantity.totalPieces !== undefined) {
    if (this.quantity.totalPieces === 0) {
      this.status = 'Out of Stock';
    } else if (this.quantity.totalPieces < 10) {
      this.status = 'Critical';
    } else if (this.quantity.totalPieces < 25) {
      this.status = 'Low Stock';
    } else {
      this.status = 'In Stock';
    }
  }
  
  next();
});

export default mongoose.model("ReportInHand", reportInHandSchema);