import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Search,
  X,
  Download,
  Upload,
  Users,
  UserCheck,
  UserX,
  Building,
  Calendar,
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Package,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import { confirmDialog } from "../utils/confirmationDialog";
import axios from "axios";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { fetchMRList, fetchHRMSalary } from "../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Function to format date as "MMM YYYY" (e.g., "Oct 2025")
const formatMonthYear = (date) => {
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
};

// Get current date ranges
const getDateRanges = () => {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Today
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  // Current Month (1st to today)
  const monthStart = new Date(currentYear, currentMonth, 1);
  const monthEnd = new Date(today);
  monthEnd.setHours(23, 59, 59, 999);

  // Current Year (Jan 1st to today)
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(today);
  yearEnd.setHours(23, 59, 59, 999);

  // Format labels - get actual values instead of generic names
  const todayLabel = today.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
  });
  const monthLabel = today.toLocaleString("en-US", {
    month: "short",
  });
  const yearLabel = today.getFullYear().toString();

  const yearRangeLabel = `1 Jan - ${today.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
  })}`;

  return {
    today: { start: todayStart, end: todayEnd, label: "Today" },
    month: { start: monthStart, end: monthEnd, label: monthLabel },
    year: { start: yearStart, end: yearEnd, label: yearLabel, rangeLabel: yearRangeLabel },
  };
};

// Get previous month date ranges for Payroll
const getPreviousMonthRanges = () => {
  const today = new Date();
  const previousMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthYear = previousMonth.getFullYear();
  const previousMonthNumber = previousMonth.getMonth();

  // Previous Month (full month)
  const prevMonthStart = new Date(previousMonthYear, previousMonthNumber, 1);
  const prevMonthEnd = new Date(previousMonthYear, previousMonthNumber + 1, 0);
  prevMonthEnd.setHours(23, 59, 59, 999);

  // Previous Month Year to Date (Jan 1st to end of previous month)
  const prevMonthYearStart = new Date(previousMonthYear, 0, 1);
  const prevMonthYearEnd = new Date(
    previousMonthYear,
    previousMonthNumber + 1,
    0
  );
  prevMonthYearEnd.setHours(23, 59, 59, 999);

  // Format labels
  const prevMonthLabel = previousMonth.toLocaleString("en-US", {
    month: "short",
  });
  const prevMonthYearLabel = previousMonthYear.toString();

  return {
    prevMonth: {
      start: prevMonthStart,
      end: prevMonthEnd,
      label: prevMonthLabel,
    },
    prevMonthYear: {
      start: prevMonthYearStart,
      end: prevMonthYearEnd,
      label: prevMonthYearLabel,
    },
  };
};

const fetchCustomRangeSales = async (startDate, endDate) => {
  try {
    const response = await axios.get(
      `${backendUrl}/api/sales/analytics/custom-range`,
      {
        params: {
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
        },
      }
    );
    return response.data.totalSales;
  } catch (error) {
    console.error("Error fetching custom range sales:", error);
    return 0;
  }
};

// NEW: Function to fetch previous period sales for comparison
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
        previousEnd = new Date(currentEnd);
        previousEnd.setMonth(previousEnd.getMonth() - 1);
        // Adjust for months with different number of days
        const lastDayOfPrevMonth = new Date(previousEnd.getFullYear(), previousEnd.getMonth() + 1, 0).getDate();
        previousEnd.setDate(Math.min(previousEnd.getDate(), lastDayOfPrevMonth));
        break;
      case "Year":
        previousStart = new Date(currentStart);
        previousStart.setFullYear(previousStart.getFullYear() - 1);
        previousEnd = new Date(currentEnd);
        previousEnd.setFullYear(previousEnd.getFullYear() - 1);
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

