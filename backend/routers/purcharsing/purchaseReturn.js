import express from "express";
import mongoose from "mongoose";
import PurchaseReturn from "../../models/purcharsing/purchaseReturns.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

/** ✅ Utility: calculate stock status based on boxes count */
const calculateStockStatus = (boxes) => {
  if (boxes <= 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

/** ✅ Core helper: updates ReportInHand for purchase returns with average price calculation */
const updateReportInHandForPurchaseReturn = async (
  productData,
  supplierName,
  operation = "subtract", // Changed to subtract for purchase returns (return to supplier)
) => {
  try {
    const {
      productName,
      returnQuantity = 0,
      returnAmount = 0,
      lc = 0,
      fob = 0,
      cif = 0,
      expiredDate,
    } = productData;

    const validSupplierName = supplierName?.trim() || "Unknown Supplier";
    const boxesToUpdate = returnQuantity;
    const amountToUpdate = returnAmount;

    // Find the existing product in ReportInHand (case-insensitive search)
    const existing = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (existing) {
      // Make a copy of batches
      let updatedBatches = [...(existing.batches || [])];
      let totalBoxes = existing.totalBoxes || 0;
      let totalAmount = existing.totalAmount || 0;

      if (operation === "subtract") {
        // For purchase returns: remove stock (return to supplier)
        let remainingToRemove = boxesToUpdate;

        // Sort batches by date (FIFO - First In First Out)
        updatedBatches.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Remove from batches
        for (
          let i = 0;
          i < updatedBatches.length && remainingToRemove > 0;
          i++
        ) {
          const batch = updatedBatches[i];

          if (batch.boxes <= remainingToRemove) {
            // Remove entire batch
            remainingToRemove -= batch.boxes;
            totalBoxes -= batch.boxes;
            totalAmount -= batch.amount || batch.boxes * batch.lc || 0;
            updatedBatches[i] = null; // Mark for removal
          } else {
            // Remove partial from this batch
            batch.boxes -= remainingToRemove;
            batch.amount = batch.boxes * (batch.lc || lc || 0);
            totalBoxes -= remainingToRemove;
            totalAmount -= remainingToRemove * (batch.lc || lc || 0);
            remainingToRemove = 0;
          }
        }

        // Filter out null batches (removed ones)
        updatedBatches = updatedBatches.filter(
          (b) => b !== null && b.boxes > 0,
        );
      } else {
        // operation === "add" - For undoing a purchase return
        // Add a new batch with the returned stock
        const newBatch = {
          boxes: boxesToUpdate,
          lc: lc,
          fob: fob,
          cif: cif,
          amount: amountToUpdate,
          expiryDate: expiredDate ? new Date(expiredDate) : null,
          date: new Date(),
        };

        updatedBatches.push(newBatch);
        totalBoxes += boxesToUpdate;
        totalAmount += amountToUpdate;

        // Sort by date after adding
        updatedBatches.sort((a, b) => new Date(a.date) - new Date(b.date));
      }

      // Calculate new average price
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;
      const status = calculateStockStatus(totalBoxes);

      if (totalBoxes <= 0) {
        // Delete if no stock left
        await ReportInHand.findByIdAndDelete(existing._id);
      } else {
        // Update the document
        await ReportInHand.findByIdAndUpdate(existing._id, {
          $set: {
            batches: updatedBatches,
            totalBoxes,
            totalAmount,
            averagePrice,
            status,
            supplierName: validSupplierName,
            updatedAt: new Date(),
          },
        });
      }
    } else if (operation === "add") {
      // Creating a new product in ReportInHand (should not happen for purchase returns)
      const averagePrice =
        boxesToUpdate > 0 ? amountToUpdate / boxesToUpdate : 0;
      const status = calculateStockStatus(boxesToUpdate);

      await ReportInHand.create({
        productName,
        supplierName: validSupplierName,
        totalBoxes: boxesToUpdate,
        totalAmount: amountToUpdate,
        averagePrice,
        status,
        lc: lc || 0,
        fob: fob || 0,
        cif: cif || 0,
        minStockLevel: 10,
        batches: [
          {
            boxes: boxesToUpdate,
            lc: lc,
            fob: fob,
            cif: cif,
            amount: amountToUpdate,
            expiryDate: expiredDate ? new Date(expiredDate) : null,
            date: new Date(),
          },
        ],
      });
    }
  } catch (error) {
    console.error("❌ Error in updateReportInHandForPurchaseReturn:", error);
    console.error("Product Data:", productData);
    throw error;
  }
};

/** ✅ Core helper: updates Product batches for a single product with FEFO logic and average price */
const updateProductBatchesForPurchaseReturn = async (
  productData,
  operation = "subtract", // Changed to subtract for purchase returns
) => {
  try {
    const {
      productName,
      returnQuantity = 0,
      expiredDate,
      lc = 0,
    } = productData;

    const productDoc = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

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
      // For purchase returns: remove from stock
      const sortedBatches = [...productDoc.batches]
        .filter((batch) => batch.boxes > 0)
        .sort((a, b) => {
          const expiryA = a.expiryDate ? new Date(a.expiryDate) : new Date(0);
          const expiryB = b.expiryDate ? new Date(b.expiryDate) : new Date(0);
          return expiryA - expiryB; // FEFO: First Expiry First Out
        });

      // Subtract from batches in FEFO order
      for (let i = 0; i < sortedBatches.length && remainingBoxes > 0; i++) {
        const batch = sortedBatches[i];
        const batchIndex = productDoc.batches.findIndex(
          (b) => b._id.toString() === batch._id.toString(),
        );

        if (batchIndex === -1) continue;

        const subtractQty = Math.min(remainingBoxes, batch.boxes);

        productDoc.batches[batchIndex].boxes -= subtractQty;
        remainingBoxes -= subtractQty;

        // Update batch amount
        if (productDoc.batches[batchIndex].lc !== undefined) {
          productDoc.batches[batchIndex].amount =
            productDoc.batches[batchIndex].lc *
            productDoc.batches[batchIndex].boxes;
        }
      }
    } else {
      // operation === "add" - For undoing a purchase return
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

          // Update batch amount
          if (productDoc.batches[batchIndex].lc !== undefined) {
            productDoc.batches[batchIndex].amount =
              productDoc.batches[batchIndex].lc *
              productDoc.batches[batchIndex].boxes;
          }
        } else {
          // Create new batch with expiry date
          const newBatch = {
            boxes: boxesToUpdate,
            lc: lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (lc || 0) * boxesToUpdate,
            expiryDate: expiredDate,
            date: new Date(),
          };
          productDoc.batches.push(newBatch);
        }
      } else {
        // If no expiry date, add to the most recent batch or create new
        if (productDoc.batches.length > 0) {
          // Add to the first batch (assuming it's the most recent)
          productDoc.batches[0].boxes += boxesToUpdate;
          if (productDoc.batches[0].lc !== undefined) {
            productDoc.batches[0].amount =
              productDoc.batches[0].lc * productDoc.batches[0].boxes;
          }
        } else {
          // Create new batch without specific expiry
          const newBatch = {
            boxes: boxesToUpdate,
            lc: lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (lc || 0) * boxesToUpdate,
            date: new Date(),
          };
          productDoc.batches.push(newBatch);
        }
      }
    }

    // Recalculate totals
    productDoc.totalBoxes = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0,
    );
    productDoc.totalAmount = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.amount || 0),
      0,
    );

    // Calculate average price
    productDoc.averagePrice =
      productDoc.totalBoxes > 0
        ? productDoc.totalAmount / productDoc.totalBoxes
        : 0;

    productDoc.status = calculateStockStatus(productDoc.totalBoxes);

    // Remove batches with zero boxes
    productDoc.batches = productDoc.batches.filter((batch) => batch.boxes > 0);

    await productDoc.save();
  } catch (error) {
    console.error("❌ Error in updateProductBatchesForPurchaseReturn:", error);
    console.error("Product Data:", productData);
    throw error;
  }
};

