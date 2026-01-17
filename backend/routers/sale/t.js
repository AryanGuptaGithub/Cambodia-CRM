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


const router = express.Router();
const importProgressMap = new Map();

const productCache = new Map();
const stockCache = new Map();
const adjustmentCache = new Map();
let lastCacheClear = Date.now();
const CACHE_TTL = 1 * 60 * 1000;

const fixPrecision = (num) => {
  if (typeof num !== 'number') return num;
  return Math.round(num * 1e10) / 1e10;
};

const normalizeStockNumbers = (stockData) => {
  if (!stockData) return stockData;
  
  if (stockData.batches && Array.isArray(stockData.batches)) {
    stockData.batches = stockData.batches.map(batch => ({
      ...batch,
      boxes: fixPrecision(batch.boxes || 0),
      quantity: fixPrecision(batch.quantity || 0),
      amount: fixPrecision(batch.amount || 0)
    }));
  }
  
  if (stockData.totalBoxes !== undefined) {
    stockData.totalBoxes = fixPrecision(stockData.totalBoxes);
  }
  
  return stockData;
};

const calculateStringSimilarity = (str1, str2) => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  if (longer.includes(shorter)) return 0.9;
  if (shorter.includes(longer)) return 0.9;

  const set1 = new Set(longer);
  const set2 = new Set(shorter);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
};

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";

  let normalized = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-\/_\\]/g, " ")
    .replace(/[^\w\s.%]/g, "")
    .replace(/\s+/g, " ")
    .replace(/alu\s*alu/gi, "alu alu")
    .replace(/%/g, " percent")
    .replace(/\s+percent$/, " percent")
    .replace(/\.\s+/g, ".")
    .replace(/\s+\./g, ".")
    .trim();

  // FIX: Handle specific product name variations
  if (normalized.includes("iotekam")) {
    normalized = normalized.replace(/^iotekam/, "lotekam");
  }

  if (normalized === "profokam") {
    normalized = "profokam 1 percent";
  }

  if (
    normalized.includes("profokam") &&
    !normalized.includes("1") &&
    !normalized.includes("percent")
  ) {
    normalized = normalized.replace(/profokam$/, "profokam 1 percent");
  }

  return normalized;
};

