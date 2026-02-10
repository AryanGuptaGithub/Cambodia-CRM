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

const router = express.Router();
const importProgressMap = new Map();
let isImportInProgress = false;
const importLock = new Map();

// ==========================================
// HELPER FUNCTIONS - IMPROVED
// ==========================================

const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

const escapeRegexForSearch = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

// IMPROVED: Helper function to check if an invoice should be merged or is a duplicate
const shouldMergeInvoices = (existingInvoice, newInvoiceData) => {
  if (existingInvoice.invoiceNumber !== newInvoiceData.invoiceNumber) {
    return { shouldMerge: false, isExactDuplicate: false };
  }
  
  if (existingInvoice.customerCode !== newInvoiceData.customerCode) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "Customer mismatch" };
  }
  
  const existingStatus = mapPaymentStatus(existingInvoice.paymentStatus);
  const newStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
  if (existingStatus !== newStatus) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "Payment status mismatch" };
  }
  
  if (existingInvoice.mrName !== newInvoiceData.mrName) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "MR mismatch" };
  }
  
  const existingProductNames = existingInvoice.products.map(p => p.productName).sort();
  const newProductNames = (newInvoiceData.products || []).map(p => p.productName?.trim()).sort();
  
  if (JSON.stringify(existingProductNames) === JSON.stringify(newProductNames)) {
    let isExactDuplicate = true;
    
    for (const newProduct of newInvoiceData.products || []) {
      const existingProduct = existingInvoice.products.find(
        ep => ep.productName === newProduct.productName?.trim()
      );
      
      if (!existingProduct) {
        isExactDuplicate = false;
        break;
      }
      
      if (fixPrecision(existingProduct.salesQty) !== fixPrecision(parseFloat(newProduct.salesQty) || 0)) {
        isExactDuplicate = false;
        break;
      }
      
      if (fixPrecision(existingProduct.bonusQty) !== fixPrecision(parseFloat(newProduct.bonusQty) || 0)) {
        isExactDuplicate = false;
        break;
      }
      
      if (fixPrecision(existingProduct.sellingPrice) !== fixPrecision(parseFloat(newProduct.sellingPrice) || 0)) {
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

// Helper function to merge products from new invoice into existing invoice
const mergeInvoiceProducts = async (existingInvoice, newInvoiceData, session) => {
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
      
      const existingProductIndex = mergedProducts.findIndex(
        p => p.productName === productName
      );
      
      // IMPROVED: More flexible product lookup
      const stockItem = await findStockItemFlexible(productName, session);
      
      if (!stockItem) {
        throw new Error(`Product "${productName}" not found in inventory`);
      }
      
      const currentAvailableStock = fixPrecision(
        Number(stockItem.totalBoxes || 0)
      );
      
      if (currentAvailableStock < totalQty) {
        const shortage = fixPrecision(totalQty - currentAvailableStock);
        throw new Error(
          `Insufficient stock for ${productName}. ` +
          `Required: ${totalQty}, Available: ${currentAvailableStock}, ` +
          `Short by: ${shortage}`
        );
      }
      
      const deductionResult = await deductStockFromReportInHand(
        productName,
        salesQty,
        bonusQty,
        existingInvoice.invoiceNumber,
        session
      );
      
      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`
        );
      }
      
      // IMPROVED: More flexible product lookup
      const productRecord = await findProductRecordFlexible(productName, session);
      
      const lc = productRecord?.lc || 0;
      const sellingPrice = fixPrecision(parseFloat(newProduct.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(newProduct.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);
      
      if (existingProductIndex >= 0) {
        const existingProduct = mergedProducts[existingProductIndex];
        existingProduct.salesQty = fixPrecision(existingProduct.salesQty + salesQty);
        existingProduct.bonusQty = fixPrecision(existingProduct.bonusQty + bonusQty);
        existingProduct.totalQty = fixPrecision(existingProduct.totalQty + totalQty);
        existingProduct.netSellingAmount = fixPrecision(existingProduct.netSellingAmount + netSellingAmount);
        existingProduct.profitLoss = fixPrecision(existingProduct.profitLoss + profitLoss);
        existingProduct.amount = fixPrecision(existingProduct.amount + amount);
        existingProduct.discount = fixPrecision(existingProduct.discount + discount);
        existingProduct.averageUnitPrice = existingProduct.totalQty > 0 ? 
          fixPrecision(existingProduct.netSellingAmount / existingProduct.totalQty) : 0;
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
          averageUnitPrice: totalQty ? fixPrecision(netSellingAmount / totalQty) : 0,
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
    existingInvoice.updatedAt = new Date();
    
    await existingInvoice.save({ session });
    
    if (newPaidAmount > 0 && existingInvoice.mrName) {
      const mrCashUpdate = await updateMRCashes(
        existingInvoice.mrName,
        newPaidAmount,
        existingInvoice.invoiceNumber,
        new Date(),
        session,
        false
      );
      
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.error(`⚠️ Failed to update MR Cash during merge: ${mrCashUpdate.error}`);
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
    };
    
  } catch (error) {
    console.error(`❌ Error merging invoice ${existingInvoice.invoiceNumber}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name.toLowerCase().trim();
};

const generateProductNameVariations = (productName) => {
  const variations = new Set();
  if (!productName) return Array.from(variations);

  const baseName = productName.toLowerCase().trim();
  variations.add(baseName);

  const withNormalizedSpaces = baseName
    .replace(/\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (withNormalizedSpaces !== baseName) {
    variations.add(withNormalizedSpaces);
  }

  return Array.from(variations);
};

const escapeRegex = (str) => {
  if (!str) return "";
  return str.replace(/[*+?^${}()|[\]\\]/g, "\\$&");
};

// IMPROVED: More flexible product name regex builder
const buildProductNameRegex = (productName) => {
  if (!productName || productName.trim() === "") return /^$/;
  
  const trimmed = productName.trim();
  const escaped = escapeRegex(trimmed);
  
  // More flexible handling of numbers and spaces
  const flexiblePattern = escaped
    .replace(/\s+/g, "\\s*")  // Allow flexible spacing
    .replace(/(\d+\.?\d*)/g, "\\s*$1\\s*");  // Better handle numbers like "0.5", "1"
  
  return new RegExp(`^${flexiblePattern}$`, "i");
};

// NEW: More flexible product lookup function
const findStockItemFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);
    
    // First try exact match
    let query = ReportInHand.findOne({ 
      productName: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") }
    });
    
    if (session) query = query.session(session);
    
    let stockItem = await query;
    
    // If not found, try more flexible search
    if (!stockItem) {
      // Split product name into parts for better matching
      const nameParts = normalizedName.split(/\s+/);
      
      // Create a more flexible regex pattern
      const flexiblePattern = nameParts
        .map(part => escapeRegex(part))
        .join("\\s*.*?\\s*");
      
      query = ReportInHand.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") }
      });
      
      if (session) query = query.session(session);
      stockItem = await query;
    }
    
    // If still not found, try searching in Product collection
    if (!stockItem) {
      const productRecord = await findProductRecordFlexible(productName, session);
      if (productRecord) {
        // Try to find stock with the catalog product name
        query = ReportInHand.findOne({
          productName: { $regex: new RegExp(escapeRegex(productRecord.productName), "i") }
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

// NEW: More flexible product record lookup
const findProductRecordFlexible = async (productName, session = null) => {
  try {
    const normalizedName = normalizeProductName(productName);
    
    // First try exact match
    let query = Product.findOne({ 
      productName: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") }
    });
    
    if (session) query = query.session(session);
    
    let product = await query;
    
    // If not found, try more flexible search
    if (!product) {
      const nameParts = normalizedName.split(/\s+/);
      const flexiblePattern = nameParts
        .map(part => escapeRegex(part))
        .join("\\s*.*?\\s*");
      
      query = Product.findOne({
        productName: { $regex: new RegExp(flexiblePattern, "i") }
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
    paid: "Cash",
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
      };
    }

    const cleanedCode = customerCode.trim();
    
    const digitsMatch = cleanedCode.match(/\d+/);
    if (!digitsMatch) {
      return {
        success: false,
        message: `Invalid customer code format: "${cleanedCode}"`,
      };
    }
    
    const digits = digitsMatch[0];
    const normalizedCode = digits.padStart(5, '0');
    
    console.log(`Looking up customer: ${cleanedCode} -> ${normalizedCode}`);

    const query = Customer.findOne({
      customerCode: normalizedCode,
      enabled: true,
    });

    if (session) {
      query.session(session);
    }

    const customer = await query;

    if (!customer) {
      return {
        success: false,
        message: `Customer with code "${cleanedCode}" (normalized to "${normalizedCode}") not found`,
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
    console.error(`Error fetching customer with code "${customerCode}":`, error);
    return {
      success: false,
      message: `Error fetching customer: ${error.message}`,
    };
  }
};

// IMPROVED: Stock calculation with better product matching
const calculateProductStock = async (productName, requiredQty = 0) => {
  try {
    // First try to find the product using flexible search
    const stockItem = await findStockItemFlexible(productName);
    
    if (!stockItem) {
      // Try to find in product catalog
      const productInCatalog = await findProductRecordFlexible(productName);
      
      return {
        success: false,
        found: false,
        productName,
        requiredQty,
        availableStock: 0,
        insufficient: true,
        insufficientQty: requiredQty,
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
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        const batchEntries = stockItem.batches.filter(
          (batch) => !batch.adjustmentType || batch.adjustmentType === "batch",
        );

        let batchesSum = 0;
        batchEntries.forEach((batch) => {
          const batchQty = fixPrecision(Number(batch.boxes || 0));
          if (batchQty > 0) {
            batchesSum = fixPrecision(batchesSum + batchQty);
            batchDetails.push({
              batchNumber: batch.batchNumber,
              boxes: batchQty,
              expiryDate: batch.expiryDate,
              adjustmentType: batch.adjustmentType,
            });
          }
        });

        let totalAdjustments = 0;
        if (stockItem.addStockAdjustment) {
          totalAdjustments = fixPrecision(
            totalAdjustments +
              fixPrecision(Number(stockItem.addStockAdjustment)),
          );
        }
        if (stockItem.removeStockAdjustment) {
          totalAdjustments = fixPrecision(
            totalAdjustments -
              fixPrecision(Number(stockItem.removeStockAdjustment)),
          );
        }

        availableStock = fixPrecision(
          Math.max(0, batchesSum + totalAdjustments),
        );
      }
    }

    const insufficientQty = fixPrecision(
      Math.max(0, requiredQty - availableStock),
    );
    const hasEnoughStock = availableStock >= requiredQty;

    return {
      success: true,
      found: true,
      productName: stockItem.productName,
      requestedProductName: productName,
      availableStock: availableStock,
      requiredQty,
      insufficient: !hasEnoughStock,
      insufficientQty,
      hasEnoughStock,
      batchDetails,
      calculationMethod: "reportinhand_with_adjustments",
      productExists: true,
      message: hasEnoughStock
        ? `✅ Stock available: ${availableStock} units`
        : `❌ Insufficient stock. Required: ${requiredQty}, Available: ${availableStock}, Short by: ${insufficientQty}`,
    };
  } catch (error) {
    console.error(`❌ STOCK CALCULATION ERROR for ${productName}:`, error);
    return {
      success: false,
      found: false,
      productName,
      availableStock: 0,
      requiredQty,
      insufficient: true,
      insufficientQty: requiredQty,
      message: `Error checking stock: ${error.message}`,
      status: "Error",
      issueType: "Stock check failed",
      productExists: false,
    };
  }
};

// IMPROVED: Stock deduction with better product matching
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

    // Use flexible product search
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

    if (remainingStock <= 0) {
      stockItem.status = "Out of Stock";
    } else if (remainingStock < (stockItem.minStockLevel || 10)) {
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
      newStock: remainingStock,
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

      const newBatch = {
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
      };

      if (!stockItem.batches) {
        stockItem.batches = [];
      }
      stockItem.batches.push(newBatch);

      stockItem.updatedAt = new Date();

      await stockItem.save({ session });

      const updatedStockItem = await ReportInHand.findById(
        stockItem._id,
      ).session(session);

      await session.commitTransaction();
      await session.endSession();

      return {
        success: true,
        restored: restoredQty,
        newStockLevel: updatedStockItem.totalBoxes,
        oldStockLevel: stockItem.totalBoxes,
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

      return {
        success: true,
        restored: restoredQty,
        createdNew: true,
        newStockLevel: newStockItem.totalBoxes,
        message: `Created new stock item with ${restoredQty} units`,
      };
    }
  } catch (error) {
    console.error(`❌ RESTORE STOCK ERROR for ${productName}:`, error);

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
    
    const escapeForRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const query = Staff.findOne({
      medicalRepName: { 
        $regex: `^${escapeForRegex(cleanedMrName)}$`, 
        $options: "i" 
      },
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

    // Collect all products
    for (const invoice of invoices) {
      for (const product of invoice.products) {
        const requiredQty = (product.salesQty || 0) + (product.bonusQty || 0);
        if (requiredQty > 0) {
          const productName = product.productName;
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
          productData.totalRequired += requiredQty;
          productData.requiredByInvoices.push({
            invoiceNumber: invoice.invoiceNumber,
            requiredQty,
            customerName: invoice.customerName,
          });
        }
      }
    }

    // Check each product
    for (const [productName, productData] of productStockMap.entries()) {
      if (!productData.checked) {
        try {
          const stockCheck = await calculateProductStock(productName, productData.totalRequired);
          
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
              message: stockCheck.message,
              productExists: stockCheck.found,
              insufficient: stockCheck.insufficient,
              type: !stockCheck.found ? "missing_product" : "insufficient_stock"
            });
          }

          productData.checked = true;
        } catch (error) {
          stockIssues.push({
            productName,
            totalRequired: productData.totalRequired,
            availableStock: 0,
            insufficientQty: productData.totalRequired,
            requiredByInvoices: productData.requiredByInvoices,
            message: "Could not verify product existence",
            productExists: false,
            insufficient: false,
            type: "verification_error"
          });
        }
      }
    }

    // Calculate summary with better categorization
    const insufficientCount = stockIssues.filter(issue => 
      issue.productExists && issue.insufficient
    ).length;
    
    const missingCount = stockIssues.filter(issue => 
      !issue.productExists
    ).length;

    return {
      stockIssues,
      totalInvoices: invoices.length,
      summary: {
        totalProducts: productStockMap.size,
        totalRequired: Array.from(productStockMap.values()).reduce(
          (sum, p) => sum + (p.totalRequired || 0),
          0,
        ),
        totalAvailable: Array.from(productStockMap.values()).reduce(
          (sum, p) => sum + (p.availableStock || 0),
          0,
        ),
        totalInsufficient: insufficientCount,
        missingProducts: missingCount,
        lowStockProducts: insufficientCount,
        hasCriticalIssues: stockIssues.some(issue => issue.type === "verification_error"),
        hasInsufficientStock: insufficientCount > 0,
        importBlocked: insufficientCount > 0, // Block only if insufficient stock
      },
      insufficientStockIssues: stockIssues.filter(issue => issue.productExists && issue.insufficient),
      missingProductIssues: stockIssues.filter(issue => !issue.productExists),
      importBlocked: insufficientCount > 0,
      blockReason: insufficientCount > 0 ? "INSUFFICIENT_STOCK" : 
                   missingCount > 0 ? "MISSING_PRODUCTS_ONLY" : "NO_ISSUES",
      message: insufficientCount > 0 
        ? `${insufficientCount} products have insufficient stock. Please update inventory.`
        : missingCount > 0
          ? `${missingCount} products not found. They will be created during import.`
          : "All products have sufficient stock."
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
        hasCriticalIssues: false,
        hasInsufficientStock: false,
        importBlocked: false,
      },
      insufficientStockIssues: [],
      missingProductIssues: [],
      importBlocked: false,
      blockReason: "VALIDATION_ERROR",
      message: "Stock validation failed"
    };
  }
};

// ==========================================
// ROUTES
// ==========================================

router.post("/mrcash/sync-from-sales", async (req, res) => {
  try {
    console.log("🔄 Starting MR Cash synchronization from all sales...");

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
          invoices: { $push: { invoiceNumber: "$invoiceNumber", paidAmount: "$paidAmount" } }
        },
      },
    ]);

    console.log(`📊 Found ${salesByMR.length} MRs with sales data`);

    const results = [];

    for (const mrData of salesByMR) {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const mrName = mrData._id;
        const totalCash = fixPrecision(mrData.totalPaidAmount);

        console.log(`\n📋 Processing MR: ${mrName}`);
        console.log(`   Total from ${mrData.invoiceCount} invoices: ${totalCash}`);
        
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

        console.log(
          `✅ Synced: ${mr.medicalRepName} = ₹${totalCash} (${mrData.invoiceCount} invoices)`
        );
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

    console.log(
      `\n✅ Sync complete: ${successCount} succeeded, ${failCount} failed`
    );

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

// NEW: Validate stock for multiple products (for import)
router.post("/validate-import-stock", async (req, res) => {
  try {
    const { invoices } = req.body;
    
    if (!invoices || !Array.isArray(invoices)) {
      return res.status(400).json({
        success: false,
        message: "Invoices array is required",
      });
    }

    const validationResult = await validateStockForImport(invoices);

    res.json({
      success: true,
      validationResult,
    });
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
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    const stockItem = await findStockItemFlexible(productName);

    if (!stockItem) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found in ReportInHand`,
      });
    }

    const batchEntries = (stockItem.batches || []).filter(
      (batch) => !batch.adjustmentType || batch.adjustmentType === "batch",
    );

    const batchTotal = batchEntries.reduce(
      (sum, batch) => sum + (batch.boxes || 0),
      0,
    );

    const adjustmentBatches = (stockItem.batches || []).filter(
      (batch) => batch.adjustmentType && batch.adjustmentType !== "batch",
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
      },
      batches: {
        totalBatches: stockItem.batches?.length || 0,
        regularBatches: batchEntries.length,
        adjustmentBatches: adjustmentBatches.length,
        batchTotal: batchTotal,
        batchDetails: batchEntries.map((batch) => ({
          batchNumber: batch.batchNumber,
          boxes: batch.boxes,
          adjustmentType: batch.adjustmentType,
          expiryDate: batch.expiryDate,
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
      return res.status(404).json({ success: false, message: "Session not found" });
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
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch progress" });
  }
});

router.post("/validate-mr", async (req, res) => {
  try {
    const { mrNames } = req.body;
    
    if (!mrNames || !Array.isArray(mrNames)) {
      return res.status(400).json({
        success: false,
        message: "MR names array required"
      });
    }

    const results = await Promise.all(
      mrNames.map(async (mrName) => {
        const validation = await validateMR(mrName);
        return {
          mrName,
          valid: validation.success,
          exists: validation.exists,
          message: validation.message
        };
      })
    );

    const invalidMRs = results.filter(r => !r.valid);

    res.json({
      success: invalidMRs.length === 0,
      results,
      invalidMRs,
      message: invalidMRs.length > 0 
        ? `${invalidMRs.length} invalid MR(s) found`
        : 'All MRs valid'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Validation failed",
      error: error.message
    });
  }
});

// NEW: Validate MRs for import
router.post("/validate-import-mrs", async (req, res) => {
  try {
    const { invoices } = req.body;
    
    if (!invoices || !Array.isArray(invoices)) {
      return res.status(400).json({
        success: false,
        message: "Invoices array is required",
      });
    }

    const mrNames = new Set();
    const mrToInvoices = new Map();
    
    // Collect all unique MR names and track their invoices
    for (const invoice of invoices) {
      if (invoice.mrName && invoice.mrName.trim()) {
        const mrName = invoice.mrName.trim();
        mrNames.add(mrName);
        
        if (!mrToInvoices.has(mrName)) {
          mrToInvoices.set(mrName, []);
        }
        mrToInvoices.get(mrName).push({
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          products: invoice.products?.length || 0,
        });
      }
    }

    if (mrNames.size === 0) {
      return res.json({
        success: true,
        mrIssues: [],
        totalInvoices: invoices.length,
        summary: {
          totalMRs: 0,
          validMRs: 0,
          invalidMRs: 0,
        },
        importBlocked: false,
      });
    }

    const mrIssues = [];
    
    for (const mrName of mrNames) {
      const validation = await validateMR(mrName);
      
      if (!validation.success) {
        const affectedInvoices = mrToInvoices.get(mrName) || [];
        
        mrIssues.push({
          mrName,
          message: validation.message,
          affectedInvoices: affectedInvoices,
          affectedCount: affectedInvoices.length,
        });
      }
    }

    const validationResult = {
      mrIssues,
      totalInvoices: invoices.length,
      summary: {
        totalMRs: mrNames.size,
        validMRs: mrNames.size - mrIssues.length,
        invalidMRs: mrIssues.length,
      },
      importBlocked: mrIssues.length > 0,
      blockReason: mrIssues.length > 0 ? "INVALID_MRS" : "NO_ISSUES",
      message: mrIssues.length > 0 
        ? `${mrIssues.length} MRs not found in Staff system. Please add them first.`
        : "All MRs are valid."
    };

    res.json({
      success: true,
      validationResult,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to validate MRs",
      error: error.message,
    });
  }
});

router.post("/import-with-stock-deduction", async (req, res) => {
  let sessionId = null;
  try {
    const { invoices, bypassStockCheck = false } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];
    
    if (!invoiceData.length) {
      return res.status(400).json({ success: false, message: "No invoices provided" });
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
      bypassStockCheck: bypassStockCheck || false,
    });
    
    // Start import process
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
    res.status(500).json({ success: false, message: "Import failed", error: error.message });
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
    if (fixPrecision(p1.sellingPrice) !== fixPrecision(p2.sellingPrice)) return false;
    if (fixPrecision(p1.discount) !== fixPrecision(p2.discount)) return false;
  }
  
  if (invoice1.customerCode !== invoice2.customerCode) return false;
  if (fixPrecision(invoice1.paidAmount) !== fixPrecision(invoice2.paidAmount)) return false;
  
  return true;
};

const processSingleInvoiceWithStockDeduction = async (invoiceData, index, skipDuplicates = true, bypassStockCheck = false) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }
    
    // Check for existing invoice with same invoice number
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
        console.log(`🔄 Merging products into existing invoice: ${invoiceData.invoiceNumber}`);
        
        const mergeResult = await mergeInvoiceProducts(existingInvoice, invoiceData, session);
        
        if (mergeResult.success) {
          await session.commitTransaction();
          await session.endSession();
          
          console.log(`✅ MERGED - Invoice: ${invoiceData.invoiceNumber} | Added ${mergeResult.addedProducts} products | New Total: ${mergeResult.newTotalAmount} | Added Paid: ${mergeResult.addedPaidAmount}`);
          
          return {
            success: true,
            invoiceNumber: invoiceData.invoiceNumber,
            action: "merged",
            addedProducts: mergeResult.addedProducts,
            paidAmount: mergeResult.addedPaidAmount,
            mergeResult: mergeResult,
          };
        } else {
          throw new Error(`Failed to merge invoice: ${mergeResult.error}`);
        }
      } else {
        throw new Error(
          `Invoice number ${invoiceData.invoiceNumber} already exists but cannot be merged: ${mergeCheck.reason || "Incompatible data"}. ` +
          `If you want to update, use the edit function instead of import.`
        );
      }
    }
    
    // Get customer details
    let customerName = invoiceData.customerName || "";
    let customerId = invoiceData.customerId || null;
    
    if (invoiceData.customerCode && invoiceData.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(
        invoiceData.customerCode,
        session
      );
      if (!customerResult.success) {
        throw new Error(customerResult.message);
      }
      customerName = customerResult.customer.customerName;
      customerId = customerResult.customer.customerId;
    } else if (!customerName) {
      throw new Error("Customer code or customer name is required");
    }
    
    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];
    
    // Process each product
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      
      if (totalQty <= 0) continue;
      
      // Use flexible product search
      const stockItem = await findStockItemFlexible(productName, session);
      
      if (!stockItem) {
        if (bypassStockCheck) {
          console.log(`⚠️ Product "${productName}" not found but proceeding due to bypassStockCheck`);
          // Create a placeholder for missing product
        } else {
          throw new Error(`Product "${productName}" not found in inventory`);
        }
      } else {
        const currentAvailableStock = fixPrecision(
          Number(stockItem.totalBoxes || 0)
        );
        
        console.log(
          `🔍 IMPORT - Invoice: ${invoiceData.invoiceNumber} | ` +
            `Product: "${productName}" | ` +
            `Available: ${currentAvailableStock} | ` +
            `Required: ${totalQty}`
        );
        
        if (currentAvailableStock < totalQty) {
          if (bypassStockCheck) {
            console.log(`⚠️ Insufficient stock for "${productName}" but proceeding due to bypassStockCheck`);
          } else {
            const shortage = fixPrecision(totalQty - currentAvailableStock);
            throw new Error(
              `Insufficient stock for ${productName}. ` +
                `Required: ${totalQty}, Available: ${currentAvailableStock}, ` +
                `Short by: ${shortage}`
            );
          }
        }
      }
      
      // Get product details using flexible search
      const productRecord = await findProductRecordFlexible(productName, session);
      
      const lc = productRecord?.lc || 0;
      const sellingPrice = fixPrecision(parseFloat(product.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(product.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      
      processedProducts.push({
        productName: productName,
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty ? fixPrecision(netSellingAmount / totalQty) : 0,
        lc,
        profitLoss: fixPrecision((sellingPrice - lc) * salesQty),
        isProductAccept: true,
      });
      
      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      
      // Deduct stock only if stock item exists and we're not bypassing
      if (stockItem && !bypassStockCheck) {
        const deductionResult = await deductStockFromReportInHand(
          productName,
          salesQty,
          bonusQty,
          invoiceData.invoiceNumber,
          session
        );
        
        stockDeductionResults.push({
          product: productName,
          ...deductionResult,
        });
        
        if (!deductionResult.success) {
          throw new Error(
            `Stock deduction failed for ${productName}: ${deductionResult.message}`
          );
        }
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
    
    console.log(`📋 NEW INVOICE - Invoice: ${invoiceData.invoiceNumber} | Total: ${totalAmount} | Paid: ${paidAmount} | Due: ${dueAmount} | Status: ${paymentStatus}`);
    
    const saleRecord = new SaleSummary({
      recordingDate: invoiceData.recordingDate
        ? new Date(invoiceData.recordingDate)
        : new Date(),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: customerName,
      customerCode: invoiceData.customerCode || "",
      customerId: customerId,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: fixPrecision(
        processedProducts.reduce((sum, p) => sum + (p.profitLoss || 0), 0)
      ),
      paymentStatus: paymentStatus,
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
      bypassStockCheck: bypassStockCheck || false,
    });
    
    await saleRecord.save({ session });
    
    if (paidAmount > 0 && invoiceData.mrName && invoiceData.mrName.trim()) {
      console.log(`💵 Updating MR Cash for invoice ${invoiceData.invoiceNumber}: Amount = ${paidAmount}`);
      
      const mrCashUpdate = await updateMRCashes(
        invoiceData.mrName.trim(),
        paidAmount,
        invoiceData.invoiceNumber,
        invoiceData.invoiceDate || new Date(),
        session,
        false
      );
      
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.error(`⚠️ Failed to update MR Cash: ${mrCashUpdate.error}`);
      } else if (mrCashUpdate.success) {
        console.log(`✅ MR Cash updated successfully for ${invoiceData.mrName}`);
      }
    } else {
      console.log(`⏭️ Skipping MR Cash update - PaidAmount: ${paidAmount}, MRName: ${invoiceData.mrName}`);
    }
    
    await session.commitTransaction();
    await session.endSession();
    
    console.log(
      `✅ CREATED - Invoice: ${invoiceData.invoiceNumber} created | Total: ${totalAmount} | Paid: ${paidAmount}`
    );
    
    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
      paidAmount: paidAmount,
      action: "created",
      bypassStockCheck: bypassStockCheck,
    };
  } catch (error) {
    console.error(
      `❌ ERROR - Invoice ${invoiceData.invoiceNumber}:`,
      error.message
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
        bypassStockCheck: bypassStockCheck,
      },
    };
  }
};

const processSingleInvoiceWithMRDistribution = async (invoiceData, index, skipDuplicates = true, bypassStockCheck = false) => {
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
        console.log(`🔄 Merging products into existing invoice: ${invoiceData.invoiceNumber}`);
        
        const mergeResult = await mergeInvoiceProducts(existingInvoice, invoiceData, session);
        
        if (mergeResult.success) {
          await session.commitTransaction();
          await session.endSession();
          
          return {
            success: true,
            invoiceNumber: invoiceData.invoiceNumber,
            action: "merged",
            addedProducts: mergeResult.addedProducts,
            paidAmount: mergeResult.addedPaidAmount,
            mrCashUpdates: { [existingInvoice.mrName]: mergeResult.addedPaidAmount },
          };
        } else {
          throw new Error(`Failed to merge invoice: ${mergeResult.error}`);
        }
      } else {
        throw new Error(
          `Invoice number ${invoiceData.invoiceNumber} already exists but cannot be merged: ${mergeCheck.reason || "Incompatible data"}`
        );
      }
    }
    
    let customerName = invoiceData.customerName || "";
    let customerId = invoiceData.customerId || null;
    
    if (invoiceData.customerCode && invoiceData.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(invoiceData.customerCode, session);
      if (!customerResult.success) {
        throw new Error(customerResult.message);
      }
      customerName = customerResult.customer.customerName;
      customerId = customerResult.customer.customerId;
    } else if (!customerName) {
      throw new Error("Customer code or customer name is required");
    }
    
    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];
    const mrCashDistribution = new Map();
    
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      
      if (totalQty <= 0) continue;
      
      // Stock check with flexible search
      const stockItem = await findStockItemFlexible(productName, session);
      
      if (!stockItem) {
        if (bypassStockCheck) {
          console.log(`⚠️ Product "${productName}" not found but proceeding due to bypassStockCheck`);
        } else {
          throw new Error(`Product "${productName}" not found in inventory`);
        }
      } else {
        const currentAvailableStock = fixPrecision(Number(stockItem.totalBoxes || 0));
        
        if (currentAvailableStock < totalQty) {
          if (bypassStockCheck) {
            console.log(`⚠️ Insufficient stock for "${productName}" but proceeding due to bypassStockCheck`);
          } else {
            const shortage = fixPrecision(totalQty - currentAvailableStock);
            throw new Error(
              `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${currentAvailableStock}, Short by: ${shortage}`
            );
          }
        }
      }
      
      const productRecord = await findProductRecordFlexible(productName, session);
      
      const lc = productRecord?.lc || 0;
      const sellingPrice = fixPrecision(parseFloat(product.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(product.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      
      processedProducts.push({
        productName: productName,
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty ? fixPrecision(netSellingAmount / totalQty) : 0,
        lc,
        profitLoss: fixPrecision((sellingPrice - lc) * salesQty),
        isProductAccept: true,
      });
      
      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      
      let productMR = invoiceData.mrName?.trim() || "No MR Name Provided";
      
      if (invoiceData._mrDistribution) {
        for (const [mrName, mrData] of invoiceData._mrDistribution) {
          const hasProduct = mrData.products.some(p => 
            p.productName?.trim() === productName &&
            fixPrecision(parseFloat(p.salesQty) || 0) === salesQty
          );
          if (hasProduct) {
            productMR = mrName;
            break;
          }
        }
      }
      
      if (!mrCashDistribution.has(productMR)) {
        mrCashDistribution.set(productMR, 0);
      }
      mrCashDistribution.set(
        productMR, 
        fixPrecision(mrCashDistribution.get(productMR) + netSellingAmount)
      );
      
      // Deduct stock only if stock exists and not bypassing
      if (stockItem && !bypassStockCheck) {
        const deductionResult = await deductStockFromReportInHand(
          productName, salesQty, bonusQty, invoiceData.invoiceNumber, session
        );
        
        stockDeductionResults.push({ product: productName, ...deductionResult });
        
        if (!deductionResult.success) {
          throw new Error(`Stock deduction failed for ${productName}: ${deductionResult.message}`);
        }
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
    
    const primaryMR = invoiceData.mrName?.trim() || 
                      (invoiceData._mrDistribution ? Array.from(invoiceData._mrDistribution.keys())[0] : "No MR Name Provided");
    
    const saleRecord = new SaleSummary({
      recordingDate: invoiceData.recordingDate ? new Date(invoiceData.recordingDate) : new Date(),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      mrName: primaryMR,
      mrId: invoiceData.mrId || null,
      customerName: customerName,
      customerCode: invoiceData.customerCode || "",
      customerId: customerId,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate ? new Date(invoiceData.deliveryDate) : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: fixPrecision(processedProducts.reduce((sum, p) => sum + (p.profitLoss || 0), 0)),
      paymentStatus: paymentStatus,
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
      bypassStockCheck: bypassStockCheck,
    });
    
    await saleRecord.save({ session });
    
    const mrCashUpdates = {};
    
    if (paidAmount > 0 && paymentStatus === "Cash") {
      for (const [mrName, mrAmount] of mrCashDistribution) {
        if (mrName && mrName.trim() && mrAmount > 0) {
          console.log(`💵 Updating MR Cash for ${mrName}: ${mrAmount} (Invoice: ${invoiceData.invoiceNumber})`);
          
          const mrCashUpdate = await updateMRCashes(
            mrName.trim(),
            mrAmount,
            invoiceData.invoiceNumber,
            invoiceData.invoiceDate || new Date(),
            session,
            false
          );
          
          if (mrCashUpdate.success) {
            mrCashUpdates[mrName] = mrAmount;
            console.log(`✅ MR Cash updated for ${mrName}: +${mrAmount}`);
          } else if (!mrCashUpdate.skipped) {
            console.error(`⚠️ Failed to update MR Cash for ${mrName}: ${mrCashUpdate.error}`);
          }
        }
      }
    }
    
    await session.commitTransaction();
    await session.endSession();
    
    console.log(`✅ CREATED - Invoice: ${invoiceData.invoiceNumber} | Total: ${totalAmount} | Paid: ${paidAmount}`);
    if (Object.keys(mrCashUpdates).length > 1) {
      console.log(`  📊 MR Cash distributed to ${Object.keys(mrCashUpdates).length} MRs`);
    }
    
    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
      paidAmount: paidAmount,
      action: "created",
      mrCashUpdates: mrCashUpdates,
      bypassStockCheck: bypassStockCheck,
    };
  } catch (error) {
    console.error(`❌ ERROR - Invoice ${invoiceData.invoiceNumber}:`, error.message);
    
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
        bypassStockCheck: bypassStockCheck,
      },
    };
  }
};

const processImportWithStockDeduction = async (
  sessionId,
  invoices,
  skipDuplicates = true,
  bypassStockCheck = false
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    return;
  }
  
  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;
  let mergedInvoices = 0;
  let totalMRCashAdded = 0;
  
  progress.status = "processing";
  progress.startTime = Date.now();
  progress.lastUpdated = Date.now();
  
  console.log(`🚀 Starting import process - Total Invoices: ${invoices.length}`);
  console.log(`🔧 Duplicate handling: ${skipDuplicates ? 'Skip exact duplicates, merge same invoice' : 'Allow all'}`);
  console.log(`🔧 Bypass stock check: ${bypassStockCheck ? 'YES - Missing/insufficient stock will be ignored' : 'NO - Strict stock validation'}`);
  
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
      
      // Validate MR BEFORE grouping
      if (invoice.mrName && invoice.mrName.trim()) {
        const mrValidation = await validateMR(invoice.mrName.trim());
        if (!mrValidation.success) {
          errors.push({
            row: i + 2,
            invoiceNumber: invoiceNumber,
            mrName: invoice.mrName,
            customerName: invoice.customerName || "N/A",
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
            mrName: mrName,
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
            const sellingPrice = fixPrecision(parseFloat(newProduct.sellingPrice) || 0);
            const discount = fixPrecision(parseFloat(newProduct.discount) || 0);
            
            const isDuplicate = existing.products.some(existingProduct => {
              const existingProductName = existingProduct.productName?.trim();
              const existingSalesQty = fixPrecision(parseFloat(existingProduct.salesQty) || 0);
              const existingBonusQty = fixPrecision(parseFloat(existingProduct.bonusQty) || 0);
              const existingSellingPrice = fixPrecision(parseFloat(existingProduct.sellingPrice) || 0);
              const existingDiscount = fixPrecision(parseFloat(existingProduct.discount) || 0);
              
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
              console.warn(
                `⚠️ Row ${i + 2}: Skipping duplicate product in invoice ${invoiceNumber}: ` +
                `${productName} (Qty: ${salesQty}, Price: ${sellingPrice})`
              );
              
              if (!progress.duplicateProductsSkipped) {
                progress.duplicateProductsSkipped = 0;
              }
              progress.duplicateProductsSkipped++;
            }
          }
        }
      }
    }
    
    console.log(`📦 Grouped ${invoices.length} rows into ${groupedInvoices.size} unique invoices`);
    if (progress.duplicateProductsSkipped > 0) {
      console.log(`🗑️ Skipped ${progress.duplicateProductsSkipped} duplicate product entries`);
    }
    
    progress.totalInvoices = groupedInvoices.size;
    
    let processedCount = 0;
    
    for (const [invoiceNumber, groupedInvoice] of groupedInvoices) {
      try {
        const mrCount = groupedInvoice._mrDistribution.size;
        
        if (mrCount > 1) {
          console.warn(
            `⚠️ Invoice ${invoiceNumber} has ${mrCount} different MRs! ` +
            `MRs: ${Array.from(groupedInvoice._mrDistribution.keys()).join(', ')}`
          );
        }
        
        const result = await processSingleInvoiceWithMRDistribution(
          groupedInvoice, 
          groupedInvoice._rowIndex, 
          skipDuplicates,
          bypassStockCheck
        );
        
        if (result.skipped) {
          skippedDuplicates++;
          console.log(`⏭️ Skipped duplicate: ${invoiceNumber}`);
        } else if (result.success) {
          if (result.action === "merged") {
            mergedInvoices++;
            console.log(`🔄 Merged: ${invoiceNumber}`);
            
            if (result.mrCashUpdates) {
              for (const [mrName, amount] of Object.entries(result.mrCashUpdates)) {
                totalMRCashAdded = fixPrecision(totalMRCashAdded + amount);
              }
            }
          } else {
            successful++;
            console.log(`✅ Created: ${invoiceNumber}`);
            
            if (result.mrCashUpdates) {
              for (const [mrName, amount] of Object.entries(result.mrCashUpdates)) {
                totalMRCashAdded = fixPrecision(totalMRCashAdded + amount);
              }
            }
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
      progress.progressPercentage = Math.round(
        (processedCount / groupedInvoices.size) * 100
      );
      progress.lastUpdated = Date.now();
    }
    
    progress.completed = true;
    progress.endTime = Date.now();
    progress.totalTime = progress.endTime - progress.startTime;
    progress.errors = errors;
    progress.status = "completed";
    progress.totalMRCashAdded = totalMRCashAdded;
    
    console.log(`🎉 Import completed - Created: ${successful}, Merged: ${mergedInvoices}, Failed: ${failed}, Skipped: ${skippedDuplicates}`);
    console.log(`💰 Total MR Cash Added: ${totalMRCashAdded}`);
    if (progress.duplicateProductsSkipped > 0) {
      console.log(`🗑️ Duplicate products skipped: ${progress.duplicateProductsSkipped}`);
    }
    
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
  isRefund = false
) => {
  try {
    const cleanAmount = fixPrecision(Number(amount) || 0);
    
    console.log(`🔄 MR Cash Update - MR: ${mrName}, Amount: ${cleanAmount}, Invoice: ${invoiceNumber}, IsRefund: ${isRefund}`);
    
    if (cleanAmount === 0) {
      console.log(`⏭️ Skipping MR Cash Update - Amount is 0 for invoice: ${invoiceNumber}`);
      return { success: true, skipped: true, reason: "Amount is zero" };
    }
    
    if (!mrName || mrName.trim() === "") {
      throw new Error("medicalRepName is required to update MR Cash");
    }
    
    const escapeForRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    const mr = await Staff.findOne({
      medicalRepName: { 
        $regex: `^${escapeForRegex(mrName.trim())}$`, 
        $options: "i" 
      },
    }).session(session);
    
    if (!mr) {
      throw new Error(`MR not found with name "${mrName}"`);
    }
    
    console.log(`✅ MR Found: ${mr.medicalRepName} (ID: ${mr._id})`);
    
    let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);
    
    if (!mrCash) {
      console.log(`📝 Creating NEW MRCash record for MR: ${mr.medicalRepName}`);
      
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
        notes: `Initial creation with invoice: ${invoiceNumber} (${isRefund ? 'Refund' : 'Sale'}: ${cleanAmount})`,
        isActive: true,
      });
      
      await mrCash.save({ session });
      
      console.log(`✅ Created NEW MRCash | Initial Cash: ${initialCash}`);
      
      return { 
        success: true, 
        mrCash, 
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash
      };
    }
    
    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    let newCashAmount = previousAmount;
    
    if (isRefund) {
      newCashAmount = fixPrecision(previousAmount - cleanAmount);
      console.log(`💰 REFUND: ${previousAmount} - ${cleanAmount} = ${newCashAmount}`);
    } else {
      newCashAmount = fixPrecision(previousAmount + cleanAmount);
      console.log(`💰 ADDING: ${previousAmount} + ${cleanAmount} = ${newCashAmount}`);
    }
    
    mrCash.currentCash = newCashAmount;
    
    if (mrCash.currentCash < 0) {
      console.warn(
        `⚠️ Warning: MR ${mr.medicalRepName} cash balance went negative: ${mrCash.currentCash}`
      );
    }
    
    const transactionNote = isRefund
      ? `Refund for invoice ${invoiceNumber}: -${cleanAmount}`
      : `Sale invoice ${invoiceNumber}: +${cleanAmount}`;
      
    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n${transactionNote}`
      : transactionNote;
      
    mrCash.updatedAt = new Date();
    
    await mrCash.save({ session });
    
    console.log(
      `✅ MR Cash UPDATED | ${mr.medicalRepName} | Previous: ${previousAmount} | New: ${newCashAmount} | Change: ${isRefund ? '-' : '+'}${cleanAmount}`
    );
    
    return {
      success: true,
      mrCash,
      action: "updated_existing",
      previousAmount: previousAmount,
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
    console.log("🔧 Starting one-time MR Cash duplicate fix...");
    
    const duplicateAdjustments = [
      { invoice: '995120', excess: 160.00 },
      { invoice: '995279', excess: 95.00 },
      { invoice: '995692', excess: 20.00 },
      { invoice: '995898', excess: 105.00 },
      { invoice: '996102', excess: 59.00 },
      { invoice: '996104', excess: 60.00 },
      { invoice: '996127', excess: 118.80 },
      { invoice: '996659', excess: 50.00 },
    ];
    
    const totalExcess = duplicateAdjustments.reduce((sum, item) => sum + item.excess, 0);
    
    console.log(`Total excess to be removed: ₹${totalExcess.toFixed(2)}`);
    
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
    
    console.log(`✅ Fixed MR Cash for Yav Phanda: ${oldCash} → ${newCash}`);
    
    res.json({
      success: true,
      message: "MR Cash duplicates fixed successfully",
      details: {
        mrName: mrCash.mrName,
        oldCash: oldCash,
        newCash: newCash,
        excessRemoved: totalExcess,
        affectedInvoices: duplicateAdjustments,
      },
    });
  } catch (error) {
    console.error("❌ Error fixing MR Cash duplicates:", error);
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
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch failed invoices",
    });
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

    // Use flexible search
    let product = await findProductRecordFlexible(cleanProductName);

    if (!product) {
      product = await findStockItemFlexible(cleanProductName);
    }

    const exists = !!product;

    res.json({
      success: true,
      exists: exists,
      product: product
        ? {
            name: product.productName,
            id: product._id,
          }
        : null,
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
      matchConditions.paymentStatus = new RegExp(`^${escapeRegexForSearch(tab)}$`, "i");
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
      matchConditions.paymentStatus = new RegExp(`^${escapeRegexForSearch(tab)}$`, "i");
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
        products: 1,
        createdAt: 1,
        updatedAt: 1,
      });

    res.status(200).json({
      summaries,
      count: summaries.length,
    });
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

router.delete("/:id", async (req, res) => {
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
        await restoreStockToReportInHand(product.productName, totalQty);
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

router.put("/:id", async (req, res) => {
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

    if (saleData.customerCode && saleData.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(
        saleData.customerCode,
        session,
      );
      if (customerResult.success) {
        customerName = customerResult.customer.customerName;
        customerId = customerResult.customer.customerId;
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
        customerName: customerName,
        customerCode: saleData.customerCode || originalSale.customerCode,
        customerId: customerId,
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

    res.status(200).json({
      message: "Sale updated successfully",
      sale: updatedSale,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      error: "Failed to update sales record",
      details: err.message,
    });
  }
});

router.post("/create", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;

    if (!data.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    if (!data.mrName?.trim()) {
      throw new Error("MR Name is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: data.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      throw new Error("Invoice number already exists");
    }

    let customerName = "";
    let customerId = null;

    if (data.customerCode && data.customerCode.trim() !== "") {
      const customerResult = await getCustomerByCode(
        data.customerCode,
        session,
      );
      if (!customerResult.success) {
        throw new Error(customerResult.message);
      }
      customerName = customerResult.customer.customerName;
      customerId = customerResult.customer.customerId;
    } else if (data.customerName) {
      customerName = data.customerName;
    } else {
      throw new Error("Customer code or customer name is required");
    }

    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];

    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty > 0) {
        const stockItem = await findStockItemFlexible(p.productName, session);

        if (!stockItem) {
          throw new Error(`Product "${p.productName}" not found in inventory`);
        }

        const availableStock = fixPrecision(Number(stockItem.totalBoxes || 0));

        if (availableStock < totalQty) {
          const shortage = fixPrecision(totalQty - availableStock);
          throw new Error(
            `Insufficient stock for ${p.productName}. Required: ${totalQty}, Available: ${availableStock}, Short by: ${shortage}`,
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

      const productRecord = await findProductRecordFlexible(p.productName, session);

      const lc = productRecord?.lc || Number(p.lc) || 0;
      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);

      processedProducts.push({
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
      });

      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);

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

      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${p.productName}: ${deductionResult.message}`,
        );
      }
    }

    if (!processedProducts.length) {
      throw new Error("At least one valid product is required");
    }

    const paidAmount = fixPrecision(Number(data.paidAmount) || 0);
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));
    const paymentStatus = mapPaymentStatus(data.paymentStatus);

    const saleData = {
      recordingDate: data.recordingDate || new Date(),
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate || new Date(),
      mrName: data.mrName.trim(),
      mrId: data.mrId || null,
      customerName: customerName,
      customerCode: data.customerCode || "",
      customerId: customerId,
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
    };

    const sale = await SaleSummary.create([saleData], { session });

    if (paidAmount > 0 && data.mrName) {
      const mrCashUpdate = await updateMRCashes(
        data.mrName,
        paidAmount,
        data.invoiceNumber,
        data.invoiceDate || new Date(),
        session,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.warn(`Failed to update MR Cash: ${mrCashUpdate.error}`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Sale created successfully with stock deduction",
      sale: sale[0],
      stockDeductionResults,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      success: false,
      error: err.message || "Failed to create sale",
    });
  }
});

router.delete("/delete-batch", async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No sale IDs provided for deletion",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const salesToDelete = await SaleSummary.find({ _id: { $in: ids } }).session(
      session,
    );

    const mrPayments = {};
    for (const sale of salesToDelete) {
      if (sale.paidAmount > 0 && sale.mrName) {
        const mrKey = sale.mrName;
        if (!mrPayments[mrKey]) {
          mrPayments[mrKey] = {
            mrName: sale.mrName,
            totalAmount: 0,
            invoiceNumbers: [],
          };
        }
        mrPayments[mrKey].totalAmount = fixPrecision(
          mrPayments[mrKey].totalAmount + sale.paidAmount,
        );
        mrPayments[mrKey].invoiceNumbers.push(sale.invoiceNumber);
      }
    }

    for (const mrKey in mrPayments) {
      const mrPayment = mrPayments[mrKey];
      const mrCashUpdate = await updateMRCashes(
        mrPayment.mrName,
        mrPayment.totalAmount,
        mrPayment.invoiceNumbers.join(", "),
        new Date(),
        session,
        true,
      );
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.warn(
          `Failed to update MR Cash for MR ${mrPayment.mrName}: ${mrCashUpdate.error}`,
        );
      }
    }

    for (const sale of salesToDelete) {
      for (const product of sale.products || []) {
        const salesQty = Number(product.salesQty) || 0;
        const bonusQty = Number(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        if (totalQty > 0) {
          await restoreStockToReportInHand(product.productName, totalQty);
        }
      }
    }

    await SaleSummary.deleteMany({ _id: { $in: ids } }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `${salesToDelete.length} sales deleted successfully and stock restored.`,
      deletedCount: salesToDelete.length,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      success: false,
      error: err.message || "Failed to delete sales",
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
          };

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("Profit/Loss summary error:", error);
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
      {
        $match: {
          invoiceDate: {
            $gte: start,
            $lte: end,
          },
        },
      },
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
    console.error("Error fetching credit sales not received:", error);
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

      dateFilter = {
        invoiceDate: {
          $gte: start,
          $lte: end,
        },
      };
    } else {
      const dateRange = getTableDateRanges(period);
      if (dateRange) {
        dateFilter = {
          invoiceDate: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        };
      }
    }

    const salesData = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $project: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" },
          },
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
      {
        $sort: { date: -1 },
      },
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
    }));

    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      period: period,
    });
  } catch (error) {
    console.error("❌ Error fetching sales table data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
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

router.get("/check-stock/health", async (req, res) => {
  res.json({
    success: true,
    message: "Stock check endpoint is working",
    endpoints: {
      individualCheck: "POST /api/sales/check-stock",
      batchCheck: "POST /api/sales/check-stock-batch",
      currentStock: "GET /api/sales/current-stock/:productName",
      verifyIntegrity: "POST /api/sales/verify-stock-integrity",
      syncStock: "POST /api/sales/sync-stock",
      getSales: "GET /api/sales",
      getAllSales: "GET /api/sales/all",
      paymentStatus: "GET /api/sales/payment-status",
      mrCashSync: "POST /api/sales/mrcash/sync-from-sales",
      mrCashSummary: "GET /api/sales/mrcash/summary",
      validateImportStock: "POST /api/sales/validate-import-stock",
      validateImportMRs: "POST /api/sales/validate-import-mrs",
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;