/** ✅ Process multiple products in purchase return */
const processPurchaseReturnProducts = async (
  purchaseReturnDoc,
  operation = "subtract", // Default is subtract for purchase returns (return to supplier)
) => {
  try {
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
        // Update ReportInHand for this product with average price calculation
        await updateReportInHandForPurchaseReturn(
          productData,
          supplierName,
          operation,
        );

        // Update Product batches
        await updateProductBatchesForPurchaseReturn(productData, operation);
      } catch (productError) {
        console.error(
          `❌ Failed to process product ${productData.productName}:`,
          productError,
        );
        throw productError;
      }
    }
  } catch (error) {
    console.error("❌ Error in processPurchaseReturnProducts:", error);
    throw error;
  }
};

// Changed from: router.get("/purchase-return", ...)
// To: router.get("/", ...)
router.get("/", async (req, res) => {
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

/** ✅ POST create purchase return - UPDATED WITH AVERAGE PRICE AND STOCK VALIDATION */
// Changed from: router.post("/purchase-return", ...)
// To: router.post("/", ...)
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const { invoiceNumber, products, supplierName } = data;

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
      const {
        productName,
        purchaseQty,
        returnQuantity,
        usedQty,
        lc = 0,
      } = productData;

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

      // Check if product exists in the product catalog
      const productDoc = await Product.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!productDoc) {
        return res.status(400).json({
          success: false,
          message: `Product ${productName} not found in the system`,
        });
      }

      // Check stock availability in ReportInHand
      const reportInHandItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });

      if (!reportInHandItem) {
        return res.status(400).json({
          success: false,
          message: `Product ${productName} not found in inventory`,
        });
      }

      const availableStock = reportInHandItem.totalBoxes || 0;
      if (availableStock < returnQuantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock to return ${returnQuantity} boxes of ${productName}. Available: ${availableStock}`,
        });
      }

      // Calculate return amount if not provided
      if (!productData.returnAmount || productData.returnAmount === 0) {
        // Use average price from ReportInHand or product LC price
        const avgPrice = reportInHandItem.averagePrice || lc || 0;
        productData.returnAmount = returnQuantity * avgPrice;
      }
    }

    // Process products data
    const processedProducts = await Promise.all(
      products.map(async (productData) => {
        const {
          productName,
          purchaseQty,
          returnQuantity,
          usedQty,
          fob,
          cif,
          lc,
          amount,
          returnAmount,
          expiredDate,
        } = productData;

        // Get current average price from ReportInHand
        const reportInHandItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${productName}$`, "i") },
        });

        const currentAvgPrice = reportInHandItem?.averagePrice || lc || 0;
        const calculatedReturnAmount =
          returnAmount || returnQuantity * currentAvgPrice;

        return {
          ...productData,
          productName,
          purchaseQty: parseFloat(purchaseQty),
          returnQuantity: parseFloat(returnQuantity),
          usedQty: parseFloat(usedQty) || 0,
          fob: parseFloat(fob) || 0,
          cif: parseFloat(cif) || 0,
          lc: parseFloat(lc) || currentAvgPrice,
          amount:
            parseFloat(amount) ||
            parseFloat(purchaseQty) * (parseFloat(lc) || currentAvgPrice),
          returnAmount: parseFloat(calculatedReturnAmount),
          expiredDate: expiredDate ? new Date(expiredDate) : null,
        };
      }),
    );

    const newPurchaseReturn = new PurchaseReturn({
      ...data,
      supplierName: supplierName.trim(),
      products: processedProducts,
    });

    const saved = await newPurchaseReturn.save();

    // For purchase returns: SUBTRACT from stock (return to supplier)
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

