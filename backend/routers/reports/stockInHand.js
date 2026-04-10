import express from "express";
import ReportInHand from "../../models/reports/reportsInHand.js";
import StockInMRHand from "../../models/stock/stockInMRHand.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ==========================================
// Helper functions
// ==========================================
const filterReportsWithBatches = (reports) =>
  reports.filter((r) => Array.isArray(r.batches) && r.batches.length > 0);

// Filter batches that are not expired (expiryDate >= today)
const getNonExpiredBatches = (batches) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return batches.filter((batch) => {
    if (!batch.expiryDate) return true; // No expiry date → treat as valid
    const expiry = new Date(batch.expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return expiry >= today;
  });
};

const buildCombinedProductMap = async (searchFilter = null) => {
  let warehouseQuery = {};
  if (searchFilter)
    warehouseQuery.productName = { $regex: searchFilter, $options: "i" };

  const warehouseReports = await ReportInHand.find(warehouseQuery).sort({
    productName: 1,
  });
  const productMap = new Map();

  for (const report of warehouseReports) {
    if (!report.batches || report.batches.length === 0) continue;
    const name = report.productName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();

    // Filter only non‑expired batches
    const nonExpiredBatches = getNonExpiredBatches(report.batches);
    if (nonExpiredBatches.length === 0) {
      // No usable stock – skip or keep with zero values? We'll keep with zero.
    }

    // Use only non‑expired batches for calculations
    const realBatches = nonExpiredBatches.filter(
      (b) => b.adjustmentType === "batch" || !b.adjustmentType,
    );
    const totalBatchBoxes = realBatches.reduce((s, b) => s + (b.boxes || 0), 0);
    const totalBatchLC = realBatches.reduce(
      (s, b) => s + (b.lc || 0) * (b.boxes || 0),
      0,
    );
    const avgLC = totalBatchBoxes > 0 ? totalBatchLC / totalBatchBoxes : 0;

    const warehouseBoxes = totalBatchBoxes; // Only non‑expired boxes
    const warehouseAmount = realBatches.reduce(
      (s, b) => s + (b.amount || 0),
      0,
    );
    const warehouseDeductions = report.totalMrSaleDeductions || 0;
    const warehouseNetAmount = warehouseAmount - warehouseDeductions;

    productMap.set(key, {
      productName: name,
      warehouseBoxes,
      warehouseAmount: parseFloat(warehouseAmount.toFixed(2)),
      warehouseDeductions,
      warehouseNetAmount: parseFloat(warehouseNetAmount.toFixed(2)),
      netUsableAmount: parseFloat(warehouseNetAmount.toFixed(2)),
      lc: avgLC,
      status:
        report.status || (warehouseBoxes === 0 ? "Out of Stock" : "In Stock"),
      minStockLevel: report.minStockLevel || 0,
      averagePrice: report.averagePrice || 0,
      batches: nonExpiredBatches, // store only non‑expired batches
      type: report.type || "",
      mrBoxes: 0,
      mrAmount: 0,
      mrBreakdown: [],
      totalBoxes: warehouseBoxes,
      totalAmount: parseFloat(warehouseAmount.toFixed(2)),
      totalDeductions: warehouseDeductions,
      totalNetAmount: parseFloat(warehouseNetAmount.toFixed(2)),
    });
  }

  // MR hand stock (no expiry filtering for MR stock, as that’s a different business rule)
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
      const amount = product.amount !== undefined ? product.amount : lc * boxes;
      const assignedQty = product.assignedQuantity || 0;

      if (!productMap.has(key)) {
        productMap.set(key, {
          productName: name,
          warehouseBoxes: 0,
          warehouseAmount: 0,
          warehouseDeductions: 0,
          warehouseNetAmount: 0,
          netUsableAmount: 0,
          lc,
          status: "Out of Stock",
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
      entry.mrBoxes += boxes;
      entry.mrAmount += amount;
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

      entry.totalBoxes = entry.warehouseBoxes + entry.mrBoxes;
      entry.totalAmount = entry.warehouseAmount + entry.mrAmount;
      entry.totalNetAmount = entry.warehouseNetAmount + entry.mrAmount;

      // Update status based on total boxes (warehouse + MR)
      if (entry.totalBoxes === 0) entry.status = "Out of Stock";
      else if (entry.totalBoxes < (entry.minStockLevel || 0))
        entry.status = "Low Stock";
      else entry.status = "In Stock";
    }
  }

  return productMap;
};

const computeSummary = (products) =>
  products.reduce(
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
    },
  );

