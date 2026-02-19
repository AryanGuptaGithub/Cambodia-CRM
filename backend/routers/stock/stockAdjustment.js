import express from "express";
import mongoose from "mongoose";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// Helper to update ReportInHand after an adjustment
const updateReportInHandAfterAdjustment = async (
  productName,
  boxQuantity,
  adjustmentType,
  adjustmentId,
  remarks = "",
  session
) => {
  if (boxQuantity <= 0) return;

  const normalizedName = productName.toLowerCase().trim();
  let reportProduct = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
  }).session(session);

  if (!reportProduct) {
    console.warn(`⚠️ Product "${productName}" not found in ReportInHand`);
    return;
  }

  const newBatch = {
    boxes: boxQuantity,
    lc: 0,
    fob: 0,
    cif: 0,
    amount: 0,
    date: new Date(),
    adjustmentType,
    adjustmentId,
    remarks: remarks || `${adjustmentType} adjustment`,
  };

  reportProduct.batches.push(newBatch);
  await reportProduct.save({ session });
};

// Helper to remove a batch by adjustmentId
const removeBatchFromReport = async (adjustmentId, session) => {
  const reportProduct = await ReportInHand.findOne({
    "batches.adjustmentId": adjustmentId,
  }).session(session);

  if (!reportProduct) return;

  reportProduct.batches = reportProduct.batches.filter(
    (b) => !b.adjustmentId || b.adjustmentId.toString() !== adjustmentId.toString()
  );
  await reportProduct.save({ session });
};

// ==================== GET ALL ====================
router.get("/", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate({
        path: "productId",
        select: "productName qtyPerCarton currentStock",
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: adjustments, count: adjustments.length });
  } catch (err) {
    console.error("Error fetching adjustments:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==================== GET SINGLE ====================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: "Invalid ID" });
  }

  try {
    const adjustment = await StockAdjustment.findById(id).populate({
      path: "productId",
      select: "productName qtyPerCarton currentStock",
    });
    if (!adjustment) {
      return res.status(404).json({ success: false, message: "Not found" });
    }
    res.status(200).json({ success: true, data: adjustment });
  } catch (err) {
    console.error("Error fetching adjustment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ==================== CREATE ====================
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, boxQuantity, adjustmentType, remarks } = req.body;

    if (!productId || !adjustmentType) throw new Error("Product and type required");
    if (!boxQuantity || boxQuantity < 1) throw new Error("Box quantity must be >=1");
    if (!["add", "remove"].includes(adjustmentType)) throw new Error("Invalid type");

    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error("Product not found");

    const piecesPerBox = product.qtyPerCarton || 1;
    const totalPieces = boxQuantity * piecesPerBox;
    const totalQuantity = adjustmentType === "remove" ? -totalPieces : totalPieces;

    const adjustment = new StockAdjustment({
      productId,
      boxQuantity,
      totalQuantity,
      adjustmentType,
      remarks: remarks || "",
    });
    await adjustment.save({ session });

    await Product.findByIdAndUpdate(
      productId,
      { $inc: { currentStock: totalQuantity } },
      { session }
    );

    await updateReportInHandAfterAdjustment(
      product.productName,
      boxQuantity,
      adjustmentType,
      adjustment._id,
      remarks,
      session
    );

    const populated = await StockAdjustment.findById(adjustment._id)
      .populate({ path: "productId", select: "productName qtyPerCarton currentStock" })
      .session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({ success: true, data: populated, message: "Created" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating adjustment:", err);

    if (err.message.includes("Insufficient")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ==================== UPDATE ====================
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid adjustment ID");
    }

    const existing = await StockAdjustment.findById(id).session(session);
    if (!existing) throw new Error("Adjustment not found");

    const oldProduct = await Product.findById(existing.productId).session(session);
    if (!oldProduct) throw new Error("Original product not found");

    let newProduct = oldProduct;
    if (req.body.productId && req.body.productId !== existing.productId.toString()) {
      newProduct = await Product.findById(req.body.productId).session(session);
      if (!newProduct) throw new Error("New product not found");
    }

    const oldBox = existing.boxQuantity;
    const oldQtyPerBox = oldProduct.qtyPerCarton || 1;
    const oldPieces = oldBox * oldQtyPerBox;
    const oldContribution = existing.adjustmentType === "add" ? oldPieces : -oldPieces;

    const newBox = req.body.boxQuantity !== undefined ? req.body.boxQuantity : oldBox;
    const newType = req.body.adjustmentType || existing.adjustmentType;
    const newQtyPerBox = newProduct.qtyPerCarton || 1;
    const newPieces = newBox * newQtyPerBox;
    const newContribution = newType === "add" ? newPieces : -newPieces;

    const netChange = newContribution - oldContribution;

    if (netChange !== 0) {
      await Product.findByIdAndUpdate(
        newProduct._id,
        { $inc: { currentStock: netChange } },
        { session }
      );
    }

    const updateData = {
      productId: newProduct._id,
      boxQuantity: newBox,
      adjustmentType: newType,
      totalQuantity: newContribution,
      remarks: req.body.remarks !== undefined ? req.body.remarks : existing.remarks,
    };
    const updated = await StockAdjustment.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    }).populate({ path: "productId", select: "productName qtyPerCarton currentStock" });

    await removeBatchFromReport(id, session);
    await updateReportInHandAfterAdjustment(
      newProduct.productName,
      newBox,
      newType,
      updated._id,
      updateData.remarks,
      session
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, data: updated, message: "Updated" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating adjustment:", err);

    if (err.message.includes("Insufficient")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ==================== BULK DELETE (must be before /:id) ====================
router.delete("/bulk", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error("No IDs provided");
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) throw new Error("No valid IDs");

    const adjustments = await StockAdjustment.find({ _id: { $in: validIds } }).session(session);
    if (adjustments.length === 0) throw new Error("No adjustments found");

    for (const adj of adjustments) {
      const product = await Product.findById(adj.productId).session(session);
      if (product) {
        const piecesPerBox = product.qtyPerCarton || 1;
        const revert = adj.adjustmentType === "add"
          ? -(adj.boxQuantity * piecesPerBox)
          : adj.boxQuantity * piecesPerBox;

        await Product.findByIdAndUpdate(
          adj.productId,
          { $inc: { currentStock: revert } },
          { session }
        );
      }
      await removeBatchFromReport(adj._id, session);
    }

    const result = await StockAdjustment.deleteMany(
      { _id: { $in: validIds } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk delete error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ==================== DELETE SINGLE ====================
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid ID");
    }

    const adjustment = await StockAdjustment.findById(id).session(session);
    if (!adjustment) throw new Error("Adjustment not found");

    const product = await Product.findById(adjustment.productId).session(session);
    if (product) {
      const piecesPerBox = product.qtyPerCarton || 1;
      const revert = adjustment.adjustmentType === "add"
        ? -(adjustment.boxQuantity * piecesPerBox)
        : adjustment.boxQuantity * piecesPerBox;

      await Product.findByIdAndUpdate(
        adjustment.productId,
        { $inc: { currentStock: revert } },
        { session }
      );
    }

    await removeBatchFromReport(id, session);
    await StockAdjustment.findByIdAndDelete(id, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: "Deleted" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting adjustment:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

export default router;