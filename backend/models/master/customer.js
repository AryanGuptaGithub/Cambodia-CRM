import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
  {
    customerCode: {
      type: String,
      unique: true,
      required: true,
    },
    
    date: { 
      type: Date 
    },
    
    medicalRepId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "staffs",
      required: false,
    },
    
    medicalRepName: {
      type: String,
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    name: { 
      type: String, 
      required: false, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    typeOfBusiness: { 
      type: String, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    customerNumber: { 
      type: String, 
      trim: true 
    },
    
    address: { 
      type: String, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    zone: { 
      type: String, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    province: { 
      type: String, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    remark: { 
      type: String, 
      trim: true,
      set: v => v ? v.toLowerCase() : v,
    },
    
    isNew: { 
      type: Boolean, 
      default: true 
    },
    
    enabled: { 
      type: Boolean, 
      default: true 
    },
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
customerSchema.index({ medicalRepId: 1 });
customerSchema.index({ customerNumber: 1 });
customerSchema.index({ name: 1 });

export default mongoose.model("Customer", customerSchema);