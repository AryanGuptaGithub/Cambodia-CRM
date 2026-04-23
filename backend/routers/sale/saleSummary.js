import express from "express";
import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import stockInMRHand from "../../models/stock/stockInMRHand.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";
import XLSX from "xlsx";
import { logActivity } from "../activity/activityLog.js";

const router = express.Router();
const importProgressMap = new Map();
let isImportInProgress = false;

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

const escapeRegexForSearch = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// ==========================================
// Helper: shouldMergeInvoices
// ==========================================
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
    if (isExactDuplicate) return { shouldMerge: false, isExactDuplicate: true };
  }

  return { shouldMerge: true, isExactDuplicate: false };
};

// ==========================================
// Helper: mergeInvoiceProducts
// ==========================================
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
    const isMRSale = existingInvoice.saleType === "MR Sale";

    for (const newProduct of newInvoiceData.products || []) {
      const productName = newProduct.productName?.trim();
      const salesQty = fixPrecision(parseFloat(newProduct.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(newProduct.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      const existingProductIndex = mergedProducts.findIndex(
        (p) => p.productName === productName,
      );

      let lc = 0;
      let mrSalePurchasePrice = 0;
      let amountDeducted = 0;

      if (isMRSale) {
        const existingProduct =
          existingProductIndex >= 0
            ? mergedProducts[existingProductIndex]
            : null;
        const mrId = existingProduct?.mrId || newProduct.mrId;
        const mergeProductMrName = (
          existingProduct?.mrName ||
          newProduct.mrName ||
          existingInvoice.mrName ||
          ""
        ).trim();

        if (!mrId)
          throw new Error(
            `MR not found for product "${productName}" during merge`,
          );

        const deductionResult = await deductStockFromMRHand(
          mrId,
          productName,
          salesQty,
          bonusQty,
          session,
          mergeProductMrName,
        );

        if (!deductionResult.success) {
          throw new Error(
            `MR stock deduction failed for ${productName}: ${deductionResult.message}`,
          );
        }

        amountDeducted = deductionResult.amountDeducted || 0;
        lc = deductionResult.lc;
        mrSalePurchasePrice = deductionResult.mrSalePurchasePrice || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);
      } else {
        const stockItem = await findStockItemFlexible(productName, session);
        if (!stockItem)
          throw new Error(`Product "${productName}" not found in inventory`);

        const currentAvailableStock = fixPrecision(
          Number(stockItem.totalBoxes || 0),
        );
        if (currentAvailableStock < totalQty) {
          const shortage = fixPrecision(totalQty - currentAvailableStock);
          throw new Error(
            `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${currentAvailableStock}, Short by: ${shortage}`,
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

        amountDeducted = deductionResult.amountDeducted || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

        const productRecord = await findProductRecordFlexible(
          productName,
          session,
        );
        lc = productRecord?.lc || 0;
      }

      const sellingPrice = fixPrecision(
        parseFloat(newProduct.sellingPrice) || 0,
      );
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(newProduct.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

      if (existingProductIndex >= 0) {
        const ep = mergedProducts[existingProductIndex];
        ep.salesQty = fixPrecision(ep.salesQty + salesQty);
        ep.bonusQty = fixPrecision(ep.bonusQty + bonusQty);
        ep.totalQty = fixPrecision(ep.totalQty + totalQty);
        ep.netSellingAmount = fixPrecision(
          ep.netSellingAmount + netSellingAmount,
        );
        ep.profitLoss = fixPrecision(ep.profitLoss + profitLoss);
        ep.amount = fixPrecision(ep.amount + amount);
        ep.discount = fixPrecision(ep.discount + discount);
        ep.averageUnitPrice =
          ep.totalQty > 0 ? fixPrecision(ep.netSellingAmount / ep.totalQty) : 0;
        ep.mrSalePurchasePrice = fixPrecision(
          (ep.mrSalePurchasePrice || 0) + mrSalePurchasePrice,
        );
      } else {
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
          mrSalePurchasePrice: isMRSale ? mrSalePurchasePrice : 0,
        };
        mergedProducts.push(productEntry);
      }

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
      if (paymentStatus === "Cash")
        newPaidAmount = fixPrecision(newPaidAmount + netSellingAmount);
    }

    if (paymentStatus === "Cash")
      paidAmount = fixPrecision(paidAmount + newPaidAmount);
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
        existingInvoice.invoiceDate,
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
    return { success: false, error: error.message };
  }
};

// ==========================================
// normalizeProductName
// ==========================================
const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim();
};

// ==========================================
// escapeRegex
// ==========================================
const escapeRegex = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

// ==========================================
// Improved findStockItemFlexible
// ==========================================
const findStockItemFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);
    const words = normalizedName.split(/\s+/).filter((w) => w.length > 0);

    let query = ReportInHand.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
      },
    });
    if (session) query = query.session(session);
    let stockItem = await query;

    if (!stockItem && words.length > 0) {
      const andConditions = words.map((w) => ({
        productName: { $regex: new RegExp(`\\b${escapeRegex(w)}\\b`, "i") },
      }));
      query = ReportInHand.findOne({ $and: andConditions });
      if (session) query = query.session(session);
      stockItem = await query;

      if (stockItem) {
        const count = await ReportInHand.countDocuments({
          $and: andConditions,
        }).session(session);
        if (count > 1) {
          console.warn(
            `⚠️ Multiple products (${count}) matched for "${productName}". Using first: ${stockItem.productName}`,
          );
        }
      }
    }

    if (!stockItem) {
      const productRecord = await findProductRecordFlexible(
        productName,
        session,
      );
      if (productRecord) {
        query = ReportInHand.findOne({
          productName: {
            $regex: new RegExp(
              `^${escapeRegex(normalizeProductName(productRecord.productName))}$`,
              "i",
            ),
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

// ==========================================
// Improved findProductRecordFlexible
// ==========================================
const findProductRecordFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);
    const words = normalizedName.split(/\s+/).filter((w) => w.length > 0);

    let query = Product.findOne({
      productName: {
        $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
      },
    });
    if (session) query = query.session(session);
    let product = await query;

    if (!product && words.length > 0) {
      const andConditions = words.map((w) => ({
        productName: { $regex: new RegExp(`\\b${escapeRegex(w)}\\b`, "i") },
      }));
      query = Product.findOne({ $and: andConditions });
      if (session) query = query.session(session);
      product = await query;

      if (product) {
        const count = await Product.countDocuments({
          $and: andConditions,
        }).session(session);
        if (count > 1) {
          console.warn(
            `⚠️ Multiple products (${count}) matched for "${productName}". Using first: ${product.productName}`,
          );
        }
      }
    }

    return product;
  } catch (error) {
    console.error(`Error finding product record for ${productName}:`, error);
    return null;
  }
};

// ==========================================
// mapPaymentStatus
// ==========================================
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

// ==========================================
// getCustomerByCode
// ==========================================
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
    let query = Customer.findOne({ customerCode: cleanedCode, enabled: true });
    if (session) query = query.session(session);
    let customer = await query;

    if (!customer) {
      const digitsMatch = cleanedCode.match(/\d+/);
      if (digitsMatch) {
        const paddedCode = digitsMatch[0].padStart(5, "0");
        query = Customer.findOne({ customerCode: paddedCode, enabled: true });
        if (session) query = query.session(session);
        customer = await query;
      }
    }

    if (!customer) {
      query = Customer.findOne({
        customerCode: { $regex: new RegExp(`^${cleanedCode}$`, "i") },
        enabled: true,
      });
      if (session) query = query.session(session);
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
// Improved getRealBatches
// ==========================================
const getRealBatches = (batches = []) => {
  const adjustmentTypes = ["adjustment", "audit", "correction", "write-off"];
  return batches.filter((batch) => {
    if (!batch.adjustmentType) return true;
    const type = batch.adjustmentType.toLowerCase();
    return !adjustmentTypes.includes(type);
  });
};

// ==========================================
// calculateProductStock
// ==========================================
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
        productExists: false,
      };
    }

    const realBatches = getRealBatches(stockItem.batches || []);
    console.log(`[STOCK DEBUG] Product: ${stockItem.productName}`);
    console.log(
      `[STOCK DEBUG] Total batches: ${stockItem.batches?.length || 0}, real batches: ${realBatches.length}`,
    );

    let batchesSum = 0;
    realBatches.forEach((batch) => {
      const batchQty = fixPrecision(Number(batch.boxes || 0));
      console.log(
        `[STOCK DEBUG] Batch ${batch.batchNumber || "?"}: boxes=${batchQty}, adjType=${batch.adjustmentType || "none"}`,
      );
      if (batchQty > 0) batchesSum = fixPrecision(batchesSum + batchQty);
    });

    let totalAdjustments = 0;
    if (stockItem.addStockAdjustment) {
      totalAdjustments += fixPrecision(Number(stockItem.addStockAdjustment));
      console.log(
        `[STOCK DEBUG] addStockAdjustment: ${stockItem.addStockAdjustment}`,
      );
    }
    if (stockItem.removeStockAdjustment) {
      totalAdjustments -= fixPrecision(Number(stockItem.removeStockAdjustment));
      console.log(
        `[STOCK DEBUG] removeStockAdjustment: ${stockItem.removeStockAdjustment}`,
      );
    }

    const availableStock = fixPrecision(
      Math.max(0, batchesSum + totalAdjustments),
    );
    console.log(
      `[STOCK DEBUG] batchesSum=${batchesSum}, totalAdjustments=${totalAdjustments} → availableStock=${availableStock}`,
    );

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
      productExists: true,
      message: hasEnoughStock
        ? `✅ Stock available: ${availableStock} units`
        : `❌ Insufficient stock: Required ${fixedRequiredQty}, Available ${availableStock}, Short by ${insufficientQty}`,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      productName,
      availableStock: 0,
      requiredQty: fixPrecision(requiredQty),
      insufficient: true,
      insufficientQty: fixPrecision(requiredQty),
      message: `Error checking stock: ${error.message}`,
      productExists: false,
    };
  }
};

