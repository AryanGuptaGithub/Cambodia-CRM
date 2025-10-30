import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  holidayCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
  },
  holidayName: {
    type: String,
    required: true,
    trim: true,
  },
  holidayDate: {
    type: Date,
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

holidaySchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

holidaySchema.index({ holidayDate: 1 });
holidaySchema.index({ holidayCode: 1 });

const Holiday = mongoose.model('Holiday', holidaySchema);
export default Holiday;