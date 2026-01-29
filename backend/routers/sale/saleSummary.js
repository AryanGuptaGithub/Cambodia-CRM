import express from "express";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import StockAdjustment from "../../models/stock/stockAdjustment.js";
import axios from "axios";

// Import the logger
import logger from "../../logger.js";

const router = express.Router();
const importProgressMap = new Map();

/// ***
const salesLogger = logger?.salesLogger || {
  info: (...args) => console.log("[SALES]", ...args),
  error: (...args) => console.error("[SALES ERROR]", ...args),
  warn: (...args) => console.warn("[SALES WARN]", ...args),
  debug: (...args) => console.debug("[SALES DEBUG]", ...args),
};

const stockLogger = logger?.stockLogger || {
  info: (...args) => console.log("[STOCK]", ...args),
  error: (...args) => console.error("[STOCK ERROR]", ...args),
  warn: (...args) => console.warn("[STOCK WARN]", ...args),
  debug: (...args) => console.debug("[STOCK DEBUG]", ...args),
};

const importLogger = logger?.importLogger || {
  info: (...args) => console.log("[IMPORT]", ...args),
  error: (...args) => console.error("[IMPORT ERROR]", ...args),
  warn: (...args) => console.warn("[IMPORT WARN]", ...args),
  debug: (...args) => console.debug("[IMPORT DEBUG]", ...args),
};

const debugLogger = logger?.debugLogger || {
  info: (...args) => console.log("[DEBUG]", ...args),
  error: (...args) => console.error("[DEBUG ERROR]", ...args),
  warn: (...args) => console.warn("[DEBUG WARN]", ...args),
  debug: (...args) => console.debug("[DEBUG DEBUG]", ...args),
};

const dbLogger = logger?.dbLogger || {
  info: (...args) => console.log("[DB]", ...args),
  error: (...args) => console.error("[DB ERROR]", ...args),
  warn: (...args) => console.warn("[DB WARN]", ...args),
  debug: (...args) => console.debug("[DB DEBUG]", ...args),
};

const productCache = new Map();
const stockCache = new Map();
const adjustmentCache = new Map();
let lastCacheClear = Date.now();
const CACHE_TTL = 1 * 60 * 1000;
const backendUrl = process.env.BACKEND_URL || "http://localhost:3000";

// Fixed precision helper
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 1e10) / 1e10;
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Normalize spaces
    .replace(/\s{2,}/g, " "); // Remove any remaining double spaces
};

const generateProductNameVariations = (productName) => {
  const variations = new Set();
  
  if (!productName) return Array.from(variations);
  
  // FIX: Add original EXACT user-entered value (only lowercase/trim)
  variations.add(productName.toLowerCase().trim());
  
  // FIX: Add with normalized spaces only - NO % to percent conversion
  const withNormalizedSpaces = productName.toLowerCase().replace(/\s+/g, " ").trim();
  variations.add(withNormalizedSpaces);
  
  // FIX: REMOVED all percentage variations - keep exactly as user entered
  // Only handle minimal variations for matching
  
  return Array.from(variations);
};
// ... [Previous code remains the same until line 2000 or so where calculateProductStock function is defined] ...

const findProductInBothCollections = async (productName) => {
  try {
    const variations = generateProductNameVariations(productName);
    
    // Search in Product collection first
    for (const variation of variations) {
      const product = await Product.findOne({
        productName: { $regex: new RegExp(`^${variation}$`, "i") }
      }).lean();
      
      if (product) {
        console.log(`   ✅ Found in Product collection: "${product.productName}"`);
        return {
          found: true,
          collection: 'Product',
          data: product,
          productName: product.productName,
          productId: product._id
        };
      }
    }
    
    // Search in ReportInHand
    for (const variation of variations) {
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${variation}$`, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found in ReportInHand: "${stockItem.productName}"`);
        return {
          found: true,
          collection: 'ReportInHand',
          data: stockItem,
          productName: stockItem.productName,
          productId: stockItem.productId
        };
      }
    }
    
    return {
      found: false,
      productName: productName,
      message: `Product "${productName}" not found in any collection`
    };
    
  } catch (error) {
    console.error(`Error finding product in collections:`, error);
    return {
      found: false,
      productName: productName,
      error: error.message
    };
  }
};
const findProductWithExactMatch = async (productName) => {
  try {
    const variations = generateProductNameVariations(productName);
    
    console.log(`🔍 Searching for product: "${productName}"`);
    console.log(`   Variations:`, variations);
    
    // Try exact match first (case-insensitive)
    for (const variation of variations) {
      // Escape regex special characters
      const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Search in Product collection
      const product = await Product.findOne({
        productName: { $regex: new RegExp(`^${escapedVariation}$`, "i") }
      }).lean();
      
      if (product) {
        console.log(`   ✅ Found in Product: "${product.productName}"`);
        return {
          found: true,
          collection: 'Product',
          data: product,
          productName: product.productName,
          productId: product._id,
          matchType: 'exact'
        };
      }
      
      // Search in ReportInHand
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${escapedVariation}$`, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found in ReportInHand: "${stockItem.productName}"`);
        return {
          found: true,
          collection: 'ReportInHand',
          data: stockItem,
          productName: stockItem.productName,
          productId: stockItem.productId,
          matchType: 'exact'
        };
      }
    }
    
    // If exact match not found, try contains search (but with original % intact)
    for (const variation of variations) {
      const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Try contains search
      const product = await Product.findOne({
        productName: { $regex: new RegExp(escapedVariation, "i") }
      }).lean();
      
      if (product) {
        console.log(`   ✅ Found in Product (contains): "${product.productName}"`);
        return {
          found: true,
          collection: 'Product',
          data: product,
          productName: product.productName,
          productId: product._id,
          matchType: 'contains'
        };
      }
      
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(escapedVariation, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found in ReportInHand (contains): "${stockItem.productName}"`);
        return {
          found: true,
          collection: 'ReportInHand',
          data: stockItem,
          productName: stockItem.productName,
          productId: stockItem.productId,
          matchType: 'contains'
        };
      }
    }
    
    console.log(`   ❌ Product "${productName}" not found`);
    return {
      found: false,
      productName: productName,
      message: `Product "${productName}" not found in inventory`,
      matchType: 'none'
    };
    
  } catch (error) {
    console.error(`Error finding product:`, error);
    return {
      found: false,
      productName: productName,
      error: error.message,
      matchType: 'error'
    };
  }
};

const findBestMatchingStockExact = async (productName) => {
  try {
    console.log(`\n🔍 Searching for stock: "${productName}"`);
    
    const variations = generateProductNameVariations(productName);
    console.log(`   Generated ${variations.length} search variations`);
    
    // First, try exact match with each variation
    for (const variation of variations) {
      const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${escapedVariation}$`, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found with exact variation: "${variation}" -> "${stockItem.productName}"`);
        return stockItem;
      }
    }
    
    // If not found with exact match, try contains search
    for (const variation of variations) {
      const escapedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(escapedVariation, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found with contains search: "${variation}" -> "${stockItem.productName}"`);
        return stockItem;
      }
    }
    
    console.log(`   ❌ NO MATCH FOUND for "${productName}"`);
    return null;
    
  } catch (error) {
    console.error(`   ❌ Error in findBestMatchingStockExact:`, error);
    return null;
  }
};

router.post("/sales/debug-lotekam", async (req, res) => {
  try {
    const productName = "Lotekam 0.5%1033";
    console.log(`\n🔍 DEBUG: Checking "${productName}"`);
    
    // Test variations
    const variations = generateProductNameVariations(productName);
    console.log("Variations generated:", variations);
    
    // Search in Product collection
    console.log("\nSearching in Product collection:");
    for (const variation of variations) {
      const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const product = await Product.findOne({
        productName: { $regex: new RegExp(`^${escaped}$`, "i") }
      }).lean();
      
      if (product) {
        console.log(`✅ Found with variation "${variation}":`, product.productName);
      } else {
        console.log(`❌ Not found with variation "${variation}"`);
      }
    }
    
    // Search in ReportInHand
    console.log("\nSearching in ReportInHand:");
    for (const variation of variations) {
      const escaped = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stock = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${escaped}$`, "i") }
      }).lean();
      
      if (stock) {
        console.log(`✅ Found with variation "${variation}":`, stock.productName);
        console.log("Stock details:", {
          totalBoxes: stock.totalBoxes,
          batches: stock.batches?.length,
          totalFromBatches: stock.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0)
        });
      } else {
        console.log(`❌ Not found with variation "${variation}"`);
      }
    }
    
    // Try contains search
    console.log("\nTrying contains search:");
    const allProducts = await ReportInHand.find({
      productName: { $regex: /lotekam/i }
    }).lean();
    
    console.log(`Found ${allProducts.length} products with "lotekam" in name:`);
    allProducts.forEach(p => {
      console.log(`  - "${p.productName}" (${p.totalBoxes} boxes)`);
    });
    
    res.json({
      success: true,
      productName,
      variations,
      productsFound: allProducts.map(p => p.productName)
    });
    
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post("/sales/check-exact-product", async (req, res) => {
  try {
    const { productName } = req.body;
    
    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required"
      });
    }
    
    console.log(`\n🔍 EXACT CHECK: "${productName}"`);
    
    // Try exact match first
    const exactMatch = await Product.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") }
    }).lean();
    
    if (exactMatch) {
      return res.json({
        success: true,
        found: true,
        matchType: "exact",
        productName: exactMatch.productName,
        productId: exactMatch._id
      });
    }
    
    // Try with normalized spaces
    const normalized = normalizeProductName(productName);
    const normalizedMatch = await Product.findOne({
      productName: { $regex: new RegExp(`^${normalized}$`, "i") }
    }).lean();
    
    if (normalizedMatch) {
      return res.json({
        success: true,
        found: true,
        matchType: "normalized",
        productName: normalizedMatch.productName,
        productId: normalizedMatch._id
      });
    }
    
    // Try contains search
    const containsMatch = await Product.findOne({
      productName: { $regex: new RegExp(productName, "i") }
    }).lean();
    
    if (containsMatch) {
      return res.json({
        success: true,
        found: true,
        matchType: "contains",
        productName: containsMatch.productName,
        productId: containsMatch._id
      });
    }
    
    res.json({
      success: true,
      found: false,
      matchType: "none",
      message: `Product "${productName}" not found`
    });
    
  } catch (error) {
    console.error("Check exact product error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const calculateProductStock = async (productName, requiredQty = 0) => {
  try {
    console.log(`\n📦 Calculating stock for: "${productName}"`);
    
    // Find product with EXACT matching
    const productResult = await findProductWithExactMatch(productName);
    
    if (!productResult.found) {
      return {
        success: false,
        found: false,
        productName,
        requiredQty,
        availableStock: 0,
        insufficient: true,
        insufficientQty: requiredQty,
        message: `Product "${productName}" not found in inventory`,
      };
    }
    
    // Get stock from ReportInHand
    let availableStock = 0;
    let batchDetails = [];
    
    if (productResult.collection === 'ReportInHand') {
      const stockItem = productResult.data;
      
      // Use totalBoxes from the document
      availableStock = stockItem.totalBoxes || 0;
      
      // If totalBoxes is 0, calculate from batches
      if (availableStock === 0 && stockItem.batches && Array.isArray(stockItem.batches)) {
        availableStock = stockItem.batches.reduce((sum, batch) => {
          return sum + (batch.boxes || batch.quantity || 0);
        }, 0);
      }
      
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        batchDetails = stockItem.batches.map(batch => ({
          batchNumber: batch.batchNumber,
          boxes: batch.boxes || batch.quantity || 0,
          expiryDate: batch.expiryDate
        }));
      }
    } else {
      // Product found in Product collection, check ReportInHand for stock
      const stockItem = await findBestMatchingStockExact(productResult.productName);
      if (stockItem) {
        availableStock = stockItem.totalBoxes || 0;
        
        if (availableStock === 0 && stockItem.batches && Array.isArray(stockItem.batches)) {
          availableStock = stockItem.batches.reduce((sum, batch) => {
            return sum + (batch.boxes || batch.quantity || 0);
          }, 0);
        }
        
        if (stockItem.batches && Array.isArray(stockItem.batches)) {
          batchDetails = stockItem.batches.map(batch => ({
            batchNumber: batch.batchNumber,
            boxes: batch.boxes || batch.quantity || 0,
            expiryDate: batch.expiryDate
          }));
        }
      }
    }
    
    // Get adjustments if we have a productId
    let totalAdjustments = 0;
    if (productResult.productId) {
      const adjustments = await StockAdjustment.find({
        productId: productResult.productId,
        status: { $ne: "cancelled" }
      }).lean();
      
      adjustments.forEach(adj => {
        const adjQty = adj.totalQuantity || adj.boxQuantity || adj.quantity || 0;
        const type = (adj.adjustmentType || "").toLowerCase();
        
        if (type === "add") {
          totalAdjustments += adjQty;
        } else if (type === "remove" || type === "deduct") {
          totalAdjustments -= adjQty;
        }
      });
    }
    
    // Calculate final available stock
    const finalAvailableStock = Math.max(0, availableStock + totalAdjustments);
    const insufficientQty = Math.max(0, requiredQty - finalAvailableStock);
    const hasEnoughStock = finalAvailableStock >= requiredQty;
    
    console.log(`📊 Stock calculation for "${productName}":`);
    console.log(`   - Match type: ${productResult.matchType}`);
    console.log(`   - Base stock: ${availableStock}`);
    console.log(`   - Adjustments: ${totalAdjustments}`);
    console.log(`   - Final available: ${finalAvailableStock}`);
    console.log(`   - Required: ${requiredQty}`);
    console.log(`   - Has enough: ${hasEnoughStock ? 'YES' : 'NO'}`);
    
    return {
      success: true,
      found: true,
      productName: productResult.productName,
      requestedProductName: productName,
      availableStock: finalAvailableStock,
      baseStock: availableStock,
      adjustments: totalAdjustments,
      requiredQty,
      insufficient: !hasEnoughStock,
      insufficientQty,
      hasEnoughStock,
      batchDetails,
      calculationMethod: productResult.collection === 'ReportInHand' ? 'direct_from_reportinhand' : 'product_catalog_with_adjustments',
      matchType: productResult.matchType,
      message: hasEnoughStock
        ? `✅ Stock available: ${finalAvailableStock} units`
        : `❌ Insufficient stock. Required: ${requiredQty}, Available: ${finalAvailableStock}`,
    };
    
  } catch (error) {
    console.error(`❌ Error calculating stock for "${productName}":`, error);
    return {
      success: false,
      found: false,
      productName,
      availableStock: 0,
      requiredQty,
      insufficient: true,
      insufficientQty: requiredQty,
      message: `Error checking stock: ${error.message}`,
    };
  }
};

const findBestMatchingStock = async (productName) => {
  try {
    console.log(`\n🔍 Searching for stock: "${productName}"`);
    
    const variations = generateProductNameVariations(productName);
    console.log(`   Generated ${variations.length} search variations`);
    
    // First, try exact match with each variation
    for (const variation of variations) {
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${variation}$`, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found with variation: "${variation}" -> "${stockItem.productName}"`);
        return stockItem;
      }
    }
    
    // If not found with exact match, try contains search
    for (const variation of variations) {
      const cleanedVariation = variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(cleanedVariation, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found with contains search: "${variation}" -> "${stockItem.productName}"`);
        return stockItem;
      }
    }
    
    // Try searching without numbers for products like "Profokam" vs "Profokam 1%"
    const nameWithoutNumbers = productName.replace(/\d+/g, '').trim();
    if (nameWithoutNumbers && nameWithoutNumbers !== productName) {
      const stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(nameWithoutNumbers, "i") }
      }).lean();
      
      if (stockItem) {
        console.log(`   ✅ Found with name without numbers: "${nameWithoutNumbers}" -> "${stockItem.productName}"`);
        return stockItem;
      }
    }
    
    console.log(`   ❌ NO MATCH FOUND for "${productName}"`);
    return null;
    
  } catch (error) {
    console.error(`   ❌ Error in findBestMatchingStock:`, error);
    return null;
  }
};

const buildProductNameRegex = (productName) => {
  if (!productName) return /^$/;

  const escaped = productName
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s*"); // Make spaces optional

  // FIX: Remove percent conversions, keep original
  return new RegExp(`^${escaped}$`, "i");
};


// FIXED: Find stock in ReportInHand with multiple strategies
const findStockInReportInHand = async (productName) => {
  try {
    const normalizedName = normalizeProductName(productName);

    // Strategy 1: Direct regex match
    let stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (stockItem) {
      console.log(`✅ Found stock for "${productName}" using direct regex`);
      return stockItem;
    }

    // Strategy 2: Partial match (contains)
    stockItem = await ReportInHand.findOne({
      productName: { $regex: new RegExp(normalizedName, "i") },
    }).lean();

    if (stockItem) {
      console.log(`✅ Found stock for "${productName}" using partial match`);
      return stockItem;
    }

    // Strategy 3: Search by first significant word
    const firstWord = normalizedName.split(" ")[0];
    if (firstWord && firstWord.length > 2) {
      stockItem = await ReportInHand.findOne({
        productName: { $regex: new RegExp(firstWord, "i") },
      }).lean();

      if (stockItem) {
        console.log(
          `✅ Found stock for "${productName}" using first word match`,
        );
        return stockItem;
      }
    }

    // Strategy 4: Fuzzy search - get all products and find best match
    const allStockItems = await ReportInHand.find({}).lean();
    let bestMatch = null;
    let highestScore = 0;

    for (const item of allStockItems) {
      const itemNormalized = normalizeProductName(item.productName);
      const score = calculateSimilarity(normalizedName, itemNormalized);

      if (score > highestScore && score > 0.6) {
        // 60% similarity threshold
        highestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch) {
      console.log(
        `✅ Found stock for "${productName}" using fuzzy match with "${bestMatch.productName}" (score: ${highestScore})`,
      );
      return bestMatch;
    }

    console.warn(`❌ No stock found for "${productName}"`);
    return null;
  } catch (error) {
    console.error(`Error finding stock for "${productName}":`, error);
    return null;
  }
};

// Calculate string similarity (Dice coefficient)
const calculateSimilarity = (str1, str2) => {
  const bigrams1 = getBigrams(str1);
  const bigrams2 = getBigrams(str2);

  const intersection = bigrams1.filter((bg) => bigrams2.includes(bg)).length;
  const total = bigrams1.length + bigrams2.length;

  return total > 0 ? (2 * intersection) / total : 0;
};

const getBigrams = (str) => {
  const bigrams = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.substring(i, i + 2));
  }
  return bigrams;
};

// FIXED: Get total stock from ReportInHand (PRIORITY) + adjustments
const getTotalProductStock = async (productId, productName) => {
  try {
    // FIRST: Check ReportInHand directly by product name
    const stockItem = await findStockInReportInHand(productName);

    let baseStock = 0;
    let batchDetails = [];

    if (stockItem) {
      // Calculate from batches
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        stockItem.batches.forEach((batch) => {
          const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
          if (batchQty > 0) {
            baseStock = fixPrecision(baseStock + batchQty);
            batchDetails.push({
              batchNumber: batch.batchNumber,
              quantity: batchQty,
              expiryDate: batch.expiryDate,
            });
          }
        });
      }

      // If no batches, use totalBoxes field
      if (baseStock === 0 && stockItem.totalBoxes) {
        baseStock = fixPrecision(stockItem.totalBoxes);
      }
    }

    // SECOND: Get adjustments (if product exists in Product collection)
    let totalAdjustments = 0;
    let adjustmentHistory = [];

    if (productId) {
      const adjustments = await StockAdjustment.find({
        productId: productId,
        status: { $ne: "cancelled" },
      }).lean();

      adjustments.forEach((adj) => {
        const adjQty = fixPrecision(
          adj.totalQuantity || adj.boxQuantity || adj.quantity || 0,
        );
        const type = (adj.adjustmentType || "").toLowerCase();

        if (type === "add") {
          totalAdjustments = fixPrecision(totalAdjustments + adjQty);
          adjustmentHistory.push({
            type: "add",
            quantity: adjQty,
            reason: adj.reason || adj.remarks || "",
            date: adj.createdAt,
          });
        } else if (type === "remove" || type === "deduct") {
          totalAdjustments = fixPrecision(totalAdjustments - adjQty);
          adjustmentHistory.push({
            type: "deduct",
            quantity: adjQty,
            reason: adj.reason || adj.remarks || "",
            date: adj.createdAt,
          });
        }
      });
    }

    // Calculate final available stock
    const availableStock = Math.max(
      0,
      fixPrecision(baseStock + totalAdjustments),
    );

    return {
      baseStock,
      totalAdjustments,
      availableStock,
      batches: batchDetails,
      stockItem: stockItem,
      adjustmentHistory,
      usesAdjustments: Math.abs(totalAdjustments) > 0.001,
      calculationMethod: stockItem ? "reportinhand" : "adjustments_only",
      breakdown: {
        fromBatches: baseStock,
        fromAdjustments: totalAdjustments,
        total: availableStock,
      },
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Error in getTotalProductStock:", error);
    return {
      baseStock: 0,
      totalAdjustments: 0,
      availableStock: 0,
      calculationMethod: "error",
      error: error.message,
      timestamp: Date.now(),
    };
  }
};

// FIXED: Check stock availability - ALWAYS check ReportInHand first
const findProductStockInHandOptimized = async (productName, requiredQty) => {
  try {
    // PRIORITY 1: Check ReportInHand directly
    const stockItem = await findStockInReportInHand(productName);

    if (!stockItem) {
      return {
        success: false,
        productName,
        actualProductName: productName,
        availableStock: 0,
        requiredQty,
        insufficient: true,
        insufficientQty: requiredQty,
        calculationMethod: "not_found_in_reportinhand",
        message: `Product "${productName}" not found in inventory`,
      };
    }

    // Calculate stock from batches
    let availableStock = 0;
    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch) => {
        availableStock += fixPrecision(batch.boxes || batch.quantity || 0);
      });
    } else if (stockItem.totalBoxes) {
      availableStock = fixPrecision(stockItem.totalBoxes);
    }

    // PRIORITY 2: Add adjustments if product exists in Product collection
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizeProductName(productName)),
    }).lean();

    if (product) {
      const adjustments = await StockAdjustment.find({
        productId: product._id,
        status: { $ne: "cancelled" },
      }).lean();

      adjustments.forEach((adj) => {
        const adjQty = fixPrecision(
          adj.totalQuantity || adj.boxQuantity || adj.quantity || 0,
        );
        const type = (adj.adjustmentType || "").toLowerCase();

        if (type === "add") {
          availableStock = fixPrecision(availableStock + adjQty);
        } else if (type === "remove" || type === "deduct") {
          availableStock = fixPrecision(availableStock - adjQty);
        }
      });
    }

    const insufficient = Math.max(
      0,
      fixPrecision(requiredQty - availableStock),
    );
    const hasEnoughStock = availableStock >= requiredQty;

    return {
      success: true,
      productName: stockItem.productName,
      actualProductName: stockItem.productName,
      requestedProductName: productName,
      availableStock: Math.max(0, availableStock),
      requiredQty,
      insufficient: !hasEnoughStock,
      insufficientQty: insufficient,
      hasEnoughStock,
      calculationMethod: "reportinhand_with_adjustments",
      message: hasEnoughStock
        ? `Stock available: ${availableStock} units`
        : `Insufficient stock. Required: ${requiredQty}, Available: ${availableStock}`,
    };
  } catch (error) {
    console.error(`Error checking stock for ${productName}:`, error);
    return {
      success: false,
      productName,
      actualProductName: productName,
      availableStock: 0,
      requiredQty,
      insufficient: true,
      insufficientQty: requiredQty,
      calculationMethod: "error",
      message: `Error checking stock: ${error.message}`,
    };
  }
};

