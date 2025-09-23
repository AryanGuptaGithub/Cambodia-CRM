import mongoose from "mongoose";

const dailySampleReportSchema = new mongoose.Schema(
  {
    requestNumber: { type: String, required: true },         // Request #
    date: { type: Date, required: true },                    // Date
    mrName: { type: String, required: true },                // MR Name
    description: { type: String },                            // Description
    productName: { type: String, required: true },           // Product Name
    qtyBigBox: { type: Number, default: 0 },                 // Quantity (Big Box)
    qtySmallBox: { type: Number, default: 0 },               // Quantity (Small Box)
    totalQty: { type: Number, default: 0 },                  // Total Qty
    qtyPerBox: { type: Number, default: 0 },                 // Qty per Box (Strip)
    remark: { type: String },                                 // Remark
  },
  { timestamps: true }
);

export default mongoose.model("DailySampleReport", dailySampleReportSchema);

