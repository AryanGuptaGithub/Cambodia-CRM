import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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

const staffSchema = new mongoose.Schema(
  {
    MRId: { type: Number, unique: true },
    medicalRepName: {
      type: String,
      required: true,
      set: normalizeString,
    },
    medicalRepNameLower: {
      type: String,
      unique: true,
      select: false,
    },
    teamName: {
      type: String,
      required: true,
      set: normalizeString,
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
    password: {
      type: String,
      required: true,
      select: false,  // not returned by default
    },
    date: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Pre-save hook for MRId auto-increment, medicalRepNameLower, and password hashing
staffSchema.pre("save", async function (next) {
  // Set lowercase version for case‑insensitive uniqueness
  if (this.medicalRepName) {
    this.medicalRepNameLower = this.medicalRepName.toLowerCase();
  }

  // Hash password if modified
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Auto‑increment MRId only for new documents
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

// Compound index for case‑insensitive name uniqueness
staffSchema.index({ medicalRepNameLower: 1 }, { unique: true });

// Hide password in JSON responses
staffSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

const Staff = mongoose.model("Staff", staffSchema);
export default Staff;