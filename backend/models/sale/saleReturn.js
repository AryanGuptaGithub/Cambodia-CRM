import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

// Product sub-schema for the products array
const productSchema = new Schema({
  productName: { type: String, required: true },
  salesQty: { type: Number, required: true, min: 0 },
  bonusQty: { type: Number, default: 0, min: 0 },
  totalQty: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0, set: roundToTwo },
  amount: { type: Number, required: true, set: roundToTwo },
  discount: { type: Number, default: 0, min: 0, set: roundToTwo },
  netSellingAmount: { type: Number, required: true, set: roundToTwo },
  averageUnitPrice: { type: Number, default: 0, set: roundToTwo },
  lc: { type: Number, default: 0, set: roundToTwo },
  profitLoss: { type: Number, default: 0, set: roundToTwo },
  isProductAccept: { type: Boolean, default: true },
  returnQuantity: { type: Number, default: 0, min: 0 },
  usedQty: { type: Number, default: 0, min: 0 },
  usedPrice: { type: Number, default: 0, set: roundToTwo },
  usedAmount: { type: Number, default: 0, set: roundToTwo },
});

const salesReturnSchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true, trim: true },
    customerName: { type: String, required: true, trim: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: "Customer",
      required: false,
    },

    // Products array
    products: [productSchema],

    // Financial fields
    creditDays: { type: Number, default: 0 },
    dueDate: { type: Date },
    deliveryDate: { type: Date },
    paidAmount: { type: Number, default: 0, set: roundToTwo },
    dueAmount: { type: Number, default: 0, set: roundToTwo },
    totalAmount: { type: Number, required: true, set: roundToTwo },

    // Return specific fields
    returnReason: { type: String, default: "" },

    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid", "Paid", "Pending"],
      required: true,
      default: "Pending",
    },
    remark: { type: String, default: "" },
  },
  { timestamps: true },
);

// Compound index for faster lookups
salesReturnSchema.index({ invoiceNumber: 1, customerId: 1 });
salesReturnSchema.index({ invoiceNumber: 1 });
salesReturnSchema.index({ customerId: 1 });
salesReturnSchema.index({ createdAt: -1 });

const SalesReturn = mongoose.model("SalesReturn", salesReturnSchema);

export default SalesReturn;
