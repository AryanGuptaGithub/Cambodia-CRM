import mongoose from 'mongoose';

const stockTransferSchema = new mongoose.Schema({
  invoiceNo: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  warehouse: {
    type: String,
    required: true,
    trim: true
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(value) {
        return value <= this.totalAmount;
      },
      message: 'Paid amount cannot exceed total amount'
    }
  },
  dueAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentStatus: {
    type: String,
    required: true,
    enum: ['paid', 'pending', 'partial', 'overdue'],
    default: 'pending'
  },
  transferType: {
    type: String,
    required: true,
    enum: ['internal', 'external', 'return', 'adjustment'],
    default: 'internal'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'in_transit'],
    default: 'pending'
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  sourceWarehouse: {
    type: String,
    required: true,
    trim: true
  },
  destinationWarehouse: {
    type: String,
    required: true,
    trim: true
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Calculate due amount before saving
stockTransferSchema.pre('save', function(next) {
  this.dueAmount = this.totalAmount - this.paidAmount;
  
  // Auto-update payment status based on amounts
  if (this.paidAmount === 0) {
    this.paymentStatus = 'pending';
  } else if (this.paidAmount === this.totalAmount) {
    this.paymentStatus = 'paid';
  } else if (this.paidAmount > 0 && this.paidAmount < this.totalAmount) {
    this.paymentStatus = 'partial';
  }
  
  next();
});

// Static method to generate invoice number
stockTransferSchema.statics.generateInvoiceNo = async function() {
  const currentYear = new Date().getFullYear();
  const prefix = `ST-${currentYear}-`;
  
  const lastTransfer = await this.findOne(
    { invoiceNo: new RegExp(`^${prefix}`) },
    {},
    { sort: { createdAt: -1 } }
  );
  
  if (!lastTransfer) {
    return `${prefix}0001`;
  }
  
  const lastNumber = parseInt(lastTransfer.invoiceNo.split('-')[2]);
  const newNumber = (lastNumber + 1).toString().padStart(4, '0');
  
  return `${prefix}${newNumber}`;
};


stockTransferSchema.index({ invoiceNo: 1 });
stockTransferSchema.index({ date: -1 });
stockTransferSchema.index({ warehouse: 1 });
stockTransferSchema.index({ paymentStatus: 1 });
stockTransferSchema.index({ transferType: 1 });

const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);

export default StockTransfer;