import express from "express";
import mongoose from "mongoose";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import Product from "../../models/projectManger/product.js";
const router = express.Router();

// GET all adjustments
router.get("/stock-adjustments", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: adjustments });
  } catch (err) {
    console.error("Error fetching stock adjustments:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST create a new adjustment
router.post("/stock-adjustments", async (req, res) => {
  try {
    const {
      productId,
      boxQuantity,
      quantityPerCarton,
      totalQuantity,
      adjustmentType,
      notes,
    } = req.body;

    // Validation
    if (
      !productId ||
      !boxQuantity ||
      !quantityPerCarton ||
      !totalQuantity ||
      !adjustmentType
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!["add", "remove"].includes(adjustmentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment type",
      });
    }

    const adjustment = new StockAdjustment({
      productId,
      boxQuantity,
      quantityPerCarton,
      totalQuantity,
      adjustmentType,
      notes: notes || "",
    });

    await adjustment.save();

    return res.status(201).json({ success: true, data: adjustment });
  } catch (err) {
    console.error("Error creating adjustment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT (update) an adjustment
router.put("/stock-adjustments/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }

  try {
    const updated = await StockAdjustment.findByIdAndUpdate(id, req.body, {
      new: true,
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error("Error updating adjustment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE an adjustment
router.delete("/stock-adjustments/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }
  try {
    const deleted = await StockAdjustment.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    return res.status(200).json({ success: true, data: deleted });
  } catch (err) {
    console.error("Error deleting adjustment:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/stock-adjustments/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: products, // ✅ Send the entire product array
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching products",
    });
  }
});

export default router;
