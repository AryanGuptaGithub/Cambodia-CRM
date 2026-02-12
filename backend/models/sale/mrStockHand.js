import mongoose from "mongoose";

const productInHandSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  lc: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const mrStockInHandSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
    unique: true
  },
  mrName: {
    type: String,
    required: true
  },
  productsInHand: [productInHandSchema]
}, {
  timestamps: true,
  collection: 'stockinmrhands'
});

// Virtual for total quantity
mrStockInHandSchema.virtual('totalQuantity').get(function() {
  return this.productsInHand.reduce((sum, product) => sum + (product.quantity || 0), 0);
});

// Virtual for total products
mrStockInHandSchema.virtual('totalProducts').get(function() {
  return this.productsInHand.filter(p => p.quantity > 0).length;
});

// Ensure virtuals are included in JSON
mrStockInHandSchema.set('toJSON', { virtuals: true });
mrStockInHandSchema.set('toObject', { virtuals: true });

// Index for faster queries
mrStockInHandSchema.index({ mrId: 1 });
mrStockInHandSchema.index({ mrName: 1 });
mrStockInHandSchema.index({ 'productsInHand.productName': 1 });

const MRStockInHand = mongoose.model('MRStockInHand', mrStockInHandSchema);

export default MRStockInHand;
