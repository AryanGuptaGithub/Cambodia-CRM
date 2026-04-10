import express from "express";
import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Helper: parse UTC date (start of day)
const parseUTCDate = (dateStr) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

// Helper: build invoiceDate filter from startDate/endDate (YYYY-MM-DD)
const buildInvoiceDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) {
    filter.$gte = parseUTCDate(startDate);
  }
  if (endDate) {
    const end = parseUTCDate(endDate);
    end.setUTCHours(23, 59, 59, 999);
    filter.$lte = end;
  }
  return Object.keys(filter).length ? { invoiceDate: filter } : {};
};

// Get sales summary for the frontend component
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = buildInvoiceDateFilter(startDate, endDate);
    const query = dateFilter;

    console.log('values of query', query);
    const allSalesInvoices = await SaleSummary.find(query).sort({
      invoiceDate: -1,
    });
     console.log('valueso f allSalesInvoices', allSalesInvoices);
    const processedData = allSalesInvoices.map((invoice) => {
      const products = (invoice.products || []).map((product) => {
        const salesQty =
          product.quantity || product.salesQty || product.qty || 0;
        const bonusQty = product.bonusQty || product.bonusQuantity || 0;
        const totalPrice =
          product.totalPrice || product.amount || product.netSellingAmount || 0;
        const profit = product.profit || product.profitLoss || 0;
        const sellingPrice = product.sellingPrice || 0;
        const costPrice = product.costPrice || 0;
        const productName = product.productName || "Unknown Product";

        return {
          productId: product.productId || product._id,
          productName,
          normalizedProductName: productName.toLowerCase().trim(),
          salesQty,
          bonusQty,
          totalQty: salesQty + bonusQty,
          sellingPrice,
          totalPrice,
          netSellingAmount: totalPrice,
          profitLoss: profit,
          costPrice,
        };
      });

      return {
        _id: invoice._id,
        recordingDate: invoice.recordingDate,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.customerName || "Walk-in Customer",
        invoiceNo: invoice.invoiceNumber || invoice.invoiceNo || "N/A",
        paymentStatus: invoice.paymentStatus,
        totalAmount: invoice.totalAmount,
        totalProfitLoss: invoice.totalProfitLoss || 0,
        products,
      };
    });

    res.status(200).json({
      success: true,
      message: "Sales summary fetched successfully",
      data: processedData,
      count: processedData.length,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching sales summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales summary",
      error: error.message,
    });
  }
});

// Get aggregated summary data (for summary cards)
router.get("/aggregated", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = buildInvoiceDateFilter(startDate, endDate);
    const query = dateFilter;

    const salesInvoices = await SaleSummary.find(query);

    const productMap = new Map();
    let totalInvoices = 0;
    let totalSalesAmount = 0;
    let totalProfit = 0;
    let totalProductsSold = 0;
    let totalBonusQty = 0;

    salesInvoices.forEach((invoice) => {
      totalInvoices++;
      totalSalesAmount += invoice.totalAmount || 0;
      totalProfit += invoice.totalProfitLoss || 0;

      (invoice.products || []).forEach((product) => {
        const productName = product.productName || "Unknown Product";
        const normalizedName = productName.toLowerCase().trim();

        const salesQty =
          product.quantity || product.salesQty || product.qty || 0;
        const bonusQty = product.bonusQty || 0;
        const totalPrice =
          product.totalPrice || product.amount || product.netSellingAmount || 0;
        const profit = product.profit || product.profitLoss || 0;

        totalProductsSold += salesQty;
        totalBonusQty += bonusQty;

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            productName: productName,
            normalizedName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0,
          });
        }

        const existing = productMap.get(normalizedName);
        existing.salesQuantity += salesQty;
        existing.bonusQuantity += bonusQty;
        existing.totalQuantity += salesQty + bonusQty;
        existing.amount += totalPrice;
        existing.profit += profit;
      });
    });

    const result = {
      totalInvoices,
      totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalProductsSold,
      totalBonusQty,
      totalQty: totalProductsSold + totalBonusQty,
      uniqueProducts: productMap.size,
      productMap: Array.from(productMap.values()),
    };

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error fetching aggregated summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch aggregated summary",
      error: error.message,
    });
  }
});

