import express from "express";
import mongoose from "mongoose";
import DailySampleReport from "../../models/reports/dailysample.js";
import Staff from "../../models/staffMember/staff.js";
import MRStockInHand from "../../models/sale/mrStockHand.js";
import ReportInHand from "../../models/reports/reportsInHand.js";

const router = express.Router();

function escapeRegex(str) {
  if (!str) return "";
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim().replace(/\s+/g, " ");
};

const findMRStockProduct = async (mrId, productName, session = null) => {
  try {
    const mrStock = await MRStockInHand.findOne({ mrId }).session(session);
    if (!mrStock) return null;
    return mrStock.productsInHand.find(
      (p) => p.productName?.toLowerCase() === productName?.toLowerCase(),
    );
  } catch (error) {
    console.error(`Error finding MR stock for ${productName}:`, error);
    return null;
  }
};

const findReportInHandFlexible = async (productName, session = null) => {
  try {
    const normalized = normalizeProductName(productName);

    const tryFind = async (pattern) => {
      let q = ReportInHand.findOne({
        productName: { $regex: new RegExp(pattern, "i") },
      });
      if (session) q = q.session(session);
      return q;
    };

    let stock = await tryFind(`^${escapeRegex(normalized)}$`);
    if (!stock) {
      const parts = normalized.split(/\s+/);
      const flexible = parts.map((p) => escapeRegex(p)).join("\\s*.*?\\s*");
      stock = await tryFind(flexible);
    }
    if (!stock) stock = await tryFind(escapeRegex(normalized));

    return stock;
  } catch (error) {
    console.error(`Error finding ReportInHand for ${productName}:`, error);
    throw error;
  }
};

