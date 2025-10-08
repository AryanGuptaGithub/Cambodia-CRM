import express from "express";
import mongoose from "mongoose";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import Product from "../../models/projectManger/product.js";
const router = express.Router();

// GET all stock adjustments
router.get("/stock-adjustments", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate({
        path: "productId",
        select: "productName type qtyPerCarton currentStock",
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: adjustments,
      count: adjustments.length,
    });
  } catch (err) {
    console.error("Error fetching stock adjustments:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching adjustments",
    });
  }
});

router.post("/stock-adjustments", async (req, res) => {
  try {
    const { productId, boxQuantity, quantityPerCarton, adjustmentType, notes } =
      req.body;
    if (!productId || !adjustmentType) {
      return res.status(400).json({
        success: false,
        message: "Product and adjustment type are required fields",
      });
    }

    if (boxQuantity === undefined || boxQuantity === null || boxQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: "Valid box quantity is required",
      });
    }

    if (
      quantityPerCarton === undefined ||
      quantityPerCarton === null ||
      quantityPerCarton < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid quantity per carton is required",
      });
    }

    if (!["add", "remove"].includes(adjustmentType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment type. Must be 'add' or 'remove'",
      });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate total quantity based on product's pieces per box
    const piecesPerBox = product.qtyPerCarton || 1;
    const totalQuantity = boxQuantity * piecesPerBox + quantityPerCarton;
    const finalTotalQuantity =
      adjustmentType === "remove" ? -totalQuantity : totalQuantity;

    const adjustment = new StockAdjustment({
      productId,
      boxQuantity: parseInt(boxQuantity),
      quantityPerCarton: parseInt(quantityPerCarton),
      totalQuantity: finalTotalQuantity,
      adjustmentType,
      notes: notes || "",
    });

    await adjustment.save();

    // Populate the product data in response
    const populatedAdjustment = await StockAdjustment.findById(
      adjustment._id
    ).populate({
      path: "productId",
      select: "productName type qtyPerCarton currentStock",
    });

    return res.status(201).json({
      success: true,
      data: populatedAdjustment,
      message: "Stock adjustment created successfully",
    });
  } catch (err) {
    console.error("Error creating adjustment:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Validation error: " +
          Object.values(err.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }

    if (err.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating adjustment",
    });
  }
});

// PUT (update) an adjustment
router.put("/stock-adjustments/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid adjustment ID format",
    });
  }

  try {
    // Check if adjustment exists
    const existingAdjustment = await StockAdjustment.findById(id);
    if (!existingAdjustment) {
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    // If product is being updated, validate it exists
    if (req.body.productId) {
      const product = await Product.findById(req.body.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }
    }

    // Recalculate total quantity if boxQuantity, quantityPerCarton, or productId changes
    if (
      req.body.boxQuantity !== undefined ||
      req.body.quantityPerCarton !== undefined ||
      req.body.productId
    ) {
      const productId = req.body.productId || existingAdjustment.productId;
      const product = await Product.findById(productId);
      const piecesPerBox = product?.qtyPerCarton || 1;

      const boxQuantity =
        req.body.boxQuantity !== undefined
          ? req.body.boxQuantity
          : existingAdjustment.boxQuantity;
      const quantityPerCarton =
        req.body.quantityPerCarton !== undefined
          ? req.body.quantityPerCarton
          : existingAdjustment.quantityPerCarton;
      const adjustmentType =
        req.body.adjustmentType || existingAdjustment.adjustmentType;

      const totalQuantity = boxQuantity * piecesPerBox + quantityPerCarton;
      req.body.totalQuantity =
        adjustmentType === "remove" ? -totalQuantity : totalQuantity;
    }

    const updated = await StockAdjustment.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    }).populate({
      path: "productId",
      select: "productName type qtyPerCarton currentStock",
    });

    return res.status(200).json({
      success: true,
      data: updated,
      message: "Adjustment updated successfully",
    });
  } catch (err) {
    console.error("Error updating adjustment:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message:
          "Validation error: " +
          Object.values(err.errors)
            .map((e) => e.message)
            .join(", "),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating adjustment",
    });
  }
});

// DELETE multiple adjustments (bulk delete)
router.delete("/stock-adjustments/bulk", async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No adjustment IDs provided for bulk deletion.",
      });
    }

    // Validate all IDs
    const validIds = [];
    const invalidIds = [];

    ids.forEach((id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        validIds.push(new mongoose.Types.ObjectId(id));
      } else {
        invalidIds.push(id);
      }
    });

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided.",
        invalidIds,
        validIds: validIds.map((id) => id.toString()),
      });
    }

    const existingAdjustments = await StockAdjustment.find({
      _id: { $in: validIds },
    }).select("_id");

    const existingIds = existingAdjustments.map((adj) => adj._id.toString());
    const nonExistingIds = validIds
      .filter((id) => !existingIds.includes(id.toString()))
      .map((id) => id.toString());

    if (nonExistingIds.length > 0) {
      return res.status(404).json({
        success: false,
        message: "Some adjustments not found.",
        nonExistingIds,
        existingIds,
      });
    }

    const result = await StockAdjustment.deleteMany({ _id: { $in: validIds } });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No adjustments found to delete.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("❗ Bulk delete error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during bulk delete operation.",
      error: error.message,
    });
  }
});
router.delete("/stock-adjustments/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid adjustment ID format",
    });
  }

  try {
    const deleted = await StockAdjustment.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: deleted,
      message: "Adjustment deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting adjustment:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting adjustment",
    });
  }
});

// GET single adjustment by ID
router.get("/stock-adjustments/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid adjustment ID format",
    });
  }

  try {
    const adjustment = await StockAdjustment.findById(id).populate({
      path: "productId",
      select: "productName type qtyPerCarton currentStock",
    });

    if (!adjustment) {
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: adjustment,
    });
  } catch (err) {
    console.error("Error fetching adjustment:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching adjustment",
    });
  }
});

export default router;