// ==========================================
// deductStockFromReportInHand
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
    if (totalQty <= 0) return { success: true, deductedQty: 0 };

    const stockItem = await findStockItemFlexible(productName, session);
    if (!stockItem) {
      return {
        success: false,
        message: `Product "${productName}" not found in inventory`,
        productExists: false,
      };
    }

    const realBatchesForCheck = getRealBatches(stockItem.batches || []);
    let actualBatchSum = 0;
    for (const b of realBatchesForCheck)
      actualBatchSum = fixPrecision(actualBatchSum + Number(b.boxes || 0));
    const addAdj = fixPrecision(Number(stockItem.addStockAdjustment || 0));
    const removeAdj = fixPrecision(
      Number(stockItem.removeStockAdjustment || 0),
    );
    const currentStock = fixPrecision(
      Math.max(0, actualBatchSum + addAdj - removeAdj),
    );

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

    const realBatchIndices = [];
    stockItem.batches.forEach((batch, idx) => {
      const type = batch.adjustmentType;
      if (!type || type === "batch") realBatchIndices.push(idx);
    });

    realBatchIndices.sort((a, b) => {
      const dateA = stockItem.batches[a].date
        ? new Date(stockItem.batches[a].date)
        : new Date(0);
      const dateB = stockItem.batches[b].date
        ? new Date(stockItem.batches[b].date)
        : new Date(0);
      return dateA - dateB;
    });

    let remainingToDeduct = totalQty;
    let totalCostDeducted = 0;

    for (const idx of realBatchIndices) {
      if (remainingToDeduct <= 0) break;
      const batch = stockItem.batches[idx];
      const batchBoxes = fixPrecision(Number(batch.boxes || 0));
      if (batchBoxes <= 0) continue;
      const batchLC = Number(batch.lc || 0);
      const deductFromThisBatch = fixPrecision(
        Math.min(batchBoxes, remainingToDeduct),
      );
      const costFromThisBatch = fixPrecision(deductFromThisBatch * batchLC);
      totalCostDeducted = fixPrecision(totalCostDeducted + costFromThisBatch);
      const newBatchBoxes = fixPrecision(batchBoxes - deductFromThisBatch);
      stockItem.batches[idx].boxes = newBatchBoxes;
      stockItem.batches[idx].amount = fixPrecision(newBatchBoxes * batchLC);
      remainingToDeduct = fixPrecision(remainingToDeduct - deductFromThisBatch);
    }

    let totalBoxesFromBatches = 0;
    for (const batch of stockItem.batches) {
      const type = batch.adjustmentType;
      if (!type || type === "batch") {
        totalBoxesFromBatches = fixPrecision(
          totalBoxesFromBatches + (Number(batch.boxes) || 0),
        );
      }
    }
    stockItem.totalBoxesFromBatches = totalBoxesFromBatches;

    const newRemoveStockAdjustment = fixPrecision(removeAdj + totalQty);
    stockItem.removeStockAdjustment = newRemoveStockAdjustment;

    const newTotalBoxes = fixPrecision(
      Math.max(0, totalBoxesFromBatches + addAdj - newRemoveStockAdjustment),
    );

    let newTotalAmount = 0;
    for (const batch of stockItem.batches) {
      const type = batch.adjustmentType;
      if (!type || type === "batch") {
        const boxes = fixPrecision(Number(batch.boxes || 0));
        const lc = Number(batch.lc || 0);
        const batchAmount = fixPrecision(boxes * lc);
        batch.amount = batchAmount;
        newTotalAmount = fixPrecision(newTotalAmount + batchAmount);
      }
    }

    const newAveragePrice =
      newTotalBoxes > 0 ? fixPrecision(newTotalAmount / newTotalBoxes) : 0;
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
    return { success: false, message: error.message, productExists: false };
  }
};

const restoreStockToReportInHand = async (
  productName,
  quantity,
  externalSession = null,
) => {
  const ownSession = !externalSession;
  const session = externalSession || (await mongoose.startSession());

  try {
    if (ownSession) {
      session.startTransaction();
    }

    const restoredQty = fixPrecision(quantity);

    if (restoredQty <= 0) {
      if (ownSession) {
        await session.commitTransaction();
        session.endSession();
      }
      return { success: true, restored: 0 };
    }

    const stockItem = await findStockItemFlexible(productName, session);

    if (stockItem) {
      console.log(`📦 Restoring stock for "${productName}"`);
      console.log(`   Restoring qty: ${restoredQty}`);
      console.log(
        `   Current removeStockAdjustment: ${stockItem.removeStockAdjustment}`,
      );

      // ─────────────────────────────────────────────────────────
      // STEP 1: Restore actual batch boxes (reverse of FIFO deduction)
      // We fill batches in REVERSE order (latest first = LIFO restore)
      // to mirror what was deducted FIFO
      // ─────────────────────────────────────────────────────────
      const realBatchIndices = [];
      stockItem.batches.forEach((batch, idx) => {
        const type = batch.adjustmentType;
        if (!type || type === "batch") realBatchIndices.push(idx);
      });

      // Sort descending by date → restore into most-recent batch first
      realBatchIndices.sort((a, b) => {
        const dateA = stockItem.batches[a].date
          ? new Date(stockItem.batches[a].date)
          : new Date(0);
        const dateB = stockItem.batches[b].date
          ? new Date(stockItem.batches[b].date)
          : new Date(0);
        return dateB - dateA; // newest first
      });

      let remainingToRestore = restoredQty;

      for (const idx of realBatchIndices) {
        if (remainingToRestore <= 0) break;

        const batch = stockItem.batches[idx];
        const batchLC = fixPrecision(Number(batch.lc || 0));

        // We don't have a hard cap here since we're restoring what was taken.
        // Add back as much as needed into each batch slot.
        const restoreToThisBatch = remainingToRestore;
        const newBatchBoxes = fixPrecision(
          (Number(batch.boxes) || 0) + restoreToThisBatch,
        );

        stockItem.batches[idx].boxes = newBatchBoxes;
        stockItem.batches[idx].amount = fixPrecision(newBatchBoxes * batchLC);

        remainingToRestore = 0; // fully restored in one batch (simplest correct approach)
      }

      // If no real batches exist at all, create a placeholder batch
      if (realBatchIndices.length === 0 && remainingToRestore > 0) {
        stockItem.batches.push({
          boxes: remainingToRestore,
          lc: 0,
          fob: 0,
          cif: 0,
          amount: 0,
          expiryDate: new Date(
            new Date().setFullYear(new Date().getFullYear() + 1),
          ),
          date: new Date(),
          adjustmentType: "batch",
        });
        remainingToRestore = 0;
      }

      // ─────────────────────────────────────────────────────────
      // STEP 2: Recalculate totalBoxesFromBatches from restored batches
      // ─────────────────────────────────────────────────────────
      let totalBoxesFromBatches = 0;
      let newTotalAmount = 0;

      for (const batch of stockItem.batches) {
        const type = batch.adjustmentType;
        if (!type || type === "batch") {
          const boxes = fixPrecision(Number(batch.boxes || 0));
          const lc = fixPrecision(Number(batch.lc || 0));
          const batchAmount = fixPrecision(boxes * lc);
          batch.amount = batchAmount;
          totalBoxesFromBatches = fixPrecision(totalBoxesFromBatches + boxes);
          newTotalAmount = fixPrecision(newTotalAmount + batchAmount);
        }
      }

      stockItem.totalBoxesFromBatches = totalBoxesFromBatches;

      // ─────────────────────────────────────────────────────────
      // STEP 3: Also reduce removeStockAdjustment to keep totalBoxes consistent
      // ─────────────────────────────────────────────────────────
      const previousRemoveAdj = fixPrecision(
        Number(stockItem.removeStockAdjustment || 0),
      );
      const newRemoveStockAdjustment = fixPrecision(
        Math.max(0, previousRemoveAdj - restoredQty),
      );
      stockItem.removeStockAdjustment = newRemoveStockAdjustment;

      const addStockAdjustment = fixPrecision(
        Number(stockItem.addStockAdjustment || 0),
      );
      const newTotalBoxes = fixPrecision(
        Math.max(
          0,
          totalBoxesFromBatches + addStockAdjustment - newRemoveStockAdjustment,
        ),
      );

      // ─────────────────────────────────────────────────────────
      // STEP 4: Recalculate averagePrice from restored amounts
      // ─────────────────────────────────────────────────────────
      const newAveragePrice =
        newTotalBoxes > 0 ? fixPrecision(newTotalAmount / newTotalBoxes) : 0;

      stockItem.totalAmount = newTotalAmount;
      stockItem.averagePrice = newAveragePrice;
      stockItem.status =
        newTotalBoxes > (stockItem.minStockLevel || 10)
          ? "In Stock"
          : newTotalBoxes > 0
            ? "Low Stock"
            : "Out of Stock";
      stockItem.updatedAt = new Date();

      console.log(`✅ Stock fully restored for "${productName}"`);
      console.log(`   totalBoxesFromBatches: ${totalBoxesFromBatches}`);
      console.log(
        `   removeStockAdjustment: ${previousRemoveAdj} → ${newRemoveStockAdjustment}`,
      );
      console.log(`   newTotalBoxes: ${newTotalBoxes}`);
      console.log(`   newTotalAmount: ${newTotalAmount}`);
      console.log(`   newAveragePrice: ${newAveragePrice}`);

      await stockItem.save({ session });

      if (ownSession) {
        await session.commitTransaction();
        session.endSession();
      }

      return {
        success: true,
        restored: restoredQty,
        newStockLevel: newTotalBoxes,
        newAmount: newTotalAmount,
        newAveragePrice,
        message: `Successfully restored ${restoredQty} units`,
      };
    } else {
      // No stock item found — create a new one as fallback
      console.log(
        `📦 Creating new stock item for "${productName}" with ${restoredQty} boxes`,
      );

      const newStockItem = new ReportInHand({
        productName: normalizeProductName(productName),
        supplierName: "System",
        type: "System",
        batches: [
          {
            boxes: restoredQty,
            lc: 0,
            fob: 0,
            cif: 0,
            amount: 0,
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
        totalAmount: 0,
        averagePrice: 0,
        status: "In Stock",
        minStockLevel: 10,
      });

      await newStockItem.save({ session });

      if (ownSession) {
        await session.commitTransaction();
        session.endSession();
      }

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
    if (ownSession) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error(`⚠️ Error during abortTransaction:`, abortErr);
      }
      try {
        session.endSession();
      } catch (endErr) {
        console.error(`⚠️ Error during endSession:`, endErr);
      }
    }
    return {
      success: false,
      restored: 0,
      message: `Failed to restore stock: ${error.message}`,
    };
  }
};

// ==========================================
// validateMR
// ==========================================
const validateMR = async (mrName, session = null) => {
  try {
    if (!mrName || mrName.trim() === "") {
      return { success: false, message: "MR name is required", exists: false };
    }
    const cleanedMrName = mrName.trim();
    if (cleanedMrName.toLowerCase() === "unknown") {
      return {
        success: true,
        message: `MR "Unknown" is allowed`,
        exists: true,
        isUnknown: true,
        mrData: { mrName: cleanedMrName, mrId: null },
      };
    }

    const query = Staff.findOne({
      medicalRepNameLower: cleanedMrName.toLowerCase(),
    });
    if (session) query.session(session);
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
      mrData: { mrName: mr.medicalRepName, mrId: mr._id },
    };
  } catch (error) {
    return {
      success: false,
      message: `Error validating MR: ${error.message}`,
      exists: false,
    };
  }
};

