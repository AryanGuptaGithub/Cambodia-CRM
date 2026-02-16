import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper to format date as "dd Mmm yyyy"
const formatDateForExcel = (date) => {
  if (!date) return "";
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
};

// GET endpoint for cash sales (paginated, grouped by invoice) – unchanged
router.get("/", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchStage = {
      paymentStatus: { $regex: /^cash$/i },
      isReturn: false,
      isExchange: false
    };

    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchStage.deliveryDate.$lte = end;
      }
    }

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
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { deliveryDate: 1 } },
      { $unwind: { path: "$products", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "products.isReturnProduct": false,
          "products.isExchangeProduct": false
        }
      },
      {
        $project: {
          _id: 1,
          date: "$deliveryDate",
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
          paymentMethod: "$paymentStatus",
          deliveryDate: 1,
          invoiceDate: 1,
          mrName: 1,
        },
      },
    ]);

    // Group by invoice
    const groupedSales = [];
    const invoiceMap = new Map();

    sales.forEach(sale => {
      if (!invoiceMap.has(sale.invoiceNumber)) {
        const newSale = {
          ...sale,
          productDetails: [{
            productName: sale.productName,
            salesQty: sale.salesQty,
            bonusQty: sale.bonusQty,
            totalQty: sale.totalQty,
            sellingPrice: sale.sellingPrice,
            amount: sale.amount,
            discount: sale.discount,
            netSellingAmount: sale.netSellingAmount
          }],
          totalAmount: sale.netSellingAmount,
          totalQuantity: sale.totalQty
        };
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
        const existingSale = invoiceMap.get(sale.invoiceNumber);
        existingSale.productDetails.push({
          productName: sale.productName,
          salesQty: sale.salesQty,
          bonusQty: sale.bonusQty,
          totalQty: sale.totalQty,
          sellingPrice: sale.sellingPrice,
          amount: sale.amount,
          discount: sale.discount,
          netSellingAmount: sale.netSellingAmount
        });
        existingSale.totalAmount += sale.netSellingAmount;
        existingSale.totalQuantity += sale.totalQty;
      }
    });

    const processedSales = groupedSales.map((sale, index) => ({
      serialNo: index + 1,
      ...sale,
      productCount: sale.productDetails.length,
      displayProducts: sale.productDetails
    }));

    const totalSalesAmount = processedSales.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);
    const totalQuantity = processedSales.reduce((sum, sale) => sum + (sale.totalQuantity || 0), 0);

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

// ✅ NEW /export/excel – matches the layout in the image
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // Build match conditions (same as GET endpoint)
    const matchStage = {
      paymentStatus: { $regex: /^cash$/i },
      isReturn: false,
      isExchange: false
    };

    if (startDate || endDate) {
      matchStage.deliveryDate = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        matchStage.deliveryDate.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid endDate format",
          });
        }
        end.setHours(23, 59, 59, 999);
        matchStage.deliveryDate.$lte = end;
      }
    }

    // Get all cash sale product lines (no grouping)
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
      {
        $unwind: {
          path: "$customerInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { deliveryDate: 1 } },
      { $unwind: { path: "$products", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "products.isReturnProduct": false,
          "products.isExchangeProduct": false
        }
      },
      {
        $project: {
          date: "$deliveryDate",
          invoiceNumber: 1,
          customerName: { $ifNull: ["$customerInfo.name", "$customerName"] },
          productName: "$products.productName",
          amount: "$products.netSellingAmount",
        },
      },
    ]);

    // Calculate total sales amount
    const totalSalesAmount = sales.reduce((sum, s) => sum + (s.amount || 0), 0);
    const recordCount = sales.length;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cash Sales System';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Cash Sales');

    // --- Title: "Total Cash Sales" ---
    worksheet.mergeCells('A1:F1');
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = 'Total Cash Sales';
    titleRow.getCell(1).font = { bold: true, size: 16 };
    titleRow.getCell(1).alignment = { horizontal: 'center' };

    // --- Filter information (inferred from dates) ---
    let filterLabel = '';
    if (startDate && endDate) {
      // Simple label: you can improve this if needed
      filterLabel = `Active Filter: ${formatDateForExcel(startDate)} to ${formatDateForExcel(endDate)}`;
    } else {
      filterLabel = 'Active Filter: All Records';
    }
    filterLabel += ` (${recordCount} records found)`;

    worksheet.mergeCells('A3:F3');
    const filterRow = worksheet.getRow(3);
    filterRow.getCell(1).value = filterLabel;
    filterRow.getCell(1).font = { italic: true, color: { argb: 'FF555555' } };
    filterRow.getCell(1).alignment = { horizontal: 'left' };

    // --- Total Sales Card (like in the image) ---
    worksheet.mergeCells('A5:C5');
    const totalCardRow = worksheet.getRow(5);
    totalCardRow.getCell(1).value = `Total Cash Sales: $${totalSalesAmount.toFixed(2)}`;
    totalCardRow.getCell(1).font = { bold: true, size: 14 };
    totalCardRow.getCell(1).alignment = { horizontal: 'left' };
    totalCardRow.height = 30;

    // --- Empty row before table ---
    worksheet.addRow([]);

    // --- Table Headers (row 7) ---
    const headerRowNum = 7;
    worksheet.getCell(`A${headerRowNum}`).value = 'Sr.No';
    worksheet.getCell(`B${headerRowNum}`).value = 'Date';
    worksheet.getCell(`C${headerRowNum}`).value = 'Invoice Number';
    worksheet.getCell(`D${headerRowNum}`).value = 'Customer';
    worksheet.getCell(`E${headerRowNum}`).value = 'Product';
    worksheet.getCell(`F${headerRowNum}`).value = 'Amount ($)';

    const headerRow = worksheet.getRow(headerRowNum);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    });

    // --- Data Rows ---
    sales.forEach((sale, index) => {
      const rowNum = headerRowNum + index + 1;
      const row = worksheet.getRow(rowNum);

      row.getCell(1).value = index + 1;                     // Sr.No
      row.getCell(2).value = formatDateForExcel(sale.date); // Date
      row.getCell(3).value = sale.invoiceNumber || 'N/A';   // Invoice Number
      row.getCell(4).value = sale.customerName || 'N/A';    // Customer
      row.getCell(5).value = sale.productName || 'N/A';     // Product
      row.getCell(6).value = parseFloat(sale.amount || 0);  // Amount
      row.getCell(6).numFmt = '"$"#,##0.00';

      // Center Sr.No
      row.getCell(1).alignment = { horizontal: 'center' };
    });

    // --- Apply borders to all cells in the table (headers + data) ---
    const lastRowNum = headerRowNum + sales.length;
    for (let i = headerRowNum; i <= lastRowNum; i++) {
      const row = worksheet.getRow(i);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }

    // --- Auto-size columns ---
    worksheet.columns = [
      { key: 'srno', width: 8 },
      { key: 'date', width: 15 },
      { key: 'invoice', width: 20 },
      { key: 'customer', width: 30 },
      { key: 'product', width: 30 },
      { key: 'amount', width: 15 },
    ];

    // --- Generate filename ---
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    let fileName = 'cash-sales';
    if (startDate && endDate) {
      fileName = `cash-sales-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `cash-sales-${formattedDate.replace(/-/g, '')}`;
    }
    fileName += '.xlsx';

    // Set response headers
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    // Write workbook to buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (err) {
    console.error("Error in /export/excel (cash sales):", err);
    res.status(500).json({
      error: "Failed to generate Excel export",
      message: err.message,
    });
  }
});

export default router;