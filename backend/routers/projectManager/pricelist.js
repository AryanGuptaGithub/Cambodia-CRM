import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Product from "../../models/projectManger/product.js";

router.get("/pricelist", async (req, res) => {
  try {
    const priceList = await Product.find({}, {
      productName: 1,
      sellingPrice: 1,
      lc: 1,
      taxSellingPrice: 1,
      type: 1,
      drugLicense: 1,
      licenseValidityDate: 1,
    }).sort({ productName: 1 });
  
    res.status(200).json(priceList);
  } catch (error) {
    console.error("Error fetching price list:", error);
    res.status(500).json({ message: "Failed to fetch price list." });
  }
});

// PUT /pricelist/:id - Update selected fields only
router.put("/pricelist/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      sellingPrice,
      lc,
      taxSellingPrice,
      type,
      drugLicense,
      licenseValidityDate
    } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      {
        productName,
        sellingPrice,
        lc,
        taxSellingPrice,
        type,
        drugLicense,
        licenseValidityDate
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Failed to update product." });
  }
});

export default router;
