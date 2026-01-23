import express from "express";
import mongoose from "mongoose";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

const updateProductCurrentStock = async (
  productId,
  boxQuantity,
  adjustmentType,
  qtyPerCarton
) => {
  try {
    if (boxQuantity <= 0) return;

    const product = await Product.findById(productId);
    if (!product) {
      throw new Error(`Product not found with ID: ${productId}`);
    }

    const piecesPerBox = qtyPerCarton || product.qtyPerCarton || 1;
    const piecesChange =
      adjustmentType === "add"
        ? boxQuantity * piecesPerBox
        : -(boxQuantity * piecesPerBox);

    if (
      adjustmentType === "remove" &&
      product.currentStock < Math.abs(piecesChange)
    ) {
      throw new Error(
        `Insufficient stock for product "${product.productName}". Available: ${
          product.currentStock
        }, Required: ${Math.abs(piecesChange)}`
      );
    }

    const updatedStock = product.currentStock + piecesChange;
    await Product.findByIdAndUpdate(productId, {
      currentStock: Math.max(0, updatedStock),
    });

    return product;
  } catch (error) {
    console.error(`❌ Error updating product current stock:`, error.message);
    throw error;
  }
};

// UPDATED: Function to update ReportInHand after adjustment
const updateReportInHandAfterAdjustment = async (
  productName,
  boxQuantity,
  adjustmentType,
  adjustmentId,
  remarks = ""
) => {
  try {
    if (boxQuantity <= 0) return;
    
    const normalizedProductName = productName.toLowerCase().trim();
    
    let existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${normalizedProductName}$`, "i") }
    });
    
    if (!existingProduct) {
      console.warn(
        `⚠️ Product "${productName}" not found in ReportInHand inventory`
      );
      return;
    }

    // Validate stock for removal
    if (adjustmentType === "remove") {
      const availableStock = existingProduct.totalBoxesFromBatches + 
                            existingProduct.addStockAdjustment - 
                            existingProduct.removeStockAdjustment;
      
      if (availableStock < boxQuantity) {
        throw new Error(
          `Insufficient stock in ReportInHand for "${productName}". Available: ${availableStock}, Required: ${boxQuantity}`
        );
      }
    }

    // Add adjustment as a new batch entry with adjustmentType
    const newBatchEntry = {
      boxes: boxQuantity,
      lc: 0,
      fob: 0,
      cif: 0,
      amount: 0,
      date: new Date(),
      adjustmentType: adjustmentType,
      adjustmentId: adjustmentId,
      remarks: remarks || `${adjustmentType} adjustment`
    };

    existingProduct.batches.push(newBatchEntry);
    await existingProduct.save();  
  } catch (error) {
    console.error(
      `❌ Error updating ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

// UPDATED: Function to restore stock after adjustment deletion
const restoreStockAfterAdjustmentDeletion = async (adjustmentId) => {
  try {
    // Find the product by looking for the batch with this adjustmentId
    const product = await ReportInHand.findOne({
      "batches.adjustmentId": adjustmentId
    });
    
    if (!product) {
      console.warn(`⚠️ Adjustment ${adjustmentId} not found in ReportInHand batches`);
      return;
    }

    // Remove the batch entry with this adjustmentId
    const batchIndex = product.batches.findIndex(
      batch => batch.adjustmentId && batch.adjustmentId.toString() === adjustmentId.toString()
    );
    
    if (batchIndex === -1) {
      return;
    }
    
    product.batches.splice(batchIndex, 1);
    await product.save();
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for adjustment ${adjustmentId}:`,
      error.message
    );
    throw error;
  }
};

// UPDATED: Function to update existing adjustment
const updateExistingAdjustmentInReport = async (
  oldAdjustmentId,
  newAdjustmentId,
  productName,
  newBoxQuantity,
  newAdjustmentType,
  remarks = ""
) => {
  try {
    const normalizedProductName = productName.toLowerCase().trim();
    
    let existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${normalizedProductName}$`, "i") }
    });
    
    if (!existingProduct) {
      throw new Error(`Product "${productName}" not found in ReportInHand`);
    }

    // Find and remove old batch entry
    const oldBatchIndex = existingProduct.batches.findIndex(
      batch => batch.adjustmentId && batch.adjustmentId.toString() === oldAdjustmentId.toString()
    );
    
    if (oldBatchIndex !== -1) {
      existingProduct.batches.splice(oldBatchIndex, 1);
    }

    // Add new batch entry
    const newBatchEntry = {
      boxes: newBoxQuantity,
      lc: 0,
      fob: 0,
      cif: 0,
      amount: 0,
      date: new Date(),
      adjustmentType: newAdjustmentType,
      adjustmentId: newAdjustmentId,
      remarks: remarks || `${newAdjustmentType} adjustment`
    };

    existingProduct.batches.push(newBatchEntry);
    await existingProduct.save();
  } catch (error) {
    console.error(
      `❌ Error updating adjustment in ReportInHand:`,
      error.message
    );
    throw error;
  }
};

