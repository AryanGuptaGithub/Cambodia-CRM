import mongoose from "mongoose";

const mrCashSchema = new mongoose.Schema(
  {
    mrId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      required: true,
    },
    mrName: {
      type: String,
      required: true,
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
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
    categoryType: {
      // <-- NEW FIELD
      type: mongoose.Schema.Types.ObjectId,
      ref: "CategoryType",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

export default mongoose.model("MRCash", mrCashSchema);
