import mongoose from "mongoose";

const allowanceTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
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

// Create index for better performance
allowanceTypeSchema.index({ code: 1 });
allowanceTypeSchema.index({ isActive: 1 });

const AllowanceType = mongoose.model("AllowanceType", allowanceTypeSchema);

export default AllowanceType;