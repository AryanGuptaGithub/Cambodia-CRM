// models/Brand.js
import mongoose from "mongoose";

const brandSchema = new mongoose.Schema(
  {
    brandName: { type: String, required: true },
    brandUrl: { type: String },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);

const Brand = mongoose.model("Brand", brandSchema);

export default Brand;  // ✅ ESM export
