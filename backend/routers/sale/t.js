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

// 🔥 FIXED: Better database initialization
const ensureCollectionsExist = async () => {
  try {
    console.log("🔧 Checking database collections...");
    
    // Wait for database connection
    if (mongoose.connection.readyState !== 1) {
      console.log("⚠️ Waiting for database connection...");
      await new Promise(resolve => {
        if (mongoose.connection.readyState === 1) {
          resolve();
        } else {
          mongoose.connection.once('connected', resolve);
        }
      });
    }
    
    // Check collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    console.log("📊 Available collections:", collectionNames);
    
    // Create missing collections
    const requiredCollections = ['salesummaries', 'mrcashes'];
    
    for (const collName of requiredCollections) {
      if (!collectionNames.includes(collName)) {
        console.log(`⚠️ ${collName} collection doesn't exist, creating...`);
        try {
          await mongoose.connection.db.createCollection(collName);
          console.log(`✅ Created ${collName} collection`);
        } catch (createError) {
          console.log(`⚠️ Could not create ${collName} collection:`, createError.message);
        }
      }
    }
    
    console.log("✅ Database setup complete");
    
  } catch (error) {
    console.error("❌ Error ensuring collections exist:", error.message);
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

// 🔥 FIXED: addCashToMR function - Simplified and reliable
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
      console.warn(`⚠️ MR not found: "${mrName}" - creating placeholder`);
      
      // Check if placeholder already exists
      const existingPlaceholder = await Staff.findOne({
        name: mrName,
        email: { $regex: /placeholder/i }
      });
      
      if (existingPlaceholder) {
        mrStaff = existingPlaceholder;
      } else {
        // Create a placeholder MR
        mrStaff = new Staff({
          name: mrName,
          email: `${mrName.toLowerCase().replace(/\s+/g, '.')}.placeholder@example.com`,
          role: "Medical Representative",
          isActive: true,
          isPlaceholder: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await mrStaff.save();
      }
      console.log(`✅ Using placeholder MR: ${mrStaff.name} (ID: ${mrStaff._id})`);
    } else {
      console.log(`✅ Found MR: ${mrStaff.name} (ID: ${mrStaff._id})`);
    }

    // Calculate amount to add (handle existing cash adjustments)
    const amountToAdd = parseFloat(paidAmount) || 0;
    const existingAmount = parseFloat(existingCashAmount) || 0;
    const netAmount = existingAmount > 0 ? amountToAdd - existingAmount : amountToAdd;

    console.log(`   Amount to process: $${netAmount} (Paid: $${amountToAdd}, Existing: $${existingAmount})`);

    // Find or create MRCash record
    let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
    
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
          notes: `Sale to ${customerName || "Unknown"}`,
          timestamp: new Date()
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
        notes: `Sale to ${customerName || "Unknown"}`,
        timestamp: new Date()
      });
      
      // Keep only last 50 transactions
      if (mrCash.recentTransactions.length > 50) {
        mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
      }
      
      await mrCash.save();
      console.log(`💰 Updated cash for ${mrStaff.name}: ${netAmount > 0 ? '+' : ''}$${netAmount} → Total: $${newCash}`);
    }

    // Verify the update
    const verifiedCash = await MRCash.findOne({ mrId: mrStaff._id });
    
    return {
      success: true,
      mrName: mrStaff.name,
      mrId: mrStaff._id,
      amountAdded: netAmount,
      currentCash: verifiedCash?.currentCash || 0,
      cashRecordId: verifiedCash?._id
    };

  } catch (error) {
    console.error("❌ addCashToMR failed:", error);
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
      timestamp: new Date()
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
  }
};

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

