import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import PaymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";

const router = express.Router();

let importProgressMap = new Map();

const createSessionId = () =>
  `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 🔥 FIXED: Ensure collections exist with better error handling
const ensureCollectionsExist = async () => {
  try {
    console.log("🔧 Checking database collections...");
    
    // Check connection state
    const dbState = mongoose.connection.readyState;
    console.log(`📊 Database connection state: ${dbState}`);
    
    if (dbState !== 1) {
      console.log("⚠️ Database not connected, waiting for connection...");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    try {
      // Try to access collections
      const collections = await mongoose.connection.db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      console.log("📊 Available collections:", collectionNames);
      
      // Check if collections exist
      if (!collectionNames.includes('salesummaries')) {
        console.log("⚠️ salesummaries collection doesn't exist, creating...");
        try {
          await mongoose.connection.db.createCollection('salesummaries');
          console.log("✅ Created salesummaries collection");
        } catch (createError) {
          console.log("⚠️ Could not create salesummaries collection:", createError.message);
        }
      }
      
      if (!collectionNames.includes('mrcashes')) {
        console.log("⚠️ mrcashes collection doesn't exist, creating...");
        try {
          await mongoose.connection.db.createCollection('mrcashes');
          console.log("✅ Created mrcashes collection");
        } catch (createError) {
          console.log("⚠️ Could not create mrcashes collection:", createError.message);
        }
      }
      
      // Try to create indexes
      try {
        await SaleSummary.createIndexes();
        await MRCash.createIndexes();
        console.log("✅ Database indexes created/verified");
      } catch (indexError) {
        console.log("ℹ️ Index creation note:", indexError.message);
      }
      
    } catch (collectionError) {
      console.log("⚠️ Could not list collections:", collectionError.message);
      // Try to create collections directly
      try {
        const saleModel = new SaleSummary();
        await saleModel.$__collection.createIndex({ invoiceNumber: 1 }, { unique: true });
        console.log("✅ Created SaleSummary index");
      } catch (e) {
        console.log("⚠️ Could not create SaleSummary index:", e.message);
      }
    }
    
    console.log("✅ Database setup complete");
    
  } catch (error) {
    console.error("❌ Error ensuring collections exist:", error.message);
    // Don't throw, just log
  }
};

// Call this when the server starts
setTimeout(() => {
  ensureCollectionsExist();
}, 2000);

const normalizeProductName = (name) => {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

const productNameFixMap = {
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n-lycopene+wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n flaxseed oil": "N-FLAXSEED OIL",
  "flaxseed oil": "N-FLAXSEED OIL",
  "n evening primrose oil": "N-EVENING PRIMROSE OIL",
  "evening primrose oil": "N-EVENING PRIMROSE OIL",
  "n multiz": "N-MULTIZ",
  multiz: "N-MULTIZ",
  "n garlic oil": "N-GARLIC OIL",
  "garlic oil": "N-GARLIC OIL",
  "n fenugreek oil": "N-FENUGREEK OIL",
  "fenugreek oil": "N-FENUGREEK OIL",
  "n nigella oil": "N-NIGELLA OIL",
  "nigella oil": "N-NIGELLA OIL",
  "n krill oil": "N-KRILL OIL",
  "krill oil": "N-KRILL OIL",
  "n sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "ecomol 500": "ECOMOL 500",
  ecomol500: "ECOMOL 500",
  "ecomol-500": "ECOMOL 500",
  ecomol: "ECOMOL 500",
};

const getStrictNormalizedProductName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
};

const findMRStaff = async (mrName, mrId) => {
  let mrStaff = null;
  
  if (mrId && mongoose.Types.ObjectId.isValid(mrId)) {
    mrStaff = await Staff.findById(mrId).lean();
  }
  
  if (
    !mrStaff &&
    mrName &&
    mrName.trim() !== "" &&
    mrName.trim() !== "No MR Name Provided"
  ) {
    mrStaff = await Staff.findOne({
      $or: [
        { name: { $regex: new RegExp("^" + mrName.trim() + "$", "i") } },
        { name: { $regex: new RegExp(mrName.trim(), "i") } },
        { email: { $regex: new RegExp(mrName.trim(), "i") } },
      ],
    }).lean();
  }
  
  return mrStaff;
};

// 🔥 SIMPLIFIED: addCashToMR function
const addCashToMR = async (saleData, existingCashAmount = 0) => {
  try {
    const {
      mrName = "No MR Name Provided",
      mrId,
      paidAmount = 0,
      invoiceNumber,
      invoiceDate,
      customerName,
      paymentStatus,
    } = saleData;

    // Only process cash/paid sales with positive amount
    if (!(paymentStatus === "Cash" || paymentStatus === "Paid") || paidAmount <= 0) {
      return { success: false, reason: "Not cash/paid or zero amount" };
    }

    console.log(`💰 Processing cash for invoice ${invoiceNumber}: $${paidAmount}`);

    // Find MR staff
    let mrStaff = null;
    if (mrId && mongoose.Types.ObjectId.isValid(mrId)) {
      mrStaff = await Staff.findById(mrId);
    }
    
    if (!mrStaff && mrName !== "No MR Name Provided") {
      mrStaff = await Staff.findOne({
        name: { $regex: new RegExp(mrName.trim(), "i") }
      });
    }

    if (!mrStaff) {
      console.warn(`⚠️ MR not found: "${mrName}"`);
      // Create a placeholder MR if not found
      mrStaff = new Staff({
        name: mrName,
        email: `${mrName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        role: "Medical Representative",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await mrStaff.save();
      console.log(`✅ Created placeholder MR: ${mrStaff.name} (ID: ${mrStaff._id})`);
    }

    console.log(`✅ Using MR: ${mrStaff.name} (ID: ${mrStaff._id})`);

    // Find or create MRCash record
    let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    
    const amountToAdd = parseFloat(paidAmount) || 0;
    const existingAmount = parseFloat(existingCashAmount) || 0;
    const netAmount = existingAmount > 0 ? amountToAdd - existingAmount : amountToAdd;

    if (!mrCash) {
      // Create new MRCash record
      mrCash = new MRCash({
        mrId: mrStaff._id,
        mrName: mrStaff.name,
        currentCash: amountToAdd,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial cash from invoice ${invoiceNumber} (customer: ${customerName || "Unknown"})`,
        recentTransactions: [{
          invoiceNumber: invoiceNumber,
          amount: netAmount,
          type: 'sale',
          date: invoiceDate || new Date(),
          notes: `Sale to ${customerName || "Unknown"}`
        }],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await mrCash.save();
      console.log(`💰 Created new cash record for ${mrStaff.name}: $${amountToAdd}`);
      
    } else {
      // Update existing record
      const currentCash = parseFloat(mrCash.currentCash) || 0;
      const newCash = currentCash + netAmount;
      
      mrCash.currentCash = newCash;
      mrCash.updatedAt = new Date();
      
      // Add to recent transactions
      mrCash.recentTransactions = mrCash.recentTransactions || [];
      mrCash.recentTransactions.push({
        invoiceNumber: invoiceNumber,
        amount: netAmount,
        type: netAmount > 0 ? 'sale' : 'adjustment',
        date: invoiceDate || new Date(),
        notes: `Sale to ${customerName || "Unknown"}`
      });
      
      // Keep only last 50 transactions
      if (mrCash.recentTransactions.length > 50) {
        mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
      }
      
      await mrCash.save();
      console.log(`💰 Updated cash for ${mrStaff.name}: ${netAmount > 0 ? '+' : ''}$${netAmount} → Total: $${newCash}`);
    }

    return {
      success: true,
      mrName: mrStaff.name,
      mrId: mrStaff._id,
      amountAdded: netAmount,
      currentCash: mrCash.currentCash || 0,
    };

  } catch (error) {
    console.error("❌ addCashToMR failed:", error);
    // Return a success but log the error
    return {
      success: false,
      error: error.message
    };
  }
};

const removeCashFromMR = async (saleData) => {
  try {
    const { mrName, mrId, paidAmount, invoiceNumber, customerName } = saleData;
    if (paidAmount <= 0) return { success: false };
    
    const mrStaff = await findMRStaff(mrName, mrId);
    if (!mrStaff) return { success: false };
    
    const mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    if (!mrCash) return { success: false };
    
    mrCash.currentCash = Math.max(0, mrCash.currentCash - paidAmount);
    mrCash.recentTransactions = mrCash.recentTransactions || [];
    mrCash.recentTransactions.push({
      invoiceNumber,
      amount: -paidAmount,
      type: "return",
      date: new Date(),
      notes: `Removed from ${customerName || "Unknown"}`,
    });
    
    if (mrCash.recentTransactions.length > 50) {
      mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
    }
    
    await mrCash.save();
    return {
      success: true,
      amountRemoved: paidAmount,
      currentCash: mrCash.currentCash,
    };
  } catch (error) {
    console.error("❌ removeCashFromMR failed:", error);
    throw error;
  }
};

const findProductInInventory = async (productName) => {
  try {
    const normalized = normalizeProductName(productName);
    const strict = getStrictNormalizedProductName(productName);
    const fixed = productNameFixMap[normalized] || productNameFixMap[strict];
    
    if (fixed) {
      const match = await ReportInHand.findOne({
        productName: { $regex: new RegExp(`^${fixed}$`, "i") },
      });
      if (match) return match;
    }
    
    const allProducts = await ReportInHand.find({});
    for (const p of allProducts) {
      const pNorm = normalizeProductName(p.productName);
      const pStrict = getStrictNormalizedProductName(p.productName);
      
      if (
        p.productName.toLowerCase() === productName.toLowerCase() ||
        pNorm === normalized ||
        pStrict === strict ||
        p.productName.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(p.productName.toLowerCase())
      ) {
        return p;
      }
      
      if (
        productName.toLowerCase().includes("ecomol") &&
        p.productName.toLowerCase().includes("ecomol")
      ) {
        return p;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Product finder error:", error);
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
    return: "Return",
    returns: "Return",
  };
  return map[s] || "Credit";
};

const parseDateString = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d)) return d;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const formatted = new Date(`${year}-${month}-${day}`);
    if (!isNaN(formatted)) return formatted;
  }
  return null;
};

const isReturnTransaction = (remark = "", paymentStatus = "") => {
  const r = remark.toLowerCase();
  const p = paymentStatus.toLowerCase();
  return /return|returns/.test(r) || /return|returns/.test(p);
};

// 🔥 SIMPLIFIED: updateReportInHandAfterSale function
const updateReportInHandAfterSale = async (productName, salesQty, bonusQty = 0) => {
  try {
    const totalQty = salesQty + bonusQty;
    
    if (totalQty === 0) {
      console.log(`ℹ️ Zero quantity for "${productName}" - skipping inventory update`);
      return;
    }

    console.log(`📦 Updating inventory for "${productName}": ${totalQty > 0 ? '-' : '+'}${Math.abs(totalQty)}`);

    // Find product
    const product = await findProductInInventory(productName);
    
    if (!product) {
      console.warn(`⚠️ Product "${productName}" not found in inventory, skipping update`);
      return;
    }

    // Get current stock
    let currentStock = 0;
    if (product.batches && Array.isArray(product.batches) && product.batches.length > 0) {
      currentStock = product.batches.reduce((sum, batch) => sum + (batch.boxes || 0), 0);
    } else if (product.totalBoxes !== undefined) {
      currentStock = product.totalBoxes;
    } else if (product.currentStock !== undefined) {
      currentStock = product.currentStock;
    } else {
      currentStock = product.boxes || 0;
    }

    console.log(`   Current stock: ${currentStock}, Change: ${totalQty}`);

    // Calculate new stock
    const newStock = currentStock - totalQty;

    // Update directly without complex logic
    await ReportInHand.findByIdAndUpdate(
      product._id,
      {
        $set: {
          totalBoxes: newStock,
          currentStock: newStock,
          boxes: newStock,
          updatedAt: new Date()
        }
      }
    );

    console.log(`   ✅ Inventory updated: ${currentStock} → ${newStock}`);

  } catch (error) {
    console.error(`❌ Error updating inventory for "${productName}":`, error.message);
    // Don't throw, just log
  }
};

const updateInventoryForExchange = async (productName, salesQty, bonusQty, isIncoming = false) => {
  try {
    const totalQty = salesQty + bonusQty;
    if (totalQty === 0) {
      return 0;
    }
    
    const existingProduct = await findProductInInventory(productName);
    if (!existingProduct) {
      console.warn(`⚠️ Product "${productName}" not found in inventory.`);
      return 0;
    }

    let currentStock = 0;
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      currentStock = existingProduct.batches.reduce(
        (total, batch) => total + (batch.boxes || 0),
        0
      );
    } else if (existingProduct.totalBoxes !== undefined) {
      currentStock = existingProduct.totalBoxes;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
    } else {
      currentStock = existingProduct.boxes || 0;
    }

    let updatedStock;
    if (isIncoming) {
      // For incoming products in exchange (negative quantity)
      updatedStock = currentStock + Math.abs(totalQty);
    } else {
      // For outgoing products in exchange (positive quantity)
      updatedStock = currentStock - Math.abs(totalQty);
    }

    // Simple update
    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: {
        totalBoxes: updatedStock,
        currentStock: updatedStock,
        boxes: updatedStock,
        updatedAt: new Date()
      }
    });

    let lcValue = 0;
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      lcValue = existingProduct.batches[0].lc || 0;
    } else {
      lcValue = existingProduct.lc || 0;
    }

    return lcValue;
  } catch (error) {
    console.error(
      `❌ Error updating inventory for exchange product "${productName}":`,
      error.message
    );
    return 0;
  }
};

const restoreReportInHandAfterSaleDeletion = async (
  productName,
  salesQty,
  bonusQty,
  isExchange = false,
  remark = "",
  paymentStatus = ""
) => {
  try {
    const isReturn = isReturnTransaction(remark, paymentStatus);
    const totalQty = salesQty + bonusQty;
    const isIncoming = totalQty < 0;

    if (isReturn) {
      // For returns, we added to inventory, so now we need to deduct
      const returnQty = Math.abs(salesQty) + Math.abs(bonusQty);
      await updateReportInHandAfterSale(
        productName,
        -returnQty, // Negative to deduct
        0
      );
    } else if (isExchange && isIncoming) {
      // For exchange incoming, we added to inventory, now deduct
      await updateReportInHandAfterSale(productName, -Math.abs(totalQty), 0);
    } else if (isExchange && !isIncoming) {
      // For exchange outgoing, we deducted from inventory, now add back
      await updateReportInHandAfterSale(productName, Math.abs(totalQty), 0);
    } else {
      // For regular sales, restore inventory
      await updateReportInHandAfterSale(productName, salesQty, bonusQty);
    }
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    // Don't throw, just log
  }
};

// 🔥 SIMPLIFIED: getOrCreateCustomer function
const getOrCreateCustomer = async (customerData) => {
  try {
    let customer = null;
    
    // Try by customer code
    if (customerData.customerCode && customerData.customerCode.trim() !== "") {
      customer = await Customer.findOne({ 
        customerCode: customerData.customerCode 
      });
    }
    
    // Try by name
    if (!customer && customerData.customerName) {
      customer = await Customer.findOne({
        name: { $regex: new RegExp(customerData.customerName.trim(), "i") }
      });
    }
    
    // Create if not found
    if (!customer) {
      // Generate unique customer code
      const customerCode = customerData.customerCode || 
                          `CUST-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
      
      customer = new Customer({
        name: customerData.customerName || "Unknown Customer",
        customerCode: customerCode,
        customerNumber: customerData.customerNumber || "000000",
        address: customerData.address || "Not provided",
        zone: customerData.zone || "General",
        phone: customerData.phone || "000-000-0000",
        email: customerData.email || "no-email@example.com",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      await customer.save();
      console.log(`✅ Created new customer: ${customer.name} (Code: ${customer.customerCode})`);
    }
    
    return {
      customerId: customer._id,
      customerName: customer.name,
      customerCode: customer.customerCode,
      fullCustomer: customer
    };
    
  } catch (error) {
    console.error("Error in getOrCreateCustomer:", error);
    
    // Return a default customer ID
    return {
      customerId: new mongoose.Types.ObjectId(),
      customerName: customerData.customerName || "Unknown Customer",
      customerCode: customerData.customerCode || "UNKNOWN"
    };
  }
};

const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber };
  if (excludeId) query._id = { $ne: excludeId };
  return await SaleSummary.findOne(query);
};

