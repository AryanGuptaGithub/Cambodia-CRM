import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { useDashboardData } from "./useDataboardData"; // Make sure this is the updated hook
import {
  getDateRanges,
  getPreviousMonthRanges,
  getStockDateRanges,
  calculateStockValue,
  getLowStockItems,
  formatCurrency,
} from "./DashboardUtil";
import axios from "axios";
import { CombinedStockTable } from "./StockTable"; // 👈 Use the corrected component (import path may vary)
import BatchDetailsModal from "./BatchDetailsModal";
import { OverdueTable } from "./OverdueTable";
import { CreditSaleTable } from "./CreditSaleTable";
import { Calendar, X } from "lucide-react";

// Backend URL from environment variable (fallback to empty string)
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
    stockData,                 // now contains warehouseStockValue, mrStockValue, totalStockValue
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
  const [activeOutstandingSubTab, setActiveOutstandingSubTab] = useState("Today");
  const [activeStockSubTab, setActiveStockSubTab] = useState("all"); // default to "all" for stock table

  // TABLE DATA (for tables other than stock)
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [outstandingTableData, setOutstandingTableData] = useState([]);
  const [loadingOutstandingData, setLoadingOutstandingData] = useState(false);
  const [expenseTableData, setExpenseTableData] = useState([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);
  const [payrollTableData, setPayrollTableData] = useState([]);
  const [loadingPayrollData, setLoadingPayrollData] = useState(false);
  const [pendingCollectionData, setPendingCollectionData] = useState([]);
  const [loadingPendingCollectionData, setLoadingPendingCollectionData] = useState(false);

  // OVERDUE DATA STATES
  const [overdueTableData, setOverdueTableData] = useState([]);
  const [loadingOverdueData, setLoadingOverdueData] = useState(false);

  // CREDIT SALE DATA STATES
  const [creditSaleTableData, setCreditSaleTableData] = useState([]);
  const [loadingCreditSaleData, setLoadingCreditSaleData] = useState(false);

  // DYNAMIC PAYROLL TOTALS
  const [currentPayrollTotal, setCurrentPayrollTotal] = useState(0);
  const [currentYTDTotal, setCurrentYTDTotal] = useState(0);

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedBatches, setSelectedBatches] = useState([]);

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
    const savedRange = customDateRanges[cardId];
    if (savedRange.start && savedRange.end) {
      setCustomStartDate(savedRange.start);
      setCustomEndDate(savedRange.end);
    } else {
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

    setCustomDateRanges(prev => ({
      ...prev,
      [selectedCardForFilter]: { start: customStartDate, end: customEndDate }
    }));

    setIsCustomDateActive(prev => ({
      ...prev,
      [selectedCardForFilter]: true
    }));

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
    e.stopPropagation();
    
    setIsCustomDateActive(prev => ({
      ...prev,
      [cardId]: false
    }));

    setCustomDateRanges(prev => ({
      ...prev,
      [cardId]: { start: "", end: "" }
    }));

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

  // =================== SUBTAB CHANGE HANDLERS ===================
  const handleSalesSubTabChange = (subTab) => {
    setActiveSalesSubTab(subTab);
    if (activeTab === "Sales") {
      if (subTab === "Custom" && !isCustomDateActive["Total Sales"]) return;
      fetchSalesTableData(subTab);
    }
  };

  const handleOutstandingSubTabChange = (subTab) => {
    setActiveOutstandingSubTab(subTab);
    if (activeTab === "Outstanding") {
      if (subTab === "Custom" && !isCustomDateActive["Outstanding"]) return;
      fetchOutstandingTableData(subTab);
    }
  };

  const handleStockSubTabChange = (subTab) => {
    setActiveStockSubTab(subTab);
  };

  const handleExpenseSubTabChange = (subTab) => {
    setActiveExpenseSubTab(subTab);
    if (activeTab === "Expenses") {
      if (subTab === "Custom" && !isCustomDateActive["Total Expense"]) return;
      fetchExpenseTableData(subTab);
    }
  };

  const handlePayrollSubTabChange = (subTab) => {
    setActivePayrollSubTab(subTab);
    if (activeTab === "Total Payroll") {
      if (subTab === "Custom" && !isCustomDateActive["Total Payroll"]) return;
      fetchPayrollTableData(subTab);
    }
  };

  // =================== FETCH FUNCTIONS (for non-stock tables) ===================
  const fetchSalesTableData = async (period) => {
    try {
      setLoadingSalesData(true);
      const params = { period };
      if (period === "Custom" && isCustomDateActive["Total Sales"]) {
        params.period = "custom";
        params.startDate = customDateRanges["Total Sales"].start;
        params.endDate = customDateRanges["Total Sales"].end;
      }
      const response = await axios.get(`${backendUrl}/api/sales/table-data`, { params });
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
      const response = await axios.get(`${backendUrl}/api/outstanding/table-data`, { params });
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
      const response = await axios.get(`${backendUrl}/api/expenses`, { params });

      let expenses = [];
      if (response.data?.success) expenses = response.data.data || [];
      else if (Array.isArray(response.data)) expenses = response.data;
      else if (response.data?.expenses) expenses = response.data.expenses;
      else if (response.data?.latestExpenses) expenses = response.data.latestExpenses;

      if (period !== "Custom") {
        const currentDate = new Date();
        let filteredExpenses = [];

        switch (period) {
          case "Month":
            filteredExpenses = expenses.filter((expense) => {
              const expenseDate = new Date(expense.date);
              return expenseDate.getMonth() === currentDate.getMonth() &&
                expenseDate.getFullYear() === currentDate.getFullYear();
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
            filteredExpenses = expenses.filter((expense) => expense.status === "Pending");
            break;
          case "Approved":
            filteredExpenses = expenses.filter((expense) => expense.status === "Approved");
            break;
          case "Rejected":
            filteredExpenses = expenses.filter((expense) => expense.status === "Rejected");
            break;
          default:
            filteredExpenses = expenses;
        }
        expenses = filteredExpenses;
      }

      const formattedExpenses = Array.isArray(expenses)
        ? expenses.map((expense) => ({
            id: expense._id || expense.id,
            category: expense.category?.category ||
              (typeof expense.category === "string" ? expense.category : "Uncategorized"),
            amount: expense.amount || 0,
            date: expense.date
              ? new Date(expense.date).toLocaleDateString()
              : expense.createdAt
              ? new Date(expense.createdAt).toLocaleDateString()
              : new Date().toLocaleDateString(),
            description: expense.description || expense.remarks || "No description",
            paymentMethod: expense.paymentMethod || "N/A",
            sourceAccount: expense.sourceAccount?.name || "N/A",
            details: [
              `Amount: ₹${expense.amount || 0}`,
              `Date: ${expense.date ? new Date(expense.date).toLocaleDateString() : "N/A"}`,
              `Category: ${expense.category?.category || "Uncategorized"}`,
              `Payment Method: ${expense.paymentMethod || "N/A"}`,
              `Source: ${expense.sourceAccount?.name || "N/A"}`,
              `Remarks: ${expense.remarks || "No remarks"}`,
            ],
          }))
        : [];

      setExpenseTableData(formattedExpenses.sort((a, b) => b.amount - a.amount));
    } catch (error) {
      console.error("Error fetching expense table data:", error);
      setExpenseTableData([]);
    } finally {
      setLoadingExpenseData(false);
    }
  };

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
          if (prevMonth < 0) { prevMonth = 11; year -= 1; }
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

      const response = await axios.get(`${backendUrl}/api/hrm/payroll`, { params });
      const payrolls = response.data?.data || [];
      const totalNetSalary = payrolls.reduce((sum, item) => sum + (item.netSalary || 0), 0);

      setPayrollTableData(payrolls);
      if (period === "Prev Month" || period === "Custom") setCurrentPayrollTotal(totalNetSalary);
      else if (period === "YTD") setCurrentYTDTotal(totalNetSalary);
      else if (period === "Overdue") setCurrentPayrollTotal(totalNetSalary);
      else if (period === "Unreceive_Payment") setCurrentYTDTotal(totalNetSalary);
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
          overdueAmount: invoice.dueAmount > 0
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

  const fetchCreditSaleTableData = async () => {
    try {
      setLoadingCreditSaleData(true);
      const response = await axios.get(`${backendUrl}/api/sales/credit-sale-not-received`);
      if (response.data.success) setCreditSaleTableData(response.data.data || []);
    } catch (error) {
      console.error("Error fetching credit sale data:", error);
      setCreditSaleTableData([]);
    } finally {
      setLoadingCreditSaleData(false);
    }
  };

  const fetchPendingCollectionData = async () => {
    try {
      setLoadingPendingCollectionData(true);
      const response = await axios.get(`${backendUrl}/api/sales/pending-collection-today`);
      if (response.data.success) setPendingCollectionData(response.data.data || []);
      else setPendingCollectionData([]);
    } catch (error) {
      console.error("Error fetching pending collection data:", error);
      setPendingCollectionData([]);
    } finally {
      setLoadingPendingCollectionData(false);
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

    if (invoice.products && invoice.products.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((product, index) => {
        details.push(
          `  ${index + 1}. ${product.productName || "Product"} - Qty: ${product.quantity || 0} - Price: $${product.price || 0}`
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

    if (invoice.products && invoice.products.length > 0) {
      details.push(`\nProducts:`);
      invoice.products.forEach((product, index) => {
        details.push(
          `  ${index + 1}. ${product.productName || "Product"} - Sales Qty: ${product.salesQty || 0} - Bonus Qty: ${product.bonusQty || 0} - Price: $${product.sellingPrice || 0}`
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

    switch (newTab) {
      case "Stock in Hands":
  
        break;
      case "Sales":
        setActiveSalesSubTab(isCustomDateActive["Total Sales"] ? "Custom" : "Today");
        fetchSalesTableData(isCustomDateActive["Total Sales"] ? "Custom" : "Today");
        break;
      case "Outstanding":
        setActiveOutstandingSubTab(isCustomDateActive["Outstanding"] ? "Custom" : "Today");
        fetchOutstandingTableData(isCustomDateActive["Outstanding"] ? "Custom" : "Today");
        break;
      case "Total Payroll":
        setActivePayrollSubTab(isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month");
        fetchPayrollTableData(isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month");
        break;
      case "Expenses":
        setActiveExpenseSubTab(isCustomDateActive["Total Expense"] ? "Custom" : "Month");
        fetchExpenseTableData(isCustomDateActive["Total Expense"] ? "Custom" : "Month");
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

  // =================== EFFECTS ===================
  // Initial data fetch for non-stock tables
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchSalesTableData("Today"),
        fetchOutstandingTableData("Today"),
        fetchExpenseTableData("Month"),
        fetchCreditSaleTableData(),
      ]);
      setCurrentPayrollTotal(totalPayroll);
      setCurrentYTDTotal(payrollYTDTotal);
    };
    initializeData();
  }, []); // runs once

  // Update local payroll totals when hook data changes
  useEffect(() => {
    setCurrentPayrollTotal(totalPayroll);
    setCurrentYTDTotal(payrollYTDTotal);
  }, [totalPayroll, payrollYTDTotal]);

  // =================== RENDER MAIN TABLE ===================
  const renderMainTable = () => {
    const getCustomDateRangeText = (cardTitle) => {
      if (!isCustomDateActive[cardTitle] || !customDateRanges[cardTitle]) return null;
      const start = new Date(customDateRanges[cardTitle].start);
      const end = new Date(customDateRanges[cardTitle].end);
      const formatDate = (date) => date.toLocaleDateString("en-US", { day: "numeric", month: "short" });
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
          <CombinedStockTable
            apiBaseUrl={backendUrl}
            activeTab={activeStockSubTab}          // 👈 pass current stock tab
            onTabChange={handleStockSubTabChange}  // 👈 update parent when tab changes
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

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              <Calendar className="inline-block w-5 h-5 mr-2" />
              Custom Date Range for {selectedCardForFilter}
            </h3>
            <button onClick={() => setShowDateFilter(false)} className="text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                max={customEndDate || undefined}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
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
        stockData={stockData}               // now contains warehouseStockValue, mrStockValue, totalStockValue
        expenseData={expenseData}
        totalPayroll={currentPayrollTotal}
        payrollYTDTotal={currentYTDTotal}
        activeSalesSubTab={activeSalesSubTab}
        activeOutstandingSubTab={activeOutstandingSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeStockSubTab={activeStockSubTab}         // 👈 pass stock tab here
        onSalesSubTabChange={handleSalesSubTabChange}
        onExpenseSubTabChange={handleExpenseSubTabChange}
        onPayrollSubTabChange={handlePayrollSubTabChange}
        onOutstandingSubTabChange={handleOutstandingSubTabChange}
        onStockSubTabChange={handleStockSubTabChange} // 👈 update stock tab when clicked from card
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
        overdueTableData={overdueTableData}
        creditSaleTableData={creditSaleTableData}
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