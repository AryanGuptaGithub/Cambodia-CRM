// completeInventoryAnalysis.js - ES Module Version with Stock Adjustments

import { MongoClient } from 'mongodb';
import fs from 'fs';

// MongoDB Connection String
const MONGODB_URI = "mongodb+srv://admin:ni6tP5N63U0Yxvdr@cluster0.2qjjhh8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

class CompleteInventoryAnalyzer {
  constructor() {
    this.client = null;
    this.results = {
      generatedAt: new Date().toISOString(),
      database: 'test',
      purchaseAnalysis: {},
      salesAnalysis: {},
      stockAdjustmentAnalysis: {},
      reportInHandAnalysis: {},
      productComparison: [],
      summary: {},
      expiryAlerts: []
    };
  }

  async connect() {
    try {
      this.client = new MongoClient(MONGODB_URI, {
        readPreference: 'secondaryPreferred',
        readConcern: { level: 'majority' },
        retryWrites: false
      });
      await this.client.connect();
      console.log('✅ Connected to MongoDB (Read-Only Mode)\n');
      return true;
    } catch (error) {
      console.error('❌ Connection failed:', error.message);
      return false;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      console.log('🔌 Disconnected from MongoDB');
    }
  }

  /**
   * Analyze Stock Adjustments
   */
  async analyzeStockAdjustments() {
    try {
      const db = this.client.db('test');
      const collection = db.collection('stockadjustments');
      
      const collections = await db.listCollections({ name: 'stockadjustments' }).toArray();
      if (collections.length === 0) {
        console.log(`⚠️ Collection 'stockadjustments' not found`);
        return null;
      }
      
      const adjustments = await collection.find({}).toArray();
      console.log(`📦 Found ${adjustments.length} stock adjustment records`);
      
      const adjustmentMap = new Map();
      
      for (const adj of adjustments) {
        const productId = adj.productId;
        const boxQuantity = adj.boxQuantity || 0;
        const totalQuantity = adj.totalQuantity || 0;
        const adjustmentType = adj.adjustmentType; // "add" or "remove"
        
        if (!adjustmentMap.has(productId)) {
          adjustmentMap.set(productId, {
            productId: productId,
            totalAdded: 0,
            totalRemoved: 0,
            netAdjustment: 0,
            adjustmentCount: 0,
            adjustments: []
          });
        }
        
        const data = adjustmentMap.get(productId);
        
        if (adjustmentType === 'add') {
          data.totalAdded += totalQuantity;
          data.netAdjustment += totalQuantity;
        } else if (adjustmentType === 'remove') {
          data.totalRemoved += totalQuantity;
          data.netAdjustment -= totalQuantity;
        }
        
        data.adjustmentCount++;
        data.adjustments.push({
          type: adjustmentType,
          boxQuantity: boxQuantity,
          totalQuantity: totalQuantity,
          createdAt: adj.createdAt,
          remarks: adj.remarks || ''
        });
      }
      
      const result = {
        collection: 'stockadjustments',
        totalRecords: adjustments.length,
        totalAddedUnits: Array.from(adjustmentMap.values()).reduce((sum, d) => sum + d.totalAdded, 0),
        totalRemovedUnits: Array.from(adjustmentMap.values()).reduce((sum, d) => sum + d.totalRemoved, 0),
        netStockAdjustment: Array.from(adjustmentMap.values()).reduce((sum, d) => sum + d.netAdjustment, 0),
        productAdjustments: Array.from(adjustmentMap.values())
      };
      
      console.log(`   Total Added: +${result.totalAddedUnits} units`);
      console.log(`   Total Removed: -${result.totalRemovedUnits} units`);
      console.log(`   Net Adjustment: ${result.netStockAdjustment >= 0 ? '+' : ''}${result.netStockAdjustment} units`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error analyzing stock adjustments:`, error.message);
      return null;
    }
  }

  /**
   * Analyze Report In Hand (Current Stock Status)
   */
  async analyzeReportInHand() {
    try {
      const db = this.client.db('test');
      const collection = db.collection('reportinhands');
      
      const collections = await db.listCollections({ name: 'reportinhands' }).toArray();
      if (collections.length === 0) {
        console.log(`⚠️ Collection 'reportinhands' not found`);
        return null;
      }
      
      const reportInHands = await collection.find({}).toArray();
      console.log(`📦 Found ${reportInHands.length} report-in-hand records`);
      
      const reportMap = new Map();
      
      for (const report of reportInHands) {
        const productName = report.productName?.toLowerCase() || 'unknown';
        const batches = report.batches || [];
        
        // Calculate totals from batches
        let totalBoxesFromBatches = 0;
        let totalAmount = 0;
        let batchDetails = [];
        
        for (const batch of batches) {
          const boxes = batch.boxes || 0;
          const amount = batch.amount || 0;
          const lc = batch.lc || 0;
          const expiryDate = batch.expiryDate;
          
          totalBoxesFromBatches += boxes;
          totalAmount += amount;
          
          batchDetails.push({
            boxes: boxes,
            lc: lc,
            amount: amount,
            expiryDate: expiryDate,
            adjustmentType: batch.adjustmentType,
            date: batch.date
          });
        }
        
        reportMap.set(productName, {
          productName: report.productName,
          supplierName: report.supplierName,
          type: report.type,
          sellingPrice: report.sellingPrice,
          totalBoxes: report.totalBoxes || 0,
          totalBoxesFromBatches: totalBoxesFromBatches,
          addStockAdjustment: report.addStockAdjustment || 0,
          removeStockAdjustment: report.removeStockAdjustment || 0,
          totalAmount: report.totalAmount || totalAmount,
          averagePrice: report.averagePrice || 0,
          status: report.status,
          minStockLevel: report.minStockLevel,
          batches: batchDetails,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt
        });
      }
      
      const result = {
        collection: 'reportinhands',
        totalRecords: reportInHands.length,
        totalCurrentStock: Array.from(reportMap.values()).reduce((sum, r) => sum + r.totalBoxes, 0),
        totalStockValue: Array.from(reportMap.values()).reduce((sum, r) => sum + (r.totalAmount || 0), 0),
        productsWithLowStock: Array.from(reportMap.values()).filter(r => r.totalBoxes <= (r.minStockLevel || 0)),
        productsOutOfStock: Array.from(reportMap.values()).filter(r => r.status === 'Out of Stock'),
        productWiseReport: Array.from(reportMap.values())
      };
      
      console.log(`   Total Current Stock: ${result.totalCurrentStock.toLocaleString()} units`);
      console.log(`   Total Stock Value: $${result.totalStockValue.toFixed(2)}`);
      console.log(`   Out of Stock Products: ${result.productsOutOfStock.length}`);
      console.log(`   Low Stock Products: ${result.productsWithLowStock.length}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error analyzing report in hand:`, error.message);
      return null;
    }
  }

  /**
   * Analyze Purchase Inventories
   */
  async analyzePurchaseInventories() {
    try {
      const db = this.client.db('test');
      const collection = db.collection('purchaseinventories');
      
      const collections = await db.listCollections({ name: 'purchaseinventories' }).toArray();
      if (collections.length === 0) {
        console.log(`⚠️ Collection 'purchaseinventories' not found`);
        return null;
      }
      
      const purchaseRecords = await collection.find({}).toArray();
      console.log(`📦 Found ${purchaseRecords.length} purchase records`);
      
      const productPurchases = new Map();
      let totalPurchaseAmount = 0;
      let totalPurchaseQuantity = 0;
      let totalSuppliers = new Set();
      
      for (const purchase of purchaseRecords) {
        const products = purchase.products || [];
        const supplierName = purchase.supplierName;
        
        totalSuppliers.add(supplierName);
        
        for (const product of products) {
          const productName = product.productName?.toLowerCase() || 'unknown';
          const quantity = product.quantityPerBoxStrip || 0;
          const amount = product.amount || 0;
          const lc = product.lc || 0;
          const fob = product.fob || 0;
          const cif = product.cif || 0;
          const sellingPrice = product.sellingPrice || 0;
          const expiryDate = product.expiryDate;
          const type = product.type || '';
          
          totalPurchaseAmount += amount;
          totalPurchaseQuantity += quantity;
          
          if (!productPurchases.has(productName)) {
            productPurchases.set(productName, {
              productName: product.productName,
              type: type,
              totalPurchaseQty: 0,
              totalAmount: 0,
              totalLC: 0,
              totalFOB: 0,
              totalCIF: 0,
              averageLC: 0,
              averageFOB: 0,
              averageCIF: 0,
              averageSellingPrice: 0,
              purchaseCount: 0,
              suppliers: new Set(),
              expiryDates: [],
              invoices: []
            });
          }
          
          const productData = productPurchases.get(productName);
          productData.totalPurchaseQty += quantity;
          productData.totalAmount += amount;
          productData.totalLC += lc * quantity;
          productData.totalFOB += fob * quantity;
          productData.totalCIF += cif * quantity;
          productData.purchaseCount++;
          productData.suppliers.add(supplierName);
          
          if (expiryDate) {
            productData.expiryDates.push({
              date: expiryDate,
              quantity: quantity
            });
          }
        }
      }
      
      const purchaseArray = [];
      for (const [name, data] of productPurchases.entries()) {
        data.averageLC = data.totalPurchaseQty > 0 ? (data.totalLC / data.totalPurchaseQty).toFixed(4) : 0;
        data.averageFOB = data.totalPurchaseQty > 0 ? (data.totalFOB / data.totalPurchaseQty).toFixed(4) : 0;
        data.averageCIF = data.totalPurchaseQty > 0 ? (data.totalCIF / data.totalPurchaseQty).toFixed(4) : 0;
        data.suppliers = Array.from(data.suppliers);
        
        if (data.expiryDates.length > 0) {
          const expiryDatesList = data.expiryDates.map(e => new Date(e.date));
          data.earliestExpiry = new Date(Math.min(...expiryDatesList)).toISOString();
          data.latestExpiry = new Date(Math.max(...expiryDatesList)).toISOString();
          
          const expiringSoon = data.expiryDates.filter(e => {
            const daysToExpiry = Math.ceil((new Date(e.date) - new Date()) / (1000 * 60 * 60 * 24));
            return daysToExpiry > 0 && daysToExpiry <= 90;
          });
          data.expiringSoonCount = expiringSoon.length;
          data.expiringSoonQuantity = expiringSoon.reduce((sum, e) => sum + e.quantity, 0);
        }
        
        purchaseArray.push(data);
      }
      
      purchaseArray.sort((a, b) => b.totalPurchaseQty - a.totalPurchaseQty);
      
      const result = {
        collection: 'purchaseinventories',
        totalRecords: purchaseRecords.length,
        totalSuppliers: totalSuppliers.size,
        totalPurchaseAmount: totalPurchaseAmount.toFixed(2),
        totalPurchaseQuantity: totalPurchaseQuantity,
        averagePurchasePrice: totalPurchaseQuantity > 0 ? (totalPurchaseAmount / totalPurchaseQuantity).toFixed(4) : 0,
        totalProductsPurchased: purchaseArray.length,
        productWisePurchases: purchaseArray,
        topPurchasedProducts: purchaseArray.slice(0, 10)
      };
      
      console.log(`   Total Purchase Amount: $${result.totalPurchaseAmount}`);
      console.log(`   Total Purchase Quantity: ${result.totalPurchaseQuantity.toLocaleString()} units`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error analyzing purchase inventories:`, error.message);
      return null;
    }
  }

