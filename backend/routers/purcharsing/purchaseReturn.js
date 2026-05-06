// routes/purcharsing/purchaseReturn.js  –  full file with activity logging
import express from "express";
import mongoose from "mongoose";
import PurchaseReturn from "../../models/purcharsing/purchaseReturns.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import { logActivity } from "../activity/activityLog.js"; // ✅ activity logger
import { emitEvent, EVENT_TYPES, captureSnapshotBefore } from "../../observability/auditLogger.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const calculateStockStatus = (boxes) => {
  if (boxes <= 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

const updateReportInHandForPurchaseReturn = async (
  productData,
  supplierName,
  operation = "subtract",
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

    const existing = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (existing) {
      let updatedBatches = [...(existing.batches || [])];
      let totalBoxes = existing.totalBoxes || 0;
      let totalAmount = existing.totalAmount || 0;

      if (operation === "subtract") {
        let remainingToRemove = boxesToUpdate;
        updatedBatches.sort((a, b) => new Date(a.date) - new Date(b.date));

        for (
          let i = 0;
          i < updatedBatches.length && remainingToRemove > 0;
          i++
        ) {
          const batch = updatedBatches[i];
          if (batch.boxes <= remainingToRemove) {
            remainingToRemove -= batch.boxes;
            totalBoxes -= batch.boxes;
            totalAmount -= batch.amount || batch.boxes * batch.lc || 0;
            updatedBatches[i] = null;
          } else {
            batch.boxes -= remainingToRemove;
            batch.amount = batch.boxes * (batch.lc || lc || 0);
            totalBoxes -= remainingToRemove;
            totalAmount -= remainingToRemove * (batch.lc || lc || 0);
            remainingToRemove = 0;
          }
        }
        updatedBatches = updatedBatches.filter(
          (b) => b !== null && b.boxes > 0,
        );
      } else {
        const newBatch = {
          boxes: boxesToUpdate,
          lc,
          fob,
          cif,
          amount: amountToUpdate,
          expiryDate: expiredDate ? new Date(expiredDate) : null,
          date: new Date(),
        };
        updatedBatches.push(newBatch);
        totalBoxes += boxesToUpdate;
        totalAmount += amountToUpdate;
        updatedBatches.sort((a, b) => new Date(a.date) - new Date(b.date));
      }

      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;
      const status = calculateStockStatus(totalBoxes);

      if (totalBoxes <= 0) {
        await ReportInHand.findByIdAndDelete(existing._id);
      } else {
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
            lc,
            fob,
            cif,
            amount: amountToUpdate,
            expiryDate: expiredDate ? new Date(expiredDate) : null,
            date: new Date(),
          },
        ],
      });
    }
  } catch (error) {
    console.error("❌ Error in updateReportInHandForPurchaseReturn:", error);
    throw error;
  }
};

const updateProductBatchesForPurchaseReturn = async (
  productData,
  operation = "subtract",
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
    if (!productDoc) throw new Error(`Product ${productName} not found`);
    if (!productDoc.batches || !Array.isArray(productDoc.batches))
      productDoc.batches = [];

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

      for (let i = 0; i < sortedBatches.length && remainingBoxes > 0; i++) {
        const batch = sortedBatches[i];
        const batchIndex = productDoc.batches.findIndex(
          (b) => b._id.toString() === batch._id.toString(),
        );
        if (batchIndex === -1) continue;
        const subtractQty = Math.min(remainingBoxes, batch.boxes);
        productDoc.batches[batchIndex].boxes -= subtractQty;
        remainingBoxes -= subtractQty;
        if (productDoc.batches[batchIndex].lc !== undefined) {
          productDoc.batches[batchIndex].amount =
            productDoc.batches[batchIndex].lc *
            productDoc.batches[batchIndex].boxes;
        }
      }
    } else {
      if (expiredDate) {
        const targetExpiry = new Date(expiredDate);
        const batchIndex = productDoc.batches.findIndex((batch) => {
          if (!batch.expiryDate) return false;
          return (
            new Date(batch.expiryDate).getTime() === targetExpiry.getTime()
          );
        });
        if (batchIndex !== -1) {
          productDoc.batches[batchIndex].boxes += boxesToUpdate;
          if (productDoc.batches[batchIndex].lc !== undefined) {
            productDoc.batches[batchIndex].amount =
              productDoc.batches[batchIndex].lc *
              productDoc.batches[batchIndex].boxes;
          }
        } else {
          productDoc.batches.push({
            boxes: boxesToUpdate,
            lc: lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (lc || 0) * boxesToUpdate,
            expiryDate: expiredDate,
            date: new Date(),
          });
        }
      } else {
        if (productDoc.batches.length > 0) {
          productDoc.batches[0].boxes += boxesToUpdate;
          if (productDoc.batches[0].lc !== undefined) {
            productDoc.batches[0].amount =
              productDoc.batches[0].lc * productDoc.batches[0].boxes;
          }
        } else {
          productDoc.batches.push({
            boxes: boxesToUpdate,
            lc: lc || 0,
            fob: productData.fob || 0,
            cif: productData.cif || 0,
            amount: (lc || 0) * boxesToUpdate,
            date: new Date(),
          });
        }
      }
    }

    productDoc.totalBoxes = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0,
    );
    productDoc.totalAmount = productDoc.batches.reduce(
      (sum, batch) => sum + (batch.amount || 0),
      0,
    );
    productDoc.averagePrice =
      productDoc.totalBoxes > 0
        ? productDoc.totalAmount / productDoc.totalBoxes
        : 0;
    productDoc.status = calculateStockStatus(productDoc.totalBoxes);
    productDoc.batches = productDoc.batches.filter((batch) => batch.boxes > 0);
    await productDoc.save();
  } catch (error) {
    console.error("❌ Error in updateProductBatchesForPurchaseReturn:", error);
    throw error;
  }
};

