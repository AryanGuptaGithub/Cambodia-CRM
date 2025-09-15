// models/master/supplier.js
import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema({
  warehouse: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['enabled', 'disabled'],
    default: 'enabled',
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  taxNumber: {
    type: String,
    trim: true,
  },
  openingBalance: {
    type: Number,
    default: 0,
  },
  type: {
    type: String,
    enum: ['pay', 'receive'],
    default: 'receive',
  },
  creditPeriod: {
    type: Number,
    default: 0,
  },
  creditLimit: {
    type: Number,
    default: 0,
  },
  profileImage: {
    type: String, // URL or filename
    default: null,
  },
}, {
  timestamps: true, // adds createdAt and updatedAt
});

export default mongoose.model('Supplier', supplierSchema);
