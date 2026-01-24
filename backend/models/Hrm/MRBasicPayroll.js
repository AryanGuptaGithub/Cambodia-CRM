import mongoose from 'mongoose';

const salaryHistorySchema = new mongoose.Schema({
  basicSalary: {
    type: Number,
    required: true,
    min: 0
  },
  effectiveFrom: {
    type: Date,
    required: true
  },
  effectiveUntil: {
    type: Date,
    default: null
  },
  remarks: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const mrBasicPayrollSchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
    unique: true
  },
  employeeName: {
    type: String,
    required: true
  },
  currentBasicSalary: {
    type: Number,
    required: true,
    min: 0
  },
  currentEffectiveFrom: {
    type: Date,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  salaryHistory: [salaryHistorySchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Method to add new salary entry
mrBasicPayrollSchema.methods.addSalaryEntry = async function(basicSalary, effectiveFrom, remarks = '') {
  // Update effectiveUntil date of the current active salary
  const currentActiveIndex = this.salaryHistory.findIndex(entry => entry.effectiveUntil === null);
  if (currentActiveIndex !== -1) {
    this.salaryHistory[currentActiveIndex].effectiveUntil = new Date(effectiveFrom);
    this.salaryHistory[currentActiveIndex].effectiveUntil.setDate(this.salaryHistory[currentActiveIndex].effectiveUntil.getDate() - 1);
  }
  
  // Add new salary entry
  this.salaryHistory.push({
    basicSalary,
    effectiveFrom: new Date(effectiveFrom),
    effectiveUntil: null,
    remarks
  });
  
  // Update current salary and effective date
  this.currentBasicSalary = basicSalary;
  this.currentEffectiveFrom = new Date(effectiveFrom);
  this.updatedAt = new Date();
  
  return this;
};

// Middleware to update updatedAt timestamp
mrBasicPayrollSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Ensure salaryHistory exists
  if (!this.salaryHistory || this.salaryHistory.length === 0) {
    this.salaryHistory = [{
      basicSalary: this.currentBasicSalary,
      effectiveFrom: this.currentEffectiveFrom,
      effectiveUntil: null,
      remarks: this.remarks || 'Initial salary'
    }];
  }
  
  next();
});

// Create indexes
mrBasicPayrollSchema.index({ employeeId: 1 }, { unique: true });
mrBasicPayrollSchema.index({ employeeName: 1 });
mrBasicPayrollSchema.index({ currentEffectiveFrom: 1 });

const MRBasicPayroll = mongoose.model('MRBasicPayroll', mrBasicPayrollSchema);

export default MRBasicPayroll;