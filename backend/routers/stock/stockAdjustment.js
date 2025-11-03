import express from "express";
import mongoose from "mongoose";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

/* ==========================================================================
   🔧 Function: Update Product Current Stock after Adjustment
   ========================================================================== */
const updateProductCurrentStock = async (productId, boxQuantity, adjustmentType) => {
  try {
    if (boxQuantity <= 0) return;

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`Product not found with ID: ${productId}`);
    }

    // Calculate quantity change based on adjustment type
    const quantityChange = adjustmentType === "add" ? boxQuantity : -boxQuantity;

    // Prevent removing more than available stock
    if (adjustmentType === "remove" && product.currentStock < boxQuantity) {
      throw new Error(
        `Insufficient stock for product "${product.productName}". Available: ${product.currentStock}, Required: ${boxQuantity}`
      );
    }

    const updatedStock = product.currentStock + quantityChange;

    // Update product current stock
    await Product.findByIdAndUpdate(productId, {
      currentStock: updatedStock,
    });

    return product;
  } catch (error) {
    console.error(`❌ Error updating product current stock:`, error.message);
    throw error;
  }
};

/* ==========================================================================
   🔧 Function: Update ReportInHand after Stock Adjustment
   ========================================================================== */
const updateReportInHandAfterAdjustment = async (productName, boxQuantity, adjustmentType) => {
  try {
    if (boxQuantity <= 0) return;

    const existingProduct = await ReportInHand.findOne({ productName });
    if (!existingProduct) {
      console.warn(`⚠️ Product "${productName}" not found in ReportInHand inventory`);
      return;
    }

    // Determine change direction
    const quantityChange = adjustmentType === "add" ? boxQuantity : -boxQuantity;

    // Prevent removing more than available
    if (adjustmentType === "remove" && existingProduct.quantity.boxes < boxQuantity) {
      throw new Error(
        `Insufficient stock in ReportInHand for "${productName}". Available: ${existingProduct.quantity.boxes}, Required: ${boxQuantity}`
      );
    }

    const updatedBoxes = existingProduct.quantity.boxes + quantityChange;

    // Determine new stock status
    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
        status: updatedStatus,
      },
    });
  } catch (error) {
    console.error(`❌ Error updating ReportInHand for product "${productName}":`, error.message);
    throw error;
  }
};

/* ==========================================================================
   🔧 Function: Restore Stock after Adjustment Deletion
   ========================================================================== */
const restoreStockAfterAdjustmentDeletion = async (productName, boxQuantity, adjustmentType) => {
  try {
    if (boxQuantity <= 0) return;

    const existingProduct = await ReportInHand.findOne({ productName });
    if (!existingProduct) return;

    // Reverse the previous operation
    const quantityChange = adjustmentType === "add" ? -boxQuantity : boxQuantity;
    const updatedBoxes = existingProduct.quantity.boxes + quantityChange;

    // Determine new stock status
    let updatedStatus = "In Stock";
    if (updatedBoxes <= 0) updatedStatus = "Out of Stock";
    else if (updatedBoxes < 10) updatedStatus = "Critical";
    else if (updatedBoxes < 25) updatedStatus = "Low Stock";

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        "quantity.boxes": updatedBoxes,
        status: updatedStatus,
      },
    });
  } catch (error) {
    console.error(`❌ Error restoring ReportInHand for product "${productName}":`, error.message);
    throw error;
  }
};

/* ==========================================================================
   🔹 GET: All Stock Adjustments
   ========================================================================== */
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

/* ==========================================================================
   🔹 POST: Create New Stock Adjustment
   ========================================================================== */
router.post("/stock-adjustments", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, boxQuantity, quantityPerCarton, adjustmentType, notes } = req.body;

    // Validation
    if (!productId || !adjustmentType) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Product and adjustment type are required fields",
      });
    }

    if (boxQuantity === undefined || boxQuantity === null || boxQuantity < 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Valid box quantity is required",
      });
    }

    if (quantityPerCarton === undefined || quantityPerCarton === null || quantityPerCarton < 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Valid quantity per carton is required",
      });
    }

    if (!["add", "remove"].includes(adjustmentType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment type. Must be 'add' or 'remove'",
      });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate total quantity based on product's pieces per box
    const piecesPerBox = product.qtyPerCarton || 1;
    const totalQuantity = boxQuantity * piecesPerBox + quantityPerCarton;
    const finalTotalQuantity = adjustmentType === "remove" ? -totalQuantity : totalQuantity;

    // Create the adjustment
    const adjustment = new StockAdjustment({
      productId,
      boxQuantity: parseInt(boxQuantity),
      quantityPerCarton: parseInt(quantityPerCarton),
      totalQuantity: finalTotalQuantity,
      adjustmentType,
      notes: notes || "",
    });

    const savedAdjustment = await adjustment.save({ session });

    // Update Product current stock
    await updateProductCurrentStock(productId, boxQuantity, adjustmentType);

    // Update ReportInHand inventory
    await updateReportInHandAfterAdjustment(product.productName, boxQuantity, adjustmentType);

    // Populate the product data in response
    const populatedAdjustment = await StockAdjustment.findById(savedAdjustment._id)
      .populate({
        path: "productId",
        select: "productName type qtyPerCarton currentStock",
      })
      .session(session);

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      success: true,
      data: populatedAdjustment,
      message: "Stock adjustment created successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    
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

    if (err.message.includes("Insufficient stock")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while creating adjustment",
    });
  }
});

