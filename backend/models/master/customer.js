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
    location: { type: String }, // Location
    remark: { type: String }, // Remark
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true, // ✅ Adds createdAt and updatedAt automatically
  }
);

export default mongoose.model("Customer", customerSchema);
