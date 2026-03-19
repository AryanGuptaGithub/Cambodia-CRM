import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCards } from "./DashboardCards";
import { SidePanel } from "./SidePanel";
import { SubTabs } from "./SubTabs";
import { SalesTable } from "./SalesTable";
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
  formatCurrency,
} from "./DashboardUtil";
import axios from "axios";
import { CombinedStockTable } from "./StockTable";
import BatchDetailsModal from "./BatchDetailsModal";
import { OverdueTable } from "./OverdueTable";
import { CreditSaleTable } from "./CreditSaleTable";
import { CompanyBalancePanel } from "./CompanyBalancePanel";
import { Calendar, X } from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL || "";

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
    stockData,
    fetchSalesBySubTab,
    fetchOutstandingBySubTab,
    setSalesData,
    setOutstandingData,
    setMrList,
  } = useDashboardData();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("Sales");
  const [previousActiveTab, setPreviousActiveTab] = useState("Sales");

  // SUB-TABS
  // 🔁 Total Sales defaults to Today, Pending Collection defaults to Month
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [activeStockSubTab, setActiveStockSubTab] = useState("all");
  const [activePendingCollectionSubTab, setActivePendingCollectionSubTab] =
    useState("Month");

  const [isSalesMonthOnly, setIsSalesMonthOnly] = useState(false);

  // TABLE DATA
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [expenseTableData, setExpenseTableData] = useState([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);
  const [payrollTableData, setPayrollTableData] = useState([]);
  const [loadingPayrollData, setLoadingPayrollData] = useState(false);
  const [pendingCollectionData, setPendingCollectionData] = useState([]);
  const [loadingPendingCollectionData, setLoadingPendingCollectionData] =
    useState(false);

  const [overdueTableData, setOverdueTableData] = useState([]);
  const [loadingOverdueData, setLoadingOverdueData] = useState(false);

  const [creditSaleTableData, setCreditSaleTableData] = useState([]);
  const [loadingCreditSaleData, setLoadingCreditSaleData] = useState(false);

  // Totals
  const [currentPayrollTotal, setCurrentPayrollTotal] = useState(0);
  const [currentYTDTotal, setCurrentYTDTotal] = useState(0);
  const [expenseSummary, setExpenseSummary] = useState({
    monthlyExpense: 0,
    yearExpense: 0,
    allExpense: 0,
    customExpenseTotal: 0,
  });

  // Company Balance
  const [companyBalance, setCompanyBalance] = useState(0);
  const [companyBalanceAccounts, setCompanyBalanceAccounts] = useState([]);
  const [loadingCompanyBalance, setLoadingCompanyBalance] = useState(false);

  const [creditSaleTotal, setCreditSaleTotal] = useState(0);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedBatches, setSelectedBatches] = useState([]);

  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);
  const [selectedMRName, setSelectedMRName] = useState("");
  const [showAllMRsModal, setShowAllMRsModal] = useState(false);
  const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);

  const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
  const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);

  const dateRanges = useMemo(() => getDateRanges(), []);
  const prevMonthRanges = useMemo(() => getPreviousMonthRanges(), []);
  const stockDateRanges = useMemo(() => getStockDateRanges(), []);

  const [user] = useState({ name: "User", role: "User", initials: "U" });

  // =================== CUSTOM DATE FILTER STATES ===================
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [selectedCardForFilter, setSelectedCardForFilter] = useState(null);
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isCustomDateActive, setIsCustomDateActive] = useState({
    "Total Sales": false,
    Outstanding: false,
    "Total Expense": false,
    "Total Payroll": false,
    "Pending Collection": false,
  });
  const [customDateRanges, setCustomDateRanges] = useState({
    "Total Sales": { start: "", end: "" },
    Outstanding: { start: "", end: "" },
    "Total Expense": { start: "", end: "" },
    "Total Payroll": { start: "", end: "" },
    "Pending Collection": { start: "", end: "" },
  });

  useEffect(() => {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      0,
    );
    const defaultStartDate = firstDayOfMonth.toISOString().split("T")[0];
    const defaultEndDate = lastDayOfMonth.toISOString().split("T")[0];
    setCustomStartDate(defaultStartDate);
    setCustomEndDate(defaultEndDate);
    setCustomDateRanges({
      "Total Sales": { start: defaultStartDate, end: defaultEndDate },
      Outstanding: { start: defaultStartDate, end: defaultEndDate },
      "Total Expense": { start: defaultStartDate, end: defaultEndDate },
      "Total Payroll": { start: defaultStartDate, end: defaultEndDate },
      "Pending Collection": { start: defaultStartDate, end: defaultEndDate },
    });
  }, []);

  // =================== CUSTOM DATE FILTER HANDLERS ===================
  const handleDateFilterClick = (cardId) => {
    setSelectedCardForFilter(cardId);
    const savedRange = customDateRanges[cardId];
    if (savedRange?.start && savedRange?.end) {
      setCustomStartDate(savedRange.start);
      setCustomEndDate(savedRange.end);
    } else {
      const today = new Date();
      setCustomStartDate(
        new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString()
          .split("T")[0],
      );
      setCustomEndDate(
        new Date(today.getFullYear(), today.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0],
      );
    }
    setShowDateFilter(true);
  };

  const handleApplyDateFilter = () => {
    if (!selectedCardForFilter || !customStartDate || !customEndDate) return;

    setCustomDateRanges((prev) => ({
      ...prev,
      [selectedCardForFilter]: { start: customStartDate, end: customEndDate },
    }));
    setIsCustomDateActive((prev) => ({
      ...prev,
      [selectedCardForFilter]: true,
    }));

    switch (selectedCardForFilter) {
      case "Total Sales":
        setActiveSalesSubTab("Custom");
        fetchSalesTableData("Custom", customStartDate, customEndDate);
        break;
      case "Total Expense":
        setActiveExpenseSubTab("Custom");
        fetchExpenseTableData("Custom", customStartDate, customEndDate);
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Custom");
        fetchPayrollTableData("Custom", customStartDate, customEndDate);
        break;
      case "Pending Collection":
        setActivePendingCollectionSubTab("Custom");
        fetchCreditSaleTableData("Custom", customStartDate, customEndDate);
        break;
      default:
        break;
    }
    setShowDateFilter(false);
  };

  const handleClearDateFilter = (cardId, e) => {
    e.stopPropagation();
    setIsCustomDateActive((prev) => ({ ...prev, [cardId]: false }));
    setCustomDateRanges((prev) => ({
      ...prev,
      [cardId]: { start: "", end: "" },
    }));
    switch (cardId) {
      case "Total Sales":
        setActiveSalesSubTab("Today");
        fetchSalesTableData("Today");
        break;
      case "Total Expense":
        setActiveExpenseSubTab("Month");
        fetchExpenseTableData("Month");
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Prev Month");
        fetchPayrollTableData("Prev Month");
        break;
      case "Pending Collection":
        setActivePendingCollectionSubTab("Month");
        fetchCreditSaleTableData("Month");
        break;
      default:
        break;
    }
  };

  // =================== SUBTAB CHANGE HANDLERS ===================
  const handleSalesSubTabChange = (subTab) => {
    setActiveSalesSubTab(subTab);
    if (isSalesMonthOnly && subTab !== "Month") {
      setIsSalesMonthOnly(false);
    }
    if (activeTab === "Sales") {
      if (subTab === "Custom") {
        if (!isCustomDateActive["Total Sales"]) return;
        fetchSalesTableData("Custom");
      } else {
        setIsCustomDateActive((prev) => ({ ...prev, "Total Sales": false }));
        fetchSalesTableData(subTab);
      }
    }
  };

  const handleStockSubTabChange = (subTab) => setActiveStockSubTab(subTab);

  const handleExpenseSubTabChange = (subTab) => {
    setActiveExpenseSubTab(subTab);
    if (activeTab === "Expenses") {
      if (subTab === "Custom") {
        if (!isCustomDateActive["Total Expense"]) return;
        fetchExpenseTableData("Custom");
      } else {
        setIsCustomDateActive((prev) => ({ ...prev, "Total Expense": false }));
        fetchExpenseTableData(subTab);
      }
    }
  };

  const handlePayrollSubTabChange = (subTab) => {
    setActivePayrollSubTab(subTab);
    if (activeTab === "Total Payroll") {
      if (subTab === "Custom") {
        if (!isCustomDateActive["Total Payroll"]) return;
        fetchPayrollTableData("Custom");
      } else {
        setIsCustomDateActive((prev) => ({ ...prev, "Total Payroll": false }));
        fetchPayrollTableData(subTab);
      }
    }
  };

  const handlePendingCollectionSubTabChange = (subTab) => {
    setActivePendingCollectionSubTab(subTab);
    if (activeTab === "Credit Sale Cash Not Receive") {
      if (subTab === "Custom") {
        if (!isCustomDateActive["Pending Collection"]) return;
        fetchCreditSaleTableData("Custom");
      } else {
        setIsCustomDateActive((prev) => ({
          ...prev,
          "Pending Collection": false,
        }));
        fetchCreditSaleTableData(subTab);
      }
    }
  };

  // =================== FETCH FUNCTIONS ===================
  const fetchSalesTableData = async (period, startDateParam, endDateParam) => {
    try {
      setLoadingSalesData(true);
      const periodMap = {
        Today: "Today",
        Month: "Month",
        Year: "Year",
        All: "All",
        Custom: "custom",
      };
      const backendPeriod = periodMap[period] || period;
      const params = { period: backendPeriod };

      if (period === "Custom") {
        params.startDate =
          startDateParam || customDateRanges["Total Sales"]?.start;
        params.endDate = endDateParam || customDateRanges["Total Sales"]?.end;
      }

      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params,
      });
      const data = response.data.success ? response.data.data : [];
      setSalesTableData(data);

      const total = data.reduce((sum, sale) => sum + (sale.amount || 0), 0);

      setSalesData((prev) => {
        switch (period) {
          case "Today":
            return { ...prev, todaySales: total };
          case "Month":
            return { ...prev, monthlySales: total };
          case "Year":
            return { ...prev, yearSales: total };
          case "All":
            return { ...prev, allSales: total };
          case "Custom":
            return { ...prev, customSales: total };
          default:
            return prev;
        }
      });
    } catch (error) {
      console.error("Error fetching sales table data:", error);
      setSalesTableData([]);
    } finally {
      setLoadingSalesData(false);
    }
  };

  const fetchExpenseTableData = async (
    period,
    startDateParam,
    endDateParam,
  ) => {
    try {
      setLoadingExpenseData(true);
      const periodMap = {
        Month: "Month",
        Year: "Year",
        All: "All",
        Custom: "custom",
      };
      const backendPeriod = periodMap[period] || period;
      const params = { period: backendPeriod };

      if (period === "Custom") {
        params.startDate =
          startDateParam || customDateRanges["Total Expense"]?.start;
        params.endDate = endDateParam || customDateRanges["Total Expense"]?.end;
      }

      const response = await axios.get(`${backendUrl}/api/expenses`, {
        params,
      });

      const rawData = response.data.data || [];
      const transformedData = rawData.map((expense) => ({
        ...expense,
        category: expense.category?.category || expense.category || "Unknown",
      }));

      setExpenseTableData(transformedData);

      const total = rawData.reduce((sum, exp) => sum + (exp.amount || 0), 0);

      setExpenseSummary((prev) => {
        switch (period) {
          case "Month":
            return { ...prev, monthlyExpense: total };
          case "Year":
            return { ...prev, yearExpense: total };
          case "All":
            return { ...prev, allExpense: total };
          case "Custom":
            return { ...prev, customExpenseTotal: total };
          default:
            return prev;
        }
      });
    } catch (error) {
      console.error("Error fetching expense table data:", error);
      setExpenseTableData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  };

  const fetchPayrollTableData = async (
    period,
    startDateParam,
    endDateParam,
  ) => {
    try {
      setLoadingPayrollData(true);
      let params = {};

      if (period === "Custom") {
        params.period = "custom";
        params.startDate =
          startDateParam || customDateRanges["Total Payroll"]?.start;
        params.endDate = endDateParam || customDateRanges["Total Payroll"]?.end;
      } else if (period === "All") {
        params = {};
      } else {
        const currentDate = new Date();
        let payrollPeriod;
        if (period === "Prev Month") {
          let pm = currentDate.getMonth() - 1;
          let y = currentDate.getFullYear();
          if (pm < 0) {
            pm = 11;
            y -= 1;
          }
          payrollPeriod = `${y}-${String(pm + 1).padStart(2, "0")}`;
        } else if (period === "YTD") {
          payrollPeriod = `${currentDate.getFullYear()}-YTD`;
        } else if (period === "Overdue") {
          payrollPeriod = "overdue";
        } else if (period === "Unreceive_Payment") {
          payrollPeriod = "unreceived";
        }
        params.period = payrollPeriod;
      }

      const response = await axios.get(`${backendUrl}/api/hrm/payroll`, {
        params,
      });
      const payrolls = response.data?.data || [];
      const totalNetSalary = payrolls.reduce(
        (sum, item) => sum + (item.netSalary || 0),
        0,
      );
      setPayrollTableData(payrolls);

      if (period === "Prev Month" || period === "Custom") {
        setCurrentPayrollTotal(totalNetSalary);
      } else if (period === "YTD") {
        setCurrentYTDTotal(totalNetSalary);
      } else if (period === "Overdue") {
        setCurrentPayrollTotal(totalNetSalary);
      } else if (period === "Unreceive_Payment") {
        setCurrentYTDTotal(totalNetSalary);
      } else if (period === "All") {
        setCurrentPayrollTotal(totalNetSalary);
      }
    } catch (error) {
      console.error("Error in fetchPayrollTableData:", error);
      setPayrollTableData([]);
    } finally {
      setLoadingPayrollData(false);
    }
  };

  const fetchOverdueTableData = async () => {
    try {
      setLoadingOverdueData(true);
      const response = await axios.get(`${backendUrl}/api/overdue`, {
        params: { currentDate: new Date().toISOString() },
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

  const fetchCreditSaleTableData = async (
    period = "Today",
    startDateParam,
    endDateParam,
  ) => {
    try {
      setLoadingCreditSaleData(true);
      let params = {};

      if (period === "Custom") {
        params.period = "custom";
        params.startDate =
          startDateParam || customDateRanges["Pending Collection"]?.start;
        params.endDate =
          endDateParam || customDateRanges["Pending Collection"]?.end;
      } else if (period === "All") {
        params = {};
      } else {
        const periodMap = { Today: "today", Month: "month", Year: "year" };
        const backendPeriod = periodMap[period];
        if (backendPeriod) params.period = backendPeriod;
      }

      const response = await axios.get(
        `${backendUrl}/api/sales/credit-sale-not-received`,
        { params },
      );
      if (response.data.success) {
        setCreditSaleTableData(response.data.data || []);
        setCreditSaleTotal(parseFloat(response.data.totalAmount) || 0);
      } else {
        setCreditSaleTableData([]);
        setCreditSaleTotal(0);
      }
    } catch (error) {
      console.error("Error fetching credit sale data:", error);
      setCreditSaleTableData([]);
      setCreditSaleTotal(0);
    } finally {
      setLoadingCreditSaleData(false);
    }
  };

  const fetchPendingCollectionData = async () => {
    try {
      setLoadingPendingCollectionData(true);
      const response = await axios.get(
        `${backendUrl}/api/sales/pending-collection-today`,
      );
      if (response.data.success)
        setPendingCollectionData(response.data.data || []);
      else setPendingCollectionData([]);
    } catch (error) {
      console.error("Error fetching pending collection data:", error);
      setPendingCollectionData([]);
    } finally {
      setLoadingPendingCollectionData(false);
    }
  };

  const fetchCompanyBalance = async () => {
    try {
      setLoadingCompanyBalance(true);
      const response = await axios.get(`${backendUrl}/api/accounts/balance`);
      if (response.data.success) {
        setCompanyBalance(response.data.totalBalance || 0);
        setCompanyBalanceAccounts(response.data.accounts || []);
      }
    } catch (error) {
      console.error("Error fetching company balance:", error);
      try {
        const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
        const destinations = res.data?.data || res.data || [];
        const total = destinations.reduce(
          (sum, acc) => sum + (acc.totalAmount || 0),
          0,
        );
        setCompanyBalance(total);
        setCompanyBalanceAccounts(
          destinations.map((d) => ({
            _id: d._id,
            name: d.name,
            code: d.code || "",
            totalAmount: d.totalAmount || 0,
            transactionCount: 0,
            transactions: [],
          })),
        );
      } catch (err) {
        console.error("Fallback balance fetch failed:", err);
        setCompanyBalance(0);
        setCompanyBalanceAccounts([]);
      }
    } finally {
      setLoadingCompanyBalance(false);
    }
  };

  // =================== HANDLERS ===================
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

  const handleViewInvoiceDetails = (invoice) => {
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
      `Delivery Date: ${invoice.deliveryDate ? new Date(invoice.deliveryDate).toLocaleDateString() : "N/A"}`,
      `Remark: ${invoice.remark || "No remark"}`,
    ];
    if (invoice.products?.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((p, i) => {
        details.push(
          `  ${i + 1}. ${p.productName || "Product"} - Qty: ${p.quantity || 0} - Price: $${p.price || 0}`,
        );
      });
    }
    setSelectedMRName(`Invoice: ${invoice.invoiceNumber || "Details"}`);
    setSelectedMRProducts(details);
    setShowProductsModal(true);
  };

  const handleViewCreditSaleDetails = (invoice) => {
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
      `Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "N/A"}`,
      `Delivery Date: ${invoice.deliveryDate ? new Date(invoice.deliveryDate).toLocaleDateString() : "N/A"}`,
      `Remark: ${invoice.remark || "No remark"}`,
    ];
    if (invoice.products?.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((p, i) => {
        details.push(
          `  ${i + 1}. ${p.productName || "Product"} - Sales Qty: ${p.salesQty || 0} - Bonus Qty: ${p.bonusQty || 0} - Price: $${p.sellingPrice || 0}`,
        );
      });
    }
    setSelectedMRName(`Credit Sale: ${invoice.invoiceNumber || "Details"}`);
    setSelectedMRProducts(details);
    setShowProductsModal(true);
  };

  const handleCurrentMonthSaleClick = () => {
    setActiveTab("Sales");
    setActiveSalesSubTab("Month");
    setIsSalesMonthOnly(true);
    fetchSalesTableData("Month");
  };

  const handleParentTabChange = (newTab) => {
    setPreviousActiveTab(activeTab);
    setActiveTab(newTab);

    if (newTab !== "Sales") {
      setIsSalesMonthOnly(false);
    }

    switch (newTab) {
      case "Stock in Hands":
        break;
      case "Sales":
        setIsSalesMonthOnly(false);
        setActiveSalesSubTab(
          isCustomDateActive["Total Sales"] ? "Custom" : "Today", // now Today
        );
        fetchSalesTableData(
          isCustomDateActive["Total Sales"] ? "Custom" : "Today",
        );
        break;
      case "Total Payroll":
        setActivePayrollSubTab(
          isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month",
        );
        fetchPayrollTableData(
          isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month",
        );
        break;
      case "Expenses":
        setActiveExpenseSubTab(
          isCustomDateActive["Total Expense"] ? "Custom" : "Month",
        );
        fetchExpenseTableData(
          isCustomDateActive["Total Expense"] ? "Custom" : "Month",
        );
        break;
      case "Overdue":
        fetchOverdueTableData();
        break;
      case "Credit Sale Cash Not Receive":
        fetchCreditSaleTableData(
          isCustomDateActive["Pending Collection"]
            ? "Custom"
            : activePendingCollectionSubTab,
        );
        break;
      case "Pending Collection":
        fetchPendingCollectionData();
        break;
      case "Company Balance":
        fetchCompanyBalance();
        break;
      default:
        break;
    }
  };

  // =================== EFFECTS ===================
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchSalesTableData("Today"), // changed from Month to Today
        fetchExpenseTableData("Month"),
        fetchCreditSaleTableData("Month"), // remains Month
        fetchCompanyBalance(),
      ]);
      setCurrentPayrollTotal(totalPayroll);
      setCurrentYTDTotal(payrollYTDTotal);
    };
    initializeData();
  }, []);

  useEffect(() => {
    setCurrentPayrollTotal(totalPayroll);
    setCurrentYTDTotal(payrollYTDTotal);
  }, [totalPayroll, payrollYTDTotal]);

  // =================== RENDER MAIN TABLE ===================
  const renderMainTable = () => {
    const formatDateRangeSmart = (start, end) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      const sameYear = startDate.getFullYear() === endDate.getFullYear();
      const options = { day: "numeric", month: "short" };
      if (!sameYear) options.year = "numeric";
      const startStr = startDate.toLocaleDateString("en-US", options);
      const endStr = endDate.toLocaleDateString("en-US", options);
      return `${startStr} – ${endStr}`;
    };

    const getCustomDateRangeText = (cardTitle) => {
      if (!isCustomDateActive[cardTitle] || !customDateRanges[cardTitle])
        return null;
      const start = new Date(customDateRanges[cardTitle].start);
      const end = new Date(customDateRanges[cardTitle].end);
      return formatDateRangeSmart(start, end);
    };

    if (activeTab === "Company Balance") {
      return <CompanyBalancePanel />;
    }

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
          <CombinedStockTable
            apiBaseUrl={backendUrl}
            activeTab={activeStockSubTab}
            onTabChange={handleStockSubTabChange}
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
            activePendingCollectionSubTab={activePendingCollectionSubTab}
          />
        );
      default:
        return <div>Table for {activeTab}</div>;
    }
  };

  // =================== DATE FILTER MODAL ===================
  const DateFilterModal = () => {
    if (!showDateFilter || !selectedCardForFilter) return null;
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

  const mergedExpenseData = {
    ...(expenseData || {}),
    monthlyExpense: expenseSummary.monthlyExpense,
    yearExpense: expenseSummary.yearExpense,
    allExpense: expenseSummary.allExpense,
    customExpenseTotal: expenseSummary.customExpenseTotal,
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
        expenseData={mergedExpenseData}
        totalPayroll={currentPayrollTotal}
        payrollYTDTotal={currentYTDTotal}
        companyBalance={companyBalance}
        activeSalesSubTab={activeSalesSubTab}
        activeOutstandingSubTab="Today"
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeStockSubTab={activeStockSubTab}
        activePendingCollectionSubTab={activePendingCollectionSubTab}
        creditSaleTotal={creditSaleTotal}
        onSalesSubTabChange={handleSalesSubTabChange}
        onExpenseSubTabChange={handleExpenseSubTabChange}
        onPayrollSubTabChange={handlePayrollSubTabChange}
        onOutstandingSubTabChange={() => {}}
        onStockSubTabChange={handleStockSubTabChange}
        onPendingCollectionSubTabChange={handlePendingCollectionSubTabChange}
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
        overdueTableData={overdueTableData}
        creditSaleTableData={creditSaleTableData}
        onDateFilterClick={handleDateFilterClick}
        onClearDateFilter={handleClearDateFilter}
        isCustomDateActive={isCustomDateActive}
        customDateRanges={customDateRanges}
        onCurrentMonthSaleClick={handleCurrentMonthSaleClick}
      />

      <DateFilterModal />

      <SubTabs
        activeTab={activeTab}
        activeSalesSubTab={activeSalesSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeOutstandingSubTab="Today"
        activeStockSubTab={activeStockSubTab}
        activePendingCollectionSubTab={activePendingCollectionSubTab}
        onSalesSubTabChange={handleSalesSubTabChange}
        onExpenseSubTabChange={handleExpenseSubTabChange}
        onPayrollSubTabChange={handlePayrollSubTabChange}
        onOutstandingSubTabChange={() => {}}
        onStockSubTabChange={handleStockSubTabChange}
        onPendingCollectionSubTabChange={handlePendingCollectionSubTabChange}
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
        isCustomDateActive={isCustomDateActive}
        customDateRanges={customDateRanges}
        onDateFilterClick={handleDateFilterClick}
        forceSalesMonthOnly={isSalesMonthOnly}
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
          outstandingTableData={[]}
          loadingOutstandingData={false}
          expenseTableData={expenseTableData}
          loadingExpenseData={loadingExpenseData}
          stockData={stockData}
          expenseData={mergedExpenseData}
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
          companyBalanceAccounts={companyBalanceAccounts}
          loadingCompanyBalance={loadingCompanyBalance}
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