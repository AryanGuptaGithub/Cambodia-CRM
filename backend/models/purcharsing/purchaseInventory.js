import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, trim: true, required: true, unique: true },
    invoiceDate: { type: Date },
    deliveryNumber: { type: String, trim: true },
    receivedDate: { type: Date },
    supplierName: { type: String, trim: true, required: true },
    products: [
      {
        productName: { type: String, required: true },
        type: { type: String, default: "Tablet" },
        expiryDate: { type: Date },
        quantityPerBoxStrip: { type: Number, default: 0 },
        lc: { type: Number, default: 0 },
        fob: { type: Number, default: 0 },
        cif: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
        sellingPrice: { type: Number, default: 0 }, // CORRECTED: Proper schema definition
      },
    ],
    remarks: { type: String, trim: true },
    totalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Fix Mongoose unique index errors
purchaseInventorySchema.index({ invoiceNumber: 1 }, { unique: true });

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);