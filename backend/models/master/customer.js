import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      required: true,
    }, // Auto-incremented Customer Code

    date: { type: Date },

    // References the 'staffs' collection
    medicalRepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "staffs", // Correct collection name
      required: false,
    },

    // Keep this for display & import fallback
    medicalRepName: {
      type: String,
      trim: true,
    },

    name: { type: String, required: false, trim: true },
    typeOfBusiness: { type: String, trim: true },
    customerNumber: { type: String, trim: true },
    address: { type: String, trim: true },
    zone: { type: String, trim: true },
    province: { type: String, trim: true },
    remark: { type: String, trim: true },

    isNew: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
customerSchema.index({ province: 1 });
customerSchema.index({ isNew: 1 });
customerSchema.index({ medicalRepName: 1 });
customerSchema.index({ zone: 1 });
customerSchema.index({ medicalRepId: 1 }); // Critical for populating
customerSchema.index({ customerNumber: 1 }); // For duplicate checks
customerSchema.index({ name: 1 }); // For duplicate name checks

export default mongoose.model("Customer", customerSchema);