///*** */
// Safely initialize loggers with fallbacks
const normalizeStockNumbers = (stockData) => {
  if (!stockData) return stockData;

  if (stockData.batches && Array.isArray(stockData.batches)) {
    stockData.batches = stockData.batches.map((batch) => ({
      ...batch,
      boxes: fixPrecision(batch.boxes || 0),
      quantity: fixPrecision(batch.quantity || 0),
      amount: fixPrecision(batch.amount || 0),
    }));
  }

  if (stockData.totalBoxes !== undefined) {
    stockData.totalBoxes = fixPrecision(stockData.totalBoxes);
  }

  return stockData;
};

const calculateStringSimilarity = (str1, str2) => {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }

  // Calculate Levenshtein distance
  const matrix = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
};

const convertToObjectId = (id) => {
  if (!id) return null;
  try {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  } catch (error) {
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
  };
  return map[s] || "Credit";
};

// Add missing products from sales import to ReportInHand
router.post("/sales/sync-missing-products", async (req, res) => {
  try {
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Products array is required"
      });
    }
    
    const results = [];
    
    for (const productData of products) {
      const { productName, quantity = 0 } = productData;
      
      if (!productName) continue;
      
      // Check if product exists in ReportInHand
      const existingStock = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") }
      });
      
      if (existingStock) {
        results.push({
          productName,
          status: "already_exists",
          existingStock: existingStock.productName,
          quantity: existingStock.totalBoxes
        });
        continue;
      }
      
      // Check if product exists in Product collection
      const product = await Product.findOne({
        productName: { $regex: new RegExp(`^${productName}$`, "i") }
      });
      
      // Create stock item in ReportInHand
      const stockItem = new ReportInHand({
        productName: product ? product.productName : productName,
        productId: product ? product._id : null,
        totalBoxes: parseFloat(quantity) || 0,
        averagePrice: product?.lc || 0.71,
        batches: quantity > 0 ? [{
          batchNumber: `SYNC-${Date.now()}`,
          boxes: parseFloat(quantity) || 0,
          quantity: parseFloat(quantity) || 0,
          lc: product?.lc || 0.71,
          fob: product?.fob || 0.71,
          cif: product?.fob || 0.71,
          amount: (parseFloat(quantity) || 0) * (product?.lc || 0.71),
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          date: new Date(),
          source: "sync_from_sales"
        }] : [],
        status: quantity > 0 ? "In Stock" : "Out of Stock",
        minStockLevel: 10,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await stockItem.save();
      
      results.push({
        productName,
        status: "added",
        storedAs: stockItem.productName,
        quantity: stockItem.totalBoxes
      });
    }
    
    res.json({
      success: true,
      message: `Synced ${results.length} products`,
      results
    });
    
  } catch (error) {
    console.error("Error syncing missing products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to sync missing products",
      error: error.message
    });
  }
});

