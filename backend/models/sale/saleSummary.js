import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

// Calculate profit/loss for a product
const calculateProfitLoss = (sellingPrice, lc, quantity) => {
  const profit = (sellingPrice - lc) * quantity;
  return roundToTwo(profit);
};

// Product Subschema
const productSchema = new Schema({
  productName: { type: String, required: true },
  originalProductName: { type: String },
  salesQty: { type: Number, required: true, set: roundToTwo },
  bonusQty: { type: Number, default: 0, set: roundToTwo },
  totalQty: { type: Number, required: true, set: roundToTwo },
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
}, {
  _id: true
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
      required: false,
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
    // Virtual field for total profit/loss
    totalProfitLoss: { type: Number, default: 0, set: roundToTwo },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Calculate total profit/loss before saving
saleSummarySchema.pre("save", function (next) {
  if (this.products && this.products.length > 0) {
    // Calculate profit/loss for each product
    this.products.forEach(product => {
      if (typeof product.salesQty === 'number' && 
          typeof product.sellingPrice === 'number' && 
          typeof product.lc === 'number') {
        product.profitLoss = calculateProfitLoss(
          product.sellingPrice,
          product.lc,
          product.salesQty
        );
      }
    });
    
    // Calculate total profit/loss
    this.totalProfitLoss = this.products.reduce((total, product) => {
      return total + (product.profitLoss || 0);
    }, 0);
  }
  
  next();
});

// Indexes
saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });
saleSummarySchema.index({ customerId: 1, invoiceDate: -1 });
saleSummarySchema.index({ mrId: 1, recordingDate: -1 });
saleSummarySchema.index({ isExchange: 1 });
saleSummarySchema.index({ isReturn: 1 });
saleSummarySchema.index({ paymentStatus: 1 });
saleSummarySchema.index({ totalProfitLoss: 1 });

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);
export default SaleSummary;