// ==========================================
// validateStockForImport
// ==========================================
const validateStockForImport = async (invoices) => {
  try {
    const stockIssues = [];
    const productStockMap = new Map();

    for (const invoice of invoices) {
      for (const product of invoice.products) {
        const productName = product.productName?.trim().toLowerCase();
        if (!productName) continue;

        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const requiredQty = fixPrecision(salesQty + bonusQty);
        if (requiredQty <= 0) continue;

        if (!productStockMap.has(productName)) {
          productStockMap.set(productName, {
            productName: productName,
            originalName: product.productName?.trim(),
            totalRequired: 0,
            requiredByInvoices: [],
            checked: false,
            productExists: false,
            availableStock: 0,
          });
        }
        const pd = productStockMap.get(productName);
        pd.totalRequired = fixPrecision(pd.totalRequired + requiredQty);
        pd.requiredByInvoices.push({
          invoiceNumber: invoice.invoiceNumber,
          requiredQty,
          salesQty,
          bonusQty,
          customerName: invoice.customerName,
        });
      }
    }

    for (const [normalizedName, productData] of productStockMap.entries()) {
      if (!productData.checked) {
        try {
          const stockCheck = await calculateProductStock(
            normalizedName,
            productData.totalRequired,
          );
          productData.availableStock = stockCheck.availableStock;
          productData.insufficient = stockCheck.insufficient;
          productData.insufficientQty = stockCheck.insufficientQty;
          productData.productExists = stockCheck.found;
          productData.stockCheckSuccess = stockCheck.success;

          if (stockCheck.insufficient || !stockCheck.found) {
            stockIssues.push({
              productName: productData.originalName || normalizedName,
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
          stockIssues.push({
            productName: productData.originalName || normalizedName,
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
      (i) => i.productExists && i.insufficient,
    ).length;
    const missingCount = stockIssues.filter((i) => !i.productExists).length;
    const totalRequired = Array.from(productStockMap.values()).reduce(
      (sum, p) => fixPrecision(sum + (p.totalRequired || 0)),
      0,
    );
    const totalAvailable = Array.from(productStockMap.values()).reduce(
      (sum, p) => fixPrecision(sum + (p.availableStock || 0)),
      0,
    );

    return {
      stockIssues,
      totalInvoices: invoices.length,
      summary: {
        totalProducts: productStockMap.size,
        totalRequired,
        totalAvailable,
        totalInsufficient: insufficientCount,
        missingProducts: missingCount,
        lowStockProducts: insufficientCount,
        hasCriticalIssues: stockIssues.some(
          (i) => i.type === "verification_error",
        ),
        hasInsufficientStock: insufficientCount > 0,
        importBlocked: insufficientCount > 0,
      },
      insufficientStockIssues: stockIssues.filter(
        (i) => i.productExists && i.insufficient,
      ),
      missingProductIssues: stockIssues.filter((i) => !i.productExists),
      importBlocked: insufficientCount > 0,
      blockReason:
        insufficientCount > 0
          ? "INSUFFICIENT_STOCK"
          : missingCount > 0
            ? "MISSING_PRODUCTS_ONLY"
            : "NO_ISSUES",
      message:
        insufficientCount > 0
          ? `${insufficientCount} product(s) have insufficient stock.`
          : missingCount > 0
            ? `${missingCount} product(s) not found.`
            : "All products have sufficient stock.",
    };
  } catch (error) {
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
// checkMRStock
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

    const mrStock = await resolveMRStock(mrId, mrName, session);

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
        : `❌ Insufficient MR stock: Required ${requiredQty}, Available ${availableStock}`,
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
// updateMRCashes
// ==========================================
const updateMRCashes = async (
  mrName,
  amount,
  invoiceNumber,
  date,
  session,
  isRefund = false,
  auditNote = null,
) => {
  console.log(`\n🔵 [updateMRCashes] CALLED`);
  console.log(`   mrName       : ${mrName}`);
  console.log(`   amount       : ${amount}`);
  console.log(`   invoiceNumber: ${invoiceNumber}`);
  console.log(`   date         : ${date}`);
  console.log(`   isRefund     : ${isRefund}`);
  console.log(`   auditNote    : ${auditNote}`);

  try {
    const cleanAmount = fixPrecision(Number(amount) || 0);
    console.log(`   cleanAmount (after fixPrecision): ${cleanAmount}`);

    if (cleanAmount === 0) {
      console.log(`   ⚠️  cleanAmount is 0 → skipping MR Cash update`);
      return { success: true, skipped: true, reason: "Amount is zero" };
    }

    if (!mrName || mrName.trim() === "") {
      console.log(`   ❌ mrName is empty or missing → throwing error`);
      throw new Error("medicalRepName is required to update MR Cash");
    }

    const normalizedName = mrName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    console.log(`   normalizedName (regex-escaped): ${normalizedName}`);

    const defaultNote = isRefund
      ? `Refund for invoice ${invoiceNumber}: -${cleanAmount}`
      : `Sale invoice ${invoiceNumber}: +${cleanAmount}`;
    const transactionNote = auditNote || defaultNote;
    console.log(`   transactionNote (final): ${transactionNote}`);

    console.log(
      `   🔍 Searching MRCash by mrName = "${normalizedName}" (case-insensitive)...`,
    );
    let mrCash = await MRCash.findOne({
      mrName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    }).session(session);
    console.log(
      `   MRCash by-name lookup: ${mrCash ? `FOUND → _id=${mrCash._id}, mrId=${mrCash.mrId}, currentCash=${mrCash.currentCash}` : "NOT FOUND"}`,
    );

    let mr;
    if (mrCash) {
      console.log(`   🔍 Fetching Staff by mrCash.mrId = ${mrCash.mrId}...`);
      mr = await Staff.findById(mrCash.mrId).session(session);
      console.log(
        `   Staff by-id lookup: ${mr ? `FOUND → name="${mr.medicalRepName}"` : "NOT FOUND (falling back to name search)"}`,
      );

      if (!mr) {
        console.warn(
          `   ⚠️  Staff _id ${mrCash.mrId} not found. Falling back to name search.`,
        );
        mr = await Staff.findOne({
          medicalRepName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
        }).session(session);
        console.log(
          `   Staff name-fallback: ${mr ? `FOUND → _id=${mr._id}` : "NOT FOUND"}`,
        );
      }
    } else {
      console.log(
        `   🔍 Searching Staff for medicalRepName = "${normalizedName}" (case-insensitive)...`,
      );
      mr = await Staff.findOne({
        medicalRepName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
      }).session(session);
      console.log(
        `   Staff lookup result: ${mr ? `FOUND → _id=${mr._id}, name="${mr.medicalRepName}"` : "NOT FOUND"}`,
      );
    }

    if (!mr) {
      console.log(`   ❌ MR not found in Staff → throwing error`);
      throw new Error(`MR not found with name "${mrName}"`);
    }

    if (!mrCash) {
      const initialCash = isRefund ? 0 : cleanAmount;
      console.log(
        `   isRefund=${isRefund} → initialCash set to: ${initialCash}`,
      );

      if (isRefund && cleanAmount > 0) {
        console.warn(
          `⚠️  MR Cash record not found for "${mrName}" during refund. ` +
            `Cash initialised to 0 (would have been -${cleanAmount}).`,
        );
      }

      console.log(
        `   📝 Creating new MRCash document for mrId=${mr._id}, mrName="${mr.medicalRepName}"...`,
      );
      mrCash = new MRCash({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        currentCash: initialCash,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial creation – ${transactionNote}`,
        isActive: true,
      });

      console.log(`   💾 Saving new MRCash → currentCash=${initialCash}...`);
      await mrCash.save({ session });
      console.log(`   ✅ New MRCash saved successfully`);

      return {
        success: true,
        mrCash,
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash,
        changeAmount: cleanAmount,
        isRefund,
      };
    }

    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    console.log(`   previousAmount (current cash in DB): ${previousAmount}`);

    let newCashAmount;

    if (isRefund) {
      console.log(
        `   isRefund=true → SUBTRACTING ${cleanAmount} from ${previousAmount}`,
      );
      const raw = fixPrecision(previousAmount - cleanAmount);
      console.log(`   raw result (${previousAmount} - ${cleanAmount}): ${raw}`);

      if (raw < 0) {
        console.warn(
          `⚠️  MR Cash for "${mrName}" would go negative ` +
            `(${previousAmount} - ${cleanAmount} = ${raw}). Clamped to 0.`,
        );
        console.log(`   raw < 0 → clamping newCashAmount to 0`);
        newCashAmount = 0;
      } else {
        console.log(`   raw >= 0 → newCashAmount = ${raw}`);
        newCashAmount = raw;
      }
    } else {
      console.log(
        `   isRefund=false → ADDING ${cleanAmount} to ${previousAmount}`,
      );
      newCashAmount = fixPrecision(previousAmount + cleanAmount);
      console.log(
        `   newCashAmount (${previousAmount} + ${cleanAmount}): ${newCashAmount}`,
      );
    }

    console.log(
      `   📊 Cash transition: ${previousAmount} → ${newCashAmount} (delta: ${fixPrecision(newCashAmount - previousAmount)})`,
    );

    mrCash.currentCash = newCashAmount;
    console.log(`   mrCash.currentCash set to: ${mrCash.currentCash}`);

    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n${transactionNote}`
      : transactionNote;
    console.log(`   mrCash.notes updated (appended transactionNote)`);

    mrCash.updatedAt = new Date();
    console.log(`   mrCash.updatedAt set to: ${mrCash.updatedAt}`);

    console.log(
      `   💾 Saving updated MRCash _id=${mrCash._id} for mrId=${mrCash.mrId}...`,
    );
    await mrCash.save({ session });
    console.log(
      `   ✅ MRCash saved successfully → previousAmount=${previousAmount}, newAmount=${newCashAmount}, isRefund=${isRefund}`,
    );

    return {
      success: true,
      mrCash,
      action: "updated_existing",
      previousAmount,
      newAmount: newCashAmount,
      changeAmount: cleanAmount,
      isRefund,
    };
  } catch (error) {
    console.error(
      `❌ [updateMRCashes] ERROR for mrName="${mrName}", invoiceNumber="${invoiceNumber}"`,
    );
    console.error(`   error.message: ${error.message}`);
    console.error(`   stack: ${error.stack}`);
    return { success: false, error: error.message };
  }
};

// ==========================================
// computePaidAmount
// ==========================================
const computePaidAmount = (paymentStatus, totalAmount, rawPaidAmount) => {
  const status = (paymentStatus || "").toLowerCase().trim();
  if (status === "cash" || status === "paid") {
    return fixPrecision(totalAmount);
  }
  if (
    status === "credit" ||
    status === "unpaid" ||
    status === "due" ||
    status === "pending"
  ) {
    return 0;
  }
  if (status === "partial paid" || status === "partial") {
    return fixPrecision(
      Math.min(Math.max(0, parseFloat(rawPaidAmount) || 0), totalAmount),
    );
  }
  return 0;
};

const buildMatchConditions = (search, tab, saleType) => {
  const matchConditions = {};
  const andConditions = [];

  if (search && search.trim()) {
    const searchRegex = new RegExp(escapeRegexForSearch(search.trim()), "i");
    andConditions.push({
      $or: [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { mrName: searchRegex },
        { customerCode: searchRegex },
        { "products.productName": searchRegex },
      ],
    });
  }

  if (tab && tab !== "All") {
    matchConditions.paymentStatus = new RegExp(
      `^${escapeRegexForSearch(tab)}$`,
      "i",
    );
  }

  if (saleType && saleType !== "all") {
    if (saleType === "mr") {
      matchConditions.saleType = { $regex: /^MR Sale$/i };
    } else if (saleType === "normal") {
      andConditions.push({
        $or: [
          { saleType: { $exists: false } },
          { saleType: { $not: /^MR Sale$/i } },
        ],
      });
    }
  }

  if (andConditions.length > 0) matchConditions.$and = andConditions;
  return matchConditions;
};

async function resolveMRStock(mrId, mrNameHint, session) {
  if (mrId) {
    try {
      const byOid = await stockInMRHand
        .findOne({ mrId: new mongoose.Types.ObjectId(String(mrId)) })
        .session(session);
      if (byOid) return byOid;
    } catch (_) {}

    try {
      const byRaw = await stockInMRHand
        .findOne({ mrId: String(mrId) })
        .session(session);
      if (byRaw) return byRaw;
    } catch (_) {}
  }

  if (mrNameHint && mrNameHint.trim()) {
    const escapedName = mrNameHint
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const byName = await stockInMRHand
      .findOne({ mrName: { $regex: new RegExp(`^${escapedName}$`, "i") } })
      .session(session);
    if (byName) return byName;
  }

  return null;
}

async function deductStockFromMRHand(
  mrId,
  productName,
  salesQty,
  bonusQty,
  session,
  mrNameHint = null,
) {
  const totalQty = fixPrecision(Number(salesQty || 0) + Number(bonusQty || 0));

  let mrStock = await resolveMRStock(mrId, mrNameHint, session);

  if (!mrStock) {
    return {
      success: false,
      message: `StockInMRHand not found for mrId: ${mrId}${mrNameHint ? ` / mrName: ${mrNameHint}` : ""}`,
    };
  }

  const trimmedName = productName.trim().toLowerCase();
  const productIndex = mrStock.productsInHand.findIndex(
    (p) => p.productName?.trim().toLowerCase() === trimmedName,
  );

  if (productIndex < 0) {
    return {
      success: false,
      message: `Product "${productName}" not found in ${mrStock.mrName}'s stock.`,
    };
  }

  const productEntry = mrStock.productsInHand[productIndex];
  const currentQty = fixPrecision(Number(productEntry.quantity) || 0);
  const lcValue = fixPrecision(Number(productEntry.lc) || 0);

  if (currentQty < totalQty) {
    return {
      success: false,
      message: `Insufficient MR stock for "${productName}". Available: ${currentQty}, Required: ${totalQty}`,
    };
  }

  const newQty = fixPrecision(currentQty - totalQty);
  productEntry.quantity = newQty;
  productEntry.lastUpdated = new Date();

  const amountToDeduct = fixPrecision(lcValue * totalQty);
  const currentProductAmount = fixPrecision(Number(productEntry.amount) || 0);
  productEntry.amount = fixPrecision(
    Math.max(0, currentProductAmount - amountToDeduct),
  );

  if (productEntry.productValue !== undefined) {
    productEntry.productValue = fixPrecision(newQty * lcValue);
  }

  let newTotalAmount = 0;
  for (const p of mrStock.productsInHand) {
    newTotalAmount = fixPrecision(
      newTotalAmount + fixPrecision(Number(p.amount) || 0),
    );
  }
  mrStock.totalAmount = newTotalAmount;

  await mrStock.save({ session });

  return {
    success: true,
    amountDeducted: amountToDeduct,
    mrSalePurchasePrice: amountToDeduct,
    lc: lcValue,
    deductedQty: totalQty,
    previousStock: currentQty,
    newStock: newQty,
    previousAmount: currentProductAmount,
    newAmount: productEntry.amount,
    newTotalAmount,
  };
}

async function getMRStockQuantity(
  mrId,
  productName,
  session,
  mrNameHint = null,
) {
  const mrStock = await resolveMRStock(mrId, mrNameHint, session);
  if (!mrStock) return 0;

  const trimmedProductName = productName.trim().toLowerCase();
  const productEntry = mrStock.productsInHand.find(
    (p) => p.productName?.trim().toLowerCase() === trimmedProductName,
  );

  if (!productEntry) return 0;

  return fixPrecision(Number(productEntry.quantity) || 0);
}

async function restoreStockToMRHand(
  mrId,
  productName,
  qty,
  lc,
  session,
  mrNameHint = null,
) {
  const mrStock = await resolveMRStock(mrId, mrNameHint, session);

  if (!mrStock) {
    return {
      success: false,
      message: `StockInMRHand not found for mrId: ${mrId}${mrNameHint ? ` / mrName: ${mrNameHint}` : ""}`,
    };
  }

  const trimmedProductName = productName.trim().toLowerCase();
  const productIndex = mrStock.productsInHand.findIndex(
    (p) => p.productName?.trim().toLowerCase() === trimmedProductName,
  );

  if (productIndex >= 0) {
    const oldQty = Number(mrStock.productsInHand[productIndex].quantity) || 0;
    const newQty = fixPrecision(oldQty + qty);
    const lcValue = fixPrecision(
      Number(mrStock.productsInHand[productIndex].lc) || lc || 0,
    );
    mrStock.productsInHand[productIndex].quantity = newQty;
    mrStock.productsInHand[productIndex].lastUpdated = new Date();
    const restoredAmount = fixPrecision(lcValue * qty);
    const currentAmount = fixPrecision(
      Number(mrStock.productsInHand[productIndex].amount) || 0,
    );
    mrStock.productsInHand[productIndex].amount = fixPrecision(
      currentAmount + restoredAmount,
    );
    if (mrStock.productsInHand[productIndex].productValue !== undefined) {
      mrStock.productsInHand[productIndex].productValue = fixPrecision(
        newQty * lcValue,
      );
    }
  } else {
    mrStock.productsInHand.push({
      productName: productName.trim(),
      quantity: fixPrecision(qty),
      lc: lc || 0,
      amount: fixPrecision((lc || 0) * qty),
      lastUpdated: new Date(),
    });
  }

  let newTotalAmount = 0;
  for (const p of mrStock.productsInHand) {
    newTotalAmount = fixPrecision(
      newTotalAmount + fixPrecision(Number(p.amount) || 0),
    );
  }
  mrStock.totalAmount = newTotalAmount;

  await mrStock.save({ session });
  return { success: true };
}

// ==========================================
// parseUTCDate helper — stores date exactly as selected (no offset)
// ==========================================
const parseUTCDate = (dateStr) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// ==========================================
// parseInvoiceDate helper — FIX: stores date exactly as selected (no +1/+2 day offset)
// ==========================================
const parseInvoiceDate = (dateStr) => {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// ==========================================
// CREATE SALE (Manual)
// ==========================================
router.post("/create", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const data = req.body;
    const isMRSale = data.isMRSale || false;

    if (!data.invoiceNumber?.trim())
      throw new Error("Invoice number is required");
    if (!isMRSale && !data.mrName?.trim())
      throw new Error("MR Name is required");

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: data.invoiceNumber.trim(),
    }).session(session);
    if (existingInvoice) throw new Error("Invoice number already exists");

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
    let totalAmount = 0,
      totalProfitLoss = 0,
      totalCostAmount = 0;
    const stockDeductionResults = [];

    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      if (isMRSale) {
        if (!p.mrId)
          throw new Error(`MR not selected for product: ${p.productName}`);

        let mrStock = null;
        try {
          mrStock = await stockInMRHand
            .findOne({
              mrId: new mongoose.Types.ObjectId(p.mrId),
            })
            .session(session);
        } catch {
          mrStock = await stockInMRHand
            .findOne({ mrId: p.mrId })
            .session(session);
        }

        if (!mrStock)
          throw new Error(`MR stock not found for MR ID: ${p.mrId}`);

        const normalizedProductName = p.productName?.toLowerCase().trim() || "";
        const mrProduct = mrStock.productsInHand?.find(
          (prod) =>
            prod &&
            prod.productName &&
            prod.productName.toLowerCase().trim() === normalizedProductName,
        );

        if (!mrProduct) {
          throw new Error(
            `Product "${p.productName}" not found in ${mrStock.mrName}'s stock. Available: ${
              mrStock.productsInHand?.map((p) => p.productName).join(", ") ||
              "None"
            }`,
          );
        }

        const availableQty = fixPrecision(Number(mrProduct.quantity) || 0);
        if (availableQty < totalQty) {
          throw new Error(
            `Insufficient MR stock for ${p.productName}. Available: ${availableQty}, Required: ${totalQty}`,
          );
        }
      } else {
        const stockItem = await findStockItemFlexible(p.productName, session);
        if (!stockItem)
          throw new Error(`Product "${p.productName}" not found in inventory`);
        const realBatchesForCheck = getRealBatches(stockItem.batches || []);
        let actualBatchSum = 0;
        for (const b of realBatchesForCheck)
          actualBatchSum = fixPrecision(actualBatchSum + Number(b.boxes || 0));
        const addAdj = fixPrecision(Number(stockItem.addStockAdjustment || 0));
        const removeAdj = fixPrecision(
          Number(stockItem.removeStockAdjustment || 0),
        );
        const availableStock = fixPrecision(
          Math.max(0, actualBatchSum + addAdj - removeAdj),
        );
        if (availableStock < totalQty) {
          throw new Error(
            `Insufficient warehouse stock for ${p.productName}. Required: ${totalQty}, Available: ${availableStock}`,
          );
        }
      }
    }

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
      let mrSalePurchasePrice = 0;

      if (isMRSale) {
        const deductionResult = await deductStockFromMRHand(
          p.mrId,
          p.productName.trim(),
          salesQty,
          bonusQty,
          session,
          (p.mrName || "").trim(),
        );

        if (!deductionResult.success) {
          throw new Error(
            `MR stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );
        }

        const amountDeducted = deductionResult.amountDeducted || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);
        mrSalePurchasePrice = deductionResult.mrSalePurchasePrice || 0;
        lc = deductionResult.lc;

        stockDeductionResults.push({
          product: p.productName.trim(),
          mrId: p.mrId,
          mrName: p.mrName,
          ...deductionResult,
          amountDeducted,
          mrSalePurchasePrice,
        });
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

        if (!deductionResult.success) {
          throw new Error(
            `Warehouse stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );
        }

        const amountDeducted = deductionResult.amountDeducted || 0;
        totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);

        stockDeductionResults.push({
          product: p.productName.trim(),
          ...deductionResult,
          amountDeducted,
        });
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
        mrSalePurchasePrice: isMRSale ? mrSalePurchasePrice : 0,
      };

      if (isMRSale) {
        productData.mrId = p.mrId;
        productData.mrName = p.mrName;
      }

      processedProducts.push(productData);
      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
    }

    if (!processedProducts.length)
      throw new Error("At least one valid product is required");

    const paymentStatus = mapPaymentStatus(data.paymentStatus);
    const paidAmount = computePaidAmount(
      paymentStatus,
      totalAmount,
      data.paidAmount,
    );
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    let mrName = data.mrName;
    let mrId = data.mrId;
    if (isMRSale && processedProducts.length > 0) {
      mrName = processedProducts[0].mrName || "MR Sale";
      mrId = processedProducts[0].mrId;
    }

    const saleData = {
      recordingDate: data.recordingDate
        ? parseUTCDate(data.recordingDate)
        : new Date(),
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate
        ? parseInvoiceDate(data.invoiceDate)
        : new Date(),
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
        saleData.invoiceDate,
        session,
        false,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped)
        console.warn(`⚠️ Failed to update MR Cash: ${mrCashUpdate.error}`);
    }

    // ✅ Log create activity
    await logActivity(req, {
      action: "CREATE",
      actionLabel: `Created Sale: ${sale[0].invoiceNumber}`,
      tableName: "sales",
      tableLabel: "Sale",
      recordId: sale[0]._id,
      referenceNumber: sale[0].invoiceNumber,
      newData: sale[0].toObject(),
      description: `New sale invoice ${sale[0].invoiceNumber} created for ${toTitleCase(customerName)}`,
    });

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: isMRSale
        ? "MR Sale created successfully"
        : "Sale created successfully with stock deduction",
      sale: sale[0],
      stockDeductionResults,
      costAmount: fixPrecision(totalCostAmount),
    });
  } catch (err) {
    console.error("❌ Error creating sale:", err.message);
    try {
      await session.abortTransaction();
    } catch {}
    try {
      session.endSession();
    } catch {}
    res
      .status(500)
      .json({ success: false, error: err.message || "Failed to create sale" });
  }
});

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
    if (!invoiceData.invoiceNumber?.trim())
      throw new Error("Invoice number is required");

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
          `Invoice number ${invoiceData.invoiceNumber} already exists but cannot be merged: ${
            mergeCheck.reason || "Incompatible data"
          }`,
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
          if (prodName && !productToMrMap.has(prodName))
            productToMrMap.set(prodName, mrName);
        }
      }
    } else if (invoiceHeaderMR && invoiceData.isMrSaleImport) {
      for (const prod of invoiceData.products || []) {
        const prodName = prod.productName?.trim();
        if (prodName) productToMrMap.set(prodName, invoiceHeaderMR);
      }
    }

    const processedProducts = [];
    let totalAmount = 0,
      totalProfitLoss = 0,
      totalCostAmount = 0;
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
      let mrSalePurchasePrice = 0;

      if (isMRSale) {
        const mrValidation = await validateMR(productMrName, session);
        if (!mrValidation.success)
          throw new Error(
            `Invalid MR "${productMrName}" for product ${productName}: ${mrValidation.message}`,
          );
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
          } else
            throw new Error(
              mrStockCheck.message ||
                `Insufficient MR stock for ${productName}`,
            );
        }

        if (!bypassStockCheck) {
          const deductionResult = await deductStockFromMRHand(
            mrId,
            productName,
            salesQty,
            bonusQty,
            session,
            (productMrName || "").trim(),
          );

          if (!deductionResult.success)
            throw new Error(
              `MR stock deduction failed for ${productName}: ${deductionResult.message}`,
            );

          const amountDeducted = deductionResult.amountDeducted || 0;
          totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);
          stockDeductionResults.push({
            product: productName,
            mrId,
            mrName: productMrName,
            ...deductionResult,
            amountDeducted,
            mrSalePurchasePrice: deductionResult.mrSalePurchasePrice || 0,
          });
          lc = deductionResult.lc;
          mrSalePurchasePrice = deductionResult.mrSalePurchasePrice || 0;
        } else {
          lc = product.lc || 0;
          mrSalePurchasePrice = fixPrecision(lc * totalQty);
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
          const realBatchesForCheck = getRealBatches(stockItem.batches || []);
          let actualBatchSum = 0;
          for (const b of realBatchesForCheck)
            actualBatchSum = fixPrecision(
              actualBatchSum + Number(b.boxes || 0),
            );
          const addAdj = fixPrecision(
            Number(stockItem.addStockAdjustment || 0),
          );
          const removeAdj = fixPrecision(
            Number(stockItem.removeStockAdjustment || 0),
          );
          const currentAvailableStock = fixPrecision(
            Math.max(0, actualBatchSum + addAdj - removeAdj),
          );

          if (currentAvailableStock < totalQty && !bypassStockCheck) {
            throw new Error(
              `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${currentAvailableStock}`,
            );
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
          const amountDeducted = deductionResult.amountDeducted || 0;
          totalCostAmount = fixPrecision(totalCostAmount + amountDeducted);
          stockDeductionResults.push({
            product: productName,
            ...deductionResult,
            amountDeducted,
          });
          if (!deductionResult.success)
            throw new Error(
              `Stock deduction failed for ${productName}: ${deductionResult.message}`,
            );
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
        mrSalePurchasePrice: isMRSale ? mrSalePurchasePrice : 0,
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

    if (processedProducts.length === 0)
      throw new Error("No valid products found in invoice");

    const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
    const paidAmount = computePaidAmount(
      paymentStatus,
      totalAmount,
      invoiceData.paidAmount,
    );
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    let primaryMR = invoiceData.mrName?.trim() || "No MR Name Provided";
    if (invoiceData._mrDistribution && invoiceData._mrDistribution.size > 0) {
      primaryMR = Array.from(invoiceData._mrDistribution.keys())[0];
    }

    const saleRecord = new SaleSummary({
      recordingDate: invoiceData.recordingDate
        ? parseUTCDate(invoiceData.recordingDate)
        : new Date(),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate
        ? parseInvoiceDate(invoiceData.invoiceDate)
        : new Date(),
      mrName: primaryMR,
      mrId: invoiceData.mrId || null,
      customerName,
      customerCode,
      customerId,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? parseUTCDate(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? parseUTCDate(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: fixPrecision(totalProfitLoss),
      costAmount: fixPrecision(totalCostAmount),
      paymentStatus,
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
            saleRecord.invoiceDate,
            session,
            false,
          );
          if (mrCashUpdate.success) mrCashUpdates[mrName] = mrAmount;
          else if (!mrCashUpdate.skipped)
            console.error(
              `⚠️ Failed to update MR Cash for ${mrName}: ${mrCashUpdate.error}`,
            );
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
      if (session.transaction?.isActive) await session.abortTransaction();
    } catch {}
    try {
      await session.endSession();
    } catch {}
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
  let successful = 0,
    failed = 0,
    skippedDuplicates = 0,
    mergedInvoices = 0;
  let totalMRCashAdded = 0,
    totalCostAmount = 0;

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
            message: `MR not found: ${mrValidation.message}`,
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
            const isDuplicate = existing.products.some(
              (ep) =>
                ep.productName?.trim() === productName &&
                fixPrecision(parseFloat(ep.salesQty) || 0) === salesQty &&
                fixPrecision(parseFloat(ep.bonusQty) || 0) === bonusQty &&
                fixPrecision(parseFloat(ep.sellingPrice) || 0) ===
                  sellingPrice &&
                fixPrecision(parseFloat(ep.discount) || 0) === discount,
            );
            if (!isDuplicate) {
              existing.products.push(newProduct);
              if (!existing._mrDistribution.has(newMrName))
                existing._mrDistribution.set(newMrName, {
                  products: [],
                  mrName: newMrName,
                });
              existing._mrDistribution.get(newMrName).products.push(newProduct);
            } else {
              if (!progress.duplicateProductsSkipped)
                progress.duplicateProductsSkipped = 0;
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
          if (result.action === "merged") mergedInvoices++;
          else successful++;
          if (result.mrCashUpdates) {
            for (const [, amount] of Object.entries(result.mrCashUpdates))
              totalMRCashAdded = fixPrecision(totalMRCashAdded + amount);
          }
          if (result.costAmount)
            totalCostAmount = fixPrecision(totalCostAmount + result.costAmount);
        } else {
          failed++;
          if (result.error) errors.push(result.error);
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
  }
};

// ✅ ADD LOG ACTIVITY FOR IMPORT
router.post("/import-with-stock-deduction", async (req, res) => {
  let sessionId = null;
  try {
    const { invoices, bypassStockCheck = false } = req.body;
    const invoiceData = (Array.isArray(invoices) ? invoices : []).map(
      (inv) => ({ ...inv, customerName: inv.customerName || "Unknown" }),
    );
    if (!invoiceData.length)
      return res
        .status(400)
        .json({ success: false, message: "No invoices provided" });
    if (isImportInProgress)
      return res.status(429).json({
        success: false,
        message: "Another import in progress",
        retryAfter: 30,
      });

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

    // Start async import process
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

router.post("/fix-stock-amounts", protect, allowAdminOnly, async (req, res) => {
  try {
    const allStock = await ReportInHand.find({});
    const results = [];

    for (const stockItem of allStock) {
      try {
        let correctTotalAmount = 0;
        let correctTotalBoxes = 0;

        for (const batch of stockItem.batches || []) {
          const type = batch.adjustmentType;
          if (!type || type === "batch") {
            const boxes = fixPrecision(Number(batch.boxes || 0));
            const lc = fixPrecision(Number(batch.lc || 0));
            if (boxes > 0) {
              const batchAmount = fixPrecision(boxes * lc);
              batch.amount = batchAmount;
              correctTotalAmount = fixPrecision(
                correctTotalAmount + batchAmount,
              );
              correctTotalBoxes = fixPrecision(correctTotalBoxes + boxes);
            } else {
              batch.amount = 0;
            }
          }
        }

        const addAdj = fixPrecision(Number(stockItem.addStockAdjustment || 0));
        const removeAdj = fixPrecision(
          Number(stockItem.removeStockAdjustment || 0),
        );
        const newTotalBoxes = fixPrecision(
          Math.max(0, correctTotalBoxes + addAdj - removeAdj),
        );
        const newAveragePrice =
          newTotalBoxes > 0
            ? fixPrecision(correctTotalAmount / newTotalBoxes)
            : 0;

        const oldAmount = stockItem.totalAmount;
        const oldTotalBoxesFromBatches = stockItem.totalBoxesFromBatches;
        const amountChanged =
          Math.abs(correctTotalAmount - (oldAmount || 0)) > 0.001;
        const batchBoxesChanged =
          Math.abs(correctTotalBoxes - (oldTotalBoxesFromBatches || 0)) > 0.001;

        if (amountChanged || batchBoxesChanged) {
          stockItem.totalAmount = correctTotalAmount;
          stockItem.totalBoxesFromBatches = correctTotalBoxes;
          stockItem.averagePrice = newAveragePrice;
          if (newTotalBoxes <= 0) stockItem.status = "Out of Stock";
          else if (newTotalBoxes < (stockItem.minStockLevel || 10))
            stockItem.status = "Low Stock";
          else stockItem.status = "In Stock";
          await stockItem.save();
        }

        results.push({
          productName: stockItem.productName,
          oldAmount,
          newAmount: correctTotalAmount,
          oldTotalBoxesFromBatches,
          newTotalBoxesFromBatches: correctTotalBoxes,
          totalBoxes: newTotalBoxes,
          addAdj,
          removeAdj,
          fixed: amountChanged || batchBoxesChanged,
        });
      } catch (err) {
        results.push({
          productName: stockItem.productName,
          error: err.message,
          fixed: false,
        });
      }
    }

    res.json({
      success: true,
      message: `Fixed ${results.filter((r) => r.fixed).length} of ${results.length} stock records`,
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
            notes: `Synced from ${mrData.invoiceCount} sales.`,
            isActive: true,
          });
        } else {
          mrCash.currentCash = totalCash;
          mrCash.notes = `Synced from ${mrData.invoiceCount} sales. Total: ${totalCash}`;
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
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        results.push({
          mrName: mrData._id,
          success: false,
          error: error.message,
        });
      }
    }

    return res.json({
      success: true,
      message: "MR Cash synchronization completed",
      results,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to synchronize MR Cash",
      error: error.message,
    });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { search = "", tab = "All", saleType = "all" } = req.query;
    const matchConditions = buildMatchConditions(search, tab, saleType);

    const enrichedSales = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $sort: { recordingDate: -1 } },
      {
        $lookup: {
          from: "customers",
          localField: "customerId",
          foreignField: "_id",
          as: "_customerDoc",
          pipeline: [
            {
              $project: {
                customerNumber: 1,
                zone: 1,
                province: 1,
                address: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          customerPhone: {
            $ifNull: [{ $first: "$_customerDoc.customerNumber" }, ""],
          },
          customerZone: { $ifNull: [{ $first: "$_customerDoc.zone" }, ""] },
          customerProvince: {
            $ifNull: [{ $first: "$_customerDoc.province" }, ""],
          },
          customerAddress: {
            $ifNull: [{ $first: "$_customerDoc.address" }, ""],
          },
        },
      },
      { $unset: "_customerDoc" },
    ]);

    res
      .status(200)
      .json({ summaries: enrichedSales, count: enrichedSales.length });
  } catch (error) {
    console.error("Fetch Sale Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sale summaries",
      error: error.message,
      summaries: [],
      count: 0,
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
    if (!productName)
      return res
        .status(400)
        .json({ success: false, message: "Product name is required" });
    let totalQty = parseFloat(requiredQty) || 0;
    if (totalQty === 0)
      totalQty = (parseFloat(salesQty) || 0) + (parseFloat(bonusQty) || 0);
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
    if (!invoices || !Array.isArray(invoices))
      return res
        .status(400)
        .json({ success: false, message: "Invoices array is required" });
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
    if (!productName)
      return res
        .status(400)
        .json({ success: false, message: "Product name is required" });
    const stockItem = await findStockItemFlexible(productName);
    if (!stockItem)
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found`,
      });

    const realBatches = getRealBatches(stockItem.batches || []);
    const auditBatches = (stockItem.batches || []).filter(
      (b) => b.adjustmentType && b.adjustmentType !== "batch",
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
        actualBatchBoxes: batchTotal,
        actualComputedStock: Math.max(
          0,
          batchTotal +
            (stockItem.addStockAdjustment || 0) -
            (stockItem.removeStockAdjustment || 0),
        ),
        totalAmount: stockItem.totalAmount,
        averagePrice: stockItem.averagePrice,
      },
      batches: {
        totalBatches: stockItem.batches?.length || 0,
        realBatches: realBatches.length,
        auditBatches: auditBatches.length,
        batchTotal,
        batchDetails: realBatches.map((b) => ({
          batchNumber: b.batchNumber,
          boxes: b.boxes,
          lc: b.lc,
          amount: b.amount,
          expiryDate: b.expiryDate,
          date: b.date,
        })),
        auditDetails: auditBatches.map((b) => ({
          batchNumber: b.batchNumber,
          boxes: b.boxes,
          adjustmentType: b.adjustmentType,
          date: b.date,
          note: "EXCLUDED",
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
    if (progress.completed && now - progress.endTime > STALE_THRESHOLD)
      importProgressMap.delete(sessionId);
  }
};
setInterval(cleanupStaleImportSessions, 60 * 60 * 1000);

router.get("/import/progress/:sessionId", (req, res) => {
  try {
    const progress = importProgressMap.get(req.params.sessionId);
    if (!progress)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
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
    if (!mrNames || !Array.isArray(mrNames))
      return res
        .status(400)
        .json({ success: false, message: "MR names array required" });
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
    if (!invoices || !Array.isArray(invoices))
      return res
        .status(400)
        .json({ success: false, message: "Invoices array is required" });

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

    res.json({
      success: true,
      validationResult: {
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
            ? `${mrIssues.length} MRs not found in Staff system.`
            : "All MRs are valid.",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to validate MRs",
      error: error.message,
    });
  }
});

router.post("/check-duplicates", protect, async (req, res) => {
  try {
    const { invoiceNumbers } = req.body;
    if (!Array.isArray(invoiceNumbers) || invoiceNumbers.length === 0) {
      return res.json({ success: true, existingInvoices: [] });
    }

    const existing = await SaleSummary.find({
      invoiceNumber: { $in: invoiceNumbers },
    }).distinct("invoiceNumber");

    res.json({ success: true, existingInvoices: existing });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/validate-import-mr-stock", protect, async (req, res) => {
  try {
    const { invoices } = req.body;
    if (!invoices || !Array.isArray(invoices)) {
      return res
        .status(400)
        .json({ success: false, message: "Invoices array required" });
    }

    const productMrMap = new Map();
    const mrNameToIdMap = new Map();

    for (const invoice of invoices) {
      const mrName = invoice.mrName?.trim();
      if (!mrName) continue;

      for (const product of invoice.products || []) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const totalQty = salesQty + bonusQty;
        if (totalQty <= 0) continue;

        const key = `${mrName}|${productName}`;
        if (!productMrMap.has(key)) {
          productMrMap.set(key, {
            mrName,
            productName,
            totalRequired: 0,
            invoices: [],
          });
        }
        const entry = productMrMap.get(key);
        entry.totalRequired = fixPrecision(entry.totalRequired + totalQty);
        entry.invoices.push({
          invoiceNumber: invoice.invoiceNumber,
          requiredQty: totalQty,
        });
      }
    }

    const stockIssues = [];
    for (const [key, entry] of productMrMap.entries()) {
      const { mrName, productName, totalRequired } = entry;

      let mrId = mrNameToIdMap.get(mrName);
      if (!mrId) {
        const mr = await Staff.findOne({
          medicalRepNameLower: mrName.toLowerCase(),
        }).lean();
        if (!mr) {
          stockIssues.push({
            mrName,
            productName,
            totalRequired,
            availableStock: 0,
            insufficientQty: totalRequired,
            productExists: false,
            insufficient: true,
            message: `MR "${mrName}" not found in Staff system`,
            type: "mr_not_found",
          });
          continue;
        }
        mrId = mr._id.toString();
        mrNameToIdMap.set(mrName, mrId);
      }

      let mrStock = null;
      try {
        mrStock = await stockInMRHand
          .findOne({
            mrId: new mongoose.Types.ObjectId(mrId),
          })
          .lean();
      } catch {
        mrStock = await stockInMRHand.findOne({ mrId }).lean();
      }

      if (!mrStock) {
        stockIssues.push({
          mrName,
          productName,
          totalRequired,
          availableStock: 0,
          insufficientQty: totalRequired,
          productExists: false,
          insufficient: true,
          message: `Stock record not found for MR "${mrName}"`,
          type: "mr_stock_missing",
        });
        continue;
      }

      const normalizedProductName = productName.toLowerCase().trim();
      const productInHand = mrStock.productsInHand?.find(
        (p) => p.productName?.toLowerCase().trim() === normalizedProductName,
      );

      if (!productInHand) {
        stockIssues.push({
          mrName,
          productName,
          totalRequired,
          availableStock: 0,
          insufficientQty: totalRequired,
          productExists: false,
          insufficient: true,
          message: `Product "${productName}" not found in ${mrName}'s hand stock`,
          type: "product_not_found_in_mr",
        });
        continue;
      }

      const availableStock = fixPrecision(Number(productInHand.quantity) || 0);
      const insufficient = availableStock < totalRequired;
      const insufficientQty = insufficient ? totalRequired - availableStock : 0;

      if (insufficient) {
        stockIssues.push({
          mrName,
          productName,
          totalRequired,
          availableStock,
          insufficientQty,
          productExists: true,
          insufficient: true,
          message: `Insufficient MR stock: Required ${totalRequired}, Available ${availableStock}`,
          type: "insufficient_mr_stock",
        });
      }
    }

    const summary = {
      totalProducts: productMrMap.size,
      totalRequired: Array.from(productMrMap.values()).reduce(
        (s, e) => s + e.totalRequired,
        0,
      ),
      totalAvailable: stockIssues.reduce(
        (s, e) => s + (e.availableStock || 0),
        0,
      ),
      totalInsufficient: stockIssues.filter(
        (i) => i.insufficient && i.productExists,
      ).length,
      missingProducts: stockIssues.filter((i) => !i.productExists).length,
      hasInsufficientStock: stockIssues.some(
        (i) => i.insufficient && i.productExists,
      ),
      importBlocked: stockIssues.some((i) => i.insufficient && i.productExists),
    };

    res.json({
      success: true,
      validationResult: {
        stockIssues,
        totalInvoices: invoices.length,
        summary,
        insufficientStockIssues: stockIssues.filter(
          (i) => i.productExists && i.insufficient,
        ),
        missingProductIssues: stockIssues.filter((i) => !i.productExists),
        importBlocked: summary.importBlocked,
        blockReason: summary.importBlocked
          ? "INSUFFICIENT_MR_STOCK"
          : summary.missingProducts > 0
            ? "MISSING_PRODUCTS_ONLY"
            : "NO_ISSUES",
        message: summary.importBlocked
          ? `${summary.totalInsufficient} product(s) have insufficient MR hand stock.`
          : summary.missingProducts > 0
            ? `${summary.missingProducts} product(s) not found in MR hand stock.`
            : "All MR hand stock sufficient.",
      },
    });
  } catch (error) {
    console.error("MR stock validation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate MR stock",
      error: error.message,
    });
  }
});

