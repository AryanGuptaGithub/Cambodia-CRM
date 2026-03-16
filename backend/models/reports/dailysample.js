import mongoose from "mongoose";

const dailySampleSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    mrName: { type: String, required: true },
    mrId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" }, // used for stock updates
    // Customer fields (mirroring AddSale)
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer" },
    customerName: { type: String },
    customerCode: { type: String },
    productName: { type: String, required: true },
    totalQty: { type: Number, default: 0, min: 0 },
    remark: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("DailySampleReport", dailySampleSchema);
