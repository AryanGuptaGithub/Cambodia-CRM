// models/PurchaseInventory.js
import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String  },
    invoiceDate: { type: Date },

    deliveryNumber: { type: String },
    receivedDate: { type: Date, required: true },
    expiredDate: { type: Date },

    productName: { type: String },
    type: { type: String },
    packing: { type: String },

    qtyMain: { type: Number, default: 0 },
    qty: { type: Number, default: 0 },

    unitPrice: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    otherExpenses: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    remark: { type: String },
  },
  {
    timestamps: true, 
  }
);

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);
