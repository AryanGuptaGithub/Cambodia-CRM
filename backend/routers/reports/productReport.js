import express from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Product from '../../models/projectManger/product.js';
import ReportInHand from '../../models/reports/reportsInHand.js';
import SaleSummary from '../../models/sale/saleSummary.js';
import Purchase from '../../models/purcharsing/purchaseInventory.js';

const router = express.Router();

// Helper function to normalize product names for matching
const normalizeProductName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/[^\w\s]/g, '') // Remove special characters
    .trim();
};

// Get product report with profit margin calculation
router.get('/product-report/report', async (req, res) => {
  console.log('=== STARTING PRODUCT REPORT GENERATION ===');
  console.log('Query parameters:', req.query);
  
  try {
    const { period, month, year, searchTerm, category } = req.query;
    console.log(`Period: ${period}, Month: ${month}, Year: ${year}, Search: ${searchTerm}, Category: ${category}`);
    
    console.log('Step 1: Fetching products from database...');
    // Get all products
    const products = await Product.find({}).lean();
    console.log(`Found ${products.length} products`);
    
    // Create a normalized product map for easier lookup
    const normalizedProductMap = {};
    products.forEach(product => {
      if (product.productName) {
        const normalized = normalizeProductName(product.productName);
        normalizedProductMap[normalized] = product;
      }
    });
    
    console.log('Step 2: Fetching report in hand entries...');
    // Get all report in hand entries
    const reportInHands = await ReportInHand.find({}).lean();
    console.log(`Found ${reportInHands.length} report in hand entries`);
    
    console.log('Step 3: Fetching sale summaries...');
    // Get all sale summaries for profit calculation
    const saleSummaries = await SaleSummary.find({}).lean();
    console.log(`Found ${saleSummaries.length} sale summaries`);
    
    console.log('Step 4: Fetching purchases...');
    // Get all purchases for LC price
    const purchases = await Purchase.find({}).lean();
    console.log(`Found ${purchases.length} purchase records`);
    
    // Calculate current month and year for filtering
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    console.log(`Current date: ${currentDate}, Month: ${currentMonth}, Year: ${currentYear}`);
    
    console.log('Step 5: Processing products...');
    // Process products with additional data
    const processedProducts = products.map((product, index) => {
      console.log(`\n--- Processing product ${index + 1}/${products.length}: ${product.productName || 'Unnamed'} ---`);
      
      // Find corresponding report in hand data
      const reportInHand = reportInHands.find(r => {
        if (!r.productName || !product.productName) return false;
        const normalizedR = normalizeProductName(r.productName);
        const normalizedP = normalizeProductName(product.productName);
        return normalizedR === normalizedP;
      });
      
      if (reportInHand) {
        console.log(`Found matching report in hand: ${reportInHand.productName}, Stock: ${reportInHand.totalBoxes}`);
      } else {
        console.log(`No matching report in hand found for product: ${product.productName}`);
      }
      
      // Find purchase data for LC price
      const purchaseData = purchases.find(p => {
        if (!p.products) return false;
        return p.products.some(prod => {
          if (!prod.productName || !product.productName) return false;
          const normalizedProd = normalizeProductName(prod.productName);
          const normalizedProduct = normalizeProductName(product.productName);
          return normalizedProd === normalizedProduct;
        });
      });
      
      let purchaseProduct;
      if (purchaseData) {
        purchaseProduct = purchaseData.products.find(prod => {
          if (!prod.productName || !product.productName) return false;
          const normalizedProd = normalizeProductName(prod.productName);
          const normalizedProduct = normalizeProductName(product.productName);
          return normalizedProd === normalizedProduct;
        });
        if (purchaseProduct) {
          console.log(`Purchase product details: LC: ${purchaseProduct.lc}, FOB: ${purchaseProduct.fob}`);
        }
      }
      
      // Get LC price from purchase or product
      const lcPrice = purchaseProduct?.lc || product.lc || 0;
      const fobPrice = purchaseProduct?.fob || product.fob || 0;
      const sellingPrice = product.sellingPrice || 0;
      console.log(`Product prices - LC: ${lcPrice}, FOB: ${fobPrice}, Selling: ${sellingPrice}`);
      
      // Calculate sales data
      const allSales = [];
      let totalSalesAmount = 0;
      let totalSoldQuantity = 0;
      
      // Normalize product name for matching
      const productNormalizedName = product.productName ? normalizeProductName(product.productName) : '';
      
      saleSummaries.forEach((sale, saleIndex) => {
        if (sale.products && sale.products.length > 0) {
          sale.products.forEach((saleProduct, spIndex) => {
            if (saleProduct.productName && productNormalizedName) {
              // Normalize the sale product name
              const saleProductNormalizedName = normalizeProductName(saleProduct.productName);
              
              // Debug: Log matching attempts
              if (saleProductNormalizedName === productNormalizedName) {
                console.log(`DEBUG: Exact match found - Sale: "${saleProduct.productName}" -> "${saleProductNormalizedName}" vs Product: "${product.productName}" -> "${productNormalizedName}"`);
              } else if (saleProductNormalizedName.includes(productNormalizedName) || productNormalizedName.includes(saleProductNormalizedName)) {
                console.log(`DEBUG: Partial match - Sale: "${saleProduct.productName}" -> "${saleProductNormalizedName}" vs Product: "${product.productName}" -> "${productNormalizedName}"`);
              }
              
              // Try different matching strategies
              if (saleProductNormalizedName === productNormalizedName ||
                  saleProductNormalizedName.includes(productNormalizedName) ||
                  productNormalizedName.includes(saleProductNormalizedName)) {
                
                const saleDate = new Date(sale.invoiceDate || sale.createdAt);
                const saleMonth = saleDate.getMonth() + 1;
                const saleYear = saleDate.getFullYear();
                
                // IMPORTANT: Use the correct quantity field from sale data
                // Based on your sale data, quantity might be in 'salesQty', 'totalQty', or 'quantity' field
                const quantity = saleProduct.salesQty || saleProduct.totalQty || saleProduct.quantity || saleProduct.qty || 0;
                
                // IMPORTANT: Use the correct price field from sale data
                // Based on your sale data, price might be in 'sellingPrice', 'price', or 'rate' field
                const price = saleProduct.sellingPrice || saleProduct.price || saleProduct.rate || sellingPrice;
                
                const amount = quantity * price;
                
                allSales.push({
                  date: saleDate,
                  quantity: quantity,
                  price: price,
                  amount: amount,
                  invoiceNumber: sale.invoiceNumber,
                  customerName: sale.customerName,
                  saleProductName: saleProduct.productName, // For debugging
                  matchedProductName: product.productName // For debugging
                });
                
                totalSoldQuantity += quantity;
                totalSalesAmount += amount;
                
                console.log(`✅ Sale found - Invoice: ${sale.invoiceNumber}, Date: ${saleDate.toDateString()}, Qty: ${quantity}, Price: ${price}, Amount: ${amount}`);
              }
            }
          });
        }
      });
      
      console.log(`Total sales for product "${product.productName}": ${allSales.length} transactions, Total Qty: ${totalSoldQuantity}, Total Amount: ${totalSalesAmount}`);
      
      // Filter sales based on period
      let filteredSales = [];
      let filterMonth = parseInt(month || currentMonth);
      let filterYear = parseInt(year || currentYear);
      
      if (period === 'month') {
        filteredSales = allSales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getMonth() + 1 === filterMonth && 
                 saleDate.getFullYear() === filterYear;
        });
        console.log(`Monthly filter applied (${filterMonth}/${filterYear}): ${filteredSales.length} sales match period`);
      } else if (period === 'year') {
        filteredSales = allSales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getFullYear() === filterYear;
        });
        console.log(`Yearly filter applied (${filterYear}): ${filteredSales.length} sales match period`);
      } else {
        filteredSales = allSales;
        console.log(`No period filter: using all ${filteredSales.length} sales`);
      }
      
      // Calculate period sales
      const periodSalesAmount = filteredSales.reduce((sum, sale) => sum + sale.amount, 0);
      const periodSoldQuantity = filteredSales.reduce((sum, sale) => sum + sale.quantity, 0);
      console.log(`Period sales - Amount: ${periodSalesAmount}, Quantity: ${periodSoldQuantity}`);
      
      // Calculate profit margin
      let profitMargin = 0;
      let profitAmount = 0;
      
      if (periodSoldQuantity > 0 && lcPrice > 0) {
        const totalCost = periodSoldQuantity * lcPrice;
        profitAmount = periodSalesAmount - totalCost;
        // Calculate profit margin as percentage of sales (standard business practice)
        profitMargin = periodSalesAmount > 0 ? (profitAmount / periodSalesAmount) * 100 : 0;
        console.log(`Profit calculation - Sales: ${periodSalesAmount}, Cost: ${totalCost}, Profit: ${profitAmount}, Margin: ${profitMargin}%`);
      } else {
        console.log(`Insufficient data for profit calculation - Period Qty: ${periodSoldQuantity}, LC Price: ${lcPrice}`);
      }
      
      // Get current stock from report in hand
      const rawCurrentStock = reportInHand?.totalBoxes || 0;
      const currentStock = parseFloat(Number(rawCurrentStock).toFixed(2));
      const status = reportInHand?.status || 'Unknown';
      console.log(`Current stock: Raw: ${rawCurrentStock}, Formatted: ${currentStock}, Status: ${status}`);
      
      return {
        _id: product._id,
        name: product.productName,
        category: product.type || 'Uncategorized',
        sku: product.packing || 'N/A',
        currentStock: currentStock,
        price: sellingPrice,
        cost: lcPrice,
        lcPrice: lcPrice,
        fobPrice: fobPrice,
        totalSales: periodSalesAmount, // Use period sales for display
        soldThisMonth: allSales.filter(sale => {
          const saleDate = new Date(sale.date);
          return saleDate.getMonth() + 1 === currentMonth && 
                 saleDate.getFullYear() === currentYear;
        }).reduce((sum, sale) => sum + sale.quantity, 0),
        soldLastMonth: allSales.filter(sale => {
          const saleDate = new Date(sale.date);
          const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
          const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
          return saleDate.getMonth() + 1 === lastMonth && 
                 saleDate.getFullYear() === lastMonthYear;
        }).reduce((sum, sale) => sum + sale.quantity, 0),
        periodSales: periodSalesAmount,
        periodSoldQuantity: periodSoldQuantity,
        profitMargin: `${profitMargin.toFixed(2)}%`,
        profitAmount: profitAmount,
        profitMarginValue: profitMargin,
        enabled: true,
        status: status,
        supplierName: product.supplierName,
        createdAt: product.createdAt,
        salesData: allSales,
        filteredSales: filteredSales,
        hasSales: allSales.length > 0 // Add flag to check if product has sales
      };
    });
    
    console.log('\nStep 6: Debug - Check products without sales...');
    const productsWithoutSales = processedProducts.filter(p => !p.hasSales);
    console.log(`${productsWithoutSales.length} products have no sales data:`);
    productsWithoutSales.forEach(p => {
      console.log(`  - ${p.name} (Category: ${p.category})`);
    });
    
    console.log('\nStep 7: Applying search filter...');
    // Apply search filter
    let filteredProducts = [...processedProducts];
    
    if (searchTerm) {
      const originalCount = filteredProducts.length;
      filteredProducts = filteredProducts.filter(
        (product) =>
          product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          product.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log(`Search filter "${searchTerm}" applied: ${originalCount} -> ${filteredProducts.length} products`);
    }
    
    console.log('Step 8: Applying category filter...');
    // Apply category filter
    if (category) {
      const beforeCount = filteredProducts.length;
      filteredProducts = filteredProducts.filter(
        (product) => product.category === category
      );
      console.log(`Category filter "${category}" applied: ${beforeCount} -> ${filteredProducts.length} products`);
    }
    
    console.log('\nStep 9: Calculating summary statistics...');
    // Calculate summary statistics
    const totalSales = filteredProducts.reduce((sum, p) => sum + p.periodSales, 0);
    const totalProfit = filteredProducts.reduce((sum, p) => sum + p.profitAmount, 0);
    const totalStock = filteredProducts.reduce((sum, p) => sum + p.currentStock, 0);
    const avgProfitMargin = filteredProducts.length > 0 ? 
      filteredProducts.reduce((sum, p) => sum + (p.profitMarginValue || 0), 0) / filteredProducts.length : 0;
    
    console.log(`Final Summary:`);
    console.log(`- Total products: ${filteredProducts.length}`);
    console.log(`- Total period sales: $${totalSales.toFixed(2)}`);
    console.log(`- Total profit: $${totalProfit.toFixed(2)}`);
    console.log(`- Total stock: ${totalStock.toFixed(2)}`);
    console.log(`- Average profit margin: ${avgProfitMargin.toFixed(2)}%`);
    
    console.log('\n=== PRODUCT REPORT GENERATION COMPLETE ===');
    
    res.json({
      success: true,
      products: filteredProducts,
      total: filteredProducts.length,
      summary: {
        totalProducts: filteredProducts.length,
        totalSales: totalSales,
        totalProfit: totalProfit,
        avgProfitMargin: avgProfitMargin,
        totalStock: totalStock
      }
    });
    
  } catch (error) {
    console.error('❌ PRODUCT REPORT ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate product report',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Export product report to Excel
router.get('/export/excel', async (req, res) => {
  console.log('=== STARTING EXCEL EXPORT ===');
  console.log('Export query parameters:', req.query);
  
  try {
    const { period, month, year, searchTerm, category } = req.query;
    console.log(`Export parameters - Period: ${period}, Month: ${month}, Year: ${year}, Search: ${searchTerm}, Category: ${category}`);
    
    console.log('Step 1: Fetching product report data...');
    // Fetch data using the same logic as the report endpoint
    const response = await fetchProductReportData(period, month, year, searchTerm, category);
    const products = response.products;
    console.log(`Found ${products.length} products for export`);
    
    console.log('Step 2: Creating Excel workbook...');
    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Product Report System';
    workbook.created = new Date();
    
    const worksheet = workbook.addWorksheet('Product Report');
    console.log('Worksheet created');
    
    // Define columns based on period
    let salesColumnHeader = 'Total Sales';
    if (period === 'month') {
      salesColumnHeader = `Sales (Month ${month || new Date().getMonth() + 1})`;
    } else if (period === 'year') {
      salesColumnHeader = `Sales (Year ${year || new Date().getFullYear()})`;
    }
    
    console.log(`Setting up columns with header: ${salesColumnHeader}`);
    worksheet.columns = [
      { header: 'Product Name', key: 'name', width: 30 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'SKU/Packing', key: 'sku', width: 15 },
      { header: 'Current Stock', key: 'currentStock', width: 15 },
      { header: 'Selling Price ($)', key: 'price', width: 15 },
      { header: 'LC Price ($)', key: 'lcPrice', width: 15 },
      { header: 'FOB Price ($)', key: 'fobPrice', width: 15 },
      { header: salesColumnHeader + ' ($)', key: 'periodSales', width: 20 },
      { header: 'Quantity Sold', key: 'periodSoldQuantity', width: 15 },
      { header: 'Profit Amount ($)', key: 'profitAmount', width: 15 },
      { header: 'Profit Margin (%)', key: 'profitMargin', width: 15 },
      { header: 'Supplier', key: 'supplierName', width: 25 },
      { header: 'Status', key: 'status', width: 15 }
    ];
    
    // Style the header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    console.log('Header row styled');
    
    console.log('Step 3: Adding product data rows...');
    // Add data rows
    products.forEach((product, index) => {
      const row = worksheet.addRow({
        name: product.name,
        category: product.category,
        sku: product.sku,
        currentStock: product.currentStock,
        price: product.price.toFixed(2),
        lcPrice: product.lcPrice.toFixed(2),
        fobPrice: product.fobPrice.toFixed(2),
        periodSales: product.periodSales.toFixed(2),
        periodSoldQuantity: product.periodSoldQuantity,
        profitAmount: product.profitAmount.toFixed(2),
        profitMargin: product.profitMargin,
        supplierName: product.supplierName,
        status: product.status
      });
      
      console.log(`Added row ${index + 1}: ${product.name}`);
      
      // Style profit margin cells based on value
      const profitMarginCell = row.getCell('profitMargin');
      const profitValue = product.profitMarginValue || 0;
      
      if (profitValue > 25) {
        profitMarginCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' }
        };
        profitMarginCell.font = { color: { argb: 'FF006100' } };
      } else if (profitValue > 15) {
        profitMarginCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' }
        };
        profitMarginCell.font = { color: { argb: 'FF9C6500' } };
      } else if (profitValue > 0) {
        profitMarginCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' }
        };
        profitMarginCell.font = { color: { argb: 'FF9C0006' } };
      }
      
      // Style status cells
      const statusCell = row.getCell('status');
      if (product.status === 'In Stock') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC6EFCE' }
        };
        statusCell.font = { color: { argb: 'FF006100' } };
      } else if (product.status === 'Low Stock') {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' }
        };
        statusCell.font = { color: { argb: 'FF9C6500' } };
      } else {
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFC7CE' }
        };
        statusCell.font = { color: { argb: 'FF9C0006' } };
      }
    });
    
    console.log('Step 4: Adding summary row...');
    // Add summary row
    const totalSales = products.reduce((sum, p) => sum + p.periodSales, 0);
    const totalProfit = products.reduce((sum, p) => sum + p.profitAmount, 0);
    const totalStock = products.reduce((sum, p) => sum + p.currentStock, 0);
    const avgProfitMargin = products.length > 0 ? 
      products.reduce((sum, p) => sum + (p.profitMarginValue || 0), 0) / products.length : 0;
    
    console.log(`Summary - Total Sales: $${totalSales.toFixed(2)}, Total Profit: $${totalProfit.toFixed(2)}, Avg Margin: ${avgProfitMargin.toFixed(2)}%`);
    
    // Add a blank row before summary
    worksheet.addRow({});
    
    // Add summary row
    const summaryRow = worksheet.addRow({
      name: 'TOTAL SUMMARY',
      periodSales: totalSales.toFixed(2),
      profitAmount: totalProfit.toFixed(2),
      profitMargin: `${avgProfitMargin.toFixed(2)}%`,
      currentStock: totalStock.toFixed(2)
    });
    
    // Style total row
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }
    };
    
    console.log('Step 5: Auto-fitting columns...');
    // Auto-fit columns
    worksheet.columns.forEach((column, colIndex) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength < 10 ? 10 : maxLength + 2;
    });
    console.log('Columns auto-fitted');
    
    // Set response headers
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    // Generate filename based on period
    let fileName = 'product-report';
    if (period === 'month') {
      fileName = `product-report-month-${month || currentMonth}-${year || currentYear}`;
    } else if (period === 'year') {
      fileName = `product-report-year-${year || currentYear}`;
    }
    fileName += '.xlsx';
    
    console.log(`Setting headers for file: ${fileName}`);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${fileName}`
    );
    
    console.log('Step 6: Writing workbook to response...');
    // Write workbook to response
    await workbook.xlsx.write(res);
    res.end();
    
    console.log('=== EXCEL EXPORT COMPLETE ===');
    
  } catch (error) {
    console.error('❌ EXCEL EXPORT ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to export product report',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to fetch product report data
async function fetchProductReportData(period, month, year, searchTerm, category) {
  console.log('=== FETCHING PRODUCT REPORT DATA ===');
  console.log(`Parameters: period=${period}, month=${month}, year=${year}, search=${searchTerm}, category=${category}`);
  
  // Same logic as the /report endpoint
  const products = await Product.find({}).lean();
  const reportInHands = await ReportInHand.find({}).lean();
  const saleSummaries = await SaleSummary.find({}).lean();
  const purchases = await Purchase.find({}).lean();
  
  console.log(`Fetched: ${products.length} products, ${reportInHands.length} reports, ${saleSummaries.length} sales, ${purchases.length} purchases`);
  
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  
  const processedProducts = products.map(product => {
    // Find corresponding report in hand data
    const reportInHand = reportInHands.find(r => {
      if (!r.productName || !product.productName) return false;
      const normalizedR = normalizeProductName(r.productName);
      const normalizedP = normalizeProductName(product.productName);
      return normalizedR === normalizedP;
    });
    
    // Find purchase data for LC price
    const purchaseData = purchases.find(p => {
      if (!p.products) return false;
      return p.products.some(prod => {
        if (!prod.productName || !product.productName) return false;
        const normalizedProd = normalizeProductName(prod.productName);
        const normalizedProduct = normalizeProductName(product.productName);
        return normalizedProd === normalizedProduct;
      });
    });
    
    let purchaseProduct;
    if (purchaseData) {
      purchaseProduct = purchaseData.products.find(prod => {
        if (!prod.productName || !product.productName) return false;
        const normalizedProd = normalizeProductName(prod.productName);
        const normalizedProduct = normalizeProductName(product.productName);
        return normalizedProd === normalizedProduct;
      });
    }
    
    const lcPrice = purchaseProduct?.lc || product.lc || 0;
    const fobPrice = purchaseProduct?.fob || product.fob || 0;
    const sellingPrice = product.sellingPrice || 0;
    
    // Calculate sales data
    const allSales = [];
    const productNormalizedName = product.productName ? normalizeProductName(product.productName) : '';
    
    saleSummaries.forEach(sale => {
      if (sale.products && sale.products.length > 0) {
        sale.products.forEach(saleProduct => {
          if (saleProduct.productName && productNormalizedName) {
            const saleProductNormalizedName = normalizeProductName(saleProduct.productName);
            
            if (saleProductNormalizedName === productNormalizedName ||
                saleProductNormalizedName.includes(productNormalizedName) ||
                productNormalizedName.includes(saleProductNormalizedName)) {
              
              const saleDate = new Date(sale.invoiceDate || sale.createdAt);
              const quantity = saleProduct.salesQty || saleProduct.totalQty || saleProduct.quantity || saleProduct.qty || 0;
              const price = saleProduct.sellingPrice || saleProduct.price || saleProduct.rate || sellingPrice;
              const amount = quantity * price;
              
              allSales.push({
                date: saleDate,
                quantity: quantity,
                price: price,
                amount: amount
              });
            }
          }
        });
      }
    });
    
    // Filter sales based on period
    let filteredSales = [];
    let filterMonth = parseInt(month || currentMonth);
    let filterYear = parseInt(year || currentYear);
    
    if (period === 'month') {
      filteredSales = allSales.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate.getMonth() + 1 === filterMonth && 
               saleDate.getFullYear() === filterYear;
      });
    } else if (period === 'year') {
      filteredSales = allSales.filter(sale => {
        const saleDate = new Date(sale.date);
        return saleDate.getFullYear() === filterYear;
      });
    } else {
      filteredSales = allSales;
    }
    
    const periodSalesAmount = filteredSales.reduce((sum, sale) => sum + sale.amount, 0);
    const periodSoldQuantity = filteredSales.reduce((sum, sale) => sum + sale.quantity, 0);
    
    // Calculate profit margin
    let profitMargin = 0;
    let profitAmount = 0;
    
    if (periodSoldQuantity > 0 && lcPrice > 0) {
      const totalCost = periodSoldQuantity * lcPrice;
      profitAmount = periodSalesAmount - totalCost;
      profitMargin = periodSalesAmount > 0 ? (profitAmount / periodSalesAmount) * 100 : 0;
    }
    
    // Format current stock
    const rawCurrentStock = reportInHand?.totalBoxes || 0;
    const currentStock = parseFloat(Number(rawCurrentStock).toFixed(2));
    const status = reportInHand?.status || 'Unknown';
    
    return {
      _id: product._id,
      name: product.productName,
      category: product.type || 'Uncategorized',
      sku: product.packing || 'N/A',
      currentStock: currentStock,
      price: sellingPrice,
      cost: lcPrice,
      lcPrice: lcPrice,
      fobPrice: fobPrice,
      periodSales: periodSalesAmount,
      periodSoldQuantity: periodSoldQuantity,
      profitMargin: `${profitMargin.toFixed(2)}%`,
      profitAmount: profitAmount,
      profitMarginValue: profitMargin,
      enabled: true,
      status: status,
      supplierName: product.supplierName
    };
  });
  
  // Apply filters
  let filteredProducts = [...processedProducts];
  
  if (searchTerm) {
    filteredProducts = filteredProducts.filter(
      (product) =>
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }
  
  if (category) {
    filteredProducts = filteredProducts.filter(
      (product) => product.category === category
    );
  }
  
  console.log(`Data fetch complete: ${filteredProducts.length} products after filtering`);
  return { products: filteredProducts };
}

export default router;