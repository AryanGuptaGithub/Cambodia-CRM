// pages/Reports/TourExpenseSalesRatio.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp,
  DollarSign,
  BarChart3,
  Percent,
  FileDown,
  Filter,
  MapPin,
  X,
  ChevronLeft,
  ChevronRight,
  Users,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const TourExpenseSalesRatio = () => {
  const [data, setData] = useState({
    summary: {
      tourExpense: 0,
      tourAllowance: 0,
      incentive: 0,
      totalTourCost: 0,
      totalSales: 0,
      totalProfit: 0,
      ratio: 0,
    },
    records: [],
    totals: {
      totalSale: 0,
      totalCOG: 0,
      totalTourExpense: 0,
      totalTourAllowance: 0,
      totalIncentive: 0,
      totalProfit: 0,
      totalSaleCount: 0,
    },
  });

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  // ── MR Filter state ──
  const [viewMode, setViewMode] = useState("overall"); // "overall" | "mrWise"
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [selectedMrId, setSelectedMrId] = useState(""); // "" = all MRs

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  const itemsPerPage = 7;
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;
  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();
  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };
  const getJanToPreviousMonthDisplay = () => {
    const now = new Date();
    if (now.getMonth() === 0) return `Jan - Dec ${now.getFullYear() - 1}`;
    return `Jan - ${getPreviousMonthName()} ${now.getFullYear()}`;
  };

  const getDateRange = useCallback(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (selectedTab) {
      case "currentMonth": {
        const firstDay = new Date(Date.UTC(currentYear, currentMonth, 1));
        const lastDay = new Date(Date.UTC(currentYear, currentMonth + 1, 0));
        return {
          startDate: firstDay.toISOString().split("T")[0],
          endDate: lastDay.toISOString().split("T")[0],
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0);
        return {
          startDate: janFirst.toISOString().split("T")[0],
          endDate: lastMonthLastDay.toISOString().split("T")[0],
          displayDate: getJanToPreviousMonthDisplay(),
        };
      }
      case "all":
        return { startDate: null, endDate: null, displayDate: "All Records" };
      case "custom": {
        const startStr = customDateRange.startDate
          ? customDateRange.startDate.toISOString().split("T")[0]
          : "";
        const endStr = customDateRange.endDate
          ? customDateRange.endDate.toISOString().split("T")[0]
          : "";
        return {
          startDate: startStr,
          endDate: endStr,
          displayDate:
            startStr && endStr
              ? `${startStr} - ${endStr}`
              : "Select custom dates",
        };
      }
      default:
        return { startDate: null, endDate: null, displayDate: "All Records" };
    }
  }, [selectedTab, customDateRange]);

  // ── Fetch MR list for dropdown ──
  const fetchMRList = useCallback(async () => {
    setMrListLoading(true);
    try {
      const res = await axios.get(
        `${backendUrl}/api/reports/tour-expense-sales/mr-list`,
      );
      if (res.data.success) setMrList(res.data.data || []);
    } catch (err) {
      console.error("Error fetching MR list:", err);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMRList();
  }, [fetchMRList]);

  // ── Fetch main data ──
  const fetchData = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const dateRange = getDateRange();
        if (
          selectedTab === "custom" &&
          (!customDateRange.startDate || !customDateRange.endDate)
        ) {
          setLoading(false);
          return;
        }

        const params = {
          page,
          limit: itemsPerPage,
          dateFilter: selectedTab,
          viewMode,
        };
        if (selectedTab !== "all") {
          if (dateRange.startDate) params.startDate = dateRange.startDate;
          if (dateRange.endDate) params.endDate = dateRange.endDate;
        }
        if (selectedMrId) params.mrId = selectedMrId;

        const response = await axios.get(
          `${backendUrl}/api/reports/tour-expense-sales`,
          { params },
        );

        if (response.data.success) {
          const summary = response.data.data?.summary || {};
          const totalsRaw = response.data.data?.totals || {};
          setData({
            summary: {
              tourExpense: parseFloat(summary.tourExpense) || 0,
              tourAllowance: parseFloat(summary.tourAllowance) || 0,
              incentive: parseFloat(summary.incentive) || 0,
              totalTourCost: parseFloat(summary.totalTourCost) || 0,
              totalSales: parseFloat(summary.totalSales) || 0,
              totalProfit: parseFloat(summary.totalProfit) || 0,
              ratio: parseFloat(summary.ratio) || 0,
            },
            records: response.data.data?.records || [],
            totals: {
              totalSale: parseFloat(totalsRaw.totalSale) || 0,
              totalCOG: parseFloat(totalsRaw.totalCOG) || 0,
              totalTourExpense: parseFloat(totalsRaw.totalTourExpense) || 0,
              totalTourAllowance: parseFloat(totalsRaw.totalTourAllowance) || 0,
              totalIncentive: parseFloat(totalsRaw.totalIncentive) || 0,
              totalProfit: parseFloat(totalsRaw.totalProfit) || 0,
              totalSaleCount: parseInt(totalsRaw.totalSaleCount) || 0,
            },
          });
          setPagination(
            response.data.pagination || {
              currentPage: 1,
              totalPages: 1,
              totalRecords: 0,
              hasNext: false,
              hasPrev: false,
            },
          );
        } else {
          throw new Error(response.data.message || "Failed to fetch data");
        }
      } catch (error) {
        console.error("Error fetching tour expense data:", error);
        showToast(
          "error",
          error.response?.data?.message || "Failed to fetch data",
        );
      } finally {
        setLoading(false);
      }
    },
    [selectedTab, customDateRange, viewMode, selectedMrId, getDateRange],
  );

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) fetchData(1);
    } else {
      fetchData(1);
    }
  }, [selectedTab, viewMode, selectedMrId]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchData(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setCustomDateRange({ startDate: null, endDate: null });
      setShowCustomFilter(false);
    }
  };

  const handleApplyCustomFilter = () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }
    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }
    setShowCustomFilter(false);
    fetchData(1);
  };

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSelectedTab("currentMonth");
    setShowCustomFilter(false);
    setSelectedMrId("");
    setViewMode("overall");
  };

  const handleMRFilterChange = (mrId) => {
    setSelectedMrId(mrId);
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }
    setExportLoading(true);
    try {
      const dateRange = getDateRange();
      const params = { dateFilter: selectedTab, viewMode };
      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
      }
      if (selectedMrId) params.mrId = selectedMrId;

      const response = await axios.get(
        `${backendUrl}/api/reports/tour-expense-sales/export`,
        { params, responseType: "blob" },
      );
      let filename = "tour-expense-sales-ratio-report.xlsx";
      const cd = response.headers["content-disposition"];
      if (cd) {
        const match = cd.match(/filename="(.+)"/);
        if (match?.[1]) filename = match[1];
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      if (error.response?.status === 404)
        showToast("warning", "No data found for the selected filters");
      else showToast("error", "Failed to export Excel report");
    } finally {
      setExportLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount);
    return isNaN(num)
      ? "$0.00"
      : `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const formatPercentage = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.00%" : `${num.toFixed(2)}%`;
  };
  const formatRatio = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? "0.0000" : num.toFixed(4);
  };
  const getRatioColor = (ratio) => {
    if (ratio <= 0.1) return "text-green-600";
    if (ratio <= 0.2) return "text-yellow-600";
    return "text-red-600";
  };

  const selectedMRName = selectedMrId
    ? mrList.find((mr) => mr._id?.toString() === selectedMrId)?.mrName ||
      "Selected MR"
    : null;

  // ── Pagination (Daily Report Style) ───────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    const totalPages = pagination.totalPages;
    const currentPg = pagination.currentPage;

    // Generate visible pages for desktop
    const maxVisible = 5;
    let start = Math.max(1, currentPg - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div
        className={`mt-4 p-3 md:p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"} flex-wrap`}
      >
        <button
          onClick={() => fetchData(currentPg - 1)}
          disabled={currentPg === 1}
          className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Prev
        </button>

        {isMobileView ? (
          // Mobile: Simple page indicator (like Daily Reports)
          <span className="px-3 py-1.5 text-sm text-gray-700 font-medium">
            Page {currentPg} of {totalPages}
          </span>
        ) : (
          // Desktop: Full pagination with numbers
          pages.map((page) => (
            <button
              key={page}
              onClick={() => fetchData(page)}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded text-sm transition cursor-pointer ${
                currentPg === page
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))
        )}

        <button
          onClick={() => fetchData(currentPg + 1)}
          disabled={currentPg === totalPages}
          className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    );
  };

  const tabs = [
    {
      key: "currentMonth",
      label: `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
    },
    { key: "janToPreviousMonth", label: getJanToPreviousMonthDisplay() },
    { key: "all", label: "All Records" },
    { key: "custom", label: "Custom Filter" },
  ];

  const isMRWise = viewMode === "mrWise";

  return (
    <div className={`${isMobileView ? "p-3 pb-6" : "p-6"} relative`}>
      {/* Sidebar (mobile only) */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">
              Tour Expense Ratio
            </h1>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Tour Expense / Sales Ratio Report
              </h1>
              <p className="text-sm text-gray-600">
                Analyze tour expenses, allowances & incentives against total
                sales
              </p>
            </div>
          </div>
          {/* Export button — desktop only */}
          <button
            onClick={exportToExcel}
            disabled={exportLoading || data.records.length === 0}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md transition-colors min-w-[140px] cursor-pointer"
          >
            {exportLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <FileDown size={18} />
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Date Filter Tabs ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === key ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {isMobileView && label.length > 30
                ? label.substring(0, 20) + "..."
                : label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm text-gray-600">
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter:</span>
          <span className="font-medium text-indigo-700">
            {getDateRange().displayDate}
          </span>
          {selectedMRName && (
            <>
              <span className="text-gray-400">|</span>
              <span className="font-medium text-purple-700">
                MR: {selectedMRName}
              </span>
              <button
                onClick={() => setSelectedMrId("")}
                className="ml-1 text-gray-400 hover:text-red-500 cursor-pointer"
              >
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── View Mode & MR Filter Row ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-6 border border-gray-200`}
      >
        <div className="flex flex-col gap-4">
          {/* View Mode toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-xs md:text-sm font-medium text-gray-700">
              View Mode:
            </span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => setViewMode("overall")}
                className={`${isMobileView ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} transition-colors cursor-pointer ${viewMode === "overall" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                Overall
              </button>
              <button
                onClick={() => {
                  setViewMode("mrWise");
                  setSelectedMrId("");
                }}
                className={`${isMobileView ? "px-3 py-1 text-xs" : "px-4 py-1.5 text-sm"} transition-colors cursor-pointer ${viewMode === "mrWise" ? "bg-indigo-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                MR-wise
              </button>
            </div>
          </div>

          {/* MR dropdown filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs md:text-sm font-medium text-gray-700 whitespace-nowrap">
              Filter by MR:
            </span>
            <select
              value={selectedMrId}
              onChange={(e) => handleMRFilterChange(e.target.value)}
              disabled={mrListLoading}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs md:text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white min-w-[200px] cursor-pointer"
            >
              <option value="">
                {mrListLoading
                  ? "Loading MRs..."
                  : "All Medical Representatives"}
              </option>
              {mrList.map((mr) => (
                <option key={mr._id} value={mr._id}>
                  {mr.mrName} ({mr.count} entries)
                </option>
              ))}
            </select>
            {selectedMrId && (
              <button
                onClick={() => setSelectedMrId("")}
                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-xs hover:bg-red-200 transition-colors cursor-pointer"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* MR count badge */}
          {mrList.length > 0 && !isMobileView && (
            <div className="text-xs text-gray-500">
              {mrList.length} MR{mrList.length !== 1 ? "s" : ""} with tour
              expenses
            </div>
          )}
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-6">
        {/* Tour Expense Card */}
        <div className="bg-white p-3 md:p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600 font-semibold">
                Tour Expense
              </p>
              <div className="text-base md:text-2xl font-bold text-gray-800">
                {loading ? (
                  <div className="h-5 md:h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.tourExpense)
                )}
              </div>
              {!isMobileView && (
                <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                  <p className="text-blue-600 font-medium">
                    Rent Expense - Vans
                  </p>
                  <p className="text-blue-600 font-medium">
                    Tour Petrol Expense
                  </p>
                </div>
              )}
            </div>
            <MapPin className="w-5 h-5 md:w-8 md:h-8 text-blue-500" />
          </div>
        </div>

        {/* Tour Allowance Card */}
        <div className="bg-white p-3 md:p-6 rounded-xl shadow-md border-l-4 border-amber-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600 font-semibold">
                Tour Allowance
              </p>
              <div className="text-base md:text-2xl font-bold text-gray-800">
                {loading ? (
                  <div className="h-5 md:h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.tourAllowance)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-amber-600 font-medium mt-1">
                  Daily Allowance (MRs / Drivers / Supervisors)
                </p>
              )}
            </div>
            <DollarSign className="w-5 h-5 md:w-8 md:h-8 text-amber-500" />
          </div>
        </div>

        {/* Incentive Card */}
        <div className="bg-white p-3 md:p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600 font-semibold">
                Incentive
              </p>
              <div className="text-base md:text-2xl font-bold text-gray-800">
                {loading ? (
                  <div className="h-5 md:h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.incentive)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-green-600 font-medium mt-1">
                  Sales & Other Incentives for Sales Team
                </p>
              )}
            </div>
            <BarChart3 className="w-5 h-5 md:w-8 md:h-8 text-green-500" />
          </div>
        </div>

        {/* Ratio Card */}
        <div className="bg-white p-3 md:p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600 font-semibold">
                Expense / Sales Ratio
              </p>
              <div
                className={`text-base md:text-2xl font-bold mt-1 ${getRatioColor(data.summary.ratio)}`}
              >
                {loading ? (
                  <div className="h-5 md:h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatRatio(data.summary.ratio)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatPercentage(data.summary.ratio * 100)} of Total Sales
                </p>
              )}
            </div>
            <Percent className="w-5 h-5 md:w-8 md:h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* ── Extra Summary Row (Mobile: 2 columns, Desktop: 3 columns) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="bg-white p-3 md:p-4 rounded-lg shadow-md border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600">Total Sales</p>
              <p className="text-sm md:text-lg font-bold text-gray-800">
                {formatCurrency(data.summary.totalSales)}
              </p>
              <p className="text-xs text-gray-500">
                {data.totals.totalSaleCount} invoices
              </p>
            </div>
            <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          </div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow-md border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600">
                Total Tour Cost
              </p>
              <p className="text-sm md:text-lg font-bold text-gray-800">
                {formatCurrency(data.summary.totalTourCost)}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500">
                  Expense + Allowance + Incentive
                </p>
              )}
            </div>
            <MapPin className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          </div>
        </div>
        <div className="bg-white p-3 md:p-4 rounded-lg shadow-md border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm text-gray-600">Profit</p>
              <p className="text-sm md:text-lg font-bold text-green-600">
                {formatCurrency(data.summary.totalProfit)}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500">
                  COGS: {formatCurrency(data.totals.totalCOG)}
                </p>
              )}
            </div>
            <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[600px]" : ""}`}
        >
          <thead className="bg-gray-100 text-gray-700 border-b">
            {isMRWise ? (
              <tr>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Sr.No
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium text-left`}
                >
                  Medical Representative
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Tour Expense ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Sale ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Ratio (%)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Profit ($)
                </th>
                {!isMobileView && (
                  <th className="p-3 text-sm font-medium">
                    Entries
                    <div className="text-xs font-normal text-gray-500">
                      Count
                    </div>
                  </th>
                )}
              </tr>
            ) : (
              <tr>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Sr.No
                </th>
                {selectedMrId && !isMobileView && (
                  <th className="p-3 text-sm font-medium text-left">
                    Medical Representative
                  </th>
                )}
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Sale ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Tour Expense ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Tour Allowance ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Incentive ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Total Cost ($)
                </th>
                <th
                  className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                >
                  Ratio (%)
                </th>
                {!isMobileView && (
                  <th className="p-3 text-sm font-medium">Profit ($)</th>
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={
                    isMRWise
                      ? isMobileView
                        ? 6
                        : 7
                      : isMobileView
                        ? 8
                        : selectedMrId
                          ? 9
                          : 8
                  }
                  className="p-8 text-center"
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 md:h-12 md:w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <span className="text-xs md:text-sm text-gray-600">
                      Loading data...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              <>
                {data.records.map((record, index) => {
                  if (isMRWise) {
                    const tourExpense = parseFloat(record.tourExpense) || 0;
                    const sale = parseFloat(record.sale) || 0;
                    const profit = parseFloat(record.profit) || 0;
                    const percentage = parseFloat(record.percentage) || 0;
                    return (
                      <tr
                        key={index}
                        className={`hover:bg-gray-50 ${index !== data.records.length - 1 ? "border-b" : ""}`}
                      >
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600 font-medium`}
                        >
                          {getSerialNumber(index)}
                        </td>
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-left`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-indigo-700 text-xs font-bold">
                                {(record.mrName || "?").charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="font-semibold text-gray-800 text-xs md:text-sm">
                              {record.mrName || "Unknown MR"}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-purple-600`}
                        >
                          {formatCurrency(tourExpense)}
                        </td>
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-blue-600`}
                        >
                          {formatCurrency(sale)}
                        </td>
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                        >
                          <span
                            className={`inline-flex items-center px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-medium ${percentage < 10 ? "bg-green-100 text-green-800" : percentage < 20 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                          >
                            {formatPercentage(percentage)}
                          </span>
                        </td>
                        <td
                          className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-green-600`}
                        >
                          {formatCurrency(profit)}
                        </td>
                        {!isMobileView && (
                          <td className="p-3 text-sm text-gray-600">
                            {record.expenseCount || 0}
                          </td>
                        )}
                      </tr>
                    );
                  }

                  // Overall mode row
                  const tourExpense = parseFloat(record.tourExpense) || 0;
                  const tourAllowance = parseFloat(record.tourAllowance) || 0;
                  const incentive = parseFloat(record.incentive) || 0;
                  const totalTourCost =
                    parseFloat(record.totalTourCost) ||
                    tourExpense + tourAllowance + incentive;
                  const sale = parseFloat(record.sale) || 0;
                  const profit = parseFloat(record.profit) || 0;
                  const percentage = parseFloat(record.percentage) || 0;

                  return (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${index !== data.records.length - 1 ? "border-b" : ""}`}
                    >
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600 font-medium`}
                      >
                        {getSerialNumber(index)}
                      </td>
                      {selectedMrId && !isMobileView && (
                        <td className="p-3 text-sm text-left">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-purple-700 text-xs font-bold">
                                {(selectedMRName || "?")
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                            </div>
                            <span className="font-semibold text-gray-800">
                              {selectedMRName}
                            </span>
                          </div>
                        </td>
                      )}
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-blue-600`}
                      >
                        {formatCurrency(sale)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-purple-600`}
                      >
                        {formatCurrency(tourExpense)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-amber-600`}
                      >
                        {formatCurrency(tourAllowance)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-green-600`}
                      >
                        {formatCurrency(incentive)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-bold text-gray-900`}
                      >
                        {formatCurrency(totalTourCost)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                      >
                        <span
                          className={`inline-flex items-center px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-medium ${percentage < 10 ? "bg-green-100 text-green-800" : percentage < 20 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                        >
                          {formatPercentage(percentage)}
                        </span>
                      </td>
                      {!isMobileView && (
                        <td className="p-3 text-sm font-semibold text-green-600">
                          {formatCurrency(profit)}
                        </td>
                      )}
                    </tr>
                  );
                })}

                {/* MR-wise totals footer row - Desktop only */}
                {isMRWise && data.records.length > 1 && !isMobileView && (
                  <tr className="bg-amber-50 border-t-2 border-amber-200 font-bold">
                    <td className="p-3 text-sm" colSpan={2}>
                      TOTAL ({data.records.length} MRs)
                    </td>
                    <td className="p-3 text-sm text-purple-700">
                      {formatCurrency(
                        data.records.reduce(
                          (s, r) => s + (parseFloat(r.tourExpense) || 0),
                          0,
                        ),
                      )}
                    </td>
                    <td className="p-3 text-sm text-blue-700">
                      {formatCurrency(data.totals.totalSale)}
                    </td>
                    <td className="p-3 text-sm">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {formatPercentage(
                          data.totals.totalSale > 0
                            ? (data.totals.totalTourExpense /
                                data.totals.totalSale) *
                                100
                            : 0,
                        )}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-green-700">
                      {formatCurrency(data.totals.totalProfit)}
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {data.records.reduce(
                        (s, r) => s + (parseInt(r.expenseCount) || 0),
                        0,
                      )}
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <tr>
                <td
                  colSpan={
                    isMRWise
                      ? isMobileView
                        ? 6
                        : 7
                      : isMobileView
                        ? 8
                        : selectedMrId
                          ? 9
                          : 8
                  }
                  className="p-8 text-center"
                >
                  <BarChart3 className="w-10 h-10 md:w-16 md:h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-base md:text-lg font-medium text-gray-900 mb-2">
                    No data found
                  </h3>
                  <p className="text-xs md:text-sm text-gray-500 max-w-md mx-auto">
                    {selectedTab === "custom" &&
                    (!customDateRange.startDate || !customDateRange.endDate)
                      ? "Please select start and end dates to view data."
                      : selectedMrId
                        ? `No tour expense data found for ${selectedMRName} in the selected period.`
                        : "No tour expense data available for the selected date range."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* ── Custom Filter Modal ── */}
      {showCustomFilter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 px-4">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Custom Filter
              </h2>
              <button
                onClick={() => setShowCustomFilter(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <DatePicker
                  selected={customDateRange.startDate}
                  onChange={(date) =>
                    setCustomDateRange((prev) => ({ ...prev, startDate: date }))
                  }
                  selectsStart
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="Start date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <DatePicker
                  selected={customDateRange.endDate}
                  onChange={(date) =>
                    setCustomDateRange((prev) => ({ ...prev, endDate: date }))
                  }
                  selectsEnd
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  minDate={customDateRange.startDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="End date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <button
                onClick={handleClearFilters}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
              >
                Clear All
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TourExpenseSalesRatio;
