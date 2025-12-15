import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();



const parseDateString = (dateStr) => {
  if (!dateStr) return null;

  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate)) return isoDate;

  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const formatted = new Date(`${year}-${month}-${day}`);
    if (!isNaN(formatted)) return formatted;
  }

  return null;
};

// 🔥 REMOVED MR ID - Updated import function
async function processImportInBatches(sales, batchSize) {
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < sales.length; i += batchSize) {
    const batch = sales.slice(i, i + batchSize);

    for (let j = 0; j < batch.length; j++) {
      const sale = { ...batch[j] };

      try {
        // 🔥 REMOVED MR ID COMPLETELY - No need to delete as it won't exist
        const doc = new SaleSummary(sale);
        await doc.save();

        results.success++;
      } catch (error) {
        console.error("❌ Save failed:", sale.invoiceNumber, error.message);

        results.failed++;
        results.errors.push({
          invoiceNumber: sale.invoiceNumber,
          error: error.message,
        });
      }
    }
  }

  return results;
}

// 🔥 OPTIMIZED BATCH PROCESSING FOR LARGE DATASETS
const processImportBatch = async (batch, batchIndex) => {
  const batchResults = {
    success: 0,
    failed: 0,
    errors: [],
    inventoryUpdates: [],
  };

  // Pre-fetch all unique product names for batch
  const allProductNames = [
    ...new Set(
      batch.flatMap((sale) => sale.products.map((p) => p.productName))
    ),
  ];

  // Bulk fetch stock data for all products
  const stockData = await ReportInHand.find({
    productName: {
      $in: allProductNames.map((name) => new RegExp(`^${name}$`, "i")),
    },
  }).lean();

  // Create stock lookup map
  const stockMap = new Map();
  stockData.forEach((item) => {
    const key = item.productName.toLowerCase().trim();
    let currentStock = 0;

    if (item.batches && Array.isArray(item.batches)) {
      currentStock = item.batches.reduce(
        (total, batch) => total + (batch.boxes || 0),
        0
      );
    } else if (item.totalBoxes !== undefined) {
      currentStock = item.totalBoxes;
    } else if (item.currentStock !== undefined) {
      currentStock = item.currentStock;
    } else {
      currentStock = item.boxes || 0;
    }

    stockMap.set(key, {
      productName: item.productName,
      stock: currentStock,
      lcValue: item.batches?.[0]?.lc || item.lc || 0,
    });
  });

  // Process batch in parallel
  const promises = batch.map(async (saleData, index) => {
    const globalIndex = batchIndex + index;

    try {
      // Quick validation
      if (!saleData.invoiceNumber || saleData.invoiceNumber.trim() === "") {
        throw new Error("Invoice number is missing");
      }

      if (!Array.isArray(saleData.products) || saleData.products.length === 0) {
        throw new Error("No products found");
      }

      // Check duplicate invoice number
      const exists = await SaleSummary.findOne({
        invoiceNumber: saleData.invoiceNumber,
      });
      if (exists) {
        throw new Error(`Invoice number already exists`);
      }

      // Validate stock for all products in this invoice
      const productUpdates = [];
      for (const product of saleData.products) {
        const totalQty =
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);

        if (totalQty > 0) {
          const productKey = product.productName.toLowerCase().trim();
          let stockInfo = stockMap.get(productKey);

          // Try partial match if exact match not found
          if (!stockInfo) {
            for (const [key, value] of stockMap.entries()) {
              if (key.includes(productKey) || productKey.includes(key)) {
                stockInfo = value;
                break;
              }
            }
          }

          if (!stockInfo) {
            throw new Error(
              `Product "${product.productName}" not found in inventory`
            );
          }

          if (stockInfo.stock < totalQty) {
            throw new Error(
              `Insufficient stock for ${product.productName}: Available ${stockInfo.stock}, Required ${totalQty}`
            );
          }

          productUpdates.push({
            productName: stockInfo.productName,
            totalQty,
            lcValue: stockInfo.lcValue,
          });
        }
      }

      // 🔥 CRITICAL FIX: Update inventory BEFORE saving the sale
      for (const update of productUpdates) {
        try {
          await updateReportInHandAfterSale(
            update.productName,
            update.totalQty,
            0,
            false
          );

          batchResults.inventoryUpdates.push({
            invoiceNumber: saleData.invoiceNumber,
            productName: update.productName,
            qty: update.totalQty,
            status: "deducted",
          });
        } catch (inventoryError) {
          throw new Error(
            `Inventory update failed for ${update.productName}: ${inventoryError.message}`
          );
        }
      }

      // 🔥 FIXED: Use parseDateString function to parse dates
      const newSale = new SaleSummary({
        recordingDate: parseDateString(saleData.recordingDate) || new Date(),
        invoiceNumber: saleData.invoiceNumber,
        invoiceDate: parseDateString(saleData.invoiceDate) || new Date(),
        mrName: saleData.mrName || "",
        // 🔥 NO MR ID FIELD - Completely removed
        customerName: saleData.customerName || "",
        customerCode: saleData.customerCode || "",
        customerId: saleData.customerId || null,
        products: saleData.products.map((p) => ({
          productName: p.productName,
          salesQty: Number(p.salesQty),
          bonusQty: Number(p.bonusQty) || 0,
          totalQty: Number(p.totalQty),
          sellingPrice: Number(p.sellingPrice),
          amount: Number(p.amount),
          discount: Number(p.discount) || 0,
          netSellingAmount: Number(p.netSellingAmount),
          averageUnitPrice: Number(p.averageUnitPrice),
          lc: Number(p.lc) || 0,
          profitLoss: Number(p.profitLoss) || 0,
          isProductAccept:
            p.isProductAccept !== undefined ? p.isProductAccept : true,
        })),
        creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
        dueDate: saleData.dueDate ? parseDateString(saleData.dueDate) : null,
        deliveryDate: parseDateString(saleData.deliveryDate) || new Date(),
        paidAmount: Number(saleData.paidAmount) || 0,
        dueAmount: Number(saleData.dueAmount) || 0,
        totalAmount: Number(saleData.totalAmount) || 0,
        paymentStatus: saleData.paymentStatus || "Credit",
        remark: saleData.remark || "",
        importBatchId: batchIndex,
        importStatus: "imported",
      });

      await newSale.save();
      batchResults.success++;
    } catch (error) {
      console.error(
        `❌ Save failed for invoice ${saleData.invoiceNumber}:`,
        error.message
      );

      batchResults.failed++;
      batchResults.errors.push({
        index: globalIndex,
        invoiceNumber: saleData.invoiceNumber || `Invoice-${globalIndex}`,
        error: error.message,
      });
    }
  });

  await Promise.allSettled(promises);
  return batchResults;
};

