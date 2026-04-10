import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    totalQty: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const dailySampleSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    mrName: { type: String, required: true },
    mrId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerName: { type: String },
    customerCode: { type: String },
    products: [productSchema],
    remark: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("DailySampleReport", dailySampleSchema);