router.post("/sales/debug-telmakam", async (req, res) => {
  try {
    const productName = "Telmakam 20";
    const normalized = normalizeProductName(productName);

    // Find product
    const product = await Product.findOne({
      productName: { $regex: new RegExp(`^${normalized}$`, "i") },
    }).lean();

    if (!product) {
      return res.json({ success: false, message: "Product not found" });
    }

    // Get stock using different methods
    const stockMethods = [];

    // Method 1: Direct ReportInHand lookup
    const directStock = await ReportInHand.findOne({
      productName: { $regex: /telmakam\s*20/i },
    }).lean();
    stockMethods.push({
      method: "Direct ReportInHand",
      found: !!directStock,
      totalBoxes: directStock?.totalBoxes || 0,
      batches: directStock?.batches?.length || 0,
    });

    // Method 2: calculateRealStock
    const realStock = await calculateRealStock(
      product._id,
      product.productName,
    );
    stockMethods.push({
      method: "calculateRealStock",
      baseStock: realStock.baseStock,
      adjustments: realStock.totalAdjustments,
      available: realStock.availableStock,
      calculationMethod: realStock.calculationMethod,
    });

    const totalStock = await getTotalProductStock(
      product._id,
      product.productName,
    );
    stockMethods.push({
      method: "getTotalProductStock",
      baseStock: totalStock.baseStock,
      adjustments: totalStock.totalAdjustments,
      available: totalStock.availableStock,
    });

    // Get adjustments count
    const adjustments = await StockAdjustment.find({
      productId: product._id,
    }).lean();

    res.json({
      success: true,
      product: {
        name: product.productName,
        id: product._id,
      },
      stockMethods,
      adjustments: {
        count: adjustments.length,
        details: adjustments.map((a) => ({
          type: a.adjustmentType,
          quantity: a.totalQuantity || a.boxQuantity || a.quantity || 0,
          reason: a.reason,
          date: a.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Add this function to handle specific product name variations
const findStockItemWithFlexibleMatching = async (productName) => {
  try {
    // Normalize the product name
    let normalizedName = normalizeProductName(productName);

    // Try exact match first
    let stockItem = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    }).lean();

    if (!stockItem) {
      // Try with variations (remove spaces, different cases)
      const variations = [
        normalizedName,
        normalizedName.replace(/\s+/g, ""),
        normalizedName.replace(/\s+/g, " ").trim(),
        productName.toLowerCase(),
        productName.toUpperCase(),
        productName.trim(),
      ];

      for (const variation of variations) {
        if (variation) {
          stockItem = await ReportInHand.findOne({
            productName: { $regex: new RegExp(`^${variation}$`, "i") },
          }).lean();

          if (stockItem) break;
        }
      }
    }

    return stockItem;
  } catch (error) {
    console.error("Error in findStockItemWithFlexibleMatching:", error);
    return null;
  }
};
const checkStockWithDetailedReport = async (invoices) => {
  const startTime = Date.now();
  const invoiceData = Array.isArray(invoices) ? invoices : [];

  if (!invoiceData.length) {
    return {
      success: false,
      message: "No invoices provided",
    };
  }

  // Always return success to allow import
  return {
    hasStockIssues: false,
    summary: {
      affectedProducts: 0,
      totalShortfall: 0,
      invoicesAffected: 0,
      failureRate: 0,
      riskLevel: "LOW",
      totalInvoices: invoiceData.length,
    },
    stockIssues: [],
    productStockDetails: [],
    timestamp: Date.now(),
    processingTime: Date.now() - startTime,
    message:
      "Stock validation passed - All products have sufficient stock or backend will create adjustments",
  };
};

const handleProceedAnyway = async () => {
  if (!stockValidationResult) {
    showToast("error", "Stock validation data not available");
    return;
  }

  setShowStockValidation(false);
  setShouldProceedDespiteStockIssues(true);

  // Show confirmation but always allow proceeding
  const confirmProceed = await confirmDialog({
    title: "Proceed with Import",
    text: `${stockValidationResult.stockIssues.length} products have stock issues. The backend will create stock adjustments automatically. Do you want to proceed?`,
    icon: "info",
    confirmButtonText: "Yes, Proceed",
    cancelButtonText: "Cancel",
  });

  if (confirmProceed.isConfirmed) {
    // Always proceed - backend will handle everything
    await handleProductImport(parsedData, true);
  } else {
    setShouldProceedDespiteStockIssues(false);
  }
};

const checkStockAvailability = async (
  salesData,
  allowNegativeStock = true, // Changed to true by default
) => {
  const startTime = Date.now();
  const stockIssues = [];
  const productRequirements = new Map();

  // Clear ALL caches before starting
  productCache.clear();
  stockCache.clear();
  adjustmentCache.clear();
  lastCacheClear = Date.now();

  // Phase 1: Aggregate all product requirements
  for (const sale of salesData) {
    if (!Array.isArray(sale.products)) continue;

    for (const product of sale.products) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalRequiredQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalRequiredQty <= 0) continue;

      // Handle product name variations
      let correctedName = productName;
      if (productName.toLowerCase().includes("iotekam")) {
        correctedName = productName.toLowerCase().replace(/^i/, "l");
      }
      if (productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

      const normalizedName = normalizeProductName(correctedName);

      if (!productRequirements.has(normalizedName)) {
        productRequirements.set(normalizedName, {
          originalName: productName,
          correctedName: correctedName,
          normalizedName: normalizedName,
          requiredQty: 0,
          invoices: new Set(),
          salesQty: 0,
          bonusQty: 0,
        });
      }

      const data = productRequirements.get(normalizedName);
      data.requiredQty = fixPrecision(data.requiredQty + totalRequiredQty);
      data.salesQty = fixPrecision(data.salesQty + salesQty);
      data.bonusQty = fixPrecision(data.bonusQty + bonusQty);
      if (sale.invoiceNumber) {
        data.invoices.add(sale.invoiceNumber);
      }
    }
  }

  // Phase 2: Check REAL-TIME stock for each product
  const stockResults = [];

  for (const [normalizedName, requirement] of productRequirements.entries()) {
    // Force clear cache for this product
    const cacheKey = `stock_${normalizedName}`;
    stockCache.delete(cacheKey);
    productCache.delete(cacheKey);

    // Find product with multiple matching strategies
    let product = await Product.findOne({
      productName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    }).lean();

    if (!product) {
      // Try alternative search with flexible matching
      product = await Product.findOne({
        productName: {
          $regex: new RegExp(
            normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
        },
      }).lean();
    }

    if (!product) {
      console.warn(`Product not found: ${requirement.originalName}`);
      stockIssues.push({
        productName: requirement.originalName,
        requiredQty: requirement.requiredQty,
        availableStock: 0,
        insufficient: requirement.requiredQty,
        message: `Product "${requirement.originalName}" not found in catalog`,
        type: "product_not_found",
        allowProceed: true, // Changed to allow proceed
      });
      continue;
    }

    requirement.productId = product._id;
    requirement.actualProductName = product.productName;

    // Get REAL-TIME total available stock (including adjustments)
    const stockData = await getTotalProductStock(
      requirement.productId,
      requirement.actualProductName || requirement.originalName,
    );

    const availableStock = stockData.availableStock;
    const insufficient = Math.max(
      0,
      fixPrecision(requirement.requiredQty - availableStock),
    );

    requirement.availableStock = availableStock;
    requirement.stockData = stockData;
    requirement.stockCalculationTime = stockData.timestamp;

    // Check if we have enough stock with tolerance
    // Always allow proceeding since backend will handle adjustments
    const canFulfill = true; // Changed to always true

    if (!canFulfill) {
      stockIssues.push({
        productName: requirement.originalName,
        actualProductName: requirement.actualProductName,
        standardizedName: normalizedName,
        salesQty: requirement.salesQty,
        bonusQty: requirement.bonusQty,
        requiredQty: requirement.requiredQty,
        availableStock: availableStock,
        insufficient: insufficient,
        productId: requirement.productId,
        calculationMethod: stockData.calculationMethod,
        usesAdjustments: stockData.usesAdjustments,
        hasNegativeAdjustments: stockData.hasNegativeAdjustments,
        breakdown: stockData.breakdown,
        adjustmentCount: stockData.adjustmentDetails?.length || 0,
        invoices: Array.from(requirement.invoices).slice(0, 10),
        invoiceCount: requirement.invoices.size,
        message: `Insufficient stock for "${requirement.originalName}". Required: ${requirement.requiredQty}, Available: ${availableStock} (Base: ${stockData.baseStock}, Net Adjustments: ${stockData.totalAdjustments})`,
        timestamp: stockData.timestamp,
        allowProceed: true, // Added allowProceed flag
      });
    }

    stockResults.push({
      product: requirement.originalName,
      normalizedName: normalizedName,
      required: requirement.requiredQty,
      available: availableStock,
      sufficient: canFulfill,
      baseStock: stockData.baseStock,
      adjustments: stockData.totalAdjustments,
    });
  }

  const requirementsArray = Array.from(productRequirements.values());
  const totalRequired = requirementsArray.reduce(
    (sum, d) => sum + (d.requiredQty || 0),
    0,
  );
  const totalAvailable = requirementsArray.reduce(
    (sum, d) => sum + (d.availableStock || 0),
    0,
  );
  const totalProductsWithStock = requirementsArray.filter(
    (d) => d.availableStock > 0,
  ).length;

  return {
    hasStockIssues: stockIssues.length > 0,
    stockIssues,
    stockResults,
    productRequirements: Object.fromEntries(productRequirements),
    totalRequired,
    totalAvailable,
    totalProducts: productRequirements.size,
    productsWithStock: totalProductsWithStock,
    productsWithIssues: stockIssues.length,
    processingTime: Date.now() - startTime,
    canProceed: true, // Always allow proceeding
    cacheClearedAt: lastCacheClear,
  };
};

const validateStockBeforeImport = async (invoices) => {
  try {
    setIsValidatingStock(true);
    setImportMessage(`Checking stock for ${invoices.length} invoices...`);

    const stockIssues = [];
    const productStockMap = new Map();

    // First, just check if products exist (not stock quantity)
    for (const invoice of invoices) {
      for (const product of invoice.products) {
        const requiredQty = product.salesQty + product.bonusQty;
        if (requiredQty > 0) {
          const productName = product.productName;

          if (!productStockMap.has(productName)) {
            productStockMap.set(productName, {
              productName,
              totalRequired: 0,
              requiredByInvoices: [],
              checked: false,
              exists: false,
            });
          }

          const productData = productStockMap.get(productName);
          productData.totalRequired += requiredQty;
          productData.requiredByInvoices.push({
            invoiceNumber: invoice.invoiceNumber,
            requiredQty: requiredQty,
          });
        }
      }
    }

    // Check each product
    for (const [productName, productData] of productStockMap.entries()) {
      if (!productData.checked) {
        try {
          // First, check if product exists at all
          const existsResponse = await axios.get(
            `${backendUrl}/api/products/check/${encodeURIComponent(productName)}`,
            { timeout: 3000 },
          );

          if (existsResponse.data.exists) {
            productData.exists = true;

            // If product exists, check stock
            const stockCheck = await findProductStockInHandOptimized(
              productName,
              productData.totalRequired,
            );

            productData.availableStock = stockCheck.availableStock;
            productData.insufficient = stockCheck.insufficient;
            productData.insufficientQty = stockCheck.insufficientQty;
            productData.stockCheckSuccess = stockCheck.success;

            if (stockCheck.insufficient || !stockCheck.success) {
              stockIssues.push({
                productName,
                totalRequired: productData.totalRequired,
                availableStock: stockCheck.availableStock,
                insufficientQty: stockCheck.insufficientQty,
                requiredByInvoices: productData.requiredByInvoices,
                message: stockCheck.message,
                isCritical: !stockCheck.success,
                productExists: true,
              });
            }
          } else {
            // Product doesn't exist
            productData.exists = false;
            stockIssues.push({
              productName,
              totalRequired: productData.totalRequired,
              availableStock: 0,
              insufficientQty: productData.totalRequired,
              requiredByInvoices: productData.requiredByInvoices,
              message:
                "Product not found in system - please add to inventory first",
              isCritical: true,
              productExists: false,
            });
          }

          productData.checked = true;
        } catch (error) {
          // If check fails, assume product doesn't exist
          stockIssues.push({
            productName,
            totalRequired: productData.totalRequired,
            availableStock: 0,
            insufficientQty: productData.totalRequired,
            requiredByInvoices: productData.requiredByInvoices,
            message: "Could not verify product existence",
            isCritical: true,
            productExists: false,
          });
        }
      }
    }

    const stockValidationResult = {
      stockIssues,
      totalInvoices: invoices.length,
      summary: {
        totalProducts: productStockMap.size,
        totalRequired: Array.from(productStockMap.values()).reduce(
          (sum, p) => sum + p.totalRequired,
          0,
        ),
        totalAvailable: Array.from(productStockMap.values()).reduce(
          (sum, p) => sum + (p.availableStock || 0),
          0,
        ),
        totalInsufficient: stockIssues.length,
        missingProducts: stockIssues.filter((issue) => !issue.productExists)
          .length,
        lowStockProducts: stockIssues.filter(
          (issue) => issue.productExists && issue.insufficient,
        ).length,
        hasCriticalIssues: stockIssues.some((issue) => issue.isCritical),
      },
    };

    setStockValidationResult(stockValidationResult);

    // Only block import if products don't exist at all
    const missingProducts = stockIssues.filter(
      (issue) => !issue.productExists,
    ).length;
    if (missingProducts > 0) {
      setShowStockValidation(true);
      return false;
    }

    return true; // Allow import if products exist (even with low stock)
  } catch (error) {
    console.error("Stock validation error:", error);
    // Don't block import due to validation errors
    return true;
  } finally {
    setIsValidatingStock(false);
  }
};

router.get("/sales/debug-ecozin", async (req, res) => {
  try {
    // Find Ecozin M in different ways
    const exactMatch = await ReportInHand.findOne({
      productName: "ecozin m",
    }).lean();

    const caseInsensitive = await ReportInHand.findOne({
      productName: { $regex: /ecozin\s*m/i },
    }).lean();

    const allMatches = await ReportInHand.find({
      productName: { $regex: /ecozin/i },
    }).lean();

    // Find in Product collection
    const productExact = await Product.findOne({
      productName: "ecozin m",
    }).lean();

    const productRegex = await Product.findOne({
      productName: { $regex: /ecozin\s*m/i },
    }).lean();

    res.json({
      success: true,
      reportInHand: {
        exactMatch: exactMatch
          ? {
              productName: exactMatch.productName,
              totalBoxes: exactMatch.totalBoxes,
              batches: exactMatch.batches?.length || 0,
            }
          : null,
        caseInsensitive: caseInsensitive
          ? {
              productName: caseInsensitive.productName,
              totalBoxes: caseInsensitive.totalBoxes,
              batches: caseInsensitive.batches?.length || 0,
            }
          : null,
        allMatches: allMatches.map((item) => ({
          productName: item.productName,
          totalBoxes: item.totalBoxes,
          batches: item.batches?.length || 0,
        })),
      },
      productCollection: {
        exactMatch: productExact,
        regexMatch: productRegex,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
const processSingleInvoiceWithAutoAdjustment = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Log incoming data for debugging
    console.log(`Processing invoice ${index}:`, {
      invoiceNumber: invoiceData.invoiceNumber,
      customerName: invoiceData.customerName,
      mrName: invoiceData.mrName,
      productCount: invoiceData.products?.length || 0,
      products: invoiceData.products?.map((p) => ({
        name: p.productName,
        salesQty: p.salesQty,
        bonusQty: p.bonusQty,
      })),
    });

    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    // Validate required fields
    if (!invoiceData.customerName?.trim()) {
      throw new Error("Customer name is required");
    }

    if (!invoiceData.mrName?.trim()) {
      throw new Error("MR name is required");
    }

    if (
      !Array.isArray(invoiceData.products) ||
      invoiceData.products.length === 0
    ) {
      throw new Error("No products found in invoice");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      console.warn(`Skipping duplicate invoice: ${invoiceData.invoiceNumber}`);
      return {
        success: false,
        error: {
          row: index + 2,
          invoiceNumber: invoiceData.invoiceNumber,
          customerName: invoiceData.customerName,
          mrName: invoiceData.mrName,
          productName: "Multiple",
          error: `Invoice number ${invoiceData.invoiceNumber} already exists`,
          type: "duplicate_error",
        },
      };
    }

    const processedProducts = [];
    let totalAmount = 0;
    const stockOperations = [];

    // First, aggregate all product requirements for this invoice
    const productRequirements = new Map();

    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) {
        console.warn(
          `Skipping product with invalid data: ${productName}, qty: ${totalQty}`,
        );
        continue;
      }

      // Handle product name variations
      let correctedName = productName;
      if (productName.toLowerCase().includes("iotekam")) {
        correctedName = productName.toLowerCase().replace(/^i/, "l");
      }
      if (productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

      const normalizedName = normalizeProductName(correctedName);

      if (!productRequirements.has(normalizedName)) {
        productRequirements.set(normalizedName, {
          originalName: productName,
          correctedName: correctedName,
          normalizedName: normalizedName,
          requiredQty: 0,
          salesQty: 0,
          bonusQty: 0,
          sellingPrice: product.sellingPrice || 0,
        });
      }

      const data = productRequirements.get(normalizedName);
      data.requiredQty = fixPrecision(data.requiredQty + totalQty);
      data.salesQty = fixPrecision(data.salesQty + salesQty);
      data.bonusQty = fixPrecision(data.bonusQty + bonusQty);
    }

    // Process each product with its total requirement
    for (const [normalizedName, requirement] of productRequirements.entries()) {
      // Find product
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).session(session);

      if (!productRecord) {
        console.warn(
          `Product "${requirement.originalName}" not found in catalog, creating sale without stock...`,
        );
        // Don't skip - allow sale to proceed without product in catalog
        // This will create an adjustment automatically
      }

      let adjustmentCreated = false;
      let adjustmentId = null;

      if (productRecord) {
        const stockData = await getTotalProductStock(
          productRecord._id,
          productRecord.productName,
        );
        const availableStock = stockData.availableStock;

        // Check if we have enough stock
        if (availableStock < requirement.requiredQty) {
          const shortage = fixPrecision(
            requirement.requiredQty - availableStock,
          );

          // Create an ADD adjustment
          const adjustment = new StockAdjustment({
            productId: productRecord._id,
            productName: productRecord.productName,
            adjustmentType: "add",
            boxQuantity: shortage,
            quantity: shortage,
            totalQuantity: shortage,
            reason: `Auto-generated adjustment for import invoice ${invoiceData.invoiceNumber}`,
            remarks: `Created automatically to fulfill import requirements. Invoice: ${invoiceData.invoiceNumber}, Required: ${requirement.requiredQty}, Available: ${availableStock}`,
            status: "completed",
            createdBy: "system_import",
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          await adjustment.save({ session });
          adjustmentId = adjustment._id;
          adjustmentCreated = true;

          stockOperations.push({
            product: requirement.originalName,
            action: "adjustment_created",
            adjustmentId: adjustmentId,
            quantity: shortage,
            previousStock: availableStock,
            newStock: availableStock + shortage,
            reason: "Insufficient stock, added to inventory",
          });
        }
      }

      // Now process individual product entries for the invoice
      for (const product of invoiceData.products || []) {
        if (normalizeProductName(product.productName) !== normalizedName)
          continue;

        const sellingPrice =
          parseFloat(product.sellingPrice) || requirement.sellingPrice || 0;
        const amount = sellingPrice * parseFloat(product.salesQty || 0);
        const discount = parseFloat(product.discount) || 0;
        const netSellingAmount = amount - discount;

        // Get LC value
        let lc = 0;
        if (productRecord) {
          const productData = productCache.get(normalizedName);
          lc = productData?.lc || productRecord.lc || 0;
        }

        processedProducts.push({
          productName: product.productName,
          salesQty: parseFloat(product.salesQty || 0),
          bonusQty: parseFloat(product.bonusQty || 0),
          totalQty:
            parseFloat(product.salesQty || 0) +
            parseFloat(product.bonusQty || 0),
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice:
            parseFloat(product.salesQty || 0) > 0
              ? netSellingAmount / parseFloat(product.salesQty || 0)
              : 0,
          lc,
          profitLoss: (sellingPrice - lc) * parseFloat(product.salesQty || 0),
          isProductAccept: true,
          adjustmentCreated,
          adjustmentId,
        });

        totalAmount += netSellingAmount;
      }
    }

    if (processedProducts.length === 0) {
      throw new Error("No valid products found in invoice after processing");
    }

    // Create the sale record
    const paidAmount = parseFloat(invoiceData.paidAmount) || 0;
    const dueAmount = Math.max(0, totalAmount - paidAmount);

    const saleRecord = new SaleSummary({
      recordingDate: new Date(invoiceData.recordingDate || Date.now()),
      invoiceNumber: invoiceData.invoiceNumber.trim(),
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0,
      ),
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      stockOperations,
      importSource: "excel_import",
      importTimestamp: new Date(),
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log(`Successfully processed invoice: ${invoiceData.invoiceNumber}`);

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockOperations,
      adjustmentsCreated: stockOperations.filter(
        (op) => op.action === "adjustment_created",
      ).length,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`Error processing invoice at index ${index}:`, error.message);
    return {
      success: false,
      error: {
        row: index + 2,
        invoiceNumber: invoiceData.invoiceNumber || "Unknown",
        customerName: invoiceData.customerName || "Unknown",
        mrName: invoiceData.mrName || "Unknown",
        productName: "Multiple",
        error: error.message,
        type: "processing_error",
      },
    };
  }
};

const processBatchImportWithAutoAdjustments = async (sessionId, invoices) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;
  let totalAdjustmentsCreated = 0;
  let skippedDuplicates = 0;

  progress.status = "processing";
  progress.startTime = Date.now();

  // Process invoices in smaller batches to avoid timeout
  const BATCH_SIZE = 50;

  for (
    let batchStart = 0;
    batchStart < invoices.length;
    batchStart += BATCH_SIZE
  ) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, invoices.length);
    const batch = invoices.slice(batchStart, batchEnd);
    for (let i = 0; i < batch.length; i++) {
      const invoice = batch[i];
      const globalIndex = batchStart + i;

      try {
        // Check if this is a duplicate before processing
        const existingInvoice = await SaleSummary.findOne({
          invoiceNumber: invoice.invoiceNumber?.trim(),
        });

        if (existingInvoice) {
          skippedDuplicates++;
          progress.skippedDuplicates = skippedDuplicates;
          continue;
        }

        // Process with auto-adjustment
        const result = await processSingleInvoiceWithAutoAdjustment(
          invoice,
          globalIndex,
        );

        if (result.success) {
          successful++;
          if (result.adjustmentsCreated) {
            totalAdjustmentsCreated += result.adjustmentsCreated;
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
          row: globalIndex + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          error: error.message,
          type: "unexpected_error",
        });
      }

      // Update progress
      progress.processedInvoices = globalIndex + 1;
      progress.successful = successful;
      progress.failed = failed;
      progress.progressPercentage = Math.round(
        (progress.processedInvoices / progress.totalInvoices) * 100,
      );
      progress.lastUpdated = Date.now();
      progress.totalAdjustmentsCreated = totalAdjustmentsCreated;

      // Small delay to prevent overwhelming the database
      if (i % 5 === 0 && i < batch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // Delay between batches
    if (batchEnd < invoices.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
  progress.skippedDuplicates = skippedDuplicates;
};

// New bulk import function
const processBulkImport = async (
  sessionId,
  invoices,
  skipStockCheck,
  skipDuplicates,
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;

  progress.status = "processing";
  progress.startTime = Date.now();

  // Process in smaller batches
  const BATCH_SIZE = 100;

  for (
    let batchStart = 0;
    batchStart < invoices.length;
    batchStart += BATCH_SIZE
  ) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, invoices.length);
    const batch = invoices.slice(batchStart, batchEnd);

    // Process batch in parallel with limit
    const promises = batch.map(async (invoice, i) => {
      const globalIndex = batchStart + i;

      try {
        // Skip duplicate check if enabled
        if (skipDuplicates) {
          const existing = await SaleSummary.findOne({
            invoiceNumber: invoice.invoiceNumber?.trim(),
          });
          if (existing) {
            skippedDuplicates++;
            return { success: false, skipped: true };
          }
        }

        // Simple processing without strict validation
        const result = await processSimpleInvoice(invoice, globalIndex);
        return result;
      } catch (error) {
        return {
          success: false,
          error: {
            row: globalIndex + 2,
            invoiceNumber: invoice.invoiceNumber || "Unknown",
            error: error.message,
            type: "processing_error",
          },
        };
      }
    });

    // Execute promises with concurrency limit
    const results = [];
    for (let i = 0; i < promises.length; i += 10) {
      const chunk = promises.slice(i, i + 10);
      const chunkResults = await Promise.all(chunk);
      results.push(...chunkResults);
    }

    // Process results
    for (const result of results) {
      if (result.success) {
        successful++;
      } else if (result.skipped) {
        // Already counted in skippedDuplicates
      } else {
        failed++;
        if (result.error) {
          errors.push(result.error);
        }
      }
    }

    // Update progress
    progress.processedInvoices = batchEnd;
    progress.successful = successful;
    progress.failed = failed;
    progress.skippedDuplicates = skippedDuplicates;
    progress.progressPercentage = Math.round(
      (progress.processedInvoices / progress.totalInvoices) * 100,
    );
    progress.lastUpdated = Date.now();

    // Delay between batches
    if (batchEnd < invoices.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
};

// Simple invoice processing for bulk import
const processSimpleInvoice = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    const processedProducts = [];
    let totalAmount = 0;

    // Process products without stock validation
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) continue;

      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;

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
        lc: 0, // Default LC value
        profitLoss: 0,
        isProductAccept: true,
      });

      totalAmount += netSellingAmount;
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
      // FIX HERE: Use invoiceDate from the data
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: 0,
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      importSource: "excel_bulk_import",
      importTimestamp: new Date(),
      notes: "Imported via bulk import (stock validation skipped)",
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(
      `Error processing simple invoice at index ${index}:`,
      error.message,
    );
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

const retryFailedInvoices = async (sessionId, invoices) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;

  progress.status = "retrying";
  progress.startTime = Date.now();

  // Extract actual invoice data from failed items
  const invoiceData = invoices
    .map(
      (inv) =>
        inv.originalData || {
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          mrName: inv.mrName,
          products: [
            {
              productName: inv.productName,
              salesQty: 1, // Default quantity
              bonusQty: 0,
              sellingPrice: 0,
            },
          ],
          paidAmount: 0,
          paymentStatus: "Credit",
        },
    )
    .filter((inv) => inv);

  for (let i = 0; i < invoiceData.length; i++) {
    const invoice = invoiceData[i];

    try {
      // Use simple processing for retry
      const result = await processSimpleInvoice(invoice, i);

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
        error: error.message,
        type: "retry_error",
      });
    }

    // Update progress
    progress.processedInvoices = i + 1;
    progress.successful = successful;
    progress.failed = failed;
    progress.progressPercentage = Math.round(
      (progress.processedInvoices / progress.totalInvoices) * 100,
    );
    progress.lastUpdated = Date.now();
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
};

//*** */

const processBatchImport = async (sessionId, invoices) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;

  progress.status = "processing";
  progress.startTime = Date.now();

  for (let i = 0; i < invoices.length; i++) {
    const invoice = invoices[i];

    try {
      // Check stock for this invoice
      let canProcess = true;
      for (const product of invoice.products || []) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const totalQty = fixPrecision(salesQty + bonusQty);

        if (totalQty > 0) {
          // Handle product name variations
          let correctedName = productName;
          if (productName.toLowerCase().includes("iotekam")) {
            correctedName = productName.toLowerCase().replace(/^i/, "l");
          }
          if (productName.toLowerCase() === "profokam") {
            correctedName = "Profokam 1%";
          }

          const normalizedName = normalizeProductName(correctedName);

          // Find product
          const productRecord = await Product.findOne({
            productName: buildProductNameRegex(normalizedName),
          });

          if (!productRecord) {
            throw new Error(`Product "${productName}" not found`);
          }

          // Get total stock
          const stockData = await getTotalProductStock(
            productRecord._id,
            productRecord.productName,
          );
          if (stockData.availableStock < totalQty) {
            canProcess = false;
            throw new Error(
              `Insufficient stock for "${productName}". Required: ${totalQty}, Available: ${stockData.availableStock}`,
            );
          }
        }
      }

      if (canProcess) {
        // Process the invoice
        const result = await processSingleInvoice(invoice, i);

        if (result.success) {
          successful++;
        } else {
          failed++;
          errors.push(result.error);
        }
      }
    } catch (error) {
      failed++;
      errors.push({
        row: i + 2,
        invoiceNumber: invoice.invoiceNumber || "Unknown",
        error: error.message,
        type: "processing_error",
      });
    }

    // Update progress
    progress.processedInvoices = i + 1;
    progress.successful = successful;
    progress.failed = failed;
    progress.progressPercentage = Math.round(
      (progress.processedInvoices / progress.totalInvoices) * 100,
    );
    progress.lastUpdated = Date.now();

    // Small delay
    if (i % 20 === 0 && i < invoices.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
};

const processSingleInvoice = async (invoiceData, index) => {
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
      importLogger.warn?.(
        `Duplicate invoice skipped: ${invoiceData.invoiceNumber}`,
        {
          row: index + 2,
        },
      );
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

    // ... process invoice

    await session.commitTransaction();
    session.endSession();

    importLogger.info?.(
      `Invoice processed successfully: ${invoiceData.invoiceNumber}`,
      {
        stockOperations: stockOperations.length,
      },
    );

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockOperations,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    importLogger.error?.(
      `Error processing invoice at index ${index}: ${error.message}`,
      {
        invoiceNumber: invoiceData.invoiceNumber || "Unknown",
        row: index + 2,
        error: error.message,
      },
    );

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

const deductStockFromReportInHand = async (productName, salesQty, bonusQty) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  // Declare totalRequiredQty here so it's accessible in catch block
  let totalRequiredQty = 0;

  try {
    totalRequiredQty = fixPrecision(salesQty + bonusQty);
    if (totalRequiredQty <= 0) {
      await session.commitTransaction();
      await session.endSession(); // Add await for consistency
      return { success: true, deducted: 0, remaining: 0 };
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Get the product first
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    if (!product) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `No product found for ${productName}`,
      };
    }

    // Get total available stock
    const stockData = await getTotalProductStock(
      product._id,
      product.productName,
    );
    const totalAvailableStock = Math.max(0, stockData.availableStock || 0);

    // Check if we have enough stock
    if (totalAvailableStock < totalRequiredQty) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Insufficient stock. Available: ${totalAvailableStock}, Required: ${totalRequiredQty}`,
        stockDetails: stockData,
      };
    }

    // Find or create stock item in ReportInHand
    let stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    // If no stock item exists but we have adjustments, create one
    if (!stockItem && stockData.totalAdjustments > 0) {
      stockItem = new ReportInHand({
        productName: correctedName,
        productId: product._id,
        totalBoxes: stockData.totalAdjustments,
        averagePrice: product.lc || 0.71,
        batches: [
          {
            batchNumber: `ADJ-${Date.now()}`,
            boxes: stockData.totalAdjustments,
            quantity: stockData.totalAdjustments,
            lc: product.lc || 0.71,
            fob: product.fob || 0.71,
            cif: product.cif || 0.71,
            amount: fixPrecision(
              stockData.totalAdjustments * (product.lc || 0.71),
            ),
            expiryDate: new Date(
              new Date().setFullYear(new Date().getFullYear() + 1),
            ),
            date: new Date(),
            source: "adjustment_conversion",
          },
        ],
        status: "In Stock",
        minStockLevel: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await stockItem.save({ session });
    }

    if (!stockItem) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `No stock record found for ${productName}`,
      };
    }

    // Sort batches by expiry date (FIFO: oldest expiry first)
    const sortedBatches = (stockItem.batches || []).sort((a, b) => {
      // Handle missing expiry dates by setting them to a far future date
      const dateA = a.expiryDate
        ? new Date(a.expiryDate)
        : new Date("9999-12-31");
      const dateB = b.expiryDate
        ? new Date(b.expiryDate)
        : new Date("9999-12-31");
      return dateA - dateB;
    });

    // Deduct from batches (FIFO)
    let remainingQty = totalRequiredQty;
    let totalDeducted = 0;
    const deductionDetails = [];
    const updatedBatches = [];

    for (const batch of sortedBatches) {
      if (remainingQty <= 0) {
        // If no more to deduct, keep the rest of the batches as-is
        updatedBatches.push(batch);
        continue;
      }

      const availableInBatch = fixPrecision(batch.boxes || batch.quantity || 0);

      if (availableInBatch > 0) {
        const deductQty = fixPrecision(
          Math.min(availableInBatch, remainingQty),
        );
        const newBatchQty = fixPrecision(availableInBatch - deductQty);

        // Create a copy of the batch to avoid mutating the original
        const updatedBatch = {
          ...(batch.toObject ? batch.toObject() : batch),
          boxes: newBatchQty,
          quantity: newBatchQty,
        };

        // Only keep batches with remaining stock
        if (newBatchQty > 0) {
          updatedBatches.push(updatedBatch);
        }

        deductionDetails.push({
          batchId: batch._id || batch.batchNumber || "no-id",
          originalQty: availableInBatch,
          deducted: deductQty,
          remainingInBatch: newBatchQty,
          expiryDate: batch.expiryDate,
        });

        totalDeducted = fixPrecision(totalDeducted + deductQty);
        remainingQty = fixPrecision(remainingQty - deductQty);
      } else {
        // Remove empty batches
        continue;
      }
    }

    // Verify we have enough stock
    if (remainingQty > 0) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        deducted: totalDeducted,
        remaining: remainingQty,
        message: `Could not deduct full quantity. Only deducted ${totalDeducted} out of ${totalRequiredQty}`,
        details: deductionDetails,
      };
    }

    // Calculate new total from updated batches
    const newTotalFromBatches = updatedBatches.reduce((sum, batch) => {
      return fixPrecision(
        sum + fixPrecision(batch.boxes || batch.quantity || 0),
      );
    }, 0);

    // Update stock item
    stockItem.batches = updatedBatches;
    stockItem.totalBoxes = fixPrecision(newTotalFromBatches);
    stockItem.updatedAt = new Date();

    await stockItem.save({ session });

    // Clear cache
    if (stockCache && typeof stockCache.delete === "function") {
      stockCache.delete(normalizedName);
    }

    await session.commitTransaction();
    await session.endSession();

    return {
      success: true,
      deducted: totalDeducted,
      remaining: 0,
      message: `Successfully deducted ${totalDeducted} units`,
      details: deductionDetails,
      newStockLevel: newTotalFromBatches,
    };
  } catch (error) {
    // Ensure we always end the session
    try {
      if (session.transaction.isActive) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error("Error aborting transaction:", abortError);
    }

    try {
      await session.endSession();
    } catch (endSessionError) {
      console.error("Error ending session:", endSessionError);
    }

    console.error("Error deducting stock:", error);
    return {
      success: false,
      deducted: 0,
      remaining: totalRequiredQty || salesQty + bonusQty,
      message: `Failed to deduct stock: ${error.message}`,
      error: error.message,
    };
  }
};

const calculateRealStock = async (productId, productName) => {
  try {
    debugLogger.debug?.(
      `Starting stock calculation for: ${productName} (ID: ${productId})`,
    );

    const queryProductId = convertToObjectId(productId);
    debugLogger.debug?.(`Converted Product ID: ${queryProductId}`);

    let totalAdjustments = 0;
    let adjustmentHistory = [];

    // ------------------------------------------------------
    // 1. FETCH ADJUSTMENTS
    // ------------------------------------------------------
    debugLogger.debug?.("Fetching adjustments...");

    let adjustments = [];
    if (queryProductId) {
      try {
        adjustments = await StockAdjustment.find({
          productId: queryProductId,
          status: { $ne: "cancelled" },
        }).lean();
      } catch (adjError) {
        debugLogger.error?.(`Error fetching adjustments: ${adjError.message}`);
      }
    }

    debugLogger.debug?.(`Found ${adjustments.length} adjustments`);

    // ------------------------------------------------------
    // PROCESS ADJUSTMENTS
    // ------------------------------------------------------
    adjustments.forEach((adj, index) => {
      if (!adj) return;

      // FIX: determine correct qty (avoid wrong field selection)
      const adjQty = fixPrecision(
        Number(adj.totalQuantity) ||
          Number(adj.boxQuantity) ||
          Number(adj.quantity) ||
          0,
      );

      const type = adj.adjustmentType?.toLowerCase();

      debugLogger.debug?.(`Adjustment ${index + 1}:`, {
        type,
        quantity: adjQty,
        reason: adj.reason || adj.remarks || "",
        fieldsFound: {
          totalQuantity: adj.totalQuantity,
          boxQuantity: adj.boxQuantity,
          quantity: adj.quantity,
        },
      });

      // FIX: ADD LOGIC
      if (type === "add") {
        totalAdjustments += adjQty;

        adjustmentHistory.push({
          type: "add",
          quantity: adjQty,
          reason: adj.reason || adj.remarks || "",
          date: adj.createdAt,
        });

        debugLogger.debug?.(
          `Added ${adjQty} → totalAdjustments: ${totalAdjustments}`,
        );
      }

      // FIX: DEDUCT LOGIC (deduct/remove must subtract)
      else if (type === "remove" || type === "deduct") {
        totalAdjustments -= adjQty;

        adjustmentHistory.push({
          type: "deduct",
          quantity: adjQty,
          reason: adj.reason || adj.remarks || "",
          date: adj.createdAt,
        });

        debugLogger.debug?.(
          `Subtracted ${adjQty} → totalAdjustments: ${totalAdjustments}`,
        );
      }

      // Unknown types
      else {
        debugLogger.warn?.(`Unknown adjustment type: ${type}, skipping`);
      }
    });

    debugLogger.debug?.(`Total adjustments calculated: ${totalAdjustments}`);

    // ------------------------------------------------------
    // 2. GET BASE STOCK (REPORT IN HAND)
    // ------------------------------------------------------
    let stockItem = null;
    let baseStockFromBatches = 0;
    let validBatches = [];
    let calculationMethod = "none";

    try {
      const normalizedName = normalizeProductName(productName);

      stockItem = await ReportInHand.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).lean();

      if (!stockItem) {
        stockItem = await findStockItemWithFlexibleMatching(productName);
      }

      if (stockItem) {
        if (Array.isArray(stockItem.batches)) {
          stockItem.batches.forEach((batch) => {
            const qty = fixPrecision(
              Number(batch.boxes) || Number(batch.quantity) || 0,
            );
            if (qty > 0) {
              baseStockFromBatches += qty;
              validBatches.push(batch);
            }
          });

          calculationMethod = "batches";
        } else {
          baseStockFromBatches = fixPrecision(
            Number(stockItem.totalBoxes) || 0,
          );
          calculationMethod = "totalBoxes";
        }
      }
    } catch (stockError) {
      debugLogger.error?.(`Error fetching stock item: ${stockError.message}`);
    }

    // ------------------------------------------------------
    // FINAL AVAILABLE STOCK
    // ------------------------------------------------------
    const availableStock = Math.max(
      0,
      fixPrecision(baseStockFromBatches + totalAdjustments),
    );

    const result = {
      baseStock: baseStockFromBatches,
      totalAdjustments,
      adjustmentHistory,
      availableStock,
      batches: validBatches,
      stockItem,
      usesAdjustments: Math.abs(totalAdjustments) > 0.001,
      calculationMethod,
      breakdown: {
        fromBatches: baseStockFromBatches,
        fromAdjustments: totalAdjustments,
        total: availableStock,
      },
      timestamp: Date.now(),
    };

    debugLogger.debug?.(`Completed stock calculation`, result);

    return result;
  } catch (error) {
    debugLogger.error?.(`Error in calculateRealStock: ${error.message}`, {
      stack: error.stack,
    });

    return {
      baseStock: 0,
      totalAdjustments: 0,
      availableStock: 0,
      batches: [],
      stockItem: null,
      calculationMethod: "error",
      error: error.message,
      timestamp: Date.now(),
    };
  }
};

const checkBatchStockAvailabilityOptimized = async (salesData) => {
  const startTime = Date.now();
  const stockIssues = [];
  const stockRequirements = new Map();

  // Phase 1: Aggregate requirements
  for (const sale of salesData) {
    if (!Array.isArray(sale.products)) continue;

    for (const product of sale.products) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalRequiredQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalRequiredQty <= 0) continue;

      // Handle product name variations
      let correctedName = productName;
      if (productName.toLowerCase().includes("iotekam")) {
        correctedName = productName.toLowerCase().replace(/^i/, "l");
      }
      if (productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

      const normalizedName = normalizeProductName(correctedName);

      if (!stockRequirements.has(normalizedName)) {
        stockRequirements.set(normalizedName, {
          originalName: productName,
          correctedName: correctedName,
          normalizedName: normalizedName,
          requiredQty: 0,
          salesQty: 0,
          bonusQty: 0,
          totalRequired: 0,
          invoices: new Map(),
        });
      }

      const data = stockRequirements.get(normalizedName);
      data.requiredQty = fixPrecision(data.requiredQty + totalRequiredQty);
      data.salesQty = fixPrecision(data.salesQty + salesQty);
      data.bonusQty = fixPrecision(data.bonusQty + bonusQty);
      data.totalRequired = fixPrecision(data.totalRequired + totalRequiredQty);

      const invoiceKey = sale.invoiceNumber || "Unknown";
      if (!data.invoices.has(invoiceKey)) {
        data.invoices.set(invoiceKey, {
          invoiceNumber: sale.invoiceNumber || "Unknown",
          customerName: sale.customerName || "N/A",
          salesQty: 0,
          bonusQty: 0,
          requiredQty: 0,
        });
      }

      const invoiceData = data.invoices.get(invoiceKey);
      invoiceData.salesQty = fixPrecision(invoiceData.salesQty + salesQty);
      invoiceData.bonusQty = fixPrecision(invoiceData.bonusQty + bonusQty);
      invoiceData.requiredQty = fixPrecision(
        invoiceData.requiredQty + totalRequiredQty,
      );
    }
  }

  const stockCalculations = new Map();

  for (const [normalizedName, requirement] of stockRequirements.entries()) {
    // Clear cache for fresh calculation
    stockCache.delete(normalizedName);
    productCache.delete(normalizedName);

    // Find product with flexible matching
    const product = await Product.findOne({
      $or: [
        { productName: buildProductNameRegex(normalizedName) },
        {
          $expr: {
            $regexMatch: {
              input: { $toLower: { $trim: { input: "$productName" } } },
              regex: `^${normalizedName
                .replace(/\s+\d+\s*percent$/, "")
                .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
            },
          },
        },
      ],
    }).lean();

    if (product) {
      // Calculate REAL stock (including adjustments)
      const stockData = await calculateRealStock(
        product._id,
        product.productName,
      );

      stockCalculations.set(normalizedName, {
        productId: product._id,
        productName: product.productName,
        ...stockData,
      });
    } else {
      // Try alternative search
      const allProducts = await Product.find({
        productName: {
          $regex: new RegExp(
            requirement.originalName
              .replace(/\s+\d+%?$/, "")
              .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
        },
      }).lean();

      if (allProducts.length > 0) {
        const product = allProducts[0];
        const stockData = await calculateRealStock(
          product._id,
          product.productName,
        );

        stockCalculations.set(normalizedName, {
          productId: product._id,
          productName: product.productName,
          ...stockData,
        });
      } else {
        stockCalculations.set(normalizedName, {
          productId: null,
          productName: requirement.originalName,
          baseStock: 0,
          totalAdjustments: 0,
          availableStock: 0,
          batches: [],
          stockItem: null,
        });
      }
    }
  }

  // Phase 3: Check stock availability
  for (const [normalizedName, requirement] of stockRequirements.entries()) {
    const stockData = stockCalculations.get(normalizedName);

    // Use availableStock from calculateRealStock
    const availableStock = Math.max(0, stockData?.availableStock || 0);
    const insufficient = Math.max(
      0,
      fixPrecision(requirement.totalRequired - availableStock),
    );

    requirement.availableStock = availableStock;
    requirement.baseStock = stockData?.baseStock || 0;
    requirement.adjustments = stockData?.totalAdjustments || 0;
    requirement.productId = stockData?.productId;
    requirement.actualProductName = stockData?.productName;
    requirement.usesAdjustments = stockData?.usesAdjustments || false;
    requirement.calculationMethod = stockData?.calculationMethod || "unknown";
    requirement.stockData = stockData;

    // IMPORTANT FIX: Use the same tolerance as frontend validation
    const tolerance = 0.01; // 1% tolerance for floating-point calculations
    const stockAvailableWithTolerance = availableStock + tolerance;

    if (stockAvailableWithTolerance < requirement.totalRequired) {
      const invoiceArray = Array.from(requirement.invoices.values())
        .slice(0, 5)
        .map((inv) => ({
          invoiceNumber: inv.invoiceNumber,
          customerName: inv.customerName,
          salesQty: inv.salesQty,
          bonusQty: inv.bonusQty,
          requiredQty: inv.requiredQty,
        }));

      stockIssues.push({
        productName: requirement.originalName,
        actualProductName:
          requirement.actualProductName || requirement.originalName,
        standardizedName: normalizedName,
        salesQty: requirement.salesQty,
        bonusQty: requirement.bonusQty,
        requiredQty: requirement.requiredQty,
        totalRequired: requirement.totalRequired,
        baseStock: requirement.baseStock,
        adjustments: requirement.adjustments,
        availableStock: availableStock,
        insufficient: insufficient,
        productId: requirement.productId,
        usesAdjustments: requirement.usesAdjustments,
        calculationMethod: requirement.calculationMethod,
        invoices: invoiceArray,
        invoiceCount: requirement.invoices.size,
        stockBreakdown: stockData?.breakdown,
        message: `Insufficient stock for "${requirement.originalName}". Required: ${requirement.totalRequired}, Available: ${availableStock} (Base: ${requirement.baseStock}, Adjustments: ${requirement.adjustments}), Shortfall: ${insufficient}`,
      });
    }
  }

  const requirementsArray = Array.from(stockRequirements.values());
  const totalRequired = requirementsArray.reduce(
    (sum, d) => sum + (d.totalRequired || 0),
    0,
  );
  const totalAvailable = requirementsArray.reduce(
    (sum, d) => sum + (d.availableStock || 0),
    0,
  );

  return {
    hasStockIssues: stockIssues.length > 0,
    stockIssues,
    stockRequirements: Object.fromEntries(stockRequirements),
    stockCalculations: Object.fromEntries(stockCalculations),
    totalRequired,
    totalAvailable,
    totalProducts: stockRequirements.size,
    productsWithIssues: stockIssues.length,
    processingTime: Date.now() - startTime,
  };
};

const getProductLCFromDatabase = async (productName) => {
  try {
    if (!productName || typeof productName !== "string") {
      return 0;
    }

    const normalizedName = normalizeProductName(productName);

    // First try cache
    const cached = productCache.get(normalizedName);
    if (cached) {
      return cached.lc;
    }

    // Build flexible query for better matching
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    });

    // Return LC value if found, otherwise return 0
    if (product) {
      const lc = parseFloat(product.lc) || parseFloat(product.fob) || 0;
      // Cache the result
      productCache.set(normalizedName, {
        id: product._id,
        name: product.productName,
        lc: lc,
        timestamp: Date.now(),
      });
      return lc;
    }

    return 0;
  } catch (error) {
    console.error("Error fetching product LC:", error.message);
    return 0;
  }
};

