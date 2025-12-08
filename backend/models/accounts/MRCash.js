import mongoose from "mongoose";

const mRCashSchema = new mongoose.Schema({
  mrId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Staff",
    required: true,
  },
  mrName: {
    type: String,
    required: true,
    trim: true,
  },
  currentCash: {
    type: Number,
    default: 0,
    min: 0,
  },
  cashTransferredToAdmin: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastTransferDate: {
    type: Date,
  },
  notes: {
    type: String,
    trim: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  isActive: {
    type: Boolean,
    default: true,
  }
}, {
  timestamps: true, // This will add createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster queries
mRCashSchema.index({ mrId: 1 });
mRCashSchema.index({ mrName: 1 });
mRCashSchema.index({ isActive: 1 });

// Virtual for total cash (current cash + transferred)
mRCashSchema.virtual("totalCash").get(function() {
  return this.currentCash + this.cashTransferredToAdmin;
});

// Method to add cash
mRCashSchema.methods.addCash = function(amount) {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }
  this.currentCash += amount;
  return this.save();
};

// Method to transfer cash to admin
mRCashSchema.methods.transferToAdmin = function(amount) {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }
  if (amount > this.currentCash) {
    throw new Error("Insufficient cash available");
  }
  
  this.currentCash -= amount;
  this.cashTransferredToAdmin += amount;
  this.lastTransferDate = new Date();
  
  return this.save();
};

const MRCash = mongoose.model("MRCash", mRCashSchema);
export default MRCash;