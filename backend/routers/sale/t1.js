
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

const createSessionId = () =>
  `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const normalizeProductName = (name) => {
  if (!name || typeof name !== "string") return "";
  return name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
};

// Updated fix map with exact DB names + common variations
const productNameFixMap = {
  "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "N SEA BUCKTHORN & OIL LUTEIN EXTRACT": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",
  "SEA BUCKTHORN & OIL LUTEIN EXTRACT": "N-SEA BUCKTHORN & OIL LUTEIN EXTRACT",

  "N-LYCOPENE + WHEATGERM OIL": "N-LYCOPENE + WHEATGERM OIL",
  "N LYCOPENE + WHEATGERM OIL": "N-LYCOPENE + WHEATGERM OIL",
  "LYCOPENE + WHEATGERM OIL": "N-LYCOPENE + WHEATGERM OIL",

  "N-GARLIC OIL": "N-GARLIC OIL",
  "N GARLIC OIL": "N-GARLIC OIL",
  "GARLIC OIL": "N-GARLIC OIL",

  "N-NIGELLA OIL": "N-NIGELLA OIL",
  "NIGELLA OIL": "N-NIGELLA OIL",

  "N-KRILL OIL": "N-KRILL OIL",
  "KRILL OIL": "N-KRILL OIL",

  "N-FLAXSEED OIL": "N-FLAXSEED OIL",
  "FLAXSEED OIL": "N-FLAXSEED OIL",

  "N-EVENING PRIMROSE OIL": "N-EVENING PRIMROSE OIL",
  "EVENING PRIMROSE OIL": "N-EVENING PRIMROSE OIL",

  "N-MULTIZ": "N-MULTIZ",
  "MULTIZ": "N-MULTIZ",

  "N-FENUGREEK OIL": "N-FENUGREEK OIL",
  "FENUGREEK OIL": "N-FENUGREEK OIL",

  "ECOMOL 500": "ECOMOL 500",
  "ECOMOL500": "ECOMOL 500",
  "ECOMOL-500": "ECOMOL 500",
  "ECOMOL": "ECOMOL 500",

  // Add more as needed
};

// ====================== STOCK CHECK WITH DETAILED LOGGING ======================

const findProductStockInHand = async (productName, requiredQty) => {
  console.log("\n=== STOCK CHECK START ===");
  console.log(`Original product from Excel: "${productName}"`);
  console.log(`Required quantity: ${requiredQty}`);

  try {
    const normalized = normalizeProductName(productName);
    console.log(`Normalized: "${normalized}"`);

    const fixedName = productNameFixMap[normalized] || normalized;
    console.log(`After fix map: "${fixedName}"`);

    // DO NOT escape + & - they are part of the name!
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");
    console.log(`Regex pattern: "${escaped}"`);

    // Exact match first
    let stockItems = await ReportInHand.find({
      productName: { $regex: new RegExp(`^${escaped}$`, "i") },
    }).sort({ expiryDate: 1 });

    console.log(`Exact match found: ${stockItems.length} document(s)`);

    // Fallback: contains match (for safety)
    if (stockItems.length === 0) {
      console.log("Trying contains match...");
      stockItems = await ReportInHand.find({
        productName: { $regex: new RegExp(escaped, "i") },
      }).sort({ expiryDate: 1 });
      console.log(`Contains match found: ${stockItems.length} document(s)`);
    }

    if (stockItems.length === 0) {
      console.log(`❌ NO PRODUCT FOUND for "${productName}"`);
      console.log("=== STOCK CHECK END (NO PRODUCT) ===\n");
      return {
        insufficient: true,
        availableStock: 0,
        message: `Product "${productName}" not found in stock`,
      };
    }

    stockItems.forEach((item, i) => {
      console.log(`  [${i + 1}] "${item.productName}" | totalBoxes: ${item.totalBoxes}`);
    });

    const available = stockItems.reduce((sum, item) => sum + (item.totalBoxes || 0), 0);
    console.log(`Total available (totalBoxes sum): ${available}`);

    if (available < requiredQty) {
      console.log(`❌ INSUFFICIENT: Need ${requiredQty}, Have ${available}`);
      console.log("=== STOCK CHECK END (FAILED) ===\n");
      return {
        insufficient: true,
        availableStock: available,
        message: `Insufficient stock for "${productName}". Required: ${requiredQty}, Available: ${available}`,
      };
    }

    console.log(`✅ SUFFICIENT: ${available} >= ${requiredQty}`);
    console.log("=== STOCK CHECK END (SUCCESS) ===\n");
    return { insufficient: false, availableStock: available };

  } catch (error) {
    console.error(`🚨 STOCK CHECK ERROR:`, error.message);
    console.log("=== STOCK CHECK END (ERROR) ===\n");
    return { insufficient: true, availableStock: 0, message: error.message };
  }
};

// ====================== STOCK CONSUMPTION (FIFO) ======================

const consumeStockFromHand = async (productName, requiredQty, session) => {
  try {
    const normalized = normalizeProductName(productName);
    const fixedName = productNameFixMap[normalized] || normalized;
    const escaped = fixedName.replace(/[.*?^${}()|[\]\\]/g, "\\$&");

    let stockItems = await ReportInHand.find({
      productName: { $regex: new RegExp(`^${escaped}$`, "i") },
    })
      .sort({ expiryDate: 1 })
      .session(session);

    if (stockItems.length === 0) {
      stockItems = await ReportInHand.find({
        productName: { $regex: new RegExp(escaped, "i") },
      })
      .sort({ expiryDate: 1 })
      .session(session);
    }

    if (stockItems.length === 0) {
      throw new Error(`No stock found for ${productName}`);
    }

    let remaining = requiredQty;

    for (const item of stockItems) {
      if (remaining <= 0) break;
      const take = Math.min(item.totalBoxes || 0, remaining);
      if (take > 0) {
        item.totalBoxes -= take;
        item.updatedAt = new Date();
        await item.save({ session });
        remaining -= take;
      }
    }

    if (remaining > 0) {
      throw new Error(`Could only deduct ${requiredQty - remaining} of ${requiredQty} for ${productName}`);
    }

    return { success: true };
  } catch (error) {
    throw error;
  }
};
// ====================== OTHER HELPERS ======================

const findMRStaff = async (mrName, mrId) => {
  if (mrId && mongoose.Types.ObjectId.isValid(mrId)) {
    return await Staff.findById(mrId).lean();
  }
  if (mrName && mrName.trim() && mrName.trim() !== "No MR Name Provided") {
    return await Staff.findOne({
      name: { $regex: new RegExp(mrName.trim(), "i") },
    }).lean();
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
  if (!["Cash", "Paid"].includes(paymentStatus) || paidAmount <= 0) return { success: false };

  let mrStaff = await findMRStaff(mrName, mrId);
  if (!mrStaff) {
    mrStaff = await new Staff({
      name: mrName,
      email: `${mrName.toLowerCase().replace(/\s+/g, ".")}.placeholder@example.com`,
      role: "Medical Representative",
      isActive: true,
      isPlaceholder: true,
    }).save();
  }

  let mrCash = await MRCash.findOne({ mrId: mrStaff._id });
  const amount = parseFloat(paidAmount);

  if (!mrCash) {
    mrCash = new MRCash({
      mrId: mrStaff._id,
      mrName: mrStaff.name,
      currentCash: amount,
      notes: `Initial cash from invoice ${invoiceNumber}`,
      recentTransactions: [{ invoiceNumber, amount, type: "sale", date: invoiceDate || new Date() }],
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
    if (mrCash.recentTransactions.length > 50) mrCash.recentTransactions = mrCash.recentTransactions.slice(-50);
  }
  await mrCash.save();

  return { success: true, amountAdded: amount };
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

      for (const p of saleData.products) {
        const salesQty = parseFloat(p.salesQty) || 0;
        const bonusQty = parseFloat(p.bonusQty) || 0;
        const totalQty = salesQty + bonusQty;

        if (totalQty <= 0) continue;

        if (salesQty > 0) {
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

      if (processedProducts.length === 0)
        throw new Error("No valid products");

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

      if (
        ["Cash", "Paid"].includes(newSale.paymentStatus) &&
        paidAmount > 0
      ) {
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
    console.error(`Error processing invoice ${saleData.invoiceNumber}:`, err.message);
    failedDetail = {
      row: index + 2,
      invoiceNumber: saleData.invoiceNumber || "Unknown",
      customerName: saleData.customerName || "Unknown",
      productName: err.message.includes("for ") ? err.message.split("for ")[1] : "N/A",
      message: err.message,
      type: err.message.includes("stock") ? "insufficient_stock" : "import_error",
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
    const { success, failedInvoice } = await processSingleInvoice(saleData, sessionId, i);

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

// ====================== ROUTES ======================

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

  try {
    const saleToDelete = await SaleSummary.findById(id);

    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }

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
      }
    }

    const deletedSale = await SaleSummary.findByIdAndDelete(id);

    res.status(200).json({
      message: "Sales record deleted successfully.",
      deletedSale,
    });
  } catch (err) {
    console.error("Error deleting sale:", err);
    res.status(500).json({ error: "Failed to delete sales record." });
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

export default router;