  /**
   * Analyze Sales Summaries
   */
  async analyzeSalesSummaries() {
    try {
      const db = this.client.db('test');
      const collection = db.collection('salesummaries');
      
      const collections = await db.listCollections({ name: 'salesummaries' }).toArray();
      if (collections.length === 0) {
        console.log(`⚠️ Collection 'salesummaries' not found`);
        return null;
      }
      
      const salesRecords = await collection.find({}).toArray();
      console.log(`📦 Found ${salesRecords.length} sales records`);
      
      const productSales = new Map();
      let totalSalesAmount = 0;
      let totalSalesQuantity = 0;
      let totalProfitLoss = 0;
      let totalCustomers = new Set();
      let totalMRs = new Set();
      
      for (const sale of salesRecords) {
        const products = sale.products || [];
        const customerName = sale.customerName;
        const mrName = sale.mrName;
        
        if (customerName) totalCustomers.add(customerName);
        if (mrName) totalMRs.add(mrName);
        
        for (const product of products) {
          const productName = product.productName?.toLowerCase() || 'unknown';
          const totalQty = product.totalQty || 0;
          const amount = product.amount || 0;
          const profitLoss = product.profitLoss || 0;
          const sellingPrice = product.sellingPrice || 0;
          
          totalSalesAmount += amount;
          totalSalesQuantity += totalQty;
          totalProfitLoss += profitLoss;
          
          if (!productSales.has(productName)) {
            productSales.set(productName, {
              productName: product.productName,
              totalSalesQty: 0,
              totalQuantity: 0,
              totalAmount: 0,
              totalProfitLoss: 0,
              averageSellingPrice: 0,
              saleCount: 0,
              customers: new Set(),
              mrs: new Set()
            });
          }
          
          const productData = productSales.get(productName);
          productData.totalSalesQty += totalQty;
          productData.totalQuantity += totalQty;
          productData.totalAmount += amount;
          productData.totalProfitLoss += profitLoss;
          productData.saleCount++;
          
          if (customerName) productData.customers.add(customerName);
          if (mrName) productData.mrs.add(mrName);
        }
      }
      
      const salesArray = [];
      for (const [name, data] of productSales.entries()) {
        data.averageSellingPrice = data.totalQuantity > 0 ? (data.totalAmount / data.totalQuantity).toFixed(4) : 0;
        data.profitMargin = data.totalAmount > 0 ? ((data.totalProfitLoss / data.totalAmount) * 100).toFixed(2) : 0;
        data.customers = Array.from(data.customers);
        data.mrs = Array.from(data.mrs);
        salesArray.push(data);
      }
      
      salesArray.sort((a, b) => b.totalQuantity - a.totalQuantity);
      
      const result = {
        collection: 'salesummaries',
        totalRecords: salesRecords.length,
        totalCustomers: totalCustomers.size,
        totalMRs: totalMRs.size,
        totalSalesAmount: totalSalesAmount.toFixed(2),
        totalSalesQuantity: totalSalesQuantity,
        totalProfitLoss: totalProfitLoss.toFixed(2),
        averageProfitMargin: totalSalesAmount > 0 ? ((totalProfitLoss / totalSalesAmount) * 100).toFixed(2) : 0,
        totalProductsSold: salesArray.length,
        productWiseSales: salesArray,
        topSellingProducts: salesArray.slice(0, 10)
      };
      
      console.log(`   Total Sales Amount: $${result.totalSalesAmount}`);
      console.log(`   Total Sales Quantity: ${result.totalSalesQuantity.toLocaleString()} units`);
      console.log(`   Total Profit: $${result.totalProfitLoss}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Error analyzing sales summaries:`, error.message);
      return null;
    }
  }

