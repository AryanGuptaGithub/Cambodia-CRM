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


// Helper function to check if an invoice should be merged or is a duplicate
const shouldMergeInvoices = (existingInvoice, newInvoiceData) => {
  // First check: Are these exactly the same invoice?
  if (existingInvoice.invoiceNumber !== newInvoiceData.invoiceNumber) {
    return { shouldMerge: false, isExactDuplicate: false };
  }
  
  // Check if customer matches
  if (existingInvoice.customerCode !== newInvoiceData.customerCode) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "Customer mismatch" };
  }
  
  // Check if payment status matches
  const existingStatus = mapPaymentStatus(existingInvoice.paymentStatus);
  const newStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
  if (existingStatus !== newStatus) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "Payment status mismatch" };
  }
  
  // Check if MR matches
  if (existingInvoice.mrName !== newInvoiceData.mrName) {
    return { shouldMerge: false, isExactDuplicate: false, reason: "MR mismatch" };
  }
  
  // Now check for exact duplicate products
  const existingProductNames = existingInvoice.products.map(p => p.productName).sort();
  const newProductNames = (newInvoiceData.products || []).map(p => p.productName?.trim()).sort();
  
  // If product names are exactly the same, check quantities and prices
  if (JSON.stringify(existingProductNames) === JSON.stringify(newProductNames)) {
    // This is an exact duplicate invoice (same products)
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
  
  // If we get here, it's the same invoice number but with different products - we should merge
  return { shouldMerge: true, isExactDuplicate: false };
};

