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

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("Sales");
  const [previousActiveTab, setPreviousActiveTab] = useState("Sales");
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [activeOutstandingSubTab, setActiveOutstandingSubTab] =
    useState("Today");
  const [activeStockSubTab, setActiveStockSubTab] = useState("Today");

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

  const [stockData, setStockData] = useState({
    totalStock: 0,
    stockValue: 0,
    lowStockItems: [],
  });

  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);
  const [selectedMRName, setSelectedMRName] = useState("");
  const [showAllMRsModal, setShowAllMRsModal] = useState(false);
  const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);

  const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
  const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);

  const dateRanges = getDateRanges();
  const prevMonthRanges = getPreviousMonthRanges();
  const stockDateRanges = getStockDateRanges();

  const [user] = useState({ name: "User", role: "User", initials: "U" });

  // ---------------- FETCH FUNCTIONS ----------------
  const fetchStockTableData = async () => {
    try {
      setLoadingStockData(true);
      const response = await axios.get(`${backendUrl}/api/reports-in-hand`);
      const stockDataFromAPI = Array.isArray(response.data.reports)
        ? response.data.reports
        : [];
      setStockTableData(stockDataFromAPI);

      const totalStockValue = calculateStockValue(stockDataFromAPI);
      const lowStockItems = getLowStockItems(stockDataFromAPI);

      setStockData({
        totalStock: totalStockValue,
        stockValue: totalStockValue,
        lowStockItems,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStockData(false);
    }
  };

  const handleViewStockDetails = (productName, batches) => {
    setSelectedProductName(productName);
    setSelectedBatches(batches);
    setShowBatchModal(true);
  };

  // Other fetch functions remain the same (Sales, Outstanding, Expense)...

  const handleParentTabChange = (newTab) => {
    setPreviousActiveTab(activeTab);
    setActiveTab(newTab);

    if (newTab === "Stock in Hands") setActiveStockSubTab("Today");
    if (newTab === "Sales") setActiveSalesSubTab("Today");
    if (newTab === "Outstanding") setActiveOutstandingSubTab("Today");
    if (newTab === "Total Payroll") setActivePayrollSubTab("Prev Month");
    if (newTab === "Expenses") setActiveExpenseSubTab("Month");
  };

  useEffect(() => {
    fetchStockTableData();
  }, []);

  useEffect(() => {
    if (activeTab === "Sales") fetchSalesBySubTab(activeSalesSubTab);
  }, [activeSalesSubTab]);

  useEffect(() => {
    if (activeTab === "Outstanding")
      fetchOutstandingBySubTab(activeOutstandingSubTab);
  }, [activeOutstandingSubTab]);

  useEffect(() => {
    if (activeTab === "Expenses") fetchExpenseTableData(activeExpenseSubTab);
  }, [activeExpenseSubTab]);

  const renderMainTable = () => {
    switch (activeTab) {
      case "Sales":
        return (
          <SalesTable
            salesTableData={salesTableData}
            loadingSalesData={loadingSalesData}
            activeSalesSubTab={activeSalesSubTab}
            dateRanges={dateRanges}
            onViewProducts={() => {}}
          />
        );
      case "Outstanding":
        return (
          <OutstandingTable
            outstandingTableData={outstandingTableData}
            loadingOutstandingData={loadingOutstandingData}
            activeOutstandingSubTab={activeOutstandingSubTab}
            dateRanges={dateRanges}
            onViewInvoices={() => {}}
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
            onViewExpenseDetails={() => {}}
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
          onSidePanelPageChange={setSidePanelCurrentPage}
          salesTableData={salesTableData}
          loadingSalesData={loadingSalesData}
          outstandingTableData={outstandingTableData}
          loadingOutstandingData={loadingOutstandingData}
          expenseTableData={expenseTableData}
          loadingExpenseData={loadingExpenseData}
          stockData={stockData}
          expenseData={expenseData}
          mrList={mrList}
          onViewProducts={() => {}}
          onViewInvoices={() => {}}
          onViewExpenseDetails={() => {}}
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