router.get("/debug/customer/:code", async (req, res) => {
  try {
    const result = await getCustomerByCode(req.params.code);
    res.json({ success: true, code: req.params.code, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    if (!mrCash)
      return res.status(404).json({
        success: false,
        message: "MR Cash record for Yav Phanda not found",
      });

    const oldCash = mrCash.currentCash;
    mrCash.currentCash = fixPrecision(oldCash - totalExcess);
    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n\nOne-time fix: Removed ₹${totalExcess.toFixed(2)} excess (${new Date().toISOString()})`
      : `One-time fix: Removed ₹${totalExcess.toFixed(2)} excess`;
    await mrCash.save();
    res.json({
      success: true,
      message: "MR Cash duplicates fixed successfully",
      details: {
        mrName: mrCash.mrName,
        oldCash,
        newCash: mrCash.currentCash,
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
    if (!progress)
      return res
        .status(404)
        .json({ success: false, message: "Session not found" });
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
    const cleanProductName = decodeURIComponent(productName).trim();
    let product = await findProductRecordFlexible(cleanProductName);
    if (!product) product = await findStockItemFlexible(cleanProductName);
    res.json({
      success: true,
      exists: !!product,
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

router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 9,
      search = "",
      tab = "All",
      saleType = "all",
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = buildMatchConditions(search, tab, saleType);
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
        mrId: 1,
        customerName: 1,
        customerCode: 1,
        customerId: 1,
        paymentStatus: 1,
        saleType: 1,
        totalAmount: 1,
        paidAmount: 1,
        dueAmount: 1,
        costAmount: 1,
        totalProfitLoss: 1,
        products: 1,
        createdAt: 1,
        updatedAt: 1,
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
    console.error("Fetch Sales Error:", error);
    res.status(500).json({ message: "Failed to fetch sales" });
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
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "No valid IDs provided" });
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0)
      return res.status(400).json({ error: "No valid ObjectIds provided" });

    const toDelete = await SaleSummary.find({ _id: { $in: validIds } }).lean();

    const result = await SaleSummary.deleteMany({ _id: { $in: validIds } });

    if (result.deletedCount > 0) {
      await logActivity(req, {
        action: "DELETE",
        actionLabel: `Bulk Deleted ${result.deletedCount} Sale(s)`,
        tableName: "sales",
        tableLabel: "Sale",
        previousData: toDelete,
        description: `Deleted ${result.deletedCount} sale invoices`,
      });
    }

    await session.commitTransaction();
    session.endSession();
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ error: error.message || "Batch delete failed" });
  }
});

// ==========================================
// DELETE SALE - FIXED VERSION
// ==========================================
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const saleToDelete = await SaleSummary.findById(id).session(session);
    if (!saleToDelete) throw new Error("Sales record not found.");

    // Handle MR Cash refund
    if (saleToDelete.paidAmount > 0 && saleToDelete.mrName) {
      const mrCashUpdate = await updateMRCashes(
        saleToDelete.mrName,
        saleToDelete.paidAmount,
        saleToDelete.invoiceNumber,
        new Date(),
        session,
        true,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped)
        console.warn(
          `Failed to update MR Cash on deletion: ${mrCashUpdate.error}`,
        );
    }

    // Restore stock for each product
    for (const product of saleToDelete.products || []) {
      const salesQty = Number(product.salesQty) || 0;
      const bonusQty = Number(product.bonusQty) || 0;
      const totalQty = salesQty + bonusQty;

      if (totalQty > 0) {
        console.log(
          `🔄 Restoring ${totalQty} boxes of "${product.productName}" to stock (deleting sale ${saleToDelete.invoiceNumber})`,
        );

        if (saleToDelete.saleType === "MR Sale" && product.mrId) {
          const deleteMrName = (
            product.mrName ||
            saleToDelete.mrName ||
            ""
          ).trim();
          await restoreStockToMRHand(
            product.mrId,
            product.productName,
            totalQty,
            product.lc || 0,
            session,
            deleteMrName,
          );
        } else {
          const restoreResult = await restoreStockToReportInHand(
            product.productName,
            totalQty,
            session,
          );

          if (!restoreResult.success) {
            console.error(
              `❌ Failed to restore stock for ${product.productName}: ${restoreResult.message}`,
            );
            throw new Error(
              `Failed to restore stock for ${product.productName}: ${restoreResult.message}`,
            );
          }

          console.log(
            `✅ Stock restored for "${product.productName}": +${totalQty} boxes, New stock level: ${restoreResult.newStockLevel}`,
          );
        }
      }
    }

    await SaleSummary.findByIdAndDelete(id).session(session);

    await logActivity(req, {
      action: "DELETE",
      actionLabel: `Deleted Sale: ${saleToDelete.invoiceNumber}`,
      tableName: "sales",
      tableLabel: "Sale",
      recordId: saleToDelete._id,
      referenceNumber: saleToDelete.invoiceNumber,
      previousData: saleToDelete.toObject(),
      description: `Sale invoice ${saleToDelete.invoiceNumber} permanently deleted. Stock restored: ${saleToDelete.products.reduce((sum, p) => sum + (Number(p.salesQty) + Number(p.bonusQty)), 0)} boxes restored.`,
    });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Sales record deleted successfully and stock restored.",
      deletedSale: saleToDelete,
      stockRestored: saleToDelete.products.reduce(
        (sum, p) => sum + (Number(p.salesQty) + Number(p.bonusQty)),
        0,
      ),
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ DELETE error:", err);
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
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Sales record not found." });
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
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          error: `Invoice number "${req.body.invoiceNumber}" already exists.`,
        });
      }
    }

    const saleData = req.body;
    const isMRSale = originalSale.saleType === "MR Sale" || saleData.isMRSale;

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

    const originalProductMap = new Map(
      originalSale.products.map((p) => [p.productName, p]),
    );
    const updatedProductMap = new Map(
      (saleData.products || [])
        .filter((p) => p.productName && p.productName.trim())
        .map((p) => [p.productName.trim(), p]),
    );

    const allProductNames = new Set([
      ...originalProductMap.keys(),
      ...updatedProductMap.keys(),
    ]);

    let totalCostAmount = 0;

    for (const productName of allProductNames) {
      const original = originalProductMap.get(productName);
      const updated = updatedProductMap.get(productName);

      const originalQty = original
        ? fixPrecision(Number(original.salesQty) + Number(original.bonusQty))
        : 0;
      const newQty = updated
        ? fixPrecision(Number(updated.salesQty) + Number(updated.bonusQty))
        : 0;

      if (isMRSale) {
        const originalMrId = original?.mrId
          ? String(original.mrId)
          : String(originalSale.mrId || "");
        const originalMrName = (
          original?.mrName ||
          originalSale.mrName ||
          ""
        ).trim();

        const productLevelMrId = updated?.mrId ? String(updated.mrId) : null;

        const invoiceLevelMrChanged =
          saleData.mrId &&
          String(saleData.mrId) !== originalMrId &&
          !productLevelMrId;

        const updatedMrId = productLevelMrId
          ? productLevelMrId
          : invoiceLevelMrChanged
            ? String(saleData.mrId)
            : originalMrId;

        const targetMrId = updatedMrId || originalMrId;

        const targetMrName = (
          updated?.mrName ||
          saleData.mrName ||
          original?.mrName ||
          originalSale.mrName ||
          ""
        ).trim();

        if (originalQty > 0 && newQty === 0) {
          if (!originalMrId)
            throw new Error(`Original MR missing for ${productName}`);
          await restoreStockToMRHand(
            originalMrId,
            productName,
            originalQty,
            original.lc || 0,
            session,
            originalMrName,
          );
        } else if (originalQty === 0 && newQty > 0) {
          if (!targetMrId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              error: `MR not specified for product ${productName}`,
            });
          }
          const available = await getMRStockQuantity(
            targetMrId,
            productName,
            session,
            targetMrName,
          );
          if (available < newQty) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              error: `Insufficient stock for ${productName} in MR ${targetMrName}. Required: ${newQty}, Available: ${available}`,
            });
          }
          const deduction = await deductStockFromMRHand(
            targetMrId,
            productName,
            newQty,
            0,
            session,
            targetMrName,
          );
          if (!deduction.success) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              error: `Stock deduction failed for ${productName}: ${deduction.message}`,
            });
          }
          totalCostAmount = fixPrecision(
            totalCostAmount + (deduction.amountDeducted || 0),
          );
        } else if (originalQty > 0 && newQty > 0) {
          const mrChanged =
            originalMrId && targetMrId && originalMrId !== targetMrId;
          const delta = fixPrecision(newQty - originalQty);

          if (mrChanged) {
            const restoreResult = await restoreStockToMRHand(
              originalMrId,
              productName,
              originalQty,
              original.lc || 0,
              session,
              originalMrName,
            );
            if (!restoreResult.success) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                error: `Failed to restore stock for ${productName} to original MR "${originalMrName}": ${restoreResult.message}`,
              });
            }

            const available = await getMRStockQuantity(
              targetMrId,
              productName,
              session,
              targetMrName,
            );
            if (available < newQty) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                error: `Insufficient stock for ${productName} in MR "${targetMrName}". Required: ${newQty}, Available: ${available}`,
              });
            }

            const deduction = await deductStockFromMRHand(
              targetMrId,
              productName,
              newQty,
              0,
              session,
              targetMrName,
            );
            if (!deduction.success) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                error: `Stock deduction failed for ${productName}: ${deduction.message}`,
              });
            }

            totalCostAmount = fixPrecision(
              totalCostAmount + (deduction.amountDeducted || 0),
            );
          } else if (delta > 0) {
            const available = await getMRStockQuantity(
              targetMrId,
              productName,
              session,
              targetMrName,
            );
            if (available < delta) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                error: `Insufficient stock for ${productName} in MR "${targetMrName}". Required additional: ${delta}, Available: ${available}`,
              });
            }
            const deduction = await deductStockFromMRHand(
              targetMrId,
              productName,
              delta,
              0,
              session,
              targetMrName,
            );
            if (!deduction.success) {
              await session.abortTransaction();
              session.endSession();
              return res.status(400).json({
                error: `Stock deduction failed for ${productName}: ${deduction.message}`,
              });
            }
            totalCostAmount = fixPrecision(
              totalCostAmount + (deduction.amountDeducted || 0),
            );
          } else if (delta < 0) {
            await restoreStockToMRHand(
              targetMrId,
              productName,
              -delta,
              original.lc || 0,
              session,
              targetMrName,
            );
          }

          if (delta === 0 && !mrChanged && original) {
            const existingCost = fixPrecision(
              Number(original.mrSalePurchasePrice) ||
                fixPrecision((Number(original.lc) || 0) * originalQty),
            );
            totalCostAmount = fixPrecision(totalCostAmount + existingCost);
          }
        }
      } else {
        if (originalQty > 0 && newQty === 0) {
          await restoreStockToReportInHand(productName, originalQty, session);
        } else if (originalQty === 0 && newQty > 0) {
          const stockItem = await findStockItemFlexible(productName, session);
          if (!stockItem)
            throw new Error(`Product "${productName}" not found in inventory`);
          const realBatchesForCheck = getRealBatches(stockItem.batches || []);
          let actualBatchSum = 0;
          for (const b of realBatchesForCheck)
            actualBatchSum = fixPrecision(
              actualBatchSum + Number(b.boxes || 0),
            );
          const addAdj = fixPrecision(
            Number(stockItem.addStockAdjustment || 0),
          );
          const removeAdj = fixPrecision(
            Number(stockItem.removeStockAdjustment || 0),
          );
          const available = fixPrecision(
            Math.max(0, actualBatchSum + addAdj - removeAdj),
          );
          if (available < newQty)
            throw new Error(
              `Insufficient stock for ${productName}. Required: ${newQty}, Available: ${available}`,
            );
          const deduction = await deductStockFromReportInHand(
            productName,
            newQty,
            0,
            originalSale.invoiceNumber,
            session,
          );
          if (!deduction.success)
            throw new Error(
              `Stock deduction failed for ${productName}: ${deduction.message}`,
            );
          totalCostAmount = fixPrecision(
            totalCostAmount + (deduction.amountDeducted || 0),
          );
        } else if (originalQty > 0 && newQty > 0) {
          const delta = fixPrecision(newQty - originalQty);
          if (delta > 0) {
            const stockItem = await findStockItemFlexible(productName, session);
            if (!stockItem)
              throw new Error(
                `Product "${productName}" not found in inventory`,
              );
            const realBatchesForCheck = getRealBatches(stockItem.batches || []);
            let actualBatchSum = 0;
            for (const b of realBatchesForCheck)
              actualBatchSum = fixPrecision(
                actualBatchSum + Number(b.boxes || 0),
              );
            const addAdj = fixPrecision(
              Number(stockItem.addStockAdjustment || 0),
            );
            const removeAdj = fixPrecision(
              Number(stockItem.removeStockAdjustment || 0),
            );
            const available = fixPrecision(
              Math.max(0, actualBatchSum + addAdj - removeAdj),
            );
            if (available < delta)
              throw new Error(
                `Insufficient stock for ${productName}. Required additional: ${delta}, Available: ${available}`,
              );
            const deduction = await deductStockFromReportInHand(
              productName,
              delta,
              0,
              originalSale.invoiceNumber,
              session,
            );
            if (!deduction.success)
              throw new Error(
                `Stock deduction failed for ${productName}: ${deduction.message}`,
              );
            totalCostAmount = fixPrecision(
              totalCostAmount + (deduction.amountDeducted || 0),
            );
          } else if (delta < 0) {
            await restoreStockToReportInHand(productName, -delta, session);
          }
          if (delta === 0 && original) {
            const existingCost = fixPrecision(
              Number(original.mrSalePurchasePrice) ||
                fixPrecision((Number(original.lc) || 0) * originalQty),
            );
            totalCostAmount = fixPrecision(totalCostAmount + existingCost);
          }
        }
      }
    }

    const updatedProducts = [];
    let totalAmount = 0,
      totalProfitLoss = 0;

    for (const p of updatedProductMap.values()) {
      const newSalesQty = fixPrecision(Number(p.salesQty) || 0);
      const newBonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const newTotalQty = fixPrecision(newSalesQty + newBonusQty);
      if (newTotalQty === 0) continue;

      const original = originalProductMap.get(p.productName);
      const sellingPrice = fixPrecision(Number(p.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * newSalesQty);
      const discount = fixPrecision(Number(p.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);

      let lcValue = parseFloat(p.lc) || 0;
      if (lcValue <= 0) {
        if (isMRSale && (p.mrId || saleData.mrId)) {
          lcValue = original?.lc || 0;
        } else {
          const productRecord = await findProductRecordFlexible(p.productName);
          lcValue = productRecord?.lc || 0;
        }
      }

      const profitLoss = fixPrecision((sellingPrice - lcValue) * newSalesQty);

      const finalMrId = p.mrId
        ? String(p.mrId)
        : saleData.mrId
          ? String(saleData.mrId)
          : original?.mrId
            ? String(original.mrId)
            : originalSale.mrId
              ? String(originalSale.mrId)
              : null;

      const finalMrName = (
        p.mrName ||
        saleData.mrName ||
        original?.mrName ||
        originalSale.mrName ||
        ""
      ).trim();

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
        ...(isMRSale && finalMrId
          ? { mrId: finalMrId, mrName: finalMrName }
          : {}),
      });

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
    }

    if (updatedProducts.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ error: "At least one valid product is required" });
    }

    const incomingStatus = (saleData.paymentStatus || "").trim();
    const newPaymentStatus = mapPaymentStatus(
      incomingStatus || originalSale.paymentStatus,
    );

    const newPaidAmount = computePaidAmount(
      newPaymentStatus,
      totalAmount,
      saleData.paidAmount,
    );

    const newDueAmount = fixPrecision(Math.max(0, totalAmount - newPaidAmount));

    const effectiveMrName =
      (saleData.mrName || "").trim() || (originalSale.mrName || "").trim();

    if (effectiveMrName) {
      const oldPaidAmount = fixPrecision(Number(originalSale.paidAmount) || 0);
      const paidDelta = fixPrecision(newPaidAmount - oldPaidAmount);

      if (Math.abs(paidDelta) > 0.001) {
        const invoiceRef = saleData.invoiceNumber || originalSale.invoiceNumber;
        const invoiceDate =
          saleData.invoiceDate || originalSale.invoiceDate || new Date();

        const oldStatusMapped = mapPaymentStatus(originalSale.paymentStatus);
        const transitionLabel = `${oldStatusMapped}→${newPaymentStatus}`;

        const isRefund = paidDelta < 0;

        const auditNote = isRefund
          ? `Invoice ${invoiceRef} edit (${transitionLabel}): -${Math.abs(paidDelta).toFixed(2)}`
          : `Invoice ${invoiceRef} edit (${transitionLabel}): +${paidDelta.toFixed(2)}`;

        const mrCashUpdate = await updateMRCashes(
          effectiveMrName,
          Math.abs(paidDelta),
          invoiceRef,
          invoiceDate,
          session,
          isRefund,
          auditNote,
        );

        if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
          console.warn(
            `⚠️  MR Cash update failed for "${effectiveMrName}" on invoice ${invoiceRef} ` +
              `(${transitionLabel}): ${mrCashUpdate.error}`,
          );
        } else if (mrCashUpdate.success) {
          console.log(
            `✅ MR Cash updated for "${effectiveMrName}": ` +
              `${isRefund ? "-" : "+"}${Math.abs(paidDelta).toFixed(2)} ` +
              `(${transitionLabel}). ` +
              `Previous: ${mrCashUpdate.previousAmount?.toFixed(2)}, ` +
              `New: ${mrCashUpdate.newAmount?.toFixed(2)}`,
          );
        }
      } else {
        console.log(
          `ℹ️  MR Cash unchanged for "${effectiveMrName}" on invoice ` +
            `${saleData.invoiceNumber || originalSale.invoiceNumber} ` +
            `(paidDelta = ${paidDelta})`,
        );
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
        paidAmount: newPaidAmount,
        totalAmount,
        totalProfitLoss,
        costAmount: fixPrecision(totalCostAmount),
        dueAmount: newDueAmount,
        paymentStatus: newPaymentStatus,
        remark: saleData.remark || originalSale.remark || "",
        updatedAt: new Date(),
      },
      { new: true, runValidators: true, session },
    );

    await logActivity(req, {
      action: "UPDATE",
      actionLabel: `Updated Sale: ${updatedSale.invoiceNumber}`,
      tableName: "sales",
      tableLabel: "Sale",
      recordId: updatedSale._id,
      referenceNumber: updatedSale.invoiceNumber,
      previousData: originalSale.toObject(),
      newData: updatedSale.toObject(),
      description: `Sale invoice ${updatedSale.invoiceNumber} was updated`,
    });

    await session.commitTransaction();
    session.endSession();
    res
      .status(200)
      .json({ message: "Sale updated successfully", sale: updatedSale });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ PUT /:id error:", err);
    res
      .status(500)
      .json({ error: "Failed to update sales record", details: err.message });
  }
});

router.get("/mr-stock/mrs-with-stock", async (req, res) => {
  try {
    const mrStocks = await stockInMRHand
      .find({
        productsInHand: { $exists: true, $ne: [] },
      })
      .lean();
    const mrsWithStock = mrStocks.map((mrStock) => {
      const products = mrStock.productsInHand || [];
      const totalQuantity = products.reduce(
        (sum, p) => sum + (p.quantity || 0),
        0,
      );
      const productsWithStock = products.filter((p) => p.quantity > 0).length;
      return {
        _id: mrStock.mrId?.toString() || mrStock._id?.toString(),
        mrName: mrStock.mrName,
        totalProducts: products.length,
        productsWithStock,
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
    let mrStock = null;
    try {
      mrStock = await stockInMRHand
        .findOne({
          mrId: new mongoose.Types.ObjectId(mrId),
        })
        .lean();
    } catch {
      mrStock = await stockInMRHand.findOne({ mrId }).lean();
    }

    if (!mrStock) return res.json({ success: true, products: [] });

    const products = mrStock.productsInHand || [];
    const enrichedProducts = await Promise.all(
      products.map(async (p) => {
        let productDetails = null;
        if (p.productId) {
          try {
            productDetails = await Product.findById(p.productId).lean();
          } catch (err) {
            console.error(
              `Failed to fetch product: ${p.productId}`,
              err.message,
            );
          }
        }
        return {
          productId: p.productId,
          productName:
            productDetails?.productName || p.productName || "Unknown",
          name: productDetails?.productName || p.productName || "Unknown",
          quantity: p.quantity || 0,
          lc: productDetails?.lc ?? p.lc ?? 0,
          fob: productDetails?.fob ?? 0,
          sellingPrice: productDetails?.sellingPrice ?? 0,
          type: productDetails?.type || "",
          packing: productDetails?.packing || "",
          supplierName: productDetails?.supplierName || "",
        };
      }),
    );

    res.json({ success: true, products: enrichedProducts });
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

    let mrStock = null;
    try {
      mrStock = await stockInMRHand
        .findOne({
          mrId: new mongoose.Types.ObjectId(mrId),
        })
        .lean();
    } catch {
      mrStock = await stockInMRHand.findOne({ mrId }).lean();
    }

    if (!mrStock)
      return res
        .status(404)
        .json({ success: false, message: "MR stock not found" });

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
    if (startDate && endDate)
      filter.invoiceDate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
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
    if (!startDate || !endDate)
      return res
        .status(400)
        .json({ message: "Start date and end date are required" });
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
    res.json(sales.length > 0 ? sales[0] : { totalSales: 0, count: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
    } else if (period === "All") {
      dateFilter = {};
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange)
        dateFilter = {
          invoiceDate: { $gte: dateRange.start, $lte: dateRange.end },
        };
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

    res.json({
      success: true,
      data: salesData.map((sale) => ({
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
      })),
      count: salesData.length,
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
    case "Today": {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const end = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
      return { start, end };
    }
    case "Month":
      return {
        start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
        end: now,
      };
    case "Year":
      return {
        start: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)),
        end: now,
      };
    default:
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      return { start, end: now };
  }
};

router.get("/credit-sale-not-received", async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    let dateFilter = {};
    const now = new Date();

    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else if (period === "today") {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else if (period === "year") {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else if (period === "All") {
      dateFilter = {};
    }

    const creditSales = await SaleSummary.find({
      ...dateFilter,
      $and: [
        {
          $or: [
            { saleReturn: { $exists: false } },
            { saleReturn: false },
            { saleReturn: null },
          ],
        },
        { paymentStatus: { $not: { $regex: /^(cash|paid)$/i } } },
        {
          $or: [
            { dueAmount: { $gt: 0 } },
            {
              $expr: {
                $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0],
              },
            },
          ],
        },
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
      period: period || "all",
      message: `Found ${formattedSales.length} credit sales`,
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

router.post("/download-excel", async (req, res) => {
  try {
    const { period, startDate, endDate, search, tab, saleType } = req.body;
    let dateFilter = {};
    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: start, $lte: end } };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange)
        dateFilter = {
          invoiceDate: { $gte: dateRange.start, $lte: dateRange.end },
        };
    }

    const matchConditions = { ...dateFilter };
    if (search && search.trim()) {
      const searchRegex = new RegExp(escapeRegexForSearch(search.trim()), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }
    if (tab && tab !== "All")
      matchConditions.paymentStatus = new RegExp(
        `^${escapeRegexForSearch(tab)}$`,
        "i",
      );
    if (saleType && saleType !== "all")
      matchConditions.saleType =
        saleType === "normal" ? "Normal Sale" : "MR Sale";

    const sales = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .lean();

    const excelData = [];
    sales.forEach((sale) => {
      if (sale.products && sale.products.length) {
        sale.products.forEach((product) => {
          excelData.push({
            "Invoice Number": sale.invoiceNumber,
            "Invoice Date": sale.invoiceDate
              ? new Date(sale.invoiceDate).toLocaleDateString()
              : "",
            "MR Name": sale.mrName || "",
            "Customer Name": sale.customerName || "",
            "Customer Code": sale.customerCode || "",
            "Payment Status": sale.paymentStatus || "",
            "Product Name": product.productName || "",
            "Sales Qty": product.salesQty || 0,
            "Bonus Qty": product.bonusQty || 0,
            "Total Qty": product.totalQty || 0,
            "Selling Price": product.sellingPrice || 0,
            Discount: product.discount || 0,
            "Net Amount": product.netSellingAmount || 0,
            LC: product.lc || 0,
            "Profit/Loss": product.profitLoss || 0,
            "MR Sale Purchase Price": product.lc
              ? fixPrecision(
                  product.lc *
                    ((product.salesQty || 0) + (product.bonusQty || 0)),
                )
              : 0,
            "Total Amount": sale.totalAmount || 0,
            "Paid Amount": sale.paidAmount || 0,
            "Due Amount": sale.dueAmount || 0,
            "Cost Amount": sale.costAmount || 0,
            "Sale Type": sale.saleType || "",
          });
        });
      } else {
        excelData.push({
          "Invoice Number": sale.invoiceNumber,
          "Invoice Date": sale.invoiceDate
            ? new Date(sale.invoiceDate).toLocaleDateString()
            : "",
          "MR Name": sale.mrName || "",
          "Customer Name": sale.customerName || "",
          "Customer Code": sale.customerCode || "",
          "Payment Status": sale.paymentStatus || "",
          "Product Name": "—",
          "Sales Qty": 0,
          "Bonus Qty": 0,
          "Total Qty": 0,
          "Selling Price": 0,
          Discount: 0,
          "Net Amount": 0,
          LC: 0,
          "Profit/Loss": 0,
          "MR Sale Purchase Price": 0,
          "Total Amount": sale.totalAmount || 0,
          "Paid Amount": sale.paidAmount || 0,
          "Due Amount": sale.dueAmount || 0,
          "Cost Amount": sale.costAmount || 0,
          "Sale Type": sale.saleType || "",
        });
      }
    });

    if (excelData.length === 0)
      excelData.push({
        Message: "No sales data found for the selected filters.",
      });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales");
    const excelBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    await logActivity(req, {
      action: "EXPORT",
      actionLabel: `Exported Sale List (${sales.length} records)`,
      tableName: "sales",
      tableLabel: "Sale",
      description: `Exported ${sales.length} sale invoices to Excel`,
      newData: { count: sales.length, period, tab, saleType },
    });

    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sales_${timestamp}.xlsx"`,
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(excelBuffer);
  } catch (error) {
    console.error("❌ Excel download error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel file",
      error: error.message,
    });
  }
});

router.get("/all-paginated", async (req, res) => {
  try {
    const {
      search = "",
      tab = "All",
      saleType = "all",
      page = 1,
      limit = 9,
    } = req.query;

    const matchConditions = buildMatchConditions(search, tab, saleType);
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [result] = await SaleSummary.aggregate([
      { $match: matchConditions },
      {
        $facet: {
          total: [{ $count: "n" }],
          data: [
            { $sort: { recordingDate: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) },
            {
              $lookup: {
                from: "customers",
                localField: "customerId",
                foreignField: "_id",
                as: "_customerDoc",
                pipeline: [
                  {
                    $project: {
                      customerNumber: 1,
                      zone: 1,
                      province: 1,
                      address: 1,
                    },
                  },
                ],
              },
            },
            {
              $addFields: {
                customerPhone: {
                  $ifNull: [{ $first: "$_customerDoc.customerNumber" }, ""],
                },
                customerZone: {
                  $ifNull: [{ $first: "$_customerDoc.zone" }, ""],
                },
                customerProvince: {
                  $ifNull: [{ $first: "$_customerDoc.province" }, ""],
                },
                customerAddress: {
                  $ifNull: [{ $first: "$_customerDoc.address" }, ""],
                },
              },
            },
            { $unset: "_customerDoc" },
          ],
        },
      },
    ]);

    const count = result.total[0]?.n ?? 0;
    const summaries = result.data ?? [];

    res.status(200).json({ summaries, count });
  } catch (error) {
    console.error("Fetch Sale Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sale summaries",
      error: error.message,
      summaries: [],
      count: 0,
    });
  }
});

export default router;
