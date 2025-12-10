// models/MRCreditSales.js
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: true,
  },
  paymentDate: {
    type: Date,
    default: Date.now,
  },
  notes: {
    type: String,
    default: "",
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  paymentMethod: {
    type: String,
    enum: ["Cash", "Cheque", "Online", "Card", "Other"],
    default: "Cash",
  },
});

const mrCreditSaleSchema = new mongoose.Schema(
  {
    saleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SaleSummary",
      required: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      index: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
    },
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalRep",
      required: true,
    },
    mrName: {
      type: String,
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    customerName: {
      type: String,
      required: true,
    },
    creditAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    originalTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled", "overdue"],
      default: "active",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    payments: [paymentSchema],
    // Additional fields
    products: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        productName: String,
        quantity: Number,
        unitPrice: Number,
        totalPrice: Number,
      },
    ],
    remarks: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
mrCreditSaleSchema.index({ dueDate: 1 });
mrCreditSaleSchema.index({ status: 1 });
mrCreditSaleSchema.index({ mrId: 1 });
mrCreditSaleSchema.index({ customerId: 1 });
mrCreditSaleSchema.index({ invoiceNumber: 1 }, { unique: true });

// Pre-save middleware to update status based on dueAmount and dueDate
mrCreditSaleSchema.pre("save", function (next) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (this.dueAmount <= 0) {
    this.status = "completed";
  } else if (this.dueDate < today) {
    this.status = "overdue";
  }
  next();
});

const MRCreditSales = mongoose.model("MRCreditSales", mrCreditSaleSchema);

export default MRCreditSales;