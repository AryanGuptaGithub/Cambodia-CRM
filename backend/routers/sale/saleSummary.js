import express from "express";
import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();
const importProgressMap = new Map();
let isImportInProgress = false;
const importLock = new Map();

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

const escapeRegexForSearch = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

const shouldMergeInvoices = (existingInvoice, newInvoiceData) => {
  if (existingInvoice.invoiceNumber !== newInvoiceData.invoiceNumber) {
    return { shouldMerge: false, isExactDuplicate: false };
  }

  if (existingInvoice.customerCode !== newInvoiceData.customerCode) {
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "Customer mismatch",
    };
  }

  const existingStatus = mapPaymentStatus(existingInvoice.paymentStatus);
  const newStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
  if (existingStatus !== newStatus) {
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "Payment status mismatch",
    };
  }

  if (existingInvoice.mrName !== newInvoiceData.mrName) {
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "MR mismatch",
    };
  }

  const existingProductNames = existingInvoice.products
    .map((p) => p.productName)
    .sort();
  const newProductNames = (newInvoiceData.products || [])
    .map((p) => p.productName?.trim())
    .sort();

  if (
    JSON.stringify(existingProductNames) === JSON.stringify(newProductNames)
  ) {
    let isExactDuplicate = true;

    for (const newProduct of newInvoiceData.products || []) {
      const existingProduct = existingInvoice.products.find(
        (ep) => ep.productName === newProduct.productName?.trim(),
      );

      if (!existingProduct) {
        isExactDuplicate = false;
        break;
      }

      if (
        fixPrecision(existingProduct.salesQty) !==
        fixPrecision(parseFloat(newProduct.salesQty) || 0)
      ) {
        isExactDuplicate = false;
        break;
      }

      if (
        fixPrecision(existingProduct.bonusQty) !==
        fixPrecision(parseFloat(newProduct.bonusQty) || 0)
      ) {
        isExactDuplicate = false;
        break;
      }

      if (
        fixPrecision(existingProduct.sellingPrice) !==
        fixPrecision(parseFloat(newProduct.sellingPrice) || 0)
      ) {
        isExactDuplicate = false;
        break;
      }
    }

    if (isExactDuplicate) {
      return { shouldMerge: false, isExactDuplicate: true };
    }
  }

  return { shouldMerge: true, isExactDuplicate: false };
};