// Helper function to merge products from new invoice into existing invoice
const mergeInvoiceProducts = async (existingInvoice, newInvoiceData, session) => {
  try {
    const mergedProducts = [...existingInvoice.products];
    let totalAmount = fixPrecision(existingInvoice.totalAmount || 0);
    let totalProfitLoss = fixPrecision(existingInvoice.totalProfitLoss || 0);
    let paidAmount = fixPrecision(existingInvoice.paidAmount || 0);
    
    // Calculate paid amount for new products if invoice is paid
    const paymentStatus = mapPaymentStatus(newInvoiceData.paymentStatus);
    let newPaidAmount = 0;
    
    // Process each new product
    for (const newProduct of newInvoiceData.products || []) {
      const productName = newProduct.productName?.trim();
      const salesQty = fixPrecision(parseFloat(newProduct.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(newProduct.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      
      if (totalQty <= 0) continue;
      
      // Check if product already exists in invoice
      const existingProductIndex = mergedProducts.findIndex(
        p => p.productName === productName
      );
      
      // Check stock before merging
      const stockItem = await ReportInHand.findOne({
        productName: buildProductNameRegex(productName),
      }).session(session);
      
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
      
      // Deduct stock
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
      
      // Get product details
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(productName),
      }).session(session);
      
      const lc = productRecord?.lc || 0;
      const sellingPrice = fixPrecision(parseFloat(newProduct.sellingPrice) || 0);
      const amount = fixPrecision(sellingPrice * salesQty);
      const discount = fixPrecision(parseFloat(newProduct.discount) || 0);
      const netSellingAmount = fixPrecision(amount - discount);
      const profitLoss = fixPrecision((sellingPrice - lc) * salesQty);
      
      if (existingProductIndex >= 0) {
        // Update existing product
        const existingProduct = mergedProducts[existingProductIndex];
        existingProduct.salesQty = fixPrecision(existingProduct.salesQty + salesQty);
        existingProduct.bonusQty = fixPrecision(existingProduct.bonusQty + bonusQty);
        existingProduct.totalQty = fixPrecision(existingProduct.totalQty + totalQty);
        existingProduct.netSellingAmount = fixPrecision(existingProduct.netSellingAmount + netSellingAmount);
        existingProduct.profitLoss = fixPrecision(existingProduct.profitLoss + profitLoss);
        existingProduct.amount = fixPrecision(existingProduct.amount + amount);
        existingProduct.discount = fixPrecision(existingProduct.discount + discount);
        // Recalculate average unit price
        existingProduct.averageUnitPrice = existingProduct.totalQty > 0 ? 
          fixPrecision(existingProduct.netSellingAmount / existingProduct.totalQty) : 0;
      } else {
        // Add new product
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
      
      // Update totals
      totalAmount = fixPrecision(totalAmount + netSellingAmount);
      totalProfitLoss = fixPrecision(totalProfitLoss + profitLoss);
      
      // Calculate paid amount for this product if invoice is paid
      if (paymentStatus === "Cash") {
        newPaidAmount = fixPrecision(newPaidAmount + netSellingAmount);
      }
    }
    
    // Update paid amount
    if (paymentStatus === "Cash") {
      paidAmount = fixPrecision(paidAmount + newPaidAmount);
    }
    
    const dueAmount = fixPrecision(Math.max(0, totalAmount - paidAmount));
    
    // Update the existing invoice
    existingInvoice.products = mergedProducts;
    existingInvoice.totalAmount = totalAmount;
    existingInvoice.totalProfitLoss = totalProfitLoss;
    existingInvoice.paidAmount = paidAmount;
    existingInvoice.dueAmount = dueAmount;
    existingInvoice.updatedAt = new Date();
    
    await existingInvoice.save({ session });
    
    // Update MR Cash if paid amount increased
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

const buildProductNameRegex = (productName) => {
  if (!productName) return /^$/;
  const trimmed = productName.trim();
  const escaped = escapeRegex(trimmed);
  const flexibleSpaces = escaped.replace(/\s+/g, "\\s*");
  return new RegExp(`^${flexibleSpaces}$`, "i");
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

    const query = Customer.findOne({
      customerCode: customerCode.trim(),
      enabled: true,
    });

    if (session) {
      query.session(session);
    }

    const customer = await query;

    if (!customer) {
      return {
        success: false,
        message: `Customer with code "${customerCode}" not found`,
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
    };
  }
};

const calculateProductStock = async (productName, requiredQty = 0) => {
  try {
    const variations = generateProductNameVariations(productName);

    let stockItem = null;
    let foundVariation = "";

    for (const variation of variations) {
      stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${escapeRegex(variation)}$`, "i") },
      }).lean();

      if (stockItem) {
        foundVariation = variation;
        break;
      }
    }

    if (!stockItem) {
      for (const variation of variations) {
        stockItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(escapeRegex(variation), "i") },
        }).lean();

        if (stockItem) {
          foundVariation = variation;
          break;
        }
      }
    }

    if (!stockItem) {
      const cleanedName = productName.toLowerCase().replace(/\s+/g, " ").trim();
      stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(escapeRegex(cleanedName), "i") },
      }).lean();
    }

    if (!stockItem) {
      const productInCatalog = await Product.findOne({
        productName: buildProductNameRegex(normalizeProductName(productName)),
      }).lean();

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
    if (totalQty <= 0) {
      return { success: true, deductedQty: 0 };
    }

    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(productName),
    }).session(session);

    if (!stockItem) {
      return {
        success: false,
        message: `Product "${productName}" not found in inventory`,
      };
    }

    const currentStock = fixPrecision(Number(stockItem.totalBoxes || 0));

    if (currentStock < totalQty) {
      return {
        success: false,
        message: `Insufficient stock. Available: ${currentStock}, Required: ${totalQty}`,
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
      productName,
      deductedQty: totalQty,
      previousStock: currentStock,
      newStock: remainingStock,
    };
  } catch (error) {
    console.error(`❌ Stock deduction error for ${productName}:`, error);
    return {
      success: false,
      message: error.message,
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

    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(productName),
    }).session(session);

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
// ROUTES
// ==========================================

// ✅ MR CASH SYNC ENDPOINT - Recalculate from ALL sales
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

        const mr = await Staff.findOne({
          medicalRepName: { $regex: `^${mrName.trim()}$`, $options: "i" },
        }).session(session);

        if (!mr) {
          console.warn(`⚠️ MR not found: ${mrName}`);
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
          action: mrCash.isNew ? "created" : "updated",
        });

        console.log(
          `✅ Synced: ${mr.medicalRepName} = $${totalCash} (${mrData.invoiceCount} invoices)`,
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
      `✅ Sync complete: ${successCount} succeeded, ${failCount} failed`,
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

// ✅ MR CASH SUMMARY ENDPOINT
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

// Stock check endpoint
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

// Debug endpoint
router.get("/debug/stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(productName),
    });

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
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.json({
      success: true,
      progress: {
        percentage: progress.progressPercentage || 0,
        processed: progress.processedInvoices || 0,
        total: progress.totalInvoices || 0,
        successful: progress.successful || 0,
        failed: progress.failed || 0,
        merged: progress.mergedInvoices || 0,  // Add this
        skipped: progress.skippedDuplicates || 0,
        completed: progress.completed || false,
        startTime: progress.startTime,
        lastUpdated: progress.lastUpdated,
        errors: progress.errors || [],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch progress",
    });
  }
});

router.post("/import-with-stock-deduction", async (req, res) => {
  let sessionId = null;
  try {
    const { invoices, skipDuplicates = true } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];
    
    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }
    
    if (isImportInProgress) {
      return res.status(429).json({
        success: false,
        message: "Another import is already in progress. Please wait.",
        retryAfter: 30,
      });
    }
    
    isImportInProgress = true;
    
    sessionId = `import_stock_deduction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
   // In the router.post("/import-with-stock-deduction") route, update the progress object:
importProgressMap.set(sessionId, {
  sessionId,
  totalInvoices: invoiceData.length,
  processedInvoices: 0,
  successful: 0,
  failed: 0,
  skippedDuplicates: 0,
  mergedInvoices: 0,  // Add this
  progressPercentage: 0,
  startTime: Date.now(),
  lastUpdated: Date.now(),
  completed: false,
  errors: [],
  status: "initializing",
  importType: "stock_deduction",
  totalMRCashAdded: 0,
});
    
    console.log(`🚀 Starting import session: ${sessionId} with ${invoiceData.length} invoices`);
    
    processImportWithStockDeduction(sessionId, invoiceData, skipDuplicates)
      .catch((error) => {
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          progress.status = "failed";
          progress.errors.push({
            message: "Import process failed unexpectedly",
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          progress.lastUpdated = Date.now();
        }
        console.error(`💥 Import process failed unexpectedly: ${error.message}`);
      })
      .finally(() => {
        isImportInProgress = false;
        console.log(`🏁 Import session ${sessionId} finalized`);
      });
    
    res.json({
      success: true,
      message: "Import with stock deduction started",
      sessionId,
      totalInvoices: invoiceData.length,
      note: "Stock will be deducted from ReportInHand and MR Cash will be updated for each paid sale",
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      startTime: new Date().toISOString(),
    });
  } catch (error) {
    if (sessionId) importProgressMap.delete(sessionId);
    isImportInProgress = false;
    console.error(`❌ Failed to start import: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Import failed to start",
      error: error.message,
    });
  }
});

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
    
    // ✅ CORRECTED: Escape regex properly
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
    
    // ✅ CRITICAL FIX: For new records, start with the appropriate amount
    if (!mrCash) {
      console.log(`📝 Creating NEW MRCash record for MR: ${mr.medicalRepName}`);
      
      // CORRECTED LOGIC: Start with amount if sale, or 0 if refund (but we should track refunds separately)
      const initialCash = isRefund ? 0 : cleanAmount;
      // Note: If it's a refund and no record exists, it means MR hasn't collected any cash yet,
      // so we shouldn't create a negative balance. Instead, we should create with 0.
      
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
      
      console.log(`✅ Created NEW MRCash | Initial Cash: ${initialCash} (${isRefund ? 'Refund' : 'Sale'})`);
      
      return { 
        success: true, 
        mrCash, 
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash
      };
    }
    
    // ✅ CORRECTED: Update existing MR Cash properly
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
    
    // Update notes
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

// Helper function to check if two invoices are exact duplicates
const areInvoicesExactlySame = (invoice1, invoice2) => {
  // Check basic fields
  if (invoice1.invoiceNumber !== invoice2.invoiceNumber) return false;
  
  // Check if both have products arrays
  if (!invoice1.products || !invoice2.products) return false;
  if (invoice1.products.length !== invoice2.products.length) return false;
  
  // Sort products by name for comparison
  const sortProducts = (products) => 
    products.slice().sort((a, b) => a.productName.localeCompare(b.productName));
  
  const products1 = sortProducts(invoice1.products);
  const products2 = sortProducts(invoice2.products);
  
  // Compare each product
  for (let i = 0; i < products1.length; i++) {
    const p1 = products1[i];
    const p2 = products2[i];
    
    // Check all product fields
    if (p1.productName !== p2.productName) return false;
    if (fixPrecision(p1.salesQty) !== fixPrecision(p2.salesQty)) return false;
    if (fixPrecision(p1.bonusQty) !== fixPrecision(p2.bonusQty)) return false;
    if (fixPrecision(p1.sellingPrice) !== fixPrecision(p2.sellingPrice)) return false;
    if (fixPrecision(p1.discount) !== fixPrecision(p2.discount)) return false;
  }
  
  // Check other important fields
  if (invoice1.customerCode !== invoice2.customerCode) return false;
  if (fixPrecision(invoice1.paidAmount) !== fixPrecision(invoice2.paidAmount)) return false;
  
  return true;
};

const processSingleInvoiceWithStockDeduction = async (invoiceData, index, skipDuplicates = true) => {
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
      // Check if we should merge or skip
      const mergeCheck = shouldMergeInvoices(existingInvoice, invoiceData);
      
      if (mergeCheck.isExactDuplicate && skipDuplicates) {
        // Exact duplicate - skip it
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
        // Same invoice number, different products - merge them
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
        // Invoice exists but cannot be merged due to mismatch
        throw new Error(
          `Invoice number ${invoiceData.invoiceNumber} already exists but cannot be merged: ${mergeCheck.reason || "Incompatible data"}. ` +
          `If you want to update, use the edit function instead of import.`
        );
      }
    }
    
    // If no existing invoice, proceed with creating new one
    // ... (KEEP THE ORIGINAL CODE FOR CREATING NEW INVOICE HERE)
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
      
      // Find and lock stock item
      const stockItem = await ReportInHand.findOne({
        productName: buildProductNameRegex(productName),
      }).session(session);
      
      if (!stockItem) {
        throw new Error(`Product "${productName}" not found in inventory`);
      }
      
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
        const shortage = fixPrecision(totalQty - currentAvailableStock);
        throw new Error(
          `Insufficient stock for ${productName}. ` +
            `Required: ${totalQty}, Available: ${currentAvailableStock}, ` +
            `Short by: ${shortage}`
        );
      }
      
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(productName),
      }).session(session);
      
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
      
      // Deduct stock
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
    
    if (processedProducts.length === 0) {
      throw new Error("No valid products found in invoice");
    }
    
    const paymentStatus = mapPaymentStatus(invoiceData.paymentStatus);
    let paidAmount = 0;
    
    // Calculate paid amount based on payment status
    if (paymentStatus === "Cash") {
      // For cash payments, paid amount equals total amount
      paidAmount = totalAmount;
    } else if (paymentStatus === "Partial Paid") {
      // For partial payments, use the provided paid amount
      paidAmount = fixPrecision(parseFloat(invoiceData.paidAmount) || 0);
    } else {
      // For credit, paid amount is 0
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
    });
    
    await saleRecord.save({ session });
    
    // ✅ Update MR Cash ONLY if paidAmount > 0 AND mrName exists
    if (paidAmount > 0 && invoiceData.mrName && invoiceData.mrName.trim()) {
      console.log(`💵 Updating MR Cash for invoice ${invoiceData.invoiceNumber}: Amount = ${paidAmount}`);
      
      const mrCashUpdate = await updateMRCashes(
        invoiceData.mrName.trim(),
        paidAmount,
        invoiceData.invoiceNumber,
        invoiceData.invoiceDate || new Date(),
        session,
        false // not a refund
      );
      
      if (!mrCashUpdate.success && !mrCashUpdate.skipped) {
        console.error(`⚠️ Failed to update MR Cash: ${mrCashUpdate.error}`);
        // Don't throw error, just log warning
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
      },
    };
  }
};

// ✅ CORRECTED FUNCTION - Replace your existing processImportWithStockDeduction with this:

const processImportWithStockDeduction = async (
  sessionId,
  invoices,
  skipDuplicates = true
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
  
  try {
    // ✅ STEP 1: Group invoices by invoice number to combine products from multiple rows
    // This is the KEY FIX - prevents duplicate MR Cash updates
    const groupedInvoices = new Map();
    
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      const invoiceNumber = invoice.invoiceNumber?.trim();
      
      if (!invoiceNumber) {
        errors.push({
          row: i + 2,
          invoiceNumber: "Unknown",
          message: "Invoice number is required",
          type: "validation_error",
        });
        failed++;
        continue;
      }
      
      if (!groupedInvoices.has(invoiceNumber)) {
        // First occurrence of this invoice number - create new entry
        groupedInvoices.set(invoiceNumber, {
          ...invoice,
          products: invoice.products || [],
          _rowIndex: i, // Track original row for error reporting
        });
      } else {
        // Invoice number already exists - merge products into it
        const existing = groupedInvoices.get(invoiceNumber);
        if (invoice.products && invoice.products.length > 0) {
          // Add products from this row to the existing invoice
          existing.products.push(...invoice.products);
        }
      }
    }
    
    console.log(`📦 Grouped ${invoices.length} rows into ${groupedInvoices.size} unique invoices`);
    
    // ✅ STEP 2: Update progress total to reflect unique invoices (not total rows)
    progress.totalInvoices = groupedInvoices.size;
    
    // ✅ STEP 3: Process each unique invoice (MR Cash updated ONCE per invoice)
    let processedCount = 0;
    
    for (const [invoiceNumber, groupedInvoice] of groupedInvoices) {
      try {
        // Process the invoice with duplicate checking and merging
        const result = await processSingleInvoiceWithStockDeduction(
          groupedInvoice, 
          groupedInvoice._rowIndex, 
          skipDuplicates
        );
        
        if (result.skipped) {
          // This is an exact duplicate that was skipped
          skippedDuplicates++;
          console.log(`⏭️ Skipped exact duplicate invoice: ${invoiceNumber} (${processedCount + 1}/${groupedInvoices.size})`);
        } else if (result.success) {
          if (result.action === "merged") {
            // This invoice was merged with an existing one
            mergedInvoices++;
            console.log(`🔄 Merged invoice: ${invoiceNumber} (${processedCount + 1}/${groupedInvoices.size}) | Added ${result.addedProducts} products`);
            
            // Track MR cash added from merge
            if (result.paidAmount > 0) {
              totalMRCashAdded = fixPrecision(totalMRCashAdded + result.paidAmount);
            }
          } else {
            // This is a new invoice that was created
            successful++;
            console.log(`✅ Created invoice: ${invoiceNumber} (${processedCount + 1}/${groupedInvoices.size})`);
            
            // Track MR cash added
            if (result.paidAmount > 0) {
              totalMRCashAdded = fixPrecision(totalMRCashAdded + result.paidAmount);
            }
          }
        } else {
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
          console.log(`❌ Invoice ${invoiceNumber} failed (${processedCount + 1}/${groupedInvoices.size})`);
        }
      } catch (error) {
        failed++;
        errors.push({
          row: groupedInvoice._rowIndex + 2,
          invoiceNumber: invoiceNumber || "Unknown",
          message: error.message,
          type: "unexpected_error",
          timestamp: new Date().toISOString(),
        });
        console.log(`❌ Unexpected error for invoice ${invoiceNumber}: ${error.message}`);
      }
      
      processedCount++;
      
      // Update progress after EACH unique invoice
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
    
    console.log(`🎉 Import completed - Created: ${successful}, Merged: ${mergedInvoices}, Failed: ${failed}, Skipped (exact duplicates): ${skippedDuplicates}`);
    console.log(`💰 Total MR Cash Added: ${totalMRCashAdded}`);
    
  } catch (error) {
    progress.status = "failed";
    progress.errors.push({
      message: "Critical error in import process",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    progress.lastUpdated = Date.now();
    console.error(`💥 Critical error in import process: ${error.message}`);
  }
};

//
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

    const regex = buildProductNameRegex(cleanProductName);

    let product = await Product.findOne({ productName: regex });

    if (!product) {
      product = await ReportInHand.findOne({ productName: regex });
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

router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", tab = "All" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${escapeRegex(tab)}$`, "i");
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
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

router.get("/all", async (req, res) => {
  try {
    const { search = "", tab = "All" } = req.query;
    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(escapeRegex(search.trim()), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${escapeRegex(tab)}$`, "i");
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
          const stockItem = await ReportInHand.findOne({
            productName: buildProductNameRegex(p.productName),
          }).session(session);

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
        const productRecord = await Product.findOne({
          productName: buildProductNameRegex(p.productName),
        });
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
        const stockItem = await ReportInHand.findOne({
          productName: buildProductNameRegex(p.productName),
        }).session(session);

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

      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(p.productName),
      }).session(session);

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
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