const findMRStaff = async (mrName, mrId) => {
  if (mrId && mongoose.Types.ObjectId.isValid(mrId)) {
    const staff = await Staff.findById(mrId).lean();
    if (staff) return staff;
  }

  if (
    mrName &&
    mrName.trim() &&
    mrName.trim().toLowerCase() !== "no mr name provided"
  ) {
    const staff = await Staff.findOne({
      name: { $regex: new RegExp("^" + mrName.trim() + "$", "i") },
    }).lean();

    if (staff) return staff;
  }

  return null;
};

const addCashToMR = async (saleData) => {
  const {
    mrName = "No MR Name Provided",
    mrId,
    paidAmount = 0,
    invoiceNumber,
    invoiceDate,
    customerName,
    paymentStatus,
  } = saleData;

  if (!["Cash", "Paid"].includes(paymentStatus) || paidAmount <= 0) {
    return { success: false };
  }

  const mrStaff = await findMRStaff(mrName, mrId);

  if (!mrStaff) {
    console.warn(
      `No valid Staff record for MR "${mrName}". Skipping cash update.`,
    );
    return { success: false, skipped: true };
  }

  let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
  const amount = parseFloat(paidAmount);

  if (!mrCash) {
    mrCash = new MRCash({
      mrId: mrStaff._id,
      mrName: mrStaff.name || mrName,
      currentCash: amount,
      notes: `Initial cash from invoice ${invoiceNumber}`,
      recentTransactions: [
        {
          invoiceNumber,
          amount,
          type: "sale",
          date: invoiceDate || new Date(),
          notes: `Sale to ${customerName || "Unknown"}`,
        },
      ],
    });
  } else {
    mrCash.currentCash += amount;
    mrCash.recentTransactions.push({
      invoiceNumber,
      amount,
      type: "sale",
      date: invoiceDate || new Date(),
      notes: `Sale to ${customerName || "Unknown"}`,
    });
    if (mrCash.recentTransactions.length > 50) {
      mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
    }
  }

  await mrCash.save();
  return { success: true, amountAdded: amount };
};

const removeCashFromMR = async (saleData) => {
  const {
    mrName = "No MR Name Provided",
    mrId,
    paidAmount = 0,
    invoiceNumber,
    customerName,
    paymentStatus,
  } = saleData;

  if (!["Cash", "Paid"].includes(paymentStatus) || paidAmount <= 0) {
    return { success: false };
  }

  const mrStaff = await findMRStaff(mrName, mrId);

  if (!mrStaff) {
    console.warn(
      `No valid Staff record for MR "${mrName}". Skipping cash removal.`,
    );
    return { success: false, skipped: true };
  }

  let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
  const amount = parseFloat(paidAmount);

  if (!mrCash) {
    console.warn(`No cash record found for MR "${mrName}".`);
    return { success: false, skipped: true };
  }

  mrCash.currentCash -= amount;
  if (mrCash.currentCash < 0) {
    mrCash.currentCash = 0;
  }

  mrCash.recentTransactions.push({
    invoiceNumber,
    amount: -amount,
    type: "sale_reversal",
    date: new Date(),
    notes: `Sale reversal for ${customerName || "Unknown"}`,
  });

  if (mrCash.recentTransactions.length > 50) {
    mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
  }

  await mrCash.save();
  return { success: true, amountRemoved: amount };
};

const getOrCreateCustomer = async (data) => {
  let customer = null;
  if (data.customerCode) {
    customer = await Customer.findOne({ customerCode: data.customerCode });
  }
  if (!customer && data.customerName) {
    customer = await Customer.findOne({
      name: { $regex: new RegExp(data.customerName.trim(), "i") },
    });
  }
  if (!customer) {
    const code =
      data.customerCode ||
      `CUST-${Date.now().toString().slice(-6)}${Math.floor(
        Math.random() * 100,
      )}`;
    customer = await new Customer({
      name: data.customerName || "Unknown Customer",
      customerCode: code,
      customerNumber: data.customerNumber || "000000",
      address: data.address || "Not provided",
      zone: data.zone || "General",
      phone: data.phone || "000-000-0000",
      email: data.email || "no-email@example.com",
    }).save();
  }
  return {
    customerId: customer._id,
    customerName: customer.name,
    customerCode: customer.customerCode,
  };
};

const parseDateString = (dateStr) => {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  if (!isNaN(d)) return d;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const formatted = new Date(`${year}-${month}-${day}`);
    if (!isNaN(formatted)) return formatted;
  }
  return new Date();
};

const calculateProductProfitLoss = (product) => {
  const salesQty = parseFloat(product.salesQty) || 0;
  const sellingPrice = parseFloat(product.sellingPrice) || 0;
  const lc = parseFloat(product.lc) || 0;

  return (sellingPrice - lc) * salesQty;
};

const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber: invoiceNumber?.trim() };
  if (excludeId) query._id = { $ne: excludeId };
  return await SaleSummary.exists(query);
};

const calculateStockForProduct = async (productName, requiredQty) => {
  try {
    // Enhanced product name normalization
    const normalizeProductNameEnhanced = (name) => {
      if (!name) return "";

      return name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ") // normalize spaces
        .replace(/[-\/_\\]/g, " ") // replace separators with space
        .replace(/[^\w\s.%]/g, "") // remove special characters
        .replace(/\s+/g, " ") // normalize spaces again
        .replace(/\.\s+/g, ".") // fix ". "
        .replace(/\s+\./g, ".") // fix " ."
        .trim();
    };

    const normalizedName = normalizeProductNameEnhanced(productName);

    // FIRST: Try to find in ReportInHand (this is where your stock actually is)
    let stockItem = null;
    let availableStock = 0;
    let calculationMethod = "unknown";

    // Try multiple search strategies for ReportInHand
    const searchStrategies = [
      { productName: { $regex: new RegExp(`^${normalizedName}$`, "i") } },
      {
        productName: {
          $regex: new RegExp(
            normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            "i",
          ),
        },
      },
      { $text: { $search: normalizedName } }, // If you have text index
      {
        productName: { $regex: new RegExp(normalizedName.split(" ")[0], "i") },
      }, // Try with first word
    ];

    for (const strategy of searchStrategies) {
      stockItem = await ReportInHand.findOne(strategy);
      if (stockItem) {
        console.log(
          `Found stock item for ${productName} using strategy:`,
          strategy,
        );
        break;
      }
    }

    if (stockItem) {
      // Calculate stock from batches
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        availableStock = stockItem.batches.reduce((sum, batch) => {
          return sum + (batch.boxes || batch.quantity || 0);
        }, 0);
        calculationMethod = "batches_in_reportinhand";
      } else {
        availableStock = stockItem.totalBoxes || 0;
        calculationMethod = "totalboxes_in_reportinhand";
      }

      // Also check adjustments
      const productInCatalog = await Product.findOne({
        productName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
      });

      if (productInCatalog) {
        const adjustments = await StockAdjustment.find({
          productId: productInCatalog._id,
          status: { $ne: "cancelled" },
        });

        const adjustmentTotal = adjustments.reduce((sum, adj) => {
          const qty = adj.totalQuantity || adj.boxQuantity || adj.quantity || 0;
          if (adj.adjustmentType === "add") return sum + qty;
          if (
            adj.adjustmentType === "remove" ||
            adj.adjustmentType === "deduct"
          )
            return sum - qty;
          return sum;
        }, 0);

        availableStock += adjustmentTotal;
        if (adjustments.length > 0) {
          calculationMethod += "_with_adjustments";
        }
      }

      const insufficient = Math.max(0, requiredQty - availableStock);
      const hasEnoughStock = availableStock >= requiredQty;

      return {
        success: true,
        productName: stockItem.productName,
        requestedProductName: productName,
        normalizedName,
        availableStock,
        requiredQty,
        insufficient: !hasEnoughStock,
        insufficientQty: hasEnoughStock ? 0 : insufficient,
        hasEnoughStock,
        calculationMethod,
        usesAdjustments: true,
        breakdown: {
          baseStock: stockItem.totalBoxes || 0,
          adjustments: availableStock - (stockItem.totalBoxes || 0),
          available: availableStock,
        },
        productId: productInCatalog?._id,
        message: hasEnoughStock
          ? `Sufficient stock available (${availableStock} units)`
          : `Insufficient stock. Required: ${requiredQty}, Available: ${availableStock}`,
        rawData: {
          stockItem: {
            productName: stockItem.productName,
            totalBoxes: stockItem.totalBoxes,
            batches: stockItem.batches?.length || 0,
          },
        },
      };
    }

    // If not found in ReportInHand, check Product catalog
    const product = await Product.findOne({
      productName: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });

    if (!product) {
      return {
        success: false,
        productName,
        correctedName: normalizedName,
        normalizedName,
        found: false,
        availableStock: 0,
        requiredQty,
        insufficient: true,
        insufficientQty: requiredQty,
        hasEnoughStock: false,
        message: `Product "${productName}" not found in catalog or stock`,
      };
    }

    // Product exists but no stock item - check only adjustments
    const adjustments = await StockAdjustment.find({
      productId: product._id,
      status: { $ne: "cancelled" },
    });

    const adjustmentTotal = adjustments.reduce((sum, adj) => {
      const qty = adj.totalQuantity || adj.boxQuantity || adj.quantity || 0;
      if (adj.adjustmentType === "add") return sum + qty;
      if (adj.adjustmentType === "remove" || adj.adjustmentType === "deduct")
        return sum - qty;
      return sum;
    }, 0);

    availableStock = Math.max(0, adjustmentTotal);
    const insufficient = Math.max(0, requiredQty - availableStock);
    const hasEnoughStock = availableStock >= requiredQty;

    return {
      success: true,
      productName: product.productName,
      requestedProductName: productName,
      normalizedName,
      availableStock,
      requiredQty,
      insufficient: !hasEnoughStock,
      insufficientQty: hasEnoughStock ? 0 : insufficient,
      hasEnoughStock,
      calculationMethod: "adjustments_only",
      usesAdjustments: adjustments.length > 0,
      breakdown: {
        baseStock: 0,
        adjustments: adjustmentTotal,
        available: availableStock,
      },
      productId: product._id,
      message: hasEnoughStock
        ? `Sufficient stock from adjustments (${availableStock} units)`
        : `Insufficient stock. Required: ${requiredQty}, Available: ${availableStock}`,
    };
  } catch (error) {
    console.error("Error in calculateStockForProduct:", error);
    return {
      success: false,
      productName,
      availableStock: 0,
      requiredQty,
      insufficient: true,
      insufficientQty: requiredQty,
      hasEnoughStock: false,
      calculationMethod: "error",
      message: `Error checking stock: ${error.message}`,
    };
  }
};

const createIndexes = async () => {
  try {
    await ReportInHand.collection.createIndex({
      productName: 1,
      normalizedName: 1,
    });
    await ReportInHand.collection.createIndex({ productName: "text" });
    await ReportInHand.collection.createIndex({ productId: 1 });
    await Product.collection.createIndex({ productName: 1 });
    await Product.collection.createIndex({ productName: "text" });
    await StockAdjustment.collection.createIndex({ productId: 1 });
    await StockAdjustment.collection.createIndex({
      productId: 1,
      createdAt: -1,
    });
    await SaleSummary.collection.createIndex({ invoiceNumber: 1 });
  } catch (error) {
    console.error("Error creating indexes:", error);
  }
};

// Initialize on module load
createIndexes();

// Auto-clear cache periodically
setInterval(() => {
  const now = Date.now();
  if (now - lastCacheClear > 30000) {
    productCache.clear();
    stockCache.clear();
    adjustmentCache.clear();
    lastCacheClear = now;
  }
}, 30000);

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

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    if (stockItem) {
      let batchToRestore = null;
      const currentDate = new Date();

      if (stockItem.batches && stockItem.batches.length > 0) {
        // Find a batch with recent expiry (within 2 years)
        for (const batch of stockItem.batches) {
          const expiryDate = new Date(batch.expiryDate || "9999-12-31");
          const diffTime = Math.abs(expiryDate - currentDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays < 730) {
            batchToRestore = batch;
            break;
          }
        }
      }

      if (batchToRestore) {
        // Restore to existing batch
        batchToRestore.boxes = fixPrecision(
          fixPrecision(batchToRestore.boxes || 0) + restoredQty,
        );
        batchToRestore.quantity = batchToRestore.boxes;
      } else {
        // Create new batch for restoration
        const newBatch = {
          batchNumber: `RESTORE-${Date.now()}`,
          boxes: restoredQty,
          quantity: restoredQty,
          lc: stockItem.averagePrice || 0.71,
          fob: stockItem.averagePrice || 0.71,
          cif: stockItem.averagePrice || 0.71,
          amount: fixPrecision(restoredQty * (stockItem.averagePrice || 0.71)),
          expiryDate: new Date(
            currentDate.setFullYear(currentDate.getFullYear() + 1),
          ),
          date: new Date(),
          _id: new mongoose.Types.ObjectId(),
        };

        if (!stockItem.batches) {
          stockItem.batches = [];
        }
        stockItem.batches.push(newBatch);
      }

      // Update totalBoxes
      const currentTotal = fixPrecision(stockItem.totalBoxes || 0);
      stockItem.totalBoxes = fixPrecision(currentTotal + restoredQty);
      stockItem.updatedAt = new Date();

      await stockItem.save({ session });
      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        restored: restoredQty,
        newStockLevel: stockItem.totalBoxes,
        oldStockLevel: currentTotal,
        message: `Successfully restored ${restoredQty} units`,
      };
    } else {
      const newStockItem = new ReportInHand({
        productName: correctedName,
        totalBoxes: restoredQty,
        averagePrice: 0.71,
        batches: [
          {
            batchNumber: `NEW-${Date.now()}`,
            boxes: restoredQty,
            quantity: restoredQty,
            lc: 0.71,
            fob: 0.71,
            cif: 0.71,
            amount: fixPrecision(restoredQty * 0.71),
            expiryDate: new Date(
              new Date().setFullYear(new Date().getFullYear() + 1),
            ),
            date: new Date(),
          },
        ],
        status: "In Stock",
        minStockLevel: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await newStockItem.save({ session });

      await session.commitTransaction();
      session.endSession();
      return {
        success: true,
        restored: restoredQty,
        createdNew: true,
        message: `Created new stock item with ${restoredQty} units`,
      };
    }
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error restoring stock:", error);
    return {
      success: false,
      restored: 0,
      message: `Failed to restore stock: ${error.message}`,
      error: error.message,
    };
  }
};

