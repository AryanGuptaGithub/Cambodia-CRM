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
  const [previousActiveTab, setPreviousActiveTab] = useState("Sales");

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
  const [expenseTableData, setExpenseTableData] = useState([]);
  const [loadingExpenseData, setLoadingExpenseData] = useState(false);

  console.log("values of expenseTableData", expenseTableData);
  
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
    setPreviousActiveTab(activeTab);
    setActiveTab(newTab);

    if (newTab === "Sales") {
      setActiveSalesSubTab("Today");
    }
    if (newTab === "Outstanding") {
      setActiveOutstandingSubTab("Today");
    }
    if (newTab === "Total Payroll") {
      setActivePayrollSubTab("Prev Month");
    }
    if (newTab === "Expenses") {
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
      const response = await axios.get(
        `${backendUrl}/api/expenses`,
        {
          params: { period },
        }
      );
      console.log("API Response:", response);
      
      // Handle the API response structure properly
      let expenses = [];
      
      if (response.data && response.data.success) {
        // If response has success and data properties
        expenses = response.data.data || [];
      } else if (Array.isArray(response.data)) {
        // If response is directly an array
        expenses = response.data;
      } else if (response.data && response.data.expenses) {
        // If response has expenses property
        expenses = response.data.expenses;
      }
      
      console.log("Processed expenses:", expenses);
      
      // Ensure we have an array and format the data properly
      const formattedExpenses = Array.isArray(expenses) ? expenses.map(expense => ({
        id: expense._id || expense.id,
        category: typeof expense.category === 'string' ? expense.category : 
                 (expense.category?.name || expense.category?.category || 'Uncategorized'),
        amount: expense.amount || 0,
        date: expense.date || expense.createdAt || new Date().toISOString().split('T')[0],
        description: expense.description || expense.remarks || 'No description',
        details: expense.details || [`Amount: ₹${expense.amount || 0}`, `Date: ${expense.date || 'N/A'}`]
      })) : [];
      
      // Sort by amount descending to show highest expenses first
      const sortedExpenses = formattedExpenses.sort((a, b) => b.amount - a.amount);
      
      setExpenseTableData(sortedExpenses);
    } catch (error) {
      console.error("Error fetching expense table data:", error);
      // Fallback to mock data for testing
      const mockExpenses = [
        {
          id: 1,
          category: "Office Supplies",
          amount: 1500,
          date: "2024-01-15",
          description: "Printer paper and stationery",
          details: ["Printer paper: ₹800", "Pens: ₹300", "Notebooks: ₹400"]
        },
        {
          id: 2,
          category: "Utilities",
          amount: 2500,
          date: "2024-01-14",
          description: "Electricity and water bill",
          details: ["Electricity: ₹1800", "Water: ₹700"]
        },
        {
          id: 3,
          category: "Travel",
          amount: 3200,
          date: "2024-01-13",
          description: "Client meeting travel expenses",
          details: ["Flight: ₹2200", "Hotel: ₹800", "Transport: ₹200"]
        },
        {
          id: 4,
          category: "Marketing",
          amount: 1800,
          date: "2024-01-12",
          description: "Digital marketing campaign",
          details: ["Google Ads: ₹1200", "Social Media: ₹600"]
        },
        {
          id: 5,
          category: "Equipment",
          amount: 2800,
          date: "2024-01-11",
          description: "New office equipment",
          details: ["Laptop: ₹2000", "Monitor: ₹800"]
        }
      ].sort((a, b) => b.amount - a.amount);
      
      setExpenseTableData(mockExpenses);
    } finally {
      setLoadingExpenseData(false);
    }
  };

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

  const handlePanelIconClick = () => {
    if (
      activeTab === "Sales" ||
      activeTab === "Outstanding" ||
      activeTab === "Expenses"
    ) {
      setShowAllMRsInSidePanel((prev) => !prev);
      setSidePanelCurrentPage(1);
    }
  };

  const handleSidePanelPageChange = (newPage) => {
    setSidePanelCurrentPage(newPage);
  };

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

  useEffect(() => {
    if (activeTab === "Sales") {
      fetchSalesTableData(activeSalesSubTab);
    }
  }, [activeSalesSubTab, activeTab]);

  useEffect(() => {
    if (activeTab === "Outstanding") {
      fetchOutstandingTableData(activeOutstandingSubTab);
    }
  }, [activeOutstandingSubTab, activeTab]);

  useEffect(() => {
    if (activeTab === "Expenses") {
      console.log("Fetching expense data for period:", activeExpenseSubTab);
      fetchExpenseTableData(activeExpenseSubTab);
    }
  }, [activeExpenseSubTab, activeTab]);

  // Initial fetch when component mounts
  useEffect(() => {
    // Fetch initial expense data
    fetchExpenseTableData("Month");
  }, []);

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
              onSalesSubTabChange={setActiveSalesSubTab}
              onExpenseSubTabChange={setActiveExpenseSubTab}
              onPayrollSubTabChange={setActivePayrollSubTab}
              onOutstandingSubTabChange={setActiveOutstandingSubTab}
              dateRanges={dateRanges}
              prevMonthRanges={prevMonthRanges}
            />

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
                  expenseTableData={expenseTableData}
                  loadingExpenseData={loadingExpenseData}
                  stockData={stockData}
                  expenseData={expenseData}
                  mrList={mrList}
                  onViewProducts={handleViewProducts}
                  onViewInvoices={handleViewInvoices}
                  onViewExpenseDetails={handleViewExpenseDetails}
                />
              </div>

              <div className="lg:col-span-2">{renderMainTable()}</div>
            </div>
          </div>
        </main>
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
    </div>
  );
};

export default Dashboard;