import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from "exceljs";

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE-SAFE date parsers
// Always use Date.UTC so "2026-04-01" → 2026-04-01T00:00:00Z (never March 31)
// ─────────────────────────────────────────────────────────────────────────────
const parseLocalDateStart = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const parseLocalDateEnd = (dateStr) => {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
};

// Format date as "dd Mmm yyyy" using UTC fields to avoid shift
const formatDateForExcel = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const day = d.getUTCDate().toString().padStart(2, "0");
  const month = d.toLocaleString("default", {
    month: "short",
    timeZone: "UTC",
  });
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Build match stage — filter ONLY by invoiceDate (deliveryDate is often null)
// Include Cash, Paid, Partial Paid
// ─────────────────────────────────────────────────────────────────────────────
const buildMatchStage = (startDate, endDate) => {
  const matchStage = {
    // ✅ Use $expr + $toLower for reliable case-insensitive matching
    $expr: {
      $in: [{ $toLower: "$paymentStatus" }, ["cash", "paid", "partial paid", "credit"]],
    },
    $or: [
      { isReturn: { $exists: false } },
      { isReturn: false },
      { isReturn: null },
    ],
    $and: [
      {
        $or: [
          { isExchange: { $exists: false } },
          { isExchange: false },
          { isExchange: null },
        ],
      },
    ],
  };

  if (startDate || endDate) {
    matchStage.invoiceDate = {};
    if (startDate) {
      const start = parseLocalDateStart(startDate);
      if (start) matchStage.invoiceDate.$gte = start;
    }
    if (endDate) {
      const end = parseLocalDateEnd(endDate);
      if (end) matchStage.invoiceDate.$lte = end;
    }
  }

  return matchStage;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /  — Cash sales list
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate && !parseLocalDateStart(startDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid startDate format" });
    }
    if (endDate && !parseLocalDateEnd(endDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid endDate format" });
    }

    const matchStage = buildMatchStage(startDate, endDate);

    const sales = await Sale.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },

      // Sort by invoiceDate ASC
      { $sort: { invoiceDate: 1 } },

      { $unwind: { path: "$products", preserveNullAndEmptyArrays: true } },

      // Exclude return products
      {
        $match: {
          $or: [
            { "products.isReturnProduct": { $exists: false } },
            { "products.isReturnProduct": false },
            { "products.isReturnProduct": null },
          ],
        },
      },

      {
        $project: {
          _id: 1,
          invoiceDate: 1, // ← always use invoiceDate for display
          invoiceNumber: 1,
          customerName: { $ifNull: ["$customerInfo.name", "$customerName"] },
          customerCode: 1,
          productName: "$products.productName",
          salesQty: "$products.salesQty",
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice",
          amount: "$products.amount",
          discount: "$products.discount",
          netSellingAmount: "$products.netSellingAmount",
          paymentStatus: 1,
          mrName: 1,
          paidAmount: 1,
          totalAmount: 1,
        },
      },
    ]);

    // Group by invoice — paidAmount is the collected amount
    const groupedSales = [];
    const invoiceMap = new Map();

    sales.forEach((sale) => {
      if (!invoiceMap.has(sale.invoiceNumber)) {
        const newSale = {
          ...sale,
          productDetails: [
            {
              productName: sale.productName,
              salesQty: sale.salesQty,
              bonusQty: sale.bonusQty,
              totalQty: sale.totalQty,
              sellingPrice: sale.sellingPrice,
              amount: sale.amount,
              discount: sale.discount,
              netSellingAmount: sale.netSellingAmount,
            },
          ],
          // FIX: Use only paidAmount (actual cash collected), never fallback to totalAmount
          collectedAmount: sale.paidAmount ?? 0,
          totalQuantity: sale.totalQty || 0,
        };

        // Remove flat product fields
        delete newSale.productName;
        delete newSale.salesQty;
        delete newSale.bonusQty;
        delete newSale.totalQty;
        delete newSale.sellingPrice;
        delete newSale.amount;
        delete newSale.discount;
        delete newSale.netSellingAmount;

        invoiceMap.set(sale.invoiceNumber, newSale);
        groupedSales.push(newSale);
      } else {
        const existing = invoiceMap.get(sale.invoiceNumber);
        existing.productDetails.push({
          productName: sale.productName,
          salesQty: sale.salesQty,
          bonusQty: sale.bonusQty,
          totalQty: sale.totalQty,
          sellingPrice: sale.sellingPrice,
          amount: sale.amount,
          discount: sale.discount,
          netSellingAmount: sale.netSellingAmount,
        });
        existing.totalQuantity += sale.totalQty || 0;
        // paidAmount is per invoice — don't add again per product row
      }
    });

    const processedSales = groupedSales.map((sale, index) => ({
      serialNo: index + 1,
      ...sale,
      productCount: sale.productDetails.length,
      displayProducts: sale.productDetails,
    }));

    const totalSalesAmount = processedSales.reduce(
      (sum, s) => sum + (s.collectedAmount || 0),
      0,
    );
    const totalQuantity = processedSales.reduce(
      (sum, s) => sum + (s.totalQuantity || 0),
      0,
    );

    return res.json({
      success: true,
      data: processedSales,
      count: processedSales.length,
      totalSalesAmount,
      totalQuantity,
    });
  } catch (error) {
    console.error("Error in cash-sales report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching cash sales",
      error: error.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /export/excel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (startDate && !parseLocalDateStart(startDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid startDate format" });
    }
    if (endDate && !parseLocalDateEnd(endDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid endDate format" });
    }

    const matchStage = buildMatchStage(startDate, endDate);

    const sales = await Sale.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "customers",
          localField: "customerCode",
          foreignField: "customerCode",
          as: "customerInfo",
        },
      },
      { $unwind: { path: "$customerInfo", preserveNullAndEmptyArrays: true } },
      { $sort: { invoiceDate: 1 } },
      { $unwind: { path: "$products", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: [
            { "products.isReturnProduct": { $exists: false } },
            { "products.isReturnProduct": false },
            { "products.isReturnProduct": null },
          ],
        },
      },
      {
        $project: {
          invoiceDate: 1, // always invoiceDate
          invoiceNumber: 1,
          customerName: { $ifNull: ["$customerInfo.name", "$customerName"] },
          productName: "$products.productName",
          paidAmount: 1,
          totalAmount: 1,
          paymentStatus: 1,
        },
      },
    ]);

    // Group by invoice
    const invoiceMap = new Map();
    const orderedInvoices = [];

    sales.forEach((sale) => {
      if (!invoiceMap.has(sale.invoiceNumber)) {
        invoiceMap.set(sale.invoiceNumber, {
          invoiceDate: sale.invoiceDate,
          invoiceNumber: sale.invoiceNumber,
          customerName: sale.customerName,
          products: [sale.productName].filter(Boolean),
          // FIX: Use only paidAmount, never fallback to totalAmount
          collectedAmount: sale.paidAmount ?? 0,
          paymentStatus: sale.paymentStatus,
        });
        orderedInvoices.push(sale.invoiceNumber);
      } else {
        const existing = invoiceMap.get(sale.invoiceNumber);
        if (sale.productName) existing.products.push(sale.productName);
      }
    });

    const rows = orderedInvoices.map((inv) => invoiceMap.get(inv));
    const totalSalesAmount = rows.reduce(
      (sum, r) => sum + (r.collectedAmount || 0),
      0,
    );
    const recordCount = rows.length;

    // ── Build Excel ───────────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Cash Sales System";
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet("Cash Sales");

    // Title
    worksheet.mergeCells("A1:G1");
    const titleCell = worksheet.getCell("A1");
    titleCell.value = "Total Cash Sales";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center" };

    // Filter info
    let filterLabel =
      startDate && endDate
        ? `Active Filter: ${formatDateForExcel(parseLocalDateStart(startDate))} to ${formatDateForExcel(parseLocalDateEnd(endDate))}`
        : "Active Filter: All Records";
    filterLabel += ` (${recordCount} records found)`;

    worksheet.mergeCells("A3:G3");
    const filterCell = worksheet.getCell("A3");
    filterCell.value = filterLabel;
    filterCell.font = { italic: true, color: { argb: "FF555555" } };
    filterCell.alignment = { horizontal: "left" };

    // Summary
    worksheet.mergeCells("A5:D5");
    const totalCell = worksheet.getCell("A5");
    totalCell.value = `Total Cash Sales (Collected): $${totalSalesAmount.toFixed(2)}`;
    totalCell.font = { bold: true, size: 14 };
    totalCell.alignment = { horizontal: "left" };
    worksheet.getRow(5).height = 30;

    worksheet.addRow([]);

    // Headers
    const headerRowNum = 7;
    [
      "Sr.No",
      "Invoice Date",
      "Invoice Number",
      "Customer",
      "Product(s)",
      "Payment Status",
      "Collected Amount ($)",
    ].forEach((h, i) => {
      const cell = worksheet.getCell(headerRowNum, i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 12 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    worksheet.getRow(headerRowNum).height = 25;

    // Data rows
    rows.forEach((row, index) => {
      const rowNum = headerRowNum + index + 1;
      const values = [
        index + 1,
        formatDateForExcel(row.invoiceDate), // invoiceDate for display
        row.invoiceNumber || "N/A",
        row.customerName || "N/A",
        row.products.join(", ") || "N/A",
        row.paymentStatus || "N/A",
        parseFloat(row.collectedAmount || 0),
      ];
      values.forEach((val, i) => {
        const cell = worksheet.getCell(rowNum, i + 1);
        cell.value = val;
        cell.alignment = {
          horizontal: i === 0 ? "center" : "left",
          vertical: "middle",
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
        if (i === 6) cell.numFmt = '"$"#,##0.00';
      });
    });

    worksheet.columns = [
      { width: 8 },
      { width: 15 },
      { width: 20 },
      { width: 30 },
      { width: 35 },
      { width: 18 },
      { width: 20 },
    ];

    let fileName =
      startDate && endDate
        ? `cash-sales-${startDate.replace(/-/g, "")}-to-${endDate.replace(/-/g, "")}`
        : `cash-sales-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`;
    fileName += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (err) {
    console.error("Error in /export/excel (cash sales):", err);
    res
      .status(500)
      .json({ error: "Failed to generate Excel export", message: err.message });
  }
});

export default router;