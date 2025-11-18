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
  Download,
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
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import axios from "axios";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";

// Import components and hooks
import ProductsModal from "./ProductModal";
import AllMRsSalaryModal from "./AllMRSalaryModal";
import { useDashboardData } from "./useDataboardData";
import { 
  formatCurrency, 
  getDateRanges, 
  getPreviousMonthRanges 
} from "./DashboardUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const Dashboard = () => {
  const navigate = useNavigate();
  const searchInputRef = useRef(null);

  // Use custom hook for data management
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

  // State management
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("Sales");
  const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
  const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
  const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
  const [activeOutstandingSubTab, setActiveOutstandingSubTab] = useState("Today");
  
  // Table data states
  const [salesTableData, setSalesTableData] = useState([]);
  const [loadingSalesData, setLoadingSalesData] = useState(false);
  const [outstandingTableData, setOutstandingTableData] = useState([]);
  const [loadingOutstandingData, setLoadingOutstandingData] = useState(false);

  // Modal states
  const [showProductsModal, setShowProductsModal] = useState(false);
  const [selectedMRProducts, setSelectedMRProducts] = useState([]);
  const [selectedMRName, setSelectedMRName] = useState("");
  const [showAllMRsModal, setShowAllMRsModal] = useState(false);
  const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);

  // Side panel state
  const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
  const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);

  // Constants
  const staffPerPage = 5;
  const sidePanelPerPage = 10;
  const dateRanges = useMemo(() => getDateRanges(), []);
  const prevMonthRanges = useMemo(() => getPreviousMonthRanges(), []);

  // User state
  const [user, setUser] = useState({
    name: "User",
    role: "User",
    initials: "U",
  });

  // Form state
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    enabled: "",
    _id: null,
  });

  // Fetch table data functions
  const fetchSalesTableData = async (period) => {
    try {
      setLoadingSalesData(true);
      const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
        params: { period },
      });
      if (response.data.success) {
        setSalesTableData(response.data.data);
      } else {
        setSalesTableData([]);
      }
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
        {
          params: { period },
        }
      );
      if (response.data.success) {
        setOutstandingTableData(response.data.data);
      } else {
        setOutstandingTableData([]);
      }
    } catch (error) {
      console.error("Error fetching outstanding table data:", error);
      setOutstandingTableData([]);
    } finally {
      setLoadingOutstandingData(false);
    }
  };

  // Modal handlers
  const handleViewProducts = (mrName, products) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(products);
    setShowProductsModal(true);
  };

  const handleViewOutstandingInvoices = (mrName, invoices) => {
    setSelectedMRName(mrName);
    setSelectedMRProducts(invoices);
    setShowProductsModal(true);
  };

  const handlePanelIconClick = () => {
    if (activeTab === "Sales") {
      setShowAllMRsInSidePanel((prev) => !prev);
      setSidePanelCurrentPage(1);
    } else if (activeTab === "Outstanding") {
      setShowAllMRsInSidePanel((prev) => !prev);
      setSidePanelCurrentPage(1);
    } else if (activeTab === "Total Payroll") {
      showToast("info", "Showing recent joins for Payroll");
    }
  };

  // Effects for data fetching
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

  // Helper functions
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

  const getCurrentOutstandingAmount = () => {
    switch (activeOutstandingSubTab) {
      case "Today":
        return outstandingData.todayOutstanding;
      case "Month":
        return outstandingData.monthlyOutstanding;
      case "Year":
        return outstandingData.yearOutstanding;
      default:
        return outstandingData.todayOutstanding;
    }
  };

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

  const getCurrentOutstandingGrowth = () => {
    switch (activeOutstandingSubTab) {
      case "Today":
        return outstandingData.todayGrowth;
      case "Month":
        return outstandingData.monthlyGrowth;
      case "Year":
        return outstandingData.yearGrowth;
      default:
        return outstandingData.todayGrowth;
    }
  };

  const getCurrentExpenseAmount = () => {
    switch (activeExpenseSubTab) {
      case "Month":
        return expenseData.monthlyExpense;
      case "Year":
        return expenseData.yearExpense;
      default:
        return expenseData.monthlyExpense;
    }
  };

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

  // DashboardCards Component
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
              <span
                className={
                  getCurrentGrowth() >= 0 ? "text-green-600" : "text-red-600"
                }
              >
                {getCurrentGrowth() >= 0 ? "↗" : "↘"}{" "}
                {getCurrentGrowth().toFixed(1)}%
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
              ${formatCurrency(getCurrentOutstandingAmount())}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {activeOutstandingSubTab} •{" "}
              <span
                className={
                  getCurrentOutstandingGrowth() >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }
              >
                {getCurrentOutstandingGrowth() >= 0 ? "↗" : "↘"}{" "}
                {getCurrentOutstandingGrowth().toFixed(1)}%
              </span>
            </p>
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
              {stockData.totalStock}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <span className="text-red-600">
                {stockData.lowStockItems?.length || 0} low stock
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

  // SidePanel Component
  const SidePanel = () => {
    // Recent Sales component for Sales tab
    const RecentSales = () => {
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

        return Object.values(mrSales).sort(
          (a, b) => b.totalAmount - a.totalAmount
        );
      }, [salesTableData]);

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
                    <ShoppingCart size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">
              {loadingSalesData ? "Loading..." : "No sales data found"}
            </p>
          )}

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
    const RecentOutstanding = () => {
      const mrWiseOutstanding = useMemo(() => {
        const mrOutstanding = {};

        outstandingTableData.forEach((outstanding) => {
          if (!mrOutstanding[outstanding.mrName]) {
            mrOutstanding[outstanding.mrName] = {
              mrName: outstanding.mrName,
              totalOutstanding: 0,
              invoices: [],
              customerCount: 0,
            };
          }
          mrOutstanding[outstanding.mrName].totalOutstanding +=
            outstanding.dueAmount;
          mrOutstanding[outstanding.mrName].invoices.push(outstanding);
          mrOutstanding[outstanding.mrName].customerCount += 1;
        });

        return Object.values(mrOutstanding).sort(
          (a, b) => b.totalOutstanding - a.totalOutstanding
        );
      }, [outstandingTableData]);

      const totalSidePanelPages = Math.ceil(
        mrWiseOutstanding.length / sidePanelPerPage
      );
      const currentSidePanelOutstanding = showAllMRsInSidePanel
        ? mrWiseOutstanding.slice(
            (sidePanelCurrentPage - 1) * sidePanelPerPage,
            sidePanelCurrentPage * sidePanelPerPage
          )
        : mrWiseOutstanding.slice(0, 5);

      const handleSidePanelPageChange = (newPage) => {
        setSidePanelCurrentPage(newPage);
      };

      return (
        <div className="space-y-3">
          {currentSidePanelOutstanding.length > 0 ? (
            currentSidePanelOutstanding.map((mrOutstanding, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 text-sm font-semibold">
                    {showAllMRsInSidePanel
                      ? (sidePanelCurrentPage - 1) * sidePanelPerPage +
                        index +
                        1
                      : index + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {mrOutstanding.mrName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mrOutstanding.customerCount} customer
                      {mrOutstanding.customerCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-right flex items-center gap-2">
                  <p className="text-sm font-semibold text-orange-600">
                    ${formatCurrency(mrOutstanding.totalOutstanding)}
                  </p>
                  <button
                    onClick={() =>
                      handleViewOutstandingInvoices(
                        mrOutstanding.mrName,
                        mrOutstanding.invoices
                      )
                    }
                    className="text-gray-400 hover:text-orange-600 transition-colors cursor-pointer p-1"
                    title="View Invoices"
                  >
                    <Eye size={16} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">
              {loadingOutstandingData
                ? "Loading..."
                : "No outstanding data found"}
            </p>
          )}

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

    // Low Stock for Stock in Hands tab
    const LowStock = () => (
      <div className="space-y-3">
        {stockData.lowStockItems?.slice(0, 5).map((item, index) => (
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
        {expenseData.latestExpenses?.slice(0, 5).map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
          >
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-sm font-semibold">
                {item.category?.substring(0, 2).toUpperCase() || "EX"}
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

    // Recent Joins component
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
          return showAllMRsInSidePanel
            ? "All Outstanding"
            : "Highest Outstanding by MR";
        case "Stock in Hands":
          return "Low Stock Items";
        case "Expense":
          return "Latest Expenses";
        case "Total Payroll":
          return "Recent Joins";
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
          return Calendar;
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
          return <RecentJoins />;
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
              activeTab === "Sales" || activeTab === "Outstanding"
                ? showAllMRsInSidePanel
                  ? "Show Top 5"
                  : "Show All"
                : activeTab === "Total Payroll"
                ? "View All MRs"
                : "View Details"
            }
          >
            {activeTab === "Sales" || activeTab === "Outstanding" ? (
              <Users className="w-5 h-5" />
            ) : (
              <PanelIcon className="w-5 h-5" />
            )}
          </button>
        </div>
        {renderPanelContent()}
      </div>
    );
  };

  // SubTabs Component
  const SubTabs = () => {
    if (
      activeTab !== "Sales" &&
      activeTab !== "Expense" &&
      activeTab !== "Total Payroll" &&
      activeTab !== "Outstanding"
    )
      return null;

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
    } else if (activeTab === "Outstanding") {
      tabs = [
        { key: "Today", label: dateRanges.today.label },
        { key: "Month", label: dateRanges.month.label },
        { key: "Year", label: dateRanges.year.rangeLabel },
      ];
    }

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
    } else if (activeTab === "Outstanding") {
      currentSubTab = activeOutstandingSubTab;
      setCurrentSubTab = setActiveOutstandingSubTab;
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

  // Sales Table Component
  const SalesTable = () => {
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

      Object.values(mrGroups).forEach((mr) => {
        mr.customerCount = mr.customers.size;
        mr.customers = Array.from(mr.customers);
      });

      return Object.values(mrGroups);
    }, [salesTableData]);

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
                onClick={() => {/* handle export */}}
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
                        <ShoppingCart size={20} />
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

  // Outstanding Table Component
  const OutstandingTable = () => {
    const groupedOutstandingData = useMemo(() => {
      const mrGroups = {};

      outstandingTableData.forEach((outstanding) => {
        if (!mrGroups[outstanding.mrName]) {
          mrGroups[outstanding.mrName] = {
            mrName: outstanding.mrName,
            totalOutstanding: 0,
            invoices: [],
            customerCount: 0,
            customers: new Set(),
          };
        }
        mrGroups[outstanding.mrName].totalOutstanding += outstanding.dueAmount;
        mrGroups[outstanding.mrName].invoices.push(outstanding);
        mrGroups[outstanding.mrName].customerCount += 1;
        if (outstanding.customerName) {
          mrGroups[outstanding.mrName].customers.add(outstanding.customerName);
        }
      });

      Object.values(mrGroups).forEach((mr) => {
        mr.customerCount = mr.customers.size;
        mr.customers = Array.from(mr.customers);
      });

      return Object.values(mrGroups);
    }, [outstandingTableData]);

    const getOutstandingTableTitle = () => {
      switch (activeOutstandingSubTab) {
        case "Today":
          return `Outstanding Details - ${dateRanges.today.label}`;
        case "Month":
          return `Outstanding Details - ${dateRanges.month.label}`;
        case "Year":
          return `Outstanding Details - ${dateRanges.year.rangeLabel}`;
        default:
          return `Outstanding Details - ${activeOutstandingSubTab}`;
      }
    };

    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-800">
                {getOutstandingTableTitle()}
              </h3>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {/* handle export */}}
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
              >
                <Download size={18} /> Export Outstanding
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
                  Customers
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Invoices
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Total Outstanding ($)
                </th>
                <th className="p-4 text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loadingOutstandingData ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    <div className="flex justify-center items-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                      <span className="ml-2">Loading outstanding data...</span>
                    </div>
                  </td>
                </tr>
              ) : groupedOutstandingData.length > 0 ? (
                groupedOutstandingData.map((mrOutstanding, index) => (
                  <tr
                    key={index}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="p-4 text-sm text-gray-600 capitalize">
                      {mrOutstanding.mrName}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {mrOutstanding.customerCount === 1 ? (
                        mrOutstanding.customers[0]
                      ) : (
                        <span>{mrOutstanding.customerCount} customers</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-gray-600">
                      {mrOutstanding.invoices.length === 1 ? (
                        mrOutstanding.invoices[0].invoiceNumber
                      ) : (
                        <span>{mrOutstanding.invoices.length} invoices</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-orange-600 font-semibold">
                      ${formatCurrency(mrOutstanding.totalOutstanding)}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() =>
                          handleViewOutstandingInvoices(
                            mrOutstanding.mrName,
                            mrOutstanding.invoices
                          )
                        }
                        className="text-gray-400 hover:text-orange-600 transition-colors cursor-pointer p-2"
                        title="View All Invoices"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">
                    No outstanding data found for {activeOutstandingSubTab}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Payroll Table Component
  const PayrollTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-xl font-semibold text-gray-800">
              Payroll Details -{" "}
              {activePayrollSubTab === "Prev Month"
                ? prevMonthRanges.prevMonth.label
                : prevMonthRanges.prevMonthYear.label}
            </h3>
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
                Contact No
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">Email</th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Basic Salary ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Allowances ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Deductions ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Net Salary ($)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payrollData.map((item, index) => (
              <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4 text-sm text-gray-600">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                      {item.employeeId?.medicalRepName
                        ? item.employeeId.medicalRepName
                            .substring(0, 2)
                            .toUpperCase()
                        : "MR"}
                    </div>
                    <span className="capitalize">
                      {item.employeeId?.medicalRepName}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.contactNo}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.email}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-blue-700">
                    {item.basicSalary || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-green-700">
                    {item.totalAllowance || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-red-700">
                    {item.deductions || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-purple-700">
                    {item.netSalary || 0}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {payrollData.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {loading ? "Loading..." : "No payroll data found"}
          </div>
        )}
      </div>
    </div>
  );

  // Main MRManagement Component
  const MRManagement = () => {
    const renderTable = () => {
      switch (activeTab) {
        case "Sales":
          return <SalesTable />;
        case "Outstanding":
          return <OutstandingTable />;
        case "Total Payroll":
          return <PayrollTable />;
        default:
          return <div>Table for {activeTab}</div>;
      }
    };

    return (
      <div className="space-y-6">
        {/* Dashboard Cards */}
        <DashboardCards />

        {/* Sub Tabs for Sales, Expense, Payroll, and Outstanding */}
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
                onClick={() => searchInputRef.current?.focus()}
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

      {/* Use the new modal components */}
      <ProductsModal
        showModal={showProductsModal}
        onClose={() => setShowProductsModal(false)}
        selectedMRName={selectedMRName}
        selectedMRProducts={selectedMRProducts}
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