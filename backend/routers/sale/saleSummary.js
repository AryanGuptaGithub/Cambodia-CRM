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

// Fixed precision helper
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 1e10) / 1e10;
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  // Simply convert to lowercase and trim
  return name.toLowerCase().trim();
};

const generateProductNameVariations = (productName) => {
  const variations = new Set();

  if (!productName) return Array.from(variations);

  // Get the base normalized name (lowercase + trim)
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

// FIXED: Improved stock calculation that properly reads all available stock fields
const calculateProductStock = async (productName, requiredQty = 0) => {
  try {
    // Generate simple variations
    const variations = generateProductNameVariations(productName);

    // Search in ReportInHand with exact matching first
    let stockItem = null;
    let foundVariation = "";
    
    for (const variation of variations) {
      // Try exact match first
      stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${variation}$`, "i") },
      }).lean();

      if (stockItem) {
        foundVariation = variation;
        break;
      }
    }

    // If not found with exact match, try contains
    if (!stockItem) {
      for (const variation of variations) {
        stockItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(variation, "i") },
        }).lean();

        if (stockItem) {
          foundVariation = variation;
          break;
        }
      }
    }

    // If still not found, try more flexible search
    if (!stockItem) {
      // Try removing spaces and special characters
      const cleanedName = productName.toLowerCase().replace(/[^a-z0-9]/g, "");
      stockItem = await ReportInHand.findOne({
        $expr: {
          $regexMatch: {
            input: { $toLower: "$productName" },
            regex: cleanedName,
          },
        },
      }).lean();
    }

    // If product is not found in ReportInHand
    if (!stockItem) {
      // Check if product exists in Product collection (just for reference)
      const productInCatalog = await Product.findOne({
        productName: {
          $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i"),
        },
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

    // FIXED: Properly calculate available stock from ReportInHand schema
    let availableStock = 0;
    let batchDetails = [];

    // According to your ReportInHand schema, totalBoxes is the correct field
    // totalBoxes = totalBoxesFromBatches + addStockAdjustment - removeStockAdjustment
    if (stockItem.totalBoxes !== undefined && stockItem.totalBoxes !== null) {
      availableStock = fixPrecision(Number(stockItem.totalBoxes));
    } else {
      // Fallback to calculating from batches if totalBoxes is not set
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        // Filter only "batch" type entries (not adjustments)
        const batchEntries = stockItem.batches.filter(
          batch => !batch.adjustmentType || batch.adjustmentType === "batch"
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
        
        // Add adjustments from addStockAdjustment field
        let totalAdjustments = 0;
        if (stockItem.addStockAdjustment) {
          totalAdjustments = fixPrecision(totalAdjustments + fixPrecision(Number(stockItem.addStockAdjustment)));
        }
        if (stockItem.removeStockAdjustment) {
          totalAdjustments = fixPrecision(totalAdjustments - fixPrecision(Number(stockItem.removeStockAdjustment)));
        }
        
        availableStock = fixPrecision(Math.max(0, batchesSum + totalAdjustments));
      }
    }

    const insufficientQty = fixPrecision(Math.max(0, requiredQty - availableStock));
    const hasEnoughStock = availableStock >= requiredQty;

    // Debug log
    console.log(`🔍 STOCK CHECK - Product: "${productName}" | totalBoxes: ${stockItem.totalBoxes} | totalBoxesFromBatches: ${stockItem.totalBoxesFromBatches} | addStockAdjustment: ${stockItem.addStockAdjustment} | removeStockAdjustment: ${stockItem.removeStockAdjustment} | availableStock: ${availableStock} | required: ${requiredQty}`);

    // Only log if stock is insufficient
    if (!hasEnoughStock) {
      console.log(
        `❌ INSUFFICIENT STOCK - Product: "${productName}" | Required: ${requiredQty} | Available: ${availableStock} | Short by: ${insufficientQty}`,
      );
    } else {
      console.log(
        `✅ SUFFICIENT STOCK - Product: "${productName}" | Required: ${requiredQty} | Available: ${availableStock} | Remaining: ${fixPrecision(availableStock - requiredQty)}`,
      );
    }

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

// Build product name regex
const buildProductNameRegex = (productName) => {
  if (!productName) return /^$/;

  const escaped = productName
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*"); // Make spaces optional

  return new RegExp(`^${escaped}$`, "i");
};

// FIXED: Improved deduct stock function
const deductStockFromReportInHand = async (
  productName,
  salesQty,
  bonusQty,
  invoiceNumber = "Unknown",
  existingSession = null
) => {
  // Use existing session if provided, otherwise create new one
  const session = existingSession || await mongoose.startSession();
  const shouldManageTransaction = !existingSession; // Only manage transaction if we created it
  
  if (shouldManageTransaction) {
    session.startTransaction();
  }

  try {
    const totalRequiredQty = fixPrecision(salesQty + bonusQty);

    if (totalRequiredQty <= 0) {
      if (shouldManageTransaction) {
        await session.commitTransaction();
        await session.endSession();
      }
      return { success: true, deducted: 0, remaining: 0 };
    }

    // Find the actual stock item in ReportInHand
    const normalizedName = normalizeProductName(productName);
    const stockItem = await ReportInHand.findOne({
      productName: {
        $regex: buildProductNameRegex(normalizedName),
      },
    }).session(session);

    if (!stockItem) {
      if (shouldManageTransaction) {
        await session.abortTransaction();
        await session.endSession();
      }
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Stock record not found for "${productName}"`,
      };
    }

    // CRITICAL: Read the current totalBoxes value
    let currentAvailableStock = fixPrecision(Number(stockItem.totalBoxes || 0));
    
    console.log(`🔍 DEDUCTION CHECK - Invoice: ${invoiceNumber} | Product: "${productName}" | totalBoxes: ${stockItem.totalBoxes} | totalBoxesFromBatches: ${stockItem.totalBoxesFromBatches} | Current Available: ${currentAvailableStock} | Required: ${totalRequiredQty}`);

    if (currentAvailableStock < totalRequiredQty) {
      console.log(`❌ DEDUCTION FAILED - Invoice: ${invoiceNumber} | Product: "${productName}" | Available: ${currentAvailableStock} | Required: ${totalRequiredQty}`);
      
      if (shouldManageTransaction) {
        await session.abortTransaction();
        await session.endSession();
      }
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Insufficient stock. Available: ${currentAvailableStock}, Required: ${totalRequiredQty}`,
      };
    }

    // IMPORTANT: Since totalBoxes is auto-calculated, we need to deduct from batches
    // Filter only "batch" type entries (not adjustments)
    const batchEntries = (stockItem.batches || []).filter(
      batch => !batch.adjustmentType || batch.adjustmentType === "batch"
    );
    
    // Sort batches by expiry date (FIFO)
    const sortedBatches = [...batchEntries].sort((a, b) => {
      const dateA = a.expiryDate
        ? new Date(a.expiryDate)
        : new Date("9999-12-31");
      const dateB = b.expiryDate
        ? new Date(b.expiryDate)
        : new Date("9999-12-31");
      return dateA - dateB;
    });

    let remainingToDeduct = totalRequiredQty;
    let totalDeducted = 0;
    const updatedBatches = [];
    const deductionDetails = [];

    // Deduct from batches first
    for (const batch of sortedBatches) {
      if (remainingToDeduct <= 0) break;

      const batchQty = fixPrecision(Number(batch.boxes || 0));

      if (batchQty > 0) {
        const deductFromThisBatch = fixPrecision(
          Math.min(batchQty, remainingToDeduct),
        );
        const remainingInBatch = fixPrecision(batchQty - deductFromThisBatch);

        if (remainingInBatch > 0) {
          // Update batch quantity
          updatedBatches.push({
            ...batch,
            boxes: remainingInBatch,
            amount: fixPrecision(remainingInBatch * (batch.lc || 0.71)),
          });
        }
        // Skip batches that become 0 (they won't be added to updatedBatches)

        totalDeducted = fixPrecision(totalDeducted + deductFromThisBatch);
        remainingToDeduct = fixPrecision(remainingToDeduct - deductFromThisBatch);

        deductionDetails.push({
          batchNumber: batch.batchNumber,
          originalQty: batchQty,
          deducted: deductFromThisBatch,
          remainingInBatch: remainingInBatch,
          expiryDate: batch.expiryDate,
        });
      }
    }

    // Add untouched batches
    for (const batch of sortedBatches) {
      const batchQty = fixPrecision(Number(batch.boxes || 0));
      const alreadyProcessed = deductionDetails.some(
        (d) => d.batchNumber === batch.batchNumber,
      );

      if (!alreadyProcessed && batchQty > 0) {
        updatedBatches.push(batch);
      }
    }

    // Verify deduction
    if (remainingToDeduct > 0.001) {
      console.log(`❌ PARTIAL DEDUCTION - Invoice: ${invoiceNumber} | Product: "${productName}" | Deducted: ${totalDeducted} of ${totalRequiredQty}`);
      if (shouldManageTransaction) {
        await session.abortTransaction();
        await session.endSession();
      }
      return {
        success: false,
        deducted: totalDeducted,
        remaining: remainingToDeduct,
        message: `Could only deduct ${totalDeducted} of ${totalRequiredQty} units`,
        details: deductionDetails,
      };
    }

    // Update the batches array
    // Keep adjustment batches unchanged
    const adjustmentBatches = (stockItem.batches || []).filter(
      batch => batch.adjustmentType && batch.adjustmentType !== "batch"
    );
    
    stockItem.batches = [...updatedBatches, ...adjustmentBatches];
    stockItem.updatedAt = new Date();

    // The pre-save hook will automatically recalculate totalBoxes, totalBoxesFromBatches, etc.
    await stockItem.save({ session });

    // Fetch the updated stock item to get new values
    const updatedStockItem = await ReportInHand.findById(stockItem._id).session(session);
    
    console.log(`✅ STOCK DEDUCTION SUCCESS - Invoice: ${invoiceNumber} | Product: "${productName}" | Deducted: ${totalDeducted} | New Stock (totalBoxes): ${updatedStockItem.totalBoxes}`);

    if (shouldManageTransaction) {
      await session.commitTransaction();
      await session.endSession();
    }

    return {
      success: true,
      deducted: totalDeducted,
      remaining: 0,
      newStockLevel: updatedStockItem.totalBoxes,
      message: `Successfully deducted ${totalDeducted} units`,
      details: deductionDetails,
    };
  } catch (error) {
    console.error(`❌ DEDUCTION ERROR for ${productName}:`, error);
    
    if (shouldManageTransaction) {
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
    }

    return {
      success: false,
      deducted: 0,
      remaining: salesQty + bonusQty,
      message: `Stock deduction failed: ${error.message}`,
      error: error.message,
    };
  }
};

// Restore stock to ReportInHand
// Restore stock to ReportInHand
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

    const normalizedName = normalizeProductName(productName);
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    if (stockItem) {
      const currentDate = new Date();
      
      // Create a new batch for restoration
      const newBatch = {
        batchNumber: `RESTORE-${Date.now()}`,
        boxes: restoredQty,
        lc: stockItem.averagePrice || 0.71,
        fob: stockItem.averagePrice || 0.71,
        cif: stockItem.averagePrice || 0.71,
        amount: fixPrecision(restoredQty * (stockItem.averagePrice || 0.71)),
        expiryDate: new Date(currentDate.setFullYear(currentDate.getFullYear() + 1)),
        date: new Date(),
        adjustmentType: "batch", // This is a regular batch, not an adjustment
        _id: new mongoose.Types.ObjectId(),
      };

      // Add the new batch
      if (!stockItem.batches) {
        stockItem.batches = [];
      }
      stockItem.batches.push(newBatch);
      
      // Update timestamp
      stockItem.updatedAt = new Date();

      // Save - the pre-save hook will recalculate totals
      await stockItem.save({ session });
      
      // Fetch updated item
      const updatedStockItem = await ReportInHand.findById(stockItem._id).session(session);
      
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
      // Create new stock item
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
            expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
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

const mapPaymentStatus = (status) => {
  if (!status) return "Credit";
  const s = status.toLowerCase().trim();
  const map = {
    paid: "Cash",
    cash: "Cash",
    credit: "Credit",
    pending: "Credit",
    "partial paid": "Partial Paid",
  };
  return map[s] || "Credit";
};

// ============================
// ROUTES START HERE
// ============================

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
    // Check if another import is already in progress
    if (isImportInProgress) {
      return res.status(429).json({
        success: false,
        message: "Another import is already in progress. Please wait.",
        retryAfter: 30,
      });
    }
    isImportInProgress = true;
    // Create session for import progress
    sessionId = `import_stock_deduction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    importProgressMap.set(sessionId, {
      sessionId,
      totalInvoices: invoiceData.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      skippedDuplicates: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
      status: "initializing",
      importType: "stock_deduction",
    });
    // Start import immediately
    processImportWithStockDeduction(sessionId, invoiceData, skipDuplicates)
      .catch(error => {
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          progress.status = "failed";
          progress.errors.push({
            message: "Import process failed unexpectedly",
            error: error.message,
            timestamp: new Date().toISOString()
          });
          progress.lastUpdated = Date.now();
        }
      })
      .finally(() => {
        isImportInProgress = false;
      });
    res.json({
      success: true,
      message: "Import with stock deduction started",
      sessionId,
      totalInvoices: invoiceData.length,
      note: "Stock will be deducted from ReportInHand for each sale",
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      startTime: new Date().toISOString(),
    });
  } catch (error) {
    if (sessionId) importProgressMap.delete(sessionId);
    isImportInProgress = false;
    res.status(500).json({
      success: false,
      message: "Import failed to start",
      error: error.message,
    });
  }
});

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
  progress.status = "processing";
  progress.startTime = Date.now();
  progress.lastUpdated = Date.now();
  try {
    // Process invoices ONE AT A TIME sequentially to avoid stock conflicts
    for (let i = 0; i < invoices.length; i++) {
      const invoice = invoices[i];
      try {
        // Validate invoice before processing
        if (!invoice.invoiceNumber?.trim()) {
          throw new Error("Invoice number is required");
        }
        // Skip duplicate check if enabled
        if (skipDuplicates) {
          const existingInvoice = await SaleSummary.findOne({
            invoiceNumber: invoice.invoiceNumber.trim(),
          });
          if (existingInvoice) {
            skippedDuplicates++;
            // Update progress for skipped invoice
            progress.processedInvoices = i + 1;
            progress.skippedDuplicates = skippedDuplicates;
            progress.progressPercentage = Math.round(
              ((i + 1) / progress.totalInvoices) * 100
            );
            progress.lastUpdated = Date.now();
            continue;
          }
        }
        // Process invoice with stock deduction - WAIT for completion before next invoice
        const result = await processSingleInvoiceWithStockDeduction(invoice, i);
        if (result.success) {
          successful++;
        } else {
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        failed++;
        errors.push({
          row: i + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          message: error.message,
          type: "unexpected_error",
          timestamp: new Date().toISOString()
        });
      }
      // Update progress after EACH invoice completes
      progress.processedInvoices = i + 1;
      progress.successful = successful;
      progress.failed = failed;
      progress.skippedDuplicates = skippedDuplicates;
      progress.progressPercentage = Math.round(
        ((i + 1) / progress.totalInvoices) * 100
      );
      progress.lastUpdated = Date.now();
    }
    // Mark import as completed
    progress.completed = true;
    progress.endTime = Date.now();
    progress.totalTime = progress.endTime - progress.startTime;
    progress.errors = errors;
    progress.status = "completed";
  } catch (error) {
    // Update progress with critical error
    progress.status = "failed";
    progress.errors.push({
      message: "Critical error in import process",
      error: error.message,
      timestamp: new Date().toISOString()
    });
    progress.lastUpdated = Date.now();
  }
};

