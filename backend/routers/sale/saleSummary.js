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

// ==========================================
// LOCK MANAGER (prevents write conflicts)
// ==========================================
class LockManager {
  constructor() {
    // key -> array of pending resolvers (FIFO queue)
    // If the key exists in the map, the lock IS held.
    // The array contains waiters that will be woken in order.
    this.locks = new Map();
  }

  async acquire(keys) {
    const sorted = [...new Set(keys)].sort(); // dedup + sort for deadlock prevention
    const acquired = [];
    try {
      for (const key of sorted) {
        await this._acquireOne(key);
        acquired.push(key);
      }
      return acquired;
    } catch (err) {
      for (const key of acquired) this._releaseOne(key);
      throw err;
    }
  }

  release(keys) {
    // Release in reverse order (doesn't matter for correctness but conventional)
    for (const key of [...keys].reverse()) this._releaseOne(key);
  }

  _acquireOne(key) {
    return new Promise((resolve) => {
      if (!this.locks.has(key)) {
        // Lock is free — mark as held with an empty waiter queue
        this.locks.set(key, []);
        resolve(); // caller gets the lock immediately
      } else {
        // Lock is held — enqueue this waiter
        this.locks.get(key).push(resolve);
      }
    });
  }

  _releaseOne(key) {
    const queue = this.locks.get(key);
    if (!queue) return; // already released (shouldn't happen)

    if (queue.length === 0) {
      // No waiters — lock is now free
      this.locks.delete(key);
    } else {
      // Hand the lock to the next waiter
      const next = queue.shift();
      next(); // wakes up the next _acquireOne promise
      // Keep the entry in the map (lock is still held by the new owner)
    }
  }
}

const lockManager = new LockManager();

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

const escapeRegex = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim();
};

// ─── PARALLEL BATCH PROCESSOR ─────────────────────────────────────────────────
const processBatch = async (items, fn, batchSize = 10) => {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
};

// ─── shouldMergeInvoices ───────────────────────────────────────────────────────
const shouldMergeInvoices = (existingInvoice, newInvoiceData) => {
  if (existingInvoice.invoiceNumber !== newInvoiceData.invoiceNumber)
    return { shouldMerge: false, isExactDuplicate: false };
  if (existingInvoice.customerCode !== newInvoiceData.customerCode)
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "Customer mismatch",
    };

  const existingStatus = mapPaymentStatus(existingInvoice.paymentStatus);
  const newStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
  if (existingStatus !== newStatus)
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "Payment status mismatch",
    };
  if (existingInvoice.mrName !== newInvoiceData.mrName)
    return {
      shouldMerge: false,
      isExactDuplicate: false,
      reason: "MR mismatch",
    };

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

// ─── FLEXIBLE PRODUCT LOOKUPS ─────────────────────────────────────────────────
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
    if (!customerCode || customerCode.trim() === "")
      return {
        success: false,
        message: "Customer code is required",
        customer: null,
      };

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

    if (!customer)
      return {
        success: false,
        message: `Customer with code "${cleanedCode}" not found`,
        customer: null,
      };

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