// NEW: Function to calculate growth percentage
const calculateGrowth = (current, previous) => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return ((current - previous) / previous) * 100;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef(null);

  // MR List State
  const [mrList, setMrList] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const staffPerPage = 5;
  const [activeTab, setActiveTab] = useState("Sales");

  // Separate sub-tab states for Sales, Expense, and Payroll
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");

  // NEW: State for dynamic sales data
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);

  // Payroll State
  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [payrollYTDTotal, setPayrollYTDTotal] = useState(0);

  // New State for Sales, Outstanding, Stock, Expense
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

  const [outstandingData, setOutstandingData] = useState({
    totalOutstanding: 0,
    mrWiseOutstanding: [],
  });

  const [stockData, setStockData] = useState({
    totalStock: 0,
    stockValue: 0,
    lowStockItems: [],
  });

  // New Expense State
  const [expenseData, setExpenseData] = useState({
    totalExpense: 0,
    monthlyExpense: 0,
    todayExpense: 0,
    yearExpense: 0,
    latestExpenses: [],
  });

  // User State
  const [user, setUser] = useState({
    name: "",
    role: "",
    initials: "",
  });

  // Form State
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    enabled: "",
    _id: null,
  });

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // NEW: State for highest salary MRs and all MRs modal
  const [highestSalaryMRs, setHighestSalaryMRs] = useState([]);
  const [showAllMRsModal, setShowAllMRsModal] = useState(false);
  const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);

  // NEW: State for products modal
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);
  const [selectedMRName, setSelectedMRName] = useState("");

  // NEW: State for side panel toggle
  const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
  const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);
  const sidePanelPerPage = 10;

  // Get date ranges for labels - UPDATED to include year range
  const dateRanges = useMemo(() => getDateRanges(), []);
  const prevMonthRanges = useMemo(() => getPreviousMonthRanges(), []);

  // NEW: Function to get sales table title with actual values
  const getSalesTableTitle = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return `Sales Details - ${dateRanges.today.label}`;
      case "Month":
        return `Sales Details - ${dateRanges.month.label}`;
      case "Year":
        return `Sales Details - ${dateRanges.year.rangeLabel}`;
      default:
        return `Sales Details - ${activeSalesSubTab}`;
    }
  };

  // NEW: Function to fetch dynamic sales table data
  const fetchSalesTableData = async (period) => {
    try {
      setLoadingSalesData(true);
      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params: { period },
      });
      if (response.data.success) {
        setSalesTableData(response.data.data);
      } else {
        console.error(
          "Error fetching sales table data:",
          response.data.message
        );
        setSalesTableData([]);
      }
    } catch (error) {
      console.error("Error fetching sales table data:", error);
      setSalesTableData([]);
    } finally {
      setLoadingSalesData(false);
    }
  };

  // NEW: Function to fetch highest salary MRs
  const fetchHighestSalaryMRs = async () => {
    try {
      const sortedBySalary = [...payrollData]
        .sort((a, b) => (b.netSalary || 0) - (a.netSalary || 0))
        .slice(0, 5);
      setHighestSalaryMRs(sortedBySalary);
    } catch (error) {
      console.error("Error fetching highest salary MRs:", error);
      setHighestSalaryMRs([]);
    }
  };

  // NEW: Function to fetch all MRs with salary data
  const fetchAllMRsWithSalary = async () => {
    try {
      const allMRs = [...payrollData].sort(
        (a, b) => (b.netSalary || 0) - (a.netSalary || 0)
      );
      setAllMRsWithSalary(allMRs);
    } catch (error) {
      console.error("Error fetching all MRs with salary:", error);
      setAllMRsWithSalary([]);
    }
  };

  // UPDATED: Function to handle panel icon click
  const handlePanelIconClick = () => {
    if (activeTab === "Sales") {
      setShowAllMRsInSidePanel((prev) => !prev);
      setSidePanelCurrentPage(1);
    } else if (activeTab === "Total Payroll") {
      fetchAllMRsWithSalary();
      setShowAllMRsModal(true);
    }
  };

  // NEW: Function to handle view products
  const handleViewProducts = (mrName, products) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(products);
    setShowProductsModal(true);
  };

  // UPDATED: Function to fetch sales data with growth calculations
  const fetchSalesBySubTab = async (subTab) => {
    try {
      let salesAmount = 0;
      let previousSales = 0;

      switch (subTab) {
        case "Today":
          salesAmount = await fetchCustomRangeSales(
            dateRanges.today.start,
            dateRanges.today.end
          );
          previousSales = await fetchPreviousPeriodSales(
            "Today",
            dateRanges.today.start,
            dateRanges.today.end
          );
          break;
        case "Month":
          salesAmount = await fetchCustomRangeSales(
            dateRanges.month.start,
            dateRanges.month.end
          );
          previousSales = await fetchPreviousPeriodSales(
            "Month",
            dateRanges.month.start,
            dateRanges.month.end
          );
          break;
        case "Year":
          salesAmount = await fetchCustomRangeSales(
            dateRanges.year.start,
            dateRanges.year.end
          );
          previousSales = await fetchPreviousPeriodSales(
            "Year",
            dateRanges.year.start,
            dateRanges.year.end
          );
          break;
        default:
          salesAmount = await fetchCustomRangeSales(
            dateRanges.today.start,
            dateRanges.today.end
          );
      }

      const growth = calculateGrowth(salesAmount, previousSales);

      return { salesAmount, previousSales, growth };
    } catch (error) {
      console.error("Error fetching sales by sub-tab:", error);
      return { salesAmount: 0, previousSales: 0, growth: 0 };
    }
  };

  // UPDATED: Fetch Sales Data with growth calculations
  const fetchSalesData = async () => {
    try {
      const todayData = await fetchSalesBySubTab("Today");
      const monthlyData = await fetchSalesBySubTab("Month");
      const yearData = await fetchSalesBySubTab("Year");

      setSalesData({
        todaySales: todayData.salesAmount,
        todayPrevious: todayData.previousSales,
        todayGrowth: todayData.growth,
        monthlySales: monthlyData.salesAmount,
        monthlyPrevious: monthlyData.previousSales,
        monthlyGrowth: monthlyData.growth,
        yearSales: yearData.salesAmount,
        yearPrevious: yearData.previousSales,
        yearGrowth: yearData.growth,
        totalSales: yearData.salesAmount,
      });
    } catch (error) {
      setSalesData({
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
    }
  };

  // NEW: Effect to update sales data when sales sub-tab changes
  useEffect(() => {
    if (activeTab === "Sales") {
      const updateSalesData = async () => {
        const data = await fetchSalesBySubTab(activeSalesSubTab);

        setSalesData((prev) => ({
          ...prev,
          ...(activeSalesSubTab === "Today" && { 
            todaySales: data.salesAmount,
            todayPrevious: data.previousSales,
            todayGrowth: data.growth
          }),
          ...(activeSalesSubTab === "Month" && {
            monthlySales: data.salesAmount,
            monthlyPrevious: data.previousSales,
            monthlyGrowth: data.growth
          }),
          ...(activeSalesSubTab === "Year" && {
            yearSales: data.salesAmount,
            yearPrevious: data.previousSales,
            yearGrowth: data.growth
          }),
        }));
      };

      updateSalesData();
    }
  }, [activeSalesSubTab, activeTab]);

  // NEW: Effect to fetch sales data when sales sub-tab changes
  useEffect(() => {
    if (activeTab === "Sales") {
      fetchSalesTableData(activeSalesSubTab);
    }
  }, [activeSalesSubTab, activeTab]);

  // NEW: Get current growth based on active sales sub-tab
  const getCurrentGrowth = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return salesData.todayGrowth;
      case "Month":
        return salesData.monthlyGrowth;
      case "Year":
        return salesData.yearGrowth;
      default:
        return salesData.todayGrowth;
    }
  };

  // Export function
  const handleExport = async () => {
    try {
      // Your existing export logic
    } catch (error) {
      console.error("Export error:", error);
      showToast(
        "error",
        error.message || "Failed to export data. Please try again."
      );
    }
  };

  // Fetch payroll data function
  const fetchPayrollData = async () => {
    try {
      // Your existing payroll logic
    } catch (error) {
      console.error("Error fetching payroll data:", error);
      setPayrollData([]);
      setTotalPayroll(0);
      setPayrollYTDTotal(0);
      setHighestSalaryMRs([]);
      showToast("error", "Failed to fetch payroll data");
    }
  };

  // Fetch Outstanding Data
  const fetchOutstandingData = async () => {
    try {
      // Your existing outstanding logic
    } catch (error) {
      console.error("Error fetching outstanding data:", error);
      // Mock data as fallback
    }
  };

  // Fetch Stock Data
  const fetchStockData = async () => {
    try {
      // Your existing stock logic
    } catch (error) {
      console.error("Error fetching stock data:", error);
      // Mock data as fallback
    }
  };

  // Fetch Expense Data
  const fetchExpenseData = async () => {
    try {
      // Your existing expense logic
    } catch (error) {
      console.error("Error fetching expense data:", error);
      // Mock data as fallback
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await fetchUserData();
        const mrData = await fetchMRList();
        setMrList(mrData.data);

        const currentDate = new Date();
        const previousMonthDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
        );
        const formattedPreviousMonth = formatMonthYear(previousMonthDate);
        setPreviousMonthLabel(formattedPreviousMonth);

        await fetchPayrollData();
        await fetchSalesData();
        await fetchOutstandingData();
        await fetchStockData();
        await fetchExpenseData();
        await fetchTeams();
      } catch (err) {
        showToast("error", err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Function to fetch user data
  const fetchUserData = async () => {
    try {
      // Your existing user data logic
    } catch (err) {
      console.error("Error fetching user data:", err);
      setUser({
        name: "User",
        role: "User",
        initials: "U",
      });
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (err) {
      console.error("Error loading teams:", err);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Calculate dashboard stats
  const dashboardStats = useMemo(() => {
    const totalMRs = mrList.length;
    const enabledMRs = mrList.filter((mr) => mr.enabled).length;
    const disabledMRs = mrList.filter((mr) => !mr.enabled).length;
    const totalTeams = [
      ...new Set(mrList.map((mr) => mr.teamName).filter(Boolean)),
    ].length;

    return {
      totalMRs,
      enabledMRs,
      disabledMRs,
      totalTeams,
      totalSales: salesData.totalSales,
      monthlySales: salesData.monthlySales,
      todaySales: salesData.todaySales,
      yearSales: salesData.yearSales,
      todayGrowth: salesData.todayGrowth,
      monthlyGrowth: salesData.monthlyGrowth,
      yearGrowth: salesData.yearGrowth,
      totalOutstanding: outstandingData.totalOutstanding,
      totalStock: stockData.totalStock,
      stockValue: stockData.stockValue,
      lowStockItems: stockData.lowStockItems?.length || 0,
      totalExpense: expenseData.totalExpense,
      monthlyExpense: expenseData.monthlyExpense,
      todayExpense: expenseData.todayExpense,
      yearExpense: expenseData.yearExpense,
    };
  }, [mrList, payrollData, salesData, outstandingData, stockData, expenseData]);

  // Filter MR data based on active tab
  const filteredMR = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    let filteredData = mrList;

    if (activeTab === "Active MRs") {
      filteredData = filteredData.filter((mr) => mr.enabled === true);
    } else if (activeTab === "Inactive MRs") {
      filteredData = filteredData.filter((mr) => mr.enabled === false);
    }

    return filteredData.filter((mr) => {
      const repMatch = mr.medicalRepName?.toLowerCase().includes(lowerSearch);
      const teamMatch = mr.teamName?.toLowerCase().includes(lowerSearch);
      const contactMatch = mr.contactNo?.toLowerCase().includes(lowerSearch);
      const emailMatch = mr.email?.toLowerCase().includes(lowerSearch);

      return repMatch || teamMatch || contactMatch || emailMatch;
    });
  }, [mrList, activeTab, searchTerm]);

  const teamSuggestions = useMemo(() => {
    if (!form.teamName) return [];
    return allTeams.filter((team) =>
      team.toLowerCase().includes(form.teamName.toLowerCase())
    );
  }, [form.teamName, allTeams]);

  const totalPages = useMemo(
    () => Math.ceil(filteredMR.length / staffPerPage),
    [filteredMR.length, staffPerPage]
  );

  const currentMR = useMemo(() => {
    const startIndex = (currentPage - 1) * staffPerPage;
    return filteredMR.slice(startIndex, startIndex + staffPerPage);
  }, [filteredMR, currentPage, staffPerPage]);

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) return [...Array(totalPages).keys()].map((i) => i + 1);

    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2)
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];

    return [1, "...", currentPage, "...", totalPages];
  }, [currentPage, totalPages]);

  // Format currency function
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Get current sales amount based on sales sub-tab
  const getCurrentSalesAmount = () => {
    switch (activeSalesSubTab) {
      case "Today":
        return salesData.todaySales;
      case "Month":
        return salesData.monthlySales;
      case "Year":
        return salesData.yearSales;
      default:
        return salesData.todaySales;
    }
  };

  // Get current expense amount based on expense sub-tab
  const getCurrentExpenseAmount = () => {
    switch (activeExpenseSubTab) {
      case "Month":
        return dashboardStats.monthlyExpense;
      case "Year":
        return dashboardStats.yearExpense;
      default:
        return dashboardStats.monthlyExpense;
    }
  };

  // Get current payroll amount based on payroll sub-tab
  const getCurrentPayrollAmount = () => {
    switch (activePayrollSubTab) {
      case "Prev Month":
        return totalPayroll;
      case "YTD":
        return payrollYTDTotal;
      default:
        return totalPayroll;
    }
  };

  // MR Functions (keep existing MR functions as they are)
  const toggleMRSelect = useCallback((mr) => {
    setSelected((prev) =>
      prev.some((c) => c.id === mr._id)
        ? prev.filter((c) => c.id !== mr._id)
        : [...prev, { id: mr._id, name: mr.medicalRepName }]
    );
  }, []);

  const toggleMRSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentMR.map((mr) => ({
              id: mr._id,
              name: mr.medicalRepName,
              team: mr.teamName,
            }))
          : []
      );
    },
    [currentMR]
  );

  const handleMRView = useCallback((mr) => {
    setForm(mr);
    setIsViewModalOpen(true);
  }, []);

  const handleMREdit = useCallback((mr) => {
    setForm(mr);
    setIsEditModalOpen(true);
  }, []);

  const refreshMRList = async () => {
    try {
      const mrData = await fetchMRList();
      setMrList(mrData.data);
      setSelected([]);
    } catch (err) {
      console.error("Error refreshing MR list:", err);
    }
  };

  const handleMRDelete = async ({
    mrIds = [],
    mrName = "",
    isBulk = false,
  }) => {
    // Your existing delete logic
  };

  const deleteSelectedMR = async () => {
    const mrIds = selected.map((s) => s.id);
    await handleMRDelete({ mrIds, isBulk: true });
  };

  const deleteMR = async (mr) => {
    if (!mr?._id) return;
    await handleMRDelete({
      mrIds: [mr._id],
      mrName: mr.medicalRepName,
      isBulk: false,
    });
  };

  // Status toggle function
  const handleStatusToggle = async (mr) => {
    try {
      const res = await axios.put(`${backendUrl}/api/staff/${mr._id}`, {
        enabled: !mr.enabled,
      });

      if (res.status === 200) {
        setMrList((prev) =>
          prev.map((item) =>
            item._id === mr._id ? { ...item, enabled: !item.enabled } : item
          )
        );
        showToast(
          "success",
          `MR <b>${mr.medicalRepName}</b> ${
            !mr.enabled ? "enabled" : "disabled"
          } successfully`
        );
      }
    } catch (err) {
      showToast("error", "Failed to update MR status.");
    }
  };

  // File upload and other existing functions...
  const handleFileUpload = (e) => {
    // Your existing file upload logic
  };

  const handleImport = async () => {
    // Your existing import logic
  };

  const updateMR = async (e) => {
    // Your existing update logic
  };

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [teamSuggestions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "teamName") {
      setShowSuggestions(true);
    }
  };

  const handleKeyDown = (e) => {
    // Your existing keydown logic
  };

  const handleSelect = (team) => {
    setForm((prev) => ({ ...prev, teamName: team }));
    setShowSuggestions(false);
  };

  // Search icon click handler
  const handleSearchIconClick = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.classList.add("highlight");
    setTimeout(
      () => searchInputRef.current?.classList.remove("highlight"),
      1000
    );
  };

  // NEW: Products Modal Component
  const ProductsModal = () => {
    if (!showProductsModal) return null;

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] overflow-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">
                All Products Sold by {selectedMRName}
              </h3>
              <button
                onClick={() => setShowProductsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          <div className="p-6">
            <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-2xl text-center">
              <thead className="bg-gray-100 text-gray-700 border-b">
                <tr>
                  <th className="p-3 text-sm font-medium">Date</th>
                  <th className="p-3 text-sm font-medium">Product Name</th>
                  <th className="p-3 text-sm font-medium">Quantity</th>
                  <th className="p-3 text-sm font-medium">Selling Price ($)</th>
                  <th className="p-3 text-sm font-medium">Amount ($)</th>
                  <th className="p-3 text-sm font-medium">Customer</th>
                  <th className="p-3 text-sm font-medium">Bonus Qty</th>
                  <th className="p-3 text-sm font-medium">Total Qty</th>
                </tr>
              </thead>

              <tbody>
                {selectedMRProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-gray-500">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  selectedMRProducts.map((product, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${
                        index < selectedMRProducts.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <td className="p-3 text-sm text-gray-700">
                        {formatDateToReadable(product.date)}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        {product.productName}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        {product.quantity}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        ${formatCurrency(product.sellingPrice)}
                      </td>

                      <td className="p-3 text-sm text-green-600 font-medium">
                        ${formatCurrency(product.amount)}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        {product.customer}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        {product.bonusQty || 0}
                      </td>

                      <td className="p-3 text-sm text-gray-700">
                        {product.totalQty || product.quantity}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {selectedMRProducts.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No products found
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // NEW: All MRs Salary Modal Component
  const AllMRsSalaryModal = () => {
    if (!showAllMRsModal) return null;

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-auto">
          <div className="p-6 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-gray-800">
                All MRs Salary - {previousMonthLabel}
              </h3>
              <button
                onClick={() => setShowAllMRsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          <div className="p-6">
            <table className="w-full border-collapse text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    MR Name
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Team
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Contact No
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Basic Salary ($)
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Allowances ($)
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Deductions ($)
                  </th>
                  <th className="p-3 text-sm font-semibold text-gray-700">
                    Net Salary ($)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allMRsWithSalary.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm text-gray-600 capitalize">
                      {item.employeeId?.medicalRepName}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.employeeId?.teamName}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.employeeId?.contactNo}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.employeeId?.email}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.basicSalary || 0}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.totalAllowance || 0}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {item.deductions || 0}
                    </td>
                    <td className="p-3 text-sm text-gray-600 font-semibold">
                      ${formatCurrency(item.netSalary || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allMRsWithSalary.length === 0 && (
              <p className="text-center text-gray-500 py-4">
                No payroll data found
              </p>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  // UPDATED Dashboard Cards Component
  const DashboardCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
      {/* Sales Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Sales" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Sales")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Sales</p>
            <p className="text-2xl font-bold text-blue-600 mt-2">
              ${formatCurrency(getCurrentSalesAmount())}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {activeSalesSubTab} •{" "}
              <span className={getCurrentGrowth() >= 0 ? "text-green-600" : "text-red-600"}>
                {getCurrentGrowth() >= 0 ? "↗" : "↘"} {getCurrentGrowth().toFixed(1)}%
              </span>
            </p>
          </div>
          <div className="p-3 bg-blue-100 rounded-full">
            <ShoppingCart className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Outstanding Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Outstanding" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Outstanding")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Outstanding</p>
            <p className="text-2xl font-bold text-orange-600 mt-2">
              ${formatCurrency(dashboardStats.totalOutstanding)}
            </p>
            <p className="text-xs text-gray-500 mt-1">MR-wise outstanding</p>
          </div>
          <div className="p-3 bg-orange-100 rounded-full">
            <TrendingUp className="w-6 h-6 text-orange-600" />
          </div>
        </div>
      </div>

      {/* Stock in Hands Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Stock in Hands" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Stock in Hands")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Stock in Hands</p>
            <p className="text-2xl font-bold text-green-600 mt-2">
              {dashboardStats.totalStock}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <span className="text-red-600">
                {dashboardStats.lowStockItems} low stock
              </span>
            </p>
          </div>
          <div className="p-3 bg-green-100 rounded-full">
            <Package className="w-6 h-6 text-green-600" />
          </div>
        </div>
      </div>

      {/* Total Expense Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Expense" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Expense")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Expense</p>
            <p className="text-2xl font-bold text-red-600 mt-2">
              ${formatCurrency(getCurrentExpenseAmount())}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {activeExpenseSubTab === "Month"
                ? dateRanges.month.label
                : dateRanges.year.rangeLabel}
            </p>
          </div>
          <div className="p-3 bg-red-100 rounded-full">
            <Receipt className="w-6 h-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Total Payroll Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Total Payroll" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Total Payroll")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Payroll</p>
            <p className="text-2xl font-bold text-purple-600 mt-2">
              ${formatCurrency(getCurrentPayrollAmount())}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {activePayrollSubTab === "Prev Month"
                ? prevMonthRanges.prevMonth.label
                : prevMonthRanges.prevMonthYear.label}
            </p>
          </div>
          <div className="p-3 bg-purple-100 rounded-full">
            <DollarSign className="w-6 h-6 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  );

  const SidePanel = () => {
    // UPDATED: Recent Sales component for Sales tab with toggle functionality
    const RecentSales = () => {
      // Group sales by MR to show MR-wise highest sales
      const mrWiseSales = useMemo(() => {
        const mrSales = {};

        salesTableData.forEach((sale) => {
          if (!mrSales[sale.salesPerson]) {
            mrSales[sale.salesPerson] = {
              mrName: sale.salesPerson,
              totalAmount: 0,
              productCount: 0,
              products: [],
            };
          }
          mrSales[sale.salesPerson].totalAmount += sale.amount;
          mrSales[sale.salesPerson].productCount += 1;
          mrSales[sale.salesPerson].products.push(sale);
        });

        // Sort by total amount
        return Object.values(mrSales).sort(
          (a, b) => b.totalAmount - a.totalAmount
        );
      }, [salesTableData]);

      // Calculate pagination for side panel
      const totalSidePanelPages = Math.ceil(
        mrWiseSales.length / sidePanelPerPage
      );
      const currentSidePanelMRs = showAllMRsInSidePanel
        ? mrWiseSales.slice(
            (sidePanelCurrentPage - 1) * sidePanelPerPage,
            sidePanelCurrentPage * sidePanelPerPage
          )
        : mrWiseSales.slice(0, 5);

      const handleSidePanelPageChange = (newPage) => {
        setSidePanelCurrentPage(newPage);
      };

      return (
        <div className="space-y-3">
          {currentSidePanelMRs.length > 0 ? (
            currentSidePanelMRs.map((mrSale, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-sm font-semibold">
                    {showAllMRsInSidePanel
                      ? (sidePanelCurrentPage - 1) * sidePanelPerPage +
                        index +
                        1
                      : index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {mrSale.mrName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mrSale.productCount} product
                      {mrSale.productCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <p className="text-sm font-semibold text-green-600">
                    ${formatCurrency(mrSale.totalAmount)}
                  </p>
                  <button
                    onClick={() =>
                      handleViewProducts(mrSale.mrName, mrSale.products)
                    }
                    className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer p-1"
                    title="View Products"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-shopping-cart"
                    >
                      <circle cx="8" cy="21" r="1"></circle>
                      <circle cx="19" cy="21" r="1"></circle>
                      <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                    </svg>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">
              {loadingSalesData ? "Loading..." : "No sales data found"}
            </p>
          )}

          {/* Pagination for side panel when showing all MRs */}
          {showAllMRsInSidePanel && totalSidePanelPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() =>
                  handleSidePanelPageChange(sidePanelCurrentPage - 1)
                }
                disabled={sidePanelCurrentPage === 1}
                className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50 cursor-pointer"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {sidePanelCurrentPage} of {totalSidePanelPages}
              </span>
              <button
                onClick={() =>
                  handleSidePanelPageChange(sidePanelCurrentPage + 1)
                }
                disabled={sidePanelCurrentPage === totalSidePanelPages}
                className="px-3 py-1 text-sm bg-gray-200 rounded disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      );
    };

    // Recent Outstanding for Outstanding tab
    const RecentOutstanding = () => (
      <div className="space-y-3">
        {outstandingData.mrWiseOutstanding.slice(0, 5).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-semibold">
                {item.mrName.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800 capitalize">
                  {item.mrName}
                </p>
                <p className="text-xs text-gray-500">{item.date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-orange-700">
                ${formatCurrency(item.amount)}
              </p>
              <p className="text-xs text-gray-500">Outstanding</p>
            </div>
          </div>
        ))}
      </div>
    );

    // Low Stock for Stock in Hands tab
    const LowStock = () => (
      <div className="space-y-3">
        {stockData.lowStockItems.slice(0, 5).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                <AlertTriangle size={14} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {item.product}
                </p>
                <p className="text-xs text-gray-500">{item.category}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                {item.currentStock}
              </p>
              <p className="text-xs text-gray-500">Min: {item.minLevel}</p>
            </div>
          </div>
        ))}
      </div>
    );

    // Recent Expenses for Expense tab
    const RecentExpenses = () => (
      <div className="space-y-3">
        {expenseData.latestExpenses.slice(0, 5).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                {item.category.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {item.category}
                </p>
                <p className="text-xs text-gray-500">{item.description}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-red-700">
                ${formatCurrency(item.amount)}
              </p>
              <p className="text-xs text-gray-500">{item.date}</p>
            </div>
          </div>
        ))}
      </div>
    );

    // Highest Salary MRs for Payroll tab
    const HighestSalaryMRs = () => (
      <div className="space-y-3">
        {highestSalaryMRs.length > 0 ? (
          highestSalaryMRs.map((item, index) => (
            <div
              key={item._id}
              className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-semibold">
                  {item.employeeId?.medicalRepName
                    ?.substring(0, 2)
                    .toUpperCase() || "MR"}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 capitalize">
                    {item.employeeId?.medicalRepName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.employeeId?.teamName}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-purple-700">
                  ${formatCurrency(item.netSalary || 0)}
                </p>
                <p className="text-xs text-gray-500">Net Salary</p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-center py-4">No payroll data</p>
        )}
      </div>
    );

    // Recent Joins component (for default tab)
    const RecentJoins = () => {
      const recentMRs = useMemo(() => {
        return mrList
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 5);
      }, [mrList]);

      return (
        <div className="space-y-3">
          {recentMRs.length > 0 ? (
            recentMRs.map((mr, index) => (
              <div
                key={mr._id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                    {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {mr.medicalRepName}
                    </p>
                    <p className="text-xs text-gray-500">{mr.teamName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {formatDateToReadable(mr.date)}
                  </p>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs ${
                      mr.enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {mr.enabled ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">No recent activity</p>
          )}
        </div>
      );
    };

    const getPanelTitle = () => {
      switch (activeTab) {
        case "Sales":
          return showAllMRsInSidePanel
            ? "All MRs Sales"
            : "Highest Sales by MR";
        case "Outstanding":
          return "Recent Outstanding";
        case "Stock in Hands":
          return "Low Stock Items";
        case "Expense":
          return "Latest Expenses";
        case "Total Payroll":
          return "Highest Salaries";
        default:
          return "Recent Activity";
      }
    };

    const getPanelIcon = () => {
      switch (activeTab) {
        case "Sales":
          return Users;
        case "Outstanding":
          return TrendingUp;
        case "Stock in Hands":
          return AlertTriangle;
        case "Expense":
          return Receipt;
        case "Total Payroll":
          return DollarSign;
        default:
          return Calendar;
      }
    };

    const renderPanelContent = () => {
      switch (activeTab) {
        case "Sales":
          return <RecentSales />;
        case "Outstanding":
          return <RecentOutstanding />;
        case "Stock in Hands":
          return <LowStock />;
        case "Expense":
          return <RecentExpenses />;
        case "Total Payroll":
          return <HighestSalaryMRs />;
        default:
          return <RecentJoins />;
      }
    };

    const PanelIcon = getPanelIcon();

    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">
            {getPanelTitle()}
          </h3>
          <button
            onClick={handlePanelIconClick}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            title={
              activeTab === "Sales"
                ? showAllMRsInSidePanel
                  ? "Show Top 5"
                  : "Show All MRs"
                : "View Details"
            }
          >
            {activeTab === "Sales" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lucide lucide-users"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                <path d="M16 3.128a4 4 0 0 1 0 7.744"></path>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                <circle cx="9" cy="7" r="4"></circle>
              </svg>
            ) : (
              <PanelIcon className="w-5 h-5" />
            )}
          </button>
        </div>
        {renderPanelContent()}
      </div>
    );
  };

  // Sub Tabs Component for Sales, Expense, and Payroll
  const SubTabs = () => {
    if (
      activeTab !== "Sales" &&
      activeTab !== "Expense" &&
      activeTab !== "Total Payroll"
    )
      return null;

    // Define tabs based on active main tab
    let tabs = [];

    if (activeTab === "Sales") {
      tabs = [
        { key: "Today", label: dateRanges.today.label },
        { key: "Month", label: dateRanges.month.label },
        { key: "Year", label: dateRanges.year.rangeLabel },
      ];
    } else if (activeTab === "Expense") {
      tabs = [
        { key: "Month", label: dateRanges.month.label },
        { key: "Year", label: dateRanges.year.rangeLabel },
      ];
    } else if (activeTab === "Total Payroll") {
      tabs = [
        { key: "Prev Month", label: prevMonthRanges.prevMonth.label },
        { key: "YTD", label: prevMonthRanges.prevMonthYear.label },
      ];
    }

    // Use the appropriate state based on active tab
    let currentSubTab, setCurrentSubTab;

    if (activeTab === "Sales") {
      currentSubTab = activeSalesSubTab;
      setCurrentSubTab = setActiveSalesSubTab;
    } else if (activeTab === "Expense") {
      currentSubTab = activeExpenseSubTab;
      setCurrentSubTab = setActiveExpenseSubTab;
    } else if (activeTab === "Total Payroll") {
      currentSubTab = activePayrollSubTab;
      setCurrentSubTab = setActivePayrollSubTab;
    }

    return (
      <div className="flex space-x-1 mb-6 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCurrentSubTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              currentSubTab === tab.key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  };

  // UPDATED: Sales Table Component with Customer column
  const SalesTable = () => {
    // Group sales data by MR
    const groupedSalesData = useMemo(() => {
      const mrGroups = {};

      salesTableData.forEach((sale) => {
        if (!mrGroups[sale.salesPerson]) {
          mrGroups[sale.salesPerson] = {
            mrName: sale.salesPerson,
            totalAmount: 0,
            products: [],
            productCount: 0,
            customers: new Set(),
          };
        }
        mrGroups[sale.salesPerson].totalAmount += sale.amount;
        mrGroups[sale.salesPerson].products.push(sale);
        mrGroups[sale.salesPerson].productCount += 1;
        if (sale.customer && sale.customer !== "N/A") {
          mrGroups[sale.salesPerson].customers.add(sale.customer);
        }
      });

      // Convert Set to Array and count
      Object.values(mrGroups).forEach((mr) => {
        mr.customerCount = mr.customers.size;
        mr.customers = Array.from(mr.customers);
      });

      return Object.values(mrGroups);
    }, [salesTableData]);

    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-800">
                {getSalesTableTitle()}
              </h3>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <Download size={18} /> Export Sales
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  MR Name
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Products
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Customer
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Total Amount ($)
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingSalesData ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      <span className="ml-2">Loading sales data...</span>
                    </div>
                  </td>
                </tr>
              ) : groupedSalesData.length > 0 ? (
                groupedSalesData.map((mrSale, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-4 text-sm text-gray-600 capitalize">
                      {mrSale.mrName}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {mrSale.productCount === 1 ? (
                        mrSale.products[0].productName
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <span>{mrSale.productCount} Products</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {mrSale.customerCount === 1 ? (
                        mrSale.customers[0]
                      ) : (
                        <span>{mrSale.customerCount} customers</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-green-600 font-semibold">
                      ${formatCurrency(mrSale.totalAmount)}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() =>
                          handleViewProducts(mrSale.mrName, mrSale.products)
                        }
                        className="text-gray-400 hover:text-blue-600 transition-colors cursor-pointer p-2"
                        title="View All Products"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-shopping-cart"
                        >
                          <circle cx="8" cy="21" r="1"></circle>
                          <circle cx="19" cy="21" r="1"></circle>
                          <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No sales data found for {activeSalesSubTab}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Expense Table Component
  const ExpenseTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      {/* Your existing expense table */}
    </div>
  );

  // Payroll Table Component
  const PayrollTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      {/* Your existing payroll table */}
    </div>
  );

  // Outstanding Table Component
  const OutstandingTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      {/* Your existing outstanding table */}
    </div>
  );

  // Stock Table Component
  const StockTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      {/* Your existing stock table */}
    </div>
  );

  const DataTable = ({
    data,
    columns,
    onEdit,
    onDelete,
    onAdd,
    onExport,
    selectable = false,
    showButtons = false,
    buttonMode = "all",
  }) => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      {/* Your existing data table */}
    </div>
  );

  const MRManagement = () => {
    const columns = [
      // Your existing columns
    ];

    // Determine which table to show based on active tab
    const renderTable = () => {
      switch (activeTab) {
        case "Sales":
          return <SalesTable />;
        case "Outstanding":
          return <OutstandingTable />;
        case "Stock in Hands":
          return <StockTable />;
        case "Expense":
          return <ExpenseTable />;
        case "Total Payroll":
          return <PayrollTable />;
        default:
          return (
            <DataTable
              data={currentMR}
              columns={columns}
              onEdit={handleMREdit}
              onDelete={deleteMR}
              onAdd={() => navigate("/hrmlayout/dashboard/new")}
              onExport={handleExport}
              selectable={true}
              showButtons={true}
              buttonMode="all"
            />
          );
      }
    };

    return (
      <div className="space-y-6">
        {/* Dashboard Cards */}
        <DashboardCards />

        {/* Sub Tabs for Sales, Expense and Payroll */}
        <SubTabs />

        {/* Recent Activity and Stats Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Side Panel - Dynamic based on active tab */}
          <div className="lg:col-span-1">
            <SidePanel />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {renderTable()}

            {/* Pagination - Only show for MR tables */}
            {activeTab === "MR Management" && filteredMR.length > 0 && (
              <div className="mt-4 p-5 flex justify-start gap-2">
                {/* Your existing pagination */}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center bg-white shadow-sm border-b border-gray-200 mb-2 px-3 py-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">
              Business Dashboard
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={handleSearchIconClick}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                {user.initials}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {user.name}
                </div>
                <div className="text-xs text-gray-600">{user.role}</div>
              </div>
            </div>
          </div>
        </div>

        <main className="p-6">
          <MRManagement />
        </main>
      </div>

      {/* NEW: Products Modal */}
      <ProductsModal />

      {/* NEW: All MRs Salary Modal */}
      <AllMRsSalaryModal />
    </div>
  );
};

export default Dashboard;