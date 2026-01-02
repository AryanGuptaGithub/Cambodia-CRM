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

// Helper function to calculate profit for multiple sales at once
const calculateProfitsForSales = async (sales) => {
  try {
    if (!sales || sales.length === 0) {
      return sales.map(sale => ({ ...sale, profit: 0 }));
    }
    
    // Get all sale IDs
    const saleIds = sales.map(sale => sale._id);
    
    // Get all sales with populated products
    const populatedSales = await SaleSummary.find({ _id: { $in: saleIds } })
      .populate({
        path: 'products.productId',
        select: 'lc productName',
        options: { strictPopulate: false }
      })
      .lean();
    
    // Create a map for quick lookup
    const saleMap = new Map();
    populatedSales.forEach(sale => {
      saleMap.set(sale._id.toString(), sale);
    });
    
    // Calculate profit for each sale
    return sales.map(sale => {
      const populatedSale = saleMap.get(sale._id.toString());
      let totalProfit = 0;
      let totalCost = 0;
      
      if (populatedSale && populatedSale.products && Array.isArray(populatedSale.products)) {
        populatedSale.products.forEach(product => {
          // Use sellingPrice from product object
          const sellingPrice = product.sellingPrice || product.unitPrice || 0;
          // Use lc from populated productId
          const lcPrice = product.productId?.lc || 0;
          // Use salesQty or quantity
          const quantity = product.salesQty || product.quantity || 0;
          
          const productProfit = (sellingPrice - lcPrice) * quantity;
          const productCost = lcPrice * quantity;
          
          totalProfit += productProfit;
          totalCost += productCost;
        });
      }
      
      // Store cost for COGS calculation
      sale._cost = totalCost;
      
      return {
        ...sale,
        profit: totalProfit
      };
    });
  } catch (error) {
    console.error("Error calculating profits:", error);
    return sales.map(sale => ({ ...sale, profit: 0, _cost: 0 }));
  }
};

