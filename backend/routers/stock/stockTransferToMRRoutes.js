/**
 * stockTransferToMR.routes.js
 *
 * FIX: When transferType === "receive", assignedQuantity is now reset to 0
 *      (same as quantity) instead of keeping the old accumulated value.
 *      This affects two places:
 *        1. recomputeMRStock()        — replay logic
 *        2. returnAllMRStockToWarehouse() — live zeroing of MR stock doc
 */

import express from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import stockInMRHand from "../../models/stock/stockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import User from "../../models/User.js";
import staffSchema from "../../models/staffMember/staff.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Multer — store Excel file in memory (no disk writes needed)
// ─────────────────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx or .xls files are allowed"));
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Parse Excel buffer → [{ productName, sendQuantity }]
// ─────────────────────────────────────────────────────────────────────────────
const parseExcelBuffer = (buffer) => {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const sheetName = wb.SheetNames.includes("Transfer Data")
    ? "Transfer Data"
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("No valid sheet found in the uploaded Excel file");

  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
  if (!rows.length) throw new Error("The Excel sheet appears to be empty");

  const parsed = [];

  for (const row of rows) {
    const keys = Object.keys(row);

    const nameKey = keys.find((k) =>
      k.trim().toLowerCase().includes("product name"),
    );
    const qtyKey = keys.find((k) =>
      k.trim().toLowerCase().includes("send quantity"),
    );

    if (!nameKey || !qtyKey) continue;

    const productName = String(row[nameKey] || "").trim();
    if (!productName) continue;

    const rawQty = String(row[qtyKey] || "0").replace(/[^0-9]/g, "");
    const sendQuantity = parseInt(rawQty, 10);

    if (isNaN(sendQuantity) || sendQuantity <= 0) continue;

    parsed.push({ productName, sendQuantity });
  }

  return parsed;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Recalculate ReportInHand totals from batches
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
// HELPER: Get lc + sellingPrice from ReportInHand
// ─────────────────────────────────────────────────────────────────────────────
const getPricesFromReportInHand = async (productName, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock || !productStock.batches?.length) {
    return { lc: 0, sellingPrice: 0 };
  }

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

const sendError = (res, error, code = 400) => {
  console.error("❌ ERROR:", error);
  res.status(code).json({
    success: false,
    message: error.message || "Server error",
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Deduct stock from ReportInHand (FIFO)
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
// HELPER: Add stock back to ReportInHand
// ─────────────────────────────────────────────────────────────────────────────
const addBackToReportInHand = async (
  productName,
  qty,
  lc,
  session,
  sellingPrice = 0,
) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  const lastBatch = productStock.batches[productStock.batches.length - 1];
  if (!lastBatch) throw new Error(`No batch found for ${productName}`);

  const useLC = lc || lastBatch.lc || 0;
  const useSP =
    sellingPrice || lastBatch.sellingPrice || productStock.sellingPrice || 0;
  const amountToAdd = qty * useLC;

  if (Math.abs((lastBatch.lc || 0) - useLC) < 0.001) {
    lastBatch.boxes += qty;
    lastBatch.amount = (lastBatch.amount || 0) + amountToAdd;
  } else {
    productStock.batches.push({
      batchNo: `BATCH-RETURN-${Date.now()}`,
      boxes: qty,
      lc: useLC,
      sellingPrice: useSP,
      amount: amountToAdd,
      date: new Date().toISOString().split("T")[0],
      adjustmentType: "batch",
    });
  }

  recalcReportTotals(productStock);
  await productStock.save({ session });
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Return ALL products an MR currently holds back to ReportInHand
//         Called on every "receive" transfer — full stock return
// ─────────────────────────────────────────────────────────────────────────────
const returnAllMRStockToWarehouse = async (mrId, mrName, session) => {
  let mrStock = null;

  if (mrId) {
    try {
      mrStock = await stockInMRHand
        .findOne({ mrId: new mongoose.Types.ObjectId(mrId.toString()) })
        .session(session);
    } catch {
      mrStock = await stockInMRHand.findOne({ mrId }).session(session);
    }
  }
  if (!mrStock && mrName) {
    mrStock = await stockInMRHand
      .findOne({ mrName: { $regex: new RegExp(`^${mrName.trim()}$`, "i") } })
      .session(session);
  }

  if (!mrStock || !mrStock.productsInHand?.length) return [];

  const returnedItems = [];

  for (const product of mrStock.productsInHand) {
    const qty = product.quantity || 0;
    if (qty <= 0) continue;

    const lc = product.lc || 0;
    const sp = product.sellingPrice || 0;

    try {
      await addBackToReportInHand(product.productName, qty, lc, session, sp);
      returnedItems.push({
        productName: product.productName,
        productId: product.productId,
        qty,
        lc,
        sp,
      });
    } catch (err) {
      console.warn(
        `addBack failed for ${product.productName}, creating new ReportInHand entry:`,
        err.message,
      );
      await ReportInHand.create(
        [
          {
            productName: product.productName,
            sellingPrice: sp,
            batches: [
              {
                batchNo: `BATCH-RETURN-${Date.now()}`,
                boxes: qty,
                lc,
                sellingPrice: sp,
                amount: qty * lc,
                date: new Date().toISOString().split("T")[0],
                adjustmentType: "batch",
              },
            ],
            totalBoxes: qty,
            totalBoxesFromBatches: qty,
            totalAmount: qty * lc,
            averagePrice: lc,
          },
        ],
        { session },
      );
      returnedItems.push({
        productName: product.productName,
        productId: product.productId,
        qty,
        lc,
        sp,
      });
    }
  }

  // ✅ FIX: Zero out BOTH quantity AND assignedQuantity on receive
  mrStock.productsInHand = mrStock.productsInHand.map((p) => ({
    ...p.toObject(),
    quantity: 0,
    assignedQuantity: 0, // was: p.assignedQuantity (kept old value — now correctly reset)
    amount: 0,
    productCost: 0,
  }));
  mrStock.totalAmount = 0;
  mrStock.totalProductCost = 0;
  await mrStock.save({ session });

  return returnedItems;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Recompute stockInMRHand from all transfers (full replay)
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

  // Fetch all transfers sorted oldest → newest for correct replay
  const allTransfers = await StockTransferToMR.find({ $or: orConditions })
    .sort({ createdAt: 1 })
    .session(session);

  const productMap = new Map();

  for (const transfer of allTransfers) {
    if (!Array.isArray(transfer.items)) continue;

    // ✅ FIX: On a "receive" transfer — reset BOTH quantity AND assignedQuantity to 0
    if (transfer.transferType === "receive") {
      for (const [key, entry] of productMap.entries()) {
        productMap.set(key, {
          ...entry,
          quantity: 0,
          assignedQuantity: 0, // was: entry.assignedQuantity (kept accumulating — now correctly reset)
        });
      }
      continue; // items on receive transfer don't add/change quantities
    }

    // ── On a "send" transfer: accumulate quantities ──────────────────────
    for (const item of transfer.items) {
      const key = item.productId?.toString();
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName || "Unknown",
          lc: item.lc || 0,
          sellingPrice: item.sellingPrice || 0,
          assignedQuantity: 0,
          quantity: 0,
          lastUpdated: transfer.updatedAt || transfer.createdAt || new Date(),
        });
      }

      const entry = productMap.get(key);

      if (item.lc) entry.lc = item.lc;
      if (item.sellingPrice) entry.sellingPrice = item.sellingPrice;
      if (item.productName) entry.productName = item.productName;

      const transferDate =
        transfer.updatedAt || transfer.createdAt || new Date();
      if (new Date(transferDate) > new Date(entry.lastUpdated)) {
        entry.lastUpdated = transferDate;
      }

      entry.assignedQuantity += item.boxQuantity || 0;
      entry.quantity += item.boxQuantity || 0;
    }
  }

  // Find or create the MR stock document
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

  // Only include products that still have quantity > 0 after replay
  const finalProducts = [];
  for (const [, entry] of productMap.entries()) {
    if (entry.quantity <= 0) continue;
    finalProducts.push({
      productId: entry.productId,
      productName: entry.productName,
      quantity: entry.quantity,
      assignedQuantity: entry.assignedQuantity,
      lc: entry.lc || 0,
      sellingPrice: entry.sellingPrice || 0,
      amount: (entry.lc || 0) * entry.quantity,
      productCost: Math.ceil((entry.lc || 0) * entry.quantity),
      lastUpdated: entry.lastUpdated,
    });
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
    return null;
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
      mrStock = await stockInMRHand.findOne({ mrId }).populate({
        path: "productsInHand.productId",
        select: "productName lc costPrice",
      });
    }

    if (!mrStock) {
      return res.json({ success: true, data: null, products: [] });
    }

    const products = (mrStock.productsInHand || [])
      .filter((p) => (p.quantity || 0) > 0)
      .map((p) => {
        const lc = p.lc || p.productId?.lc || p.productId?.costPrice || 0;
        return {
          _id: p._id?.toString(),
          productId: (p.productId?._id || p.productId)?.toString(),
          productName: p.productName || p.productId?.productName || "Unknown",
          quantity: p.quantity || 0,
          assignedQuantity: p.assignedQuantity || 0,
          lc,
          sellingPrice: p.sellingPrice || 0,
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
            sellingPrice: item.sellingPrice || 0,
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
      { $match: { "productsInHand.quantity": { $gt: 0 } } },
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
          sellingPrice: "$productsInHand.sellingPrice",
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
        sellingPrice: item.sellingPrice || 0,
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
            if ((product.quantity || 0) <= 0) return false;
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
              sellingPrice,
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

router.get("/mrs-list", async (_, res) => {
  try {
    // 1. Get all user IDs where isActive = true
    const activeUserIds = await User.find({ isActive: true }).distinct("_id");

    // 2. Find staff whose userId is in the active user IDs array
    const staff = await staffSchema
      .find({ userId: { $in: activeUserIds } })
      .populate("userId", "name email role isActive")
      .sort({ updatedAt: -1 });

    res.json(staff);
  } catch (error) {
    sendError(res, error, 500);
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
// POST /validate-excel
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/validate-excel",
  protect,
  allowAdminOnly,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
      }

      let parsedRows;
      try {
        parsedRows = parseExcelBuffer(req.file.buffer);
      } catch (parseErr) {
        return res
          .status(400)
          .json({ success: false, error: parseErr.message });
      }

      if (!parsedRows.length) {
        return res.status(400).json({
          success: false,
          error:
            "No valid rows found in the Excel file. Make sure Send Quantity > 0.",
        });
      }

      const warehouseProducts = await Product.find({}).select(
        "productName lc costPrice totalBoxes _id",
      );

      const reportInHandDocs = await ReportInHand.find({}).select(
        "productName totalBoxes batches",
      );

      const warehouseMap = new Map();
      for (const p of warehouseProducts) {
        warehouseMap.set(p.productName.trim().toLowerCase(), p);
      }

      const reportMap = new Map();
      for (const r of reportInHandDocs) {
        reportMap.set(r.productName.trim().toLowerCase(), r.totalBoxes || 0);
      }

      const matched = [];
      const errors = [];

      for (const row of parsedRows) {
        const key = row.productName.toLowerCase();
        const warehouseProd = warehouseMap.get(key);

        if (!warehouseProd) {
          errors.push({
            productName: row.productName,
            reason: "Product not found in warehouse",
          });
          continue;
        }

        const liveStock = reportMap.has(key)
          ? reportMap.get(key)
          : warehouseProd.totalBoxes || 0;

        if (liveStock <= 0) {
          errors.push({
            productName: row.productName,
            reason: "No stock available in warehouse",
          });
          continue;
        }

        let sendQuantity = row.sendQuantity;
        let warning = null;

        if (sendQuantity > liveStock) {
          warning = `Requested ${sendQuantity} but only ${liveStock} available — will be clamped`;
          sendQuantity = liveStock;
        }

        matched.push({
          productId: warehouseProd._id,
          productName: warehouseProd.productName,
          availableStock: liveStock,
          requestedQuantity: row.sendQuantity,
          sendQuantity,
          lc: warehouseProd.lc || warehouseProd.costPrice || 0,
          warning: warning || null,
        });
      }

      res.json({
        success: true,
        matched,
        errors,
        summary: {
          totalRowsInFile: parsedRows.length,
          matchedCount: matched.length,
          errorCount: errors.length,
          totalBoxes: matched.reduce((s, m) => s + m.sendQuantity, 0),
        },
      });
    } catch (err) {
      console.error("VALIDATE EXCEL ERROR →", err);
      res.status(500).json({ success: false, error: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /import-excel
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  "/import-excel",
  protect,
  allowAdminOnly,
  upload.single("file"),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      if (!req.file) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ success: false, error: "No Excel file uploaded" });
      }

      const { mrId, mrName, date, remarks } = req.body;

      if (!mrId || !mrName) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ success: false, error: "mrId and mrName are required" });
      }

      let parsedRows;
      try {
        parsedRows = parseExcelBuffer(req.file.buffer);
      } catch (parseErr) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ success: false, error: parseErr.message });
      }

      if (!parsedRows.length) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          error:
            "No valid rows found. Ensure the Send Quantity column has values > 0.",
        });
      }

      const warehouseProducts = await Product.find({})
        .select("productName lc costPrice totalBoxes _id")
        .session(session);

      const warehouseMap = new Map();
      for (const p of warehouseProducts) {
        warehouseMap.set(p.productName.trim().toLowerCase(), p);
      }

      const items = [];
      const errors = [];

      for (const row of parsedRows) {
        const key = row.productName.toLowerCase();
        const warehouseProd = warehouseMap.get(key);

        if (!warehouseProd) {
          errors.push({
            productName: row.productName,
            reason: "Product not found in warehouse",
          });
          continue;
        }

        const reportStock = await ReportInHand.findOne({
          productName: {
            $regex: new RegExp(`^${warehouseProd.productName}$`, "i"),
          },
        }).session(session);

        const liveStock =
          reportStock?.totalBoxes ?? warehouseProd.totalBoxes ?? 0;

        if (liveStock <= 0) {
          errors.push({
            productName: row.productName,
            reason: "No stock available in warehouse",
          });
          continue;
        }

        const sendQuantity = Math.min(row.sendQuantity, liveStock);

        if (sendQuantity < row.sendQuantity) {
          errors.push({
            productName: row.productName,
            reason: `Requested ${row.sendQuantity}, only ${liveStock} available — clamped to ${sendQuantity}`,
          });
        }

        items.push({
          productId: warehouseProd._id,
          productName: warehouseProd.productName,
          sendQuantity,
          lc: warehouseProd.lc || warehouseProd.costPrice || 0,
        });
      }

      if (items.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          error:
            "None of the products in the Excel file matched available warehouse stock.",
          details: errors,
        });
      }

      const itemsWithPrices = await Promise.all(
        items.map(async (item) => {
          try {
            const { lc, sellingPrice } = await getPricesFromReportInHand(
              item.productName,
              session,
            );
            return {
              ...item,
              lc: lc || item.lc || 0,
              sellingPrice: sellingPrice || 0,
            };
          } catch {
            return { ...item, sellingPrice: 0 };
          }
        }),
      );

      let invoiceNo = req.body.invoiceNo;
      if (!invoiceNo) {
        invoiceNo = await generateNextStockTransferNumber();
      }

      const transferDate = date || new Date().toISOString().split("T")[0];

      const transferItems = itemsWithPrices.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        boxQuantity: item.sendQuantity,
        lc: item.lc,
        sellingPrice: item.sellingPrice,
        productCost: Math.ceil(item.lc * item.sendQuantity),
        amount: item.lc * item.sendQuantity,
      }));

      const [newTransfer] = await StockTransferToMR.create(
        [
          {
            invoiceNo,
            date: transferDate,
            transferType: "send",
            mrId,
            mrName,
            stockTransferToMr: mrName,
            stockTransferFromMrToMain: "",
            remarks: remarks || "",
            items: transferItems,
            importedFromExcel: true,
            originalFileName: req.file.originalname,
          },
        ],
        { session },
      );

      for (const item of transferItems) {
        const { lc: deductedLC, sellingPrice: deductedSP } =
          await deductFromReportInHand(
            item.productName,
            item.boxQuantity,
            session,
          );
        item.lc = deductedLC || item.lc;
        item.sellingPrice = deductedSP || item.sellingPrice;
        item.amount = item.lc * item.boxQuantity;
        item.productCost = Math.ceil(item.amount);
      }

      await StockTransferToMR.findByIdAndUpdate(
        newTransfer._id,
        { items: transferItems },
        { session },
      );

      await recomputeMRStock(mrId, mrName, session);

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: `Stock transfer created from Excel. ${items.length} product(s) imported.`,
        data: {
          invoiceNo,
          transferType: "send",
          mrId,
          mrName,
          date: transferDate,
          itemsImported: items.length,
          itemsSkipped: errors.length,
          totalBoxes: transferItems.reduce((s, i) => s + i.boxQuantity, 0),
          items: transferItems,
        },
        warnings: errors,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("EXCEL IMPORT ERROR →", error);
      res.status(500).json({ success: false, error: error.message });
    } finally {
      session.endSession();
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Create new transfer (manual JSON body)
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

    const mrId = data.mrId;
    const mrName =
      data.stockTransferToMr ||
      data.stockTransferFromMrToMain ||
      data.mrName ||
      "";

    // ── RECEIVE: return ALL MR stock to warehouse first ───────────────
    if (data.transferType === "receive") {
      await returnAllMRStockToWarehouse(mrId, mrName, session);

      const receiveItems = (data.items || []).map((item) => ({
        ...item,
        productName: item.productName || "Unknown",
        lc: item.lc || 0,
        sellingPrice: item.sellingPrice || 0,
        amount: (item.lc || 0) * (item.boxQuantity || 0),
        productCost: Math.ceil((item.lc || 0) * (item.boxQuantity || 0)),
      }));

      const [newTransfer] = await StockTransferToMR.create(
        [{ ...data, invoiceNo, items: receiveItems }],
        { session },
      );

      await recomputeMRStock(mrId, mrName, session);

      await session.commitTransaction();
      return res.status(201).json({
        success: true,
        message: "Stock received back to warehouse successfully!",
        data: newTransfer,
      });
    }

    // ── SEND: resolve prices and deduct from warehouse ────────────────
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

    const mergedItemsMap = new Map();
    for (const item of itemsWithPrices) {
      const key = item.productId?.toString();
      if (mergedItemsMap.has(key)) {
        const ex = mergedItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.amount = (ex.lc || 0) * ex.boxQuantity;
        ex.productCost = Math.ceil(ex.amount);
        if (item.sellingPrice) ex.sellingPrice = item.sellingPrice;
      } else {
        mergedItemsMap.set(key, { ...item });
      }
    }
    const mergedItems = Array.from(mergedItemsMap.values());

    const [newTransfer] = await StockTransferToMR.create(
      [{ ...data, invoiceNo, items: mergedItems }],
      { session },
    );

    for (const item of mergedItems) {
      const { lc: deductedLC, sellingPrice: deductedSP } =
        await deductFromReportInHand(
          item.productName,
          item.boxQuantity,
          session,
        );
      item.lc = deductedLC || item.lc;
      item.sellingPrice = deductedSP || item.sellingPrice;
      item.amount = (item.lc || 0) * item.boxQuantity;
      item.productCost = Math.ceil(item.amount);
    }

    await StockTransferToMR.findByIdAndUpdate(
      newTransfer._id,
      { items: mergedItems },
      { session },
    );

    await recomputeMRStock(mrId, mrName, session);

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
    const newMrId = data.mrId;
    const newMrName =
      data.stockTransferToMr ||
      data.stockTransferFromMrToMain ||
      data.mrName ||
      "";

    if (existing.transferType === "receive") {
      for (const item of existing.items) {
        if ((item.boxQuantity || 0) <= 0) continue;
        try {
          await deductFromReportInHand(
            item.productName,
            item.boxQuantity,
            session,
          );
        } catch (e) {
          console.warn(
            `Could not re-deduct ${item.productName} during receive update:`,
            e.message,
          );
        }
      }

      await returnAllMRStockToWarehouse(oldMrId, oldMrName, session);

      const receiveItems = (data.items || []).map((item) => ({
        ...item,
        productName: item.productName || "Unknown",
        lc: item.lc || 0,
        sellingPrice: item.sellingPrice || 0,
        amount: (item.lc || 0) * (item.boxQuantity || 0),
        productCost: Math.ceil((item.lc || 0) * (item.boxQuantity || 0)),
      }));

      const updated = await StockTransferToMR.findByIdAndUpdate(
        id,
        { ...data, items: receiveItems },
        { new: true, runValidators: true, session },
      );

      await recomputeMRStock(newMrId, newMrName, session);

      await session.commitTransaction();
      return res.json({
        success: true,
        message: "Receive transfer updated successfully",
        data: updated,
      });
    }

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
          sellingPrice: item.sellingPrice || 0,
        });
      }
    }

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
            oldItem.sellingPrice,
          );
        }
      } else {
        await addBackToReportInHand(
          oldItem.productName,
          oldItem.boxQuantity,
          oldItem.lc,
          session,
          oldItem.sellingPrice,
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

    const updated = await StockTransferToMR.findByIdAndUpdate(
      id,
      { ...data, items: mergedNewItems },
      { new: true, runValidators: true, session },
    );

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
          item.sellingPrice || 0,
        );
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        try {
          await deductFromReportInHand(
            item.productName,
            item.boxQuantity,
            session,
          );
        } catch (e) {
          console.warn(
            `Could not re-deduct ${item.productName} on receive delete:`,
            e.message,
          );
        }
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
            item.sellingPrice || 0,
          );
        }
      } else if (transfer.transferType === "receive") {
        for (const item of transfer.items) {
          try {
            await deductFromReportInHand(
              item.productName,
              item.boxQuantity,
              session,
            );
          } catch (e) {
            console.warn(
              `Could not re-deduct ${item.productName} on receive delete:`,
              e.message,
            );
          }
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
// POST /recompute/:mrName
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
// POST /recompute-all
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
// POST /merge-duplicate-mr-stocks
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
                p.sellingPrice = dupProduct.sellingPrice;
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
