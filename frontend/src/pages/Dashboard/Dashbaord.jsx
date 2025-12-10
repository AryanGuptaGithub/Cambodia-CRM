// Dashboard.jsx
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

  // ------------------ FETCH FUNCTIONS ------------------
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

      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params: { period },
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

      const response = await axios.get(
        `${backendUrl}/api/outstanding/table-data`,
        { params: { period } }
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

      const response = await axios.get(`${backendUrl}/api/expenses`, {
        params: { period },
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

      // Filter expenses based on period
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

      const formattedExpenses = Array.isArray(filteredExpenses)
        ? filteredExpenses.map((expense) => ({
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

      const response = await axios.get(`${backendUrl}/api/payrolls`, {
        params: { period: payrollPeriod },
      });

      const payrolls = response.data?.data || [];

      // Calculate and log the total
      const totalNetSalary = payrolls.reduce((sum, item) => {
        const netSalary = item.netSalary || 0;
        return sum + netSalary;
      }, 0);

      setPayrollTableData(payrolls);

      // UPDATE THE TOTALS BASED ON THE CURRENT PERIOD
      if (period === "Prev Month") {
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

  // Fetch credit sale cash not received data - CORRECTED ENDPOINT
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

  // SUB-TAB CHANGE HANDLERS
  const handleSalesSubTabChange = (subTab) => {
    setActiveSalesSubTab(subTab);
    if (activeTab === "Sales") {
      fetchSalesTableData(subTab);
    }
  };

  const handleOutstandingSubTabChange = (subTab) => {
    setActiveOutstandingSubTab(subTab);
    if (activeTab === "Outstanding") {
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
      fetchExpenseTableData(subTab);
    }
  };

  const handlePayrollSubTabChange = (subTab) => {
    setActivePayrollSubTab(subTab);
    if (activeTab === "Total Payroll") {
      fetchPayrollTableData(subTab);
    }
  };

  const fetchPendingCollectionData = async () => {
    try {
      setLoadingPendingCollectionData(true);

      const response = await axios.get(
        `${backendUrl}/api/sales/pending-collection-today`
      );
      console.log("responst", response);
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
        setActiveSalesSubTab("Today");
        fetchSalesTableData("Today");
        break;
      case "Outstanding":
        setActiveOutstandingSubTab("Today");
        fetchOutstandingTableData("Today");
        break;
      case "Total Payroll":
        setActivePayrollSubTab("Prev Month");
        fetchPayrollTableData("Prev Month");
        break;
      case "Expenses":
        setActiveExpenseSubTab("Month");
        fetchExpenseTableData("Month");
        break;
      case "Overdue":
        fetchOverdueTableData();
        break;
      case "Credit Sale Cash Not Receive":
        fetchCreditSaleTableData();
        break;
      case "Pending Collection":
        fetchPendingCollectionData(); // NEW: Fetch pending collections
        break;
      default:
        break;
    }
  };

  // ------------------ EFFECTS ------------------
  // Initial data fetch - UPDATED TO INCLUDE CREDIT SALE DATA
  useEffect(() => {
    const initializeData = async () => {
      await Promise.all([
        fetchSalesTableData("Today"),
        fetchOutstandingTableData("Today"),
        fetchExpenseTableData("Month"),
        fetchStockTableData("Today"),
        fetchCreditSaleTableData(), // ADD THIS: Fetch credit sale data on initial load
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
    switch (activeTab) {
      case "Sales":
        return (
          <SalesTable
            salesTableData={salesTableData}
            loadingSalesData={loadingSalesData}
            activeSalesSubTab={activeSalesSubTab}
            dateRanges={dateRanges}
            onViewProducts={handleViewProducts}
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
          />
        );
      case "Total Payroll":
        return (
          <PayrollTable
            payrollData={payrollTableData}
            loading={loadingPayrollData}
            activePayrollSubTab={activePayrollSubTab}
            prevMonthRanges={prevMonthRanges}
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
        creditSaleTableData={creditSaleTableData} // PASS THE CREDIT SALE DATA
      />

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
          creditSaleTableData={creditSaleTableData || []} // ADD THIS
          loadingCreditSaleData={loadingCreditSaleData || false} // ADD THIS
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