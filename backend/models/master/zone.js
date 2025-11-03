import mongoose from "mongoose";

// Schema for Zones
const zoneSchema = new mongoose.Schema({
  name: {           // Name of the zone (e.g., "North", "South", etc.)
    type: String,
    required: true,
    unique: true,   // Ensures no duplicate zones
    trim: true,
  },
  createdAt: {      // Optional timestamp
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Zone", zoneSchema);