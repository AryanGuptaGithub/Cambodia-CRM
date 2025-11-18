import { useState, useEffect } from 'react';
import axios from 'axios';
import { showToast } from '../../utils/toast';
import { fetchMRList } from '../../utils/customerUtil';
import { 
  getDateRanges, 
  getPreviousMonthRanges, 
  calculateGrowth,
  formatMonthYear 
} from './DashboardUtil';

const backendUrl = import.meta.env.VITE_BACKEND_URL;

export const useDashboardData = () => {
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [payrollYTDTotal, setPayrollYTDTotal] = useState(0);

  // Sales Data
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
  });

  // Outstanding Data
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
  });

  // Stock Data
  const [stockData, setStockData] = useState({
    totalStock: 0,
    stockValue: 0,
    lowStockItems: [],
  });

  // Expense Data
  const [expenseData, setExpenseData] = useState({
    totalExpense: 0,
    monthlyExpense: 0,
    todayExpense: 0,
    yearExpense: 0,
    latestExpenses: [],
  });

  // Fetch custom range sales
  const fetchCustomRangeSales = async (startDate, endDate) => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales/analytics/custom-range`,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        }
      );
      return response.data.totalSales || 0;
    } catch (error) {
      console.error("Error fetching custom range sales:", error);
      return 0;
    }
  };

  // Fetch custom range outstanding
  const fetchCustomRangeOutstanding = async (startDate, endDate) => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/outstanding/custom-range`,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching custom range outstanding:", error);
      return { totalOutstanding: 0, outstandingData: [] };
    }
  };

  // Fetch previous period sales
  const fetchPreviousPeriodSales = async (currentPeriod, currentStart, currentEnd) => {
    try {
      let previousStart, previousEnd;

      switch (currentPeriod) {
        case "Today":
          previousStart = new Date(currentStart);
          previousStart.setDate(previousStart.getDate() - 1);
          previousEnd = new Date(currentEnd);
          previousEnd.setDate(previousEnd.getDate() - 1);
          break;
        case "Month":
          previousStart = new Date(currentStart);
          previousStart.setMonth(previousStart.getMonth() - 1);
          previousEnd = new Date(currentStart);
          previousEnd.setDate(0);
          previousEnd.setHours(23, 59, 59, 999);
          break;
        case "Year":
          previousStart = new Date(currentStart.getFullYear() - 1, 0, 1);
          previousEnd = new Date(currentStart.getFullYear() - 1, 11, 31);
          previousEnd.setHours(23, 59, 59, 999);
          break;
        default:
          return 0;
      }

      return await fetchCustomRangeSales(previousStart, previousEnd);
    } catch (error) {
      console.error("Error fetching previous period sales:", error);
      return 0;
    }
  };

  // Fetch previous period outstanding
  const fetchPreviousPeriodOutstanding = async (currentPeriod, currentStart, currentEnd) => {
    try {
      let previousStart, previousEnd;

      switch (currentPeriod) {
        case "Today":
          previousStart = new Date(currentStart);
          previousStart.setDate(previousStart.getDate() - 1);
          previousEnd = new Date(currentEnd);
          previousEnd.setDate(previousEnd.getDate() - 1);
          break;
        case "Month":
          previousStart = new Date(currentStart);
          previousStart.setMonth(previousStart.getMonth() - 1);
          previousEnd = new Date(currentEnd);
          previousEnd.setMonth(previousEnd.getMonth() - 1);
          const lastDayOfPrevMonth = new Date(
            previousEnd.getFullYear(),
            previousEnd.getMonth() + 1,
            0
          ).getDate();
          previousEnd.setDate(Math.min(previousEnd.getDate(), lastDayOfPrevMonth));
          break;
        case "Year":
          previousStart = new Date(currentStart);
          previousStart.setFullYear(previousStart.getFullYear() - 1);
          previousEnd = new Date(currentEnd);
          previousEnd.setFullYear(previousEnd.getFullYear() - 1);
          break;
        default:
          return { totalOutstanding: 0, outstandingData: [] };
      }

      return await fetchCustomRangeOutstanding(previousStart, previousEnd);
    } catch (error) {
      console.error("Error fetching previous period outstanding:", error);
      return { totalOutstanding: 0, outstandingData: [] };
    }
  };

  // Fetch sales by sub-tab
  const fetchSalesBySubTab = async (subTab) => {
    try {
      const dateRanges = getDateRanges();
      let startDate, endDate;

      switch (subTab) {
        case "Today":
          startDate = dateRanges.today.start;
          endDate = dateRanges.today.end;
          break;
        case "Month":
          startDate = dateRanges.month.start;
          endDate = dateRanges.month.end;
          break;
        case "Year":
          startDate = dateRanges.year.start;
          endDate = dateRanges.year.end;
          break;
        default:
          startDate = dateRanges.today.start;
          endDate = dateRanges.today.end;
      }

      const salesAmount = await fetchCustomRangeSales(startDate, endDate);
      const previousSales = await fetchPreviousPeriodSales(subTab, startDate, endDate);
      const growth = calculateGrowth(salesAmount, previousSales);

      return { salesAmount, previousSales, growth };
    } catch (error) {
      console.error("Error fetching sales by sub-tab:", error);
      return { salesAmount: 0, previousSales: 0, growth: 0 };
    }
  };

  // Fetch outstanding by sub-tab
  const fetchOutstandingBySubTab = async (subTab) => {
    try {
      const dateRanges = getDateRanges();
      let outstandingAmount = 0;
      let previousOutstanding = 0;
      let outstandingInvoices = [];

      switch (subTab) {
        case "Today":
          const todayData = await fetchCustomRangeOutstanding(
            dateRanges.today.start,
            dateRanges.today.end
          );
          outstandingAmount = todayData.totalOutstanding;
          outstandingInvoices = todayData.outstandingData || [];

          const todayPreviousData = await fetchPreviousPeriodOutstanding(
            "Today",
            dateRanges.today.start,
            dateRanges.today.end
          );
          previousOutstanding = todayPreviousData.totalOutstanding;
          break;
        case "Month":
          const monthData = await fetchCustomRangeOutstanding(
            dateRanges.month.start,
            dateRanges.month.end
          );
          outstandingAmount = monthData.totalOutstanding;
          outstandingInvoices = monthData.outstandingData || [];

          const monthPreviousData = await fetchPreviousPeriodOutstanding(
            "Month",
            dateRanges.month.start,
            dateRanges.month.end
          );
          previousOutstanding = monthPreviousData.totalOutstanding;
          break;
        case "Year":
          const yearData = await fetchCustomRangeOutstanding(
            dateRanges.year.start,
            dateRanges.year.end
          );
          outstandingAmount = yearData.totalOutstanding;
          outstandingInvoices = yearData.outstandingData || [];

          const yearPreviousData = await fetchPreviousPeriodOutstanding(
            "Year",
            dateRanges.year.start,
            dateRanges.year.end
          );
          previousOutstanding = yearPreviousData.totalOutstanding;
          break;
        default:
          const defaultData = await fetchCustomRangeOutstanding(
            dateRanges.today.start,
            dateRanges.today.end
          );
          outstandingAmount = defaultData.totalOutstanding;
          outstandingInvoices = defaultData.outstandingData || [];
      }

      const growth = calculateGrowth(outstandingAmount, previousOutstanding);

      return {
        outstandingAmount,
        previousOutstanding,
        growth,
        outstandingInvoices,
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

  // Fetch payroll data
  const fetchPayrollData = async () => {
    try {
      const currentDate = new Date();
      const previousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1
      );
      const year = previousMonth.getFullYear();
      const month = String(previousMonth.getMonth() + 1).padStart(2, "0");
      const period = `${year}-${month}`;

      const response = await axios.get(`${backendUrl}/api/payrolls`, {
        params: { period },
      });

      if (response.data && response.data.success) {
        const payrolls = response.data.data || [];
        setPayrollData(payrolls);
        
        const total = payrolls.reduce(
          (sum, item) => sum + (item.netSalary || 0),
          0
        );
        setTotalPayroll(total);
        setPayrollYTDTotal(total * 2.5);
      }
    } catch (error) {
      console.error("Error fetching payroll data:", error);
      setPayrollData([]);
      setTotalPayroll(0);
      setPayrollYTDTotal(0);
    }
  };

  // Fetch teams
  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (err) {
      console.error("Error loading teams:", err);
    }
  };

  // Fetch stock data
  const fetchStockData = async () => {
    try {
      // Mock data - replace with actual API call
      setStockData({
        totalStock: 150,
        stockValue: 45000,
        lowStockItems: [
          { product: "Product A", category: "Category 1", currentStock: 5, minLevel: 10 },
          { product: "Product B", category: "Category 2", currentStock: 3, minLevel: 8 },
        ],
      });
    } catch (error) {
      console.error("Error fetching stock data:", error);
      setStockData({
        totalStock: 0,
        stockValue: 0,
        lowStockItems: [],
      });
    }
  };

  // Fetch expense data
  const fetchExpenseData = async () => {
    try {
      // Mock data - replace with actual API call
      setExpenseData({
        totalExpense: 5000,
        monthlyExpense: 2000,
        todayExpense: 150,
        yearExpense: 48000,
        latestExpenses: [
          { category: "Office Supplies", description: "Printer paper", amount: 45.50, date: "2024-01-15" },
          { category: "Utilities", description: "Electricity bill", amount: 120.75, date: "2024-01-14" },
        ],
      });
    } catch (error) {
      console.error("Error fetching expense data:", error);
      setExpenseData({
        totalExpense: 0,
        monthlyExpense: 0,
        todayExpense: 0,
        yearExpense: 0,
        latestExpenses: [],
      });
    }
  };

  // Initialize dashboard data
  const initializeDashboardData = async () => {
    try {
      setLoading(true);
      
      const mrData = await fetchMRList();
      setMrList(mrData.data);

      const currentDate = new Date();
      const previousMonthDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1
      );
      setPreviousMonthLabel(formatMonthYear(previousMonthDate));

      await fetchPayrollData();
      await fetchTeams();
      await fetchStockData();
      await fetchExpenseData();

      // Fetch initial sales and outstanding data
      const todaySalesData = await fetchSalesBySubTab("Today");
      const monthSalesData = await fetchSalesBySubTab("Month");
      const yearSalesData = await fetchSalesBySubTab("Year");

      setSalesData({
        todaySales: todaySalesData.salesAmount,
        todayPrevious: todaySalesData.previousSales,
        todayGrowth: todaySalesData.growth,
        monthlySales: monthSalesData.salesAmount,
        monthlyPrevious: monthSalesData.previousSales,
        monthlyGrowth: monthSalesData.growth,
        yearSales: yearSalesData.salesAmount,
        yearPrevious: yearSalesData.previousSales,
        yearGrowth: yearSalesData.growth,
        totalSales: yearSalesData.salesAmount,
      });

      const todayOutstandingData = await fetchOutstandingBySubTab("Today");
      const monthOutstandingData = await fetchOutstandingBySubTab("Month");
      const yearOutstandingData = await fetchOutstandingBySubTab("Year");

      setOutstandingData({
        todayOutstanding: todayOutstandingData.outstandingAmount,
        todayPrevious: todayOutstandingData.previousOutstanding,
        todayGrowth: todayOutstandingData.growth,
        monthlyOutstanding: monthOutstandingData.outstandingAmount,
        monthlyPrevious: monthOutstandingData.previousOutstanding,
        monthlyGrowth: monthOutstandingData.growth,
        yearOutstanding: yearOutstandingData.outstandingAmount,
        yearPrevious: yearOutstandingData.previousOutstanding,
        yearGrowth: yearOutstandingData.growth,
        totalOutstanding: yearOutstandingData.outstandingAmount,
        mrWiseOutstanding: yearOutstandingData.outstandingInvoices,
      });

    } catch (err) {
      showToast("error", err.message || "Failed to fetch data");
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
    setSalesData,
    setOutstandingData,
    setMrList,
  };
};