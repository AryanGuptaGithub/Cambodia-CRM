import express from "express";
import ReportInHand from "../../models/reports/reportsInHand.js";
import StockInMRHand from "../../models/stock/stockInMRHand.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ==========================================
// Utility: filter reports with non-empty batches
// ==========================================
const filterReportsWithBatches = (reports) => {
  return reports.filter(
    (report) => Array.isArray(report.batches) && report.batches.length > 0
  );
};

// ==========================================
// Utility: calculate net amount for a warehouse report
// ==========================================
const calculateNetAmount = (report) => {
  const totalAmount = report.totalAmount || 0;
  const totalMrSaleDeductions = report.totalMrSaleDeductions || 0;
  return totalAmount - totalMrSaleDeductions;
};

// ==========================================
// Utility: build combined product map from
// ReportInHand (warehouse) + StockInMRHand (MR hands)
// Returns Map<lowerCaseName, productEntry>
// ==========================================
const buildCombinedProductMap = async (searchFilter = null) => {
  // ── 1. Warehouse stock ──────────────────────────────────
  let warehouseQuery = {};
  if (searchFilter) {
    warehouseQuery.productName = { $regex: searchFilter, $options: "i" };
  }

  const warehouseReports = await ReportInHand.find(warehouseQuery).sort({
    productName: 1,
  });

  const productMap = new Map();

  for (const report of warehouseReports) {
    if (!report.batches || report.batches.length === 0) continue;

    const name = report.productName?.trim();
    if (!name) continue;

    const key = name.toLowerCase();

    // Weighted average LC from real batches
    const realBatches = report.batches.filter(
      (b) => b.adjustmentType === "batch" || !b.adjustmentType
    );
    const totalBatchBoxes = realBatches.reduce((s, b) => s + (b.boxes || 0), 0);
    const totalBatchLC = realBatches.reduce(
      (s, b) => s + (b.lc || 0) * (b.boxes || 0),
      0
    );
    const avgLC = totalBatchBoxes > 0 ? totalBatchLC / totalBatchBoxes : 0;

    const warehouseBoxes = report.totalBoxes || 0;
    const warehouseAmount = report.totalAmount || 0;
    const warehouseDeductions = report.totalMrSaleDeductions || 0;
    const warehouseNetAmount = warehouseAmount - warehouseDeductions;

    productMap.set(key, {
      productName: name,
      // Warehouse fields
      warehouseBoxes,
      warehouseAmount,
      warehouseDeductions,
      warehouseNetAmount,
      lc: avgLC,
      status: report.status || "In Stock",
      minStockLevel: report.minStockLevel || 0,
      averagePrice: report.averagePrice || 0,
      batches: report.batches,
      type: report.type || "",
      // MR fields (to be filled below)
      mrBoxes: 0,
      mrAmount: 0,
      mrBreakdown: [],
      // Combined totals
      totalBoxes: warehouseBoxes,
      totalAmount: warehouseAmount,
      totalDeductions: warehouseDeductions,
      totalNetAmount: warehouseNetAmount,
    });
  }

  // ── 2. MR hand stock ────────────────────────────────────
  const mrStockDocs = await StockInMRHand.find({});

  for (const mrDoc of mrStockDocs) {
    const mrName = mrDoc.mrName || "Unknown MR";
    const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();

    for (const product of mrDoc.productsInHand || []) {
      const name = product.productName?.trim();
      if (!name) continue;
      if (
        searchFilter &&
        !name.toLowerCase().includes(searchFilter.toLowerCase())
      )
        continue;

      const key = name.toLowerCase();
      const boxes = product.quantity || 0;
      const lc = product.lc || 0;
      const amount =
        product.amount !== undefined ? product.amount : lc * boxes;
      const assignedQty = product.assignedQuantity || 0;

      if (!productMap.has(key)) {
        // Product exists only in MR hands, not in warehouse
        productMap.set(key, {
          productName: name,
          warehouseBoxes: 0,
          warehouseAmount: 0,
          warehouseDeductions: 0,
          warehouseNetAmount: 0,
          lc,
          status: "In Stock",
          minStockLevel: 0,
          averagePrice: 0,
          batches: [],
          type: "",
          mrBoxes: 0,
          mrAmount: 0,
          mrBreakdown: [],
          totalBoxes: 0,
          totalAmount: 0,
          totalDeductions: 0,
          totalNetAmount: 0,
        });
      }

      const entry = productMap.get(key);

      // Accumulate MR totals
      entry.mrBoxes += boxes;
      entry.mrAmount += amount;
      if (lc && !entry.lc) entry.lc = lc;

      // MR breakdown per MR
      const existingMR = entry.mrBreakdown.find((m) => m.mrId === mrId);
      if (existingMR) {
        existingMR.boxes += boxes;
        existingMR.amount += amount;
        existingMR.assignedQuantity += assignedQty;
      } else {
        entry.mrBreakdown.push({
          mrId,
          mrName,
          boxes,
          amount,
          assignedQuantity: assignedQty,
        });
      }

      // Recalculate combined totals
      entry.totalBoxes = entry.warehouseBoxes + entry.mrBoxes;
      entry.totalAmount = entry.warehouseAmount + entry.mrAmount;
      // Net amount = warehouse net + MR amount (MR amount is already cost-based)
      entry.totalNetAmount = entry.warehouseNetAmount + entry.mrAmount;
    }
  }

  return productMap;
};

