import mongoose from "mongoose";

const staffSchema = new mongoose.Schema(
  {
    medicalRepName: { 
      type: String, 
      required: true 
    },
    teamName: { 
      type: String, 
      required: true 
    },
    contactNo: { 
      type: String, 
      required: false,
    },
    email: { 
      type: String, 
      required: false 
    },
    enabled: { 
      type: Boolean, 
      required: false, 
      default: true 
    },
  },
  { timestamps: true }
);

export default mongoose.model("staff", staffSchema);