const buildProductNameRegex = (normalizedName) => {
  const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let pattern = escaped;
  pattern = pattern.replace(/percent/g, "(?:%|percent)");
  pattern = pattern.replace(/\s+/g, "\\s*");

  if (pattern.includes("profokam") && !pattern.includes("1")) {
    pattern = pattern.replace(/profokam/, "(?:profokam|profokam\\s*1)");
  }
  pattern = pattern.replace(/lotekam/, "(?:lotekam|iotekam)");

  return new RegExp(`^${pattern}$`, "i");
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

// FIXED: calculateRealStock with proper adjustment handling
const calculateRealStock = async (productId, productName) => {
  try {
    const normalizedName = normalizeProductName(productName);

    // First, get base stock from ReportInHand
    const stockItem = await ReportInHand.findOne({
      $or: [
        { productId: convertToObjectId(productId) },
        { productName: buildProductNameRegex(normalizedName) },
      ],
    }).lean();

    let baseStock = 0;
    if (stockItem) {
      // Get stock from batches
      if (stockItem.batches && Array.isArray(stockItem.batches)) {
        stockItem.batches.forEach(batch => {
          baseStock += fixPrecision(batch.boxes || batch.quantity || 0);
        });
      }
      
      // Use totalBoxes field as fallback
      if (baseStock === 0 && stockItem.totalBoxes) {
        baseStock = fixPrecision(stockItem.totalBoxes);
      }
    }

    // Get ALL adjustments (additions and deductions)
    const queryProductId = convertToObjectId(productId);
    let totalAdjustments = 0;
    
    if (queryProductId) {
      const adjustments = await StockAdjustment.find({
        productId: queryProductId,
        status: { $ne: "cancelled" },
      }).lean();

      adjustments.forEach(adj => {
        const qty = fixPrecision(adj.boxQuantity || adj.quantity || 0);
        if (adj.adjustmentType === "add") {
          totalAdjustments += qty;
        } else if (adj.adjustmentType === "remove" || adj.adjustmentType === "deduct") {
          totalAdjustments -= qty;
        }
      });
    }

    // Total available stock = base stock + net adjustments
    const availableStock = Math.max(0, fixPrecision(baseStock + totalAdjustments));

    return {
      baseStock,
      totalAdjustments,
      availableStock,
      stockItem,
      calculationMethod: baseStock > 0 ? "batches" : "adjustments",
      usesAdjustments: totalAdjustments !== 0,
      breakdown: {
        fromBatches: baseStock,
        fromAdjustments: totalAdjustments,
        total: availableStock,
      },
    };
  } catch (error) {
    console.error("Stock calculation error:", error);
    return {
      baseStock: 0,
      totalAdjustments: 0,
      availableStock: 0,
      stockItem: null,
      calculationMethod: "error",
      error: error.message,
    };
  }
};

// // FIXED: calculateRealStock with precision fixes
// const calculateRealStock = async (productId, productName) => {
//   try {
//     const normalizedName = normalizeProductName(productName);

//     // Get current stock from ReportInHand
//     const stockItem = await ReportInHand.findOne({
//       $or: [
//         { productId: convertToObjectId(productId) },
//         { productName: buildProductNameRegex(normalizedName) },
//       ],
//     }).lean();

//     // FIX: Normalize stock numbers to fix floating-point issues
//     const normalizedStockItem = normalizeStockNumbers(stockItem);

//     // Get all adjustments for this product
//     const queryProductId = convertToObjectId(productId);
//     let totalAdjustments = 0;
//     let adjustmentHistory = [];

//     if (queryProductId) {
//       const adjustments = await StockAdjustment.find({
//         productId: queryProductId,
//         status: { $ne: "cancelled" },
//       }).lean();

//       adjustments.forEach((adj) => {
//         const qty = fixPrecision(adj.boxQuantity || adj.quantity || 0);
//         if (adj.adjustmentType === "add") {
//           totalAdjustments += qty;
//         } else if (
//           adj.adjustmentType === "remove" ||
//           adj.adjustmentType === "deduct"
//         ) {
//           totalAdjustments -= qty;
//         }
//         adjustmentHistory.push({
//           type: adj.adjustmentType,
//           quantity: qty,
//           reason: adj.reason || "",
//           date: adj.createdAt,
//         });
//       });
//     }

//     // FIX: Apply precision fix to adjustments
//     totalAdjustments = fixPrecision(totalAdjustments);

//     let baseStockFromBatches = 0;
//     const validBatches = [];

//     if (normalizedStockItem) {
//       // Calculate base stock from batches with precision fix
//       if (normalizedStockItem.batches && Array.isArray(normalizedStockItem.batches)) {
//         normalizedStockItem.batches.forEach((batch) => {
//           const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
//           if (batchQty > 0) {
//             baseStockFromBatches += batchQty;
//             validBatches.push({
//               ...batch,
//               boxes: batchQty,
//               quantity: batchQty
//             });
//           }
//         });
//       }
      
//       // FIX: Apply precision fix
//       baseStockFromBatches = fixPrecision(baseStockFromBatches);
//     }

//     // FIX: Calculate available stock with both batches and adjustments
//     const availableStock = Math.max(0, baseStockFromBatches + totalAdjustments);

//     // FIX: Check if totalBoxes field matches calculated stock (with tolerance for floating-point errors)
//     const isSynchronized = normalizedStockItem ? 
//       Math.abs(fixPrecision(normalizedStockItem.totalBoxes || 0) - baseStockFromBatches) < 0.0001 : 
//       true;

//     return {
//       baseStock: baseStockFromBatches,
//       totalAdjustments: totalAdjustments,
//       adjustmentHistory: adjustmentHistory,
//       availableStock: availableStock,
//       batches: validBatches,
//       stockItem: normalizedStockItem,
//       totalBoxesField: normalizedStockItem ? fixPrecision(normalizedStockItem.totalBoxes || 0) : 0,
//       isSynchronized: isSynchronized,
//       usesAdjustments: baseStockFromBatches === 0 && totalAdjustments > 0,
//       calculationMethod: baseStockFromBatches > 0 ? "batches" : "adjustments",
//     };
//   } catch (error) {
//     console.error("Stock calculation error:", error);
//     return {
//       baseStock: 0,
//       totalAdjustments: 0,
//       availableStock: 0,
//       batches: [],
//       stockItem: null,
//       error: error.message,
//     };
//   }
// };

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

      // Handle product name variations before normalization
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
      invoiceData.requiredQty = fixPrecision(invoiceData.requiredQty + totalRequiredQty);
    }
  }

  console.log(`Phase 1: Aggregated ${stockRequirements.size} unique products`);

  // Phase 2: Get REAL stock calculation for each product
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
      // Calculate REAL stock
      const stockData = await calculateRealStock(
        product._id,
        product.productName
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
            "i"
          ),
        },
      }).lean();

      if (allProducts.length > 0) {
        const product = allProducts[0];
        const stockData = await calculateRealStock(
          product._id,
          product.productName
        );

        stockCalculations.set(normalizedName, {
          productId: product._id,
          productName: product.productName,
          ...stockData,
        });
      } else {
        console.log(`No product found for: ${requirement.originalName}`);
        stockCalculations.set(normalizedName, {
          productId: null,
          productName: requirement.originalName,
          baseStock: 0,
          totalAdjustments: 0,
          availableStock: 0,
          batches: [],
          stockItem: null,
          isSynchronized: false,
        });
      }
    }
  }

  // Phase 3: Check stock availability with REAL stock
  for (const [normalizedName, requirement] of stockRequirements.entries()) {
    const stockData = stockCalculations.get(normalizedName);

    // Use availableStock which now includes both batches and adjustments
    const availableStock = Math.max(0, stockData?.availableStock || 0);
    const insufficient = Math.max(
      0,
      fixPrecision(requirement.totalRequired - availableStock)
    );

    requirement.availableStock = availableStock;
    requirement.baseStock = stockData?.baseStock || 0;
    requirement.adjustments = stockData?.totalAdjustments || 0;
    requirement.productId = stockData?.productId;
    requirement.isSynchronized = stockData?.isSynchronized;
    requirement.actualProductName = stockData?.productName;
    requirement.usesAdjustments = stockData?.usesAdjustments || false;
    requirement.calculationMethod = stockData?.calculationMethod || "unknown";

    // Use tolerance for floating-point comparison
    const stockAvailableWithTolerance = availableStock + 0.0001;
    
    // Check for stock issues
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
        actualProductName: requirement.actualProductName || requirement.originalName,
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
        isSynchronized: requirement.isSynchronized,
        usesAdjustments: requirement.usesAdjustments,
        calculationMethod: requirement.calculationMethod,
        invoices: invoiceArray,
        invoiceCount: requirement.invoices.size,
        message: `Insufficient stock for "${requirement.originalName}". Required: ${requirement.totalRequired}, Available: ${availableStock} (Base: ${requirement.baseStock}, Adjustments: ${requirement.adjustments}), Shortfall: ${insufficient}`,
      });
    }
  }

  const requirementsArray = Array.from(stockRequirements.values());
  const totalRequired = requirementsArray.reduce(
    (sum, d) => sum + (d.totalRequired || 0),
    0
  );
  const totalAvailable = requirementsArray.reduce(
    (sum, d) => sum + (d.availableStock || 0),
    0
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

// Initialize on module load
let isDataPreloaded = false;

// IMPROVED: Get product LC from database with better search
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
      `No valid Staff record for MR "${mrName}". Skipping cash update.`
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
      `No valid Staff record for MR "${mrName}". Skipping cash removal.`
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
        Math.random() * 100
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

const findProductStockInHandOptimized = async (productName, requiredQty, tolerance = 0) => {
  try {
    console.log(`Checking stock for: ${productName}, Required: ${requiredQty}`);
    
    // First, try to make API call to the correct endpoint
    try {
      // Correct endpoint - use /api/sales/check-stock (not check-stock-batch)
      const response = await axios.post(`${backendUrl}/api/sales/check-stock`, {
        productName,
        requiredQty, // Send requiredQty parameter
        tolerance
      }, { 
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data) {
        // Handle both success and failure responses
        return {
          productName,
          actualProductName: response.data.productName || response.data.requestedProductName || productName,
          availableStock: response.data.availableStock || 0,
          insufficient: response.data.insufficient !== undefined ? response.data.insufficient : 
                       (response.data.insufficientQty || Math.max(0, requiredQty - (response.data.availableStock || 0))),
          calculationMethod: response.data.calculationMethod || "api_check",
          message: response.data.message || `Stock check completed for ${productName}`,
          success: response.data.success !== false
        };
      }
    } catch (apiError) {
      console.log("API stock check failed, falling back to local check:", apiError.message);
      // If it's a 404 error, the endpoint might not exist
      if (apiError.response && apiError.response.status === 404) {
        console.log("Endpoint not found. Make sure backend has /api/sales/check-stock endpoint.");
      }
    }
    
    // Fallback: Try to find product in productsList prop
    if (productsList && Array.isArray(productsList)) {
      // Case-insensitive search with multiple matching strategies
      let foundProduct = null;
      
      // Strategy 1: Exact match
      foundProduct = productsList.find(p => 
        (p.name || p.productName || "").toString().toLowerCase().trim() === 
        productName.toString().toLowerCase().trim()
      );
      
      // Strategy 2: Contains match
      if (!foundProduct) {
        foundProduct = productsList.find(p => {
          const pName = (p.name || p.productName || "").toString().toLowerCase().trim();
          const searchName = productName.toString().toLowerCase().trim();
          return pName.includes(searchName) || searchName.includes(pName);
        });
      }
      
      // Strategy 3: Handle common variations (like "Iotekam" vs "Lotekam")
      if (!foundProduct) {
        const normalizedName = productName.toLowerCase().trim();
        if (normalizedName.includes("iotekam")) {
          const correctedName = normalizedName.replace(/^i/, "l");
          foundProduct = productsList.find(p => 
            (p.name || p.productName || "").toString().toLowerCase().trim().includes(correctedName)
          );
        }
        if (!foundProduct && normalizedName.includes("profokam")) {
          foundProduct = productsList.find(p => 
            (p.name || p.productName || "").toString().toLowerCase().trim().includes("profokam")
          );
        }
      }
      
      if (foundProduct) {
        const stock = foundProduct.stockInHand || foundProduct.quantity || foundProduct.availableStock || 0;
        const insufficient = Math.max(0, requiredQty - stock);
        
        return {
          productName,
          actualProductName: foundProduct.name || foundProduct.productName || productName,
          availableStock: stock,
          insufficient,
          calculationMethod: "local_lookup",
          message: insufficient > 0 ? 
            `Insufficient stock: Required ${requiredQty}, Available ${stock}, Shortfall: ${insufficient}` :
            `Sufficient stock available: ${stock} units`,
          success: true
        };
      }
    }
    
    // If no product found, assume no stock
    return {
      productName,
      actualProductName: productName,
      availableStock: 0,
      insufficient: requiredQty,
      calculationMethod: "not_found",
      message: `Product "${productName}" not found in inventory. Assuming zero stock.`,
      success: false
    };
    
  } catch (error) {
    console.error(`Error in findProductStockInHandOptimized for ${productName}:`, error);
    return {
      productName,
      actualProductName: productName,
      availableStock: 0,
      insufficient: requiredQty,
      calculationMethod: "error",
      message: `Error checking stock: ${error.message || "Unknown error"}`,
      success: false
    };
  }
};

// Get all stock adjustments for a product
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
          createdAt: { $lte: new Date() },
        },
      },
      {
        $group: {
          _id: "$adjustmentType",
          total: { $sum: "$boxQuantity" },
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

// Create indexes if they don't exist
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
    console.log("Database indexes created successfully");
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
    console.log("Cache cleared for fresh data");
  }
}, 30000);

