// routes/plReport.js
import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SalesReturn from "../../models/sale/saleReturn.js";
import Payroll from "../../models/Hrm/Payroll.js";
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

    // Date range filter
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // For sales - use recordingDate
      saleFilter.recordingDate = {};
      returnFilter.recordingDate = {};
      if (start) {
        saleFilter.recordingDate.$gte = start;
        returnFilter.recordingDate.$gte = start;
      }
      if (end) {
        saleFilter.recordingDate.$lte = end;
        returnFilter.recordingDate.$lte = end;
      }

      // For payroll - use createdAt
      payrollFilter.createdAt = {};
      if (start) payrollFilter.createdAt.$gte = start;
      if (end) payrollFilter.createdAt.$lte = end;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // Get sales data
    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName"
      )
      .sort({ recordingDate: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Get sales return data
    const salesReturns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Get payroll data
    const payrolls = await Payroll.find(payrollFilter)
      .select(
        "period payrollCode employeeId basicSalary totalAllowance deductions netSalary status paymentDate createdAt"
      )
      .populate("employeeId", "medicalRepName employeeName")
      .sort({ createdAt: sortDirection })
      .skip(skip)
      .limit(parseInt(limit));

    // Transform sales data to common format - FIXED: Proper profit calculation
    const salesData = sales.map((sale) => ({
      _id: sale._id,
      type: "sale",
      date: sale.recordingDate,
      title: sale.invoiceNumber,
      description: `Sale to ${sale.customerName}`,
      amount: sale.totalAmount,
      profit: sale.totalAmount, // Sales contribute to profit
      expense: 0, // Sales don't have direct expenses
      status: sale.paymentStatus,
      details: {
        paidAmount: sale.paidAmount,
        dueAmount: sale.dueAmount,
        mrName: sale.mrName,
      },
    }));

    // Transform sales return data to common format - FIXED: Proper profit calculation
    const returnData = salesReturns.map((salesReturn) => ({
      _id: salesReturn._id,
      type: "return",
      date: salesReturn.recordingDate,
      title: `${salesReturn.invoiceNumber} (Return)`,
      description: `Return from ${salesReturn.customerName}`,
      amount: -salesReturn.totalAmount, // Negative amount for returns
      profit: -salesReturn.totalAmount, // Negative profit for returns
      expense: 0,
      status: salesReturn.paymentStatus,
      details: {
        paidAmount: salesReturn.paidAmount,
        dueAmount: salesReturn.dueAmount,
        mrName: salesReturn.mrName,
        usedAmount: salesReturn.products.reduce(
          (total, product) => total + (product.usedAmount || 0),
          0
        ),
      },
    }));

    // Transform payroll data to common format - FIXED: Proper profit calculation
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
      amount: payroll.netSalary, // FIXED: Positive amount for payroll (it's an expense)
      profit: -payroll.netSalary, // FIXED: Negative profit for payroll expenses
      expense: payroll.netSalary, // Positive expense
      status: payroll.status,
      details: {
        basicSalary: payroll.basicSalary,
        allowances: payroll.totalAllowance,
        deductions: payroll.deductions,
        period: payroll.period,
      },
    }));

    // Combine and sort data
    const combinedData = [...salesData, ...returnData, ...payrollData].sort(
      (a, b) => {
        const aDate = new Date(a.date);
        const bDate = new Date(b.date);
        return sortDirection === -1 ? bDate - aDate : aDate - bDate;
      }
    );

    // Get total counts
    const totalSales = await SaleSummary.countDocuments(saleFilter);
    const totalReturns = await SalesReturn.countDocuments(returnFilter);
    const totalPayrolls = await Payroll.countDocuments(payrollFilter);
    const total = totalSales + totalReturns + totalPayrolls;

    // Calculate totals for sales
    const salesTotals = await SaleSummary.aggregate([
      { $match: saleFilter },
      {
        $group: {
          _id: null,
          totalSalesAmount: { $sum: "$totalAmount" },
          totalPaidAmount: { $sum: "$paidAmount" },
          totalDueAmount: { $sum: "$dueAmount" },
        },
      },
    ]);

    // Calculate totals for sales returns
    const returnsTotals = await SalesReturn.aggregate([
      { $match: returnFilter },
      {
        $group: {
          _id: null,
          totalReturnsAmount: { $sum: "$totalAmount" },
          totalReturnsPaid: { $sum: "$paidAmount" },
          totalReturnsDue: { $sum: "$dueAmount" },
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

    // Calculate totals for payroll
    const payrollTotals = await Payroll.aggregate([
      { $match: payrollFilter },
      {
        $group: {
          _id: null,
          totalNetSalary: { $sum: "$netSalary" },
          totalBasicSalary: { $sum: "$basicSalary" },
          totalAllowances: { $sum: "$totalAllowance" },
          totalDeductions: { $sum: "$deductions" },
        },
      },
    ]);

    const salesTotal = salesTotals[0] || {
      totalSalesAmount: 0,
      totalPaidAmount: 0,
      totalDueAmount: 0,
    };

    const returnsTotal = returnsTotals[0] || {
      totalReturnsAmount: 0,
      totalReturnsPaid: 0,
      totalReturnsDue: 0,
      totalUsedAmount: 0,
    };

    const payrollTotal = payrollTotals[0] || {
      totalNetSalary: 0,
      totalBasicSalary: 0,
      totalAllowances: 0,
      totalDeductions: 0,
    };

    // Calculate NET revenue and profit/loss - FIXED: Proper calculation
    const grossRevenue = salesTotal.totalSalesAmount;
    const returnsDeduction = returnsTotal.totalReturnsAmount;
    const usedAmountAddition = returnsTotal.totalUsedAmount;
    const netRevenue = grossRevenue - returnsDeduction + usedAmountAddition;
    const totalExpenses = payrollTotal.totalNetSalary;
    
    // FIXED: Net Profit = Revenue - Expenses
    const netProfit = netRevenue - totalExpenses;

    console.log("Calculation Details:", {
      grossRevenue,
      returnsDeduction,
      usedAmountAddition,
      netRevenue,
      totalExpenses,
      netProfit
    });

    const totals = {
      totalSales: salesTotal.totalSalesAmount,
      totalReturns: returnsTotal.totalReturnsAmount,
      totalUsedAmount: returnsTotal.totalUsedAmount,
      totalRevenue: netRevenue,
      totalExpense: totalExpenses,
      // FIXED: Proper profit/loss calculation
      totalProfit: netProfit > 0 ? netProfit : 0,
      totalLoss: netProfit < 0 ? Math.abs(netProfit) : 0,
      netProfit: netProfit // Include raw net profit for reference
    };

    res.json({
      success: true,
      data: combinedData,
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
      },
    });
  } catch (error) {
    console.error("Profit Loss Report Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching profit loss report",
      error: error.message,
    });
  }
});

