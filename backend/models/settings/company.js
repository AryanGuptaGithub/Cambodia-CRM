import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
  companyCode: {
    type: String,
    required: [true, 'Company code is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  companyName: {
    type: String,
    required: [true, 'Company name is required'],
    trim: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  website: {
    type: String,
    trim: true
  },
  taxNumber: {
    type: String,
    trim: true
  },
  establishedDate: {
    type: Date
  },
  description: {
    type: String,
    trim: true
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better search performance
companySchema.index({ companyCode: 1 });
companySchema.index({ companyName: 1 });
companySchema.index({ enabled: 1 });

export default mongoose.model('Company', companySchema);