  /**
   * Compare Sales, Purchase, Stock Adjustments, and Report In Hand
   */
  compareAllData(salesData, purchaseData, adjustmentData, reportData) {
    const comparison = [];
    const salesMap = new Map();
    const purchaseMap = new Map();
    const adjustmentMap = new Map();
    const reportMap = new Map();
    
    // Create maps
    if (salesData) {
      salesData.productWiseSales.forEach(product => {
        salesMap.set(product.productName.toLowerCase(), product);
      });
    }
    
    if (purchaseData) {
      purchaseData.productWisePurchases.forEach(product => {
        purchaseMap.set(product.productName.toLowerCase(), product);
      });
    }
    
    if (adjustmentData) {
      adjustmentData.productAdjustments.forEach(adj => {
        adjustmentMap.set(adj.productId, adj);
      });
    }
    
    if (reportData) {
      reportData.productWiseReport.forEach(report => {
        reportMap.set(report.productName.toLowerCase(), report);
      });
    }
    
    // Get all unique product names from sales and purchase
    const allProducts = new Set([...salesMap.keys(), ...purchaseMap.keys()]);
    
    for (const productName of allProducts) {
      const sales = salesMap.get(productName);
      const purchase = purchaseMap.get(productName);
      const report = reportMap.get(productName);
      
      const salesQty = sales ? sales.totalQuantity : 0;
      const purchaseQty = purchase ? purchase.totalPurchaseQty : 0;
      
      // Get stock adjustment data (if available)
      let addedStock = 0;
      let removedStock = 0;
      let netAdjustment = 0;
      
      if (report) {
        addedStock = report.addStockAdjustment || 0;
        removedStock = report.removeStockAdjustment || 0;
        netAdjustment = addedStock - removedStock;
      }
      
      // Current stock from report in hand
      const currentStock = report ? report.totalBoxes : 0;
      
      comparison.push({
        productName: productName,
        productType: purchase?.type || sales?.type || report?.type || 'N/A',
        sales: {
          quantity: salesQty
        },
        purchase: {
          quantity: purchaseQty
        },
        stockAdjustments: {
          added: addedStock,
          removed: removedStock,
          netAdjustment: netAdjustment
        },
        currentStock: {
          quantity: currentStock,
          status: report?.status || 'Unknown'
        },
        status: currentStock > 0 ? 'In Stock' : (currentStock === 0 ? 'Out of Stock' : 'No Activity')
      });
    }
    
    comparison.sort((a, b) => b.currentStock.quantity - a.currentStock.quantity);
    
    return comparison;
  }

