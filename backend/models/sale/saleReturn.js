// models/SalesReturn.js
import mongoose from "mongoose";

const SalesReturnSchema = new mongoose.Schema(
  {
    recordingDate: { type: String, required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: String, required: true },
    mrName: { type: String, required: true },
    customerCode: { type: String, required: true },
    customerName: { type: String, required: true },
    productName: { type: String, required: true },
    salesQty: { type: Number, required: true },
    returnQuantity: { type: Number, required: true },
    usedQty: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    amount: { type: Number, required: true },
    discount: { type: Number, required: true },
    netSellingAmount: { type: Number, required: true },
    usedPrice: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    dueAmount: { type: Number, required: true },
    usedAmount: { type: Number, required: true },
    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid", "Overdue"],
      default: "Credit",
    },
    remark: { type: String, default: "" },
  },
  {
    timestamps: true,
  }
);

const SalesReturn = mongoose.model("SalesReturn", SalesReturnSchema);

export default SalesReturn;