router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const originalReturn = await PurchaseReturn.findById(id);
    if (!originalReturn) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });
    }

    // First: ADD back the original return to reverse the subtraction
    await processPurchaseReturnProducts(originalReturn, "add");

    // Validate and process updated products
    const { products, supplierName } = updatedData;

    if (products && Array.isArray(products)) {
      for (const productData of products) {
        const { productName, returnQuantity } = productData;

        // Check stock availability for new quantities
        const reportInHandItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${productName}$`, "i") },
        });

        if (reportInHandItem) {
          const availableStock = reportInHandItem.totalBoxes || 0;
          if (availableStock < returnQuantity) {
            // Revert the add operation since validation failed
            await processPurchaseReturnProducts(originalReturn, "subtract");

            return res.status(400).json({
              success: false,
              message: `Insufficient stock to return ${returnQuantity} boxes of ${productName}. Available: ${availableStock}`,
            });
          }
        }
      }
    }

    const updated = await PurchaseReturn.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    // Then: SUBTRACT the new return quantities
    await processPurchaseReturnProducts(updated, "subtract");

    res.json({
      success: true,
      message: "Purchase return updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating purchase return:", error);

    // Try to revert any changes if error occurred
    try {
      const originalReturn = await PurchaseReturn.findById(req.params.id);
      if (originalReturn) {
        await processPurchaseReturnProducts(originalReturn, "subtract");
      }
    } catch (revertError) {
      console.error("Error reverting changes:", revertError);
    }

    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id);

    if (!purchaseReturn) {
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });
    }

    // ADD back the stock to reverse the subtraction (undo the return)
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

router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No IDs provided" });
    }

    const purchaseReturns = await PurchaseReturn.find({ _id: { $in: ids } });

    for (const p of purchaseReturns) {
      // ADD back to reverse the subtraction (undo the returns)
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
// Changed from: router.get("/purchase-return/invoice/:invoiceNumber", ...)
// To: router.get("/invoice/:invoiceNumber", ...)
router.get("/invoice/:invoiceNumber", async (req, res) => {
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
// Changed from: router.get("/purchase-return/stats/summary", ...)
// To: router.get("/stats/summary", ...)
router.get("/stats/summary", async (req, res) => {
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
// Changed from: router.patch("/purchase-return/:id/status", ...)
// To: router.patch("/:id/status", ...)
router.patch("/:id/status", async (req, res) => {
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
      { new: true },
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

/** ✅ Helper function to calculate average price for a product */
const calculateAveragePrice = (batches) => {
  if (!batches || batches.length === 0) return 0;

  const totalBoxes = batches.reduce(
    (sum, batch) => sum + (batch.boxes || 0),
    0,
  );
  const totalAmount = batches.reduce(
    (sum, batch) => sum + (batch.amount || 0),
    0,
  );

  return totalBoxes > 0 ? totalAmount / totalBoxes : 0;
};

export default router;