const processSingleInvoiceWithStockDeduction = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }
    
    // Check for duplicate invoice
    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);
    
    if (existingInvoice) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        error: {
          row: index + 2,
          invoiceNumber: invoiceData.invoiceNumber,
          message: `Invoice number ${invoiceData.invoiceNumber} already exists`,
          type: "duplicate_error",
        },
      };
    }
    
    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];
    
    // Process each product WITHIN THE SAME TRANSACTION
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);
      
      if (totalQty <= 0) continue;
      
      // Find stock item WITHIN THE SESSION
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i") },
      }).session(session);
      
      if (!stockItem) {
        throw new Error(`Product "${productName}" not found in inventory`);
      }
      
      // CRITICAL: Read current stock - just use totalBoxes
      const currentAvailableStock = fixPrecision(Number(stockItem.totalBoxes || 0));
      
      console.log(`🔍 IMPORT CHECK - Invoice: ${invoiceData.invoiceNumber} | Product: "${productName}" | Available: ${currentAvailableStock} | Required: ${totalQty}`);
      
      if (currentAvailableStock < totalQty) {
        const shortage = fixPrecision(totalQty - currentAvailableStock);
        throw new Error(
          `Insufficient stock for ${productName}. Required: ${totalQty}, Available: ${currentAvailableStock}, Short by: ${shortage}`
        );
      }
      
      // Find product details
      const productRecord = await Product.findOne({
        productName: { $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i") },
      }).session(session);
      
      const lc = productRecord?.lc || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;
      
      // Add to processed products
      processedProducts.push({
        productName: productName,
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty ? netSellingAmount / totalQty : 0,
        lc,
        profitLoss: (sellingPrice - lc) * salesQty,
        isProductAccept: true,
      });
      
      totalAmount += netSellingAmount;
      
      // Deduct stock - pass the SAME session
      const deductionResult = await deductStockFromReportInHand(
        productName,
        salesQty,
        bonusQty,
        invoiceData.invoiceNumber,
        session
      );
      
      stockDeductionResults.push({ product: productName, ...deductionResult });
      
      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`
        );
      }
    }
    
    if (processedProducts.length === 0) {
      throw new Error("No valid products found in invoice");
    }
    
    // Create the sale record
    const paidAmount = parseFloat(invoiceData.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    
    const saleRecord = new SaleSummary({
      recordingDate: new Date(invoiceData.recordingDate || Date.now()),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate ? new Date(invoiceData.deliveryDate) : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0,
      ),
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
    });
    
    await saleRecord.save({ session });
    await session.commitTransaction();
    await session.endSession();
    
    console.log(`✅ IMPORT SUCCESS - Invoice: ${invoiceData.invoiceNumber} processed successfully`);
    
    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
    };
  } catch (error) {
    console.error(`❌ IMPORT ERROR for invoice ${invoiceData.invoiceNumber}:`, error);
    
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

// Debug endpoint to check specific product stock
router.get("/debug/stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    
    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }
    
    // Find stock item
    const stockItem = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${normalizeProductName(productName)}$`, "i") },
    });
    
    if (!stockItem) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found in ReportInHand`,
      });
    }
    
    // Calculate batch totals
    const batchEntries = (stockItem.batches || []).filter(
      batch => !batch.adjustmentType || batch.adjustmentType === "batch"
    );
    
    const batchTotal = batchEntries.reduce((sum, batch) => sum + (batch.boxes || 0), 0);
    const adjustmentBatches = (stockItem.batches || []).filter(
      batch => batch.adjustmentType && batch.adjustmentType !== "batch"
    );
    
    res.json({
      success: true,
      productName: stockItem.productName,
      stockData: {
        totalBoxes: stockItem.totalBoxes,
        totalBoxesFromBatches: stockItem.totalBoxesFromBatches,
        addStockAdjustment: stockItem.addStockAdjustment,
        removeStockAdjustment: stockItem.removeStockAdjustment,
        calculatedStock: stockItem.totalBoxesFromBatches + 
                        (stockItem.addStockAdjustment || 0) - 
                        (stockItem.removeStockAdjustment || 0),
      },
      batches: {
        totalBatches: stockItem.batches?.length || 0,
        regularBatches: batchEntries.length,
        adjustmentBatches: adjustmentBatches.length,
        batchTotal: batchTotal,
        batchDetails: batchEntries.map(batch => ({
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
// Cleanup stale sessions
const cleanupStaleImportSessions = () => {
  const now = Date.now();
  const STALE_THRESHOLD = 24 * 60 * 60 * 1000; // 24 hours

  for (const [sessionId, progress] of importProgressMap.entries()) {
    if (progress.completed && (now - progress.endTime) > STALE_THRESHOLD) {
      importProgressMap.delete(sessionId);
    }
  }
};

setInterval(cleanupStaleImportSessions, 60 * 60 * 1000);

// Progress endpoint
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

// Failed invoices endpoint
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

// Product existence check
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

    const searchStrategies = [
      { productName: { $regex: new RegExp(`^${cleanProductName}$`, "i") } },
      {
        productName: {
          $regex: new RegExp(
            `^${cleanProductName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i",
          ),
        },
      },
      { productName: { $regex: new RegExp(cleanProductName, "i") } },
    ];

    let product = null;

    for (let i = 0; i < searchStrategies.length; i++) {
      product = await Product.findOne(searchStrategies[i]);
      if (product) {
        break;
      }
    }

    if (!product) {
      for (let i = 0; i < searchStrategies.length; i++) {
        product = await ReportInHand.findOne(searchStrategies[i]);
        if (product) {
          break;
        }
      }
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

// Get sales with pagination
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 9, search = "", tab = "All" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
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

// Get ALL sales
router.get("/all", async (req, res) => {
  try {
    const { search = "", tab = "All" } = req.query;
    const matchConditions = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { customerName: searchRegex },
        { "products.productName": searchRegex },
      ];
    }

    if (tab && tab !== "All") {
      matchConditions.paymentStatus = new RegExp(`^${tab}$`, "i");
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

// Get payment status
router.get("/payment-status", async (req, res) => {
  try {
    const statuses = await PaymentStatus.find().sort({ type: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

// Delete sale
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const saleToDelete = await SaleSummary.findById(id).session(session);

    if (!saleToDelete) {
      throw new Error("Sales record not found.");
    }

    // Restore stock to ReportInHand
    for (const product of saleToDelete.products || []) {
      const salesQty = Number(product.salesQty) || 0;
      const bonusQty = Number(product.bonusQty) || 0;
      const totalQty = salesQty + bonusQty;

      if (totalQty > 0) {
        await restoreStockToReportInHand(product.productName, totalQty);
      }
    }

    // Delete the sale
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

// Update sale
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const originalSale = await SaleSummary.findById(id).session(session);
    if (!originalSale) {
      throw new Error("Sales record not found.");
    }

    // Check invoice uniqueness
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

    // Process products
    const updatedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;

    // Calculate stock differences and adjust
    for (const p of saleData.products || []) {
      if (!p.productName || !p.productName.trim()) continue;

      const newSalesQty = fixPrecision(Number(p.salesQty) || 0);
      const newBonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const newTotalQty = fixPrecision(newSalesQty + newBonusQty);

      if (newTotalQty === 0) continue;

      // Find original product quantity
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

      // Calculate stock difference
      const quantityDifference = fixPrecision(newTotalQty - originalTotalQty);

      if (Math.abs(quantityDifference) > 0.0001) {
        if (quantityDifference > 0) {
          // Check stock WITHIN THE SESSION to get locked data
          const stockItem = await ReportInHand.findOne({
            productName: { $regex: new RegExp(`^${normalizeProductName(p.productName)}$`, "i") },
          }).session(session);

          if (!stockItem) {
            throw new Error(`Product "${p.productName}" not found in inventory`);
          }

          // Calculate available stock from the locked record
          let availableStock = 0;
          
          // Use same logic as calculateProductStock
          if (stockItem.totalBoxes !== undefined && stockItem.totalBoxes !== null) {
            availableStock = fixPrecision(Number(stockItem.totalBoxes));
          }
          
          if (availableStock <= 0.01 && stockItem.totalBoxesFromBatches !== undefined && stockItem.totalBoxesFromBatches !== null) {
            availableStock = fixPrecision(Number(stockItem.totalBoxesFromBatches));
          }
          
          if (availableStock <= 0.01 && stockItem.batches && Array.isArray(stockItem.batches)) {
            let batchesSum = 0;
            stockItem.batches.forEach((batch) => {
              const batchQty = fixPrecision(Number(batch.boxes || batch.quantity || 0));
              if (batchQty > 0) {
                batchesSum = fixPrecision(batchesSum + batchQty);
              }
            });
            if (batchesSum > 0) {
              availableStock = batchesSum;
            }
          }

          // Apply adjustments
          let totalAdjustments = 0;
          if (stockItem.addStockAdjustment) {
            totalAdjustments = fixPrecision(totalAdjustments + fixPrecision(Number(stockItem.addStockAdjustment)));
          }
          if (stockItem.removeStockAdjustment) {
            totalAdjustments = fixPrecision(totalAdjustments - fixPrecision(Number(stockItem.removeStockAdjustment)));
          }

          const finalStock = fixPrecision(Math.max(0, availableStock + totalAdjustments));
          const requiredQty = Math.abs(quantityDifference);

          if (finalStock < requiredQty) {
            const shortage = fixPrecision(requiredQty - finalStock);
            throw new Error(
              `Insufficient stock for ${p.productName}. Required: ${requiredQty}, Available: ${finalStock}, Short by: ${shortage}`
            );
          }

          // Deduct additional stock - pass session to use SAME transaction
          const deductResult = await deductStockFromReportInHand(
            p.productName,
            quantityDifference,
            0,
            originalSale.invoiceNumber,
            session // Pass existing session
          );

          if (!deductResult.success) {
            throw new Error(`Stock deduction failed for ${p.productName}: ${deductResult.message}`);
          }
        } else if (quantityDifference < 0) {
          // Restore reduced stock
          await restoreStockToReportInHand(
            p.productName,
            Math.abs(quantityDifference),
          );
        }
      }

      const sellingPrice = Number(p.sellingPrice) || 0;
      const amount = sellingPrice * newSalesQty;
      const discount = Number(p.discount) || 0;
      const netSellingAmount = amount - discount;

      let lcValue = parseFloat(p.lc) || 0;
      if (lcValue <= 0) {
        const productRecord = await Product.findOne({
          productName: {
            $regex: new RegExp(`^${normalizeProductName(p.productName)}$`, "i"),
          },
        });
        lcValue = productRecord?.lc || 0;
      }

      const profitLoss = (sellingPrice - lcValue) * newSalesQty;

      updatedProducts.push({
        productName: p.productName.trim(),
        salesQty: newSalesQty,
        bonusQty: newBonusQty,
        totalQty: newTotalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: newTotalQty > 0 ? netSellingAmount / newTotalQty : 0,
        lc: lcValue,
        profitLoss,
        isProductAccept: true,
      });

      totalAmount += netSellingAmount;
      totalProfitLoss += profitLoss;
    }

    if (updatedProducts.length === 0) {
      throw new Error("At least one valid product is required");
    }

    const paidAmount = Number(saleData.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);

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
        customerName: saleData.customerName || originalSale.customerName,
        customerCode: saleData.customerCode || originalSale.customerCode,
        customerId: saleData.customerId || originalSale.customerId,
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

// Create sale (manual entry)
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

    // Check invoice uniqueness
    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: data.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      throw new Error("Invoice number already exists");
    }

    // Process products and validate stock
    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];

    // Check stock for all products first - WITHIN SESSION
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty > 0) {
        // Find stock item WITHIN THE SESSION to ensure we get current locked data
        const stockItem = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${normalizeProductName(p.productName)}$`, "i") },
        }).session(session);

        if (!stockItem) {
          throw new Error(`Product "${p.productName}" not found in inventory`);
        }

        // Calculate available stock from the locked record
        let availableStock = 0;
        
        // Use same logic as calculateProductStock
        if (stockItem.totalBoxes !== undefined && stockItem.totalBoxes !== null) {
          availableStock = fixPrecision(Number(stockItem.totalBoxes));
        }
        
        if (availableStock <= 0.01 && stockItem.totalBoxesFromBatches !== undefined && stockItem.totalBoxesFromBatches !== null) {
          availableStock = fixPrecision(Number(stockItem.totalBoxesFromBatches));
        }
        
        if (availableStock <= 0.01 && stockItem.batches && Array.isArray(stockItem.batches)) {
          let batchesSum = 0;
          stockItem.batches.forEach((batch) => {
            const batchQty = fixPrecision(Number(batch.boxes || batch.quantity || 0));
            if (batchQty > 0) {
              batchesSum = fixPrecision(batchesSum + batchQty);
            }
          });
          if (batchesSum > 0) {
            availableStock = batchesSum;
          }
        }

        // Apply adjustments
        let totalAdjustments = 0;
        if (stockItem.addStockAdjustment) {
          totalAdjustments = fixPrecision(totalAdjustments + fixPrecision(Number(stockItem.addStockAdjustment)));
        }
        if (stockItem.removeStockAdjustment) {
          totalAdjustments = fixPrecision(totalAdjustments - fixPrecision(Number(stockItem.removeStockAdjustment)));
        }

        const finalStock = fixPrecision(Math.max(0, availableStock + totalAdjustments));

        if (finalStock < totalQty) {
          const shortage = fixPrecision(totalQty - finalStock);
          throw new Error(
            `Insufficient stock for ${p.productName}. Required: ${totalQty}, Available: ${finalStock}, Short by: ${shortage}`
          );
        }
      }
    }

    // Process products
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty === 0) continue;

      const sellingPrice = Number(p.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = Number(p.discount) || 0;
      const netSellingAmount = amount - discount;

      const productRecord = await Product.findOne({
        productName: {
          $regex: new RegExp(`^${normalizeProductName(p.productName)}$`, "i"),
        },
      }).session(session);

      const lc = productRecord?.lc || Number(p.lc) || 0;
      const profitLoss = (sellingPrice - lc) * salesQty;

      processedProducts.push({
        productName: p.productName.trim(),
        salesQty,
        bonusQty,
        totalQty,
        sellingPrice,
        amount,
        discount,
        netSellingAmount,
        averageUnitPrice: totalQty ? netSellingAmount / totalQty : 0,
        lc,
        profitLoss,
        isProductAccept: true,
      });

      totalAmount += netSellingAmount;
      totalProfitLoss += profitLoss;

      // Deduct stock - pass session to use SAME transaction
      const deductionResult = await deductStockFromReportInHand(
        p.productName.trim(),
        salesQty,
        bonusQty,
        data.invoiceNumber,
        session // Pass existing session
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

    // Payment processing
    const paidAmount = Number(data.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    const paymentStatus = mapPaymentStatus(data.paymentStatus);

    // Create sale
    const saleData = {
      recordingDate: data.recordingDate || new Date(),
      invoiceNumber: data.invoiceNumber.trim(),
      invoiceDate: data.invoiceDate || new Date(),
      mrName: data.mrName.trim(),
      mrId: data.mrId || null,
      customerName: data.customerName || "",
      customerCode: data.customerCode || "",
      customerId: data.customerId || null,
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

// Delete batch sales
router.delete("/delete-batch", async (req, res) => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "No sale IDs provided for deletion"
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const salesToDelete = await SaleSummary.find({ _id: { $in: ids } }).session(session);

    // Restore stock for each sale
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

    // Delete the sales
    await SaleSummary.deleteMany({ _id: { $in: ids } }).session(session);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `${salesToDelete.length} sales deleted successfully and stock restored.`,
      deletedCount: salesToDelete.length
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    res.status(500).json({
      success: false,
      error: err.message || "Failed to delete sales"
    });
  }
});

// Health check endpoint
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
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;