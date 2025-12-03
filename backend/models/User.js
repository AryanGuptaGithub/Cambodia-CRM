import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["Medical Representative", "Admin", "Manager"],
      default: "Medical Representative",
    },
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: "Staff" },
    isActive: { type: Boolean, default: true }, 
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
