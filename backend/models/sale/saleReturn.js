import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

const salesReturnSchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true },
    customerName: { type: String, required: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    productName: { type: String, required: true },
    salesQty: { type: Number, required: true, min: 0 },
    returnQuantity: { type: Number, required: true, min: 0 },
    usedQty: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0, set: roundToTwo },
    amount: { type: Number, required: true, set: roundToTwo },
    discount: { type: Number, default: 0, min: 0, set: roundToTwo },
    netSellingAmount: { type: Number, required: true, set: roundToTwo },
    usedPrice: { type: Number, required: true, set: roundToTwo },
    usedAmount: { type: Number, required: true, set: roundToTwo },

    totalAmount: { type: Number, required: true, set: roundToTwo },
    paidAmount: { type: Number, required: true, set: roundToTwo },
    dueAmount: { type: Number, required: true, set: roundToTwo },

    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid"],
      required: true,
    },
    remark: { type: String, default: "" },
  },
  { timestamps: true }
);

salesReturnSchema.index({ invoiceNumber: 1, productName: 1, customerId: 1 });

const SalesReturn = mongoose.model("SalesReturn", salesReturnSchema);

export default SalesReturn;