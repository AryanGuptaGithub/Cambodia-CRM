import mongoose from "mongoose";

const transferSchema = new mongoose.Schema({
  fromAccount: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  fromAccountName: {
    type: String,
    required: true
  },
  toAccount: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  toAccountName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  notes: String,
  transferredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  transferredAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export default mongoose.model('Transfer', transferSchema);