import express from "express";
import mongoose from "mongoose";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ExcelJS from 'exceljs';

const router = express.Router();

// Helper function to fix precision
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

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

// Helper function to update MR Cash
const updateMRCash = async (mrName, amount, invoiceNumber, date, session, isRefund = false) => {
  try {
    const cleanAmount = fixPrecision(Number(amount) || 0);
    if (cleanAmount === 0) {
      return { success: true, skipped: true, reason: "Amount is zero" };
    }
    
    if (!mrName || mrName.trim() === "") {
      throw new Error("MR name is required to update MR Cash");
    }
    
    const escapeForRegex = (text = "") => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    
    // Find MR in Staff collection
    const mr = await Staff.findOne({
      medicalRepName: { 
        $regex: `^${escapeForRegex(mrName.trim())}$`, 
        $options: "i" 
      },
    }).session(session);
    
    if (!mr) {
      console.warn(`⚠️ MR not found with name "${mrName}"`);
      return { 
        success: false, 
        error: `MR not found with name "${mrName}"`,
        skipped: true 
      };
    }
    
    // Find or create MR Cash record
    let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);
    
    if (!mrCash) {
      // Create new MR Cash record
      let initialCash = 0;
      if (!isRefund) {
        initialCash = cleanAmount;
      }
      
      mrCash = new MRCash({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        currentCash: initialCash,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial creation with invoice: ${invoiceNumber} (${isRefund ? 'Due Increased' : 'Due Decreased'}: ${cleanAmount})`,
        isActive: true,
      });
      
      await mrCash.save({ session });
      return { 
        success: true, 
        mrCash, 
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash
      };
    }
    
    // Update existing MR Cash record
    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    let newCashAmount = previousAmount;
    
    if (isRefund) {
      // Due amount increased = subtract from MR cash
      newCashAmount = fixPrecision(previousAmount - cleanAmount);
    } else {
      // Due amount decreased = add to MR cash
      newCashAmount = fixPrecision(previousAmount + cleanAmount);
    }
    
    mrCash.currentCash = newCashAmount;
    
    if (mrCash.currentCash < 0) {
      console.warn(
        `⚠️ Warning: MR ${mr.medicalRepName} cash balance went negative: ${mrCash.currentCash}`
      );
    }
    
    const transactionNote = isRefund
      ? `Due amount increased for invoice ${invoiceNumber}: -${cleanAmount}`
      : `Due amount decreased for invoice ${invoiceNumber}: +${cleanAmount}`;
      
    mrCash.notes = mrCash.notes
      ? `${mrCash.notes}\n${transactionNote}`
      : transactionNote;
      
    mrCash.updatedAt = new Date();
    
    await mrCash.save({ session });
      
    return {
      success: true,
      mrCash,
      action: "updated_existing",
      previousAmount: previousAmount,
      newAmount: newCashAmount,
      changeAmount: cleanAmount,
    };
  } catch (error) {
    console.error("❌ Error updating MR Cash:", error.message);
    return { success: false, error: error.message };
  }
};

// Bulk Update Route with MR Cash Integration
// ✅ CHANGED: removed "/reports/outstanding-collections" prefix
router.post("/bulk-update", async (req, res) => {
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
      updated: [],
      mrCashUpdates: []
    };

    for (const update of updates) {
      const { invoiceNumber, totalAmount, paidAmount, creditDays, remarks } = update;
      
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Find the sale by invoice number
        const sale = await Sale.findOne({ invoiceNumber: invoiceNumber }).session(session);

        if (!sale) {
          await session.abortTransaction();
          session.endSession();
          
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Invoice not found"
          });
          continue;
        }

        // Validate amounts
        if (totalAmount <= 0) {
          await session.abortTransaction();
          session.endSession();
          
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Total amount must be greater than 0"
          });
          continue;
        }

        if (paidAmount < 0) {
          await session.abortTransaction();
          session.endSession();
          
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot be negative"
          });
          continue;
        }

        if (paidAmount > totalAmount) {
          await session.abortTransaction();
          session.endSession();
          
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot exceed total amount"
          });
          continue;
        }

        // Calculate old and new due amounts
        const oldDueAmount = fixPrecision(sale.dueAmount || 0);
        const oldPaidAmount = fixPrecision(sale.paidAmount || 0);
        const newDueAmount = fixPrecision(totalAmount - paidAmount);
        const newPaidAmount = fixPrecision(paidAmount);
        
        // Calculate the change in due amount
        const dueAmountChange = fixPrecision(newDueAmount - oldDueAmount);
        const paidAmountChange = fixPrecision(newPaidAmount - oldPaidAmount);

        // Prepare update data
        const updateData = {
          totalAmount: fixPrecision(totalAmount),
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          paymentStatus: newDueAmount > 0 ? "Credit" : "Cash",
          creditDays: creditDays || 0,
        };

        // Update remark if provided
        if (remarks) {
          updateData.remark = remarks;
        }

        // Calculate due date based on invoice date + credit days
        if (newDueAmount > 0 && creditDays > 0) {
          const invoiceDate = new Date(sale.invoiceDate);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + creditDays);
          updateData.dueDate = dueDate;
        } else if (newDueAmount > 0) {
          // If no credit days, due date is same as invoice date
          updateData.dueDate = sale.invoiceDate;
        }

        // Update MR cash if MR is involved in the sale
        let mrUpdated = false;
        let mrDetails = null;

        if (sale.mrName && sale.mrName.trim() !== "" && sale.mrName.toLowerCase() !== "unknown") {
          // When due amount changes, we need to adjust MR cash
          // If due amount INCREASES (customer owes more), SUBTRACT from MR cash
          // If due amount DECREASES (customer paid more), ADD to MR cash
          
          if (Math.abs(dueAmountChange) > 0.01) {
            // There's a change in due amount
            const mrCashUpdate = await updateMRCash(
              sale.mrName.trim(),
              Math.abs(dueAmountChange),
              invoiceNumber,
              sale.invoiceDate || new Date(),
              session,
              dueAmountChange > 0 // isRefund = true if due amount increased (subtract from MR cash)
            );

            if (mrCashUpdate.success) {
              mrUpdated = true;
              mrDetails = {
                mrName: sale.mrName,
                previousCash: mrCashUpdate.previousAmount,
                adjustment: -dueAmountChange, // Negative means subtract from MR, positive means add
                newCash: mrCashUpdate.newAmount,
                oldDueAmount: oldDueAmount,
                newDueAmount: newDueAmount,
                dueAmountChange: dueAmountChange,
                oldPaidAmount: oldPaidAmount,
                newPaidAmount: newPaidAmount,
                paidAmountChange: paidAmountChange
              };
            } else if (!mrCashUpdate.skipped) {
              // MR Cash update failed
              console.error(`⚠️ Failed to update MR Cash for ${sale.mrName}: ${mrCashUpdate.error}`);
            }
          }
        }

        // Update the sale
        await Sale.findByIdAndUpdate(sale._id, updateData, { new: true, session });

        await session.commitTransaction();
        session.endSession();

        results.successCount++;
        results.updated.push({
          invoiceNumber,
          totalAmount: fixPrecision(totalAmount),
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          oldDueAmount,
          dueAmountChange,
          paymentStatus: updateData.paymentStatus,
          mrUpdated
        });

        if (mrDetails) {
          results.mrCashUpdates.push({
            invoiceNumber,
            ...mrDetails
          });
        }

      } catch (error) {
        console.error(`Error updating invoice ${invoiceNumber}:`, error);
        
        try {
          await session.abortTransaction();
        } catch (abortError) {
          console.error("Error aborting transaction:", abortError);
        }
        
        try {
          session.endSession();
        } catch (endError) {
          console.error("Error ending session:", endError);
        }
        
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
      mrCashUpdates: results.mrCashUpdates,
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
// ✅ CHANGED: removed "/reports/outstanding-collections" prefix
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      customerCode,
      status,
    } = req.query;

    // ---------- 1. BUILD MATCH STAGE ----------
    const matchStage = {
      paymentStatus: { $regex: /^credit$/i },
      isReturn: false,
      isExchange: false,
      dueAmount: { $gt: 0 },
    };
  
    // Date filtering
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

    // Customer code filter (5‑digit format)
    if (customerCode) {
      matchStage.customerCode = formatCustomerCode(customerCode);
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();
    const sales = await Sale.find(matchStage).lean();
    // Log total dueAmount from raw sales (should be close to expected total if filters are correct)
    const rawTotalDue = sales.reduce((sum, s) => sum + (s.dueAmount || 0), 0);
    if (sales.length === 0) {
      return res.json({
        success: true,
        data: { summary: { /* ... zeros */ }, records: [] },
        pagination: { /* ... zeros */ },
        count: 0,
      });
    }

    // ---------- 3. FORMAT CUSTOMER CODES ----------
    const formattedSales = sales.map((sale) => ({
      ...sale,
      formattedCustomerCode: formatCustomerCode(sale.customerCode),
    }));
    const uniqueFormattedCodes = [
      ...new Set(formattedSales.map((s) => s.formattedCustomerCode)),
    ];
    const customerPromises = uniqueFormattedCodes.map(async (code) => {
      // exact match
      let customer = await Customer.findOne({ customerCode: code }).lean();
      if (!customer) {
        const normalizedCode = normalizeCustomerCode(code);
        customer = await Customer.findOne({
          $or: [
            { customerCode: normalizedCode },
            { customerCode: formatCustomerCode(normalizedCode) },
            { customerCode: { $regex: new RegExp(`${normalizedCode}$`) } },
          ],
        }).lean();
      } 
      return { saleCode: code, customer };
    });

    const customerResults = await Promise.all(customerPromises);
    const customerMap = {};
    customerResults.forEach(({ saleCode, customer }) => {
      customerMap[saleCode] = customer;
    });

    const customerGroups = {};

    formattedSales.forEach((sale) => {
      const custCode = sale.formattedCustomerCode;
      const customer = customerMap[custCode];

      if (!customerGroups[custCode]) {
        customerGroups[custCode] = {
          customerCode: custCode,
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
          invoices: [],
        };
      }

      // overdue calculation
      let overdueDate = sale.dueDate;
      if (!overdueDate && sale.creditDays) {
        overdueDate = new Date(sale.deliveryDate);
        overdueDate.setDate(overdueDate.getDate() + sale.creditDays);
      }
      const isOverdue = overdueDate && new Date(overdueDate) < now && sale.dueAmount > 0;

      const group = customerGroups[custCode];
      group.totalNetSellingAmount += sale.netSellingAmount || 0;
      group.totalDueAmount += sale.dueAmount || 0;
      group.totalPaidAmount += sale.paidAmount || 0;
      if (isOverdue) {
        group.overdueAmount += sale.dueAmount || 0;
        group.overdueInvoices += 1;
      }
      if (
        !group.latestDeliveryDate ||
        new Date(sale.deliveryDate) > new Date(group.latestDeliveryDate)
      ) {
        group.latestDeliveryDate = sale.deliveryDate;
      }
      group.invoiceCount += 1;
      group.invoices.push(sale);
    });

    let customerList = Object.values(customerGroups).map((group) => ({
      ...group,
      outstandingAmount: group.totalDueAmount,
      overdueDays:
        group.overdueAmount > 0
          ? Math.floor((now - new Date(group.latestDeliveryDate)) / (1000 * 60 * 60 * 24))
          : 0,
    }));

    // ---------- 7. SEARCH FILTER ----------
    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();
      const beforeCount = customerList.length;
      customerList = customerList.filter((cust) => {
        const name = (cust.customerName || "").toLowerCase();
        const code = (cust.customerCode || "").toLowerCase();
        const phone = (cust.customerPhone || "").toLowerCase();
        const email = (cust.customerEmail || "").toLowerCase();
        const addr = (cust.customerAddress || "").toLowerCase();
        return (
          name.includes(searchTerm) ||
          code.includes(searchTerm) ||
          phone.includes(searchTerm) ||
          email.includes(searchTerm) ||
          addr.includes(searchTerm)
        );
      });
    }

    // ---------- 8. SORT BY OVERDUE AMOUNT ----------
    customerList.sort((a, b) => b.overdueAmount - a.overdueAmount);

    // ---------- 9. AGGREGATE TOTALS ----------
    const totals = customerList.reduce(
      (acc, curr) => {
        acc.totalOutstandingAmount += curr.outstandingAmount || 0;
        acc.totalDueAmount += curr.totalDueAmount || 0;
        acc.totalOverdueAmount += curr.overdueAmount || 0;
        acc.totalCustomers += 1;
        acc.totalInvoices += curr.invoiceCount || 0;
        acc.totalOverdueInvoices += curr.overdueInvoices || 0;
        return acc;
      },
      {
        totalOutstandingAmount: 0,
        totalDueAmount: 0,
        totalOverdueAmount: 0,
        totalCustomers: 0,
        totalInvoices: 0,
        totalOverdueInvoices: 0,
      }
    );
    totals.totalRecords = customerList.length;
    // ---------- 10. PAGINATION ----------
    const totalCount = customerList.length;
    const totalPages = Math.ceil(totalCount / limitNum);
    const paginatedCustomers = customerList.slice(skip, skip + limitNum);
  
    // ---------- 11. FORMAT RESPONSE RECORDS ----------
    const records = paginatedCustomers.map((cust) => ({
      customerCode: cust.customerCode,
      customerName: cust.customerName || "N/A",
      phone: cust.customerPhone || "N/A",
      email: cust.customerEmail || "N/A",
      address: cust.customerAddress || "N/A",
      totalOutstandingAmount: cust.outstandingAmount || 0,
      dueAmount: cust.totalDueAmount || 0,
      overdueAmount: cust.overdueAmount || 0,
      lastTransactionDate: cust.latestDeliveryDate,
      invoiceCount: cust.invoiceCount || 0,
      overdueInvoices: cust.overdueInvoices || 0,
      overdueDays: cust.overdueDays || 0,
    }));

    // ---------- 12. SEND RESPONSE ----------
    return res.json({
      success: true,
      data: {
        summary: totals,
        records,
      },
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      count: records.length,
    });
  } catch (error) {
    console.error("ERROR in outstanding-collections report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching outstanding collections",
      error: error.message,
    });
  }
});

// Excel Export for Outstanding Collections
// ✅ CHANGED: removed "/reports/outstanding-collections" prefix
router.get("/export/excel", async (req, res) => {
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
    console.error("Error in /export/excel:", error);
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