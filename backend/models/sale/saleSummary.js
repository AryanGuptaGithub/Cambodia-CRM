import mongoose from "mongoose";
const { Schema } = mongoose;

// Helper to round to 2 decimals
const roundToTwo = (value) =>
  typeof value === "number" ? Math.round(value * 100) / 100 : value;

// Product Subschema
const productSchema = new Schema({
  productName: { type: String, required: true },
  salesQty: { type: Number, required: true, min: 0 },
  bonusQty: { type: Number, default: 0, min: 0 },
  totalQty: { type: Number, required: true, min: 0 },
  sellingPrice: { type: Number, required: true, min: 0, set: roundToTwo },
  amount: { type: Number, required: true, set: roundToTwo },
  discount: { type: Number, default: 0, min: 0, set: roundToTwo },
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
    invoiceNumber: { type: String, required: true, trim: true },
    invoiceDate: { type: Date, required: true },
    
    mrName: { type: String, required: true, trim: true },
    mrId: { 
      type: Schema.Types.ObjectId, 
      ref: "MedicalRepresentative", 
      required: false 
    },

    // Customer
    customerName: { type: String, required: true, trim: true },
    customerId: { 
      type: Schema.Types.ObjectId, 
      ref: "Customer", 
      required: true 
    },

    products: [productSchema],

    creditDays: { type: Number, default: null, min: 0 },
    dueDate: { type: Date },
    deliveryDate: { type: Date },

    paidAmount: { type: Number, default: 0, min: 0, set: roundToTwo },
    dueAmount: { type: Number, default: 0, min: 0, set: roundToTwo },
    totalAmount: { type: Number, required: true, min: 0, set: roundToTwo },

    paymentStatus: {
      type: String,
      enum: ["Cash", "Credit", "Partial Paid", "Overdue"],
      default: "Credit",
    },

    remark: { type: String, default: "", trim: true },
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Unique index on invoiceNumber
saleSummarySchema.index({ invoiceNumber: 1 }, { unique: true });

// Optional: Compound index for common queries
saleSummarySchema.index({ customerId: 1, invoiceDate: -1 });
saleSummarySchema.index({ mrId: 1, recordingDate: -1 });

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);

export default SaleSummary;