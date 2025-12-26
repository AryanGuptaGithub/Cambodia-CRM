import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import mongoose from "mongoose";
import ReportInHand from "../../models/reports/reportsInHand.js";
import PaymentStatus from "../../models/paymentStatus.js";

const router = express.Router();
const importProgressMap = new Map();
const BYPASS_STOCK_CHECK = process.env.BYPASS_STOCK_CHECK === "true";

const createSessionId = () =>
  `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

///////////////////////

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";

  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[-_\/\\]/g, " ")
    .replace(/alu\s*alu/gi, "alu alu")
    .trim();
};

const productNameFixMap = {
  "n-lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
  "n lycopene + wheatgerm oil": "N-LYCOPENE + WHEATGERM OIL",
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

  "n sea buckthorn & oil lutein extract":
    "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "sea buckthorn & oil lutein extract": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",

  "ecomol 500": "ECOMOL 500",
  ecomol500: "ECOMOL 500",
  ecomol: "ECOMOL 500",

  "alu alu ecocid 20": "ALU ALU ECOCID 20",
  "alualu ecocid 20": "ALU ALU ECOCID 20",
  "ecocid 20 alu alu": "ALU ALU ECOCID 20",
  "ecocid alu alu 20": "ALU ALU ECOCID 20",
  "ecocid 20": "ALU ALU ECOCID 20",
};

const findProductStockInHand = async (productName, requiredQty) => {
  try {
    const normalized = normalizeProductName(productName);
    const fixedName = productNameFixMap[normalized] || productName.trim();
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

    let stockItems = await ReportInHand.find({
      productName: { $regex: new RegExp(`^${escaped}$`, "i") },
    }).sort({ expiryDate: 1 });

    if (stockItems.length === 0) {
      stockItems = await ReportInHand.find({
        productName: { $regex: escaped, $options: "i" },
      }).sort({ expiryDate: 1 });
    }

    if (stockItems.length === 0) {
      const allItems = await ReportInHand.find({});
      stockItems = allItems.filter(
        (item) =>
          normalizeProductName(item.productName) === normalized ||
          item.productName.toLowerCase().includes(normalized) ||
          normalized.includes(normalizeProductName(item.productName))
      );
    }

    if (stockItems.length === 0) {
      return {
        insufficient: true,
        availableStock: 0,
        message: `Product "${productName}" not found in stock`,
      };
    }

    const available = stockItems.reduce(
      (sum, item) => sum + (item.totalBoxes || 0),
      0
    );

    if (available < requiredQty) {
      return {
        insufficient: true,
        availableStock: available,
        message: `Insufficient stock for "${productName}". Required: ${requiredQty}, Available: ${available}`,
      };
    }
    return { insufficient: false, availableStock: available };
  } catch (error) {
    console.error("STOCK CHECK ERROR:", error.message);
    return { insufficient: true, availableStock: 0, message: error.message };
  }
};

const consumeStockFromHand = async (
  productName,
  requiredQty,
  session = null
) => {
  try {
    const normalized = normalizeProductName(productName);
    const fixedName = productNameFixMap[normalized] || productName.trim();
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

    let query = {
      $or: [
        { productName: { $regex: new RegExp(`^${escaped}$`, "i") } },
        { productName: { $regex: escaped, $options: "i" } },
      ],
    };

    let stockItems;
    if (session) {
      stockItems = await ReportInHand.find(query)
        .sort({ expiryDate: 1 })
        .session(session);
    } else {
      stockItems = await ReportInHand.find(query).sort({ expiryDate: 1 });
    }

    if (stockItems.length === 0) {
      const allItems = await ReportInHand.find(session ? { session } : {});
      stockItems = allItems.filter(
        (item) => normalizeProductName(item.productName) === normalized
      );
    }

    if (stockItems.length === 0) {
      throw new Error(`No stock found for ${productName}`);
    }

    let remaining = requiredQty;
    const updatePromises = [];

    for (const item of stockItems) {
      if (remaining <= 0) break;

      let itemRemaining = item.totalBoxes || 0;
      if (itemRemaining <= 0) continue;

      // Deduct from batches
      while (itemRemaining > 0 && remaining > 0 && item.batches.length > 0) {
        const batch = item.batches[0];
        const take = Math.min(batch.boxes, remaining, itemRemaining);

        batch.boxes -= take;
        batch.amount = batch.boxes * (batch.lc || 0);
        remaining -= take;
        itemRemaining -= take;

        if (batch.boxes <= 0) {
          item.batches.shift();
        }
      }

      // Update the item totals
      item.totalBoxes = item.batches.reduce((sum, b) => sum + b.boxes, 0);
      item.totalAmount = item.batches.reduce((sum, b) => sum + b.amount, 0);
      item.updatedAt = new Date();

      // Save the updated item
      if (session) {
        updatePromises.push(item.save({ session }));
      } else {
        updatePromises.push(item.save());
      }
    }

    // Wait for all updates to complete
    await Promise.all(updatePromises);

    if (remaining > 0) {
      throw new Error(
        `Could only deduct ${
          requiredQty - remaining
        } of ${requiredQty} for ${productName}. Insufficient stock.`
      );
    }

    return { success: true };
  } catch (error) {
    console.error("STOCK CONSUMPTION ERROR:", error.message);
    throw error;
  }
};

// ====================== OTHER HELPERS ======================

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
      mrName: mrStaff.name,
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

const validateImportData = async (salesData) => {
  const errors = [];
  const validData = [];

  for (let i = 0; i < salesData.length; i++) {
    const sale = salesData[i];
    const saleErrors = [];
    const rowNumber = i + 2;

    if (!sale.invoiceNumber?.trim())
      saleErrors.push("Invoice number is required");
    if (!sale.customerName?.trim())
      saleErrors.push("Customer name is required");
    if (!Array.isArray(sale.products) || sale.products.length === 0)
      saleErrors.push("At least one product required");

    if (Array.isArray(sale.products)) {
      sale.products.forEach((p, idx) => {
        if (!p.productName?.trim())
          saleErrors.push(`Product ${idx + 1}: Name required`);
        const qty = parseFloat(p.salesQty);
        if (isNaN(qty) || qty < 0)
          saleErrors.push(`Product ${idx + 1}: Valid sales quantity required`);
      });
    }

    if (saleErrors.length > 0) {
      errors.push({
        row: rowNumber,
        invoiceNumber: sale.invoiceNumber || `Row-${rowNumber}`,
        customerName: sale.customerName || "Unknown",
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

// ====================== IMPORT PROGRESS ======================
const initializeImportProgress = (sessionId, total) => {
  importProgressMap.set(sessionId, {
    sessionId,
    totalInvoices: total,
    processedInvoices: 0,
    successful: 0,
    failed: 0,
    progressPercentage: 0,
    startTime: Date.now(),
    lastUpdated: Date.now(),
    completed: false,
    errors: [],
  });
};

const updateImportProgress = (sessionId, updates) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;
  Object.assign(progress, updates, { lastUpdated: Date.now() });
  progress.progressPercentage = Math.round(
    (progress.processedInvoices / progress.totalInvoices) * 100
  );
  importProgressMap.set(sessionId, progress);
};
// ====================== SINGLE INVOICE PROCESSING WITH STOCK DEDUCTION ======================
const processSingleInvoice = async (saleData, sessionId, index) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return { success: false, failedInvoice: null };

  const session = await mongoose.startSession();
  let isSuccess = false;
  let failedDetail = null;

  try {
    await session.withTransaction(async () => {
      const customerInfo = await getOrCreateCustomer(saleData);
      const mrStaff = await findMRStaff(saleData.mrName);

      const processedProducts = [];

      // First, check stock for all products
      if (!BYPASS_STOCK_CHECK) {
        for (const p of saleData.products) {
          const salesQty = parseFloat(p.salesQty) || 0;
          if (salesQty > 0) {
            const stockCheck = await findProductStockInHand(
              p.productName,
              salesQty
            );
            if (stockCheck.insufficient) {
              throw new Error(stockCheck.message);
            }
          }
        }
      }

      // Then process products and deduct stock
      for (const p of saleData.products) {
        const salesQty = parseFloat(p.salesQty) || 0;
        const bonusQty = parseFloat(p.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        if (totalQty <= 0) continue;

        // Deduct stock if BYPASS_STOCK_CHECK is false
        if (!BYPASS_STOCK_CHECK && salesQty > 0) {
          await consumeStockFromHand(p.productName, salesQty, session);
        }

        processedProducts.push({
          productName: p.productName,
          salesQty,
          bonusQty,
          totalQty,
          sellingPrice: parseFloat(p.sellingPrice) || 0,
          amount: parseFloat(p.amount) || 0,
          discount: parseFloat(p.discount) || 0,
          netSellingAmount: parseFloat(p.netSellingAmount) || 0,
          averageUnitPrice: parseFloat(p.averageUnitPrice) || 0,
          lc: parseFloat(p.lc) || 0,
          profitLoss: parseFloat(p.profitLoss) || 0,
          isProductAccept: p.isProductAccept !== false,
        });
      }

      if (processedProducts.length === 0) throw new Error("No valid products");

      const totalAmount = processedProducts.reduce(
        (sum, p) => sum + (p.netSellingAmount || 0),
        0
      );
      const paidAmount = parseFloat(saleData.paidAmount) || 0;
      const dueAmount = Math.max(0, totalAmount - paidAmount);

      const newSale = new SaleSummary({
        recordingDate: parseDateString(saleData.recordingDate),
        invoiceNumber: saleData.invoiceNumber.trim(),
        invoiceDate: parseDateString(saleData.invoiceDate),
        mrName: saleData.mrName || "No MR Name Provided",
        mrId: mrStaff?._id || null,
        customerName: customerInfo.customerName,
        customerCode: customerInfo.customerCode,
        customerId: customerInfo.customerId,
        products: processedProducts,
        creditDays: parseInt(saleData.creditDays) || 0,
        dueDate: parseDateString(saleData.dueDate),
        deliveryDate: parseDateString(saleData.deliveryDate),
        paidAmount,
        dueAmount,
        totalAmount,
        paymentStatus: mapPaymentStatus(saleData.paymentStatus),
        remark: saleData.remark || "",
      });

      await newSale.save({ session });

      if (["Cash", "Paid"].includes(newSale.paymentStatus) && paidAmount > 0) {
        await addCashToMR({
          mrName: newSale.mrName,
          mrId: newSale.mrId,
          paidAmount,
          invoiceNumber: newSale.invoiceNumber,
          invoiceDate: newSale.invoiceDate,
          customerName: newSale.customerName,
          paymentStatus: newSale.paymentStatus,
        });
      }
    });
    isSuccess = true;
  } catch (err) {
    console.error(
      `Error processing invoice ${saleData.invoiceNumber}:`,
      err.message
    );

    const isStockError =
      !BYPASS_STOCK_CHECK && err.message.toLowerCase().includes("stock");

    failedDetail = {
      row: index + 2,
      invoiceNumber: saleData.invoiceNumber || "Unknown",
      customerName: saleData.customerName || "Unknown",
      productName: err.message.includes("for ")
        ? err.message.split("for ")[1]?.trim()
        : "N/A",
      message: err.message,
      type: isStockError ? "insufficient_stock" : "import_error",
      timestamp: new Date().toISOString(),
    };
  } finally {
    await session.endSession();
  }

  return { success: isSuccess, failedInvoice: failedDetail };
};
// ====================== MAIN IMPORT ======================

const processImportAsync = async (sessionId, validInvoices) => {
  const progress = importProgressMap.get(sessionId);
  if (!progress) return;

  const errors = [];

  for (let i = 0; i < validInvoices.length; i++) {
    const saleData = validInvoices[i];
    const { success, failedInvoice } = await processSingleInvoice(
      saleData,
      sessionId,
      i
    );

    if (!success && failedInvoice) {
      errors.push(failedInvoice);
    }

    updateImportProgress(sessionId, {
      processedInvoices: progress.processedInvoices + 1,
      successful: progress.successful + (success ? 1 : 0),
      failed: progress.failed + (success ? 0 : 1),
    });
  }

  updateImportProgress(sessionId, { completed: true, errors });
};

const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber: invoiceNumber?.trim() };
  if (excludeId) query._id = { $ne: excludeId };
  return await SaleSummary.exists(query);
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

router.post("/sales/import", async (req, res) => {
  let sessionId = null;
  try {
    const invoices = Array.isArray(req.body?.invoices)
      ? req.body.invoices
      : req.body || [];
    if (invoices.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "No invoices provided" });

    const {
      validData,
      errors: validationErrors,
      hasCriticalErrors,
    } = await validateImportData(invoices);

    if (hasCriticalErrors) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    const dataToImport = validData.length > 0 ? validData : invoices;

    sessionId = createSessionId();
    initializeImportProgress(sessionId, dataToImport.length);

    processImportAsync(sessionId, dataToImport);

    res.json({
      success: true,
      message:
        "Import started – valid products will be imported with stock deduction",
      sessionId,
      totalInvoices: dataToImport.length,
      progressUrl: `/api/sales/import/progress/${sessionId}`,
    });
  } catch (error) {
    console.error("Import start error:", error);
    if (sessionId) importProgressMap.delete(sessionId);
    res
      .status(500)
      .json({ success: false, message: "Import failed", error: error.message });
  }
});

router.get("/sales/import/progress/:sessionId", (req, res) => {
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
      completed: progress.completed || false,
    },
  });
});

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
        products: 1,
        createdAt: 1,
        updatedAt: 1,
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

  try {
    await session.withTransaction(async () => {
      const saleToDelete = await SaleSummary.findById(id).session(session);

      if (!saleToDelete) {
        throw new Error("Sales record not found.");
      }

      // Restore stock for each product
      if (!BYPASS_STOCK_CHECK) {
        for (const product of saleToDelete.products) {
          const salesQty = product.salesQty || 0;
          if (salesQty > 0) {
            // Find the product in ReportInHand
            const normalized = normalizeProductName(product.productName);
            const fixedName =
              productNameFixMap[normalized] || product.productName.trim();
            const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

            let stockItem = await ReportInHand.findOne({
              productName: { $regex: new RegExp(`^${escaped}$`, "i") },
            }).session(session);

            if (!stockItem) {
              stockItem = await ReportInHand.findOne({
                productName: { $regex: escaped, $options: "i" },
              }).session(session);
            }

            if (stockItem) {
              // Add a new batch with the restored quantity
              stockItem.batches.push({
                batchNumber: `RESTORE-${Date.now()}`,
                boxes: salesQty,
                lc: product.lc || 0,
                amount: salesQty * (product.lc || 0),
                date: new Date(),
              });

              // Update totals
              stockItem.totalBoxes += salesQty;
              stockItem.totalAmount += salesQty * (product.lc || 0);
              stockItem.updatedAt = new Date();

              await stockItem.save({ session });
            }
          }
        }
      }

      // Remove cash from MR if applicable
      if (
        (saleToDelete.paymentStatus === "Cash" ||
          saleToDelete.paymentStatus === "Paid") &&
        saleToDelete.paidAmount > 0
      ) {
        await removeCashFromMR({
          mrName: saleToDelete.mrName,
          mrId: saleToDelete.mrId,
          paidAmount: saleToDelete.paidAmount,
          invoiceNumber: saleToDelete.invoiceNumber,
          customerName: saleToDelete.customerName,
          paymentStatus: saleToDelete.paymentStatus,
        });
      }

      // Delete the sale
      await SaleSummary.findByIdAndDelete(id).session(session);

      res.status(200).json({
        message: "Sales record deleted successfully and stock restored.",
        deletedSale: saleToDelete,
      });
    });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to delete sales record." });
  } finally {
    await session.endSession();
  }
});

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
      "Profit/Loss",
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

          if (
            (saleToDelete.paymentStatus === "Cash" ||
              saleToDelete.paymentStatus === "Paid") &&
            saleToDelete.paidAmount > 0
          ) {
            await removeCashFromMR({
              mrName: saleToDelete.mrName,
              mrId: saleToDelete.mrId,
              paidAmount: saleToDelete.paidAmount,
              invoiceNumber: saleToDelete.invoiceNumber,
              customerName: saleToDelete.customerName,
              paymentStatus: saleToDelete.paymentStatus,
            });
          }

          await SaleSummary.findByIdAndDelete(id);

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
      });

      await Promise.allSettled(batchPromises);
    }

    res.json({
      success: true,
      deletedCount: deletedSales.length,
      deletedSales,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully deleted ${deletedSales.length} sales`,
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

