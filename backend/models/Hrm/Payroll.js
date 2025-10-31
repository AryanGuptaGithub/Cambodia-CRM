import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema({
  employeeName: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  designation: {
    type: String,
    required: true,
    trim: true
  },
  basicSalary: {
    type: Number,
    required: true,
    min: 0
  },
  allowances: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  deductions: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  netSalary: {
    type: Number,
    required: true,
    min: 0
  },
  remarks: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

// Calculate netSalary before saving
payrollSchema.pre('save', function(next) {
  this.netSalary = this.basicSalary + this.allowances - this.deductions;
  next();
});

// Index for better query performance
payrollSchema.index({ employeeName: 1 });
payrollSchema.index({ department: 1 });
payrollSchema.index({ designation: 1 });

const Payroll = mongoose.model('Payroll', payrollSchema);

export default Payroll;