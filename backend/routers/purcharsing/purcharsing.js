import express from "express";
import mongoose from "mongoose";
import purchaseInventory from "../../models/purcharsing/purchaseInventory.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import { protect } from "../../middleware/auth.js";
import { allowAdminOnly } from "../../middleware/allowAdminOnly.js";

const router = express.Router();

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  let normalized = name.toLowerCase().trim();
  normalized = normalized.replace(/\s+/g, " ");
  normalized = normalized.replace(/\s{2,}/g, " ");
  normalized = normalized.replace(/(\d+)\.0+(\s|$)/g, "$1$2");
  normalized = normalized.replace(/(\d+)\.(\d+)0+(\s|$)/g, "$1.$2$3");
  return normalized;
};

const getStandardizedProductName = async (productName) => {
  if (!productName || typeof productName !== "string") return "";
  const normalized = normalizeProductName(productName);

  const exactMatch = await Product.findOne({
    productName: { $regex: new RegExp(`^${normalized}$`, "i") },
  }).lean();
  if (exactMatch) return exactMatch.productName;

  const partialMatch = await Product.findOne({
    productName: { $regex: normalized, $options: "i" },
  }).lean();
  if (partialMatch) return partialMatch.productName;

  const decimalPattern = normalized.match(/(\d+)\.(\d+)/);
  if (decimalPattern) {
    const [fullMatch, integerPart, decimalPart] = decimalPattern;
    const cleanDecimalPart = decimalPart.replace(/0+$/, "");
    const cleanDecimal = cleanDecimalPart
      ? `${integerPart}.${cleanDecimalPart}`
      : integerPart;
    const cleanedNormalized = normalized.replace(fullMatch, cleanDecimal);
    const cleanedMatch = await Product.findOne({
      productName: { $regex: new RegExp(`^${cleanedNormalized}$`, "i") },
    }).lean();
    if (cleanedMatch) return cleanedMatch.productName;
  }

  return normalized;
};

const isDuplicateBatch = (batch1, batch2) => {
  const b1Expiry = batch1.expiryDate
    ? new Date(batch1.expiryDate).getTime()
    : null;
  const b2Expiry = batch2.expiryDate
    ? new Date(batch2.expiryDate).getTime()
    : null;
  return (
    batch1.boxes === batch2.boxes &&
    Math.abs(batch1.lc - batch2.lc) < 0.001 &&
    Math.abs(batch1.fob - batch2.fob) < 0.001 &&
    Math.abs(batch1.cif - batch2.cif) < 0.001 &&
    b1Expiry === b2Expiry
  );
};

const batchExists = (batches, newBatch) =>
  batches.some((existing) => isDuplicateBatch(existing, newBatch));

const calculateTotalsFromBatches = (batches) => {
  // Only count real batches (adjustmentType === "batch" or undefined)
  const realBatches = batches.filter(
    (b) => !b.adjustmentType || b.adjustmentType === "batch",
  );
  const totalBoxesFromBatches = realBatches.reduce(
    (sum, b) => sum + (b.boxes || 0),
    0,
  );
  const totalAmount = realBatches.reduce((sum, b) => sum + (b.amount || 0), 0);
  const averagePrice =
    totalBoxesFromBatches > 0 ? totalAmount / totalBoxesFromBatches : 0;
  return { totalBoxesFromBatches, totalAmount, averagePrice };
};

const calculateStockStatus = (boxes) => {
  if (boxes <= 0) return "Out of Stock";
  if (boxes < 10) return "Critical";
  if (boxes < 25) return "Low Stock";
  return "In Stock";
};

// ══════════════════════════════════════════════════════════════════════════════
// updateReportInHand
// ══════════════════════════════════════════════════════════════════════════════
// Adds or subtracts a product batch in ReportInHand when a purchase invoice
// is created, updated, or deleted.
//
// BUG FIXED: The original code had a copy-paste error in the newBatch object:
//
//   sellingPrice:        ← field declared
//   amount,              ← but `amount` was assigned as the VALUE (not sellingPrice)
//
// This meant:
//   • `sellingPrice` field in the stored batch = the calculated amount (WRONG)
//   • `amount` field was never set → stored as undefined/0 (WRONG)
//
// Fixed by correctly separating the two fields:
//   sellingPrice: sellingPrice || 0,
//   amount: amount,
// ══════════════════════════════════════════════════════════════════════════════
const updateReportInHand = async (productData, operation = "add") => {
  try {
    const {
      productName,
      supplierName,
      quantityPerBoxStrip,
      lc,
      fob,
      cif,
      expiryDate,
      type,
      sellingPrice,
    } = productData;

    if (!productName || productName.trim() === "") {
      console.warn("Skipping updateReportInHand: productName missing");
      return;
    }

    const qty = Number(quantityPerBoxStrip || 0);
    const validSupplier = supplierName?.trim() || "Unknown Supplier";

    const standardizedProductName =
      await getStandardizedProductName(productName);
    const finalProductName = normalizeProductName(standardizedProductName);

    if (operation === "add") {
      // ── Calculate amount correctly ──────────────────────────────────────
      const lcValue = Number(lc || 0);
      const amount = qty * lcValue;

      // ── Build the full batch subdocument ───────────────────────────────
      // CRITICAL: every field must be explicitly set.
      // Do NOT use a shorthand like `sellingPrice:\n amount,` — that assigns
      // the `amount` variable to the `sellingPrice` key, leaving `amount`
      // unset (undefined → 0 in Mongo).
      const newBatch = {
        boxes: qty,
        lc: lcValue,
        fob: Number(fob || 0),
        cif: Number(cif || 0),
        sellingPrice: Number(sellingPrice || 0), // ← correct: selling price
        amount: amount, // ← correct: lc × qty
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        date: new Date(),
        _id: new mongoose.Types.ObjectId(),
        adjustmentType: "batch",
      };

      const existingDoc = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${finalProductName}$`, "i") },
      }).lean();

      if (existingDoc) {
        if (batchExists(existingDoc.batches || [], newBatch)) {
          // Exact duplicate — skip silently
          return;
        }

        const updatedBatches = [...(existingDoc.batches || []), newBatch];
        const { totalBoxesFromBatches, totalAmount, averagePrice } =
          calculateTotalsFromBatches(updatedBatches);

        const totalBoxes =
          totalBoxesFromBatches +
          (existingDoc.addStockAdjustment || 0) -
          (existingDoc.removeStockAdjustment || 0);

        // Only update sellingPrice when the incoming value is non-zero
        // (preserves existing value if purchase has sellingPrice = 0)
        const newSellingPrice =
          sellingPrice !== undefined &&
          sellingPrice !== null &&
          sellingPrice !== 0
            ? Number(sellingPrice)
            : existingDoc.sellingPrice || 0;

        await ReportInHand.updateOne(
          { _id: existingDoc._id },
          {
            $set: {
              productName: finalProductName,
              supplierName: validSupplier,
              type: type || existingDoc.type || "",
              sellingPrice: newSellingPrice,
              batches: updatedBatches,
              totalBoxesFromBatches,
              totalBoxes,
              totalAmount,
              averagePrice,
              status: calculateStockStatus(totalBoxes),
              updatedAt: new Date(),
            },
          },
        );
      } else {
        // ── Create new ReportInHand document ─────────────────────────────
        const { totalBoxesFromBatches, totalAmount, averagePrice } =
          calculateTotalsFromBatches([newBatch]);
        const totalBoxes = totalBoxesFromBatches;

        await ReportInHand.create({
          productName: finalProductName,
          supplierName: validSupplier,
          type: type || "",
          sellingPrice: Number(sellingPrice || 0),
          batches: [newBatch],
          totalBoxesFromBatches,
          totalBoxes,
          totalAmount,
          averagePrice,
          addStockAdjustment: 0,
          removeStockAdjustment: 0,
          status: calculateStockStatus(totalBoxes),
          minStockLevel: 10,
        });
      }
    } else if (operation === "subtract") {
      // ── FIFO subtraction: remove from oldest batches first ─────────────
      const existingDoc = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${finalProductName}$`, "i") },
      }).lean();

      if (!existingDoc) {
        console.warn(`No stock found for ${finalProductName} to subtract`);
        return;
      }

      let remainingToRemove = qty;
      const batches = [...(existingDoc.batches || [])];

      // Sort by date ascending (oldest first = FIFO)
      batches.sort((a, b) => new Date(a.date) - new Date(b.date));

      const updatedBatches = [];
      for (const batch of batches) {
        if (remainingToRemove <= 0) {
          updatedBatches.push(batch);
          continue;
        }

        // Keep non-batch adjustments intact
        if (batch.adjustmentType && batch.adjustmentType !== "batch") {
          updatedBatches.push(batch);
          continue;
        }

        const available = batch.boxes;
        if (available <= remainingToRemove) {
          // Remove entire batch
          remainingToRemove -= available;
        } else {
          // Partially remove from this batch
          updatedBatches.push({
            ...batch,
            boxes: available - remainingToRemove,
            amount: (available - remainingToRemove) * (batch.lc || 0),
          });
          remainingToRemove = 0;
        }
      }

      if (remainingToRemove > 0) {
        console.warn(
          `Not enough stock to subtract ${qty} from ${finalProductName}. ` +
            `Only removed ${qty - remainingToRemove}.`,
        );
      }

      const { totalBoxesFromBatches, totalAmount, averagePrice } =
        calculateTotalsFromBatches(updatedBatches);

      const totalBoxes =
        totalBoxesFromBatches +
        (existingDoc.addStockAdjustment || 0) -
        (existingDoc.removeStockAdjustment || 0);

      await ReportInHand.updateOne(
        { _id: existingDoc._id },
        {
          $set: {
            batches: updatedBatches,
            totalBoxesFromBatches,
            totalBoxes,
            totalAmount,
            averagePrice,
            status: calculateStockStatus(totalBoxes),
            updatedAt: new Date(),
          },
        },
      );
    }
  } catch (err) {
    console.error("updateReportInHand ERROR:", err.message || err);
  }
};

