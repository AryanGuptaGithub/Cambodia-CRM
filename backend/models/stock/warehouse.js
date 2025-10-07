import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Warehouse", warehouseSchema);