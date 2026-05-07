import mongoose from "mongoose";

const paymentOutSchema = new mongoose.Schema({
  paymentDate: {
    type: Date,
    required: [true, 'Payment date is required'],
  },
  invoiceNo: {
    type: String,
    required: [true, 'Invoice number is required'],
    trim: true,
    uppercase: true
  },
  invoiceDate: {
    type: Date,
    required: [true, 'Invoice date is required'],
  },
  supplierName: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true
  },
  invoiceAmount: {
    type: Number,
    required: [true, 'Invoice amount is required'],
    min: [0, 'Invoice amount cannot be negative']
  },
  paidAmount: {
    type: Number,
    required: [true, 'Paid amount is required'],
    min: [0, 'Paid amount cannot be negative']
  },
  dueAmount: {
    type: Number,
    default: 0,
    min: [0, 'Due amount cannot be negative']
  },
  paymentStatus: {
    type: String,
    enum: ['full_paid', 'partial_paid', 'pending'],
    default: 'pending'
  },
  bank: {
    type: String,
    trim: true,
    default: ''
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  },
}, {
  timestamps: true
});

// Pre-save middleware to calculate amounts
paymentOutSchema.pre('save', function(next) {
  // Calculate due amount
  this.dueAmount = Math.max(0, this.invoiceAmount - this.paidAmount);
  
  // Determine payment status
  if (this.paidAmount === 0) {
    this.paymentStatus = 'pending';
  } else if (this.paidAmount >= this.invoiceAmount) {
    this.paymentStatus = 'full_paid';
  } else {
    this.paymentStatus = 'partial_paid';
  }
  
  next();
});

// Index for better query performance
paymentOutSchema.index({ invoiceNo: 1 });
paymentOutSchema.index({ supplierName: 1 });
paymentOutSchema.index({ paymentDate: 1 });
paymentOutSchema.index({ paymentStatus: 1 });
paymentOutSchema.index({ createdAt: -1 });

// Virtual for formatted dates
paymentOutSchema.virtual('formattedPaymentDate').get(function() {
  return this.paymentDate.toISOString().split('T')[0];
});

paymentOutSchema.virtual('formattedInvoiceDate').get(function() {
  return this.invoiceDate.toISOString().split('T')[0];
});

// Virtual to check if payment is completed
paymentOutSchema.virtual('isCompleted').get(function() {
  return this.paymentStatus === 'full_paid';
});

// Ensure virtual fields are serialized
paymentOutSchema.set('toJSON', { virtuals: true });

const PaymentOut = mongoose.model('PaymentOut', paymentOutSchema);

export default PaymentOut;