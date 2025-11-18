import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardCards } from "./DashboardCards";
import { SidePanel } from "./SidePanel";
import { SubTabs } from "./SubTabs";
import { SalesTable } from "./SalesTable";
import { OutstandingTable } from "./OutstandingTable";
import { PayrollTable } from "./PayrollTable";
import { DashboardHeader } from "./DashboardHeader";
import ProductsModal from "./ProductModal";
import AllMRsSalaryModal from "./AllMRSalaryModal";
import { useDashboardData } from "./useDataboardData";
import { getDateRanges, getPreviousMonthRanges } from "./DashboardUtil";
import axios from "axios";

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
    stockData,
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
  const [previousActiveTab, setPreviousActiveTab] = useState("Sales"); // Track previous tab

  // SUB-TABS
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [activeOutstandingSubTab, setActiveOutstandingSubTab] =
    useState("Today");

  // TABLE DATA
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [outstandingTableData, setOutstandingTableData] = useState([]);
  const [loadingOutstandingData, setLoadingOutstandingData] = useState(false);

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

  const [user] = useState({
    name: "User",
    role: "User",
    initials: "U",
  });

  const handleParentTabChange = (newTab) => {
    // Set previous tab before updating current tab
    setPreviousActiveTab(activeTab);

    // Update current tab
    setActiveTab(newTab);

    // Reset sub-tabs based on the new tab
    if (newTab === "Sales") {
      setActiveSalesSubTab("Today");
    }
    if (newTab === "Outstanding") {
      setActiveOutstandingSubTab("Today");
    }
    if (newTab === "Total Payroll") {
      setActivePayrollSubTab("Prev Month");
    }
    if (newTab === "Expenses" || newTab === "Stock") {
      setActiveExpenseSubTab("Month");
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

  // FETCH TABLE DATA ---- Outstanding
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

  // PRODUCT VIEW
  const handleViewProducts = (mrName, products) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(products);
    setShowProductsModal(true);
  };

  // INVOICE VIEW
  const handleViewInvoices = (mrName, invoices) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(invoices);
    setShowProductsModal(true);
  };

  // SIDE PANEL ICON
  const handlePanelIconClick = () => {
    if (activeTab === "Sales" || activeTab === "Outstanding") {
      setShowAllMRsInSidePanel((prev) => !prev);
      setSidePanelCurrentPage(1);
    }
  };

  // PAGINATION
  const handleSidePanelPageChange = (newPage) => {
    setSidePanelCurrentPage(newPage);
  };

  // FETCH SALES DATA WHEN SUBTAB CHANGES
  useEffect(() => {
    if (activeTab === "Sales") {
      const updateSalesData = async () => {
        const data = await fetchSalesBySubTab(activeSalesSubTab);

        setSalesData((prev) => ({
          ...prev,
          ...(activeSalesSubTab === "Today" && {
            todaySales: data.salesAmount,
            todayPrevious: data.previousSales,
            todayGrowth: data.growth,
          }),
          ...(activeSalesSubTab === "Month" && {
            monthlySales: data.salesAmount,
            monthlyPrevious: data.previousSales,
            monthlyGrowth: data.growth,
          }),
          ...(activeSalesSubTab === "Year" && {
            yearSales: data.salesAmount,
            yearPrevious: data.previousSales,
            yearGrowth: data.growth,
          }),
        }));
      };
      updateSalesData();
    }
  }, [activeSalesSubTab, activeTab]);

  // FETCH OUTSTANDING DATA WHEN SUBTAB CHANGES
  useEffect(() => {
    if (activeTab === "Outstanding") {
      const updateOutstandingData = async () => {
        const data = await fetchOutstandingBySubTab(activeOutstandingSubTab);

        setOutstandingData((prev) => ({
          ...prev,
          ...(activeOutstandingSubTab === "Today" && {
            todayOutstanding: data.outstandingAmount,
            mrWiseOutstanding: data.outstandingInvoices,
          }),
          ...(activeOutstandingSubTab === "Month" && {
            monthlyOutstanding: data.outstandingAmount,
            mrWiseOutstanding: data.outstandingInvoices,
          }),
          ...(activeOutstandingSubTab === "Year" && {
            yearOutstanding: data.outstandingAmount,
            mrWiseOutstanding: data.outstandingInvoices,
          }),
        }));
      };
      updateOutstandingData();
    }
  }, [activeOutstandingSubTab, activeTab]);

  // FETCH TABLE: SALES
  useEffect(() => {
    if (activeTab === "Sales") {
      fetchSalesTableData(activeSalesSubTab);
    }
  }, [activeSalesSubTab, activeTab]);

  // FETCH TABLE: OUTSTANDING
  useEffect(() => {
    if (activeTab === "Outstanding") {
      fetchOutstandingTableData(activeOutstandingSubTab);
    }
  }, [activeOutstandingSubTab, activeTab]);

  // MAIN TABLE RENDER
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

      default:
        return <div>Table for {activeTab}</div>;
    }
  };

  return (
    <div className="p-6">
      <div className="container">
        <DashboardHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchInputRef={searchInputRef}
          user={user}
        />

        <main className="p-6">
          <div className="space-y-6">
            {/* CARDS */}
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

            {/* SUB TABS */}
            <SubTabs
              activeTab={activeTab}
              activeSalesSubTab={activeSalesSubTab}
              activeExpenseSubTab={activeExpenseSubTab}
              activePayrollSubTab={activePayrollSubTab}
              activeOutstandingSubTab={activeOutstandingSubTab}
              onSalesSubTabChange={setActiveSalesSubTab}
              onExpenseSubTabChange={setActiveExpenseSubTab}
              onPayrollSubTabChange={setActivePayrollSubTab}
              onOutstandingSubTabChange={setActiveOutstandingSubTab}
              dateRanges={dateRanges}
              prevMonthRanges={prevMonthRanges}
            />

            {/* GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <SidePanel
                  activeTab={activeTab}
                  showAllMRsInSidePanel={showAllMRsInSidePanel}
                  onPanelIconClick={handlePanelIconClick}
                  sidePanelCurrentPage={sidePanelCurrentPage}
                  onSidePanelPageChange={handleSidePanelPageChange}
                  salesTableData={salesTableData}
                  loadingSalesData={loadingSalesData}
                  outstandingTableData={outstandingTableData}
                  loadingOutstandingData={loadingOutstandingData}
                  stockData={stockData}
                  expenseData={expenseData}
                  mrList={mrList}
                  onViewProducts={handleViewProducts}
                  onViewInvoices={handleViewInvoices}
                />
              </div>

              <div className="lg:col-span-2">{renderMainTable()}</div>
            </div>
          </div>
        </main>
      </div>

      {/* MODALS */}
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
    </div>
  );
};

export default Dashboard;