const deductStockFromReportInHand = async (productName, salesQty, bonusQty) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const totalRequiredQty = fixPrecision(salesQty + bonusQty);
    if (totalRequiredQty <= 0) {
      await session.commitTransaction();
      session.endSession();
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
    // Find stock item with productName using flexible matching
    let stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    }).session(session);

    if (!stockItem) {
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      }).session(session);
      console.log('value of product', product);
      
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          deducted: 0,
          remaining: totalRequiredQty,
          message: `No product found for ${productName}`,
        };
      }

      // Get adjustments for this product
      const adjustments = await StockAdjustment.find({
        productId: product._id,
        status: { $ne: "cancelled" },
      }).session(session);

      let netAdjustment = 0;
      adjustments.forEach((adj) => {
        const qty = fixPrecision(adj.boxQuantity || adj.quantity || 0);
        if (adj.adjustmentType === "add") {
          netAdjustment += qty;
        } else if (
          adj.adjustmentType === "remove" ||
          adj.adjustmentType === "deduct"
        ) {
          netAdjustment -= qty;
        }
      });

      netAdjustment = fixPrecision(netAdjustment);
      if (netAdjustment >= totalRequiredQty) {
        stockItem = new ReportInHand({
          productName: correctedName,
          productId: product._id,
          totalBoxes: netAdjustment,
          averagePrice: product.lc || 0.71,
          batches: [
            {
              batchNumber: `ADJ-${Date.now()}`,
              boxes: netAdjustment,
              quantity: netAdjustment,
              lc: product.lc || 0.71,
              fob: product.fob || 0.71,
              cif: product.cif || 0.71,
              amount: fixPrecision(netAdjustment * (product.lc || 0.71)),
              expiryDate: new Date(
                new Date().setFullYear(new Date().getFullYear() + 1)
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
      } else {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          deducted: 0,
          remaining: totalRequiredQty,
          message: `No stock available for ${productName}. Adjustments net: ${netAdjustment}`,
        };
      }
    }

    let totalAvailableStock = 0;
    const validBatches = [];

    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch) => {
        const batchQty = fixPrecision(batch.boxes || batch.quantity || 0);
        if (batchQty > 0) {
          totalAvailableStock += batchQty;
          validBatches.push(batch);
        }
      });
    }

    totalAvailableStock = fixPrecision(totalAvailableStock);
    
    // CRITICAL FIX: Add the missing if condition
    if (totalAvailableStock < totalRequiredQty) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        deducted: 0,
        remaining: totalRequiredQty,
        message: `Insufficient stock. Available: ${totalAvailableStock}, Required: ${totalRequiredQty}`,
      };
    }

    // Sort batches by expiry date (FIFO) - real batches first, then adjustments
    const sortedBatches = validBatches.sort((a, b) => {
      // Real batches with expiry dates first
      if (a.expiryDate && !b.expiryDate) return -1;
      if (!a.expiryDate && b.expiryDate) return 1;
      if (a.expiryDate && b.expiryDate) {
        const dateA = new Date(a.expiryDate || "9999-12-31");
        const dateB = new Date(b.expiryDate || "9999-12-31");
        return dateA - dateB;
      }
      // Then by date for adjustments
      const dateA = new Date(a.date || "9999-12-31");
      const dateB = new Date(b.date || "9999-12-31");
      return dateA - dateB;
    });

    let remainingQty = totalRequiredQty;
    let totalDeducted = 0;
    const deductionDetails = [];
    const updatedBatches = [];

    // Deduct from batches with precision fixes
    for (const batch of sortedBatches) {
      if (remainingQty <= 0) break;

      const availableInBatch = fixPrecision(batch.boxes || batch.quantity || 0);

      if (availableInBatch > 0) {
        const deductQty = fixPrecision(Math.min(availableInBatch, remainingQty));
        const newBatchQty = fixPrecision(availableInBatch - deductQty);
        batch.boxes = newBatchQty;
        batch.quantity = newBatchQty;

        if (newBatchQty > 0) {
          updatedBatches.push(batch);
        }

        deductionDetails.push({
          batchId: batch._id || batch.batchNumber || "no-id",
          originalQty: availableInBatch,
          deducted: deductQty,
          remainingInBatch: newBatchQty,
          expiryDate: batch.expiryDate,
          isAdjustment: batch.adjustmentType && batch.adjustmentType !== "batch",
        });

        totalDeducted = fixPrecision(totalDeducted + deductQty);
        remainingQty = fixPrecision(remainingQty - deductQty);
      }
    }

    // Remove empty batches
    const nonEmptyBatches = updatedBatches.filter(
      (b) => fixPrecision(b.boxes || b.quantity || 0) > 0
    );

    // Calculate new total from batches with precision fix
    const newTotalFromBatches = nonEmptyBatches.reduce(
      (sum, batch) => fixPrecision(sum + fixPrecision(batch.boxes || batch.quantity || 0)),
      0
    );

    // Update both batches and totalBoxes with synchronization
    stockItem.batches = nonEmptyBatches;
    stockItem.totalBoxes = fixPrecision(newTotalFromBatches);
    stockItem.updatedAt = new Date();
    // Save the updated stock item
    await stockItem.save({ session });

    // Clear cache
    stockCache.delete(normalizedName);

    await session.commitTransaction();
    session.endSession();
    return {
      success: true,
      deducted: totalDeducted,
      remaining: 0,
      message: `Successfully deducted ${totalDeducted} units`,
      details: deductionDetails,
      newStockLevel: newTotalFromBatches,
      oldStockLevel: totalAvailableStock,
      createdFromAdjustments: stockItem.source === "adjustment_conversion",
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error deducting stock:", error);
    return {
      success: false,
      deducted: 0,
      remaining: totalRequiredQty,
      message: `Failed to deduct stock: ${error.message}`,
      error: error.message,
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
        // Restore to existing batch with precision fix
        batchToRestore.boxes = fixPrecision(fixPrecision(batchToRestore.boxes || 0) + restoredQty);
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
            currentDate.setFullYear(currentDate.getFullYear() + 1)
          ),
          date: new Date(),
          _id: new mongoose.Types.ObjectId(),
          adjustmentType: "batch", // Mark as real batch
        };

        if (!stockItem.batches) {
          stockItem.batches = [];
        }
        stockItem.batches.push(newBatch);
      }

      // Update totalBoxes with precision fix
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
              new Date().setFullYear(new Date().getFullYear() + 1)
            ),
            date: new Date(),
            adjustmentType: "batch",
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
  batchSize = 50
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
          rowIndex
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
        (progress.processedInvoices / progress.totalInvoices) * 100
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

  console.log(
    `Import completed: ${progress.successful} successful, ${progress.failed} failed`
  );
};

