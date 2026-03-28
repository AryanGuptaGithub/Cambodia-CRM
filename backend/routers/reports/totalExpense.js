import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Expense from "../../models/expenses/addExpense.js";
import ExcelJS from "exceljs";

const router = express.Router();

// =============================================================================
// Helpers
// =============================================================================
const safeDateCompare = (a, b) => {
  try {
    const dA = new Date(a.date);
    const dB = new Date(b.date);
    if (isNaN(dA.getTime()) && isNaN(dB.getTime())) return 0;
    if (isNaN(dA.getTime())) return 1;
    if (isNaN(dB.getTime())) return -1;
    return dB - dA;
  } catch { return 0; }
};

const getTypeDisplayName = (type) => {
  const map = {
    exchange_loss: "Exchange Loss",
    remittance:    "Remittance",
    expense:       "Expense",
    salary:        "Salary",
    other_expense: "Other Expenses",
  };
  return map[type] || type;
};

// =============================================================================
// Core data fetcher (reused by GET / and GET /export/excel)
// NOTE: Purchase is intentionally excluded from all queries and summaries.
// =============================================================================
const getFinancialData = async (filters) => {
  const { startDate, endDate, search, expenseType } = filters;

  // ── Date filter ──────────────────────────────────────────────────────────
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) {
      const s = new Date(startDate);
      if (!isNaN(s.getTime())) dateFilter.date.$gte = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      if (!isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = e;
      }
    }
  }

  // ── Category lookups ─────────────────────────────────────────────────────
  const [remittanceCategory, salaryCategory] = await Promise.all([
    Category.findOne({ code: "remittance" }),
    Category.findOne({ code: "salary" }),
  ]);

  const excludeCategoryIds = [];
  if (remittanceCategory?._id) excludeCategoryIds.push(remittanceCategory._id);
  if (salaryCategory?._id)     excludeCategoryIds.push(salaryCategory._id);

  // ── Parallel DB queries ──────────────────────────────────────────────────
  const [
    normalRemittances,  // isConversionLoss = false → Remittance total
    exchangeLossTxns,   // isConversionLoss = true  → Exchange Loss total
    expenses,
    salaries,
    otherExpenses,
  ] = await Promise.all([

    // 1. Normal remittances (NOT flagged as conversion loss)
    Transaction.find({
      ...dateFilter,
      transactionType:  "remittance",
      isConversionLoss: { $ne: true },
    }).lean(),

    // 2. Exchange-loss remittances (isConversionLoss = true)
    //    finalAmount is the full Exchange Loss value
    Transaction.find({
      ...dateFilter,
      isConversionLoss: true,
    }).lean(),

    // 3. Expenses (from Expense collection)
    Expense.find(dateFilter).lean(),

    // 4. Salary transactions
    Transaction.find({
      ...dateFilter,
      isConversionLoss: { $ne: true },
      $or: [
        { categoryType: salaryCategory?._id },
        { transactionType: "salary" },
      ],
    }).lean(),

    // 5. Other expenses (withdraw / payment outward / expense,
    //    NOT remittance / salary / conversionLoss)
    Transaction.find({
      ...dateFilter,
      isConversionLoss: { $ne: true },
      $and: [
        {
          $or: [
            { categoryType: { $nin: excludeCategoryIds } },
            { categoryType: { $exists: false } },
          ],
        },
        { transactionType: { $nin: ["remittance", "salary"] } },
        { transactionType: { $in: ["withdraw", "payment outward", "expense"] } },
      ],
    }).lean(),
  ]);

  // ── Build unified data array ──────────────────────────────────────────────
  const allData = [];

  const push = (docs, type, amountFn) => {
    docs.forEach((doc) => {
      const amount = amountFn(doc);
      if (amount <= 0) return;
      const key = `${type}:${doc._id}`;
      if (!allData.some((i) => i.uniqueKey === key)) {
        allData.push({
          uniqueKey:       key,
          _id:             doc._id,
          date:            doc.date,
          type,
          description:     doc.description || doc.remarks || "",
          amount,
          referenceNumber: doc.referenceNumber || "",
          createdAt:       doc.createdAt,
          updatedAt:       doc.updatedAt,
        });
      }
    });
  };

  // Normal remittances → finalAmount
  push(normalRemittances, "remittance",    (d) => parseFloat(d.finalAmount || d.amount) || 0);

  // Exchange-loss remittances → full finalAmount = Exchange Loss
  push(exchangeLossTxns,  "exchange_loss", (d) => parseFloat(d.finalAmount || d.amount) || 0);

  // Expenses → amount
  push(expenses,          "expense",       (d) => parseFloat(d.amount) || 0);

  // Salaries → finalAmount or amount
  push(salaries,          "salary",        (d) => parseFloat(d.finalAmount || d.amount) || 0);

  // Other expenses → finalAmount or amount
  push(otherExpenses,     "other_expense", (d) => parseFloat(d.finalAmount || d.amount) || 0);

  // ── Search filter ─────────────────────────────────────────────────────────
  let filtered = allData;
  if (search?.trim()) {
    const re = new RegExp(search.trim(), "i");
    filtered = filtered.filter(
      (i) => re.test(i.description) || re.test(i.referenceNumber),
    );
  }

  // ── Expense-type filter ───────────────────────────────────────────────────
  if (expenseType && expenseType !== "all") {
    filtered = filtered.filter((i) => i.type === expenseType);
  }

  // ── Sort by date desc ─────────────────────────────────────────────────────
  filtered.sort(safeDateCompare);

  // ── Summary totals (no purchase) ─────────────────────────────────────────
  const sum = (type) =>
    filtered.filter((i) => i.type === type).reduce((s, i) => s + i.amount, 0);

  const summary = {
    totalExchangeLoss: sum("exchange_loss"),
    totalRemittance:   sum("remittance"),
    totalExpense:      sum("expense"),
    totalSalary:       sum("salary"),
    totalOtherExpense: sum("other_expense"),
    totalTransactions: filtered.length,
  };

  return { allData: filtered, summary };
};

