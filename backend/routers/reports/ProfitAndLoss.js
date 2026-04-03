import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SalesReturn from "../../models/sale/saleReturn.js";
import Payroll from "../../models/Hrm/Payroll.js";
import addExpense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";

const router = express.Router();

// ==================== HELPER FUNCTIONS FOR DATE HANDLING ====================

/**
 * Convert a date string (YYYY-MM-DD) to a Date object at UTC midnight (00:00:00)
 */
const getUTCMidnight = (dateStr) => {
  if (!dateStr) return null;

  let year, month, day;

  if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    [year, month, day] = dateStr.split("-").map(Number);
  } else if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    year = dateStr.getFullYear();
    month = dateStr.getMonth() + 1;
    day = dateStr.getDate();
  } else {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
};

/**
 * Get the end of day (23:59:59.999) in UTC for a given date string
 */
const getUTCEndOfDay = (dateStr) => {
  if (!dateStr) return null;

  let year, month, day;

  if (typeof dateStr === "string" && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    [year, month, day] = dateStr.split("-").map(Number);
  } else if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    year = dateStr.getFullYear();
    month = dateStr.getMonth() + 1;
    day = dateStr.getDate();
  } else {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
};

/**
 * Create a date range filter for MongoDB queries
 */
const createDateRangeFilter = (
  startDate,
  endDate,
  dateField = "recordingDate",
) => {
  const filter = {};

  if (startDate) {
    const startUTC = getUTCMidnight(startDate);
    if (startUTC) {
      filter.$gte = startUTC;
    }
  }

  if (endDate) {
    const endUTC = getUTCEndOfDay(endDate);
    if (endUTC) {
      filter.$lte = endUTC;
    }
  }

  return Object.keys(filter).length > 0 ? { [dateField]: filter } : {};
};

// ==================== MAIN ROUTES ====================

