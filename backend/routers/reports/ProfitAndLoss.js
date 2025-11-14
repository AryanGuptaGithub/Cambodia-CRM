// routes/plReport.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SalesReturn from "../../models/sale/saleReturn.js";
import Payroll from "../../models/Hrm/Payroll.js";
import addExpense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";
const router = express.Router();

// GET /api/pl-report - Get combined Profit & Loss report
router.get("/pl-report", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter objects
    let saleFilter = {};
    let returnFilter = {};
    let payrollFilter = {};
    let expenseFilter = {};

    // Date range filter
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // For sales - use recordingDate
      saleFilter.recordingDate = {};
      returnFilter.recordingDate = {};
      // For expenses - use date field
      expenseFilter.date = {};

      if (start) {
        saleFilter.recordingDate.$gte = start;
        returnFilter.recordingDate.$gte = start;
        expenseFilter.date.$gte = start;
      }
      if (end) {
        saleFilter.recordingDate.$lte = end;
        returnFilter.recordingDate.$lte = end;
        expenseFilter.date.$lte = end;
      }

      // For payroll - use createdAt
      payrollFilter.createdAt = {};
      if (start) payrollFilter.createdAt.$gte = start;
      if (end) payrollFilter.createdAt.$lte = end;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get all data without pagination for details
    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName"
      )
      .sort({ recordingDate: sortDirection });

    const salesReturns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: sortDirection });

    const payrolls = await Payroll.find(payrollFilter)
      .select(
        "period payrollCode employeeId basicSalary totalAllowance deductions netSalary status paymentDate createdAt"
      )
      .populate("employeeId", "medicalRepName employeeName")
      .sort({ createdAt: sortDirection });

    const expenses = await addExpense
      .find(expenseFilter)
      .select(
        "date category remarks amount sourceAccount paymentMethod createdBy"
      )
      .populate({
        path: "category",
        select: "category description",
        model: addExpenseCategary,
      })
      .populate("sourceAccount", "name accountNumber")
      .populate("createdBy", "name email")
      .sort({ date: sortDirection });

    // Transform data with detailed structure
    const salesData = sales.map((sale) => ({
      _id: sale._id,
      type: "sale",
      date: sale.recordingDate,
      title: sale.invoiceNumber,
      description: `Sale to ${sale.customerName}`,
      amount: sale.totalAmount,
      profit: sale.totalAmount,
      expense: 0,
      status: sale.paymentStatus,
      details: {
        paidAmount: sale.paidAmount,
        dueAmount: sale.dueAmount,
        mrName: sale.mrName,
        customerName: sale.customerName,
      },
    }));

    const returnData = salesReturns.map((salesReturn) => ({
      _id: salesReturn._id,
      type: "return",
      date: salesReturn.recordingDate,
      title: `${salesReturn.invoiceNumber} (Return)`,
      description: `Return from ${salesReturn.customerName}`,
      amount: -salesReturn.totalAmount,
      profit: -salesReturn.totalAmount,
      expense: 0,
      status: salesReturn.paymentStatus,
      details: {
        paidAmount: salesReturn.paidAmount,
        dueAmount: salesReturn.dueAmount,
        mrName: salesReturn.mrName,
        customerName: salesReturn.customerName,
        usedAmount: salesReturn.products.reduce(
          (total, product) => total + (product.usedAmount || 0),
          0
        ),
        productCount: salesReturn.products.length,
      },
    }));

    const payrollData = payrolls.map((payroll) => ({
      _id: payroll._id,
      type: "payroll",
      date: payroll.createdAt,
      title: payroll.payrollCode,
      description: `Salary for ${
        payroll.employeeId?.medicalRepName ||
        payroll.employeeId?.employeeName ||
        "Employee"
      }`,
      amount: payroll.netSalary,
      profit: -payroll.netSalary,
      expense: payroll.netSalary,
      status: payroll.status,
      details: {
        basicSalary: payroll.basicSalary,
        allowances: payroll.totalAllowance,
        deductions: payroll.deductions,
        period: payroll.period,
        employeeName:
          payroll.employeeId?.medicalRepName ||
          payroll.employeeId?.employeeName ||
          "Unknown",
        paymentDate: payroll.paymentDate,
      },
    }));

    const expenseData = expenses.map((expense) => {
      const categoryData = expense.category;
      const categoryName =
        categoryData?.category || categoryData?.name || "Uncategorized";
      const categoryDescription = categoryData?.description || "No description";

      return {
        _id: expense._id,
        type: "expense",
        date: expense.date,
        title: categoryName,
        description: expense.remarks || `Expense: ${categoryName}`,
        amount: -expense.amount,
        profit: -expense.amount,
        expense: expense.amount,
        status: "paid",
        details: {
          category: {
            name: categoryName,
            description: categoryDescription,
            categoryId: categoryData?._id || null,
          },
          sourceAccount: {
            name: expense.sourceAccount?.name || "Unknown Account",
            accountNumber: expense.sourceAccount?.accountNumber || "N/A",
            accountId: expense.sourceAccount?._id,
          },
          staff: expense.createdBy
            ? {
                name: expense.createdBy.name || "Unknown Staff",
                email: expense.createdBy.email || "N/A",
                staffId: expense.createdBy._id,
              }
            : {
                name: "Unknown Staff",
                email: "N/A",
                staffId: null,
              },
          paymentMethod: expense.paymentMethod,
          remarks: expense.remarks,
          expenseId: expense._id,
          createdAt: expense.createdAt,
        },
      };
    });

    // Create combined data with pagination
    const allCombinedData = [
      ...salesData,
      ...returnData,
      ...payrollData,
      ...expenseData,
    ].sort((a, b) => {
      const aDate = new Date(a.date);
      const bDate = new Date(b.date);
      return sortDirection === -1 ? bDate - aDate : aDate - bDate;
    });

    // Apply pagination to combined data
    const combinedData = allCombinedData.slice(skip, skip + parseInt(limit));

    // Get counts
    const totalSales = await SaleSummary.countDocuments(saleFilter);
    const totalReturns = await SalesReturn.countDocuments(returnFilter);
    const totalPayrolls = await Payroll.countDocuments(payrollFilter);
    const totalExpenses = await addExpense.countDocuments(expenseFilter);
    const total = totalSales + totalReturns + totalPayrolls + totalExpenses;

    // Calculate totals
    const salesTotals = await SaleSummary.aggregate([
      { $match: saleFilter },
      {
        $group: {
          _id: null,
          totalSalesAmount: { $sum: "$totalAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          totalDueAmount: { $sum: "$dueAmount" },
          totalSalesCount: { $sum: 1 },
        },
      },
    ]);

    const returnsTotals = await SalesReturn.aggregate([
      { $match: returnFilter },
      {
        $group: {
          _id: null,
          totalReturnsAmount: { $sum: "$totalAmount" },
          totalReturnsPaid: { $sum: "$paidAmount" },
          totalReturnsDue: { $sum: "$dueAmount" },
          totalReturnsCount: { $sum: 1 },
          totalUsedAmount: {
            $sum: {
              $reduce: {
                input: "$products",
                initialValue: 0,
                in: {
                  $add: ["$$value", { $ifNull: ["$$this.usedAmount", 0] }],
                },
              },
            },
          },
        },
      },
    ]);

    const payrollTotals = await Payroll.aggregate([
      { $match: payrollFilter },
      {
        $group: {
          _id: null,
          totalNetSalary: { $sum: "$netSalary" },
          totalBasicSalary: { $sum: "$basicSalary" },
          totalAllowances: { $sum: "$totalAllowance" },
          totalDeductions: { $sum: "$deductions" },
          totalPayrollCount: { $sum: 1 },
        },
      },
    ]);

    const expenseTotals = await addExpense.aggregate([
      { $match: expenseFilter },
      {
        $lookup: {
          from: "addexpensecategaries",
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: {
          path: "$categoryInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: null,
          totalExpenseAmount: { $sum: "$amount" },
          expenseCount: { $sum: 1 },
          byCategory: {
            $push: {
              categoryId: "$categoryInfo._id",
              categoryName: "$categoryInfo.category",
              categoryDescription: "$categoryInfo.description",
              amount: "$amount",
            },
          },
        },
      },
      {
        $project: {
          totalExpenseAmount: 1,
          expenseCount: 1,
          categoryBreakdown: {
            $arrayToObject: {
              $map: {
                input: "$byCategory",
                as: "cat",
                in: {
                  k: {
                    $ifNull: [
                      "$$cat.categoryName",
                      { $ifNull: ["$$cat.category", "Uncategorized"] },
                    ],
                  },
                  v: {
                    amount: "$$cat.amount",
                    description: "$$cat.categoryDescription",
                    categoryId: "$$cat.categoryId",
                  },
                },
              },
            },
          },
        },
      },
    ]);

    const salesTotal = salesTotals[0] || {
      totalSalesAmount: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
      totalSalesCount: 0,
    };

    const returnsTotal = returnsTotals[0] || {
      totalReturnsAmount: 0,
      totalReturnsPaid: 0,
      totalReturnsDue: 0,
      totalReturnsCount: 0,
      totalUsedAmount: 0,
    };

    const payrollTotal = payrollTotals[0] || {
      totalNetSalary: 0,
      totalBasicSalary: 0,
      totalAllowances: 0,
      totalDeductions: 0,
      totalPayrollCount: 0,
    };

    const expenseTotal = expenseTotals[0] || {
      totalExpenseAmount: 0,
      expenseCount: 0,
      categoryBreakdown: {},
    };

    const grossRevenue = salesTotal.totalSalesAmount;
    const returnsDeduction = returnsTotal.totalReturnsAmount;
    const usedAmountAddition = returnsTotal.totalUsedAmount;
    const netRevenue = grossRevenue - returnsDeduction + usedAmountAddition;

    const totalExpensesAmount =
      payrollTotal.totalNetSalary + expenseTotal.totalExpenseAmount;

    const netProfit = netRevenue - totalExpensesAmount;

    const totals = {
      totalSales: salesTotal.totalSalesAmount,
      totalReturns: returnsTotal.totalReturnsAmount,
      totalUsedAmount: returnsTotal.totalUsedAmount,
      totalRevenue: netRevenue,
      totalExpense: totalExpensesAmount,
      payrollExpense: payrollTotal.totalNetSalary,
      otherExpense: expenseTotal.totalExpenseAmount,
      totalProfit: netProfit > 0 ? netProfit : 0,
      totalLoss: netProfit < 0 ? Math.abs(netProfit) : 0,
      netProfit: netProfit,
      salesCount: salesTotal.totalSalesCount,
      returnsCount: returnsTotal.totalReturnsCount,
      payrollCount: payrollTotal.totalPayrollCount,
      expenseCount: expenseTotal.expenseCount,
    };

    // Prepare detailed arrays for frontend
    const salaryDetails = payrollData; // This contains all payroll records with detailed structure
    const expenseDetails = expenseData; // This contains all expense records with detailed structure

    const response = {
      success: true,
      data: combinedData,
      details: {
        salaryDetails: salaryDetails,
        expenseDetails: expenseDetails,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      totals: totals,
      breakdown: {
        sales: salesTotal,
        returns: returnsTotal,
        payroll: payrollTotal,
        expenses: {
          ...expenseTotal,
          categoryBreakdown: expenseTotal.categoryBreakdown || {},
        },
      },
    };

    res.json(response);
  } catch (error) {
    console.error("Profit Loss Report Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profit loss report",
      error: error.message,
    });
  }
});