// 🔥 BULK INVENTORY UPDATE FOR PERFORMANCE
async function updateInventoryInBulk(inventoryUpdates) {
  try {
    const productUpdates = new Map();

    inventoryUpdates.forEach((update) => {
      const key = update.productName.toLowerCase();
      if (!productUpdates.has(key)) {
        productUpdates.set(key, {
          productName: update.productName,
          totalQty: 0,
        });
      }
      productUpdates.get(key).totalQty += update.qty;
    });

    for (const [_, update] of productUpdates) {
      await updateReportInHandAfterSale(
        update.productName,
        update.totalQty,
        0,
        false
      );
    }
  } catch (error) {
    console.error("❌ Bulk inventory update failed:", error.message);
    throw error;
  }
}

// 🔥 CORRECTED INVENTORY UPDATE FUNCTION
const updateReportInHandAfterSale = async (
  productName,
  salesQty,
  bonusQty,
  isRestore = false
) => {
  try {
    const totalQtyToUpdate = salesQty + bonusQty;
    if (totalQtyToUpdate <= 0) {
      return 0;
    }

    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (!existingProduct) {
      throw new Error(`Product "${productName}" not found in inventory.`);
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
    if (isRestore) {
      updatedStock = currentStock + totalQtyToUpdate;
    } else {
      if (currentStock < totalQtyToUpdate) {
        throw new Error(
          `Insufficient stock for "${existingProduct.productName}". Available: ${currentStock}, Required: ${totalQtyToUpdate}`
        );
      }
      updatedStock = currentStock - totalQtyToUpdate;
    }

    let updateFields = {};
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      const updatedBatches = [...existingProduct.batches];

      if (updatedBatches[0].boxes !== undefined) {
        if (isRestore) {
          updatedBatches[0].boxes += totalQtyToUpdate;
        } else {
          let remainingDeduction = totalQtyToUpdate;
          for (
            let i = 0;
            i < updatedBatches.length && remainingDeduction > 0;
            i++
          ) {
            if (updatedBatches[i].boxes >= remainingDeduction) {
              updatedBatches[i].boxes -= remainingDeduction;
              remainingDeduction = 0;
            } else {
              remainingDeduction -= updatedBatches[i].boxes;
              updatedBatches[i].boxes = 0;
            }
          }
        }
      }

      updateFields = { batches: updatedBatches };

      if (existingProduct.totalBoxes !== undefined) {
        updateFields.totalBoxes = updatedStock;
      }
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields = { totalBoxes: updatedStock };
    } else if (existingProduct.currentStock !== undefined) {
      updateFields = { currentStock: updatedStock };
    } else {
      updateFields = { boxes: updatedStock };
    }

    let updatedStatus = "In Stock";
    if (updatedStock === 0) updatedStatus = "Out of Stock";
    else if (updatedStock < 5) updatedStatus = "Critical";
    else if (updatedStock < 15) updatedStatus = "Low Stock";

    updateFields.status = updatedStatus;

    await ReportInHand.findByIdAndUpdate(existingProduct._id, {
      $set: updateFields,
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
      `❌ Error updating ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

// 🔥 CORRECTED DELETE RESTORE FUNCTION
const restoreReportInHandAfterSaleDeletion = async (
  productName,
  salesQty,
  bonusQty
) => {
  try {
    await updateReportInHandAfterSale(productName, salesQty, bonusQty, true);
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
  }
};

const excelDateToJSDate = (serial) => {
  if (typeof serial === "number") {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }

  const parsed = new Date(serial);
  return !isNaN(parsed) ? parsed : null;
};

const formatDateToReadable = (isoString) => {
  if (!isoString) return "";

  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const getDateRanges = () => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  return { today, monthStart, yearStart, now };
};

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

// 🔥 OPTIMIZED STOCK CHECK WITH BULK OPERATIONS
const checkStockAvailability = async (productName, requiredQty) => {
  try {
    const existingProduct = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    });

    if (!existingProduct) {
      const altProducts = await ReportInHand.find({
        productName: { $regex: productName, $options: "i" },
      });

      if (altProducts.length === 0) {
        return {
          available: 0,
          required: requiredQty,
          isAvailable: false,
          message: `Product "${productName}" not found in inventory.`,
        };
      }

      const matchedProduct = altProducts[0];

      let currentStock = 0;
      if (
        matchedProduct.batches &&
        Array.isArray(matchedProduct.batches) &&
        matchedProduct.batches.length > 0
      ) {
        currentStock = matchedProduct.batches.reduce(
          (total, batch) => total + (batch.boxes || 0),
          0
        );
      } else if (matchedProduct.totalBoxes !== undefined) {
        currentStock = matchedProduct.totalBoxes;
      } else if (matchedProduct.currentStock !== undefined) {
        currentStock = matchedProduct.currentStock;
      } else {
        currentStock = matchedProduct.boxes || 0;
      }

      const isAvailable = currentStock >= requiredQty;

      return {
        available: currentStock,
        required: requiredQty,
        isAvailable,
        message: isAvailable
          ? `Sufficient stock for "${matchedProduct.productName}"`
          : `Insufficient stock for "${matchedProduct.productName}". Available: ${currentStock}, Required: ${requiredQty}`,
        actualProductName: matchedProduct.productName,
        lcValue:
          matchedProduct.batches &&
          Array.isArray(matchedProduct.batches) &&
          matchedProduct.batches.length > 0
            ? matchedProduct.batches[0].lc || 0
            : matchedProduct.batches &&
              typeof matchedProduct.batches === "object"
            ? matchedProduct.batches.lc || 0
            : matchedProduct.lc || 0,
      };
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

    const isAvailable = currentStock >= requiredQty;

    return {
      available: currentStock,
      required: requiredQty,
      isAvailable,
      message: isAvailable
        ? `Sufficient stock for "${productName}"`
        : `Insufficient stock for "${productName}". Available: ${currentStock}, Required: ${requiredQty}`,
      lcValue:
        existingProduct.batches &&
        Array.isArray(existingProduct.batches) &&
        existingProduct.batches.length > 0
          ? existingProduct.batches[0].lc || 0
          : existingProduct.batches &&
            typeof existingProduct.batches === "object"
          ? existingProduct.batches.lc || 0
          : existingProduct.lc || 0,
    };
  } catch (error) {
    console.error(
      `❌ Error checking stock for product "${productName}":`,
      error.message
    );
    return {
      available: 0,
      required: requiredQty,
      isAvailable: false,
      message: `Error checking stock for "${productName}": ${error.message}`,
    };
  }
};

const checkInvoiceNumberExists = async (invoiceNumber, excludeId = null) => {
  const query = { invoiceNumber: invoiceNumber };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const existingSale = await SaleSummary.findOne(query);
  return !!existingSale;
};

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
    const { today, now } = getDateRanges();

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
    const { monthStart, now } = getDateRanges();

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
    const { yearStart, now } = getDateRanges();

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
          // 🔥 NO MR ID FIELD
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
          // 🔥 NO MR ID FIELD
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
            // 🔥 NO MR ID FIELD
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
          // 🔥 NO MR ID FIELD
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

// ============================================================================
// ➕ SALES CRUD OPERATIONS
// ============================================================================

router.post("/sales", async (req, res) => {
  try {
    const saleData = req.body;

    if (!saleData || typeof saleData !== "object") {
      return res.status(400).json({ error: "Invalid or missing request body" });
    }

    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "products",
    ];

    const missingFields = requiredFields.filter(
      (field) =>
        saleData[field] === undefined ||
        saleData[field] === null ||
        saleData[field] === ""
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (!Array.isArray(saleData.products) || saleData.products.length === 0) {
      return res
        .status(400)
        .json({ error: "Products array is missing or empty" });
    }

    const invoiceExists = await checkInvoiceNumberExists(
      saleData.invoiceNumber
    );
    if (invoiceExists) {
      return res.status(400).json({
        error: `Invoice number "${saleData.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    let customerName = saleData.customerName;
    if ((!customerName || customerName.trim() === "") && saleData.customerId) {
      const customer = await Customer.findById(saleData.customerId).select(
        "name"
      );
      if (customer) {
        customerName = customer.name;
      } else {
        return res.status(400).json({
          error: `Customer not found for ID: ${saleData.customerId}`,
        });
      }
    }

    if (!customerName) {
      return res.status(400).json({
        error: "Missing customerName and no valid customerId provided",
      });
    }

    const totalAmount = saleData.products.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );

    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;

    // 🔥 CREATING SALE WITHOUT MR ID
    const newSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName,
      // 🔥 NO MR ID FIELD - Completely removed
      customerName,
      customerCode: saleData.customerCode,
      customerId: saleData.customerId || "",
      products: saleData.products.map((product) => ({
        productName: product.productName,
        salesQty: Number(product.salesQty),
        bonusQty: Number(product.bonusQty) || 0,
        totalQty: Number(product.totalQty),
        sellingPrice: Number(product.sellingPrice),
        amount: Number(product.amount),
        discount: Number(product.discount) || 0,
        netSellingAmount: Number(product.netSellingAmount),
        averageUnitPrice: Number(product.averageUnitPrice),
        lc: Number(product.lc) || 0,
        profitLoss: Number(product.profitLoss) || 0,
        isProductAccept:
          product.isProductAccept !== undefined
            ? product.isProductAccept
            : true,
      })),
      creditDays: saleData.creditDays ? Number(saleData.creditDays) : 0,
      dueDate: saleData.dueDate ? new Date(saleData.dueDate) : null,
      deliveryDate: saleData.deliveryDate
        ? new Date(saleData.deliveryDate)
        : null,
      paidAmount,
      dueAmount,
      totalAmount,
      paymentStatus: saleData.paymentStatus || "Credit",
      remark: saleData.remark || saleData.remarks || "",
    };

    const inventoryUpdates = [];
    for (const product of newSaleData.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        try {
          const lcValue = await updateReportInHandAfterSale(
            product.productName,
            product.salesQty,
            product.bonusQty,
            false
          );

          product.lc = lcValue;
          product.profitLoss =
            product.netSellingAmount - product.totalQty * lcValue;

          inventoryUpdates.push({
            productName: product.productName,
            status: "success",
            deducted: product.salesQty + product.bonusQty,
            lc: lcValue,
          });
        } catch (error) {
          return res.status(400).json({
            error: `Inventory update failed for ${product.productName}: ${error.message}`,
          });
        }
      }
    }

    const savedSale = await SaleSummary.create(newSaleData);

    res.status(201).json({
      message: `Sale with ${savedSale.products.length} product(s) added successfully`,
      sale: savedSale,
      inventoryUpdates,
    });
  } catch (error) {
    console.error("❌ Sale creation error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists.`,
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: "Failed to add new sale" });
  }
});

