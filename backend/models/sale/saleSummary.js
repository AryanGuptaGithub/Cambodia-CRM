// models/SaleSummary.js

import mongoose from "mongoose";
const { Schema } = mongoose;

const saleSummarySchema = new Schema({
  recordingDate: { type: Date, required: true },
  invoiceNumber: { type: String, required: true },
  invoiceDate: { type: Date, required: true },
  mrName: { type: String, required: true },
  customerCode: { type: String, required: true },
  productName: { type: String, required: true },
  salesQty: { type: Number, required: true },
  bonusQty: { type: Number, default: 0 },
  totalQty: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  amount: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  netSellingAmount: { type: Number, required: true },
  averageUnitPrice: { type: Number, required: true },
  profitLoss: { type: Number, default: 0 },
  creditDays: { type: Number, default: null },
  dueDate: { type: Date },
  deliveryDate: { type: Date },
  paymentStatus: { type: String, enum: ["Paid", "Unpaid", "Pending", "Overdue"], default: "Pending" },
  remark: { type: String, default: "" },
}, {
  timestamps: true, // adds createdAt and updatedAt
});

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);
export default SaleSummary;
