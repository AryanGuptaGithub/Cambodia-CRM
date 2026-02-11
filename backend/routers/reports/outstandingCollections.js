import express from "express";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to format customer code to 5 digits with leading zeros
const formatCustomerCode = (code) => {
  if (!code) return code;
  // Convert to string, remove any non-digit characters, then pad with leading zeros to 5 digits
  const numericCode = code.toString().replace(/\D/g, '');
  return numericCode.padStart(5, '0');
};

// Helper function to normalize customer code for comparison (remove leading zeros)
const normalizeCustomerCode = (code) => {
  if (!code) return code;
  // Remove leading zeros for comparison
  return code.toString().replace(/^0+/, '');
};

router.post("/reports/outstanding-collections/bulk-update", async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No update data provided",
      });
    }

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [],
      updated: []
    };

    for (const update of updates) {
      const { invoiceNumber, totalAmount, paidAmount, creditDays, remarks } = update;

      try {
        // Find the sale by invoice number
        const sale = await Sale.findOne({ invoiceNumber: invoiceNumber });

        if (!sale) {
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Invoice not found"
          });
          continue;
        }

        // Validate amounts
        if (totalAmount <= 0) {
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Total amount must be greater than 0"
          });
          continue;
        }

        if (paidAmount < 0) {
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot be negative"
          });
          continue;
        }

        if (paidAmount > totalAmount) {
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot exceed total amount"
          });
          continue;
        }

        // Calculate due amount
        const dueAmount = totalAmount - paidAmount;

        // Prepare update data
        const updateData = {
          totalAmount: totalAmount,
          paidAmount: paidAmount,
          dueAmount: dueAmount,
          paymentStatus: dueAmount > 0 ? "Credit" : "Cash",
          creditDays: creditDays || 0,
        };

        // Update remark if provided
        if (remarks) {
          updateData.remark = remarks;
        }

        // Calculate due date based on invoice date + credit days
        if (dueAmount > 0 && creditDays > 0) {
          const invoiceDate = new Date(sale.invoiceDate);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + creditDays);
          updateData.dueDate = dueDate;
        } else if (dueAmount > 0) {
          // If no credit days, due date is same as invoice date
          updateData.dueDate = sale.invoiceDate;
        }

        // Update the sale
        await Sale.findByIdAndUpdate(sale._id, updateData, { new: true });

        results.successCount++;
        results.updated.push({
          invoiceNumber,
          totalAmount,
          paidAmount,
          dueAmount,
          paymentStatus: updateData.paymentStatus
        });

      } catch (error) {
        console.error(`Error updating invoice ${invoiceNumber}:`, error);
        results.failedCount++;
        results.errors.push({
          invoiceNumber,
          error: error.message || "Unknown error"
        });
      }
    }

    return res.json({
      success: true,
      message: `Updated ${results.successCount} sales successfully. ${results.failedCount} failed.`,
      successCount: results.successCount,
      failedCount: results.failedCount,
      updated: results.updated,
      errors: results.errors
    });

  } catch (error) {
    console.error("Error in bulk update:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during bulk update",
      error: error.message,
    });
  }
});

