import mongoose from "mongoose";

const activeMrFilterSchema = new mongoose.Schema(
  {
    mrNames: {
      type: [String],
      default: [],
    },
    updatedBy: {
      type: String,
      default: "system",
    },
  },
  { timestamps: true },
);

const ActiveMrFilter = mongoose.model("ActiveMrFilter", activeMrFilterSchema);

export default ActiveMrFilter;
