// models/CategoryType.js
import mongoose from "mongoose";

const categoryTypeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },

  isActive: {
    type: Boolean,
    default: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("CategoryType", categoryTypeSchema);
