// models/PurchaseReturn.js
import mongoose from "mongoose";

const purchaseReturnSchema = new mongoose.Schema({
  recordingDate: { type: Date, default: Date.now },
  invoiceNumber: { type: String, required: true },
  deliveryNumber: { type: String, required: true },
  invoiceDate: { type: Date },
  receivedDate: { type: Date },
  productName: { type: String, required: true },
  purchaseQty: { type: Number, default: 0 },
  returnQuantity: { type: Number, default: 0 },
  usedQty: { type: Number, default: 0 },
  fob: { type: Number, default: 0 },
  cif: { type: Number, default: 0 },
  lcNumber: { type: String },
  amount: { type: Number, default: 0 },
  returnAmount: { type: Number, default: 0 },
  returnReason: { type: String },
  remarks: { type: String }
}, {
  timestamps: true
});

const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);
export default PurchaseReturn;