const parseQuantityWithParenthesis = (qty) => {
  if (!qty) return 0;
  if (typeof qty === "number") return qty;
  const str = qty.toString().trim();
  if (str.startsWith("(") && str.endsWith(")")) {
    return -parseFloat(str.slice(1, -1)) || 0;
  }
  return parseFloat(str) || 0;
};

// 🔥 CRITICAL FIX: Simplified processImportBatch function
const processImportBatch = async (batch, batchIndex, totalBatches, sessionId) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    console.error("❌ Session lost during processing");
    return { success: 0, failed: 0, errors: [] };
  }
  
  console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} with ${batch.length} invoices`);
  
  const results = { 
    success: 0, 
    failed: 0, 
    errors: [], 
    cashUpdates: [] 
  };
  
  for (let i = 0; i < batch.length; i++) {
    const saleData = batch[i];
    const currentIndex = progress.processedInvoices + 1;
    
    try {
      console.log(`\n🔵 [${currentIndex}] Processing: ${saleData.invoiceNumber || 'Unknown'}`);
      
      // 1. BASIC VALIDATION
      if (!saleData.invoiceNumber || saleData.invoiceNumber.trim() === "") {
        throw new Error("Invoice number is required");
      }
      
      // 2. CHECK FOR DUPLICATE INVOICE
      const existingSale = await SaleSummary.findOne({ 
        invoiceNumber: saleData.invoiceNumber.trim() 
      });
      
      if (existingSale) {
        console.log(`⚠️ Invoice ${saleData.invoiceNumber} already exists, skipping...`);
        results.failed++;
        progress.failed++;
        progress.processedInvoices++;
        continue;
      }
      
      // 3. SIMPLE DATA PREPARATION
      const invoiceDate = parseDateString(saleData.invoiceDate) || new Date();
      const recordingDate = parseDateString(saleData.recordingDate) || new Date();
      const dueDate = parseDateString(saleData.dueDate) || null;
      const deliveryDate = parseDateString(saleData.deliveryDate) || recordingDate;
      
      // 4. GET MR STAFF (SIMPLIFIED)
      let mrStaff = null;
      const mrName = saleData.mrName && saleData.mrName.trim() !== "" 
        ? saleData.mrName.trim() 
        : "No MR Name Provided";
      
      if (mrName !== "No MR Name Provided") {
        mrStaff = await Staff.findOne({
          name: { $regex: new RegExp(mrName, "i") }
        });
      }
      
      // 5. CREATE CUSTOMER INFO
      let customerInfo = {
        customerId: new mongoose.Types.ObjectId(),
        customerName: saleData.customerName || "Unknown Customer",
        customerCode: saleData.customerCode || "UNKNOWN"
      };
      
      // 6. PREPARE PRODUCTS
      const products = Array.isArray(saleData.products) ? saleData.products : [];
      const processedProducts = products.map(product => ({
        productName: product.productName || "Unknown Product",
        originalProductName: product.productName || "Unknown Product",
        salesQty: parseFloat(product.salesQty) || 0,
        bonusQty: parseFloat(product.bonusQty) || 0,
        totalQty: (parseFloat(product.salesQty) || 0) + (parseFloat(product.bonusQty) || 0),
        sellingPrice: parseFloat(product.sellingPrice) || 0,
        amount: parseFloat(product.amount) || 0,
        discount: parseFloat(product.discount) || 0,
        netSellingAmount: parseFloat(product.netSellingAmount) || 0,
        averageUnitPrice: parseFloat(product.averageUnitPrice) || 0,
        lc: parseFloat(product.lc) || 0,
        profitLoss: parseFloat(product.profitLoss) || 0,
        isProductAccept: product.isProductAccept !== false,
        isExchangeProduct: false,
        isReturnProduct: false,
      }));
      
      // 7. CALCULATE TOTALS
      const totalAmount = processedProducts.reduce((sum, p) => sum + (p.netSellingAmount || 0), 0);
      const paidAmount = parseFloat(saleData.paidAmount) || 0;
      const dueAmount = Math.max(0, totalAmount - paidAmount);
      const paymentStatus = mapPaymentStatus(saleData.paymentStatus);
      
      // 8. CREATE SALE DOCUMENT
      const newSale = new SaleSummary({
        recordingDate: recordingDate,
        invoiceNumber: saleData.invoiceNumber.trim(),
        invoiceDate: invoiceDate,
        mrName: mrName,
        mrId: mrStaff ? mrStaff._id : null,
        customerName: customerInfo.customerName,
        customerCode: customerInfo.customerCode,
        customerId: customerInfo.customerId,
        products: processedProducts,
        creditDays: parseInt(saleData.creditDays) || 0,
        dueDate: dueDate,
        deliveryDate: deliveryDate,
        paidAmount: paidAmount,
        dueAmount: dueAmount,
        totalAmount: totalAmount,
        paymentStatus: paymentStatus,
        remark: saleData.remark || "",
        isReturn: false,
        isExchange: false,
        importBatchId: batchIndex,
        importStatus: "imported",
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`💾 Saving sale: ${newSale.invoiceNumber}, Total: $${totalAmount}`);
      
      // 9. SAVE TO DATABASE
      const savedSale = await newSale.save();
      console.log(`✅ Sale saved with ID: ${savedSale._id}`);
      
      // 10. HANDLE CASH (SIMPLIFIED)
      if ((paymentStatus === "Cash" || paymentStatus === "Paid") && paidAmount > 0) {
        try {
          const cashResult = await addCashToMR({
            mrName: mrName,
            mrId: mrStaff ? mrStaff._id : null,
            paidAmount: paidAmount,
            invoiceNumber: savedSale.invoiceNumber,
            invoiceDate: savedSale.invoiceDate,
            customerName: customerInfo.customerName,
            paymentStatus: paymentStatus
          });
          
          if (cashResult.success) {
            results.cashUpdates.push(cashResult);
            progress.cashSalesCount = (progress.cashSalesCount || 0) + 1;
            progress.cashAmountAdded = (progress.cashAmountAdded || 0) + (cashResult.amountAdded || 0);
            console.log(`   💰 Cash added: $${cashResult.amountAdded || paidAmount}`);
          }
        } catch (cashError) {
          console.log(`   ⚠️ Cash handling note: ${cashError.message}`);
        }
      }
      
      // 11. UPDATE PROGRESS
      results.success++;
      progress.successful++;
      progress.processedInvoices++;
      
      console.log(`   🎉 Success: ${savedSale.invoiceNumber}`);
      
    } catch (error) {
      console.error(`   ❌ Failed to import invoice: ${error.message}`);
      
      results.failed++;
      progress.failed++;
      progress.processedInvoices++;
      
      results.errors.push({
        invoiceNumber: saleData.invoiceNumber || `Row-${currentIndex}`,
        customerName: saleData.customerName || "Unknown",
        error: error.message,
        type: "import_error",
        timestamp: new Date().toISOString()
      });
    }
    
    // Update progress tracking
    progress.currentBatchProgress = Math.round(((i + 1) / batch.length) * 100);
    progress.progressPercentage = Math.round((progress.processedInvoices / progress.totalInvoices) * 100);
    progress.lastUpdated = Date.now();
    
    console.log(`📊 Progress: ${progress.progressPercentage}%`);
  }
  
  // Final batch update
  progress.currentBatchProgress = 100;
  progress.lastUpdated = Date.now();
  
  console.log(`📊 Batch ${batchIndex + 1} complete: ${results.success} success, ${results.failed} failed`);
  
  return results;
};

// Debug endpoint to check database status
router.get("/debug/database-status", async (req, res) => {
  try {
    // Check connection
    const dbStatus = mongoose.connection.readyState;
    const dbStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    // Get collection counts
    const saleCount = await SaleSummary.countDocuments();
    const mrcashCount = await MRCash.countDocuments();
    const staffCount = await Staff.countDocuments();
    const customerCount = await Customer.countDocuments();

    // Get sample data
    const sampleSale = await SaleSummary.findOne().sort({ createdAt: -1 });
    const sampleMRCASH = await MRCash.findOne().sort({ createdAt: -1 });

    // Check indexes
    let saleIndexes = [];
    let mrcashIndexes = [];
    try {
      saleIndexes = await SaleSummary.collection.indexes();
      mrcashIndexes = await MRCash.collection.indexes();
    } catch (indexError) {
      console.log("Index check note:", indexError.message);
    }

    res.json({
      success: true,
      database: {
        status: dbStates[dbStatus],
        name: mongoose.connection.name,
        host: mongoose.connection.host,
      },
      collections: {
        SaleSummary: {
          count: saleCount,
          collectionName: SaleSummary.collection?.name || "unknown",
        },
        MRCash: {
          count: mrcashCount,
          collectionName: MRCash.collection?.name || "unknown",
        },
        Staff: { count: staffCount },
        Customer: { count: customerCount },
      },
      sampleData: {
        latestSale: sampleSale
          ? {
              _id: sampleSale._id,
              invoiceNumber: sampleSale.invoiceNumber,
              mrName: sampleSale.mrName,
              mrId: sampleSale.mrId,
              paymentStatus: sampleSale.paymentStatus,
              paidAmount: sampleSale.paidAmount,
              createdAt: sampleSale.createdAt,
            }
          : null,
        latestMRCASH: sampleMRCASH
          ? {
              _id: sampleMRCASH._id,
              mrName: sampleMRCASH.mrName,
              mrId: sampleMRCASH.mrId,
              currentCash: sampleMRCASH.currentCash,
              recentTransactions: sampleMRCASH.recentTransactions,
              createdAt: sampleMRCASH.createdAt,
            }
          : null,
      },
      indexes: {
        SaleSummary: saleIndexes.map((idx) => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
        })),
        MRCash: mrcashIndexes.map((idx) => ({
          name: idx.name,
          key: idx.key,
          unique: idx.unique || false,
        })),
      },
    });
  } catch (error) {
    console.error("Database status error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test endpoint to create a test sale with MR cash
router.post("/debug/test-sale-with-cash", async (req, res) => {
  try {
    // Create test data
    const testSaleData = {
      recordingDate: new Date().toISOString().split("T")[0],
      invoiceNumber: `TEST-CASH-${Date.now()}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      mrName: "Test MR",
      customerName: "Test Customer",
      customerCode: "TEST001",
      products: [
        {
          productName: "N-LYCOPENE + WHEATGERM OIL",
          salesQty: 5,
          bonusQty: 0,
          sellingPrice: 100,
          amount: 500,
          discount: 0,
          netSellingAmount: 500,
          averageUnitPrice: 100,
          lc: 50,
          profitLoss: 250,
          isProductAccept: true,
        },
      ],
      creditDays: 0,
      dueDate: new Date().toISOString().split("T")[0],
      deliveryDate: new Date().toISOString().split("T")[0],
      paidAmount: 500,
      dueAmount: 0,
      totalAmount: 500,
      paymentStatus: "Cash",
      remark: "Test cash sale",
    };

    // First check if MR exists
    let mrStaff = await Staff.findOne({ name: "Test MR" });
    if (!mrStaff) {
      // Create test MR if doesn't exist
      mrStaff = new Staff({
        name: "Test MR",
        email: `test.mr${Date.now()}@test.com`,
        role: "Medical Representative",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await mrStaff.save();
      console.log(`✅ Created test MR: ${mrStaff.name}, ID: ${mrStaff._id}`);
    }

    // Create sale
    const sale = new SaleSummary({
      ...testSaleData,
      mrId: mrStaff._id,
      customerId: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await sale.save();
    console.log(`✅ Created test sale: ${sale.invoiceNumber}, ID: ${sale._id}`);

    // Add cash to MR
    const cashResult = await addCashToMR({
      mrName: sale.mrName,
      mrId: sale.mrId,
      paidAmount: sale.paidAmount,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate: sale.invoiceDate,
      customerName: sale.customerName,
      paymentStatus: sale.paymentStatus,
      recordingDate: sale.recordingDate,
    });

    // Verify cash was added
    const mrCashRecord = await MRCash.findOne({ mrId: mrStaff._id });
    
    res.json({
      success: true,
      message: "Test sale created",
      sale: {
        id: sale._id,
        invoiceNumber: sale.invoiceNumber,
        mrName: sale.mrName,
        mrId: sale.mrId,
        paidAmount: sale.paidAmount,
        paymentStatus: sale.paymentStatus,
      },
      cashResult,
      mrCashRecord: mrCashRecord
        ? {
            id: mrCashRecord._id,
            mrName: mrCashRecord.mrName,
            mrId: mrCashRecord.mrId,
            currentCash: mrCashRecord.currentCash,
            recentTransactions: mrCashRecord.recentTransactions,
            notes: mrCashRecord.notes,
            updatedAt: mrCashRecord.updatedAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Test sale error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🔥 ADDED: Simple test insert endpoint
router.post("/debug/test-insert-simple", async (req, res) => {
  try {
    // Create test sale
    const testSale = new SaleSummary({
      recordingDate: new Date(),
      invoiceNumber: `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      invoiceDate: new Date(),
      mrName: "Test MR",
      mrId: new mongoose.Types.ObjectId(),
      customerName: "Test Customer",
      customerCode: "TEST001",
      customerId: new mongoose.Types.ObjectId(),
      products: [{
        productName: "N-LYCOPENE + WHEATGERM OIL",
        salesQty: 2,
        bonusQty: 0,
        totalQty: 2,
        sellingPrice: 100,
        amount: 200,
        discount: 0,
        netSellingAmount: 200,
        averageUnitPrice: 100,
        lc: 50,
        profitLoss: 100,
        isProductAccept: true,
        isExchangeProduct: false,
        isReturnProduct: false
      }],
      paidAmount: 200,
      dueAmount: 0,
      totalAmount: 200,
      paymentStatus: "Cash",
      remark: "Test sale",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const savedSale = await testSale.save();
    console.log("✅ Test sale saved:", savedSale._id);
    
    // Create test MRCash
    const testMRCASH = new MRCash({
      mrId: new mongoose.Types.ObjectId(),
      mrName: "Test MR",
      currentCash: 200,
      cashTransferredToAdmin: 0,
      lastTransferDate: null,
      notes: "Test cash",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const savedMRCASH = await testMRCASH.save();
    console.log("✅ Test MRCASH saved:", savedMRCASH._id);
    
    res.json({
      success: true,
      saleId: savedSale._id,
      mrcashId: savedMRCASH._id,
      message: "Test insert successful"
    });
    
  } catch (error) {
    console.error("❌ Test insert failed:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🔥 ADDED: Check all data endpoint
router.get("/debug/check-all-sales", async (req, res) => {
  try {
    const sales = await SaleSummary.find({}).limit(10);
    const mrcashes = await MRCash.find({}).limit(10);
    
    res.json({
      salesCount: await SaleSummary.countDocuments(),
      mrcashesCount: await MRCash.countDocuments(),
      recentSales: sales.map(s => ({
        id: s._id,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        totalAmount: s.totalAmount,
        createdAt: s.createdAt
      })),
      recentMRCashes: mrcashes.map(m => ({
        id: m._id,
        mrName: m.mrName,
        currentCash: m.currentCash,
        createdAt: m.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const initializeImportProgress = (sessionId, totalInvoices, batchSize) => {
  importProgressMap.set(sessionId, {
    sessionId,
    totalInvoices,
    processedInvoices: 0,
    successful: 0,
    failed: 0,
    totalBatches: Math.ceil(totalInvoices / batchSize),
    currentBatch: 0,
    currentBatchProgress: 0,
    progressPercentage: 0,
    startTime: Date.now(),
    lastUpdated: Date.now(),
    completed: false,
    errors: [],
    cashSalesCount: 0,
    cashAmountAdded: 0,
  });
};

const updateImportProgress = (sessionId, updates) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;
  Object.assign(progress, updates, { lastUpdated: Date.now() });
  progress.progressPercentage = Math.round((progress.processedInvoices / progress.totalInvoices) * 100);
  importProgressMap.set(sessionId, progress);
};

const processImportAsync = async (sessionId, salesData, batchSize) => {
  let importedCount = 0;
  let failedCount = 0;
  let failedInvoices = [];
  let cashSalesCount = 0;
  let totalCashAdded = 0;
  
  try {
    const importProgress = importProgressMap.get(sessionId);
    if (!importProgress) {
      throw new Error("Import progress not initialized");
    }

    // Process in batches
    for (let i = 0; i < salesData.length; i += batchSize) {
      const batch = salesData.slice(i, i + batchSize);
      const batchResult = await processImportBatch(
        batch,
        Math.floor(i / batchSize),
        Math.ceil(salesData.length / batchSize),
        sessionId
      );
      
      importedCount += batchResult.success;
      failedCount += batchResult.failed;
      failedInvoices.push(...batchResult.errors);

      // Track cash sales from batch
      if (batchResult.cashUpdates && batchResult.cashUpdates.length > 0) {
        cashSalesCount += batchResult.cashUpdates.length;
        totalCashAdded += batchResult.cashUpdates.reduce(
          (sum, update) => sum + update.amountAdded,
          0
        );
      }

      // Update progress after each batch
      const overallProgress = Math.round(
        (importProgress.processedInvoices / importProgress.totalInvoices) * 100
      );
      
      updateImportProgress(sessionId, {
        processedInvoices: importProgress.processedInvoices,
        progressPercentage: overallProgress,
        cashSalesCount: cashSalesCount,
        cashAmountAdded: totalCashAdded,
        successful: importedCount,
        failed: failedCount,
      });
    }

    // Final progress update
    updateImportProgress(sessionId, {
      completed: true,
      result: {
        successfullyImported: importedCount,
        failed: failedCount,
        failedInvoices: failedInvoices,
        cashSales: cashSalesCount,
        cashAmount: totalCashAdded,
        summary: {
          total: salesData.length,
          successful: importedCount,
          failed: failedCount,
          cashSales: cashSalesCount,
          cashAmount: totalCashAdded,
        },
      },
    });

    console.log(
      `🎉 Import completed: ${importedCount} successful, ${failedCount} failed`
    );
    
    if (cashSalesCount > 0) {
      console.log(
        `💰 ${cashSalesCount} cash sales added to MR accounts: $${totalCashAdded}`
      );
    }
    
  } catch (error) {
    console.error("🔥 Fatal error in import process:", error);
    updateImportProgress(sessionId, {
      completed: true,
      error: error.message,
      result: {
        successfullyImported: importedCount,
        failed: failedCount,
        failedInvoices: failedInvoices,
        cashSales: cashSalesCount,
        cashAmount: totalCashAdded,
      },
    });
  }
};

const validateImportData = async (salesData) => {
  const errors = [];
  const validData = [];
  
  for (let i = 0; i < salesData.length; i++) {
    const sale = salesData[i];
    const saleErrors = [];

    // Ensure mrName has a default value
    if (!sale.mrName || sale.mrName.trim() === "") {
      sale.mrName = "No MR Name Provided";
    }

    // Check for parenthesis quantities
    const hasParenthesisQuantity = sale.products?.some((product) => {
      const salesQtyStr = String(product.salesQty || "");
      return (
        salesQtyStr.trim().startsWith("(") && salesQtyStr.trim().endsWith(")")
      );
    });

    // Check if this is a return transaction
    const isReturn =
      isReturnTransaction(sale.remark, sale.paymentStatus) ||
      hasParenthesisQuantity;

    // Check for exchange
    const isExchange =
      sale.remark?.toLowerCase().includes("exchange") ||
      sale.products?.some((p) =>
        (p.remark || "").toLowerCase().includes("exchange")
      ) ||
      sale.isExchange;

    // Basic validation
    if (!sale.invoiceNumber || sale.invoiceNumber.trim() === "") {
      saleErrors.push("Invoice number is required");
    }

    if (!sale.customerName || sale.customerName.trim() === "") {
      saleErrors.push("Customer name is required");
    }

    if (!Array.isArray(sale.products) || sale.products.length === 0) {
      saleErrors.push("At least one product is required");
    }

    // Validate products
    if (Array.isArray(sale.products)) {
      sale.products.forEach((product, pIndex) => {
        if (!product.productName || product.productName.trim() === "") {
          saleErrors.push(`Product ${pIndex + 1}: Product name required`);
        }

        const salesQtyStr = String(product.salesQty || "");
        let salesQty;

        // Parse parenthesis quantities
        if (
          salesQtyStr.trim().startsWith("(") &&
          salesQtyStr.trim().endsWith(")")
        ) {
          const numStr = salesQtyStr.trim().slice(1, -1);
          salesQty = -Math.abs(parseFloat(numStr) || 0);
        } else {
          salesQty = parseFloat(product.salesQty);
        }

        const bonusQty = parseFloat(product.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        // Different validation rules for different transaction types
        if (isReturn) {
          // Returns can have negative quantities (from parenthesis or negative numbers)
          if (isNaN(salesQty)) {
            saleErrors.push(
              `Product ${pIndex + 1}: Valid sales quantity required`
            );
          }
        } else if (isExchange) {
          // Exchanges can have positive, negative, or zero quantities
          if (isNaN(salesQty)) {
            saleErrors.push(
              `Product ${pIndex + 1}: Valid sales quantity required`
            );
          }
        } else {
          // Regular sales must have positive quantities
          if (isNaN(salesQty) || salesQty <= 0) {
            saleErrors.push(
              `Product ${
                pIndex + 1
              }: Valid sales quantity required (must be > 0)`
            );
          }
        }

        const sellingPrice = Number(product.sellingPrice);
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          saleErrors.push(
            `Product ${pIndex + 1}: Valid selling price required (must be >= 0)`
          );
        }
      });
    }

    // Check date formats
    try {
      if (sale.invoiceDate) {
        const parsedDate = parseDateString(sale.invoiceDate);
        if (!parsedDate || isNaN(parsedDate.getTime())) {
          saleErrors.push("Invalid invoice date format");
        }
      }
    } catch (dateError) {
      saleErrors.push("Invalid date format");
    }

    if (saleErrors.length > 0) {
      errors.push({
        index: i,
        invoiceNumber: sale.invoiceNumber || `Row-${i + 1}`,
        errors: saleErrors,
        type: "validation",
      });
    } else {
      validData.push(sale);
    }
  }

  return {
    validData,
    errors,
    hasCriticalErrors: errors.length > 0 && validData.length === 0,
  };
};

// 🔥 FIXED: Main import endpoint
router.post("/sales/import", async (req, res) => {
  const sessionId = createSessionId();
  const batchSize = 50;
  
  try {
    console.log("📥 Import request received");
    
    // Ensure collections exist
    await ensureCollectionsExist();
    
    // Parse incoming data
    let invoices = [];
    if (Array.isArray(req.body)) {
      invoices = req.body;
    } else if (req.body && Array.isArray(req.body.invoices)) {
      invoices = req.body.invoices;
    } else if (req.body && req.body.invoices) {
      invoices = [req.body.invoices];
    } else if (req.body) {
      invoices = [req.body];
    }
    
    console.log(`📊 Received ${invoices.length} invoices`);
    
    if (invoices.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "No invoices provided" 
      });
    }
    
    // Initialize progress
    initializeImportProgress(sessionId, invoices.length, batchSize);
    
    // Return immediate response
    res.json({ 
      success: true, 
      sessionId, 
      totalInvoices: invoices.length,
      message: "Import started successfully"
    });
    
    // Process in background immediately
    setTimeout(async () => {
      try {
        console.log(`🚀 Starting background import for session ${sessionId}`);
        
        // Process in batches
        for (let i = 0; i < invoices.length; i += batchSize) {
          const batch = invoices.slice(i, i + batchSize);
          const batchIndex = Math.floor(i / batchSize);
          const totalBatches = Math.ceil(invoices.length / batchSize);
          
          console.log(`🔄 Processing batch ${batchIndex + 1}/${totalBatches}`);
          
          await processImportBatch(batch, batchIndex, totalBatches, sessionId);
        }
        
        // Final update
        const progress = importProgressMap.get(sessionId);
        if (progress) {
          updateImportProgress(sessionId, { 
            completed: true,
            result: {
              successfullyImported: progress.successful || 0,
              failed: progress.failed || 0,
              cashSales: progress.cashSalesCount || 0,
              cashAmount: progress.cashAmountAdded || 0
            }
          });
        }
        
        console.log(`🎉 Import completed for session ${sessionId}`);
        
      } catch (error) {
        console.error(`❌ Background import failed for ${sessionId}:`, error);
        updateImportProgress(sessionId, { 
          completed: true, 
          error: error.message 
        });
      }
    }, 100);
    
  } catch (error) {
    console.error("❌ Import initialization error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to start import",
      error: error.message 
    });
  }
});

router.get("/sales/import/progress/:sessionId", (req, res) => {
  const progress = importProgressMap.get(req.params.sessionId);
  if (!progress) return res.status(404).json({ success: false, message: "Session not found" });
  
  const elapsedTime = Math.round((Date.now() - progress.startTime) / 1000);
  let estimatedTimeRemaining = null;
  
  if (progress.progressPercentage > 0) {
    estimatedTimeRemaining = Math.round(
      (elapsedTime * (100 - progress.progressPercentage)) / progress.progressPercentage
    );
  }
  
  res.json({ 
    success: true, 
    progress: {
      percentage: progress.progressPercentage || 0,
      processed: progress.processedInvoices || 0,
      total: progress.totalInvoices || 0,
      successful: progress.successful || 0,
      failed: progress.failed || 0,
      cashSales: progress.cashSalesCount || 0,
      cashAmount: progress.cashAmountAdded || 0,
      status: progress.completed ? "completed" : "processing",
      completed: progress.completed || false,
      result: progress.result || null,
      error: progress.error || null
    },
    sessionId: progress.sessionId,
    elapsedTime,
    estimatedTimeRemaining
  });
});

// Clean up old sessions periodically
const cleanupOldSessions = () => {
  const now = Date.now();
  const oneHourAgo = now - 3600000;
  
  for (const [sessionId, progress] of importProgressMap.entries()) {
    if (progress.completed && progress.lastUpdated < oneHourAgo) {
      importProgressMap.delete(sessionId);
      console.log(`🗑️ Cleaned up completed session: ${sessionId}`);
    }
  }
};

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 1800000);

// 🔥 ADDED: Check collections endpoint
router.get("/debug/check-collections", async (req, res) => {
  try {
    const saleCount = await SaleSummary.countDocuments();
    const mrcashCount = await MRCash.countDocuments();
    const staffCount = await Staff.countDocuments();
    const customerCount = await Customer.countDocuments();
    const reportInHandCount = await ReportInHand.countDocuments();

    // Get sample data
    const sampleSale = await SaleSummary.findOne().limit(1);
    const sampleMRCASH = await MRCash.findOne().limit(1);

    res.json({
      success: true,
      collections: {
        SaleSummary: saleCount,
        MRCashes: mrcashCount,
        Staff: staffCount,
        Customer: customerCount,
        ReportInHand: reportInHandCount,
      },
      sampleSale: sampleSale
        ? {
            _id: sampleSale._id,
            invoiceNumber: sampleSale.invoiceNumber,
            mrName: sampleSale.mrName,
            mrId: sampleSale.mrId,
            createdAt: sampleSale.createdAt,
          }
        : null,
      sampleMRCASH: sampleMRCASH
        ? {
            _id: sampleMRCASH._id,
            mrName: sampleMRCASH.mrName,
            mrId: sampleMRCASH.mrId,
            currentCash: sampleMRCASH.currentCash,
            recentTransactions: sampleMRCASH.recentTransactions,
            createdAt: sampleMRCASH.createdAt,
          }
        : null,
    });
  } catch (error) {
    console.error("Check collections error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 ADDED: Test data structure endpoint
router.post("/debug/check-import-data", async (req, res) => {
  try {
    const salesData = req.body;
    
    console.log("=== DEBUG: Import Data Structure ===");
    console.log(
      "Total records:",
      Array.isArray(salesData) ? salesData.length : "Not an array"
    );

    if (Array.isArray(salesData) && salesData.length > 0) {
      const sample = salesData[0];
      console.log("Sample record keys:", Object.keys(sample));
      console.log("Sample MR Name:", sample.mrName);
      console.log("Sample Customer Name:", sample.customerName);
      console.log("Sample Invoice Number:", sample.invoiceNumber);
      console.log(
        "Sample Products count:",
        Array.isArray(sample.products) ? sample.products.length : "Not an array"
      );

      if (Array.isArray(sample.products) && sample.products.length > 0) {
        console.log("Sample product:", sample.products[0]);
      }
    }

    // Try to validate with existing function
    const validationResult = await validateImportData(
      Array.isArray(salesData) ? salesData : []
    );

    res.json({
      success: true,
      dataStructure: {
        isArray: Array.isArray(salesData),
        count: Array.isArray(salesData) ? salesData.length : 0,
        sampleKeys:
          Array.isArray(salesData) && salesData.length > 0
            ? Object.keys(salesData[0])
            : [],
      },
      validationResult,
      message: "Check console for detailed logs",
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// ✅ NEW ENDPOINTS FOR CREDIT SALES NOT RECEIVED
// ============================================================================

router.get("/sales/pending-collection-today", async (req, res) => {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const todayStart = new Date(todayStr + "T00:00:00.000Z");
    const todayEnd = new Date(todayStr + "T23:59:59.999Z");
    
    const pendingCollections = await SaleSummary.find({
      dueDate: {
        $gte: todayStart,
        $lte: todayEnd,
      },
      paymentStatus: { $ne: "Cash" },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .select(
        "invoiceNumber invoiceDate mrName customerName customerId products creditDays dueDate deliveryDate paidAmount dueAmount totalAmount paymentStatus remark"
      )
      .sort({ dueDate: 1 })
      .lean();

    res.json({
      success: true,
      data: pendingCollections,
      count: pendingCollections.length,
    });
  } catch (error) {
    console.error("Error fetching pending collections for today:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching pending collections",
      data: [],
      totalAmount: 0,
      count: 0,
    });
  }
});

// 🔥 FIXED: Correct the payment status filter for credit sales
router.get("/sales/credit-sale-not-received", async (req, res) => {
  try {
    const creditSales = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      paymentStatus: { $in: ["Credit", "Partial Paid"] },
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

router.get("/overdue", async (req, res) => {
  try {
    const { currentDate } = req.query;
    const referenceDate = currentDate ? new Date(currentDate) : new Date();
    
    const overdueInvoices = await SaleSummary.find({
      $or: [
        { saleReturn: { $exists: false } },
        { saleReturn: false },
        { saleReturn: null },
      ],
      dueDate: { $exists: true, $ne: null, $lt: referenceDate },
      $or: [
        { dueAmount: { $gt: 0 } },
        { $expr: { $gt: [{ $subtract: ["$totalAmount", "$paidAmount"] }, 0] } },
      ],
    })
      .sort({ dueDate: 1 })
      .lean();

    const totalOverdueAmount = overdueInvoices.reduce((total, invoice) => {
      const overdueAmount =
        invoice.dueAmount > 0
          ? invoice.dueAmount
          : Math.max(0, invoice.totalAmount - invoice.paidAmount);
      return total + overdueAmount;
    }, 0);

    res.json({
      success: true,
      data: overdueInvoices,
      totalOverdueAmount: totalOverdueAmount,
      count: overdueInvoices.length,
      currentDate: referenceDate,
      message: `Found ${overdueInvoices.length} overdue invoices`,
    });
  } catch (error) {
    console.error("Error fetching overdue invoices:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching overdue invoices",
      error: error.message,
    });
  }
});

// ============================================================================
// 📊 ANALYTICS ENDPOINTS
// ============================================================================

router.get("/analytics/today", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const todaySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: today,
            $lte: now,
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

    const result =
      todaySales.length > 0 ? todaySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/month", async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const monthlySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: monthStart,
            $lte: now,
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

    const result =
      monthlySales.length > 0 ? monthlySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/year", async (req, res) => {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    const yearlySales = await SaleSummary.aggregate([
      {
        $match: {
          invoiceDate: {
            $gte: yearStart,
            $lte: now,
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

    const result =
      yearlySales.length > 0 ? yearlySales[0] : { totalSales: 0, count: 0 };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/analytics/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const prevDayEnd = new Date(yesterday);
    prevDayEnd.setHours(23, 59, 59, 999);
    
    const [todayResult, monthlyResult, yearlyResult, yesterdayResult] =
      await Promise.all([
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: today,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: monthStart,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yearStart,
                $lte: now,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yesterday,
                $lte: prevDayEnd,
              },
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$totalAmount" },
            },
          },
        ]),
      ]);
    
    const todaySales = todayResult[0]?.amount || 0;
    const monthlySales = monthlyResult[0]?.amount || 0;
    const yearlySales = yearlyResult[0]?.amount || 0;
    const yesterdaySales = yesterdayResult[0]?.amount || 0;
    
    const growth =
      yesterdaySales > 0
        ? ((todaySales - yesterdaySales) / yesterdaySales) * 100
        : 0;

    res.json({
      totalSales: yearlySales,
      monthlySales,
      todaySales,
      yearSales: yearlySales,
      growth: parseFloat(growth.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error in getSalesDashboard:", error);
    res.status(500).json({
      message: error.message,
      totalSales: 0,
      monthlySales: 0,
      todaySales: 0,
      yearSales: 0,
      growth: 0,
    });
  }
});

router.get("/analytics/breakdown", async (req, res) => {
  try {
    const { period } = req.query;
    let groupFormat;
    
    switch (period) {
      case "daily":
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
          day: { $dayOfMonth: "$invoiceDate" },
        };
        break;
      case "monthly":
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
        };
        break;
      case "yearly":
        groupFormat = {
          year: { $year: "$invoiceDate" },
        };
        break;
      default:
        groupFormat = {
          year: { $year: "$invoiceDate" },
          month: { $month: "$invoiceDate" },
          day: { $dayOfMonth: "$invoiceDate" },
        };
    }

    const salesBreakdown = await SaleSummary.aggregate([
      {
        $group: {
          _id: groupFormat,
          totalSales: { $sum: "$totalAmount" },
          count: { $sum: 1 },
          date: { $first: "$invoiceDate" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);
    
    res.json(salesBreakdown);
  } catch (error) {
    console.error("❌ Error in sales breakdown analytics:", error);
    res.status(500).json({
      message: error.message,
      period: req.query.period,
      timestamp: new Date().toISOString(),
    });
  }
});

// ============================================================================
// 💰 OUTSTANDING ENDPOINTS
// ============================================================================

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

router.get("/outstanding/analytics/dashboard", async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const prevDayEnd = new Date(yesterday);
    prevDayEnd.setHours(23, 59, 59, 999);
    
    const outstandingFilter = {
      $or: [
        { dueAmount: { $gt: 0 } },
        { paymentStatus: { $in: ["Credit", "Partial Paid"] } },
      ],
    };
    
    const [todayResult, monthlyResult, yearlyResult, yesterdayResult] =
      await Promise.all([
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: today,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: monthStart,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yearStart,
                $lte: now,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
        SaleSummary.aggregate([
          {
            $match: {
              invoiceDate: {
                $gte: yesterday,
                $lte: prevDayEnd,
              },
              ...outstandingFilter,
            },
          },
          {
            $group: {
              _id: null,
              amount: { $sum: "$dueAmount" },
            },
          },
        ]),
      ]);
    
    const todayOutstanding = todayResult[0]?.amount || 0;
    const monthlyOutstanding = monthlyResult[0]?.amount || 0;
    const yearlyOutstanding = yearlyResult[0]?.amount || 0;
    const yesterdayOutstanding = yesterdayResult[0]?.amount || 0;
    
    const growth =
      yesterdayOutstanding > 0
        ? ((todayOutstanding - yesterdayOutstanding) / yesterdayOutstanding) *
          100
        : 0;
    
    res.json({
      totalOutstanding: yearlyOutstanding,
      monthlyOutstanding,
      todayOutstanding,
      yearOutstanding: yearlyOutstanding,
      growth: parseFloat(growth.toFixed(2)),
    });
  } catch (error) {
    console.error("❌ Error in getOutstandingDashboard:", error);
    res.status(500).json({
      totalOutstanding: 0,
      monthlyOutstanding: 0,
      todayOutstanding: 0,
      yearOutstanding: 0,
      growth: 0,
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

router.get("/outstanding/mr-wise", async (req, res) => {
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
    
    const mrWiseOutstanding = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $group: {
          _id: "$mrName",
          totalOutstanding: { $sum: "$dueAmount" },
          invoiceCount: { $sum: 1 },
          customerCount: { $addToSet: "$customerName" },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              customerName: "$customerName",
              dueAmount: "$dueAmount",
              paymentStatus: "$paymentStatus",
              dueDate: "$dueDate",
              recordingDate: "$recordingDate",
            },
          },
        },
      },
      {
        $project: {
          mrName: "$_id",
          totalOutstanding: 1,
          invoiceCount: 1,
          customerCount: { $size: "$customerCount" },
          invoices: 1,
          _id: 0,
        },
      },
      {
        $sort: { totalOutstanding: -1 },
      },
    ]);
    
    res.json({
      success: true,
      data: mrWiseOutstanding,
      count: mrWiseOutstanding.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching MR-wise outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

router.get("/outstanding/customer-wise", async (req, res) => {
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
    
    const customerWiseOutstanding = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $group: {
          _id: "$customerName",
          totalOutstanding: { $sum: "$dueAmount" },
          invoiceCount: { $sum: 1 },
          mrNames: { $addToSet: "$mrName" },
          oldestDueDate: { $min: "$dueDate" },
          invoices: {
            $push: {
              invoiceNumber: "$invoiceNumber",
              mrName: "$mrName",
              dueAmount: "$dueAmount",
              paymentStatus: "$paymentStatus",
              dueDate: "$dueDate",
              recordingDate: "$recordingDate",
            },
          },
        },
      },
      {
        $project: {
          customerName: "$_id",
          totalOutstanding: 1,
          invoiceCount: 1,
          mrCount: { $size: "$mrNames" },
          oldestDueDate: 1,
          invoices: 1,
          _id: 0,
        },
      },
      {
        $sort: { totalOutstanding: -1 },
      },
    ]);
    
    res.json({
      success: true,
      data: customerWiseOutstanding,
      count: customerWiseOutstanding.length,
      period: period,
    });
  } catch (error) {
    console.error("Error fetching customer-wise outstanding:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

// ============================================================================
// 📈 SALES ENDPOINTS
// ============================================================================

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

router.get("/sales/highest-sales", async (req, res) => {
  try {
    const { limit = 5, period } = req.query;
    let dateFilter = {};
    const dateRange = getTableDateRanges(period);
    
    if (dateRange) {
      dateFilter = {
        invoiceDate: {
          $gte: dateRange.start,
          $lte: dateRange.end,
        },
      };
    }
    
    const highestSales = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$invoiceDate" } },
          productName: "$products.productName",
          salesPerson: "$mrName",
          quantity: "$products.salesQty",
          amount: "$products.netSellingAmount",
          customer: "$customerInfo.name",
          invoiceNumber: 1,
          timeAgo: "$invoiceDate",
        },
      },
      {
        $sort: { amount: -1 },
      },
      {
        $limit: parseInt(limit),
      },
    ]);
    
    const now = new Date();
    const transformedData = highestSales.map((sale) => {
      const saleDate = new Date(sale.timeAgo);
      const diffMs = now - saleDate;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      let timeAgo = "";
      if (diffDays > 0) {
        timeAgo = `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
      } else if (diffHours > 0) {
        timeAgo = `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
      } else {
        timeAgo = "Just now";
      }
      
      return {
        ...sale,
        timeAgo,
      };
    });
    
    res.json({
      success: true,
      data: transformedData,
      count: transformedData.length,
      period: period,
    });
  } catch (error) {
    console.error("❌ Error fetching highest sales:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      data: [],
      count: 0,
    });
  }
});

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

router.get("/sales/summary-cards", async (req, res) => {
  try {
    const { period } = req.query;
    let dateFilter = {};
    const dateRange = getTableDateRanges(period);
    
    if (dateRange) {
      dateFilter = {
        invoiceDate: {
          $gte: dateRange.start,
          $lte: dateRange.end,
        },
      };
    }
    
    const summary = await SaleSummary.aggregate([
      {
        $match: dateFilter,
      },
      {
        $unwind: "$products",
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$products.netSellingAmount" },
          totalQuantity: { $sum: "$products.salesQty" },
          totalTransactions: { $sum: 1 },
          averageOrderValue: { $avg: "$totalAmount" },
        },
      },
    ]);
    
    const result =
      summary.length > 0
        ? summary[0]
        : {
            totalSales: 0,
            totalQuantity: 0,
            totalTransactions: 0,
            averageOrderValue: 0,
          };
    
    res.json({
      success: true,
      period: period,
      summary: result,
    });
  } catch (error) {
    console.error("❌ Error fetching sales summary:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      summary: {
        totalSales: 0,
        totalQuantity: 0,
        totalTransactions: 0,
        averageOrderValue: 0,
      },
    });
  }
});

router.get("/custom-range", async (req, res) => {
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
    
    res.json({
      success: true,
      totalSales: result.totalSales,
      count: result.count,
    });
  } catch (error) {
    console.error("Error in custom-range endpoint:", error);
    res.status(500).json({
      success: false,
      message: error.message,
      totalSales: 0,
    });
  }
});

// ============================================================================
// 🛒 PRODUCT-WISE SALES ENDPOINTS
// ============================================================================

router.get("/sales/product-wise", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      startDate,
      endDate,
      productName,
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const matchConditions = {};
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.recordingDate = {
          $gte: start,
          $lte: end,
        };
      }
    }
    
    if (productName && productName.trim() !== "") {
      matchConditions["products.productName"] = new RegExp(
        productName.trim(),
        "i"
      );
    }
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      matchConditions.$or = [
        { invoiceNumber: searchRegex },
        { mrName: searchRegex },
        { customerCode: searchRegex },
        { "products.productName": searchRegex },
      ];
    }
    
    const productWiseAggregate = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: "$products.productName",
          totalRecords: { $sum: 1 },
          totalSalesQty: { $sum: "$products.salesQty" },
          totalBonusQty: { $sum: "$products.bonusQty" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          totalProfitLoss: { $sum: "$products.profitLoss" },
        },
      },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          products: { $push: "$$ROOT" },
        },
      },
    ]);
    
    let totalProducts = 0;
    let productSummary = [];
    
    if (productWiseAggregate.length > 0) {
      totalProducts = productWiseAggregate[0].totalProducts;
      productSummary = productWiseAggregate[0].products;
    }
    
    const paginatedProducts = productSummary.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalProducts / limitNum);
    
    if (paginatedProducts.length > 0) {
      const productNames = paginatedProducts.map((p) => p._id);
      
      const detailedRecords = await SaleSummary.aggregate([
        { $match: matchConditions },
        { $unwind: "$products" },
        {
          $match: {
            "products.productName": { $in: productNames },
          },
        },
        {
          $lookup: {
            from: "customers",
            localField: "customerCode",
            foreignField: "customerCode",
            as: "customerInfo",
          },
        },
        {
          $unwind: {
            path: "$customerInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            recordingDate: 1,
            invoiceNumber: 1,
            invoiceDate: 1,
            mrName: 1,
            customerCode: 1,
            "customerInfo.name": 1,
            "customerInfo.customerNumber": 1,
            "customerInfo.address": 1,
            "customerInfo.zone": 1,
            productName: "$products.productName",
            salesQty: "$products.salesQty",
            bonusQty: "$products.bonusQty",
            totalQty: "$products.totalQty",
            sellingPrice: "$products.sellingPrice",
            amount: "$products.amount",
            discount: "$products.discount",
            netSellingAmount: "$products.netSellingAmount",
            averageUnitPrice: "$products.averageUnitPrice",
            lc: "$products.lc",
            profitLoss: "$products.profitLoss",
            isProductAccept: "$products.isProductAccept",
            creditDays: 1,
            dueDate: 1,
            deliveryDate: 1,
            paidAmount: 1,
            dueAmount: 1,
            totalAmount: 1,
            paymentStatus: 1,
            remark: 1,
          },
        },
        { $sort: { recordingDate: -1, productName: 1 } },
      ]);
      
      const result = paginatedProducts.map((product) => ({
        productName: product._id,
        summary: {
          totalSalesQty: product.totalSalesQty,
          totalBonusQty: product.totalBonusQty,
          totalNetSellingAmount: product.totalNetSellingAmount,
          totalProfitLoss: product.totalProfitLoss,
          totalRecords: product.totalRecords,
        },
        details: detailedRecords
          .filter((record) => record.productName === product._id)
          .slice(0, 100),
      }));
      
      res.status(200).json({
        products: result,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalProducts,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      });
    } else {
      res.status(200).json({
        products: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalProducts: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }
  } catch (error) {
    console.error("❌ Error fetching product-wise sales:", error);
    res.status(500).json({
      message: "Failed to fetch product-wise sales.",
      error: error.message,
    });
  }
});

router.get("/sales/product/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const matchConditions = {
      "products.productName": decodeURIComponent(productName),
    };
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.recordingDate = {
          $gte: start,
          $lte: end,
        };
      }
    }
    
    const totalCount = await SaleSummary.countDocuments(matchConditions);
    
    const salesData = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $match: {
          "products.productName": decodeURIComponent(productName),
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          recordingDate: 1,
          invoiceNumber: 1,
          invoiceDate: 1,
          mrName: 1,
          customerCode: 1,
          "customerInfo.name": 1,
          "customerInfo.customerNumber": 1,
          "customerInfo.address": 1,
          "customerInfo.zone": 1,
          productName: "$products.productName",
          salesQty: "$products.salesQty",
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice",
          amount: "$products.amount",
          discount: "$products.discount",
          netSellingAmount: "$products.netSellingAmount",
          averageUnitPrice: "$products.averageUnitPrice",
          lc: "$products.lc",
          profitLoss: "$products.profitLoss",
          isProductAccept: "$products.isProductAccept",
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          paidAmount: 1,
          dueAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
          remark: 1,
        },
      },
      { $sort: { recordingDate: -1 } },
      { $skip: skip },
      { $limit: limitNum },
    ]);
    
    const productSummary = await SaleSummary.aggregate([
      { $match: matchConditions },
      { $unwind: "$products" },
      {
        $match: {
          "products.productName": decodeURIComponent(productName),
        },
      },
      {
        $group: {
          _id: "$products.productName",
          totalSalesQty: { $sum: "$products.salesQty" },
          totalBonusQty: { $sum: "$products.bonusQty" },
          totalNetSellingAmount: { $sum: "$products.netSellingAmount" },
          totalProfitLoss: { $sum: "$products.profitLoss" },
          totalRecords: { $sum: 1 },
          averageSellingPrice: { $avg: "$products.sellingPrice" },
          averageProfitLoss: { $avg: "$products.profitLoss" },
        },
      },
    ]);
    
    const summary =
      productSummary.length > 0
        ? productSummary[0]
        : {
            _id: decodeURIComponent(productName),
            totalSalesQty: 0,
            totalBonusQty: 0,
            totalNetSellingAmount: 0,
            totalProfitLoss: 0,
            totalRecords: 0,
            averageSellingPrice: 0,
            averageProfitLoss: 0,
          };
    
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.status(200).json({
      productName: decodeURIComponent(productName),
      summary,
      sales: salesData,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching product sales details:", error);
    res.status(500).json({
      message: "Failed to fetch product sales details.",
      error: error.message,
    });
  }
});

router.post("/sales", async (req, res) => {
  try {
    const data = req.body;
    
    if (await checkInvoiceNumberExists(data.invoiceNumber)) {
      return res.status(400).json({ error: "Invoice number already exists" });
    }
    
    const mrStaff = await findMRStaff(data.mrName || "No MR Name Provided");
    const isReturn = isReturnTransaction(data.remark, data.paymentStatus);
    const isExchange = (data.remark || "").toLowerCase().includes("exchange");
    
    const processedProducts = [];
    let totalAmount = 0;
    
    for (const p of data.products || []) {
      const sqty = parseQuantityWithParenthesis(p.salesQty);
      const bqty = parseQuantityWithParenthesis(p.bonusQty) || 0;
      const tqty = sqty + bqty;
      
      if (tqty === 0) continue;
      
      const invProduct = await findProductInInventory(p.productName);
      if (!invProduct && tqty > 0) throw new Error(`Product not found: ${p.productName}`);
      
      if (tqty !== 0) await updateReportInHandAfterSale(invProduct?.productName || p.productName, sqty, bqty);
      
      processedProducts.push({
        productName: invProduct?.productName || p.productName,
        originalProductName: p.productName,
        salesQty: sqty,
        bonusQty: bqty,
        totalQty: tqty,
        netSellingAmount: Number(p.netSellingAmount) || 0,
        lc: invProduct?.lc || 0,
        profitLoss: (Number(p.netSellingAmount) || 0) - tqty * (invProduct?.lc || 0),
      });
      
      totalAmount += Number(p.netSellingAmount) || 0;
    }
    
    const paidAmount = Number(data.paidAmount) || 0;
    
    const sale = await SaleSummary.create({
      ...data,
      mrId: mrStaff?._id,
      products: processedProducts,
      totalAmount,
      paidAmount,
      dueAmount: totalAmount - paidAmount,
      paymentStatus: mapPaymentStatus(data.paymentStatus),
      isReturn,
      isExchange,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    if ((sale.paymentStatus === "Cash" || sale.paymentStatus === "Paid") && paidAmount > 0) {
      await addCashToMR({
        mrName: sale.mrName,
        mrId: sale.mrId,
        paidAmount,
        invoiceNumber: sale.invoiceNumber,
        customerName: sale.customerName,
        paymentStatus: sale.paymentStatus,
        invoiceDate: sale.invoiceDate,
      });
    }
    
    res.status(201).json({ message: "Sale created successfully", sale });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔥 MODIFIED: CORRECTED EDIT/UPDATE ENDPOINT WITH RETURN SUPPORT
router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get the original sale to compare changes
    const originalSale = await SaleSummary.findById(id);
    if (!originalSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }
    
    // Check for duplicate invoice number if it's being changed
    if (
      req.body.invoiceNumber &&
      req.body.invoiceNumber !== originalSale.invoiceNumber
    ) {
      const invoiceExists = await checkInvoiceNumberExists(
        req.body.invoiceNumber,
        id
      );
      if (invoiceExists) {
        return res.status(400).json({
          error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
        });
      }
    }
    
    // Check if this is a return transaction
    const isReturn = isReturnTransaction(
      req.body.remark,
      req.body.paymentStatus
    );
    
    // Check if this is an exchange transaction
    const isExchange =
      req.body.remark?.toLowerCase().includes("exchange") ||
      originalSale.isExchange;
    
    // 🔥 CRITICAL FIX: Restore original inventory first
    for (const product of originalSale.products) {
      const totalQty = product.salesQty + product.bonusQty;
      if (totalQty !== 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty,
            originalSale.isExchange,
            originalSale.remark,
            originalSale.paymentStatus
          );
        } catch (inventoryError) {
          console.error(
            `❌ Failed to restore inventory for ${product.productName}:`,
            inventoryError.message
          );
        }
      }
    }
    
    // Process the updated sale data
    const saleData = req.body;
    
    // 🔥 FIX: Ensure mrName has a default value
    if (!saleData.mrName || saleData.mrName.trim() === "") {
      saleData.mrName = originalSale.mrName || "No MR Name Provided";
    }
    
    // Try to find MR (staff) by name
    let mrStaff = null;
    if (saleData.mrName) {
      mrStaff = await Staff.findOne({
        $or: [
          { name: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
          { email: { $regex: new RegExp(saleData.mrName.trim(), "i") } },
        ],
      });
    }
    
    const updatedProducts = await Promise.all(
      saleData.products.map(async (product) => {
        let salesQty = Number(product.salesQty) || 0;
        let bonusQty = Number(product.bonusQty) || 0;
        
        if (isReturn && salesQty > 0) {
          salesQty = -salesQty;
        }
        if (isReturn && bonusQty > 0) {
          bonusQty = -bonusQty;
        }
        
        const totalQty = salesQty + bonusQty;
        const existingProduct = await findProductInInventory(
          product.productName
        );
        
        if (!existingProduct && !isReturn && totalQty > 0) {
          throw new Error(
            `Product "${product.productName}" not found in inventory`
          );
        }
        
        let lcValue = 0;
        let actualProductName = product.productName;
        
        if (existingProduct) {
          lcValue = existingProduct.lc || existingProduct.batches?.[0]?.lc || 0;
          actualProductName = existingProduct.productName;
        }
        
        if (totalQty > 0 && existingProduct) {
          try {
            if (isExchange) {
              await updateInventoryForExchange(
                actualProductName,
                salesQty,
                bonusQty,
                false
              );
            } else {
              await updateReportInHandAfterSale(
                actualProductName,
                salesQty,
                bonusQty
              );
            }
          } catch (inventoryError) {
            throw new Error(
              `Insufficient stock for ${product.productName}: ${inventoryError.message}`
            );
          }
        } else if (totalQty < 0 && existingProduct) {
          try {
            await updateReportInHandAfterSale(
              actualProductName,
              salesQty,
              bonusQty
            );
          } catch (inventoryError) {
            throw new Error(
              `Failed to process return for ${product.productName}: ${inventoryError.message}`
            );
          }
        }
        
        let profitLoss;
        if (isReturn) {
          profitLoss = -Math.abs(
            Number(product.netSellingAmount) - Math.abs(totalQty) * lcValue
          );
        } else {
          profitLoss = Number(product.netSellingAmount) - totalQty * lcValue;
        }
        
        return {
          productName: actualProductName,
          originalProductName: product.productName,
          salesQty: salesQty,
          bonusQty: bonusQty,
          totalQty: totalQty,
          sellingPrice: Number(product.sellingPrice),
          amount: Number(product.amount),
          discount: Number(product.discount) || 0,
          netSellingAmount: Number(product.netSellingAmount),
          averageUnitPrice: Number(product.averageUnitPrice),
          lc: lcValue,
          profitLoss: profitLoss,
          isProductAccept:
            product.isProductAccept !== undefined
              ? product.isProductAccept
              : true,
          isExchangeProduct: isExchange && totalQty <= 0,
          isReturnProduct: isReturn,
        };
      })
    );
    
    const totalAmount = updatedProducts.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );
    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;
    
    const updatedSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName || originalSale.mrName || "No MR Name Provided",
      mrId: mrStaff ? mrStaff._id : originalSale.mrId, // Update MR ID
      customerName: saleData.customerName,
      customerCode: saleData.customerCode,
      customerId: saleData.customerId || "",
      products: updatedProducts,
      creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: mapPaymentStatus(saleData.paymentStatus),
      remark: saleData.remark || saleData.remarks || "",
      updatedAt: new Date(),
      isExchange: isExchange,
      isReturn: isReturn,
    };
    
    // Save the updated sale
    const updatedSale = await SaleSummary.findByIdAndUpdate(
      id,
      updatedSaleData,
      {
        new: true,
        runValidators: true,
      }
    );
    
    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }
    
    // 🔥 CORRECTED: Handle MR cash updates during sale edit
    let cashUpdated = false;
    let cashAmount = 0;
    let cashResult = null;
    
    // Check if payment status changed
    const wasCashPaid = ["Cash", "Paid"].includes(originalSale.paymentStatus);
    const nowCashPaid = ["Cash", "Paid"].includes(updatedSale.paymentStatus);
    
    if (!wasCashPaid && nowCashPaid) {
      // Changed from non-cash to cash - add cash
      try {
        cashResult = await addCashToMR({
          mrName: updatedSale.mrName,
          mrId: mrStaff ? mrStaff._id : updatedSale.mrId,
          paidAmount: updatedSale.paidAmount,
          invoiceNumber: updatedSale.invoiceNumber,
          invoiceDate: updatedSale.invoiceDate,
          customerName: updatedSale.customerName,
          paymentStatus: updatedSale.paymentStatus,
        });
        
        if (cashResult.success) {
          cashUpdated = true;
          cashAmount = cashResult.amountAdded;
        }
      } catch (cashError) {
        console.error(`⚠️ Failed to add cash to MR: ${cashError.message}`);
      }
    } else if (wasCashPaid && !nowCashPaid) {
      // Changed from cash to non-cash - remove cash
      try {
        cashResult = await removeCashFromMR({
          mrName: originalSale.mrName,
          mrId: originalSale.mrId,
          paidAmount: originalSale.paidAmount,
          invoiceNumber: originalSale.invoiceNumber,
          customerName: originalSale.customerName,
          paymentStatus: originalSale.paymentStatus,
        });
        
        if (cashResult.success) {
          cashUpdated = true;
          cashAmount = -cashResult.amountRemoved;
        }
      } catch (cashError) {
        console.error(`⚠️ Failed to remove cash from MR: ${cashError.message}`);
      }
    } else if (wasCashPaid && nowCashPaid) {
      // Still cash, but amount might have changed
      if (updatedSale.paidAmount !== originalSale.paidAmount) {
        try {
          // First remove old amount
          await removeCashFromMR({
            mrName: originalSale.mrName,
            mrId: originalSale.mrId,
            paidAmount: originalSale.paidAmount,
            invoiceNumber: originalSale.invoiceNumber,
            customerName: originalSale.customerName,
            paymentStatus: originalSale.paymentStatus,
          });
          
          // Then add new amount
          cashResult = await addCashToMR({
            mrName: updatedSale.mrName,
            mrId: mrStaff ? mrStaff._id : updatedSale.mrId,
            paidAmount: updatedSale.paidAmount,
            invoiceNumber: updatedSale.invoiceNumber,
            invoiceDate: updatedSale.invoiceDate,
            customerName: updatedSale.customerName,
            paymentStatus: updatedSale.paymentStatus,
          });
          
          if (cashResult.success) {
            cashUpdated = true;
            cashAmount = cashResult.amountAdded - originalSale.paidAmount;
          }
        } catch (cashError) {
          console.error(
            `⚠️ Failed to update cash amount: ${cashError.message}`
          );
        }
      }
    }
    
    res.status(200).json({
      message: `Sale updated successfully${
        cashUpdated
          ? ` and $${cashAmount} ${
              cashAmount > 0 ? "added to" : "removed from"
            } MR ${updatedSale.mrName}'s cash account`
          : ""
      }`,
      sale: updatedSale,
      cashUpdated,
      cashAmount,
    });
  } catch (err) {
    console.error("Error updating sale:", err);
    
    try {
      const originalSale = await SaleSummary.findById(id);
      if (originalSale) {
        for (const product of originalSale.products) {
          const totalQty = product.salesQty + product.bonusQty;
          if (totalQty !== 0) {
            if (originalSale.isExchange) {
              await updateInventoryForExchange(
                product.productName,
                product.salesQty,
                product.bonusQty,
                false
              );
            } else {
              await updateReportInHandAfterSale(
                product.productName,
                product.salesQty,
                product.bonusQty
              );
            }
          }
        }
      }
    } catch (rollbackError) {
      console.error("❌ Failed to rollback inventory changes:", rollbackError);
    }
    
    if (err.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }
    
    res.status(500).json({
      error: "Failed to update sales record.",
      details: err.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET ALL SALES WITHOUT PAGINATION
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
        products: 1,
        createdAt: 1,
        updatedAt: 1,
        isExchange: 1,
        isReturn: 1,
      });
    
    res.status(200).json({
      summaries,
      count: summaries.length,
    });
  } catch (error) {
    console.error("❌ Error fetching all sale summaries:", error);
    res.status(500).json({ message: "Failed to fetch sale summaries." });
  }
});

// 🔥 ORIGINAL PAGINATED ENDPOINT (keep for backward compatibility)
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
        products: 1,
        createdAt: 1,
        updatedAt: 1,
        isExchange: 1,
        isReturn: 1,
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

// 🔥 MODIFIED: CORRECTED DELETE ENDPOINT WITH RETURN SUPPORT
router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    const saleToDelete = await SaleSummary.findById(id);
    
    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }
    
    // 🔥 CORRECTED: Remove cash from MR if it was a cash/paid sale
    if (
      (saleToDelete.paymentStatus === "Cash" ||
        saleToDelete.paymentStatus === "Paid") &&
      saleToDelete.paidAmount > 0
    ) {
      try {
        await removeCashFromMR({
          mrName: saleToDelete.mrName,
          mrId: saleToDelete.mrId,
          paidAmount: saleToDelete.paidAmount,
          invoiceNumber: saleToDelete.invoiceNumber,
          customerName: saleToDelete.customerName,
          paymentStatus: saleToDelete.paymentStatus,
        });
      } catch (cashError) {
        console.error(
          `❌ Failed to remove cash from MR for deletion:`,
          cashError.message
        );
        // Continue with deletion even if cash removal fails
      }
    }
    
    // Restore inventory for all products in the sale
    for (const product of saleToDelete.products) {
      const totalQty = product.salesQty + product.bonusQty;
      if (totalQty !== 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty,
            saleToDelete.isExchange,
            saleToDelete.remark,
            saleToDelete.paymentStatus
          );
        } catch (inventoryError) {
          console.error(
            `❌ Failed to restore inventory for ${product.productName}:`,
            inventoryError.message
          );
        }
      }
    }
    
    // Delete the sale record
    const deletedSale = await SaleSummary.findByIdAndDelete(id);
    
    res.status(200).json({
      message: "Sales record deleted successfully and inventory restored.",
      deletedSale,
    });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).json({ error: "Failed to delete sales record." });
  }
});

// ============================================================================
// 📥 EXPORT ENDPOINTS
// ============================================================================

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
    
    worksheet.mergeCells("A1:AD1");
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
    
    worksheet.mergeCells("A2:AD2");
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
      { key: "isProductAccept", width: 15 },
      { key: "isExchangeProduct", width: 15 },
      { key: "isReturnProduct", width: 15 },
      { key: "creditDays", width: 15 },
      { key: "dueDate", width: 15 },
      { key: "deliveryDate", width: 20 },
      { key: "paidAmount", width: 15 },
      { key: "dueAmount", width: 15 },
      { key: "totalAmount", width: 15 },
      { key: "paymentStatus", width: 15 },
      { key: "remark", width: 20 },
      { key: "isExchange", width: 15 },
      { key: "isReturn", width: 15 },
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
      "Profit/Loss",
      "Product Accept",
      "Exchange Product",
      "Return Product",
      "Credit Days",
      "Due Date",
      "Delivery Date",
      "Paid Amount",
      "Due Amount",
      "Total Amount",
      "Payment Status",
      "Remark",
      "Is Exchange",
      "Is Return",
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
      
      sale.products.forEach((product) => {
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
          isProductAccept: product.isProductAccept ? "Yes" : "No",
          isExchangeProduct: product.isExchangeProduct ? "Yes" : "No",
          isReturnProduct: product.isReturnProduct ? "Yes" : "No",
          creditDays: sale.creditDays,
          dueDate: formatDate(sale.dueDate),
          deliveryDate: formatDate(sale.recordingDate),
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          totalAmount: sale.totalAmount,
          paymentStatus: sale.paymentStatus,
          remark: sale.remark,
          isExchange: sale.isExchange ? "Yes" : "No",
          isReturn: sale.isReturn ? "Yes" : "No",
        });
        
        // Color transactions differently
        if (sale.isReturn) {
          // Light red background for returns
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFFDE7E7" },
            };
          });
        } else if (sale.isExchange) {
          // Light blue background for exchanges
          row.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFE6F3FF" },
            };
          });
        }
        
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

// ============================================================================
// 🔧 UTILITY ENDPOINTS
// ============================================================================

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await PaymentStatus.find().sort({ type: 1 }); // Fixed: Changed to PaymentStatus
    res.status(200).json(statuses);
  } catch (error) {
    console.error("❌ Error fetching payment statuses:", error.message);
    res.status(500).json({ error: "Failed to fetch payment statuses." });
  }
});

router.get("/sales/unique-names", async (req, res) => {
  try {
    const uniqueNames = await Product.distinct("productName", {
      productName: { $ne: null },
    });
    
    uniqueNames.sort((a, b) => a.localeCompare(b));
    
    res.status(200).json({ productNames: uniqueNames });
  } catch (error) {
    console.error("Error fetching unique product names:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/sales/stock/report-in-hand", async (req, res) => {
  try {
    const reports = await ReportInHand.find({});
    res.json(reports);
  } catch (error) {
    console.error("Error fetching report in hand:", error);
    res.status(500).json({ error: "Failed to fetch report in hand data." });
  }
});

// 🔥 MODIFIED: BATCH DELETE ENDPOINT WITH RETURN SUPPORT
router.post("/sales/delete-batch", async (req, res) => {
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
    
    // Process in smaller batches
    const batchSize = 10;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (id) => {
        try {
          const saleToDelete = await SaleSummary.findById(id);
          
          if (!saleToDelete) {
            errors.push({ id, error: "Not found" });
            return;
          }
          
          // Restore inventory for all products
          for (const product of saleToDelete.products) {
            const totalQty = product.salesQty + product.bonusQty;
            if (totalQty !== 0) {
              await restoreReportInHandAfterSaleDeletion(
                product.productName,
                product.salesQty,
                product.bonusQty,
                saleToDelete.isExchange,
                saleToDelete.remark,
                saleToDelete.paymentStatus
              );
            }
          }
          
          // Delete the sale
          await SaleSummary.findByIdAndDelete(id);
          
          deletedSales.push({
            id,
            invoiceNumber: saleToDelete.invoiceNumber,
            customerName: saleToDelete.customerName,
            isExchange: saleToDelete.isExchange,
            isReturn: saleToDelete.isReturn,
          });
        } catch (error) {
          errors.push({
            id,
            error: error.message,
          });
        }
      });
      
      await Promise.allSettled(batchPromises);
    }
    
    res.json({
      success: true,
      deletedCount: deletedSales.length,
      deletedSales,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully deleted ${deletedSales.length} sales and restored inventory`,
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete sales",
      error: error.message,
    });
  }
});

// 🔥 NEW UTILITY FUNCTION TO CHECK INVENTORY CHANGES (Optional - for debugging)
router.get("/sales/inventory-check/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const sale = await SaleSummary.findById(id);
    
    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }
    
    const inventoryChecks = await Promise.all(
      sale.products.map(async (product) => {
        const existingProduct = await findProductInInventory(
          product.productName
        );
        
        return {
          productName: product.productName,
          saleQty: product.totalQty,
          currentStock:
            existingProduct?.totalBoxes ||
            existingProduct?.currentStock ||
            existingProduct?.boxes ||
            0,
          hasStock: existingProduct ? "Yes" : "No",
          productId: existingProduct?._id,
          isExchangeProduct: product.isExchangeProduct,
          isReturnProduct: product.isReturnProduct,
          transactionType: sale.isReturn
            ? "Return"
            : sale.isExchange
            ? "Exchange"
            : "Sale",
        };
      })
    );
    
    res.json({
      saleId: id,
      invoiceNumber: sale.invoiceNumber,
      isExchange: sale.isExchange,
      isReturn: sale.isReturn,
      inventoryChecks,
    });
  } catch (error) {
    console.error("Inventory check error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 NEW ENDPOINT TO GET EXCHANGE TRANSACTIONS
router.get("/sales/exchange-transactions", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchConditions = { isExchange: true };
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }
    
    const exchangeTransactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isExchange: 1,
        isReturn: 1,
      });
    
    res.json({
      success: true,
      data: exchangeTransactions,
      count: exchangeTransactions.length,
    });
  } catch (error) {
    console.error("Error fetching exchange transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch exchange transactions",
      error: error.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET RETURN TRANSACTIONS
router.get("/sales/return-transactions", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const matchConditions = { isReturn: true };
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }
    
    const returnTransactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isReturn: 1,
        isExchange: 1,
      });
    
    res.json({
      success: true,
      data: returnTransactions,
      count: returnTransactions.length,
    });
  } catch (error) {
    console.error("Error fetching return transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch return transactions",
      error: error.message,
    });
  }
});

// 🔥 NEW ENDPOINT TO GET ALL TRANSACTIONS BY TYPE
router.get("/sales/transactions-by-type", async (req, res) => {
  try {
    const { type, startDate, endDate } = req.query;
    let matchConditions = {};
    
    if (type === "return") {
      matchConditions.isReturn = true;
    } else if (type === "exchange") {
      matchConditions.isExchange = true;
    } else if (type === "sale") {
      matchConditions.$and = [
        { isReturn: { $ne: true } },
        { isExchange: { $ne: true } },
      ];
    }
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        matchConditions.invoiceDate = {
          $gte: start,
          $lte: end,
        };
      }
    }
    
    const transactions = await SaleSummary.find(matchConditions)
      .sort({ invoiceDate: -1 })
      .select({
        invoiceNumber: 1,
        invoiceDate: 1,
        customerName: 1,
        mrName: 1,
        totalAmount: 1,
        paymentStatus: 1,
        remark: 1,
        products: 1,
        isReturn: 1,
        isExchange: 1,
      });
    
    res.json({
      success: true,
      data: transactions,
      count: transactions.length,
      type: type || "all",
    });
  } catch (error) {
    console.error("Error fetching transactions by type:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
});

// 🔥 ADDED: Endpoint to get failed invoices for a session
router.get("/import/failed-invoices/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!importProgressMap.has(sessionId)) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }
    
    const progress = importProgressMap.get(sessionId);
    const errors = progress.errors || [];
    
    // Format errors for download
    const failedInvoices = errors.map((error, index) => ({
      row: index + 1,
      invoiceNumber: error.invoiceNumber || `Error-${index}`,
      customerName: error.customerName || "Unknown",
      error: error.error || "Unknown error",
      type: error.type || "import_error",
      products: error.products || [],
      timestamp: error.timestamp || new Date().toISOString(),
    }));
    
    res.json({
      success: true,
      failedInvoices,
      count: failedInvoices.length,
      sessionId,
    });
  } catch (error) {
    console.error("Error fetching failed invoices:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching failed invoices",
      error: error.message,
    });
  }
});