// =============================================================================
// GET /api/reports/total-expense
// =============================================================================
router.get("/", async (req, res) => {
  try {
    const {
      startDate, endDate,
      page  = 1,
      limit = 7,
      search, expenseType,
    } = req.query;

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const skip     = (pageNum - 1) * limitNum;

    const { allData, summary } = await getFinancialData({ startDate, endDate, search, expenseType });

    const totalCount    = allData.length;
    const paginatedData = allData.slice(skip, skip + limitNum);
    const totalPages    = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data:    paginatedData,
      summary,
      pagination: {
        currentPage:  pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext:      pageNum < totalPages,
        hasPrev:      pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error in financial summary report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching financial summary data",
      error:   error.message,
    });
  }
});

// =============================================================================
// GET /api/reports/total-expense/export/excel
// =============================================================================
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, expenseType } = req.query;
    const { allData, summary } = await getFinancialData({ startDate, endDate, search, expenseType });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Financial Summary System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Financial Summary Report");
    worksheet.columns = [
      { header: "Sr.No",      key: "serialNo", width: 8  },
      { header: "Date",       key: "date",     width: 15 },
      { header: "Type",       key: "type",     width: 20 },
      { header: "Amount ($)", key: "amount",   width: 15 },
    ];

    // Header row styling
    const headerRow = worksheet.getRow(1);
    headerRow.font      = { bold: true, size: 12 };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height    = 25;
    headerRow.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Data rows
    allData.forEach((item, idx) => {
      const row = worksheet.addRow({
        serialNo: idx + 1,
        date:     item.date,
        type:     getTypeDisplayName(item.type),
        amount:   item.amount,
      });
      row.font      = { size: 11 };
      row.alignment = { vertical: "middle", horizontal: "center" };

      const dateCell = row.getCell("date");
      if (item.date) {
        dateCell.value  = new Date(item.date);
        dateCell.numFmt = "dd-mm-yyyy";
      }
      row.getCell("amount").numFmt = "$#,##0.00";
    });

    // Summary section
    if (allData.length > 0) {
      worksheet.addRow({});

      const summaryHeader = worksheet.addRow(["SUMMARY"]);
      summaryHeader.font      = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: "center" };
      summaryHeader.getCell(1).fill = {
        type: "pattern", pattern: "solid",
        fgColor: { argb: "FFD0D0D0" },
      };
      worksheet.mergeCells(`A${summaryHeader.number}:D${summaryHeader.number}`);

      const grandTotal =
        summary.totalExchangeLoss +
        summary.totalRemittance +
        summary.totalExpense +
        summary.totalSalary +
        summary.totalOtherExpense;

      const summaryRows = [
        { label: "Total Exchange Loss:",  value: summary.totalExchangeLoss, isMoney: true  },
        { label: "Total Remittance:",     value: summary.totalRemittance,   isMoney: true  },
        { label: "Total Expense:",        value: summary.totalExpense,      isMoney: true  },
        { label: "Total Salary:",         value: summary.totalSalary,       isMoney: true  },
        { label: "Total Other Expenses:", value: summary.totalOtherExpense, isMoney: true  },
        { label: "Total Transactions:",   value: summary.totalTransactions, isMoney: false },
        { label: "Grand Total:",          value: grandTotal,                isMoney: true  },
      ];

      summaryRows.forEach(({ label, value, isMoney }) => {
        const row = worksheet.addRow({ serialNo: label, type: value });
        row.font = { bold: true };
        const cell = row.getCell("type");
        if (isMoney) cell.numFmt = "$#,##0.00";
        cell.alignment = { horizontal: "right" };
      });
    } else {
      const noDataRow = worksheet.addRow(["No financial data found for the selected criteria"]);
      noDataRow.font      = { italic: true, color: { argb: "FF666666" } };
      noDataRow.alignment = { horizontal: "center" };
      noDataRow.height    = 30;
      worksheet.mergeCells(`A${noDataRow.number}:D${noDataRow.number}`);
    }

    // Borders
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      if (row.values.some((c) => c !== undefined && c !== "")) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top:    { style: "thin" },
            left:   { style: "thin" },
            bottom: { style: "thin" },
            right:  { style: "thin" },
          };
        });
      }
    });

    if (allData.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to:   { row: 1, column: worksheet.columnCount },
      };
    }

    const fileName = `financial-summary-${new Date().toISOString().split("T")[0]}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(await workbook.xlsx.writeBuffer());

  } catch (error) {
    console.error("Error in /export/excel:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate Excel export",
      error:   error.message,
    });
  }
});

export default router;