// GET all stock adjustments
router.get("/stock-adjustments", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate({
        path: "productId",
        select: "productName qtyPerCarton currentStock",
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

// POST create new stock adjustment
router.post("/stock-adjustments", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, boxQuantity, adjustmentType, remarks } = req.body;

    if (!productId || !adjustmentType) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Product and adjustment type are required fields",
      });
    }

    if (boxQuantity === undefined || boxQuantity === null || boxQuantity < 1) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Valid box quantity (minimum 1) is required",
      });
    }

    if (!["add", "remove"].includes(adjustmentType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid adjustment type. Must be 'add' or 'remove'",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const piecesPerBox = product.qtyPerCarton || 1;
    const totalPieces = boxQuantity * piecesPerBox;
    const totalQuantity =
      adjustmentType === "remove" ? -totalPieces : totalPieces;

    // Create the adjustment
    const adjustment = new StockAdjustment({
      productId,
      boxQuantity: parseInt(boxQuantity),
      totalQuantity,
      adjustmentType,
      remarks: remarks || "",
    });

    const savedAdjustment = await adjustment.save({ session });

    // Update Product current stock
    await updateProductCurrentStock(
      productId,
      boxQuantity,
      adjustmentType,
      piecesPerBox
    );

    // Update ReportInHand with adjustment batch entry
    await updateReportInHandAfterAdjustment(
      product.productName,
      boxQuantity,
      adjustmentType,
      savedAdjustment._id,
      remarks
    );

    const populatedAdjustment = await StockAdjustment.findById(
      savedAdjustment._id
    )
      .populate({
        path: "productId",
        select: "productName qtyPerCarton currentStock",
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

// PUT update stock adjustment
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

    const existingAdjustment = await StockAdjustment.findById(id);
    if (!existingAdjustment) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Adjustment not found",
      });
    }

    const oldProduct = await Product.findById(existingAdjustment.productId);
    if (!oldProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Restore previous stock first
    const reversePiecesPerBox = oldProduct.qtyPerCarton || 1;
    const reversePiecesChange =
      existingAdjustment.adjustmentType === "add"
        ? -(existingAdjustment.boxQuantity * reversePiecesPerBox)
        : existingAdjustment.boxQuantity * reversePiecesPerBox;

    await Product.findByIdAndUpdate(
      existingAdjustment.productId,
      { $inc: { currentStock: reversePiecesChange } },
      { session }
    );

    // Remove old adjustment from ReportInHand
    await restoreStockAfterAdjustmentDeletion(id);

    // If product is being updated, validate it exists
    let product = oldProduct;
    if (
      req.body.productId &&
      req.body.productId !== existingAdjustment.productId.toString()
    ) {
      product = await Product.findById(req.body.productId);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: "New product not found",
        });
      }
    }

    // Recalculate total quantity
    const boxQuantity =
      req.body.boxQuantity !== undefined
        ? req.body.boxQuantity
        : existingAdjustment.boxQuantity;
    const adjustmentType =
      req.body.adjustmentType || existingAdjustment.adjustmentType;
    const productId = req.body.productId || existingAdjustment.productId;

    const piecesPerBox = product.qtyPerCarton || 1;
    const totalPieces = boxQuantity * piecesPerBox;
    req.body.totalQuantity =
      adjustmentType === "remove" ? -totalPieces : totalPieces;

    // Update the adjustment
    const updatedAdjustment = await StockAdjustment.findByIdAndUpdate(
      id,
      { ...req.body, _id: id }, // Keep the same ID
      {
        new: true,
        runValidators: true,
        session,
      }
    ).populate({
      path: "productId",
      select: "productName qtyPerCarton currentStock",
    });

    // Apply new stock changes
    await updateProductCurrentStock(
      productId,
      boxQuantity,
      adjustmentType,
      piecesPerBox
    );

    // Add updated adjustment to ReportInHand
    await updateExistingAdjustmentInReport(
      id,
      updatedAdjustment._id,
      product.productName,
      boxQuantity,
      adjustmentType,
      req.body.remarks
    );

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

// DELETE stock adjustment
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

    const product = await Product.findById(adjustment.productId);
    if (!product) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Restore product current stock
    const piecesPerBox = product.qtyPerCarton || 1;
    const reversePiecesChange =
      adjustment.adjustmentType === "add"
        ? -(adjustment.boxQuantity * piecesPerBox)
        : adjustment.boxQuantity * piecesPerBox;

    await Product.findByIdAndUpdate(
      adjustment.productId,
      { $inc: { currentStock: reversePiecesChange } },
      { session }
    );

    // Remove adjustment from ReportInHand
    await restoreStockAfterAdjustmentDeletion(id);

    const deletedAdjustment = await StockAdjustment.findByIdAndDelete(id, {
      session,
    });

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

// Bulk delete (similar structure, needs ReportInHand update)
router.delete("/stock-adjustments/bulk", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: "No adjustment IDs provided for bulk deletion.",
      });
    }

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
      session.endSession();

      return res.status(400).json({
        success: false,
        message: "Invalid ID(s) provided.",
        invalidIds,
      });
    }

    const adjustments = await StockAdjustment.find({
      _id: { $in: validIds },
    }).session(session);

    if (adjustments.length === 0) {
      await session.abortTransaction();
      session.endSession();

      return res.status(404).json({
        success: false,
        message: "No adjustments found with the provided IDs.",
      });
    }

    // Restore stock for each adjustment
    for (const adjustment of adjustments) {
      const product = await Product.findById(adjustment.productId).session(
        session
      );

      if (product) {
        const piecesPerBox = product.qtyPerCarton || 1;
        const reversePiecesChange =
          adjustment.adjustmentType === "add"
            ? -(adjustment.boxQuantity * piecesPerBox)
            : adjustment.boxQuantity * piecesPerBox;

        await Product.findByIdAndUpdate(
          adjustment.productId,
          { $inc: { currentStock: reversePiecesChange } },
          { session }
        );

        // Remove from ReportInHand
        await restoreStockAfterAdjustmentDeletion(adjustment._id);
      }
    }

    const result = await StockAdjustment.deleteMany(
      { _id: { $in: validIds } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
    return res.status(200).json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("🔥 Error occurred:", error);

    await session.abortTransaction();
    session.endSession();
    return res.status(500).json({
      success: false,
      message: "Server error during bulk delete operation.",
      error: error.message,
    });
  }
});

// GET single adjustment
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
      select: "productName qtyPerCarton currentStock",
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