import express from "express";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// ==================== Helper: get best available LC from a ReportInHand ====================
const getBestLcFallback = (reportItem) => {
  const batches = reportItem.batches || [];

  const sorted = [...batches].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
  );

  if ((reportItem.averagePrice || 0) > 0) {
    return reportItem.averagePrice;
  }

  const lastRealBatch = sorted.find(
    (b) =>
      (b.adjustmentType === "batch" || !b.adjustmentType) && (b.lc || 0) > 0,
  );
  if (lastRealBatch) return lastRealBatch.lc;

  const lastAddBatch = sorted.find(
    (b) => b.adjustmentType === "add" && (b.lc || 0) > 0,
  );
  if (lastAddBatch) return lastAddBatch.lc;

  const anyBatch = sorted.find((b) => (b.lc || 0) > 0);
  if (anyBatch) return anyBatch.lc;

  return 0;
};

// ==================== Helper: get LAST batch LC (not average) ====================
const getLastBatchLc = (reportItem) => {
  const batches = reportItem.batches || [];

  const sorted = [...batches].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
  );

  // Last real batch (batch or add type) with a valid LC — skip remove batches
  const lastBatch = sorted.find(
    (b) =>
      (b.adjustmentType === "batch" ||
        b.adjustmentType === "add" ||
        !b.adjustmentType) &&
      (b.lc || 0) > 0,
  );

  if (lastBatch) return lastBatch.lc;

  // Fallback: any batch with LC
  const anyBatch = sorted.find((b) => (b.lc || 0) > 0);
  if (anyBatch) return anyBatch.lc;

  return 0;
};

// ==================== Core: recalculate totals ====================
const recalculateTotals = (reportItem) => {
  const batches = reportItem.batches || [];

  let totalBoxesFromBatches = 0;
  let addStockAdjustment = 0;
  let removeStockAdjustment = 0;
  let returnStockAdjustment = 0;
  let totalAmount = 0;

  for (const b of batches) {
    const type = b.adjustmentType;
    const boxes = Number(b.boxes) || 0;
    const amount = Number(b.amount) || 0;

    if (type === "batch") {
      totalBoxesFromBatches += boxes;
      totalAmount += amount;
    } else if (type === "return") {
      returnStockAdjustment += boxes;
      totalAmount += amount;
    } else if (type === "add") {
      addStockAdjustment += boxes;
      totalAmount += amount;
    } else if (type === "remove") {
      removeStockAdjustment += boxes;
      totalAmount -= amount;
    }
  }

  const totalBoxes = fixPrecision(
    totalBoxesFromBatches + addStockAdjustment + returnStockAdjustment - removeStockAdjustment,
  );
  const fixedAmount = fixPrecision(totalAmount);
  const averagePrice =
    totalBoxes > 0 ? fixPrecision(fixedAmount / totalBoxes) : 0;

  reportItem.totalBoxesFromBatches = fixPrecision(totalBoxesFromBatches);
  reportItem.addStockAdjustment = fixPrecision(addStockAdjustment);
  reportItem.removeStockAdjustment = fixPrecision(removeStockAdjustment);
  reportItem.returnStockAdjustment = fixPrecision(returnStockAdjustment);
  reportItem.totalBoxes = totalBoxes;
  reportItem.totalAmount = fixedAmount;
  reportItem.averagePrice = averagePrice;
  reportItem.status =
    totalBoxes <= 0
      ? "Out of Stock"
      : totalBoxes < (reportItem.minStockLevel || 10)
        ? "Low Stock"
        : "In Stock";
  reportItem.updatedAt = new Date();
};

// ==================== Helper: Find batch in reportInHand ====================
const findBatchInReport = (reportItem, adjustment) => {
  if (!reportItem || !reportItem.batches) return -1;
  
  return reportItem.batches.findIndex((b) => {
    // Match by adjustment ID if stored
    if (b.adjustmentId && adjustment._id) {
      return b.adjustmentId.toString() === adjustment._id.toString();
    }
    
    // Fallback: match by type and approximate values
    return (
      b.adjustmentType === adjustment.adjustmentType &&
      Math.abs(Number(b.boxes) - adjustment.boxQuantity) < 0.01 &&
      b.batchNumber?.startsWith(
        `ADJ-${adjustment.adjustmentType.toUpperCase()}`,
      )
    );
  });
};

