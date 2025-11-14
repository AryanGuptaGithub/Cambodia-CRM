import mongoose from "mongoose";

// Counter for auto-increment
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

const staffSchema = new mongoose.Schema(
  {
    MRId: { type: Number, unique: true },
    medicalRepName: { type: String, required: true },
    teamName: { type: String, required: true },
    contactNo: { 
      type: String, 
      required: false, 
      unique: true, // Add unique constraint
      sparse: true  // Allows multiple null values but enforces uniqueness for non-null values
    },
    email: { type: String, required: false },
    date: { type: Date, required: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Auto-increment MRId
staffSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        { _id: "staffMRId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      this.MRId = counter.seq;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

export default mongoose.model("Staff", staffSchema);