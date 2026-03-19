import mongoose from "mongoose";

// Helper function to normalize strings
const normalizeString = (str) => {
  if (!str || typeof str !== "string") return "";
  return str.replace(/\s+/g, " ").trim();
};

// Counter for auto-increment
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

// Staff / MR schema – no reference to User
const staffSchema = new mongoose.Schema(
  {
    MRId: { type: Number, unique: true },
    medicalRepName: {
      type: String,
      required: true,
      set: normalizeString, // Auto-normalize on set
    },
    // Add lowercase index for case-insensitive uniqueness
    medicalRepNameLower: {
      type: String,
      unique: true,
      select: false, // Don't include in queries by default
    },
    teamName: {
      type: String,
      required: true,
      set: normalizeString, // Auto-normalize on set
    },
    contactNo: {
      type: String,
      unique: true,
      sparse: true,
      set: (val) => (val ? normalizeString(val.toString()) : val),
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      set: (val) => (val ? normalizeString(val).toLowerCase() : val),
    },
    date: { type: Date, required: true },
    isActive: { type: Boolean, default: true }, // staff-specific active flag
  },
  { timestamps: true },
);

// Pre-save hook to set medicalRepNameLower and auto-increment MRId
staffSchema.pre("save", async function (next) {
  // Always set the lowercase version for uniqueness checking
  if (this.medicalRepName) {
    this.medicalRepNameLower = this.medicalRepName.toLowerCase();
  }

  // Auto-increment MRId only for new documents
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        "staffMRId",
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
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

// Create compound index for case-insensitive uniqueness
staffSchema.index({ medicalRepNameLower: 1 }, { unique: true });

const Staff = mongoose.model("Staff", staffSchema);
export default Staff;
