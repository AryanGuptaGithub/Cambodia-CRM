import express from "express";
import mongoose from "mongoose";
import Sale from "../../models/sale/saleSummary.js";
import Customer from "../../models/master/customer.js";
import MRCash from "../../models/accounts/MRCash.js";
import Staff from "../../models/staffMember/staff.js";
import ExcelJS from "exceljs";

const router = express.Router();

// Helper function to fix precision
const fixPrecision = (num) => {
  if (typeof num !== "number") return num;
  return Math.round(num * 100) / 100;
};

// Helper function to format customer code to 5 digits with leading zeros
const formatCustomerCode = (code) => {
  if (!code) return code;
  const numericCode = code.toString().replace(/\D/g, "");
  return numericCode.padStart(5, "0");
};

// Helper function to normalize customer code for comparison (remove leading zeros)
const normalizeCustomerCode = (code) => {
  if (!code) return code;
  return code.toString().replace(/^0+/, "");
};

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE FIX: Parse a "YYYY-MM-DD" string as LOCAL midnight, not UTC midnight
// e.g. "2026-04-01" → 2026-04-01T00:00:00 local  (NOT 2026-03-31T17:00:00 UTC)
// ─────────────────────────────────────────────────────────────────────────────
const parseLocalDate = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

const parseLocalDateEnd = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
};

// ─────────────────────────────────────────────────────────────────────────────
const buildMatchStage = ({ startDate, endDate, customerCode } = {}) => {
  const matchStage = {
    paymentStatus: {
      $in: [/^credit$/i, /^partial paid$/i, /^unpaid$/i, /^due$/i, /^cash$/i],
    },
    $or: [
      { isReturn: { $exists: false } },
      { isReturn: false },
      { isReturn: null },
    ],
  };

  if (startDate || endDate) {
    matchStage.invoiceDate = {};
    if (startDate) {
      const start = parseLocalDate(startDate);
      if (start) matchStage.invoiceDate.$gte = start;
    }
    if (endDate) {
      const end = parseLocalDateEnd(endDate);
      if (end) matchStage.invoiceDate.$lte = end;
    }
  }

  if (customerCode) {
    matchStage.customerCode = formatCustomerCode(customerCode);
  }

  return matchStage;
};