// GET / - Main Profit & Loss report
router.get("/", async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      sortBy = "date",
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Create filters using the proper date range function
    const saleFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );
    const returnFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );
    const payrollFilter = createDateRangeFilter(
      startDate,
      endDate,
      "createdAt",
    );
    const expenseFilter = createDateRangeFilter(startDate, endDate, "date");

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get ALL sales without any paymentStatus filter - same as daily reports
    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products totalProfitLoss",
      )
      .sort({ recordingDate: sortDirection })
      .lean();

    const salesWithProfit = await calculateProfitsForSales(sales);

    const salesReturns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products",
      )
      .sort({ recordingDate: sortDirection })
      .lean();

    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

    const payrolls = await Payroll.find(payrollFilter)
      .select(
        "period payrollCode employeeId basicSalary totalAllowance deductions netSalary status paymentDate createdAt",
      )
      .populate("employeeId", "medicalRepName employeeName")
      .sort({ createdAt: sortDirection })
      .lean();

    const expenses = await addExpense
      .find(expenseFilter)
      .select(
        "date category remarks amount sourceAccount paymentMethod createdBy",
      )
      .populate({
        path: "category",
        select: "category description",
        model: addExpenseCategary,
      })
      .populate("sourceAccount", "name accountNumber")
      .populate("createdBy", "name email")
      .sort({ date: sortDirection })
      .lean();

    // Calculate totals - SAME LOGIC as daily reports
    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;

    salesWithProfit.forEach((sale) => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0;
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    let totalReturnsAmount = 0;
    let totalProfitFromReturns = 0;
    let totalReturnsCost = 0;

    returnsWithProfit.forEach((returnItem) => {
      totalReturnsAmount += returnItem.totalAmount || 0;
      totalProfitFromReturns += returnItem.profit || 0;
      totalReturnsCost += returnItem._cost || 0;
    });

    totalCostOfGoodsSold -= totalReturnsCost;

    let totalNetSalary = 0;
    let totalBasicSalary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;

    payrolls.forEach((payroll) => {
      totalNetSalary += payroll.netSalary || 0;
      totalBasicSalary += payroll.basicSalary || 0;
      totalAllowances += payroll.totalAllowance || 0;
      totalDeductions += payroll.deductions || 0;
    });

    let totalExpenseAmount = 0;
    expenses.forEach((expense) => {
      totalExpenseAmount += expense.amount || 0;
    });

    const grossProfitFromSales = totalProfitFromSales;
    const adjustedGrossProfit = grossProfitFromSales + totalProfitFromReturns;
    const totalExpensesAmount = totalNetSalary + totalExpenseAmount;
    const netProfit = adjustedGrossProfit - totalExpensesAmount;

    const profitMargin =
      totalSalesRevenue > 0 ? (netProfit / totalSalesRevenue) * 100 : 0;
    const collectionRate =
      totalSalesRevenue > 0 ? (totalPaidAmount / totalSalesRevenue) * 100 : 0;

    const totalSales = await SaleSummary.countDocuments(saleFilter);
    const totalReturns = await SalesReturn.countDocuments(returnFilter);
    const totalPayrolls = await Payroll.countDocuments(payrollFilter);
    const totalExpenses = await addExpense.countDocuments(expenseFilter);
    const total = totalSales + totalReturns + totalPayrolls + totalExpenses;

    const totals = {
      totalSalesRevenue: totalSalesRevenue,
      totalProfitFromSales: totalProfitFromSales,
      totalReturnsAmount: totalReturnsAmount,
      totalProfitFromReturns: totalProfitFromReturns,
      grossProfit: adjustedGrossProfit,
      totalExpense: totalExpensesAmount,
      payrollExpense: totalNetSalary,
      otherExpense: totalExpenseAmount,
      totalProfit: netProfit > 0 ? netProfit : 0,
      totalLoss: netProfit < 0 ? Math.abs(netProfit) : 0,
      netProfit: netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      salesCount: totalSales,
      returnsCount: totalReturns,
      payrollCount: totalPayrolls,
      expenseCount: totalExpenses,
      totalPaid: totalPaidAmount,
      totalDue: totalDueAmount,
    };

    const salesData = salesWithProfit.map((sale) => ({
      _id: sale._id,
      type: "sale",
      date: sale.recordingDate,
      title: sale.invoiceNumber,
      description: `Sale to ${sale.customerName || "Unknown"}`,
      amount: sale.totalAmount || 0,
      profit: sale.profit || 0,
      expense: 0,
      status: sale.paymentStatus || "pending",
      details: {
        paidAmount: sale.paidAmount || 0,
        dueAmount: sale.dueAmount || 0,
        mrName: sale.mrName || "",
        customerName: sale.customerName || "",
        totalAmount: sale.totalAmount || 0,
        calculatedProfit: sale.profit || 0,
        storedProfitLoss: sale.totalProfitLoss || 0,
      },
    }));

    const returnData = returnsWithProfit.map((salesReturn) => ({
      _id: salesReturn._id,
      type: "return",
      date: salesReturn.recordingDate,
      title: `${salesReturn.invoiceNumber} (Return)`,
      description: `Return from ${salesReturn.customerName || "Unknown"}`,
      amount: -(salesReturn.totalAmount || 0),
      profit: salesReturn.profit || 0,
      expense: 0,
      status: salesReturn.paymentStatus || "pending",
      details: {
        paidAmount: salesReturn.paidAmount || 0,
        dueAmount: salesReturn.dueAmount || 0,
        mrName: salesReturn.mrName || "",
        customerName: salesReturn.customerName || "",
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
      amount: payroll.netSalary || 0,
      profit: -(payroll.netSalary || 0),
      expense: payroll.netSalary || 0,
      status: payroll.status || "pending",
      details: {
        basicSalary: payroll.basicSalary || 0,
        allowances: payroll.totalAllowance || 0,
        deductions: payroll.deductions || 0,
        period: payroll.period || "",
        employeeName:
          payroll.employeeId?.medicalRepName ||
          payroll.employeeId?.employeeName ||
          "Unknown",
        paymentDate: payroll.paymentDate || null,
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
        amount: -(expense.amount || 0),
        profit: -(expense.amount || 0),
        expense: expense.amount || 0,
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

    const combinedData = allCombinedData.slice(skip, skip + parseInt(limit));

    const salaryDetails = payrollData;
    const expenseDetails = expenseData;

    const salesProfitDetails = salesWithProfit.map((sale) => ({
      invoiceNumber: sale.invoiceNumber || "N/A",
      date: sale.recordingDate,
      customer: sale.customerName || "Unknown",
      totalAmount: sale.totalAmount || 0,
      profit: sale.profit || 0,
      purchaseCost: sale._cost || 0,
      margin:
        (sale.totalAmount || 0) > 0
          ? ((sale.profit || 0) / (sale.totalAmount || 0)) * 100
          : 0,
      storedProfitLoss: sale.totalProfitLoss || 0,
    }));

    const response = {
      success: true,
      data: combinedData,
      details: {
        salaryDetails: salaryDetails,
        expenseDetails: expenseDetails,
        profitDetails: salesProfitDetails,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
      totals: totals,
      summary: {
        revenue: totalSalesRevenue,
        cogs: totalCostOfGoodsSold,
        grossProfit: adjustedGrossProfit,
        expenses: totalExpensesAmount,
        payrollExpenses: totalNetSalary,
        otherExpenses: totalExpenseAmount,
        netProfit: netProfit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        totalSales: totalSales,
        totalReturns: totalReturns,
        totalPayrolls: totalPayrolls,
        totalExpenses: totalExpenses,
        collectionRate: parseFloat(collectionRate.toFixed(2)),
        // Add these for debugging
        debug: {
          totalPaidAmount: totalPaidAmount,
          totalDueAmount: totalDueAmount,
          saleCount: sales.length,
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

// GET /summary - Summary statistics
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const saleFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );
    const returnFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );
    const payrollFilter = createDateRangeFilter(
      startDate,
      endDate,
      "createdAt",
    );
    const expenseFilter = createDateRangeFilter(startDate, endDate, "date");

    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate totalAmount paidAmount dueAmount products invoiceNumber totalProfitLoss customerName mrName paymentStatus",
      )
      .sort({ recordingDate: -1 })
      .lean();

    const salesWithProfit = await calculateProfitsForSales(sales);

    const salesReturns = await SalesReturn.find(returnFilter)
      .select("recordingDate totalAmount products")
      .sort({ recordingDate: -1 })
      .lean();

    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

    const payrolls = await Payroll.find(payrollFilter)
      .select("netSalary basicSalary totalAllowance deductions status")
      .lean();

    const expenses = await addExpense
      .find(expenseFilter)
      .select("amount category")
      .lean();

    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;

    salesWithProfit.forEach((sale) => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0;
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    let totalReturnsAmount = 0;
    let totalProfitFromReturns = 0;
    let totalReturnsCost = 0;

    returnsWithProfit.forEach((ret) => {
      totalReturnsAmount += ret.totalAmount || 0;
      totalProfitFromReturns += ret.profit || 0;
      totalReturnsCost += ret._cost || 0;
    });

    totalCostOfGoodsSold -= totalReturnsCost;

    let totalNetSalary = 0;
    let totalBasicSalary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;

    payrolls.forEach((payroll) => {
      totalNetSalary += payroll.netSalary || 0;
      totalBasicSalary += payroll.basicSalary || 0;
      totalAllowances += payroll.totalAllowance || 0;
      totalDeductions += payroll.deductions || 0;
    });

    let totalExpenseAmount = 0;
    expenses.forEach((expense) => {
      totalExpenseAmount += expense.amount || 0;
    });

    const grossProfit = totalProfitFromSales;
    const returnsProfit = totalProfitFromReturns;
    const adjustedGrossProfit = grossProfit + returnsProfit;
    const totalExpensesAmount = totalNetSalary + totalExpenseAmount;
    const netProfit = adjustedGrossProfit - totalExpensesAmount;

    const profitMargin =
      totalSalesRevenue > 0 ? (netProfit / totalSalesRevenue) * 100 : 0;
    const collectionRate =
      totalSalesRevenue > 0 ? (totalPaidAmount / totalSalesRevenue) * 100 : 0;

    const formattedSummary = {
      revenue: totalSalesRevenue,
      cogs: totalCostOfGoodsSold,
      grossProfit: adjustedGrossProfit,
      expenses: totalExpensesAmount,
      payrollExpenses: totalNetSalary,
      otherExpenses: totalExpenseAmount,
      netProfit: netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),
      totalSales: sales.length,
      totalReturns: salesReturns.length,
      totalPayrolls: payrolls.length,
      totalExpenses: expenses.length,
      collectionRate: parseFloat(collectionRate.toFixed(2)),
      // Add cash and credit breakdown for verification
      cashCollected: totalPaidAmount,
      creditAmount: totalDueAmount,
    };

    res.json({
      success: true,
      data: formattedSummary,
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

// GET /orders - Orders breakdown
router.get("/orders", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const saleFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );
    const returnFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );

    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products totalProfitLoss",
      )
      .sort({ recordingDate: -1 })
      .lean();

    const salesWithProfit = await calculateProfitsForSales(sales);

    const returns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products",
      )
      .sort({ recordingDate: -1 })
      .lean();

    const returnsWithProfit = await calculateProfitsForReturns(returns);

    const salesData = salesWithProfit.map((order) => ({
      orderId: order.invoiceNumber || "N/A",
      date: order.recordingDate,
      customer: order.customerName || "Unknown",
      mrName: order.mrName || "",
      amount: order.totalAmount || 0,
      profit: order.profit || 0,
      purchaseCost: order._cost || 0,
      margin:
        (order.totalAmount || 0) > 0
          ? ((order.profit || 0) / (order.totalAmount || 0)) * 100
          : 0,
      paid: order.paidAmount || 0,
      due: order.dueAmount || 0,
      status: order.paymentStatus?.toLowerCase() || "pending",
      type: "sale",
    }));

    const returnsData = returnsWithProfit.map((returnOrder) => ({
      orderId: `${returnOrder.invoiceNumber || "N/A"} (Return)`,
      date: returnOrder.recordingDate,
      customer: returnOrder.customerName || "Unknown",
      mrName: returnOrder.mrName || "",
      amount: -(returnOrder.totalAmount || 0),
      profit: returnOrder.profit || 0,
      purchaseCost: returnOrder._cost || 0,
      margin: 0,
      paid: returnOrder.paidAmount || 0,
      due: returnOrder.dueAmount || 0,
      status: returnOrder.paymentStatus?.toLowerCase() || "pending",
      type: "return",
    }));

    const ordersData = [...salesData, ...returnsData].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
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

// POST /update-profits - Update profit/loss for existing sales
router.post("/update-profits", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    const saleFilter = createDateRangeFilter(
      startDate,
      endDate,
      "recordingDate",
    );

    const sales = await SaleSummary.find(saleFilter)
      .select("products totalAmount")
      .sort({ recordingDate: -1 })
      .lean();

    let updatedCount = 0;
    let errors = [];

    for (const sale of sales) {
      try {
        let totalProfitLoss = 0;

        if (sale.products && Array.isArray(sale.products)) {
          sale.products.forEach((product) => {
            const sellingPrice = product.sellingPrice || product.unitPrice || 0;
            const lc = product.lc || 0;
            const quantity = product.salesQty || product.quantity || 0;
            const productProfitLoss = (sellingPrice - lc) * quantity;
            totalProfitLoss += productProfitLoss;
          });
        }

        await SaleSummary.findByIdAndUpdate(sale._id, {
          totalProfitLoss: totalProfitLoss,
        });

        updatedCount++;
      } catch (error) {
        errors.push({
          saleId: sale._id,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      message: `Updated totalProfitLoss for ${updatedCount} sales`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Update profits error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profit/loss",
      error: error.message,
    });
  }
});

// ==================== HELPER FUNCTIONS FOR PROFIT CALCULATIONS ====================

const calculateProfitsForSales = async (sales) => {
  try {
    if (!sales || sales.length === 0) {
      return sales.map((sale) => ({ ...sale, profit: 0, _cost: 0 }));
    }

    return sales.map((sale) => {
      const saleData = sale.toObject ? sale.toObject() : sale;

      let totalProfit = saleData.totalProfitLoss || 0;
      let totalCost = 0;

      if (saleData.products && Array.isArray(saleData.products)) {
        saleData.products.forEach((product) => {
          const lcPrice = product.lc || 0;
          const quantity = product.salesQty || product.quantity || 0;
          const productCost = lcPrice * quantity;
          totalCost += productCost;
        });
      } else {
        const revenue = saleData.totalAmount || 0;
        totalCost = Math.max(0, revenue - totalProfit);
      }

      saleData._cost = totalCost;

      return {
        ...saleData,
        profit: totalProfit,
      };
    });
  } catch (error) {
    console.error("Error calculating profits:", error);
    return sales.map((sale) => ({ ...sale, profit: 0, _cost: 0 }));
  }
};

const calculateProfitsForReturns = async (returns) => {
  try {
    if (!returns || returns.length === 0) {
      return returns.map((ret) => ({ ...ret, profit: 0, _cost: 0 }));
    }

    const returnIds = returns.map((ret) => ret._id);

    const populatedReturns = await SalesReturn.find({ _id: { $in: returnIds } })
      .populate({
        path: "products.productId",
        select: "lc productName",
        options: { strictPopulate: false },
      })
      .lean();

    const returnMap = new Map();
    populatedReturns.forEach((ret) => {
      returnMap.set(ret._id.toString(), ret);
    });

    return returns.map((salesReturn) => {
      const populatedReturn = returnMap.get(salesReturn._id.toString());
      let totalProfitLoss = 0;
      let totalCost = 0;

      if (
        populatedReturn &&
        populatedReturn.products &&
        Array.isArray(populatedReturn.products)
      ) {
        populatedReturn.products.forEach((product) => {
          const sellingPrice = product.sellingPrice || product.unitPrice || 0;
          const lcPrice = product.productId?.lc || 0;
          const quantity = product.salesQty || product.quantity || 0;

          const profitLoss = -(sellingPrice - lcPrice) * quantity;
          const productCost = lcPrice * quantity;

          totalProfitLoss += profitLoss;
          totalCost += productCost;
        });
      }

      salesReturn._cost = totalCost;

      return {
        ...salesReturn,
        profit: totalProfitLoss,
      };
    });
  } catch (error) {
    console.error("Error calculating return profits:", error);
    return returns.map((ret) => ({ ...ret, profit: 0, _cost: 0 }));
  }
};

export default router;
