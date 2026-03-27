import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Expense from "../../models/expenses/addExpense.js";
import Purchase from "../../models/purcharsing/purchaseInventory.js";
import ExcelJS from "exceljs";

const router = express.Router();

// Helper: safe date formatting
const safeDateToString = (date) => {
  if (!date) return null;
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString().split("T")[0];
  } catch {
    return null;
  }
};

// Helper: date comparison for sorting
const safeDateCompare = (a, b) => {
  try {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);
    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;
    return dateB - dateA;
  } catch {
    return 0;
  }
};

// Helper to get financial data (reusable for API and export)
const getFinancialData = async (filters) => {
  const { startDate, endDate, search, expenseType } = filters;

  // Build date filter
  const dateFilter = {};
  if (startDate || endDate) {
    dateFilter.date = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) dateFilter.date.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        dateFilter.date.$lte = end;
      }
    }
  }

  // Get category IDs for remittance and salary
  const remittanceCategory = await Category.findOne({ code: "remittance" });
  const salaryCategory = await Category.findOne({ code: "salary" });

  // Build a list of IDs to exclude from other_expense
  const excludeCategoryIds = [];
  if (remittanceCategory?._id) excludeCategoryIds.push(remittanceCategory._id);
  if (salaryCategory?._id) excludeCategoryIds.push(salaryCategory._id);

  // Fetch all data sources with simple `find()`
  const [
    purchases,
    remittances,
    expenses,
    salaries,
    exchangeLosses,
    otherExpenses,
  ] = await Promise.all([
    // 1. Purchase Data (from Purchase collection)
    Purchase.find(dateFilter).lean(),

    // 2. Remittance Data: transactions that are either in the remittance category
    //    OR have transactionType = "remittance"
    Transaction.find({
      ...dateFilter,
      $or: [
        { categoryType: remittanceCategory?._id },
        { transactionType: "remittance" },
      ],
    }).lean(),

    // 3. Expense Data (from Expense collection)
    Expense.find(dateFilter).lean(),

    // 4. Salary Data: transactions that are either in the salary category
    //    OR have transactionType = "salary"
    Transaction.find({
      ...dateFilter,
      $or: [
        { categoryType: salaryCategory?._id },
        { transactionType: "salary" },
      ],
    }).lean(),

    // 5. Exchange Loss Data (transactions where exchangeLoss > 0)
    Transaction.find({
      ...dateFilter,
      exchangeLoss: { $gt: 0 },
    }).lean(),

    // 6. Other Expenses: all other expense‑type transactions that are NOT already
    //    captured by remittance or salary (by category or transactionType)
    Transaction.find({
      ...dateFilter,
      $and: [
        // Exclude those already counted as remittance or salary
        {
          $or: [
            { categoryType: { $nin: excludeCategoryIds } },
            { categoryType: { $exists: false } },
          ],
        },
        { transactionType: { $nin: ["remittance", "salary"] } },
        // Only expense‑related transaction types
        { transactionType: { $in: ["withdraw", "payment outward", "expense"] } },
      ],
    }).lean(),
  ]);

  // ===== DEBUG: Log other_expense transactions =====
  console.log("\n========== OTHER EXPENSES ==========");
  console.log(`Total other_expense records: ${otherExpenses.length}`);
  if (otherExpenses.length > 0) {
    otherExpenses.forEach((tx, idx) => {
      console.log(`${idx + 1}. ID: ${tx._id}`);
      console.log(`   Date: ${tx.date}`);
      console.log(`   Description: ${tx.description || tx.remarks || ""}`);
      console.log(`   Transaction Type: ${tx.transactionType}`);
      console.log(`   Amount: ${tx.amount}`);
      console.log(`   Reference: ${tx.referenceNumber || "N/A"}`);
      console.log("---");
    });
  } else {
    console.log("No other expense transactions found.");
  }
  console.log("====================================\n");

  // Combine all data with a unique key (source + _id) to avoid duplication
  const allData = [];

  const addData = (docs, type, amountField = "amount") => {
    docs.forEach((doc) => {
      const uniqueKey = `${type}:${doc._id}`;
      if (!allData.some((item) => item.uniqueKey === uniqueKey)) {
        allData.push({
          uniqueKey,
          _id: doc._id,
          date: doc.date,
          type,
          description: doc.description || doc.remarks || "",
          amount: parseFloat(doc[amountField]) || 0,
          referenceNumber: doc.referenceNumber || "",
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        });
      }
    });
  };

  addData(purchases, "purchase");
  addData(remittances, "remittance");
  addData(expenses, "expense");
  addData(salaries, "salary");
  addData(exchangeLosses, "exchange_loss", "exchangeLoss");
  addData(otherExpenses, "other_expense");

  // Apply search filter (if any)
  let filteredData = allData;
  if (search && search.trim() !== "") {
    const regex = new RegExp(search.trim(), "i");
    filteredData = filteredData.filter(
      (item) =>
        (item.description && item.description.match(regex)) ||
        (item.referenceNumber && item.referenceNumber.match(regex)),
    );
  }

  // Apply expense type filter (if any)
  if (expenseType && expenseType !== "all") {
    filteredData = filteredData.filter((item) => item.type === expenseType);
  }

  // Sort by date descending
  filteredData.sort(safeDateCompare);

  // Calculate summary totals
  const summary = {
    totalPurchase: filteredData
      .filter((item) => item.type === "purchase")
      .reduce((sum, item) => sum + item.amount, 0),
    totalExchangeLoss: filteredData
      .filter((item) => item.type === "exchange_loss")
      .reduce((sum, item) => sum + item.amount, 0),
    totalRemittance: filteredData
      .filter((item) => item.type === "remittance")
      .reduce((sum, item) => sum + item.amount, 0),
    totalExpense: filteredData
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0),
    totalSalary: filteredData
      .filter((item) => item.type === "salary")
      .reduce((sum, item) => sum + item.amount, 0),
    totalOtherExpense: filteredData
      .filter((item) => item.type === "other_expense")
      .reduce((sum, item) => sum + item.amount, 0),
    totalTransactions: filteredData.length,
  };

  console.log(`\n[Summary] Other Expenses total: $${summary.totalOtherExpense.toFixed(2)}`);

  return { allData: filteredData, summary };
};

