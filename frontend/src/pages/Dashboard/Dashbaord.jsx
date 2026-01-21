import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCards } from "./DashboardCards";
import { SidePanel } from "./SidePanel";
import { SubTabs } from "./SubTabs";
import { SalesTable } from "./SalesTable";
import { OutstandingTable } from "./OutstandingTable";
import { PayrollTable } from "./PayrollTable";
import { ExpenseTable } from "./ExpenseTable";
import { DashboardHeader } from "./DashboardHeader";
import ProductsModal from "./ProductModal";
import AllMRsSalaryModal from "./AllMRSalaryModal";
import { useDashboardData } from "./useDataboardData";
import {
  getDateRanges,
  getPreviousMonthRanges,
  getStockDateRanges,
  calculateStockValue,
  getLowStockItems,
  formatCurrency,
} from "./DashboardUtil";
import axios from "axios";
import { StockTable } from "./StockTable";
import BatchDetailsModal from "./BatchDetailsModal";
import { OverdueTable } from "./OverdueTable";
import { CreditSaleTable } from "./CreditSaleTable";
import { Calendar, X, Filter } from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const Dashboard = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef(null);

  const {
    loading,
    mrList,
    allTeams,
    previousMonthLabel,
    payrollData,
    totalPayroll,
    payrollYTDTotal,
    salesData,
    outstandingData,
    expenseData,
    fetchSalesBySubTab,
    fetchOutstandingBySubTab,
    setSalesData,
    setOutstandingData,
    setMrList,
  } = useDashboardData();

  // SEARCH
  const [searchTerm, setSearchTerm] = useState("");

  // PARENT TABS
  const [activeTab, setActiveTab] = useState("Sales");
  const [previousActiveTab, setPreviousActiveTab] = useState("Sales");

  // SUB-TABS
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [activeOutstandingSubTab, setActiveOutstandingSubTab] =
    useState("Today");
  const [activeStockSubTab, setActiveStockSubTab] = useState("Today");

  // TABLE DATA
  const [stockTableData, setStockTableData] = useState([]);
  const [loadingStockData, setLoadingStockData] = useState(false);
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [outstandingTableData, setOutstandingTableData] = useState([]);
  const [loadingOutstandingData, setLoadingOutstandingData] = useState(false);
  const [expenseTableData, setExpenseTableData] = useState([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);
  const [payrollTableData, setPayrollTableData] = useState([]);
  const [loadingPayrollData, setLoadingPayrollData] = useState(false);
  const [pendingCollectionData, setPendingCollectionData] = useState([]);
  const [loadingPendingCollectionData, setLoadingPendingCollectionData] =
    useState(false);

  // OVERDUE DATA STATES
  const [overdueTableData, setOverdueTableData] = useState([]);
  const [loadingOverdueData, setLoadingOverdueData] = useState(false);

  // CREDIT SALE DATA STATES
  const [creditSaleTableData, setCreditSaleTableData] = useState([]);
  const [loadingCreditSaleData, setLoadingCreditSaleData] = useState(false);

  // ADD THESE STATES FOR DYNAMIC PAYROLL TOTALS
  const [currentPayrollTotal, setCurrentPayrollTotal] = useState(0);
  const [currentYTDTotal, setCurrentYTDTotal] = useState(0);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedBatches, setSelectedBatches] = useState([]);

  // STOCK DATA CARDS
  const [stockData, setStockData] = useState({
    totalStock: 0,
    stockValue: 0,
    lowStockItems: [],
    overdueStockValue: 0,
    unreceivedStockValue: 0,
    lowStockValue: 0,
    expiringStockValue: 0,
    totalStockValue: 0,
  });

  // MODALS
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);
  const [selectedMRName, setSelectedMRName] = useState("");
  const [showAllMRsModal, setShowAllMRsModal] = useState(false);
  const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);

  // SIDE PANEL
  const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
  const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);

  // Use useMemo to recalculate ranges when dependencies change
  const dateRanges = useMemo(() => getDateRanges(), []);
  const prevMonthRanges = useMemo(() => getPreviousMonthRanges(), []);
  const stockDateRanges = useMemo(() => getStockDateRanges(), []);

  const [user] = useState({
    name: "User",
    role: "User",
    initials: "U",
  });

  // =================== CUSTOM DATE FILTER STATES ===================
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedCardForFilter, setSelectedCardForFilter] = useState(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isCustomDateActive, setIsCustomDateActive] = useState({
    "Total Sales": false,
    "Outstanding": false,
    "Total Expense": false,
    "Total Payroll": false,
  });
  
  // Store custom date ranges for each card
  const [customDateRanges, setCustomDateRanges] = useState({
    "Total Sales": { start: "", end: "" },
    "Outstanding": { start: "", end: "" },
    "Total Expense": { start: "", end: "" },
    "Total Payroll": { start: "", end: "" },
  });

  // Initialize dates to current month
  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const defaultStartDate = firstDayOfMonth.toISOString().split('T')[0];
    const defaultEndDate = lastDayOfMonth.toISOString().split('T')[0];
    
    setCustomStartDate(defaultStartDate);
    setCustomEndDate(defaultEndDate);
    
    // Initialize all custom date ranges with default values
    const defaultRanges = {
      "Total Sales": { start: defaultStartDate, end: defaultEndDate },
      "Outstanding": { start: defaultStartDate, end: defaultEndDate },
      "Total Expense": { start: defaultStartDate, end: defaultEndDate },
      "Total Payroll": { start: defaultStartDate, end: defaultEndDate },
    };
    setCustomDateRanges(defaultRanges);
  }, []);

  // =================== CUSTOM DATE FILTER HANDLERS ===================
  const handleDateFilterClick = (cardId) => {
    setSelectedCardForFilter(cardId);
    
    // Load saved custom dates for this card, or use current month
    const savedRange = customDateRanges[cardId];
    if (savedRange.start && savedRange.end) {
      setCustomStartDate(savedRange.start);
      setCustomEndDate(savedRange.end);
    } else {
      // Default to current month
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      setCustomStartDate(firstDayOfMonth.toISOString().split('T')[0]);
      setCustomEndDate(lastDayOfMonth.toISOString().split('T')[0]);
    }
    
    setShowDateFilter(true);
  };

  const handleApplyDateFilter = () => {
    if (!selectedCardForFilter || !customStartDate || !customEndDate) return;

    // Save the custom date range for this card
    setCustomDateRanges(prev => ({
      ...prev,
      [selectedCardForFilter]: {
        start: customStartDate,
        end: customEndDate
      }
    }));

    // Mark this card as using custom date filter
    setIsCustomDateActive(prev => ({
      ...prev,
      [selectedCardForFilter]: true
    }));

    // Switch to Custom subtab and fetch data
    switch (selectedCardForFilter) {
      case "Total Sales":
        setActiveSalesSubTab("Custom");
        fetchSalesTableData("Custom");
        break;
      case "Outstanding":
        setActiveOutstandingSubTab("Custom");
        fetchOutstandingTableData("Custom");
        break;
      case "Total Expense":
        setActiveExpenseSubTab("Custom");
        fetchExpenseTableData("Custom");
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Custom");
        fetchPayrollTableData("Custom");
        break;
      default:
        break;
    }

    setShowDateFilter(false);
  };

  const handleClearDateFilter = (cardId, e) => {
    e.stopPropagation(); // Prevent triggering the card click
    
    // Clear custom date filter for this card
    setIsCustomDateActive(prev => ({
      ...prev,
      [cardId]: false
    }));

    // Clear saved custom dates for this card
    setCustomDateRanges(prev => ({
      ...prev,
      [cardId]: { start: "", end: "" }
    }));

    // Reset to default subtab and fetch data
    switch (cardId) {
      case "Total Sales":
        setActiveSalesSubTab("Today");
        fetchSalesTableData("Today");
        break;
      case "Outstanding":
        setActiveOutstandingSubTab("Today");
        fetchOutstandingTableData("Today");
        break;
      case "Total Expense":
        setActiveExpenseSubTab("Month");
        fetchExpenseTableData("Month");
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Prev Month");
        fetchPayrollTableData("Prev Month");
        break;
      default:
        break;
    }
  };

  // =================== UPDATED SUBTAB CHANGE HANDLERS ===================
  const handleSalesSubTabChange = (subTab) => {
    setActiveSalesSubTab(subTab);
    if (activeTab === "Sales") {
      if (subTab === "Custom" && !isCustomDateActive["Total Sales"]) {
        // Don't fetch if custom is not set yet
        return;
      }
      fetchSalesTableData(subTab);
    }
  };

  const handleOutstandingSubTabChange = (subTab) => {
    setActiveOutstandingSubTab(subTab);
    if (activeTab === "Outstanding") {
      if (subTab === "Custom" && !isCustomDateActive["Outstanding"]) {
        return;
      }
      fetchOutstandingTableData(subTab);
    }
  };

  const handleStockSubTabChange = (subTab) => {
    setActiveStockSubTab(subTab);
    if (activeTab === "Stock in Hands") {
      fetchStockTableData(subTab);
    }
  };

  const handleExpenseSubTabChange = (subTab) => {
    setActiveExpenseSubTab(subTab);
    if (activeTab === "Expenses") {
      if (subTab === "Custom" && !isCustomDateActive["Total Expense"]) {
        return;
      }
      fetchExpenseTableData(subTab);
    }
  };

  const handlePayrollSubTabChange = (subTab) => {
    setActivePayrollSubTab(subTab);
    if (activeTab === "Total Payroll") {
      if (subTab === "Custom" && !isCustomDateActive["Total Payroll"]) {
        return;
      }
      fetchPayrollTableData(subTab);
    }
  };

  // =================== CUSTOM DATE FETCH FUNCTIONS ===================
  const fetchSalesWithCustomDates = async () => {
    try {
      setLoadingSalesData(true);
      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params: {
          period: "custom",
          startDate: customStartDate,
          endDate: customEndDate
        }
      });
      setSalesTableData(response.data.success ? response.data.data : []);
      
      // Update sales data for the card display
      if (response.data.success && response.data.summary) {
        setSalesData(prev => ({
          ...prev,
          customSales: response.data.summary.totalSales || 0,
          customGrowth: 0
        }));
      }
    } catch (error) {
      console.error("Error fetching custom sales data:", error);
      setSalesTableData([]);
    } finally {
      setLoadingSalesData(false);
    }
  };

  const fetchOutstandingWithCustomDates = async () => {
    try {
      setLoadingOutstandingData(true);
      const response = await axios.get(
        `${backendUrl}/api/outstanding/table-data`,
        {
          params: {
            period: "custom",
            startDate: customStartDate,
            endDate: customEndDate
          }
        }
      );
      setOutstandingTableData(response.data.success ? response.data.data : []);
      
      // Update outstanding data for the card display
      if (response.data.success && response.data.summary) {
        setOutstandingData(prev => ({
          ...prev,
          customOutstanding: response.data.summary.totalOutstanding || 0,
          customGrowth: 0
        }));
      }
    } catch (error) {
      console.error("Error fetching custom outstanding data:", error);
      setOutstandingTableData([]);
    } finally {
      setLoadingOutstandingData(false);
    }
  };

  const fetchExpensesWithCustomDates = async () => {
    try {
      setLoadingExpenseData(true);
      const response = await axios.get(`${backendUrl}/api/expenses`, {
        params: {
          period: "custom",
          startDate: customStartDate,
          endDate: customEndDate
        }
      });

      let expenses = [];
      if (response.data?.success) {
        expenses = response.data.data || [];
      } else if (Array.isArray(response.data)) {
        expenses = response.data;
      }

      const formattedExpenses = Array.isArray(expenses)
        ? expenses.map((expense) => ({
            id: expense._id || expense.id,
            category:
              expense.category?.category ||
              (typeof expense.category === "string"
                ? expense.category
                : "Uncategorized"),
            amount: expense.amount || 0,
            date: expense.date
              ? new Date(expense.date).toLocaleDateString()
              : expense.createdAt
              ? new Date(expense.createdAt).toLocaleDateString()
              : new Date().toLocaleDateString(),
            description:
              expense.description || expense.remarks || "No description",
            paymentMethod: expense.paymentMethod || "N/A",
            sourceAccount: expense.sourceAccount?.name || "N/A",
            details: [
              `Amount: ₹${expense.amount || 0}`,
              `Date: ${
                expense.date
                  ? new Date(expense.date).toLocaleDateString()
                  : "N/A"
              }`,
              `Category: ${expense.category?.category || "Uncategorized"}`,
              `Payment Method: ${expense.paymentMethod || "N/A"}`,
              `Source: ${expense.sourceAccount?.name || "N/A"}`,
              `Remarks: ${expense.remarks || "No remarks"}`,
            ],
          }))
        : [];

      setExpenseTableData(
        formattedExpenses.sort((a, b) => b.amount - a.amount)
      );
      
      // Update expense data structure if needed
      if (!expenseData.latestExpenses) {
        setExpenseData(prev => ({
          ...prev,
          latestExpenses: expenses,
          customExpenseTotal: expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0)
        }));
      }
    } catch (error) {
      console.error("Error fetching custom expense data:", error);
      setExpenseTableData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  };

  const fetchPayrollWithCustomDates = async () => {
    try {
      setLoadingPayrollData(true);
      const response = await axios.get(`${backendUrl}/api/payrolls`, {
        params: {
          period: "custom",
          startDate: customStartDate,
          endDate: customEndDate
        }
      });

      const payrolls = response.data?.data || [];
      const totalNetSalary = payrolls.reduce((sum, item) => sum + (item.netSalary || 0), 0);

      setPayrollTableData(payrolls);
      setCurrentPayrollTotal(totalNetSalary);
    } catch (error) {
      console.error("Error fetching custom payroll data:", error);
      setPayrollTableData([]);
    } finally {
      setLoadingPayrollData(false);
    }
  };

  // =================== ORIGINAL FETCH FUNCTIONS (UPDATED) ===================
  const fetchStockTableData = async (period = "Today") => {
    try {
      setLoadingStockData(true);
      const response = await axios.get(`${backendUrl}/api/reports-in-hand`, {
        params: { period },
      });

      const stockDataFromAPI = Array.isArray(response.data.reports)
        ? response.data.reports
        : [];

      setStockTableData(stockDataFromAPI);

      // Update stock cards locally with overdue/unreceive values
      const totalStockValue = calculateStockValue(stockDataFromAPI);
      const lowStockItems = getLowStockItems(stockDataFromAPI);

      // Calculate overdue stock value
      const overdueStockValue = stockDataFromAPI
        .filter((item) => {
          const expiry = item.expiry ? new Date(item.expiry) : null;
          return expiry && expiry < new Date();
        })
        .reduce(
          (sum, item) => sum + (item.costPrice || 0) * (item.availableQty || 0),
          0
        );

      // Calculate unreceived stock value
      const unreceivedStockValue = stockDataFromAPI
        .filter(
          (item) => item.status === "pending" || item.status === "unreceived"
        )
        .reduce(
          (sum, item) => sum + (item.costPrice || 0) * (item.availableQty || 0),
          0
        );

      setStockData((prev) => ({
        ...prev,
        totalStock: totalStockValue,
        stockValue: totalStockValue,
        lowStockItems: lowStockItems,
        overdueStockValue: overdueStockValue,
        unreceivedStockValue: unreceivedStockValue,
        totalStockValue: totalStockValue,
      }));
    } catch (error) {
      console.error("Error fetching stock table data:", error);
    } finally {
      setLoadingStockData(false);
    }
  };

  const fetchSalesTableData = async (period) => {
    try {
      setLoadingSalesData(true);
      
      const params = { period };
      if (period === "Custom" && isCustomDateActive["Total Sales"]) {
        params.period = "custom";
        params.startDate = customDateRanges["Total Sales"].start;
        params.endDate = customDateRanges["Total Sales"].end;
      }

      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params,
      });

      setSalesTableData(response.data.success ? response.data.data : []);
    } catch (error) {
      console.error("Error fetching sales table data:", error);
      setSalesTableData([]);
    } finally {
      setLoadingSalesData(false);
    }
  };

  const fetchOutstandingTableData = async (period) => {
    try {
      setLoadingOutstandingData(true);

      const params = { period };
      if (period === "Custom" && isCustomDateActive["Outstanding"]) {
        params.period = "custom";
        params.startDate = customDateRanges["Outstanding"].start;
        params.endDate = customDateRanges["Outstanding"].end;
      }

      const response = await axios.get(
        `${backendUrl}/api/outstanding/table-data`,
        { params }
      );
      setOutstandingTableData(response.data.success ? response.data.data : []);
    } catch (error) {
      console.error("Error fetching outstanding table data:", error);
      setOutstandingTableData([]);
    } finally {
      setLoadingOutstandingData(false);
    }
  };

  const fetchExpenseTableData = async (period) => {
    try {
      setLoadingExpenseData(true);

      const params = { period };
      if (period === "Custom" && isCustomDateActive["Total Expense"]) {
        params.period = "custom";
        params.startDate = customDateRanges["Total Expense"].start;
        params.endDate = customDateRanges["Total Expense"].end;
      }

      const response = await axios.get(`${backendUrl}/api/expenses`, {
        params,
      });

      let expenses = [];
      if (response.data?.success) {
        expenses = response.data.data || [];
      } else if (Array.isArray(response.data)) {
        expenses = response.data;
      } else if (response.data?.expenses) {
        expenses = response.data.expenses;
      } else if (response.data?.latestExpenses) {
        expenses = response.data.latestExpenses;
      }

      // Filter expenses based on period (if not custom)
      if (period !== "Custom") {
        const currentDate = new Date();
        let filteredExpenses = [];

        switch (period) {
          case "Month":
            filteredExpenses = expenses.filter((expense) => {
              const expenseDate = new Date(expense.date);
              return (
                expenseDate.getMonth() === currentDate.getMonth() &&
                expenseDate.getFullYear() === currentDate.getFullYear()
              );
            });
            break;

          case "Year":
            filteredExpenses = expenses.filter((expense) => {
              const expenseDate = new Date(expense.date);
              return expenseDate.getFullYear() === currentDate.getFullYear();
            });
            break;

          case "Overdue":
            filteredExpenses = expenses.filter((expense) => {
              const dueDate = new Date(expense.dueDate || expense.date);
              return dueDate < currentDate && expense.status !== "Paid";
            });
            break;

          case "Unreceive_Payment":
            filteredExpenses = expenses.filter((expense) => {
              return expense.status === "Pending" || expense.status === "Unpaid";
            });
            break;

          case "Pending":
            filteredExpenses = expenses.filter((expense) => {
              return expense.status === "Pending";
            });
            break;

          case "Approved":
            filteredExpenses = expenses.filter((expense) => {
              return expense.status === "Approved";
            });
            break;

          case "Rejected":
            filteredExpenses = expenses.filter((expense) => {
              return expense.status === "Rejected";
            });
            break;

          default:
            filteredExpenses = expenses;
        }
        expenses = filteredExpenses;
      }

      const formattedExpenses = Array.isArray(expenses)
        ? expenses.map((expense) => ({
            id: expense._id || expense.id,
            category:
              expense.category?.category ||
              (typeof expense.category === "string"
                ? expense.category
                : "Uncategorized"),
            amount: expense.amount || 0,
            date: expense.date
              ? new Date(expense.date).toLocaleDateString()
              : expense.createdAt
              ? new Date(expense.createdAt).toLocaleDateString()
              : new Date().toLocaleDateString(),
            description:
              expense.description || expense.remarks || "No description",
            paymentMethod: expense.paymentMethod || "N/A",
            sourceAccount: expense.sourceAccount?.name || "N/A",
            details: [
              `Amount: ₹${expense.amount || 0}`,
              `Date: ${
                expense.date
                  ? new Date(expense.date).toLocaleDateString()
                  : "N/A"
              }`,
              `Category: ${expense.category?.category || "Uncategorized"}`,
              `Payment Method: ${expense.paymentMethod || "N/A"}`,
              `Source: ${expense.sourceAccount?.name || "N/A"}`,
              `Remarks: ${expense.remarks || "No remarks"}`,
            ],
          }))
        : [];

      setExpenseTableData(
        formattedExpenses.sort((a, b) => b.amount - a.amount)
      );
    } catch (error) {
      console.error("Error fetching expense table data:", error);
      setExpenseTableData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  };

  // Fetch payroll table data based on period
  const fetchPayrollTableData = async (period) => {
    try {
      setLoadingPayrollData(true);
      
      let params = {};
      
      if (period === "Custom" && isCustomDateActive["Total Payroll"]) {
        params.period = "custom";
        params.startDate = customDateRanges["Total Payroll"].start;
        params.endDate = customDateRanges["Total Payroll"].end;
      } else {
        const currentDate = new Date();
        let payrollPeriod;

        if (period === "Prev Month") {
          let prevMonth = currentDate.getMonth() - 1;
          let year = currentDate.getFullYear();

          if (prevMonth < 0) {
            prevMonth = 11;
            year = year - 1;
          }

          const month = String(prevMonth + 1).padStart(2, "0");

          payrollPeriod = `${year}-${month}`;
        } else if (period === "YTD") {
          const year = currentDate.getFullYear();
          payrollPeriod = `${year}-YTD`;
        } else if (period === "Overdue") {
          payrollPeriod = "overdue";
        } else if (period === "Unreceive_Payment") {
          payrollPeriod = "unreceived";
        }
        
        params.period = payrollPeriod;
      }

      const response = await axios.get(`${backendUrl}/api/payrolls`, {
        params,
      });

      const payrolls = response.data?.data || [];
      
      // Calculate and log the total
      const totalNetSalary = payrolls.reduce((sum, item) => {
        const netSalary = item.netSalary || 0;
        return sum + netSalary;
      }, 0);

      setPayrollTableData(payrolls);
      // UPDATE THE TOTALS BASED ON THE CURRENT PERIOD
      if (period === "Prev Month" || period === "Custom") {
        setCurrentPayrollTotal(totalNetSalary);
      } else if (period === "YTD") {
        setCurrentYTDTotal(totalNetSalary);
      } else if (period === "Overdue") {
        setCurrentPayrollTotal(totalNetSalary);
      } else if (period === "Unreceive_Payment") {
        setCurrentYTDTotal(totalNetSalary);
      }
    } catch (error) {
      console.error("Error in fetchPayrollTableData:", error);
      setPayrollTableData([]);
    } finally {
      setLoadingPayrollData(false);
    }
  };

  // Fetch overdue invoices
  const fetchOverdueTableData = async () => {
    try {
      setLoadingOverdueData(true);

      const response = await axios.get(`${backendUrl}/api/overdue`, {
        params: {
          currentDate: new Date().toISOString(),
        },
      });

      if (response.data.success) {
        const formattedData = response.data.data.map((invoice) => ({
          ...invoice,
          overdueAmount:
            invoice.dueAmount > 0
              ? invoice.dueAmount
              : Math.max(0, invoice.totalAmount - (invoice.paidAmount || 0)),
        }));

        setOverdueTableData(formattedData);

        if (salesData) {
          setSalesData((prev) => ({
            ...prev,
            overdueAmount: response.data.totalOverdueAmount || 0,
          }));
        }
      }
    } catch (error) {
      console.error("Error fetching overdue table data:", error);
      setOverdueTableData([]);
    } finally {
      setLoadingOverdueData(false);
    }
  };

  // Fetch credit sale cash not received data
  const fetchCreditSaleTableData = async () => {
    try {
      setLoadingCreditSaleData(true);
      const response = await axios.get(
        `${backendUrl}/api/sales/credit-sale-not-received`
      );

      if (response.data.success) {
        setCreditSaleTableData(response.data.data || []);
      }
    } catch (error) {
      console.error("Error fetching credit sale data:", error);
      console.error("Error details:", error.response?.data || error.message);
      setCreditSaleTableData([]);
    } finally {
      setLoadingCreditSaleData(false);
    }
  };

  const fetchPendingCollectionData = async () => {
    try {
      setLoadingPendingCollectionData(true);

      const response = await axios.get(
        `${backendUrl}/api/sales/pending-collection-today`
      );

      if (response.data.success) {
        const data = response.data.data || [];

        setPendingCollectionData(data);
      } else {
        console.error("❌ API returned success: false", response.data.message);
        setPendingCollectionData([]);
      }
    } catch (error) {
      console.error("❌ Error fetching pending collection data:", error);
      console.error("❌ Error details:", error.response?.data || error.message);
      setPendingCollectionData([]);
    } finally {
      setLoadingPendingCollectionData(false);
    }
  };

  // ------------------ HANDLERS ------------------
  const handleViewProducts = (mrName, products) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(products);
    setShowProductsModal(true);
  };

  const handleViewInvoices = (mrName, invoices) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(invoices);
    setShowProductsModal(true);
  };

  const handleViewExpenseDetails = (expenseName, details) => {
    setSelectedMRName(expenseName);
    setSelectedMRProducts(details);
    setShowProductsModal(true);
  };

  const handleViewStockDetails = (productName, batches) => {
    setSelectedProductName(productName);
    setSelectedBatches(batches);
    setShowBatchModal(true);
  };

  // Handler for viewing invoice details from OverdueTable
  const handleViewInvoiceDetails = (invoice) => {
    // Create details array for the modal
    const details = [
      `Invoice Number: ${invoice.invoiceNumber || "N/A"}`,
      `Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`,
      `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`,
      `MR Name: ${invoice.mrName || "N/A"}`,
      `Customer: ${invoice.customerName || "N/A"}`,
      `Total Amount: $${formatCurrency(invoice.totalAmount || 0)}`,
      `Paid Amount: $${formatCurrency(invoice.paidAmount || 0)}`,
      `Due Amount: $${formatCurrency(invoice.dueAmount || 0)}`,
      `Overdue Amount: $${formatCurrency(invoice.overdueAmount || 0)}`,
      `Payment Status: ${invoice.paymentStatus || "N/A"}`,
      `Credit Days: ${invoice.creditDays || 0}`,
      `Delivery Date: ${
        invoice.deliveryDate
          ? new Date(invoice.deliveryDate).toLocaleDateString()
          : "N/A"
      }`,
      `Remark: ${invoice.remark || "No remark"}`,
    ];

    // Add product details if available
    if (invoice.products && invoice.products.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((product, index) => {
        details.push(
          `  ${index + 1}. ${product.productName || "Product"} - Qty: ${
            product.quantity || 0
          } - Price: $${product.price || 0}`
        );
      });
    }

    setSelectedMRName(`Invoice: ${invoice.invoiceNumber || "Details"}`);
    setSelectedMRProducts(details);
    setShowProductsModal(true);
  };

  // Handler for viewing credit sale details
  const handleViewCreditSaleDetails = (invoice) => {
    // Create details array for the modal
    const details = [
      `Invoice Number: ${invoice.invoiceNumber || "N/A"}`,
      `Invoice Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`,
      `MR Name: ${invoice.mrName || "N/A"}`,
      `Customer: ${invoice.customerName || "N/A"}`,
      `Customer Code: ${invoice.customerCode || "N/A"}`,
      `Total Amount: $${formatCurrency(invoice.totalAmount || 0)}`,
      `Paid Amount: $${formatCurrency(invoice.paidAmount || 0)}`,
      `Due Amount: $${formatCurrency(invoice.dueAmount || 0)}`,
      `Payment Status: ${invoice.paymentStatus || "N/A"}`,
      `Credit Days: ${invoice.creditDays || 0}`,
      `Due Date: ${
        invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"
      }`,
      `Delivery Date: ${
        invoice.deliveryDate
          ? new Date(invoice.deliveryDate).toLocaleDateString()
          : "N/A"
      }`,
      `Remark: ${invoice.remark || "No remark"}`,
    ];

    // Add product details if available
    if (invoice.products && invoice.products.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((product, index) => {
        details.push(
          `  ${index + 1}. ${product.productName || "Product"} - Sales Qty: ${
            product.salesQty || 0
          } - Bonus Qty: ${product.bonusQty || 0} - Price: $${
            product.sellingPrice || 0
          }`
        );
      });
    }

    setSelectedMRName(`Credit Sale: ${invoice.invoiceNumber || "Details"}`);
    setSelectedMRProducts(details);
    setShowProductsModal(true);
  };

  const handleParentTabChange = (newTab) => {
    setPreviousActiveTab(activeTab);
    setActiveTab(newTab);

    // Reset sub-tabs and fetch data based on the new tab
    switch (newTab) {
      case "Stock in Hands":
        setActiveStockSubTab("Today");
        fetchStockTableData("Today");
        break;
      case "Sales":
        setActiveSalesSubTab(isCustomDateActive["Total Sales"] ? "Custom" : "Today");
        if (isCustomDateActive["Total Sales"]) {
          fetchSalesTableData("Custom");
        } else {
          fetchSalesTableData("Today");
        }
        break;
      case "Outstanding":
        setActiveOutstandingSubTab(isCustomDateActive["Outstanding"] ? "Custom" : "Today");
        if (isCustomDateActive["Outstanding"]) {
          fetchOutstandingTableData("Custom");
        } else {
          fetchOutstandingTableData("Today");
        }
        break;
      case "Total Payroll":
        setActivePayrollSubTab(isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month");
        if (isCustomDateActive["Total Payroll"]) {
          fetchPayrollTableData("Custom");
        } else {
          fetchPayrollTableData("Prev Month");
        }
        break;
      case "Expenses":
        setActiveExpenseSubTab(isCustomDateActive["Total Expense"] ? "Custom" : "Month");
        if (isCustomDateActive["Total Expense"]) {
          fetchExpenseTableData("Custom");
        } else {
          fetchExpenseTableData("Month");
        }
        break;
      case "Overdue":
        fetchOverdueTableData();
        break;
      case "Credit Sale Cash Not Receive":
        fetchCreditSaleTableData();
        break;
      case "Pending Collection":
        fetchPendingCollectionData();
        break;
      default:
        break;
    }
  };

  // ------------------ EFFECTS ------------------
  // Initial data fetch
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchSalesTableData("Today"),
        fetchOutstandingTableData("Today"),
        fetchExpenseTableData("Month"),
        fetchStockTableData("Today"),
        fetchCreditSaleTableData(),
      ]);

      // Initialize payroll totals with data from useDashboardData hook
      setCurrentPayrollTotal(totalPayroll);
      setCurrentYTDTotal(payrollYTDTotal);
    };

    initializeData();
  }, []); // Empty dependency array - runs only once on mount

  // Effect for active tab changes
  useEffect(() => {
    switch (activeTab) {
      case "Stock in Hands":
        fetchStockTableData(activeStockSubTab);
        break;
      case "Sales":
        fetchSalesTableData(activeSalesSubTab);
        break;
      case "Outstanding":
        fetchOutstandingTableData(activeOutstandingSubTab);
        break;
      case "Expenses":
        fetchExpenseTableData(activeExpenseSubTab);
        break;
      case "Total Payroll":
        fetchPayrollTableData(activePayrollSubTab);
        break;
      case "Overdue":
        fetchOverdueTableData();
        break;
      case "Credit Sale Cash Not Receive":
        fetchCreditSaleTableData();
        break;
      default:
        break;
    }
  }, [
    activeTab,
    activeStockSubTab,
    activeSalesSubTab,
    activeOutstandingSubTab,
    activeExpenseSubTab,
    activePayrollSubTab,
  ]);

  // Update local totals when hook data changes
  useEffect(() => {
    setCurrentPayrollTotal(totalPayroll);
    setCurrentYTDTotal(payrollYTDTotal);
  }, [totalPayroll, payrollYTDTotal]);

  // ------------------ RENDER MAIN TABLE ------------------
  const renderMainTable = () => {
    const getCustomDateRangeText = (cardTitle) => {
      if (!isCustomDateActive[cardTitle] || !customDateRanges[cardTitle]) return null;
      
      const start = new Date(customDateRanges[cardTitle].start);
      const end = new Date(customDateRanges[cardTitle].end);
      
      const formatDate = (date) => {
        return date.toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
        });
      };
      
      return `${formatDate(start)} - ${formatDate(end)}`;
    };

    switch (activeTab) {
      case "Sales":
        return (
          <SalesTable
            salesTableData={salesTableData}
            loadingSalesData={loadingSalesData}
            activeSalesSubTab={activeSalesSubTab}
            dateRanges={dateRanges}
            onViewProducts={handleViewProducts}
            isCustomDateActive={isCustomDateActive["Total Sales"]}
            customDateRange={getCustomDateRangeText("Total Sales")}
          />
        );
      case "Outstanding":
        return (
          <OutstandingTable
            outstandingTableData={outstandingTableData}
            loadingOutstandingData={loadingOutstandingData}
            activeOutstandingSubTab={activeOutstandingSubTab}
            dateRanges={dateRanges}
            onViewInvoices={handleViewInvoices}
            isCustomDateActive={isCustomDateActive["Outstanding"]}
            customDateRange={getCustomDateRangeText("Outstanding")}
          />
        );
      case "Total Payroll":
        return (
          <PayrollTable
            payrollData={payrollTableData}
            loading={loadingPayrollData}
            activePayrollSubTab={activePayrollSubTab}
            prevMonthRanges={prevMonthRanges}
            isCustomDateActive={isCustomDateActive["Total Payroll"]}
            customDateRange={getCustomDateRangeText("Total Payroll")}
          />
        );
      case "Expenses":
        return (
          <ExpenseTable
            expenseTableData={expenseTableData}
            loadingExpenseData={loadingExpenseData}
            activeExpenseSubTab={activeExpenseSubTab}
            dateRanges={dateRanges}
            onViewExpenseDetails={handleViewExpenseDetails}
            isCustomDateActive={isCustomDateActive["Total Expense"]}
            customDateRange={getCustomDateRangeText("Total Expense")}
          />
        );
      case "Stock in Hands":
        return (
          <StockTable
            stockTableData={stockTableData}
            loadingStockData={loadingStockData}
            activeStockSubTab={activeStockSubTab}
            dateRanges={stockDateRanges}
            onViewStockDetails={handleViewStockDetails}
          />
        );
      case "Overdue":
        return (
          <OverdueTable
            overdueData={overdueTableData}
            loading={loadingOverdueData}
            onViewDetails={handleViewInvoiceDetails}
          />
        );
      case "Credit Sale Cash Not Receive":
        return (
          <CreditSaleTable
            creditSaleData={creditSaleTableData}
            loading={loadingCreditSaleData}
            onViewDetails={handleViewCreditSaleDetails}
          />
        );
      default:
        return <div>Table for {activeTab}</div>;
    }
  };

  // =================== CUSTOM DATE FILTER MODAL ===================
  const DateFilterModal = () => {
    if (!showDateFilter || !selectedCardForFilter) return null;

    // Format dates for display
    const formatDateForDisplay = (dateString) => {
      if (!dateString) return "";
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              <Calendar className="inline-block w-5 h-5 mr-2" />
              Custom Date Range for {selectedCardForFilter}
            </h3>
            <button
              onClick={() => setShowDateFilter(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                max={customEndDate || undefined}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min={customStartDate || undefined}
              />
            </div>
  
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                onClick={() => setShowDateFilter(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyDateFilter}
                disabled={!customStartDate || !customEndDate}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md cursor-pointer ${
                  !customStartDate || !customEndDate
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <DashboardHeader
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        searchInputRef={searchInputRef}
        user={user}
      />

      <DashboardCards
        activeTab={activeTab}
        onTabChange={handleParentTabChange}
        salesData={salesData}
        outstandingData={outstandingData}
        stockData={stockData}
        expenseData={expenseData}
        totalPayroll={currentPayrollTotal}
        payrollYTDTotal={currentYTDTotal}
        activeSalesSubTab={activeSalesSubTab}
        activeOutstandingSubTab={activeOutstandingSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeStockSubTab={activeStockSubTab}
        onSalesSubTabChange={handleSalesSubTabChange}
        onExpenseSubTabChange={handleExpenseSubTabChange}
        onPayrollSubTabChange={handlePayrollSubTabChange}
        onOutstandingSubTabChange={handleOutstandingSubTabChange}
        onStockSubTabChange={handleStockSubTabChange}
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
        overdueTableData={overdueTableData}
        creditSaleTableData={creditSaleTableData}
        // Pass date filter handlers to DashboardCards
        onDateFilterClick={handleDateFilterClick}
        onClearDateFilter={handleClearDateFilter}
        isCustomDateActive={isCustomDateActive}
        customDateRanges={customDateRanges}
      />

      <DateFilterModal />

      <SubTabs
        activeTab={activeTab}
        activeSalesSubTab={activeSalesSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeOutstandingSubTab={activeOutstandingSubTab}
        activeStockSubTab={activeStockSubTab}
        onSalesSubTabChange={handleSalesSubTabChange}
        onExpenseSubTabChange={handleExpenseSubTabChange}
        onPayrollSubTabChange={handlePayrollSubTabChange}
        onOutstandingSubTabChange={handleOutstandingSubTabChange}
        onStockSubTabChange={handleStockSubTabChange}
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
        isCustomDateActive={isCustomDateActive}
        customDateRanges={customDateRanges}
        onDateFilterClick={handleDateFilterClick}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SidePanel
          activeTab={activeTab}
          showAllMRsInSidePanel={showAllMRsInSidePanel}
          onPanelIconClick={() => {}}
          sidePanelCurrentPage={sidePanelCurrentPage}
          onSidePanelPageChange={(page) => setSidePanelCurrentPage(page)}
          salesTableData={salesTableData}
          loadingSalesData={loadingSalesData}
          outstandingTableData={outstandingTableData}
          loadingOutstandingData={loadingOutstandingData}
          expenseTableData={expenseTableData}
          loadingExpenseData={loadingExpenseData}
          stockData={stockData}
          expenseData={expenseData}
          mrList={mrList}
          onViewProducts={handleViewProducts}
          onViewInvoices={handleViewInvoices}
          onViewExpenseDetails={handleViewExpenseDetails}
          overdueTableData={overdueTableData}
          loadingOverdueData={loadingOverdueData}
          pendingCollectionData={pendingCollectionData || []}
          loadingPendingCollectionData={loadingPendingCollectionData || false}
          creditSaleTableData={creditSaleTableData || []}
          loadingCreditSaleData={loadingCreditSaleData || false}
        />
        <div className="lg:col-span-2">{renderMainTable()}</div>
      </div>

      <ProductsModal
        showModal={showProductsModal}
        onClose={() => setShowProductsModal(false)}
        selectedMRName={selectedMRName}
        selectedMRProducts={selectedMRProducts}
        activeTab={activeTab}
      />

      <AllMRsSalaryModal
        showModal={showAllMRsModal}
        onClose={() => setShowAllMRsModal(false)}
        previousMonthLabel={previousMonthLabel}
        allMRsWithSalary={allMRsWithSalary}
      />

      <BatchDetailsModal
        showModal={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        productName={selectedProductName}
        batches={selectedBatches}
      />
    </div>
  );
};

export default Dashboard;