const mergeInvoiceProducts = async (
  existingInvoice,
  newInvoiceData,
  session,
) => {
  try {
    const mergedProducts = [...existingInvoice.products];
    let totalAmount = fixPrecision(existingInvoice.totalAmount || 0);
    let totalProfitLoss = fixPrecision(existingInvoice.totalProfitLoss || 0);
    let paidAmount = fixPrecision(existingInvoice.paidAmount || 0);
    let totalCostAmount = fixPrecision(existingInvoice.costAmount || 0);

    const paymentStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
    let newPaidAmount = 0;

    for (const newProduct of newInvoiceData.products || []) {
      const productName = newProduct.productName?.trim();
      const salesQty = fixPrecision(parseFloat(newProduct.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(newProduct.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty <= 0) continue;

      const existingProductIndex = mergedProducts.findIndex(
        (p) => p.productName === productName,
      );

      const stockItem = await findStockItemFlexible(productName, session);

      if (!stockItem) {
        throw new Error(`Product "${productName}" not found in inventory`);
      }

      const currentAvailableStock = fixPrecision(
        Number(stockItem.totalBoxes || 0),
      );

      if (currentAvailableStock < totalQty) {
        const shortage = fixPrecision(totalQty - currentAvailableStock);
        throw new Error(
          `Insufficient stock for ${productName}. ` +
            `Required: ${totalQty}, Available: ${currentAvailableStock}, ` +
            `Short by: ${shortage}`,
        );
      }

      const deductionResult = await deductStockFromReportInHand(
        productName,
        salesQty,
        bonusQty,
        existingInvoice.invoiceNumber,
        session,
      );

      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`,
        );
      }

      // Capture the amount deducted (cost value)
      const amountDeducted = deductionResult.amountDeducted || 0;
      totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

      const productRecord = await findProductRecordFlexible(
        productName,
        session,
      );

      const lc = productRecord?.lc || 0;
      const sellingPrice = fixPrecision(
        parseFloat(newProduct.sellingPrice) || 0,
      );
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(newProduct.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

      if (existingProductIndex >= 0) {
        const existingProduct = mergedProducts[existingProductIndex];
        existingProduct.salesQty = fixPrecision(
          existingProduct.salesQty + salesQty,
        );
        existingProduct.bonusQty = fixPrecision(
          existingProduct.bonusQty + bonusQty,
        );
        existingProduct.totalQty = fixPrecision(
          existingProduct.totalQty + totalQty,
        );
        existingProduct.netSellingAmount = fixPrecision(
          existingProduct.netSellingAmount + netSellingAmount,
        );
        existingProduct.profitLoss = fixPrecision(
          existingProduct.profitLoss + profitLoss,
        );
        existingProduct.amount = fixPrecision(existingProduct.amount + amount);
        existingProduct.discount = fixPrecision(
          existingProduct.discount + discount,
        );
        existingProduct.averageUnitPrice =
          existingProduct.totalQty > 0
            ? fixPrecision(
                existingProduct.netSellingAmount / existingProduct.totalQty,
              )
            : 0;
      } else {
        mergedProducts.push({
          productName: productName,
          salesQty,
          bonusQty,
          totalQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice: totalQty
            ? fixPrecision(netSellingAmount / totalQty)
            : 0,
          lc,
          profitLoss,
          isProductAccept: true,
        });
      }

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);

      if (paymentStatus === "Cash") {
        newPaidAmount = fixPrecision(newPaidAmount + netSellingAmount);
      }
    }

    if (paymentStatus === "Cash") {
      paidAmount = fixPrecision(paidAmount + newPaidAmount);
    }

    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    existingInvoice.products = mergedProducts;
    existingInvoice.totalAmount = totalAmount;
    existingInvoice.totalProfitLoss = totalProfitLoss;
    existingInvoice.paidAmount = paidAmount;
    existingInvoice.dueAmount = dueAmount;
    existingInvoice.costAmount = totalCostAmount;
    existingInvoice.updatedAt = new Date();

    await existingInvoice.save({ session });

    if (newPaidAmount > 0 && existingInvoice.mrName) {
      const mrCashUpdate = await updateMRCashes(
        existingInvoice.mrName,
        newPaidAmount,
        existingInvoice.invoiceNumber,
        new Date(),
        session,
        false,
      );

      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.error(
          `⚠️ Failed to update MR Cash during merge: ${mrCashUpdate.error}`,
        );
      }
    }

    return {
      success: true,
      invoiceNumber: existingInvoice.invoiceNumber,
      action: "merged",
      addedProducts: (newInvoiceData.products || []).length,
      newTotalAmount: totalAmount,
      newPaidAmount: paidAmount,
      addedPaidAmount: newPaidAmount,
      newCostAmount: totalCostAmount,
    };
  } catch (error) {
    console.error(
      `❌ Error merging invoice ${existingInvoice.invoiceNumber}:`,
      error,
    );
    return {
      success: false,
      error: error.message,
    };
  }
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim();
};

const escapeRegex = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

const findStockItemFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);

    let query = ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
      },
    });

    if (session) query = query.session(session);

    let stockItem = await query;

    if (!stockItem) {
      const nameParts = normalizedName.split(/\s+/);
      const flexiblePattern = nameParts
        .map((part) => escapeRegex(part))
        .join("\\s*.*?\\s*");

      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") },
      });

      if (session) query = query.session(session);
      stockItem = await query;
    }

    if (!stockItem) {
      const productRecord = await findProductRecordFlexible(
        productName,
        session,
      );
      if (productRecord) {
        query = ReportInHand.findOne({
          productName: {
            $regex: new RegExp(escapeRegex(productRecord.productName), "i"),
          },
        });

        if (session) query = query.session(session);
        stockItem = await query;
      }
    }

    return stockItem;
  } catch (error) {
    console.error(`Error finding stock item for ${productName}:`, error);
    return null;
  }
};

const findProductRecordFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);

    let query = Product.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
      },
    });

    if (session) query = query.session(session);

    let product = await query;

    if (!product) {
      const nameParts = normalizedName.split(/\s+/);
      const flexiblePattern = nameParts
        .map((part) => escapeRegex(part))
        .join("\\s*.*?\\s*");

      query = Product.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") },
      });

      if (session) query = query.session(session);
      product = await query;
    }

    return product;
  } catch (error) {
    console.error(`Error finding product record for ${productName}:`, error);
    return null;
  }
};

const mapPaymentStatus = (status) => {
  if (!status) return "Credit";
  const s = status.toLowerCase().trim();
  const map = {
    paid: "Paid",
    cash: "Cash",
    credit: "Credit",
    pending: "Credit",
    "partial paid": "Partial Paid",
    unpaid: "Credit",
    due: "Credit",
    partial: "Partial Paid",
  };
  return map[s] || "Credit";
};

const getCustomerByCode = async (customerCode, session = null) => {
  try {
    if (!customerCode || customerCode.trim() === "") {
      return {
        success: false,
        message: "Customer code is required",
        customer: null,
      };
    }

    const cleanedCode = customerCode.trim();
    let query = Customer.findOne({
      customerCode: cleanedCode,
      enabled: true,
    });

    if (session) {
      query = query.session(session);
    }

    let customer = await query;

    if (!customer) {
      const digitsMatch = cleanedCode.match(/\d+/);
      if (digitsMatch) {
        const digits = digitsMatch[0];
        const paddedCode = digits.padStart(5, "0");

        query = Customer.findOne({
          customerCode: paddedCode,
          enabled: true,
        });

        if (session) {
          query = query.session(session);
        }

        customer = await query;
      }
    }

    if (!customer) {
      query = Customer.findOne({
        customerCode: { $regex: new RegExp(`^${cleanedCode}$`, "i") },
        enabled: true,
      });

      if (session) {
        query = query.session(session);
      }

      customer = await query;
    }

    if (!customer) {
      return {
        success: false,
        message: `Customer with code "${cleanedCode}" not found`,
        customer: null,
      };
    }

    return {
      success: true,
      customer: {
        customerName: customer.name,
        customerId: customer._id,
        customerCode: customer.customerCode,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Error fetching customer: ${error.message}`,
      customer: null,
    };
  }
};

// ==========================================
// STOCK CALCULATION - REAL BATCHES ONLY
// ==========================================

// Helper: returns only real stock batches (excludes "remove", "restore", audit types)
const getRealBatches = (batches = []) => {
  return batches.filter(
    (batch) => !batch.adjustmentType || batch.adjustmentType === "batch",
  );
};

const calculateProductStock = async (productName, requiredQty = 0) => {
  try {
    const stockItem = await findStockItemFlexible(productName);

    if (!stockItem) {
      return {
        success: false,
        found: false,
        productName,
        requiredQty: fixPrecision(requiredQty),
        availableStock: 0,
        insufficient: true,
        insufficientQty: fixPrecision(requiredQty),
        message: `Product "${productName}" not found in inventory`,
        status: "Product Not Found",
        issueType: "Could not verify product existence",
        productExists: false,
      };
    }

    let availableStock = 0;
    let batchDetails = [];

    if (stockItem.totalBoxes !== undefined && stockItem.totalBoxes !== null) {
      availableStock = fixPrecision(Number(stockItem.totalBoxes));
    } else {
      // Fallback: only count real batches (exclude "remove" type)
      const realBatches = getRealBatches(stockItem.batches);

      let batchesSum = 0;
      realBatches.forEach((batch) => {
        const batchQty = fixPrecision(Number(batch.boxes || 0));
        if (batchQty > 0) {
          batchesSum = fixPrecision(batchesSum + batchQty);
          batchDetails.push({
            batchNumber: batch.batchNumber,
            boxes: batchQty,
            expiryDate: batch.expiryDate,
          });
        }
      });

      let totalAdjustments = 0;
      if (stockItem.addStockAdjustment) {
        totalAdjustments = fixPrecision(
          totalAdjustments + fixPrecision(Number(stockItem.addStockAdjustment)),
        );
      }
      if (stockItem.removeStockAdjustment) {
        totalAdjustments = fixPrecision(
          totalAdjustments -
            fixPrecision(Number(stockItem.removeStockAdjustment)),
        );
      }

      availableStock = fixPrecision(Math.max(0, batchesSum + totalAdjustments));
    }

    const fixedRequiredQty = fixPrecision(requiredQty);
    const insufficientQty = fixPrecision(
      Math.max(0, fixedRequiredQty - availableStock),
    );
    const hasEnoughStock = availableStock >= fixedRequiredQty;

    return {
      success: true,
      found: true,
      productName: stockItem.productName,
      requestedProductName: productName,
      availableStock,
      requiredQty: fixedRequiredQty,
      insufficient: !hasEnoughStock,
      insufficientQty,
      hasEnoughStock,
      batchDetails,
      calculationMethod: "reportinhand_with_adjustments",
      productExists: true,
      message: hasEnoughStock
        ? `✅ Stock available: ${availableStock} units`
        : `❌ Insufficient stock: Required ${fixedRequiredQty}, Available ${availableStock}, Short by ${insufficientQty}`,
    };
  } catch (error) {
    console.error(`❌ STOCK CALCULATION ERROR for ${productName}:`, error);
    return {
      success: false,
      found: false,
      productName,
      availableStock: 0,
      requiredQty: fixPrecision(requiredQty),
      insufficient: true,
      insufficientQty: fixPrecision(requiredQty),
      message: `Error checking stock: ${error.message}`,
      status: "Error",
      issueType: "Stock check failed",
      productExists: false,
    };
  }
};

// ==========================================
// STOCK DEDUCTION - FIFO, NO "remove" BATCH
// ==========================================
const deductStockFromReportInHand = async (
  productName,
  salesQty,
  bonusQty,
  invoiceNumber,
  session,
) => {
  try {
    const totalQty = fixPrecision(salesQty + bonusQty);
    if (totalQty <= 0) {
      return { success: true, deductedQty: 0 };
    }

    const stockItem = await findStockItemFlexible(productName, session);
    if (!stockItem) {
      return {
        success: false,
        message: `Product "${productName}" not found in inventory`,
        productExists: false,
      };
    }

    const currentStock = fixPrecision(Number(stockItem.totalBoxes || 0));

    if (currentStock < totalQty) {
      return {
        success: false,
        message: `Insufficient stock. Available: ${currentStock}, Required: ${totalQty}`,
        productExists: true,
        insufficient: true,
        shortage: fixPrecision(totalQty - currentStock),
      };
    }

    const previousTotalAmount = fixPrecision(
      Number(stockItem.totalAmount || 0),
    );

    // ── FIFO: only iterate real stock batches (EXCLUDE "remove", "restore") ──
    const realBatchIndices = [];
    stockItem.batches.forEach((batch, idx) => {
      const type = batch.adjustmentType;
      if (!type || type === "batch") {
        realBatchIndices.push(idx);
      }
    });

    // Sort oldest first (FIFO)
    realBatchIndices.sort((a, b) => {
      const dateA = stockItem.batches[a].date
        ? new Date(stockItem.batches[a].date)
        : new Date(0);
      const dateB = stockItem.batches[b].date
        ? new Date(stockItem.batches[b].date)
        : new Date(0);
      return dateA - dateB;
    });

    // ── Deduct from real batches in FIFO order, accumulate cost ──────────────
    let remainingToDeduct = totalQty;
    let totalCostDeducted = 0;

    for (const idx of realBatchIndices) {
      if (remainingToDeduct <= 0) break;

      const batch = stockItem.batches[idx];
      const batchBoxes = fixPrecision(Number(batch.boxes || 0));
      if (batchBoxes <= 0) continue;

      // Do NOT round batch.lc – keep its full precision
      const batchLC = Number(batch.lc || 0);
      const deductFromThisBatch = fixPrecision(
        Math.min(batchBoxes, remainingToDeduct),
      );
      // Round only the final cost (money)
      const costFromThisBatch = fixPrecision(deductFromThisBatch * batchLC);

      totalCostDeducted = fixPrecision(totalCostDeducted + costFromThisBatch);

      // Reduce this batch's boxes directly
      const newBatchBoxes = fixPrecision(batchBoxes - deductFromThisBatch);
      stockItem.batches[idx].boxes = newBatchBoxes;

      // Update batch amount using the full-precision lc, then round
      stockItem.batches[idx].amount = fixPrecision(newBatchBoxes * batchLC);

      remainingToDeduct = fixPrecision(remainingToDeduct - deductFromThisBatch);
    }

    // ── Update removeStockAdjustment so virtual totalBoxes stays correct ──────
    const previousRemoveAdj = fixPrecision(
      Number(stockItem.removeStockAdjustment || 0),
    );
    const newRemoveStockAdjustment = fixPrecision(previousRemoveAdj + totalQty);
    stockItem.removeStockAdjustment = newRemoveStockAdjustment;

    // ── Recalculate totalBoxesFromBatches (sum of all real batch boxes) ───────
    let totalBoxesFromBatches = 0;
    for (const batch of stockItem.batches) {
      const type = batch.adjustmentType;
      if (!type || type === "batch") {
        totalBoxesFromBatches = fixPrecision(
          totalBoxesFromBatches + (batch.boxes || 0),
        );
      }
    }
    stockItem.totalBoxesFromBatches = totalBoxesFromBatches;

    // ── Calculate new total boxes ─────────────────────────────────────────────
    const addStockAdjustment = fixPrecision(
      Number(stockItem.addStockAdjustment || 0),
    );
    const newTotalBoxes = fixPrecision(
      Math.max(
        0,
        totalBoxesFromBatches + addStockAdjustment - newRemoveStockAdjustment,
      ),
    );

    // ── Calculate new total amount from all real batches ─────────────────────
    let newTotalAmount = 0;
    for (const batch of stockItem.batches) {
      const type = batch.adjustmentType;
      if (!type || type === "batch") {
        const boxes = fixPrecision(Number(batch.boxes || 0));
        // Do NOT round batch.lc here either
        const lc = Number(batch.lc || 0);
        // Batch amount should be boxes * lc, rounded to two decimals
        const batchAmount = fixPrecision(boxes * lc);
        // Update batch amount to ensure consistency
        batch.amount = batchAmount;
        newTotalAmount = fixPrecision(newTotalAmount + batchAmount);
      }
    }

    // ── Recalculate averagePrice from remaining stock ─────────────────────────
    const newAveragePrice =
      newTotalBoxes > 0 ? fixPrecision(newTotalAmount / newTotalBoxes) : 0;

    // ── Apply to stockItem ────────────────────────────────────────────────────
    stockItem.totalAmount = newTotalAmount;
    stockItem.averagePrice = newAveragePrice;

    if (newTotalBoxes <= 0) {
      stockItem.status = "Out of Stock";
      stockItem.totalAmount = 0;
      stockItem.averagePrice = 0;
    } else if (newTotalBoxes < (stockItem.minStockLevel || 10)) {
      stockItem.status = "Low Stock";
    } else {
      stockItem.status = "In Stock";
    }

    await stockItem.save({ session });

    console.log(`✅ FIFO Stock deducted for "${productName}":`, {
      deducted: totalQty,
      previousStock: currentStock,
      newStock: newTotalBoxes,
      previousAmount: previousTotalAmount,
      costDeducted: totalCostDeducted,
      newAmount: newTotalAmount,
      newAveragePrice,
    });

    return {
      success: true,
      productName: stockItem.productName,
      deductedQty: totalQty,
      previousStock: currentStock,
      newStock: newTotalBoxes,
      previousAmount: previousTotalAmount,
      newAmount: newTotalAmount,
      amountDeducted: totalCostDeducted,
      averageUnitPrice: newAveragePrice,
      productExists: true,
    };
  } catch (error) {
    console.error(`❌ Stock deduction error for ${productName}:`, error);
    return {
      success: false,
      message: error.message,
      productExists: false,
    };
  }
};

// ==========================================
// STOCK RESTORE - NO "restore" BATCH PUSHED
// ==========================================
const restoreStockToReportInHand = async (productName, quantity) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const restoredQty = fixPrecision(quantity);
    if (restoredQty <= 0) {
      await session.commitTransaction();
      session.endSession();
      return { success: true, restored: 0 };
    }

    const stockItem = await findStockItemFlexible(productName, session);

    if (stockItem) {
      // Decrease removeStockAdjustment to restore boxes
      const previousRemoveAdj = fixPrecision(
        Number(stockItem.removeStockAdjustment || 0),
      );
      const newRemoveStockAdjustment = fixPrecision(
        Math.max(0, previousRemoveAdj - restoredQty),
      );

      // Recalculate totalBoxesFromBatches
      let totalBoxesFromBatches = 0;
      for (const batch of stockItem.batches) {
        const type = batch.adjustmentType;
        if (!type || type === "batch") {
          totalBoxesFromBatches = fixPrecision(
            totalBoxesFromBatches + (batch.boxes || 0),
          );
        }
      }

      const addStockAdjustment = fixPrecision(
        Number(stockItem.addStockAdjustment || 0),
      );
      const newTotalBoxes = fixPrecision(
        Math.max(
          0,
          totalBoxesFromBatches + addStockAdjustment - newRemoveStockAdjustment,
        ),
      );

      // Recalculate total amount from all real batches
      let newTotalAmount = 0;
      for (const batch of stockItem.batches) {
        const type = batch.adjustmentType;
        if (!type || type === "batch") {
          const boxes = fixPrecision(Number(batch.boxes || 0));
          const lc = fixPrecision(Number(batch.lc || 0));
          const batchAmount = fixPrecision(boxes * lc);
          batch.amount = batchAmount;
          newTotalAmount = fixPrecision(newTotalAmount + batchAmount);
        }
      }

      const newAveragePrice =
        newTotalBoxes > 0 ? fixPrecision(newTotalAmount / newTotalBoxes) : 0;

      // Update stock item
      stockItem.removeStockAdjustment = newRemoveStockAdjustment;
      stockItem.totalAmount = newTotalAmount;
      stockItem.averagePrice = newAveragePrice;

      if (newTotalBoxes > (stockItem.minStockLevel || 10)) {
        stockItem.status = "In Stock";
      } else if (newTotalBoxes > 0) {
        stockItem.status = "Low Stock";
      } else {
        stockItem.status = "Out of Stock";
      }

      stockItem.updatedAt = new Date();
      await stockItem.save({ session });

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        restored: restoredQty,
        newStockLevel: newTotalBoxes,
        oldStockLevel: fixPrecision(newTotalBoxes - restoredQty),
        newAmount: newTotalAmount,
        message: `Successfully restored ${restoredQty} units`,
      };
    } else {
      const newStockItem = new ReportInHand({
        productName: productName,
        supplierName: "System",
        type: "System",
        batches: [
          {
            batchNumber: `NEW-${Date.now()}`,
            boxes: restoredQty,
            lc: 0,
            fob: 0,
            cif: 0,
            amount: 0, // amount will be 0 since lc is 0
            expiryDate: new Date(
              new Date().setFullYear(new Date().getFullYear() + 1),
            ),
            date: new Date(),
            adjustmentType: "batch",
          },
        ],
        totalBoxesFromBatches: restoredQty,
        addStockAdjustment: 0,
        removeStockAdjustment: 0,
        totalAmount: 0, // amount is 0 since lc is 0
        averagePrice: 0,
        status: "In Stock",
        minStockLevel: 10,
      });

      await newStockItem.save({ session });
      await session.commitTransaction();
      await session.endSession();

      return {
        success: true,
        restored: restoredQty,
        createdNew: true,
        newStockLevel: restoredQty,
        message: `Created new stock item with ${restoredQty} units`,
      };
    }
  } catch (error) {
    console.error(`❌ RESTORE STOCK ERROR for ${productName}:`, error);
    try {
      await session.abortTransaction();
    } catch {}
    try {
      await session.endSession();
    } catch {}
    return {
      success: false,
      restored: 0,
      message: `Failed to restore stock: ${error.message}`,
      error: error.message,
    };
  }
};