// ─── OPTIMIZED STOCK VALIDATION ───────────────────────────────────────────────
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
        productExists: false,
      };
    }

    let availableStock = 0;
    if (stockItem.totalBoxes !== undefined && stockItem.totalBoxes !== null) {
      availableStock = fixPrecision(Number(stockItem.totalBoxes));
    } else if (stockItem.batches && Array.isArray(stockItem.batches)) {
      const batchEntries = stockItem.batches.filter(
        (b) => !b.adjustmentType || b.adjustmentType === "batch",
      );
      let batchesSum = batchEntries.reduce(
        (sum, b) => fixPrecision(sum + fixPrecision(Number(b.boxes || 0))),
        0,
      );
      let totalAdjustments = fixPrecision(
        (stockItem.addStockAdjustment || 0) -
          (stockItem.removeStockAdjustment || 0),
      );
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
      productExists: true,
      message: hasEnoughStock
        ? `✅ Stock available: ${availableStock}`
        : `❌ Short by ${insufficientQty}`,
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

// ─── OPTIMIZED STOCK VALIDATION FOR IMPORT ────────────────────────────────────
const validateStockForImport = async (invoices) => {
  try {
    const productStockMap = new Map();

    for (const invoice of invoices) {
      for (const product of invoice.products) {
        const productName = product.productName?.trim();
        const requiredQty = fixPrecision(
          (parseFloat(product.salesQty) || 0) +
            (parseFloat(product.bonusQty) || 0),
        );
        if (requiredQty > 0 && productName) {
          if (!productStockMap.has(productName)) {
            productStockMap.set(productName, {
              productName,
              totalRequired: 0,
              requiredByInvoices: [],
            });
          }
          const pd = productStockMap.get(productName);
          pd.totalRequired = fixPrecision(pd.totalRequired + requiredQty);
          pd.requiredByInvoices.push({
            invoiceNumber: invoice.invoiceNumber,
            requiredQty,
            customerName: invoice.customerName,
          });
        }
      }
    }

    const productEntries = Array.from(productStockMap.entries());
    const stockCheckResults = await Promise.allSettled(
      productEntries.map(([productName, pd]) =>
        calculateProductStock(productName, pd.totalRequired),
      ),
    );

    const stockIssues = [];

    stockCheckResults.forEach((result, idx) => {
      const [productName, pd] = productEntries[idx];
      const stockCheck =
        result.status === "fulfilled"
          ? result.value
          : {
              success: false,
              found: false,
              availableStock: 0,
              insufficient: true,
              insufficientQty: pd.totalRequired,
              message: result.reason?.message || "Stock check failed",
              productExists: false,
            };

      if (stockCheck.insufficient || !stockCheck.found) {
        stockIssues.push({
          productName,
          totalRequired: pd.totalRequired,
          availableStock: stockCheck.availableStock,
          insufficientQty: stockCheck.insufficientQty || 0,
          requiredByInvoices: pd.requiredByInvoices,
          invoiceCount: pd.requiredByInvoices.length,
          message: stockCheck.message,
          productExists: stockCheck.found,
          insufficient: stockCheck.insufficient,
          type: !stockCheck.found ? "missing_product" : "insufficient_stock",
        });
      }
    });

    const insufficientCount = stockIssues.filter(
      (i) => i.productExists && i.insufficient,
    ).length;
    const missingCount = stockIssues.filter((i) => !i.productExists).length;
    const totalRequired = productEntries.reduce(
      (sum, [, pd]) => fixPrecision(sum + pd.totalRequired),
      0,
    );

    return {
      stockIssues,
      totalInvoices: invoices.length,
      summary: {
        totalProducts: productStockMap.size,
        totalRequired,
        totalAvailable: 0,
        totalInsufficient: insufficientCount,
        missingProducts: missingCount,
        hasCriticalIssues: false,
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
        hasCriticalIssues: true,
        hasInsufficientStock: false,
        importBlocked: true,
      },
      importBlocked: true,
      blockReason: "VALIDATION_ERROR",
      message: `Stock validation failed: ${error.message}`,
    };
  }
};

// ─── MR VALIDATION ────────────────────────────────────────────────────────────
const validateMR = async (mrName, session = null) => {
  try {
    if (!mrName || mrName.trim() === "")
      return { success: false, message: "MR name is required", exists: false };

    const cleanedMrName = mrName.trim();
    if (cleanedMrName.toLowerCase() === "unknown")
      return {
        success: true,
        message: `MR "Unknown" is allowed`,
        exists: true,
        isUnknown: true,
        mrData: { mrName: cleanedMrName, mrId: null },
      };

    let query = Staff.findOne({
      medicalRepNameLower: cleanedMrName.toLowerCase(),
    });
    if (session) query.session(session);
    const mr = await query;

    if (!mr)
      return {
        success: false,
        message: `MR "${cleanedMrName}" not found in Staff system`,
        exists: false,
      };

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

// ─── MR STOCK HELPERS ─────────────────────────────────────────────────────────
const checkMRStock = async (
  mrId,
  mrName,
  productName,
  requiredQty,
  session = null,
) => {
  try {
    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");
    const mrStock = await stockinmrhands.findOne(
      { mrId: new mongoose.Types.ObjectId(mrId) },
      { session },
    );

    if (!mrStock)
      return {
        success: false,
        found: false,
        message: `MR stock not found for ${mrName}`,
        productExists: false,
      };

    const product = (mrStock.productsInHand || []).find(
      (p) =>
        p.productName?.toLowerCase().trim() ===
        productName?.toLowerCase().trim(),
    );

    if (!product)
      return {
        success: false,
        found: false,
        message: `Product "${productName}" not found in ${mrName}'s stock`,
        productExists: false,
      };

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
    if (!stockItem)
      return {
        success: false,
        message: `Product "${productName}" not found in inventory`,
        productExists: false,
      };

    const currentStock = fixPrecision(Number(stockItem.totalBoxes || 0));
    if (currentStock < totalQty)
      return {
        success: false,
        message: `Insufficient stock. Available: ${currentStock}, Required: ${totalQty}`,
        productExists: true,
        insufficient: true,
        shortage: fixPrecision(totalQty - currentStock),
      };

    stockItem.batches.push({
      boxes: totalQty,
      adjustmentType: "remove",
      date: new Date(),
      amount: 0,
      lc: 0,
      fob: 0,
      cif: 0,
      batchNumber: `SALE-${invoiceNumber}-${Date.now()}`,
    });

    const remainingStock = fixPrecision(currentStock - totalQty);
    stockItem.status =
      remainingStock <= 0
        ? "Out of Stock"
        : remainingStock < (stockItem.minStockLevel || 10)
          ? "Low Stock"
          : "In Stock";

    await stockItem.save({ session });
    return {
      success: true,
      productName: stockItem.productName,
      deductedQty: totalQty,
      previousStock: currentStock,
      newStock: remainingStock,
      productExists: true,
    };
  } catch (error) {
    return { success: false, message: error.message, productExists: false };
  }
};

const deductStockFromMRHand = async (
  mrId,
  productName,
  salesQty,
  bonusQty,
  session,
) => {
  try {
    const totalQty = fixPrecision(
      (parseFloat(salesQty) || 0) + (parseFloat(bonusQty) || 0),
    );
    if (totalQty <= 0) return { success: true, deductedQty: 0, skipped: true };

    if (!mongoose.connection || !mongoose.connection.db)
      return { success: false, message: `Database connection not available` };

    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");
    const mrStock = await stockinmrhands.findOne(
      { mrId: new mongoose.Types.ObjectId(mrId) },
      { session },
    );

    if (!mrStock)
      return {
        success: false,
        message: `MR stock not found for MR ID: ${mrId}`,
      };

    const normalizedSearchName = productName?.toLowerCase().trim() || "";
    const productIndex = (mrStock.productsInHand || []).findIndex(
      (p) => p?.productName?.toLowerCase().trim() === normalizedSearchName,
    );

    if (productIndex === -1)
      return {
        success: false,
        message: `Product "${productName}" not found in ${mrStock.mrName || "MR"}'s stock`,
      };

    const product = mrStock.productsInHand[productIndex];
    const currentQty = fixPrecision(Number(product.quantity) || 0);
    if (currentQty < totalQty)
      return {
        success: false,
        message: `Insufficient MR stock for ${productName}. Available: ${currentQty}, Required: ${totalQty}`,
        shortage: fixPrecision(totalQty - currentQty),
      };

    const newQuantity = fixPrecision(currentQty - totalQty);

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

    if (newQuantity === 0) {
      await stockinmrhands.updateOne(
        { mrId: new mongoose.Types.ObjectId(mrId) },
        {
          $pull: { productsInHand: { productName: product.productName } },
          $set: { updatedAt: new Date() },
        },
        { session },
      );
    }

    return {
      success: true,
      deductedQty: totalQty,
      mrName: mrStock.mrName || "Unknown MR",
      productName: product.productName,
      previousStock: currentQty,
      newStock: newQuantity,
      lc: product.lc || 0,
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

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
      const currentDate = new Date();
      stockItem.batches.push({
        batchNumber: `RESTORE-${Date.now()}`,
        boxes: restoredQty,
        lc: stockItem.averagePrice || 0.71,
        fob: stockItem.averagePrice || 0.71,
        cif: stockItem.averagePrice || 0.71,
        amount: fixPrecision(restoredQty * (stockItem.averagePrice || 0.71)),
        expiryDate: new Date(
          currentDate.setFullYear(currentDate.getFullYear() + 1),
        ),
        date: new Date(),
        adjustmentType: "batch",
        _id: new mongoose.Types.ObjectId(),
      });
      stockItem.updatedAt = new Date();
      await stockItem.save({ session });
      const updated = await ReportInHand.findById(stockItem._id).session(
        session,
      );
      await session.commitTransaction();
      await session.endSession();
      return {
        success: true,
        restored: restoredQty,
        newStockLevel: updated.totalBoxes,
      };
    } else {
      const newStockItem = new ReportInHand({
        productName,
        supplierName: "System",
        type: "System",
        batches: [
          {
            batchNumber: `NEW-${Date.now()}`,
            boxes: restoredQty,
            lc: 0.71,
            fob: 0.71,
            cif: 0.71,
            amount: fixPrecision(restoredQty * 0.71),
            expiryDate: new Date(
              new Date().setFullYear(new Date().getFullYear() + 1),
            ),
            date: new Date(),
            adjustmentType: "batch",
          },
        ],
        status: "In Stock",
        minStockLevel: 10,
      });
      await newStockItem.save({ session });
      await session.commitTransaction();
      await session.endSession();
      return { success: true, restored: restoredQty, createdNew: true };
    }
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    try {
      await session.endSession();
    } catch (_) {}
    return {
      success: false,
      restored: 0,
      message: `Failed to restore stock: ${error.message}`,
    };
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
    if (restoreQty <= 0) return { success: true, restored: 0 };

    const stockinmrhands = mongoose.connection.db.collection("stockinmrhands");
    const mrStock = await stockinmrhands.findOne(
      { mrId: new mongoose.Types.ObjectId(mrId) },
      { session },
    );

    if (!mrStock)
      return {
        success: false,
        message: `MR stock record not found for MR ID: ${mrId}`,
      };

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
      await stockinmrhands.updateOne(
        {
          mrId: new mongoose.Types.ObjectId(mrId),
          "productsInHand.productName": productName,
        },
        {
          $set: {
            "productsInHand.$.quantity": fixPrecision(currentQty + restoreQty),
            "productsInHand.$.lastUpdated": new Date(),
            updatedAt: new Date(),
          },
        },
        { session },
      );
    }

    return { success: true, restored: restoreQty };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// ─── UPDATE MR CASHES ─────────────────────────────────────────────────────────
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
    if (cleanAmount === 0)
      return { success: true, skipped: true, reason: "Amount is zero" };
    if (!mrName || mrName.trim() === "")
      throw new Error("medicalRepName is required to update MR Cash");

    const escapeForRegex = (text = "") =>
      text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const mr = await Staff.findOne({
      medicalRepName: {
        $regex: `^${escapeForRegex(mrName.trim())}$`,
        $options: "i",
      },
    }).session(session);
    if (!mr) throw new Error(`MR not found with name "${mrName}"`);

    let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);

    if (!mrCash) {
      mrCash = new MRCash({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        currentCash: isRefund ? 0 : cleanAmount,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial creation with invoice: ${invoiceNumber}`,
        isActive: true,
      });
      await mrCash.save({ session });
      return { success: true, mrCash, action: "created_new" };
    }

    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    mrCash.currentCash = isRefund
      ? fixPrecision(previousAmount - cleanAmount)
      : fixPrecision(previousAmount + cleanAmount);
    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n${isRefund ? "Refund" : "Sale"} ${invoiceNumber}: ${isRefund ? "-" : "+"}${cleanAmount}`
      : `Sale ${invoiceNumber}: +${cleanAmount}`;
    mrCash.updatedAt = new Date();
    await mrCash.save({ session });

    return { success: true, mrCash, action: "updated_existing" };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE: PROCESS SINGLE INVOICE (with locking)
//
// FIX SUMMARY:
//  1. Lock keys are built BEFORE any async DB calls (no validateMR in lock phase)
//     by relying on the pre-resolved mrValidationCache passed in.
//  2. For import MR sales, productToMrMap is built from _mrDistribution correctly.
//  3. isMRSale determination is unified and clear.
//  4. checkMRStock now takes mrId directly (not mrName) to avoid double-lookup.
// ─────────────────────────────────────────────────────────────────────────────
const processSingleInvoiceWithMRDistribution = async (
  invoiceData,
  index,
  skipDuplicates = true,
  bypassStockCheck = false,
  isImport = false,
  mrValidationCache = new Map(), // pre-validated MR name -> { success, mrData }
) => {
  // ── Determine if this is an MR sale import ──────────────────────────────
  // For import flow: isMrSaleImport flag on invoice controls MR stock deduction.
  // For manual create: isImport=false and products carry mrId directly.
  const isImportMRSale = isImport && invoiceData.isMrSaleImport === true;

  // ── Build product-to-MR map from _mrDistribution ─────────────────────
  // _mrDistribution: Map<mrName, { products: [...], mrName }>
  const productToMrMap = new Map(); // productName (lowercased) -> mrName
  if (invoiceData._mrDistribution && invoiceData._mrDistribution.size > 0) {
    for (const [mrName, mrData] of invoiceData._mrDistribution.entries()) {
      for (const prod of mrData.products || []) {
        const key = prod.productName?.trim().toLowerCase();
        if (key && !productToMrMap.has(key)) productToMrMap.set(key, mrName);
      }
    }
  }

  // If it's an MR sale import and no _mrDistribution was set (should not happen
  // after the grouping step, but as fallback), assign invoice.mrName to all products.
  if (isImportMRSale && productToMrMap.size === 0 && invoiceData.mrName) {
    for (const prod of invoiceData.products || []) {
      const key = prod.productName?.trim().toLowerCase();
      if (key) productToMrMap.set(key, invoiceData.mrName.trim());
    }
  }

  // ── Resolve MR IDs from cache (no extra DB calls here) ───────────────
  // mrValidationCache was populated before batching — reuse it.
  const getMrIdFromCache = (mrName) => {
    if (!mrName) return null;
    const cached = mrValidationCache.get(mrName.trim());
    return cached?.success ? cached.mrData?.mrId : null;
  };

  // ── Build lock keys synchronously (no DB calls) ───────────────────────
  const lockKeys = [];
  for (const product of invoiceData.products || []) {
    const productName = product.productName?.trim();
    if (!productName) continue;

    const assignedMrName = productToMrMap.get(productName.toLowerCase());
    const shouldUseMRStock =
      isImportMRSale &&
      assignedMrName &&
      assignedMrName.toLowerCase() !== "unknown";

    if (shouldUseMRStock) {
      const mrId = getMrIdFromCache(assignedMrName);
      if (mrId) {
        lockKeys.push(`mr:${mrId.toString()}:${productName.toLowerCase()}`);
      } else {
        // MR not in cache / invalid — still lock by name to be safe
        lockKeys.push(
          `mr:name:${assignedMrName.toLowerCase()}:${productName.toLowerCase()}`,
        );
      }
    } else {
      lockKeys.push(`wh:${productName.toLowerCase()}`);
    }
  }

  // ── Acquire all locks ─────────────────────────────────────────────────
  const acquiredLocks = await lockManager.acquire(lockKeys);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!invoiceData.invoiceNumber?.trim())
      throw new Error("Invoice number is required");

    // ── Duplicate check ────────────────────────────────────────────────
    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      const mergeCheck = shouldMergeInvoices(existingInvoice, invoiceData);

      if (mergeCheck.isExactDuplicate && skipDuplicates) {
        await session.abortTransaction();
        await session.endSession();
        lockManager.release(acquiredLocks);
        return {
          success: false,
          skipped: true,
          isExactDuplicate: true,
          error: {
            row: index + 2,
            invoiceNumber: invoiceData.invoiceNumber,
            message: `Exact duplicate skipped`,
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
          lockManager.release(acquiredLocks);
          return {
            success: true,
            invoiceNumber: invoiceData.invoiceNumber,
            action: "merged",
            addedProducts: mergeResult.addedProducts,
            paidAmount: mergeResult.addedPaidAmount,
            mrCashUpdates: {
              [existingInvoice.mrName]: mergeResult.addedPaidAmount,
            },
          };
        }
        throw new Error(`Failed to merge invoice: ${mergeResult.error}`);
      } else {
        throw new Error(
          `Invoice number ${invoiceData.invoiceNumber} already exists: ${mergeCheck.reason || "Incompatible data"}`,
        );
      }
    }

    // ── Resolve customer ───────────────────────────────────────────────
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

    // ── Process products ───────────────────────────────────────────────
    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];
    const mrCashDistribution = new Map();

    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      if (!productName) continue;

      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      const sellingPrice = fixPrecision(parseFloat(product.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(product.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);

      // ── Determine whether to use MR stock or warehouse stock ────────
      const assignedMrName = productToMrMap.get(productName.toLowerCase());
      const shouldUseMRStock =
        isImportMRSale &&
        assignedMrName &&
        assignedMrName.toLowerCase() !== "unknown";

      let lc = 0;
      let profitLoss = 0;
      let productMrId = null;

      if (shouldUseMRStock) {
        // ── MR stock path ──────────────────────────────────────────────

        // Get MR validation result from cache (already validated before batching)
        const mrValidation = mrValidationCache.get(assignedMrName.trim());
        if (!mrValidation || !mrValidation.success) {
          throw new Error(
            `Invalid MR "${assignedMrName}" for product ${productName}: ${mrValidation?.message || "MR not found"}`,
          );
        }
        productMrId = mrValidation.mrData.mrId;

        // Check MR stock
        const mrStockCheck = await checkMRStock(
          productMrId,
          assignedMrName,
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
                `Insufficient MR stock for ${productName}`,
            );
          }
        }

        if (!bypassStockCheck) {
          const deductionResult = await deductStockFromMRHand(
            productMrId,
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
          stockDeductionResults.push({
            product: productName,
            mrId: productMrId,
            mrName: assignedMrName,
            ...deductionResult,
          });
          lc = deductionResult.lc;
        } else {
          lc = product.lc || 0;
        }

        profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

        // Track MR cash distribution for Cash payment
        const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
        if (paymentStatus === "Cash") {
          mrCashDistribution.set(
            assignedMrName,
            fixPrecision(
              (mrCashDistribution.get(assignedMrName) || 0) + netSellingAmount,
            ),
          );
        }
      } else {
        // ── Warehouse stock path ───────────────────────────────────────

        const stockItem = await findStockItemFlexible(productName, session);

        if (!stockItem) {
          if (bypassStockCheck) {
            const pr = await findProductRecordFlexible(productName, session);
            lc = pr?.lc || 0;
          } else {
            throw new Error(`Product "${productName}" not found in inventory`);
          }
        } else {
          const currentAvailableStock = fixPrecision(
            Number(stockItem.totalBoxes || 0),
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
          stockDeductionResults.push({
            product: productName,
            ...deductionResult,
          });
          if (!deductionResult.success) {
            throw new Error(
              `Stock deduction failed for ${productName}: ${deductionResult.message}`,
            );
          }
        }

        // Track MR cash for the invoice's primary MR
        const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
        if (paymentStatus === "Cash") {
          const mrForCash = invoiceData.mrName?.trim() || "Unknown";
          mrCashDistribution.set(
            mrForCash,
            fixPrecision(
              (mrCashDistribution.get(mrForCash) || 0) + netSellingAmount,
            ),
          );
        }
      }

      const productEntry = {
        productName,
        salesQty,
        bonusQty,
        totalQty: fixPrecision(salesQty + bonusQty),
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

      if (shouldUseMRStock && productMrId) {
        productEntry.mrId = productMrId;
        productEntry.mrName = assignedMrName;
      }

      processedProducts.push(productEntry);
      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
    }

    if (processedProducts.length === 0)
      throw new Error("No valid products found in invoice");

    // ── Payment amounts ────────────────────────────────────────────────
    const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
    let paidAmount = 0;
    if (paymentStatus === "Cash") paidAmount = totalAmount;
    else if (paymentStatus === "Partial Paid")
      paidAmount = fixPrecision(parseFloat(invoiceData.paidAmount) || 0);

    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));

    // ── Primary MR for the sale record ────────────────────────────────
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
      paymentStatus,
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: isImport ? "excel_import_with_stock_deduction" : "manual",
      importTimestamp: new Date(),
      bypassStockCheck,
      isMRSale: isImportMRSale,
    });

    await saleRecord.save({ session });

    // ── Update MR Cash ─────────────────────────────────────────────────
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
          if (mrCashUpdate.success) mrCashUpdates[mrName] = mrAmount;
        }
      }
    }

    await session.commitTransaction();
    await session.endSession();
    lockManager.release(acquiredLocks);

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
      paidAmount,
      action: "created",
      mrCashUpdates,
      bypassStockCheck,
    };
  } catch (error) {
    try {
      if (session.transaction?.isActive) await session.abortTransaction();
    } catch (_) {}
    try {
      await session.endSession();
    } catch (_) {}
    lockManager.release(acquiredLocks);

    return {
      success: false,
      error: {
        row: index + 2,
        invoiceNumber: invoiceData.invoiceNumber || "Unknown",
        message: error.message,
        type: "processing_error",
      },
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMIZED: processImportWithStockDeduction
// ─────────────────────────────────────────────────────────────────────────────
const BATCH_SIZE = 15;

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

  progress.status = "processing";
  progress.startTime = Date.now();
  progress.lastUpdated = Date.now();

  try {
    // ── Step 1: Group invoices (dedup products within same invoice number) ──
    const groupedInvoices = new Map();
    const preValidationErrors = [];

    // ── Pre-validate ALL unique MRs in one parallel batch ────────────────
    const uniqueMRNames = new Set();
    for (const invoice of invoices) {
      if (
        invoice.mrName &&
        invoice.mrName.trim() &&
        invoice.mrName.toLowerCase().trim() !== "unknown"
      ) {
        uniqueMRNames.add(invoice.mrName.trim());
      }
    }

    // mrValidationCache: mrName -> { success, exists, mrData, message }
    const mrValidationCache = new Map();
    if (uniqueMRNames.size > 0) {
      const mrValidationBatch = await Promise.allSettled(
        Array.from(uniqueMRNames).map(async (mrName) => {
          const result = await validateMR(mrName);
          return { mrName, result };
        }),
      );
      mrValidationBatch.forEach((settled) => {
        if (settled.status === "fulfilled") {
          mrValidationCache.set(settled.value.mrName, settled.value.result);
        }
      });
    }
    // Also add "unknown" so it never errors
    mrValidationCache.set("unknown", {
      success: true,
      exists: true,
      isUnknown: true,
      mrData: { mrName: "unknown", mrId: null },
    });

    // ── Group invoices, validate MRs, build _mrDistribution ──────────────
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const invoiceNumber = invoice.invoiceNumber?.trim();

      if (!invoiceNumber) {
        preValidationErrors.push({
          row: i + 2,
          invoiceNumber: "Unknown",
          message: "Invoice number is required",
          type: "validation_error",
        });
        failed++;
        continue;
      }

      // FIX: For MR sale imports, warn but DO NOT block — the frontend already
      // warned the user via MR validation and they chose to proceed.
      // Invalid MR invoices will be saved with the MR name as-is (no stock deduction
      // from MR hand, they fall back to warehouse path OR fail at deduction).
      // If you want to BLOCK invalid MRs, re-enable the block below.
      /*
      if (invoice.isMrSaleImport && invoice.mrName && invoice.mrName.toLowerCase() !== "unknown") {
        const mrResult = mrValidationCache.get(invoice.mrName.trim());
        if (mrResult && !mrResult.success) {
          preValidationErrors.push({
            row: i + 2, invoiceNumber, mrName: invoice.mrName,
            message: `MR not found: ${mrResult.message}`, type: "mr_validation_error",
          });
          failed++;
          continue;
        }
      }
      */

      if (!groupedInvoices.has(invoiceNumber)) {
        const mrName = invoice.mrName?.trim() || "No MR Name Provided";

        // Build initial _mrDistribution
        const mrDistribution = new Map();
        if (invoice.products && invoice.products.length > 0) {
          mrDistribution.set(mrName, {
            products: [...invoice.products],
            mrName,
          });
        }

        groupedInvoices.set(invoiceNumber, {
          ...invoice,
          mrName,
          products: invoice.products ? [...invoice.products] : [],
          _rowIndex: i,
          _mrDistribution: mrDistribution,
          isMrSaleImport: invoice.isMrSaleImport || false,
        });
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
              if (!existing._mrDistribution.has(newMrName)) {
                existing._mrDistribution.set(newMrName, {
                  products: [],
                  mrName: newMrName,
                });
              }
              existing._mrDistribution.get(newMrName).products.push(newProduct);
            } else {
              progress.duplicateProductsSkipped =
                (progress.duplicateProductsSkipped || 0) + 1;
            }
          }
        }
      }
    }

    errors.push(...preValidationErrors);

    progress.totalInvoices = groupedInvoices.size;
    progress.lastUpdated = Date.now();

    // ── Step 2: PARALLEL BATCH PROCESSING ────────────────────────────────
    const invoiceEntries = Array.from(groupedInvoices.values());
    let processedCount = 0;

    for (let i = 0; i < invoiceEntries.length; i += BATCH_SIZE) {
      const batch = invoiceEntries.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map((groupedInvoice) =>
          processSingleInvoiceWithMRDistribution(
            groupedInvoice,
            groupedInvoice._rowIndex,
            skipDuplicates,
            bypassStockCheck,
            true, // isImport = true
            mrValidationCache, // pass the pre-validated cache
          ),
        ),
      );

      for (const settled of batchResults) {
        processedCount++;

        if (settled.status === "rejected") {
          failed++;
          errors.push({
            invoiceNumber: "Unknown",
            message: settled.reason?.message || "Unexpected error",
            type: "unexpected_error",
          });
          continue;
        }

        const result = settled.value;

        if (result.skipped) {
          skippedDuplicates++;
        } else if (result.success) {
          if (result.action === "merged") {
            mergedInvoices++;
          } else {
            successful++;
          }
          if (result.mrCashUpdates) {
            for (const amount of Object.values(result.mrCashUpdates)) {
              totalMRCashAdded = fixPrecision(
                totalMRCashAdded + Number(amount || 0),
              );
            }
          }
        } else {
          failed++;
          if (result.error) errors.push(result.error);
        }

        progress.processedInvoices = processedCount;
        progress.successful = successful;
        progress.failed = failed;
        progress.skippedDuplicates = skippedDuplicates;
        progress.mergedInvoices = mergedInvoices;
        progress.progressPercentage = Math.round(
          (processedCount / groupedInvoices.size) * 100,
        );
        progress.lastUpdated = Date.now();
      }
    }

    progress.completed = true;
    progress.endTime = Date.now();
    progress.totalTime = progress.endTime - progress.startTime;
    progress.errors = errors;
    progress.status = "completed";
    progress.totalMRCashAdded = totalMRCashAdded;

    console.log(
      `✅ Import complete: ${successful} created, ${mergedInvoices} merged, ${skippedDuplicates} skipped, ${failed} failed in ${progress.totalTime}ms (batch size: ${BATCH_SIZE})`,
    );
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