const processPurchaseReturnProducts = async (
  purchaseReturnDoc,
  operation = "subtract",
) => {
  try {
    const purchaseReturn = purchaseReturnDoc.toObject
      ? purchaseReturnDoc.toObject()
      : purchaseReturnDoc;
    const { products, supplierName } = purchaseReturn;
    if (!products || !Array.isArray(products) || products.length === 0)
      throw new Error("Products array is required and cannot be empty");

    for (const productData of products) {
      if (!productData.productName)
        throw new Error("Product name is required for all products");
      await updateReportInHandForPurchaseReturn(
        productData,
        supplierName,
        operation,
      );
      await updateProductBatchesForPurchaseReturn(productData, operation);
    }
  } catch (error) {
    console.error("❌ Error in processPurchaseReturnProducts:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /  –  List all purchase returns (no logging on reads)
// ─────────────────────────────────────────────────────────────────────────────
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
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  –  Create purchase return                          ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const snapshotBefore = await captureSnapshotBefore(); // ← ADD
  try {
    const data = req.body;
    const { invoiceNumber, products, supplierName } = data;

    if (!invoiceNumber || !products || !Array.isArray(products)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invoice number and products array are required",
        });
    }

    const existingReturn = await PurchaseReturn.findOne({ invoiceNumber });
    if (existingReturn) {
      return res
        .status(400)
        .json({
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
      if (!productName)
        return res
          .status(400)
          .json({
            success: false,
            message: "Product name is required for all products",
          });
      if (returnQuantity > purchaseQty)
        return res
          .status(400)
          .json({
            success: false,
            message: `Return quantity cannot exceed purchase quantity for ${productName}`,
          });
      if (usedQty > purchaseQty)
        return res
          .status(400)
          .json({
            success: false,
            message: `Used quantity cannot exceed purchase quantity for ${productName}`,
          });

      const productDoc = await Product.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });
      if (!productDoc)
        return res
          .status(400)
          .json({
            success: false,
            message: `Product ${productName} not found in the system`,
          });

      const reportInHandItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") },
      });
      if (!reportInHandItem)
        return res
          .status(400)
          .json({
            success: false,
            message: `Product ${productName} not found in inventory`,
          });

      const availableStock = reportInHandItem.totalBoxes || 0;
      if (availableStock < returnQuantity) {
        return res
          .status(400)
          .json({
            success: false,
            message: `Insufficient stock to return ${returnQuantity} boxes of ${productName}. Available: ${availableStock}`,
          });
      }

      if (!productData.returnAmount || productData.returnAmount === 0) {
        const avgPrice = reportInHandItem.averagePrice || lc || 0;
        productData.returnAmount = returnQuantity * avgPrice;
      }
    }

    // Process products
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

    // Subtract stock (return to supplier)
    await processPurchaseReturnProducts(saved, "subtract");

    // ✅ Log CREATE
    const totalReturnQty = processedProducts.reduce(
      (s, p) => s + (p.returnQuantity || 0),
      0,
    );
    const totalReturnAmount = processedProducts.reduce(
      (s, p) => s + (p.returnAmount || 0),
      0,
    );

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Purchase Return: ${saved.invoiceNumber}`,
      tableName: "purchaseReturn",
      tableLabel: "Purchase Return",
      recordId: saved._id,
      referenceNumber: saved.invoiceNumber,
      newData: saved.toObject ? saved.toObject() : saved,
      description: `New purchase return ${saved.invoiceNumber} for ${saved.supplierName} — ${processedProducts.length} product(s), total return qty: ${totalReturnQty}, total return amount: $${totalReturnAmount.toFixed(2)}`,
      refField: "invoiceNumber",
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.PURCHASE_RECORDED,
      entityType: "PurchaseReturn",
      entityId:   saved._id.toString(),
      status:     "SUCCESS",
      changes: processedProducts.map(p => ({
        module: "ReportInHand",
        action: "PURCHASE_RETURN_STOCK_DEDUCTED",
        field:  p.productName,
        before: p.returnQuantity,
        after:  0,
        status: "SUCCESS",
      })),
      metadata: {
        invoiceNo:        saved.invoiceNumber,
        supplierName:     saved.supplierName,
        totalReturnQty,
        totalReturnAmount,
        productCount:     processedProducts.length,
        snapshotBefore,
        products: processedProducts.map(p => ({
          productName:    p.productName,
          returnQty:      p.returnQuantity,
          returnAmount:   p.returnAmount || (p.returnQuantity * (p.unitCost || p.lc || 0)),
          
        })),
      },
    });
    // ─────────

    res
      .status(201)
      .json({
        success: true,
        message: "Purchase return created successfully",
        data: saved,
      });
  } catch (error) {
    console.error("❌ Error creating purchase return:", error);
    if (req.body.invoiceNumber) {
      try {
        await PurchaseReturn.findOneAndDelete({
          invoiceNumber: req.body.invoiceNumber,
        });
      } catch (e) {
        console.error("❌ Error rolling back:", e);
      }
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id  –  Update purchase return                        ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const _startMs = Date.now(); // ── NEW ──
  const snapshotBefore = await captureSnapshotBefore(); // ← ADD
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const originalReturn = await PurchaseReturn.findById(id);
    if (!originalReturn)
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });

    // ✅ Snapshot BEFORE update
    const previousData = originalReturn.toObject();

    // Add back original stock to reverse the subtraction
    await processPurchaseReturnProducts(originalReturn, "add");

    const { products, supplierName } = updatedData;

    if (products && Array.isArray(products)) {
      for (const productData of products) {
        const { productName, returnQuantity } = productData;
        const reportInHandItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${productName}$`, "i") },
        });
        if (reportInHandItem) {
          const availableStock = reportInHandItem.totalBoxes || 0;
          if (availableStock < returnQuantity) {
            // Revert the add since validation failed
            await processPurchaseReturnProducts(originalReturn, "subtract");
            return res
              .status(400)
              .json({
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

    // Subtract new quantities
    await processPurchaseReturnProducts(updated, "subtract");

    // ✅ Log UPDATE with full before/after snapshots
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Purchase Return: ${updated.invoiceNumber}`,
      tableName: "purchaseReturn",
      tableLabel: "Purchase Return",
      recordId: updated._id,
      referenceNumber: updated.invoiceNumber,
      previousData, // full doc before
      newData: updated.toObject ? updated.toObject() : updated, // full doc after
      description: `Purchase return ${updated.invoiceNumber} for ${updated.supplierName} was updated`,
      refField: "invoiceNumber",
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.PURCHASE_UPDATED,
      entityType: "PurchaseReturn",
      entityId:   updated._id.toString(),
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      metadata: {
        invoiceNo:    updated.invoiceNumber,
        supplierName: updated.supplierName,
        snapshotBefore
      },
    });
    // ─────────

    res.json({
      success: true,
      message: "Purchase return updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating purchase return:", error);
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.PURCHASE_UPDATED,
      entityType:   "PurchaseReturn",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    try {
      const originalReturn = await PurchaseReturn.findById(req.params.id);
      if (originalReturn)
        await processPurchaseReturnProducts(originalReturn, "subtract");
    } catch (revertError) {
      console.error("Error reverting changes:", revertError);
    }
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id  –  Delete single purchase return              ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const _startMs = Date.now(); // ── NEW ──
  const snapshotBefore = await captureSnapshotBefore(); // ← ADD
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id);
    if (!purchaseReturn)
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });

    // ✅ Full snapshot before deletion
    const snapshot = purchaseReturn.toObject();

    // Add back stock to undo the return
    await processPurchaseReturnProducts(purchaseReturn, "add");

    const deleted = await PurchaseReturn.findByIdAndDelete(id);

    // ✅ Log DELETE with full snapshot
    const totalReturnQty =
      snapshot.products?.reduce((s, p) => s + (p.returnQuantity || 0), 0) || 0;
    const totalReturnAmount =
      snapshot.products?.reduce((s, p) => s + (p.returnAmount || 0), 0) || 0;

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Purchase Return: ${snapshot.invoiceNumber}`,
      tableName: "purchaseReturn",
      tableLabel: "Purchase Return",
      recordId: snapshot._id,
      referenceNumber: snapshot.invoiceNumber,
      previousData: snapshot, // full document
      description: `Purchase return ${snapshot.invoiceNumber} for ${snapshot.supplierName} deleted — ${(snapshot.products || []).length} product(s), return qty: ${totalReturnQty}, return amount: $${totalReturnAmount.toFixed(2)}`,
      refField: "invoiceNumber",
    });

    // ── NEW ──
    await emitEvent(req, {
      eventType:  EVENT_TYPES.PURCHASE_DELETED,
      entityType: "PurchaseReturn",
      entityId:   id,
      status:     "SUCCESS",
      durationMs: Date.now() - _startMs,
      changes: (snapshot.products || []).map(p => ({
        module: "ReportInHand",
        action: "PURCHASE_RETURN_REVERSED",
        field:  p.productName,
        after:  p.returnQuantity,
        status: "SUCCESS",
      })),
      metadata: {
        invoiceNo:        snapshot.invoiceNumber,
        supplierName:     snapshot.supplierName,
        totalReturnQty,
        totalReturnAmount,
        deleted: true,
        snapshotBefore
      },
    });
    // ─────────

    res.json({
      success: true,
      message: "Purchase return deleted successfully",
      data: deleted,
    });
  } catch (error) {
    console.error("Error deleting purchase return:", error);
    await emitEvent(req, { // ── NEW ──
      eventType:    EVENT_TYPES.PURCHASE_DELETED,
      entityType:   "PurchaseReturn",
      entityId:     req.params.id,
      status:       "FAILED",
      durationMs:   Date.now() - _startMs,
      errorMessage: error.message,
    });
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /  –  Bulk delete purchase returns                  ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "No IDs provided" });

    // ✅ Fetch full documents BEFORE deletion
    const purchaseReturns = await PurchaseReturn.find({
      _id: { $in: ids },
    }).lean();

    // Add back stock for all (undo all returns)
    for (const p of purchaseReturns) {
      await processPurchaseReturnProducts(p, "add");
    }

    const result = await PurchaseReturn.deleteMany({ _id: { $in: ids } });

    // ✅ Log BULK DELETE with all snapshots
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Purchase Return(s)`,
      tableName: "purchaseReturn",
      tableLabel: "Purchase Return",
      previousData: purchaseReturns, // array → buildSnapshots makes N rows
      description: `Bulk deleted ${result.deletedCount} purchase returns`,
      refField: "invoiceNumber",
    });

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

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /:id/status  –  Update status                        ✅ LOGGED
// ─────────────────────────────────────────────────────────────────────────────
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "rejected", "completed"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }

    // ✅ Snapshot before update
    const before = await PurchaseReturn.findById(req.params.id).lean();
    if (!before)
      return res
        .status(404)
        .json({ success: false, message: "Purchase return not found" });

    const updated = await PurchaseReturn.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    // ✅ Log status change as UPDATE
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Status Updated: ${before.invoiceNumber} → ${status}`,
      tableName: "purchaseReturn",
      tableLabel: "Purchase Return",
      recordId: before._id,
      referenceNumber: before.invoiceNumber,
      previousData: before,
      newData: updated.toObject ? updated.toObject() : updated,
      description: `Purchase return ${before.invoiceNumber} status changed from "${before.status}" to "${status}"`,
      refField: "invoiceNumber",
    });

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

// ─────────────────────────────────────────────────────────────────────────────
// Read-only routes (no logging needed)
// ─────────────────────────────────────────────────────────────────────────────

router.get("/invoice/:invoiceNumber", async (req, res) => {
  try {
    const results = await PurchaseReturn.find({
      invoiceNumber: new RegExp(req.params.invoiceNumber, "i"),
    }).sort({ createdAt: -1 });
    res.json({ success: true, data: results });
  } catch (error) {
    console.error("Error fetching purchase returns by invoice:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
});

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

export default router;