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

/** ✅ Core helper: updates ReportInHand when purchase returns are created/updated/deleted */
const updateReportInHandForReturn = async (purchaseReturnData, operation = "subtract") => {
  try {
    const {
      productName,
      returnQuantity = 0,
      supplierName,
      lcNumber,
      fob = 0,
      cif = 0,
      amount = 0,
      returnAmount = 0,
    } = purchaseReturnData;


    const validSupplierName = supplierName?.trim() || "Unknown Supplier";

    // Get product info for conversion
    const productDoc = await product.findOne({ productName });
    const piecesPerBox =
      Number(productDoc?.qtyPerBoxStrip) ||
      Number(productDoc?.packing) ||
      1; // fallback if missing

    const boxesToUpdate = returnQuantity;
    

    const existing = await ReportInHand.findOne({ productName });

    if (existing) {
      let finalBoxes =
        operation === "subtract"
          ? existing.quantity.boxes - boxesToUpdate
          : existing.quantity.boxes + boxesToUpdate;

      if (finalBoxes < 0) finalBoxes = 0;
      const newStatus = calculateStockStatus(finalBoxes);



      await ReportInHand.findByIdAndUpdate(existing._id, {
        $set: {
          "quantity.boxes": finalBoxes,
          status: newStatus,
          supplierName: validSupplierName,
          updatedAt: new Date(),
        },
      });

      
    } else if (operation === "add") {
      // Recreate if deleted record needs stock re-added
      const status = calculateStockStatus(boxesToUpdate);
      await ReportInHand.create({
        productName,
        supplierName: validSupplierName,
        quantity: { boxes: boxesToUpdate, pieces: 0 },
        status,
        lc: lcNumber || "",
        fob,
        cif,
      });
      
    }
  } catch (error) {
    console.error("❌ Error in updateReportInHandForReturn:", error);
    throw error;
  }
};

/* ==========================================================
   🔹 ROUTES BELOW
   ========================================================== */

/** ✅ GET all purchase returns */
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
        { productName: { $regex: search, $options: "i" } },
        { lcNumber: { $regex: search, $options: "i" } },
        { returnReason: { $regex: search, $options: "i" } },
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
    

    const {
      invoiceNumber,
      productName,
      purchaseQty,
      returnQuantity,
      usedQty,
    } = data;

    const existingReturn = await PurchaseReturn.findOne({
      invoiceNumber,
      productName,
    });
    if (existingReturn) {
      return res.status(400).json({
        success: false,
        message: "Purchase return for this invoice and product already exists",
      });
    }

    if (returnQuantity > purchaseQty) {
      return res.status(400).json({
        success: false,
        message: "Return quantity cannot exceed purchase quantity",
      });
    }

    if (usedQty > purchaseQty) {
      return res.status(400).json({
        success: false,
        message: "Used quantity cannot exceed purchase quantity",
      });
    }

    const newPurchaseReturn = new PurchaseReturn({
      ...data,
      purchaseQty: parseFloat(purchaseQty),
      returnQuantity: parseFloat(returnQuantity),
      usedQty: parseFloat(usedQty) || 0,
      fob: parseFloat(data.fob) || 0,
      cif: parseFloat(data.cif) || 0,
      amount: parseFloat(data.amount),
      returnAmount: parseFloat(data.returnAmount),
    });

    const saved = await newPurchaseReturn.save();

    
    await updateReportInHandForReturn(saved, "subtract");

    res.status(201).json({
      success: true,
      message: "Purchase return created successfully",
      data: saved,
    });
  } catch (error) {
    console.error("❌ Error creating purchase return:", error);
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
      return res.status(404).json({ success: false, message: "Purchase return not found" });
    }

    // Add back original stock first
    await updateReportInHandForReturn(originalReturn, "add");

    const updated = await PurchaseReturn.findByIdAndUpdate(
      id,
      updatedData,
      { new: true, runValidators: true }
    );

    // Subtract new return quantity
    await updateReportInHandForReturn(updated, "subtract");

    res.json({
      success: true,
      message: "Purchase return updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating purchase return:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ DELETE single purchase return */
router.delete("/purchase-return/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const purchaseReturn = await PurchaseReturn.findById(id);

    if (!purchaseReturn)
      return res.status(404).json({ success: false, message: "Purchase return not found" });

    await updateReportInHandForReturn(purchaseReturn, "add");

    const deleted = await PurchaseReturn.findByIdAndDelete(id);
    res.json({ success: true, message: "Purchase return deleted successfully", data: deleted });
  } catch (error) {
    console.error("Error deleting purchase return:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ BULK DELETE */
router.delete("/purchase-return", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ success: false, message: "No IDs provided" });

    const purchaseReturns = await PurchaseReturn.find({ _id: { $in: ids } });
    for (const p of purchaseReturns) {
      await updateReportInHandForReturn(p, "add");
    }

    const result = await PurchaseReturn.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `${result.deletedCount} purchase returns deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting purchase returns:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
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
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ Stats summary */
router.get("/purchase-return/stats/summary", async (req, res) => {
  try {
    const totalReturns = await PurchaseReturn.countDocuments();
    const pendingReturns = await PurchaseReturn.countDocuments({ status: "pending" });
    const approvedReturns = await PurchaseReturn.countDocuments({ status: "approved" });
    const completedReturns = await PurchaseReturn.countDocuments({ status: "completed" });

    const [amountAgg, qtyAgg] = await Promise.all([
      PurchaseReturn.aggregate([{ $group: { _id: null, total: { $sum: "$returnAmount" } } }]),
      PurchaseReturn.aggregate([{ $group: { _id: null, total: { $sum: "$returnQuantity" } } }]),
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
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

/** ✅ PATCH update status */
router.patch("/purchase-return/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!["pending", "approved", "rejected", "completed"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const updated = await PurchaseReturn.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!updated)
      return res.status(404).json({ success: false, message: "Purchase return not found" });

    res.json({ success: true, message: `Status updated to ${status}`, data: updated });
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
});

export default router;