// ==========================================
// MR VALIDATION
// ==========================================
const validateMR = async (mrName, session = null) => {
  try {
    if (!mrName || mrName.trim() === "") {
      return {
        success: false,
        message: "MR name is required",
        exists: false,
      };
    }

    const cleanedMrName = mrName.trim();

    if (cleanedMrName.toLowerCase() === "unknown") {
      return {
        success: true,
        message: `MR "Unknown" is allowed`,
        exists: true,
        isUnknown: true,
        mrData: {
          mrName: cleanedMrName,
          mrId: null,
        },
      };
    }

    const query = Staff.findOne({
      medicalRepNameLower: cleanedMrName.toLowerCase(),
    });

    if (session) {
      query.session(session);
    }

    const mr = await query;

    if (!mr) {
      return {
        success: false,
        message: `MR "${cleanedMrName}" not found in Staff system`,
        exists: false,
      };
    }

    return {
      success: true,
      message: `MR "${cleanedMrName}" found`,
      exists: true,
      mrData: {
        mrName: mr.medicalRepName,
        mrId: mr._id,
      },
    };
  } catch (error) {
    console.error(`Error validating MR "${mrName}":`, error);
    return {
      success: false,
      message: `Error validating MR: ${error.message}`,
      exists: false,
    };
  }
};

// ==========================================
// STOCK VALIDATION FOR IMPORT
// ==========================================
const validateStockForImport = async (invoices) => {
  try {
    const stockIssues = [];
    const productStockMap = new Map();

    for (const invoice of invoices) {
      for (const product of invoice.products) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const requiredQty = fixPrecision(salesQty + bonusQty);

        if (requiredQty > 0 && productName) {
          if (!productStockMap.has(productName)) {
            productStockMap.set(productName, {
              productName,
              totalRequired: 0,
              requiredByInvoices: [],
              checked: false,
              productExists: false,
              availableStock: 0,
            });
          }
          const productData = productStockMap.get(productName);
          productData.totalRequired = fixPrecision(
            productData.totalRequired + requiredQty,
          );
          productData.requiredByInvoices.push({
            invoiceNumber: invoice.invoiceNumber,
            requiredQty: requiredQty,
            salesQty: salesQty,
            bonusQty: bonusQty,
            customerName: invoice.customerName,
          });
        }
      }
    }

    for (const [productName, productData] of productStockMap.entries()) {
      if (!productData.checked) {
        try {
          const stockCheck = await calculateProductStock(
            productName,
            productData.totalRequired,
          );

          productData.availableStock = stockCheck.availableStock;
          productData.insufficient = stockCheck.insufficient;
          productData.insufficientQty = stockCheck.insufficientQty;
          productData.productExists = stockCheck.found;
          productData.stockCheckSuccess = stockCheck.success;

          if (stockCheck.insufficient || !stockCheck.found) {
            stockIssues.push({
              productName,
              totalRequired: productData.totalRequired,
              availableStock: stockCheck.availableStock,
              insufficientQty: stockCheck.insufficientQty || 0,
              requiredByInvoices: productData.requiredByInvoices,
              invoiceCount: productData.requiredByInvoices.length,
              message: stockCheck.message,
              productExists: stockCheck.found,
              insufficient: stockCheck.insufficient,
              type: !stockCheck.found
                ? "missing_product"
                : "insufficient_stock",
            });
          }

          productData.checked = true;
        } catch (error) {
          console.error(`❌ Error checking stock for ${productName}:`, error);
          stockIssues.push({
            productName,
            totalRequired: productData.totalRequired,
            availableStock: 0,
            insufficientQty: productData.totalRequired,
            requiredByInvoices: productData.requiredByInvoices,
            invoiceCount: productData.requiredByInvoices.length,
            message: `Could not verify stock: ${error.message}`,
            productExists: false,
            insufficient: false,
            type: "verification_error",
          });
          productData.checked = true;
        }
      }
    }

    const insufficientCount = stockIssues.filter(
      (issue) => issue.productExists && issue.insufficient,
    ).length;

    const missingCount = stockIssues.filter(
      (issue) => !issue.productExists,
    ).length;

    const totalRequired = Array.from(productStockMap.values()).reduce(
      (sum, p) => fixPrecision(sum + (p.totalRequired || 0)),
      0,
    );

    const totalAvailable = Array.from(productStockMap.values()).reduce(
      (sum, p) => fixPrecision(sum + (p.availableStock || 0)),
      0,
    );

    const summary = {
      totalProducts: productStockMap.size,
      totalRequired,
      totalAvailable,
      totalInsufficient: insufficientCount,
      missingProducts: missingCount,
      lowStockProducts: insufficientCount,
      hasCriticalIssues: stockIssues.some(
        (issue) => issue.type === "verification_error",
      ),
      hasInsufficientStock: insufficientCount > 0,
      importBlocked: insufficientCount > 0,
    };

    return {
      stockIssues,
      totalInvoices: invoices.length,
      summary,
      insufficientStockIssues: stockIssues.filter(
        (issue) => issue.productExists && issue.insufficient,
      ),
      missingProductIssues: stockIssues.filter((issue) => !issue.productExists),
      importBlocked: insufficientCount > 0,
      blockReason:
        insufficientCount > 0
          ? "INSUFFICIENT_STOCK"
          : missingCount > 0
            ? "MISSING_PRODUCTS_ONLY"
            : "NO_ISSUES",
      message:
        insufficientCount > 0
          ? `${insufficientCount} product(s) have insufficient stock. Total shortage: ${stockIssues.reduce((sum, i) => sum + (i.insufficientQty || 0), 0)} units. Please update inventory.`
          : missingCount > 0
            ? `${missingCount} product(s) not found. They will be created during import.`
            : "All products have sufficient stock.",
    };
  } catch (error) {
    console.error("❌ Error validating stock for import:", error);
    return {
      stockIssues: [],
      totalInvoices: invoices.length,
      summary: {
        totalProducts: 0,
        totalRequired: 0,
        totalAvailable: 0,
        totalInsufficient: 0,
        missingProducts: 0,
        lowStockProducts: 0,
        hasCriticalIssues: true,
        hasInsufficientStock: false,
        importBlocked: true,
      },
      insufficientStockIssues: [],
      missingProductIssues: [],
      importBlocked: true,
      blockReason: "VALIDATION_ERROR",
      message: `Stock validation failed: ${error.message}`,
    };
  }
};

// ==========================================
// MR STOCK HELPERS
// ==========================================
const checkMRStock = async (
  mrName,
  productName,
  requiredQty,
  session = null,
) => {
  try {
    const mrValidation = await validateMR(mrName, session);
    if (!mrValidation.success) {
      return {
        success: false,
        found: false,
        message: mrValidation.message,
        productExists: false,
      };
    }
    const mrId = mrValidation.mrData.mrId;

    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");
    const mrStock = await stockinmrhands.findOne(
      { mrId: new mongoose.Types.ObjectId(mrId) },
      { session },
    );

    if (!mrStock) {
      return {
        success: false,
        found: false,
        message: `MR stock not found for ${mrName}`,
        productExists: false,
      };
    }

    const product = mrStock.productsInHand.find(
      (p) =>
        p.productName.toLowerCase().trim() === productName.toLowerCase().trim(),
    );

    if (!product) {
      return {
        success: false,
        found: false,
        message: `Product "${productName}" not found in ${mrName}'s stock`,
        productExists: false,
      };
    }

    const availableStock = fixPrecision(product.quantity || 0);
    const hasEnough = availableStock >= requiredQty;
    const shortage = hasEnough ? 0 : fixPrecision(requiredQty - availableStock);

    return {
      success: true,
      found: true,
      availableStock,
      requiredQty,
      hasEnough,
      shortage,
      insufficient: !hasEnough,
      message: hasEnough
        ? `✅ Stock available in ${mrName}'s hand: ${availableStock} units`
        : `❌ Insufficient MR stock: Required ${requiredQty}, Available ${availableStock}, Short by ${shortage}`,
      productExists: true,
      mrId,
      mrName,
      lc: product.lc || 0,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      message: `Error checking MR stock: ${error.message}`,
      productExists: false,
    };
  }
};

// ==========================================
// CORRECTED MR STOCK DEDUCTION - KEEPS PRODUCTS WITH ZERO QUANTITY
// ==========================================
const deductStockFromMRHand = async (
  mrId,
  productName,
  salesQty,
  bonusQty,
  session,
) => {
  console.log(`\n🔧 Starting MR stock deduction process...`);
  console.log(`📦 Input parameters:`, {
    mrId,
    productName,
    salesQty,
    bonusQty,
    session: !!session,
  });

  try {
    const totalQty = fixPrecision(
      (parseFloat(salesQty) || 0) + (parseFloat(bonusQty) || 0),
    );
    if (totalQty <= 0) {
      return { success: true, deductedQty: 0, skipped: true };
    }

    if (!mongoose.connection || !mongoose.connection.db) {
      return { success: false, message: `Database connection not available` };
    }

    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");
    let mrStock;
    try {
      mrStock = await stockinmrhands.findOne(
        { mrId: new mongoose.Types.ObjectId(mrId) },
        { session },
      );
    } catch (err) {
      return {
        success: false,
        message: `Failed to query MR stock: ${err.message}`,
      };
    }

    if (!mrStock) {
      return {
        success: false,
        message: `MR stock not found for MR ID: ${mrId}. Please ensure MR has stock.`,
      };
    }

    const normalizedSearchName = productName?.toLowerCase().trim() || "";
    const productsInHand = mrStock.productsInHand || [];

    const productIndex = productsInHand.findIndex((p) => {
      if (!p || !p.productName) return false;
      return p.productName.toLowerCase().trim() === normalizedSearchName;
    });

    if (productIndex === -1) {
      return {
        success: false,
        message: `Product "${productName}" not found in ${mrStock.mrName || "MR"}'s stock. Available products: ${productsInHand.map((p) => p.productName).join(", ")}`,
      };
    }

    const product = mrStock.productsInHand[productIndex];
    const currentQty = fixPrecision(Number(product.quantity) || 0);
    if (currentQty < totalQty) {
      const shortage = fixPrecision(totalQty - currentQty);
      return {
        success: false,
        message: `Insufficient MR stock for ${productName}. MR: ${mrStock.mrName || "Unknown"}, Available: ${currentQty}, Required: ${totalQty}, Short by: ${shortage}`,
        shortage,
      };
    }

    const newQuantity = fixPrecision(currentQty - totalQty);

    // Update the product quantity - always update, don't remove even if quantity becomes zero
    await stockinmrhands.updateOne(
      {
        mrId: new mongoose.Types.ObjectId(mrId),
        "productsInHand.productName": product.productName,
      },
      {
        $set: {
          "productsInHand.$.quantity": newQuantity,
          "productsInHand.$.lastUpdated": new Date(),
          updatedAt: new Date(),
        },
      },
      { session },
    );

    // REMOVED: The code that pulls/removes the product when quantity becomes zero
    // We want to keep the product entry even with zero quantity
    // The product will remain in the array with quantity: 0

    return {
      success: true,
      deductedQty: totalQty,
      mrName: mrStock.mrName || "Unknown MR",
      productName: product.productName,
      previousStock: currentQty,
      newStock: newQuantity,
      lc: product.lc || 0,
      amountDeducted: fixPrecision(totalQty * (product.lc || 0)),
    };
  } catch (error) {
    console.error(`❌ Error in deductStockFromMRHand:`, error);
    return { success: false, message: error.message };
  }
};

// ==========================================
// ROUTES
// ==========================================

