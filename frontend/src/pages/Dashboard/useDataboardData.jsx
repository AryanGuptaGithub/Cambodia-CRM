import { useState, useEffect } from "react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { fetchMRList } from "../../utils/customerUtil";
import {
  getDateRanges,
  calculateGrowth,
  formatMonthYear,
  calculateStockValue,
  getLowStockItems,
} from "./DashboardUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const useDashboardData = () => {
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [payrollYTDTotal, setPayrollYTDTotal] = useState(0);

  const [salesData, setSalesData] = useState({
    totalSales: 0,
    monthlySales: 0,
    todaySales: 0,
    yearSales: 0,
    todayGrowth: 0,
    monthlyGrowth: 0,
    yearGrowth: 0,
    todayPrevious: 0,
    monthlyPrevious: 0,
    yearPrevious: 0,
    overdueAmount: 0,
    creditSale: 0,
    unreceivePayment: 0,
  });

  const [outstandingData, setOutstandingData] = useState({
    totalOutstanding: 0,
    todayOutstanding: 0,
    monthlyOutstanding: 0,
    yearOutstanding: 0,
    todayGrowth: 0,
    monthlyGrowth: 0,
    yearGrowth: 0,
    todayPrevious: 0,
    monthlyPrevious: 0,
    yearPrevious: 0,
    mrWiseOutstanding: [],
    overdueAmount: 0,
  });

  // Stock data now includes separate fields for warehouse, MR, and combined
  const [stockData, setStockData] = useState({
    warehouseStockValue: 0, // from warehouse only
    mrStockValue: 0, // from MR only
    totalStockValue: 0, // combined total
    lowStockItems: [],
    overdueStockValue: 0,
    unreceivedStockValue: 0,
    // Keep old fields for backward compatibility if needed
    totalStock: 0,
    stockValue: 0,
  });

  const [expenseData, setExpenseData] = useState({
    totalExpense: 0,
    monthlyExpense: 0,
    todayExpense: 0,
    yearExpense: 0,
    previousMonthExpense: 0,
    latestExpenses: [],
    overduePayroll: 0,
    unpaidPayroll: 0,
  });

  // --- Existing helper functions (unchanged) ---
  const fetchCustomRangeSales = async (startDate, endDate) => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales/analytics/custom-range`,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      );
      return response.data.totalSales || 0;
    } catch (error) {
      console.error("Error fetching custom range sales:", error);
      return 0;
    }
  };

  const fetchCustomRangeOutstanding = async (startDate, endDate) => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/outstanding/custom-range`,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      );
      return response.data || { totalOutstanding: 0, outstandingData: [] };
    } catch (error) {
      console.error("Error fetching custom range outstanding:", error);
      return { totalOutstanding: 0, outstandingData: [] };
    }
  };

  const fetchCustomRangeExpenses = async (startDate, endDate) => {
    try {
      const response = await axios.get(`${backendUrl}/api/expenses`);
      if (response.data) {
        const expenses = response.data.data;
        const filteredExpenses = expenses.filter((exp) => {
          const expDate = new Date(exp.date);
          return expDate >= startDate && expDate <= endDate;
        });
        return filteredExpenses.reduce(
          (sum, exp) => sum + (exp.amount || 0),
          0,
        );
      }
      return 0;
    } catch (error) {
      console.error("Error fetching custom range expenses:", error);
      return 0;
    }
  };

  const fetchPreviousPeriodSales = async (period, start, end) => {
    let previousStart, previousEnd;
    switch (period) {
      case "Today":
        previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(end);
        previousEnd.setDate(previousEnd.getDate() - 1);
        break;
      case "Month":
        previousStart = new Date(start);
        previousStart.setMonth(previousStart.getMonth() - 1);
        previousEnd = new Date(start);
        previousEnd.setDate(0);
        previousEnd.setHours(23, 59, 59, 999);
        break;
      case "Year":
        previousStart = new Date(start.getFullYear() - 1, 0, 1);
        previousEnd = new Date(
          start.getFullYear() - 1,
          11,
          31,
          23,
          59,
          59,
          999,
        );
        break;
      default:
        return 0;
    }
    return await fetchCustomRangeSales(previousStart, previousEnd);
  };

  const fetchPreviousPeriodOutstanding = async (period, start, end) => {
    let previousStart, previousEnd;
    switch (period) {
      case "Today":
        previousStart = new Date(start);
        previousStart.setDate(previousStart.getDate() - 1);
        previousEnd = new Date(end);
        previousEnd.setDate(previousEnd.getDate() - 1);
        break;
      case "Month":
        previousStart = new Date(start);
        previousStart.setMonth(previousStart.getMonth() - 1);
        previousEnd = new Date(end);
        previousEnd.setMonth(previousEnd.getMonth() - 1);
        const lastDayPrevMonth = new Date(
          previousEnd.getFullYear(),
          previousEnd.getMonth() + 1,
          0,
        ).getDate();
        previousEnd.setDate(Math.min(previousEnd.getDate(), lastDayPrevMonth));
        break;
      case "Year":
        previousStart = new Date(start);
        previousStart.setFullYear(previousStart.getFullYear() - 1);
        previousEnd = new Date(end);
        previousEnd.setFullYear(previousEnd.getFullYear() - 1);
        break;
      default:
        return { totalOutstanding: 0, outstandingData: [] };
    }
    return await fetchCustomRangeOutstanding(previousStart, previousEnd);
  };

  const fetchSalesBySubTab = async (subTab) => {
    try {
      const dateRanges = getDateRanges();
      const { start, end } =
        dateRanges[subTab.toLowerCase()] || dateRanges.today;
      const salesAmount = await fetchCustomRangeSales(start, end);
      const previousSales = await fetchPreviousPeriodSales(subTab, start, end);
      return {
        salesAmount,
        previousSales,
        growth: calculateGrowth(salesAmount, previousSales),
      };
    } catch (error) {
      console.error("Error fetching sales by sub-tab:", error);
      return { salesAmount: 0, previousSales: 0, growth: 0 };
    }
  };

  const fetchOutstandingBySubTab = async (subTab) => {
    try {
      const dateRanges = getDateRanges();
      const { start, end } =
        dateRanges[subTab.toLowerCase()] || dateRanges.today;
      const data = await fetchCustomRangeOutstanding(start, end);
      const previousData = await fetchPreviousPeriodOutstanding(
        subTab,
        start,
        end,
      );

      return {
        outstandingAmount: data.totalOutstanding,
        previousOutstanding: previousData.totalOutstanding || 0,
        growth: calculateGrowth(
          data.totalOutstanding,
          previousData.totalOutstanding || 0,
        ),
        outstandingInvoices: data.outstandingData || [],
      };
    } catch (error) {
      console.error("Error fetching outstanding by sub-tab:", error);
      return {
        outstandingAmount: 0,
        previousOutstanding: 0,
        growth: 0,
        outstandingInvoices: [],
      };
    }
  };

  // --- Existing fetch functions (updated fetchStockData) ---
  const fetchPayrollData = async () => {
    try {
      const currentDate = new Date();
      const previousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const period = `${previousMonth.getFullYear()}-${String(
        previousMonth.getMonth() + 1,
      ).padStart(2, "0")}`;
      const response = await axios.get(`${backendUrl}/api/hrm/payroll`, {
        params: { period },
      });

      const payrolls = response.data?.data || [];
      setPayrollData(payrolls);
      const total = payrolls.reduce(
        (sum, item) => sum + (item.netSalary || 0),
        0,
      );

      setTotalPayroll(total);
      setPayrollYTDTotal(total);
    } catch (error) {
      console.error("Error fetching payroll data:", error);
      setPayrollData([]);
      setTotalPayroll(0);
      setPayrollYTDTotal(0);
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (error) {
      console.error("Error loading teams:", error);
    }
  };

  // UPDATED: fetchStockData now extracts warehouse, MR, and combined totals
  const fetchStockData = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/reports/stock-in-hand`,
      );
      console.log("Stock API response:", response.data);

      // The API returns combined product list in 'reports' and summary fields
      const stockItems = Array.isArray(response.data.reports)
        ? response.data.reports
        : [];

      // Use the summary fields from the API response
      const warehouseStockValue = response.data.totalAmount || 0; // warehouse total
      const mrStockValue = response.data.totalMrAmount || 0; // MR total
      const totalStockValue = response.data.grandTotalAmount || 0; // combined total

      // Calculate low stock items (if needed)
      const lowStockItems = stockItems.filter((item) => {
        // You can implement your low stock logic here
        // Example: item.warehouseBoxes < item.minStockLevel
        return (
          item.warehouseBoxes > 0 &&
          item.warehouseBoxes < (item.minStockLevel || 0)
        );
      });

      // Calculate overdue stock value (example logic)
      const currentDate = new Date();
      const overdueStockValue = stockItems
        .filter((item) => {
          const expiry = item.expiry ? new Date(item.expiry) : null;
          return expiry && expiry < currentDate;
        })
        .reduce(
          (sum, item) => sum + (item.costPrice || 0) * (item.availableQty || 0),
          0,
        );

      setStockData({
        warehouseStockValue,
        mrStockValue,
        totalStockValue,
        lowStockItems,
        overdueStockValue,
        unreceivedStockValue: 0, // You can add logic for this
        // Keep old fields for backward compatibility
        totalStock: totalStockValue,
        stockValue: totalStockValue,
      });
    } catch (error) {
      console.error("Error fetching stock data:", error);
    }
  };

  const fetchExpenseData = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/expenses`);

      if (response.data) {
        const expenses = response.data.data;
        const today = new Date();
        const currentDate = new Date();

        // Calculate totals
        const totalExpense = expenses.reduce(
          (sum, exp) => sum + (exp.amount || 0),
          0,
        );

        const todayExpense = expenses
          .filter(
            (exp) => new Date(exp.date).toDateString() === today.toDateString(),
          )
          .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        const currentMonth = today.getMonth();
        const monthlyExpense = expenses
          .filter((exp) => new Date(exp.date).getMonth() === currentMonth)
          .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        const currentYear = today.getFullYear();
        const yearExpense = expenses
          .filter((exp) => new Date(exp.date).getFullYear() === currentYear)
          .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Calculate previous month expense
        const previousMonth = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1,
        );
        const previousMonthExpense = expenses
          .filter((exp) => {
            const expDate = new Date(exp.date);
            return (
              expDate.getFullYear() === previousMonth.getFullYear() &&
              expDate.getMonth() === previousMonth.getMonth()
            );
          })
          .reduce((sum, exp) => sum + (exp.amount || 0), 0);

        // Calculate overdue expenses
        const overdueExpenses = expenses.filter((exp) => {
          const dueDate = new Date(exp.dueDate || exp.date);
          return dueDate < currentDate && exp.status !== "Paid";
        });

        const overduePayroll = overdueExpenses.reduce(
          (sum, exp) => sum + (exp.amount || 0),
          0,
        );

        // Calculate unpaid expenses
        const unpaidExpenses = expenses.filter((exp) => {
          return exp.status === "Pending" || exp.status === "Unpaid";
        });

        const unpaidPayroll = unpaidExpenses.reduce(
          (sum, exp) => sum + (exp.amount || 0),
          0,
        );

        setExpenseData({
          totalExpense,
          monthlyExpense,
          todayExpense,
          yearExpense,
          previousMonthExpense,
          latestExpenses: expenses.slice(-5).reverse(),
          overduePayroll,
          unpaidPayroll,
        });
      }
    } catch (err) {
      console.error("Error fetching expenses:", err);
      showToast("error", "Failed to fetch expenses");
      setExpenseData({
        totalExpense: 0,
        monthlyExpense: 0,
        todayExpense: 0,
        yearExpense: 0,
        previousMonthExpense: 0,
        latestExpenses: [],
        overduePayroll: 0,
        unpaidPayroll: 0,
      });
    }
  };

  // --- Overdue and credit sale fetching (unchanged) ---
  const fetchOverdueInvoices = async () => {
    try {
      const currentDate = new Date();
      const response = await axios.get(`${backendUrl}/api/overdue`, {
        params: {
          currentDate: currentDate.toISOString(),
        },
      });

      if (response.data.success) {
        const overdueInvoices = response.data.data || [];
        const totalOverdueAmount = response.data.totalOverdueAmount || 0;
        return {
          overdueInvoices,
          totalOverdueAmount,
        };
      }
      return { overdueInvoices: [], totalOverdueAmount: 0 };
    } catch (error) {
      console.error("Error fetching overdue invoices:", error);
      return { overdueInvoices: [], totalOverdueAmount: 0 };
    }
  };

  const fetchCreditSaleInvoices = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales/credit-sale-not-received`,
      );

      if (response.data.success) {
        const creditSaleInvoices = response.data.data || [];
        const unpaidCreditSales = creditSaleInvoices.filter((invoice) => {
          const isCreditSale =
            invoice.paymentStatus === "Credit" ||
            invoice.paymentStatus === "Credit Sale" ||
            invoice.creditDays > 0;

          if (!isCreditSale) return false;

          const isPaid = invoice.paidAmount >= invoice.totalAmount;
          return !isPaid;
        });

        const totalUnpaidAmount = unpaidCreditSales.reduce((sum, invoice) => {
          const unpaidAmount =
            invoice.dueAmount > 0
              ? invoice.dueAmount
              : Math.max(0, invoice.totalAmount - invoice.paidAmount);
          return sum + (unpaidAmount || 0);
        }, 0);

        return {
          creditSaleInvoices: unpaidCreditSales,
          totalUnpaidAmount,
        };
      }
      return { creditSaleInvoices: [], totalUnpaidAmount: 0 };
    } catch (error) {
      console.error("Error fetching credit sale invoices:", error);
      return { creditSaleInvoices: [], totalUnpaidAmount: 0 };
    }
  };

  // --- Initialize dashboard ---
  const initializeDashboardData = async () => {
    setLoading(true);
    try {
      const mrData = await fetchMRList();
      setMrList(mrData.data);

      const previousMonthDate = new Date();
      previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
      setPreviousMonthLabel(formatMonthYear(previousMonthDate));

      await Promise.all([
        fetchPayrollData(),
        fetchTeams(),
        fetchStockData(), // now fetches combined totals
        fetchExpenseData(),
      ]);

      const [overdueResult, creditSaleResult] = await Promise.all([
        fetchOverdueInvoices(),
        fetchCreditSaleInvoices(),
      ]);

      const [todaySales, monthSales, yearSales] = await Promise.all([
        fetchSalesBySubTab("Today"),
        fetchSalesBySubTab("Month"),
        fetchSalesBySubTab("Year"),
      ]);

      const [todayOutstanding, monthOutstanding, yearOutstanding] =
        await Promise.all([
          fetchOutstandingBySubTab("Today"),
          fetchOutstandingBySubTab("Month"),
          fetchOutstandingBySubTab("Year"),
        ]);

      setSalesData({
        todaySales: todaySales.salesAmount,
        todayPrevious: todaySales.previousSales,
        todayGrowth: todaySales.growth,
        monthlySales: monthSales.salesAmount,
        monthlyPrevious: monthSales.previousSales,
        monthlyGrowth: monthSales.growth,
        yearSales: yearSales.salesAmount,
        yearPrevious: yearSales.previousSales,
        yearGrowth: yearSales.growth,
        totalSales: yearSales.salesAmount,
        overdueAmount: overdueResult.totalOverdueAmount,
        creditSale: creditSaleResult.totalUnpaidAmount,
        unreceivePayment: creditSaleResult.totalUnpaidAmount,
      });

      setOutstandingData({
        todayOutstanding: todayOutstanding.outstandingAmount,
        todayPrevious: todayOutstanding.previousOutstanding,
        todayGrowth: todayOutstanding.growth,
        monthlyOutstanding: monthOutstanding.outstandingAmount,
        monthlyPrevious: monthOutstanding.previousOutstanding,
        monthlyGrowth: monthOutstanding.growth,
        yearOutstanding: yearOutstanding.outstandingAmount,
        yearPrevious: yearOutstanding.previousOutstanding,
        yearGrowth: yearOutstanding.growth,
        totalOutstanding: yearOutstanding.outstandingAmount,
        mrWiseOutstanding: yearOutstanding.outstandingInvoices,
        overdueAmount: overdueResult.totalOverdueAmount,
      });
    } catch (error) {
      showToast("error", error.message || "Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializeDashboardData();
  }, []);

  return {
    loading,
    mrList,
    allTeams,
    previousMonthLabel,
    payrollData,
    totalPayroll,
    payrollYTDTotal,
    salesData,
    outstandingData,
    stockData,
    expenseData,
    fetchSalesBySubTab,
    fetchOutstandingBySubTab,
    fetchOverdueInvoices,
    fetchCreditSaleInvoices,
    setSalesData,
    setOutstandingData,
    setMrList,
  };
};