/* ==========================================================================
   🔹 PUT: Update Stock Adjustment
   ========================================================================== */
router.put("/stock-adjustments/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment ID format",
      });
    }

    // Check if adjustment exists
    const existingAdjustment = await StockAdjustment.findById(id);
    if (!existingAdjustment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    // Restore previous stock first
    const oldProduct = await Product.findById(existingAdjustment.productId);
    if (oldProduct) {
      await restoreStockAfterAdjustmentDeletion(
        oldProduct.productName,
        existingAdjustment.boxQuantity,
        existingAdjustment.adjustmentType
      );

      // Restore product current stock
      const reverseChange = existingAdjustment.adjustmentType === "add" ? -existingAdjustment.boxQuantity : existingAdjustment.boxQuantity;
      await Product.findByIdAndUpdate(
        existingAdjustment.productId,
        { $inc: { currentStock: reverseChange } },
        { session }
      );
    }

    // If product is being updated, validate it exists
    if (req.body.productId) {
      const product = await Product.findById(req.body.productId);
      if (!product) {
        await session.abortTransaction();
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

    const updatedAdjustment = await StockAdjustment.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
      session,
    }).populate({
      path: "productId",
      select: "productName type qtyPerCarton currentStock",
    });

    // Apply new stock changes
    if (updatedAdjustment) {
      const product = await Product.findById(updatedAdjustment.productId);
      if (product) {
        await updateProductCurrentStock(
          updatedAdjustment.productId,
          updatedAdjustment.boxQuantity,
          updatedAdjustment.adjustmentType
        );

        await updateReportInHandAfterAdjustment(
          product.productName,
          updatedAdjustment.boxQuantity,
          updatedAdjustment.adjustmentType
        );
      }
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      data: updatedAdjustment,
      message: "Adjustment updated successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

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

    if (err.message.includes("Insufficient stock")) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Server error while updating adjustment",
    });
  }
});

/* ==========================================================================
   🔹 DELETE: Single Stock Adjustment
   ========================================================================== */
router.delete("/stock-adjustments/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment ID format",
      });
    }

    const adjustment = await StockAdjustment.findById(id);
    if (!adjustment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    // Restore stock before deletion
    const product = await Product.findById(adjustment.productId);
    if (product) {
      await restoreStockAfterAdjustmentDeletion(
        product.productName,
        adjustment.boxQuantity,
        adjustment.adjustmentType
      );

      // Restore product current stock
      const reverseChange = adjustment.adjustmentType === "add" ? -adjustment.boxQuantity : adjustment.boxQuantity;
      await Product.findByIdAndUpdate(
        adjustment.productId,
        { $inc: { currentStock: reverseChange } },
        { session }
      );
    }

    const deletedAdjustment = await StockAdjustment.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      data: deletedAdjustment,
      message: "Adjustment deleted successfully",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error deleting adjustment:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting adjustment",
    });
  }
});

/* ==========================================================================
   🔹 DELETE: Bulk Stock Adjustments
   ========================================================================== */
router.delete("/stock-adjustments/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided.",
        invalidIds,
        validIds: validIds.map((id) => id.toString()),
      });
    }

    const adjustments = await StockAdjustment.find({ _id: { $in: validIds } }).session(session);

    // Restore stock for all adjustments
    for (const adjustment of adjustments) {
      const product = await Product.findById(adjustment.productId).session(session);
      if (product) {
        await restoreStockAfterAdjustmentDeletion(
          product.productName,
          adjustment.boxQuantity,
          adjustment.adjustmentType
        );

        // Restore product current stock
        const reverseChange = adjustment.adjustmentType === "add" ? -adjustment.boxQuantity : adjustment.boxQuantity;
        await Product.findByIdAndUpdate(
          adjustment.productId,
          { $inc: { currentStock: reverseChange } },
          { session }
        );
      }
    }

    const result = await StockAdjustment.deleteMany({ _id: { $in: validIds } }, { session });

    if (result.deletedCount === 0) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "No adjustments found to delete.",
      });
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("❗ Bulk delete error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during bulk delete operation.",
      error: error.message,
    });
  }
});

/* ==========================================================================
   🔹 GET: Single Stock Adjustment by ID
   ========================================================================== */
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