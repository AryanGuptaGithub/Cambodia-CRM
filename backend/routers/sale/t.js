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


// ==========================================
// CREATE SALE (Manual) - FIXED
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
            `Product "${p.productName}" not found in ${mrStock.mrName}'s stock.`,
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
        lc = deductionResult.lc || 0;
        
        console.log(`📊 [Sale Create] ${p.productName} - Using LC from stock deduction: ${lc}`);

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

// ==========================================
// GET all sales (simple)
// ==========================================
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

// ==========================================
// GET MR Cash summary
// ==========================================
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

// ==========================================
// POST check stock
// ==========================================
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

// ==========================================
// POST validate import stock
// ==========================================
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

// ==========================================
// GET debug stock
// ==========================================
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

// ==========================================
// POST validate MR
// ==========================================
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

// ==========================================
// POST validate import MRs
// ==========================================
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

// ==========================================
// POST check duplicates
// ==========================================
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

// ==========================================
// POST validate import MR stock
// ==========================================
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

// ==========================================
// GET debug customer
// ==========================================
router.get("/debug/customer/:code", async (req, res) => {
  try {
    const result = await getCustomerByCode(req.params.code);
    res.json({ success: true, code: req.params.code, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// GET products check
// ==========================================
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

// ==========================================
// GET MR stock with stock
// ==========================================
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

// ==========================================
// GET MR stock products
// ==========================================
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

// ==========================================
// GET MR stock for specific product
// ==========================================
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
        (p.productName?.toLowerCase().trim() || "") ===
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

// ==========================================
// GET profit loss summary
// ==========================================
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

// ==========================================
// GET analytics custom range
// ==========================================
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

