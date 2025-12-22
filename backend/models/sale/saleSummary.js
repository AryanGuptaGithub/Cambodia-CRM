import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

// Product Subschema
const productSchema = new Schema({
  productName: { type: String, required: true },
  originalProductName: { type: String }, // Store the original name from import
  salesQty: { type: Number, required: true }, // Allow negative for returns
  bonusQty: { type: Number, default: 0 },
  totalQty: { type: Number, required: true },
  sellingPrice: { type: Number, required: true, min: 0, set: roundToTwo },
  amount: { type: Number, required: true, set: roundToTwo },
  discount: { type: Number, default: 0, min: 0, set: roundToTwo },
  netSellingAmount: { type: Number, required: true, set: roundToTwo },
  averageUnitPrice: { type: Number, required: true, set: roundToTwo },
  lc: { type: Number, required: true, set: roundToTwo },
  profitLoss: { type: Number, default: 0, set: roundToTwo },
  isProductAccept: { type: Boolean, default: true },
  isExchangeProduct: { type: Boolean, default: false },
  isReturnProduct: { type: Boolean, default: false },
});

// Sale Summary Schema
const saleSummarySchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true, trim: true, unique: true },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true, trim: true },
    mrId: {
      type: Schema.Types.ObjectId,
      ref: "Staff",
      required: false,
    },
    customerName: { type: String, required: true, trim: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: false, // Changed to false for imports
    },
    customerCode: { type: String, trim: true },
    products: [productSchema],
    creditDays: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date },
    deliveryDate: { type: Date },
    paidAmount: { type: Number, default: 0, min: 0, set: roundToTwo },
    dueAmount: { type: Number, default: 0, set: roundToTwo },
    totalAmount: { type: Number, required: true, set: roundToTwo },
    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid", "Paid", "Return"],
      default: "Credit",
    },
    remark: { type: String, default: "", trim: true },
    isExchange: { type: Boolean, default: false },
    isReturn: { type: Boolean, default: false },
    importBatchId: { type: Number },
    importStatus: { type: String, default: "pending" },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });
saleSummarySchema.index({ customerId: 1, invoiceDate: -1 });
saleSummarySchema.index({ mrId: 1, recordingDate: -1 });
saleSummarySchema.index({ isExchange: 1 });
saleSummarySchema.index({ isReturn: 1 });
saleSummarySchema.index({ paymentStatus: 1 });

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);
export default SaleSummary;