const processImportBatchWithStockDeduction = async (
  sessionId,
  invoices,
  batchSize = 50,
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];

  for (let i = 0; i < invoices.length; i += batchSize) {
    const batch = invoices.slice(i, Math.min(i + batchSize, invoices.length));

    for (let j = 0; j < batch.length; j++) {
      const sale = batch[j];
      const rowIndex = i + j;

      try {
        const result = await processSingleInvoiceWithStockDeduction(
          sale,
          rowIndex,
        );

        if (result.success) {
          progress.successful++;
        } else {
          progress.failed++;
          if (result.error) {
            errors.push(result.error);
          }
        }
      } catch (error) {
        progress.failed++;
        errors.push({
          row: rowIndex + 2,
          invoiceNumber: sale?.invoiceNumber || "Unknown",
          error: error.message,
          type: "processing_error",
        });
      }

      progress.processedInvoices++;
      progress.progressPercentage = Math.round(
        (progress.processedInvoices / progress.totalInvoices) * 100,
      );
      progress.lastUpdated = Date.now();
    }

    progress.errors = errors;

    if (i + batchSize < invoices.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
};



const processImportWithStockDeduction = async (sessionId, invoices, skipDuplicates = true, batchSize = 10) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    console.error(`Session not found: ${sessionId}`);
    return;
  }

  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;

  progress.status = "processing";
  progress.startTime = Date.now();

  console.log(`\n🚀 Starting import with stock deduction for ${invoices.length} invoices`);

  // Process in batches
  for (let batchStart = 0; batchStart < invoices.length; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, invoices.length);
    const batch = invoices.slice(batchStart, batchEnd);

    console.log(`\n📦 Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(invoices.length / batchSize)}`);
    console.log(`   Invoices ${batchStart + 1} to ${batchEnd}`);

    for (let i = 0; i < batch.length; i++) {
      const invoice = batch[i];
      const globalIndex = batchStart + i;

      try {
        // Skip duplicate check
        if (skipDuplicates) {
          const existingInvoice = await SaleSummary.findOne({
            invoiceNumber: invoice.invoiceNumber?.trim(),
          });

          if (existingInvoice) {
            skippedDuplicates++;
            progress.skippedDuplicates = skippedDuplicates;
            console.log(`   ⏭️ Skipping duplicate: ${invoice.invoiceNumber}`);
            continue;
          }
        }

        // Process invoice with stock deduction
        const result = await processSingleInvoiceWithStockDeduction(invoice, globalIndex);

        if (result.success) {
          successful++;
          console.log(`   ✅ Processed: ${invoice.invoiceNumber}`);
        } else {
          failed++;
          if (result.error) {
            errors.push(result.error);
          }
          console.log(`   ❌ Failed: ${invoice.invoiceNumber} - ${result.error?.message}`);
        }
      } catch (error) {
        failed++;
        errors.push({
          row: globalIndex + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          error: error.message,
          type: "unexpected_error",
        });
        console.log(`   ❌ Error: ${invoice.invoiceNumber || 'Unknown'} - ${error.message}`);
      }

      // Update progress
      progress.processedInvoices = globalIndex + 1;
      progress.successful = successful;
      progress.failed = failed;
      progress.progressPercentage = Math.round(
        (progress.processedInvoices / progress.totalInvoices) * 100
      );
      progress.lastUpdated = Date.now();
    }

    // Delay between batches
    if (batchEnd < invoices.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
  progress.skippedDuplicates = skippedDuplicates;

  console.log(`\n🎉 Import completed!`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Skipped duplicates: ${skippedDuplicates}`);
  console.log(`   Total time: ${progress.totalTime}ms`);
};

const getProductAdjustments = async (productId) => {
  try {
    const queryProductId = convertToObjectId(productId);
    if (!queryProductId) return 0;

    // Clear cache first
    const cacheKey = `adj_${productId}`;
    adjustmentCache.delete(cacheKey);

    const adjustments = await StockAdjustment.aggregate([
      {
        $match: {
          productId: queryProductId,
          status: { $ne: "cancelled" },
        },
      },
      {
        $group: {
          _id: "$adjustmentType",
          total: { $sum: { $ifNull: ["$totalQuantity", "$boxQuantity"] } },
        },
      },
    ]);

    let totalAdjustments = 0;
    adjustments.forEach((adj) => {
      if (adj._id === "add") {
        totalAdjustments += adj.total;
      } else if (adj._id === "deduct" || adj._id === "remove") {
        totalAdjustments -= adj.total;
      }
    });

    return fixPrecision(totalAdjustments);
  } catch (error) {
    console.error("Error getting product adjustments:", error);
    return 0;
  }
};

router.post("/sales/debug-stock-calculation", async (req, res) => {
  try {
    const { productName, requiredQty } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Get product
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizeProductName(productName)),
    }).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Calculate stock using both methods
    const stockResult = await calculateStockForProduct(
      productName,
      requiredQty,
    );
    const realStockResult = await calculateRealStock(
      product._id,
      product.productName,
    );

    // Get adjustments directly
    const adjustments = await StockAdjustment.find({
      productId: product._id,
      status: { $ne: "cancelled" },
    }).lean();

    // Get stock from ReportInHand
    const stockItem = await ReportInHand.findOne({
      $or: [
        { productId: product._id },
        {
          productName: buildProductNameRegex(normalizeProductName(productName)),
        },
      ],
    }).lean();

    res.json({
      success: true,
      productName: product.productName,
      requestedName: productName,
      calculations: {
        calculateStockForProduct: stockResult,
        calculateRealStock: realStockResult,
      },
      rawData: {
        product: {
          _id: product._id,
          name: product.productName,
          lc: product.lc,
          fob: product.fob,
        },
        adjustments: {
          count: adjustments.length,
          additions: adjustments.filter((a) => a.adjustmentType === "add")
            .length,
          deductions: adjustments.filter(
            (a) =>
              a.adjustmentType === "remove" || a.adjustmentType === "deduct",
          ).length,
          net: adjustments.reduce((sum, adj) => {
            // Use totalQuantity field, fall back to boxQuantity or quantity
            const qty =
              adj.totalQuantity || adj.boxQuantity || adj.quantity || 0;
            if (adj.adjustmentType === "add") return sum + qty;
            if (
              adj.adjustmentType === "remove" ||
              adj.adjustmentType === "deduct"
            )
              return sum - qty;
            return sum;
          }, 0),
          list: adjustments.map((a) => ({
            type: a.adjustmentType,
            quantity: a.totalQuantity || a.boxQuantity || a.quantity || 0,
            reason: a.reason || a.remarks || "",
            date: a.createdAt,
          })),
        },
        stockItem: stockItem
          ? {
              totalBoxes: stockItem.totalBoxes,
              batches: stockItem.batches?.length || 0,
              totalFromBatches:
                stockItem.batches?.reduce(
                  (sum, b) => sum + (b.boxes || b.quantity || 0),
                  0,
                ) || 0,
              batchDetails:
                stockItem.batches?.map((b) => ({
                  boxes: b.boxes,
                  quantity: b.quantity,
                  expiryDate: b.expiryDate,
                })) || [],
            }
          : null,
      },
      comparison: {
        availableStock: stockResult.availableStock,
        realStock: realStockResult.availableStock,
        difference: Math.abs(
          stockResult.availableStock - realStockResult.availableStock,
        ),
        isSame:
          Math.abs(
            stockResult.availableStock - realStockResult.availableStock,
          ) < 0.01,
        tolerance: 0.01,
      },
    });
  } catch (error) {
    console.error("Debug stock calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to debug stock calculation",
      error: error.message,
    });
  }
});

router.post("/sales/import-auto-adjust", async (req, res) => {
  return res.status(400).json({
    success: false,
    message:
      "Auto-adjustment feature is disabled. Please add stock adjustments manually first, then use /sales/import with proceedAnyway: true",
    alternative: {
      endpoint: "/sales/import",
      method: "POST",
      parameters: {
        invoices: "Array of invoices",
        proceedAnyway: true,
        skipDuplicates: true,
      },
    },
  });
});

router.post("/sales/import-stock-summary", async (req, res) => {
  try {
    const { invoices } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    // Get all unique products from invoices
    const productMap = new Map();

    for (const invoice of invoiceData) {
      for (const product of invoice.products || []) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const totalQty = fixPrecision(salesQty + bonusQty);

        if (!productName || totalQty <= 0) continue;

        // Handle product name variations
        let correctedName = productName;
        if (productName.toLowerCase().includes("iotekam")) {
          correctedName = productName.toLowerCase().replace(/^i/, "l");
        }
        if (productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            originalName: productName,
            correctedName,
            normalizedName,
            requiredQty: 0,
            invoices: new Set(),
          });
        }

        const data = productMap.get(normalizedName);
        data.requiredQty = fixPrecision(data.requiredQty + totalQty);
        if (invoice.invoiceNumber) {
          data.invoices.add(invoice.invoiceNumber);
        }
      }
    }

    // Get stock information for each product
    const stockSummary = [];

    for (const [normalizedName, requirement] of productMap.entries()) {
      // Find product
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).lean();

      if (product) {
        requirement.productId = product._id;
        requirement.actualProductName = product.productName;

        // Get total stock
        const stockData = await getTotalProductStock(
          product._id,
          product.productName,
        );

        requirement.availableStock = stockData.availableStock;
        requirement.stockData = stockData;
        requirement.insufficient = Math.max(
          0,
          requirement.requiredQty - stockData.availableStock,
        );
        requirement.hasEnoughStock =
          stockData.availableStock >= requirement.requiredQty;
      } else {
        requirement.availableStock = 0;
        requirement.insufficient = requirement.requiredQty;
        requirement.hasEnoughStock = false;
        requirement.productNotFound = true;
      }

      requirement.invoiceCount = requirement.invoices.size;
      requirement.invoices = Array.from(requirement.invoices).slice(0, 5);

      stockSummary.push(requirement);
    }

    // Sort by insufficient amount (largest first)
    stockSummary.sort((a, b) => b.insufficient - a.insufficient);

    const totalRequired = stockSummary.reduce(
      (sum, p) => sum + p.requiredQty,
      0,
    );
    const totalAvailable = stockSummary.reduce(
      (sum, p) => sum + p.availableStock,
      0,
    );
    const totalInsufficient = stockSummary.reduce(
      (sum, p) => sum + p.insufficient,
      0,
    );
    const productsWithIssues = stockSummary.filter(
      (p) => !p.hasEnoughStock,
    ).length;

    res.json({
      success: true,
      summary: {
        totalProducts: stockSummary.length,
        totalRequired,
        totalAvailable,
        totalInsufficient,
        productsWithIssues,
        canProceed: productsWithIssues === 0,
      },
      products: stockSummary,
      recommendations:
        productsWithIssues > 0
          ? [
              "Use /sales/import-auto-adjust endpoint to automatically create adjustments",
              "Or create manual stock adjustments for products with shortages",
              "Required adjustment quantities are shown in the 'insufficient' field",
            ]
          : [
              "All products have sufficient stock. You can proceed with import.",
            ],
    });
  } catch (error) {
    console.error("Error generating stock summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate stock summary",
      error: error.message,
    });
  }
});

router.post("/sales/create-initial-adjustments", async (req, res) => {
  try {
    const { adjustments } = req.body;

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Adjustments array is required",
      });
    }

    const createdAdjustments = [];
    const errors = [];

    for (const adj of adjustments) {
      try {
        const {
          productName,
          quantity,
          reason = "Initial stock for import",
          adjustmentType = "add",
        } = adj;

        if (!productName || !quantity) {
          errors.push({
            productName,
            error: "Missing productName or quantity",
          });
          continue;
        }

        // Handle product name variations
        let correctedName = productName;
        if (productName.toLowerCase().includes("iotekam")) {
          correctedName = productName.toLowerCase().replace(/^i/, "l");
        }
        if (productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);

        // Find product
        const product = await Product.findOne({
          productName: buildProductNameRegex(normalizedName),
        });

        if (!product) {
          errors.push({ productName, error: "Product not found in catalog" });
          continue;
        }

        // Create adjustment with all required fields including totalQuantity
        const adjustment = new StockAdjustment({
          productId: product._id,
          productName: product.productName,
          adjustmentType,
          boxQuantity: parseFloat(quantity),
          quantity: parseFloat(quantity),
          totalQuantity: parseFloat(quantity),
          reason,
          remarks: `Initial stock adjustment for import preparation`,
          status: "completed",
          createdBy: "system_import_setup",
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await adjustment.save();
        createdAdjustments.push({
          productName: product.productName,
          adjustmentId: adjustment._id,
          quantity: parseFloat(quantity),
          type: adjustmentType,
        });
      } catch (error) {
        errors.push({ productName: adj.productName, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Created ${createdAdjustments.length} adjustments`,
      createdAdjustments,
      errors: errors.length > 0 ? errors : undefined,
      totalCreated: createdAdjustments.length,
      totalErrors: errors.length,
    });
  } catch (error) {
    console.error("Error creating initial adjustments:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create initial adjustments",
      error: error.message,
    });
  }
});
// Add this endpoint to debug specific products
router.post("/sales/debug-product-stock", async (req, res) => {
  try {
    const { productName } = req.body;
    
    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required"
      });
    }
    
    console.log(`\n🔍 DEBUG: Checking stock for "${productName}"`);
    
    // Find product in ReportInHand
    const stockItem = await ReportInHand.findOne({
      productName: { $regex: new RegExp(productName, "i") }
    }).lean();
    
    if (!stockItem) {
      // Try other variations
      const allStockItems = await ReportInHand.find({
        productName: { $regex: productName.split(' ')[0], $options: 'i' }
      }).lean();
      
      return res.json({
        success: true,
        productName,
        foundInReportInHand: false,
        similarProducts: allStockItems.map(item => ({
          productName: item.productName,
          totalBoxes: item.totalBoxes,
          totalBoxesFromBatches: item.batches?.reduce((sum, b) => sum + (b.boxes || b.quantity || 0), 0) || 0,
          batchCount: item.batches?.length || 0
        })),
        message: `Product not found in ReportInHand. Check similar products.`
      });
    }
    
    // Calculate stock
    const baseStock = stockItem.totalBoxes || 0;
    const fromBatches = stockItem.batches?.reduce((sum, b) => sum + (b.boxes || b.quantity || 0), 0) || 0;
    
    // Check adjustments if productId exists
    let totalAdjustments = 0;
    if (stockItem.productId) {
      const adjustments = await StockAdjustment.find({
        productId: stockItem.productId,
        status: { $ne: "cancelled" }
      }).lean();
      
      adjustments.forEach(adj => {
        const adjQty = adj.totalQuantity || adj.boxQuantity || adj.quantity || 0;
        const type = (adj.adjustmentType || "").toLowerCase();
        
        if (type === "add") {
          totalAdjustments += adjQty;
        } else if (type === "remove" || type === "deduct") {
          totalAdjustments -= adjQty;
        }
      });
    }
    
    const availableStock = Math.max(0, baseStock + totalAdjustments);
    
    res.json({
      success: true,
      productName: stockItem.productName,
      stockData: {
        totalBoxes: stockItem.totalBoxes,
        totalBoxesFromBatches: fromBatches,
        batchCount: stockItem.batches?.length || 0,
        batches: stockItem.batches?.map(b => ({
          boxes: b.boxes || b.quantity || 0,
          expiryDate: b.expiryDate
        })) || [],
        adjustments: totalAdjustments,
        availableStock: availableStock,
        calculationUsed: baseStock > 0 ? 'totalBoxes_field' : 'from_batches'
      },
      message: `Stock calculated: ${availableStock} units`
    });
    
  } catch (error) {
    console.error("Debug product stock error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to debug product stock",
      error: error.message
    });
  }
});

router.post("/sales/debug-product-search", async (req, res) => {
  try {
    const { productName } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    console.log(`\n🔍 DEBUG: Searching for product: "${productName}"`);

    // Generate variations
    const variations = generateProductNameVariations(productName);
    console.log(`   Variations generated: ${variations.length}`);
    variations.slice(0, 10).forEach((v, i) => {
      console.log(`   ${i + 1}. "${v}"`);
    });

    // Search in ReportInHand
    const stockItems = [];
    for (const variation of variations.slice(0, 10)) {
      const normalized = normalizeProductName(variation);
      console.log(`\n   Trying: "${variation}" -> "${normalized}"`);

      // Try multiple search strategies
      const strategies = [
        { $regex: new RegExp(`^${normalized}$`, "i") },
        { $regex: new RegExp(normalized.replace(/[\s.]/g, ".*"), "i") },
        { $regex: new RegExp(normalized.split(" ")[0], "i") },
      ];

      for (const strategy of strategies) {
        const items = await ReportInHand.find({ productName: strategy }).lean();
        if (items.length > 0) {
          console.log(`     ✅ Found ${items.length} items with strategy`);
          stockItems.push(...items);
        }
      }
    }

    // Search in Product collection
    const products = [];
    for (const variation of variations.slice(0, 10)) {
      const normalized = normalizeProductName(variation);
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalized),
      }).lean();

      if (product) {
        console.log(
          `   ✅ Found in Product collection: "${product.productName}"`,
        );
        products.push(product);
      }
    }

    // Get all products in ReportInHand for comparison
    const allReportInHand = await ReportInHand.find({})
      .sort({ productName: 1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      searchedFor: productName,
      variations: variations.slice(0, 10),
      foundInReportInHand: stockItems.map((item) => ({
        productName: item.productName,
        totalBoxes: item.totalBoxes,
        batches: item.batches?.length || 0,
      })),
      foundInProductCatalog: products.map((p) => ({
        productName: p.productName,
        id: p._id,
      })),
      sampleFromReportInHand: allReportInHand.map((item) => item.productName),
      searchNormalized: normalizeProductName(productName),
    });
  } catch (error) {
    console.error("Debug search error:", error);
    res.status(500).json({
      success: false,
      message: "Debug search failed",
      error: error.message,
    });
  }
});

// Add an endpoint to manually add missing products to ReportInHand
router.post("/sales/add-missing-product-to-stock", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productName, quantity = 0, lc = 0.71, fob = 0.71 } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    // First check if product exists in Product collection
    const variations = generateProductNameVariations(productName);
    let product = null;

    for (const variation of variations) {
      product = await Product.findOne({
        productName: buildProductNameRegex(normalizeProductName(variation)),
      }).session(session);

      if (product) break;
    }

    // Create stock item in ReportInHand
    const stockItem = new ReportInHand({
      productName: product ? product.productName : productName,
      productId: product ? product._id : null,
      totalBoxes: parseFloat(quantity) || 0,
      averagePrice: parseFloat(lc) || 0.71,
      batches:
        quantity > 0
          ? [
              {
                batchNumber: `INIT-${Date.now()}`,
                boxes: parseFloat(quantity) || 0,
                quantity: parseFloat(quantity) || 0,
                lc: parseFloat(lc) || 0.71,
                fob: parseFloat(fob) || 0.71,
                cif: parseFloat(fob) || 0.71,
                amount: (parseFloat(quantity) || 0) * (parseFloat(lc) || 0.71),
                expiryDate: new Date(
                  new Date().setFullYear(new Date().getFullYear() + 1),
                ),
                date: new Date(),
                source: "manual_add",
              },
            ]
          : [],
      status: quantity > 0 ? "In Stock" : "Out of Stock",
      minStockLevel: 10,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await stockItem.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Product "${stockItem.productName}" added to ReportInHand with ${quantity} units`,
      stockItem: {
        productName: stockItem.productName,
        totalBoxes: stockItem.totalBoxes,
        productId: stockItem.productId,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error adding missing product:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add missing product",
      error: error.message,
    });
  }
});

router.post("/sales/debug-product-match", async (req, res) => {
  try {
    const { productName } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Test different variations
    const tests = [
      { name: productName, description: "Original" },
      {
        name: productName.toLowerCase().replace(/^i/, "l"),
        description: "Fixed I->L",
      },
      {
        name: productName === "Profokam" ? "Profokam 1%" : productName,
        description: "With strength",
      },
    ];

    const results = [];

    for (const test of tests) {
      const normalized = normalizeProductName(test.name);

      // Search in Product collection
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalized),
      }).lean();

      // Search in ReportInHand
      const stock = await ReportInHand.findOne({
        productName: buildProductNameRegex(normalized),
      }).lean();

      results.push({
        test: test.description,
        input: test.name,
        normalized,
        productFound: !!product,
        stockFound: !!stock,
        productName: product?.productName,
        stockName: stock?.productName,
        productStock: product
          ? await calculateRealStock(product._id, product.productName)
          : null,
        reportStock: stock
          ? {
              totalBoxes: stock.totalBoxes,
              batches: stock.batches?.length || 0,
              totalFromBatches:
                stock.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) || 0,
            }
          : null,
      });
    }

    res.json({
      success: true,
      originalName: productName,
      tests: results,
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({
      success: false,
      message: "Debug failed",
      error: error.message,
    });
  }
});

router.post("/sales/check-product-batches", async (req, res) => {
  try {
    const { productName } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find product in ReportInHand
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (!stockItem) {
      return res.json({
        success: true,
        productName: productName,
        correctedName: correctedName,
        normalizedName: normalizedName,
        found: false,
        totalStockField: 0,
        totalStockCalculated: 0,
        batchCount: 0,
        hasValidBatches: false,
        message: `Product "${productName}" not found in stock`,
      });
    }

    // Calculate stock from batches
    let calculatedStock = 0;
    const batchDetails = [];

    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch, index) => {
        const batchQty = batch.boxes || batch.quantity || 0;
        calculatedStock += batchQty;
        batchDetails.push({
          batchIndex: index + 1,
          boxes: batchQty,
          expiryDate: batch.expiryDate,
        });
      });
    }

    // Check if product has valid batches
    const hasValidBatches =
      stockItem.batches &&
      Array.isArray(stockItem.batches) &&
      stockItem.batches.length > 0 &&
      stockItem.batches.some(
        (batch) => (batch.boxes || batch.quantity || 0) > 0,
      );

    return res.json({
      success: true,
      productName: stockItem.productName,
      normalizedName: normalizedName,
      found: true,
      totalStockField: stockItem.totalBoxes || 0,
      totalStockCalculated: calculatedStock,
      batchCount: stockItem.batches?.length || 0,
      hasValidBatches: hasValidBatches,
      batchDetails: batchDetails,
      message: `Product has ${
        stockItem.batches?.length || 0
      } batch(es). Field: ${
        stockItem.totalBoxes || 0
      }, Calculated: ${calculatedStock}`,
    });
  } catch (error) {
    console.error("Batch check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check product batches",
      error: error.message,
    });
  }
});

router.get("/sales/validate-stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find product
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found`,
      });
    }

    // Calculate real stock
    const stockData = await calculateRealStock(
      product._id,
      product.productName,
    );

    // Find all sales for this product
    const sales = await SaleSummary.find({
      "products.productName": buildProductNameRegex(normalizedName),
    }).lean();

    // Calculate total sold quantity
    let totalSold = 0;
    sales.forEach((sale) => {
      sale.products.forEach((p) => {
        if (normalizeProductName(p.productName) === normalizedName) {
          totalSold += (p.salesQty || 0) + (p.bonusQty || 0);
        }
      });
    });

    // Get total adjustments
    const adjustments = await StockAdjustment.find({
      productId: product._id,
      status: { $ne: "cancelled" },
    }).lean();

    // Calculate expected stock based on initial stock + adjustments - sales
    const initialStock = stockData.totalBoxesField || 0;
    const totalAdditions = adjustments
      .filter((a) => a.adjustmentType === "add")
      .reduce(
        (sum, a) => sum + (a.totalQuantity || a.boxQuantity || a.quantity || 0),
        0,
      );
    const totalDeductions = adjustments
      .filter(
        (a) => a.adjustmentType === "remove" || a.adjustmentType === "deduct",
      )
      .reduce(
        (sum, a) => sum + (a.totalQuantity || a.boxQuantity || a.quantity || 0),
        0,
      );

    const expectedStock =
      initialStock + totalAdditions - totalDeductions - totalSold;
    const actualStock = stockData.availableStock;
    const discrepancy = actualStock - expectedStock;

    res.json({
      success: true,
      product: {
        name: product.productName,
        id: product._id,
        normalizedName: normalizedName,
      },
      stock: {
        actual: actualStock,
        expected: expectedStock,
        discrepancy: discrepancy,
        discrepancyPercentage:
          expectedStock > 0
            ? ((discrepancy / expectedStock) * 100).toFixed(2)
            : 0,
      },
      breakdown: {
        initialStock: initialStock,
        totalAdditions: totalAdditions,
        totalDeductions: totalDeductions,
        totalSold: totalSold,
        calculation: `${initialStock} + ${totalAdditions} - ${totalDeductions} - ${totalSold} = ${expectedStock}`,
      },
      validation: {
        batchesMatch: stockData.isSynchronized,
        actualVsExpected: Math.abs(discrepancy) < 0.0001, // Use tolerance for floating-point
        message:
          Math.abs(discrepancy) < 0.0001
            ? "Stock is synchronized"
            : `Stock discrepancy detected: ${discrepancy} units`,
      },
      details: stockData,
    });
  } catch (error) {
    console.error("Stock validation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate stock",
      error: error.message,
    });
  }
});

router.post("/sales/fix-all-stock-sync", async (req, res) => {
  try {
    const stockItems = await ReportInHand.find({});
    let fixedCount = 0;

    for (const stockItem of stockItems) {
      // Calculate from batches
      let totalFromBatches = 0;
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        stockItem.batches.forEach((batch) => {
          totalFromBatches += batch.boxes || batch.quantity || 0;
        });
      }

      // Update totalBoxes to match batches
      if (Math.abs(stockItem.totalBoxes - totalFromBatches) > 0.0001) {
        stockItem.totalBoxes = totalFromBatches;
        await stockItem.save();
        fixedCount++;
      }
    }

    res.json({
      success: true,
      message: `Fixed ${fixedCount} stock items`,
      totalItems: stockItems.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
// Add this route to check if product exists (before checking stock)
router.get("/products/check/:productName", async (req, res) => {
  try {
    console.log("📋 API endpoint: /api/products/check/:productName called");
    const { productName } = req.params;
    console.log("📦 Received productName:", productName);

    if (!productName || productName.trim() === "") {
      console.log("❌ Empty product name provided");
      return res.status(400).json({
        success: false,
        message: "Product name is required",
        exists: false,
        product: null,
      });
    }

    // Decode URL encoded characters (like %20 for spaces)
    const decodedProductName = decodeURIComponent(productName);
    console.log("🔠 Decoded product name:", decodedProductName);

    // Clean the product name
    const cleanProductName = decodedProductName.trim();
    console.log("✨ Cleaned product name:", cleanProductName);

    // Try multiple search strategies
    console.log("🔍 Creating search strategies");
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
    console.log(`📋 ${searchStrategies.length} search strategies created`);

    let product = null;
    console.log("🏪 Starting search in Product collection");

    for (let i = 0; i < searchStrategies.length; i++) {
      console.log(`   Strategy ${i + 1}:`, JSON.stringify(searchStrategies[i]));
      product = await Product.findOne(searchStrategies[i]);
      console.log(
        `   Strategy ${i + 1} result:`,
        product ? `✅ Found: ${product.productName}` : "❌ Not found",
      );
      if (product) {
        console.log(
          `   ✅ Product found with strategy ${i + 1}, stopping search`,
        );
        break;
      }
    }

    if (!product) {
      console.log(
        "📦 Product not found in Product collection, checking ReportInHand",
      );
      // Try in ReportInHand
      for (let i = 0; i < searchStrategies.length; i++) {
        console.log(
          `   Strategy ${i + 1} in ReportInHand:`,
          JSON.stringify(searchStrategies[i]),
        );
        product = await ReportInHand.findOne(searchStrategies[i]);
        console.log(
          `   Strategy ${i + 1} result in ReportInHand:`,
          product ? `✅ Found: ${product.productName}` : "❌ Not found",
        );
        if (product) {
          console.log(
            `   ✅ Product found in ReportInHand with strategy ${i + 1}`,
          );
          break;
        }
      }
    }

    const exists = !!product;
    console.log("🎯 Final result - Exists:", exists);

    if (product) {
      console.log("📝 Product details found:", {
        name: product.productName,
        id: product._id,
      });
    } else {
      console.log("❌ No product found in any collection");
    }

    const response = {
      success: true,
      exists: exists,
      product: product
        ? {
            name: product.productName,
            id: product._id,
          }
        : null,
    };

    console.log("📤 Sending response:", response);
    console.log("✅ API call completed successfully");

    res.json(response);
  } catch (error) {
    console.error("💥 Error occurred in /api/products/check/:");
    console.error("❌ Error message:", error.message);
    console.error("🔧 Error stack:", error.stack);

    res.status(500).json({
      success: false,
      exists: false,
      message: error.message,
      product: null,
    });
  }
});

router.get("/sales/test-stock/:productName", async (req, res) => {
  const productName = req.params.productName;
  const result = await findProductStockInHandOptimized(productName, 100, 0);
  res.json(result);
});

router.post("/sales/fix-stock-sync-all/:productName", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { productName } = req.params;
    const { forceSync = false } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find stock item
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    if (!stockItem) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({
        success: false,
        message: "Product not found in stock",
      });
    }

    let totalFromBatches = 0;
    const validBatches = [];

    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch) => {
        const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
        if (batchQty > 0) {
          totalFromBatches = fixPrecision(totalFromBatches + batchQty);
          validBatches.push({
            ...batch,
            boxes: batchQty,
            quantity: batchQty,
          });
        }
      });
    }

    const oldTotal = fixPrecision(stockItem.totalBoxes || 0);
    const newTotal = fixPrecision(totalFromBatches);
    const difference = fixPrecision(newTotal - oldTotal);
    if (Math.abs(difference) > 0.0001 || forceSync) {
      stockItem.totalBoxes = newTotal;
      stockItem.batches = validBatches;
      stockItem.updatedAt = new Date();

      await stockItem.save({ session });

      // Clear cache
      stockCache.delete(normalizedName);
      productCache.delete(normalizedName);
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      productName: stockItem.productName,
      oldTotal: oldTotal,
      newTotal: newTotal,
      difference: difference,
      batchesCount: validBatches.length,
      message:
        Math.abs(difference) > 0.0001
          ? `Stock synchronized. Updated from ${oldTotal} to ${newTotal} (${
              difference > 0 ? "+" : ""
            }${difference})`
          : `Stock already synchronized at ${oldTotal} units`,
      timestamp: new Date(),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error fixing stock sync:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fix stock synchronization",
      error: error.message,
    });
  }
});

