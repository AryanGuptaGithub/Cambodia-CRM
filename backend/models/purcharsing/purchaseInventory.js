import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      trim: true,
      required: true,
    },
    invoiceDate: { type: Date },
    deliveryNumber: { type: String, trim: true },
    receivedDate: { type: Date },
    supplierName: {
      type: String,
      trim: true,
      required: true,
    },
    products: [
      {
        productName: {
          type: String,
          required: true,
          trim: true,
        },
        type: {
          type: String,
          default: "Tablet",
          trim: true,
        },
        expiryDate: { type: Date },
        quantityPerBoxStrip: {
          type: Number,
          default: 0,
          min: 0,
        },
        lc: {
          type: Number,
          default: 0,
          min: 0,
        },
        fob: {
          type: Number,
          default: 0,
          min: 0,
        },
        cif: {
          type: Number,
          default: 0,
          min: 0,
        },
        amount: {
          type: Number,
          default: 0,
          min: 0,
        },
        // ── sellingPrice ────────────────────────────────────────────────────
        // Stored even when 0.  Comes from the Product master at import time
        // and is forwarded to ReportInHand so sales routes can read it
        // directly without a separate Product lookup.
        sellingPrice: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],
    remarks: { type: String, trim: true },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true },
);

// Compound unique index: one invoice per supplier
purchaseInventorySchema.index(
  { invoiceNumber: 1, supplierName: 1 },
  { unique: true, name: "invoice_supplier_unique" },
);

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);
