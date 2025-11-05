import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      required: true,
    }, // Auto-incremented Customer Code

    date: { type: Date },
    medicalRepName: { type: String },
    name: { type: String, required: false },
    typeOfBusiness: { type: String },
    customerNumber: { type: String },
    address: { type: String },
    zone: { type: String },
    province: { type: String },
    remark: { type: String },
    isNew: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// ✅ Add indexes for better performance
customerSchema.index({ province: 1 });
customerSchema.index({ isNew: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ zone: 1 });



export default mongoose.model("Customer", customerSchema);