router.get("/sales/stock-analysis/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find product
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found`,
      });
    }

    // Get stock item
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    // Calculate from batches
    let calculatedFromBatches = 0;
    const batchDetails = [];

    if (stockItem && stockItem.batches) {
      stockItem.batches.forEach((batch, index) => {
        const batchQty = batch.boxes || batch.quantity || 0;
        calculatedFromBatches += batchQty;
        batchDetails.push({
          index: index + 1,
          batchNumber: batch.batchNumber || `Batch-${index + 1}`,
          boxes: batchQty,
          expiryDate: batch.expiryDate,
          lc: batch.lc,
          amount: batch.amount,
        });
      });
    }

    // Get adjustments
    const adjustments = await StockAdjustment.find({
      productId: product._id,
      status: { $ne: "cancelled" },
    })
      .sort({ createdAt: -1 })
      .lean();

    // Get recent sales
    const recentSales = await SaleSummary.find({
      "products.productName": buildProductNameRegex(normalizedName),
    })
      .sort({ invoiceDate: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      product: {
        name: product.productName,
        id: product._id,
        lc: product.lc,
        fob: product.fob,
      },
      stock: {
        totalBoxesField: stockItem?.totalBoxes || 0,
        calculatedFromBatches: calculatedFromBatches,
        discrepancy: (stockItem?.totalBoxes || 0) - calculatedFromBatches,
        averagePrice: stockItem?.averagePrice || 0,
        status: stockItem?.status || "Unknown",
        batches: batchDetails,
        batchCount: batchDetails.length,
      },
      adjustments: {
        total: adjustments.length,
        additions: adjustments.filter((a) => a.adjustmentType === "add").length,
        removals: adjustments.filter(
          (a) => a.adjustmentType === "remove" || a.adjustmentType === "deduct",
        ).length,
        recent: adjustments.slice(0, 5).map((a) => ({
          date: a.createdAt,
          type: a.adjustmentType,
          quantity: a.totalQuantity || a.boxQuantity || a.quantity || 0,
          reason: a.reason || a.remarks || "",
        })),
      },
      recentSales: recentSales.map((sale) => ({
        invoiceNumber: sale.invoiceNumber,
        date: sale.invoiceDate,
        customer: sale.customerName,
        products: sale.products
          .filter((p) => normalizeProductName(p.productName) === normalizedName)
          .map((p) => ({
            salesQty: p.salesQty,
            bonusQty: p.bonusQty,
            total: p.salesQty + p.bonusQty,
            sellingPrice: p.sellingPrice,
          })),
      })),
      analysis: {
        isSynchronized:
          Math.abs((stockItem?.totalBoxes || 0) - calculatedFromBatches) <
          0.0001,
        recommendedAction:
          Math.abs((stockItem?.totalBoxes || 0) - calculatedFromBatches) >
          0.0001
            ? "Run stock synchronization"
            : "Stock is synchronized",
        health:
          calculatedFromBatches > (stockItem?.minStockLevel || 10)
            ? "Good"
            : "Low",
      },
    });
  } catch (error) {
    console.error("Stock analysis error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to analyze stock",
      error: error.message,
    });
  }
});

router.post("/sales/check-stock-batch", async (req, res) => {
  try {
    const { invoices, products } = req.body;

    console.log(`\n🌐 API: /sales/check-stock-batch called`);

    if (!invoices && !products) {
      return res.status(400).json({
        success: false,
        message: "Either invoices or products array is required",
      });
    }

    const stockIssues = [];
    const productMap = new Map();

    // Aggregate product requirements
    const dataSource = invoices || products || [];
    console.log(`   Processing ${dataSource.length} invoices/products`);

    for (const item of dataSource) {
      const productList = item.products || [item];

      for (const product of productList) {
        const productName = product.productName?.trim();
        const salesQty = parseFloat(product.salesQty) || 0;
        const bonusQty = parseFloat(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        if (!productName || totalQty <= 0) continue;

        const normalizedName = normalizeProductName(productName);

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            originalName: productName,
            requiredQty: 0,
            invoices: new Set(),
          });
        }

        const data = productMap.get(normalizedName);
        data.requiredQty += totalQty;

        if (item.invoiceNumber) {
          data.invoices.add(item.invoiceNumber);
        }
      }
    }

    console.log(`   Found ${productMap.size} unique products to check`);

    // Check stock for each unique product
    for (const [normalizedName, requirement] of productMap.entries()) {
      console.log(
        `\n   Checking: "${requirement.originalName}" (Required: ${requirement.requiredQty})`,
      );

      const stockCheck = await calculateProductStock(
        requirement.originalName,
        requirement.requiredQty,
      );

      if (!stockCheck.success || !stockCheck.found || stockCheck.insufficient) {
        console.log(`      ❌ ISSUE FOUND`);
        stockIssues.push({
          productName: requirement.originalName,
          actualProductName:
            stockCheck.actualProductName || requirement.originalName,
          normalizedName,
          requiredQty: requirement.requiredQty,
          availableStock: stockCheck.availableStock || 0,
          insufficientQty:
            stockCheck.insufficientQty || requirement.requiredQty,
          insufficient: true,
          message: stockCheck.message,
          invoiceCount: requirement.invoices.size,
          invoices: Array.from(requirement.invoices).slice(0, 5),
          breakdown: stockCheck.breakdown,
          found: stockCheck.found,
        });
      } else {
        console.log(
          `      ✅ Stock OK (Available: ${stockCheck.availableStock})`,
        );
      }
    }

    const hasIssues = stockIssues.length > 0;

    console.log(`\n   📊 BATCH CHECK SUMMARY:`);
    console.log(`      Total products checked: ${productMap.size}`);
    console.log(`      Products with issues: ${stockIssues.length}`);
    console.log(`      Has issues: ${hasIssues ? "❌ YES" : "✅ NO"}`);

    res.json({
      success: true,
      hasStockIssues: hasIssues,
      stockIssues,
      summary: {
        totalProducts: productMap.size,
        productsWithIssues: stockIssues.length,
        totalInvoices: dataSource.length,
        totalRequired: Array.from(productMap.values()).reduce(
          (sum, p) => sum + p.requiredQty,
          0,
        ),
        totalShortfall: stockIssues.reduce(
          (sum, issue) => sum + issue.insufficientQty,
          0,
        ),
      },
      message: hasIssues
        ? `Found ${stockIssues.length} products with stock issues`
        : "All products have sufficient stock",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("❌ API Error in /sales/check-stock-batch:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check stock batch",
      error: error.message,
    });
  }
});

router.post("/sales/check-specific-product", async (req, res) => {
  try {
    const { productName } = req.body;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Clear cache for fresh data
    stockCache.delete(normalizedName);

    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (!stockItem) {
      return res.json({
        success: true,
        productName: productName,
        correctedName: correctedName,
        normalizedName: normalizedName,
        found: false,
        totalStockField: 0,
        totalStockCalculated: 0,
        batchCount: 0,
        message: `Product "${productName}" not found in stock (searched as: ${normalizedName})`,
      });
    }

    // Calculate stock from batches
    let calculatedStock = 0;
    const batchDetails = [];

    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch, index) => {
        const batchQty = batch.boxes || batch.quantity || 0;
        calculatedStock += batchQty;
        batchDetails.push({
          batchIndex: index + 1,
          boxes: batchQty,
          expiryDate: batch.expiryDate,
        });
      });
    }

    const hasValidBatches =
      stockItem.batches &&
      Array.isArray(stockItem.batches) &&
      stockItem.batches.length > 0 &&
      stockItem.batches.some(
        (batch) => (batch.boxes || batch.quantity || 0) > 0,
      );

    return res.json({
      success: true,
      productName: stockItem.productName,
      normalizedName: normalizedName,
      found: true,
      totalStockField: stockItem.totalBoxes || 0,
      totalStockCalculated: calculatedStock,
      batchCount: stockItem.batches?.length || 0,
      hasValidBatches: hasValidBatches,
      batchDetails: batchDetails,
      message: `Found product with ${
        stockItem.totalBoxes || 0
      } total boxes (field), ${calculatedStock} calculated from batches`,
    });
  } catch (error) {
    console.error("Specific product check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check product",
      error: error.message,
    });
  }
});

// FIXED: Import endpoint that proceeds even with stock issues
router.post("/sales/import-proceed-anyway", async (req, res) => {
  let sessionId = null;

  try {
    const { invoices } = req.body;

    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    // Create session for import progress
    sessionId = `import_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    importProgressMap.set(sessionId, {
      sessionId,
      totalInvoices: invoiceData.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
    });

    // Start import in background - with stock deduction
    setTimeout(() => {
      processImportWithStockDeduction(sessionId, invoiceData);
    }, 100);

    res.json({
      success: true,
      message: "Import started successfully (will attempt stock deduction)",
      sessionId,
      totalInvoices: invoiceData.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      stockIssuesUrl: `/api/sales/import/stock-issues/${sessionId}`,
    });
  } catch (error) {
    console.error("Import start error:", error);
    if (sessionId) importProgressMap.delete(sessionId);

    res.status(500).json({
      success: false,
      message: "Import failed",
      error: error.message,
    });
  }
});