// Outstanding Collections Report
router.get("/reports/outstanding-collections", async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 7, 
      search,
      customerCode,
      status 
    } = req.query;

    const matchStage = {
      paymentStatus: { $regex: /^credit$/i },
      isReturn: false,
      isExchange: false,
      dueAmount: { $gt: 0 }
    };

    // Handle date filtering
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

    // Handle customer code filter - format to 5 digits
    if (customerCode) {
      matchStage.customerCode = formatCustomerCode(customerCode);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // First, get all sales that match the criteria
    const sales = await Sale.find(matchStage).lean();
    
    if (sales.length === 0) {
      return res.json({
        success: true,
        data: {
          summary: {
            totalOutstandingAmount: 0,
            totalDueAmount: 0,
            totalOverdueAmount: 0,
            totalCustomers: 0,
            totalInvoices: 0,
            totalOverdueInvoices: 0,
            totalRecords: 0
          },
          records: []
        },
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false
        },
        count: 0
      });
    }

    // Format all sale customer codes to 5 digits
    const formattedSales = sales.map(sale => ({
      ...sale,
      formattedCustomerCode: formatCustomerCode(sale.customerCode)
    }));

    // Get unique formatted customer codes from sales
    const customerCodes = [...new Set(formattedSales.map(sale => sale.formattedCustomerCode))];
    
    // Find customers with flexible matching
    const customerPromises = customerCodes.map(async (code) => {
      // Try exact match first with formatted code
      let customer = await Customer.findOne({ customerCode: code }).lean();
      
      // If not found, try without leading zeros
      if (!customer) {
        const normalizedCode = normalizeCustomerCode(code);
        customer = await Customer.findOne({ 
          $or: [
            { customerCode: normalizedCode },
            { customerCode: formatCustomerCode(normalizedCode) },
            { customerCode: { $regex: new RegExp(`${normalizedCode}$`) } }
          ]
        }).lean();
      }
      
      return { saleCode: code, customer };
    });

    const customerResults = await Promise.all(customerPromises);
    
    // Create a map of sale customer code to customer data
    const customerMap = {};
    customerResults.forEach(({ saleCode, customer }) => {
      customerMap[saleCode] = customer;
    });

    // Group sales by formatted customer code
    const customerGroups = {};
    
    formattedSales.forEach(sale => {
      const customerCode = sale.formattedCustomerCode;
      const customer = customerMap[customerCode];
      
      if (!customerGroups[customerCode]) {
        customerGroups[customerCode] = {
          customerCode: customerCode, // Always return 5-digit format
          customerName: customer?.name || null,
          customerPhone: customer?.customerNumber || null,
          customerEmail: customer?.email || null,
          customerAddress: customer?.address || null,
          totalNetSellingAmount: 0,
          totalDueAmount: 0,
          totalPaidAmount: 0,
          overdueAmount: 0,
          latestDeliveryDate: null,
          invoiceCount: 0,
          overdueInvoices: 0,
          invoices: []
        };
      }
      
      // Calculate overdue date
      let overdueDate = sale.dueDate;
      if (!overdueDate && sale.creditDays) {
        overdueDate = new Date(sale.deliveryDate);
        overdueDate.setDate(overdueDate.getDate() + sale.creditDays);
      }
      
      const isOverdue = overdueDate && new Date(overdueDate) < now && sale.dueAmount > 0;
      
      customerGroups[customerCode].totalNetSellingAmount += sale.netSellingAmount || 0;
      customerGroups[customerCode].totalDueAmount += sale.dueAmount || 0;
      customerGroups[customerCode].totalPaidAmount += sale.paidAmount || 0;
      
      if (isOverdue) {
        customerGroups[customerCode].overdueAmount += sale.dueAmount || 0;
        customerGroups[customerCode].overdueInvoices += 1;
      }
      
      if (!customerGroups[customerCode].latestDeliveryDate || 
          new Date(sale.deliveryDate) > new Date(customerGroups[customerCode].latestDeliveryDate)) {
        customerGroups[customerCode].latestDeliveryDate = sale.deliveryDate;
      }
      
      customerGroups[customerCode].invoiceCount += 1;
      customerGroups[customerCode].invoices.push(sale);
    });

    // Convert to array and add calculated fields
    let customerList = Object.values(customerGroups).map(group => ({
      ...group,
      outstandingAmount: group.totalDueAmount,
      overdueDays: group.overdueAmount > 0 ? 
        Math.floor((now - new Date(group.latestDeliveryDate)) / (1000 * 60 * 60 * 24)) : 0
    }));

    // Apply search filter
    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();
      customerList = customerList.filter(customer => {
        const customerName = (customer.customerName || '').toLowerCase();
        const customerCode = (customer.customerCode || '').toLowerCase();
        const customerPhone = (customer.customerPhone || '').toLowerCase();
        const customerEmail = (customer.customerEmail || '').toLowerCase();
        const customerAddress = (customer.customerAddress || '').toLowerCase();
        
        return customerName.includes(searchTerm) ||
               customerCode.includes(searchTerm) ||
               customerPhone.includes(searchTerm) ||
               customerEmail.includes(searchTerm) ||
               customerAddress.includes(searchTerm);
      });
    }

    // Sort by overdue amount
    customerList.sort((a, b) => b.overdueAmount - a.overdueAmount);

    // Calculate totals
    const totals = customerList.reduce((acc, curr) => {
      acc.totalOutstandingAmount += curr.outstandingAmount || 0;
      acc.totalDueAmount += curr.totalDueAmount || 0;
      acc.totalOverdueAmount += curr.overdueAmount || 0;
      acc.totalCustomers += 1;
      acc.totalInvoices += curr.invoiceCount || 0;
      acc.totalOverdueInvoices += curr.overdueInvoices || 0;
      return acc;
    }, {
      totalOutstandingAmount: 0,
      totalDueAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalInvoices: 0,
      totalOverdueInvoices: 0
    });

    // Pagination
    const totalCount = customerList.length;
    const totalPages = Math.ceil(totalCount / limitNum);
    const paginatedCustomers = customerList.slice(skip, skip + limitNum);

    // Format records for response
    const records = paginatedCustomers.map(customer => ({
      customerCode: customer.customerCode, // Already in 5-digit format
      customerName: customer.customerName || 'N/A',
      phone: customer.customerPhone || 'N/A',
      email: customer.customerEmail || 'N/A',
      address: customer.customerAddress || 'N/A',
      totalOutstandingAmount: customer.outstandingAmount || 0,
      dueAmount: customer.totalDueAmount || 0,
      overdueAmount: customer.overdueAmount || 0,
      lastTransactionDate: customer.latestDeliveryDate,
      invoiceCount: customer.invoiceCount || 0,
      overdueInvoices: customer.overdueInvoices || 0,
      overdueDays: customer.overdueDays || 0
    }));

    return res.json({
      success: true,
      data: {
        summary: {
          ...totals,
          totalRecords: totalCount
        },
        records: records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: records.length,
    });

  } catch (error) {
    console.error("Error in outstanding-collections report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching outstanding collections",
      error: error.message,
    });
  }
});