const getOrCreateMRStock = async (mrId, mrName, session = null) => {
  try {
    let mrStock = await MRStockInHand.findOne({ mrId }).session(session);
    if (!mrStock) {
      mrStock = new MRStockInHand({
        mrId,
        mrName,
        productsInHand: [],
        totalAmount: 0,
        totalProductCost: 0,
      });
      await mrStock.save({ session });
    }
    return mrStock;
  } catch (error) {
    console.error("Error in getOrCreateMRStock:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Resolve LC from warehouse product
//
// Strategy:
//   1. Use averagePrice if set and > 0 (most accurate weighted average).
//   2. Otherwise look at batches whose adjustmentType is "add" (stock-in
//      entries) sorted by expiryDate ascending — pick the one nearest to
//      expiry that has a positive lc.
//   3. Fallback: average lc across all "add" batches.
//   4. Last resort: any positive lc found anywhere in batches.
// ─────────────────────────────────────────────────────────────────────────────
const resolveWarehouseLc = (warehouseProduct) => {
  // 1. Weighted average price (most accurate)
  if (warehouseProduct.averagePrice && warehouseProduct.averagePrice > 0) {
    return warehouseProduct.averagePrice;
  }

  const batches = warehouseProduct.batches || [];

  // 2. "add" batches sorted by nearest expiry
  const addBatches = batches
    .filter((b) => b.adjustmentType === "add" && b.lc != null && b.lc > 0)
    .sort((a, b) => {
      const da = a.expiryDate
        ? new Date(a.expiryDate)
        : new Date(8640000000000000);
      const db = b.expiryDate
        ? new Date(b.expiryDate)
        : new Date(8640000000000000);
      return da - db; // ascending → nearest expiry first
    });

  if (addBatches.length > 0) {
    console.log(
      `[resolveWarehouseLc] Using nearest-expiry "add" batch lc: ${addBatches[0].lc}` +
        ` (expiry: ${addBatches[0].expiryDate || "none"})`,
    );
    return addBatches[0].lc;
  }

  // 3. Average across all "add" batches (ignoring zero-lc entries)
  const addWithLc = batches.filter(
    (b) => b.adjustmentType === "add" && (b.lc || 0) > 0,
  );
  if (addWithLc.length > 0) {
    const avg = addWithLc.reduce((s, b) => s + b.lc, 0) / addWithLc.length;
    console.log(
      `[resolveWarehouseLc] Using average lc across add batches: ${avg}`,
    );
    return avg;
  }

  // 4. Any batch with a positive lc as last resort
  const anyWithLc = batches.filter((b) => (b.lc || 0) > 0);
  if (anyWithLc.length > 0) {
    const avg = anyWithLc.reduce((s, b) => s + b.lc, 0) / anyWithLc.length;
    console.log(
      `[resolveWarehouseLc] Fallback: average lc across all batches: ${avg}`,
    );
    return avg;
  }

  console.warn(
    `[resolveWarehouseLc] No lc found in warehouse product "${warehouseProduct.productName}"`,
  );
  return 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Add stock back to warehouse (on delete / revert of a daily-sample report)
// ─────────────────────────────────────────────────────────────────────────────
const addStockToWarehouse = async (
  productName,
  quantity,
  adjustmentId,
  session = null,
) => {
  try {
    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      throw new Error(`Product "${productName}" not found in warehouse`);
    }

    // ✅ Resolve lc BEFORE pushing the new batch so the batch carries amount
    const lc = resolveWarehouseLc(reportInHand);
    const amount = lc * quantity; // ✅ amount = lc × boxes

    reportInHand.batches.push({
      boxes: quantity,
      lc,
      amount,
      adjustmentType: "add",
      date: new Date(),
      adjustmentId,
      productName,
    });

    reportInHand.addStockAdjustment =
      (reportInHand.addStockAdjustment || 0) + quantity;
    reportInHand.totalBoxes =
      (reportInHand.totalBoxesFromBatches || 0) +
      (reportInHand.addStockAdjustment || 0) -
      (reportInHand.removeStockAdjustment || 0) -
      (reportInHand.returnStockAdjustment || 0);

    // ✅ totalAmount = lc × totalBoxes (consistent lc basis)
    reportInHand.totalAmount = lc * reportInHand.totalBoxes;

    await reportInHand.save({ session });
    return reportInHand;
  } catch (error) {
    console.error(`Error adding stock for ${productName}:`, error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Remove stock from warehouse (on create / add of a daily-sample report)
// ─────────────────────────────────────────────────────────────────────────────
const removeStockFromWarehouse = async (
  productName,
  quantity,
  adjustmentId,
  session = null,
) => {
  try {
    const reportInHand = await findReportInHandFlexible(productName, session);
    if (!reportInHand) {
      console.warn(
        `Skipping warehouse removal for "${productName}" - product not found`,
      );
      return null;
    }

    if (reportInHand.totalBoxes < quantity) {
      console.warn(
        `Insufficient warehouse stock for ${productName}. ` +
          `Available: ${reportInHand.totalBoxes}, Required: ${quantity}. Continuing anyway.`,
      );
    }

    // ✅ Resolve lc BEFORE pushing so the batch carries correct lc + amount
    const lc = resolveWarehouseLc(reportInHand);
    const amount = lc * quantity; // ✅ amount = lc × boxes

    reportInHand.batches.push({
      boxes: quantity,
      lc,
      amount,
      adjustmentType: "remove",
      date: new Date(),
      adjustmentId,
      productName,
    });

    reportInHand.removeStockAdjustment =
      (reportInHand.removeStockAdjustment || 0) + quantity;
    reportInHand.totalBoxes = Math.max(
      0,
      (reportInHand.totalBoxesFromBatches || 0) +
        (reportInHand.addStockAdjustment || 0) -
        (reportInHand.removeStockAdjustment || 0) -
        (reportInHand.returnStockAdjustment || 0),
    );

    // ✅ totalAmount = lc × remaining boxes
    reportInHand.totalAmount = lc * reportInHand.totalBoxes;

    await reportInHand.save({ session });
    return reportInHand;
  } catch (error) {
    console.error(`Error removing stock for ${productName}:`, error);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update MR stock
// ─────────────────────────────────────────────────────────────────────────────
const updateMRStock = async (
  mrName,
  productName,
  quantity,
  lc, // kept for signature compatibility but we always resolve from warehouse
  session,
  isAdding = true,
) => {
  try {
    const warehouseProduct = await findReportInHandFlexible(
      productName,
      session,
    );
    if (!warehouseProduct) {
      console.warn(
        `Skipping MR stock update for "${productName}" – not found in warehouse`,
      );
      return null;
    }

    const productId = warehouseProduct._id;

    // ✅ Always resolve LC from warehouse data (raw param is often 0)
    const effectiveLc = resolveWarehouseLc(warehouseProduct);

    const mr = await Staff.findOne({
      medicalRepName: { $regex: new RegExp(`^${escapeRegex(mrName)}$`, "i") },
    }).session(session);

    if (!mr) throw new Error(`MR "${mrName}" not found`);

    let mrStock = await getOrCreateMRStock(mr._id, mr.medicalRepName, session);

    const productIndex = mrStock.productsInHand.findIndex(
      (p) => p.productId && p.productId.toString() === productId.toString(),
    );

    if (isAdding) {
      // ── Adding samples: deduct from MR's available stock ──────────────────
      if (productIndex !== -1) {
        const rec = mrStock.productsInHand[productIndex];
        const currentAssigned = rec.assignedQuantity || 0;
        const currentSampleCount = rec.sampleCount || 0;

        if (currentAssigned - currentSampleCount < quantity) {
          console.warn(
            `Insufficient MR stock for ${productName}. ` +
              `Available: ${currentAssigned - currentSampleCount}, Required: ${quantity}.`,
          );
        }

        const newSampleCount = currentSampleCount + quantity;
        mrStock.productsInHand[productIndex].sampleCount = newSampleCount;
        mrStock.productsInHand[productIndex].quantity = Math.max(
          0,
          currentAssigned - newSampleCount,
        );
        // ✅ Keep lc in sync with warehouse
        mrStock.productsInHand[productIndex].lc = effectiveLc;
        // ✅ amount = lc × quantity on hand
        mrStock.productsInHand[productIndex].amount =
          effectiveLc * Math.max(0, currentAssigned - newSampleCount);
        mrStock.productsInHand[productIndex].lastUpdated = new Date();
      } else {
        // ── Product NOT yet in MR stock ──────────────────────────────────────
        console.warn(
          `"${productName}" not in MR ${mrName}'s stock. ` +
            `Warehouse deducted. Recording as sampleCount debt.`,
        );
        mrStock.productsInHand.push({
          productId,
          productName,
          quantity: 0, // ✅ 0 satisfies min:0 schema constraint
          assignedQuantity: 0,
          sampleCount: quantity,
          lc: effectiveLc, // ✅ from warehouse, not raw param
          amount: 0, // 0 in-hand boxes → 0 amount
          lastUpdated: new Date(),
        });
      }
    } else {
      // ── Removing samples (report deleted / reverted) ───────────────────────
      if (productIndex !== -1) {
        const rec = mrStock.productsInHand[productIndex];

        // ✅ Use stored lc if valid; otherwise fall back to warehouse
        const storedLc = rec.lc && rec.lc > 0 ? rec.lc : effectiveLc;

        const newSampleCount = Math.max(0, (rec.sampleCount || 0) - quantity);
        const newQty = Math.max(
          0,
          (rec.assignedQuantity || 0) - newSampleCount,
        );

        mrStock.productsInHand[productIndex].sampleCount = newSampleCount;
        mrStock.productsInHand[productIndex].quantity = newQty;
        mrStock.productsInHand[productIndex].lc = storedLc;
        // ✅ amount = lc × quantity on hand
        mrStock.productsInHand[productIndex].amount = storedLc * newQty;
        mrStock.productsInHand[productIndex].lastUpdated = new Date();

        // Clean up fully-zeroed record
        if (
          mrStock.productsInHand[productIndex].quantity === 0 &&
          mrStock.productsInHand[productIndex].sampleCount === 0 &&
          mrStock.productsInHand[productIndex].assignedQuantity === 0
        ) {
          mrStock.productsInHand.splice(productIndex, 1);
        }
      } else {
        // Not in MR stock — warehouse already restored by addStockToWarehouse()
        console.warn(
          `"${productName}" not in MR ${mrName}'s stock during removal. ` +
            `Warehouse already restored.`,
        );
      }
    }

    // ── Recalculate MR totals (monetary math on non-negative qty only) ────────
    mrStock.totalAmount = mrStock.productsInHand.reduce(
      (sum, p) => sum + (p.lc || 0) * Math.max(0, p.quantity || 0),
      0,
    );
    mrStock.totalProductCost = mrStock.productsInHand.reduce(
      (sum, p) =>
        sum + (p.productCost || p.lc || 0) * Math.max(0, p.quantity || 0),
      0,
    );

    mrStock.updatedAt = new Date();
    await mrStock.save({ session });

    return mrStock;
  } catch (error) {
    console.error("Error updating MR stock:", error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Stock orchestration helpers
// ─────────────────────────────────────────────────────────────────────────────
const updateStockOnAdd = async (dailySample, session = null) => {
  try {
    const { products, mrName, _id } = dailySample;
    for (const prod of products) {
      const qty = Number(prod.totalQty);
      if (isNaN(qty) || qty <= 0) continue;

      try {
        await removeStockFromWarehouse(prod.productName, qty, _id, session);
      } catch (err) {
        console.warn(
          `Failed to remove from warehouse for ${prod.productName}:`,
          err.message,
        );
      }

      await updateMRStock(mrName, prod.productName, qty, 0, session, true);
    }
  } catch (error) {
    console.error("Error in updateStockOnAdd:", error);
    throw error;
  }
};

const updateStockOnDelete = async (dailySample, session = null) => {
  try {
    const { products, mrName, _id } = dailySample;
    for (const prod of products) {
      const qty = Number(prod.totalQty);
      if (isNaN(qty) || qty <= 0) continue;

      try {
        await addStockToWarehouse(prod.productName, qty, _id, session);
      } catch (err) {
        console.warn(
          `Failed to add to warehouse for ${prod.productName}:`,
          err.message,
        );
      }

      await updateMRStock(mrName, prod.productName, qty, 0, session, false);
    }
  } catch (error) {
    console.error("Error in updateStockOnDelete:", error);
    throw error;
  }
};

const updateStockOnUpdate = async (oldReport, newReport, session = null) => {
  try {
    const oldProductMap = new Map(
      (oldReport.products || []).map((p) => [
        p.productName,
        Number(p.totalQty),
      ]),
    );
    const newProductMap = new Map(
      (newReport.products || []).map((p) => [
        p.productName,
        Number(p.totalQty),
      ]),
    );

    const oldMrName = oldReport.mrName;
    const newMrName = newReport.mrName;

    // Products removed from report
    for (const [productName, oldQty] of oldProductMap) {
      if (!newProductMap.has(productName)) {
        try {
          await addStockToWarehouse(
            productName,
            oldQty,
            oldReport._id,
            session,
          );
        } catch (err) {
          console.warn(`Warehouse add failed for ${productName}:`, err.message);
        }
        await updateMRStock(oldMrName, productName, oldQty, 0, session, false);
      }
    }

    // Products added to report
    for (const [productName, newQty] of newProductMap) {
      if (!oldProductMap.has(productName)) {
        try {
          await removeStockFromWarehouse(
            productName,
            newQty,
            newReport._id,
            session,
          );
        } catch (err) {
          console.warn(
            `Warehouse remove failed for ${productName}:`,
            err.message,
          );
        }
        await updateMRStock(newMrName, productName, newQty, 0, session, true);
      }
    }

    // Quantity changed
    for (const [productName, newQty] of newProductMap) {
      const oldQty = oldProductMap.get(productName);
      if (oldQty === undefined) continue;
      if (oldQty === newQty) continue;

      const diff = newQty - oldQty;
      if (diff > 0) {
        try {
          await removeStockFromWarehouse(
            productName,
            diff,
            newReport._id,
            session,
          );
        } catch (err) {
          console.warn(
            `Warehouse remove failed for ${productName}:`,
            err.message,
          );
        }
        await updateMRStock(newMrName, productName, diff, 0, session, true);
      } else {
        const absDiff = Math.abs(diff);
        try {
          await addStockToWarehouse(
            productName,
            absDiff,
            newReport._id,
            session,
          );
        } catch (err) {
          console.warn(`Warehouse add failed for ${productName}:`, err.message);
        }
        await updateMRStock(newMrName, productName, absDiff, 0, session, false);
      }
    }
  } catch (error) {
    console.error("Error in updateStockOnUpdate:", error);
    throw error;
  }
};

// ================== ROUTES ==================

router.get("/mr-stock/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(mrId))
      return res.status(400).json({ success: false, message: "Invalid MR ID" });

    const mrStock = await MRStockInHand.findOne({
      mrId: new mongoose.Types.ObjectId(mrId),
    });
    if (!mrStock) {
      return res.status(200).json({
        success: true,
        data: { mrId, mrName: "", productsInHand: [] },
        message: "No stock record found for this MR",
      });
    }

    const dailySamples = await DailySampleReport.find({
      mrId: new mongoose.Types.ObjectId(mrId),
    });
    const sampleCountMap = new Map();
    dailySamples.forEach((report) => {
      report.products.forEach((prod) => {
        const qty = Number(prod.totalQty) || 0;
        if (qty > 0)
          sampleCountMap.set(
            prod.productName,
            (sampleCountMap.get(prod.productName) || 0) + qty,
          );
      });
    });

    const enhancedProducts = mrStock.productsInHand.map((product) => {
      const sampleCount = sampleCountMap.get(product.productName) || 0;
      const assignedQuantity = product.assignedQuantity || 0;
      const inHandQuantity = assignedQuantity - sampleCount;
      const lc = product.lc || 0;
      return {
        ...product.toObject(),
        sampleCount,
        inHandQuantity,
        availableToReturn: Math.max(0, inHandQuantity),
        // ✅ expose computed amount at read time too
        amount: lc * Math.max(0, inHandQuantity),
      };
    });

    res.status(200).json({
      success: true,
      data: {
        mrId: mrStock.mrId,
        mrName: mrStock.mrName,
        productsInHand: enhancedProducts,
      },
    });
  } catch (error) {
    console.error("Error fetching MR stock:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/mrs-with-stock", async (req, res) => {
  try {
    const mrsWithStock = await MRStockInHand.find({
      "productsInHand.assignedQuantity": { $gt: 0 },
    }).select("mrId mrName productsInHand");

    const mrsWithDetails = await Promise.all(
      mrsWithStock.map(async (mrStock) => {
        const dailySamples = await DailySampleReport.find({
          mrId: mrStock.mrId,
        });
        const sampleCountMap = new Map();
        dailySamples.forEach((report) => {
          report.products.forEach((prod) => {
            const qty = Number(prod.totalQty) || 0;
            if (qty > 0)
              sampleCountMap.set(
                prod.productName,
                (sampleCountMap.get(prod.productName) || 0) + qty,
              );
          });
        });

        let totalInHand = 0;
        const productsWithDetails = mrStock.productsInHand.map((product) => {
          const sampleCount = sampleCountMap.get(product.productName) || 0;
          const assignedQuantity = product.assignedQuantity || 0;
          const inHand = assignedQuantity - sampleCount;
          totalInHand += Math.max(0, inHand);
          return { ...product.toObject(), sampleCount, inHand };
        });

        return {
          mrId: mrStock.mrId,
          mrName: mrStock.mrName,
          totalInHand: Math.max(0, totalInHand),
          productsCount: productsWithDetails.filter((p) => p.inHand > 0).length,
        };
      }),
    );

    res.status(200).json({
      success: true,
      data: mrsWithDetails.filter((mr) => mr.totalInHand > 0),
    });
  } catch (error) {
    console.error("Error fetching MRs with stock:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/check-available-stock", async (req, res) => {
  try {
    const { mrName, productName, requestedQuantity } = req.body;
    if (!mrName || !productName || !requestedQuantity)
      return res.status(400).json({
        success: false,
        message: "mrName, productName, requestedQuantity required",
      });

    const mr = await Staff.findOne({
      medicalRepName: { $regex: new RegExp(`^${escapeRegex(mrName)}$`, "i") },
    });
    if (!mr)
      return res.status(404).json({ success: false, message: "MR not found" });

    const mrStock = await MRStockInHand.findOne({ mrId: mr._id });
    if (!mrStock)
      return res.status(200).json({
        success: true,
        available: 0,
        message: "No stock found for this MR",
      });

    const product = mrStock.productsInHand.find(
      (p) => p.productName?.toLowerCase() === productName?.toLowerCase(),
    );

    if (!product)
      return res.status(200).json({
        success: true,
        available: 0,
        isAvailable: true,
        message:
          "Product not found in MR's stock. Will create record with negative balance.",
      });

    const dailySamples = await DailySampleReport.find({
      mrId: mr._id,
      "products.productName": productName,
    });

    let sampleCount = 0;
    dailySamples.forEach((report) => {
      report.products.forEach((prod) => {
        if (prod.productName === productName)
          sampleCount += Number(prod.totalQty) || 0;
      });
    });

    const assignedQuantity = product.assignedQuantity || 0;
    const available = assignedQuantity - sampleCount;

    res.status(200).json({
      success: true,
      available,
      assignedQuantity,
      sampleCount,
      requestedQuantity,
      isAvailable: available >= requestedQuantity,
      message:
        available >= requestedQuantity
          ? "Sufficient stock available"
          : `Insufficient stock. Available: ${available}, Requested: ${requestedQuantity}`,
    });
  } catch (error) {
    console.error("Error checking available stock:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/import", async (req, res) => {
  try {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "No data provided" });

    const validEntries = [];
    const invalidEntries = [];

    for (const [index, entry] of data.entries()) {
      if (
        !entry.requestNumber ||
        !entry.date ||
        !entry.mrName ||
        !entry.productName
      ) {
        invalidEntries.push({
          index: index + 1,
          reason: "Missing required fields",
          entry,
        });
        continue;
      }
      const parsedDate = new Date(entry.date);
      if (isNaN(parsedDate)) {
        invalidEntries.push({
          index: index + 1,
          reason: "Invalid date",
          entry,
        });
        continue;
      }
      validEntries.push({
        requestNumber: entry.requestNumber,
        date: parsedDate,
        mrName: entry.mrName,
        description: entry.description || "",
        products: [
          {
            productName: entry.productName,
            totalQty: Number(entry.totalQty) || 0,
          },
        ],
        remark: entry.remark || "",
        customerId: entry.customerId || null,
        customerName: entry.customerName || "",
        customerCode: entry.customerCode || "",
      });
    }

    if (validEntries.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "No valid records", invalidEntries });

    const result = await DailySampleReport.insertMany(validEntries, {
      ordered: false,
    });
    for (const entry of result) {
      try {
        await updateStockOnAdd(entry);
      } catch (err) {
        console.error(`Stock update failed for ${entry.requestNumber}:`, err);
      }
    }

    res.status(200).json({
      success: true,
      message: "Daily sample reports imported",
      data: {
        imported: result.length,
        failed: invalidEntries.length,
        invalidEntries: invalidEntries.length ? invalidEntries : undefined,
      },
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      mrName,
      productName,
      requestNumber,
      startDate,
      endDate,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};
    if (mrName) query.mrName = { $regex: mrName, $options: "i" };
    if (requestNumber)
      query.requestNumber = { $regex: requestNumber, $options: "i" };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    if (productName)
      query["products.productName"] = { $regex: productName, $options: "i" };

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const total = await DailySampleReport.countDocuments(query);
    const reports = await DailySampleReport.find(query)
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      success: true,
      reports,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(total / limitNum),
        totalRecords: total,
        hasNext: pageNum < Math.ceil(total / limitNum),
        hasPrev: pageNum > 1,
        limit: limitNum,
      },
      totalCount: total,
    });
  } catch (err) {
    console.error("Error fetching daily samples:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/statistics", async (req, res) => {
  try {
    const { startDate, endDate, mrName } = req.query;
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }
    if (mrName) matchStage.mrName = { $regex: mrName, $options: "i" };

    const [overallStats, statsByMR, statsByProduct] = await Promise.all([
      DailySampleReport.aggregate([
        { $match: matchStage },
        { $unwind: "$products" },
        {
          $group: {
            _id: null,
            totalReports: { $sum: 1 },
            totalQty: { $sum: "$products.totalQty" },
          },
        },
      ]),
      DailySampleReport.aggregate([
        { $match: matchStage },
        { $unwind: "$products" },
        {
          $group: {
            _id: "$mrName",
            reportCount: { $sum: 1 },
            totalQty: { $sum: "$products.totalQty" },
          },
        },
        { $sort: { reportCount: -1 } },
        { $limit: 10 },
      ]),
      DailySampleReport.aggregate([
        { $match: matchStage },
        { $unwind: "$products" },
        {
          $group: {
            _id: "$products.productName",
            reportCount: { $sum: 1 },
            totalQty: { $sum: "$products.totalQty" },
          },
        },
        { $sort: { totalQty: -1 } },
        { $limit: 10 },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: overallStats[0] || { totalReports: 0, totalQty: 0 },
        byMR: statsByMR,
        byProduct: statsByProduct,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });
    const report = await DailySampleReport.findById(id).lean();
    if (!report)
      return res.status(404).json({ success: false, message: "Not found" });
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      mrId,
      date,
      mrName,
      products,
      remark,
      customerId,
      customerName,
      customerCode,
    } = req.body;

    if (!date || !mrName || !Array.isArray(products) || products.length === 0)
      throw new Error("Date, MR name, and at least one product are required");

    for (const prod of products) {
      if (
        !prod.productName ||
        prod.totalQty === undefined ||
        prod.totalQty <= 0
      )
        throw new Error("Each product must have a name and positive quantity");
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) throw new Error("Invalid date");

    const report = new DailySampleReport({
      date: parsedDate,
      mrId: mrId || null,
      mrName,
      products: products.map((p) => ({
        productName: p.productName,
        totalQty: Number(p.totalQty),
      })),
      remark: remark || "",
      customerId: customerId || null,
      customerName: customerName || "",
      customerCode: customerCode || "",
    });

    await report.save({ session });
    await updateStockOnAdd(report, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Daily sample report added",
      data: report,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid ID");

    const oldReport = await DailySampleReport.findById(id).session(session);
    if (!oldReport) throw new Error("Report not found");

    const updateData = req.body;
    if (updateData.date) {
      const parsed = new Date(updateData.date);
      if (isNaN(parsed)) throw new Error("Invalid date");
      updateData.date = parsed;
    }

    if (updateData.products) {
      for (const prod of updateData.products) {
        if (!prod.productName || prod.totalQty <= 0)
          throw new Error("Invalid product data");
      }
    }

    if (updateData.products || updateData.mrName) {
      const updatedReport = {
        ...oldReport.toObject(),
        ...updateData,
        products: updateData.products || oldReport.products,
        _id: oldReport._id,
        mrName: updateData.mrName || oldReport.mrName,
      };
      await updateStockOnUpdate(oldReport, updatedReport, session);
    }

    const updated = await DailySampleReport.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
      session,
    });
    if (!updated) throw new Error("Failed to update report");

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Daily sample report updated successfully",
      data: updated,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error updating daily sample report:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Invalid ID");

    const deleted =
      await DailySampleReport.findByIdAndDelete(id).session(session);
    if (!deleted) throw new Error("Not found");

    await updateStockOnDelete(deleted, session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ success: true, message: "Deleted", data: deleted });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete("/", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    let { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) throw new Error("No IDs");

    ids = ids.map((id) => new mongoose.Types.ObjectId(id));
    const reportsToDelete = await DailySampleReport.find({
      _id: { $in: ids },
    }).session(session);
    await DailySampleReport.deleteMany({ _id: { $in: ids } }).session(session);

    for (const report of reportsToDelete) {
      await updateStockOnDelete(report, session);
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `${reportsToDelete.length} deleted`,
      deletedCount: reportsToDelete.length,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