// ==================== Helper: Add adjustmentId to batch ====================
const addAdjustmentIdToBatch = (batch, adjustmentId) => {
  batch.adjustmentId = adjustmentId;
  return batch;
};

// ==================== GET /in-stock ====================
router.get("/in-stock", async (req, res) => {
  try {
    const { name } = req.query;
    const stockList = await ReportInHand.find(
      {},
      "productName totalBoxes totalAmount averagePrice"
    ).lean();

    const stockMap = new Map(
      stockList.map((item) => [
        item.productName.toLowerCase(),
        {
          boxes: item.totalBoxes || 0,
          amount: item.totalAmount || 0,
          averagePrice: item.averagePrice || 0,
        },
      ]),
    );

    let productQuery = {};
    if (name) productQuery.productName = { $regex: name, $options: "i" };
    const products = await Product.find(productQuery).lean();

    const capitalize = (str) =>
      str
        ?.split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ") ?? "";

    const productsWithStock = products.map((product) => {
      const stock = stockMap.get(product.productName.toLowerCase()) || {
        boxes: 0,
        amount: 0,
        averagePrice: 0,
      };
      return {
        ...product,
        productName: capitalize(product.productName),
        type: capitalize(product.type),
        supplierName: capitalize(product.supplierName),
        inStock: {
          boxes: stock.boxes,
          amount: stock.amount,
          averagePrice: stock.averagePrice,
          status: stock.boxes > 0 ? "In Stock" : "Out of Stock",
        },
      };
    });

    const warehouseSummary = await getWarehouseInventorySummary();
    res
      .status(200)
      .json({ success: true, data: productsWithStock, warehouseSummary });
  } catch (error) {
    console.error("Error fetching products with stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products with stock information.",
    });
  }
});

// ==================== GET all adjustments ====================
router.get("/", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate("productId", "productName qtyPerCarton")
      .sort({ createdAt: -1 })
      .lean();
    const warehouseSummary = await getWarehouseInventorySummary();
    console.log('values of warehouseSummary', warehouseSummary);
    res.json({
      success: true,
      data: adjustments,
      count: adjustments.length,
      warehouseSummary,
    });
  } catch (error) {
    console.error("Error fetching adjustments:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch adjustments" });
  }
});

// ==================== GET single adjustment ====================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const adjustment = await StockAdjustment.findById(id)
      .populate("productId", "productName qtyPerCarton")
      .lean();
    if (!adjustment)
      return res
        .status(404)
        .json({ success: false, message: "Adjustment not found" });

    res.json({ success: true, data: adjustment });
  } catch (error) {
    console.error("Error fetching adjustment:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch adjustment" });
  }
});

