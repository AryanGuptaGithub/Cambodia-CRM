import express from "express";
import SaleSummary from "../../models/sale/saleSummary.js";
import SalesReturn from "../../models/sale/saleReturn.js";
import Payroll from "../../models/Hrm/Payroll.js";
import addExpense from "../../models/expenses/addExpense.js";
import addExpenseCategary from "../../models/expenses/addExpenseCategary.js";

const router = express.Router();

// Improved helper function to create proper date range filter
const createDateRangeFilter = (startDate, endDate, fieldName = "recordingDate") => {
  const filter = {};
  
  if (startDate) {
    const start = new Date(startDate);
    // Start of day in UTC
    const startUTC = new Date(Date.UTC(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      0, 0, 0, 0
    ));
    filter.$gte = startUTC;
  }
  
  if (endDate) {
    const end = new Date(endDate);
    // End of day in UTC
    const endUTC = new Date(Date.UTC(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      23, 59, 59, 999
    ));
    filter.$lte = endUTC;
  }
  
  return Object.keys(filter).length > 0 ? filter : undefined;
};

// Alternative: Match based on date string comparison for recordingDate
const createDateRangeFilterForRecordingDate = (startDate, endDate) => {
  const filter = {};
  
  if (startDate) {
    const start = new Date(startDate);
    const startStr = start.toISOString().split('T')[0]; // YYYY-MM-DD
    filter.$gte = new Date(startStr + "T00:00:00.000Z");
  }
  
  if (endDate) {
    const end = new Date(endDate);
    const endStr = end.toISOString().split('T')[0]; // YYYY-MM-DD
    filter.$lte = new Date(endStr + "T23:59:59.999Z");
  }
  
  return Object.keys(filter).length > 0 ? filter : undefined;
};

// UPDATED: Helper function to calculate profit for multiple sales at once
// Now uses the existing totalProfitLoss field
const calculateProfitsForSales = async (sales) => {
  try {
    if (!sales || sales.length === 0) {
      return sales.map(sale => ({ ...sale, profit: 0, _cost: 0 }));
    }
    
    // Calculate profit for each sale using the existing totalProfitLoss field
    return sales.map(sale => {
      // Convert Mongoose document to plain object if needed
      const saleData = sale.toObject ? sale.toObject() : sale;
      
      let totalProfit = saleData.totalProfitLoss || 0;
      let totalCost = 0;
      
      // Calculate cost from products if available
      if (saleData.products && Array.isArray(saleData.products)) {
        saleData.products.forEach(product => {
          const lcPrice = product.lc || 0;
          const quantity = product.salesQty || product.quantity || 0;
          const productCost = lcPrice * quantity;
          totalCost += productCost;
        });
      } else {
        // If products not available, estimate cost from revenue and profit
        const revenue = saleData.totalAmount || 0;
        totalCost = Math.max(0, revenue - totalProfit);
      }
      
      // Store cost for COGS calculation
      saleData._cost = totalCost;
      
      return {
        ...saleData,
        profit: totalProfit
      };
    });
  } catch (error) {
    console.error("Error calculating profits:", error);
    return sales.map(sale => ({ ...sale, profit: 0, _cost: 0 }));
  }
};

// UPDATED: Helper function to calculate profit for multiple returns at once
// Now returns have their own profit/loss calculation
const calculateProfitsForReturns = async (returns) => {
  try {
    if (!returns || returns.length === 0) {
      return returns.map(ret => ({ ...ret, profit: 0, _cost: 0 }));
    }

    // Get all return IDs
    const returnIds = returns.map(ret => ret._id);
    
    // Get all returns with populated products
    const populatedReturns = await SalesReturn.find({ _id: { $in: returnIds } })
      .populate({
        path: 'products.productId',
        select: 'lc productName',
        options: { strictPopulate: false }
      })
      .lean();
    
    // Create a map for quick lookup
    const returnMap = new Map();
    populatedReturns.forEach(ret => {
      returnMap.set(ret._id.toString(), ret);
    });
    
    // Calculate profit for each return
    return returns.map((salesReturn) => {
      const populatedReturn = returnMap.get(salesReturn._id.toString());
      let totalProfitLoss = 0;
      let totalCost = 0;
      
      if (populatedReturn && populatedReturn.products && Array.isArray(populatedReturn.products)) {
        populatedReturn.products.forEach(product => {
          const sellingPrice = product.sellingPrice || product.unitPrice || 0;
          const lcPrice = product.productId?.lc || 0;
          const quantity = product.salesQty || product.quantity || 0;
          
          // For returns, profit/loss is negative
          const profitLoss = -(sellingPrice - lcPrice) * quantity;
          const productCost = lcPrice * quantity;
          
          totalProfitLoss += profitLoss;
          totalCost += productCost;
        });
      }
      
      // Store cost for COGS calculation
      salesReturn._cost = totalCost;
      
      return {
        ...salesReturn,
        profit: totalProfitLoss
      };
    });
  } catch (error) {
    console.error("Error calculating return profits:", error);
    return returns.map(ret => ({ ...ret, profit: 0, _cost: 0 }));
  }
};

