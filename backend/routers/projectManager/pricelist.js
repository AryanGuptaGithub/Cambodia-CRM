import express from "express";
import mongoose from "mongoose";
const router = express.Router();
import Product from "../../models/projectManger/product.js";

// GET PRICE LIST
router.get("/", async (req, res) => {
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
    
    // Format for display (capitalize first letter of each word)
    const formattedPriceList = priceList.map(product => ({
      ...product.toObject(),
      productName: product.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: product.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      drugLicense: product.drugLicense
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    }));
  
    res.status(200).json(formattedPriceList);
  } catch (error) {
    console.error("Error fetching price list:", error);
    res.status(500).json({ message: "Failed to fetch price list." });
  }
});

// UPDATE PRICE LIST ITEM
router.put("/:id", async (req, res) => {
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

    // Normalize string fields to lowercase before saving
    const normalizeString = (str) => {
      if (!str) return "";
      return str.toString().trim().toLowerCase();
    };

    const updateData = {
      productName: productName ? normalizeString(productName) : undefined,
      sellingPrice,
      lc,
      taxSellingPrice,
      type: type ? normalizeString(type) : undefined,
      drugLicense: drugLicense ? normalizeString(drugLicense) : undefined,
      licenseValidityDate
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => 
      updateData[key] === undefined && delete updateData[key]
    );

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    // Format for display
    const formattedProduct = {
      ...updatedProduct.toObject(),
      productName: updatedProduct.productName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      type: updatedProduct.type
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
      drugLicense: updatedProduct.drugLicense
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    };

    res.status(200).json(formattedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Failed to update product." });
  }
});

export default router;