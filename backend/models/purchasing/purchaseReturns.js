import mongoose from "mongoose";

const productSubSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true
  },
  purchaseQty: {
    type: Number,
    required: [true, 'Purchase quantity is required'],
    min: [0, 'Purchase quantity cannot be negative']
  },
  returnQuantity: {
    type: Number,
    required: [true, 'Return quantity is required'],
    min: [0, 'Return quantity cannot be negative'],
    validate: {
      validator: function(value) {
        return value <= this.purchaseQty;
      },
      message: 'Return quantity cannot exceed purchase quantity'
    }
  },
  usedQty: {
    type: Number,
    default: 0,
    min: [0, 'Used quantity cannot be negative'],
    validate: {
      validator: function(value) {
        return value <= this.purchaseQty;
      },
      message: 'Used quantity cannot exceed purchase quantity'
    }
  },
  fob: {
    type: Number,
    default: 0,
    min: [0, 'FOB cannot be negative']
  },
  cif: {
    type: Number,
    default: 0,
    min: [0, 'CIF cannot be negative']
  },
  lc: {
    type: Number,
    default: 0,
    min: [0, 'LC cannot be negative']
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  returnAmount: {
    type: Number,
    required: [true, 'Return amount is required'],
    min: [0, 'Return amount cannot be negative'],
    validate: {
      validator: function(value) {
        return value <= this.amount;
      },
      message: 'Return amount cannot exceed original amount'
    }
  },
  expiredDate: {
    type: Date,
    required: [true, 'Expired date is required']
  }
});

const purchaseReturnSchema = new mongoose.Schema({
  recordingDate: {
    type: Date,
    required: [true, 'Recording date is required'],
  },
  invoiceNumber: {
    type: String,
    required: [true, 'Invoice number is required'],
    trim: true,
    uppercase: true
  },
  invoiceDate: {
    type: Date,
    required: [true, 'Invoice date is required'],
  },
  deliveryNumber: {
    type: String,
    trim: true,
    default: ''
  },
  receivedDate: {
    type: Date,
    required: [true, 'Received date is required'],
  },
  products: {
    type: [productSubSchema],
    required: [true, 'Products are required'],
    validate: {
      validator: function(products) {
        return products && products.length > 0;
      },
      message: 'At least one product is required'
    }
  },

  returnReason: {
    type: String,
    required: [true, 'Return reason is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending'
  },
  supplierName: {
    type: String,
    required: [true, 'Supplier name is required'],
    trim: true
  },
  returnDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save middleware to calculate derived fields for each product
purchaseReturnSchema.pre('save', function(next) {
  // Calculate remaining quantity for each product
  this.products.forEach(product => {
    product.remainingQty = product.purchaseQty - product.usedQty - product.returnQuantity;
    
    // Auto-calculate return amount if not provided or zero
    if ((!product.returnAmount || product.returnAmount === 0) && product.amount > 0 && product.purchaseQty > 0) {
      product.returnAmount = (product.amount / product.purchaseQty) * product.returnQuantity;
    }
  });
  
  next();
});

// Index for better query performance
purchaseReturnSchema.index({ invoiceNumber: 1 });
purchaseReturnSchema.index({ "products.productName": 1 });
purchaseReturnSchema.index({ recordingDate: -1 });
purchaseReturnSchema.index({ status: 1 });
purchaseReturnSchema.index({ createdAt: -1 });

// Virtual for formatted dates
purchaseReturnSchema.virtual('formattedRecordingDate').get(function() {
  return this.recordingDate.toISOString().split('T')[0];
});

purchaseReturnSchema.virtual('formattedInvoiceDate').get(function() {
  return this.invoiceDate.toISOString().split('T')[0];
});

purchaseReturnSchema.virtual('formattedReceivedDate').get(function() {
  return this.receivedDate.toISOString().split('T')[0];
});

purchaseReturnSchema.virtual('formattedReturnDate').get(function() {
  return this.returnDate.toISOString().split('T')[0];
});

// Virtual for total return quantity across all products
purchaseReturnSchema.virtual('totalReturnQuantity').get(function() {
  return this.products.reduce((sum, product) => sum + (product.returnQuantity || 0), 0);
});

// Virtual for total return amount across all products
purchaseReturnSchema.virtual('totalReturnAmount').get(function() {
  return this.products.reduce((sum, product) => sum + (product.returnAmount || 0), 0);
});

// Instance method to get return summary
purchaseReturnSchema.methods.getSummary = function() {
  return {
    invoiceNumber: this.invoiceNumber,
    totalProducts: this.products.length,
    totalReturnQuantity: this.totalReturnQuantity,
    totalReturnAmount: this.totalReturnAmount,
    status: this.status,
    returnDate: this.formattedReturnDate
  };
};

// Static method to get total returns by status
purchaseReturnSchema.statics.getTotalByStatus = async function(status) {
  const result = await this.aggregate([
    { $match: { status: status } },
    { $unwind: "$products" },
    { 
      $group: { 
        _id: '$status', 
        totalReturns: { $sum: 1 },
        totalQuantity: { $sum: '$products.returnQuantity' },
        totalAmount: { $sum: '$products.returnAmount' }
      } 
    }
  ]);
  
  return result.length > 0 ? result[0] : { totalReturns: 0, totalQuantity: 0, totalAmount: 0 };
};

// Static method to get monthly returns
purchaseReturnSchema.statics.getMonthlyReturns = async function(year) {
  return await this.aggregate([
    {
      $match: {
        returnDate: {
          $gte: new Date(`${year}-01-01`),
          $lte: new Date(`${year}-12-31`)
        }
      }
    },
    {
      $unwind: "$products"
    },
    {
      $group: {
        _id: { $month: '$returnDate' },
        totalReturns: { $sum: 1 },
        totalQuantity: { $sum: '$products.returnQuantity' },
        totalAmount: { $sum: '$products.returnAmount' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

purchaseReturnSchema.set('toJSON', { virtuals: true });

const PurchaseReturn = mongoose.model('PurchaseReturn', purchaseReturnSchema);

export default PurchaseReturn;