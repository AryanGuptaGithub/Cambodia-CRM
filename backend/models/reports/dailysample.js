import mongoose from 'mongoose';

const dailySampleSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  mrName: { type: String, required: true },
  mrId: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' }, // used for stock updates
  productName: { type: String, required: true },
  totalQty: { type: Number, default: 0, min: 0 },
  remark: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('DailySampleReport', dailySampleSchema);