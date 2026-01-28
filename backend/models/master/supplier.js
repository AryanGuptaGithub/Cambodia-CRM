import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      set: v => v ? v.toLowerCase() : v, // Store in lowercase
    },
 
    address: {
      type: String,
      trim: true,
      set: v => v ? v.toLowerCase() : v, // Store in lowercase
    },
    siteRegistrationDate: {
      type: Date,
    },
    siteRegistrationExpiryDate: {
      type: Date,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for better performance
supplierSchema.index({ name: 1 });
supplierSchema.index({ enabled: 1 });

export default mongoose.model("Supplier", supplierSchema);