import mongoose from "mongoose";
const { Schema } = mongoose;

const roundToTwo = (value) => {
  if (typeof value !== "number") return value;
  return Math.round(value * 100) / 100;
};

const saleSummarySchema = new Schema(
  {
    recordingDate: { type: Date, required: true },
    invoiceNumber: { type: String, required: true },
    invoiceDate: { type: Date, required: true },
    mrName: { type: String, required: true },
    customerCode: { type: String, required: true },
    productName: { type: String, required: true },
    salesQty: { type: Number, required: true },
    bonusQty: { type: Number, default: 0 },
    totalQty: { type: Number, required: true },
    sellingPrice: {
      type: Number,
      required: true,
      set: roundToTwo,
    },
    amount: { type: Number, required: true },
    discount: {
      type: Number,
      default: 0,
      set: roundToTwo,
    },
    netSellingAmount: {
      type: Number,
      required: true,
      set: roundToTwo,
    },
    averageUnitPrice: {
      type: Number,
      required: true,
      set: roundToTwo,
    },
    profitLoss: {
      type: Number,
      default: 0,
      set: roundToTwo,
    },
    creditDays: { type: Number, default: null },
    dueDate: { type: Date, require: false },
    deliveryDate: { type: Date, require: false },
    paidAmount: { type: Number, default: 0 },
    dueAmount: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["paid", "unPaid", "pending", "overdue"],
      default: "pending",
    },
    remark: { type: String, default: "" },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

const SaleSummary = mongoose.model("SaleSummary", saleSummarySchema);
export default SaleSummary;