// 🔥 NEW: Debug endpoint for product matching
router.get("/debug/product-match/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const normalized = normalizeProductName(productName);
    
    // Search in ReportInHand
    const reportProducts = await ReportInHand.find({
      productName: { $regex: productName, $options: "i" },
    });
    
    // Search with enhanced finder
    const foundProduct = await findProductInInventory(productName);
    
    res.json({
      searchTerm: productName,
      normalizedTerm: normalized,
      fixedName: productNameFixMap[normalized] || "Not in fix map",
      reportInHandMatches: reportProducts.map((p) => ({
        id: p._id,
        productName: p.productName,
        totalBoxes:
          p.totalBoxes ||
          p.batches?.reduce((sum, b) => sum + (b.boxes || 0), 0) ||
          0,
        supplierName: p.supplierName,
      })),
      foundByEnhancedFinder: foundProduct
        ? {
            id: foundProduct._id,
            productName: foundProduct.productName,
            totalBoxes:
              foundProduct.totalBoxes ||
              foundProduct.batches?.reduce(
                (sum, b) => sum + (b.boxes || 0),
                0
              ) ||
              0,
            supplierName: foundProduct.supplierName,
          }
        : null,
      allProductsInInventory: (await ReportInHand.find({}))
        .map((p) => p.productName)
        .slice(0, 20), // First 20 products
    });
  } catch (error) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔥 FIXED: Debug endpoint to check MR cash updates
