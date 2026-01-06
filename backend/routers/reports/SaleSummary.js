import express from "express";
import mongoose from "mongoose";
import SaleSummary from "../../models/sale/saleSummary.js";

const router = express.Router();

// Get sales summary for the frontend component
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build query
    const query = {};
    
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.recordingDate = { $gte: start, $lte: end };
    }

    // Get all sales invoices
    const allSalesInvoices = await SaleSummary.find(query)
      .sort({ recordingDate: -1 });

    // Process data for frontend with correct field mappings
    const processedData = allSalesInvoices.map(invoice => {
      const products = (invoice.products || []).map(product => {
        const salesQty = product.quantity || product.salesQty || product.qty || 0;
        const bonusQty = product.bonusQty || product.bonusQuantity || 0;
        const totalPrice = product.totalPrice || product.amount || product.netSellingAmount || 0;
        const profit = product.profit || product.profitLoss || 0;
        const sellingPrice = product.sellingPrice || 0;
        const costPrice = product.costPrice || 0;
        const productName = product.productName || 'Unknown Product';

        return {
          productId: product.productId || product._id,
          productName,
          normalizedProductName: productName.toLowerCase().trim(), // Add normalized name
          salesQty,
          bonusQty,
          totalQty: salesQty + bonusQty,
          sellingPrice,
          totalPrice,
          netSellingAmount: totalPrice,
          profitLoss: profit,
          costPrice
        };
      });

      return {
        _id: invoice._id,
        recordingDate: invoice.recordingDate,
        customerName: invoice.customerName || 'Walk-in Customer',
        invoiceNo: invoice.invoiceNumber || invoice.invoiceNo || 'N/A',
        paymentStatus: invoice.paymentStatus,
        totalAmount: invoice.totalAmount,
        totalProfitLoss: invoice.totalProfitLoss || 0,
        products
      };
    });

    res.status(200).json({
      success: true,
      message: "Sales summary fetched successfully",
      data: processedData,
      count: processedData.length,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error("❌ Error fetching sales summary:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to fetch sales summary",
      error: error.message 
    });
  }
});

// Get aggregated summary data (for summary cards)
router.get("/aggregated", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const query = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.recordingDate = { $gte: start, $lte: end };
    }

    // First get all sales data
    const salesInvoices = await SaleSummary.find(query);

    // Process data to combine case-insensitive product names
    const productMap = new Map();
    let totalInvoices = 0;
    let totalSalesAmount = 0;
    let totalProfit = 0;
    let totalProductsSold = 0;
    let totalBonusQty = 0;

    salesInvoices.forEach(invoice => {
      totalInvoices++;
      totalSalesAmount += invoice.totalAmount || 0;
      totalProfit += invoice.totalProfitLoss || 0;

      (invoice.products || []).forEach(product => {
        const productName = product.productName || 'Unknown Product';
        const normalizedName = productName.toLowerCase().trim();
        
        const salesQty = product.quantity || product.salesQty || product.qty || 0;
        const bonusQty = product.bonusQty || 0;
        const totalPrice = product.totalPrice || product.amount || product.netSellingAmount || 0;
        const profit = product.profit || product.profitLoss || 0;

        totalProductsSold += salesQty;
        totalBonusQty += bonusQty;

        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            productName: productName, // Keep original name (first occurrence)
            normalizedName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0
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
      productMap: Array.from(productMap.values()) // For debugging/other uses
    };

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error("❌ Error fetching aggregated summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch aggregated summary",
      error: error.message
    });
  }
});

// Export Excel - Fixed to combine case-insensitive products
router.get("/export", async (req, res) => {
  try {
    const { startDate, endDate, tab } = req.query;

    const query = {};
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.recordingDate = { $gte: start, $lte: end };
    }

    // Get sales data
    const salesInvoices = await SaleSummary.find(query)
      .sort({ recordingDate: -1 });

    let exportData = [];
    
    if (tab === "daily") {
      // Group by date
      const dailyMap = {};
      salesInvoices.forEach(invoice => {
        const date = new Date(invoice.recordingDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        if (!dailyMap[date]) {
          dailyMap[date] = { date, products: new Map() };
        }
        
        (invoice.products || []).forEach(product => {
          const productName = product.productName || 'Unknown Product';
          const normalizedName = productName.toLowerCase().trim();
          const salesQty = product.quantity || product.salesQty || product.qty || 0;
          const bonusQty = product.bonusQty || 0;
          const totalPrice = product.totalPrice || product.amount || product.netSellingAmount || 0;
          const profit = product.profit || product.profitLoss || 0;
          
          if (!dailyMap[date].products.has(normalizedName)) {
            dailyMap[date].products.set(normalizedName, {
              productName: productName, // Keep original name
              salesQuantity: 0,
              bonusQuantity: 0,
              totalQuantity: 0,
              amount: 0,
              profit: 0
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
      
      // Flatten the data
      Object.values(dailyMap).forEach(day => {
        Array.from(day.products.values()).forEach(product => {
          exportData.push({
            Date: day.date,
            "Product Name": product.productName,
            "Sales Qty": product.salesQuantity,
            "Bonus Qty": product.bonusQuantity,
            "Total Qty": product.totalQuantity,
            "Amount ($)": product.amount.toFixed(2),
            "Profit ($)": product.profit.toFixed(2)
          });
        });
      });
    } else if (tab === "combine") {
      // Combine all products (case-insensitive)
      const productMap = new Map();
      salesInvoices.forEach(invoice => {
        (invoice.products || []).forEach(product => {
          const productName = product.productName || 'Unknown Product';
          const normalizedName = productName.toLowerCase().trim();
          const salesQty = product.quantity || product.salesQty || product.qty || 0;
          const bonusQty = product.bonusQty || 0;
          const totalPrice = product.totalPrice || product.amount || product.netSellingAmount || 0;
          const profit = product.profit || product.profitLoss || 0;
          
          if (!productMap.has(normalizedName)) {
            productMap.set(normalizedName, {
              productName: productName, // Keep the original name (first occurrence)
              salesQuantity: 0,
              bonusQuantity: 0,
              totalQuantity: 0,
              amount: 0,
              profit: 0
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
      
      // Convert to array for export
      Array.from(productMap.values()).forEach(product => {
        exportData.push({
          "Product Name": product.productName,
          "Sales Qty": product.salesQuantity,
          "Bonus Qty": product.bonusQuantity,
          "Total Qty": product.totalQuantity,
          "Amount ($)": product.amount.toFixed(2),
          "Profit ($)": product.profit.toFixed(2)
        });
      });
    }

    if (exportData.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No data found to export"
      });
    }

    // Generate Excel
    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sales Summary");
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=sales-summary-${new Date().toISOString().split('T')[0]}.xlsx`);
    
    res.send(buffer);

  } catch (error) {
    console.error("❌ Error exporting sales summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export sales summary",
      error: error.message
    });
  }
});

export default router;