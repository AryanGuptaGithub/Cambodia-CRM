import mongoose from "mongoose";
const { Schema } = mongoose;

const MRCashSchema = new Schema(
  {
    mrId: {
      type: Schema.Types.ObjectId,
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
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
MRCashSchema.index({ mrId: 1 }, { unique: true });
MRCashSchema.index({ mrName: 1 });
MRCashSchema.index({ isActive: 1 });

// Use singular collection name
const MRCash = mongoose.model("MRCash", MRCashSchema);
export default MRCash;