router.post("/sales", async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const data = req.body;
      console.log("Incoming sale data:", data);

      if (!data.invoiceNumber) {
        throw new Error("Invoice number is required");
      }

      // Check for duplicate invoice number
      if (await checkInvoiceNumberExists(data.invoiceNumber)) {
        throw new Error("Invoice number already exists");
      }

      const mrStaff = await findMRStaff(data.mrName, data.mrId);

      const processedProducts = [];
      let totalAmount = 0;

      // Check stock availability first
      if (!BYPASS_STOCK_CHECK) {
        for (const p of data.products || []) {
          if (!p.productName || !p.productName.trim()) continue;

          const salesQty = Number(p.salesQty) || 0;
          if (salesQty > 0) {
            const stockCheck = await findProductStockInHand(
              p.productName,
              salesQty
            );
            if (stockCheck.insufficient) {
              throw new Error(stockCheck.message);
            }
          }
        }
      }

      // Process products and deduct stock
      for (const p of data.products || []) {
        if (!p.productName || !p.productName.trim()) continue;

        const salesQty = Number(p.salesQty) || 0;
        const bonusQty = Number(p.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;
        if (totalQty === 0) continue;

        // Deduct stock if BYPASS_STOCK_CHECK is false
        if (!BYPASS_STOCK_CHECK && salesQty > 0) {
          await consumeStockFromHand(p.productName, salesQty, session);
        }

        const sellingPrice = Number(p.sellingPrice) || 0;
        const amount = sellingPrice * salesQty;
        const discount = Number(p.discount) || 0;
        const netSellingAmount = amount - discount;

        processedProducts.push({
          productName: p.productName.trim(),
          salesQty,
          bonusQty,
          totalQty,
          sellingPrice,
          amount,
          discount,
          netSellingAmount,
          averageUnitPrice: totalQty > 0 ? netSellingAmount / totalQty : 0,
          lc: Number(p.lc) || 0,
          profitLoss: netSellingAmount - totalQty * (Number(p.lc) || 0),
          isProductAccept: true,
        });

        totalAmount += netSellingAmount;
      }

      if (processedProducts.length === 0) {
        throw new Error("At least one valid product required");
      }

      const paidAmount = Number(data.paidAmount) || 0;
      const dueAmount = Math.max(0, totalAmount - paidAmount);

      const sale = await SaleSummary.create(
        [
          {
            recordingDate:
              data.recordingDate || new Date().toISOString().split("T")[0],
            invoiceNumber: data.invoiceNumber.trim(),
            invoiceDate:
              data.invoiceDate || new Date().toISOString().split("T")[0],
            mrName: data.mrName || "No MR Name Provided",
            mrId: mrStaff?._id || null,
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
            paymentStatus: mapPaymentStatus(data.paymentStatus),
            remark: data.remark || "",
          },
        ],
        { session }
      );

      // Only update cash if real MR exists
      if (["Cash", "Paid"].includes(sale[0].paymentStatus) && paidAmount > 0) {
        await addCashToMR({
          mrName: sale[0].mrName,
          mrId: sale[0].mrId,
          paidAmount,
          invoiceNumber: sale[0].invoiceNumber,
          invoiceDate: sale[0].invoiceDate,
          customerName: sale[0].customerName,
          paymentStatus: sale[0].paymentStatus,
        });
      }

      res.status(201).json({
        message: "Sale created successfully with stock deduction",
        sale: sale[0],
      });
    });
  } catch (err) {
    console.error("Sale create error:", err);
    res.status(500).json({
      error: err.message || "Failed to create sale",
      details: err.message.includes("stock")
        ? "Insufficient stock or product not found"
        : undefined,
    });
  } finally {
    await session.endSession();
  }
});

