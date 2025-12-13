import mongoose from "mongoose";

const purchaseInventorySchema = new mongoose.Schema(
  {
    invoiceNumber: { 
      type: String, 
      trim: true, 
      required: true 
    },
    invoiceDate: { type: Date },
    deliveryNumber: { type: String, trim: true },
    receivedDate: { type: Date },
    supplierName: { 
      type: String, 
      trim: true, 
      required: true 
    },
    products: [
      {
        productName: { 
          type: String, 
          required: true,
          trim: true
        },
        type: { 
          type: String, 
          default: "Tablet",
          trim: true
        },
        expiryDate: { type: Date },
        quantityPerBoxStrip: { 
          type: Number, 
          default: 0,
          min: 0
        },
        lc: { 
          type: Number, 
          default: 0,
          min: 0
        },
        fob: { 
          type: Number, 
          default: 0,
          min: 0
        },
        cif: { 
          type: Number, 
          default: 0,
          min: 0
        },
        amount: { 
          type: Number, 
          default: 0,
          min: 0
        },
        sellingPrice: { 
          type: Number, 
          default: 0,
          min: 0
        },
      },
    ],
    remarks: { type: String, trim: true },
    totalAmount: { 
      type: Number, 
      default: 0,
      min: 0
    },
  },
  { timestamps: true }
);

// Create compound unique index for invoiceNumber + supplierName
purchaseInventorySchema.index(
  { invoiceNumber: 1, supplierName: 1 }, 
  { unique: true, name: "invoice_supplier_unique" }
);

export default mongoose.model("PurchaseInventory", purchaseInventorySchema);