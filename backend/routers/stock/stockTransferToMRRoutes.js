import express from "express";
import stockInMRHand from "../../models/stock/stockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Recalculate all totals on a ReportInHand document in-place.
// ─────────────────────────────────────────────────────────────────────────────
const recalcReportTotals = (productStock) => {
  const batchEntries = productStock.batches.filter(
    (b) => !b.adjustmentType || b.adjustmentType === "batch",
  );
  const addEntries = productStock.batches.filter(
    (b) => b.adjustmentType === "add",
  );
  const removeEntries = productStock.batches.filter(
    (b) => b.adjustmentType === "remove",
  );

  const totalBoxesFromBatches = batchEntries.reduce(
    (s, b) => s + (b.boxes || 0),
    0,
  );
  const addBoxes = addEntries.reduce((s, b) => s + (b.boxes || 0), 0);
  const removeBoxes = removeEntries.reduce((s, b) => s + (b.boxes || 0), 0);
  const totalAmount = batchEntries.reduce((s, b) => s + (b.amount || 0), 0);

  productStock.totalBoxesFromBatches = totalBoxesFromBatches;
  productStock.addStockAdjustment = addBoxes;
  productStock.removeStockAdjustment = removeBoxes;
  productStock.totalBoxes = totalBoxesFromBatches + addBoxes - removeBoxes;
  productStock.totalAmount = totalAmount;
  productStock.averagePrice =
    totalBoxesFromBatches > 0 ? totalAmount / totalBoxesFromBatches : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Get LC AND sellingPrice from ReportInHand batches for a product.
//
// WHAT CHANGED:  previously only lc was returned.  Now we also return
// sellingPrice so the transfer route can store it on every item and every
// productsInHand entry.
//
// Strategy: use the most-recent batch that still has stock (boxes > 0).
// Fall back to the last batch in the array if none have stock.
// ─────────────────────────────────────────────────────────────────────────────
const getPricesFromReportInHand = async (productName, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock || !productStock.batches?.length) {
    return { lc: 0, sellingPrice: 0 };
  }

  // Prefer the most-recent batch that still has boxes
  const batchWithStock = [...productStock.batches]
    .reverse()
    .find((b) => (b.boxes || 0) > 0);

  const batch =
    batchWithStock || productStock.batches[productStock.batches.length - 1];

  return {
    lc: batch?.lc || 0,
    sellingPrice: batch?.sellingPrice || productStock.sellingPrice || 0,
  };
};