// Helper function to calculate profit for multiple returns at once
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
    return returns.map(salesReturn => {
      const populatedReturn = returnMap.get(salesReturn._id.toString());
      let totalProfitLoss = 0;
      let totalCost = 0;
      
      if (populatedReturn && populatedReturn.products && Array.isArray(populatedReturn.products)) {
        populatedReturn.products.forEach(product => {
          const sellingPrice = product.sellingPrice || product.unitPrice || 0;
          const lcPrice = product.productId?.lc || 0;
          const quantity = product.salesQty || product.quantity || 0;
          
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

    console.log('Query parameters:', { startDate, endDate });

    // Build filter objects
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

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    console.log('Sale Filter:', JSON.stringify(saleFilter, null, 2));
    console.log('Recording Date Filter:', JSON.stringify(recordingDateFilter, null, 2));

    // Get sales with date range filter
    const sales = await SaleSummary.find(saleFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: sortDirection });

    console.log(`Found ${sales.length} sales for the date range`);
    
    // Debug: Show date range and sample dates
    if (sales.length > 0) {
      console.log('Date range of found sales:');
      const dates = sales.map(s => s.recordingDate).sort();
      console.log('Earliest:', dates[0]);
      console.log('Latest:', dates[dates.length - 1]);
      console.log('Sample sale dates:');
      sales.slice(0, 5).forEach(s => {
        console.log(`  Invoice: ${s.invoiceNumber}, Date: ${s.recordingDate}, Amount: ${s.totalAmount}`);
      });
    }

    // Calculate profit for each sale
    const salesWithProfit = await calculateProfitsForSales(sales);

    const salesReturns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: sortDirection });

    // Calculate profit for each return
    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

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

    // Calculate totals
    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;
    
    salesWithProfit.forEach(sale => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0;
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    console.log(`Calculated totals - Revenue: ${totalSalesRevenue}, Profit: ${totalProfitFromSales}, COGS: ${totalCostOfGoodsSold}`);

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
      description: `Sale to ${sale.customerName}`,
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
      },
    }));

    const returnData = returnsWithProfit.map((salesReturn) => ({
      _id: salesReturn._id,
      type: "return",
      date: salesReturn.recordingDate,
      title: `${salesReturn.invoiceNumber} (Return)`,
      description: `Return from ${salesReturn.customerName}`,
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
      invoiceNumber: sale.invoiceNumber,
      date: sale.recordingDate,
      customer: sale.customerName || "Unknown",
      totalAmount: sale.totalAmount || 0,
      profit: sale.profit || 0,
      purchaseCost: sale._cost || 0,
      margin: (sale.totalAmount || 0) > 0 ? 
        ((sale.profit || 0) / (sale.totalAmount || 0)) * 100 : 0
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
        cogs: totalCostOfGoodsSold, // Fixed: Now using actual cost calculation
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
        sampleSales: sales.slice(0, 5).map(s => ({
          invoice: s.invoiceNumber,
          date: s.recordingDate,
          total: s.totalAmount,
          productsCount: s.products?.length || 0
        }))
      }
    };

    console.log('Response summary:', {
      revenue: response.summary.revenue,
      cogs: response.summary.cogs,
      grossProfit: response.summary.grossProfit,
      collectionRate: response.summary.collectionRate
    });

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

// GET /api/pl-report/summary - Get summary statistics (Updated)
router.get("/pl-report/summary", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    console.log('Summary query parameters:', { startDate, endDate });

    // Use the same logic as the main endpoint but only return summary
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

    console.log('Summary Sale Filter:', JSON.stringify(saleFilter, null, 2));

    // Get sales summary
    const sales = await SaleSummary.find(saleFilter)
      .select("recordingDate totalAmount paidAmount dueAmount products invoiceNumber")
      .sort({ recordingDate: -1 });

    console.log(`Summary: Found ${sales.length} sales for date range`);

    // Calculate profit for all sales
    const salesWithProfit = await calculateProfitsForSales(sales);

    // Get sales returns summary
    const salesReturns = await SalesReturn.find(returnFilter)
      .select("recordingDate totalAmount products")
      .sort({ recordingDate: -1 });

    // Calculate profit for all returns
    const returnsWithProfit = await calculateProfitsForReturns(salesReturns);

    // Get payroll summary
    const payrolls = await Payroll.find(payrollFilter)
      .select("netSalary basicSalary totalAllowance deductions status");

    // Get expense summary
    const expenses = await addExpense.find(expenseFilter).select("amount category");

    // Aggregate sales data
    let totalSalesRevenue = 0;
    let totalProfitFromSales = 0;
    let totalPaidAmount = 0;
    let totalDueAmount = 0;
    let totalCostOfGoodsSold = 0;
    
    salesWithProfit.forEach(sale => {
      totalSalesRevenue += sale.totalAmount || 0;
      totalProfitFromSales += sale.profit || 0;
      totalPaidAmount += sale.paidAmount || 0;
      totalDueAmount += sale.dueAmount || 0;
      totalCostOfGoodsSold += sale._cost || 0;
    });

    console.log(`Summary Calculated - Revenue: ${totalSalesRevenue}, Profit: ${totalProfitFromSales}, COGS: ${totalCostOfGoodsSold}`);

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
      cogs: totalCostOfGoodsSold, // Fixed: Now using actual cost calculation
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

    console.log('Formatted summary:', formattedSummary);

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

// GET /api/pl-report/orders - Get orders breakdown
router.get("/pl-report/orders", async (req, res) => {
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
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: -1 });

    // Calculate profit for each sale
    const salesWithProfit = await calculateProfitsForSales(sales);

    const returns = await SalesReturn.find(returnFilter)
      .select(
        "recordingDate invoiceNumber customerName totalAmount paidAmount dueAmount paymentStatus mrName products"
      )
      .sort({ recordingDate: -1 });

    // Calculate profit for each return
    const returnsWithProfit = await calculateProfitsForReturns(returns);

    // Transform sales data
    const salesData = salesWithProfit.map((order) => ({
      orderId: order.invoiceNumber,
      date: order.recordingDate,
      customer: order.customerName,
      mrName: order.mrName,
      amount: order.totalAmount || 0,
      profit: order.profit || 0,
      purchaseCost: order._cost || 0, // Use actual cost
      margin: (order.totalAmount || 0) > 0 ? 
        ((order.profit || 0) / (order.totalAmount || 0)) * 100 : 0,
      paid: order.paidAmount || 0,
      due: order.dueAmount || 0,
      status: order.paymentStatus?.toLowerCase() || "pending",
      type: "sale",
    }));

    // Transform returns data
    const returnsData = returnsWithProfit.map((returnOrder) => ({
      orderId: `${returnOrder.invoiceNumber} (Return)`,
      date: returnOrder.recordingDate,
      customer: returnOrder.customerName,
      mrName: returnOrder.mrName,
      amount: -(returnOrder.totalAmount || 0),
      profit: returnOrder.profit || 0,
      purchaseCost: returnOrder._cost || 0, // Use actual cost
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

export default router;