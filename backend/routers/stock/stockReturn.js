import express from "express";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();

// ==================== Utility ====================

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
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
};

// ==================== Helper: get best available LC ====================
const getBestLcFallback = (reportItem) => {
  const batches = reportItem.batches || [];

  const sorted = [...batches].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
  );

  if ((reportItem.averagePrice || 0) > 0) return reportItem.averagePrice;

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

// ==================== Helper: warehouse summary ====================
const getWarehouseInventorySummary = async (overrideMap = null) => {
  const allReports = await ReportInHand.find({}).lean();
  let totalAmount = 0;
  let totalProducts = 0;

  for (const report of allReports) {
    let boxes = report.totalBoxes || 0;
    let amount = report.totalAmount || 0;

    if (overrideMap) {
      const key = (report.productName || "").toLowerCase();
      if (overrideMap.has(key)) {
        const fresh = overrideMap.get(key);
        boxes = fresh.totalBoxes;
        amount = fresh.totalAmount;
      }
    }
    if (boxes > 0) {
      totalAmount += amount;
      totalProducts++;
    }
  }
  return { totalAmount: fixPrecision(totalAmount), totalProducts };
};

// ==================== Core: recalculate totals ====================
// Batch types:
//   'batch'  — normal purchase batch  → adds boxes + amount
//   'add'    — manual stock add       → adds boxes + amount
//   'remove' — manual stock remove    → subtracts boxes + amount
//   'return' — sale return            → adds boxes BACK + amount BACK into warehouse
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

    if (type === "batch" || !type) {
      totalBoxesFromBatches += boxes;
      totalAmount += amount;
    } else if (type === "add") {
      addStockAdjustment += boxes;
      totalAmount += amount;
    } else if (type === "remove") {
      removeStockAdjustment += boxes;
      totalAmount -= amount;
    } else if (type === "return") {
      // Sale return: goods come BACK into warehouse, so boxes and amount go UP
      returnStockAdjustment += boxes;
      totalAmount += amount;
    }
  }

  // returnStockAdjustment is ADDED — returned goods are back in stock
  const totalBoxes = fixPrecision(
    totalBoxesFromBatches +
      addStockAdjustment -
      removeStockAdjustment +
      returnStockAdjustment,
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

// ==================== EXPORTED: apply sale return to warehouse ====================
// Import and call this from your sale return router when creating a sale return.
//
//   import { applyReturnToWarehouse } from "./stockAdjustment.js";
//
//   // Inside your sale return create route, for each returned product:
//   const updatedReport = await applyReturnToWarehouse(
//     { productName, boxes, lc, amount, saleReturnId, invoiceNumber },
//     session
//   );
export const applyReturnToWarehouse = async (
  { productName, boxes, lc, amount, saleReturnId, invoiceNumber },
  session,
) => {
  const reportItem = await ReportInHand.findOne({
    productName: {
      $regex: new RegExp(`^${escapeRegex(productName)}$`, "i"),
    },
  }).session(session);

  if (!reportItem) {
    throw new Error(
      `Product "${productName}" not found in warehouse. Cannot process return.`,
    );
  }

  const returnBatch = {
    _id: new mongoose.Types.ObjectId(),
    boxes: fixPrecision(Number(boxes)),
    lc: fixPrecision(Number(lc)),
    sellingPrice: 0,
    fob: 0,
    cif: 0,
    amount: fixPrecision(Number(amount)),
    date: new Date(),
    adjustmentType: "return",
    saleReturnId,
    invoiceNumber,
  };

  reportItem.batches.push(returnBatch);

  // CRITICAL: recalculate AFTER pushing, BEFORE saving — this updates totalBoxes
  recalculateTotals(reportItem);

  await reportItem.save({ session });

  return reportItem;
};

// ==================== EXPORTED: revert sale return from warehouse ====================
// Import and call this from your sale return router when deleting a sale return.
//
//   import { revertReturnFromWarehouse } from "./stockAdjustment.js";
//
//   // Inside your sale return delete route, for each returned product:
//   await revertReturnFromWarehouse({ productName, saleReturnId }, session);
export const revertReturnFromWarehouse = async (
  { productName, saleReturnId },
  session,
) => {
  const reportItem = await ReportInHand.findOne({
    productName: {
      $regex: new RegExp(`^${escapeRegex(productName)}$`, "i"),
    },
  }).session(session);

  if (!reportItem) return null;

  const beforeCount = reportItem.batches.length;

  // Remove all return batches that match this saleReturnId
  reportItem.batches = reportItem.batches.filter(
    (b) =>
      !(
        b.adjustmentType === "return" &&
        b.saleReturnId?.toString() === saleReturnId.toString()
      ),
  );

  if (reportItem.batches.length === beforeCount) {
    // No matching batch found — nothing to revert
    return reportItem;
  }

  recalculateTotals(reportItem);

  if (reportItem.totalBoxes < 0) {
    throw new Error(
      `Cannot cancel return: warehouse stock would go negative (${reportItem.totalBoxes}). ` +
        `The returned goods may have already been sold again.`,
    );
  }

  await reportItem.save({ session });
  return reportItem;
};

// ==================== GET /in-stock ====================
router.get("/in-stock", async (req, res) => {
  try {
    const { name } = req.query;
    const stockList = await ReportInHand.find(
      {},
      "productName totalBoxes totalAmount averagePrice",
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

    // 'return' is only ever created by the sale return flow via applyReturnToWarehouse()
    if (adjustmentType === "return")
      throw new Error(
        "Sale returns must be processed through the Sale Return flow, not stock adjustments.",
      );

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

    recalculateTotals(reportItem);

    const adjustmentQty = fixPrecision(Number(boxQuantity));
    const wasOutOfStock = reportItem.totalBoxes <= 0;

    if (adjustmentType === "remove" && reportItem.totalBoxes < adjustmentQty)
      throw new Error(
        `Insufficient stock. Available: ${reportItem.totalBoxes}, Requested: ${adjustmentQty}`,
      );

    let costPerBox = 0;
    let adjustmentAmount = 0;

    if (adjustmentType === "add") {
      if (unitCost && Number(unitCost) > 0) {
        costPerBox = Number(unitCost);
      } else {
        costPerBox = getBestLcFallback(reportItem);
        if (costPerBox === 0)
          throw new Error(
            "Cannot add stock: No cost found. Please provide a unit cost.",
          );
      }
      adjustmentAmount = fixPrecision(adjustmentQty * costPerBox);
    } else if (adjustmentType === "remove") {
      costPerBox =
        (reportItem.averagePrice || 0) > 0
          ? reportItem.averagePrice
          : getBestLcFallback(reportItem);
      adjustmentAmount = fixPrecision(adjustmentQty * costPerBox);
    }

    const newBatch = {
      _id: new mongoose.Types.ObjectId(),
      boxes: adjustmentQty,
      lc: costPerBox,
      fob: 0,
      cif: 0,
      amount: adjustmentAmount,
      date: new Date(),
      adjustmentType,
      batchNumber: `ADJ-${adjustmentType.toUpperCase()}-${Date.now()}`,
    };

    reportItem.batches.push(newBatch);
    recalculateTotals(reportItem);
    await reportItem.save({ session });

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
      costPerBox,
      amount: adjustmentAmount,
    });
    await adjustment.save({ session });
    await session.commitTransaction();
    session.endSession();

    await logActivity(req, {
      action: "CREATE",
      actionLabel: `${adjustmentType === "add" ? "Added" : "Removed"} Stock: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: adjustment._id,
      referenceNumber: adjustment._id.toString(),
      newData: {
        productName: toTitleCase(product.productName),
        adjustmentType,
        boxQuantity: adjustmentQty,
        costPerBox,
        amount: adjustmentAmount,
        remarks: remarks || "",
      },
      description: `${adjustmentType === "add" ? "Added" : "Removed"} ${adjustmentQty} boxes of ${toTitleCase(product.productName)} ${adjustmentType === "add" ? "to" : "from"} warehouse. Cost per box: ${costPerBox}, Total amount: ${adjustmentAmount}`,
      refField: "productId",
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
    res.status(500).json({
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

    const existing = await StockAdjustment.findById(id).session(session);
    if (!existing) throw new Error("Adjustment not found");

    // Block editing sale return adjustments via this route
    if (existing.adjustmentType === "return")
      throw new Error(
        "Sale return adjustments cannot be edited here. Please use the Sale Return flow.",
      );

    const previousRecord = existing.toObject();

    const { productId, boxQuantity, adjustmentType, remarks, unitCost } =
      req.body;

    // Block changing TO 'return' type manually
    if (adjustmentType === "return")
      throw new Error(
        "Cannot set adjustment type to 'return'. Use the Sale Return flow.",
      );

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

    // Remove old batch — never touch 'return' batches here
    const oldBatchIndex = reportItem.batches.findIndex(
      (b) =>
        b.adjustmentType === existing.adjustmentType &&
        b.adjustmentType !== "return" &&
        Number(b.boxes) === existing.boxQuantity &&
        b.batchNumber?.startsWith(
          `ADJ-${existing.adjustmentType.toUpperCase()}`,
        ),
    );
    if (oldBatchIndex !== -1) reportItem.batches.splice(oldBatchIndex, 1);

    recalculateTotals(reportItem);

    const newQty = fixPrecision(Number(boxQuantity));
    let costPerBox = 0;
    let adjustmentAmount = 0;

    if (adjustmentType === "add") {
      if (unitCost && Number(unitCost) > 0) {
        costPerBox = Number(unitCost);
      } else {
        costPerBox = getBestLcFallback(reportItem);
        if (costPerBox === 0)
          throw new Error(
            "Cannot add stock: No cost found. Please provide a unit cost.",
          );
      }
      adjustmentAmount = fixPrecision(newQty * costPerBox);
    } else if (adjustmentType === "remove") {
      costPerBox =
        (reportItem.averagePrice || 0) > 0
          ? reportItem.averagePrice
          : getBestLcFallback(reportItem);
      adjustmentAmount = fixPrecision(newQty * costPerBox);
    }

    const newBatch = {
      _id: new mongoose.Types.ObjectId(),
      boxes: newQty,
      lc: costPerBox,
      fob: 0,
      cif: 0,
      amount: adjustmentAmount,
      date: new Date(),
      adjustmentType,
      batchNumber: `ADJ-${adjustmentType.toUpperCase()}-${Date.now()}`,
    };

    reportItem.batches.push(newBatch);
    recalculateTotals(reportItem);

    if (reportItem.totalBoxes < 0)
      throw new Error(
        `Insufficient stock after update. Stock would be ${reportItem.totalBoxes}`,
      );

    await reportItem.save({ session });

    existing.productId = productId;
    existing.boxQuantity = newQty;
    existing.totalQuantity =
      adjustmentType === "add"
        ? newQty * (product.qtyPerCarton || 1)
        : -newQty * (product.qtyPerCarton || 1);
    existing.adjustmentType = adjustmentType;
    existing.remarks = remarks || "";
    existing.costPerBox = costPerBox;
    existing.amount = adjustmentAmount;
    existing.updatedAt = new Date();
    await existing.save({ session });

    await session.commitTransaction();
    session.endSession();

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Stock Adjustment: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: existing._id,
      referenceNumber: existing._id.toString(),
      previousData: previousRecord,
      newData: {
        productName: toTitleCase(product.productName),
        adjustmentType,
        boxQuantity: newQty,
        costPerBox,
        amount: adjustmentAmount,
        remarks: remarks || "",
      },
      description: `Updated stock adjustment for ${toTitleCase(product.productName)}: Changed from ${previousRecord.boxQuantity} ${previousRecord.adjustmentType} to ${newQty} ${adjustmentType}`,
      refField: "productId",
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
      data: await StockAdjustment.findById(existing._id).populate(
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
    res.status(500).json({ success: false, message: error.message });
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

    // Block deleting sale return adjustments via this route
    if (adjustment.adjustmentType === "return")
      throw new Error(
        "Sale return adjustments cannot be deleted here. Please reverse through the Sale Return flow.",
      );

    const product = adjustment.productId;
    const previousRecord = adjustment.toObject();

    const reportItem = await ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(product.productName)}$`, "i"),
      },
    }).session(session);

    if (reportItem) {
      // Never accidentally remove a 'return' batch here
      const batchIndex = reportItem.batches.findIndex(
        (b) =>
          b.adjustmentType === adjustment.adjustmentType &&
          b.adjustmentType !== "return" &&
          Number(b.boxes) === adjustment.boxQuantity &&
          b.batchNumber?.startsWith(
            `ADJ-${adjustment.adjustmentType.toUpperCase()}`,
          ),
      );
      if (batchIndex !== -1) reportItem.batches.splice(batchIndex, 1);

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

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Stock Adjustment: ${toTitleCase(product.productName)}`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      recordId: adjustment._id,
      referenceNumber: adjustment._id.toString(),
      previousData: previousRecord,
      description: `Deleted stock adjustment for ${toTitleCase(product.productName)}: ${adjustment.adjustmentType} of ${adjustment.boxQuantity} boxes`,
      refField: "productId",
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
    res.status(500).json({ success: false, message: error.message });
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

    const adjustments = await StockAdjustment.find({ _id: { $in: validIds } })
      .populate("productId", "productName qtyPerCarton")
      .session(session);

    // Block bulk delete if any selected is a 'return' type
    const returnAdj = adjustments.find((a) => a.adjustmentType === "return");
    if (returnAdj)
      throw new Error(
        "Selection contains sale return adjustments which cannot be deleted here. Please deselect them and use the Sale Return flow.",
      );

    const deletedRecords = adjustments.map((adj) => adj.toObject());

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
        // Never remove a 'return' batch here
        const batchIndex = reportItem.batches.findIndex(
          (b) =>
            b.adjustmentType === adj.adjustmentType &&
            b.adjustmentType !== "return" &&
            Number(b.boxes) === adj.boxQuantity &&
            b.batchNumber?.startsWith(
              `ADJ-${adj.adjustmentType.toUpperCase()}`,
            ),
        );
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

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Bulk Deleted ${result.deletedCount} Stock Adjustment(s)`,
      tableName: "stockadjustments",
      tableLabel: "Stock Adjustment",
      previousData: deletedRecords,
      description: `Deleted ${result.deletedCount} stock adjustments. Affected products: ${Array.from(byProduct.keys()).length}`,
      refField: "productId",
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
    res.status(500).json({ success: false, message: error.message });
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

// ==================== REPAIR: recalc all products ====================
// Hit POST /repair/recalc-only once after deploying this fix.
// It will correct all existing documents where return batches were
// stored but not counted into totalBoxes (e.g. ecozin 5: 9899 → 9939).
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
        };

        recalculateTotals(report);
        await report.save();

        const changed =
          report.totalBoxes !== before.totalBoxes ||
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
        description: `Recalculated totals for ${allReports.length} products. ${updatedCount} products had changes.`,
        newData: {
          totalProducts: allReports.length,
          changedProducts: updatedCount,
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

export default router;