// Keep old helper name for backward-compat with receive / addBack paths
const getLCFromReportInHand = async (productName, session) => {
  const { lc } = await getPricesFromReportInHand(productName, session);
  return lc;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Deduct stock from ReportInHand batches (FIFO).
// Returns { lc, sellingPrice, deductedAmount }.
// ─────────────────────────────────────────────────────────────────────────────
const deductFromReportInHand = async (productName, qty, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  let remaining = qty;
  let totalDeductedAmount = 0;
  let totalDeductedBoxes = 0;
  let lastUsedLC = 0;
  let lastUsedSellingPrice = 0;

  for (const batch of productStock.batches) {
    if (remaining <= 0) break;
    if (batch.adjustmentType && batch.adjustmentType !== "batch") continue;

    const batchLC = batch.lc || 0;
    const batchSellingPrice =
      batch.sellingPrice || productStock.sellingPrice || 0;
    lastUsedLC = batchLC;
    lastUsedSellingPrice = batchSellingPrice;

    if (batch.boxes >= remaining) {
      const amountToDeduct = remaining * batchLC;
      totalDeductedAmount += amountToDeduct;
      totalDeductedBoxes += remaining;
      batch.boxes -= remaining;
      batch.amount = Math.max(0, (batch.amount || 0) - amountToDeduct);
      remaining = 0;
    } else {
      const amountToDeduct = batch.boxes * batchLC;
      totalDeductedAmount += amountToDeduct;
      totalDeductedBoxes += batch.boxes;
      remaining -= batch.boxes;
      batch.boxes = 0;
      batch.amount = 0;
    }
  }

  if (remaining > 0) throw new Error(`Insufficient stock for ${productName}`);

  recalcReportTotals(productStock);
  await productStock.save({ session });

  const weightedLC =
    totalDeductedBoxes > 0
      ? totalDeductedAmount / totalDeductedBoxes
      : lastUsedLC;

  return {
    lc: weightedLC,
    sellingPrice: lastUsedSellingPrice,
    deductedAmount: totalDeductedAmount,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Add stock back to ReportInHand.
// ─────────────────────────────────────────────────────────────────────────────
const addBackToReportInHand = async (productName, qty, lc, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  const lastBatch = productStock.batches[productStock.batches.length - 1];
  if (!lastBatch) throw new Error(`No batch found for ${productName}`);

  const useLC = lc || lastBatch.lc || 0;
  const amountToAdd = qty * useLC;

  if (Math.abs((lastBatch.lc || 0) - useLC) < 0.001) {
    lastBatch.boxes += qty;
    lastBatch.amount = (lastBatch.amount || 0) + amountToAdd;
  } else {
    productStock.batches.push({
      batchNo: `BATCH-RETURN-${Date.now()}`,
      boxes: qty,
      lc: useLC,
      amount: amountToAdd,
      date: new Date().toISOString().split("T")[0],
      adjustmentType: "batch",
    });
  }

  recalcReportTotals(productStock);
  await productStock.save({ session });
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Recompute stockInMRHand for one MR from all their transfers.
//
// WHAT CHANGED:
//   • productMap entries now carry sellingPrice.
//   • sellingPrice is stored on every finalProducts entry.
//   • It is sourced from:
//       1. The transfer item's own sellingPrice field (set during POST/PUT)
//       2. Fallback to ReportInHand batch lookup (for legacy records)
// ─────────────────────────────────────────────────────────────────────────────
const recomputeMRStock = async (mrId, mrName, session) => {
  if (!mrId && !mrName) return;

  const cleanedMrName = mrName?.replace(/\s+/g, " ").trim() || "";

  const orConditions = [];
  if (mrId) {
    try {
      orConditions.push({ mrId: new mongoose.Types.ObjectId(mrId.toString()) });
    } catch {
      orConditions.push({ mrId });
    }
  }
  if (cleanedMrName) {
    orConditions.push({
      stockTransferToMr: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    });
    orConditions.push({
      stockTransferFromMrToMain: {
        $regex: new RegExp(`^${cleanedMrName}$`, "i"),
      },
    });
    orConditions.push({
      mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    });
  }
  if (orConditions.length === 0) return;

  const allTransfers = await StockTransferToMR.find({
    $or: orConditions,
  }).session(session);

  const productMap = new Map();

  for (const transfer of allTransfers) {
    if (!Array.isArray(transfer.items)) continue;

    for (const item of transfer.items) {
      const key = item.productId?.toString();
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName || "Unknown",
          lc: item.lc || 0,
          sellingPrice: item.sellingPrice || 0, // ← NEW
          assignedQuantity: 0,
          quantity: 0,
          lastUpdated: transfer.updatedAt || transfer.createdAt || new Date(),
        });
      }

      const entry = productMap.get(key);

      if (item.lc) entry.lc = item.lc;
      if (item.sellingPrice) entry.sellingPrice = item.sellingPrice; // ← NEW
      if (item.productName) entry.productName = item.productName;

      const transferDate =
        transfer.updatedAt || transfer.createdAt || new Date();
      if (new Date(transferDate) > new Date(entry.lastUpdated)) {
        entry.lastUpdated = transferDate;
      }

      if (transfer.transferType === "send") {
        entry.assignedQuantity += item.boxQuantity || 0;
        entry.quantity += item.boxQuantity || 0;
      } else if (transfer.transferType === "receive") {
        entry.quantity = Math.max(0, entry.quantity - (item.boxQuantity || 0));
        if (entry.quantity === 0) entry.assignedQuantity = 0;
      }
    }
  }

  // Find or prepare the existing stockInMRHand document
  let existingMRStock = null;
  if (mrId) {
    try {
      existingMRStock = await stockInMRHand
        .findOne({ mrId: new mongoose.Types.ObjectId(mrId.toString()) })
        .session(session);
    } catch {
      existingMRStock = await stockInMRHand.findOne({ mrId }).session(session);
    }
  }
  if (!existingMRStock && cleanedMrName) {
    existingMRStock = await stockInMRHand
      .findOne({ mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") } })
      .session(session);
  }

  // Build final product list
  const finalProducts = [];

  for (const [, entry] of productMap.entries()) {
    const transferQty = Math.max(0, entry.quantity);
    const lc = entry.lc || 0;
    const sellingPrice = entry.sellingPrice || 0; // ← NEW

    const existingProduct = existingMRStock?.productsInHand?.find(
      (p) => p.productId?.toString() === entry.productId?.toString(),
    );

    let finalQty = transferQty;
    if (existingProduct) {
      const existingQty = existingProduct.quantity || 0;
      const existingAssigned = existingProduct.assignedQuantity || 0;
      const soldQty = Math.max(0, existingAssigned - existingQty);
      finalQty = Math.max(0, transferQty - soldQty);
    }

    const finalAssignedQty = finalQty === 0 ? 0 : entry.assignedQuantity;

    finalProducts.push({
      productId: entry.productId,
      productName: entry.productName,
      quantity: finalQty,
      assignedQuantity: finalAssignedQty,
      lc,
      sellingPrice, // ← NEW
      amount: lc * finalQty,
      productCost: Math.ceil(lc * finalQty),
      lastUpdated: entry.lastUpdated,
    });
  }

  // Preserve products that exist in MR hand but had no transfer record
  if (existingMRStock) {
    for (const existingProduct of existingMRStock.productsInHand || []) {
      const inTransfer = productMap.has(existingProduct.productId?.toString());
      if (!inTransfer && existingProduct.quantity > 0) {
        finalProducts.push({
          productId: existingProduct.productId,
          productName: existingProduct.productName,
          quantity: existingProduct.quantity,
          assignedQuantity: existingProduct.assignedQuantity || 0,
          lc: existingProduct.lc || 0,
          sellingPrice: existingProduct.sellingPrice || 0, // ← NEW
          amount: existingProduct.amount || 0,
          productCost: existingProduct.productCost || 0,
          lastUpdated: existingProduct.lastUpdated,
        });
      }
    }
  }

  const newTotalAmount = finalProducts.reduce((s, p) => s + (p.amount || 0), 0);
  const newTotalProductCost = finalProducts.reduce(
    (s, p) => s + (p.productCost || 0),
    0,
  );

  if (!existingMRStock) {
    if (finalProducts.length > 0) {
      const newMRStock = new stockInMRHand({
        mrId: mrId || undefined,
        mrName: cleanedMrName,
        productsInHand: finalProducts,
        totalAmount: newTotalAmount,
        totalProductCost: newTotalProductCost,
      });
      await newMRStock.save({ session });
      return newMRStock;
    }
  } else {
    if (mrId && !existingMRStock.mrId) existingMRStock.mrId = mrId;
    existingMRStock.productsInHand = finalProducts;
    existingMRStock.totalAmount = newTotalAmount;
    existingMRStock.totalProductCost = newTotalProductCost;
    await existingMRStock.save({ session });
    return existingMRStock;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Invoice number generation
// ─────────────────────────────────────────────────────────────────────────────
const generateNextStockTransferNumber = async () => {
  try {
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");
    const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
    const lastNum = match ? parseInt(match[1], 10) : 0;
    return `ST-${(lastNum + 1).toString().padStart(4, "0")}`;
  } catch (error) {
    console.error("Error generating number:", error);
    return "ST-0001";
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /next-number
// ─────────────────────────────────────────────────────────────────────────────
router.get("/next-number", async (req, res) => {
  try {
    const nextNumber = await generateNextStockTransferNumber();
    res.json({ success: true, nextNumber });
  } catch {
    res.json({ success: true, nextNumber: "ST-0001" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /last-number
// ─────────────────────────────────────────────────────────────────────────────
router.get("/last-number", async (req, res) => {
  try {
    const lastTransfer = await StockTransferToMR.findOne()
      .sort({ invoiceNo: -1 })
      .select("invoiceNo");
    const match = lastTransfer?.invoiceNo?.match(/ST-(\d+)/);
    const lastNumber = match ? parseInt(match[1], 10) : 0;
    res.json({ success: true, lastNumber });
  } catch {
    res.json({ success: true, lastNumber: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-stock-by-mr-id/:mrId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-stock-by-mr-id/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;
    let mrStock = null;

    try {
      mrStock = await stockInMRHand
        .findOne({ mrId: new mongoose.Types.ObjectId(mrId) })
        .populate({
          path: "productsInHand.productId",
          select: "productName lc costPrice",
        });
    } catch {
      mrStock = await stockInMRHand
        .findOne({ mrId })
        .populate({
          path: "productsInHand.productId",
          select: "productName lc costPrice",
        });
    }

    if (!mrStock) {
      return res.json({ success: true, data: null, products: [] });
    }

    const products = (mrStock.productsInHand || []).map((p) => {
      const lc = p.lc || p.productId?.lc || p.productId?.costPrice || 0;
      return {
        _id: p._id?.toString(),
        productId: (p.productId?._id || p.productId)?.toString(),
        productName: p.productName || p.productId?.productName || "Unknown",
        quantity: p.quantity || 0,
        assignedQuantity: p.assignedQuantity || 0,
        lc,
        sellingPrice: p.sellingPrice || 0, // ← NEW
        amount: p.amount || 0,
        productCost: p.productCost || 0,
        lastUpdated: p.lastUpdated,
      };
    });

    res.json({
      success: true,
      data: {
        _id: mrStock._id?.toString(),
        mrId: mrStock.mrId?.toString(),
        mrName: mrStock.mrName,
        totalAmount: mrStock.totalAmount || 0,
        totalProductCost: mrStock.totalProductCost || 0,
      },
      products,
    });
  } catch (err) {
    console.error("Failed to fetch MR stock by mrId:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list all transfers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const transfers = await StockTransferToMR.find()
      .populate({ path: "items.productId", select: "productName lc costPrice" })
      .sort({ createdAt: -1 });

    const transfersWithCosts = transfers.map((transfer) => {
      const transferObj = transfer.toObject();
      let totalTransferCost = 0;

      if (transfer.items && Array.isArray(transfer.items)) {
        const itemsWithCosts = transfer.items.map((item) => {
          const itemObj = item.toObject ? item.toObject() : item;
          const lc =
            item.lc || item.productId?.lc || item.productId?.costPrice || 0;
          const boxQuantity = item.boxQuantity || 0;
          const itemCost = lc * boxQuantity;
          totalTransferCost += itemCost;
          return {
            ...itemObj,
            lc,
            sellingPrice: item.sellingPrice || 0, // ← NEW
            itemCost,
            productName:
              item.productName ||
              item.productId?.productName ||
              "Unknown Product",
          };
        });
        transferObj.items = itemsWithCosts;
      }
      transferObj.totalTransferCost = totalTransferCost;
      return transferObj;
    });

    res.json(transfersWithCosts);
  } catch (err) {
    console.error("Failed to fetch transfers:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-hand-admin
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand-admin", async (req, res) => {
  try {
    const { mrName, search } = req.query;
    const matchStage = { $match: {} };
    if (mrName && mrName !== "all") {
      matchStage.$match.mrName = { $regex: new RegExp(`^${mrName}$`, "i") };
    }

    const stockAggregation = [
      matchStage,
      { $unwind: "$productsInHand" },
      {
        $lookup: {
          from: "products",
          localField: "productsInHand.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $unwind: { path: "$productDetails", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          mrId: 1,
          mrName: 1,
          createdAt: 1,
          updatedAt: 1,
          productId: "$productsInHand.productId",
          productName: {
            $cond: {
              if: { $gt: ["$productsInHand.productName", ""] },
              then: "$productsInHand.productName",
              else: "$productDetails.productName",
            },
          },
          quantity: "$productsInHand.quantity",
          assignedQuantity: "$productsInHand.assignedQuantity",
          lc: {
            $cond: {
              if: { $gt: ["$productsInHand.lc", 0] },
              then: "$productsInHand.lc",
              else: "$productDetails.lc",
            },
          },
          sellingPrice: "$productsInHand.sellingPrice", // ← NEW
          amount: "$productsInHand.amount",
          productCost: "$productsInHand.productCost",
          costPrice: "$productDetails.costPrice",
          unit: "$productDetails.unit",
          category: "$productDetails.category",
          packSize: "$productDetails.packSize",
          productCode: "$productDetails.productCode",
          stockId: "$_id",
          lastUpdated: "$productsInHand.lastUpdated",
        },
      },
      { $sort: { mrName: 1, productName: 1 } },
    ];

    const stockResults = await stockInMRHand.aggregate(stockAggregation);

    const formattedResult = stockResults.map((item) => {
      const remainingQty = item.quantity || 0;
      const assignedQty = item.assignedQuantity || remainingQty;
      const usedQty = Math.max(0, assignedQty - remainingQty);
      const lc = item.lc || 0;
      const amount =
        item.amount !== undefined && item.amount !== null
          ? item.amount
          : lc * remainingQty;
      const productCost =
        item.productCost !== undefined && item.productCost !== null
          ? item.productCost
          : Math.ceil(amount);

      return {
        assignedDate: item.lastUpdated
          ? new Date(item.lastUpdated).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        assignedQty,
        batch: "N/A",
        createdAt: item.createdAt
          ? new Date(item.createdAt).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        expiry: "N/A",
        id: `${item.stockId?.toString()}-${item.productId}`,
        invoiceNumbers: [],
        mrCode: item.mrName,
        mrName: item.mrName,
        productCode:
          item.productCode ||
          `PROD-${item.productId?.toString().slice(-4) || "0000"}`,
        productId: item.productId,
        productName: item.productName || "Unknown Product",
        remainingQty,
        usedQty,
        status:
          remainingQty > 0
            ? usedQty > 0
              ? "Partial Used"
              : "Active"
            : "Depleted",
        boxQuantity: remainingQty,
        quantity: remainingQty,
        lc,
        sellingPrice: item.sellingPrice || 0, // ← NEW
        amount,
        productCost,
        unit: item.unit || "pcs",
        category: item.category || "General",
        packSize: item.packSize || 0,
        costPrice: item.costPrice || 0,
        lastUpdated: item.lastUpdated || item.createdAt,
      };
    });

    let filteredResult = formattedResult;
    if (search && search.trim()) {
      const searchLower = search.toLowerCase();
      filteredResult = formattedResult.filter(
        (item) =>
          item.productName?.toLowerCase().includes(searchLower) ||
          item.productCode?.toLowerCase().includes(searchLower) ||
          item.mrName?.toLowerCase().includes(searchLower),
      );
    }

    res.json({
      success: true,
      data: filteredResult,
      count: filteredResult.length,
    });
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-hand
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand", async (req, res) => {
  try {
    const { mrName, search } = req.query;
    const filter = {};
    if (mrName) {
      filter.mrName = { $regex: new RegExp(`^${mrName.trim()}$`, "i") };
    }

    const stock = await stockInMRHand
      .find(filter)
      .populate({
        path: "productsInHand.productId",
        select: "productName lc costPrice sellingPrice",
      })
      .sort({ mrName: 1 });

    const flattenedStock = stock
      .map((mrStock) =>
        (mrStock.productsInHand || [])
          .filter((product) => {
            if (!search) return true;
            const name =
              product.productName || product.productId?.productName || "";
            return name.toLowerCase().includes(search.toLowerCase());
          })
          .map((product) => {
            const remainingQty = Number(product.quantity ?? 0);
            const assignedQty = Number(
              product.assignedQuantity ?? product.quantity ?? 0,
            );
            const usedQty = Math.max(0, assignedQty - remainingQty);
            const utilization =
              assignedQty > 0 ? Math.round((usedQty / assignedQty) * 100) : 0;

            let status = "Active";
            if (assignedQty > 0 && remainingQty === 0) status = "Depleted";
            else if (usedQty > 0 && remainingQty > 0) status = "Partial Used";

            const lc =
              product.lc ||
              product.productId?.lc ||
              product.productId?.costPrice ||
              0;

            // sellingPrice: prefer stored value, fallback to Product master
            const sellingPrice =
              product.sellingPrice || product.productId?.sellingPrice || 0;

            const amount =
              product.amount !== undefined && product.amount !== null
                ? product.amount
                : lc * remainingQty;
            const productCost =
              product.productCost !== undefined && product.productCost !== null
                ? product.productCost
                : Math.ceil(amount);

            return {
              id: `${mrStock._id}-${product._id}`,
              mrId: mrStock.mrId,
              mrName: mrStock.mrName,
              productId: product.productId?._id || product.productId,
              productName:
                product.productName ||
                product.productId?.productName ||
                "Unknown",
              assignedQty,
              remainingQty,
              usedQty,
              utilization,
              lc,
              sellingPrice, // ← NEW
              amount,
              productCost,
              assignedDate: product.lastUpdated || mrStock.createdAt,
              lastUpdated: product.lastUpdated || mrStock.updatedAt,
              createdAt: mrStock.createdAt,
              status,
              quantity: remainingQty,
              boxQuantity: remainingQty,
            };
          }),
      )
      .flat();

    res.json({ success: true, data: flattenedStock });
  } catch (err) {
    console.error("Failed to fetch MR stock:", err);
    res.status(500).json({ success: false, error: "Server Error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mrs
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mrs", async (req, res) => {
  try {
    const mrs = await stockInMRHand.aggregate([
      { $match: { productsInHand: { $exists: true, $ne: [] } } },
      { $group: { _id: "$mrId", mrName: { $first: "$mrName" } } },
      { $project: { mrId: "$_id", mrName: 1, _id: 0 } },
      { $sort: { mrName: 1 } },
    ]);
    res.json({ success: true, data: mrs });
  } catch (error) {
    console.error("Error fetching MR list:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Create new transfer
//
// WHAT CHANGED:
//   • itemsWithLC is now built by getPricesFromReportInHand, which returns
//     BOTH lc AND sellingPrice from the matching ReportInHand batch.
//   • sellingPrice is stored on every merged item.
//   • After deductFromReportInHand (which also returns sellingPrice), the
//     item's sellingPrice is updated with the actual batch value.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;
    let invoiceNo = data.invoiceNo;
    if (!invoiceNo || invoiceNo === "ST-0001") {
      invoiceNo = await generateNextStockTransferNumber();
    }

    // ── Step 1: Resolve lc + sellingPrice for every item from ReportInHand ──
    const itemsWithPrices = await Promise.all(
      data.items.map(async (item) => {
        try {
          const { lc, sellingPrice } = await getPricesFromReportInHand(
            item.productName,
            session,
          );
          let lcValue = lc;
          if (!lcValue) {
            const product = await Product.findById(item.productId).session(
              session,
            );
            lcValue = product?.lc || product?.costPrice || 0;
          }
          return {
            ...item,
            lc: lcValue,
            sellingPrice: item.sellingPrice || sellingPrice || 0, // prefer incoming, then ReportInHand
            productName: item.productName || "Unknown",
          };
        } catch {
          return {
            ...item,
            lc: 0,
            sellingPrice: 0,
            productName: item.productName || "Unknown",
          };
        }
      }),
    );

    // ── Step 2: Merge duplicate productId rows ────────────────────────────
    const mergedItemsMap = new Map();
    for (const item of itemsWithPrices) {
      const key = item.productId?.toString();
      if (mergedItemsMap.has(key)) {
        const ex = mergedItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.amount = (ex.lc || 0) * ex.boxQuantity;
        ex.productCost = Math.ceil(ex.amount);
        // Keep the most recent sellingPrice
        if (item.sellingPrice) ex.sellingPrice = item.sellingPrice;
      } else {
        mergedItemsMap.set(key, { ...item });
      }
    }
    const mergedItems = Array.from(mergedItemsMap.values());

    // ── Step 3: Save the transfer document ───────────────────────────────
    const [newTransfer] = await StockTransferToMR.create(
      [{ ...data, invoiceNo, items: mergedItems }],
      { session },
    );

    // ── Step 4: Deduct / restore ReportInHand stock ───────────────────────
    if (data.transferType === "send") {
      for (const item of mergedItems) {
        const { lc: deductedLC, sellingPrice: deductedSP } =
          await deductFromReportInHand(
            item.productName,
            item.boxQuantity,
            session,
          );

        item.lc = deductedLC || item.lc;
        item.sellingPrice = deductedSP || item.sellingPrice; // ← NEW
        item.amount = (item.lc || 0) * item.boxQuantity;
        item.productCost = Math.ceil(item.amount);
      }
      // Persist updated lc / sellingPrice back onto the transfer
      await StockTransferToMR.findByIdAndUpdate(
        newTransfer._id,
        { items: mergedItems },
        { session },
      );
    } else if (data.transferType === "receive") {
      for (const item of mergedItems) {
        const lcValue = item.lc || 0;
        const amountToAdd = item.boxQuantity * lcValue;
        const productStock = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${item.productName}$`, "i") },
        }).session(session);

        if (!productStock) {
          await ReportInHand.create(
            [
              {
                productName: item.productName,
                sellingPrice: item.sellingPrice || 0,
                batches: [
                  {
                    batchNo: `BATCH-RETURN-${Date.now()}`,
                    boxes: item.boxQuantity,
                    lc: lcValue,
                    sellingPrice: item.sellingPrice || 0,
                    amount: amountToAdd,
                    date: new Date().toISOString().split("T")[0],
                    adjustmentType: "batch",
                  },
                ],
                totalBoxes: item.boxQuantity,
                totalBoxesFromBatches: item.boxQuantity,
                totalAmount: amountToAdd,
                averagePrice: lcValue,
              },
            ],
            { session },
          );
        } else {
          const lastBatch =
            productStock.batches[productStock.batches.length - 1];
          if (!lastBatch || Math.abs((lastBatch.lc || 0) - lcValue) > 0.001) {
            productStock.batches.push({
              batchNo: `BATCH-RETURN-${Date.now()}`,
              boxes: item.boxQuantity,
              lc: lcValue,
              sellingPrice: item.sellingPrice || 0,
              amount: amountToAdd,
              date: new Date().toISOString().split("T")[0],
              adjustmentType: "batch",
            });
          } else {
            lastBatch.boxes += item.boxQuantity;
            lastBatch.amount = (lastBatch.amount || 0) + amountToAdd;
          }
          recalcReportTotals(productStock);
          await productStock.save({ session });
        }
      }
    }

    // ── Step 5: Recompute stockInMRHand ───────────────────────────────────
    const mrId = data.mrId;
    const mrName =
      data.stockTransferToMr ||
      data.stockTransferFromMrToMain ||
      data.mrName ||
      "";
    if (mrId || mrName) {
      await recomputeMRStock(mrId, mrName, session);
    }

    await session.commitTransaction();
    res.status(201).json({
      success: true,
      message: "Stock transfer created successfully!",
      data: newTransfer,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSFER CREATE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /:id — Update a transfer
//
// WHAT CHANGED: sellingPrice is now updated on the merged items alongside lc.
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const existing = await StockTransferToMR.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: "Transfer not found" });
    }

    const data = req.body;
    const oldMrId = existing.mrId;
    const oldMrName =
      existing.stockTransferToMr ||
      existing.stockTransferFromMrToMain ||
      existing.mrName ||
      "";

    // Resolve prices for incoming items
    const newItemsWithPrices = await Promise.all(
      data.items.map(async (item) => {
        try {
          const { lc, sellingPrice } = await getPricesFromReportInHand(
            item.productName,
            session,
          );
          let lcValue = lc;
          if (!lcValue) {
            const product = await Product.findById(item.productId).session(
              session,
            );
            lcValue = product?.lc || product?.costPrice || 0;
          }
          return {
            ...item,
            lc: lcValue,
            sellingPrice: item.sellingPrice || sellingPrice || 0,
            productName: item.productName || "Unknown",
          };
        } catch {
          return {
            ...item,
            lc: 0,
            sellingPrice: 0,
            productName: item.productName || "Unknown",
          };
        }
      }),
    );

    const newItemsMap = new Map();
    for (const item of newItemsWithPrices) {
      const key = item.productId?.toString();
      if (newItemsMap.has(key)) {
        const ex = newItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.amount = (ex.lc || 0) * ex.boxQuantity;
        ex.productCost = Math.ceil(ex.amount);
        if (item.sellingPrice) ex.sellingPrice = item.sellingPrice;
      } else {
        newItemsMap.set(key, { ...item });
      }
    }
    const mergedNewItems = Array.from(newItemsMap.values());

    const oldItemsMap = new Map();
    for (const item of existing.items) {
      const key = item.productId?.toString();
      if (oldItemsMap.has(key)) {
        oldItemsMap.get(key).boxQuantity += item.boxQuantity || 0;
      } else {
        oldItemsMap.set(key, {
          boxQuantity: item.boxQuantity || 0,
          productName: item.productName,
          lc: item.lc || 0,
          sellingPrice: item.sellingPrice || 0, // ← NEW
        });
      }
    }

    if (existing.transferType === "send") {
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const diff = (newItem?.boxQuantity || 0) - (oldItem.boxQuantity || 0);

        if (newItem) {
          if (diff > 0) {
            const { sellingPrice: sp } = await deductFromReportInHand(
              oldItem.productName,
              diff,
              session,
            );
            if (sp) newItem.sellingPrice = sp;
          } else if (diff < 0) {
            await addBackToReportInHand(
              oldItem.productName,
              Math.abs(diff),
              oldItem.lc,
              session,
            );
          }
        } else {
          await addBackToReportInHand(
            oldItem.productName,
            oldItem.boxQuantity,
            oldItem.lc,
            session,
          );
        }
      }

      for (const [key, newItem] of newItemsMap.entries()) {
        if (!oldItemsMap.has(key)) {
          const { sellingPrice: sp } = await deductFromReportInHand(
            newItem.productName,
            newItem.boxQuantity,
            session,
          );
          if (sp) newItem.sellingPrice = sp;
        }
      }
    } else if (existing.transferType === "receive") {
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const diff = (newItem?.boxQuantity || 0) - (oldItem.boxQuantity || 0);

        if (newItem) {
          if (diff > 0) {
            const lcValue = newItem.lc || oldItem.lc || 0;
            const productStock = await ReportInHand.findOne({
              productName: {
                $regex: new RegExp(`^${oldItem.productName}$`, "i"),
              },
            }).session(session);

            if (productStock) {
              const lastBatch =
                productStock.batches[productStock.batches.length - 1];
              const amountToAdd = diff * lcValue;
              if (
                !lastBatch ||
                Math.abs((lastBatch.lc || 0) - lcValue) > 0.001
              ) {
                productStock.batches.push({
                  batchNo: `BATCH-RETURN-${Date.now()}`,
                  boxes: diff,
                  lc: lcValue,
                  sellingPrice: newItem.sellingPrice || 0,
                  amount: amountToAdd,
                  date: new Date().toISOString().split("T")[0],
                  adjustmentType: "batch",
                });
              } else {
                lastBatch.boxes += diff;
                lastBatch.amount = (lastBatch.amount || 0) + amountToAdd;
              }
              recalcReportTotals(productStock);
              await productStock.save({ session });
            }
          } else if (diff < 0) {
            await deductFromReportInHand(
              oldItem.productName,
              Math.abs(diff),
              session,
            );
          }
        } else {
          await deductFromReportInHand(
            oldItem.productName,
            oldItem.boxQuantity,
            session,
          );
        }
      }
    }

    const updated = await StockTransferToMR.findByIdAndUpdate(
      id,
      { ...data, items: mergedNewItems },
      { new: true, runValidators: true, session },
    );

    const newMrId = data.mrId;
    const newMrName =
      data.stockTransferToMr ||
      data.stockTransferFromMrToMain ||
      data.mrName ||
      "";

    const mrChanged =
      (oldMrId?.toString() || "") !== (newMrId?.toString() || "") ||
      oldMrName.toLowerCase() !== newMrName.toLowerCase();

    if (mrChanged) {
      if (oldMrId || oldMrName)
        await recomputeMRStock(oldMrId, oldMrName, session);
      if (newMrId || newMrName)
        await recomputeMRStock(newMrId, newMrName, session);
    } else {
      if (newMrId || newMrName)
        await recomputeMRStock(newMrId, newMrName, session);
    }

    await session.commitTransaction();
    res.json({
      success: true,
      message: "Transfer updated successfully",
      data: updated,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("TRANSFER UPDATE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transfer = await StockTransferToMR.findById(req.params.id).session(
      session,
    );
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transfer not found" });
    }

    const mrId = transfer.mrId;
    const mrName =
      transfer.stockTransferToMr ||
      transfer.stockTransferFromMrToMain ||
      transfer.mrName ||
      "";

    if (transfer.transferType === "send") {
      for (const item of transfer.items) {
        await addBackToReportInHand(
          item.productName,
          item.boxQuantity,
          item.lc || 0,
          session,
        );
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        await deductFromReportInHand(
          item.productName,
          item.boxQuantity,
          session,
        );
      }
    }

    await transfer.deleteOne({ session });
    if (mrId || mrName) await recomputeMRStock(mrId, mrName, session);

    await session.commitTransaction();
    res.json({
      success: true,
      message: "Transfer deleted and stock reverted successfully!",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("DELETE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /by-invoice/:invoiceNo
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/by-invoice/:invoiceNo",
  protect,
  allowAdminOnly,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { invoiceNo } = req.params;
      const transfer = await StockTransferToMR.findOne({ invoiceNo }).session(
        session,
      );
      if (!transfer) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Transfer with invoice number ${invoiceNo} not found`,
        });
      }

      const mrId = transfer.mrId;
      const mrName =
        transfer.stockTransferToMr ||
        transfer.stockTransferFromMrToMain ||
        transfer.mrName ||
        "";

      if (transfer.transferType === "send") {
        for (const item of transfer.items) {
          await addBackToReportInHand(
            item.productName,
            item.boxQuantity,
            item.lc || 0,
            session,
          );
        }
      } else if (transfer.transferType === "receive") {
        for (const item of transfer.items) {
          await deductFromReportInHand(
            item.productName,
            item.boxQuantity,
            session,
          );
        }
      }

      await transfer.deleteOne({ session });
      if (mrId || mrName) await recomputeMRStock(mrId, mrName, session);

      await session.commitTransaction();
      res.json({
        success: true,
        message: `Transfer ${invoiceNo} deleted and stock reverted successfully!`,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("DELETE BY INVOICE ERROR →", error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      session.endSession();
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /recompute/:mrName — Admin utility
// ─────────────────────────────────────────────────────────────────────────────
router.post("/recompute/:mrName", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { mrName } = req.params;
    const { mrId } = req.body;
    const result = await recomputeMRStock(mrId, mrName, session);
    await session.commitTransaction();
    res.json({
      success: true,
      message: `Stock for MR ${mrName} recomputed successfully`,
      data: result,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("RECOMPUTE ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /recompute-all — Admin utility
// ─────────────────────────────────────────────────────────────────────────────
router.post("/recompute-all", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const transfers = await StockTransferToMR.find(
      {},
      {
        mrId: 1,
        stockTransferToMr: 1,
        stockTransferFromMrToMain: 1,
        mrName: 1,
      },
    ).session(session);

    const mrSet = new Map();
    for (const t of transfers) {
      const key =
        t.mrId?.toString() ||
        t.stockTransferToMr ||
        t.stockTransferFromMrToMain ||
        t.mrName;
      if (key && !mrSet.has(key)) {
        mrSet.set(key, {
          mrId: t.mrId,
          mrName:
            t.stockTransferToMr ||
            t.stockTransferFromMrToMain ||
            t.mrName ||
            "",
        });
      }
    }

    const results = [];
    for (const [, mr] of mrSet.entries()) {
      try {
        const result = await recomputeMRStock(mr.mrId, mr.mrName, session);
        results.push({
          mrName: mr.mrName,
          mrId: mr.mrId?.toString(),
          productsInHand: result?.productsInHand?.length || 0,
          status: "ok",
        });
      } catch (err) {
        results.push({
          mrName: mr.mrName,
          mrId: mr.mrId?.toString(),
          status: "error",
          error: err.message,
        });
      }
    }

    await session.commitTransaction();
    res.json({
      success: true,
      message: `Recomputed stock for ${mrSet.size} MR(s)`,
      results,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("RECOMPUTE ALL ERROR →", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    session.endSession();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /merge-duplicate-mr-stocks — Admin utility
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/merge-duplicate-mr-stocks",
  protect,
  allowAdminOnly,
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const allDocs = await stockInMRHand.find({}).session(session);

      const grouped = new Map();
      for (const doc of allDocs) {
        const key =
          doc.mrId?.toString() ||
          doc.mrName?.toLowerCase().trim() ||
          doc._id.toString();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(doc);
      }

      const mergeResults = [];
      let totalMerged = 0;

      for (const [, docs] of grouped.entries()) {
        if (docs.length <= 1) continue;
        docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const primary = docs[0];
        const duplicates = docs.slice(1);

        for (const dup of duplicates) {
          for (const dupProduct of dup.productsInHand || []) {
            const productIdStr = dupProduct.productId?.toString();
            const existingIdx = primary.productsInHand.findIndex(
              (p) => p.productId?.toString() === productIdStr,
            );
            if (existingIdx >= 0) {
              const p = primary.productsInHand[existingIdx];
              p.quantity =
                (Number(p.quantity) || 0) + (Number(dupProduct.quantity) || 0);
              p.assignedQuantity =
                (Number(p.assignedQuantity) || 0) +
                (Number(dupProduct.assignedQuantity) || 0);
              if (dupProduct.lc) p.lc = dupProduct.lc;
              if (dupProduct.sellingPrice)
                p.sellingPrice = dupProduct.sellingPrice; // ← NEW
            } else {
              primary.productsInHand.push(dupProduct);
            }
          }
          await stockInMRHand.findByIdAndDelete(dup._id).session(session);
        }

        if (!primary.mrId && duplicates[0]?.mrId)
          primary.mrId = duplicates[0].mrId;
        await primary.save({ session });
        totalMerged++;
        mergeResults.push({
          mrName: primary.mrName,
          mrId: primary.mrId?.toString(),
          duplicatesRemoved: duplicates.length,
          productsInHand: primary.productsInHand.length,
        });
      }

      await session.commitTransaction();
      res.json({
        success: true,
        message: `Merged ${totalMerged} duplicate MR stock records`,
        results: mergeResults,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("MERGE DUPLICATES ERROR →", error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      session.endSession();
    }
  },
);

export default router;
