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
  averageUnitPrice: { type: Number, set: roundToTwo },
  lc: { type: Number, default: 0, set: roundToTwo },
  profitLoss: { type: Number, set: roundToTwo },
  isProductAccept: { type: Boolean, default: true },
  returnQuantity: { type: Number, default: 0, min: 0 }, // NEW: For returns
  usedQty: { type: Number, default: 0, min: 0 }, // NEW: For returns
  usedPrice: { type: Number, default: 0, set: roundToTwo }, // NEW: For returns
  usedAmount: { type: Number, default: 0, set: roundToTwo }, // NEW: For returns
});

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
    
    // Products array like in Sales
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
    },
    remark: { type: String, default: "" },
  },
  { timestamps: true }
);

salesReturnSchema.index({ invoiceNumber: 1, customerId: 1 });

const SalesReturn = mongoose.model("SalesReturn", salesReturnSchema);

export default SalesReturn;