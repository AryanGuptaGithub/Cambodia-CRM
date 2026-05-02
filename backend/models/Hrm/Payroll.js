import mongoose from "mongoose";

const allowanceSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
});

const sourceSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Destination",
    required: true,
  },
  accountName: {
    type: String,
    trim: true,
    default: "",
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
});

const payrollSchema = new mongoose.Schema(
  {
    payrollCode: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    period: {
      type: String,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    allowances: [allowanceSchema],
    totalAllowance: {
      type: Number,
      default: 0,
      min: 0,
    },
    deductions: {
      type: Number,
      default: 0,
      min: 0,
    },
    netSalary: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "paid", "cancelled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "check"],
      default: "bank",
    },
    bankAccount: {
      type: String,
      trim: true,
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
    },
    // ── Multi-source split (ground truth for balance restoration) ──
    sources: {
      type: [sourceSchema],
      default: [],
    },
    payrollType: {
      type: String,
      enum: ["current", "previous"],
      default: "current",
    },
    adjustedBasicSalary: {
      type: Number,
      default: 0,
    },
    proratedBasicSalary: {
      type: Number,
      default: 0,
    },
    extraTimeAmount: {
      type: Number,
      default: 0,
    },
    attendanceInfo: {
      totalWorkingDays: { type: Number, default: 0 },
      workingDaysUntilCalculationDate: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      totalLeaves: { type: Number, default: 0 },
      paidLeaves: { type: Number, default: 0 },
      unpaidLeaves: { type: Number, default: 0 },
      swapLeaves: { type: Number, default: 0 },
      perDaySalary: { type: Number, default: 0 },
      perMinuteSalary: { type: Number, default: 0 },
      leaveDeduction: { type: Number, default: 0 },
      extraMinutes: { type: Number, default: 0 },
      extraTimeAmount: { type: Number, default: 0 },
      calculationDate: { type: String, default: null },
      perDaySalaryExact: { type: Number, default: 0 },
      effectiveDays: { type: Number, default: 0 },
      leaveDeductionExact: { type: Number, default: 0 },
      isFull: { type: Boolean, default: true },
    },
    netSalaryExact: {
      type: Number,
      default: 0,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true, // Make it required
    },
  },
  {
    timestamps: true,
  },
);

// ─────────────────────────────────────────────
// PRE-VALIDATE: auto-generate payrollCode if not provided
// ─────────────────────────────────────────────
payrollSchema.pre("validate", async function (next) {
  if (this.isNew && !this.payrollCode) {
    try {
      const latestPayroll = await this.constructor
        .findOne({})
        .sort({ createdAt: -1 })
        .select("payrollCode");

      let nextNumber = 1;
      if (latestPayroll && latestPayroll.payrollCode) {
        const matches = latestPayroll.payrollCode.match(/PR-(\d+)/);
        if (matches && matches[1]) {
          nextNumber = parseInt(matches[1]) + 1;
        }
      }

      this.payrollCode = `PR-${nextNumber.toString().padStart(4, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// ─────────────────────────────────────────────
// PRE-SAVE: Calculate totalAllowance from allowances array
// ─────────────────────────────────────────────
payrollSchema.pre("save", function (next) {
  if (this.allowances && this.allowances.length > 0) {
    this.totalAllowance = this.allowances.reduce(
      (total, allowance) => total + (allowance.amount || 0),
      0,
    );
  } else {
    this.totalAllowance = 0;
  }
  next();
});

// ─────────────────────────────────────────────
// PRE-SAVE: Calculate netSalary based on payrollType
// ─────────────────────────────────────────────
payrollSchema.pre("save", function (next) {
  if (this.payrollType === "current") {
    const basic = this.adjustedBasicSalary || 0;
    const allowances = this.totalAllowance || 0;
    const deductions = this.deductions || 0;
    if (
      this.netSalary === undefined ||
      this.netSalary === null ||
      this.netSalary === 0
    ) {
      this.netSalary = basic + allowances - deductions;
    }
  } else {
    const basic = this.basicSalary || 0;
    const allowances = this.totalAllowance || 0;
    const deductions = this.deductions || 0;
    if (
      this.netSalary === undefined ||
      this.netSalary === null ||
      this.netSalary === 0
    ) {
      this.netSalary = basic + allowances - deductions;
    }
  }

  if (this.netSalary < 0) this.netSalary = 0;

  next();
});

// Indexes
payrollSchema.index({ employeeId: 1, period: 1 }, { unique: true });
payrollSchema.index({ status: 1 });
payrollSchema.index({ period: 1 });

const Payroll = mongoose.model("Payroll", payrollSchema);
export default Payroll;