const getProductMappingFromDatabase = async () => {
  try {
    const products = await Product.find({}, "productName").lean();
    const productMap = {};
    products.forEach((product) => {
      if (product.productName) {
        const normalized = normalizeProductName(product.productName);
        productMap[normalized] = product.productName;
      }
    });
    return productMap;
  } catch (error) {
    console.error("Error getting product mapping from database:", error);
    return {};
  }
};

const filterReportsWithBatches = (reports) =>
  reports.filter(
    (report) => Array.isArray(report.batches) && report.batches.length > 0,
  );

// ── Cleanup duplicates ────────────────────────────────────────────────────────
router.post("/reports-in-hand/cleanup-duplicates", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();
    let cleanedCount = 0;
    let updatedProducts = 0;
    const errors = [];

    for (const report of allReports) {
      try {
        const batches = report.batches || [];
        const uniqueBatches = [];
        const seenBatches = new Set();

        for (const batch of batches) {
          const batchExpiry = batch.expiryDate
            ? new Date(batch.expiryDate).getTime()
            : null;
          const batchKey = `${batch.boxes}|${batch.lc}|${batch.fob}|${batch.cif}|${batchExpiry}`;

          if (!seenBatches.has(batchKey)) {
            seenBatches.add(batchKey);
            uniqueBatches.push(batch);
          } else {
            cleanedCount++;
          }
        }

        if (uniqueBatches.length !== batches.length) {
          const totalBoxes = uniqueBatches.reduce(
            (sum, b) => sum + (b.boxes || 0),
            0,
          );
          const totalAmount = uniqueBatches.reduce(
            (sum, b) => sum + (b.amount || 0),
            0,
          );
          const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

          await ReportInHand.updateOne(
            { _id: report._id },
            {
              $set: {
                batches,
                totalBoxes,
                totalAmount,
                averagePrice,
                status: calculateStockStatus(totalBoxes),
                updatedAt: new Date(),
              },
            },
          );
          updatedProducts++;
        }
      } catch (error) {
        errors.push({
          reportId: report._id,
          productName: report.productName,
          error: error.message,
        });
      }
    }

    const cleanedReports = await ReportInHand.find({}).lean();
    const productSummary = cleanedReports.map((report) => ({
      productName: report.productName,
      totalBoxes:
        report.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) || 0,
      batchCount: report.batches?.length || 0,
      averagePrice: report.averagePrice || 0,
      status: report.status || "Unknown",
    }));

    res.json({
      success: true,
      message: `Cleaned ${cleanedCount} duplicate batches from ${updatedProducts} products`,
      cleanedCount,
      updatedProducts,
      productSummary,
      totalProducts: cleanedReports.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Cleanup duplicates error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to cleanup duplicate batches",
        error: error.message,
      });
  }
});