// ==================== CREATE adjustment ====================
router.post("/", protect, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productId, boxQuantity, adjustmentType, remarks, unitCost } =
      req.body;

    if (!productId || !boxQuantity || !adjustmentType)
      throw new Error("Missing required fields");
    if (Number(boxQuantity) <= 0)
      throw new Error("Box quantity must be positive");
    if (!mongoose.Types.ObjectId.isValid(productId))
      throw new Error("Invalid product ID");

    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error("Product not found");

    let reportItem = await ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(product.productName)}$`, "i"),
      },
    }).session(session);

    if (!reportItem) {
      if (adjustmentType === "remove")
        throw new Error(
          `Cannot remove stock: Product "${product.productName}" not found in warehouse.`,
        );
      reportItem = new ReportInHand({
        productName: product.productName,
        supplierName: "System",
        type: "System",
        batches: [],
        status: "Out of Stock",
        minStockLevel: 10,
      });
    }

    // ✅ Recalculate FIRST so totalBoxes is accurate before any checks
    recalculateTotals(reportItem);

    const adjustmentQty = fixPrecision(Number(boxQuantity));
    console.log('values of report', reportItem);
    const currentStock = reportItem.totalBoxes;
    const wasOutOfStock = currentStock <= 0;

    // ✅ STRICT stock check: prevent remove if not enough stock
    if (adjustmentType === "remove") {
      if (currentStock <= 0) {
        throw new Error(
          `Cannot remove stock: "${product.productName}" is out of stock (0 boxes available).`,
        );
      }
      if (adjustmentQty > currentStock) {
        throw new Error(
          `Cannot remove ${adjustmentQty} boxes. Only ${currentStock} box${currentStock !== 1 ? "es" : ""} available for "${product.productName}".`,
        );
      }
    }

    let costPerBox = 0;
    let adjustmentAmount = 0;

    if (adjustmentType === "add") {
      if (unitCost && Number(unitCost) > 0) {
        costPerBox = Number(unitCost);
      } else {
        costPerBox = getLastBatchLc(reportItem);
        if (costPerBox === 0)
          throw new Error(
            "Cannot add stock: No cost found. Please provide a unit cost.",
          );
      }
      adjustmentAmount = fixPrecision(adjustmentQty * costPerBox);
    } else if (adjustmentType === "remove") {
      costPerBox = getLastBatchLc(reportItem);
      if (costPerBox === 0) {
        costPerBox = reportItem.averagePrice || 0;
      }
      adjustmentAmount = fixPrecision(adjustmentQty * costPerBox);
    }

    const batchNumber = `ADJ-${adjustmentType.toUpperCase()}-${Date.now()}`;

    // Create adjustment first to get its ID
    const adjustment = new StockAdjustment({
      productId,
      boxQuantity: adjustmentQty,
      totalQuantity:
        adjustmentType === "add"
          ? adjustmentQty * (product.qtyPerCarton || 1)
          : -adjustmentQty * (product.qtyPerCarton || 1),
      adjustmentType,
      remarks,
      createdBy: req.user._id,
    });
    await adjustment.save({ session });

    // Add batch with reference to adjustment ID
    const newBatch = {
      _id: new mongoose.Types.ObjectId(),
      boxes: adjustmentQty,
      lc: costPerBox,
      fob: 0,
      cif: 0,
      amount: adjustmentAmount,
      date: new Date(),
      adjustmentType: adjustmentType,
      batchNumber: batchNumber,
      adjustmentId: adjustment._id, // Store reference to adjustment
    };
    
    reportItem.batches.push(newBatch);
    recalculateTotals(reportItem);

    // ✅ Final safety net: ensure totalBoxes never goes negative after push
    if (reportItem.totalBoxes < 0) {
      throw new Error(
        `Stock operation rejected: would result in negative stock (${reportItem.totalBoxes} boxes). Available: ${currentStock}.`,
      );
    }

    await reportItem.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `${adjustmentType === "add" ? "Added" : "Removed"} Stock: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: adjustment._id,
      referenceNumber: batchNumber,
      newData: {
        productName: product.productName,
        adjustmentType,
        boxQuantity: adjustmentQty,
        costPerBox,
        amount: adjustmentAmount,
        remarks: remarks || "",
      },
      description: `${adjustmentType === "add" ? "Added" : "Removed"} ${adjustmentQty} boxes of ${toTitleCase(product.productName)} (${adjustmentType === "add" ? "+" : "-"}${adjustmentAmount})`,
      refField: "batchNumber",
    });

    const overrideMap = new Map([
      [
        reportItem.productName.toLowerCase(),
        {
          totalBoxes: reportItem.totalBoxes,
          totalAmount: reportItem.totalAmount,
        },
      ],
    ]);
    const warehouseSummary = await getWarehouseInventorySummary(overrideMap);

    res.status(201).json({
      success: true,
      message: `Stock ${adjustmentType === "add" ? "added to" : "removed from"} warehouse successfully`,
      data: await StockAdjustment.findById(adjustment._id).populate(
        "productId",
        "productName qtyPerCarton",
      ),
      updatedWarehouseStock: {
        productName: reportItem.productName,
        totalBoxes: reportItem.totalBoxes,
        totalAmount: reportItem.totalAmount,
        averagePrice: reportItem.averagePrice,
        status: reportItem.status,
        adjustment: {
          type: adjustmentType,
          boxes: adjustmentQty,
          costPerBox,
          amount:
            adjustmentType === "add" ? adjustmentAmount : -adjustmentAmount,
          absAmount: adjustmentAmount,
        },
      },
      warehouseSummary,
      stockStatusChanged: wasOutOfStock !== reportItem.totalBoxes > 0,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error creating adjustment:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create adjustment",
    });
  }
});

