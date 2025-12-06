import mongoose from "mongoose";

const stockTransferSchema = new mongoose.Schema(
  {
    invoiceNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: {
          type: String,
          required: true,
        },
        boxQuantity: {
          type: Number,
          required: true,
          min: 0,
        },
        quantity: {
          boxes: { type: Number, default: 0 },
          strips: { type: Number, default: 0 },
          pieces: { type: Number, default: 0 },
          totalPieces: { type: Number, default: 0 },
        },
        expenses: {
          type: Number,
          required: true,
          min: 0,
        },
        lc: {
          type: Number,
          required: true,
          min: 0,
          default: 0,
        },
      },
    ],
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      required: true,
    },
    transferType: {
      type: String,
      required: true,
      enum: ["send", "receive"],
      default: "send",
    },
    shipping: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalExpenses: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    destination: {
      type: String,
      trim: true,
      default: "",
    },
    source: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Generate invoice number method
stockTransferSchema.statics.generateInvoiceNo = async function () {
  const lastTransfer = await this.findOne({}, {}, { sort: { createdAt: -1 } });

  let lastNumber = 0;
  if (lastTransfer && lastTransfer.invoiceNo) {
    const match = lastTransfer.invoiceNo.match(/\d+/);
    lastNumber = match ? parseInt(match[0]) : 0;
  }

  const nextNumber = lastNumber + 1;
  return `ST-${String(nextNumber).padStart(4, "0")}`;
};

stockTransferSchema.index({ invoiceNo: 1 });
stockTransferSchema.index({ date: -1 });
stockTransferSchema.index({ status: 1 });
stockTransferSchema.index({ transferType: 1 });
stockTransferSchema.index({ destination: 1 });
stockTransferSchema.index({ source: 1 });

const StockTransfer = mongoose.model("StockTransfer", stockTransferSchema);

export default StockTransfer;
