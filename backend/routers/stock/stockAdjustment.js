import express from "express";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";

const router = express.Router();

// ==================== Helper: Fix precision ====================
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

// ==================== GET /in-stock ====================
// Returns all products with their current stock (boxes) from ReportInHand
router.get("/in-stock", protect, allowAdminOnly, async (req, res) => {
  try {
    const { name } = req.query;

    // Fetch all stock data from ReportInHand
    const stockList = await ReportInHand.find({}, "productName totalBoxes").lean();
    const stockMap = new Map(
      stockList.map(item => [item.productName.toLowerCase(), item.totalBoxes || 0])
    );

    // Build product query (filter by name if provided)
    let productQuery = {};
    if (name) {
      productQuery.productName = { $regex: name, $options: "i" };
    }

    const products = await Product.find(productQuery).lean();

    // Combine and format
    const productsWithStock = products.map((product) => {
      const boxes = stockMap.get(product.productName.toLowerCase()) || 0;
      return {
        ...product,
        productName: product.productName
          .split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        type: product.type
          ?.split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        supplierName: product.supplierName
          ?.split(" ")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        inStock: {
          boxes,
          status: boxes > 0 ? "In Stock" : "Out of Stock",
        },
      };
    });

    res.status(200).json(productsWithStock);
  } catch (error) {
    console.error("Error fetching products with stock:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch products with stock information." 
    });
  }
});

// ==================== GET all adjustments ====================
router.get("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate("productId", "productName qtyPerCarton")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ 
      success: true, 
      data: adjustments,
      count: adjustments.length 
    });
  } catch (error) {
    console.error("Error fetching adjustments:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to fetch adjustments" 
    });
  }
});

// ==================== GET single adjustment ====================
router.get("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const adjustment = await StockAdjustment.findById(id)
      .populate("productId", "productName qtyPerCarton")
      .lean();

    if (!adjustment) {
      return res.status(404).json({ success: false, message: "Adjustment not found" });
    }

    res.json({ success: true, data: adjustment });
  } catch (error) {
    console.error("Error fetching adjustment:", error);
    res.status(500).json({ success: false, message: "Failed to fetch adjustment" });
  }
});

// ==================== CREATE adjustment ====================
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, boxQuantity, totalQuantity, adjustmentType, remarks } = req.body;

    // Validation
    if (!productId || !boxQuantity || !adjustmentType) {
      throw new Error("Missing required fields: productId, boxQuantity, adjustmentType");
    }
    if (boxQuantity <= 0) {
      throw new Error("Box quantity must be positive");
    }
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error("Invalid product ID");
    }

    // Find product to get qtyPerCarton (optional, but used for pieces)
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new Error("Product not found");
    }

    // Find the warehouse stock record (ReportInHand)
    let reportItem = await ReportInHand.findOne({ 
      productName: { $regex: new RegExp(`^${product.productName}$`, "i") } 
    }).session(session);

    // If product doesn't exist in ReportInHand, create it (for "add" adjustments)
    if (!reportItem) {
      if (adjustmentType === "remove") {
        throw new Error(`Cannot remove stock: Product "${product.productName}" not found in warehouse.`);
      }
      // Create new stock record with zero stock, then we'll add the adjustment
      reportItem = new ReportInHand({
        productName: product.productName,
        supplierName: "System",
        type: "System",
        batches: [],
        status: "Out of Stock",
        minStockLevel: 10,
      });
    }

    // Update the warehouse stock
    const currentStock = fixPrecision(Number(reportItem.totalBoxes) || 0);
    const adjustmentQty = fixPrecision(Number(boxQuantity));
    let newStock;

    if (adjustmentType === "add") {
      newStock = fixPrecision(currentStock + adjustmentQty);
      // Push a batch entry for the addition
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: adjustmentQty,
        lc: 0, // You may want to set a default LC or get it from product
        fob: 0,
        cif: 0,
        amount: 0,
        date: new Date(),
        adjustmentType: "batch",
        batchNumber: `ADJ-ADD-${Date.now()}`,
      });
    } else if (adjustmentType === "remove") {
      if (currentStock < adjustmentQty) {
        throw new Error(`Insufficient stock. Available: ${currentStock}, Requested: ${adjustmentQty}`);
      }
      newStock = fixPrecision(currentStock - adjustmentQty);
      // Push a removal batch entry
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: adjustmentQty,
        lc: 0,
        fob: 0,
        cif: 0,
        amount: 0,
        date: new Date(),
        adjustmentType: "remove",
        batchNumber: `ADJ-REMOVE-${Date.now()}`,
      });
    } else {
      throw new Error("Invalid adjustment type");
    }

    // Update totalBoxes and status
    reportItem.totalBoxes = newStock;
    reportItem.status = newStock <= 0 
      ? "Out of Stock" 
      : newStock < (reportItem.minStockLevel || 10) 
        ? "Low Stock" 
        : "In Stock";
    reportItem.updatedAt = new Date();

    await reportItem.save({ session });

    // Create the adjustment record
    const adjustment = new StockAdjustment({
      productId,
      boxQuantity: adjustmentQty,
      totalQuantity: adjustmentType === "add" ? adjustmentQty * (product.qtyPerCarton || 1) : -adjustmentQty * (product.qtyPerCarton || 1),
      adjustmentType,
      remarks,
      createdBy: req.user._id, // assuming your auth middleware sets req.user
    });

    await adjustment.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Populate product details for response
    const populated = await StockAdjustment.findById(adjustment._id)
      .populate("productId", "productName qtyPerCarton");

    res.status(201).json({
      success: true,
      message: "Stock adjustment created successfully",
      data: populated,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating adjustment:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to create adjustment" 
    });
  }
});

