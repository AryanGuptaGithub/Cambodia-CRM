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

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
      index: true,
    },

    products: [
      {
        productName: {
          type: String,
          required: true,
          trim: true,
        },

        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          default: null,
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

        lc: { type: Number, default: 0, min: 0 },
        fob: { type: Number, default: 0, min: 0 },
        cif: { type: Number, default: 0, min: 0 },

        amount: {
          type: Number,
          default: 0,
          min: 0,
        },

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

    // ─────────────────────────────────────────────
    // ✅ SOFT DELETE FIELDS (ADDED)
    // ─────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Compound unique index: one invoice per supplier
purchaseInventorySchema.index(
  { invoiceNumber: 1, supplierId: 1 },
  { unique: true, sparse: true, name: "invoice_supplierId_unique" }
);

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);