  /**
   * Generate Complete Report
   */
  async generateCompleteReport() {
    console.log('\n🔍 Starting Complete Inventory Analysis...\n');
    console.log('='.repeat(80));
    
    console.log('\n📦 Analyzing Stock Adjustments...');
    console.log('-'.repeat(40));
    const adjustmentData = await this.analyzeStockAdjustments();
    
    console.log('\n📋 Analyzing Report In Hand...');
    console.log('-'.repeat(40));
    const reportData = await this.analyzeReportInHand();
    
    console.log('\n📦 Analyzing Purchase Inventories...');
    console.log('-'.repeat(40));
    const purchaseData = await this.analyzePurchaseInventories();
    
    console.log('\n📊 Analyzing Sales Summaries...');
    console.log('-'.repeat(40));
    const salesData = await this.analyzeSalesSummaries();
    
    const comparison = this.compareAllData(salesData, purchaseData, adjustmentData, reportData);
    
    const expiryAlerts = [];
    if (purchaseData) {
      for (const product of purchaseData.productWisePurchases) {
        if (product.expiringSoonCount > 0) {
          expiryAlerts.push({
            productName: product.productName,
            expiringSoonCount: product.expiringSoonCount,
            expiringSoonQuantity: product.expiringSoonQuantity,
            earliestExpiry: product.earliestExpiry,
            message: `${product.productName}: ${product.expiringSoonQuantity} units expiring soon`
          });
        }
      }
    }
    
    this.results.stockAdjustmentAnalysis = adjustmentData;
    this.results.reportInHandAnalysis = reportData;
    this.results.purchaseAnalysis = purchaseData;
    this.results.salesAnalysis = salesData;
    this.results.productComparison = comparison;
    this.results.expiryAlerts = expiryAlerts;
    this.results.summary = {
      database: 'test',
      analysisDate: this.results.generatedAt,
      totalPurchaseAmount: purchaseData?.totalPurchaseAmount || 0,
      totalSalesAmount: salesData?.totalSalesAmount || 0,
      grossProfit: (salesData?.totalSalesAmount - purchaseData?.totalPurchaseAmount)?.toFixed(2) || 0,
      totalPurchaseQuantity: purchaseData?.totalPurchaseQuantity || 0,
      totalSalesQuantity: salesData?.totalSalesQuantity || 0,
      totalAddedStock: adjustmentData?.totalAddedUnits || 0,
      totalRemovedStock: adjustmentData?.totalRemovedUnits || 0,
      netStockAdjustment: adjustmentData?.netStockAdjustment || 0,
      currentTotalStock: reportData?.totalCurrentStock || 0,
      currentStockValue: reportData?.totalStockValue || 0,
      totalProducts: comparison.length,
      productsInStock: comparison.filter(p => p.currentStock.quantity > 0).length,
      productsOutOfStock: comparison.filter(p => p.currentStock.quantity === 0).length,
      productsWithNegativeStock: comparison.filter(p => p.currentStock.quantity < 0).length
    };
    
    return this.results;
  }

