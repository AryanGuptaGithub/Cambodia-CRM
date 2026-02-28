import express from "express";
import StockInMRHand from "../../models/stock/StockInMRHand.js";
import StockTransferToMR from "../../models/stock/stockTransferToMR.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import mongoose from "mongoose";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const deductFromReportInHand = async (productName, qty, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  let remaining = qty;
  for (let batch of productStock.batches) {
    if (remaining <= 0) break;
    if (batch.boxes >= remaining) {
      batch.boxes -= remaining;
      remaining = 0;
    } else {
      remaining -= batch.boxes;
      batch.boxes = 0;
    }
  }

  if (remaining > 0) throw new Error(`Insufficient stock for ${productName}`);

  productStock.totalBoxes = productStock.batches.reduce(
    (sum, b) => sum + b.boxes,
    0
  );
  const lastBatch = productStock.batches[productStock.batches.length - 1];
  productStock.totalAmount = productStock.totalBoxes * (lastBatch?.lc || 0);
  await productStock.save({ session });
};

const addBackToReportInHand = async (productName, qty, session) => {
  const productStock = await ReportInHand.findOne({
    productName: { $regex: new RegExp(`^${productName}$`, "i") },
  }).session(session);

  if (!productStock)
    throw new Error(`Product not in ReportInHand: ${productName}`);

  const lastBatch = productStock.batches[productStock.batches.length - 1];
  if (!lastBatch) throw new Error(`No batch found for ${productName}`);

  lastBatch.boxes += qty;
  productStock.totalBoxes += qty;
  productStock.totalAmount = productStock.totalBoxes * lastBatch.lc;
  await productStock.save({ session });
};

/**
 * Update MR stock based on a single transfer.
 * @param {string} mrId - MR ID
 * @param {string} mrName - MR name
 * @param {object} transfer - The transfer document (must have `items` array)
 * @param {boolean} isAddition - true = add stock to MR (send), false = remove stock from MR (receive or delete of a send)
 * @param {mongoose.ClientSession} session - transaction session
 */
const updateMRStockFromTransfer = async (mrId, mrName, transfer, isAddition, session) => {
  if (!mrId && !mrName) return;
  
  const cleanedMrName = mrName?.replace(/\s+/g, " ").trim() || "";
  
  // Find or create MR stock document
  let mrStock;
  if (mrId) {
    mrStock = await StockInMRHand.findOne({ mrId }).session(session);
  }
  if (!mrStock && cleanedMrName) {
    mrStock = await StockInMRHand.findOne({
      mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    }).session(session);
  }
  
  if (!mrStock && isAddition) {
    // Create new MR stock document only if we're adding stock
    mrStock = new StockInMRHand({
      mrId,
      mrName: cleanedMrName,
      productsInHand: [],
    });
  }
  
  if (!mrStock) return; // No MR stock to update
  
  // Process each item in the transfer
  for (const item of transfer.items) {
    const productId = item.productId?.toString();
    const boxQuantity = item.boxQuantity || 0;
    const lc = item.lc || 0;
    const productName = item.productName || "Unknown";
    
    const existingProductIndex = mrStock.productsInHand.findIndex(
      p => p.productId?.toString() === productId
    );
    
    if (isAddition) {
      // ADDING stock to MR (send transfer)
      if (existingProductIndex >= 0) {
        // Product exists - update both assignedQuantity and quantity
        const existing = mrStock.productsInHand[existingProductIndex];
        existing.assignedQuantity = (existing.assignedQuantity || 0) + boxQuantity;
        existing.quantity = (existing.quantity || 0) + boxQuantity;
        existing.lc = lc; // Update to latest LC
        existing.lastUpdated = new Date();
      } else {
        // New product - add to array
        mrStock.productsInHand.push({
          productId,
          productName,
          quantity: boxQuantity,
          assignedQuantity: boxQuantity, // Initial assigned equals quantity
          lc,
          lastUpdated: new Date(),
        });
      }
    } else {
      // REMOVING stock from MR (receive transfer or deletion of send transfer)
      if (existingProductIndex >= 0) {
        const existing = mrStock.productsInHand[existingProductIndex];
        
        // Only quantity decreases, assignedQuantity stays the same (historical)
        existing.quantity = Math.max(0, (existing.quantity || 0) - boxQuantity);
        existing.lastUpdated = new Date();
        
        // Optionally keep products with zero quantity for history
        // (they can be filtered out later if needed)
      }
    }
  }
  
  // Optional: clean up products with zero quantity? (Keep for history by default)
  // mrStock.productsInHand = mrStock.productsInHand.filter(p => p.quantity > 0);
  
  await mrStock.save({ session });
  return mrStock;
};