// ==========================================
// Utility: compute summary from productMap values
// ==========================================
const computeSummary = (products) => {
  return products.reduce(
    (acc, p) => {
      acc.totalWarehouseBoxes += p.warehouseBoxes;
      acc.totalMrBoxes += p.mrBoxes;
      acc.totalBoxes += p.totalBoxes;
      acc.totalWarehouseAmount += p.warehouseAmount;
      acc.totalWarehouseDeductions += p.warehouseDeductions || 0;
      acc.totalWarehouseNetAmount += p.warehouseNetAmount || 0;
      acc.totalMrAmount += p.mrAmount;
      acc.totalAmount += p.totalAmount;
      acc.totalNetAmount += p.totalNetAmount;
      return acc;
    },
    {
      totalWarehouseBoxes: 0,
      totalMrBoxes: 0,
      totalBoxes: 0,
      totalWarehouseAmount: 0,
      totalWarehouseDeductions: 0,
      totalWarehouseNetAmount: 0,
      totalMrAmount: 0,
      totalAmount: 0,
      totalNetAmount: 0,
    }
  );
};

// ==========================================
// GET /api/stock-in-hand/combined-stock
// Combined warehouse + MR stock (product-level breakdown)
// ==========================================
router.get("/combined-stock", async (req, res) => {
  try {
    const { search } = req.query;

    const productMap = await buildCombinedProductMap(search || null);

    const combinedProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const summary = computeSummary(combinedProducts);

    res.status(200).json({
      success: true,
      count: combinedProducts.length,
      summary,
      products: combinedProducts,
    });
  } catch (error) {
    console.error("Error fetching combined stock:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch combined stock",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/mr-stock-summary
// MR-only stock summary (product-wise)
// ==========================================
router.get("/mr-stock-summary", async (req, res) => {
  try {
    const { search } = req.query;

    const mrStockDocs = await StockInMRHand.find({});
    const productMap = new Map();

    for (const mrDoc of mrStockDocs) {
      const mrName = mrDoc.mrName || "Unknown MR";
      const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();

      for (const product of mrDoc.productsInHand || []) {
        const name = product.productName?.trim();
        if (!name) continue;
        if (search && !name.toLowerCase().includes(search.toLowerCase()))
          continue;

        const key = name.toLowerCase();
        const boxes = product.quantity || 0;
        const lc = product.lc || 0;
        const amount =
          product.amount !== undefined ? product.amount : lc * boxes;
        const assignedQty = product.assignedQuantity || 0;

        if (!productMap.has(key)) {
          productMap.set(key, {
            productName: name,
            lc,
            totalMrBoxes: 0,
            totalMrAmount: 0,
            mrBreakdown: [],
          });
        }

        const entry = productMap.get(key);
        entry.totalMrBoxes += boxes;
        entry.totalMrAmount += amount;
        if (lc && !entry.lc) entry.lc = lc;

        const existingMR = entry.mrBreakdown.find((m) => m.mrId === mrId);
        if (existingMR) {
          existingMR.boxes += boxes;
          existingMR.amount += amount;
          existingMR.assignedQuantity += assignedQty;
        } else {
          entry.mrBreakdown.push({
            mrId,
            mrName,
            boxes,
            amount,
            assignedQuantity: assignedQty,
          });
        }
      }
    }

    const products = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const totalMrBoxes = products.reduce((s, p) => s + p.totalMrBoxes, 0);
    const totalMrAmount = products.reduce((s, p) => s + p.totalMrAmount, 0);

    res.status(200).json({
      success: true,
      count: products.length,
      summary: { totalMrBoxes, totalMrAmount },
      products,
    });
  } catch (error) {
    console.error("Error fetching MR stock summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock summary",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand
// ✅ COMBINED: warehouse (ReportInHand) + MR (StockInMRHand)
// Returns per-product data with warehouse + MR breakdown
// ==========================================
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;

    const productMap = await buildCombinedProductMap(search || null);

    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    // Status counts (based on warehouse status)
    const inStockCount = allProducts.filter((p) => p.status === "In Stock").length;
    const lowStockCount = allProducts.filter((p) => p.status === "Low Stock").length;
    const criticalCount = allProducts.filter((p) => p.status === "Critical").length;
    const outOfStockCount = allProducts.filter((p) => p.status === "Out of Stock").length;

    const summary = computeSummary(allProducts);

    res.status(200).json({
      success: true,
      count: allProducts.length,
      total: allProducts.length,
      // Warehouse totals
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      // MR totals
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      // Grand combined totals
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      // Status counts
      inStockCount,
      lowStockCount,
      criticalCount,
      outOfStockCount,
      // Products now include both warehouse + MR data
      reports: allProducts,
    });
  } catch (error) {
    console.error("Error fetching combined stock in hands:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/average-price/export
// Export to Excel — combined warehouse + MR
// ==========================================
router.get("/average-price/export", async (req, res) => {
  try {
    const { search } = req.query;

    const productMap = await buildCombinedProductMap(search || null);
    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const summary = computeSummary(allProducts);

    // Overall average price (warehouse-based)
    let totalAvgPrice = 0;
    let validCount = 0;
    allProducts.forEach((p) => {
      if ((p.averagePrice || 0) > 0) {
        totalAvgPrice += p.averagePrice;
        validCount++;
      }
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stock Report");

    // Title
    worksheet.mergeCells("A1:J1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Combined Stock In Hand Report (Warehouse + MR)";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    let currentRow = 2;

    // Summary rows
    const addSummaryRow = (label, value) => {
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
      worksheet.getCell(`D${currentRow}`).value = value;
      worksheet.getCell(`D${currentRow}`).font = { bold: true, size: 11 };
      currentRow++;
    };

    addSummaryRow("Warehouse Boxes:", summary.totalWarehouseBoxes.toLocaleString());
    addSummaryRow("MR Boxes:", summary.totalMrBoxes.toLocaleString());
    addSummaryRow("Grand Total Boxes:", summary.totalBoxes.toLocaleString());
    addSummaryRow(
      "Warehouse Net Amount:",
      `$${summary.totalWarehouseNetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
    addSummaryRow(
      "MR Amount:",
      `$${summary.totalMrAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );
    addSummaryRow(
      "Grand Total Net Amount:",
      `$${summary.grandTotalNetAmount !== undefined ? summary.grandTotalNetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : summary.totalNetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    );

    currentRow += 1;

    // Headers
    const headerRowNum = currentRow;
    const headers = [
      "Sr.No",
      "Product Name",
      "Category",
      "Warehouse Boxes",
      "Warehouse Amount ($)",
      "Warehouse Deductions ($)",
      "Warehouse Net Amount ($)",
      "MR Boxes",
      "MR Amount ($)",
      "Total Boxes",
      "Total Net Amount ($)",
      "Avg Price ($)",
    ];
    headers.forEach((h, i) => {
      worksheet.getCell(headerRowNum, i + 1).value = h;
    });

    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    headerRow.alignment = { horizontal: "center" };

    // Data rows
    allProducts.forEach((p, index) => {
      const rowNum = headerRowNum + index + 1;
      const row = worksheet.getRow(rowNum);

      row.getCell(1).value = index + 1;
      row.getCell(2).value = p.productName || "N/A";
      row.getCell(3).value = p.type || "N/A";
      row.getCell(4).value = p.warehouseBoxes || 0;
      row.getCell(5).value = p.warehouseAmount || 0;
      row.getCell(5).numFmt = "$#,##0.00";
      row.getCell(6).value = p.warehouseDeductions || 0;
      row.getCell(6).numFmt = "$#,##0.00";
      row.getCell(7).value = p.warehouseNetAmount || 0;
      row.getCell(7).numFmt = "$#,##0.00";
      row.getCell(8).value = p.mrBoxes || 0;
      row.getCell(9).value = p.mrAmount || 0;
      row.getCell(9).numFmt = "$#,##0.00";
      row.getCell(10).value = p.totalBoxes || 0;
      row.getCell(11).value = p.totalNetAmount || 0;
      row.getCell(11).numFmt = "$#,##0.00";
      row.getCell(12).value = p.averagePrice || 0;
      row.getCell(12).numFmt = "$#,##0.00";
    });

    // Column widths
    worksheet.columns = [
      { width: 8 },   // Sr.No
      { width: 35 },  // Product Name
      { width: 18 },  // Category
      { width: 16 },  // Warehouse Boxes
      { width: 20 },  // Warehouse Amount
      { width: 22 },  // Warehouse Deductions
      { width: 22 },  // Warehouse Net Amount
      { width: 12 },  // MR Boxes
      { width: 16 },  // MR Amount
      { width: 14 },  // Total Boxes
      { width: 20 },  // Total Net Amount
      { width: 16 },  // Avg Price
    ];

    // Borders
    const dataEndRow = headerRowNum + allProducts.length;
    for (let i = headerRowNum; i <= dataEndRow; i++) {
      worksheet.getRow(i).eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    const fileName = search
      ? `combined_stock_${search.replace(/[^a-z0-9]/gi, "_")}_${new Date()
          .toISOString()
          .slice(0, 10)}.xlsx`
      : `combined_stock_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export to Excel",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/efficient
// Paginated combined stock
// ==========================================
router.get("/efficient", async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productMap = await buildCombinedProductMap(search || null);

    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const summary = computeSummary(allProducts);
    const paginatedProducts = allProducts.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      count: paginatedProducts.length,
      total: allProducts.length,
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      totalPages: Math.ceil(allProducts.length / limitNum),
      currentPage: pageNum,
      reports: paginatedProducts,
    });
  } catch (error) {
    console.error("Error fetching efficient reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/all
// All combined stock (no pagination)
// ==========================================
router.get("/all", async (req, res) => {
  try {
    const { search } = req.query;

    const productMap = await buildCombinedProductMap(search || null);

    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const summary = computeSummary(allProducts);

    res.status(200).json({
      success: true,
      count: allProducts.length,
      // Warehouse
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      // MR
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      // Combined
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      reports: allProducts,
    });
  } catch (error) {
    console.error("Error fetching all reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/:id
// Single product — warehouse data + MR breakdown
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const report = await ReportInHand.findById(req.params.id);

    if (!report || !report.batches || report.batches.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Report not found or has no batches",
      });
    }

    const productName = report.productName?.trim();
    const warehouseAmount = report.totalAmount || 0;
    const warehouseDeductions = report.totalMrSaleDeductions || 0;
    const warehouseNetAmount = warehouseAmount - warehouseDeductions;

    // Fetch MR data for this product
    const mrStockDocs = await StockInMRHand.find({});
    const mrBreakdown = [];
    let mrBoxes = 0;
    let mrAmount = 0;

    for (const mrDoc of mrStockDocs) {
      const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();
      const mrName = mrDoc.mrName || "Unknown MR";

      const product = mrDoc.productsInHand?.find(
        (p) =>
          p.productName?.trim().toLowerCase() === productName?.toLowerCase()
      );

      if (product) {
        const qty = product.quantity || 0;
        const lc = product.lc || 0;
        const amt = product.amount !== undefined ? product.amount : lc * qty;
        mrBoxes += qty;
        mrAmount += amt;
        mrBreakdown.push({
          mrId,
          mrName,
          boxes: qty,
          amount: amt,
          lc,
          assignedQuantity: product.assignedQuantity || 0,
        });
      }
    }

    const reportObj = {
      ...report.toObject(),
      netAmount: warehouseNetAmount,
      warehouseBoxes: report.totalBoxes || 0,
      warehouseAmount,
      warehouseDeductions,
      warehouseNetAmount,
      mrBoxes,
      mrAmount,
      mrBreakdown,
      totalBoxes: (report.totalBoxes || 0) + mrBoxes,
      totalAmount: warehouseAmount + mrAmount,
      totalNetAmount: warehouseNetAmount + mrAmount,
    };

    res.status(200).json({
      success: true,
      report: reportObj,
    });
  } catch (error) {
    console.error("Error fetching report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/search/:productName
// Search by product name — combined
// ==========================================
router.get("/search/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productMap = await buildCombinedProductMap(productName);

    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName)
    );

    const summary = computeSummary(allProducts);
    const paginatedProducts = allProducts.slice(skip, skip + limitNum);

    res.status(200).json({
      success: true,
      count: paginatedProducts.length,
      total: allProducts.length,
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      totalPages: Math.ceil(allProducts.length / limitNum),
      currentPage: pageNum,
      reports: paginatedProducts,
    });
  } catch (error) {
    console.error("Error searching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to search reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/supplier/:supplierName
// Search by supplier name — warehouse only (MR has no supplier)
// ==========================================
router.get("/supplier/:supplierName", async (req, res) => {
  try {
    const { supplierName } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const warehouseReports = await ReportInHand.find({
      supplierName: { $regex: supplierName, $options: "i" },
    }).sort({ createdAt: -1 });

    const filteredReports = filterReportsWithBatches(warehouseReports);

    // For each warehouse product, also fetch MR data
    const enrichedReports = await Promise.all(
      filteredReports.map(async (report) => {
        const productName = report.productName?.trim();
        const mrStockDocs = await StockInMRHand.find({});
        const mrBreakdown = [];
        let mrBoxes = 0;
        let mrAmount = 0;

        for (const mrDoc of mrStockDocs) {
          const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();
          const mrName = mrDoc.mrName || "Unknown MR";
          const product = mrDoc.productsInHand?.find(
            (p) =>
              p.productName?.trim().toLowerCase() === productName?.toLowerCase()
          );
          if (product) {
            const qty = product.quantity || 0;
            const lc = product.lc || 0;
            const amt =
              product.amount !== undefined ? product.amount : lc * qty;
            mrBoxes += qty;
            mrAmount += amt;
            mrBreakdown.push({ mrId, mrName, boxes: qty, amount: amt });
          }
        }

        const warehouseAmount = report.totalAmount || 0;
        const warehouseDeductions = report.totalMrSaleDeductions || 0;
        const warehouseNetAmount = warehouseAmount - warehouseDeductions;

        return {
          ...report.toObject(),
          netAmount: warehouseNetAmount,
          warehouseBoxes: report.totalBoxes || 0,
          warehouseAmount,
          warehouseDeductions,
          warehouseNetAmount,
          mrBoxes,
          mrAmount,
          mrBreakdown,
          totalBoxes: (report.totalBoxes || 0) + mrBoxes,
          totalAmount: warehouseAmount + mrAmount,
          totalNetAmount: warehouseNetAmount + mrAmount,
        };
      })
    );

    const paginatedReports = enrichedReports.slice(skip, skip + limitNum);

    const totalBoxesSum = enrichedReports.reduce(
      (s, r) => s + r.totalBoxes,
      0
    );
    const totalAmountSum = enrichedReports.reduce(
      (s, r) => s + r.totalAmount,
      0
    );
    const totalNetAmountSum = enrichedReports.reduce(
      (s, r) => s + r.totalNetAmount,
      0
    );
    const totalDeductionsSum = enrichedReports.reduce(
      (s, r) => s + (r.warehouseDeductions || 0),
      0
    );

    res.status(200).json({
      success: true,
      count: paginatedReports.length,
      total: filteredReports.length,
      totalBoxes: totalBoxesSum,
      totalAmount: totalAmountSum,
      totalDeductions: totalDeductionsSum,
      totalNetAmount: totalNetAmountSum,
      totalPages: Math.ceil(filteredReports.length / limitNum),
      currentPage: pageNum,
      reports: paginatedReports,
    });
  } catch (error) {
    console.error("Error fetching supplier reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/summary/total-boxes
// Summary with combined warehouse + MR totals
// ==========================================
router.get("/summary/total-boxes", async (req, res) => {
  try {
    const productMap = await buildCombinedProductMap(null);

    const allProducts = Array.from(productMap.values());
    const summary = computeSummary(allProducts);

    const avgBoxesPerProduct =
      allProducts.length > 0 ? summary.totalBoxes / allProducts.length : 0;
    const avgNetAmountPerProduct =
      allProducts.length > 0 ? summary.totalNetAmount / allProducts.length : 0;

    // Group by warehouse status
    const byStatus = {
      "In Stock": { warehouseBoxes: 0, mrBoxes: 0, totalBoxes: 0, totalNetAmount: 0 },
      "Low Stock": { warehouseBoxes: 0, mrBoxes: 0, totalBoxes: 0, totalNetAmount: 0 },
      Critical: { warehouseBoxes: 0, mrBoxes: 0, totalBoxes: 0, totalNetAmount: 0 },
      "Out of Stock": { warehouseBoxes: 0, mrBoxes: 0, totalBoxes: 0, totalNetAmount: 0 },
    };

    allProducts.forEach((p) => {
      const status = p.status || "Out of Stock";
      if (byStatus.hasOwnProperty(status)) {
        byStatus[status].warehouseBoxes += p.warehouseBoxes;
        byStatus[status].mrBoxes += p.mrBoxes;
        byStatus[status].totalBoxes += p.totalBoxes;
        byStatus[status].totalNetAmount += p.totalNetAmount;
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: allProducts.length,
        // Warehouse
        warehouseBoxes: summary.totalWarehouseBoxes,
        warehouseAmount: summary.totalWarehouseAmount,
        warehouseDeductions: summary.totalWarehouseDeductions,
        warehouseNetAmount: summary.totalWarehouseNetAmount,
        // MR
        mrBoxes: summary.totalMrBoxes,
        mrAmount: summary.totalMrAmount,
        // Combined
        totalBoxes: summary.totalBoxes,
        totalAmount: summary.totalAmount,
        totalNetAmount: summary.totalNetAmount,
        averageBoxesPerProduct: parseFloat(avgBoxesPerProduct.toFixed(2)),
        averageNetAmountPerProduct: parseFloat(avgNetAmountPerProduct.toFixed(2)),
        byStatus,
      },
    });
  } catch (error) {
    console.error("Error fetching total boxes summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch summary",
      error: error.message,
    });
  }
});

export default router;