// Keep the other endpoints (summary and orders) the same as in your original code
// GET /api/pl-report/summary - Get summary statistics
router.get("/pl-report/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let saleFilter = {};
    let returnFilter = {};
    let payrollFilter = {};
    let expenseFilter = {};

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      saleFilter.recordingDate = {};
      returnFilter.recordingDate = {};
      expenseFilter.date = {};

      if (start) {
        saleFilter.recordingDate.$gte = start;
        returnFilter.recordingDate.$gte = start;
        expenseFilter.date.$gte = start;
      }
      if (end) {
        saleFilter.recordingDate.$lte = end;
        returnFilter.recordingDate.$lte = end;
        expenseFilter.date.$lte = end;
      }

      payrollFilter.createdAt = {};
      if (start) payrollFilter.createdAt.$gte = start;
      if (end) payrollFilter.createdAt.$lte = end;
    }

    // Get sales summary
    const salesSummary = await SaleSummary.aggregate([
      { $match: saleFilter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          totalDue: { $sum: "$dueAmount" },
          totalTransactions: { $sum: 1 },
          completedSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 1, 0] },
          },
          partialSales: {
            $sum: {
              $cond: [{ $eq: ["$paymentStatus", "Partial Paid"] }, 1, 0],
            },
          },
          pendingSales: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Pending"] }, 1, 0] },
          },
        },
      },
    ]);

    // Get sales returns summary
    const returnsSummary = await SalesReturn.aggregate([
      { $match: returnFilter },
      {
        $group: {
          _id: null,
          totalReturnsAmount: { $sum: "$totalAmount" },
          totalReturnsPaid: { $sum: "$paidAmount" },
          totalReturnsDue: { $sum: "$dueAmount" },
          totalReturns: { $sum: 1 },
          totalUsedAmount: {
            $sum: {
              $reduce: {
                input: "$products",
                initialValue: 0,
                in: {
                  $add: ["$$value", { $ifNull: ["$$this.usedAmount", 0] }],
                },
              },
            },
          },
        },
      },
    ]);

    // Get payroll summary
    const payrollSummary = await Payroll.aggregate([
      { $match: payrollFilter },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$netSalary" },
          totalBasicSalary: { $sum: "$basicSalary" },
          totalAllowances: { $sum: "$totalAllowance" },
          totalDeductions: { $sum: "$deductions" },
          totalPayrolls: { $sum: 1 },
          paidPayrolls: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
          },
          pendingPayrolls: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
        },
      },
    ]);

    // Get expense summary with IMPROVED category breakdown
    const expenseSummary = await addExpense.aggregate([
      { $match: expenseFilter },
      {
        $lookup: {
          from: "addexpensecategaries",
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: {
          path: "$categoryInfo",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: null,
          totalExpenseAmount: { $sum: "$amount" },
          expenseCount: { $sum: 1 },
          byCategory: {
            $push: {
              categoryName: "$categoryInfo.category",
              categoryDescription: "$categoryInfo.description",
              amount: "$amount",
            },
          },
        },
      },
    ]);

    const salesData = salesSummary[0] || {
      totalRevenue: 0,
      totalPaid: 0,
      totalDue: 0,
      totalTransactions: 0,
      completedSales: 0,
      partialSales: 0,
      pendingSales: 0,
    };

    const returnsData = returnsSummary[0] || {
      totalReturnsAmount: 0,
      totalReturnsPaid: 0,
      totalReturnsDue: 0,
      totalReturns: 0,
      totalUsedAmount: 0,
    };

    const payrollData = payrollSummary[0] || {
      totalExpenses: 0,
      totalBasicSalary: 0,
      totalAllowances: 0,
      totalDeductions: 0,
      totalPayrolls: 0,
      paidPayrolls: 0,
      pendingPayrolls: 0,
    };

    const expenseData = expenseSummary[0] || {
      totalExpenseAmount: 0,
      expenseCount: 0,
      byCategory: [],
    };

    // Calculate NET revenue and profit/loss
    const grossRevenue = salesData.totalRevenue;
    const returnsDeduction = returnsData.totalReturnsAmount;
    const usedAmountAddition = returnsData.totalUsedAmount;
    const netRevenue = grossRevenue - returnsDeduction + usedAmountAddition;

    const totalExpensesAmount =
      payrollData.totalExpenses + expenseData.totalExpenseAmount;

    const netProfit = netRevenue - totalExpensesAmount;
    const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    // Format summary for frontend
    const formattedSummary = {
      revenue: netRevenue,
      cogs: 0,
      grossProfit: netRevenue,
      expenses: totalExpensesAmount,
      payrollExpenses: payrollData.totalExpenses,
      otherExpenses: expenseData.totalExpenseAmount,
      netProfit: netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),

      totalSales: salesData.totalTransactions,
      totalReturns: returnsData.totalReturns,
      totalPayrolls: payrollData.totalPayrolls,
      totalExpenses: expenseData.expenseCount,
      collectionRate:
        grossRevenue > 0 ? (salesData.totalPaid / grossRevenue) * 100 : 0,

      expenseByCategory: expenseData.byCategory.reduce((acc, item) => {
        const category = item.categoryName || "Uncategorized";
        if (!acc[category]) acc[category] = 0;
        acc[category] += item.amount;
        return acc;
      }, {}),
    };

    res.json({
      success: true,
      data: formattedSummary,
      detailed: {
        sales: salesData,
        returns: returnsData,
        payroll: payrollData,
        expenses: expenseData,
      },
    });
  } catch (error) {
    console.error("Summary Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching summary",
      error: error.message,
    });
  }
});