// 🔥 FIXED: Improved processImportBatch function
const processImportBatch = async (batch, batchIndex, totalBatches, sessionId) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) {
    console.error("❌ Session lost during processing");
    return { success: 0, failed: 0, errors: [], cashUpdates: [] };
  }
  
  console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} with ${batch.length} invoices`);
  
  const results = { 
    success: 0, 
    failed: 0, 
    errors: [], 
    cashUpdates: [],
    saleIds: []
  };
  
  // Use a session for batch operations
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
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
          }).session(session);
          
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
          
          // 4. GET MR STAFF
          let mrStaff = null;
          const mrName = saleData.mrName && saleData.mrName.trim() !== "" 
            ? saleData.mrName.trim() 
            : "No MR Name Provided";
          
          if (mrName !== "No MR Name Provided") {
            mrStaff = await Staff.findOne({
              name: { $regex: new RegExp(mrName, "i") }
            }).session(session);
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
          const savedSale = await newSale.save({ session });
          results.saleIds.push(savedSale._id);
          console.log(`✅ Sale saved with ID: ${savedSale._id}`);
          
          // 10. HANDLE CASH - Always process cash synchronously
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
              } else {
                console.log(`   ⚠️ Cash not added: ${cashResult.reason || cashResult.error}`);
              }
            } catch (cashError) {
              console.log(`   ⚠️ Cash handling error: ${cashError.message}`);
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
    });
    
  } catch (error) {
    console.error("Transaction error in batch processing:", error);
    // If transaction fails, all saves in this batch are rolled back
    results.success = 0;
    results.failed = batch.length;
    
    // Add transaction error to all records
    batch.forEach((saleData, index) => {
      results.errors.push({
        invoiceNumber: saleData.invoiceNumber || `Row-${index + 1}`,
        customerName: saleData.customerName || "Unknown",
        error: `Transaction failed: ${error.message}`,
        type: "transaction_error",
        timestamp: new Date().toISOString()
      });
    });
    
  } finally {
    await session.endSession();
  }
  
  // Final batch update
  progress.currentBatchProgress = 100;
  progress.lastUpdated = Date.now();
  
  console.log(`📊 Batch ${batchIndex + 1} complete: ${results.success} success, ${results.failed} failed`);
  
  return results;
};

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

// 🔥 FIXED: Main import endpoint with proper error handling
router.post("/sales/import", async (req, res) => {
  let sessionId = null;
  
  try {
    console.log("📥 Import request received");

    let invoices = [];
    if (Array.isArray(req.body?.invoices)) {
      invoices = req.body.invoices;
    } else if (Array.isArray(req.body)) {
      invoices = req.body;
    }

    console.log(`📊 Received ${invoices.length} invoices`);

    if (invoices.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No invoices provided",
      });
    }

    // Validate data first
    const validationResult = await validateImportData(invoices);
    
    if (validationResult.hasCriticalErrors) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationResult.errors,
        validCount: validationResult.validData.length,
        invalidCount: validationResult.errors.length,
      });
    }

    // Initialize progress tracking
    sessionId = createSessionId();
    const batchSize = 10; // Smaller batch size for better reliability
    initializeImportProgress(sessionId, invoices.length, batchSize);

    // Start async processing
    processImportAsync(sessionId, invoices, batchSize);

    // Return immediately with session ID for progress tracking
    res.json({
      success: true,
      message: "Import started",
      sessionId: sessionId,
      totalInvoices: invoices.length,
      validInvoices: validationResult.validData.length,
      invalidInvoices: validationResult.errors.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
    });

  } catch (error) {
    console.error("❌ Import failed:", error);
    
    // Clean up session if it was created
    if (sessionId) {
      importProgressMap.delete(sessionId);
    }
    
    res.status(500).json({
      success: false,
      message: "Import failed",
      error: error.message,
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

router.post("/debug/verify-import-structure", async (req, res) => {
  try {
    const data = req.body;
    const sample = Array.isArray(data) && data.length > 0 ? data[0] : data;
    
    console.log("🔍 Verifying import data structure...");
    console.log("Sample data keys:", Object.keys(sample));
    
    // Check required fields
    const requiredFields = ['invoiceNumber', 'customerName', 'mrName', 'products'];
    const missingFields = requiredFields.filter(field => !sample[field]);
    
    // Check products structure
    const products = sample.products || [];
    const productStructure = products.length > 0 ? {
      hasProductName: !!products[0].productName,
      hasSalesQty: products[0].salesQty !== undefined,
      hasNetSellingAmount: products[0].netSellingAmount !== undefined,
      sampleProduct: products[0]
    } : null;
    
    // Check payment info
    const paymentInfo = {
      paidAmount: sample.paidAmount,
      totalAmount: sample.totalAmount,
      paymentStatus: sample.paymentStatus
    };
    
    // Simulate cash processing
    let cashSimulation = null;
    if (paymentInfo.paymentStatus === 'Cash' || paymentInfo.paymentStatus === 'Paid') {
      const paidAmount = parseFloat(paymentInfo.paidAmount) || 0;
      if (paidAmount > 0) {
        cashSimulation = {
          wouldProcessCash: true,
          amount: paidAmount,
          mrName: sample.mrName
        };
      }
    }
    
    res.json({
      success: true,
      dataStructure: {
        isArray: Array.isArray(data),
        count: Array.isArray(data) ? data.length : 1,
        requiredFields: {
          missing: missingFields,
          allPresent: missingFields.length === 0
        },
        products: productStructure,
        paymentInfo,
        cashSimulation
      },
      sample: {
        invoiceNumber: sample.invoiceNumber,
        customerName: sample.customerName,
        mrName: sample.mrName,
        productCount: products.length
      }
    });
    
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

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


export default router;