// ==================== UPDATE adjustment ====================
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid adjustment ID");
    }

    const existing = await StockAdjustment.findById(id).session(session);
    if (!existing) {
      throw new Error("Adjustment not found");
    }

    const { productId, boxQuantity, totalQuantity, adjustmentType, remarks } = req.body;

    // Validation
    if (!productId || !boxQuantity || !adjustmentType) {
      throw new Error("Missing required fields");
    }
    if (boxQuantity <= 0) {
      throw new Error("Box quantity must be positive");
    }
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw new Error("Invalid product ID");
    }

    // Find product
    const product = await Product.findById(productId).session(session);
    if (!product) {
      throw new Error("Product not found");
    }

    // Find warehouse stock
    let reportItem = await ReportInHand.findOne({ 
      productName: { $regex: new RegExp(`^${product.productName}$`, "i") } 
    }).session(session);
    if (!reportItem) {
      throw new Error(`Product "${product.productName}" not found in warehouse. Cannot update adjustment.`);
    }

    // Revert the previous adjustment effect
    const oldQty = existing.boxQuantity;
    const oldType = existing.adjustmentType;
    const currentStockBeforeRevert = fixPrecision(Number(reportItem.totalBoxes) || 0);

    if (oldType === "add") {
      // Remove the previously added stock
      reportItem.totalBoxes = fixPrecision(currentStockBeforeRevert - oldQty);
      // Optionally, you might want to remove the corresponding batch entry.
      // For simplicity, we'll just adjust totalBoxes and push a reversal batch.
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: oldQty,
        adjustmentType: "remove",
        batchNumber: `ADJ-REVERT-${Date.now()}`,
        date: new Date(),
        lc: 0,
        fob: 0,
        cif: 0,
        amount: 0,
      });
    } else if (oldType === "remove") {
      // Add back the previously removed stock
      reportItem.totalBoxes = fixPrecision(currentStockBeforeRevert + oldQty);
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: oldQty,
        adjustmentType: "batch",
        batchNumber: `ADJ-REVERT-${Date.now()}`,
        date: new Date(),
        lc: 0,
        fob: 0,
        cif: 0,
        amount: 0,
      });
    }

    // Now apply the new adjustment
    const newQty = fixPrecision(Number(boxQuantity));
    const currentStockAfterRevert = fixPrecision(Number(reportItem.totalBoxes) || 0);

    if (adjustmentType === "add") {
      reportItem.totalBoxes = fixPrecision(currentStockAfterRevert + newQty);
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: newQty,
        adjustmentType: "batch",
        batchNumber: `ADJ-ADD-${Date.now()}`,
        date: new Date(),
        lc: 0,
        fob: 0,
        cif: 0,
        amount: 0,
      });
    } else if (adjustmentType === "remove") {
      if (currentStockAfterRevert < newQty) {
        throw new Error(`Insufficient stock after revert. Available: ${currentStockAfterRevert}, Requested: ${newQty}`);
      }
      reportItem.totalBoxes = fixPrecision(currentStockAfterRevert - newQty);
      reportItem.batches.push({
        _id: new mongoose.Types.ObjectId(),
        boxes: newQty,
        adjustmentType: "remove",
        batchNumber: `ADJ-REMOVE-${Date.now()}`,
        date: new Date(),
        lc: 0,
        fob: 0,
        cif: 0,
        amount: 0,
      });
    } else {
      throw new Error("Invalid adjustment type");
    }

    // Update status
    reportItem.status = reportItem.totalBoxes <= 0 
      ? "Out of Stock" 
      : reportItem.totalBoxes < (reportItem.minStockLevel || 10) 
        ? "Low Stock" 
        : "In Stock";
    reportItem.updatedAt = new Date();
    await reportItem.save({ session });

    // Update adjustment record
    existing.productId = productId;
    existing.boxQuantity = newQty;
    existing.totalQuantity = adjustmentType === "add" 
      ? newQty * (product.qtyPerCarton || 1) 
      : -newQty * (product.qtyPerCarton || 1);
    existing.adjustmentType = adjustmentType;
    existing.remarks = remarks || "";
    existing.updatedAt = new Date();

    await existing.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populated = await StockAdjustment.findById(existing._id)
      .populate("productId", "productName qtyPerCarton");

    res.json({
      success: true,
      message: "Adjustment updated successfully",
      data: populated,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating adjustment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== DELETE single adjustment ====================
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error("Invalid adjustment ID");
    }

    const adjustment = await StockAdjustment.findById(id).session(session);
    if (!adjustment) {
      throw new Error("Adjustment not found");
    }

    // Revert stock effect
    const product = await Product.findById(adjustment.productId).session(session);
    if (!product) {
      throw new Error("Associated product not found");
    }

    const reportItem = await ReportInHand.findOne({ 
      productName: { $regex: new RegExp(`^${product.productName}$`, "i") } 
    }).session(session);

    if (reportItem) {
      const currentStock = fixPrecision(Number(reportItem.totalBoxes) || 0);
      if (adjustment.adjustmentType === "add") {
        // Remove the added stock
        reportItem.totalBoxes = fixPrecision(currentStock - adjustment.boxQuantity);
        reportItem.batches.push({
          _id: new mongoose.Types.ObjectId(),
          boxes: adjustment.boxQuantity,
          adjustmentType: "remove",
          batchNumber: `ADJ-DELETE-${Date.now()}`,
          date: new Date(),
          lc: 0,
          fob: 0,
          cif: 0,
          amount: 0,
        });
      } else if (adjustment.adjustmentType === "remove") {
        // Add back the removed stock
        reportItem.totalBoxes = fixPrecision(currentStock + adjustment.boxQuantity);
        reportItem.batches.push({
          _id: new mongoose.Types.ObjectId(),
          boxes: adjustment.boxQuantity,
          adjustmentType: "batch",
          batchNumber: `ADJ-DELETE-${Date.now()}`,
          date: new Date(),
          lc: 0,
          fob: 0,
          cif: 0,
          amount: 0,
        });
      }

      reportItem.status = reportItem.totalBoxes <= 0 
        ? "Out of Stock" 
        : reportItem.totalBoxes < (reportItem.minStockLevel || 10) 
          ? "Low Stock" 
          : "In Stock";
      reportItem.updatedAt = new Date();
      await reportItem.save({ session });
    }

    await StockAdjustment.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({ 
      success: true, 
      message: "Adjustment deleted and stock reverted" 
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting adjustment:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== BULK DELETE ====================
router.delete("/bulk", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw new Error("No adjustment IDs provided");
    }

    // Validate each ID
    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      throw new Error("No valid adjustment IDs");
    }

    // Fetch all adjustments to revert stock
    const adjustments = await StockAdjustment.find({ _id: { $in: validIds } }).session(session);

    // Group by product to efficiently revert stock
    const productAdjustments = new Map(); // productId -> { adds: [], removes: [] }

    for (const adj of adjustments) {
      const productId = adj.productId.toString();
      if (!productAdjustments.has(productId)) {
        productAdjustments.set(productId, { adds: [], removes: [] });
      }
      if (adj.adjustmentType === "add") {
        productAdjustments.get(productId).adds.push(adj.boxQuantity);
      } else {
        productAdjustments.get(productId).removes.push(adj.boxQuantity);
      }
    }

    // Revert each product's stock
    for (const [productId, data] of productAdjustments) {
      const product = await Product.findById(productId).session(session);
      if (!product) continue;

      const reportItem = await ReportInHand.findOne({ 
        productName: { $regex: new RegExp(`^${product.productName}$`, "i") } 
      }).session(session);

      if (reportItem) {
        const currentStock = fixPrecision(Number(reportItem.totalBoxes) || 0);
        const totalAdd = data.adds.reduce((sum, q) => sum + q, 0);
        const totalRemove = data.removes.reduce((sum, q) => sum + q, 0);

        // Net effect: adds increased stock, removes decreased stock
        // To revert, we do the opposite: subtract adds, add removes
        const newStock = fixPrecision(currentStock - totalAdd + totalRemove);
        reportItem.totalBoxes = newStock;

        reportItem.batches.push({
          _id: new mongoose.Types.ObjectId(),
          boxes: Math.abs(totalAdd - totalRemove),
          adjustmentType: "batch",
          batchNumber: `BULK-DELETE-${Date.now()}`,
          date: new Date(),
          lc: 0,
          fob: 0,
          cif: 0,
          amount: 0,
        });

        reportItem.status = newStock <= 0 
          ? "Out of Stock" 
          : newStock < (reportItem.minStockLevel || 10) 
            ? "Low Stock" 
            : "In Stock";
        reportItem.updatedAt = new Date();
        await reportItem.save({ session });
      }
    }

    // Delete all adjustments
    const result = await StockAdjustment.deleteMany({ _id: { $in: validIds } }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted and stock reverted`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk delete error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;