// Export Excel
router.get("/export", async (req, res) => {
  try {
    const { startDate, endDate, tab } = req.query;
    const dateFilter = buildInvoiceDateFilter(startDate, endDate);
    const query = dateFilter;

    const salesInvoices = await SaleSummary.find(query).sort({
      invoiceDate: -1,
    });

    let exportData = [];

    if (tab === "daily") {
      const dailyMap = {};
      salesInvoices.forEach((invoice) => {
        const date = invoice.invoiceDate
          ? new Date(invoice.invoiceDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            })
          : "Unknown Date";

        if (!dailyMap[date]) {
          dailyMap[date] = { date, products: new Map() };
        }

        (invoice.products || []).forEach((product) => {
          const productName = product.productName || "Unknown Product";
          const normalizedName = productName.toLowerCase().trim();
          const salesQty =
            product.quantity || product.salesQty || product.qty || 0;
          const bonusQty = product.bonusQty || 0;
          const totalPrice =
            product.totalPrice ||
            product.amount ||
            product.netSellingAmount ||
            0;
          const profit = product.profit || product.profitLoss || 0;

          if (!dailyMap[date].products.has(normalizedName)) {
            dailyMap[date].products.set(normalizedName, {
              productName: productName,
              salesQuantity: 0,
              bonusQuantity: 0,
              totalQuantity: 0,
              amount: 0,
              profit: 0,
            });
          }

          const existing = dailyMap[date].products.get(normalizedName);
          existing.salesQuantity += salesQty;
          existing.bonusQuantity += bonusQty;
          existing.totalQuantity += salesQty + bonusQty;
          existing.amount += totalPrice;
          existing.profit += profit;
        });
      });

      Object.values(dailyMap).forEach((day) => {
        Array.from(day.products.values()).forEach((product) => {
          exportData.push({
            Date: day.date,
            "Product Name": product.productName,
            "Sales Qty": product.salesQuantity,
            "Bonus Qty": product.bonusQuantity,
            "Total Qty": product.totalQuantity,
            "Amount ($)": product.amount.toFixed(2),
            "Profit ($)": product.profit.toFixed(2),
          });
        });
      });
    } else if (tab === "combine") {
      const productMap = new Map();
      salesInvoices.forEach((invoice) => {
        (invoice.products || []).forEach((product) => {
          const productName = product.productName || "Unknown Product";
          const normalizedName = productName.toLowerCase().trim();
          const salesQty =
            product.quantity || product.salesQty || product.qty || 0;
          const bonusQty = product.bonusQty || 0;
          const totalPrice =
            product.totalPrice ||
            product.amount ||
            product.netSellingAmount ||
            0;
          const profit = product.profit || product.profitLoss || 0;

          if (!productMap.has(normalizedName)) {
            productMap.set(normalizedName, {
              productName: productName,
              salesQuantity: 0,
              bonusQuantity: 0,
              totalQuantity: 0,
              amount: 0,
              profit: 0,
            });
          }

          const existing = productMap.get(normalizedName);
          existing.salesQuantity += salesQty;
          existing.bonusQuantity += bonusQty;
          existing.totalQuantity += salesQty + bonusQty;
          existing.amount += totalPrice;
          existing.profit += profit;
        });
      });

      Array.from(productMap.values()).forEach((product) => {
        exportData.push({
          "Product Name": product.productName,
          "Sales Qty": product.salesQuantity,
          "Bonus Qty": product.bonusQuantity,
          "Total Qty": product.totalQuantity,
          "Amount ($)": product.amount.toFixed(2),
          "Profit ($)": product.profit.toFixed(2),
        });
      });
    }

    if (exportData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found to export",
      });
    }

    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Summary");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=sales-summary-${new Date().toISOString().split("T")[0]}.xlsx`,
    );

    res.send(buffer);
  } catch (error) {
    console.error("❌ Error exporting sales summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export sales summary",
      error: error.message,
    });
  }
});

export default router;