/**
 * GET /api/reports/total-expense
 */
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      expenseType,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const { allData, summary } = await getFinancialData({
      startDate,
      endDate,
      search,
      expenseType,
    });

    const totalCount = allData.length;
    const paginatedData = allData.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum);

    return res.json({
      success: true,
      data: paginatedData,
      summary,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalRecords: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    });
  } catch (error) {
    console.error("Error in financial summary report:", error);
    return res.status(500).json({
      success: false,
      message: "Server error fetching financial summary data",
      error: error.message,
    });
  }
});

/**
 * GET /api/reports/total-expense/export/excel
 */
router.get("/export/excel", async (req, res) => {
  try {
    const { startDate, endDate, search, expenseType } = req.query;
    const { allData, summary } = await getFinancialData({
      startDate,
      endDate,
      search,
      expenseType,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Financial Summary System";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet("Financial Summary Report");
    worksheet.columns = [
      { header: "Sr.No", key: "serialNo", width: 8 },
      { header: "Date", key: "date", width: 15 },
      { header: "Type", key: "type", width: 20 },
      { header: "Amount ($)", key: "amount", width: 15 },
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

    allData.forEach((item, idx) => {
      const row = worksheet.addRow({
        serialNo: idx + 1,
        date: item.date,
        type: getTypeDisplayName(item.type),
        amount: item.amount,
      });
      row.font = { size: 11 };
      row.alignment = { vertical: "middle", horizontal: "center" };

      const dateCell = row.getCell("date");
      if (item.date) {
        dateCell.value = new Date(item.date);
        dateCell.numFmt = "dd-mm-yyyy";
      }
      const amountCell = row.getCell("amount");
      amountCell.numFmt = "$#,##0.00";
    });

    // Summary section
    if (allData.length > 0) {
      worksheet.addRow({});
      const summaryHeader = worksheet.addRow(["SUMMARY"]);
      summaryHeader.font = { bold: true, size: 12 };
      summaryHeader.alignment = { horizontal: "center" };
      summaryHeader.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD0D0D0" },
      };
      worksheet.mergeCells(`A${summaryHeader.number}:D${summaryHeader.number}`);

      const summaryRows = [
        { label: "Total Purchase:", value: summary.totalPurchase },
        { label: "Total Exchange Loss:", value: summary.totalExchangeLoss },
        { label: "Total Remittance:", value: summary.totalRemittance },
        { label: "Total Expense:", value: summary.totalExpense },
        { label: "Total Salary:", value: summary.totalSalary },
        { label: "Total Other Expenses:", value: summary.totalOtherExpense },
        { label: "Total Transactions:", value: summary.totalTransactions },
        {
          label: "Grand Total:",
          value:
            summary.totalPurchase +
            summary.totalExchangeLoss +
            summary.totalRemittance +
            summary.totalExpense +
            summary.totalSalary +
            summary.totalOtherExpense,
        },
      ];

      summaryRows.forEach((rowData) => {
        const row = worksheet.addRow({
          serialNo: rowData.label,
          type: rowData.value,
        });
        row.font = { bold: true };
        const valueCell = row.getCell("type");
        if (
          rowData.label.includes("Total") &&
          !rowData.label.includes("Transactions")
        ) {
          valueCell.numFmt = "$#,##0.00";
        }
        valueCell.alignment = { horizontal: "right" };
      });
    } else {
      const noDataRow = worksheet.addRow([
        "No financial data found for the selected criteria",
      ]);
      noDataRow.font = { italic: true, color: { argb: "FF666666" } };
      noDataRow.alignment = { horizontal: "center" };
      noDataRow.height = 30;
      worksheet.mergeCells(`A${noDataRow.number}:D${noDataRow.number}`);
    }

    // Borders
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      if (row.values.some((cell) => cell !== undefined && cell !== "")) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      }
    });

    if (allData.length > 0) {
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: worksheet.columnCount },
      };
    }

    const fileName = `financial-summary-${new Date().toISOString().split("T")[0]}.xlsx`;
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
    });
  }
});

const getTypeDisplayName = (type) => {
  const map = {
    purchase: "Purchase",
    exchange_loss: "Exchange Loss",
    remittance: "Remittance",
    expense: "Expense",
    salary: "Salary",
    other_expense: "Other Expenses",
  };
  return map[type] || type;
};

export default router;