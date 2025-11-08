import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

// Product Subschema
const productSchema = new Schema({
  productName: { type: String, required: true },
  salesQty: { type: Number, required: true },
  bonusQty: { type: Number, default: 0 },
  totalQty: { type: Number, required: true },
  sellingPrice: { type: Number, required: true, set: roundToTwo },
  amount: { type: Number, required: true, set: roundToTwo },
  discount: { type: Number, default: 0, set: roundToTwo },
  netSellingAmount: { type: Number, required: true, set: roundToTwo },
  averageUnitPrice: { type: Number, required: true, set: roundToTwo },
  lc: { type: Number, required: true, set: roundToTwo },
  profitLoss: { type: Number, default: 0, set: roundToTwo },
  isProductAccept: { type: Boolean, default: true },
});

// Sale Summary Schema
const saleSummarySchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true },
    mrId: { type: String },
    customerName: { type: String, required: true }, // ✅ Corrected
    customerId: { type: String },

    products: [productSchema],

    creditDays: { type: Number, default: null },
    dueDate: { type: Date },
    deliveryDate: { type: Date },
    paidAmount: { type: Number, default: 0, set: roundToTwo },
    dueAmount: { type: Number, default: 0, set: roundToTwo },
    totalAmount: { type: Number, required: true, set: roundToTwo },

    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid", "Overdue"],
      default: "Credit",
    },

    remark: { type: String, default: "" },
  },
  { timestamps: true }
);

saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);

export default SaleSummary;
