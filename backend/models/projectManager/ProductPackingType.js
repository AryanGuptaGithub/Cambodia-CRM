import mongoose from "mongoose";

const productPackingTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt fields
  }
);

const ProductPackingType = mongoose.model(
  "ProductPackingType",
  productPackingTypeSchema
);

export default ProductPackingType;
