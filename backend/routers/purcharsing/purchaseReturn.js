import express from "express";
import mongoose from "mongoose";
import PurchaseReturn from "../../models/purcharsing/purchaseReturns.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import product from "../../models/projectManger/product.js";

const router = express.Router();

/** ✅ Utility: calculate stock status based on boxes count */
const calculateStockStatus = (boxes) => {
  if (boxes <= 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

/** ✅ Core helper: updates ReportInHand for a single product */
const updateReportInHandForProduct = async (
  productData,
  supplierName,
  operation = "subtract"
) => {
  try {
    const {
      productName,
      returnQuantity = 0,
      returnAmount = 0,
      lc = 0,
      fob = 0,
      cif = 0,
    } = productData;

    const validSupplierName = supplierName?.trim() || "Unknown Supplier";
    const boxesToUpdate = returnQuantity;
    const amountToUpdate = returnAmount;

    const existing = await ReportInHand.findOne({ productName });

    if (existing) {
      // Get current values with proper null checking
      const currentBoxes = existing.totalBoxes || 0;
      const currentAmount = existing.totalAmount || 0;

      let finalBoxes =
        operation === "subtract"
          ? currentBoxes - boxesToUpdate
          : currentBoxes + boxesToUpdate;

      let finalAmount =
        operation === "subtract"
          ? currentAmount - amountToUpdate
          : currentAmount + amountToUpdate;

      if (finalBoxes < 0) finalBoxes = 0;
      if (finalAmount < 0) finalAmount = 0;

      const newStatus = calculateStockStatus(finalBoxes);

      await ReportInHand.findByIdAndUpdate(existing._id, {
        $set: {
          totalBoxes: finalBoxes,
          totalAmount: finalAmount,
          status: newStatus,
          supplierName: validSupplierName,
          updatedAt: new Date(),
        },
      });
    } else if (operation === "add") {
      const status = calculateStockStatus(boxesToUpdate);
      await ReportInHand.create({
        productName,
        supplierName: validSupplierName,
        totalBoxes: boxesToUpdate,
        totalAmount: amountToUpdate,
        status,
        lc: lc || 0,
        fob: fob || 0,
        cif: cif || 0,
        minStockLevel: 10,
        batches: [],
      });
    }
  } catch (error) {
    console.error("❌ Error in updateReportInHandForProduct:", error);
    console.error("Product Data:", productData);
    throw error;
  }
};

/** ✅ Core helper: updates Product batches for a single product with FEFO logic */
const updateProductBatchesForProduct = async (
  productData,
  operation = "subtract"
) => {
  try {
    const { productName, returnQuantity = 0, expiredDate } = productData;

    const productDoc = await product.findOne({ productName });
    if (!productDoc) {
      throw new Error(`Product ${productName} not found`);
    }

    // Ensure batches array exists
    if (!productDoc.batches || !Array.isArray(productDoc.batches)) {
      productDoc.batches = [];
    }

    const boxesToUpdate = returnQuantity;
    let remainingBoxes = boxesToUpdate;

    if (operation === "subtract") {
      const sortedBatches = [...productDoc.batches]
        .filter((batch) => batch.boxes > 0)
        .sort((a, b) => {
          const expiryA = a.expiryDate ? new Date(a.expiryDate) : new Date(0);
          const expiryB = b.expiryDate ? new Date(b.expiryDate) : new Date(0);
          return expiryA - expiryB;
        });

      // Subtract from batches in FEFO order
      for (let i = 0; i < sortedBatches.length && remainingBoxes > 0; i++) {
        const batch = sortedBatches[i];
        const batchIndex = productDoc.batches.findIndex(
          (b) => b._id.toString() === batch._id.toString()
        );

        if (batchIndex === -1) continue;

        const subtractQty = Math.min(remainingBoxes, batch.boxes);

        productDoc.batches[batchIndex].boxes -= subtractQty;
        remainingBoxes -= subtractQty;

        // Update batch amount if lc field exists
        if (productDoc.batches[batchIndex].lc !== undefined) {
          productDoc.batches[batchIndex].amount =
            productDoc.batches[batchIndex].lc *
            productDoc.batches[batchIndex].boxes;
        }
      }
    } else {
      if (expiredDate) {
        const targetExpiry = new Date(expiredDate);

        // Try to find batch with matching expiry date
        const batchIndex = productDoc.batches.findIndex((batch) => {
          if (!batch.expiryDate) return false;
          const batchExpiry = new Date(batch.expiryDate);
          return batchExpiry.getTime() === targetExpiry.getTime();
        });

        if (batchIndex !== -1) {
          // Add to existing batch with matching expiry
          productDoc.batches[batchIndex].boxes += boxesToUpdate;

          // Update batch amount if lc field exists
          if (productDoc.batches[batchIndex].lc !== undefined) {
            productDoc.batches[batchIndex].amount =
              productDoc.batches[batchIndex].lc *
              productDoc.batches[batchIndex].boxes;
          }
        } else {
          const newBatch = {
            boxes: boxesToUpdate,
            lc: productData.lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (productData.lc || 0) * boxesToUpdate,
            expiryDate: expiredDate,
            date: productData.date || new Date(),
          };
          productDoc.batches.push(newBatch);
        }
      } else {
        if (productDoc.batches.length > 0) {
          productDoc.batches[0].boxes += boxesToUpdate;
          if (productDoc.batches[0].lc !== undefined) {
            productDoc.batches[0].amount =
              productDoc.batches[0].lc * productDoc.batches[0].boxes;
          }
        } else {
          // Create new batch without specific expiry
          const newBatch = {
            boxes: boxesToUpdate,
            lc: productData.lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (productData.lc || 0) * boxesToUpdate,
            date: productData.date || new Date(),
          };
          productDoc.batches.push(newBatch);
        }
      }
    }

    // Recalculate totals
    productDoc.totalBoxes = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0
    );
    productDoc.totalAmount = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.amount || 0),
      0
    );
    productDoc.status = calculateStockStatus(productDoc.totalBoxes);

    // Remove batches with zero boxes
    productDoc.batches = productDoc.batches.filter((batch) => batch.boxes > 0);

    await productDoc.save();
  } catch (error) {
    console.error("❌ Error in updateProductBatchesForProduct:", error);
    console.error("Product Data:", productData);
    throw error;
  }
};

