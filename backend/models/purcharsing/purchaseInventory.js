// models/PurchaseInventory.js
import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String },
    invoiceDate: { type: Date },
    deliveryNumber: { type: String },
    receivedDate: { type: Date },
    expiredDate: { type: Date },
    productName: { type: String },
    supplierName: { type: String }, // Added supplierName field
    qtyBox: { type: Number, default: 0 },
    qtyPerCarton: { type: Number, default: 0 },
    fob: { type: Number, default: 0 },
    cif: { type: Number, default: 0 },
    lcNumber: { type: String },
    remarks: { type: String },
    amount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

// Pre-save middleware to calculate amount = lcNumber * qtyBox * qtyPerCarton
purchaseInventorySchema.pre("save", function (next) {
  // Convert lcNumber to number and calculate amount
  const lcValue = parseFloat(this.lcNumber) || 0;
  const qtyBoxValue = parseFloat(this.qtyBox) || 0;
  const qtyPerCarton = parseFloat(this.qtyPerCarton) || 0;
  
  this.amount = lcValue * qtyBoxValue * qtyPerCarton;
  
  next();
});

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);