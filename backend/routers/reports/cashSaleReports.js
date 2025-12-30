import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from 'exceljs';

const router = express.Router();

router.get("/reports/cash-sales", async (req, res) => {
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

    // First, get all cash sales with their product details
    const sales = await Sale.aggregate([
      {
        $match: matchStage,
      },
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
      {
        $sort: { deliveryDate: 1 },
      },
      {
        $unwind: {
          path: "$products",
          preserveNullAndEmptyArrays: true,
        },
      },
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
          customerName: {
            $ifNull: ["$customerInfo.name", "$customerName"]
          },
          customerCode: 1,
          productName: "$products.productName",
          salesQty: "$products.salesQty",
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice", // Add sellingPrice
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

    // Group by invoice to combine product details
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
            sellingPrice: sale.sellingPrice, // Add sellingPrice
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
        delete newSale.sellingPrice; // Add this
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
          sellingPrice: sale.sellingPrice, // Add sellingPrice
          amount: sale.amount,
          discount: sale.discount,
          netSellingAmount: sale.netSellingAmount
        });
        existingSale.totalAmount += sale.netSellingAmount;
        existingSale.totalQuantity += sale.totalQty;
      }
    });

    // Add serial numbers
    const processedSales = groupedSales.map((sale, index) => ({
      serialNo: index + 1,
      ...sale,
      productCount: sale.productDetails.length,
      displayProducts: sale.productDetails
    }));

    // Calculate total sales amount
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

// Add this Excel export route for cash sales
router.get("/reports/cash-sales/export/excel", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    console.log("Cash sales Excel export request received with params:", {
      startDate,
      endDate
    });

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

    // Fetch sales with product details
    const sales = await Sale.aggregate([
      {
        $match: matchStage,
      },
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
      {
        $sort: { deliveryDate: 1 },
      },
      {
        $unwind: {
          path: "$products",
          preserveNullAndEmptyArrays: true,
        },
      },
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
          customerName: {
            $ifNull: ["$customerInfo.name", "$customerName"]
          },
          customerCode: 1,
          productName: "$products.productName",
          salesQty: "$products.salesQty",
          bonusQty: "$products.bonusQty",
          totalQty: "$products.totalQty",
          sellingPrice: "$products.sellingPrice", // Add sellingPrice
          amount: "$products.amount",
          discount: "$products.discount",
          netSellingAmount: "$products.netSellingAmount",
          mrName: 1,
        },
      },
    ]);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Cash Sales System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Cash Sales Report');
    
    // Define columns - Updated based on the image format
    worksheet.columns = [
      { header: 'S.r.No', key: 'serialNo', width: 8 },
      { header: 'Product Name', key: 'productName', width: 30 },
      { header: 'Sales Qty', key: 'salesQty', width: 12 },
      { header: 'Bonus Qty', key: 'bonusQty', width: 12 },
      { header: 'Total Qty', key: 'totalQty', width: 12 },
      { header: 'Selling Price ($)', key: 'sellingPrice', width: 15 },
      { header: 'Amount ($)', key: 'amount', width: 15 },
    ];

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { 
      horizontal: 'center', 
      vertical: 'middle'
    };
    headerRow.height = 25;
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows with serial numbers
    let rowIndex = 0;
    let totalSalesQty = 0;
    let totalBonusQty = 0;
    let totalQty = 0;
    let totalAmount = 0;
    
    // Group sales by invoice to match the screenshot format
    const invoiceGroups = {};
    
    // First group by invoice number
    sales.forEach(sale => {
      if (!invoiceGroups[sale.invoiceNumber]) {
        invoiceGroups[sale.invoiceNumber] = {
          invoiceNumber: sale.invoiceNumber,
          date: sale.date,
          customerName: sale.customerName,
          customerCode: sale.customerCode,
          mrName: sale.mrName,
          products: []
        };
      }
      invoiceGroups[sale.invoiceNumber].products.push(sale);
    });

    // Process each invoice group
    Object.values(invoiceGroups).forEach((invoice, invoiceIndex) => {
      // Add invoice header row
      rowIndex++;

      
      // Add product rows for this invoice
      invoice.products.forEach((product, productIndex) => {
        rowIndex++;
        const row = worksheet.addRow({
          serialNo: productIndex + 1,
          productName: product.productName || 'N/A',
          salesQty: product.salesQty || 0,
          bonusQty: product.bonusQty || 0,
          totalQty: product.totalQty || 0,
          sellingPrice: product.sellingPrice || 0,
          amount: product.amount || 0
        });

        // Add totals to overall summary
        totalSalesQty += product.salesQty || 0;
        totalBonusQty += product.bonusQty || 0;
        totalQty += product.totalQty || 0;
        totalAmount += product.amount || 0;

        // Style the row
        row.font = { size: 11 };
        row.alignment = { 
          vertical: 'middle',
          horizontal: 'center'
        };

        // Format number cells
        const salesQtyCell = row.getCell('salesQty');
        salesQtyCell.numFmt = '#,##0';
        
        const bonusQtyCell = row.getCell('bonusQty');
        bonusQtyCell.numFmt = '#,##0';
        
        const totalQtyCell = row.getCell('totalQty');
        totalQtyCell.numFmt = '#,##0';
        
        const sellingPriceCell = row.getCell('sellingPrice');
        sellingPriceCell.numFmt = '$#,##0.00';
        
        const amountCell = row.getCell('amount');
        amountCell.numFmt = '$#,##0.00';
      });
      
      // Add invoice total row
      const invoiceTotal = invoice.products.reduce((acc, product) => {
        return {
          salesQty: acc.salesQty + (product.salesQty || 0),
          bonusQty: acc.bonusQty + (product.bonusQty || 0),
          totalQty: acc.totalQty + (product.totalQty || 0),
          amount: acc.amount + (product.amount || 0)
        };
      }, { salesQty: 0, bonusQty: 0, totalQty: 0, amount: 0 });
      
      rowIndex++;
      const invoiceTotalRow = worksheet.addRow({
        serialNo: 'Grand Total:',
        productName: '',
        salesQty: invoiceTotal.salesQty,
        bonusQty: invoiceTotal.bonusQty,
        totalQty: invoiceTotal.totalQty,
        sellingPrice: '',
        amount: invoiceTotal.amount
      });
      
      invoiceTotalRow.font = { bold: true };
      invoiceTotalRow.getCell('amount').numFmt = '$#,##0.00';
      invoiceTotalRow.getCell('salesQty').numFmt = '#,##0';
      invoiceTotalRow.getCell('bonusQty').numFmt = '#,##0';
      invoiceTotalRow.getCell('totalQty').numFmt = '#,##0';
      
      rowIndex++;
      worksheet.addRow({});
    });

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= rowIndex) { // Only apply to rows with data
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      }
    });

    // Generate filename
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = 'cash-sales-report';
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

  } catch (error) {
    console.error("Error in /reports/cash-sales/export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;