// ── ONE-TIME FIX: Recalculate all totalAmounts using real batch boxes × lc ───
// Run POST /api/sales/fix-stock-amounts ONCE to correct inflated values
router.post("/fix-stock-amounts", protect, allowAdminOnly, async (req, res) => {
  try {
    const allStock = await ReportInHand.find({});
    const results = [];

    for (const stockItem of allStock) {
      try {
        // Sum only real batches (exclude "remove", "restore", any audit type)
        let correctTotalAmount = 0;
        let correctTotalBoxes = 0;

        for (const batch of stockItem.batches || []) {
          const type = batch.adjustmentType;
          // SKIP "remove" batches like { boxes:100, lc:0, adjustmentType:"remove" }
          if (!type || type === "batch") {
            const boxes = fixPrecision(Number(batch.boxes || 0));
            const lc = fixPrecision(Number(batch.lc || 0));
            if (boxes > 0) {
              correctTotalAmount = fixPrecision(
                correctTotalAmount + boxes * lc,
              );
              correctTotalBoxes = fixPrecision(correctTotalBoxes + boxes);
            }
          }
        }

        const oldAmount = stockItem.totalAmount;
        const changed = Math.abs(correctTotalAmount - oldAmount) > 0.01;

        if (changed) {
          stockItem.totalAmount = correctTotalAmount;
          stockItem.averagePrice =
            correctTotalBoxes > 0
              ? fixPrecision(correctTotalAmount / correctTotalBoxes)
              : 0;
          await stockItem.save();
        }

        results.push({
          productName: stockItem.productName,
          oldAmount,
          newAmount: correctTotalAmount,
          totalBoxes: stockItem.totalBoxes,
          fixed: changed,
        });
      } catch (err) {
        results.push({
          productName: stockItem.productName,
          error: err.message,
          fixed: false,
        });
      }
    }

    const fixedCount = results.filter((r) => r.fixed).length;

    res.json({
      success: true,
      message: `Fixed ${fixedCount} of ${results.length} stock records`,
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fix stock amounts",
      error: error.message,
    });
  }
});

router.post("/mrcash/sync-from-sales", async (req, res) => {
  try {
    const salesByMR = await SaleSummary.aggregate([
      {
        $match: {
          mrName: { $exists: true, $ne: null, $ne: "" },
          paidAmount: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$mrName",
          totalPaidAmount: { $sum: "$paidAmount" },
          invoiceCount: { $sum: 1 },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              paidAmount: "$paidAmount",
            },
          },
        },
      },
    ]);
    const results = [];

    for (const mrData of salesByMR) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const mrName = mrData._id;
        const totalCash = fixPrecision(mrData.totalPaidAmount);
        const mr = await Staff.findOne({
          medicalRepName: { $regex: `^${mrName.trim()}$`, $options: "i" },
        }).session(session);

        if (!mr) {
          console.warn(`⚠️ MR not found in Staff: ${mrName}`);
          await session.abortTransaction();
          session.endSession();
          results.push({
            mrName,
            success: false,
            error: "MR not found in Staff collection",
          });
          continue;
        }

        let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);

        if (!mrCash) {
          mrCash = new MRCash({
            mrId: mr._id,
            mrName: mr.medicalRepName,
            currentCash: totalCash,
            cashTransferredToAdmin: 0,
            lastTransferDate: null,
            notes: `Synced from ${mrData.invoiceCount} sales. Total: ${totalCash}`,
            isActive: true,
          });
        } else {
          const previousCash = mrCash.currentCash;
          mrCash.currentCash = totalCash;
          mrCash.notes = `Synced from ${mrData.invoiceCount} sales. Total: ${totalCash} (Previous: ${previousCash})`;
          mrCash.updatedAt = new Date();
        }

        await mrCash.save({ session });
        await session.commitTransaction();
        session.endSession();

        results.push({
          mrName: mr.medicalRepName,
          success: true,
          totalCash,
          invoiceCount: mrData.invoiceCount,
          action: mrCash.isNew ? "created" : "updated",
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        results.push({
          mrName: mrData._id,
          success: false,
          error: error.message,
        });
        console.error(`❌ Error syncing ${mrData._id}:`, error.message);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    return res.json({
      success: true,
      message: "MR Cash synchronization completed",
      results,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error("❌ Critical error in MR Cash sync:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to synchronize MR Cash",
      error: error.message,
    });
  }
});

router.get("/mrcash/summary", async (req, res) => {
  try {
    const mrCashes = await MRCash.find({ isActive: true })
      .sort({ currentCash: -1 })
      .lean();

    const totalCash = mrCashes.reduce(
      (sum, mr) => sum + (mr.currentCash || 0),
      0,
    );

    res.json({
      success: true,
      summary: {
        totalMRs: mrCashes.length,
        totalCash: fixPrecision(totalCash),
        mrCashes: mrCashes.map((mr) => ({
          mrName: mr.mrName,
          currentCash: fixPrecision(mr.currentCash || 0),
          lastUpdated: mr.updatedAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR Cash summary",
      error: error.message,
    });
  }
});

router.post("/check-stock", async (req, res) => {
  try {
    const { productName, requiredQty, salesQty, bonusQty } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    let totalQty = parseFloat(requiredQty) || 0;
    if (totalQty === 0 && (salesQty !== undefined || bonusQty !== undefined)) {
      totalQty = (parseFloat(salesQty) || 0) + (parseFloat(bonusQty) || 0);
    }

    const result = await calculateProductStock(productName, totalQty);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to check stock",
      error: error.message,
    });
  }
});

router.post("/validate-import-stock", async (req, res) => {
  try {
    const { invoices, isMrSaleImport = false } = req.body;

    if (!invoices || !Array.isArray(invoices)) {
      return res.status(400).json({
        success: false,
        message: "Invoices array is required",
      });
    }

    if (isMrSaleImport) {
      return res.json({
        success: true,
        validationResult: {
          stockIssues: [],
          totalInvoices: invoices.length,
          summary: {
            totalProducts: 0,
            totalRequired: 0,
            totalAvailable: 0,
            totalInsufficient: 0,
            missingProducts: 0,
            lowStockProducts: 0,
            hasCriticalIssues: false,
            hasInsufficientStock: false,
            importBlocked: false,
          },
          insufficientStockIssues: [],
          missingProductIssues: [],
          importBlocked: false,
          blockReason: "NO_ISSUES",
          message:
            "MR sale import - stock validated from MR hands, not warehouse.",
        },
      });
    }

    const validationResult = await validateStockForImport(invoices);
    res.json({ success: true, validationResult });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to validate import stock",
      error: error.message,
    });
  }
});