// GET /api/pl-report/summary - Get summary statistics
router.get("/pl-report/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let saleFilter = {};
    let returnFilter = {};
    let payrollFilter = {};

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      // For sales and returns
      saleFilter.recordingDate = {};
      returnFilter.recordingDate = {};
      if (start) {
        saleFilter.recordingDate.$gte = start;
        returnFilter.recordingDate.$gte = start;
      }
      if (end) {
        saleFilter.recordingDate.$lte = end;
        returnFilter.recordingDate.$lte = end;
      }

      // For payroll
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

    // Calculate NET revenue and profit/loss - FIXED: Proper calculation
    const grossRevenue = salesData.totalRevenue;
    const returnsDeduction = returnsData.totalReturnsAmount;
    const usedAmountAddition = returnsData.totalUsedAmount;
    const netRevenue = grossRevenue - returnsDeduction + usedAmountAddition;
    const expenses = payrollData.totalExpenses;
    const netProfit = netRevenue - expenses;
    const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0;

    console.log("Summary Calculation:", {
      grossRevenue,
      returnsDeduction,
      usedAmountAddition,
      netRevenue,
      expenses,
      netProfit,
      profitMargin
    });

    // Format summary for frontend
    const formattedSummary = {
      // Revenue breakdown
      revenue: netRevenue, // FIXED: Use net revenue
      cogs: 0,
      grossProfit: netRevenue,
      expenses: expenses,
      netProfit: netProfit,
      profitMargin: parseFloat(profitMargin.toFixed(2)),

      // Additional metrics
      totalSales: salesData.totalTransactions,
      totalReturns: returnsData.totalReturns,
      totalPayrolls: payrollData.totalPayrolls,
      collectionRate: grossRevenue > 0 ? (salesData.totalPaid / grossRevenue) * 100 : 0,
    };

    res.json({
      success: true,
      data: formattedSummary,
      detailed: {
        sales: salesData,
        returns: returnsData,
        payroll: payrollData,
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

// Other endpoints remain the same as in your original code...
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