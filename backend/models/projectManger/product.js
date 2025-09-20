import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  type: { type: String, required: true },
  packing: { type: String, required: true },
  qtyPerBox: { type: Number, required: true },
  qtyPerCarton: { type: Number, required: false },
  supplierName: { type: String, required: false },
  drugLicense: { type: String, required: false },
  licenseValidityDate: { type: Date, required: false },
  remarks: { type: String }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

export default Product;

