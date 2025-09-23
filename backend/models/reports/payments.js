import mongoose from "mongoose";

const paymentReportSchema = new mongoose.Schema({
  recordingDate: Date,
  invoiceNumber: String,
  invoiceDate: Date,
  deliveryDate: Date,
  staffName: String,
  customerCode: String,
  numberOfProduct: Number,
  totalQty: Number,
  totalAmount: Number,
  collected: Number,
  remainingAmount: Number,
  cashCollection: Number,
  balance: Number,
  remark: String,
}, { timestamps: true });

export default mongoose.model("PaymentReport", paymentReportSchema);
