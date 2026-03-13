import express from "express";
import ExcelJS from "exceljs";
import Product from "../../models/projectManger/product.js";
import ReportInHand from "../../models/reports/reportsInHand.js";
import SaleSummary from "../../models/sale/saleSummary.js";
import Purchase from "../../models/purcharsing/purchaseInventory.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Normalize product names for matching
// ─────────────────────────────────────────────────────────────────────────────
const normalizeProductName = (name) => {
  if (!name) return "";
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Weighted average price across all filtered sales
// Formula: sum(netSellingAmount) / sum(salesQty + bonusQty)
// ─────────────────────────────────────────────────────────────────────────────
const calculateWeightedAveragePrice = (salesArray) => {
  const totalAmount = salesArray.reduce(
    (s, sale) => s + (sale.netSellingAmount || 0),
    0
  );
  const totalQty = salesArray.reduce((s, sale) => s + (sale.totalQty || 0), 0);
  if (totalQty === 0) return 0;
  return totalAmount / totalQty;
};

// ─────────────────────────────────────────────────────────────────────────────
// CORE: Build processed product list (shared by all endpoints)
// Accepts period, month, year, startDate, endDate for flexible filtering
// ─────────────────────────────────────────────────────────────────────────────
async function buildProductReport({
  period,
  month,
  year,
  startDate,
  endDate,
}) {
  const [products, reportInHands, saleSummaries, purchases] = await Promise.all(
    [
      Product.find({}).lean(),
      ReportInHand.find({}).lean(),
      SaleSummary.find({}).lean(),
      Purchase.find({}).lean(),
    ]
  );

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  const filterMonth = month ? parseInt(month) : currentMonth;
  const filterYear = year ? parseInt(year) : currentYear;

  return products.map((product) => {
    // ── ReportInHand ───────────────────────────────────────────────────────
    const reportInHand = reportInHands.find(
      (r) =>
        r.productName &&
        normalizeProductName(r.productName) ===
          normalizeProductName(product.productName)
    );

    // ── Purchase data for LC / FOB ─────────────────────────────────────────
    let purchaseProduct;
    const purchaseData = purchases.find((p) =>
      p.products?.some(
        (prod) =>
          normalizeProductName(prod.productName) ===
          normalizeProductName(product.productName)
      )
    );
    if (purchaseData) {
      purchaseProduct = purchaseData.products.find(
        (prod) =>
          normalizeProductName(prod.productName) ===
          normalizeProductName(product.productName)
      );
    }

    const lcPrice = purchaseProduct?.lc || product.lc || 0;
    const fobPrice = purchaseProduct?.fob || product.fob || 0;
    const sellingPrice = product.sellingPrice || 0;
    const productNorm = normalizeProductName(product.productName);

    // ── Collect all matching sales ─────────────────────────────────────────
    const allSales = [];
    saleSummaries.forEach((sale) => {
      if (!sale.products?.length) return;
      sale.products.forEach((sp) => {
        if (!sp.productName || !productNorm) return;
        const spNorm = normalizeProductName(sp.productName);
        const matched =
          spNorm === productNorm ||
          spNorm.includes(productNorm) ||
          productNorm.includes(spNorm);
        if (!matched) return;

        const saleDate = new Date(sale.invoiceDate || sale.createdAt);
        const salesQty = sp.salesQty || sp.qty || 0;
        const bonusQty = sp.bonusQty || 0;
        const totalQty = sp.totalQty || salesQty + bonusQty;
        const netSellingAmount = sp.netSellingAmount || sp.amount || 0;

        allSales.push({
          date: saleDate,
          salesQty,
          bonusQty,
          totalQty,
          netSellingAmount,
          invoiceNumber: sale.invoiceNumber,
          customerName: sale.customerName,
          mrName: sale.mrName,
        });
      });
    });

    // ── Filter sales by selected period or date range ─────────────────────
    let filteredSales;
    if (period === "custom" && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // include the whole end day
      filteredSales = allSales.filter((s) => {
        const d = new Date(s.date);
        return d >= start && d <= end;
      });
    } else if (period === "month") {
      filteredSales = allSales.filter((s) => {
        const d = new Date(s.date);
        return (
          d.getMonth() + 1 === filterMonth && d.getFullYear() === filterYear
        );
      });
    } else if (period === "year") {
      filteredSales = allSales.filter(
        (s) => new Date(s.date).getFullYear() === filterYear
      );
    } else {
      // no filter – return all sales (should not happen with proper params)
      filteredSales = allSales;
    }

    // ── Period totals ──────────────────────────────────────────────────────
    const periodSalesAmount = filteredSales.reduce(
      (s, x) => s + x.netSellingAmount,
      0
    );
    const periodSoldQuantity = filteredSales.reduce(
      (s, x) => s + x.totalQty,
      0
    );

    const weightedAveragePrice = calculateWeightedAveragePrice(filteredSales);

    // ── Profit ─────────────────────────────────────────────────────────────
    let profitMargin = 0;
    let profitAmount = 0;
    if (periodSoldQuantity > 0 && lcPrice > 0) {
      profitAmount = periodSalesAmount - periodSoldQuantity * lcPrice;
      profitMargin =
        periodSalesAmount > 0 ? (profitAmount / periodSalesAmount) * 100 : 0;
    }

    // ── Sold this/last month ───────────────────────────────────────────────
    const soldThisMonth = allSales
      .filter((s) => {
        const d = new Date(s.date);
        return (
          d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear
        );
      })
      .reduce((s, x) => s + x.totalQty, 0);

    const lastMonthNum = currentMonth === 1 ? 12 : currentMonth - 1;
    const lastMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const soldLastMonth = allSales
      .filter((s) => {
        const d = new Date(s.date);
        return (
          d.getMonth() + 1 === lastMonthNum && d.getFullYear() === lastMonthYear
        );
      })
      .reduce((s, x) => s + x.totalQty, 0);

    const currentStock = parseFloat(
      Number(reportInHand?.totalBoxes || 0).toFixed(2)
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
      totalSales: periodSalesAmount,
      soldThisMonth,
      soldLastMonth,
      periodSales: periodSalesAmount,
      periodSoldQuantity,
      profitMargin: `${profitMargin.toFixed(2)}%`,
      profitAmount,
      profitMarginValue: profitMargin,
      enabled: true,
      status,
      supplierName: product.supplierName,
      createdAt: product.createdAt,
      salesData: allSales,
      filteredSales,
      hasSales: allSales.length > 0,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /all – returns product‑wise aggregated data (for the "All" tab)
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

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      processedProducts = processedProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q)
      );
    }
    if (category) {
      processedProducts = processedProducts.filter(
        (p) => p.category === category
      );
    }

    res.json({
      success: true,
      data: processedProducts,
      total: processedProducts.length,
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT ALL ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /mr-wise – aggregate sales by MR
// ─────────────────────────────────────────────────────────────────────────────
router.get("/mr-wise", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate, searchTerm } = req.query;
    const products = await buildProductReport({
      period,
      month,
      year,
      startDate,
      endDate,
    });

    const mrMap = new Map();

    products.forEach((product) => {
      (product.filteredSales || []).forEach((sale) => {
        const mrName = sale.mrName || "Unknown MR";
        if (!mrMap.has(mrName)) {
          mrMap.set(mrName, {
            mrName,
            products: [],
            totalSalesQty: 0,
            totalBonusQty: 0,
            totalQty: 0,
            totalNetAmount: 0,
            totalDiscount: 0,
            totalProfitLoss: 0,
          });
        }
        const mr = mrMap.get(mrName);
        mr.products.push({
          productName: product.name,
          salesQty: sale.salesQty,
          bonusQty: sale.bonusQty,
          totalQty: sale.totalQty,
          sellingPrice: product.sellingPrice,
          discount: 0,
          netSellingAmount: sale.netSellingAmount,
          profitLoss: sale.netSellingAmount - sale.totalQty * product.lcPrice,
        });
        mr.totalSalesQty += sale.salesQty;
        mr.totalBonusQty += sale.bonusQty;
        mr.totalQty += sale.totalQty;
        mr.totalNetAmount += sale.netSellingAmount;
        mr.totalProfitLoss +=
          sale.netSellingAmount - sale.totalQty * product.lcPrice;
      });
    });

    let mrArray = Array.from(mrMap.values());

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      mrArray = mrArray
        .filter(
          (mr) =>
            mr.mrName.toLowerCase().includes(q) ||
            mr.products.some((p) => p.productName.toLowerCase().includes(q))
        )
        .map((mr) => ({
          ...mr,
          products: mr.products.filter((p) =>
            p.productName.toLowerCase().includes(q)
          ),
        }));
    }

    res.json({
      success: true,
      data: mrArray,
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT MR‑WISE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /sample-wise – sample distribution (placeholder – replace with real logic)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/sample-wise", async (req, res) => {
  try {
    const { period, month, year, startDate, endDate } = req.query;

    // TODO: Implement actual sample query. For now return empty array.
    // Example: fetch from a SampleDistribution model and filter by date.
    const sampleData = []; // replace with real aggregation

    res.json({
      success: true,
      data: sampleData,
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT SAMPLE‑WISE ERROR:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /report – original summary endpoint (kept for compatibility)
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

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      processedProducts = processedProducts.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q)
      );
    }
    if (category) {
      processedProducts = processedProducts.filter(
        (p) => p.category === category
      );
    }

    const totalSales = processedProducts.reduce((s, p) => s + p.periodSales, 0);
    const totalProfit = processedProducts.reduce(
      (s, p) => s + p.profitAmount,
      0
    );
    const totalStock = processedProducts.reduce(
      (s, p) => s + p.currentStock,
      0
    );
    const avgProfitMargin =
      processedProducts.length > 0
        ? processedProducts.reduce(
            (s, p) => s + (p.profitMarginValue || 0),
            0
          ) / processedProducts.length
        : 0;

    res.json({
      success: true,
      products: processedProducts,
      total: processedProducts.length,
      summary: {
        totalProducts: processedProducts.length,
        totalSales,
        totalProfit,
        avgProfitMargin,
        totalStock,
      },
    });
  } catch (error) {
    console.error("❌ PRODUCT REPORT ERROR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate product report",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export/excel – generate Excel file from filtered data
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

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      products = products.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.category?.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.supplierName?.toLowerCase().includes(q)
      );
    }
    if (category) {
      products = products.filter((p) => p.category === category);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Product Report System";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Product Report");

    const currentDate = new Date();
    const cm = currentDate.getMonth() + 1;
    const cy = currentDate.getFullYear();

    let salesColumnHeader = "Total Sales";
    if (period === "month") salesColumnHeader = `Sales (Month ${month || cm})`;
    else if (period === "year")
      salesColumnHeader = `Sales (Year ${year || cy})`;
    else if (period === "custom")
      salesColumnHeader = `Sales (Custom Range)`;

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
      { header: "Qty Sold", key: "periodSoldQuantity", width: 13 },
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

    products.forEach((product) => {
      const row = worksheet.addRow({
        name: product.name,
        category: product.category,
        sku: product.sku,
        currentStock: product.currentStock,
        price: product.price.toFixed(4),
        sellingPrice: product.sellingPrice.toFixed(2),
        lcPrice: product.lcPrice.toFixed(2),
        fobPrice: product.fobPrice.toFixed(2),
        periodSales: product.periodSales.toFixed(2),
        periodSoldQuantity: product.periodSoldQuantity,
        profitAmount: product.profitAmount.toFixed(2),
        profitMargin: product.profitMargin,
        supplierName: product.supplierName,
        status: product.status,
      });

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
    });

    worksheet.addRow({});
    const summaryRow = worksheet.addRow({
      name: "TOTAL SUMMARY",
      periodSales: products.reduce((s, p) => s + p.periodSales, 0).toFixed(2),
      profitAmount: products.reduce((s, p) => s + p.profitAmount, 0).toFixed(2),
      profitMargin: `${products.length > 0 ? (products.reduce((s, p) => s + (p.profitMarginValue || 0), 0) / products.length).toFixed(2) : "0.00"}%`,
      currentStock: products.reduce((s, p) => s + p.currentStock, 0).toFixed(2),
    });
    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };

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
    else if (period === "year")
      fileName = `product-report-year-${year || cy}`;
    else if (period === "custom")
      fileName = `product-report-custom-${Date.now()}`;
    fileName += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("❌ EXCEL EXPORT ERROR:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export product report",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /fix-average-prices – one‑time utility to correct averageUnitPrice in existing sales
// ─────────────────────────────────────────────────────────────────────────────
router.get("/fix-average-prices", async (req, res) => {
  try {
    const saleSummaries = await SaleSummary.find({});
    let updatedCount = 0;
    let errorCount = 0;

    for (const sale of saleSummaries) {
      if (!sale.products?.length) continue;
      let changed = false;

      sale.products.forEach((product) => {
        const salesQty = product.salesQty || 0;
        const bonusQty = product.bonusQty || 0;
        const totalQty = salesQty + bonusQty;
        const netSellingAmount =
          product.netSellingAmount || product.amount || 0;
        const correctAvg = totalQty > 0 ? netSellingAmount / totalQty : 0;

        if (Math.abs((product.averageUnitPrice || 0) - correctAvg) > 0.001) {
          product.averageUnitPrice = correctAvg;
          changed = true;
        }
      });

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
    res.status(500).json({
      success: false,
      error: "Failed to fix average prices",
      message: error.message,
    });
  }
});

export default router;