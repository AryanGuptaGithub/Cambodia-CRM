import mongoose from "mongoose";

const stockItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },

  productName: {
    type: String,
    required: true,
    trim: true,
  },

  boxQuantity: {
    type: Number,
    required: true,
    min: 1,
  },
});

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

    destination: {
      type: String,
      required: true,
      trim: true,
    },

    items: {
      type: [stockItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one item is required.",
      },
    },
  },
  { timestamps: true }
);

export default mongoose.model("StockTransferToMR", stockTransferSchema);