  /**
   * Print Formatted Report
   */
  printReport() {
    console.log('\n' + '='.repeat(120));
    console.log('COMPLETE INVENTORY ANALYSIS REPORT');
    console.log('='.repeat(120));
    console.log(`Generated: ${this.results.generatedAt}`);
    console.log(`Database: ${this.results.summary.database}`);
    
    console.log('\n📊 OVERALL SUMMARY');
    console.log('-'.repeat(80));
    console.log(`💰 Total Purchase Amount: $${this.results.summary.totalPurchaseAmount}`);
    console.log(`💰 Total Sales Amount: $${this.results.summary.totalSalesAmount}`);
    console.log(`📈 Gross Profit: $${this.results.summary.grossProfit}`);
    console.log(`📦 Total Purchase Quantity: ${this.results.summary.totalPurchaseQuantity.toLocaleString()} units`);
    console.log(`📦 Total Sales Quantity: ${this.results.summary.totalSalesQuantity.toLocaleString()} units`);
    console.log(`➕ Total Added Stock: +${this.results.summary.totalAddedStock} units`);
    console.log(`➖ Total Removed Stock: -${this.results.summary.totalRemovedStock} units`);
    console.log(`🔄 Net Stock Adjustment: ${this.results.summary.netStockAdjustment >= 0 ? '+' : ''}${this.results.summary.netStockAdjustment} units`);
    console.log(`📋 Current Total Stock: ${this.results.summary.currentTotalStock.toLocaleString()} units`);
    console.log(`💰 Current Stock Value: $${this.results.summary.currentStockValue.toFixed(2)}`);
    console.log(`📋 Total Unique Products: ${this.results.summary.totalProducts}`);
    console.log(`✅ Products In Stock: ${this.results.summary.productsInStock}`);
    console.log(`⚠️ Products Out of Stock: ${this.results.summary.productsOutOfStock}`);
    
    // Product Comparison Table with Added/Removed columns
    console.log('\n📊 PRODUCT-WISE COMPARISON (Sales vs Purchase vs Stock Adjustments)');
    console.log('='.repeat(140));
    console.log('Product Name'.padEnd(25) + 'Sold'.padEnd(10) + 'Purchased'.padEnd(12) + 'Added'.padEnd(10) + 'Removed'.padEnd(10) + 'Current Stock'.padEnd(12) + 'Status');
    console.log('-'.repeat(140));
    
    this.results.productComparison.slice(0, 20).forEach(product => {
      const name = (product.productName || 'N/A').substring(0, 23).padEnd(25);
      const sold = product.sales.quantity.toLocaleString().padEnd(10);
      const purchased = product.purchase.quantity.toLocaleString().padEnd(12);
      const added = product.stockAdjustments.added.toLocaleString().padEnd(10);
      const removed = product.stockAdjustments.removed.toLocaleString().padEnd(10);
      const currentStock = product.currentStock.quantity.toLocaleString().padEnd(12);
      const status = product.status.substring(0, 20);
      console.log(`${name}${sold}${purchased}${added}${removed}${currentStock}${status}`);
    });
    
    // Report In Hand Details
    if (this.results.reportInHandAnalysis) {
      console.log('\n📋 REPORT IN HAND - CURRENT STOCK DETAILS');
      console.log('-'.repeat(120));
      console.log('Product Name'.padEnd(25) + 'Total Stock'.padEnd(12) + 'Added'.padEnd(10) + 'Removed'.padEnd(10) + 'Status'.padEnd(15) + 'Min Level');
      console.log('-'.repeat(120));
      
      this.results.reportInHandAnalysis.productWiseReport.slice(0, 20).forEach(report => {
        const name = (report.productName || 'N/A').substring(0, 23).padEnd(25);
        const stock = report.totalBoxes.toLocaleString().padEnd(12);
        const added = (report.addStockAdjustment || 0).toLocaleString().padEnd(10);
        const removed = (report.removeStockAdjustment || 0).toLocaleString().padEnd(10);
        const status = (report.status || 'Unknown').padEnd(15);
        const minLevel = (report.minStockLevel || 0).toString();
        console.log(`${name}${stock}${added}${removed}${status}${minLevel}`);
      });
    }
    
    // Expiry Alerts
    if (this.results.expiryAlerts.length > 0) {
      console.log('\n⚠️ EXPIRY ALERTS (Products expiring within 90 days)');
      console.log('-'.repeat(80));
      this.results.expiryAlerts.forEach(alert => {
        const daysToExpiry = Math.ceil((new Date(alert.earliestExpiry) - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`• ${alert.productName}: ${alert.expiringSoonQuantity.toLocaleString()} units expiring in ${daysToExpiry} days`);
      });
    }
    
    console.log('\n' + '='.repeat(120));
    console.log('✅ Analysis Complete');
    console.log('='.repeat(120) + '\n');
  }

  /**
   * Export to CSV with Added/Removed columns
   */
  exportToCSV() {
    let csv = 'Product Name,Type,Sales Quantity,Purchase Quantity,Stock Added,Stock Removed,Net Adjustment,Current Stock,Stock Status\n';
    
    this.results.productComparison.forEach(product => {
      csv += `"${product.productName}","${product.productType}",${product.sales.quantity},${product.purchase.quantity},${product.stockAdjustments.added},${product.stockAdjustments.removed},${product.stockAdjustments.netAdjustment},${product.currentStock.quantity},${product.currentStock.status}\n`;
    });
    
    return csv;
  }

  /**
   * Export to JSON
   */
  toJSON() {
    return JSON.stringify(this.results, null, 2);
  }
}

/**
 * Main Execution
 */
async function main() {
  const analyzer = new CompleteInventoryAnalyzer();
  
  try {
    const connected = await analyzer.connect();
    if (!connected) {
      console.error('Failed to connect to MongoDB');
      return;
    }
    
    await analyzer.generateCompleteReport();
    analyzer.printReport();
    
    fs.writeFileSync('complete_inventory_report.json', analyzer.toJSON());
    fs.writeFileSync('complete_inventory_report.csv', analyzer.exportToCSV());
    
    console.log('📁 Reports exported to:');
    console.log('   • complete_inventory_report.json - Complete JSON data');
    console.log('   • complete_inventory_report.csv - Spreadsheet format');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await analyzer.disconnect();
  }
}

main().catch(console.error);

export { CompleteInventoryAnalyzer };