import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true },
    invoiceDate: { type: Date },
    deliveryNumber: { type: String, trim: true },
    receivedDate: { type: Date },
    expiryDate: { type: Date },
    productName: { type: String, trim: true },
    supplierName: { type: String, trim: true },
    quantityPerBoxStrip: { type: Number, default: 0 },
    fob: { type: Number, default: 0 },
    cif: { type: Number, default: 0 },
    lc: { type: Number, default: 0 },  // keep this if needed for info
    lcNumber: { type: String, trim: true },
    remarks: { type: String, trim: true },
    amount: { type: Number, default: 0 },  // amount comes from frontend
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);
