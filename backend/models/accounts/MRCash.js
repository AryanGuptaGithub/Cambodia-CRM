import mongoose from "mongoose";
import staff from "../../models/staffMember/staff.js"
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
  },
  // Add transfer history
  transferHistory: [{
    amount: Number,
    transferDate: Date,
    notes: String,
    transferredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for faster queries
mRCashSchema.index({ mrId: 1 });
mRCashSchema.index({ mrName: 1 });
mRCashSchema.index({ isActive: 1 });
mRCashSchema.index({ currentCash: -1 });

// Virtual for total cash (current cash + transferred)
mRCashSchema.virtual("totalCash").get(function() {
  return this.currentCash + this.cashTransferredToAdmin;
});

// Method to transfer cash to admin
mRCashSchema.methods.transferToAdmin = async function(amount, notes = "", userId = null) {
  if (amount <= 0) {
    throw new Error("Transfer amount must be positive");
  }
  if (amount > this.currentCash) {
    throw new Error(`Insufficient cash available. Available: ${this.currentCash}, Requested: ${amount}`);
  }
  
  // Update cash values
  this.currentCash -= amount;
  this.cashTransferredToAdmin += amount;
  this.lastTransferDate = new Date();
  
  // Add to transfer history
  this.transferHistory.push({
    amount: amount,
    transferDate: new Date(),
    notes: notes,
    transferredBy: userId || this.updatedBy
  });
  
  // Update updatedBy if userId provided
  if (userId) {
    this.updatedBy = userId;
  }
  
  return await this.save();
};

// Method to add cash
mRCashSchema.methods.addCash = async function(amount, notes = "", userId = null) {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }
  
  this.currentCash += amount;
  
  if (notes) {
    this.notes = notes;
  }
  
  if (userId) {
    this.updatedBy = userId;
  }
  
  return await this.save();
};

const MRCash = mongoose.model("MRCashes", mRCashSchema);
export default MRCash;