// 🔥 OPTIMIZED IMPORT ENDPOINT FOR LARGE DATASETS
router.post("/sales/import", async (req, res) => {
  const startTime = Date.now();
  const batchSize = 100;

  try {
    const salesData = req.body;

    if (!Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No data to import",
      });
    }

    console.log(`📊 Starting import of ${salesData.length} invoices...`);

    // Step 1: Collect all unique invoice numbers for duplicate check
    const invoiceNumbers = salesData
      .map((sale) => sale.invoiceNumber)
      .filter(Boolean);
    const uniqueInvoiceNumbers = [...new Set(invoiceNumbers)];

    console.log(`📊 Unique invoice numbers: ${uniqueInvoiceNumbers.length}`);

    // Bulk check for existing invoices
    const existingInvoices = await SaleSummary.find({
      invoiceNumber: { $in: uniqueInvoiceNumbers },
    })
      .select("invoiceNumber")
      .lean();

    const existingInvoiceSet = new Set(
      existingInvoices.map((inv) => inv.invoiceNumber)
    );

    console.log(`📊 Found ${existingInvoiceSet.size} existing invoices`);

    // Step 2: Collect all product names for stock validation
    const allProductNames = [
      ...new Set(
        salesData.flatMap((sale) =>
          (sale.products || []).map((p) => p.productName).filter(Boolean)
        )
      ),
    ];

    console.log(`📊 Unique product names: ${allProductNames.length}`);

    // Bulk fetch stock data
    const stockData = await ReportInHand.find({
      productName: {
        $in: allProductNames.map((name) => new RegExp(`^${name}$`, "i")),
      },
    }).lean();

    console.log(`📊 Stock data fetched: ${stockData.length} products`);

    // Create stock lookup map with case-insensitive keys
    const stockMap = new Map();
    stockData.forEach((item) => {
      const key = item.productName.toLowerCase().trim();
      let currentStock = 0;

      if (item.batches && Array.isArray(item.batches)) {
        currentStock = item.batches.reduce(
          (total, batch) => total + (batch.boxes || 0),
          0
        );
      } else if (item.totalBoxes !== undefined) {
        currentStock = item.totalBoxes;
      } else if (item.currentStock !== undefined) {
        currentStock = item.currentStock;
      } else {
        currentStock = item.boxes || 0;
      }

      stockMap.set(key, {
        productName: item.productName,
        stock: currentStock,
        lcValue: item.batches?.[0]?.lc || item.lc || 0,
      });
    });

    // Step 3: Process all invoices with validation
    const validationErrors = [];
    const stockErrors = [];
    const validForImport = [];

    salesData.forEach((sale, index) => {
      const errors = [];

      // Basic validation
      if (!sale.invoiceNumber || sale.invoiceNumber.trim() === "") {
        errors.push("Invoice number is required");
      }

      if (!Array.isArray(sale.products) || sale.products.length === 0) {
        errors.push("Products array is required");
      }

      // Check for duplicate in import file
      const firstOccurrenceIndex = invoiceNumbers.indexOf(sale.invoiceNumber);
      if (firstOccurrenceIndex !== index) {
        errors.push("Duplicate invoice number in import file");
      }

      // Check against existing invoices
      if (existingInvoiceSet.has(sale.invoiceNumber)) {
        errors.push("Invoice number already exists in database");
      }

      // Product validation
      if (Array.isArray(sale.products)) {
        sale.products.forEach((product, pIndex) => {
          if (!product.productName || product.productName.trim() === "") {
            errors.push(`Product ${pIndex + 1}: Product name required`);
          }

          const salesQty = Number(product.salesQty);
          if (isNaN(salesQty) || salesQty < 0) {
            errors.push(`Product ${pIndex + 1}: Valid sales quantity required`);
          }

          const sellingPrice = Number(product.sellingPrice);
          if (isNaN(sellingPrice) || sellingPrice < 0) {
            errors.push(`Product ${pIndex + 1}: Valid selling price required`);
          }
        });
      }

      if (errors.length) {
        validationErrors.push({
          index,
          invoiceNumber: sale.invoiceNumber || `Row-${index + 1}`,
          errors,
        });
        return;
      }

      // Stock validation
      const saleStockErrors = [];
      let hasStockErrors = false;

      if (Array.isArray(sale.products)) {
        sale.products.forEach((product) => {
          const totalQty =
            (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);

          if (totalQty > 0) {
            const productKey = product.productName.toLowerCase().trim();
            const stockInfo = stockMap.get(productKey);

            if (!stockInfo) {
              // Try partial match
              let foundProduct = null;
              for (const [key, value] of stockMap.entries()) {
                if (key.includes(productKey) || productKey.includes(key)) {
                  foundProduct = value;
                  break;
                }
              }

              if (!foundProduct) {
                saleStockErrors.push({
                  productName: product.productName,
                  required: totalQty,
                  available: 0,
                  message: `Product "${product.productName}" not found in inventory`,
                });
                hasStockErrors = true;
              } else if (foundProduct.stock < totalQty) {
                saleStockErrors.push({
                  productName: product.productName,
                  required: totalQty,
                  available: foundProduct.stock,
                  message: `Insufficient stock for "${product.productName}". Required: ${totalQty}, Available: ${foundProduct.stock}`,
                });
                hasStockErrors = true;
              }
            } else if (stockInfo.stock < totalQty) {
              saleStockErrors.push({
                productName: product.productName,
                required: totalQty,
                available: stockInfo.stock,
                message: `Insufficient stock for "${product.productName}". Required: ${totalQty}, Available: ${stockInfo.stock}`,
              });
              hasStockErrors = true;
            }
          }
        });
      }

      if (hasStockErrors) {
        stockErrors.push({
          invoiceNumber: sale.invoiceNumber,
          errors: saleStockErrors,
        });
        return;
      }

      // Prepare validated sale
      const validatedProducts = (sale.products || []).map((product) => {
        const totalQty =
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);
        const productKey = product.productName.toLowerCase().trim();
        let stockInfo = stockMap.get(productKey);

        // If exact match not found, try partial match
        if (!stockInfo) {
          for (const [key, value] of stockMap.entries()) {
            if (key.includes(productKey) || productKey.includes(key)) {
              stockInfo = value;
              break;
            }
          }
        }

        const sellingPrice = Number(product.sellingPrice) || 0;
        const salesQty = Number(product.salesQty) || 0;
        const discount = Number(product.discount) || 0;
        const amount = Number(product.amount) || sellingPrice * salesQty;
        const netSellingAmount = amount - discount;
        const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
        const lcValue = Number(product.lc) || stockInfo?.lcValue || 0;
        const profitLoss = netSellingAmount - totalQty * lcValue;

        return {
          productName: stockInfo?.productName || product.productName,
          salesQty: salesQty,
          bonusQty: Number(product.bonusQty) || 0,
          totalQty: totalQty,
          sellingPrice: sellingPrice,
          amount: amount,
          discount: discount,
          netSellingAmount: netSellingAmount,
          averageUnitPrice: averageUnitPrice,
          lc: lcValue,
          profitLoss: profitLoss,
          isProductAccept:
            product.isProductAccept !== undefined
              ? product.isProductAccept
              : true,
        };
      });

      const totalAmount = validatedProducts.reduce(
        (sum, p) => sum + (p.netSellingAmount || 0),
        0
      );
      const paidAmount = Number(sale.paidAmount) || 0;

      // 🔥 FIXED: Use parseDateString function for date parsing
      const recordingDate = parseDateString(sale.recordingDate) || new Date();
      const invoiceDate = parseDateString(sale.invoiceDate) || recordingDate;
      const dueDate =
        parseDateString(sale.dueDate) ||
        (sale.creditDays
          ? new Date(
              invoiceDate.getTime() + sale.creditDays * 24 * 60 * 60 * 1000
            )
          : null);
      const deliveryDate = parseDateString(sale.deliveryDate) || invoiceDate;

      // 🔥 FIXED PAYMENT STATUS LOGIC
      const getPaymentStatus = (status) => {
        if (!status) return "Credit";

        const statusLower = String(status).toLowerCase().trim();

        if (statusLower === "pending") return "Credit";
        if (statusLower === "paid") return "Cash";
        if (statusLower === "cash") return "Cash";
        if (statusLower === "credit") return "Credit";
        if (statusLower === "partial paid") return "Partial Paid";

        return "Credit";
      };

      // 🔥 FIX: Handle empty customerId properly
      let customerId = sale.customerId;
      if (!customerId || customerId.trim() === "") {
        customerId = null;
      }

      const cleanedSale = {
        recordingDate: recordingDate,
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: invoiceDate,
        mrName: sale.mrName || "",
        // 🔥 NO MR ID FIELD - Completely removed
        customerName: sale.customerName || "",
        customerCode: sale.customerCode || "",
        customerId: customerId,
        products: validatedProducts,
        creditDays: Number(sale.creditDays) || 0,
        dueDate: dueDate,
        deliveryDate: deliveryDate,
        paidAmount: paidAmount,
        dueAmount: totalAmount - paidAmount,
        totalAmount: totalAmount,
        paymentStatus: getPaymentStatus(sale.paymentStatus),
        remark: sale.remark || "",
      };

      validForImport.push(cleanedSale);
    });

    console.log(`📊 Valid for import: ${validForImport.length} invoices`);
    console.log(`📊 Validation errors: ${validationErrors.length}`);
    console.log(`📊 Stock errors: ${stockErrors.length}`);

    if (!validForImport.length) {
      return res.status(400).json({
        success: false,
        message: "No valid invoices to import",
        validationErrors: validationErrors.slice(0, 20),
        stockErrors: stockErrors.slice(0, 20),
        totalReceived: salesData.length,
        validCount: 0,
      });
    }

    // Step 4: Import in batches using the optimized function
    console.log(
      `📊 Starting batch import of ${validForImport.length} invoices...`
    );

    let totalSuccess = 0;
    let totalFailed = 0;
    const allErrors = [];

    // Process in batches with progress tracking
    const totalBatches = Math.ceil(validForImport.length / batchSize);

    for (let i = 0; i < validForImport.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const batch = validForImport.slice(i, i + batchSize);

      const progress = Math.min(
        Math.round((i / validForImport.length) * 100),
        95
      );
      console.log(
        `📊 Processing batch ${batchNumber} of ${totalBatches} (${progress}%)`
      );

      try {
        const batchResults = await processImportBatch(batch, i);

        totalSuccess += batchResults.success;
        totalFailed += batchResults.failed;
        allErrors.push(...batchResults.errors);

        const currentProgress = Math.min(
          Math.round(((i + batchSize) / validForImport.length) * 100),
          95
        );

        console.log(
          `📊 Batch ${batchNumber}: ${batchResults.success} success, ${batchResults.failed} failed (${currentProgress}%)`
        );
      } catch (batchError) {
        console.error(`❌ Batch ${batchNumber} failed:`, batchError);
        totalFailed += batch.length;
        batch.forEach((sale, index) => {
          allErrors.push({
            index: i + index,
            invoiceNumber: sale.invoiceNumber,
            error: batchError.message,
          });
        });
      }
    }

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    const response = {
      success: true,
      message: `Import completed in ${processingTime}s`,
      summary: {
        totalReceived: salesData.length,
        successfullyImported: totalSuccess,
        failed: totalFailed + validationErrors.length + stockErrors.length,
        validationErrors: validationErrors.length,
        stockErrors: stockErrors.length,
        processingTimeSeconds: processingTime,
      },
    };

    // Add detailed errors if any
    if (
      allErrors.length > 0 ||
      validationErrors.length > 0 ||
      stockErrors.length > 0
    ) {
      response.detailedErrors = {
        importErrors: allErrors.slice(0, 50),
        validationErrors: validationErrors.slice(0, 20),
        stockErrors: stockErrors.slice(0, 20),
      };
    }

    console.log(
      `✅ Import completed: ${totalSuccess} invoices imported successfully`
    );
    console.log(`❌ Failed: ${totalFailed} invoices failed`);

    res.status(200).json(response);
  } catch (error) {
    console.error("🔥 CRITICAL ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error during import",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// 🔥 CORRECTED EDIT/UPDATE ENDPOINT
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

    // 🔥 CRITICAL FIX: Restore original inventory first
    for (const product of originalSale.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        try {
          // Restore the original quantities
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty
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

    // Validate and calculate LC/profit for new products
    const updatedProducts = await Promise.all(
      saleData.products.map(async (product) => {
        const totalQty =
          (Number(product.salesQty) || 0) + (Number(product.bonusQty) || 0);

        // Check stock availability for the new quantities
        if (totalQty > 0) {
          try {
            // This will deduct the new quantities from inventory
            const lcValue = await updateReportInHandAfterSale(
              product.productName,
              Number(product.salesQty),
              Number(product.bonusQty),
              false
            );

            return {
              productName: product.productName,
              salesQty: Number(product.salesQty),
              bonusQty: Number(product.bonusQty) || 0,
              totalQty: totalQty,
              sellingPrice: Number(product.sellingPrice),
              amount: Number(product.amount),
              discount: Number(product.discount) || 0,
              netSellingAmount: Number(product.netSellingAmount),
              averageUnitPrice: Number(product.averageUnitPrice),
              lc: lcValue,
              profitLoss: Number(product.netSellingAmount) - totalQty * lcValue,
              isProductAccept:
                product.isProductAccept !== undefined
                  ? product.isProductAccept
                  : true,
            };
          } catch (inventoryError) {
            throw new Error(
              `Insufficient stock for ${product.productName}: ${inventoryError.message}`
            );
          }
        }

        return {
          ...product,
          lc: Number(product.lc) || 0,
          profitLoss: Number(product.profitLoss) || 0,
        };
      })
    );

    // Calculate totals
    const totalAmount = updatedProducts.reduce(
      (total, product) => total + (parseFloat(product.netSellingAmount) || 0),
      0
    );
    const paidAmount = parseFloat(saleData.paidAmount) || 0;
    const dueAmount = totalAmount - paidAmount;

    // Prepare the updated sale document
    const updatedSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName,
      // 🔥 NO MR ID FIELD
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
      paymentStatus: saleData.paymentStatus || "Credit",
      remark: saleData.remark || saleData.remarks || "",
      updatedAt: new Date(),
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

    res.status(200).json({
      message: "Sale updated successfully with inventory adjustments",
      sale: updatedSale,
    });
  } catch (err) {
    console.error("Error updating sale:", err);

    // 🔥 IMPORTANT: If update fails, try to restore the original inventory state
    try {
      const originalSale = await SaleSummary.findById(id);
      if (originalSale) {
        for (const product of originalSale.products) {
          if (product.salesQty > 0 || product.bonusQty > 0) {
            // Re-deduct what we restored earlier (since the update failed)
            await updateReportInHandAfterSale(
              product.productName,
              product.salesQty,
              product.bonusQty,
              false
            );
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
        // 🔥 NO MR ID FIELD
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
        // 🔥 NO MR ID FIELD
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

// 🔥 CORRECTED DELETE ENDPOINT
router.delete("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const saleToDelete = await SaleSummary.findById(id);

    if (!saleToDelete) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    // Restore inventory for all products in the sale
    for (const product of saleToDelete.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        try {
          await restoreReportInHandAfterSaleDeletion(
            product.productName,
            product.salesQty,
            product.bonusQty
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

    worksheet.mergeCells("A1:AC1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "HEALTHCARE SOUTH EAST ASIA";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 25;

    worksheet.mergeCells("A2:AC2");
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

// ============================================================================
// 🔧 UTILITY ENDPOINTS
// ============================================================================

router.get("/sales/payment-status", async (req, res) => {
  try {
    const statuses = await paymentStatus.find().sort({ type: 1 });
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

// 🔥 CORRECTED BATCH DELETE ENDPOINT
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
            if (product.salesQty > 0 || product.bonusQty > 0) {
              await restoreReportInHandAfterSaleDeletion(
                product.productName,
                product.salesQty,
                product.bonusQty
              );
            }
          }

          // Delete the sale
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
        const existingProduct = await ReportInHand.findOne({
          productName: { $regex: new RegExp(`^${product.productName}$`, "i") },
        });

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
        };
      })
    );

    res.json({
      saleId: id,
      invoiceNumber: sale.invoiceNumber,
      inventoryChecks,
    });
  } catch (error) {
    console.error("Inventory check error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