router.get("/debug/stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res
        .status(400)
        .json({ success: false, message: "Product name is required" });
    }

    const stockItem = await findStockItemFlexible(productName);

    if (!stockItem) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found in ReportInHand`,
      });
    }

    // Real batches only (exclude "remove" and other audit types)
    const realBatches = getRealBatches(stockItem.batches || []);
    const auditBatches = (stockItem.batches || []).filter(
      (batch) => batch.adjustmentType && batch.adjustmentType !== "batch",
    );

    const batchTotal = realBatches.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0,
    );

    res.json({
      success: true,
      productName: stockItem.productName,
      stockData: {
        totalBoxes: stockItem.totalBoxes,
        totalBoxesFromBatches: stockItem.totalBoxesFromBatches,
        addStockAdjustment: stockItem.addStockAdjustment,
        removeStockAdjustment: stockItem.removeStockAdjustment,
        calculatedStock:
          stockItem.totalBoxesFromBatches +
          (stockItem.addStockAdjustment || 0) -
          (stockItem.removeStockAdjustment || 0),
        totalAmount: stockItem.totalAmount,
        averagePrice: stockItem.averagePrice,
      },
      batches: {
        totalBatches: stockItem.batches?.length || 0,
        realBatches: realBatches.length,
        auditBatches: auditBatches.length,
        batchTotal,
        batchDetails: realBatches.map((batch) => ({
          batchNumber: batch.batchNumber,
          boxes: batch.boxes,
          lc: batch.lc,
          expiryDate: batch.expiryDate,
          date: batch.date,
        })),
        auditDetails: auditBatches.map((batch) => ({
          batchNumber: batch.batchNumber,
          boxes: batch.boxes,
          adjustmentType: batch.adjustmentType,
          date: batch.date,
          note: "EXCLUDED from stock calculations",
        })),
      },
      status: stockItem.status,
      lastUpdated: stockItem.updatedAt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to debug stock",
      error: error.message,
    });
  }
});

const cleanupStaleImportSessions = () => {
  const now = Date.now();
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000;

  for (const [sessionId, progress] of importProgressMap.entries()) {
    if (progress.completed && now - progress.endTime > STALE_THRESHOLD) {
      importProgressMap.delete(sessionId);
    }
  }
};

setInterval(cleanupStaleImportSessions, 60 * 60 * 1000);

router.get("/import/progress/:sessionId", (req, res) => {
  try {
    const progress = importProgressMap.get(req.params.sessionId);
    if (!progress) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    res.json({
      success: true,
      progress: {
        percentage: progress.progressPercentage || 0,
        processed: progress.processedInvoices || 0,
        total: progress.totalInvoices || 0,
        successful: progress.successful || 0,
        failed: progress.failed || 0,
        duplicateProductsSkipped: progress.duplicateProductsSkipped || 0,
        completed: progress.completed || false,
        status: progress.status,
        errors: progress.errors || [],
        totalCostAmount: progress.totalCostAmount || 0,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch progress" });
  }
});

router.post("/validate-mr", async (req, res) => {
  try {
    const { mrNames } = req.body;

    if (!mrNames || !Array.isArray(mrNames)) {
      return res
        .status(400)
        .json({ success: false, message: "MR names array required" });
    }

    const results = await Promise.all(
      mrNames.map(async (mrName) => {
        const validation = await validateMR(mrName);
        return {
          mrName,
          valid: validation.success,
          exists: validation.exists,
          message: validation.message,
        };
      }),
    );

    const invalidMRs = results.filter((r) => !r.valid);

    res.json({
      success: invalidMRs.length === 0,
      results,
      invalidMRs,
      message:
        invalidMRs.length > 0
          ? `${invalidMRs.length} invalid MR(s) found`
          : "All MRs valid",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Validation failed",
      error: error.message,
    });
  }
});

router.post("/validate-import-mrs", async (req, res) => {
  try {
    const { invoices } = req.body;

    if (!invoices || !Array.isArray(invoices)) {
      return res
        .status(400)
        .json({ success: false, message: "Invoices array is required" });
    }

    const mrNamesSet = new Set();
    const mrToInvoices = new Map();

    for (const invoice of invoices) {
      if (invoice.mrName && invoice.mrName.trim()) {
        const mrName = invoice.mrName.trim();
        const mrNameLower = mrName.toLowerCase();

        if (!mrNamesSet.has(mrNameLower)) {
          mrNamesSet.add(mrNameLower);
          mrToInvoices.set(mrNameLower, { originalName: mrName, invoices: [] });
        }

        mrToInvoices.get(mrNameLower).invoices.push({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          products: invoice.products?.length || 0,
        });
      }
    }

    if (mrNamesSet.size === 0) {
      return res.json({
        success: true,
        mrIssues: [],
        totalInvoices: invoices.length,
        summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
        importBlocked: false,
      });
    }

    const mrIssues = [];
    let validCount = 0;

    for (const mrNameLower of mrNamesSet) {
      const mrData = mrToInvoices.get(mrNameLower);

      if (mrNameLower === "unknown") {
        validCount++;
        continue;
      }

      const validation = await validateMR(mrData.originalName);

      if (!validation.success) {
        mrIssues.push({
          mrName: mrData.originalName,
          message: validation.message,
          affectedInvoices: mrData.invoices,
          affectedCount: mrData.invoices.length,
        });
      } else {
        validCount++;
      }
    }

    const validationResult = {
      mrIssues,
      totalInvoices: invoices.length,
      summary: {
        totalMRs: mrNamesSet.size,
        validMRs: validCount,
        invalidMRs: mrIssues.length,
      },
      importBlocked: mrIssues.length > 0,
      blockReason: mrIssues.length > 0 ? "INVALID_MRS" : "NO_ISSUES",
      message:
        mrIssues.length > 0
          ? `${mrIssues.length} MRs not found in Staff system. Please add them first.`
          : "All MRs are valid.",
    };

    res.json({ success: true, validationResult });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to validate MRs",
      error: error.message,
    });
  }
});

router.get("/debug/customer/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const result = await getCustomerByCode(code);
    res.json({ success: true, code, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/import-with-stock-deduction", async (req, res) => {
  let sessionId = null;
  try {
    const { invoices, bypassStockCheck = false } = req.body;

    const invoiceData = (Array.isArray(invoices) ? invoices : []).map(
      (inv) => ({
        ...inv,
        customerName: inv.customerName || "Unknown",
      }),
    );

    if (!invoiceData.length) {
      return res
        .status(400)
        .json({ success: false, message: "No invoices provided" });
    }

    if (isImportInProgress) {
      return res.status(429).json({
        success: false,
        message: "Another import in progress",
        retryAfter: 30,
      });
    }

    isImportInProgress = true;

    sessionId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    importProgressMap.set(sessionId, {
      sessionId,
      totalInvoices: invoiceData.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      duplicateProductsSkipped: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
      status: "initializing",
      totalMRCashAdded: 0,
      totalCostAmount: 0,
      bypassStockCheck: bypassStockCheck || false,
    });

    processImportWithStockDeduction(sessionId, invoiceData, bypassStockCheck)
      .catch((error) => {
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          progress.status = "failed";
          progress.errors.push({
            message: "Import failed",
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      })
      .finally(() => {
        isImportInProgress = false;
      });

    res.json({
      success: true,
      message: "Import started",
      sessionId,
      totalInvoices: invoiceData.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      bypassStockCheck: bypassStockCheck || false,
    });
  } catch (error) {
    if (sessionId) importProgressMap.delete(sessionId);
    isImportInProgress = false;
    res
      .status(500)
      .json({ success: false, message: "Import failed", error: error.message });
  }
});

const areInvoicesExactlySame = (invoice1, invoice2) => {
  if (invoice1.invoiceNumber !== invoice2.invoiceNumber) return false;
  if (!invoice1.products || !invoice2.products) return false;
  if (invoice1.products.length !== invoice2.products.length) return false;

  const sortProducts = (products) =>
    products.slice().sort((a, b) => a.productName.localeCompare(b.productName));

  const products1 = sortProducts(invoice1.products);
  const products2 = sortProducts(invoice2.products);

  for (let i = 0; i < products1.length; i++) {
    const p1 = products1[i];
    const p2 = products2[i];
    if (p1.productName !== p2.productName) return false;
    if (fixPrecision(p1.salesQty) !== fixPrecision(p2.salesQty)) return false;
    if (fixPrecision(p1.bonusQty) !== fixPrecision(p2.bonusQty)) return false;
    if (fixPrecision(p1.sellingPrice) !== fixPrecision(p2.sellingPrice))
      return false;
    if (fixPrecision(p1.discount) !== fixPrecision(p2.discount)) return false;
  }

  if (invoice1.customerCode !== invoice2.customerCode) return false;
  if (fixPrecision(invoice1.paidAmount) !== fixPrecision(invoice2.paidAmount))
    return false;

  return true;
};

const processSingleInvoiceWithMRDistribution = async (
  invoiceData,
  index,
  skipDuplicates = true,
  bypassStockCheck = false,
  isImport = false,
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      const mergeCheck = shouldMergeInvoices(existingInvoice, invoiceData);

      if (mergeCheck.isExactDuplicate && skipDuplicates) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          skipped: true,
          isExactDuplicate: true,
          error: {
            row: index + 2,
            invoiceNumber: invoiceData.invoiceNumber,
            message: `Exact duplicate invoice ${invoiceData.invoiceNumber} skipped`,
            type: "duplicate_skipped",
          },
        };
      } else if (mergeCheck.shouldMerge) {
        const mergeResult = await mergeInvoiceProducts(
          existingInvoice,
          invoiceData,
          session,
        );

        if (mergeResult.success) {
          await session.commitTransaction();
          await session.endSession();

          return {
            success: true,
            invoiceNumber: invoiceData.invoiceNumber,
            action: "merged",
            addedProducts: mergeResult.addedProducts,
            paidAmount: mergeResult.addedPaidAmount,
            mrCashUpdates: {
              [existingInvoice.mrName]: mergeResult.addedPaidAmount,
            },
            costAmount: mergeResult.newCostAmount || 0,
          };
        } else {
          throw new Error(`Failed to merge invoice: ${mergeResult.error}`);
        }
      } else {
        throw new Error(
          `Invoice number ${invoiceData.invoiceNumber} already exists but cannot be merged: ${mergeCheck.reason || "Incompatible data"}`,
        );
      }
    }

    let customerName = invoiceData.customerName || "Unknown";
    let customerId = invoiceData.customerId || null;
    let customerCode = invoiceData.customerCode || "";

    if (customerCode && customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(customerCode, session);
      if (customerResult.success) {
        customerName = customerResult.customer.customerName;
        customerId = customerResult.customer.customerId;
        customerCode = customerResult.customer.customerCode;
      }
    }

    const productToMrMap = new Map();
    const invoiceHeaderMR = invoiceData.mrName?.trim();

    if (invoiceData._mrDistribution && invoiceData._mrDistribution.size > 0) {
      for (const [mrName, mrData] of invoiceData._mrDistribution.entries()) {
        for (const prod of mrData.products) {
          const prodName = prod.productName?.trim();
          if (prodName && !productToMrMap.has(prodName)) {
            productToMrMap.set(prodName, mrName);
          }
        }
      }
    } else if (invoiceHeaderMR && invoiceData.isMrSaleImport) {
      for (const prod of invoiceData.products || []) {
        const prodName = prod.productName?.trim();
        if (prodName) {
          productToMrMap.set(prodName, invoiceHeaderMR);
        }
      }
    }

    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    let totalCostAmount = 0;
    const stockDeductionResults = [];
    const mrCashDistribution = new Map();

    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      const sellingPrice = fixPrecision(parseFloat(product.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(product.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);

      const productMrName = productToMrMap.get(productName);

      const isMRSale =
        (!isImport || invoiceData.isMrSaleImport) &&
        productMrName &&
        productMrName.toLowerCase() !== "unknown";

      let lc = 0;
      let profitLoss = 0;

      if (isMRSale) {
        const mrValidation = await validateMR(productMrName, session);
        if (!mrValidation.success) {
          throw new Error(
            `Invalid MR "${productMrName}" for product ${productName}: ${mrValidation.message}`,
          );
        }
        const mrId = mrValidation.mrData.mrId;

        const mrStockCheck = await checkMRStock(
          productMrName,
          productName,
          totalQty,
          session,
        );
        if (!mrStockCheck.success || mrStockCheck.insufficient) {
          if (bypassStockCheck) {
            lc = product.lc || 0;
          } else {
            throw new Error(
              mrStockCheck.message ||
                `Insufficient MR stock for ${productName} in ${productMrName}'s hand. Required: ${totalQty}`,
            );
          }
        }

        if (!bypassStockCheck) {
          const deductionResult = await deductStockFromMRHand(
            mrId,
            productName,
            salesQty,
            bonusQty,
            session,
          );

          if (!deductionResult.success) {
            throw new Error(
              `MR stock deduction failed for ${productName}: ${deductionResult.message}`,
            );
          }

          // Capture the amount deducted (cost value)
          const amountDeducted = deductionResult.amountDeducted || 0;
          totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

          stockDeductionResults.push({
            product: productName,
            mrId,
            mrName: productMrName,
            ...deductionResult,
            amountDeducted,
          });

          lc = deductionResult.lc;
        } else {
          lc = product.lc || 0;
        }

        profitLoss = fixPrecision((sellingPrice - lc) * salesQty);
      } else {
        const stockItem = await findStockItemFlexible(productName, session);
        if (!stockItem) {
          if (bypassStockCheck) {
            const productRecord = await findProductRecordFlexible(
              productName,
              session,
            );
            lc = productRecord?.lc || 0;
          } else {
            throw new Error(`Product "${productName}" not found in inventory`);
          }
        } else {
          const currentAvailableStock = fixPrecision(
            Number(stockItem.totalBoxes || 0),
          );
          if (currentAvailableStock < totalQty) {
            if (bypassStockCheck) {
              // skip
            } else {
              const shortage = fixPrecision(totalQty - currentAvailableStock);
              throw new Error(
                `Insufficient stock for ${productName}. ` +
                  `Required: ${totalQty}, Available: ${currentAvailableStock}, ` +
                  `Short by: ${shortage}`,
              );
            }
          }

          const productRecord = await findProductRecordFlexible(
            productName,
            session,
          );
          lc = productRecord?.lc || 0;
        }

        profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

        if (!bypassStockCheck && stockItem) {
          const deductionResult = await deductStockFromReportInHand(
            productName,
            salesQty,
            bonusQty,
            invoiceData.invoiceNumber,
            session,
          );

          // Capture the amount deducted (cost value)
          const amountDeducted = deductionResult.amountDeducted || 0;
          totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

          stockDeductionResults.push({
            product: productName,
            ...deductionResult,
            amountDeducted,
          });

          if (!deductionResult.success) {
            throw new Error(
              `Stock deduction failed for ${productName}: ${deductionResult.message}`,
            );
          }
        }
      }

      const productEntry = {
        productName,
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty
          ? fixPrecision(netSellingAmount / totalQty)
          : 0,
        lc,
        profitLoss,
        isProductAccept: true,
      };

      if (isMRSale) {
        const mrValidation = await validateMR(productMrName, session);
        productEntry.mrId = mrValidation.mrData.mrId;
        productEntry.mrName = productMrName;
      }

      processedProducts.push(productEntry);

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);

      const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
      if (paymentStatus === "Cash") {
        const mrForCash = isMRSale
          ? productMrName
          : invoiceData.mrName || "Unknown";
        mrCashDistribution.set(
          mrForCash,
          fixPrecision(
            (mrCashDistribution.get(mrForCash) || 0) + netSellingAmount,
          ),
        );
      }
    }

    if (processedProducts.length === 0) {
      throw new Error("No valid products found in invoice");
    }

    const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
    let paidAmount = 0;

    if (paymentStatus === "Cash") {
      paidAmount = totalAmount;
    } else if (paymentStatus === "Partial Paid") {
      paidAmount = fixPrecision(parseFloat(invoiceData.paidAmount) || 0);
    } else {
      paidAmount = 0;
    }

    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    let primaryMR = invoiceData.mrName?.trim() || "No MR Name Provided";
    if (invoiceData._mrDistribution && invoiceData._mrDistribution.size > 0) {
      primaryMR = Array.from(invoiceData._mrDistribution.keys())[0];
    }

    const saleRecord = new SaleSummary({
      recordingDate: invoiceData.recordingDate
        ? new Date(invoiceData.recordingDate)
        : new Date(),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: primaryMR,
      mrId: invoiceData.mrId || null,
      customerName,
      customerCode,
      customerId,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: fixPrecision(totalProfitLoss),
      costAmount: fixPrecision(totalCostAmount),
      paymentStatus,
      // 🆕 Set saleType based on import flag
      saleType: invoiceData.isMrSaleImport ? "MR Sale" : "Normal Sale",
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
      bypassStockCheck,
    });

    await saleRecord.save({ session });

    const mrCashUpdates = {};

    if (paidAmount > 0 && paymentStatus === "Cash") {
      for (const [mrName, mrAmount] of mrCashDistribution) {
        if (mrName && mrName.trim() && mrAmount > 0) {
          const mrCashUpdate = await updateMRCashes(
            mrName.trim(),
            mrAmount,
            invoiceData.invoiceNumber,
            invoiceData.invoiceDate || new Date(),
            session,
            false,
          );

          if (mrCashUpdate.success) {
            mrCashUpdates[mrName] = mrAmount;
          } else if (!mrCashUpdate.skipped) {
            console.error(
              `⚠️ Failed to update MR Cash for ${mrName}: ${mrCashUpdate.error}`,
            );
          }
        }
      }
    }

    await session.commitTransaction();
    await session.endSession();

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
      paidAmount,
      action: "created",
      mrCashUpdates,
      bypassStockCheck,
      costAmount: fixPrecision(totalCostAmount),
      totalAmount,
    };
  } catch (error) {
    console.error(
      `❌ ERROR - Invoice ${invoiceData.invoiceNumber}:`,
      error.message,
    );

    try {
      if (session.transaction?.isActive) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error("Error aborting transaction:", abortError);
    }

    try {
      await session.endSession();
    } catch (endError) {
      console.error("Error ending session:", endError);
    }

    return {
      success: false,
      error: {
        row: index + 2,
        invoiceNumber: invoiceData.invoiceNumber || "Unknown",
        message: error.message,
        type: "processing_error",
        bypassStockCheck,
      },
    };
  }
};

