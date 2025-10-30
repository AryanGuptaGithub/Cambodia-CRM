import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Indexes for faster search
holidaySchema.index({ startDate: 1 });
holidaySchema.index({ endDate: 1 });

const Holiday = mongoose.model("Holiday", holidaySchema);
export default Holiday;