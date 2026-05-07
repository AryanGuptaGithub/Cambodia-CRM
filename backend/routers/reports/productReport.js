import express from "express";
import ExcelJS from "exceljs";
import Product from "../../models/projectManager/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import Purchase from "../../models/purchasing/purchaseInventory.js";
import DailySampleReport from "../../models/reports/dailysample.js";

const router = express.Router();

// Normalise product names for consistent comparison
const normalizeProductName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
};

// Check if product has any sales in the period
const hasActivity = (p) =>
  (p.totalSalesQty || 0) > 0 || (p.totalBonusQty || 0) > 0;

// Build a date filter — strictly uses invoiceDate only, never falls back to createdAt
const buildDateFilter = (period, month, year, startDate, endDate) => {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const filterMonth = month ? parseInt(month) : currentMonth;
  const filterYear = year ? parseInt(year) : currentYear;

  if (period === "custom" && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    return (date) => date >= start && date <= end;
  }
  if (period === "month")
    return (date) =>
      date.getMonth() + 1 === filterMonth && date.getFullYear() === filterYear;
  if (period === "year") return (date) => date.getFullYear() === filterYear;
  return () => true;
};

// Remove internal-only fields before sending to client
const stripInternal = (p) => {
  const { _filteredForMR, ...rest } = p;
  return rest;
};