const processSingleInvoiceWithStockDeduction = async (saleData, index) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!saleData.invoiceNumber?.trim()) {
      throw new Error("Invoice number is required");
    }

    const existingInvoice = await SaleSummary.findOne({
      invoiceNumber: saleData.invoiceNumber.trim(),
    }).session(session);

    if (existingInvoice) {
      throw new Error(
        `Invoice number ${saleData.invoiceNumber} already exists`
      );
    }

    const processedProducts = [];
    let totalAmount = 0;
    const stockDeductionResults = [];

    // First, check if we have enough stock for all products
    for (const product of saleData.products || []) {
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty > 0) {
        // Handle product name variations
        let correctedName = product.productName;
        if (product.productName.toLowerCase().includes("iotekam")) {
          correctedName = product.productName.toLowerCase().replace(/^i/, "l");
        }
        if (product.productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);

        // Clear cache for fresh stock check
        stockCache.delete(normalizedName);

        const stockCheck = await findProductStockInHandOptimized(
          product.productName,
          salesQty,
          bonusQty
        );

        if (stockCheck.insufficient) {
          throw new Error(stockCheck.message);
        }
      }
    }

    // Process products
    for (const product of saleData.products || []) {
      const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
      const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
      const totalQty = fixPrecision(salesQty + bonusQty);

      if (totalQty > 0) {
        // Handle product name variations
        let correctedName = product.productName;
        if (product.productName.toLowerCase().includes("iotekam")) {
          correctedName = product.productName.toLowerCase().replace(/^i/, "l");
        }
        if (product.productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);
        const productData = productCache.get(normalizedName);
        const lc = productData?.lc || 0;

        const sellingPrice = parseFloat(product.sellingPrice) || 0;
        const amount = sellingPrice * salesQty;
        const discount = parseFloat(product.discount) || 0;
        const netSellingAmount = amount - discount;

        processedProducts.push({
          productName: product.productName.trim(),
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

        // Deduct stock
        const deductionResult = await deductStockFromReportInHand(
          product.productName.trim(),
          salesQty,
          bonusQty
        );

        stockDeductionResults.push({
          product: product.productName.trim(),
          ...deductionResult,
        });
        console.log(deductionResult);
        if (!deductionResult.success) {
          throw new Error(
            `Stock deduction failed for ${product.productName}: ${deductionResult.message}`
          );
        }
      }
    }

    if (processedProducts.length === 0) {
      throw new Error("No valid products found");
    }

    // Create sale record
    const saleRecord = new SaleSummary({
      recordingDate: new Date(saleData.recordingDate || Date.now()),
      invoiceNumber: saleData.invoiceNumber.trim(),
      invoiceDate: new Date(saleData.invoiceDate || Date.now()),
      mrName: saleData.mrName?.trim() || "No MR Name Provided",
      mrId: saleData.mrId || null,
      customerName: saleData.customerName?.trim() || "Unknown Customer",
      customerCode: saleData.customerCode || "",
      customerId: saleData.customerId || null,
      products: processedProducts,
      creditDays: parseInt(saleData.creditDays) || 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount: parseFloat(saleData.paidAmount) || 0,
      dueAmount: Math.max(
        0,
        totalAmount - (parseFloat(saleData.paidAmount) || 0)
      ),
      totalAmount,
      totalProfitLoss: processedProducts.reduce(
        (sum, p) => sum + (p.profitLoss || 0),
        0
      ),
      paymentStatus: mapPaymentStatus(saleData.paymentStatus),
      remark: saleData.remark || "",
      stockDeductionResults: stockDeductionResults,
    });

    await saleRecord.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      invoiceNumber: saleData.invoiceNumber,
      stockDeductionResults,
    };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(`Error processing invoice at index ${index}:`, error.message);
    return {
      success: false,
      error: {
        row: index + 2,
        invoiceNumber: saleData.invoiceNumber || "Unknown",
        message: error.message,
        type: "processing_error",
      },
    };
  }
};

