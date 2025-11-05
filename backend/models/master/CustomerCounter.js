// models/CustomerCounter.js
import mongoose from "mongoose";

const customerCounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // e.g. "customerCounter"
  seq: { type: Number, default: 0 },
});

export default mongoose.model("CustomerCounter", customerCounterSchema);
