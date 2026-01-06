import mongoose from "mongoose";

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
    medicalRepName: { type: String, required: true },
    teamName: { type: String, required: true },
    contactNo: { 
      type: String, 
      unique: true,
      sparse: true
    },
    email: { 
      type: String, 
      unique: true,
      sparse: true
    },
    date: { type: Date, required: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
  },
  { timestamps: true }
);

// Auto-increment MRId
staffSchema.pre("save", async function (next) {
  if (this.isNew) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        "staffMRId",         // use string ID directly
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

// Important: Export model as "MR" to match StockReturn ref
const Staff = mongoose.model("Staff", staffSchema);
export default Staff;