// Helper function to update MR Cash
const updateMRCash = async (
  mrName,
  amount,
  invoiceNumber,
  date,
  session,
  isRefund = false,
) => {
  try {
    const cleanAmount = fixPrecision(Number(amount) || 0);
    if (cleanAmount === 0) {
      return { success: true, skipped: true, reason: "Amount is zero" };
    }

    if (!mrName || mrName.trim() === "") {
      throw new Error("MR name is required to update MR Cash");
    }

    const escapeForRegex = (text = "") =>
      text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const mr = await Staff.findOne({
      medicalRepName: {
        $regex: `^${escapeForRegex(mrName.trim())}$`,
        $options: "i",
      },
    }).session(session);

    if (!mr) {
      console.warn(`⚠️ MR not found with name "${mrName}"`);
      return {
        success: false,
        error: `MR not found with name "${mrName}"`,
        skipped: true,
      };
    }

    let mrCash = await MRCash.findOne({ mrId: mr._id }).session(session);

    if (!mrCash) {
      let initialCash = 0;
      if (!isRefund) initialCash = cleanAmount;

      mrCash = new MRCash({
        mrId: mr._id,
        mrName: mr.medicalRepName,
        currentCash: initialCash,
        cashTransferredToAdmin: 0,
        lastTransferDate: null,
        notes: `Initial creation with invoice: ${invoiceNumber} (${isRefund ? "Due Increased" : "Due Decreased"}: ${cleanAmount})`,
        isActive: true,
      });

      await mrCash.save({ session });
      return {
        success: true,
        mrCash,
        action: "created_new",
        previousAmount: 0,
        newAmount: initialCash,
      };
    }

    const previousAmount = fixPrecision(mrCash.currentCash || 0);
    let newCashAmount = isRefund
      ? fixPrecision(previousAmount - cleanAmount)
      : fixPrecision(previousAmount + cleanAmount);

    mrCash.currentCash = newCashAmount;

    if (mrCash.currentCash < 0) {
      console.warn(
        `⚠️ Warning: MR ${mr.medicalRepName} cash balance went negative: ${mrCash.currentCash}`,
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
      previousAmount,
      newAmount: newCashAmount,
      changeAmount: cleanAmount,
    };
  } catch (error) {
    console.error("❌ Error updating MR Cash:", error.message);
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Bulk Update Route
// ─────────────────────────────────────────────────────────────────────────────
router.post("/bulk-update", async (req, res) => {
  try {
    const { updates } = req.body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No update data provided" });
    }

    const results = {
      successCount: 0,
      failedCount: 0,
      errors: [],
      updated: [],
      mrCashUpdates: [],
    };

    for (const update of updates) {
      const { invoiceNumber, totalAmount, paidAmount, creditDays, remarks } =
        update;
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const sale = await Sale.findOne({ invoiceNumber }).session(session);

        if (!sale) {
          await session.abortTransaction();
          session.endSession();
          results.failedCount++;
          results.errors.push({ invoiceNumber, error: "Invoice not found" });
          continue;
        }

        const resolvedTotalAmount =
          totalAmount > 0 ? totalAmount : sale.totalAmount || 0;

        if (resolvedTotalAmount <= 0) {
          await session.abortTransaction();
          session.endSession();
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Total amount must be greater than 0",
          });
          continue;
        }

        if (paidAmount < 0) {
          await session.abortTransaction();
          session.endSession();
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot be negative",
          });
          continue;
        }

        if (paidAmount > resolvedTotalAmount) {
          await session.abortTransaction();
          session.endSession();
          results.failedCount++;
          results.errors.push({
            invoiceNumber,
            error: "Paid amount cannot exceed total amount",
          });
          continue;
        }

        const oldDueAmount = fixPrecision(sale.dueAmount || 0);
        const oldPaidAmount = fixPrecision(sale.paidAmount || 0);
        const newDueAmount = fixPrecision(resolvedTotalAmount - paidAmount);
        const newPaidAmount = fixPrecision(paidAmount);
        const dueAmountChange = fixPrecision(newDueAmount - oldDueAmount);
        const paidAmountChange = fixPrecision(newPaidAmount - oldPaidAmount);

        const resolvedCreditDays = creditDays > 0 ? creditDays : 30;

        const updateData = {
          totalAmount: fixPrecision(resolvedTotalAmount),
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          paymentStatus:
            newDueAmount > 0
              ? newPaidAmount > 0
                ? "Partial Paid"
                : "Credit"
              : "Cash",
          creditDays: resolvedCreditDays,
        };

        if (newDueAmount === 0) {
          updateData.pendingAmountPaid = "paid";
        }

        if (remarks) updateData.remark = remarks;

        if (newDueAmount > 0 && resolvedCreditDays > 0) {
          const invoiceDate = new Date(sale.invoiceDate);
          const dueDate = new Date(invoiceDate);
          dueDate.setDate(dueDate.getDate() + resolvedCreditDays);
          updateData.dueDate = dueDate;
        }

        let mrUpdated = false;
        let mrDetails = null;

        if (
          sale.mrName &&
          sale.mrName.trim() !== "" &&
          sale.mrName.toLowerCase() !== "unknown"
        ) {
          if (Math.abs(dueAmountChange) > 0.01) {
            const mrCashUpdate = await updateMRCash(
              sale.mrName.trim(),
              Math.abs(dueAmountChange),
              invoiceNumber,
              sale.invoiceDate || new Date(),
              session,
              dueAmountChange > 0,
            );

            if (mrCashUpdate.success) {
              mrUpdated = true;
              mrDetails = {
                mrName: sale.mrName,
                previousCash: mrCashUpdate.previousAmount,
                adjustment: -dueAmountChange,
                newCash: mrCashUpdate.newAmount,
                oldDueAmount,
                newDueAmount,
                dueAmountChange,
                oldPaidAmount,
                newPaidAmount,
                paidAmountChange,
              };
            } else if (!mrCashUpdate.skipped) {
              console.error(
                `⚠️ Failed to update MR Cash for ${sale.mrName}: ${mrCashUpdate.error}`,
              );
            }
          }
        }

        await Sale.findByIdAndUpdate(sale._id, updateData, {
          new: true,
          session,
        });
        await session.commitTransaction();
        session.endSession();

        results.successCount++;
        results.updated.push({
          invoiceNumber,
          totalAmount: fixPrecision(resolvedTotalAmount),
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          oldDueAmount,
          dueAmountChange,
          paymentStatus: updateData.paymentStatus,
          mrUpdated,
        });

        if (mrDetails)
          results.mrCashUpdates.push({ invoiceNumber, ...mrDetails });
      } catch (error) {
        console.error(`Error updating invoice ${invoiceNumber}:`, error);
        try {
          await session.abortTransaction();
        } catch (e) {
          console.error("Abort error:", e);
        }
        try {
          session.endSession();
        } catch (e) {
          console.error("End session error:", e);
        }
        results.failedCount++;
        results.errors.push({
          invoiceNumber,
          error: error.message || "Unknown error",
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
      errors: results.errors,
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

// ─────────────────────────────────────────────────────────────────────────────
// Outstanding Collections Report — GET /  (with robust date filtering)
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      customerCode,
    } = req.query;

    // Validate dates
    if (startDate && !parseLocalDate(startDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid startDate format" });
    }
    if (endDate && !parseLocalDateEnd(endDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid endDate format" });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const now = new Date();

    // ── Build match stage with robust date filtering ─────────────────────
    const matchStage = {
      dueAmount: { $gt: 0 },
      paymentStatus: {
        $in: [/^credit$/i, /^partial paid$/i, /^unpaid$/i, /^due$/i, /^cash$/i],
      },
      $or: [
        { isReturn: { $exists: false } },
        { isReturn: false },
        { isReturn: null },
      ],
    };

    // 🔧 FIX: Handle date filtering robustly – convert string dates to Date objects
    if (startDate || endDate) {
      const start = startDate ? parseLocalDate(startDate) : null;
      const end = endDate ? parseLocalDateEnd(endDate) : null;

      // Use $expr to safely compare both string and Date fields
      const dateConditions = [];
      if (start) {
        dateConditions.push({
          $expr: { $gte: [{ $toDate: "$invoiceDate" }, start] },
        });
      }
      if (end) {
        dateConditions.push({
          $expr: { $lte: [{ $toDate: "$invoiceDate" }, end] },
        });
      }
      if (dateConditions.length > 0) {
        matchStage.$and = dateConditions;
      }
    }

    if (customerCode) {
      matchStage.customerCode = formatCustomerCode(customerCode);
    }

    // ── Search filter (applied after lookup) ────────────────────────────
    const searchMatchStage =
      search && search.trim()
        ? {
            $match: {
              $or: [
                { invoiceNumber: { $regex: search.trim(), $options: "i" } },
                {
                  customerNameFromMaster: {
                    $regex: search.trim(),
                    $options: "i",
                  },
                },
                { customerCode: { $regex: search.trim(), $options: "i" } },
                { customerPhone: { $regex: search.trim(), $options: "i" } },
                { customerEmail: { $regex: search.trim(), $options: "i" } },
                { customerAddress: { $regex: search.trim(), $options: "i" } },
              ],
            },
          }
        : null;

    // ── Base pipeline ───────────────────────────────────────────────────
    const basePipeline = [
      { $match: matchStage },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerCode: 1,
          customerName: 1,
          dueAmount: 1,
          paidAmount: 1,
          totalAmount: 1,
          creditDays: 1,
          dueDate: 1,
          deliveryDate: 1,
          mrName: 1,
        },
      },
      {
        $lookup: {
          from: "customers",
          let: { custCode: "$customerCode" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$customerCode", "$$custCode"] },
                    {
                      $eq: ["$customerCode", { $concat: ["0", "$$custCode"] }],
                    },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "customer",
        },
      },
      { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          customerNameFromMaster: {
            $ifNull: ["$customer.name", "$customerName"],
          },
          customerPhone: "$customer.customerNumber",
          customerEmail: "$customer.email",
          customerAddress: "$customer.address",
        },
      },
      ...(searchMatchStage ? [searchMatchStage] : []),
      {
        $addFields: {
          overdueDate: {
            $cond: {
              if: { $ne: ["$dueDate", null] },
              then: "$dueDate",
              else: {
                $add: [
                  "$invoiceDate",
                  { $multiply: [{ $ifNull: ["$creditDays", 0] }, 86400000] },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          isOverdue: {
            $and: [{ $lt: ["$overdueDate", now] }, { $gt: ["$dueAmount", 0] }],
          },
        },
      },
      {
        $project: {
          invoiceNumber: 1,
          invoiceDate: 1,
          customerCode: 1,
          customerName: "$customerNameFromMaster",
          phone: "$customerPhone",
          email: "$customerEmail",
          address: "$customerAddress",
          totalDueAmount: "$dueAmount",
          paidAmount: 1,
          overdueAmount: { $cond: ["$isOverdue", "$dueAmount", 0] },
          latestDeliveryDate: { $ifNull: ["$invoiceDate", "$deliveryDate"] },
        },
      },
    ];

    // ── Grand totals across ALL matching records ────────────────────────
    const grandTotalPipeline = [
      ...basePipeline,
      {
        $group: {
          _id: null,
          totalOutstandingAmount: { $sum: "$totalDueAmount" },
          totalOverdueAmount: { $sum: "$overdueAmount" },
          totalInvoices: { $sum: 1 },
          totalRecords: { $sum: 1 },
        },
      },
    ];

    const countPipeline = [...basePipeline, { $count: "total" }];

    const [grandTotalResult, countResult] = await Promise.all([
      Sale.aggregate(grandTotalPipeline),
      Sale.aggregate(countPipeline),
    ]);

    const totalCount = countResult.length > 0 ? countResult[0].total : 0;
    const totalPages = Math.ceil(totalCount / limitNum);

    const grandTotals =
      grandTotalResult.length > 0
        ? grandTotalResult[0]
        : {
            totalOutstandingAmount: 0,
            totalOverdueAmount: 0,
            totalInvoices: 0,
            totalRecords: 0,
          };

    // ── Paginated data ──────────────────────────────────────────────────
    const paginatedPipeline = [
      ...basePipeline,
      { $sort: { overdueAmount: -1 } },
      { $skip: skip },
      { $limit: limitNum },
    ];

    let results = await Sale.aggregate(paginatedPipeline);

    results = results.map((r) => ({
      ...r,
      outstandingAmount: r.totalDueAmount,
      overdueDays:
        r.overdueAmount > 0 && r.latestDeliveryDate
          ? Math.max(
              0,
              Math.floor(
                (now - new Date(r.latestDeliveryDate)) / (1000 * 60 * 60 * 24),
              ),
            )
          : 0,
    }));

    const summary = {
      totalOutstandingAmount: fixPrecision(
        grandTotals.totalOutstandingAmount || 0,
      ),
      totalDueAmount: fixPrecision(grandTotals.totalOutstandingAmount || 0),
      totalOverdueAmount: fixPrecision(grandTotals.totalOverdueAmount || 0),
      totalCustomers: grandTotals.totalRecords || 0,
      totalInvoices: grandTotals.totalInvoices || 0,
      totalOverdueInvoices: 0,
      totalRecords: totalCount,
    };

    const records = results.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      customerCode: inv.customerCode,
      customerName: inv.customerName || "N/A",
      phone: inv.phone || "N/A",
      email: inv.email || "N/A",
      address: inv.address || "N/A",
      totalOutstandingAmount: inv.outstandingAmount || 0,
      dueAmount: inv.totalDueAmount || 0,
      overdueAmount: inv.overdueAmount || 0,
      lastTransactionDate: inv.latestDeliveryDate,
      invoiceCount: 1,
      overdueInvoices: inv.overdueAmount > 0 ? 1 : 0,
      overdueDays: inv.overdueDays || 0,
    }));

    return res.json({
      success: true,
      data: { summary, records },
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

// ─────────────────────────────────────────────────────────────────────────────
// Excel Export — GET /export/excel
// ─────────────────────────────────────────────────────────────────────────────
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, customerCode } = req.query;

    if (startDate && !parseLocalDate(startDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid startDate format" });
    }
    if (endDate && !parseLocalDateEnd(endDate)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid endDate format" });
    }

    const matchStage = buildMatchStage({ startDate, endDate, customerCode });
    const now = new Date();

    const sales = await Sale.find(matchStage).lean();

    if (sales.length === 0) {
      return generateEmptyExcel(res);
    }

    const formattedSales = sales.map((sale) => ({
      ...sale,
      formattedCustomerCode: formatCustomerCode(sale.customerCode),
    }));

    const customerCodes = [
      ...new Set(formattedSales.map((sale) => sale.formattedCustomerCode)),
    ];

    const customerPromises = customerCodes.map(async (code) => {
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

    const invoiceGroups = {};

    formattedSales.forEach((sale) => {
      const code = sale.formattedCustomerCode;
      const customer = customerMap[code];
      const invoiceKey = sale.invoiceNumber;

      let overdueDate = sale.dueDate ? new Date(sale.dueDate) : null;
      if (!overdueDate && sale.creditDays && sale.invoiceDate) {
        const baseDate = new Date(sale.invoiceDate);
        if (!isNaN(baseDate.getTime())) {
          overdueDate = new Date(baseDate);
          overdueDate.setDate(overdueDate.getDate() + (sale.creditDays || 0));
        }
      }
      const isOverdue =
        overdueDate &&
        !isNaN(overdueDate.getTime()) &&
        overdueDate < now &&
        (sale.dueAmount || 0) > 0;

      invoiceGroups[invoiceKey] = {
        invoiceNumber: sale.invoiceNumber,
        invoiceDate: sale.invoiceDate,
        customerCode: code,
        customerName: customer?.name || sale.customerName || "N/A",
        customerPhone: customer?.customerNumber || null,
        customerEmail: customer?.email || null,
        customerAddress: customer?.address || null,
        totalDueAmount: sale.dueAmount || 0,
        overdueAmount: isOverdue ? sale.dueAmount || 0 : 0,
        latestDeliveryDate: sale.invoiceDate || sale.deliveryDate,
        invoiceCount: 1,
      };
    });

    let invoiceList = Object.values(invoiceGroups).map((inv) => ({
      ...inv,
      outstandingAmount: inv.totalDueAmount,
      overdueDays:
        inv.overdueAmount > 0 && inv.latestDeliveryDate
          ? Math.max(
              0,
              Math.floor(
                (now - new Date(inv.latestDeliveryDate)) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : 0,
    }));

    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();
      invoiceList = invoiceList.filter(
        (inv) =>
          (inv.invoiceNumber || "").toLowerCase().includes(searchTerm) ||
          (inv.customerName || "").toLowerCase().includes(searchTerm) ||
          (inv.customerCode || "").toLowerCase().includes(searchTerm) ||
          (inv.customerPhone || "").toLowerCase().includes(searchTerm) ||
          (inv.customerEmail || "").toLowerCase().includes(searchTerm) ||
          (inv.customerAddress || "").toLowerCase().includes(searchTerm),
      );
    }

    invoiceList.sort((a, b) => b.overdueAmount - a.overdueAmount);

    const summary = {
      totalOutstandingAmount: invoiceList.reduce(
        (sum, r) => sum + (r.outstandingAmount || 0),
        0,
      ),
      totalOverdueAmount: invoiceList.reduce(
        (sum, r) => sum + (r.overdueAmount || 0),
        0,
      ),
      totalCustomers: invoiceList.length,
      totalInvoices: invoiceList.length,
    };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Outstanding Collections System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Outstanding Collections Report");

    worksheet.columns = [
      { header: "Sr.No", key: "serialNo", width: 8 },
      { header: "Invoice Number", key: "invoiceNumber", width: 18 },
      { header: "Invoice Date", key: "invoiceDate", width: 15 },
      { header: "Customer Code", key: "customerCode", width: 15 },
      { header: "Customer Name", key: "customerName", width: 25 },
      { header: "Phone", key: "phone", width: 15 },
      { header: "Email", key: "email", width: 30 },
      { header: "Address", key: "address", width: 30 },
      {
        header: "Total Outstanding ($)",
        key: "totalOutstandingAmount",
        width: 20,
      },
      { header: "Overdue Amount ($)", key: "overdueAmount", width: 18 },
      { header: "Overdue Days", key: "overdueDays", width: 12 },
      {
        header: "Last Transaction Date",
        key: "lastTransactionDate",
        width: 18,
      },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 25;
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    invoiceList.forEach((record, index) => {
      const row = worksheet.addRow({
        serialNo: index + 1,
        invoiceNumber: record.invoiceNumber || "N/A",
        invoiceDate: record.invoiceDate ? new Date(record.invoiceDate) : "",
        customerCode: record.customerCode || "N/A",
        customerName: record.customerName || "N/A",
        phone: record.customerPhone || "N/A",
        email: record.customerEmail || "N/A",
        address: record.customerAddress || "N/A",
        totalOutstandingAmount: record.outstandingAmount || 0,
        overdueAmount: record.overdueAmount || 0,
        overdueDays: record.overdueDays || 0,
        lastTransactionDate: record.latestDeliveryDate,
      });

      row.font = { size: 11 };
      row.alignment = { vertical: "middle", horizontal: "center" };

      const invDateCell = row.getCell("invoiceDate");
      invDateCell.value = record.invoiceDate
        ? new Date(record.invoiceDate)
        : "";
      invDateCell.numFmt = "dd-mm-yyyy";

      const dateCell = row.getCell("lastTransactionDate");
      dateCell.value = record.latestDeliveryDate
        ? new Date(record.latestDeliveryDate)
        : "";
      dateCell.numFmt = "dd-mm-yyyy";

      row.getCell("totalOutstandingAmount").numFmt = "$#,##0.00";
      row.getCell("overdueAmount").numFmt = "$#,##0.00";
    });

    if (invoiceList.length > 0) {
      worksheet.addRow({});
      const summaryHeader = worksheet.addRow(["SUMMARY"]);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: "center" };
      summaryHeader.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD0D0D0" },
      };
      worksheet.mergeCells(`A${summaryHeader.number}:L${summaryHeader.number}`);

      [
        ["Total Invoices:", summary.totalInvoices],
        [
          "Total Outstanding Amount:",
          `$${summary.totalOutstandingAmount.toFixed(2)}`,
        ],
        ["Total Overdue Amount:", `$${summary.totalOverdueAmount.toFixed(2)}`],
      ].forEach(([label, value]) => {
        const row = worksheet.addRow([label, value]);
        row.font = { bold: true };
        row.getCell(1).alignment = { horizontal: "right" };
        row.getCell(2).alignment = { horizontal: "left" };
      });
    }

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: worksheet.columnCount },
    };

    let fileName = "outstanding-collections-report";
    if (startDate && endDate) {
      fileName = `outstanding-collections-${startDate.replace(/-/g, "")}-to-${endDate.replace(/-/g, "")}`;
    } else {
      fileName = `outstanding-collections-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`;
    }
    fileName += ".xlsx";

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error("Error in /export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// Helper: generate empty Excel
async function generateEmptyExcel(res) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Outstanding Collections Report");

  worksheet.columns = [
    { header: "Sr.No", key: "serialNo", width: 8 },
    { header: "Invoice Number", key: "invoiceNumber", width: 18 },
    { header: "Invoice Date", key: "invoiceDate", width: 15 },
    { header: "Customer Code", key: "customerCode", width: 15 },
    { header: "Customer Name", key: "customerName", width: 25 },
    { header: "Phone", key: "phone", width: 15 },
    { header: "Email", key: "email", width: 30 },
    { header: "Address", key: "address", width: 30 },
    {
      header: "Total Outstanding ($)",
      key: "totalOutstandingAmount",
      width: 20,
    },
    { header: "Overdue Amount ($)", key: "overdueAmount", width: 18 },
    { header: "Overdue Days", key: "overdueDays", width: 12 },
    { header: "Last Transaction Date", key: "lastTransactionDate", width: 18 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, size: 12 };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 25;
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  worksheet.addRow(["No data available"]);
  worksheet.mergeCells("A2:L2");

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="outstanding-collections-report-empty.xlsx"',
  );

  const buffer = await workbook.xlsx.writeBuffer();
  res.send(buffer);
}

export default router;