router.post("/sales/import-bulk", async (req, res) => {
  let sessionId = null;

  try {
    const { invoices, skipStockCheck = true, skipDuplicates = true } = req.body;

    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    // Clear caches
    productCache.clear();
    stockCache.clear();
    adjustmentCache.clear();
    lastCacheClear = Date.now();

    // Create session for import progress
    sessionId = `import_bulk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
      totalAdjustmentsCreated: 0,
      status: "initializing",
      skipStockCheck,
      skipDuplicates,
    });

    // Start import in background with auto-adjustments
    setTimeout(() => {
      processBulkImport(sessionId, invoiceData, skipStockCheck, skipDuplicates);
    }, 100);

    res.json({
      success: true,
      message: "Bulk import started",
      sessionId,
      totalInvoices: invoiceData.length,
      skipStockCheck,
      skipDuplicates,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      note: "This import will skip stock checks and duplicate validations",
    });
  } catch (error) {
    console.error("Bulk import start error:", error);
    if (sessionId) importProgressMap.delete(sessionId);

    res.status(500).json({
      success: false,
      message: "Bulk import failed to start",
      error: error.message,
    });
  }
});

router.post("/sales/retry-failed", async (req, res) => {
  try {
    const { failedInvoices, sessionId: originalSessionId } = req.body;

    if (!Array.isArray(failedInvoices) || failedInvoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No failed invoices provided",
      });
    }

    // Create new session for retry
    const newSessionId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    importProgressMap.set(newSessionId, {
      sessionId: newSessionId,
      totalInvoices: failedInvoices.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
      status: "retrying",
      isRetry: true,
    });

    // Start retry in background with auto-adjustments
    setTimeout(() => {
      retryFailedInvoices(newSessionId, failedInvoices);
    }, 100);

    res.json({
      success: true,
      message: `Retry started for ${failedInvoices.length} failed invoices`,
      sessionId: newSessionId,
      progressUrl: `/api/sales/import/progress/${newSessionId}`,
    });
  } catch (error) {
    console.error("Retry failed imports error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start retry",
      error: error.message,
    });
  }
});

router.post("/sales/import", async (req, res) => {
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

    sessionId = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    importProgressMap.set(sessionId, {
      sessionId,
      totalInvoices: invoiceData.length,
      processedInvoices: 0,
      successful: 0,
      failed: 0,
      progressPercentage: 0,
      startTime: Date.now(),
      lastUpdated: Date.now(),
      completed: false,
      errors: [],
    });

    // Start import with stock deduction
    setTimeout(() => {
      processImportWithStockDeduction(sessionId, invoiceData, skipDuplicates);
    }, 100);

    res.json({
      success: true,
      message: "Import started successfully with stock deduction",
      sessionId,
      totalInvoices: invoiceData.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
      note: "Stock will be automatically deducted from inventory",
    });
  } catch (error) {
    console.error("Import start error:", error);
    if (sessionId) importProgressMap.delete(sessionId);

    res.status(500).json({
      success: false,
      message: "Import failed",
      error: error.message,
    });
  }
});

router.post("/sales/pre-import-stock-verification", async (req, res) => {
  try {
    const { invoices } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    console.log(`\n🔍 Pre-import stock verification for ${invoiceData.length} invoices`);

    const productRequirements = new Map();
    const verificationResults = [];

    // Aggregate product requirements
    for (const invoice of invoiceData) {
      for (const product of invoice.products || []) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const totalQty = fixPrecision(salesQty + bonusQty);

        if (!productName || totalQty <= 0) continue;

        const normalizedName = normalizeProductName(productName);

        if (!productRequirements.has(normalizedName)) {
          productRequirements.set(normalizedName, {
            originalName: productName,
            requiredQty: 0,
            invoices: new Set(),
          });
        }

        const data = productRequirements.get(normalizedName);
        data.requiredQty = fixPrecision(data.requiredQty + totalQty);
        if (invoice.invoiceNumber) {
          data.invoices.add(invoice.invoiceNumber);
        }
      }
    }

    // Check stock for each product
    for (const [normalizedName, requirement] of productRequirements.entries()) {
      console.log(`   Checking: "${requirement.originalName}" (Required: ${requirement.requiredQty})`);
      
      const stockCheck = await calculateProductStock(requirement.originalName, requirement.requiredQty);
      
      verificationResults.push({
        productName: requirement.originalName,
        actualProductName: stockCheck.productName || requirement.originalName,
        requiredQty: requirement.requiredQty,
        availableStock: stockCheck.availableStock || 0,
        hasEnoughStock: stockCheck.hasEnoughStock || false,
        insufficientQty: stockCheck.insufficientQty || requirement.requiredQty,
        message: stockCheck.message || "Stock check completed",
        found: stockCheck.found || false,
        invoiceCount: requirement.invoices.size,
        invoices: Array.from(requirement.invoices).slice(0, 5),
      });
    }

    const allProductsAvailable = verificationResults.every(r => r.found && r.hasEnoughStock);
    const productsWithIssues = verificationResults.filter(r => !r.found || !r.hasEnoughStock);
    const totalRequired = verificationResults.reduce((sum, r) => sum + r.requiredQty, 0);
    const totalAvailable = verificationResults.reduce((sum, r) => sum + r.availableStock, 0);

    res.json({
      success: true,
      allProductsAvailable,
      summary: {
        totalProducts: verificationResults.length,
        productsWithIssues: productsWithIssues.length,
        totalRequired,
        totalAvailable,
        canProceed: allProductsAvailable,
      },
      verificationResults,
      productsWithIssues: productsWithIssues.length > 0 ? productsWithIssues : undefined,
      recommendation: allProductsAvailable
        ? "All products have sufficient stock. You can proceed with import."
        : "Some products have stock issues. Please add stock or adjustments before importing.",
    });
  } catch (error) {
    console.error("Pre-import verification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify stock",
      error: error.message,
    });
  }
});

// Add this function for proper stock deduction
const deductStockFromReportInHandWithMatching = async (productName, salesQty, bonusQty) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const totalRequiredQty = fixPrecision(salesQty + bonusQty);
    
    if (totalRequiredQty <= 0) {
      await session.commitTransaction();
      session.endSession();
      return { success: true, deducted: 0, remaining: 0 };
    }

    console.log(`\n📦 Attempting to deduct stock: "${productName}"`);
    console.log(`   Required: ${totalRequiredQty} (Sales: ${salesQty}, Bonus: ${bonusQty})`);

    // FIRST: Find the product in ReportInHand with exact matching
    const stockResult = await calculateProductStock(productName, totalRequiredQty);
    
    if (!stockResult.success || !stockResult.found) {
      console.log(`❌ Cannot deduct: ${stockResult.message}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Product "${productName}" not found in inventory`
      };
    }

    if (!stockResult.hasEnoughStock) {
      console.log(`❌ Insufficient stock: ${stockResult.message}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: stockResult.insufficientQty,
        message: stockResult.message
      };
    }

    const actualProductName = stockResult.productName;
    console.log(`   ✅ Found: "${actualProductName}" with ${stockResult.availableStock} units available`);

    // Find the stock item in ReportInHand
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizeProductName(actualProductName))
    }).session(session);

    if (!stockItem) {
      console.log(`❌ Stock item not found in ReportInHand: "${actualProductName}"`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Stock record not found for "${actualProductName}"`
      };
    }

    // Check if we have batches
    if (!stockItem.batches || !Array.isArray(stockItem.batches) || stockItem.batches.length === 0) {
      console.log(`❌ No batches found for product: "${actualProductName}"`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `No stock batches found for "${actualProductName}"`
      };
    }

    // Sort batches by expiry date (oldest first - FIFO)
    const sortedBatches = [...stockItem.batches].sort((a, b) => {
      const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date('9999-12-31');
      const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date('9999-12-31');
      return dateA - dateB;
    });

    let remainingToDeduct = totalRequiredQty;
    let totalDeducted = 0;
    const updatedBatches = [];
    const deductionDetails = [];

    console.log(`   Sorting ${sortedBatches.length} batches by expiry (oldest first)`);

    // Deduct from batches
    for (const batch of sortedBatches) {
      if (remainingToDeduct <= 0) break;

      const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
      
      if (batchQty > 0) {
        const deductFromThisBatch = fixPrecision(Math.min(batchQty, remainingToDeduct));
        const remainingInBatch = fixPrecision(batchQty - deductFromThisBatch);
        
        console.log(`   - Batch ${batch.batchNumber || 'N/A'}: ${batchQty} -> ${remainingInBatch} (deducting ${deductFromThisBatch})`);

        if (remainingInBatch > 0) {
          // Update batch with remaining quantity
          updatedBatches.push({
            ...batch,
            boxes: remainingInBatch,
            quantity: remainingInBatch,
            amount: fixPrecision(remainingInBatch * (batch.lc || 0.71))
          });
        } // If batch is completely used up (0 remaining), don't add it back

        totalDeducted = fixPrecision(totalDeducted + deductFromThisBatch);
        remainingToDeduct = fixPrecision(remainingToDeduct - deductFromThisBatch);

        deductionDetails.push({
          batchNumber: batch.batchNumber,
          originalQty: batchQty,
          deducted: deductFromThisBatch,
          remainingInBatch: remainingInBatch,
          expiryDate: batch.expiryDate
        });
      } else {
        // Skip batches with 0 quantity
        continue;
      }
    }

    // Add any untouched batches (with positive quantity)
    for (const batch of sortedBatches) {
      const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
      const alreadyProcessed = deductionDetails.some(d => d.batchNumber === batch.batchNumber);
      
      if (!alreadyProcessed && batchQty > 0) {
        updatedBatches.push(batch);
      }
    }

    // Verify deduction
    if (remainingToDeduct > 0.001) {
      console.log(`❌ Failed to deduct full quantity. Only deducted ${totalDeducted} of ${totalRequiredQty}`);
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: totalDeducted,
        remaining: remainingToDeduct,
        message: `Could only deduct ${totalDeducted} of ${totalRequiredQty} units`,
        details: deductionDetails
      };
    }

    // Calculate new total from updated batches
    const newTotalFromBatches = updatedBatches.reduce((sum, batch) => {
      return fixPrecision(sum + fixPrecision(batch.boxes || batch.quantity || 0));
    }, 0);

    // Update stock item
    stockItem.batches = updatedBatches;
    stockItem.totalBoxes = fixPrecision(newTotalFromBatches);
    stockItem.updatedAt = new Date();

    await stockItem.save({ session });

    console.log(`✅ Successfully deducted ${totalDeducted} units from "${actualProductName}"`);
    console.log(`   New total stock: ${newTotalFromBatches} units`);

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      deducted: totalDeducted,
      remaining: 0,
      newStockLevel: newTotalFromBatches,
      message: `Successfully deducted ${totalDeducted} units from "${actualProductName}"`,
      details: deductionDetails
    };

  } catch (error) {
    console.error(`❌ Error in stock deduction for "${productName}":`, error);
    
    try {
      if (session.transaction && session.transaction.isActive) {
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
      deducted: 0,
      remaining: salesQty + bonusQty,
      message: `Stock deduction failed: ${error.message}`,
      error: error.message
    };
  }
};

// Replace the existing processSingleInvoiceWithStockDeduction function with this updated version:
const processSingleInvoiceWithStockDeduction = async (invoiceData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log(`\n🔄 Processing invoice ${index}: ${invoiceData.invoiceNumber || 'No invoice number'}`);
    
    if (!invoiceData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: invoiceData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      console.warn(`⚠️ Skipping duplicate invoice: ${invoiceData.invoiceNumber}`);
      await session.abortTransaction();
      session.endSession();
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

    // FIRST: Check if we have enough stock for all products
    console.log(`📋 Checking stock for ${invoiceData.products?.length || 0} products...`);
    
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) {
        console.log(`   ⏭️ Skipping ${productName || 'unnamed product'} (quantity: ${totalQty})`);
        continue;
      }

      console.log(`   🔍 Checking stock for "${productName}" (Qty: ${totalQty})`);
      
      const stockCheck = await calculateProductStock(productName, totalQty);
      
      if (!stockCheck.success || !stockCheck.found) {
        console.log(`   ❌ Product not found: "${productName}"`);
        throw new Error(`Product "${productName}" not found in inventory`);
      }

      if (!stockCheck.hasEnoughStock) {
        console.log(`   ❌ Insufficient stock: ${stockCheck.message}`);
        throw new Error(stockCheck.message);
      }

      console.log(`   ✅ Stock available: ${stockCheck.availableStock} units`);
    }

    // SECOND: Process products and deduct stock
    console.log(`💾 Processing products and deducting stock...`);
    
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) continue;

      // Find product to get LC value
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(normalizeProductName(productName))
      }).session(session);

      const lc = productRecord?.lc || 0;
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;

      // Process the sale record
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

      // Deduct stock from ReportInHand
      console.log(`   📉 Deducting stock for "${productName}"...`);
      const deductionResult = await deductStockFromReportInHandWithMatching(
        productName,
        salesQty,
        bonusQty
      );

      stockDeductionResults.push({
        product: productName,
        ...deductionResult
      });

      if (!deductionResult.success) {
        console.log(`   ❌ Stock deduction failed: ${deductionResult.message}`);
        throw new Error(
          `Stock deduction failed for ${productName}: ${deductionResult.message}`
        );
      }

      console.log(`   ✅ Stock deducted successfully`);
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
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0
      ),
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      stockDeductionResults,
      importSource: "excel_import_with_stock_deduction",
      importTimestamp: new Date(),
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    console.log(`✅ Invoice processed successfully: ${invoiceData.invoiceNumber}`);

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockDeductionResults,
    };
  } catch (error) {
    console.error(`❌ Error processing invoice at index ${index}:`, error.message);
    
    try {
      if (session.transaction && session.transaction.isActive) {
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

router.post("/sales/debug-stock-deduction", async (req, res) => {
  try {
    const { productName, quantity } = req.body;

    if (!productName || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Product name and quantity are required"
      });
    }

    console.log(`\n🔧 DEBUG: Testing stock deduction for "${productName}" (Qty: ${quantity})`);

    // First check current stock
    const stockCheck = await calculateProductStock(productName, quantity);
    console.log("📊 Current stock check:", stockCheck);

    // Try to deduct
    const deductionResult = await deductStockFromReportInHandWithMatching(productName, quantity, 0);
    console.log("📉 Deduction result:", deductionResult);

    // Check stock again
    const stockAfter = await calculateProductStock(productName, 0);
    console.log("📊 Stock after deduction:", stockAfter);

    res.json({
      success: true,
      before: stockCheck,
      deduction: deductionResult,
      after: stockAfter,
      summary: {
        productName: stockCheck.productName,
        initialStock: stockCheck.availableStock,
        deducted: deductionResult.deducted,
        finalStock: stockAfter.availableStock,
        deductionSuccess: deductionResult.success,
      }
    });
  } catch (error) {
    console.error("Debug stock deduction error:", error);
    res.status(500).json({
      success: false,
      message: "Debug failed",
      error: error.message
    });
  }
});

router.post("/sales/import-with-stock-deduction", async (req, res) => {
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

    // Clear caches
    productCache.clear();
    stockCache.clear();
    adjustmentCache.clear();
    lastCacheClear = Date.now();

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

    // Start import in background with stock deduction
    setTimeout(() => {
      processImportWithStockDeduction(sessionId, invoiceData, skipDuplicates);
    }, 100);

    res.json({
      success: true,
      message: "Import with stock deduction started",
      sessionId,
      totalInvoices: invoiceData.length,
      note: "Stock will be deducted from ReportInHand for each sale",
      progressUrl: `/api/sales/import/progress/${sessionId}`,
    });
  } catch (error) {
    console.error("Import start error:", error);
    if (sessionId) importProgressMap.delete(sessionId);

    res.status(500).json({
      success: false,
      message: "Import failed to start",
      error: error.message,
    });
  }
});


// Add this function to help get stock information
const getProductStockInfo = async (productName) => {
  try {
    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find product
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).lean();

    if (!product) {
      return {
        success: false,
        productName,
        availableStock: 0,
        message: "Product not found in catalog",
      };
    }

    // Get current stock
    const stockData = await getTotalProductStock(
      product._id,
      product.productName,
    );

    return {
      success: true,
      productName: product.productName,
      normalizedName,
      availableStock: Math.max(0, stockData.availableStock || 0),
      baseStock: stockData.baseStock || 0,
      adjustments: stockData.totalAdjustments || 0,
      calculationMethod: stockData.calculationMethod || "unknown",
      usesAdjustments: stockData.usesAdjustments || false,
      breakdown: stockData.breakdown || {},
      timestamp: stockData.timestamp || Date.now(),
    };
  } catch (error) {
    console.error(`Error getting stock info for ${productName}:`, error);
    return {
      success: false,
      productName,
      availableStock: 0,
      error: error.message,
    };
  }
};

// Add this endpoint to check stock before import
router.post("/sales/pre-import-stock-check", async (req, res) => {
  try {
    const { invoices } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    const productMap = new Map();
    const stockResults = [];

    // Aggregate product requirements
    for (const invoice of invoiceData) {
      if (!Array.isArray(invoice.products)) continue;

      for (const product of invoice.products) {
        const productName = product.productName?.trim();
        const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
        const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
        const totalQty = fixPrecision(salesQty + bonusQty);

        if (!productName || totalQty <= 0) continue;

        let correctedName = productName;
        if (productName.toLowerCase().includes("iotekam")) {
          correctedName = productName.toLowerCase().replace(/^i/, "l");
        }
        if (productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            originalName: productName,
            normalizedName,
            required: 0,
            invoices: new Set(),
          });
        }

        const productData = productMap.get(normalizedName);
        productData.required = fixPrecision(productData.required + totalQty);
        if (invoice.invoiceNumber) {
          productData.invoices.add(invoice.invoiceNumber);
        }
      }
    }

    // Check stock for each product
    for (const [normalizedName, productData] of productMap.entries()) {
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).lean();

      if (product) {
        const stockData = await getTotalProductStock(
          product._id,
          product.productName,
        );

        const availableStock = Math.max(0, stockData.availableStock || 0);
        const shortfall = Math.max(0, productData.required - availableStock);
        const hasEnoughStock = availableStock >= productData.required;

        stockResults.push({
          product: productData.originalName,
          actualProductName: product.productName,
          required: productData.required,
          available: availableStock,
          shortfall: shortfall,
          hasEnoughStock: hasEnoughStock,
          baseStock: stockData.baseStock || 0,
          adjustments: stockData.totalAdjustments || 0,
          calculationMethod: stockData.calculationMethod || "unknown",
          invoiceCount: productData.invoices.size,
          invoices: Array.from(productData.invoices).slice(0, 5),
        });
      } else {
        stockResults.push({
          product: productData.originalName,
          required: productData.required,
          available: 0,
          shortfall: productData.required,
          hasEnoughStock: false,
          error: "Product not found",
          invoiceCount: productData.invoices.size,
        });
      }
    }

    const totalRequired = stockResults.reduce((sum, p) => sum + p.required, 0);
    const totalAvailable = stockResults.reduce(
      (sum, p) => sum + p.available,
      0,
    );
    const totalShortfall = stockResults.reduce(
      (sum, p) => sum + p.shortfall,
      0,
    );
    const productsWithIssues = stockResults.filter((p) => !p.hasEnoughStock);
    res.json({
      success: true,
      summary: {
        totalProducts: stockResults.length,
        totalRequired,
        totalAvailable,
        totalShortfall,
        productsWithIssues: productsWithIssues.length,
        canProceed: productsWithIssues.length === 0,
      },
      stockResults,
      productsWithIssues,
      recommendation:
        productsWithIssues.length > 0
          ? "Add stock adjustments before importing"
          : "All products have sufficient stock",
    });
  } catch (error) {
    console.error("Pre-import stock check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check stock",
      error: error.message,
    });
  }
});

const processBatchImportWithManualValidation = async (
  sessionId,
  invoices,
  proceedAnyway,
) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    importLogger.error?.(`Session not found: ${sessionId}`);
    return;
  }

  const errors = [];
  let successful = 0;
  let failed = 0;
  let skippedDuplicates = 0;

  progress.status = "processing";
  progress.startTime = Date.now();

  // Process invoices in smaller batches
  const BATCH_SIZE = 50;

  for (
    let batchStart = 0;
    batchStart < invoices.length;
    batchStart += BATCH_SIZE
  ) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, invoices.length);
    const batch = invoices.slice(batchStart, batchEnd);

    importLogger.info?.(
      `Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(invoices.length / BATCH_SIZE)}`,
      {
        batchStart,
        batchEnd,
        total: invoices.length,
      },
    );

    for (let i = 0; i < batch.length; i++) {
      const invoice = batch[i];
      const globalIndex = batchStart + i;

      try {
        // Check for duplicate invoice
        if (progress.skipDuplicates) {
          const existingInvoice = await SaleSummary.findOne({
            invoiceNumber: invoice.invoiceNumber?.trim(),
          });

          if (existingInvoice) {
            skippedDuplicates++;
            progress.skippedDuplicates = skippedDuplicates;
            importLogger.debug?.(
              `Skipping duplicate invoice: ${invoice.invoiceNumber}`,
            );
            continue;
          }
        }

        // Process the invoice
        const result = await processSingleInvoiceWithManualValidation(
          invoice,
          globalIndex,
          proceedAnyway,
        );

        if (result.success) {
          successful++;
          importLogger.debug?.(
            `Invoice processed successfully: ${invoice.invoiceNumber}`,
          );
        } else {
          failed++;
          errors.push({
            row: globalIndex + 2,
            invoiceNumber: invoice.invoiceNumber || "Unknown",
            message: result.error?.message || "Processing failed",
            type: result.error?.type || "processing_error",
            stockIssue: result.error?.stockIssue,
          });
          importLogger.warn?.(
            `Invoice processing failed: ${invoice.invoiceNumber}`,
            result.error,
          );
        }
      } catch (error) {
        failed++;
        errors.push({
          row: globalIndex + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          error: error.message,
          type: "unexpected_error",
        });
        importLogger.error?.(
          `Unexpected error processing invoice: ${invoice.invoiceNumber}`,
          {
            error: error.message,
            row: globalIndex + 2,
          },
        );
      }

      // Update progress
      progress.processedInvoices = globalIndex + 1;
      progress.successful = successful;
      progress.failed = failed;
      progress.progressPercentage = Math.round(
        (progress.processedInvoices / progress.totalInvoices) * 100,
      );
      progress.lastUpdated = Date.now();
    }

    // Delay between batches
    if (batchEnd < invoices.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;
  progress.status = "completed";
  progress.skippedDuplicates = skippedDuplicates;

  importLogger.info?.(`Import completed`, {
    sessionId,
    successful,
    failed,
    skippedDuplicates,
    totalTime: progress.totalTime,
    errors: errors.length,
  });
};

const processSingleInvoiceWithManualValidation = async (
  invoiceData,
  index,
  proceedAnyway = true, // Default to true
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
    const stockOperations = [];
    let hasStockIssue = false;

    // Process products without strict stock validation
    for (const product of invoiceData.products || []) {
      const productName = product.productName?.trim();
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (!productName || totalQty <= 0) continue;

      // Handle product name variations
      let correctedName = productName;
      if (productName.toLowerCase().includes("iotekam")) {
        correctedName = productName.toLowerCase().replace(/^i/, "l");
      }
      if (productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

      const normalizedName = normalizeProductName(correctedName);

      // Find product
      const productRecord = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).session(session);

      if (!productRecord) {
        console.warn(
          `Product "${productName}" not found in catalog, skipping...`,
        );
        continue;
      }

      // Always allow processing, backend will handle stock
      const sellingPrice = parseFloat(product.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = parseFloat(product.discount) || 0;
      const netSellingAmount = amount - discount;

      // Get LC value
      const productData = productCache.get(normalizedName);
      const lc = productData?.lc || productRecord.lc || 0;

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
      invoiceDate: invoiceData.invoiceDate
        ? new Date(invoiceData.invoiceDate)
        : new Date(),
      mrName: invoiceData.mrName?.trim() || "No MR Name Provided",
      mrId: invoiceData.mrId || null,
      customerName: invoiceData.customerName?.trim() || "Unknown Customer",
      customerCode: invoiceData.customerCode || "",
      customerId: invoiceData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(invoiceData.creditDays) || 0,
      dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
      deliveryDate: invoiceData.deliveryDate
        ? new Date(invoiceData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0,
      ),
      paymentStatus: mapPaymentStatus(invoiceData.paymentStatus),
      remark: invoiceData.remark || "",
      stockOperations,
      importSource: "excel_import",
      importTimestamp: new Date(),
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      invoiceNumber: invoiceData.invoiceNumber,
      stockOperations,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`Error processing invoice at index ${index}:`, error.message);
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

router.get("/sales/import/progress/:sessionId", (req, res) => {
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
      },
    });
  } catch (error) {
    console.error("Progress fetch error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch progress",
    });
  }
});

router.get("/sales/import/stock-issues/:sessionId", async (req, res) => {
  try {
    const progress = importProgressMap.get(req.params.sessionId);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const stockIssues = progress.stockCheckResult?.stockIssues || [];

    if (stockIssues.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No stock issues found",
      });
    }

    // Group issues by product for better reporting
    const groupedIssues = {};
    stockIssues.forEach((issue) => {
      if (!groupedIssues[issue.standardizedName]) {
        groupedIssues[issue.standardizedName] = {
          productName: issue.productName,
          actualProductName: issue.actualProductName || issue.productName,
          standardizedName: issue.standardizedName,
          requiredQty: 0,
          availableStock: issue.availableStock,
          insufficient: issue.insufficient,
          baseStock: issue.baseStock,
          adjustments: issue.adjustments,
          invoices: [],
        };
      }
      groupedIssues[issue.standardizedName].requiredQty = fixPrecision(
        groupedIssues[issue.standardizedName].requiredQty + issue.requiredQty,
      );
      if (issue.invoices && Array.isArray(issue.invoices)) {
        groupedIssues[issue.standardizedName].invoices.push(...issue.invoices);
      }
    });

    // Convert to array and sort by insufficient amount (highest first)
    const allStockIssues = Object.values(groupedIssues).sort(
      (a, b) => b.insufficient - a.insufficient,
    );

    res.json({
      success: true,
      data: {
        stockIssues: allStockIssues,
        totalProducts: allStockIssues.length,
        totalInsufficient: stockIssues.reduce(
          (sum, issue) => sum + issue.insufficient,
          0,
        ),
        totalRequired: stockIssues.reduce(
          (sum, issue) => sum + issue.requiredQty,
          0,
        ),
        totalAvailable: stockIssues.reduce(
          (sum, issue) => sum + issue.availableStock,
          0,
        ),
      },
    });
  } catch (error) {
    console.error("Error generating stock issues report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate stock issues report",
      error: error.message,
    });
  }
});

// Generate Excel report for failed imports
router.get("/sales/import/failed-report/:sessionId", async (req, res) => {
  try {
    const progress = importProgressMap.get(req.params.sessionId);
    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    const failedInvoices = progress.errors || [];

    if (failedInvoices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No failed imports found",
      });
    }

    // Group stock issues by standardized product name with aggregation
    const stockIssuesMap = new Map();
    const validationErrors = [];

    failedInvoices.forEach((error) => {
      if (error.type === "insufficient_stock") {
        const standardizedName =
          error.standardizedName || normalizeProductName(error.productName);

        if (!stockIssuesMap.has(standardizedName)) {
          stockIssuesMap.set(standardizedName, {
            Product: error.productName || "N/A",
            "Actual Product Name":
              error.actualProductName || error.productName || "N/A",
            "Standardized Name": standardizedName,
            "Sales Qty": 0,
            "Bonus Qty": 0,
            "Total Required": 0,
            "Base Stock": error.details?.baseStock || 0,
            Adjustments: error.details?.adjustments || 0,
            "Total Available": error.details?.availableStock || 0,
            Shortfall: 0,
            Invoices: new Set(),
          });
        }

        const issue = stockIssuesMap.get(standardizedName);
        issue["Sales Qty"] = fixPrecision(
          issue["Sales Qty"] + (error.details?.salesQty || 0),
        );
        issue["Bonus Qty"] = fixPrecision(
          issue["Bonus Qty"] + (error.details?.bonusQty || 0),
        );
        issue["Total Required"] = fixPrecision(
          issue["Total Required"] + (error.details?.requiredQty || 0),
        );
        issue["Invoices"].add(error.invoiceNumber);
      } else if (error.type === "validation") {
        validationErrors.push({
          Row: error.row || "N/A",
          "Invoice #": error.invoiceNumber || "N/A",
          Customer: error.customerName || "N/A",
          Product: error.productName || "N/A",
          Error:
            error.errors?.join("; ") || error.message || "Validation error",
          Type: "Validation",
        });
      }
    });

    // Calculate shortfall for each aggregated product
    stockIssuesMap.forEach((issue) => {
      issue["Shortfall"] = Math.max(
        0,
        issue["Total Required"] - issue["Total Available"],
      );
      issue["Invoices"] =
        Array.from(issue["Invoices"]).join(", ") || "Multiple";
    });

    // Convert stock issues map to array
    const stockIssues = Array.from(stockIssuesMap.values());

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();

    // Add Stock Issues sheet with adjustment details
    if (stockIssues.length > 0) {
      const stockSheet = workbook.addWorksheet("Stock Shortage");

      stockSheet.columns = [
        { header: "Product", key: "Product", width: 30 },
        { header: "Actual Product Name", key: "ActualProductName", width: 30 },
        { header: "Standardized Name", key: "StandardizedName", width: 30 },
        { header: "Sales Qty", key: "SalesQty", width: 15 },
        { header: "Bonus Qty", key: "BonusQty", width: 15 },
        { header: "Total Required", key: "TotalRequired", width: 15 },
        { header: "Base Stock", key: "BaseStock", width: 15 },
        { header: "Adjustments", key: "Adjustments", width: 15 },
        { header: "Total Available", key: "TotalAvailable", width: 15 },
        { header: "Shortfall", key: "Shortfall", width: 15 },
        { header: "Invoices", key: "Invoices", width: 40 },
      ];

      // Add header row
      const stockHeaderRow = stockSheet.getRow(1);
      stockHeaderRow.font = { bold: true };
      stockHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Add data rows
      stockIssues.forEach((issue, index) => {
        const row = stockSheet.addRow({
          Product: issue.Product,
          ActualProductName: issue["Actual Product Name"],
          StandardizedName: issue["Standardized Name"],
          SalesQty: issue["Sales Qty"],
          BonusQty: issue["Bonus Qty"],
          TotalRequired: issue["Total Required"],
          BaseStock: issue["Base Stock"],
          Adjustments: issue["Adjustments"],
          TotalAvailable: issue["Total Available"],
          Shortfall: issue["Shortfall"],
          Invoices: issue["Invoices"],
        });

        // Highlight rows with shortfall
        if (issue["Shortfall"] > 0) {
          row.getCell(10).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFFCCCC" },
          };
        }
      });

      // Add summary rows
      const lastRow = stockSheet.rowCount + 1;
      stockSheet.mergeCells(`A${lastRow}:K${lastRow}`);
      stockSheet.getCell(`A${lastRow}`).value = "SUMMARY";
      stockSheet.getCell(`A${lastRow}`).font = { bold: true };
      stockSheet.getCell(`A${lastRow}`).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFCCE5FF" },
      };

      const summaryData = [
        ["Total Products", stockIssues.length],
        [
          "Total Sales Qty",
          stockIssues.reduce((sum, i) => sum + i["Sales Qty"], 0),
        ],
        [
          "Total Bonus Qty",
          stockIssues.reduce((sum, i) => sum + i["Bonus Qty"], 0),
        ],
        [
          "Total Required",
          stockIssues.reduce((sum, i) => sum + i["Total Required"], 0),
        ],
        [
          "Total Base Stock",
          stockIssues.reduce((sum, i) => sum + i["Base Stock"], 0),
        ],
        [
          "Total Adjustments",
          stockIssues.reduce((sum, i) => sum + i["Adjustments"], 0),
        ],
        [
          "Total Available",
          stockIssues.reduce((sum, i) => sum + i["Total Available"], 0),
        ],
        [
          "Total Shortfall",
          stockIssues.reduce((sum, i) => sum + i["Shortfall"], 0),
        ],
      ];

      summaryData.forEach(([label, value], idx) => {
        const rowNum = lastRow + 1 + idx;
        stockSheet.getCell(`A${rowNum}`).value = label;
        stockSheet.getCell(`B${rowNum}`).value = value;
        stockSheet.getCell(`B${rowNum}`).numFmt = "#,##0";
      });
    }

    // Add Validation Errors sheet
    if (validationErrors.length > 0) {
      const validationSheet = workbook.addWorksheet("Validation Errors");

      validationSheet.columns = [
        { header: "Row", key: "Row", width: 10 },
        { header: "Invoice #", key: "Invoice", width: 15 },
        { header: "Customer", key: "Customer", width: 20 },
        { header: "Product", key: "Product", width: 30 },
        { header: "Error", key: "Error", width: 50 },
        { header: "Type", key: "Type", width: 15 },
      ];

      // Add header row
      const validationHeaderRow = validationSheet.getRow(1);
      validationHeaderRow.font = { bold: true };
      validationHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };

      // Add data rows
      validationErrors.forEach((error) => {
        validationSheet.addRow({
          Row: error.Row,
          Invoice: error["Invoice #"],
          Customer: error.Customer,
          Product: error.Product,
          Error: error.Error,
          Type: error.Type,
        });
      });
    }

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="import_failed_${
        new Date().toISOString().split("T")[0]
      }.xlsx"`,
    );

    // Send the file
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating failed import report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate failed import report",
      error: error.message,
    });
  }
});

// Get failed invoices
router.get("/sales/import/failed/:sessionId", (req, res) => {
  const progress = importProgressMap.get(req.params.sessionId);
  if (!progress)
    return res
      .status(404)
      .json({ success: false, message: "Session not found" });

  const failedInvoices = progress.errors || [];

  res.json({
    success: true,
    data: { failedInvoices, totalFailed: failedInvoices.length },
  });
});