/**
 * Recompute MR stock from all transfers (admin utility)
 */
const recomputeMRStockFromTransfers = async (mrId, mrName, session) => {
  const cleanedMrName = mrName?.replace(/\s+/g, " ").trim() || "";

  // Fetch ALL transfers for this MR (both send and receive)
  const orConditions = [];
  if (mrId) orConditions.push({ mrId: mrId });
  if (cleanedMrName) {
    orConditions.push({
      stockTransferToMr: {
        $regex: new RegExp(`^${cleanedMrName}$`, "i"),
      },
    });
    orConditions.push({
      stockTransferFromMrToMain: {
        $regex: new RegExp(`^${cleanedMrName}$`, "i"),
      },
    });
  }

  if (orConditions.length === 0) return;

  const allTransfers = await StockTransferToMR.find({
    $or: orConditions,
  }).session(session);

  // Map to store product data with both assigned and current quantity
  const productMap = new Map();

  for (const transfer of allTransfers) {
    if (!Array.isArray(transfer.items)) continue;

    for (const item of transfer.items) {
      const key = item.productId?.toString();
      if (!key) continue;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productId: item.productId,
          productName: item.productName,
          lc: item.lc || 0,
          assignedQuantity: 0,  // Total ever assigned
          quantity: 0,           // Current stock
        });
      }

      const entry = productMap.get(key);

      if (transfer.transferType === "send") {
        // Send to MR: increases both assigned and current
        entry.assignedQuantity += item.boxQuantity || 0;
        entry.quantity += item.boxQuantity || 0;
      } else if (transfer.transferType === "receive") {
        // Receive from MR: decreases current only, assigned stays same
        entry.quantity -= item.boxQuantity || 0;
      }
    }
  }

  // Build the final productsInHand array
  const productsInHand = [];
  for (const [, entry] of productMap.entries()) {
    // Keep products even if quantity is 0 (for history)
    productsInHand.push({
      productId: entry.productId,
      productName: entry.productName,
      quantity: Math.max(0, entry.quantity), // Never negative
      assignedQuantity: entry.assignedQuantity,
      lc: entry.lc || 0,
      lastUpdated: new Date(),
    });
  }

  // Find or create the MR stock document
  let mrStock;
  if (mrId) {
    mrStock = await StockInMRHand.findOne({ mrId }).session(session);
  }
  if (!mrStock && cleanedMrName) {
    mrStock = await StockInMRHand.findOne({
      mrName: { $regex: new RegExp(`^${cleanedMrName}$`, "i") },
    }).session(session);
  }

  if (!mrStock) {
    if (productsInHand.length > 0) {
      mrStock = new StockInMRHand({
        mrId,
        mrName: cleanedMrName,
        productsInHand,
      });
      await mrStock.save({ session });
    }
  } else {
    mrStock.productsInHand = productsInHand;
    await mrStock.save({ session });
  }

  return mrStock;
};

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
  } catch (error) {
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
  } catch (error) {
    res.json({ success: true, lastNumber: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET / — list all transfers
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const transfers = await StockTransferToMR.find()
      .populate({
        path: "items.productId",
        select: "productName lc costPrice",
      })
      .sort({ createdAt: -1 });

    const transfersWithCosts = transfers.map((transfer) => {
      const transferObj = transfer.toObject();
      let totalTransferCost = 0;

      if (transfer.items && Array.isArray(transfer.items)) {
        const itemsWithCosts = transfer.items.map((item) => {
          const itemObj = item.toObject ? item.toObject() : item;
          const lc =
            item.lc ||
            item.productId?.lc ||
            item.productId?.costPrice ||
            0;
          const boxQuantity = item.boxQuantity || 0;
          const itemCost = lc * boxQuantity;
          totalTransferCost += itemCost;
          return {
            ...itemObj,
            lc,
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
// GET /mr-hand-admin - Admin view with aggregated data
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand-admin", async (req, res) => {
  try {
    const { mrName, search } = req.query;
    let matchStage = { $match: {} };
    if (mrName && mrName !== "all") {
      matchStage.$match.mrName = {
        $regex: new RegExp(`^${mrName}$`, "i"),
      };
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
        $unwind: {
          path: "$productDetails",
          preserveNullAndEmptyArrays: true,
        },
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

    const stockResults = await StockInMRHand.aggregate(stockAggregation);

    const formattedResult = stockResults.map((item, index) => {
      const remainingQty = item.quantity || 0;
      const assignedQty = item.assignedQuantity || remainingQty;
      const usedQty = Math.max(0, assignedQty - remainingQty);
      
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
        productCode: item.productCode || `PROD-${item.productId?.toString().slice(-4) || "0000"}`,
        productId: item.productId,
        productName: item.productName || "Unknown Product",
        remainingQty,
        usedQty,
        status: remainingQty > 0 ? (usedQty > 0 ? "Partial Used" : "Active") : "Depleted",
        boxQuantity: remainingQty,
        quantity: remainingQty,
        lc: item.lc || 0,
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
          item.mrName?.toLowerCase().includes(searchLower)
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
// GET /mr-hand - Frontend view with proper quantity fields
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-hand", async (req, res) => {
  try {
    const { mrName, search } = req.query;

    const filter = {};
    if (mrName) {
      filter.mrName = { $regex: new RegExp(`^${mrName.trim()}$`, "i") };
    }

    const stock = await StockInMRHand.find(filter)
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
              product.productName ||
              product.productId?.productName ||
              "";
            return name.toLowerCase().includes(search.toLowerCase());
          })
          .map((product) => {
            const remainingQty = Number(product.quantity ?? 0);
            const assignedQty = Number(product.assignedQuantity ?? product.quantity ?? 0);
            
            const usedQty = Math.max(0, assignedQty - remainingQty);
            
            const utilization = assignedQty > 0
              ? Math.round((usedQty / assignedQty) * 100)
              : 0;

            let status = "Active";
            if (assignedQty > 0 && remainingQty === 0) {
              status = "Depleted";
            } else if (usedQty > 0 && remainingQty > 0) {
              status = "Partial Used";
            }

            return {
              id: `${mrStock._id}-${product._id}`,
              mrId: mrStock.mrId,
              mrName: mrStock.mrName,
              productId: product.productId?._id || product.productId,
              productName: product.productName || product.productId?.productName || "Unknown",
              
              assignedQty,
              remainingQty,
              usedQty,
              utilization,

              lc: product.lc || product.productId?.lc || product.productId?.costPrice || 0,

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
    const mrs = await StockInMRHand.aggregate([
      {
        $match: {
          productsInHand: { $exists: true, $ne: [] },
        },
      },
      {
        $group: {
          _id: "$mrId",
          mrName: { $first: "$mrName" },
        },
      },
      {
        $project: {
          mrId: "$_id",
          mrName: 1,
          _id: 0,
        },
      },
      { $sort: { mrName: 1 } },
    ]);
    res.json({ success: true, data: mrs });
  } catch (error) {
    console.error("Error fetching MR list:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST / — Create new transfer (CORRECTED)
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

    // Resolve LC for each item
    const itemsWithLC = await Promise.all(
      data.items.map(async (item) => {
        try {
          const product = await Product.findById(item.productId).session(session);
          let lcValue = product?.lc || product?.costPrice || 0;
          if (!lcValue) {
            const productStock = await ReportInHand.findOne({
              productName: item.productName,
            }).session(session);
            if (productStock?.batches?.length) {
              lcValue = productStock.batches[productStock.batches.length - 1]?.lc || 0;
            }
          }
          return {
            ...item,
            lc: lcValue,
            productName: item.productName || product?.productName || "Unknown",
          };
        } catch {
          return {
            ...item,
            lc: 0,
            productName: item.productName || "Unknown",
          };
        }
      })
    );

    // Merge duplicate productIds in items (sum quantities)
    const mergedItemsMap = new Map();
    for (const item of itemsWithLC) {
      const key = item.productId?.toString();
      if (mergedItemsMap.has(key)) {
        const ex = mergedItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.productCost = parseFloat(((ex.lc || 0) * ex.boxQuantity).toFixed(2));
      } else {
        mergedItemsMap.set(key, { ...item });
      }
    }
    const mergedItems = Array.from(mergedItemsMap.values());

    // Save the transfer document
    const transferData = { ...data, invoiceNo, items: mergedItems };
    const [newTransfer] = await StockTransferToMR.create([transferData], { session });

    // Adjust ReportInHand (main warehouse)
    if (data.transferType === "send") {
      for (const item of mergedItems) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (data.transferType === "receive") {
      for (const item of mergedItems) {
        const product = await Product.findById(item.productId).session(session);
        let lcValue = product?.lc || product?.costPrice || 0;
        const productStock = await ReportInHand.findOne({
          productName: item.productName,
        }).session(session);
        
        if (!productStock) {
          await ReportInHand.create(
            [{
              productName: item.productName,
              batches: [{
                batchNo: `BATCH-${Date.now()}`,
                boxes: item.boxQuantity,
                lc: lcValue,
                date: new Date().toISOString().split("T")[0],
              }],
              totalBoxes: item.boxQuantity,
              totalAmount: item.boxQuantity * lcValue,
            }],
            { session }
          );
        } else {
          const lastBatch = productStock.batches[productStock.batches.length - 1];
          if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
            productStock.batches.push({
              batchNo: `BATCH-${Date.now()}`,
              boxes: item.boxQuantity,
              lc: lcValue,
              date: new Date().toISOString().split("T")[0],
            });
          } else {
            lastBatch.boxes += item.boxQuantity;
          }
          productStock.totalBoxes += item.boxQuantity;
          productStock.totalAmount = productStock.batches.reduce(
            (sum, b) => sum + b.boxes * b.lc,
            0
          );
          await productStock.save({ session });
        }
      }
    }

    // CORRECTED: Determine if this transfer adds stock to MR or removes it
    const addsToMR = data.transferType === 'send'; // send → add, receive → remove
    const mrId = data.mrId;
    const mrName = data.stockTransferToMr || data.stockTransferFromMrToMain || data.mrName;
    
    if (mrId || mrName) {
      await updateMRStockFromTransfer(mrId, mrName, newTransfer, addsToMR, session);
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
// PUT /:id — Update transfer (CORRECTED)
// ─────────────────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const existing = await StockTransferToMR.findById(id).session(session);
    if (!existing) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: "Transfer not found" });
    }

    const data = req.body;

    // Capture old MR info BEFORE any changes
    const oldMrId = existing.mrId;
    const oldMrName = existing.stockTransferToMr || existing.stockTransferFromMrToMain || "";

    // Resolve LC for new items
    const newItemsWithLC = await Promise.all(
      data.items.map(async (item) => {
        try {
          const product = await Product.findById(item.productId).session(session);
          let lcValue = product?.lc || product?.costPrice || 0;
          if (!lcValue) {
            const productStock = await ReportInHand.findOne({
              productName: item.productName,
            }).session(session);
            if (productStock?.batches?.length) {
              lcValue = productStock.batches[productStock.batches.length - 1]?.lc || 0;
            }
          }
          return {
            ...item,
            lc: lcValue,
            productName: item.productName || product?.productName || "Unknown",
          };
        } catch {
          return {
            ...item,
            lc: 0,
            productName: item.productName || "Unknown",
          };
        }
      })
    );

    // Merge duplicate productIds in new items
    const newItemsMap = new Map();
    for (const item of newItemsWithLC) {
      const key = item.productId?.toString();
      if (newItemsMap.has(key)) {
        const ex = newItemsMap.get(key);
        ex.boxQuantity = (ex.boxQuantity || 0) + (item.boxQuantity || 0);
        ex.productCost = parseFloat(((ex.lc || 0) * ex.boxQuantity).toFixed(2));
      } else {
        newItemsMap.set(key, { ...item });
      }
    }
    const mergedNewItems = Array.from(newItemsMap.values());

    // Build old items map for ReportInHand diff calculation
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
        });
      }
    }

    // Adjust ReportInHand using net diff between old and new items
    if (existing.transferType === "send") {
      // Handle products that existed before
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const oldQty = oldItem.boxQuantity || 0;
        const newQty = newItem?.boxQuantity || 0;
        const diff = newQty - oldQty;

        if (newItem) {
          // Product still exists — adjust by diff
          if (diff > 0) {
            await deductFromReportInHand(oldItem.productName, diff, session);
          } else if (diff < 0) {
            await addBackToReportInHand(oldItem.productName, Math.abs(diff), session);
          }
        } else {
          // Product was removed entirely — add full old qty back
          await addBackToReportInHand(oldItem.productName, oldQty, session);
        }
      }

      // Handle brand new products not in old items
      for (const [key, newItem] of newItemsMap.entries()) {
        if (!oldItemsMap.has(key)) {
          await deductFromReportInHand(newItem.productName, newItem.boxQuantity, session);
        }
      }
    } else if (existing.transferType === "receive") {
      // Handle products that existed before
      for (const [key, oldItem] of oldItemsMap.entries()) {
        const newItem = newItemsMap.get(key);
        const oldQty = oldItem.boxQuantity || 0;
        const newQty = newItem?.boxQuantity || 0;
        const diff = newQty - oldQty;

        if (newItem) {
          if (diff > 0) {
            // Received more — add more to warehouse
            const product = await Product.findById(key).session(session);
            const lcValue = product?.lc || product?.costPrice || oldItem.lc || 0;
            const productStock = await ReportInHand.findOne({
              productName: oldItem.productName,
            }).session(session);
            
            if (productStock) {
              const lastBatch = productStock.batches[productStock.batches.length - 1];
              if (!lastBatch || Math.abs(lastBatch.lc - lcValue) > 0.01) {
                productStock.batches.push({
                  batchNo: `BATCH-${Date.now()}`,
                  boxes: diff,
                  lc: lcValue,
                  date: new Date().toISOString().split("T")[0],
                });
              } else {
                lastBatch.boxes += diff;
              }
              productStock.totalBoxes += diff;
              productStock.totalAmount = productStock.batches.reduce(
                (sum, b) => sum + b.boxes * b.lc,
                0
              );
              await productStock.save({ session });
            }
          } else if (diff < 0) {
            // Received less — deduct difference from warehouse
            await deductFromReportInHand(oldItem.productName, Math.abs(diff), session);
          }
        } else {
          // Product removed entirely — deduct full old qty from warehouse
          await deductFromReportInHand(oldItem.productName, oldQty, session);
        }
      }
    }

    // Save updated transfer document
    const updated = await StockTransferToMR.findByIdAndUpdate(
      id,
      { ...data, items: mergedNewItems },
      { new: true, runValidators: true, session }
    );

    // CORRECTED: Handle MR stock updates properly
    const newMrId = data.mrId || existing.mrId;
    const newMrName = data.stockTransferToMr || data.stockTransferFromMrToMain || data.mrName || "";

    // Determine if MR changed
    const mrChanged = oldMrName.toLowerCase().trim() !== newMrName.toLowerCase().trim() ||
                      oldMrId?.toString() !== newMrId?.toString();

    // Old effect sign: send = add stock to MR, receive = remove stock from MR
    const oldAddsToMR = existing.transferType === 'send';
    // New effect sign
    const newAddsToMR = data.transferType === 'send';

    if (mrChanged) {
      // Remove from old MR (reverse the original effect)
      if (oldMrId || oldMrName) {
        await updateMRStockFromTransfer(oldMrId, oldMrName, existing, !oldAddsToMR, session);
      }
      // Add to new MR (apply the new effect)
      if (newMrId || newMrName) {
        await updateMRStockFromTransfer(newMrId, newMrName, updated, newAddsToMR, session);
      }
    } else {
      // Same MR - reverse old and apply new
      if (oldMrId || oldMrName) {
        await updateMRStockFromTransfer(oldMrId, oldMrName, existing, !oldAddsToMR, session);
        await updateMRStockFromTransfer(oldMrId, oldMrName, updated, newAddsToMR, session);
      }
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
// DELETE /:id (CORRECTED)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transfer = await StockTransferToMR.findById(req.params.id).session(session);
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Transfer not found" });
    }

    const mrId = transfer.mrId;
    const mrName = transfer.stockTransferToMr || transfer.stockTransferFromMrToMain;

    // Revert ReportInHand
    if (transfer.transferType === "send") {
      for (const item of transfer.items) {
        await addBackToReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    }

    // Delete the transfer document
    await transfer.deleteOne({ session });

    // CORRECTED: Deleting a transfer reverses its effect on MR stock
    // If it was a send transfer, we need to remove stock (isAddition = false)
    // If it was a receive transfer, we need to add stock back (isAddition = true)
    const addsToMR = transfer.transferType === 'receive';
    if (mrId || mrName) {
      await updateMRStockFromTransfer(mrId, mrName, transfer, addsToMR, session);
    }

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
// DELETE /by-invoice/:invoiceNo (CORRECTED similarly)
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/by-invoice/:invoiceNo", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceNo } = req.params;
    const transfer = await StockTransferToMR.findOne({ invoiceNo }).session(session);
    if (!transfer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Transfer with invoice number ${invoiceNo} not found`,
      });
    }

    const mrId = transfer.mrId;
    const mrName = transfer.stockTransferToMr || transfer.stockTransferFromMrToMain;

    if (transfer.transferType === "send") {
      for (const item of transfer.items) {
        await addBackToReportInHand(item.productName, item.boxQuantity, session);
      }
    } else if (transfer.transferType === "receive") {
      for (const item of transfer.items) {
        await deductFromReportInHand(item.productName, item.boxQuantity, session);
      }
    }

    await transfer.deleteOne({ session });

    const addsToMR = transfer.transferType === 'receive';
    if (mrId || mrName) {
      await updateMRStockFromTransfer(mrId, mrName, transfer, addsToMR, session);
    }

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
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /recompute/:mrName - Admin utility to fix incorrect data
// ─────────────────────────────────────────────────────────────────────────────
router.post("/recompute/:mrName", protect, allowAdminOnly, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrName } = req.params;
    const { mrId } = req.body;

    const result = await recomputeMRStockFromTransfers(mrId, mrName, session);

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

export default router;