router.get("/debug/mr-cash-updates", async (req, res) => {
  try {
    const { mrName } = req.query;
    let query = {};
    
    if (mrName) {
      query.mrName = { $regex: mrName, $options: "i" };
    }
    
    const cashRecords = await MRCash.find(query).sort({ updatedAt: -1 });
    const staffMembers = await Staff.find(query);
    
    // Get recent cash sales
    const recentCashSales = await SaleSummary.find({
      paymentStatus: { $in: ["Cash", "Paid"] },
      paidAmount: { $gt: 0 },
      ...(mrName ? { mrName: { $regex: mrName, $options: "i" } } : {}),
    })
      .sort({ invoiceDate: -1 })
      .limit(10);
    
    res.json({
      success: true,
      cashRecords: cashRecords.map((record) => ({
        id: record._id,
        mrId: record.mrId,
        mrName: record.mrName,
        currentCash: record.currentCash,
        cashTransferredToAdmin: record.cashTransferredToAdmin,
        lastTransferDate: record.lastTransferDate,
        recentTransactions: record.recentTransactions,
        notes: record.notes,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      })),
      staffMembers: staffMembers.map((staff) => ({
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        isActive: staff.isActive,
      })),
      recentCashSales: recentCashSales.map((sale) => ({
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: sale.invoiceDate,
        mrName: sale.mrName,
        mrId: sale.mrId,
        paidAmount: sale.paidAmount,
        paymentStatus: sale.paymentStatus,
        customerName: sale.customerName,
      })),
    });
  } catch (error) {
    console.error("Debug MR cash error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Test endpoint to manually add cash to MR
router.post("/debug/add-cash-manually", async (req, res) => {
  try {
    const { mrId, mrName, amount, invoiceNumber, notes } = req.body;
    let mrStaff = null;
    
    // Find MR
    if (mrId) {
      mrStaff = await Staff.findById(mrId);
    }
    
    if (!mrStaff && mrName) {
      mrStaff = await Staff.findOne({
        $or: [
          { name: { $regex: new RegExp(mrName.trim(), "i") } },
          { email: { $regex: new RegExp(mrName.trim(), "i") } },
        ],
      });
    }
    
    if (!mrStaff) {
      return res.status(404).json({
        success: false,
        message: "MR not found",
      });
    }
    
    // Find or create MR cash record
    let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    const cashAmount = parseFloat(amount) || 0;
    
    if (!mrCash) {
      // Create new MR cash record
      mrCash = new MRCash({
        mrId: mrStaff._id,
        mrName: mrStaff.name,
        currentCash: cashAmount,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes:
          notes ||
          `Manual cash addition for invoice ${invoiceNumber || "manual"}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Update existing
      mrCash.currentCash = (mrCash.currentCash || 0) + cashAmount;
      mrCash.updatedAt = new Date();
      
      const note = `Manually added $${cashAmount} ${
        invoiceNumber ? `for invoice ${invoiceNumber}` : ""
      }`;
      if (mrCash.notes) {
        mrCash.notes += `\n${note}`;
      } else {
        mrCash.notes = note;
      }
    }
    
    await mrCash.save();
    
    res.json({
      success: true,
      message: `Added $${cashAmount} to MR ${mrStaff.name}'s cash`,
      data: {
        mrName: mrStaff.name,
        mrId: mrStaff._id,
        amountAdded: cashAmount,
        newBalance: mrCash.currentCash,
        cashRecordId: mrCash._id,
      },
    });
  } catch (error) {
    console.error("Manual cash addition error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Add this temporary debug endpoint
router.get("/import/debug/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const progress = importProgressMap.get(sessionId);
    
    if (!progress) {
      return res.json({ error: "Session not found" });
    }
    
    // Get detailed error samples
    const sampleErrors = progress.errors.slice(0, 20);
    const errorPatterns = {};
    
    sampleErrors.forEach((error) => {
      const key = error.error?.split(":")[0] || "Unknown";
      errorPatterns[key] = (errorPatterns[key] || 0) + 1;
    });
    
    res.json({
      totalErrors: progress.errors.length,
      errorPatterns,
      sampleErrors,
      progressDetails: {
        totalInvoices: progress.totalInvoices,
        successful: progress.successful,
        failed: progress.failed,
        progressPercentage: progress.progressPercentage,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 CRITICAL: Add a simple diagnostic endpoint
router.get("/debug/diagnostic", async (req, res) => {
  try {
    // Test database connection
    const dbState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    // Test if we can insert and read
    const testData = {
      invoiceNumber: `DIAG-${Date.now()}`,
      customerName: "Diagnostic Test",
      mrName: "Test MR",
      totalAmount: 100,
      paidAmount: 100,
      paymentStatus: "Cash"
    };
    
    // Try to insert
    const testSale = new SaleSummary({
      ...testData,
      customerId: new mongoose.Types.ObjectId(),
      products: [{
        productName: "Test Product",
        salesQty: 1,
        netSellingAmount: 100
      }],
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    const saved = await testSale.save();
    
    // Immediately delete it
    await SaleSummary.findByIdAndDelete(saved._id);
    
    res.json({
      success: true,
      database: {
        state: states[dbState],
        connection: dbState === 1 ? "Healthy" : "Problem",
      },
      testInsert: {
        success: true,
        id: saved._id,
        invoiceNumber: saved.invoiceNumber
      },
      collections: {
        SaleSummary: await SaleSummary.countDocuments(),
        MRCash: await MRCash.countDocuments(),
        Staff: await Staff.countDocuments()
      }
    });
  } catch (error) {
    console.error("Diagnostic error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// 🔥 ADDED: Clear all test data endpoint
router.post("/debug/clear-test-data", async (req, res) => {
  try {
    // Delete test sales
    const testSales = await SaleSummary.deleteMany({
      $or: [
        { invoiceNumber: { $regex: /^TEST-/i } },
        { invoiceNumber: { $regex: /^DIAG-/i } },
        { customerName: "Test Customer" },
        { customerName: "Diagnostic Test" }
      ]
    });
    
    // Delete test MR cash
    const testMRCASH = await MRCash.deleteMany({
      $or: [
        { mrName: { $regex: /Test MR/i } },
        { notes: { $regex: /test/i } }
      ]
    });
    
    res.json({
      success: true,
      deleted: {
        sales: testSales.deletedCount,
        mrcash: testMRCASH.deletedCount
      },
      message: "Test data cleared"
    });
  } catch (error) {
    console.error("Clear test data error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export the router
export default router;