// GET / - Main Profit & Loss report (was /pl-report)
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

    let saleFilter = {};
    let returnFilter = {};
    let payrollFilter = {};
    let expenseFilter = {};

    const recordingDateFilter = createDateRangeFilterForRecordingDate(startDate, endDate);
    const dateFilter = createDateRangeFilter(startDate, endDate);
    
    if (recordingDateFilter) {
      saleFilter.recordingDate = recordingDateFilter;
      returnFilter.recordingDate = recordingDateFilter;
    }
    
    if (dateFilter) {
      payrollFilter.createdAt = dateFilter;
      expenseFilter.date = dateFilter;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;
    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products totalProfitLoss"
      )
      .sort({ recordingDate: sortDirection })
      .lean(); // Use lean() to get plain JavaScript objects

    const salesWithProfit = await calculateProfitsForSales(sales);

    const salesReturns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: sortDirection })
      .lean();

    // Calculate profit for each return
    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

    const payrolls = await Payroll.find(payrollFilter)
      .select(
        "period payrollCode employeeId basicSalary totalAllowance deductions netSalary status paymentDate createdAt"
      )
      .populate("employeeId", "medicalRepName employeeName")
      .sort({ createdAt: sortDirection })
      .lean();

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
      .sort({ date: sortDirection })
      .lean();

    // Calculate totals - USING THE PROFIT FROM salesWithProfit
    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;
    
    salesWithProfit.forEach(sale => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0; // This now uses totalProfitLoss
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    let totalReturnsAmount = 0;
    let totalProfitFromReturns = 0;
    let totalReturnsCost = 0;
    
    returnsWithProfit.forEach(returnItem => {
      totalReturnsAmount += returnItem.totalAmount || 0;
      totalProfitFromReturns += returnItem.profit || 0;
      totalReturnsCost += returnItem._cost || 0;
    });

    // Adjust COGS for returns
    totalCostOfGoodsSold -= totalReturnsCost;

    // Calculate payroll totals
    let totalNetSalary = 0;
    let totalBasicSalary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    
    payrolls.forEach(payroll => {
      totalNetSalary += payroll.netSalary || 0;
      totalBasicSalary += payroll.basicSalary || 0;
      totalAllowances += payroll.totalAllowance || 0;
      totalDeductions += payroll.deductions || 0;
    });

    // Calculate expense totals
    let totalExpenseAmount = 0;
    expenses.forEach(expense => {
      totalExpenseAmount += expense.amount || 0;
    });

    // Calculate net profit
    const grossProfitFromSales = totalProfitFromSales;
    const adjustedGrossProfit = grossProfitFromSales + totalProfitFromReturns;
    const totalExpensesAmount = totalNetSalary + totalExpenseAmount;
    const netProfit = adjustedGrossProfit - totalExpensesAmount;
    
    // Calculate profit margin
    const profitMargin = totalSalesRevenue > 0 ? (netProfit / totalSalesRevenue) * 100 : 0;
    
    // Calculate collection rate
    const collectionRate = totalSalesRevenue > 0 ? 
      (totalPaidAmount / totalSalesRevenue) * 100 : 0;

    // Get counts
    const totalSales = await SaleSummary.countDocuments(saleFilter);
    const totalReturns = await SalesReturn.countDocuments(returnFilter);
    const totalPayrolls = await Payroll.countDocuments(payrollFilter);
    const totalExpenses = await addExpense.countDocuments(expenseFilter);
    const total = totalSales + totalReturns + totalPayrolls + totalExpenses;

    // Prepare totals object for frontend
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

    // Transform data for frontend table
    const salesData = salesWithProfit.map((sale) => ({
      _id: sale._id,
      type: "sale",
      date: sale.recordingDate,
      title: sale.invoiceNumber,
      description: `Sale to ${sale.customerName || 'Unknown'}`,
      amount: sale.totalAmount || 0,
      profit: sale.profit || 0, // Uses existing totalProfitLoss
      expense: 0,
      status: sale.paymentStatus || "pending",
      details: {
        paidAmount: sale.paidAmount || 0,
        dueAmount: sale.dueAmount || 0,
        mrName: sale.mrName || "",
        customerName: sale.customerName || "",
        totalAmount: sale.totalAmount || 0,
        calculatedProfit: sale.profit || 0,
        storedProfitLoss: sale.totalProfitLoss || 0, // Include stored value
      },
    }));

    const returnData = returnsWithProfit.map((salesReturn) => ({
      _id: salesReturn._id,
      type: "return",
      date: salesReturn.recordingDate,
      title: `${salesReturn.invoiceNumber} (Return)`,
      description: `Return from ${salesReturn.customerName || 'Unknown'}`,
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

    // Prepare detailed arrays for frontend
    const salaryDetails = payrollData;
    const expenseDetails = expenseData;

    // Extract profit details from sales data
    const salesProfitDetails = salesWithProfit.map(sale => ({
      invoiceNumber: sale.invoiceNumber || 'N/A',
      date: sale.recordingDate,
      customer: sale.customerName || "Unknown",
      totalAmount: sale.totalAmount || 0,
      profit: sale.profit || 0, // Uses existing totalProfitLoss
      purchaseCost: sale._cost || 0,
      margin: (sale.totalAmount || 0) > 0 ? 
        ((sale.profit || 0) / (sale.totalAmount || 0)) * 100 : 0,
      storedProfitLoss: sale.totalProfitLoss || 0 // Show stored value
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
      },
      debug: {
        query: { startDate, endDate },
        salesFound: sales.length,
        totalRevenueCalculated: totalSalesRevenue,
        totalCostCalculated: totalCostOfGoodsSold,
        totalProfitCalculated: totalProfitFromSales,
        sampleSales: sales.slice(0, 5).map(s => ({
          invoice: s.invoiceNumber,
          date: s.recordingDate,
          total: s.totalAmount,
          storedProfitLoss: s.totalProfitLoss || 0,
          productsCount: s.products?.length || 0
        }))
      }
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

// GET /summary - Summary statistics (was /pl-report/summary)
router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let saleFilter = {};
    let returnFilter = {};
    let payrollFilter = {};
    let expenseFilter = {};

    // Use the specialized filter for recordingDate fields
    const recordingDateFilter = createDateRangeFilterForRecordingDate(startDate, endDate);
    const dateFilter = createDateRangeFilter(startDate, endDate);
    
    if (recordingDateFilter) {
      saleFilter.recordingDate = recordingDateFilter;
      returnFilter.recordingDate = recordingDateFilter;
    }
    
    if (dateFilter) {
      payrollFilter.createdAt = dateFilter;
      expenseFilter.date = dateFilter;
    }

    const sales = await SaleSummary.find(saleFilter)
      .select("recordingDate totalAmount paidAmount dueAmount products invoiceNumber totalProfitLoss customerName mrName paymentStatus")
      .sort({ recordingDate: -1 })
      .lean();

    // Calculate profit for all sales - USING EXISTING totalProfitLoss
    const salesWithProfit = await calculateProfitsForSales(sales);

    // Get sales returns summary
    const salesReturns = await SalesReturn.find(returnFilter)
      .select("recordingDate totalAmount products")
      .sort({ recordingDate: -1 })
      .lean();

    // Calculate profit for all returns
    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

    // Get payroll summary
    const payrolls = await Payroll.find(payrollFilter)
      .select("netSalary basicSalary totalAllowance deductions status")
      .lean();

    // Get expense summary
    const expenses = await addExpense.find(expenseFilter).select("amount category").lean();

    // Aggregate sales data - USING THE PROFIT FROM salesWithProfit
    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;
    
    salesWithProfit.forEach(sale => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0; // Uses totalProfitLoss
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    // Aggregate returns data
    let totalReturnsAmount = 0;
    let totalProfitFromReturns = 0;
    let totalReturnsCost = 0;
    
    returnsWithProfit.forEach(ret => {
      totalReturnsAmount += ret.totalAmount || 0;
      totalProfitFromReturns += ret.profit || 0;
      totalReturnsCost += ret._cost || 0;
    });

    // Adjust COGS for returns
    totalCostOfGoodsSold -= totalReturnsCost;

    // Calculate payroll totals
    let totalNetSalary = 0;
    let totalBasicSalary = 0;
    let totalAllowances = 0;
    let totalDeductions = 0;
    
    payrolls.forEach(payroll => {
      totalNetSalary += payroll.netSalary || 0;
      totalBasicSalary += payroll.basicSalary || 0;
      totalAllowances += payroll.totalAllowance || 0;
      totalDeductions += payroll.deductions || 0;
    });

    // Calculate expense totals
    let totalExpenseAmount = 0;
    expenses.forEach(expense => {
      totalExpenseAmount += expense.amount || 0;
    });

    // Calculate NET profit
    const grossProfit = totalProfitFromSales;
    const returnsProfit = totalProfitFromReturns;
    
    const adjustedGrossProfit = grossProfit + returnsProfit;
    const totalExpensesAmount = totalNetSalary + totalExpenseAmount;
    const netProfit = adjustedGrossProfit - totalExpensesAmount;
    
    const profitMargin = totalSalesRevenue > 0 ? (netProfit / totalSalesRevenue) * 100 : 0;
    const collectionRate = totalSalesRevenue > 0 ? 
      (totalPaidAmount / totalSalesRevenue) * 100 : 0;

    // Format summary for frontend
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

// GET /orders - Orders breakdown (was /pl-report/orders)
router.get("/orders", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let saleFilter = {};
    let returnFilter = {};

    // Use the specialized filter for recordingDate fields
    const recordingDateFilter = createDateRangeFilterForRecordingDate(startDate, endDate);
    
    if (recordingDateFilter) {
      saleFilter.recordingDate = recordingDateFilter;
      returnFilter.recordingDate = recordingDateFilter;
    }

    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products totalProfitLoss"
      )
      .sort({ recordingDate: -1 })
      .lean();

    // Calculate profit for each sale - USING EXISTING totalProfitLoss
    const salesWithProfit = await calculateProfitsForSales(sales);

    const returns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: -1 })
      .lean();

    // Calculate profit for each return
    const returnsWithProfit = await calculateProfitsForReturns(returns);

    // Transform sales data
    const salesData = salesWithProfit.map((order) => ({
      orderId: order.invoiceNumber || 'N/A',
      date: order.recordingDate,
      customer: order.customerName || "Unknown",
      mrName: order.mrName || "",
      amount: order.totalAmount || 0,
      profit: order.profit || 0, // Uses totalProfitLoss
      purchaseCost: order._cost || 0,
      margin: (order.totalAmount || 0) > 0 ? 
        ((order.profit || 0) / (order.totalAmount || 0)) * 100 : 0,
      paid: order.paidAmount || 0,
      due: order.dueAmount || 0,
      status: order.paymentStatus?.toLowerCase() || "pending",
      type: "sale",
    }));

    // Transform returns data
    const returnsData = returnsWithProfit.map((returnOrder) => ({
      orderId: `${returnOrder.invoiceNumber || 'N/A'} (Return)`,
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

// POST /update-profits - Update profit/loss for existing sales (was /pl-report/update-profits)
router.post("/update-profits", async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    let saleFilter = {};
    const recordingDateFilter = createDateRangeFilterForRecordingDate(startDate, endDate);
    
    if (recordingDateFilter) {
      saleFilter.recordingDate = recordingDateFilter;
    }

    // Get all sales in the date range
    const sales = await SaleSummary.find(saleFilter)
      .select("products totalAmount")
      .sort({ recordingDate: -1 })
      .lean();

    let updatedCount = 0;
    let errors = [];

    // Update each sale's totalProfitLoss
    for (const sale of sales) {
      try {
        let totalProfitLoss = 0;
        
        if (sale.products && Array.isArray(sale.products)) {
          sale.products.forEach(product => {
            const sellingPrice = product.sellingPrice || product.unitPrice || 0;
            const lc = product.lc || 0;
            const quantity = product.salesQty || product.quantity || 0;
            
            const productProfitLoss = (sellingPrice - lc) * quantity;
            totalProfitLoss += productProfitLoss;
          });
        }

        // Update the sale with calculated profit/loss
        await SaleSummary.findByIdAndUpdate(sale._id, {
          totalProfitLoss: totalProfitLoss
        });

        updatedCount++;
      } catch (error) {
        errors.push({
          saleId: sale._id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Updated totalProfitLoss for ${updatedCount} sales`,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Update profits error:", error);
    res.status(500).json({
      success: false,
      message: "Error updating profit/loss",
      error: error.message
    });
  }
});

export default router;