// Excel Export for Outstanding Collections
router.get("/reports/outstanding-collections/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, customerCode } = req.query;
    const matchStage = {
      paymentStatus: { $regex: /^credit$/i },
      isReturn: false,
      isExchange: false,
      dueAmount: { $gt: 0 }
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

    // Handle customer code filter - format to 5 digits
    if (customerCode) {
      matchStage.customerCode = formatCustomerCode(customerCode);
    }

    const now = new Date();

    // Get all sales that match the criteria
    const sales = await Sale.find(matchStage).lean();
    
    if (sales.length === 0) {
      return generateEmptyExcel(res);
    }

    // Format all sale customer codes to 5 digits
    const formattedSales = sales.map(sale => ({
      ...sale,
      formattedCustomerCode: formatCustomerCode(sale.customerCode)
    }));

    // Get unique formatted customer codes from sales
    const customerCodes = [...new Set(formattedSales.map(sale => sale.formattedCustomerCode))];
    
    // Find customers with flexible matching
    const customerPromises = customerCodes.map(async (code) => {
      // Try exact match first with formatted code
      let customer = await Customer.findOne({ customerCode: code }).lean();
      
      // If not found, try without leading zeros
      if (!customer) {
        const normalizedCode = normalizeCustomerCode(code);
        customer = await Customer.findOne({ 
          $or: [
            { customerCode: normalizedCode },
            { customerCode: formatCustomerCode(normalizedCode) },
            { customerCode: { $regex: new RegExp(`${normalizedCode}$`) } }
          ]
        }).lean();
      }
      
      return { saleCode: code, customer };
    });

    const customerResults = await Promise.all(customerPromises);
    
    // Create a map of sale customer code to customer data
    const customerMap = {};
    customerResults.forEach(({ saleCode, customer }) => {
      customerMap[saleCode] = customer;
    });

    // Group sales by formatted customer code
    const customerGroups = {};
    
    formattedSales.forEach(sale => {
      const customerCode = sale.formattedCustomerCode;
      const customer = customerMap[customerCode];
      
      if (!customerGroups[customerCode]) {
        customerGroups[customerCode] = {
          customerCode: customerCode, // Always return 5-digit format
          customerName: customer?.name || null,
          customerPhone: customer?.customerNumber || null,
          customerEmail: customer?.email || null,
          customerAddress: customer?.address || null,
          totalDueAmount: 0,
          overdueAmount: 0,
          latestDeliveryDate: null,
          invoiceCount: 0
        };
      }
      
      // Calculate overdue date
      let overdueDate = sale.dueDate;
      if (!overdueDate && sale.creditDays) {
        overdueDate = new Date(sale.deliveryDate);
        overdueDate.setDate(overdueDate.getDate() + sale.creditDays);
      }
      
      const isOverdue = overdueDate && new Date(overdueDate) < now && sale.dueAmount > 0;
      
      customerGroups[customerCode].totalDueAmount += sale.dueAmount || 0;
      
      if (isOverdue) {
        customerGroups[customerCode].overdueAmount += sale.dueAmount || 0;
      }
      
      if (!customerGroups[customerCode].latestDeliveryDate || 
          new Date(sale.deliveryDate) > new Date(customerGroups[customerCode].latestDeliveryDate)) {
        customerGroups[customerCode].latestDeliveryDate = sale.deliveryDate;
      }
      
      customerGroups[customerCode].invoiceCount += 1;
    });

    // Convert to array and add calculated fields
    let customerList = Object.values(customerGroups).map(group => ({
      ...group,
      outstandingAmount: group.totalDueAmount,
      overdueDays: group.overdueAmount > 0 ? 
        Math.floor((now - new Date(group.latestDeliveryDate)) / (1000 * 60 * 60 * 24)) : 0
    }));

    // Apply search filter
    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();
      customerList = customerList.filter(customer => {
        const customerName = (customer.customerName || '').toLowerCase();
        const customerCode = (customer.customerCode || '').toLowerCase();
        const customerPhone = (customer.customerPhone || '').toLowerCase();
        const customerEmail = (customer.customerEmail || '').toLowerCase();
        const customerAddress = (customer.customerAddress || '').toLowerCase();
        
        return customerName.includes(searchTerm) ||
               customerCode.includes(searchTerm) ||
               customerPhone.includes(searchTerm) ||
               customerEmail.includes(searchTerm) ||
               customerAddress.includes(searchTerm);
      });
    }

    // Sort by overdue amount
    customerList.sort((a, b) => b.overdueAmount - a.overdueAmount);

    const summary = {
      totalOutstandingAmount: customerList.reduce((sum, record) => sum + (record.outstandingAmount || 0), 0),
      totalOverdueAmount: customerList.reduce((sum, record) => sum + (record.overdueAmount || 0), 0),
      totalCustomers: customerList.length,
      totalInvoices: customerList.reduce((sum, record) => sum + (record.invoiceCount || 0), 0)
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Outstanding Collections System';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Outstanding Collections Report');
    
    worksheet.columns = [
      { header: 'Sr.No', key: 'serialNo', width: 8 },
      { header: 'Customer Code', key: 'customerCode', width: 15 },
      { header: 'Customer Name', key: 'customerName', width: 25 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Address', key: 'address', width: 30 },
      { header: 'Total Outstanding ($)', key: 'totalOutstandingAmount', width: 20 },
      { header: 'Overdue Amount ($)', key: 'overdueAmount', width: 18 },
      { header: 'Overdue Days', key: 'overdueDays', width: 12 },
      { header: 'Last Transaction Date', key: 'lastTransactionDate', width: 18 },
      { header: 'Total Invoices', key: 'invoiceCount', width: 12 },
    ];

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

    customerList.forEach((record, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        customerCode: record.customerCode || 'N/A',
        customerName: record.customerName || 'N/A',
        phone: record.customerPhone || 'N/A',
        email: record.customerEmail || 'N/A',
        address: record.customerAddress || 'N/A',
        totalOutstandingAmount: record.outstandingAmount || 0,
        overdueAmount: record.overdueAmount || 0,
        overdueDays: record.overdueDays || 0,
        lastTransactionDate: record.latestDeliveryDate,
        invoiceCount: record.invoiceCount || 0
      });

      row.font = { size: 11 };
      row.alignment = { 
        vertical: 'middle',
        horizontal: 'center'
      };

      const dateCell = row.getCell('lastTransactionDate');
      dateCell.value = record.latestDeliveryDate ? new Date(record.latestDeliveryDate) : '';
      dateCell.numFmt = 'dd-mm-yyyy';
      
      const outstandingCell = row.getCell('totalOutstandingAmount');
      outstandingCell.numFmt = '$#,##0.00';
      
      const overdueCell = row.getCell('overdueAmount');
      overdueCell.numFmt = '$#,##0.00';
    });

    if (customerList.length > 0) {
      worksheet.addRow({});

      const summaryHeader = worksheet.addRow(['SUMMARY']);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: 'center' };
      summaryHeader.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD0D0D0' }
      };
      worksheet.mergeCells(`A${summaryHeader.number}:K${summaryHeader.number}`);

      const summaryData = [
        ['Total Customers:', summary.totalCustomers],
        ['Total Invoices:', summary.totalInvoices],
        ['Total Outstanding Amount:', `$${summary.totalOutstandingAmount.toFixed(2)}`],
        ['Total Overdue Amount:', `$${summary.totalOverdueAmount.toFixed(2)}`]
      ];

      summaryData.forEach(([label, value]) => {
        const row = worksheet.addRow([label, value]);
        row.font = { bold: true };
        row.getCell(1).alignment = { horizontal: 'right' };
        row.getCell(2).alignment = { horizontal: 'left' };
      });
    }

    // Apply borders to all cells
    worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount }
    };

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    
    let fileName = 'outstanding-collections-report';
    if (startDate && endDate) {
      fileName = `outstanding-collections-${startDate.replace(/-/g, '')}-to-${endDate.replace(/-/g, '')}`;
    } else {
      fileName = `outstanding-collections-${formattedDate.replace(/-/g, '')}`;
    }
    fileName += '.xlsx';

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);

  } catch (error) {
    console.error("Error in /reports/outstanding-collections/export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Helper function to generate empty Excel file
async function generateEmptyExcel(res) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Outstanding Collections Report');
  
  worksheet.columns = [
    { header: 'Sr.No', key: 'serialNo', width: 8 },
    { header: 'Customer Code', key: 'customerCode', width: 15 },
    { header: 'Customer Name', key: 'customerName', width: 25 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Total Outstanding ($)', key: 'totalOutstandingAmount', width: 20 },
    { header: 'Overdue Amount ($)', key: 'overdueAmount', width: 18 },
    { header: 'Overdue Days', key: 'overdueDays', width: 12 },
    { header: 'Last Transaction Date', key: 'lastTransactionDate', width: 18 },
    { header: 'Total Invoices', key: 'invoiceCount', width: 12 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  worksheet.addRow(['No data available']);
  worksheet.mergeCells(`A2:K2`);

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="outstanding-collections-report-empty.xlsx"`
  );

  const buffer = await workbook.xlsx.writeBuffer();
  res.send(buffer);
}

export default router;