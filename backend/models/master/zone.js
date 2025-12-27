import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Province",
      required: true,
    },
  },
  { timestamps: true }
);

// prevent duplicate zone names in same province
zoneSchema.index({ name: 1, provinceId: 1 }, { unique: true });

export default mongoose.model("Zone", zoneSchema);
