import mongoose from 'mongoose';

const MRBasicPayrollSchema = new mongoose.Schema({
  employeeId: {
    type: String,  // Keep as String since frontend sends String ID
    required: true,
    trim: true
  },
  // Remove employeeName or make it optional since we're getting it from staffs API
  employeeName: {
    type: String,
    trim: true,
    default: ''  // Make it optional/default
  },
  basicSalary: {
    type: Number,
    required: true,
    min: 0
  },
  remarks: {
    type: String,
    default: '',
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Remove or update the index since we removed month and year
MRBasicPayrollSchema.index({ employeeId: 1 }, { unique: true });

export default mongoose.model('MRBasicPayroll', MRBasicPayrollSchema);