import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productName: { 
      type: String, 
      required: true,
      trim: true,
      lowercase: true, // Automatically convert to lowercase
      set: (value) => value ? value.trim().toLowerCase() : value
    },
    type: { 
      type: String, 
      required: true,
      trim: true,
      lowercase: true,
      set: (value) => value ? value.trim().toLowerCase() : value
    },
    packing: { 
      type: String, 
      required: true,
      trim: true,
      lowercase: true,
      set: (value) => value ? value.trim().toLowerCase() : value
    },
    sellingPrice: { 
      type: Number,
      default: 0
    },
    lc: { 
      type: Number,
      default: 0
    },
    fob: { 
      type: Number,
      default: 0
    },
    taxSellingPrice: { 
      type: Number,
      default: 0
    },
    qtyPerBoxStrip: { 
      type: Number, 
      required: true,
      min: 1
    },
    supplierName: { 
      type: String, 
      default: "",
      trim: true,
      lowercase: true,
      set: (value) => value ? value.trim().toLowerCase() : value
    },
    drugLicense: { 
      type: String, 
      default: "",
      trim: true,
      lowercase: true,
      set: (value) => value ? value.trim().toLowerCase() : value
    },
    licenseValidityDate: { 
      type: Date, 
      default: null,
      set: function(value) {
        if (!value) return null;
        
        if (value instanceof Date) {
          return value;
        }
        
        if (typeof value === 'string') {
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        }
        
        return null;
      }
    },
    remarks: { 
      type: String,
      default: "",
      trim: true,
      lowercase: true,
      set: (value) => value ? value.trim().toLowerCase() : value
    },
  },
  { 
    timestamps: true
  }
);

// Create compound index
productSchema.index({ productName: 1, type: 1, packing: 1, supplierName: 1 });

const Product = mongoose.model("Product", productSchema);

export default Product;