// GET /api/pl-report/orders - Get orders breakdown (sales and returns)
router.get("/pl-report/orders", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let saleFilter = {};
    let returnFilter = {};

    if (startDate || endDate) {
      saleFilter.recordingDate = {};
      returnFilter.recordingDate = {};
      if (startDate) {
        saleFilter.recordingDate.$gte = new Date(startDate);
        returnFilter.recordingDate.$gte = new Date(startDate);
      }
      if (endDate) {
        saleFilter.recordingDate.$lte = new Date(endDate);
        returnFilter.recordingDate.$lte = new Date(endDate);
      }
    }

    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName"
      )
      .sort({ recordingDate: -1 });

    const returns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: -1 });

    // Transform sales data
    const salesData = sales.map((order) => ({
      orderId: order.invoiceNumber,
      date: order.recordingDate,
      customer: order.customerName,
      mrName: order.mrName,
      amount: order.totalAmount,
      paid: order.paidAmount,
      due: order.dueAmount,
      profit: order.totalAmount,
      status: order.paymentStatus.toLowerCase(),
      type: "sale",
    }));

    // Transform returns data
    const returnsData = returns.map((returnOrder) => ({
      orderId: `${returnOrder.invoiceNumber} (Return)`,
      date: returnOrder.recordingDate,
      customer: returnOrder.customerName,
      mrName: returnOrder.mrName,
      amount: -returnOrder.totalAmount,
      paid: returnOrder.paidAmount,
      due: returnOrder.dueAmount,
      profit: -returnOrder.totalAmount,
      status: returnOrder.paymentStatus.toLowerCase(),
      type: "return",
      usedAmount: returnOrder.products.reduce(
        (total, product) => total + (product.usedAmount || 0),
        0
      ),
    }));

    // Combine and sort
    const ordersData = [...salesData, ...returnsData].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    res.json({
      success: true,
      data: ordersData,
    });
  } catch (error) {
    console.error("Orders Report Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders report",
      error: error.message,
    });
  }
});

export default router;