const processImportWithStockDeduction = async (
  sessionId,
  invoices,
  skipDuplicates = true,
  bypassStockCheck = false,
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  let mergedInvoices = 0;
  let totalMRCashAdded = 0;
  let totalCostAmount = 0;

  progress.status = "processing";
  progress.startTime = Date.now();
  progress.lastUpdated = Date.now();

  try {
    const groupedInvoices = new Map();

    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const invoiceNumber = invoice.invoiceNumber?.trim();

      if (!invoiceNumber) {
        errors.push({
          row: i + 2,
          invoiceNumber: "Unknown",
          customerName: invoice.customerName || "N/A",
          customerCode: invoice.customerCode || "",
          message: "Invoice number is required",
          type: "validation_error",
        });
        failed++;
        continue;
      }

      if (invoice.mrName && invoice.mrName.trim()) {
        const mrValidation = await validateMR(invoice.mrName.trim());
        if (!mrValidation.success) {
          errors.push({
            row: i + 2,
            invoiceNumber,
            mrName: invoice.mrName,
            customerName: invoice.customerName || "N/A",
            customerCode: invoice.customerCode || "",
            message: `MR not found in Staff: ${mrValidation.message}`,
            type: "mr_validation_error",
          });
          failed++;
          continue;
        }
      }

      if (!groupedInvoices.has(invoiceNumber)) {
        groupedInvoices.set(invoiceNumber, {
          ...invoice,
          products: invoice.products || [],
          _rowIndex: i,
          _mrDistribution: new Map(),
        });

        const mrName = invoice.mrName?.trim() || "No MR Name Provided";
        if (invoice.products && invoice.products.length > 0) {
          groupedInvoices.get(invoiceNumber)._mrDistribution.set(mrName, {
            products: [...invoice.products],
            mrName,
          });
        }
      } else {
        const existing = groupedInvoices.get(invoiceNumber);
        const newMrName = invoice.mrName?.trim() || "No MR Name Provided";

        if (invoice.products && invoice.products.length > 0) {
          for (const newProduct of invoice.products) {
            const productName = newProduct.productName?.trim();
            const salesQty = fixPrecision(parseFloat(newProduct.salesQty) || 0);
            const bonusQty = fixPrecision(parseFloat(newProduct.bonusQty) || 0);
            const sellingPrice = fixPrecision(
              parseFloat(newProduct.sellingPrice) || 0,
            );
            const discount = fixPrecision(parseFloat(newProduct.discount) || 0);

            const isDuplicate = existing.products.some((existingProduct) => {
              const existingProductName = existingProduct.productName?.trim();
              const existingSalesQty = fixPrecision(
                parseFloat(existingProduct.salesQty) || 0,
              );
              const existingBonusQty = fixPrecision(
                parseFloat(existingProduct.bonusQty) || 0,
              );
              const existingSellingPrice = fixPrecision(
                parseFloat(existingProduct.sellingPrice) || 0,
              );
              const existingDiscount = fixPrecision(
                parseFloat(existingProduct.discount) || 0,
              );

              return (
                existingProductName === productName &&
                existingSalesQty === salesQty &&
                existingBonusQty === bonusQty &&
                existingSellingPrice === sellingPrice &&
                existingDiscount === discount
              );
            });

            if (!isDuplicate) {
              existing.products.push(newProduct);

              if (!existing._mrDistribution.has(newMrName)) {
                existing._mrDistribution.set(newMrName, {
                  products: [],
                  mrName: newMrName,
                });
              }
              existing._mrDistribution.get(newMrName).products.push(newProduct);
            } else {
              if (!progress.duplicateProductsSkipped) {
                progress.duplicateProductsSkipped = 0;
              }
              progress.duplicateProductsSkipped++;
            }
          }
        }
      }
    }

    progress.totalInvoices = groupedInvoices.size;

    let processedCount = 0;

    for (const [invoiceNumber, groupedInvoice] of groupedInvoices) {
      try {
        const result = await processSingleInvoiceWithMRDistribution(
          groupedInvoice,
          groupedInvoice._rowIndex,
          skipDuplicates,
          bypassStockCheck,
          true,
        );

        if (result.skipped) {
          skippedDuplicates++;
        } else if (result.success) {
          if (result.action === "merged") {
            mergedInvoices++;
          } else {
            successful++;
          }
          if (result.mrCashUpdates) {
            for (const [mrName, amount] of Object.entries(
              result.mrCashUpdates,
            )) {
              totalMRCashAdded = fixPrecision(totalMRCashAdded + amount);
            }
          }
          if (result.costAmount) {
            totalCostAmount = fixPrecision(totalCostAmount + result.costAmount);
          }
        } else {
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        failed++;
        errors.push({
          row: groupedInvoice._rowIndex + 2,
          invoiceNumber: invoiceNumber || "Unknown",
          customerName: groupedInvoice.customerName || "N/A",
          message: error.message,
          type: "unexpected_error",
        });
      }

      processedCount++;
      progress.processedInvoices = processedCount;
      progress.successful = successful;
      progress.failed = failed;
      progress.skippedDuplicates = skippedDuplicates;
      progress.mergedInvoices = mergedInvoices;
      progress.totalCostAmount = totalCostAmount;
      progress.progressPercentage = Math.round(
        (processedCount / groupedInvoices.size) * 100,
      );
      progress.lastUpdated = Date.now();
    }

    progress.completed = true;
    progress.endTime = Date.now();
    progress.totalTime = progress.endTime - progress.startTime;
    progress.errors = errors;
    progress.status = "completed";
    progress.totalMRCashAdded = totalMRCashAdded;
    progress.totalCostAmount = totalCostAmount;
  } catch (error) {
    progress.status = "failed";
    progress.errors.push({
      message: "Critical error in import process",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    progress.lastUpdated = Date.now();
    console.error(`💥 Critical error: ${error.message}`);
  }
};

const updateMRCashes = async (
  mrName,
  amount,
  invoiceNumber,
  date,
  session,
  isRefund = false,
) => {
  try {
    const cleanAmount = fixPrecision(Number(amount) || 0);
    if (cleanAmount === 0) {
      return { success: true, skipped: true, reason: "Amount is zero" };
    }

    if (!mrName || mrName.trim() === "") {
      throw new Error("medicalRepName is required to update MR Cash");
    }

    const escapeForRegex = (text = "") =>
      text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const mr = await Staff.findOne({
      medicalRepName: {
        $regex: `^${escapeForRegex(mrName.trim())}$`,
        $options: "i",
      },
    }).session(session);

    if (!mr) {
      throw new Error(`MR not found with name "${mrName}"`);
    }

    let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);

    if (!mrCash) {
      let initialCash = 0;
      if (!isRefund) {
        initialCash = cleanAmount;
      }

      mrCash = new MRCash({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        currentCash: initialCash,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial creation with invoice: ${invoiceNumber} (${isRefund ? "Refund" : "Sale"}: ${cleanAmount})`,
        isActive: true,
      });

      await mrCash.save({ session });
      return {
        success: true,
        mrCash,
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash,
      };
    }

    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    let newCashAmount = isRefund
      ? fixPrecision(previousAmount - cleanAmount)
      : fixPrecision(previousAmount + cleanAmount);

    mrCash.currentCash = newCashAmount;

    const transactionNote = isRefund
      ? `Refund for invoice ${invoiceNumber}: -${cleanAmount}`
      : `Sale invoice ${invoiceNumber}: +${cleanAmount}`;

    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n${transactionNote}`
      : transactionNote;
    mrCash.updatedAt = new Date();

    await mrCash.save({ session });

    return {
      success: true,
      mrCash,
      action: "updated_existing",
      previousAmount,
      newAmount: newCashAmount,
      changeAmount: cleanAmount,
    };
  } catch (error) {
    console.error("❌ Error updating MR Cash:", error.message);
    return { success: false, error: error.message };
  }
};

router.post("/mrcash/fix-duplicates", async (req, res) => {
  try {
    const duplicateAdjustments = [
      { invoice: "995120", excess: 160.0 },
      { invoice: "995279", excess: 95.0 },
      { invoice: "995692", excess: 20.0 },
      { invoice: "995898", excess: 105.0 },
      { invoice: "996102", excess: 59.0 },
      { invoice: "996104", excess: 60.0 },
      { invoice: "996127", excess: 118.8 },
      { invoice: "996659", excess: 50.0 },
    ];

    const totalExcess = duplicateAdjustments.reduce(
      (sum, item) => sum + item.excess,
      0,
    );
    const mrCash = await MRCash.findOne({ mrName: /Yav Phanda/i });

    if (!mrCash) {
      return res.status(404).json({
        success: false,
        message: "MR Cash record for Yav Phanda not found",
      });
    }

    const oldCash = mrCash.currentCash;
    const newCash = fixPrecision(oldCash - totalExcess);

    mrCash.currentCash = newCash;
    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n\nOne-time fix: Removed ₹${totalExcess.toFixed(2)} excess from duplicate products (${new Date().toISOString()})`
      : `One-time fix: Removed ₹${totalExcess.toFixed(2)} excess from duplicate products (${new Date().toISOString()})`;

    await mrCash.save();

    res.json({
      success: true,
      message: "MR Cash duplicates fixed successfully",
      details: {
        mrName: mrCash.mrName,
        oldCash,
        newCash,
        excessRemoved: totalExcess,
        affectedInvoices: duplicateAdjustments,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fix MR Cash duplicates",
      error: error.message,
    });
  }
});

router.get("/import/failed/:sessionId", (req, res) => {
  try {
    const progress = importProgressMap.get(req.params.sessionId);
    if (!progress) {
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
    }

    res.json({
      success: true,
      data: {
        failedInvoices: progress.errors || [],
        totalFailed: progress.failed || 0,
        sessionId: req.params.sessionId,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch failed invoices" });
  }
});

router.get("/products/check/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName || productName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
        exists: false,
        product: null,
      });
    }

    const decodedProductName = decodeURIComponent(productName);
    const cleanProductName = decodedProductName.trim();

    let product = await findProductRecordFlexible(cleanProductName);
    if (!product) {
      product = await findStockItemFlexible(cleanProductName);
    }

    const exists = !!product;

    res.json({
      success: true,
      exists,
      product: product ? { name: product.productName, id: product._id } : null,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      exists: false,
      message: error.message,
      product: null,
    });
  }
});

// ==========================================
// MAIN ROUTES
// ==========================================

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", tab = "All" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegexForSearch(search.trim()), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(
        `^${escapeRegexForSearch(tab)}$`,
        "i",
      );
    }

    const totalCount = await SaleSummary.countDocuments(matchConditions);
    const totalPages = Math.ceil(totalCount / limitNum);

    const summaries = await SaleSummary.find(matchConditions)
      .sort({ recordingDate: -1 })
      .skip(skip)
      .limit(limitNum)
      .select({
        recordingDate: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        mrName: 1,
        customerName: 1,
        customerCode: 1,
        paymentStatus: 1,
        totalAmount: 1,
        paidAmount: 1,
        dueAmount: 1,
        costAmount: 1,
        products: 1,
      })
      .lean();

    res.status(200).json({
      summaries,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sales" });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { search = "", tab = "All" } = req.query;
    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(escapeRegexForSearch(search.trim()), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(
        `^${escapeRegexForSearch(tab)}$`,
        "i",
      );
    }

    const summaries = await SaleSummary.find(matchConditions)
      .sort({ recordingDate: -1 })
      .select({
        recordingDate: 1,
        invoiceNumber: 1,
        invoiceDate: 1,
        mrName: 1,
        mrId: 1,
        customerCode: 1,
        customerId: 1,
        customerName: 1,
        paymentStatus: 1,
        remark: 1,
        creditDays: 1,
        dueDate: 1,
        deliveryDate: 1,
        paidAmount: 1,
        dueAmount: 1,
        totalAmount: 1,
        totalProfitLoss: 1,
        costAmount: 1,
        products: 1,
        createdAt: 1,
        updatedAt: 1,
      });

    res.status(200).json({ summaries, count: summaries.length });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

router.get("/payment-status", async (req, res) => {
  try {
    const statuses = await PaymentStatus.find().sort({ type: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.post("/batch-delete", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No valid IDs provided" });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      return res.status(400).json({ error: "No valid ObjectIds provided" });
    }

    const result = await SaleSummary.deleteMany({ _id: { $in: validIds } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    res.status(500).json({ error: error.message || "Batch delete failed" });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const saleToDelete = await SaleSummary.findById(id).session(session);

    if (!saleToDelete) {
      throw new Error("Sales record not found.");
    }

    if (saleToDelete.paidAmount > 0 && saleToDelete.mrName) {
      const mrCashUpdate = await updateMRCashes(
        saleToDelete.mrName,
        saleToDelete.paidAmount,
        saleToDelete.invoiceNumber,
        new Date(),
        session,
        true,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.warn(
          `Failed to update MR Cash on deletion: ${mrCashUpdate.error}`,
        );
      }
    }

    for (const product of saleToDelete.products || []) {
      const salesQty = Number(product.salesQty) || 0;
      const bonusQty = Number(product.bonusQty) || 0;
      const totalQty = salesQty + bonusQty;

      if (totalQty > 0) {
        if (saleToDelete.isMRSale && product.mrId) {
          await restoreStockToMRHand(
            product.mrId,
            product.productName,
            totalQty,
            product.lc,
            session,
          );
        } else {
          await restoreStockToReportInHand(product.productName, totalQty);
        }
      }
    }

    await SaleSummary.findByIdAndDelete(id).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Sales record deleted successfully and stock restored.",
      deletedSale: saleToDelete,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ error: err.message || "Failed to delete sales record." });
  }
});

router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const originalSale = await SaleSummary.findById(id).session(session);
    if (!originalSale) {
      throw new Error("Sales record not found.");
    }

    if (
      req.body.invoiceNumber &&
      req.body.invoiceNumber !== originalSale.invoiceNumber
    ) {
      const invoiceExists = await SaleSummary.findOne({
        invoiceNumber: req.body.invoiceNumber,
        _id: { $ne: id },
      }).session(session);

      if (invoiceExists) {
        throw new Error(
          `Invoice number "${req.body.invoiceNumber}" already exists.`,
        );
      }
    }

    const saleData = req.body;

    let customerName = originalSale.customerName;
    let customerId = originalSale.customerId;
    let customerCode = originalSale.customerCode;

    if (saleData.customerCode && saleData.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(
        saleData.customerCode,
        session,
      );
      if (customerResult.success) {
        customerName = customerResult.customer.customerName;
        customerId = customerResult.customer.customerId;
        customerCode = customerResult.customer.customerCode;
      }
    }

    const updatedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    let totalCostAmount = 0;

    for (const p of saleData.products || []) {
      if (!p.productName || !p.productName.trim()) continue;

      const newSalesQty = fixPrecision(Number(p.salesQty) || 0);
      const newBonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const newTotalQty = fixPrecision(newSalesQty + newBonusQty);

      if (newTotalQty === 0) continue;

      const originalProduct = originalSale.products.find(
        (op) => op.productName === p.productName,
      );
      const originalSalesQty = originalProduct
        ? fixPrecision(Number(originalProduct.salesQty) || 0)
        : 0;
      const originalBonusQty = originalProduct
        ? fixPrecision(Number(originalProduct.bonusQty) || 0)
        : 0;
      const originalTotalQty = fixPrecision(
        originalSalesQty + originalBonusQty,
      );

      const quantityDifference = fixPrecision(newTotalQty - originalTotalQty);

      if (Math.abs(quantityDifference) > 0.0001) {
        if (quantityDifference > 0) {
          const stockItem = await findStockItemFlexible(p.productName, session);

          if (!stockItem) {
            throw new Error(
              `Product "${p.productName}" not found in inventory`,
            );
          }

          const availableStock = fixPrecision(
            Number(stockItem.totalBoxes || 0),
          );
          const requiredQty = Math.abs(quantityDifference);

          if (availableStock < requiredQty) {
            const shortage = fixPrecision(requiredQty - availableStock);
            throw new Error(
              `Insufficient stock for ${p.productName}. Required: ${requiredQty}, Available: ${availableStock}, Short by: ${shortage}`,
            );
          }

          const deductResult = await deductStockFromReportInHand(
            p.productName,
            quantityDifference,
            0,
            originalSale.invoiceNumber,
            session,
          );

          if (!deductResult.success) {
            throw new Error(
              `Stock deduction failed for ${p.productName}: ${deductResult.message}`,
            );
          }

          totalCostAmount = fixPrecision(
            totalCostAmount + (deductResult.amountDeducted || 0),
          );
        } else if (quantityDifference < 0) {
          await restoreStockToReportInHand(
            p.productName,
            Math.abs(quantityDifference),
          );
        }
      }

      const sellingPrice = fixPrecision(Number(p.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * newSalesQty);
      const discount = fixPrecision(Number(p.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);

      let lcValue = parseFloat(p.lc) || 0;
      if (lcValue <= 0) {
        const productRecord = await findProductRecordFlexible(p.productName);
        lcValue = productRecord?.lc || 0;
      }

      const profitLoss = fixPrecision((sellingPrice - lcValue) * newSalesQty);

      updatedProducts.push({
        productName: p.productName.trim(),
        salesQty: newSalesQty,
        bonusQty: newBonusQty,
        totalQty: newTotalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice:
          newTotalQty > 0 ? fixPrecision(netSellingAmount / newTotalQty) : 0,
        lc: lcValue,
        profitLoss,
        isProductAccept: true,
      });

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
    }

    if (updatedProducts.length === 0) {
      throw new Error("At least one valid product is required");
    }

    const paidAmount = fixPrecision(Number(saleData.paidAmount) || 0);
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    const paidAmountDifference = fixPrecision(
      paidAmount - originalSale.paidAmount,
    );
    if (Math.abs(paidAmountDifference) > 0.01) {
      const mrName = saleData.mrName || originalSale.mrName;
      if (mrName) {
        const mrCashUpdate = await updateMRCashes(
          mrName,
          paidAmountDifference,
          saleData.invoiceNumber || originalSale.invoiceNumber,
          saleData.invoiceDate || originalSale.invoiceDate || new Date(),
          session,
          paidAmountDifference < 0,
        );
        if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
          console.warn(`Failed to update MR Cash: ${mrCashUpdate.error}`);
        }
      }
    }

    const updatedSale = await SaleSummary.findByIdAndUpdate(
      id,
      {
        recordingDate: new Date(
          saleData.recordingDate || originalSale.recordingDate,
        ),
        invoiceNumber: saleData.invoiceNumber || originalSale.invoiceNumber,
        invoiceDate: new Date(saleData.invoiceDate || originalSale.invoiceDate),
        mrName: saleData.mrName || originalSale.mrName,
        mrId: saleData.mrId || originalSale.mrId,
        customerName,
        customerCode,
        customerId,
        products: updatedProducts,
        creditDays: Number(saleData.creditDays) || originalSale.creditDays || 0,
        dueDate: saleData.dueDate
          ? new Date(saleData.dueDate)
          : originalSale.dueDate,
        deliveryDate: saleData.deliveryDate
          ? new Date(saleData.deliveryDate)
          : originalSale.deliveryDate,
        paidAmount,
        totalAmount,
        totalProfitLoss,
        costAmount: fixPrecision(totalCostAmount),
        dueAmount,
        paymentStatus:
          mapPaymentStatus(saleData.paymentStatus) ||
          originalSale.paymentStatus,
        remark: saleData.remark || originalSale.remark || "",
        updatedAt: new Date(),
      },
      { new: true, runValidators: true, session },
    );

    await session.commitTransaction();
    session.endSession();

    res
      .status(200)
      .json({ message: "Sale updated successfully", sale: updatedSale });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    res
      .status(500)
      .json({ error: "Failed to update sales record", details: err.message });
  }
});

router.post("/create", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;
    const isMRSale = data.isMRSale || false;

    if (!data.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    if (!isMRSale && !data.mrName?.trim()) {
      throw new Error("MR Name is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: data.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      throw new Error("Invoice number already exists");
    }

    let customerName = data.customerName || "Unknown";
    let customerId = data.customerId || null;
    let customerCode = data.customerCode || "";

    if (data.customerCode && data.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(
        data.customerCode,
        session,
      );
      if (customerResult.success) {
        customerName = customerResult.customer.customerName;
        customerId = customerResult.customer.customerId;
        customerCode = customerResult.customer.customerCode;
      }
    }

    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    let totalCostAmount = 0;
    const stockDeductionResults = [];

    // First pass: validate stock
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty <= 0) continue;

      if (isMRSale) {
        if (!p.mrId) {
          throw new Error(`MR not selected for product: ${p.productName}`);
        }

        const stockinmrhands =
          mongoose.connection.db.collection("stockinmrhands");
        let mrStock;
        try {
          mrStock = await stockinmrhands.findOne(
            { mrId: new mongoose.Types.ObjectId(p.mrId) },
            { session },
          );
        } catch (err) {
          throw new Error(`Failed to query MR stock: ${err.message}`);
        }

        if (!mrStock) {
          throw new Error(`MR stock not found for MR ID: ${p.mrId}`);
        }

        const normalizedProductName = p.productName?.toLowerCase().trim() || "";
        const mrProduct = mrStock.productsInHand?.find((prod) => {
          if (!prod || !prod.productName) return false;
          return (
            prod.productName.toLowerCase().trim() === normalizedProductName
          );
        });

        if (!mrProduct) {
          throw new Error(
            `Product "${p.productName}" not found in ${mrStock.mrName}'s stock. ` +
              `Available products: ${mrStock.productsInHand?.map((p) => p.productName).join(", ") || "None"}`,
          );
        }

        const availableQty = fixPrecision(Number(mrProduct.quantity) || 0);
        if (availableQty < totalQty) {
          const shortage = fixPrecision(totalQty - availableQty);
          throw new Error(
            `Insufficient MR stock for ${p.productName} in ${mrStock.mrName}'s hand. ` +
              `Available: ${availableQty}, Required: ${totalQty}, Short by: ${shortage}`,
          );
        }
      } else {
        const stockItem = await findStockItemFlexible(p.productName, session);

        if (!stockItem) {
          throw new Error(`Product "${p.productName}" not found in inventory`);
        }

        const availableStock = fixPrecision(Number(stockItem.totalBoxes || 0));
        if (availableStock < totalQty) {
          const shortage = fixPrecision(totalQty - availableStock);
          throw new Error(
            `Insufficient warehouse stock for ${p.productName}. ` +
              `Required: ${totalQty}, Available: ${availableStock}, Short by: ${shortage}`,
          );
        }
      }
    }

    // Second pass: deduct and build products
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty === 0) continue;

      const sellingPrice = fixPrecision(Number(p.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(Number(p.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);

      let lc = 0;

      if (isMRSale) {
        const deductionResult = await deductStockFromMRHand(
          p.mrId,
          p.productName.trim(),
          salesQty,
          bonusQty,
          session,
        );

        // Capture the amount deducted (cost value)
        const amountDeducted = deductionResult.amountDeducted || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

        stockDeductionResults.push({
          product: p.productName.trim(),
          mrId: p.mrId,
          mrName: p.mrName,
          ...deductionResult,
          amountDeducted,
        });

        if (!deductionResult.success) {
          throw new Error(
            `MR stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );
        }

        // Get LC from MR's stock after deduction
        const stockinmrhands =
          mongoose.connection.db.collection("stockinmrhands");
        const mrStock = await stockinmrhands.findOne(
          { mrId: new mongoose.Types.ObjectId(p.mrId) },
          { session },
        );

        const mrProduct = mrStock?.productsInHand?.find(
          (prod) =>
            prod.productName.toLowerCase().trim() ===
            p.productName.toLowerCase().trim(),
        );

        lc = mrProduct?.lc || Number(p.lc) || 0;
      } else {
        const productRecord = await findProductRecordFlexible(
          p.productName,
          session,
        );
        lc = productRecord?.lc || Number(p.lc) || 0;

        const deductionResult = await deductStockFromReportInHand(
          p.productName.trim(),
          salesQty,
          bonusQty,
          data.invoiceNumber,
          session,
        );

        // Capture the amount deducted (cost value)
        const amountDeducted = deductionResult.amountDeducted || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

        stockDeductionResults.push({
          product: p.productName.trim(),
          ...deductionResult,
          amountDeducted,
        });

        if (!deductionResult.success) {
          throw new Error(
            `Warehouse stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );
        }
      }

      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

      const productData = {
        productName: p.productName.trim(),
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty
          ? fixPrecision(netSellingAmount / totalQty)
          : 0,
        lc,
        profitLoss,
        isProductAccept: true,
      };

      if (isMRSale) {
        productData.mrId = p.mrId;
        productData.mrName = p.mrName;
      }

      processedProducts.push(productData);

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
    }

    if (!processedProducts.length) {
      throw new Error("At least one valid product is required");
    }

    const paidAmount = fixPrecision(Number(data.paidAmount) || 0);
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));
    const paymentStatus = mapPaymentStatus(data.paymentStatus);

    let mrName = data.mrName;
    let mrId = data.mrId;

    if (isMRSale && processedProducts.length > 0) {
      mrName = processedProducts[0].mrName || "MR Sale";
      mrId = processedProducts[0].mrId;
    }

    const saleData = {
      recordingDate: data.recordingDate || new Date(),
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate || new Date(),
      mrName: mrName?.trim() || "No MR Name Provided",
      mrId: mrId || null,
      customerName,
      customerCode,
      customerId,
      products: processedProducts,
      creditDays: Number(data.creditDays) || 0,
      dueDate: data.dueDate || "",
      deliveryDate: data.deliveryDate || "",
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss,
      costAmount: fixPrecision(totalCostAmount),
      paymentStatus,
      // 🆕 Set saleType based on isMRSale flag
      saleType: isMRSale ? "MR Sale" : "Normal Sale",
      remark: data.remark || "",
      stockDeductionResults,
      isMRSale,
    };
    const sale = await SaleSummary.create([saleData], { session });

    if (paidAmount > 0 && mrName) {
      const mrCashUpdate = await updateMRCashes(
        mrName,
        paidAmount,
        data.invoiceNumber,
        data.invoiceDate || new Date(),
        session,
        false,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.warn(`⚠️ Failed to update MR Cash: ${mrCashUpdate.error}`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: isMRSale
        ? "MR Sale created successfully with stock deduction from MR's hand"
        : "Sale created successfully with stock deduction",
      sale: sale[0],
      stockDeductionResults,
      costAmount: fixPrecision(totalCostAmount),
    });
  } catch (err) {
    console.error("❌ Error creating sale:", err.message);

    try {
      await session.abortTransaction();
    } catch (abortError) {
      console.error("Error aborting transaction:", abortError);
    }

    try {
      await session.endSession();
    } catch (endError) {
      console.error("Error ending session:", endError);
    }

    res
      .status(500)
      .json({ success: false, error: err.message || "Failed to create sale" });
  }
});