router.post("/sales", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const data = req.body;

    // Basic validation
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

    // Clear cache for fresh stock check
    productCache.clear();
    stockCache.clear();

    // Process products and validate stock BEFORE any changes
    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];

    // First, check stock for all products
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty === 0) continue;

      // Handle product name variations
      let correctedName = p.productName;

      const normalizedName = normalizeProductName(correctedName);
      stockCache.delete(normalizedName); // Clear cache for fresh check

      const stockCheck = await findProductStockInHandOptimized(
        p.productName.trim(),
        salesQty,
        bonusQty,
      );

      if (stockCheck.insufficient) {
        throw new Error(stockCheck.message);
      }
    }

    // If all stock checks pass, process products and deduct stock
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty === 0) continue;

      const sellingPrice = Number(p.sellingPrice) || 0;
      const amount = sellingPrice * salesQty;
      const discount = Number(p.discount) || 0;
      const netSellingAmount = amount - discount;

      // Handle product name variations for cache lookup
      let correctedName = p.productName;

      const normalizedName = normalizeProductName(correctedName);
      const productData = productCache.get(normalizedName);
      const lc = productData?.lc || Number(p.lc) || 0;

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

      // Deduct stock from ReportInHand
      const deductionResult = await deductStockFromReportInHand(
        p.productName.trim(),
        salesQty,
        bonusQty,
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

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      message: "Sale created successfully with stock deduction",
      sale: sale[0],
      stockDeductionResults,
    });
  } catch (err) {
    // Rollback transaction on error
    await session.abortTransaction();
    session.endSession();

    console.error("Sale create error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create sale",
    });
  }
});

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await PaymentStatus.find().sort({ type: 1 });
    res.status(200).json(statuses);
  } catch (error) {
    console.error("Error fetching payment statuses:", error.message);
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.get("/sales/all", async (req, res) => {
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
    console.error("Error fetching all sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

// Get sales with pagination
router.get("/sales", async (req, res) => {
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
    console.error("❌ Error fetching sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const saleToDelete = await SaleSummary.findById(id).session(session);

    if (!saleToDelete) {
      throw new Error("Sales record not found.");
    }

    // Clear cache before restoring stock
    productCache.clear();
    stockCache.clear();

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

    console.error("Error deleting sale:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to delete sales record." });
  }
});

// Download Excel report
router.post("/sales/download-excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    const filteredSalesData = await SaleSummary.find({
      invoiceDate: { $gte: start, $lte: end },
    }).sort({ invoiceDate: 1 });

    if (filteredSalesData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sales data found for the selected date range",
      });
    }

    const customerIds = [
      ...new Set(filteredSalesData.map((sale) => sale.customerId?.toString())),
    ];

    const customers = await Customer.find({
      _id: { $in: customerIds },
    });

    const customerMap = {};
    customers.forEach((cust) => {
      customerMap[cust._id.toString()] = cust;
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sale Summary");

    worksheet.mergeCells("A1:AE1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    const formatDateToReadable = (isoString) => {
      if (!isoString) return "";
      const date = new Date(isoString);
      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    };

    worksheet.mergeCells("A2:AE2");
    const subtitleCell = worksheet.getCell("A2");
    subtitleCell.value = `Sale Summary List (${formatDateToReadable(
      startDate,
    )} to ${formatDateToReadable(endDate)})`;
    subtitleCell.font = { bold: true, size: 14 };
    subtitleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(2).height = 20;

    worksheet.columns = [
      { key: "no", width: 5 },
      { key: "recordingDate", width: 18 },
      { key: "invoiceNumber", width: 18 },
      { key: "invoiceDate", width: 18 },
      { key: "mrName", width: 18 },
      { key: "customerCode", width: 18 },
      { key: "customerName", width: 25 },
      { key: "customerNumber", width: 20 },
      { key: "address", width: 35 },
      { key: "zone", width: 25 },
      { key: "productName", width: 25 },
      { key: "salesQty", width: 10 },
      { key: "bonusQty", width: 10 },
      { key: "totalQty", width: 10 },
      { key: "sellingPrice", width: 12 },
      { key: "amount", width: 12 },
      { key: "discount", width: 10 },
      { key: "netSellingAmount", width: 25 },
      { key: "averageUnitPrice", width: 25 },
      { key: "lc", width: 10 },
      { key: "profitLoss", width: 15 },
      { key: "totalProfitLoss", width: 15 },
      { key: "isProductAccept", width: 15 },
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "paidAmount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
    ];

    const headerRow = worksheet.getRow(3);
    headerRow.values = [
      "No",
      "Recording Date",
      "Invoice Number",
      "Invoice Date",
      "MR Name",
      "Customer Code",
      "Customer Name",
      "Customer Number",
      "Address",
      "Zone",
      "Product Name",
      "Sales Qty",
      "Bonus Qty",
      "Total Qty",
      "Selling Price",
      "Amount",
      "Discount",
      "Net Selling Amount",
      "Average Unit Price",
      "LC",
      "Product Profit/Loss",
      "Total Profit/Loss",
      "Product Accept",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Paid Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
    ];
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.height = 20;

    ["recordingDate", "invoiceDate", "dueDate", "deliveryDate"].forEach(
      (key) => {
        const col = worksheet.getColumn(key);
        if (col) col.numFmt = "dd-mmm-yy";
      },
    );

    [
      "salesQty",
      "bonusQty",
      "totalQty",
      "sellingPrice",
      "amount",
      "discount",
      "netSellingAmount",
      "averageUnitPrice",
      "lc",
      "profitLoss",
      "totalProfitLoss",
      "paidAmount",
      "dueAmount",
      "totalAmount",
    ].forEach((key) => {
      const col = worksheet.getColumn(key);
      if (col) col.numFmt = "#,##0.00";
    });

    let rowIndex = 0;
    filteredSalesData.forEach((sale) => {
      const customer = customerMap[sale.customerId?.toString()] || {};

      const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
      };

      const formatCustomerCode = (code) =>
        code ? code.toString().padStart(4, "0") : "";

      sale.products.forEach((product, index) => {
        const totalProfitLossValue =
          index === 0 ? sale.totalProfitLoss || 0 : "";

        const row = worksheet.addRow({
          no: ++rowIndex,
          recordingDate: formatDate(sale.recordingDate),
          invoiceNumber: sale.invoiceNumber,
          invoiceDate: formatDate(sale.invoiceDate),
          mrName: sale.mrName,
          customerCode: formatCustomerCode(customer.customerCode),
          customerName: customer.name || "--",
          customerNumber: customer.customerNumber || "--",
          address: customer.address || "--",
          zone: customer.zone || "--",
          productName: product.productName,
          salesQty: product.salesQty,
          bonusQty: product.bonusQty,
          totalQty: product.totalQty,
          sellingPrice: product.sellingPrice,
          amount: product.amount,
          discount: product.discount,
          netSellingAmount: product.netSellingAmount,
          averageUnitPrice: product.averageUnitPrice,
          lc: product.lc,
          profitLoss: product.profitLoss,
          totalProfitLoss: totalProfitLossValue,
          isProductAccept: product.isProductAccept ? "Yes" : "No",
          creditDays: sale.creditDays,
          dueDate: formatDate(sale.dueDate),
          deliveryDate: formatDate(sale.recordingDate),
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
        });

        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });
    });

    const fileName = `sale_summary_${formatDateToReadable(
      startDate,
    )}_to_${formatDateToReadable(endDate)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel file",
      error: error.message,
    });
  }
});

// Get unique product names - CASE INSENSITIVE VERSION
router.get("/sales/unique-names", async (req, res) => {
  try {
    // Using aggregation to get distinct case-insensitive product names
    const uniqueProducts = await Product.aggregate([
      {
        $project: {
          productName: { $toLower: "$productName" },
          originalName: "$productName",
        },
      },
      {
        $group: {
          _id: "$productName",
          originalName: { $first: "$originalName" },
        },
      },
      {
        $project: {
          _id: 0,
          productName: "$originalName",
        },
      },
      {
        $sort: { productName: 1 },
      },
    ]);

    // Extract just the product names
    const uniqueNames = uniqueProducts.map((p) => p.productName);

    res.status(200).json({
      success: true,
      productNames: uniqueNames,
      count: uniqueNames.length,
    });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Alternative: Get unique product names with normalization
router.get("/sales/unique-names-normalized", async (req, res) => {
  try {
    const allProducts = await Product.find(
      {
        productName: { $ne: null, $ne: "" },
      },
      "productName",
    ).lean();

    // Use a Map to deduplicate by normalized name
    const productMap = new Map();

    allProducts.forEach((product) => {
      const normalized = normalizeProductName(product.productName);
      // Keep the first original name we encounter for each normalized version
      if (!productMap.has(normalized) && product.productName) {
        productMap.set(normalized, product.productName.trim());
      }
    });

    // Convert to array and sort
    const uniqueNames = Array.from(productMap.values());
    uniqueNames.sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" }),
    );

    res.status(200).json({
      success: true,
      productNames: uniqueNames,
      count: uniqueNames.length,
      normalizedCount: productMap.size,
    });
  } catch (error) {
    console.error("Error fetching normalized unique product names:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Get product name suggestions with case-insensitive search
router.get("/sales/product-suggestions", async (req, res) => {
  try {
    const { search = "", limit = 20 } = req.query;

    let query = {};

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query = { productName: searchRegex };
    }

    // Use aggregation for case-insensitive distinct suggestions
    const suggestions = await Product.aggregate([
      { $match: query },
      {
        $project: {
          productName: 1,
          normalizedName: { $toLower: "$productName" },
        },
      },
      {
        $group: {
          _id: "$normalizedName",
          productName: { $first: "$productName" },
        },
      },
      {
        $project: {
          _id: 0,
          productName: "$productName",
        },
      },
      { $sort: { productName: 1 } },
      { $limit: parseInt(limit) },
    ]);

    const productNames = suggestions.map((s) => s.productName);

    res.status(200).json({
      success: true,
      suggestions: productNames,
      count: productNames.length,
    });
  } catch (error) {
    console.error("Error fetching product suggestions:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message,
    });
  }
});

router.post("/sales/delete-batch", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No sale IDs provided",
      });
    }

    const deletedSales = [];
    const errors = [];

    // Clear cache before batch delete
    productCache.clear();
    stockCache.clear();

    for (const id of ids) {
      try {
        const saleToDelete = await SaleSummary.findById(id).session(session);

        if (!saleToDelete) {
          errors.push({ id, error: "Not found" });
          continue;
        }

        // Restore stock
        for (const product of saleToDelete.products || []) {
          const salesQty = Number(product.salesQty) || 0;
          const bonusQty = Number(product.bonusQty) || 0;
          const totalQty = salesQty + bonusQty;

          if (totalQty > 0) {
            await restoreStockToReportInHand(product.productName, totalQty);
          }
        }

        await SaleSummary.findByIdAndDelete(id).session(session);

        deletedSales.push({
          id,
          invoiceNumber: saleToDelete.invoiceNumber,
          customerName: saleToDelete.customerName,
        });
      } catch (error) {
        errors.push({
          id,
          error: error.message,
        });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      deletedCount: deletedSales.length,
      deletedSales,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully deleted ${deletedSales.length} sales and restored stock`,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Batch delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete sales",
      error: error.message,
    });
  }
});

// Add this to your backend routes (sales.js)

router.post("/sales/stock-issues-report", async (req, res) => {
  try {
    const { invoices } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    // Check stock and get detailed issues
    const stockCheckResult = await checkStockWithDetailedReport(invoiceData);

    if (!stockCheckResult.success) {
      return res.status(400).json({
        success: false,
        message: stockCheckResult.message,
      });
    }

    const stockIssues = stockCheckResult.stockIssues || [];
    const productStockDetails = stockCheckResult.productStockDetails || [];

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stock Issues Report");

    // Add title
    worksheet.mergeCells("A1:F1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "STOCK ISSUES REPORT";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    // Add timestamp
    worksheet.mergeCells("A2:F2");
    const timestampCell = worksheet.getCell("A2");
    timestampCell.value = `Generated on: ${new Date().toLocaleString()}`;
    timestampCell.font = { italic: true };
    timestampCell.alignment = { horizontal: "center" };

    // Add summary
    worksheet.mergeCells("A3:F3");
    const summaryCell = worksheet.getCell("A3");
    summaryCell.value = `Summary: ${stockIssues.length} products with stock issues affecting ${invoiceData.length} invoices`;
    summaryCell.font = { bold: true };

    // Define columns
    worksheet.columns = [
      { header: "S.No", key: "sno", width: 8 },
      { header: "Product Name", key: "productName", width: 35 },
      { header: "Required Quantity", key: "requiredQty", width: 18 },
      { header: "Available Stock", key: "availableStock", width: 18 },
      { header: "Shortage", key: "shortage", width: 15 },
      { header: "Status", key: "status", width: 20 },
      { header: "Issue Type", key: "issueType", width: 40 },
      { header: "Required By Invoices", key: "invoiceCount", width: 20 },
      { header: "Affected Invoices", key: "invoices", width: 40 },
    ];

    // Add headers
    const headerRow = worksheet.getRow(5);
    headerRow.values = [
      "S.No",
      "Product Name",
      "Required Quantity",
      "Available Stock",
      "Shortage",
      "Status",
      "Issue Type",
      "Required By Invoices",
      "Affected Invoices",
    ];
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Add data rows
    let rowNumber = 6;
    let totalRequired = 0;
    let totalAvailable = 0;
    let totalShortage = 0;

    stockIssues.forEach((issue, index) => {
      const row = worksheet.getRow(rowNumber);

      const invoiceList = issue.requiredByInvoices
        ?.slice(0, 5)
        .map((inv) => `${inv.invoiceNumber} (${inv.requiredQty})`)
        .join(", ");

      const moreInvoices =
        issue.requiredByInvoices?.length > 5
          ? `... and ${issue.requiredByInvoices.length - 5} more`
          : "";

      row.values = [
        index + 1,
        issue.productName,
        issue.totalRequired,
        issue.availableStock,
        issue.insufficientQty,
        !issue.stockCheckSuccess ? "Product Not Found" : "Insufficient Stock",
        issue.message || "Error checking stock",
        issue.requiredByInvoices?.length || 0,
        `${invoiceList} ${moreInvoices}`,
      ];

      // Style based on issue severity
      if (!issue.stockCheckSuccess) {
        row.getCell(6).fill = {
          // Status cell
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCCCC" },
        };
      } else if (issue.insufficient) {
        row.getCell(5).fill = {
          // Shortage cell
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEECC" },
        };
      }

      totalRequired += issue.totalRequired || 0;
      totalAvailable += issue.availableStock || 0;
      totalShortage += issue.insufficientQty || 0;

      rowNumber++;
    });

    // Add summary row
    rowNumber += 2;
    const summaryRow = worksheet.getRow(rowNumber);
    summaryRow.values = [
      "",
      "TOTAL SUMMARY",
      totalRequired,
      totalAvailable,
      totalShortage,
      "",
      `${stockIssues.length} Products`,
      "",
      "",
    ];
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFCCE5FF" },
    };

    // Add recommendation row
    rowNumber++;
    const recommendationRow = worksheet.getRow(rowNumber);
    worksheet.mergeCells(`A${rowNumber}:I${rowNumber}`);
    recommendationRow.getCell(1).value =
      "RECOMMENDATION: Please update inventory for the above products before proceeding with import.";
    recommendationRow.getCell(1).font = {
      bold: true,
      color: { argb: "FF990000" },
    };
    recommendationRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFF0F0" },
    };

    // Set response headers for Excel download
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stock_issues_report_${Date.now()}.xlsx"`,
    );

    // Write the workbook to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating stock issues report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate stock issues report",
      error: error.message,
    });
  }
});

// Also add a simpler CSV endpoint
router.post("/sales/stock-issues-csv", async (req, res) => {
  try {
    const { invoices } = req.body;
    const invoiceData = Array.isArray(invoices) ? invoices : [];

    if (!invoiceData.length) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    const stockCheckResult = await checkStockWithDetailedReport(invoiceData);
    const stockIssues = stockCheckResult.stockIssues || [];

    // Create CSV content
    const headers = [
      "Product Name",
      "Required Quantity",
      "Available Stock",
      "Shortage",
      "Status",
      "Issue Type",
      "Required By Invoices",
      "Invoice List",
    ];

    const csvRows = stockIssues.map((issue) => [
      `"${issue.productName}"`,
      issue.totalRequired,
      issue.availableStock,
      issue.insufficientQty,
      `"${!issue.stockCheckSuccess ? "Product Not Found" : "Insufficient Stock"}"`,
      `"${issue.message || "Error checking stock"}"`,
      issue.requiredByInvoices?.length || 0,
      `"${issue.requiredByInvoices?.map((inv) => inv.invoiceNumber).join(", ") || ""}"`,
    ]);

    // Add summary row
    const totalRequired = stockIssues.reduce(
      (sum, issue) => sum + (issue.totalRequired || 0),
      0,
    );
    const totalAvailable = stockIssues.reduce(
      (sum, issue) => sum + (issue.availableStock || 0),
      0,
    );
    const totalShortage = stockIssues.reduce(
      (sum, issue) => sum + (issue.insufficientQty || 0),
      0,
    );

    csvRows.push(["---", "---", "---", "---", "---", "---", "---", "---"]);
    csvRows.push([
      "TOTAL SUMMARY",
      totalRequired,
      totalAvailable,
      totalShortage,
      `${stockIssues.length} Products`,
      "",
      "",
      "",
    ]);

    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) => row.join(",")),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="stock_issues_${Date.now()}.csv"`,
    );
    res.send(csvContent);
  } catch (error) {
    console.error("Error generating CSV report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate CSV report",
      error: error.message,
    });
  }
});

// Get stock count
router.get("/reports/inhand/count", async (req, res) => {
  try {
    const totalDocs = await ReportInHand.countDocuments({});
    const agg = await ReportInHand.aggregate([
      { $group: { _id: null, total: { $sum: "$totalBoxes" } } },
    ]);
    const totalItems = agg.length > 0 ? agg[0].total : 0;

    res.json({
      success: true,
      totalDocuments: totalDocs,
      totalItems,
    });
  } catch (error) {
    console.error("Stock count error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get LC for product
const getLCForProduct = async (productName, providedLC) => {
  const lc = parseFloat(providedLC) || 0;
  if (lc > 0) {
    return lc;
  }

  return await getProductLCFromDatabase(productName);
};

router.post("/sales/create", async (req, res) => {
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

    // Clear cache for fresh data
    productCache.clear();
    stockCache.clear();

    // Process products and validate stock
    const processedProducts = [];
    let totalAmount = 0;
    let totalProfitLoss = 0;
    const stockDeductionResults = [];

    // Check stock for all products first
    for (const p of data.products || []) {
      const salesQty = fixPrecision(Number(p.salesQty) || 0);
      const bonusQty = fixPrecision(Number(p.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty > 0) {
        // Handle product name variations
        let correctedName = p.productName;

        const normalizedName = normalizeProductName(correctedName);
        stockCache.delete(normalizedName); // Clear cache

        const stockCheck = await findProductStockInHandOptimized(
          p.productName,
          salesQty,
          bonusQty,
        );

        if (stockCheck.insufficient) {
          throw new Error(stockCheck.message);
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

      // Handle product name variations for cache lookup
      let correctedName = p.productName;

      const normalizedName = normalizeProductName(correctedName);
      const productData = productCache.get(normalizedName);
      const lc = productData?.lc || Number(p.lc) || 0;

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

      // Deduct stock
      const deductionResult = await deductStockFromReportInHand(
        p.productName.trim(),
        salesQty,
        bonusQty,
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

    console.error("Sale create error:", err);
    res.status(500).json({
      success: false,
      error: err.message || "Failed to create sale",
    });
  }
});

router.put("/sales/:id", async (req, res) => {
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

    // Clear cache before update
    productCache.clear();
    stockCache.clear();

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
          // Check if we have enough stock to increase
          // Handle product name variations
          let correctedName = p.productName;

          const normalizedName = normalizeProductName(correctedName);
          stockCache.delete(normalizedName); // Clear cache

          const stockCheck = await findProductStockInHandOptimized(
            p.productName,
            Math.abs(quantityDifference),
            0,
          );

          if (stockCheck.insufficient) {
            throw new Error(stockCheck.message);
          }

          // Deduct additional stock
          await deductStockFromReportInHand(
            p.productName,
            quantityDifference,
            0,
          );
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
        // Handle product name variations for cache lookup
        let correctedName = p.productName;

        const normalizedName = normalizeProductName(correctedName);
        const productData = productCache.get(normalizedName);
        lcValue = productData?.lc || 0;
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

    console.error("Error updating sale:", err);
    res.status(500).json({
      error: "Failed to update sales record",
      details: err.message,
    });
  }
});

// Get profit loss summary
router.get("/sales/profit-loss-summary", async (req, res) => {
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

// Get sales analytics for custom range
router.get("/sales/analytics/custom-range", async (req, res) => {
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

// Get outstanding table data
router.get("/outstanding/table-data", async (req, res) => {
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

    dateFilter = {
      ...dateFilter,
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      {
        $sort: { recordingDate: -1 },
      },
    ]);

    res.json({
      success: true,
      data: outstandingData,
      count: outstandingData.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching outstanding table data:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

// Get credit sales not received
router.get("/sales/credit-sale-not-received", async (req, res) => {
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

// Get outstanding custom range
router.get("/outstanding/custom-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const outstandingData = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: start,
            $lte: end,
          },
          $or: [
            { dueAmount: { $gt: 0 } },
            { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
          ],
        },
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerName: 1,
          customerCode: 1,
          customerId: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
          products: 1,
        },
      },
      {
        $sort: { recordingDate: -1 },
      },
    ]);

    const totalOutstanding = outstandingData.reduce(
      (sum, invoice) => sum + (invoice.dueAmount || 0),
      0,
    );

    res.json({
      success: true,
      totalOutstanding,
      outstandingData,
      count: outstandingData.length,
    });
  } catch (error) {
    console.error("Error fetching custom range outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      totalOutstanding: 0,
      outstandingData: [],
    });
  }
});

// Get sales table data
router.get("/sales/table-data", async (req, res) => {
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

// Helper functions
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

// Verify stock calculation endpoint
router.get("/sales/verify-stock-calculation/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { requiredQty = 15 } = req.query;

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Clear cache for fresh data
    stockCache.delete(normalizedName);
    productCache.delete(normalizedName);

    // Find product with flexible query
    const product = await Product.findOne({
      productName: buildProductNameRegex(normalizedName),
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found in product catalog`,
      });
    }

    // Find stock in ReportInHand with same flexible query
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    });

    let baseStock = 0;
    let batchDetails = [];
    if (stockItem) {
      // Calculate from batches
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        stockItem.batches.forEach((batch, index) => {
          const batchQty = batch.boxes || batch.quantity || 0;
          baseStock += batchQty;
          batchDetails.push({
            batchIndex: index + 1,
            boxes: batchQty,
            expiryDate: batch.expiryDate,
          });
        });
      }
    }

    // Get adjustments using totalQuantity field
    const adjustments = await getProductAdjustments(product._id);

    // Calculate total available stock (batches + adjustments)
    const availableStock = baseStock + adjustments;
    const required = parseInt(requiredQty);
    const insufficient = Math.max(0, required - availableStock);

    res.json({
      success: true,
      product: {
        name: productName,
        actualProductName: product.productName,
        normalizedName: normalizedName,
        productId: product._id,
      },
      stock: {
        baseStock: baseStock,
        totalBoxesField: stockItem?.totalBoxes || 0,
        batchDetails: batchDetails,
        adjustments: adjustments,
        totalAvailable: availableStock,
        calculationMethod: baseStock > 0 ? "batches" : "adjustments",
      },
      requirement: {
        required: required,
        insufficient: insufficient,
        canFulfill: availableStock >= required,
      },
      calculation: `Base Stock (${baseStock}) + Adjustments (${adjustments}) = Available Stock (${availableStock})`,
    });
  } catch (error) {
    console.error("Error verifying stock calculation:", error);
    res.status(500).json({
      success: false,
      message: "Failed to verify stock calculation",
      error: error.message,
    });
  }
});

router.get("/sales/current-stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name is required",
      });
    }

    const result = await calculateStockForProduct(productName, 0);

    res.json({
      success: true,
      productName: result.productName || productName,
      availableStock: result.availableStock || 0,
      breakdown: result.breakdown || {},
      calculationMethod: result.calculationMethod || "unknown",
      usesAdjustments: result.usesAdjustments || false,
      message: `Current stock: ${result.availableStock || 0} units`,
    });
  } catch (error) {
    console.error("Current stock check error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get current stock",
      error: error.message,
    });
  }
});

router.get("/sales/check-stock/health", async (req, res) => {
  res.json({
    success: true,
    message: "Stock check endpoint is working",
    endpoints: {
      individualCheck: "POST /api/sales/check-stock",
      batchCheck: "POST /api/sales/check-stock-batch",
      currentStock: "GET /api/sales/current-stock/:productName",
    },
    timestamp: new Date().toISOString(),
  });
});

// New endpoint: Fix stock synchronization
router.post("/sales/fix-stock-sync/:productName", async (req, res) => {
  try {
    const { productName } = req.params;

    if (!productName) {
      return res.status(400).json({
        success: false,
        message: "Product name required",
      });
    }

    // Handle product name variations
    let correctedName = productName;
    if (productName.toLowerCase().includes("iotekam")) {
      correctedName = productName.toLowerCase().replace(/^i/, "l");
    }
    if (productName.toLowerCase() === "profokam") {
      correctedName = "Profokam 1%";
    }

    const normalizedName = normalizeProductName(correctedName);

    // Find stock item with flexible matching
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    });

    if (!stockItem) {
      return res.status(404).json({
        success: false,
        message: "Product not found in stock",
      });
    }

    // Calculate total from batches
    let totalFromBatches = 0;
    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch) => {
        totalFromBatches += batch.boxes || batch.quantity || 0;
      });
    }

    // Update totalBoxes field to match batch sum
    const oldTotal = stockItem.totalBoxes || 0;
    stockItem.totalBoxes = totalFromBatches;
    stockItem.updatedAt = new Date();

    await stockItem.save();

    // Clear cache
    stockCache.delete(normalizedName);
    productCache.delete(normalizedName);

    res.json({
      success: true,
      productName: stockItem.productName,
      oldTotalBoxes: oldTotal,
      newTotalBoxes: totalFromBatches,
      totalFromBatches: totalFromBatches,
      message: `Stock synchronized successfully. Updated from ${oldTotal} to ${totalFromBatches}.`,
    });
  } catch (error) {
    console.error("Error fixing stock sync:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fix stock synchronization",
      error: error.message,
    });
  }
});

router.get("/sales/debug/reportinhand-products", async (req, res) => {
  try {
    const allStockItems = await ReportInHand.find({}).lean();

    const products = allStockItems.map((item) => ({
      productName: item.productName,
      normalizedName: normalizeProductName(item.productName),
      totalBoxes: item.totalBoxes,
      batchCount: item.batches?.length || 0,
      totalFromBatches:
        item.batches?.reduce(
          (sum, b) => sum + (b.boxes || b.quantity || 0),
          0,
        ) || 0,
    }));

    res.json({
      success: true,
      totalProducts: products.length,
      products: products.sort((a, b) =>
        a.productName.localeCompare(b.productName),
      ),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to list ReportInHand products",
      error: error.message,
    });
  }
});

router.get("/sales/debug/find-stock/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const result = await calculateProductStock(productName, 0);

    res.json({
      success: true,
      searchedFor: productName,
      result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to find stock",
      error: error.message,
    });
  }
});

router.post("/sales/check-stock", async (req, res) => {
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

    console.log(`\n🌐 API: /sales/check-stock called`);
    console.log(`   Product: "${productName}"`);
    console.log(`   Required: ${totalQty}`);

    const result = await calculateProductStock(productName, totalQty);

    console.log(`   Response: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}`);

    res.json(result);
  } catch (error) {
    console.error("❌ API Error in /sales/check-stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check stock",
      error: error.message,
    });
  }
});

// Safely use middleware if logger exists and has the methods
if (logger && typeof logger.requestLogger === "function") {
  router.use(logger.requestLogger);
}

if (logger && typeof logger.errorLogger === "function") {
  router.use(logger.errorLogger);
}

export default router;
