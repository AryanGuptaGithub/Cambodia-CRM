import express from "express";
import Category from "../../models/accounts/CategoryType.js";
import Transaction from "../../models/accounts/Transaction.js";
import Expense from "../../models/expenses/addExpense.js";
import Purchase from "../../models/purcharsing/purchaseInventory.js";

const router = express.Router();

// Helper function to safely format dates
const safeDateToString = (date) => {
  if (!date) return null;
  try {
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) return null;
    return dateObj.toISOString().split("T")[0];
  } catch (error) {
    return null;
  }
};

// Helper function for date comparison in sorting
const safeDateCompare = (a, b) => {
  try {
    const dateA = new Date(a.date);
    const dateB = new Date(b.date);

    if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
    if (isNaN(dateA.getTime())) return 1;
    if (isNaN(dateB.getTime())) return -1;

    return dateB - dateA;
  } catch (error) {
    return 0;
  }
};

router.get("/reports/financial-summary", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      page = 1,
      limit = 7,
      search,
      expenseType,
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};

      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate format",
          });
        }
        dateFilter.date.$gte = start;
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
        dateFilter.date.$lte = end;
      }
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get category IDs
    const remittanceCategory = await Category.findOne({ code: "remittance" });
    const salaryCategory = await Category.findOne({ code: "salary" });

    // Fetch data from all sources
    const [
      purchaseData,
      remittanceData,
      expenseData,
      salaryData,
      exchangeLossData,
    ] = await Promise.all([
      // 1. Purchase Data
      Purchase.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              date: "$date",
              description: "$description",
              amount: "$amount",
              referenceNumber: "$referenceNumber",
            },
            doc: { $first: "$$ROOT" },
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $literal: "purchase" },
            description: 1,
            amount: 1,
            referenceNumber: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),

      // 2. Remittance Data (ONLY from transactions with remittance category)
      Transaction.aggregate([
        {
          $match: {
            ...dateFilter,
            categoryType: remittanceCategory?._id,
          },
        },
        {
          $group: {
            _id: {
              date: "$date",
              description: "$description",
              amount: "$amount",
              referenceNumber: "$referenceNumber",
            },
            doc: { $first: "$$ROOT" },
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $literal: "remittance" },
            description: 1,
            amount: 1,
            referenceNumber: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),

      // 3. Expense Data
      Expense.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              date: "$date",
              description: "$description",
              amount: "$amount",
              referenceNumber: "$referenceNumber",
            },
            doc: { $first: "$$ROOT" },
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $literal: "expense" },
            description: 1,
            amount: 1,
            referenceNumber: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),

      // 4. Salary Data (transactions with salary category)
      Transaction.aggregate([
        {
          $match: {
            ...dateFilter,
            categoryType: salaryCategory?._id,
          },
        },
        {
          $group: {
            _id: {
              date: "$date",
              description: "$description",
              amount: "$amount",
              referenceNumber: "$referenceNumber",
            },
            doc: { $first: "$$ROOT" },
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $literal: "salary" },
            description: 1,
            amount: 1,
            referenceNumber: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),

      // 5. Exchange Loss Data (from transactions)
      Transaction.aggregate([
        {
          $match: {
            ...dateFilter,
            exchangeLoss: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: {
              date: "$date",
              description: "$description",
              exchangeLoss: "$exchangeLoss",
              referenceNumber: "$referenceNumber",
            },
            doc: { $first: "$$ROOT" },
          },
        },
        {
          $replaceRoot: { newRoot: "$doc" },
        },
        {
          $project: {
            _id: 1,
            date: 1,
            type: { $literal: "exchange_loss" },
            description: 1,
            amount: "$exchangeLoss",
            referenceNumber: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        },
      ]),
    ]);

    let allData = [];
    const seenKeys = new Set();

    const processDataWithPriority = (dataArray, type) => {
      dataArray.forEach((item) => {
        try {
          const normalizedDate = safeDateToString(item.date);
          const normalizedDescription = (item.description || "")
            .toString()
            .trim()
            .toLowerCase();
          const normalizedAmount = parseFloat(item.amount || 0).toFixed(2);
          const normalizedRef = (item.referenceNumber || "")
            .toString()
            .trim()
            .toLowerCase();

          const exactKey = `${normalizedDate}|${normalizedDescription}|${normalizedAmount}|${normalizedRef}|${type}`;
          const amountDateKey = `${normalizedDate}|${normalizedAmount}|${type}`;
          const descriptionAmountKey = `${normalizedDescription}|${normalizedAmount}|${type}`;

          const isDuplicate =
            seenKeys.has(exactKey) ||
            seenKeys.has(amountDateKey) ||
            seenKeys.has(descriptionAmountKey);

          if (!isDuplicate) {
            // Add to all keys to prevent future duplicates
            seenKeys.add(exactKey);
            seenKeys.add(amountDateKey);
            seenKeys.add(descriptionAmountKey);

            allData.push({
              ...item,
              type: type,
              // Ensure consistent data structure
              date: normalizedDate ? new Date(normalizedDate) : item.date,
              description: normalizedDescription,
              amount: parseFloat(normalizedAmount),
              referenceNumber: normalizedRef,
            });
          }
        } catch (error) {
          console.error(`Error processing ${type} item:`, error, item);
          // Add with fallback key to avoid data loss
          const fallbackKey = `${item._id}-${type}`;
          if (!seenKeys.has(fallbackKey)) {
            seenKeys.add(fallbackKey);
            allData.push({
              ...item,
              type: type,
            });
          }
        }
      });
    };

    processDataWithPriority(remittanceData, "remittance");
    processDataWithPriority(purchaseData, "purchase");
    processDataWithPriority(expenseData, "expense");
    processDataWithPriority(salaryData, "salary");
    processDataWithPriority(exchangeLossData, "exchange_loss");

    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      allData = allData.filter(
        (item) =>
          (item.description && item.description.match(searchRegex)) ||
          (item.referenceNumber && item.referenceNumber.match(searchRegex))
      );
    }

    if (expenseType && expenseType !== "all") {
      allData = allData.filter((item) => item.type === expenseType);
    }

    allData.sort(safeDateCompare);
    const totalCount = allData.length;
    const paginatedData = allData.slice(skip, skip + limitNum);
    const summary = {
      totalPurchase: allData
        .filter((item) => item.type === "purchase")
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
      totalExchangeLoss: allData
        .filter((item) => item.type === "exchange_loss")
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
      totalRemittance: allData
        .filter((item) => item.type === "remittance")
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
      totalExpense: allData
        .filter((item) => item.type === "expense")
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
      totalSalary: allData
        .filter((item) => item.type === "salary")
        .reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0),
      totalTransactions: totalCount,
    };

    const totalPages = Math.ceil(totalCount / limitNum);
    return res.json({
      success: true,
      data: paginatedData,
      summary: summary,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
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

export default router;