router.get("/mr-stock/mrs-with-stock", async (req, res) => {
  try {
    const mrStocks = await mongoose.connection.db
      .collection("stockinmrhands")
      .find({ productsInHand: { $exists: true, $ne: [] } })
      .toArray();

    const mrsWithStock = mrStocks.map((mrStock) => {
      const products = mrStock.productsInHand || [];
      const totalQuantity = products.reduce(
        (sum, p) => sum + (p.quantity || 0),
        0,
      );
      const totalProductsWithStock = products.filter(
        (p) => p.quantity > 0,
      ).length;

      return {
        _id: mrStock.mrId,
        mrName: mrStock.mrName,
        totalProducts: products.length,
        productsWithStock: totalProductsWithStock,
        totalQuantity,
        hasStock: totalQuantity > 0,
      };
    });

    res.json({ success: true, data: mrsWithStock, count: mrsWithStock.length });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch MRs with stock",
      error: error.message,
    });
  }
});

router.get("/mr-stock/products/:mrId", async (req, res) => {
  try {
    const { mrId } = req.params;

    const mrStock = await mongoose.connection.db
      .collection("stockinmrhands")
      .findOne({ mrId: new mongoose.Types.ObjectId(mrId) });

    if (!mrStock) {
      return res.json({ success: true, products: [], mrName: null });
    }

    const availableProducts = (mrStock.productsInHand || [])
      .filter((p) => p.quantity > 0)
      .map((p) => p.productName);

    res.json({
      success: true,
      products: availableProducts,
      mrName: mrStock.mrName,
      count: availableProducts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR products",
      error: error.message,
    });
  }
});