// ─── mergeInvoiceProducts ─────────────────────────────────────────────────────
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
    const paymentStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
    let newPaidAmount = 0;

    for (const newProduct of newInvoiceData.products || []) {
      const productName = newProduct.productName?.trim();
      const salesQty = fixPrecision(parseFloat(newProduct.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(newProduct.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      const stockItem = await findStockItemFlexible(productName, session);
      if (!stockItem)
        throw new Error(`Product "${productName}" not found in inventory`);

      const currentAvailableStock = fixPrecision(
        Number(stockItem.totalBoxes || 0),
      );
      if (currentAvailableStock < totalQty)
        throw new Error(
          `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${currentAvailableStock}`,
        );

      const deductionResult = await deductStockFromReportInHand(
        productName,
        salesQty,
        bonusQty,
        existingInvoice.invoiceNumber,
        session,
      );
      if (!deductionResult.success)
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`,
        );

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

      const existingProductIndex = mergedProducts.findIndex(
        (p) => p.productName === productName,
      );
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
      } else {
        mergedProducts.push({
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
        });
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
    existingInvoice.updatedAt = new Date();
    await existingInvoice.save({ session });

    if (newPaidAmount > 0 && existingInvoice.mrName) {
      await updateMRCashes(
        existingInvoice.mrName,
        newPaidAmount,
        existingInvoice.invoiceNumber,
        new Date(),
        session,
        false,
      );
    }

    return {
      success: true,
      invoiceNumber: existingInvoice.invoiceNumber,
      action: "merged",
      addedProducts: (newInvoiceData.products || []).length,
      newTotalAmount: totalAmount,
      newPaidAmount: paidAmount,
      addedPaidAmount: newPaidAmount,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ==========================================
// SESSION CLEANUP
// ==========================================
const cleanupStaleImportSessions = () => {
  const now = Date.now();
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000;
  for (const [sessionId, progress] of importProgressMap.entries()) {
    if (progress.completed && now - progress.endTime > STALE_THRESHOLD)
      importProgressMap.delete(sessionId);
  }
};
setInterval(cleanupStaleImportSessions, 60 * 60 * 1000);

// ==========================================
// ROUTES
// ==========================================

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
          results.push({ mrName, success: false, error: "MR not found" });
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
            notes: `Synced from ${mrData.invoiceCount} sales`,
            isActive: true,
          });
        } else {
          mrCash.currentCash = totalCash;
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
    return res
      .status(500)
      .json({
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
    res
      .status(500)
      .json({
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to check stock",
        error: error.message,
      });
  }
});

router.post("/validate-import-stock", async (req, res) => {
  try {
    const { invoices } = req.body;
    if (!invoices || !Array.isArray(invoices))
      return res
        .status(400)
        .json({ success: false, message: "Invoices array is required" });
    const validationResult = await validateStockForImport(invoices);
    res.json({ success: true, validationResult });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to validate import stock",
        error: error.message,
      });
  }
});

router.get("/debug/stock/:productName", async (req, res) => {
  try {
    const stockItem = await findStockItemFlexible(req.params.productName);
    if (!stockItem)
      return res
        .status(404)
        .json({ success: false, message: `Product not found` });
    const batchEntries = (stockItem.batches || []).filter(
      (b) => !b.adjustmentType || b.adjustmentType === "batch",
    );
    res.json({
      success: true,
      productName: stockItem.productName,
      stockData: {
        totalBoxes: stockItem.totalBoxes,
        addStockAdjustment: stockItem.addStockAdjustment,
        removeStockAdjustment: stockItem.removeStockAdjustment,
      },
      batches: {
        totalBatches: stockItem.batches?.length || 0,
        regularBatches: batchEntries.length,
        batchTotal: batchEntries.reduce((s, b) => s + (b.boxes || 0), 0),
      },
      status: stockItem.status,
      lastUpdated: stockItem.updatedAt,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to debug stock",
        error: error.message,
      });
  }
});

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
    res
      .status(500)
      .json({
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

    if (mrNamesSet.size === 0)
      return res.json({
        success: true,
        mrIssues: [],
        totalInvoices: invoices.length,
        summary: { totalMRs: 0, validMRs: 0, invalidMRs: 0 },
        importBlocked: false,
      });

    const mrIssues = [];
    let validCount = 0;

    const validationResults = await Promise.allSettled(
      Array.from(mrNamesSet).map(async (mrNameLower) => {
        const mrData = mrToInvoices.get(mrNameLower);
        if (mrNameLower === "unknown") return { mrNameLower, valid: true };
        const validation = await validateMR(mrData.originalName);
        return {
          mrNameLower,
          mrData,
          valid: validation.success,
          message: validation.message,
        };
      }),
    );

    validationResults.forEach((settled) => {
      if (settled.status === "fulfilled") {
        const { valid, mrData, message } = settled.value;
        if (valid) {
          validCount++;
        } else if (mrData) {
          mrIssues.push({
            mrName: mrData.originalName,
            message,
            affectedInvoices: mrData.invoices,
            affectedCount: mrData.invoices.length,
          });
        }
      }
    });

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
        message:
          mrIssues.length > 0
            ? `${mrIssues.length} MRs not found in Staff system.`
            : "All MRs are valid.",
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to validate MRs",
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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN IMPORT ROUTE
// ─────────────────────────────────────────────────────────────────────────────
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

    if (!invoiceData.length)
      return res
        .status(400)
        .json({ success: false, message: "No invoices provided" });

    if (isImportInProgress) {
      return res
        .status(429)
        .json({
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
      bypassStockCheck: bypassStockCheck || false,
    });

    processImportWithStockDeduction(
      sessionId,
      invoiceData,
      true,
      bypassStockCheck,
    )
      .catch((error) => {
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          progress.status = "failed";
          progress.errors.push({
            message: "Import failed",
            error: error.message,
          });
        }
      })
      .finally(() => {
        isImportInProgress = false;
      });

    res.json({
      success: true,
      message: "Import started (parallel batch processing with locking)",
      sessionId,
      totalInvoices: invoiceData.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      batchSize: BATCH_SIZE,
    });
  } catch (error) {
    if (sessionId) importProgressMap.delete(sessionId);
    isImportInProgress = false;
    res
      .status(500)
      .json({ success: false, message: "Import failed", error: error.message });
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
    const decodedProductName = decodeURIComponent(
      req.params.productName,
    ).trim();
    if (!decodedProductName)
      return res
        .status(400)
        .json({
          success: false,
          message: "Product name is required",
          exists: false,
          product: null,
        });
    let product = await findProductRecordFlexible(decodedProductName);
    if (!product) product = await findStockItemFlexible(decodedProductName);
    res.json({
      success: true,
      exists: !!product,
      product: product ? { name: product.productName, id: product._id } : null,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        exists: false,
        message: error.message,
        product: null,
      });
  }
});

// ==========================================
// STANDARD CRUD ROUTES (unchanged logic)
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
    if (tab && tab !== "All")
      matchConditions.paymentStatus = new RegExp(
        `^${escapeRegexForSearch(tab)}$`,
        "i",
      );

    const [totalCount, summaries] = await Promise.all([
      SaleSummary.countDocuments(matchConditions),
      SaleSummary.find(matchConditions)
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
          products: 1,
        })
        .lean(),
    ]);

    res.status(200).json({
      summaries,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        totalCount,
        hasNext: pageNum < Math.ceil(totalCount / limitNum),
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
    if (tab && tab !== "All")
      matchConditions.paymentStatus = new RegExp(
        `^${escapeRegexForSearch(tab)}$`,
        "i",
      );

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
    if (!ids || !Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: "No valid IDs provided" });
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0)
      return res.status(400).json({ error: "No valid ObjectIds provided" });
    const result = await SaleSummary.deleteMany({ _id: { $in: validIds } });
    res.status(200).json({
      success: true,
      message: `${result.deletedCount} sale(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Batch delete failed" });
  }
});

router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const saleToDelete = await SaleSummary.findById(id).session(session);
    if (!saleToDelete) throw new Error("Sales record not found.");

    if (saleToDelete.paidAmount > 0 && saleToDelete.mrName) {
      await updateMRCashes(
        saleToDelete.mrName,
        saleToDelete.paidAmount,
        saleToDelete.invoiceNumber,
        new Date(),
        session,
        true,
      );
    }

    for (const product of saleToDelete.products || []) {
      const totalQty =
        (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);
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
    res
      .status(200)
      .json({
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
    if (!originalSale) throw new Error("Sales record not found.");

    if (
      req.body.invoiceNumber &&
      req.body.invoiceNumber !== originalSale.invoiceNumber
    ) {
      const invoiceExists = await SaleSummary.findOne({
        invoiceNumber: req.body.invoiceNumber,
        _id: { $ne: id },
      }).session(session);
      if (invoiceExists)
        throw new Error(
          `Invoice number "${req.body.invoiceNumber}" already exists.`,
        );
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

    for (const p of saleData.products || []) {
      if (!p.productName || !p.productName.trim()) continue;

      const newSalesQty = fixPrecision(Number(p.salesQty) || 0);
      const newBonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const newTotalQty = fixPrecision(newSalesQty + newBonusQty);
      if (newTotalQty === 0) continue;

      const originalProduct = originalSale.products.find(
        (op) => op.productName === p.productName,
      );
      const originalTotalQty = fixPrecision(
        (Number(originalProduct?.salesQty) || 0) +
          (Number(originalProduct?.bonusQty) || 0),
      );
      const quantityDifference = fixPrecision(newTotalQty - originalTotalQty);

      if (Math.abs(quantityDifference) > 0.0001) {
        if (quantityDifference > 0) {
          const stockItem = await findStockItemFlexible(p.productName, session);
          if (!stockItem)
            throw new Error(
              `Product "${p.productName}" not found in inventory`,
            );
          const availableStock = fixPrecision(
            Number(stockItem.totalBoxes || 0),
          );
          if (availableStock < Math.abs(quantityDifference))
            throw new Error(
              `Insufficient stock for ${p.productName}. Required: ${Math.abs(quantityDifference)}, Available: ${availableStock}`,
            );
          const deductResult = await deductStockFromReportInHand(
            p.productName,
            quantityDifference,
            0,
            originalSale.invoiceNumber,
            session,
          );
          if (!deductResult.success)
            throw new Error(
              `Stock deduction failed for ${p.productName}: ${deductResult.message}`,
            );
        } else {
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
        const pr = await findProductRecordFlexible(p.productName);
        lcValue = pr?.lc || 0;
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

    if (updatedProducts.length === 0)
      throw new Error("At least one valid product is required");

    const paidAmount = fixPrecision(Number(saleData.paidAmount) || 0);
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));
    const paidAmountDifference = fixPrecision(
      paidAmount - originalSale.paidAmount,
    );

    if (Math.abs(paidAmountDifference) > 0.01) {
      const mrName = saleData.mrName || originalSale.mrName;
      if (mrName)
        await updateMRCashes(
          mrName,
          paidAmountDifference,
          saleData.invoiceNumber || originalSale.invoiceNumber,
          saleData.invoiceDate || originalSale.invoiceDate || new Date(),
          session,
          paidAmountDifference < 0,
        );
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
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];

    // Validate stock first
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      if (totalQty <= 0) continue;

      if (isMRSale) {
        if (!p.mrId)
          throw new Error(`MR not selected for product: ${p.productName}`);
        const stockinmrhands =
          mongoose.connection.db.collection("stockinmrhands");
        const mrStock = await stockinmrhands.findOne(
          { mrId: new mongoose.Types.ObjectId(p.mrId) },
          { session },
        );
        if (!mrStock)
          throw new Error(`MR stock not found for MR ID: ${p.mrId}`);
        const mrProduct = mrStock.productsInHand?.find(
          (prod) =>
            prod?.productName?.toLowerCase().trim() ===
            p.productName?.toLowerCase().trim(),
        );
        if (!mrProduct)
          throw new Error(
            `Product "${p.productName}" not found in ${mrStock.mrName}'s stock`,
          );
        if (fixPrecision(Number(mrProduct.quantity) || 0) < totalQty)
          throw new Error(
            `Insufficient MR stock for ${p.productName} in ${mrStock.mrName}'s hand`,
          );
      } else {
        const stockItem = await findStockItemFlexible(p.productName, session);
        if (!stockItem)
          throw new Error(`Product "${p.productName}" not found in inventory`);
        if (fixPrecision(Number(stockItem.totalBoxes || 0)) < totalQty)
          throw new Error(`Insufficient warehouse stock for ${p.productName}`);
      }
    }

    // Deduct stock and build products
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
        stockDeductionResults.push({
          product: p.productName.trim(),
          mrId: p.mrId,
          mrName: p.mrName,
          ...deductionResult,
        });
        if (!deductionResult.success)
          throw new Error(
            `MR stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );

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
        stockDeductionResults.push({
          product: p.productName.trim(),
          ...deductionResult,
        });
        if (!deductionResult.success)
          throw new Error(
            `Warehouse stock deduction failed for ${p.productName}: ${deductionResult.message}`,
          );
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

    if (!processedProducts.length)
      throw new Error("At least one valid product is required");

    const paidAmount = fixPrecision(Number(data.paidAmount) || 0);
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));
    const paymentStatus = mapPaymentStatus(data.paymentStatus);

    let mrName = data.mrName;
    let mrId = data.mrId;
    if (isMRSale && processedProducts.length > 0) {
      mrName = processedProducts[0].mrName || "MR Sale";
      mrId = processedProducts[0].mrId;
    }

    const sale = await SaleSummary.create(
      [
        {
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
          paymentStatus,
          remark: data.remark || "",
          stockDeductionResults,
          isMRSale,
        },
      ],
      { session },
    );

    if (paidAmount > 0 && mrName) {
      await updateMRCashes(
        mrName,
        paidAmount,
        data.invoiceNumber,
        data.invoiceDate || new Date(),
        session,
        false,
      );
    }

    await session.commitTransaction();
    session.endSession();
    res.status(201).json({
      success: true,
      message: isMRSale
        ? "MR Sale created successfully"
        : "Sale created successfully",
      sale: sale[0],
      stockDeductionResults,
    });
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    try {
      await session.endSession();
    } catch (_) {}
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
      return {
        _id: mrStock.mrId,
        mrName: mrStock.mrName,
        totalProducts: products.length,
        productsWithStock: products.filter((p) => p.quantity > 0).length,
        totalQuantity,
        hasStock: totalQuantity > 0,
      };
    });
    res.json({ success: true, data: mrsWithStock, count: mrsWithStock.length });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch MRs with stock",
        error: error.message,
      });
  }
});

router.get("/mr-stock/products/:mrId", async (req, res) => {
  try {
    const mrStock = await mongoose.connection.db
      .collection("stockinmrhands")
      .findOne({ mrId: new mongoose.Types.ObjectId(req.params.mrId) });
    if (!mrStock)
      return res.json({ success: true, products: [], mrName: null });
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch MR products",
        error: error.message,
      });
  }
});

router.get("/mr-stock/:mrId/:productName", async (req, res) => {
  try {
    const decodedProductName = decodeURIComponent(req.params.productName);
    const mrStock = await mongoose.connection.db
      .collection("stockinmrhands")
      .findOne({ mrId: new mongoose.Types.ObjectId(req.params.mrId) });
    if (!mrStock)
      return res
        .status(404)
        .json({ success: false, message: "MR stock not found" });
    const product = mrStock.productsInHand.find(
      (p) =>
        p.productName.toLowerCase().trim() ===
        decodedProductName.toLowerCase().trim(),
    );
    if (!product)
      return res.status(404).json({
        success: false,
        message: `Product "${decodedProductName}" not found in ${mrStock.mrName}'s stock`,
      });
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
    res
      .status(500)
      .json({
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
        },
      },
    ]);
    res.json({
      success: true,
      summary:
        result.length > 0
          ? result[0]
          : {
              totalSales: 0,
              totalAmount: 0,
              totalProfitLoss: 0,
              totalPaid: 0,
              totalDue: 0,
            },
    });
  } catch (error) {
    res
      .status(500)
      .json({
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

    const formattedSales = creditSales.map((invoice) => ({
      ...invoice,
      outstandingAmount:
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)),
    }));
    const totalAmount = formattedSales.reduce(
      (total, invoice) => total + invoice.outstandingAmount,
      0,
    );

    res.json({
      success: true,
      data: formattedSales,
      totalAmount: totalAmount.toFixed(2),
      count: formattedSales.length,
    });
  } catch (error) {
    res
      .status(500)
      .json({
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
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { invoiceDate: { $gte: new Date(startDate), $lte: end } };
    } else {
      const now = new Date();
      const ranges = {
        Today: { start: new Date(new Date().setHours(0, 0, 0, 0)), end: now },
        Month: {
          start: new Date(now.getFullYear(), now.getMonth(), 1),
          end: now,
        },
        Year: { start: new Date(now.getFullYear(), 0, 1), end: now },
      };
      if (ranges[period])
        dateFilter = {
          invoiceDate: { $gte: ranges[period].start, $lte: ranges[period].end },
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
        },
      },
      { $sort: { date: -1 } },
    ]);

    res.json({
      success: true,
      data: salesData.map((s) => ({ ...s, customer: s.customer || "N/A" })),
      count: salesData.length,
      period,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: error.message, data: [], count: 0 });
  }
});

router.get("/check-stock/health", async (req, res) => {
  res.json({
    success: true,
    message: "Stock check endpoint is working",
    batchSize: BATCH_SIZE,
    timestamp: new Date().toISOString(),
  });
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
      return res
        .status(404)
        .json({
          success: false,
          message: "MR Cash record for Yav Phanda not found",
        });

    const oldCash = mrCash.currentCash;
    mrCash.currentCash = fixPrecision(oldCash - totalExcess);
    mrCash.notes = `${mrCash.notes || ""}\nOne-time fix: Removed ₹${totalExcess.toFixed(2)} excess (${new Date().toISOString()})`;
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
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fix MR Cash duplicates",
        error: error.message,
      });
  }
});

export default router;
