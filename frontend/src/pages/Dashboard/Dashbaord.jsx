import React, { useState, useEffect, useRef } from "react";
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
} from "./DashboardUtil";
import axios from "axios";
import { StockTable } from "./StockTable";
import BatchDetailsModal from "./BatchDetailsModal";

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

  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedBatches, setSelectedBatches] = useState([]);

  // STOCK DATA CARDS
  const [stockData, setStockData] = useState({
    totalStock: 0,
    stockValue: 0,
    lowStockItems: [],
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

  const dateRanges = getDateRanges();
  const prevMonthRanges = getPreviousMonthRanges();
  const stockDateRanges = getStockDateRanges();

  const [user] = useState({
    name: "User",
    role: "User",
    initials: "U",
  });

  // ------------------ FETCH FUNCTIONS ------------------
  const fetchStockTableData = async () => {
    try {
      setLoadingStockData(true);

      const response = await axios.get(`${backendUrl}/api/reports-in-hand`);

      const stockDataFromAPI = Array.isArray(response.data.reports)
        ? response.data.reports
        : [];

      setStockTableData(stockDataFromAPI);

      // Update stock cards locally
      const totalStockValue = calculateStockValue(stockDataFromAPI);
      const lowStockItems = getLowStockItems(stockDataFromAPI);

      setStockData({
        totalStock: totalStockValue,
        stockValue: totalStockValue,
        lowStockItems: lowStockItems,
      });
    } catch (error) {
      console.error("Error fetching stock table data:", error);
    } finally {
      setLoadingStockData(false);
    }
  };

  const handleViewStockDetails = (productName, batches) => {
    setSelectedProductName(productName);
    setSelectedBatches(batches);
    setShowBatchModal(true);
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
      }

      const formattedExpenses = Array.isArray(expenses)
        ? expenses.map((expense) => ({
            id: expense._id || expense.id,
            category:
              typeof expense.category === "string"
                ? expense.category
                : expense.category?.name ||
                  expense.category?.category ||
                  "Uncategorized",
            amount: expense.amount || 0,
            date:
              expense.date ||
              expense.createdAt ||
              new Date().toISOString().split("T")[0],
            description:
              expense.description || expense.remarks || "No description",
            details: expense.details || [
              `Amount: ₹${expense.amount || 0}`,
              `Date: ${expense.date || "N/A"}`,
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

  const handleParentTabChange = (newTab) => {
    setPreviousActiveTab(activeTab);
    setActiveTab(newTab);
    if (newTab === "Stock in Hands") {
      setActiveStockSubTab("Today");
      fetchStockTableData(); // Fetch stock data when tab is clicked
    }
    if (newTab === "Sales") setActiveSalesSubTab("Today");
    if (newTab === "Outstanding") setActiveOutstandingSubTab("Today");
    if (newTab === "Total Payroll") setActivePayrollSubTab("Prev Month");
    if (newTab === "Expenses") setActiveExpenseSubTab("Month");
  };

  // ------------------ EFFECTS ------------------
  useEffect(() => {
    if (activeTab === "Stock in Hands") {
      fetchStockTableData();
    }
  }, [activeTab, activeStockSubTab]);

  useEffect(() => {
    if (activeTab === "Sales") fetchSalesTableData(activeSalesSubTab);
  }, [activeSalesSubTab, activeTab]);

  useEffect(() => {
    if (activeTab === "Outstanding")
      fetchOutstandingTableData(activeOutstandingSubTab);
  }, [activeOutstandingSubTab, activeTab]);

  useEffect(() => {
    if (activeTab === "Expenses") fetchExpenseTableData(activeExpenseSubTab);
  }, [activeExpenseSubTab, activeTab]);

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
            payrollData={payrollData}
            loading={loading}
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
            onViewStockDetails={handleViewStockDetails} // Corrected this line
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
        totalPayroll={totalPayroll}
        payrollYTDTotal={payrollYTDTotal}
        activeSalesSubTab={activeSalesSubTab}
        activeOutstandingSubTab={activeOutstandingSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        dateRanges={dateRanges}
        prevMonthRanges={prevMonthRanges}
      />

      <SubTabs
        activeTab={activeTab}
        activeSalesSubTab={activeSalesSubTab}
        activeExpenseSubTab={activeExpenseSubTab}
        activePayrollSubTab={activePayrollSubTab}
        activeOutstandingSubTab={activeOutstandingSubTab}
        activeStockSubTab={activeStockSubTab}
        onSalesSubTabChange={setActiveSalesSubTab}
        onExpenseSubTabChange={setActiveExpenseSubTab}
        onPayrollSubTabChange={setActivePayrollSubTab}
        onOutstandingSubTabChange={setActiveOutstandingSubTab}
        onStockSubTabChange={setActiveStockSubTab}
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