import mongoose from 'mongoose';

const mrAdvanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff', // adjust to your MR collection name if different
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    sourceAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Destination', // account from which money is taken
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    remarks: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'adjusted', 'cancelled'],
      default: 'pending',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('MrAdvance', mrAdvanceSchema);