import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: { type: String }, // Customer Code
    date: { type: Date }, // Date
    medicalRepName: { type: String }, // Medical Representative Name
    name: { type: String, required: false }, // Customer Name in English
    typeOfBusiness: { type: String }, // Types of Business
    customerNumber: { type: String }, // Customer Number
    address: { type: String }, // Customer Address
    zone: { type: String }, // Zone
    province: { type: String }, // Changed from Location to Province
    remark: { type: String }, // Remark
    isNew: { 
      type: Boolean, 
      default: true 
    }, // ✅ True when new customer, false after first order
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true, // ✅ Adds createdAt and updatedAt automatically
  }
);

// ✅ Add indexes for better query performance
customerSchema.index({ province: 1 });
customerSchema.index({ isNew: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ zone: 1 });

export default mongoose.model("Customer", customerSchema);