router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const originalSale = await SaleSummary.findById(id).session(session);
      if (!originalSale) {
        throw new Error("Sales record not found.");
      }

      // Check invoice uniqueness
      if (
        req.body.invoiceNumber &&
        req.body.invoiceNumber !== originalSale.invoiceNumber
      ) {
        const invoiceExists = await checkInvoiceNumberExists(
          req.body.invoiceNumber,
          id
        );
        if (invoiceExists) {
          throw new Error(
            `Invoice number "${req.body.invoiceNumber}" already exists.`
          );
        }
      }

      const saleData = req.body;

      if (!saleData.mrName || !saleData.mrName.trim()) {
        saleData.mrName = originalSale.mrName || "No MR Name Provided";
      }

      let mrStaff = null;
      if (saleData.mrName) {
        mrStaff = await Staff.findOne({
          name: { $regex: new RegExp(saleData.mrName.trim(), "i") },
        }).session(session);
      }

      const updatedProducts = [];
      let totalAmount = 0;

      // Calculate stock differences and check availability
      if (!BYPASS_STOCK_CHECK) {
        // Create a map of original products
        const originalProductsMap = {};
        originalSale.products.forEach((p) => {
          originalProductsMap[p.productName] = p.salesQty || 0;
        });

        // Check new quantities
        for (const p of saleData.products || []) {
          if (!p.productName || !p.productName.trim()) continue;

          const newSalesQty = Number(p.salesQty) || 0;
          const originalQty = originalProductsMap[p.productName] || 0;

          // If increasing quantity, check if stock is available
          if (newSalesQty > originalQty) {
            const additionalNeeded = newSalesQty - originalQty;
            const stockCheck = await findProductStockInHand(
              p.productName,
              additionalNeeded
            );
            if (stockCheck.insufficient) {
              throw new Error(
                `Insufficient stock for "${p.productName}". Additional ${additionalNeeded} needed, available: ${stockCheck.availableStock}`
              );
            }
          }
        }
      }

      // Process products and adjust stock
      for (const p of saleData.products || []) {
        if (!p.productName || !p.productName.trim()) continue;

        const newSalesQty = Number(p.salesQty) || 0;
        const bonusQty = Number(p.bonusQty) || 0;
        const totalQty = newSalesQty + bonusQty;

        if (totalQty === 0) continue;

        // Find original quantity for this product
        const originalProduct = originalSale.products.find(
          (op) =>
            normalizeProductName(op.productName) ===
            normalizeProductName(p.productName)
        );
        const originalQty = originalProduct ? originalProduct.salesQty || 0 : 0;

        // Adjust stock if BYPASS_STOCK_CHECK is false
        if (!BYPASS_STOCK_CHECK) {
          if (newSalesQty > originalQty) {
            // Need to deduct additional stock
            const additionalNeeded = newSalesQty - originalQty;
            await consumeStockFromHand(
              p.productName,
              additionalNeeded,
              session
            );
          } else if (newSalesQty < originalQty) {
            // Need to restore excess stock
            const excess = originalQty - newSalesQty;

            // Find the product in ReportInHand to restore
            const normalized = normalizeProductName(p.productName);
            const fixedName =
              productNameFixMap[normalized] || p.productName.trim();
            const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

            let stockItem = await ReportInHand.findOne({
              productName: { $regex: new RegExp(`^${escaped}$`, "i") },
            }).session(session);

            if (!stockItem) {
              stockItem = await ReportInHand.findOne({
                productName: { $regex: escaped, $options: "i" },
              }).session(session);
            }

            if (stockItem) {
              // Add a new batch with the restored quantity
              stockItem.batches.push({
                batchNumber: `RESTORE-${Date.now()}`,
                boxes: excess,
                lc: p.lc || originalProduct?.lc || 0,
                amount: excess * (p.lc || originalProduct?.lc || 0),
                date: new Date(),
              });

              // Update totals
              stockItem.totalBoxes += excess;
              stockItem.totalAmount +=
                excess * (p.lc || originalProduct?.lc || 0);
              stockItem.updatedAt = new Date();

              await stockItem.save({ session });
            }
          }
        }

        const netSellingAmount = Number(p.netSellingAmount) || 0;
        const lcValue = p.lc || originalProduct?.lc || 0;

        updatedProducts.push({
          productName: p.productName.trim(),
          originalProductName: p.productName.trim(),
          salesQty: newSalesQty,
          bonusQty,
          totalQty,
          sellingPrice: Number(p.sellingPrice) || 0,
          amount: Number(p.amount) || 0,
          discount: Number(p.discount) || 0,
          netSellingAmount,
          averageUnitPrice: totalQty > 0 ? netSellingAmount / totalQty : 0,
          lc: lcValue,
          profitLoss: netSellingAmount - totalQty * lcValue,
          isProductAccept:
            p.isProductAccept !== undefined ? p.isProductAccept : true,
        });

        totalAmount += netSellingAmount;
      }

      if (updatedProducts.length === 0) {
        throw new Error("At least one valid product is required");
      }

      const paidAmount = Number(saleData.paidAmount) || 0;
      const dueAmount = Math.max(0, totalAmount - paidAmount);

      // Update cash records if payment status changed
      if (
        originalSale.paymentStatus !==
          mapPaymentStatus(saleData.paymentStatus) ||
        originalSale.paidAmount !== paidAmount
      ) {
        // Remove old cash record
        if (
          ["Cash", "Paid"].includes(originalSale.paymentStatus) &&
          originalSale.paidAmount > 0
        ) {
          await removeCashFromMR({
            mrName: originalSale.mrName,
            mrId: originalSale.mrId,
            paidAmount: originalSale.paidAmount,
            invoiceNumber: originalSale.invoiceNumber,
            customerName: originalSale.customerName,
            paymentStatus: originalSale.paymentStatus,
          });
        }

        // Add new cash record
        if (
          ["Cash", "Paid"].includes(mapPaymentStatus(saleData.paymentStatus)) &&
          paidAmount > 0
        ) {
          await addCashToMR({
            mrName: saleData.mrName || originalSale.mrName,
            mrId: mrStaff?._id || originalSale.mrId,
            paidAmount,
            invoiceNumber: saleData.invoiceNumber || originalSale.invoiceNumber,
            invoiceDate: saleData.invoiceDate || originalSale.invoiceDate,
            customerName: saleData.customerName || originalSale.customerName,
            paymentStatus: mapPaymentStatus(saleData.paymentStatus),
          });
        }
      }

      const updatedSale = await SaleSummary.findByIdAndUpdate(
        id,
        {
          recordingDate: new Date(
            saleData.recordingDate || originalSale.recordingDate
          ),
          invoiceNumber: saleData.invoiceNumber || originalSale.invoiceNumber,
          invoiceDate: new Date(
            saleData.invoiceDate || originalSale.invoiceDate
          ),
          mrName: saleData.mrName || originalSale.mrName,
          mrId: mrStaff ? mrStaff._id : originalSale.mrId,
          customerName: saleData.customerName || originalSale.customerName,
          customerCode: saleData.customerCode || originalSale.customerCode,
          customerId: saleData.customerId || originalSale.customerId,
          products: updatedProducts,
          creditDays:
            Number(saleData.creditDays) || originalSale.creditDays || 0,
          dueDate: saleData.dueDate
            ? new Date(saleData.dueDate)
            : originalSale.dueDate,
          deliveryDate: saleData.deliveryDate
            ? new Date(saleData.deliveryDate)
            : originalSale.deliveryDate,
          paidAmount,
          totalAmount,
          dueAmount,
          paymentStatus:
            mapPaymentStatus(saleData.paymentStatus) ||
            originalSale.paymentStatus,
          remark: saleData.remark || originalSale.remark || "",
          updatedAt: new Date(),
        },
        { new: true, runValidators: true, session }
      );

      res.status(200).json({
        message: "Sale updated successfully with stock adjustment",
        sale: updatedSale,
      });
    });
  } catch (err) {
    console.error("Error updating sale:", err);
    res.status(500).json({
      error: "Failed to update sales record",
      details: err.message,
    });
  } finally {
    await session.endSession();
  }
});

export default router;