router.get("/mr-stock/:mrId/:productName", async (req, res) => {
  try {
    const { mrId, productName } = req.params;
    const decodedProductName = decodeURIComponent(productName);

    const mrStock = await mongoose.connection.db
      .collection("stockinmrhands")
      .findOne({ mrId: new mongoose.Types.ObjectId(mrId) });

    if (!mrStock) {
      return res
        .status(404)
        .json({ success: false, message: "MR stock not found" });
    }

    const product = mrStock.productsInHand.find(
      (p) =>
        p.productName.toLowerCase().trim() ===
        decodedProductName.toLowerCase().trim(),
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${decodedProductName}" not found in ${mrStock.mrName}'s stock`,
      });
    }

    res.json({
      success: true,
      stock: {
        productName: product.productName,
        quantity: product.quantity,
        lc: product.lc || 0,
        lastUpdated: product.lastUpdated,
        totalBoxes: product.quantity,
      },
      mrName: mrStock.mrName,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR product stock",
      error: error.message,
    });
  }
});

router.get("/profit-loss-summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};

    if (startDate && endDate) {
      filter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const result = await SaleSummary.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          totalProfitLoss: { $sum: "$totalProfitLoss" },
          totalPaid: { $sum: "$paidAmount" },
          totalDue: { $sum: "$dueAmount" },
          totalCost: { $sum: "$costAmount" },
        },
      },
    ]);

    const summary =
      result.length > 0
        ? result[0]
        : {
            totalSales: 0,
            totalAmount: 0,
            totalProfitLoss: 0,
            totalPaid: 0,
            totalDue: 0,
            totalCost: 0,
          };

    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch profit/loss summary",
      error: error.message,
    });
  }
});

router.get("/analytics/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start date and end date are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const sales = await SaleSummary.aggregate([
      { $match: { invoiceDate: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const result = sales.length > 0 ? sales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/credit-sale-not-received", async (req, res) => {
  try {
    const creditSales = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      paymentStatus: { $ne: "Cash" },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ invoiceDate: -1 })
      .lean();

    const totalAmount = creditSales.reduce((total, invoice) => {
      const outstandingAmount =
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0));
      return total + outstandingAmount;
    }, 0);

    const formattedSales = creditSales.map((invoice) => ({
      ...invoice,
      outstandingAmount:
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)),
    }));

    res.json({
      success: true,
      data: formattedSales,
      totalAmount: totalAmount.toFixed(2),
      count: formattedSales.length,
      message: `Found ${formattedSales.length} credit sales where cash is not received`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error while fetching credit sales",
      error: error.message,
      data: [],
      totalAmount: 0,
      count: 0,
    });
  }
});

router.get("/table-data", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let dateFilter = {};

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: { $gte: dateRange.start, $lte: dateRange.end },
        };
      }
    }

    const salesData = await SaleSummary.aggregate([
      { $match: dateFilter },
      { $unwind: "$products" },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
          productName: "$products.productName",
          salesPerson: "$mrName",
          quantity: "$products.salesQty",
          amount: "$products.netSellingAmount",
          customer: "$customerName",
          invoiceNumber: 1,
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice",
          discount: "$products.discount",
          paymentStatus: 1,
          remark: 1,
          customerId: 1,
          recordingDate: 1,
          dueDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          costAmount: 1,
        },
      },
      { $sort: { date: -1 } },
    ]);

    const transformedData = salesData.map((sale) => ({
      date: sale.date,
      productName: sale.productName,
      salesPerson: sale.salesPerson,
      quantity: sale.quantity,
      amount: sale.amount,
      customer: sale.customer || "N/A",
      invoiceNumber: sale.invoiceNumber,
      bonusQty: sale.bonusQty,
      totalQty: sale.totalQty,
      sellingPrice: sale.sellingPrice,
      discount: sale.discount,
      paymentStatus: sale.paymentStatus,
      remark: sale.remark,
      customerId: sale.customerId,
      recordingDate: sale.recordingDate,
      dueDate: sale.dueDate,
      paidAmount: sale.paidAmount,
      dueAmount: sale.dueAmount,
      totalAmount: sale.totalAmount,
      costAmount: sale.costAmount,
    }));

    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      period,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error.message, data: [], count: 0 });
  }
});

const getTableDateRanges = (period) => {
  const now = new Date();
  switch (period) {
    case "Today":
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      return { start: todayStart, end: now };
    case "Month":
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart, end: now };
    case "Year":
      const yearStart = new Date(now.getFullYear(), 0, 1);
      return { start: yearStart, end: now };
    case "custom":
      return null;
    default:
      const defaultStart = new Date(now);
      defaultStart.setHours(0, 0, 0, 0);
      return { start: defaultStart, end: now };
  }
};

const restoreStockToMRHand = async (
  mrId,
  productName,
  quantity,
  lc,
  session,
) => {
  try {
    const restoreQty = fixPrecision(parseFloat(quantity));

    if (restoreQty <= 0) {
      return { success: true, restored: 0 };
    }

    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");

    const mrStock = await stockinmrhands.findOne(
      { mrId: new mongoose.Types.ObjectId(mrId) },
      { session },
    );

    if (!mrStock) {
      return {
        success: false,
        message: `MR stock record not found for MR ID: ${mrId}`,
      };
    }

    const productIndex = mrStock.productsInHand.findIndex(
      (p) =>
        p.productName.toLowerCase().trim() === productName.toLowerCase().trim(),
    );

    if (productIndex === -1) {
      await stockinmrhands.updateOne(
        { mrId: new mongoose.Types.ObjectId(mrId) },
        {
          $push: {
            productsInHand: {
              _id: new mongoose.Types.ObjectId(),
              productName,
              quantity: restoreQty,
              lc: lc || 0,
              lastUpdated: new Date(),
            },
          },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    } else {
      const currentQty = mrStock.productsInHand[productIndex].quantity || 0;
      const newQty = fixPrecision(currentQty + restoreQty);

      await stockinmrhands.updateOne(
        {
          mrId: new mongoose.Types.ObjectId(mrId),
          "productsInHand.productName": productName,
        },
        {
          $set: {
            "productsInHand.$.quantity": newQty,
            "productsInHand.$.lastUpdated": new Date(),
            updatedAt: new Date(),
          },
        },
        { session },
      );
    }

    return {
      success: true,
      restored: restoreQty,
      mrName: mrStock.mrName,
      productName,
    };
  } catch (error) {
    console.error("Error restoring MR stock:", error);
    return { success: false, message: error.message };
  }
};

router.get("/check-stock/health", async (req, res) => {
  res.json({
    success: true,
    message: "Stock check endpoint is working",
    endpoints: {
      individualCheck: "POST /api/sales/check-stock",
      getSales: "GET /api/sales",
      getAllSales: "GET /api/sales/all",
      paymentStatus: "GET /api/sales/payment-status",
      mrCashSync: "POST /api/sales/mrcash/sync-from-sales",
      mrCashSummary: "GET /api/sales/mrcash/summary",
      validateImportStock: "POST /api/sales/validate-import-stock",
      validateImportMRs: "POST /api/sales/validate-import-mrs",
      fixStockAmounts: "POST /api/sales/fix-stock-amounts",
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
