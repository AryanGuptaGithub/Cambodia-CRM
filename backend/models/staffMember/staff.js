import mongoose from "mongoose";

// Helper function to normalize strings
const normalizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/\s+/g, ' ').trim();
};

// Counter for auto-increment
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

// Staff / MR schema
const staffSchema = new mongoose.Schema(
  {
    MRId: { type: Number, unique: true },
    medicalRepName: { 
      type: String, 
      required: true,
      set: normalizeString // Auto-normalize on set
    },
    teamName: { 
      type: String, 
      required: true,
      set: normalizeString // Auto-normalize on set
    },
    contactNo: { 
      type: String, 
      unique: true,
      sparse: true,
      set: (val) => val ? normalizeString(val.toString()) : val
    },
    email: { 
      type: String, 
      unique: true,
      sparse: true,
      set: (val) => val ? normalizeString(val).toLowerCase() : val
    },
    date: { type: Date, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

// Auto-increment MRId
staffSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        "staffMRId",
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

const Staff = mongoose.model("Staff", staffSchema);
export default Staff;