/** ✅ Process multiple products in purchase return */
const processPurchaseReturnProducts = async (
  purchaseReturnDoc,
  operation = "subtract"
) => {
  try {
    // Ensure we're working with a Mongoose document that has the products array
    const purchaseReturn = purchaseReturnDoc.toObject
      ? purchaseReturnDoc.toObject()
      : purchaseReturnDoc;

    const { products, supplierName } = purchaseReturn;

    if (!products || !Array.isArray(products) || products.length === 0) {
      throw new Error("Products array is required and cannot be empty");
    }

    for (const productData of products) {
      if (!productData.productName) {
        throw new Error("Product name is required for all products");
      }

      try {
        // Update ReportInHand for this product
        await updateReportInHandForProduct(
          productData,
          supplierName,
          operation
        );

        await updateProductBatchesForProduct(productData, operation);
      } catch (productError) {
        console.error(
          `❌ Failed to process product ${productData.productName}:`,
          productError
        );
        throw productError;
      }
    }
  } catch (error) {
    console.error("❌ Error in processPurchaseReturnProducts:", error);
    throw error;
  }
};

router.get("/purchase-return", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search = "",
      status = "",
      startDate = "",
      endDate = "",
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { invoiceNumber: { $regex: search, $options: "i" } },
        { "products.productName": { $regex: search, $options: "i" } },
        { returnReason: { $regex: search, $options: "i" } },
        { supplierName: { $regex: search, $options: "i" } },
      ];
    }

    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.recordingDate = {};
      if (startDate) filter.recordingDate.$gte = new Date(startDate);
      if (endDate) filter.recordingDate.$lte = new Date(endDate);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await PurchaseReturn.countDocuments(filter);

    const purchaseReturns = await PurchaseReturn.find(filter)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(limitNum);

    res.json({
      success: true,
      data: purchaseReturns,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalItems: total,
        itemsPerPage: limitNum,
      },
    });
  } catch (error) {
    console.error("Error fetching purchase returns:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/** ✅ POST create purchase return */
router.post("/purchase-return", async (req, res) => {
  try {
    const data = req.body;

    const { invoiceNumber, products } = data;

    // Validate required fields
    if (!invoiceNumber || !products || !Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "Invoice number and products array are required",
      });
    }

    // Check if purchase return already exists for this invoice
    const existingReturn = await PurchaseReturn.findOne({ invoiceNumber });
    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: "Purchase return for this invoice already exists",
      });
    }

    // Validate each product
    for (const productData of products) {
      const { productName, purchaseQty, returnQuantity, usedQty } = productData;

      if (!productName) {
        return res.status(400).json({
          success: false,
          message: "Product name is required for all products",
        });
      }

      if (returnQuantity > purchaseQty) {
        return res.status(400).json({
          success: false,
          message: `Return quantity cannot exceed purchase quantity for ${productName}`,
        });
      }

      if (usedQty > purchaseQty) {
        return res.status(400).json({
          success: false,
          message: `Used quantity cannot exceed purchase quantity for ${productName}`,
        });
      }

      // Check if product exists and has enough stock in ReportInHand
      const reportInHandDoc = await ReportInHand.findOne({ productName });
      if (!reportInHandDoc) {
        return res.status(400).json({
          success: false,
          message: `Product ${productName} not found in ReportInHand`,
        });
      }

      if (returnQuantity > reportInHandDoc.totalBoxes) {
        return res.status(400).json({
          success: false,
          message: `Return quantity cannot exceed available stock for ${productName}. Available: ${reportInHandDoc.totalBoxes}, Requested: ${returnQuantity}`,
        });
      }
    }

    // Process products data
    const processedProducts = products.map((productData) => ({
      ...productData,
      purchaseQty: parseFloat(productData.purchaseQty),
      returnQuantity: parseFloat(productData.returnQuantity),
      usedQty: parseFloat(productData.usedQty) || 0,
      fob: parseFloat(productData.fob) || 0,
      cif: parseFloat(productData.cif) || 0,
      lc: parseFloat(productData.lc) || 0,
      amount: parseFloat(productData.amount),
      returnAmount: parseFloat(productData.returnAmount),
    }));

    const newPurchaseReturn = new PurchaseReturn({
      ...data,
      products: processedProducts,
    });

    const saved = await newPurchaseReturn.save();
    await processPurchaseReturnProducts(saved, "subtract");

    res.status(201).json({
      success: true,
      message: "Purchase return created successfully",
      data: saved,
    });
  } catch (error) {
    console.error("❌ Error creating purchase return:", error);

    // If there's an error during stock update, delete the purchase return to maintain data consistency
    if (req.body.invoiceNumber) {
      try {
        await PurchaseReturn.findOneAndDelete({
          invoiceNumber: req.body.invoiceNumber,
        });
      } catch (deleteError) {
        console.error("❌ Error rolling back purchase return:", deleteError);
      }
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

/** ✅ PUT update purchase return */
router.put("/purchase-return/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const originalReturn = await PurchaseReturn.findById(id);
    if (!originalReturn) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });
    }

    // Add back original stock first to both systems
    await processPurchaseReturnProducts(originalReturn, "add");

    const updated = await PurchaseReturn.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    // Subtract new return quantity from both systems
    await processPurchaseReturnProducts(updated, "subtract");

    res.json({
      success: true,
      message: "Purchase return updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating purchase return:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ DELETE single purchase return */
router.delete("/purchase-return/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id);

    if (!purchaseReturn) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });
    }

    await processPurchaseReturnProducts(purchaseReturn, "add");

    const deleted = await PurchaseReturn.findByIdAndDelete(id);
    res.json({
      success: true,
      message: "Purchase return deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("Error deleting purchase return:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ BULK DELETE */
router.delete("/purchase-return", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No IDs provided" });
    }

    const purchaseReturns = await PurchaseReturn.find({ _id: { $in: ids } });

    for (const p of purchaseReturns) {
      await processPurchaseReturnProducts(p, "add");
    }

    const result = await PurchaseReturn.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `${result.deletedCount} purchase returns deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting purchase returns:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ GET by invoice */
router.get("/purchase-return/invoice/:invoiceNumber", async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const results = await PurchaseReturn.find({
      invoiceNumber: new RegExp(invoiceNumber, "i"),
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching purchase returns by invoice:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ Stats summary */
router.get("/purchase-return/stats/summary", async (req, res) => {
  try {
    const totalReturns = await PurchaseReturn.countDocuments();
    const pendingReturns = await PurchaseReturn.countDocuments({
      status: "pending",
    });
    const approvedReturns = await PurchaseReturn.countDocuments({
      status: "approved",
    });
    const completedReturns = await PurchaseReturn.countDocuments({
      status: "completed",
    });

    // Aggregate amounts and quantities from products array
    const [amountAgg, qtyAgg] = await Promise.all([
      PurchaseReturn.aggregate([
        { $unwind: "$products" },
        { $group: { _id: null, total: { $sum: "$products.returnAmount" } } },
      ]),
      PurchaseReturn.aggregate([
        { $unwind: "$products" },
        { $group: { _id: null, total: { $sum: "$products.returnQuantity" } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        totalReturns,
        pendingReturns,
        approvedReturns,
        completedReturns,
        totalReturnAmount: amountAgg[0]?.total || 0,
        totalReturnQuantity: qtyAgg[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ PATCH update status */
router.patch("/purchase-return/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "rejected", "completed"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    const updated = await PurchaseReturn.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });
    }

    res.json({
      success: true,
      message: `Status updated to ${status}`,
      data: updated,
    });
  } catch (error) {
    console.error("Error updating status:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
