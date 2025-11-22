import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import paymentStatus from "../../models/paymentStatus.js";
import Product from "../../models/projectManger/product.js";
import ExcelJS from "exceljs";
import SalesReturn from "../../models/sale/saleReturn.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import Customer from "../../models/master/customer.js";

const router = express.Router();

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

// 🔧 FIXED Inventory Management Functions
const updateReportInHandAfterSale = async (productName, salesQty, bonusQty) => {
  try {
    const totalQtyToDeduct = salesQty + bonusQty;
    if (totalQtyToDeduct <= 0) {
      return 0;
    }

    const existingProduct = await ReportInHand.findOne({ productName });

    if (!existingProduct) {
      return 0;
    }

    // Determine current stock - FIXED LOGIC
    let currentStock = 0;

    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      // Sum all boxes from all batches
      currentStock = existingProduct.batches.reduce(
        (total, batch) => total + (batch.boxes || 0),
        0
      );
    } else if (existingProduct.totalBoxes !== undefined) {
      currentStock = existingProduct.totalBoxes;
    } else if (
      existingProduct.batches &&
      typeof existingProduct.batches === "object" &&
      existingProduct.batches.boxes !== undefined
    ) {
      currentStock = existingProduct.batches.boxes;
    } else if (typeof existingProduct.quantity === "number") {
      currentStock = existingProduct.quantity;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
    } else if (existingProduct.stock !== undefined) {
      currentStock = existingProduct.stock;
    } else {
      currentStock = existingProduct.boxes || 0;
    }

    if (currentStock < totalQtyToDeduct) {
      throw new Error(
        `Insufficient stock for "${productName}". Available: ${currentStock}, Required: ${totalQtyToDeduct}`
      );
    }

    const updatedStock = currentStock - totalQtyToDeduct;

    let updateFields = {};

    // FIXED: Update the correct field based on the data structure
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      // Update the first batch (FIFO) or distribute the deduction - for simplicity, updating first batch
      const updatedBatches = [...existingProduct.batches];
      if (updatedBatches[0].boxes >= totalQtyToDeduct) {
        updatedBatches[0].boxes -= totalQtyToDeduct;
      } else {
        // If first batch doesn't have enough, deduct from multiple batches
        let remainingDeduction = totalQtyToDeduct;
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
      updateFields = { batches: updatedBatches, totalBoxes: updatedStock };
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields = { totalBoxes: updatedStock };
    } else if (
      existingProduct.batches &&
      typeof existingProduct.batches === "object"
    ) {
      updateFields = { "batches.boxes": updatedStock };
    } else if (typeof existingProduct.quantity === "number") {
      updateFields = { quantity: updatedStock };
    } else if (existingProduct.currentStock !== undefined) {
      updateFields = { currentStock: updatedStock };
    } else if (existingProduct.stock !== undefined) {
      updateFields = { stock: updatedStock };
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

    // Get LC value from the product - FIXED: Get from batches if available
    let lcValue = 0;
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      lcValue = existingProduct.batches[0].lc || 0;
    } else if (
      existingProduct.batches &&
      typeof existingProduct.batches === "object"
    ) {
      lcValue = existingProduct.batches.lc || 0;
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

/* -----------------------------------------------------------
 * FIXED RESTORE AFTER SALE DELETE
 * ----------------------------------------------------------- */
const restoreReportInHandAfterSaleDeletion = async (
  productName,
  salesQty,
  bonusQty
) => {
  try {
    const totalQtyToRestore = salesQty + bonusQty;

    if (totalQtyToRestore <= 0) {
      return;
    }

    const existingProduct = await ReportInHand.findOne({ productName });

    if (!existingProduct) {
      return;
    }

    let currentStock = 0;

    // FIXED: Use the same logic as update function
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
    } else if (
      existingProduct.batches &&
      typeof existingProduct.batches === "object" &&
      existingProduct.batches.boxes !== undefined
    ) {
      currentStock = existingProduct.batches.boxes;
    } else if (typeof existingProduct.quantity === "number") {
      currentStock = existingProduct.quantity;
    } else if (existingProduct.currentStock !== undefined) {
      currentStock = existingProduct.currentStock;
    } else if (existingProduct.stock !== undefined) {
      currentStock = existingProduct.stock;
    } else {
      currentStock = existingProduct.boxes || 0;
    }

    const updatedStock = currentStock + totalQtyToRestore;

    let updateFields = {};

    // FIXED: Update the correct field based on the data structure
    if (
      existingProduct.batches &&
      Array.isArray(existingProduct.batches) &&
      existingProduct.batches.length > 0
    ) {
      // Restore to the first batch (simplified approach)
      const updatedBatches = [...existingProduct.batches];
      updatedBatches[0].boxes += totalQtyToRestore;
      updateFields = { batches: updatedBatches, totalBoxes: updatedStock };
    } else if (existingProduct.totalBoxes !== undefined) {
      updateFields = { totalBoxes: updatedStock };
    } else if (
      existingProduct.batches &&
      typeof existingProduct.batches === "object"
    ) {
      updateFields = { "batches.boxes": updatedStock };
    } else if (typeof existingProduct.quantity === "number") {
      updateFields = { quantity: updatedStock };
    } else if (existingProduct.currentStock !== undefined) {
      updateFields = { currentStock: updatedStock };
    } else if (existingProduct.stock !== undefined) {
      updateFields = { stock: updatedStock };
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
  } catch (error) {
    console.error(
      `❌ Error restoring ReportInHand for product "${productName}":`,
      error.message
    );
    throw error;
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

// 📊 ANALYTICS ENDPOINTS
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

// ... (Keep all the other endpoints exactly as they were in your original code)
// The rest of your endpoints remain unchanged - I've only fixed the inventory management functions

// ➕ SALES CRUD OPERATIONS
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

    const newSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName,
      mrId: saleData.mrId || "",
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
            product.bonusQty
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

// 📊 ANALYTICS ENDPOINTS
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

// 💰 OUTSTANDING ENDPOINTS
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

// 📈 SALES ENDPOINTS
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

// 🛒 PRODUCT-WISE SALES ENDPOINTS
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

// ➕ SALES CRUD OPERATIONS
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

    const newSaleData = {
      recordingDate: new Date(saleData.recordingDate),
      invoiceNumber: saleData.invoiceNumber,
      invoiceDate: new Date(saleData.invoiceDate),
      mrName: saleData.mrName,
      mrId: saleData.mrId || "",
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
            product.bonusQty
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
      message: `✅ Sale with ${savedSale.products.length} product(s) added successfully`,
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

router.post("/sale/import", async (req, res) => {
  try {
    const salesData = req.body;

    if (!Array.isArray(salesData) || salesData.length === 0) {
      return res.status(400).json({
        error: "Invalid data format. Expected an array of sale records.",
      });
    }

    const results = {
      total: salesData.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let i = 0; i < salesData.length; i++) {
      const saleData = salesData[i];

      try {
        if (
          !saleData.recordingDate ||
          !saleData.invoiceNumber ||
          !saleData.invoiceDate ||
          !saleData.mrName ||
          !saleData.customerName ||
          !saleData.products ||
          !Array.isArray(saleData.products)
        ) {
          throw new Error("Missing required fields or products array");
        }

        const recordingDate = parseDateString(saleData.recordingDate);
        const invoiceDate = parseDateString(saleData.invoiceDate);
        if (!recordingDate || !invoiceDate) {
          throw new Error(
            `Invalid date format. recordingDate: "${saleData.recordingDate}", invoiceDate: "${saleData.invoiceDate}"`
          );
        }

        let dueDate;
        if (saleData.dueDate) {
          dueDate = parseDateString(saleData.dueDate);
        } else {
          const creditDays = Number(saleData.creditDays) || 0;
          const currentDate = new Date();
          dueDate = new Date(currentDate);
          dueDate.setDate(currentDate.getDate() + creditDays);
        }
        if (!dueDate) throw new Error("Invalid due date format");

        const invoiceExists = await checkInvoiceNumberExists(
          saleData.invoiceNumber
        );
        if (invoiceExists) {
          throw new Error(
            `Invoice number "${saleData.invoiceNumber}" already exists`
          );
        }

        let customerId = saleData.customerId;
        if (!customerId) {
          const customer = await Customer.findOne({
            name: saleData.customerName.trim(),
          });
          if (!customer) {
            throw new Error(`Customer not found: "${saleData.name}"`);
          }
          customerId = customer._id;
        } else {
          const customerExists = await Customer.findById(customerId);
          if (!customerExists) {
            throw new Error(`Invalid customerId: ${customerId}`);
          }
        }

        const totalAmount = saleData.products.reduce((sum, p) => {
          const qty = Number(p.salesQty) || 0;
          const price = Number(p.sellingPrice) || 0;
          const discount = Number(p.discount) || 0;
          return sum + qty * price - discount;
        }, 0);

        const paidAmount = Number(saleData.paidAmount) || 0;
        const dueAmount = totalAmount - paidAmount;

        const newSaleData = {
          recordingDate,
          invoiceNumber: saleData.invoiceNumber,
          invoiceDate,
          mrName: saleData.mrName,
          customerName: saleData.customerName,
          customerId,
          creditDays: Number(saleData.creditDays) || 0,
          paidAmount,
          dueAmount,
          totalAmount,
          dueDate,
          paymentStatus: saleData.paymentStatus || "Credit",
          remark: saleData.remarks || "",
          products: [],
        };

        for (const product of saleData.products) {
          const salesQty = Number(product.salesQty) || 0;
          const bonusQty = Number(product.bonusQty) || 0;
          const totalQty = salesQty + bonusQty;
          const sellingPrice = Number(product.sellingPrice) || 0;
          const discount = Number(product.discount) || 0;
          const amount = salesQty * sellingPrice;
          const netSellingAmount = amount - discount;

          const lcValue = await updateReportInHandAfterSale(
            product.productName,
            salesQty,
            bonusQty
          );

          const profitLoss = netSellingAmount - totalQty * lcValue;

          newSaleData.products.push({
            productName: product.productName,
            salesQty,
            bonusQty,
            totalQty,
            sellingPrice,
            amount,
            discount,
            netSellingAmount,
            averageUnitPrice: sellingPrice,
            lc: lcValue,
            profitLoss,
            isProductAccept: true,
          });
        }

        await SaleSummary.create(newSaleData);
        results.success++;
      } catch (error) {
        console.error(`Failed to import sale at index ${i}:`, error.message);
        results.failed++;
        results.errors.push({
          index: i,
          invoiceNumber: saleData.invoiceNumber || "N/A",
          error: error.message,
        });
      }
    }

    const detailedErrors = results.errors.map(
      (e) => `Invoice ${e.invoiceNumber}: ${e.error}`
    );

    res.status(200).json({
      success: results.failed === 0,
      message:
        detailedErrors.length > 0
          ? detailedErrors.join("<br>")
          : "All imported successfully",
      results,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/sales/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const originalSale = await SaleSummary.findById(id);
    if (!originalSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

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

    for (const product of originalSale.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        await restoreReportInHandAfterSaleDeletion(
          product.productName,
          product.salesQty,
          product.bonusQty
        );
      }
    }

    const updatedSale = await SaleSummary.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedSale) {
      return res.status(404).json({ error: "Sales record not found." });
    }

    for (const product of updatedSale.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        const lcValue = await updateReportInHandAfterSale(
          product.productName,
          product.salesQty,
          product.bonusQty
        );

        product.lc = lcValue;
        product.profitLoss =
          product.netSellingAmount - product.totalQty * lcValue;
      }
    }

    await updatedSale.save();

    res.status(200).json(updatedSale);
  } catch (err) {
    console.error("Error updating sale:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        error: `Invoice number "${req.body.invoiceNumber}" already exists. Please use a different invoice number.`,
      });
    }

    res.status(500).json({ error: "Failed to update sales record." });
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

    for (const product of saleToDelete.products) {
      if (product.salesQty > 0 || product.bonusQty > 0) {
        await restoreReportInHandAfterSaleDeletion(
          product.productName,
          product.salesQty,
          product.bonusQty
        );
      }
    }

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

// 📥 EXPORT ENDPOINTS
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

// 🔧 UTILITY ENDPOINTS
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

export default router;
