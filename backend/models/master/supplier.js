import mongoose from "mongoose";

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
 
    address: {
      type: String,
      trim: true,
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

export default mongoose.model("Supplier", supplierSchema);