// ==================== UPDATE adjustment ====================
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new Error("Invalid adjustment ID");

    const existingAdjustment = await StockAdjustment.findById(id)
      .populate("productId", "productName qtyPerCarton")
      .session(session);

    if (!existingAdjustment) throw new Error("Adjustment not found");

    const previousData = existingAdjustment.toObject();

    const { productId, boxQuantity, adjustmentType, remarks, unitCost } =
      req.body;
    if (!productId || !boxQuantity || !adjustmentType)
      throw new Error("Missing required fields");
    if (Number(boxQuantity) <= 0)
      throw new Error("Box quantity must be positive");
    if (!mongoose.Types.ObjectId.isValid(productId))
      throw new Error("Invalid product ID");

    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error("Product not found");

    let reportItem = await ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(product.productName)}$`, "i"),
      },
    }).session(session);
    if (!reportItem)
      throw new Error(
        `Product "${product.productName}" not found in warehouse.`,
      );

    // Remove old batch using adjustmentId reference
    const oldBatchIndex = findBatchInReport(reportItem, existingAdjustment);
    if (oldBatchIndex !== -1) {
      reportItem.batches.splice(oldBatchIndex, 1);
    }

    // ✅ Recalculate after removing old batch so stock reflects current state
    recalculateTotals(reportItem);

    const newQty = fixPrecision(Number(boxQuantity));
    const currentStockAfterRemovingOld = reportItem.totalBoxes;

    // ✅ STRICT stock check for update: ensure new remove qty doesn't exceed available
    if (adjustmentType === "remove") {
      if (currentStockAfterRemovingOld <= 0) {
        throw new Error(
          `Cannot remove stock: "${product.productName}" has no stock available after reverting the old adjustment.`,
        );
      }
      if (newQty > currentStockAfterRemovingOld) {
        throw new Error(
          `Cannot remove ${newQty} boxes. Only ${currentStockAfterRemovingOld} box${currentStockAfterRemovingOld !== 1 ? "es" : ""} available for "${product.productName}" after reverting the previous adjustment.`,
        );
      }
    }

    let costPerBox = 0;
    let adjustmentAmount = 0;

    if (adjustmentType === "add") {
      if (unitCost && Number(unitCost) > 0) {
        costPerBox = Number(unitCost);
      } else {
        costPerBox = getLastBatchLc(reportItem);
        if (costPerBox === 0)
          throw new Error(
            "Cannot add stock: No cost found. Please provide a unit cost.",
          );
      }
      adjustmentAmount = fixPrecision(newQty * costPerBox);
    } else if (adjustmentType === "remove") {
      costPerBox = getLastBatchLc(reportItem);
      if (costPerBox === 0) {
        costPerBox = reportItem.averagePrice || 0;
      }
      adjustmentAmount = fixPrecision(newQty * costPerBox);
    }

    const batchNumber = `ADJ-${adjustmentType.toUpperCase()}-${Date.now()}`;

    // Update the adjustment document
    existingAdjustment.productId = productId;
    existingAdjustment.boxQuantity = newQty;
    existingAdjustment.totalQuantity =
      adjustmentType === "add"
        ? newQty * (product.qtyPerCarton || 1)
        : -newQty * (product.qtyPerCarton || 1);
    existingAdjustment.adjustmentType = adjustmentType;
    existingAdjustment.remarks = remarks || "";
    existingAdjustment.updatedAt = new Date();
    await existingAdjustment.save({ session });

    // Add new batch with reference to adjustment ID
    reportItem.batches.push({
      _id: new mongoose.Types.ObjectId(),
      boxes: newQty,
      lc: costPerBox,
      fob: 0,
      cif: 0,
      amount: adjustmentAmount,
      date: new Date(),
      adjustmentType: adjustmentType,
      batchNumber: batchNumber,
      adjustmentId: existingAdjustment._id, // Store reference to adjustment
    });

    recalculateTotals(reportItem);

    // ✅ Final safety net
    if (reportItem.totalBoxes < 0) {
      throw new Error(
        `Stock operation rejected: would result in negative stock (${reportItem.totalBoxes} boxes). Available: ${currentStockAfterRemovingOld}.`,
      );
    }

    await reportItem.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Stock Adjustment: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: existingAdjustment._id,
      referenceNumber: batchNumber,
      previousData: {
        productName: previousData.productId?.productName || "Unknown",
        adjustmentType: previousData.adjustmentType,
        boxQuantity: previousData.boxQuantity,
        remarks: previousData.remarks,
      },
      newData: {
        productName: product.productName,
        adjustmentType,
        boxQuantity: newQty,
        costPerBox,
        amount: adjustmentAmount,
        remarks: remarks || "",
      },
      description: `Updated adjustment for ${toTitleCase(product.productName)}: ${previousData.adjustmentType} ${previousData.boxQuantity} boxes → ${adjustmentType} ${newQty} boxes`,
      refField: "batchNumber",
    });

    const overrideMap = new Map([
      [
        reportItem.productName.toLowerCase(),
        {
          totalBoxes: reportItem.totalBoxes,
          totalAmount: reportItem.totalAmount,
        },
      ],
    ]);
    const warehouseSummary = await getWarehouseInventorySummary(overrideMap);

    res.json({
      success: true,
      message: "Adjustment updated successfully",
      data: await StockAdjustment.findById(existingAdjustment._id).populate(
        "productId",
        "productName qtyPerCarton",
      ),
      updatedWarehouseStock: {
        productName: reportItem.productName,
        totalBoxes: reportItem.totalBoxes,
        totalAmount: reportItem.totalAmount,
        averagePrice: reportItem.averagePrice,
        status: reportItem.status,
        adjustment: {
          type: adjustmentType,
          boxes: newQty,
          costPerBox,
          amount:
            adjustmentType === "add" ? adjustmentAmount : -adjustmentAmount,
          absAmount: adjustmentAmount,
        },
      },
      warehouseSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating adjustment:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== DELETE single adjustment ====================
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      throw new Error("Invalid adjustment ID");

    const adjustment = await StockAdjustment.findById(id)
      .populate("productId", "productName qtyPerCarton")
      .session(session);

    if (!adjustment) throw new Error("Adjustment not found");

    const product = await Product.findById(adjustment.productId).session(
      session,
    );
    if (!product) throw new Error("Associated product not found");

    const reportItem = await ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(product.productName)}$`, "i"),
      },
    }).session(session);

    const previousData = adjustment.toObject();

    if (reportItem) {
      // Find and remove the batch using adjustmentId reference
      const batchIndex = findBatchInReport(reportItem, adjustment);
      if (batchIndex !== -1) {
        reportItem.batches.splice(batchIndex, 1);
      }

      recalculateTotals(reportItem);

      if (reportItem.totalBoxes < 0)
        throw new Error(
          `Cannot delete: warehouse stock would go negative (${reportItem.totalBoxes})`,
        );

      await reportItem.save({ session });
    }

    await StockAdjustment.findByIdAndDelete(id).session(session);
    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Stock Adjustment: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: adjustment._id,
      referenceNumber: adjustment._id.toString(),
      previousData: {
        productName: product.productName,
        adjustmentType: adjustment.adjustmentType,
        boxQuantity: adjustment.boxQuantity,
        remarks: adjustment.remarks,
        createdAt: adjustment.createdAt,
      },
      description: `Deleted ${adjustment.adjustmentType} adjustment for ${toTitleCase(product.productName)}: ${adjustment.boxQuantity} boxes`,
      refField: "adjustmentId",
    });

    const overrideMap = reportItem
      ? new Map([
          [
            reportItem.productName.toLowerCase(),
            {
              totalBoxes: reportItem.totalBoxes,
              totalAmount: reportItem.totalAmount,
            },
          ],
        ])
      : null;
    const warehouseSummary = await getWarehouseInventorySummary(overrideMap);

    res.json({
      success: true,
      message: "Adjustment deleted and warehouse stock reverted",
      warehouseSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error deleting adjustment:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== BULK DELETE ====================
router.delete("/bulk", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      throw new Error("No adjustment IDs provided");
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) throw new Error("No valid adjustment IDs");

    const adjustments = await StockAdjustment.find({
      _id: { $in: validIds },
    })
      .populate("productId", "productName qtyPerCarton")
      .session(session);

    const previousDataArray = adjustments.map((adj) => adj.toObject());

    const byProduct = new Map();
    for (const adj of adjustments) {
      const key = adj.productId._id.toString();
      if (!byProduct.has(key)) byProduct.set(key, []);
      byProduct.get(key).push(adj);
    }

    const overrideMap = new Map();
    for (const [productId, adjs] of byProduct) {
      const product = await Product.findById(productId).session(session);
      if (!product) continue;

      const reportItem = await ReportInHand.findOne({
        productName: {
          $regex: new RegExp(`^${escapeRegex(product.productName)}$`, "i"),
        },
      }).session(session);
      if (!reportItem) continue;

      for (const adj of adjs) {
        const batchIndex = findBatchInReport(reportItem, adj);
        if (batchIndex !== -1) reportItem.batches.splice(batchIndex, 1);
      }

      recalculateTotals(reportItem);
      await reportItem.save({ session });
      overrideMap.set(reportItem.productName.toLowerCase(), {
        totalBoxes: reportItem.totalBoxes,
        totalAmount: reportItem.totalAmount,
      });
    }

    const result = await StockAdjustment.deleteMany({
      _id: { $in: validIds },
    }).session(session);
    await session.commitTransaction();
    session.endSession();

    // Log activity
    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Stock Adjustment(s)`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      previousData: previousDataArray,
      description: `Deleted ${result.deletedCount} stock adjustments. Affected products: ${byProduct.size}`,
      refField: "adjustmentIds",
    });

    const warehouseSummary = await getWarehouseInventorySummary(
      overrideMap.size > 0 ? overrideMap : null,
    );
    res.json({
      success: true,
      message: `${result.deletedCount} adjustment(s) deleted and warehouse stock reverted`,
      warehouseSummary,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk delete error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ==================== GET WAREHOUSE SUMMARY ====================
router.get("/summary/warehouse", async (req, res) => {
  try {
    const warehouseSummary = await getWarehouseInventorySummary();
    res.json({ success: true, warehouseSummary });
  } catch (error) {
    console.error("Error fetching warehouse summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch warehouse summary",
      error: error.message,
    });
  }
});

// ==================== FIXED: getWarehouseInventorySummary using same logic as combined-stock ====================
const getWarehouseInventorySummary = async (overrideMap = null) => {
  const allReports = await ReportInHand.find({}).lean();
  let totalAmount = 0;
  let totalProducts = 0;
  let totalBoxes = 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const report of allReports) {
    if (!report.batches || report.batches.length === 0) continue;

    let netBoxes = 0;
    let netAmount = 0;

    // Process each batch individually (same logic as processBatches)
    for (const batch of report.batches) {
      // Skip expired batches
      if (batch.expiryDate) {
        const expiry = new Date(batch.expiryDate);
        expiry.setHours(0, 0, 0, 0);
        if (expiry < today) continue;
      }

      let boxes = batch.boxes || 0;
      let amount = batch.amount || 0;

      // Apply override if provided (for real-time updates)
      if (overrideMap) {
        const key = (report.productName || "").toLowerCase();
        if (overrideMap.has(key)) {
          const fresh = overrideMap.get(key);
          boxes = fresh.totalBoxes;
          amount = fresh.totalAmount;
        }
      }

      const adjType = batch.adjustmentType?.toLowerCase();

      // Same sign logic as processBatches
      let sign = 0;
      if (adjType === "batch" || adjType === "add" || adjType === "return" || !adjType) {
        sign = 1;
      } else if (adjType === "remove") {
        sign = -1;
      } else {
        continue;
      }

      netBoxes += boxes * sign;
      netAmount += amount * sign;
    }

    // Apply MR sale deductions (same as combined-stock)
    const deductions = report.totalMrSaleDeductions || 0;
    const warehouseNetAmount = netAmount - deductions;

    // Only count products with positive stock
    if (netBoxes > 0) {
      totalAmount += warehouseNetAmount;
      totalProducts++;
      totalBoxes += netBoxes;
    }
  }

  return { 
    totalAmount: fixPrecision(totalAmount), 
    totalProducts,
    totalBoxes: fixPrecision(totalBoxes)
  };
};

// ==================== FIXED: GET / endpoint with consistent summary ====================
router.get("/", async (req, res) => {
  try {
    const adjustments = await StockAdjustment.find()
      .populate("productId", "productName qtyPerCarton")
      .sort({ createdAt: -1 })
      .lean();
    
    // Get warehouse summary using the fixed function
    const warehouseSummary = await getWarehouseInventorySummary();
    
    // Also get total from StockAdjustments for comparison (optional)
    let totalStockAdjustmentAmount = 0;
    for (const adj of adjustments) {
      if (adj.adjustmentType === "add" || adj.adjustmentType === "batch" || adj.adjustmentType === "return") {
        totalStockAdjustmentAmount += (adj.boxQuantity * (adj.unitCost || 0)) || 0;
      } else if (adj.adjustmentType === "remove") {
        totalStockAdjustmentAmount -= (adj.boxQuantity * (adj.unitCost || 0)) || 0;
      }
    }
    
    console.log('Warehouse Summary:', warehouseSummary);
    console.log('Total from Adjustments (approx):', totalStockAdjustmentAmount);
    
    res.json({
      success: true,
      data: adjustments,
      count: adjustments.length,
      warehouseSummary,
      // Optional: include adjustment total for debugging
      totalFromAdjustments: fixPrecision(totalStockAdjustmentAmount)
    });
  } catch (error) {
    console.error("Error fetching adjustments:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch adjustments" });
  }
});

// ==================== FIXED: Repair endpoint to recalculate all totals consistently ====================
router.post(
  "/repair/recalc-only",
  protect,
  allowAdminOnly,
  async (req, res) => {
    try {
      const allReports = await ReportInHand.find({});
      let updatedCount = 0;
      const details = [];

      for (const report of allReports) {
        const before = {
          totalBoxes: report.totalBoxes,
          totalAmount: report.totalAmount,
          averagePrice: report.averagePrice,
          totalBoxesFromBatches: report.totalBoxesFromBatches,
          addStockAdjustment: report.addStockAdjustment,
          removeStockAdjustment: report.removeStockAdjustment,
          returnStockAdjustment: report.returnStockAdjustment,
        };

        // Recalculate using the same logic as processBatches
        const batches = report.batches || [];
        let totalBoxesFromBatches = 0;
        let addStockAdjustment = 0;
        let removeStockAdjustment = 0;
        let returnStockAdjustment = 0;
        let totalAmount = 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (const b of batches) {
          // Skip expired batches
          if (b.expiryDate) {
            const expiry = new Date(b.expiryDate);
            expiry.setHours(0, 0, 0, 0);
            if (expiry < today) continue;
          }

          const type = b.adjustmentType;
          const boxes = Number(b.boxes) || 0;
          const amount = Number(b.amount) || 0;

          if (type === "batch") {
            totalBoxesFromBatches += boxes;
            totalAmount += amount;
          } else if (type === "return") {
            returnStockAdjustment += boxes;
            totalAmount += amount;
          } else if (type === "add") {
            addStockAdjustment += boxes;
            totalAmount += amount;
          } else if (type === "remove") {
            removeStockAdjustment += boxes;
            totalAmount -= amount;
          }
        }

        const totalBoxes = fixPrecision(
          totalBoxesFromBatches + addStockAdjustment + returnStockAdjustment - removeStockAdjustment
        );
        const fixedAmount = fixPrecision(totalAmount);
        const averagePrice = totalBoxes > 0 ? fixPrecision(fixedAmount / totalBoxes) : 0;

        report.totalBoxesFromBatches = fixPrecision(totalBoxesFromBatches);
        report.addStockAdjustment = fixPrecision(addStockAdjustment);
        report.removeStockAdjustment = fixPrecision(removeStockAdjustment);
        report.returnStockAdjustment = fixPrecision(returnStockAdjustment);
        report.totalBoxes = totalBoxes;
        report.totalAmount = fixedAmount;
        report.averagePrice = averagePrice;
        report.status = totalBoxes <= 0
          ? "Out of Stock"
          : totalBoxes < (report.minStockLevel || 10)
            ? "Low Stock"
            : "In Stock";
        report.updatedAt = new Date();

        await report.save();

        const changed = report.totalBoxes !== before.totalBoxes ||
          report.totalAmount !== before.totalAmount ||
          report.averagePrice !== before.averagePrice;

        if (changed) {
          updatedCount++;
          details.push({
            productName: report.productName,
            before,
            after: {
              totalBoxes: report.totalBoxes,
              totalAmount: report.totalAmount,
              averagePrice: report.averagePrice,
            },
          });
        }
      }

      await logActivity(req, {
        action: "REPAIR",
        actionLabel: `Recalculated Stock Totals (${updatedCount} products changed)`,
        tableName: "stockadjustments",
        tableLabel: "Stock Adjustment",
        description: `Recalculated ${allReports.length} products. ${updatedCount} had changes.`,
        newData: {
          totalProducts: allReports.length,
          updatedCount,
          details: details.slice(0, 10),
        },
      });

      const warehouseSummary = await getWarehouseInventorySummary();
      res.json({
        success: true,
        message: `Recalculated ${allReports.length} products. ${updatedCount} had changes.`,
        updatedCount,
        details,
        warehouseSummary,
      });
    } catch (error) {
      console.error("Repair error:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  },
);

// ==================== FIXED: Add a sync summary endpoint ====================
router.get("/summary/sync", async (req, res) => {
  try {
    // Get summary from ReportInHand using consistent logic
    const warehouseSummary = await getWarehouseInventorySummary();
    
    // Get summary directly from StockAdjustments
    const adjustments = await StockAdjustment.find({});
    let adjustmentTotal = 0;
    for (const adj of adjustments) {
      if (adj.adjustmentType === "add" || adj.adjustmentType === "batch" || adj.adjustmentType === "return") {
        adjustmentTotal += (adj.amount || 0);
      } else if (adj.adjustmentType === "remove") {
        adjustmentTotal -= (adj.amount || 0);
      }
    }
    
    // Get summary from combined-stock endpoint logic
    const ReportInHandModel = mongoose.model('ReportInHand');
    const allReports = await ReportInHandModel.find({}).lean();
    let combinedTotal = 0;
    let combinedBoxes = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const report of allReports) {
      if (!report.batches) continue;
      let netAmount = 0;
      let netBoxes = 0;
      
      for (const batch of report.batches) {
        if (batch.expiryDate) {
          const expiry = new Date(batch.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          if (expiry < today) continue;
        }
        
        const adjType = batch.adjustmentType?.toLowerCase();
        let sign = 0;
        if (adjType === "batch" || adjType === "add" || adjType === "return" || !adjType) {
          sign = 1;
        } else if (adjType === "remove") {
          sign = -1;
        } else {
          continue;
        }
        
        netBoxes += (batch.boxes || 0) * sign;
        netAmount += (batch.amount || 0) * sign;
      }
      
      const deductions = report.totalMrSaleDeductions || 0;
      const warehouseNetAmount = netAmount - deductions;
      
      if (netBoxes > 0) {
        combinedTotal += warehouseNetAmount;
        combinedBoxes += netBoxes;
      }
    }
    
    res.json({
      success: true,
      warehouseSummary,
      adjustmentTotal: fixPrecision(adjustmentTotal),
      combinedTotal: fixPrecision(combinedTotal),
      combinedBoxes: fixPrecision(combinedBoxes),
      message: "If values differ, run /repair/recalc-only to synchronize"
    });
  } catch (error) {
    console.error("Sync summary error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});


export default router;