// ── Debug: all product totals ─────────────────────────────────────────────────
router.get("/debug/all-product-totals", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();

    const productDetails = allReports.map((report) => {
      const batches = report.batches || [];
      const batchDetails = batches.map((batch, index) => ({
        batchIndex: index + 1,
        boxes: batch.boxes,
        lc: batch.lc,
        fob: batch.fob,
        cif: batch.cif,
        sellingPrice: batch.sellingPrice,
        amount: batch.amount,
        expiryDate: batch.expiryDate,
        date: batch.date,
        adjustmentType: batch.adjustmentType,
      }));

      const sumOfBatchBoxes = batches.reduce(
        (sum, b) => sum + (b.boxes || 0),
        0,
      );
      const sumOfBatchAmount = batches.reduce(
        (sum, b) => sum + (b.amount || 0),
        0,
      );
      const calculatedAverage =
        sumOfBatchBoxes > 0 ? sumOfBatchAmount / sumOfBatchBoxes : 0;

      return {
        productName: report.productName,
        storedTotalBoxes: report.totalBoxes || 0,
        calculatedTotalBoxes: sumOfBatchBoxes,
        storedTotalAmount: report.totalAmount || 0,
        calculatedTotalAmount: sumOfBatchAmount,
        storedAveragePrice: report.averagePrice || 0,
        calculatedAveragePrice: calculatedAverage,
        batchCount: batches.length,
        status: report.status || "Unknown",
        discrepancy: {
          totalBoxes: sumOfBatchBoxes - (report.totalBoxes || 0),
          totalAmount: sumOfBatchAmount - (report.totalAmount || 0),
          averagePrice: calculatedAverage - (report.averagePrice || 0),
        },
        batches: batchDetails,
      };
    });

    const totalProducts = productDetails.length;
    const productsWithDiscrepancy = productDetails.filter(
      (p) => p.discrepancy.totalBoxes !== 0 || p.discrepancy.totalAmount !== 0,
    ).length;
    const totalStoredBoxes = productDetails.reduce(
      (sum, p) => sum + p.storedTotalBoxes,
      0,
    );
    const totalCalculatedBoxes = productDetails.reduce(
      (sum, p) => sum + p.calculatedTotalBoxes,
      0,
    );

    res.json({
      success: true,
      summary: {
        totalProducts,
        productsWithDiscrepancy,
        totalStoredBoxes,
        totalCalculatedBoxes,
        totalDiscrepancy: totalCalculatedBoxes - totalStoredBoxes,
      },
      products: productDetails,
      productsWithIssues: productDetails
        .filter(
          (p) =>
            Math.abs(p.discrepancy.totalBoxes) > 0 ||
            Math.abs(p.discrepancy.totalAmount) > 0.01,
        )
        .map((p) => ({
          productName: p.productName,
          storedTotalBoxes: p.storedTotalBoxes,
          calculatedTotalBoxes: p.calculatedTotalBoxes,
          discrepancy: p.discrepancy.totalBoxes,
          batchCount: p.batchCount,
        })),
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Fix all product totals ────────────────────────────────────────────────────
router.post("/reports-in-hand/fix-all-totals", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();
    let fixedCount = 0;
    const errors = [];

    for (const report of allReports) {
      try {
        const batches = report.batches || [];
        const totalBoxes = batches.reduce((sum, b) => sum + (b.boxes || 0), 0);
        const totalAmount = batches.reduce(
          (sum, b) => sum + (b.amount || 0),
          0,
        );
        const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

        if (
          Math.abs(totalBoxes - (report.totalBoxes || 0)) > 0.01 ||
          Math.abs(totalAmount - (report.totalAmount || 0)) > 0.01
        ) {
          await ReportInHand.updateOne(
            { _id: report._id },
            {
              $set: {
                totalBoxes,
                totalAmount,
                averagePrice,
                status: calculateStockStatus(totalBoxes),
                updatedAt: new Date(),
              },
            },
          );
          fixedCount++;
        }
      } catch (error) {
        errors.push({
          reportId: report._id,
          productName: report.productName,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Fixed totals for ${fixedCount} products`,
      fixedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Fix totals error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fix product totals",
        error: error.message,
      });
  }
});

// ── Debug: single product ─────────────────────────────────────────────────────
router.get("/debug/product/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const reports = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    }).lean();

    if (reports.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: `No product found containing: ${productName}`,
        });
    }

    const detailedReports = reports.map((report) => {
      const batches = report.batches || [];
      const { totalBoxesFromBatches, totalAmount, averagePrice } =
        calculateTotalsFromBatches(batches);
      const calculatedTotalBoxes =
        totalBoxesFromBatches +
        (report.addStockAdjustment || 0) -
        (report.removeStockAdjustment || 0);

      return {
        _id: report._id,
        productName: report.productName,
        supplierName: report.supplierName,
        type: report.type,
        batchCount: batches.length,
        batches: batches.map((batch, index) => ({
          batchIndex: index + 1,
          boxes: batch.boxes,
          lc: batch.lc,
          fob: batch.fob,
          cif: batch.cif,
          sellingPrice: batch.sellingPrice,
          amount: batch.amount,
          expiryDate: batch.expiryDate,
          date: batch.date,
          adjustmentType: batch.adjustmentType || "batch",
        })),
        storedTotalBoxesFromBatches: report.totalBoxesFromBatches || 0,
        storedTotalBoxes: report.totalBoxes || 0,
        storedTotalAmount: report.totalAmount || 0,
        storedAveragePrice: report.averagePrice || 0,
        calculatedTotalBoxesFromBatches: totalBoxesFromBatches,
        calculatedTotalBoxes,
        calculatedTotalAmount: totalAmount,
        calculatedAveragePrice: averagePrice,
        addStockAdjustment: report.addStockAdjustment || 0,
        removeStockAdjustment: report.removeStockAdjustment || 0,
        storedStatus: report.status || "Unknown",
        calculatedStatus: calculateStockStatus(calculatedTotalBoxes),
        discrepancy: {
          totalBoxesFromBatches:
            totalBoxesFromBatches - (report.totalBoxesFromBatches || 0),
          totalBoxes: calculatedTotalBoxes - (report.totalBoxes || 0),
          totalAmount: totalAmount - (report.totalAmount || 0),
        },
      };
    });

    res.json({
      success: true,
      count: detailedReports.length,
      products: detailedReports,
    });
  } catch (error) {
    console.error("Product debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /invoice ──────────────────────────────────────────────────────────────
router.get("/invoice", async (req, res) => {
  try {
    const invoices = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .select("invoiceNumber invoiceDate supplierName totalAmount")
      .lean();
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const purchases = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .lean();
    const productList = await Product.find(
      {},
      "productName type packing qtyPerBoxStrip sellingPrice batches",
    ).lean();

    const productMap = new Map();
    productList.forEach((prod) => {
      if (prod.productName) {
        productMap.set(normalizeProductName(prod.productName), prod);
      }
    });

    const enhancedPurchases = purchases.map((invoice) => ({
      ...invoice,
      products: invoice.products.map((p) => {
        const normalizedProductName = normalizeProductName(p.productName);
        let matchedProduct = productMap.get(normalizedProductName);
        if (!matchedProduct) {
          for (const [key, prod] of productMap.entries()) {
            if (
              normalizedProductName.includes(key) ||
              key.includes(normalizedProductName)
            ) {
              matchedProduct = prod;
              break;
            }
          }
        }
        return {
          ...p,
          productType: matchedProduct?.type || p?.type || "",
          productPacking: matchedProduct?.packing || "",
          productQtyPerBoxStrip: matchedProduct?.qtyPerBoxStrip || 0,
          sellingPrice: p.sellingPrice || matchedProduct?.sellingPrice || 0,
          fob: p.fob || matchedProduct?.batches?.[0]?.fob || 0,
          cif: p.cif || matchedProduct?.batches?.[0]?.cif || 0,
          lc: p.lc || matchedProduct?.batches?.[0]?.lc || 0,
        };
      }),
    }));

    res.json({
      success: true,
      count: enhancedPurchases.length,
      purchases: enhancedPurchases,
    });
  } catch (err) {
    console.error("Error fetching purchases:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    if (
      !data.invoiceNumber ||
      !data.supplierName ||
      !Array.isArray(data.products)
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existing = await purchaseInventory.findOne({
      invoiceNumber: data.invoiceNumber,
    });
    if (existing) {
      return res
        .status(400)
        .json({
          success: false,
          message: `Invoice '${data.invoiceNumber}' already exists.`,
        });
    }

    let totalAmount = 0;
    const productIds = data.products.map((p) => p.productId).filter((id) => id);
    const productsInfo = await Product.find(
      { _id: { $in: productIds } },
      "productName type batches sellingPrice",
    ).lean();

    const productTypeMap = new Map();
    const productBatchMap = new Map();
    const productNameMap = new Map();
    const productSellingPriceMap = new Map();

    productsInfo.forEach((p) => {
      if (p._id) {
        productTypeMap.set(p._id.toString(), p.type || "");
        if (p.batches && p.batches.length > 0) {
          productBatchMap.set(p._id.toString(), p.batches[0]);
        }
        productNameMap.set(p._id.toString(), p.productName);
        productSellingPriceMap.set(p._id.toString(), p.sellingPrice || 0);
      }
    });

    const products = await Promise.all(
      data.products.map(async (p) => {
        const qty = Number(p.quantityPerBoxStrip || 0);
        const productBatch = productBatchMap.get(p.productId);
        const lc = Number(p.lc) || productBatch?.lc || 0;
        const fob = Number(p.fob) || productBatch?.fob || 0;
        const cif = Number(p.cif) || productBatch?.cif || 0;
        const amount = qty * lc;
        totalAmount += amount;

        let productNameToUse = p.productName;
        if (p.productId && productNameMap.has(p.productId.toString())) {
          productNameToUse = productNameMap.get(p.productId.toString());
        }
        productNameToUse = await getStandardizedProductName(productNameToUse);

        const sellingPrice =
          p.sellingPrice ||
          (p.productId && productSellingPriceMap.get(p.productId.toString())) ||
          0;

        return {
          productName: productNameToUse,
          type: p.type || productTypeMap.get(p.productId) || "",
          expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
          quantityPerBoxStrip: qty,
          lc,
          fob,
          cif,
          amount,
          sellingPrice,
        };
      }),
    );

    const invoice = await purchaseInventory.create({
      ...data,
      supplierName: data.supplierName.trim(),
      products,
      totalAmount,
    });

    for (const p of products) {
      await updateReportInHand(
        {
          productName: p.productName,
          supplierName: data.supplierName,
          quantityPerBoxStrip: p.quantityPerBoxStrip,
          lc: p.lc,
          fob: p.fob,
          cif: p.cif,
          expiryDate: p.expiryDate,
          type: p.type,
          sellingPrice: p.sellingPrice,
        },
        "add",
      );
    }

    res
      .status(201)
      .json({ success: true, message: "Purchase added", purchase: invoice });
  } catch (err) {
    console.error("Add error:", err);
    if (err.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "This invoice number already exists.",
        });
    }
    res.status(500).json({ message: "Server error" });
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────
router.put("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const oldInvoice = await purchaseInventory.findById(id).lean();
    if (!oldInvoice) return res.status(404).json({ message: "Not found" });

    // Step 1: Subtract old product stock
    for (const oldProduct of oldInvoice.products || []) {
      await updateReportInHand(
        {
          productName: oldProduct.productName || "",
          supplierName: oldInvoice.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: oldProduct.quantityPerBoxStrip || 0,
          lc: oldProduct.lc || 0,
          fob: oldProduct.fob || 0,
          cif: oldProduct.cif || 0,
          expiryDate: oldProduct.expiryDate,
          type: oldProduct.type || "",
          sellingPrice: oldProduct.sellingPrice || 0,
        },
        "subtract",
      );
    }

    // Step 2: Process new products
    const newProducts = req.body.products || [];
    let totalAmount = 0;
    const productIds = newProducts.map((p) => p.productId).filter((id) => id);
    const productsInfo = await Product.find(
      { _id: { $in: productIds } },
      "productName type batches sellingPrice",
    ).lean();

    const productTypeMap = new Map();
    const productBatchMap = new Map();
    const productNameMap = new Map();
    const productSellingPriceMap = new Map();

    productsInfo.forEach((p) => {
      if (p._id) {
        productTypeMap.set(p._id.toString(), p.type || "");
        if (p.batches && p.batches.length > 0) {
          productBatchMap.set(p._id.toString(), p.batches[0]);
        }
        productNameMap.set(p._id.toString(), p.productName);
        productSellingPriceMap.set(p._id.toString(), p.sellingPrice || 0);
      }
    });

    const processedProducts = await Promise.all(
      newProducts.map(async (p) => {
        const qty = Number(p.quantityPerBoxStrip || 0);
        const productBatch = productBatchMap.get(p.productId);
        const lc = Number(p.lc) || productBatch?.lc || 0;
        const fob = Number(p.fob) || productBatch?.fob || 0;
        const cif = Number(p.cif) || productBatch?.cif || 0;
        const amount = qty * lc;
        totalAmount += amount;

        let productNameToUse = p.productName;
        if (p.productId && productNameMap.has(p.productId.toString())) {
          productNameToUse = productNameMap.get(p.productId.toString());
        }
        productNameToUse = await getStandardizedProductName(productNameToUse);

        const sellingPrice =
          p.sellingPrice ||
          (p.productId && productSellingPriceMap.get(p.productId.toString())) ||
          0;

        return {
          productName: productNameToUse,
          type: p.type || productTypeMap.get(p.productId) || "",
          expiryDate: p.expiryDate ? new Date(p.expiryDate) : null,
          quantityPerBoxStrip: qty,
          lc,
          fob,
          cif,
          amount,
          sellingPrice,
        };
      }),
    );

    const updated = await purchaseInventory.findByIdAndUpdate(
      id,
      { ...req.body, products: processedProducts, totalAmount },
      { new: true, runValidators: true, lean: true },
    );

    if (!updated)
      return res
        .status(404)
        .json({ message: "Invoice not found after update" });

    // Step 3: Add new product stock
    for (const newProduct of processedProducts) {
      await updateReportInHand(
        {
          productName: newProduct.productName || "",
          supplierName: updated.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: newProduct.quantityPerBoxStrip || 0,
          lc: newProduct.lc || 0,
          fob: newProduct.fob || 0,
          cif: newProduct.cif || 0,
          expiryDate: newProduct.expiryDate,
          type: newProduct.type || "",
          sellingPrice: newProduct.sellingPrice || 0,
        },
        "add",
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete("/:id", protect, allowAdminOnly, async (req, res) => {
  try {
    const invoice = await purchaseInventory.findById(req.params.id).lean();
    if (!invoice) return res.status(404).json({ error: "Not found" });

    for (const p of invoice.products || []) {
      await updateReportInHand(
        {
          productName: p.productName || "",
          supplierName: invoice.supplierName || "Unknown Supplier",
          quantityPerBoxStrip: p.quantityPerBoxStrip || 0,
          lc: p.lc || 0,
          fob: p.fob || 0,
          cif: p.cif || 0,
          expiryDate: p.expiryDate,
          type: p.type || "",
          sellingPrice: p.sellingPrice || 0,
        },
        "subtract",
      );
    }

    await purchaseInventory.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("Delete purchase error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── DELETE / (bulk) ───────────────────────────────────────────────────────────
router.delete("/", protect, allowAdminOnly, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No purchase IDs provided" });
    }

    const invoices = await purchaseInventory.find({ _id: { $in: ids } }).lean();
    if (invoices.length === 0)
      return res.status(404).json({ error: "No purchases found" });

    for (const inv of invoices) {
      for (const p of inv.products || []) {
        await updateReportInHand(
          {
            productName: p.productName || "",
            supplierName: inv.supplierName || "Unknown Supplier",
            quantityPerBoxStrip: p.quantityPerBoxStrip || 0,
            lc: p.lc || 0,
            fob: p.fob || 0,
            cif: p.cif || 0,
            expiryDate: p.expiryDate,
            type: p.type || "",
            sellingPrice: p.sellingPrice || 0,
          },
          "subtract",
        );
      }
    }

    const result = await purchaseInventory.deleteMany({ _id: { $in: ids } });
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} invoices successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Delete multiple purchases error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Merge decimal variations ──────────────────────────────────────────────────
router.post("/reports-in-hand/merge-decimal-variations", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();
    let mergedCount = 0;
    const errors = [];

    const productGroups = {};
    for (const report of allReports) {
      const normalizedName = normalizeProductName(report.productName);
      if (!productGroups[normalizedName]) productGroups[normalizedName] = [];
      productGroups[normalizedName].push(report);
    }

    for (const [normalizedName, reports] of Object.entries(productGroups)) {
      if (reports.length > 1) {
        try {
          reports.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          const mainReport = reports[0];
          const otherReports = reports.slice(1);

          let allBatches = [...(mainReport.batches || [])];
          for (const other of otherReports) {
            allBatches = [...allBatches, ...(other.batches || [])];
          }

          const uniqueBatches = [];
          const seenBatches = new Set();
          for (const batch of allBatches) {
            const batchExpiry = batch.expiryDate
              ? new Date(batch.expiryDate).getTime()
              : null;
            const batchKey = `${batch.boxes}|${batch.lc}|${batch.fob}|${batch.cif}|${batchExpiry}`;
            if (!seenBatches.has(batchKey)) {
              seenBatches.add(batchKey);
              uniqueBatches.push(batch);
            }
          }

          const { totalBoxesFromBatches, totalAmount, averagePrice } =
            calculateTotalsFromBatches(uniqueBatches);
          const addStockAdjustment = reports.reduce(
            (sum, r) => sum + (r.addStockAdjustment || 0),
            0,
          );
          const removeStockAdjustment = reports.reduce(
            (sum, r) => sum + (r.removeStockAdjustment || 0),
            0,
          );
          const totalBoxes =
            totalBoxesFromBatches + addStockAdjustment - removeStockAdjustment;

          await ReportInHand.updateOne(
            { _id: mainReport._id },
            {
              $set: {
                productName: normalizedName,
                batches: uniqueBatches,
                totalBoxesFromBatches,
                totalBoxes,
                totalAmount,
                averagePrice,
                addStockAdjustment,
                removeStockAdjustment,
                status: calculateStockStatus(totalBoxes),
                updatedAt: new Date(),
              },
            },
          );

          const otherIds = otherReports.map((r) => r._id);
          if (otherIds.length > 0)
            await ReportInHand.deleteMany({ _id: { $in: otherIds } });
          mergedCount += otherReports.length;
        } catch (error) {
          errors.push({ normalizedName, error: error.message });
        }
      }
    }

    res.json({
      success: true,
      message: `Merged ${mergedCount} product variations`,
      mergedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Merge decimal variations error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to merge decimal variations",
        error: error.message,
      });
  }
});

// ── Import ────────────────────────────────────────────────────────────────────
router.post("/import", async (req, res) => {
  try {
    const rows = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "Invalid or empty data" });
    }

    const allProducts = await Product.find(
      {},
      "productName type batches sellingPrice",
    ).lean();
    const skipped = [];
    const importedInvoices = [];

    for (const invoiceData of rows) {
      try {
        const processedProducts = await Promise.all(
          invoiceData.products.map(async (product) => {
            const quantityPerBoxStrip =
              parseFloat(product.quantityPerBoxStrip) || 0;
            let lc =
              parseFloat(product.lc) || parseFloat(product.lcNumber) || 0;
            let fob = parseFloat(product.fob) || 0;
            let cif = parseFloat(product.cif) || 0;
            let sellingPrice = parseFloat(product.sellingPrice) || 0;

            const standardizedName = await getStandardizedProductName(
              product.productName,
            );
            const normalizedSearch = normalizeProductName(standardizedName);
            let productInfo = null;

            for (const prod of allProducts) {
              if (
                prod.productName &&
                normalizeProductName(prod.productName) === normalizedSearch
              ) {
                productInfo = prod;
                break;
              }
            }

            let productNameToUse = standardizedName;
            if (productInfo) {
              productNameToUse = await getStandardizedProductName(
                productInfo.productName,
              );
              if (fob === 0) fob = productInfo.batches?.[0]?.fob || 0;
              if (cif === 0) cif = productInfo.batches?.[0]?.cif || 0;
              if (lc === 0) lc = productInfo.batches?.[0]?.lc || 0;
              if (sellingPrice === 0)
                sellingPrice = productInfo.sellingPrice || 0;
            }

            const expiryDate = product.expiryDate
              ? new Date(product.expiryDate)
              : null;
            const amount = quantityPerBoxStrip * lc;

            return {
              productName: productNameToUse,
              type: product.type || productInfo?.type || "",
              expiryDate,
              quantityPerBoxStrip,
              lc,
              fob,
              cif,
              amount,
              sellingPrice,
            };
          }),
        );

        const totalAmount = processedProducts.reduce(
          (sum, p) => sum + (p.amount || 0),
          0,
        );

        const invoice = await purchaseInventory.create({
          invoiceNumber: invoiceData.invoiceNumber,
          invoiceDate: invoiceData.invoiceDate
            ? new Date(invoiceData.invoiceDate)
            : null,
          deliveryNumber: invoiceData.deliveryNumber,
          receivedDate: invoiceData.receivedDate
            ? new Date(invoiceData.receivedDate)
            : null,
          supplierName: invoiceData.supplierName,
          remarks: invoiceData.remarks,
          products: processedProducts,
          totalAmount,
        });

        for (const p of processedProducts) {
          await updateReportInHand(
            {
              productName: p.productName,
              supplierName: invoiceData.supplierName,
              quantityPerBoxStrip: p.quantityPerBoxStrip,
              lc: p.lc,
              fob: p.fob,
              cif: p.cif,
              expiryDate: p.expiryDate,
              type: p.type,
              sellingPrice: p.sellingPrice,
            },
            "add",
          );
        }

        importedInvoices.push(invoice);
      } catch (err) {
        console.error(
          `Error processing invoice ${invoiceData.invoiceNumber}:`,
          err,
        );
        skipped.push(invoiceData.invoiceNumber || "Unknown");
      }
    }

    res.json({
      message: `Imported ${importedInvoices.length} invoices successfully`,
      importedCount: importedInvoices.length,
      skippedInvoices: skipped,
    });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ── Cleanup names ─────────────────────────────────────────────────────────────
router.post("/reports-in-hand/cleanup-names", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();
    let updatedCount = 0;
    const errors = [];

    for (const report of allReports) {
      try {
        const standardizedName = await getStandardizedProductName(
          report.productName,
        );
        if (standardizedName !== report.productName) {
          const existingWithNewName = await ReportInHand.findOne({
            productName: { $regex: new RegExp(`^${standardizedName}$`, "i") },
            _id: { $ne: report._id },
          }).lean();

          if (existingWithNewName) {
            const mergedBatches = [
              ...(existingWithNewName.batches || []),
              ...(report.batches || []),
            ];
            const totalBoxes = mergedBatches.reduce(
              (sum, b) => sum + (b.boxes || 0),
              0,
            );
            const totalAmount = mergedBatches.reduce(
              (sum, b) => sum + (b.amount || 0),
              0,
            );
            const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

            await ReportInHand.updateOne(
              { _id: existingWithNewName._id },
              {
                $set: {
                  batches: mergedBatches,
                  totalBoxes,
                  totalAmount,
                  averagePrice,
                  status: calculateStockStatus(totalBoxes),
                },
              },
            );
            await ReportInHand.findByIdAndDelete(report._id);
          } else {
            await ReportInHand.updateOne(
              { _id: report._id },
              { $set: { productName: standardizedName } },
            );
          }
          updatedCount++;
        }
      } catch (error) {
        errors.push({
          reportId: report._id,
          productName: report.productName,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${updatedCount} product names`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to cleanup product names",
        error: error.message,
      });
  }
});

// ── Debug: product name standardization ──────────────────────────────────────
router.get("/debug/product-name-standardization", async (req, res) => {
  try {
    const testNames = [
      "ECOVASTIN 20",
      "ecovastin 20",
      "ECOVASTIN20",
      "ecovastin-20",
      "Ecovastin 20",
      "ecovastin  20",
      "SIRMOX CL 2285 SYP",
      "sirmox cl 228.5 syp",
      "ALU ALU ECOCID 20",
      "alualu ecocid 20",
      "N-LYCOPENE + WHEATGERM OIL",
      "n lycopene + wheatgerm oil",
    ];

    const results = await Promise.all(
      testNames.map(async (name) => {
        const normalized = normalizeProductName(name);
        const standardized = await getStandardizedProductName(name);
        const productMap = await getProductMappingFromDatabase();
        return {
          input: name,
          normalized,
          standardized,
          inDatabaseMap: !!productMap[normalized],
        };
      }),
    );

    const reportInHandEntries = await ReportInHand.find({})
      .select("productName totalBoxes sellingPrice")
      .limit(20)
      .lean();

    const standardizedReports = await Promise.all(
      reportInHandEntries.map(async (r) => ({
        productName: r.productName,
        standardized: await getStandardizedProductName(r.productName),
        totalBoxes: r.totalBoxes,
        sellingPrice: r.sellingPrice,
      })),
    );

    res.json({
      testResults: results,
      sampleReportInHandEntries: standardizedReports,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Search reports-in-hand ────────────────────────────────────────────────────
router.get("/reports-in-hand/search", async (req, res) => {
  try {
    const { query } = req.query;
    if (!query)
      return res.status(400).json({ error: "Query parameter required" });

    const standardizedQuery = await getStandardizedProductName(query);
    const results = await ReportInHand.find({
      $or: [
        { productName: { $regex: query, $options: "i" } },
        { productName: { $regex: standardizedQuery, $options: "i" } },
      ],
    }).lean();

    res.json({
      success: true,
      query,
      standardizedQuery,
      count: results.length,
      results: results.map((r) => ({
        id: r._id,
        productName: r.productName,
        totalBoxes: r.totalBoxes,
        totalAmount: r.totalAmount,
        status: r.status,
        sellingPrice: r.sellingPrice,
      })),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Standardize name for one product ─────────────────────────────────────────
router.put("/reports-in-hand/:id/standardize-name", async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ReportInHand.findById(id).lean();
    if (!report) return res.status(404).json({ error: "Report not found" });

    const oldName = report.productName;
    const newName = await getStandardizedProductName(oldName);

    if (oldName === newName) {
      return res.json({
        success: true,
        message: "Product name already standardized",
        oldName,
        newName,
      });
    }

    const existingWithNewName = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${newName}$`, "i") },
      _id: { $ne: id },
    }).lean();

    if (existingWithNewName) {
      const mergedBatches = [
        ...(existingWithNewName.batches || []),
        ...(report.batches || []),
      ];
      const totalBoxes = mergedBatches.reduce(
        (sum, b) => sum + (b.boxes || 0),
        0,
      );
      const totalAmount = mergedBatches.reduce(
        (sum, b) => sum + (b.amount || 0),
        0,
      );
      const averagePrice = totalBoxes > 0 ? totalAmount / totalBoxes : 0;

      await ReportInHand.updateOne(
        { _id: existingWithNewName._id },
        {
          $set: {
            batches: mergedBatches,
            totalBoxes,
            totalAmount,
            averagePrice,
            status: calculateStockStatus(totalBoxes),
          },
        },
      );
      await ReportInHand.findByIdAndDelete(id);

      return res.json({
        success: true,
        message: "Product merged with existing entry",
        oldName,
        newName,
        mergedInto: existingWithNewName._id,
        totalBoxesAfterMerge: totalBoxes,
      });
    } else {
      await ReportInHand.updateOne(
        { _id: id },
        { $set: { productName: newName } },
      );
      return res.json({
        success: true,
        message: "Product name standardized",
        oldName,
        newName,
      });
    }
  } catch (error) {
    console.error("Standardize name error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /reports-in-hand ──────────────────────────────────────────────────────
router.get("/reports-in-hand", async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { productName: { $regex: search, $options: "i" } }
      : {};
    const allReports = await ReportInHand.find(query).sort({ createdAt: -1 });
    const filteredReports = filterReportsWithBatches(allReports);

    const inStockCount = filteredReports.filter(
      (r) => r.status === "In Stock",
    ).length;
    const lowStockCount = filteredReports.filter(
      (r) => r.status === "Low Stock",
    ).length;
    const criticalCount = filteredReports.filter(
      (r) => r.status === "Critical",
    ).length;
    const outOfStockCount = filteredReports.filter(
      (r) => r.status === "Out of Stock",
    ).length;
    const totalBoxesSum = filteredReports.reduce(
      (sum, r) => sum + (r.totalBoxes || 0),
      0,
    );

    res.status(200).json({
      success: true,
      count: filteredReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      inStockCount,
      lowStockCount,
      criticalCount,
      outOfStockCount,
      reports: filteredReports,
    });
  } catch (error) {
    console.error("Error fetching stock in hands:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch reports",
        error: error.message,
      });
  }
});

// ── Adjust stock ──────────────────────────────────────────────────────────────
router.put("/reports-in-hand/:id/adjust-stock", async (req, res) => {
  try {
    const { id } = req.params;
    const { addStockAdjustment, removeStockAdjustment } = req.body;

    const report = await ReportInHand.findById(id).lean();
    if (!report) return res.status(404).json({ error: "Report not found" });

    const { totalBoxesFromBatches } = calculateTotalsFromBatches(
      report.batches || [],
    );
    const newAddAdjustment = Number(addStockAdjustment) || 0;
    const newRemoveAdjustment = Number(removeStockAdjustment) || 0;
    const totalBoxes =
      totalBoxesFromBatches + newAddAdjustment - newRemoveAdjustment;

    await ReportInHand.updateOne(
      { _id: id },
      {
        $set: {
          addStockAdjustment: newAddAdjustment,
          removeStockAdjustment: newRemoveAdjustment,
          totalBoxes,
          status: calculateStockStatus(totalBoxes),
          updatedAt: new Date(),
        },
      },
    );

    const updatedReport = await ReportInHand.findById(id).lean();
    res.json({
      success: true,
      message: "Stock adjustments updated",
      report: {
        ...updatedReport,
        totalBoxesFromBatches,
        calculatedTotalBoxes: totalBoxes,
      },
    });
  } catch (error) {
    console.error("Adjust stock error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Fix totals ────────────────────────────────────────────────────────────────
router.post("/reports-in-hand/fix-totals", async (req, res) => {
  try {
    const allReports = await ReportInHand.find({}).lean();
    let fixedCount = 0;
    const errors = [];

    for (const report of allReports) {
      try {
        const batches = report.batches || [];
        const { totalBoxesFromBatches, totalAmount, averagePrice } =
          calculateTotalsFromBatches(batches);
        const totalBoxes =
          totalBoxesFromBatches +
          (report.addStockAdjustment || 0) -
          (report.removeStockAdjustment || 0);

        const needsUpdate =
          Math.abs(
            totalBoxesFromBatches - (report.totalBoxesFromBatches || 0),
          ) > 0.01 ||
          Math.abs(totalBoxes - (report.totalBoxes || 0)) > 0.01 ||
          Math.abs(totalAmount - (report.totalAmount || 0)) > 0.01;

        if (needsUpdate) {
          await ReportInHand.updateOne(
            { _id: report._id },
            {
              $set: {
                totalBoxesFromBatches,
                totalBoxes,
                totalAmount,
                averagePrice,
                status: calculateStockStatus(totalBoxes),
                updatedAt: new Date(),
              },
            },
          );
          fixedCount++;
        }
      } catch (error) {
        errors.push({
          reportId: report._id,
          productName: report.productName,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Fixed totals for ${fixedCount} products`,
      fixedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Fix totals error:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fix product totals",
        error: error.message,
      });
  }
});

// ── Download Excel (purchase) ─────────────────────────────────────────────────
router.post("/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    let query = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.invoiceDate = { $gte: start, $lte: end };
    }

    const purchases = await purchaseInventory.find(query).lean();
    if (purchases.length === 0) {
      return res.status(200).json({
        success: false,
        message:
          startDate && endDate
            ? "No purchases found for selected date range"
            : "No purchases found in inventory",
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Purchases");
    const header = [
      "Invoice Number",
      "Invoice Date",
      "Delivery No.",
      "Received Date",
      "Product Name",
      "Product Type",
      "Supplier Name",
      "Expiry Date",
      "Quantity Per Box/Strip",
      "FOB (USD)",
      "CIF (USD)",
      "LC (USD)",
      "Selling Price (USD)",
      "Amount",
      "Remarks",
    ];
    const headerRow = worksheet.addRow(header);
    headerRow.font = { bold: true };
    worksheet.columns = [
      { width: 18 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 22 },
      { width: 15 },
      { width: 25 },
      { width: 15 },
      { width: 20 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 15 },
      { width: 15 },
      { width: 20 },
    ];

    purchases.forEach((purchase) => {
      (purchase.products || []).forEach((product) => {
        const quantity = Number(product.quantityPerBoxStrip) || 0;
        const lc = Number(product.lc) || 0;
        const amount = product.amount || quantity * lc;
        worksheet.addRow([
          purchase.invoiceNumber || "",
          purchase.invoiceDate
            ? dayjs(purchase.invoiceDate).format("DD/MM/YYYY")
            : "",
          purchase.deliveryNumber || "",
          purchase.receivedDate
            ? dayjs(purchase.receivedDate).format("DD/MM/YYYY")
            : "",
          product.productName || "",
          product.type || "",
          purchase.supplierName || "",
          product.expiryDate
            ? dayjs(product.expiryDate).format("DD/MM/YYYY")
            : "",
          quantity,
          product.fob || 0,
          product.cif || 0,
          lc,
          product.sellingPrice || 0,
          amount,
          purchase.remarks || "",
        ]);
      });
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
      });
    });

    const fileName =
      startDate && endDate
        ? `purchase_summary_${dayjs(startDate).format("DD-MM-YYYY")}_to_${dayjs(endDate).format("DD-MM-YYYY")}.xlsx`
        : `purchase_summary_all_${dayjs().format("DD-MM-YYYY")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
  } catch (error) {
    console.error("Error in purchase download-excel:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to generate purchase excel file",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
        timestamp: new Date().toISOString(),
      });
  }
});

// ── Download Excel (reports-in-hand) ─────────────────────────────────────────
router.post("/reports-in-hand/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const reports = await ReportInHand.find({}).lean();
    const filteredReports = reports.filter(
      (r) => Array.isArray(r.batches) && r.batches.length > 0,
    );

    let finalData = [];
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      filteredReports.forEach((report) => {
        const filteredBatches = report.batches.filter((batch) => {
          const batchDate = new Date(batch.date);
          return batchDate >= start && batchDate <= end;
        });
        if (filteredBatches.length > 0) {
          const totalBoxes = filteredBatches.reduce(
            (sum, b) => sum + b.boxes,
            0,
          );
          const totalAmount = filteredBatches.reduce(
            (sum, b) => sum + b.amount,
            0,
          );
          filteredBatches.forEach((batch) => {
            finalData.push({
              ...report,
              batchData: batch,
              filteredTotalBoxes: totalBoxes,
              filteredTotalAmount: totalAmount,
              filteredStatus: calculateStockStatus(totalBoxes),
            });
          });
        }
      });
    } else {
      filteredReports.forEach((report) => {
        report.batches.forEach((batch) => {
          finalData.push({
            ...report,
            batchData: batch,
            filteredTotalBoxes: report.totalBoxes,
            filteredTotalAmount: report.totalAmount,
            filteredStatus: report.status,
          });
        });
      });
    }

    if (finalData.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "No reports found for selected criteria",
        });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("stock in hands");
    const headers = [
      "Product Name",
      "Supplier Name",
      "Type",
      "Batch Date",
      "Expiry Date",
      "Boxes in Batch",
      "LC (USD per box)",
      "FOB (USD per box)",
      "CIF (USD per box)",
      "Selling Price (USD)",
      "Batch Amount (USD)",
      "Total Boxes (Product)",
      "Total Amount (Product)",
      "Stock Status",
    ];
    const headerRow = worksheet.addRow(headers);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    worksheet.columns = [
      { width: 25 },
      { width: 25 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
      { width: 20 },
      { width: 15 },
    ];

    finalData.forEach((item) => {
      const row = worksheet.addRow([
        item.productName,
        item.supplierName,
        item.type || "",
        item.batchData.date
          ? dayjs(item.batchData.date).format("DD/MM/YYYY")
          : "",
        item.batchData.expiryDate
          ? dayjs(item.batchData.expiryDate).format("DD/MM/YYYY")
          : "",
        item.batchData.boxes,
        item.batchData.lc,
        item.batchData.fob,
        item.batchData.cif,
        item.batchData.sellingPrice || item.sellingPrice || 0,
        item.batchData.amount,
        item.filteredTotalBoxes,
        item.filteredTotalAmount,
        item.filteredStatus,
      ]);

      const statusColors = {
        "Out of Stock": "FFCCCC",
        Critical: "FFE5CC",
        "Low Stock": "FFFFCC",
        "In Stock": "CCFFCC",
      };
      const statusCell = row.getCell(14);
      statusCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: statusColors[item.filteredStatus] || "FFFFFF" },
      };
    });

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
          bottom: { style: "thin" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });

    const numberCols = [6, 7, 8, 9, 10, 11, 12, 13];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        numberCols.forEach((col) => {
          row.getCell(col).numFmt = "#,##0.00";
        });
      }
    });

    const totalRow = worksheet.addRow([]);
    totalRow.getCell(1).value = "TOTAL";
    totalRow.getCell(1).font = { bold: true };
    totalRow.getCell(6).value = finalData.reduce(
      (sum, item) => sum + item.batchData.boxes,
      0,
    );
    totalRow.getCell(11).value = finalData.reduce(
      (sum, item) => sum + item.batchData.amount,
      0,
    );
    totalRow.getCell(11).numFmt = "#,##0.00";
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFDDEBF7" },
    };

    const fileName =
      "reports_in_hand" +
      (startDate && endDate
        ? `_${dayjs(startDate).format("DD-MM-YYYY")}_to_${dayjs(endDate).format("DD-MM-YYYY")}`
        : `_${dayjs().format("DD-MM-YYYY")}`) +
      ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating stock in hands Excel:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to generate reports excel file",
        error: error.message,
      });
  }
});

// ── Debug: purchase product match ─────────────────────────────────────────────
router.get("/debug/purchase-product-match/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const normalized = normalizeProductName(productName);
    const standardized = await getStandardizedProductName(productName);

    const productMatches = await Product.find({
      $or: [
        { productName: { $regex: productName, $options: "i" } },
        { productName: { $regex: standardized, $options: "i" } },
      ],
    }).lean();

    const reportInHandMatches = await ReportInHand.find({
      $or: [
        { productName: { $regex: productName, $options: "i" } },
        { productName: { $regex: standardized, $options: "i" } },
      ],
    }).lean();

    res.json({
      searchTerm: productName,
      normalizedTerm: normalized,
      standardizedTerm: standardized,
      productMatches: productMatches.map((p) => ({
        id: p._id,
        productName: p.productName,
        type: p.type,
        sellingPrice: p.sellingPrice,
        batches: p.batches,
      })),
      reportInHandMatches: reportInHandMatches.map((p) => ({
        id: p._id,
        productName: p.productName,
        totalBoxes:
          p.totalBoxes ||
          p.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) ||
          0,
        supplierName: p.supplierName,
        sellingPrice: p.sellingPrice,
      })),
    });
  } catch (error) {
    console.error("Purchase debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ── Check ─────────────────────────────────────────────────────────────────────
router.get("/check", async (req, res) => {
  try {
    const count = await purchaseInventory.countDocuments();
    res
      .status(200)
      .json({
        success: true,
        exists: count > 0,
        count,
        message:
          count > 0
            ? "Purchase inventories found"
            : "No purchase inventories found",
      });
  } catch (error) {
    console.error("Error checking purchase inventories:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Error checking purchase inventories",
        error: error.message,
      });
  }
});

// ── Download ALL Excel ────────────────────────────────────────────────────────
router.get("/download-all-excel", async (req, res) => {
  try {
    const purchases = await purchaseInventory
      .find()
      .sort({ invoiceDate: -1 })
      .lean();
    if (!purchases || purchases.length === 0) {
      return res
        .status(404)
        .json({
          success: false,
          message: "No purchase records found to download",
        });
    }

    const rows = [];
    purchases.forEach((invoice) => {
      const products = Array.isArray(invoice.products) ? invoice.products : [];
      if (products.length === 0) {
        rows.push({
          invoiceNumber: invoice.invoiceNumber || "",
          invoiceDate: invoice.invoiceDate || null,
          deliveryNumber: invoice.deliveryNumber || "",
          receivedDate: invoice.receivedDate || null,
          productName: "",
          supplierName: invoice.supplierName || "",
          expiryDate: null,
          quantityPerBoxStrip: 0,
          fob: 0,
          cif: 0,
          lc: 0,
          sellingPrice: 0,
          remarks: invoice.remarks || "",
        });
      } else {
        products.forEach((product) => {
          rows.push({
            invoiceNumber: invoice.invoiceNumber || "",
            invoiceDate: invoice.invoiceDate || null,
            deliveryNumber: invoice.deliveryNumber || "",
            receivedDate: invoice.receivedDate || null,
            productName: product.productName || "",
            supplierName: invoice.supplierName || "",
            expiryDate: product.expiryDate || null,
            quantityPerBoxStrip: Number(product.quantityPerBoxStrip) || 0,
            fob: Number(product.fob) || 0,
            cif: Number(product.cif) || 0,
            lc: Number(product.lc) || 0,
            sellingPrice: Number(product.sellingPrice) || 0,
            remarks: invoice.remarks || "",
          });
        });
      }
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Healthcare South East Asia";
    workbook.created = new Date();
    const ws = workbook.addWorksheet("Purchase Inventory");

    ws.columns = [
      { key: "invoiceNumber", width: 25 },
      { key: "invoiceDate", width: 20 },
      { key: "deliveryNumber", width: 20 },
      { key: "receivedDate", width: 20 },
      { key: "productName", width: 30 },
      { key: "supplierName", width: 25 },
      { key: "expiryDate", width: 20 },
      { key: "quantityPerBoxStrip", width: 25 },
      { key: "fob", width: 15 },
      { key: "cif", width: 15 },
      { key: "lc", width: 20 },
      { key: "sellingPrice", width: 18 },
      { key: "remarks", width: 30 },
    ];

    ws.mergeCells("A1:M1");
    const companyCell = ws.getCell("A1");
    companyCell.value = "HEALTHCARE SOUTH EAST ASIA";
    companyCell.font = { bold: true, size: 16, name: "Arial" };
    companyCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 21;

    ws.mergeCells("A2:M2");
    const titleCell = ws.getCell("A2");
    titleCell.value = "Purchase Inventory Summary";
    titleCell.font = { bold: true, size: 14, name: "Arial" };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(2).height = 18.75;
    ws.getRow(3).height = 10;

    const headers = [
      "Invoice Number",
      "Invoice Date",
      "Delivery No.",
      "Received Date",
      "Product Name",
      "Supplier Name",
      "Expiry Date",
      "Quantity per Box/Strip",
      "FOB (USD)",
      "CIF (USD)",
      "LC (USD)",
      "Selling Price (USD)",
      "Remarks",
    ];
    const headerRow = ws.getRow(4);
    headerRow.height = 22;
    const headerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    const headerBorder = {
      top: { style: "thin", color: { argb: "FF4472C4" } },
      bottom: { style: "thin", color: { argb: "FF4472C4" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    };

    headers.forEach((header, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = header;
      cell.font = {
        bold: true,
        size: 11,
        name: "Arial",
        color: { argb: "FF1F3864" },
      };
      cell.fill = headerFill;
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = headerBorder;
    });

    const dateBorder = {
      top: { style: "thin", color: { argb: "FFD9D9D9" } },
      bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    };
    const fillEven = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF2F7FF" },
    };
    const fillOdd = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFFFF" },
    };

    const invoiceColorMap = {};
    let invoiceColorIndex = 0;
    rows.forEach((r) => {
      const key = r.invoiceNumber || "unknown";
      if (!(key in invoiceColorMap)) {
        invoiceColorMap[key] = invoiceColorIndex % 2 === 0 ? fillOdd : fillEven;
        invoiceColorIndex++;
      }
    });

    const formatDate = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    rows.forEach((rowData, i) => {
      const excelRowNum = i + 5;
      const dataRow = ws.getRow(excelRowNum);
      const rowFill =
        invoiceColorMap[rowData.invoiceNumber || "unknown"] || fillOdd;

      const values = [
        rowData.invoiceNumber,
        formatDate(rowData.invoiceDate),
        rowData.deliveryNumber,
        formatDate(rowData.receivedDate),
        rowData.productName,
        rowData.supplierName,
        formatDate(rowData.expiryDate),
        rowData.quantityPerBoxStrip,
        rowData.fob,
        rowData.cif,
        rowData.lc,
        rowData.sellingPrice,
        rowData.remarks,
      ];

      values.forEach((val, colIdx) => {
        const cell = dataRow.getCell(colIdx + 1);
        cell.value = val;
        cell.font = { name: "Arial", size: 11 };
        cell.fill = rowFill;
        cell.border = dateBorder;
        const colNum = colIdx + 1;
        if (colNum === 2 || colNum === 4 || colNum === 7) {
          cell.numFmt = "DD/MM/YYYY";
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (colNum === 8) {
          cell.numFmt = "#,##0";
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (
          colNum === 9 ||
          colNum === 10 ||
          colNum === 11 ||
          colNum === 12
        ) {
          cell.numFmt = "#,##0.00000";
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else if (colNum === 1 || colNum === 3) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment = {
            horizontal: "left",
            vertical: "middle",
            wrapText: false,
          };
        }
      });
      dataRow.height = 18;
    });

    const footerRowNum = rows.length + 5;
    const footerRow = ws.getRow(footerRowNum);
    const footerFill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };
    const footerBorder = {
      top: { style: "medium", color: { argb: "FF4472C4" } },
      bottom: { style: "medium", color: { argb: "FF4472C4" } },
      left: { style: "thin", color: { argb: "FFD9D9D9" } },
      right: { style: "thin", color: { argb: "FFD9D9D9" } },
    };
    const totalQty = rows.reduce((s, r) => s + (r.quantityPerBoxStrip || 0), 0);
    const footerLabels = [
      "TOTAL",
      "",
      "",
      "",
      `${rows.length} Products`,
      `${purchases.length} Invoices`,
      "",
      totalQty,
      "",
      "",
      "",
      "",
      "",
    ];

    footerLabels.forEach((val, colIdx) => {
      const cell = footerRow.getCell(colIdx + 1);
      cell.value = val;
      cell.font = {
        bold: true,
        size: 11,
        name: "Arial",
        color: { argb: "FF1F3864" },
      };
      cell.fill = footerFill;
      cell.border = footerBorder;
      if (colIdx + 1 === 8) {
        cell.numFmt = "#,##0";
      }
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    footerRow.height = 20;

    ws.views = [{ state: "frozen", xSplit: 0, ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 13 } };

    const today = dayjs().format("DD-MM-YYYY");
    const fileName = `PurchaseInventory_${today}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error in download-all-excel:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to generate purchase inventory Excel",
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Internal server error",
      });
  }
});

export default router;