// ─────────────────────────────────────────────────────────────────────────────
// Core report builder (unchanged from your version)
// ─────────────────────────────────────────────────────────────────────────────
async function buildProductReport({ period, month, year, startDate, endDate }) {
  const [products, reportInHands, saleSummaries, purchases] = await Promise.all(
    [
      Product.find({})
        .select(
          "productName type packing sellingPrice lc fob supplierName createdAt",
        )
        .lean(),

      ReportInHand.find({}).select("productName totalBoxes status").lean(),

      SaleSummary.find({})
        .select("products invoiceDate invoiceNumber customerName mrName")
        .sort({ _id: -1 })
        .lean(),

      Purchase.find({}).select("products").lean(),
    ],
  );

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const lastMonthNum = currentMonth === 1 ? 12 : currentMonth - 1;
  const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const reportInHandMap = new Map();
  for (const r of reportInHands) {
    if (r.productName)
      reportInHandMap.set(normalizeProductName(r.productName), r);
  }

  const purchaseProductMap = new Map();
  for (const p of purchases) {
    if (!p.products?.length) continue;
    for (const prod of p.products) {
      const key = normalizeProductName(prod.productName);
      if (key && !purchaseProductMap.has(key))
        purchaseProductMap.set(key, prod);
    }
  }

  // Deduplication map
  const deduplicatedSales = new Map();

  for (const sale of saleSummaries) {
    if (!sale.products?.length) continue;
    if (!sale.invoiceDate) continue;
    const saleDate = new Date(sale.invoiceDate);
    if (isNaN(saleDate.getTime())) continue;

    const invoiceNum = sale.invoiceNumber
      ? String(sale.invoiceNumber)
      : sale._id.toString();

    for (const sp of sale.products) {
      if (!sp.productName) continue;
      const spNorm = normalizeProductName(sp.productName);
      if (!spNorm) continue;

      const salesQty = Number(sp.salesQty ?? sp.qty ?? 0);
      const bonusQty = Number(sp.bonusQty ?? 0);
      const combinedQty = salesQty + bonusQty;
      const netSellingAmount = Number(sp.netSellingAmount ?? sp.amount ?? 0);

      const dedupKey = `${invoiceNum}|${spNorm}`;
      const existing = deduplicatedSales.get(dedupKey);

      if (!existing) {
        deduplicatedSales.set(dedupKey, {
          productNorm: spNorm,
          date: saleDate,
          salesQty,
          bonusQty,
          totalQty: combinedQty,
          netSellingAmount,
          invoiceNumber: invoiceNum,
          customerName: sale.customerName,
          mrName: sale.mrName,
        });
      } else if (combinedQty > existing.totalQty) {
        deduplicatedSales.set(dedupKey, {
          productNorm: spNorm,
          date: saleDate,
          salesQty,
          bonusQty,
          totalQty: combinedQty,
          netSellingAmount,
          invoiceNumber: invoiceNum,
          customerName: sale.customerName,
          mrName: sale.mrName,
        });
      }
    }
  }

  const salesByProduct = new Map();
  for (const entry of deduplicatedSales.values()) {
    if (!salesByProduct.has(entry.productNorm))
      salesByProduct.set(entry.productNorm, []);
    salesByProduct.get(entry.productNorm).push(entry);
  }

  const passesDateFilter = buildDateFilter(
    period,
    month,
    year,
    startDate,
    endDate,
  );

  return products
    .map((product) => {
      const productNorm = normalizeProductName(product.productName);
      if (!productNorm) return null;

      const reportInHand = reportInHandMap.get(productNorm);
      const purchaseProduct = purchaseProductMap.get(productNorm);
      const lcPrice = purchaseProduct?.lc || product.lc || 0;
      const fobPrice = purchaseProduct?.fob || product.fob || 0;
      const sellingPrice = product.sellingPrice || 0;

      const allSales = salesByProduct.get(productNorm) || [];

      let periodNet = 0,
        periodSalesQty = 0,
        periodBonusQty = 0;
      let soldThisMonth = 0,
        soldLastMonth = 0;
      const filteredForMR = [];

      for (const s of allSales) {
        const d = s.date;
        const dm = d.getMonth() + 1,
          dy = d.getFullYear();

        if (dm === currentMonth && dy === currentYear)
          soldThisMonth += s.totalQty;
        if (dm === lastMonthNum && dy === lastMonthYear)
          soldLastMonth += s.totalQty;

        if (passesDateFilter(d)) {
          periodNet += s.netSellingAmount;
          periodSalesQty += s.salesQty;
          periodBonusQty += s.bonusQty;
          filteredForMR.push(s);
        }
      }

      const periodSoldQuantity = periodSalesQty + periodBonusQty;
      const weightedAveragePrice =
        periodSoldQuantity > 0 ? periodNet / periodSoldQuantity : 0;

      let profitMargin = 0,
        profitAmount = 0;
      if (periodSoldQuantity > 0 && lcPrice > 0) {
        profitAmount = periodNet - periodSoldQuantity * lcPrice;
        profitMargin = periodNet > 0 ? (profitAmount / periodNet) * 100 : 0;
      }

      const currentStock = parseFloat(
        Number(reportInHand?.totalBoxes || 0).toFixed(2),
      );
      const status = reportInHand?.status || "Unknown";

      return {
        _id: product._id,
        name: product.productName,
        category: product.type || "Uncategorized",
        sku: product.packing || "N/A",
        currentStock,
        price: weightedAveragePrice,
        weightedAveragePrice,
        sellingPrice,
        cost: lcPrice,
        lcPrice,
        fobPrice,
        totalSales: periodNet,
        soldThisMonth,
        soldLastMonth,
        periodSales: periodNet,
        periodSoldQuantity,
        totalSalesQty: periodSalesQty,
        totalBonusQty: periodBonusQty,
        profitMargin: `${profitMargin.toFixed(2)}%`,
        profitAmount,
        profitMarginValue: profitMargin,
        enabled: true,
        status,
        supplierName: product.supplierName,
        createdAt: product.createdAt,
        hasSales: allSales.length > 0,
        _filteredForMR: filteredForMR,
      };
    })
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /all
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm, category } =
      req.query;

    let processedProducts = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    processedProducts = processedProducts.filter(hasActivity);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      processedProducts = processedProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q),
      );
    }
    if (category)
      processedProducts = processedProducts.filter(
        (p) => p.category === category,
      );

    let totalNet = 0,
      totalQty = 0,
      totalSalesQty = 0,
      totalBonusQty = 0;
    let totalProfit = 0,
      totalStock = 0,
      totalThisMonth = 0,
      totalLastMonth = 0;

    for (const p of processedProducts) {
      totalNet += p.periodSales;
      totalQty += p.periodSoldQuantity;
      totalSalesQty += p.totalSalesQty;
      totalBonusQty += p.totalBonusQty;
      totalProfit += p.profitAmount;
      totalStock += p.currentStock;
      totalThisMonth += p.soldThisMonth;
      totalLastMonth += p.soldLastMonth;
    }

    res.json({
      success: true,
      data: processedProducts.map(stripInternal),
      total: processedProducts.length,
      grandTotal: {
        totalProducts: processedProducts.length,
        totalCurrentStock: parseFloat(totalStock.toFixed(2)),
        totalSalesQty,
        totalBonusQty,
        totalQty,
        totalNetAmount: parseFloat(totalNet.toFixed(2)),
        totalProfitAmount: parseFloat(totalProfit.toFixed(2)),
        grandAvgPrice:
          totalQty > 0 ? parseFloat((totalNet / totalQty).toFixed(4)) : 0,
        totalSoldThisMonth: totalThisMonth,
        totalSoldLastMonth: totalLastMonth,
      },
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT ALL ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-wise
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-wise", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm, mrName } =
      req.query;

    const products = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    const mrMap = new Map();

    for (const product of products) {
      for (const sale of product._filteredForMR || []) {
        if ((sale.salesQty || 0) === 0 && (sale.bonusQty || 0) === 0) continue;

        const saleMrName = sale.mrName || "Unknown MR";
        if (!mrMap.has(saleMrName)) {
          mrMap.set(saleMrName, {
            mrName: saleMrName,
            products: new Map(),
            totalSalesQty: 0,
            totalBonusQty: 0,
            totalQty: 0,
            totalNetAmount: 0,
            totalProfitLoss: 0,
          });
        }

        const mr = mrMap.get(saleMrName);
        const pn = product.name;
        if (!mr.products.has(pn)) {
          mr.products.set(pn, {
            productName: pn,
            salesQty: 0,
            bonusQty: 0,
            totalQty: 0,
            sellingPrice: product.sellingPrice,
            lcPrice: product.lcPrice,
            netSellingAmount: 0,
            profitLoss: 0,
          });
        }

        const qty = (sale.salesQty || 0) + (sale.bonusQty || 0);
        const prod = mr.products.get(pn);
        prod.salesQty += sale.salesQty;
        prod.bonusQty += sale.bonusQty;
        prod.totalQty += qty;
        prod.netSellingAmount += sale.netSellingAmount;
        prod.profitLoss += sale.netSellingAmount - qty * product.lcPrice;
        mr.totalSalesQty += sale.salesQty;
        mr.totalBonusQty += sale.bonusQty;
        mr.totalQty += qty;
        mr.totalNetAmount += sale.netSellingAmount;
        mr.totalProfitLoss += sale.netSellingAmount - qty * product.lcPrice;
      }
    }

    let mrArray = Array.from(mrMap.values())
      .map((mr) => ({
        mrName: mr.mrName,
        totalSalesQty: mr.totalSalesQty,
        totalBonusQty: mr.totalBonusQty,
        totalQty: mr.totalQty,
        totalNetAmount: parseFloat(mr.totalNetAmount.toFixed(2)),
        totalProfitLoss: parseFloat(mr.totalProfitLoss.toFixed(2)),
        avgPrice:
          mr.totalQty > 0
            ? parseFloat((mr.totalNetAmount / mr.totalQty).toFixed(4))
            : 0,
        products: Array.from(mr.products.values())
          .filter((p) => (p.salesQty || 0) > 0 || (p.bonusQty || 0) > 0)
          .map((p) => ({
            ...p,
            totalQty: p.salesQty + p.bonusQty,
            avgPrice:
              p.salesQty + p.bonusQty > 0
                ? parseFloat(
                    (p.netSellingAmount / (p.salesQty + p.bonusQty)).toFixed(4),
                  )
                : 0,
          })),
      }))
      .filter((mr) => mr.products.length > 0);

    if (mrName) {
      const q = mrName.toLowerCase();
      mrArray = mrArray.filter((mr) => mr.mrName.toLowerCase().includes(q));
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      mrArray = mrArray
        .filter(
          (mr) =>
            mr.mrName.toLowerCase().includes(q) ||
            mr.products.some((p) => p.productName.toLowerCase().includes(q)),
        )
        .map((mr) => ({
          ...mr,
          products: mr.products.filter((p) =>
            p.productName.toLowerCase().includes(q),
          ),
        }));
    }

    let gNet = 0,
      gQty = 0,
      gSales = 0,
      gBonus = 0,
      gPL = 0;
    for (const m of mrArray) {
      gNet += m.totalNetAmount;
      gQty += m.totalQty;
      gSales += m.totalSalesQty;
      gBonus += m.totalBonusQty;
      gPL += m.totalProfitLoss;
    }

    res.json({
      success: true,
      data: mrArray,
      grandTotal: {
        totalSalesQty: gSales,
        totalBonusQty: gBonus,
        totalQty: gQty,
        totalNetAmount: parseFloat(gNet.toFixed(2)),
        totalProfitLoss: parseFloat(gPL.toFixed(2)),
        grandAvgPrice: gQty > 0 ? parseFloat((gNet / gQty).toFixed(4)) : 0,
      },
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT MR‑WISE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /category-wise
// ─────────────────────────────────────────────────────────────────────────────
router.get("/category-wise", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm } = req.query;

    let products = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    products = products.filter(hasActivity);

    const categoryMap = new Map();
    for (const product of products) {
      const category = product.category || "Uncategorized";
      if (!categoryMap.has(category)) {
        categoryMap.set(category, {
          category,
          products: [],
          totalProducts: 0,
          totalCurrentStock: 0,
          totalSalesQty: 0,
          totalBonusQty: 0,
          totalQty: 0,
          totalNetAmount: 0,
          totalProfitAmount: 0,
          totalSoldThisMonth: 0,
          totalSoldLastMonth: 0,
        });
      }
      const cat = categoryMap.get(category);
      cat.totalProducts += 1;
      cat.totalCurrentStock += product.currentStock || 0;
      cat.totalSalesQty += product.totalSalesQty || 0;
      cat.totalBonusQty += product.totalBonusQty || 0;
      cat.totalQty += product.periodSoldQuantity || 0;
      cat.totalNetAmount += product.periodSales || 0;
      cat.totalProfitAmount += product.profitAmount || 0;
      cat.totalSoldThisMonth += product.soldThisMonth || 0;
      cat.totalSoldLastMonth += product.soldLastMonth || 0;
      cat.products.push({
        name: product.name,
        sku: product.sku,
        currentStock: product.currentStock,
        sellingPrice: product.sellingPrice,
        lcPrice: product.lcPrice,
        fobPrice: product.fobPrice,
        avgPrice: product.weightedAveragePrice,
        salesQty: product.totalSalesQty,
        bonusQty: product.totalBonusQty,
        totalQty: product.periodSoldQuantity,
        netSellingAmount: product.periodSales,
        profitAmount: product.profitAmount,
        profitMargin: product.profitMargin,
        profitMarginValue: product.profitMarginValue,
        soldThisMonth: product.soldThisMonth,
        soldLastMonth: product.soldLastMonth,
        status: product.status,
        supplierName: product.supplierName,
      });
    }

    let categoryArray = Array.from(categoryMap.values()).map((cat) => {
      let pmSum = 0;
      for (const p of cat.products) pmSum += p.profitMarginValue || 0;
      const avgProfitMargin =
        cat.products.length > 0 ? pmSum / cat.products.length : 0;
      const catAvgPrice =
        cat.totalQty > 0
          ? parseFloat((cat.totalNetAmount / cat.totalQty).toFixed(4))
          : 0;
      return {
        category: cat.category,
        totalProducts: cat.totalProducts,
        totalCurrentStock: parseFloat(cat.totalCurrentStock.toFixed(2)),
        totalSalesQty: cat.totalSalesQty,
        totalBonusQty: cat.totalBonusQty,
        totalQty: cat.totalQty,
        totalNetAmount: parseFloat(cat.totalNetAmount.toFixed(2)),
        totalProfitAmount: parseFloat(cat.totalProfitAmount.toFixed(2)),
        totalSoldThisMonth: cat.totalSoldThisMonth,
        totalSoldLastMonth: cat.totalSoldLastMonth,
        avgProfitMargin: parseFloat(avgProfitMargin.toFixed(2)),
        avgProfitMarginLabel: `${avgProfitMargin.toFixed(2)}%`,
        avgPrice: catAvgPrice,
        products: cat.products,
      };
    });

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      categoryArray = categoryArray
        .filter(
          (cat) =>
            cat.category.toLowerCase().includes(q) ||
            cat.products.some(
              (p) =>
                p.name.toLowerCase().includes(q) ||
                p.supplierName?.toLowerCase().includes(q),
            ),
        )
        .map((cat) => ({
          ...cat,
          products: cat.products.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.supplierName?.toLowerCase().includes(q),
          ),
        }));
    }

    let gNet = 0,
      gQty = 0,
      gSales = 0,
      gBonus = 0,
      gProfit = 0,
      gStock = 0,
      gThisM = 0,
      gLastM = 0,
      gProducts = 0;
    for (const c of categoryArray) {
      gProducts += c.totalProducts;
      gStock += c.totalCurrentStock;
      gSales += c.totalSalesQty;
      gBonus += c.totalBonusQty;
      gQty += c.totalQty;
      gNet += c.totalNetAmount;
      gProfit += c.totalProfitAmount;
      gThisM += c.totalSoldThisMonth;
      gLastM += c.totalSoldLastMonth;
    }

    res.json({
      success: true,
      data: categoryArray,
      total: categoryArray.length,
      grandTotal: {
        totalProducts: gProducts,
        totalCurrentStock: parseFloat(gStock.toFixed(2)),
        totalSalesQty: gSales,
        totalBonusQty: gBonus,
        totalQty: gQty,
        totalNetAmount: parseFloat(gNet.toFixed(2)),
        totalProfitAmount: parseFloat(gProfit.toFixed(2)),
        totalSoldThisMonth: gThisM,
        totalSoldLastMonth: gLastM,
        grandAvgPrice: gQty > 0 ? parseFloat((gNet / gQty).toFixed(4)) : 0,
      },
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT CATEGORY‑WISE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});
router.get("/sample-wise", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate } = req.query;

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    const filterMonth = month ? parseInt(month) : currentMonth;
    const filterYear = year ? parseInt(year) : currentYear;

    let dateQuery = {};
    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateQuery = { date: { $gte: start, $lte: end } };
    } else if (period === "month") {
      const start = new Date(filterYear, filterMonth - 1, 1);
      const end = new Date(filterYear, filterMonth, 0, 23, 59, 59, 999);
      dateQuery = { date: { $gte: start, $lte: end } };
    } else if (period === "year") {
      const start = new Date(filterYear, 0, 1);
      const end = new Date(filterYear, 11, 31, 23, 59, 59, 999);
      dateQuery = { date: { $gte: start, $lte: end } };
    }

    const samples = await DailySampleReport.find(dateQuery)
      .sort({ date: 1, createdAt: 1 })
      .lean();

    if (samples.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Fetch all sales within the same date range
    const saleDateQuery = dateQuery.date ? { invoiceDate: dateQuery.date } : {};
    const sales = await SaleSummary.find(saleDateQuery)
      .select(
        "products invoiceDate invoiceNumber customerName customerId mrName",
      )
      .lean();

    // Index sales by (customerId, normalized product name)
    const salesByCustomerProduct = new Map();

    for (const sale of sales) {
      if (!sale.products?.length) continue;
      const saleDate = new Date(sale.invoiceDate);
      if (isNaN(saleDate.getTime())) continue;

      for (const prod of sale.products) {
        if (!prod.productName) continue;
        const productNorm = normalizeProductName(prod.productName);
        const key = `${sale.customerId}|${productNorm}`;
        if (!salesByCustomerProduct.has(key)) {
          salesByCustomerProduct.set(key, []);
        }
        salesByCustomerProduct.get(key).push({
          date: saleDate,
          salesQty: prod.salesQty || 0,
          bonusQty: prod.bonusQty || 0,
          totalQty: (prod.salesQty || 0) + (prod.bonusQty || 0),
          netSellingAmount: prod.netSellingAmount || prod.amount || 0,
          profitLoss: prod.profitLoss || 0,
          invoiceNumber: sale.invoiceNumber,
        });
      }
    }

    // Group samples by date
    const dayMap = new Map();

    for (const sample of samples) {
      const d = new Date(sample.date);
      const dateKey = d.toISOString().split("T")[0];

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          date: sample.date,
          dateKey,
          totalSamples: 0,
          entries: [],
        });
      }

      const day = dayMap.get(dateKey);

      // ✅ FIX: Loop through sample.products array (not top-level fields)
      const productsArray = sample.products || [];

      for (const productEntry of productsArray) {
        const productName = productEntry.productName || "—";
        // ✅ FIX: Use totalQty field from the product sub-document
        const sampleQty = Number(productEntry.totalQty) || 0;

        day.totalSamples += sampleQty;

        // Find matching sales for this customer + product
        const productNorm = normalizeProductName(productName);
        const saleKey = `${sample.customerId}|${productNorm}`;
        const salesForCustomerProduct =
          salesByCustomerProduct.get(saleKey) || [];

        // Only sales on or after the sample date
        const relevantSales = salesForCustomerProduct.filter(
          (s) => s.date >= d,
        );

        let totalOrderQty = 0;
        let totalSaleAmount = 0;
        let totalProfit = 0;
        const salesDetails = [];

        for (const s of relevantSales) {
          totalOrderQty += s.totalQty;
          totalSaleAmount += s.netSellingAmount;
          totalProfit += s.profitLoss;
          salesDetails.push({
            invoiceNumber: s.invoiceNumber,
            invoiceDate: s.date,
            salesQty: s.salesQty,
            bonusQty: s.bonusQty,
            totalQty: s.totalQty,
            amount: s.netSellingAmount,
            profit: s.profitLoss,
          });
        }

        day.entries.push({
          srNo: day.entries.length + 1,
          customerName: sample.customerName || "—",
          customerCode: sample.customerCode || "—",
          // ✅ FIX: productName from the product sub-document
          productName: productName,
          // ✅ FIX: sampleQty from the product sub-document's totalQty
          sampleQty: sampleQty,
          orderQty: totalOrderQty,
          saleAmount: totalSaleAmount,
          profit: totalProfit,
          sales: salesDetails,
          hasSale: totalOrderQty > 0,
          mrName: sample.mrName || "—",
          remark: sample.remark || "",
        });
      }
    }

    const result = Array.from(dayMap.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((day) => ({
        date: day.date,
        dateKey: day.dateKey,
        totalSamples: day.totalSamples,
        entries: day.entries,
      }));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error("❌ SAMPLE-WISE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// router.get("/sample-wise", async (req, res) => {
//   try {
//     const { period, month, year, startDate, endDate } = req.query;

//     const currentDate = new Date();
//     const currentMonth = currentDate.getMonth() + 1;
//     const currentYear = currentDate.getFullYear();
//     const filterMonth = month ? parseInt(month) : currentMonth;
//     const filterYear = year ? parseInt(year) : currentYear;

//     // Build MongoDB date range query for samples (same as for sales)
//     let dateQuery = {};
//     if (period === "custom" && startDate && endDate) {
//       const start = new Date(startDate);
//       const end = new Date(endDate);
//       end.setHours(23, 59, 59, 999);
//       dateQuery = { date: { $gte: start, $lte: end } };
//     } else if (period === "month") {
//       const start = new Date(filterYear, filterMonth - 1, 1);
//       const end = new Date(filterYear, filterMonth, 0, 23, 59, 59, 999);
//       dateQuery = { date: { $gte: start, $lte: end } };
//     } else if (period === "year") {
//       const start = new Date(filterYear, 0, 1);
//       const end = new Date(filterYear, 11, 31, 23, 59, 59, 999);
//       dateQuery = { date: { $gte: start, $lte: end } };
//     }

//     // Fetch ALL sample records within the date range – including zero‑qty entries
//     const samples = await DailySampleReport.find(dateQuery)
//       .sort({ date: 1, createdAt: 1 })
//       .lean();

//     if (samples.length === 0) {
//       return res.json({ success: true, data: [] });
//     }

//     // Prepare sale data lookup – fetch all sales within the SAME date range
//     const saleDateQuery = {
//       invoiceDate: dateQuery.date,
//     };

//     const sales = await SaleSummary.find(saleDateQuery)
//       .select("products invoiceDate invoiceNumber customerName customerId")
//       .lean();

//     // Index sales by (customerId, normalized product name)
//     const salesByCustomerProduct = new Map(); // key: `${customerId}|${productNorm}`

//     for (const sale of sales) {
//       if (!sale.products?.length) continue;
//       const saleDate = new Date(sale.invoiceDate);
//       if (isNaN(saleDate.getTime())) continue;

//       for (const prod of sale.products) {
//         if (!prod.productName) continue;
//         const productNorm = normalizeProductName(prod.productName);
//         const key = `${sale.customerId}|${productNorm}`;
//         if (!salesByCustomerProduct.has(key)) {
//           salesByCustomerProduct.set(key, []);
//         }
//         salesByCustomerProduct.get(key).push({
//           date: saleDate,
//           salesQty: prod.salesQty || 0,
//           bonusQty: prod.bonusQty || 0,
//           totalQty: (prod.salesQty || 0) + (prod.bonusQty || 0),
//           netSellingAmount: prod.netSellingAmount || prod.amount || 0,
//           profitLoss: prod.profitLoss || 0,
//           invoiceNumber: sale.invoiceNumber, // ← ADDED for sale details
//         });
//       }
//     }

//     // Group samples by date and enrich with sale data
//     const dayMap = new Map();

//     for (const sample of samples) {
//       const d = new Date(sample.date);
//       const dateKey = d.toISOString().split("T")[0];

//       if (!dayMap.has(dateKey)) {
//         dayMap.set(dateKey, {
//           date: sample.date,
//           dateKey,
//           totalSamples: 0,
//           entries: [],
//         });
//       }

//       const day = dayMap.get(dateKey);
//       const sampleQty = sample.totalQty ?? 0;
//       day.totalSamples += sampleQty;

//       // Find matching sale(s) for this customer + product after sample date
//       const productNorm = normalizeProductName(sample.productName);
//       const saleKey = `${sample.customerId}|${productNorm}`;
//       const salesForCustomerProduct = salesByCustomerProduct.get(saleKey) || [];

//       // Filter sales that occurred on or after the sample date
//       const relevantSales = salesForCustomerProduct.filter((s) => s.date >= d);

//       // Aggregate sale data and collect individual sale details
//       let totalOrderQty = 0;
//       let totalSaleAmount = 0;
//       let totalProfit = 0;
//       const salesDetails = [];

//       for (const s of relevantSales) {
//         totalOrderQty += s.totalQty;
//         totalSaleAmount += s.netSellingAmount;
//         totalProfit += s.profitLoss;

//         salesDetails.push({
//           invoiceNumber: s.invoiceNumber,
//           invoiceDate: s.date,
//           salesQty: s.salesQty,
//           bonusQty: s.bonusQty,
//           totalQty: s.totalQty,
//           amount: s.netSellingAmount,
//           profit: s.profitLoss,
//         });
//       }

//       day.entries.push({
//         srNo: day.entries.length + 1,
//         customerName: sample.customerName || "—",
//         customerCode: sample.customerCode || "—",
//         productName: sample.productName || "—",
//         sampleQty,
//         orderQty: totalOrderQty,
//         saleAmount: totalSaleAmount,
//         profit: totalProfit,
//         sales: salesDetails, // ← attach the list
//         hasSale: totalOrderQty > 0,
//         mrName: sample.mrName || "—",
//         remark: sample.remark || "",
//       });
//     }

//     // Sort days oldest→newest
//     const result = Array.from(dayMap.values())
//       .sort((a, b) => new Date(a.date) - new Date(b.date))
//       .map((day) => ({
//         date: day.date,
//         dateKey: day.dateKey,
//         totalSamples: day.totalSamples,
//         entries: day.entries,
//       }));

//     res.json({ success: true, data: result });
//   } catch (error) {
//     console.error("❌ SAMPLE-WISE ERROR:", error);
//     res.status(500).json({ success: false, error: error.message });
//   }
// });

// ─────────────────────────────────────────────────────────────────────────────
// GET /report  (same as /all but different response shape)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/report", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm, category } =
      req.query;

    let processedProducts = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    processedProducts = processedProducts.filter(hasActivity);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      processedProducts = processedProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q),
      );
    }
    if (category)
      processedProducts = processedProducts.filter(
        (p) => p.category === category,
      );

    let totalSales = 0,
      totalProfit = 0,
      totalStock = 0,
      totalSalesQty = 0;
    let totalBonusQty = 0,
      totalQty = 0,
      pmSum = 0;
    for (const p of processedProducts) {
      totalSales += p.periodSales;
      totalProfit += p.profitAmount;
      totalStock += p.currentStock;
      totalSalesQty += p.totalSalesQty;
      totalBonusQty += p.totalBonusQty;
      totalQty += p.periodSoldQuantity;
      pmSum += p.profitMarginValue || 0;
    }

    res.json({
      success: true,
      products: processedProducts.map(stripInternal),
      total: processedProducts.length,
      summary: {
        totalProducts: processedProducts.length,
        totalSales,
        totalProfit,
        avgProfitMargin:
          processedProducts.length > 0 ? pmSum / processedProducts.length : 0,
        totalStock,
        totalSalesQty,
        totalBonusQty,
        totalQty,
        grandAvgPrice:
          totalQty > 0 ? parseFloat((totalSales / totalQty).toFixed(4)) : 0,
      },
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT ERROR:", error);
    res
      .status(500)
      .json({ success: false, error: error.message, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export/excel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/excel", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm, category } =
      req.query;

    let products = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    products = products.filter(hasActivity);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      products = products.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q),
      );
    }
    if (category) products = products.filter((p) => p.category === category);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Product Report System";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Product Report");

    const cm = new Date().getMonth() + 1,
      cy = new Date().getFullYear();
    let salesColumnHeader = "Total Sales";
    if (period === "month") salesColumnHeader = `Sales (Month ${month || cm})`;
    else if (period === "year")
      salesColumnHeader = `Sales (Year ${year || cy})`;
    else if (period === "custom") salesColumnHeader = `Sales (Custom Range)`;

    worksheet.columns = [
      { header: "Product Name", key: "name", width: 30 },
      { header: "Category", key: "category", width: 20 },
      { header: "SKU/Packing", key: "sku", width: 15 },
      { header: "Current Stock", key: "currentStock", width: 15 },
      { header: "Avg Price ($)", key: "price", width: 18 },
      { header: "Catalogue Price ($)", key: "sellingPrice", width: 18 },
      { header: "LC Price ($)", key: "lcPrice", width: 15 },
      { header: "FOB Price ($)", key: "fobPrice", width: 15 },
      { header: salesColumnHeader + " ($)", key: "periodSales", width: 22 },
      { header: "Sales Qty", key: "totalSalesQty", width: 13 },
      { header: "Bonus Qty", key: "totalBonusQty", width: 13 },
      { header: "Total Qty (S+B)", key: "periodSoldQuantity", width: 15 },
      { header: "Profit Amount ($)", key: "profitAmount", width: 16 },
      { header: "Profit Margin (%)", key: "profitMargin", width: 16 },
      { header: "Supplier", key: "supplierName", width: 25 },
      { header: "Status", key: "status", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    let totalNet = 0,
      totalQty = 0,
      totalSalesQty = 0,
      totalBonusQty = 0,
      totalProfit = 0,
      pmSum = 0,
      totalStock = 0;

    for (const product of products) {
      totalNet += product.periodSales;
      totalQty += product.periodSoldQuantity;
      totalSalesQty += product.totalSalesQty;
      totalBonusQty += product.totalBonusQty;
      totalProfit += product.profitAmount;
      pmSum += product.profitMarginValue || 0;
      totalStock += product.currentStock;

      const row = worksheet.addRow({
        name: product.name,
        category: product.category,
        sku: product.sku,
        currentStock: product.currentStock,
        price: product.weightedAveragePrice.toFixed(4),
        sellingPrice: product.sellingPrice.toFixed(2),
        lcPrice: product.lcPrice.toFixed(2),
        fobPrice: product.fobPrice.toFixed(2),
        periodSales: product.periodSales.toFixed(2),
        totalSalesQty: product.totalSalesQty,
        totalBonusQty: product.totalBonusQty,
        periodSoldQuantity: product.periodSoldQuantity,
        profitAmount: product.profitAmount.toFixed(2),
        profitMargin: product.profitMargin,
        supplierName: product.supplierName,
        status: product.status,
      });

      // Profit margin colour coding
      const pv = product.profitMarginValue || 0;
      const pmCell = row.getCell("profitMargin");
      if (pv > 25) {
        pmCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" },
        };
        pmCell.font = { color: { argb: "FF006100" } };
      } else if (pv > 15) {
        pmCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEB9C" },
        };
        pmCell.font = { color: { argb: "FF9C6500" } };
      } else if (pv > 0) {
        pmCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" },
        };
        pmCell.font = { color: { argb: "FF9C0006" } };
      }

      // Status colour coding
      const stCell = row.getCell("status");
      if (product.status === "In Stock") {
        stCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFC6EFCE" },
        };
        stCell.font = { color: { argb: "FF006100" } };
      } else if (product.status === "Low Stock") {
        stCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFEB9C" },
        };
        stCell.font = { color: { argb: "FF9C6500" } };
      } else {
        stCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFC7CE" },
        };
        stCell.font = { color: { argb: "FF9C0006" } };
      }
    }

    worksheet.addRow({});
    const summaryRow = worksheet.addRow({
      name: "TOTAL SUMMARY",
      periodSales: totalNet.toFixed(2),
      price: totalQty > 0 ? (totalNet / totalQty).toFixed(4) : "0.0000",
      totalSalesQty,
      totalBonusQty,
      periodSoldQuantity: totalQty,
      profitAmount: totalProfit.toFixed(2),
      profitMargin: `${products.length > 0 ? (pmSum / products.length).toFixed(2) : "0.00"}%`,
      currentStock: totalStock.toFixed(2),
    });
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };

    // Auto-fit column widths
    worksheet.columns.forEach((col) => {
      let max = 0;
      col.eachCell({ includeEmpty: true }, (cell) => {
        const len = cell.value ? cell.value.toString().length : 10;
        if (len > max) max = len;
      });
      col.width = Math.max(max + 2, 10);
    });

    let fileName = "product-report";
    if (period === "month")
      fileName = `product-report-month-${month || cm}-${year || cy}`;
    else if (period === "year") fileName = `product-report-year-${year || cy}`;
    else if (period === "custom")
      fileName = `product-report-custom-${Date.now()}`;
    fileName += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ EXCEL EXPORT ERROR:", error);
    res
      .status(500)
      .json({ success: false, error: error.message, message: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /fix-average-prices
// ─────────────────────────────────────────────────────────────────────────────
router.get("/fix-average-prices", async (req, res) => {
  try {
    const saleSummaries = await SaleSummary.find({});
    let updatedCount = 0,
      errorCount = 0;

    for (const sale of saleSummaries) {
      if (!sale.products?.length) continue;
      let changed = false;
      for (const product of sale.products) {
        const salesQty = product.salesQty || 0,
          bonusQty = product.bonusQty || 0;
        const totalQty = salesQty + bonusQty;
        const netSellingAmount =
          product.netSellingAmount || product.amount || 0;
        const correctAvg = totalQty > 0 ? netSellingAmount / totalQty : 0;
        if (Math.abs((product.averageUnitPrice || 0) - correctAvg) > 0.001) {
          product.averageUnitPrice = correctAvg;
          changed = true;
        }
      }
      if (changed) {
        try {
          await sale.save();
          updatedCount++;
        } catch (err) {
          console.error(`Failed sale ${sale._id}:`, err.message);
          errorCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Fixed averageUnitPrice for ${updatedCount} sale records`,
      updatedCount,
      errorCount,
      totalProcessed: saleSummaries.length,
    });
  } catch (error) {
    console.error("❌ FIX AVERAGE PRICES ERROR:", error);
    res
      .status(500)
      .json({ success: false, error: error.message, message: error.message });
  }
});

export default router;