// ==========================================
// GET /api/stock-in-hand/product/:productName
// ==========================================
router.get("/product/:productName", async (req, res) => {
  try {
    const { productName } = req.params;
    const report = await ReportInHand.findOne({
      productName: { $regex: new RegExp(`^${productName}$`, "i") },
    }).lean();
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Product not found in stock",
      });
    }
    const nonExpiredBatches = getNonExpiredBatches(report.batches || []);
    const totalBoxes = nonExpiredBatches.reduce(
      (s, b) => s + (b.boxes || 0),
      0,
    );
    res.json({
      success: true,
      data: {
        totalBoxes,
        batches: nonExpiredBatches,
      },
    });
  } catch (error) {
    console.error("Error fetching product stock:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/combined-stock
// ==========================================
router.get("/combined-stock", async (req, res) => {
  try {
    const { search } = req.query;
    const productMap = await buildCombinedProductMap(search || null);
    const combinedProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    );
    const summary = computeSummary(combinedProducts);
    res.status(200).json({
      success: true,
      count: combinedProducts.length,
      summary,
      products: combinedProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch combined stock",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/mr-stock-summary
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

        if (!productMap.has(key))
          productMap.set(key, {
            productName: name,
            lc,
            totalMrBoxes: 0,
            totalMrAmount: 0,
            mrBreakdown: [],
          });

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
      a.productName.localeCompare(b.productName),
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch MR stock summary",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand (main dashboard endpoint)
// ==========================================
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    const productMap = await buildCombinedProductMap(search || null);
    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    );

    const inStockCount = allProducts.filter(
      (p) => p.status === "In Stock",
    ).length;
    const lowStockCount = allProducts.filter(
      (p) => p.status === "Low Stock",
    ).length;
    const criticalCount = allProducts.filter(
      (p) => p.status === "Critical",
    ).length;
    const outOfStockCount = allProducts.filter(
      (p) => p.status === "Out of Stock",
    ).length;

    const summary = computeSummary(allProducts);

    res.status(200).json({
      success: true,
      count: allProducts.length,
      total: allProducts.length,
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      totalStockValue: parseFloat(summary.totalWarehouseNetAmount.toFixed(2)),
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      inStockCount,
      lowStockCount,
      criticalCount,
      outOfStockCount,
      reports: allProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/average-price/export
// ==========================================
router.get("/average-price/export", async (req, res) => {
  try {
    const { search } = req.query;
    const productMap = await buildCombinedProductMap(search || null);
    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    );
    const summary = computeSummary(allProducts);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Stock Report");

    worksheet.mergeCells("A1:L1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Combined Stock In Hand Report (Non‑expired Only)";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    let currentRow = 2;
    const addRow = (label, value) => {
      worksheet.mergeCells(`A${currentRow}:C${currentRow}`);
      worksheet.getCell(`A${currentRow}`).value = label;
      worksheet.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
      worksheet.getCell(`D${currentRow}`).value = value;
      worksheet.getCell(`D${currentRow}`).font = { bold: true, size: 11 };
      currentRow++;
    };

    const $ = (n) =>
      `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    addRow(
      "Warehouse Boxes (non‑expired):",
      summary.totalWarehouseBoxes.toLocaleString(),
    );
    addRow("MR Boxes:", summary.totalMrBoxes.toLocaleString());
    addRow("Grand Total Boxes:", summary.totalBoxes.toLocaleString());
    addRow(
      "Warehouse Net Amount (non‑expired):",
      $(summary.totalWarehouseNetAmount),
    );
    addRow("Net Usable Value:", $(summary.totalWarehouseNetAmount));
    addRow("MR Amount:", $(summary.totalMrAmount));
    currentRow++;

    const headerRowNum = currentRow;
    const headers = [
      "Sr.No",
      "Product Name",
      "Category",
      "WH Boxes",
      "WH Amount ($)",
      "WH Deductions ($)",
      "WH Net ($)",
      "MR Boxes",
      "MR Amount ($)",
      "Total Boxes",
      "Avg Price ($)",
    ];
    headers.forEach((h, i) => {
      worksheet.getCell(headerRowNum, i + 1).value = h;
    });
    const hr = worksheet.getRow(headerRowNum);
    hr.font = { bold: true };
    hr.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
    hr.alignment = { horizontal: "center" };

    allProducts.forEach((p, i) => {
      const row = worksheet.getRow(headerRowNum + i + 1);
      row.getCell(1).value = i + 1;
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
      row.getCell(11).value = p.averagePrice || 0;
      row.getCell(11).numFmt = "$#,##0.00";
    });

    worksheet.columns = [
      { width: 8 },
      { width: 35 },
      { width: 18 },
      { width: 12 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
      { width: 12 },
      { width: 16 },
      { width: 12 },
      { width: 14 },
    ];

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
      ? `combined_stock_${search.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`
      : `combined_stock_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to export to Excel",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/efficient (paginated)
// ==========================================
router.get("/efficient", async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const productMap = await buildCombinedProductMap(search || null);
    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
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
      totalStockValue: parseFloat(summary.totalWarehouseNetAmount.toFixed(2)),
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/all (no pagination)
// ==========================================
router.get("/all", async (req, res) => {
  try {
    const { search } = req.query;
    const productMap = await buildCombinedProductMap(search || null);
    const allProducts = Array.from(productMap.values()).sort((a, b) =>
      a.productName.localeCompare(b.productName),
    );
    const summary = computeSummary(allProducts);

    res.status(200).json({
      success: true,
      count: allProducts.length,
      totalBoxes: summary.totalWarehouseBoxes,
      totalAmount: summary.totalWarehouseAmount,
      totalDeductions: summary.totalWarehouseDeductions,
      totalNetAmount: summary.totalWarehouseNetAmount,
      totalStockValue: parseFloat(summary.totalWarehouseNetAmount.toFixed(2)),
      totalMrBoxes: summary.totalMrBoxes,
      totalMrAmount: summary.totalMrAmount,
      grandTotalBoxes: summary.totalBoxes,
      grandTotalAmount: summary.totalAmount,
      grandTotalNetAmount: summary.totalNetAmount,
      reports: allProducts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/summary/total-boxes
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

    const byStatus = {
      "In Stock": {
        warehouseBoxes: 0,
        mrBoxes: 0,
        totalBoxes: 0,
        totalNetAmount: 0,
      },
      "Low Stock": {
        warehouseBoxes: 0,
        mrBoxes: 0,
        totalBoxes: 0,
        totalNetAmount: 0,
      },
      Critical: {
        warehouseBoxes: 0,
        mrBoxes: 0,
        totalBoxes: 0,
        totalNetAmount: 0,
      },
      "Out of Stock": {
        warehouseBoxes: 0,
        mrBoxes: 0,
        totalBoxes: 0,
        totalNetAmount: 0,
      },
    };
    allProducts.forEach((p) => {
      const s = p.status || "Out of Stock";
      if (s in byStatus) {
        byStatus[s].warehouseBoxes += p.warehouseBoxes;
        byStatus[s].mrBoxes += p.mrBoxes;
        byStatus[s].totalBoxes += p.totalBoxes;
        byStatus[s].totalNetAmount += p.totalNetAmount;
      }
    });

    res.status(200).json({
      success: true,
      summary: {
        totalProducts: allProducts.length,
        warehouseBoxes: summary.totalWarehouseBoxes,
        warehouseAmount: summary.totalWarehouseAmount,
        warehouseDeductions: summary.totalWarehouseDeductions,
        warehouseNetAmount: summary.totalWarehouseNetAmount,
        totalStockValue: parseFloat(summary.totalWarehouseNetAmount.toFixed(2)),
        mrBoxes: summary.totalMrBoxes,
        mrAmount: summary.totalMrAmount,
        totalBoxes: summary.totalBoxes,
        totalAmount: summary.totalAmount,
        totalNetAmount: summary.totalNetAmount,
        averageBoxesPerProduct: parseFloat(avgBoxesPerProduct.toFixed(2)),
        averageNetAmountPerProduct: parseFloat(
          avgNetAmountPerProduct.toFixed(2),
        ),
        byStatus,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch summary",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/:id
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const report = await ReportInHand.findById(req.params.id);
    if (!report || !report.batches || report.batches.length === 0)
      return res.status(404).json({
        success: false,
        message: "Report not found or has no batches",
      });

    const nonExpiredBatches = getNonExpiredBatches(report.batches);
    const productName = report.productName?.trim();
    const warehouseAmount = nonExpiredBatches.reduce(
      (s, b) => s + (b.amount || 0),
      0,
    );
    const warehouseDeductions = report.totalMrSaleDeductions || 0;
    const warehouseNetAmount = warehouseAmount - warehouseDeductions;
    const warehouseBoxes = nonExpiredBatches.reduce(
      (s, b) => s + (b.boxes || 0),
      0,
    );

    const mrStockDocs = await StockInMRHand.find({});
    const mrBreakdown = [];
    let mrBoxes = 0,
      mrAmount = 0;

    for (const mrDoc of mrStockDocs) {
      const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();
      const mrName = mrDoc.mrName || "Unknown MR";
      const product = mrDoc.productsInHand?.find(
        (p) =>
          p.productName?.trim().toLowerCase() === productName?.toLowerCase(),
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

    res.status(200).json({
      success: true,
      report: {
        ...report.toObject(),
        netAmount: warehouseNetAmount,
        warehouseBoxes,
        warehouseAmount,
        warehouseDeductions,
        warehouseNetAmount,
        netUsableAmount: parseFloat(warehouseNetAmount.toFixed(2)),
        batches: nonExpiredBatches, // show only non‑expired batches
        mrBoxes,
        mrAmount,
        mrBreakdown,
        totalBoxes: warehouseBoxes + mrBoxes,
        totalAmount: warehouseAmount + mrAmount,
        totalNetAmount: warehouseNetAmount + mrAmount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/search/:productName
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
      a.productName.localeCompare(b.productName),
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
      totalStockValue: parseFloat(summary.totalWarehouseNetAmount.toFixed(2)),
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
    res.status(500).json({
      success: false,
      message: "Failed to search reports",
      error: error.message,
    });
  }
});

// ==========================================
// GET /api/stock-in-hand/supplier/:supplierName
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

    const enrichedReports = await Promise.all(
      filteredReports.map(async (report) => {
        const productName = report.productName?.trim();
        const nonExpiredBatches = getNonExpiredBatches(report.batches);
        const warehouseAmount = nonExpiredBatches.reduce(
          (s, b) => s + (b.amount || 0),
          0,
        );
        const warehouseDeductions = report.totalMrSaleDeductions || 0;
        const warehouseNetAmount = warehouseAmount - warehouseDeductions;
        const warehouseBoxes = nonExpiredBatches.reduce(
          (s, b) => s + (b.boxes || 0),
          0,
        );

        const mrStockDocs = await StockInMRHand.find({});
        const mrBreakdown = [];
        let mrBoxes = 0,
          mrAmount = 0;
        for (const mrDoc of mrStockDocs) {
          const mrId = mrDoc.mrId?.toString() || mrDoc._id.toString();
          const mrName = mrDoc.mrName || "Unknown MR";
          const product = mrDoc.productsInHand?.find(
            (p) =>
              p.productName?.trim().toLowerCase() ===
              productName?.toLowerCase(),
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
        return {
          ...report.toObject(),
          netAmount: warehouseNetAmount,
          warehouseBoxes,
          warehouseAmount,
          warehouseDeductions,
          warehouseNetAmount,
          netUsableAmount: parseFloat(warehouseNetAmount.toFixed(2)),
          batches: nonExpiredBatches,
          mrBoxes,
          mrAmount,
          mrBreakdown,
          totalBoxes: warehouseBoxes + mrBoxes,
          totalAmount: warehouseAmount + mrAmount,
          totalNetAmount: warehouseNetAmount + mrAmount,
        };
      }),
    );

    const paginatedReports = enrichedReports.slice(skip, skip + limitNum);
    const totalBoxesSum = enrichedReports.reduce((s, r) => s + r.totalBoxes, 0);
    const totalAmountSum = enrichedReports.reduce(
      (s, r) => s + r.totalAmount,
      0,
    );
    const totalNetAmountSum = enrichedReports.reduce(
      (s, r) => s + r.totalNetAmount,
      0,
    );
    const totalDeductionsSum = enrichedReports.reduce(
      (s, r) => s + (r.warehouseDeductions || 0),
      0,
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch supplier reports",
      error: error.message,
    });
  }
});

export default router;