// FIXED: Process imports sequentially with transaction locks
const processImportWithStockDeduction = async (sessionId, invoices, batchSize = 10) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];
  let successful = 0;
  let failed = 0;

  // Process in smaller batches to avoid overwhelming the system
  for (let batchIndex = 0; batchIndex < invoices.length; batchIndex += batchSize) {
    const batch = invoices.slice(batchIndex, Math.min(batchIndex + batchSize, invoices.length));
    
    // Process each invoice in the batch SEQUENTIALLY (not parallel)
    for (let i = 0; i < batch.length; i++) {
      const invoice = batch[i];
      const globalIndex = batchIndex + i;

      try {
        // Use database transaction to ensure stock is locked during processing
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
          // Check stock for this specific invoice
          let hasEnoughStock = true;
          for (const product of invoice.products || []) {
            const stockCheck = await findProductStockInHandOptimized(
              product.productName,
              product.salesQty || 0,
              product.bonusQty || 0
            );
            
            if (stockCheck.insufficient) {
              hasEnoughStock = false;
              throw new Error(stockCheck.message);
            }
          }

          if (hasEnoughStock) {
            // Process the invoice with stock deduction
            const result = await processSingleInvoiceWithStockDeduction(
              invoice,
              globalIndex,
              session // Pass session for transaction
            );

            if (result.success) {
              successful++;
            } else {
              failed++;
              errors.push({
                row: globalIndex + 2,
                invoiceNumber: invoice.invoiceNumber || "Unknown",
                error: result.error?.message || "Unknown error",
                type: "processing_error",
              });
            }
          }

          await session.commitTransaction();
        } catch (error) {
          await session.abortTransaction();
          throw error;
        } finally {
          session.endSession();
        }

      } catch (error) {
        failed++;
        errors.push({
          row: globalIndex + 2,
          invoiceNumber: invoice.invoiceNumber || "Unknown",
          error: error.message,
          type: "processing_error",
        });
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

    // Small delay between batches to prevent DB overload
    if (batchIndex + batchSize < invoices.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  progress.completed = true;
  progress.endTime = Date.now();
  progress.totalTime = progress.endTime - progress.startTime;
  progress.errors = errors;

  console.log(`Import completed: ${successful} successful, ${failed} failed`);
};

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
        (batch) => (batch.boxes || batch.quantity || 0) > 0
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
      product.productName
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
      .reduce((sum, a) => sum + (a.boxQuantity || 0), 0);
    const totalDeductions = adjustments
      .filter(
        (a) => a.adjustmentType === "remove" || a.adjustmentType === "deduct"
      )
      .reduce((sum, a) => sum + (a.boxQuantity || 0), 0);

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
        stockItem.batches.forEach(batch => {
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
      totalItems: stockItems.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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

    console.log(`Fixing stock sync for: ${stockItem.productName}`);
    console.log(`Current totalBoxes: ${stockItem.totalBoxes}`);

    // Calculate real stock from batches
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
            quantity: batchQty
          });
        }
      });
    }

    const oldTotal = fixPrecision(stockItem.totalBoxes || 0);
    const newTotal = fixPrecision(totalFromBatches);
    const difference = fixPrecision(newTotal - oldTotal);

    console.log(`Calculated from batches: ${totalFromBatches}`);
    console.log(`Difference: ${difference}`);

    // Only update if there's a difference or force sync
    if (Math.abs(difference) > 0.0001 || forceSync) {
      stockItem.totalBoxes = newTotal;
      stockItem.batches = validBatches;
      stockItem.updatedAt = new Date();

      await stockItem.save({ session });

      // Clear cache
      stockCache.delete(normalizedName);
      productCache.delete(normalizedName);

      console.log(`Stock synchronized: ${oldTotal} -> ${newTotal}`);
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
          (a) => a.adjustmentType === "remove" || a.adjustmentType === "deduct"
        ).length,
        recent: adjustments.slice(0, 5).map((a) => ({
          date: a.createdAt,
          type: a.adjustmentType,
          quantity: a.boxQuantity,
          reason: a.reason,
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
        isSynchronized: Math.abs((stockItem?.totalBoxes || 0) - calculatedFromBatches) < 0.0001,
        recommendedAction:
          Math.abs((stockItem?.totalBoxes || 0) - calculatedFromBatches) > 0.0001
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

// Batch stock check endpoint (if you need it)
router.post("/sales/check-stock-batch", async (req, res) => {
  try {
    const { invoices, products } = req.body;

    if (!invoices && !products) {
      return res.status(400).json({
        success: false,
        message: "Either invoices array or products array is required",
      });
    }

    console.log(`Batch stock check for ${invoices ? invoices.length + ' invoices' : products ? products.length + ' products' : 'unknown'}`);

    // If invoices are provided, extract products from them
    let productsToCheck = [];
    
    if (invoices && Array.isArray(invoices)) {
      invoices.forEach(invoice => {
        if (invoice.products && Array.isArray(invoice.products)) {
          invoice.products.forEach(product => {
            const salesQty = fixPrecision(parseFloat(product.salesQty) || 0);
            const bonusQty = fixPrecision(parseFloat(product.bonusQty) || 0);
            if (salesQty + bonusQty > 0) {
              productsToCheck.push({
                productName: product.productName,
                salesQty,
                bonusQty,
                invoiceNumber: invoice.invoiceNumber || "Unknown"
              });
            }
          });
        }
      });
    } else if (products && Array.isArray(products)) {
      productsToCheck = products;
    }

    // Group products by name and sum quantities
    const productMap = new Map();
    
    productsToCheck.forEach(item => {
      const key = normalizeProductName(item.productName);
      if (!productMap.has(key)) {
        productMap.set(key, {
          productName: item.productName,
          normalizedName: key,
          totalSalesQty: 0,
          totalBonusQty: 0,
          totalRequired: 0,
          invoices: new Set()
        });
      }
      
      const productData = productMap.get(key);
      productData.totalSalesQty = fixPrecision(productData.totalSalesQty + item.salesQty);
      productData.totalBonusQty = fixPrecision(productData.totalBonusQty + item.bonusQty);
      productData.totalRequired = fixPrecision(productData.totalRequired + item.salesQty + item.bonusQty);
      if (item.invoiceNumber) {
        productData.invoices.add(item.invoiceNumber);
      }
    });

    // Check stock for each product
    const results = [];
    const issues = [];

    for (const [normalizedName, productData] of productMap.entries()) {
      try {
        // Find product
        const product = await Product.findOne({
          productName: buildProductNameRegex(normalizedName),
        }).lean();

        if (!product) {
          issues.push({
            productName: productData.productName,
            normalizedName,
            availableStock: 0,
            requiredQty: productData.totalRequired,
            insufficient: true,
            message: `Product not found in catalog`,
            invoices: Array.from(productData.invoices)
          });
          continue;
        }

        // Get real-time stock calculation
        const stockData = await calculateRealStock(product._id, product.productName);
        const availableStock = Math.max(0, stockData.availableStock || 0);
        const insufficient = Math.max(0, fixPrecision(productData.totalRequired - availableStock));

        results.push({
          productName: product.productName,
          requestedProductName: productData.productName,
          normalizedName,
          availableStock,
          requiredQty: productData.totalRequired,
          salesQty: productData.totalSalesQty,
          bonusQty: productData.totalBonusQty,
          insufficient: insufficient > 0,
          insufficientQty: insufficient,
          hasEnoughStock: availableStock >= productData.totalRequired,
          calculationMethod: stockData.calculationMethod || "unknown",
          invoices: Array.from(productData.invoices),
          message: insufficient > 0 
            ? `Insufficient stock. Required: ${productData.totalRequired}, Available: ${availableStock}`
            : `Sufficient stock available`
        });

      } catch (error) {
        console.error(`Error checking stock for ${productData.productName}:`, error);
        issues.push({
          productName: productData.productName,
          error: error.message,
          message: `Error checking stock: ${error.message}`
        });
      }
    }

    const hasStockIssues = results.some(r => r.insufficient) || issues.length > 0;

    res.json({
      success: true,
      hasStockIssues,
      totalProducts: productMap.size,
      checkedProducts: results.length,
      issuesCount: issues.length,
      results,
      issues: issues.length > 0 ? issues : undefined,
      summary: {
        totalRequired: results.reduce((sum, r) => sum + r.requiredQty, 0),
        totalAvailable: results.reduce((sum, r) => sum + r.availableStock, 0),
        totalShortfall: results.reduce((sum, r) => sum + (r.insufficientQty || 0), 0),
      }
    });

  } catch (error) {
    console.error("Batch stock check error:", error);
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
        (batch) => (batch.boxes || batch.quantity || 0) > 0
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

    console.log(
      `Starting import (proceed anyway) for ${invoiceData.length} invoices...`
    );

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

router.post("/sales/import", async (req, res) => {
  console.log("1. POST /sales/import route hit");
  let sessionId = null;

  try {
    console.log("2. Starting try block");
    const { invoices } = req.body;
    console.log("3. Extracted invoices from req.body");

    const invoiceData = Array.isArray(invoices) ? invoices : [];
    console.log("4. Created invoiceData array, length:", invoiceData.length);

    if (!invoiceData.length) {
      console.log("5. No invoice data provided, returning 400");
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    console.log("6. Clearing caches");
    productCache.clear();
    console.log("7. productCache cleared");
    stockCache.clear();
    console.log("8. stockCache cleared");
    adjustmentCache.clear();
    console.log("9. adjustmentCache cleared");
    lastCacheClear = Date.now();
    console.log("10. Set lastCacheClear to:", lastCacheClear);

    // Validate stock
    console.log("11. Starting stock validation");
    const validationResult = await checkBatchStockAvailabilityOptimized(
      invoiceData
    );
    console.log("12. Stock validation completed");
    
    // Deduplicate stock issues
    console.log("13. Starting deduplication of stock issues");
    const deduplicatedIssues = [];
    console.log("14. Created deduplicatedIssues array");
    const seenProducts = new Set();
    console.log("15. Created seenProducts Set");

    for (const issue of validationResult.stockIssues) {
      console.log("16. Processing stock issue for product:", issue.standardizedName);
      if (!seenProducts.has(issue.standardizedName)) {
        console.log("17. Adding product to deduplicatedIssues");
        seenProducts.add(issue.standardizedName);
        deduplicatedIssues.push(issue);
      }
    }

    console.log("18. Updating validationResult with deduplicated issues");
    validationResult.stockIssues = deduplicatedIssues;
    console.log("19. Updated stockIssues, new length:", deduplicatedIssues.length);
    validationResult.hasStockIssues = deduplicatedIssues.length > 0;
    console.log("20. Updated hasStockIssues:", validationResult.hasStockIssues);

    if (validationResult.hasStockIssues) {
      console.log("21. Stock issues found, returning 400");
      return res.status(400).json({
        success: false,
        message: "Stock validation failed",
        stockIssues: deduplicatedIssues,
        hasStockIssues: true,
        summary: {
          totalInvoices: invoiceData.length,
          totalProducts: validationResult.totalProducts,
          totalRequired: validationResult.totalRequired,
          totalAvailable: validationResult.totalAvailable,
          totalInsufficient: deduplicatedIssues.reduce(
            (sum, issue) => sum + issue.insufficient,
            0
          ),
        },
      });
    }

    // Create session for import progress
    console.log("22. No stock issues, creating import session");
    sessionId = `import_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    console.log("23. Created sessionId:", sessionId);

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
      stockCheckResult: validationResult,
    });
    console.log("24. Added session to importProgressMap");

    // Start import in background
    console.log("25. Setting timeout for background import");
    setTimeout(() => {
      console.log("26. Timeout callback - Starting background import process");
      processImportBatchWithStockDeduction(sessionId, invoiceData);
    }, 1000);
    console.log("27. Timeout scheduled");

    console.log("28. Returning success response");
    res.json({
      success: true,
      message: "Import started successfully",
      sessionId,
      totalInvoices: invoiceData.length,
      validationSummary: {
        totalProducts: validationResult.totalProducts,
        totalRequired: validationResult.totalRequired,
        totalAvailable: validationResult.totalAvailable,
        canProceed: true,
      },
      progressUrl: `/api/sales/import/progress/${sessionId}`,
    });
    console.log("29. Success response sent");
  } catch (error) {
    console.log("30. Catch block entered");
    console.error("Import start error:", error);
    if (sessionId) {
      console.log("31. Deleting session from importProgressMap");
      importProgressMap.delete(sessionId);
    }

    console.log("32. Returning error response");
    res.status(500).json({
      success: false,
      message: "Import failed",
      error: error.message,
    });
    console.log("33. Error response sent");
  }
  console.log("34. End of route handler");
});

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
      groupedIssues[issue.standardizedName].requiredQty = fixPrecision(groupedIssues[issue.standardizedName].requiredQty + issue.requiredQty);
      if (issue.invoices && Array.isArray(issue.invoices)) {
        groupedIssues[issue.standardizedName].invoices.push(...issue.invoices);
      }
    });

    // Convert to array and sort by insufficient amount (highest first)
    const allStockIssues = Object.values(groupedIssues).sort(
      (a, b) => b.insufficient - a.insufficient
    );

    res.json({
      success: true,
      data: {
        stockIssues: allStockIssues,
        totalProducts: allStockIssues.length,
        totalInsufficient: stockIssues.reduce(
          (sum, issue) => sum + issue.insufficient,
          0
        ),
        totalRequired: stockIssues.reduce(
          (sum, issue) => sum + issue.requiredQty,
          0
        ),
        totalAvailable: stockIssues.reduce(
          (sum, issue) => sum + issue.availableStock,
          0
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
        issue["Sales Qty"] = fixPrecision(issue["Sales Qty"] + (error.details?.salesQty || 0));
        issue["Bonus Qty"] = fixPrecision(issue["Bonus Qty"] + (error.details?.bonusQty || 0));
        issue["Total Required"] = fixPrecision(issue["Total Required"] + (error.details?.requiredQty || 0));
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
        issue["Total Required"] - issue["Total Available"]
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
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="import_failed_${
        new Date().toISOString().split("T")[0]
      }.xlsx"`
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
      if (p.productName.toLowerCase().includes("iotekam")) {
        correctedName = p.productName.toLowerCase().replace(/^i/, "l");
      }
      if (p.productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

      const normalizedName = normalizeProductName(correctedName);
      stockCache.delete(normalizedName); // Clear cache for fresh check

      const stockCheck = await findProductStockInHandOptimized(
        p.productName.trim(),
        salesQty,
        bonusQty
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
      if (p.productName.toLowerCase().includes("iotekam")) {
        correctedName = p.productName.toLowerCase().replace(/^i/, "l");
      }
      if (p.productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

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
        bonusQty
      );

      stockDeductionResults.push({
        product: p.productName.trim(),
        ...deductionResult,
      });

      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${p.productName}: ${deductionResult.message}`
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
      startDate
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
      }
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
      startDate
    )}_to_${formatDateToReadable(endDate)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
      "productName"
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
      a.localeCompare(b, "en", { sensitivity: "base" })
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
        if (p.productName.toLowerCase().includes("iotekam")) {
          correctedName = p.productName.toLowerCase().replace(/^i/, "l");
        }
        if (p.productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

        const normalizedName = normalizeProductName(correctedName);
        stockCache.delete(normalizedName); // Clear cache

        const stockCheck = await findProductStockInHandOptimized(
          p.productName,
          salesQty,
          bonusQty
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
      if (p.productName.toLowerCase().includes("iotekam")) {
        correctedName = p.productName.toLowerCase().replace(/^i/, "l");
      }
      if (p.productName.toLowerCase() === "profokam") {
        correctedName = "Profokam 1%";
      }

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
        bonusQty
      );

      stockDeductionResults.push({
        product: p.productName.trim(),
        ...deductionResult,
      });

      if (!deductionResult.success) {
        throw new Error(
          `Stock deduction failed for ${p.productName}: ${deductionResult.message}`
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
          `Invoice number "${req.body.invoiceNumber}" already exists.`
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
        (op) => op.productName === p.productName
      );
      const originalSalesQty = originalProduct
        ? fixPrecision(Number(originalProduct.salesQty) || 0)
        : 0;
      const originalBonusQty = originalProduct
        ? fixPrecision(Number(originalProduct.bonusQty) || 0)
        : 0;
      const originalTotalQty = fixPrecision(originalSalesQty + originalBonusQty);

      // Calculate stock difference
      const quantityDifference = fixPrecision(newTotalQty - originalTotalQty);

      if (Math.abs(quantityDifference) > 0.0001) {
        if (quantityDifference > 0) {
          // Check if we have enough stock to increase
          // Handle product name variations
          let correctedName = p.productName;
          if (p.productName.toLowerCase().includes("iotekam")) {
            correctedName = p.productName.toLowerCase().replace(/^i/, "l");
          }
          if (p.productName.toLowerCase() === "profokam") {
            correctedName = "Profokam 1%";
          }

          const normalizedName = normalizeProductName(correctedName);
          stockCache.delete(normalizedName); // Clear cache

          const stockCheck = await findProductStockInHandOptimized(
            p.productName,
            Math.abs(quantityDifference),
            0
          );

          if (stockCheck.insufficient) {
            throw new Error(stockCheck.message);
          }

          // Deduct additional stock
          await deductStockFromReportInHand(
            p.productName,
            quantityDifference,
            0
          );
        } else if (quantityDifference < 0) {
          // Restore reduced stock
          await restoreStockToReportInHand(
            p.productName,
            Math.abs(quantityDifference)
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
        if (p.productName.toLowerCase().includes("iotekam")) {
          correctedName = p.productName.toLowerCase().replace(/^i/, "l");
        }
        if (p.productName.toLowerCase() === "profokam") {
          correctedName = "Profokam 1%";
        }

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
          saleData.recordingDate || originalSale.recordingDate
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
      { new: true, runValidators: true, session }
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
      0
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

    // Get adjustments
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

// New endpoint: Get current stock for a product (real-time)
router.get("/sales/current-stock/:productName", async (req, res) => {
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

    // Clear cache for fresh data
    stockCache.delete(normalizedName);

    // Find stock item with flexible matching
    const stockItem = await ReportInHand.findOne({
      productName: buildProductNameRegex(normalizedName),
    });

    if (!stockItem) {
      // Check if there are adjustments for this product
      const product = await Product.findOne({
        productName: buildProductNameRegex(normalizedName),
      });

      if (product) {
        const adjustments = await getProductAdjustments(product._id);
        if (adjustments > 0) {
          return res.json({
            success: true,
            productName: productName,
            correctedName: correctedName,
            normalizedName: normalizedName,
            found: false,
            totalBoxesField: 0,
            totalBoxesFromBatches: 0,
            adjustments: adjustments,
            batches: [],
            message: `Product not found in stock batches, but has ${adjustments} units from adjustments`,
            calculationMethod: "adjustments",
          });
        }
      }

      return res.json({
        success: true,
        productName: productName,
        correctedName: correctedName,
        normalizedName: normalizedName,
        found: false,
        totalBoxesField: 0,
        totalBoxesFromBatches: 0,
        batches: [],
        message: "Product not found in stock",
      });
    }

    // Calculate from batches
    let totalFromBatches = 0;
    const batchDetails = [];

    if (stockItem.batches && Array.isArray(stockItem.batches)) {
      stockItem.batches.forEach((batch, index) => {
        const batchQty = batch.boxes || batch.quantity || 0;
        totalFromBatches += batchQty;
        batchDetails.push({
          batchIndex: index + 1,
          boxes: batchQty,
          expiryDate: batch.expiryDate,
        });
      });
    }

    // Get adjustments
    const adjustments = await getProductAdjustments(
      stockItem.productId || stockItem._id
    );
    const totalAvailable = totalFromBatches + adjustments;

    res.json({
      success: true,
      productName: stockItem.productName,
      normalizedName: normalizedName,
      found: true,
      totalBoxesField: stockItem.totalBoxes || 0,
      totalBoxesFromBatches: totalFromBatches,
      adjustments: adjustments,
      totalAvailable: totalAvailable,
      batchCount: stockItem.batches?.length || 0,
      batches: batchDetails,
      isSynchronized: Math.abs(stockItem.totalBoxes - totalFromBatches) < 0.0001,
      calculationMethod: totalFromBatches > 0 ? "batches" : "adjustments",
      message: `Field: ${
        stockItem.totalBoxes || 0
      }, Batches: ${totalFromBatches}, Adjustments: ${adjustments}, Total: ${totalAvailable}, Synchronized: ${
        Math.abs(stockItem.totalBoxes - totalFromBatches) < 0.0001 ? "Yes" : "No"
      }`,
    });
  } catch (error) {
    console.error("Error getting current stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get current stock",
      error: error.message,
    });
  }
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

// router.post("/sales/check-stock", async (req, res) => {
//   try {
//     const { productName, requiredQty, salesQty, bonusQty = 0, tolerance = 0 } = req.body;

//     // Handle both single product and batch-style requests
//     if (!productName || (requiredQty === undefined && salesQty === undefined)) {
//       return res.status(400).json({
//         success: false,
//         message: "Product name and quantity are required",
//       });
//     }

//     // Use requiredQty if provided, otherwise calculate from salesQty + bonusQty
//     const totalRequiredQty = fixPrecision(
//       requiredQty !== undefined 
//         ? requiredQty 
//         : (salesQty || 0) + (bonusQty || 0)
//     );

//     console.log(`Checking stock for product: ${productName}, Required: ${totalRequiredQty}, Tolerance: ${tolerance}`);

//     // Handle product name variations
//     let correctedName = productName;
//     if (productName.toLowerCase().includes("iotekam")) {
//       correctedName = productName.toLowerCase().replace(/^i/, "l");
//     }
//     if (productName.toLowerCase() === "profokam") {
//       correctedName = "Profokam 1%";
//     }

//     const normalizedName = normalizeProductName(correctedName);

//     // Clear cache for fresh data
//     stockCache.delete(normalizedName);
//     productCache.delete(normalizedName);

//     // Find product
//     const product = await Product.findOne({
//       productName: buildProductNameRegex(normalizedName),
//     }).lean();

//     if (!product) {
//       return res.json({
//         success: false,
//         productName,
//         correctedName,
//         normalizedName,
//         found: false,
//         availableStock: 0,
//         requiredQty: totalRequiredQty,
//         insufficient: true,
//         insufficientQty: totalRequiredQty,
//         hasEnoughStock: false,
//         message: `Product "${productName}" not found in catalog`,
//       });
//     }

//     // Get real-time stock calculation
//     const stockData = await calculateRealStock(product._id, product.productName);
    
//     // Use availableStock which includes both batches and adjustments
//     const availableStock = Math.max(0, stockData.availableStock || 0);
//     const insufficient = Math.max(0, fixPrecision(totalRequiredQty - availableStock));

//     // Add tolerance for floating-point errors
//     const actualTolerance = tolerance > 0 ? tolerance : availableStock * 0.01;
//     const hasEnoughStock = availableStock + actualTolerance >= totalRequiredQty;

//     const result = {
//       success: true,
//       productName: product.productName,
//       requestedProductName: productName,
//       normalizedName,
//       availableStock,
//       requiredQty: totalRequiredQty,
//       salesQty: salesQty || 0,
//       bonusQty: bonusQty || 0,
//       insufficient: !hasEnoughStock,
//       insufficientQty: hasEnoughStock ? 0 : insufficient,
//       hasEnoughStock,
//       calculationMethod: stockData.calculationMethod || "unknown",
//       usesAdjustments: stockData.usesAdjustments || false,
//       breakdown: {
//         baseStock: stockData.baseStock || 0,
//         adjustments: stockData.totalAdjustments || 0,
//         available: availableStock,
//       },
//       productId: product._id,
//       message: hasEnoughStock 
//         ? `Sufficient stock available (${availableStock} units)` 
//         : `Insufficient stock. Required: ${totalRequiredQty}, Available: ${availableStock}, Shortfall: ${insufficient}`,
//     };

//     console.log("Stock check result:", result);
//     res.json(result);
//   } catch (error) {
//     console.error("Stock check error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Failed to check stock",
//       error: error.message,
//     });
//   }
// });


export default router;