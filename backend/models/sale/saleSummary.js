import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper function to round numeric values to two decimal places
const roundToTwo = (value) => {
  if (typeof value !== "number") return value;
  return Math.round(value * 100) / 100;
};

// Product sub-schema for individual products in a sale
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
  isProductAccept: { type: Boolean, default: true }
});

const saleSummarySchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { 
      type: String, 
      required: true,
      unique: true, 
      index: true
    },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true },
    mrId: { type: String, required: false },
    customerCode: { type: String, required: true },
    customerId: { type: String, required: false },

    // Array of products instead of single product
    products: [productSchema],

    // Common fields for the entire sale
    creditDays: { type: Number, default: null },
    dueDate: { type: Date, required: false },
    deliveryDate: { type: Date, required: false },
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
  {
    timestamps: true,
  }
);

// Create unique index on invoiceNumber
saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });

// Model export
const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);

export default SaleSummary;