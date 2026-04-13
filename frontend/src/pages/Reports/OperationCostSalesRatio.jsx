import React, { useState, useEffect, useRef } from "react";
import {
  TrendingDown,
  DollarSign,
  Calculator,
  FileDown,
  Filter,
  Scale,
  BarChart3,
  X,
  Menu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const OperationCostSalesRatio = () => {
  const [data, setData] = useState({
    summary: { operationCost: 0, totalSales: 0, ratio: 0, totalProfit: 0 },
    records: [],
    totals: {
      totalSale: 0,
      totalCOG: 0,
      totalExpense: 0,
      totalPayroll: 0,
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
  const [expandedRecord, setExpandedRecord] = useState(null);

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

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
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    if (currentMonth === 0) return `Jan - Dec ${currentYear - 1}`;
    return `Jan - ${getPreviousMonthName()} ${currentYear}`;
  };

  const getDateRange = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (selectedTab) {
      case "currentMonth": {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
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
  };

  const fetchData = async (page = 1) => {
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

      const params = { page, limit: itemsPerPage, dateFilter: selectedTab };
      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/operation-cost-sales-ratio`,
        { params },
      );

      if (response.data.success) {
        const summary = response.data.data?.summary || {};
        setData({
          summary: {
            operationCost: parseFloat(summary.operationCost) || 0,
            totalSales: parseFloat(summary.totalSales) || 0,
            ratio: parseFloat(summary.ratio) || 0,
            totalProfit: parseFloat(summary.totalProfit) || 0,
          },
          records: response.data.data?.records || [],
          totals: response.data.data?.totals || {
            totalSale: 0,
            totalCOG: 0,
            totalExpense: 0,
            totalPayroll: 0,
            totalProfit: 0,
            totalSaleCount: 0,
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
      console.error("Error fetching data:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to fetch data",
      );
      setData({
        summary: { operationCost: 0, totalSales: 0, ratio: 0, totalProfit: 0 },
        records: [],
        totals: {
          totalSale: 0,
          totalCOG: 0,
          totalExpense: 0,
          totalPayroll: 0,
          totalProfit: 0,
          totalSaleCount: 0,
        },
      });
      setPagination({
        currentPage: 1,
        totalPages: 1,
        totalRecords: 0,
        hasNext: false,
        hasPrev: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) {
        fetchData(1);
      } else {
        setData({
          summary: {
            operationCost: 0,
            totalSales: 0,
            ratio: 0,
            totalProfit: 0,
          },
          records: [],
          totals: {
            totalSale: 0,
            totalCOG: 0,
            totalExpense: 0,
            totalPayroll: 0,
            totalProfit: 0,
            totalSaleCount: 0,
          },
        });
        setPagination({
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        });
      }
    } else {
      fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchData(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }
    setExportLoading(true);
    try {
      const dateRange = getDateRange();
      const params = { dateFilter: selectedTab };
      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
      }
      const response = await axios.get(
        `${backendUrl}/api/reports/operation-cost-sales-ratio/export`,
        { params, responseType: "blob" },
      );
      let filename = "operation-cost-sales-ratio-report.xlsx";
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
      if (error.response?.status === 404) {
        showToast("warning", "No data found for the selected filters");
      } else {
        showToast("error", "Failed to export Excel report");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    const num = parseFloat(amount);
    return isNaN(num)
      ? "$0.00"
      : `$${num.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
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
    if (ratio <= 0.3) return "text-green-600";
    if (ratio <= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getPercentageColor = (percentage) => {
    if (percentage < 10) return "bg-green-100 text-green-800";
    if (percentage < 20) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const toggleRecordExpand = (index) => {
    setExpandedRecord(expandedRecord === index ? null : index);
  };

  // ── Pagination (like DailyReports) ─────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          visiblePages.map((page, idx) => (
            <button
              key={idx}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              disabled={page === "..."}
              className={`px-4 py-2 rounded text-sm ${
                page === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : pagination.currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
              }`}
            >
              {page}
            </button>
          ))
        ) : (
          <span className="px-3 py-1 text-sm text-gray-700 font-medium">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
        )}
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage === pagination.totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  // ── Mobile Record Card ─────────────────────────────────────────────────────
  const MobileRecordCard = ({ record, index }) => {
    const isExpanded = expandedRecord === index;
    const percentage = parseFloat(record.percentage) || 0;

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">
              #{getSerialNumber(index)}
            </span>
            <span className="font-semibold text-gray-800 text-sm">
              Record #{index + 1}
            </span>
          </div>
          <button
            onClick={() => toggleRecordExpand(index)}
            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Card Stats Grid */}
        <div className="grid grid-cols-2 gap-px bg-gray-100">
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Sale ($)</div>
            <div className="font-bold text-blue-600 text-sm">
              {formatCurrency(record.sale)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">COG ($)</div>
            <div className="font-semibold text-red-600 text-sm">
              {formatCurrency(record.cog)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Expense ($)</div>
            <div className="font-semibold text-orange-600 text-sm">
              {formatCurrency(record.expense)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Payroll ($)</div>
            <div className="font-semibold text-purple-600 text-sm">
              {formatCurrency(record.payroll)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Percentage (%)</div>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getPercentageColor(percentage)}`}
            >
              {formatPercentage(percentage)}
            </span>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Profit ($)</div>
            <div className="font-semibold text-green-600 text-sm">
              {formatCurrency(record.profit)}
            </div>
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="px-4 py-4 bg-blue-50 border-t border-blue-100">
            <h4 className="font-semibold text-gray-800 mb-2 text-sm">
              Detailed Breakdown
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-blue-200">
                <span className="text-xs text-gray-600">Operation Cost</span>
                <span className="font-semibold text-red-600 text-sm">
                  {formatCurrency(record.expense + record.payroll)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-xs text-gray-600">Profit Margin</span>
                <span className="font-semibold text-green-600 text-sm">
                  {((record.profit / record.sale) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const tabs = [
    { key: "currentMonth", label: "Current Month" },
    { key: "janToPreviousMonth", label: "Jan - Prev Month" },
    { key: "all", label: "All Records" },
    { key: "custom", label: "Custom" },
  ];

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* ── Sidebar (mobile only) ── */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Calculator className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">
              Op Cost / Sales
            </h1>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Calculator className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Operation Cost / Sales Ratio Report
              </h1>
              <p className="text-sm text-gray-600">
                Analyze operational efficiency by comparing operation costs to
                total sales
              </p>
            </div>
          </div>
          <button
            onClick={exportToExcel}
            disabled={exportLoading || data.records.length === 0}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md transition-colors min-w-[140px]"
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
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${
                selectedTab === key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter:</span>
          <span className="font-medium text-indigo-700">
            {getDateRange().displayDate}
          </span>
        </div>
      </div>

      {/* ── Summary Cards (responsive) ── */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-6 mb-6"}`}
      >
        <div
          className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-red-500 border border-gray-200`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Operation Cost
              </p>
              <div
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {loading ? (
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.operationCost)
                )}
              </div>
              {!isMobileView && (
                <div className="flex gap-2 mt-1">
                  <p className="text-xs text-gray-500">
                    Expense: {formatCurrency(data.totals.totalExpense)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Payroll: {formatCurrency(data.totals.totalPayroll)}
                  </p>
                </div>
              )}
            </div>
            <TrendingDown
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-red-500`}
            />
          </div>
        </div>

        <div
          className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Total Sales
              </p>
              <div
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {loading ? (
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.totalSales)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  {data.totals.totalSaleCount} invoices
                </p>
              )}
            </div>
            <DollarSign
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
            />
          </div>
        </div>

        <div
          className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Op Cost / Sales Ratio
              </p>
              <div
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold mt-1 ${getRatioColor(data.summary.ratio)}`}
              >
                {loading ? (
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatRatio(data.summary.ratio)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatPercentage(data.summary.ratio * 100)}
                </p>
              )}
            </div>
            <Scale
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
            />
          </div>
        </div>

        <div
          className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200`}
        >
          <div className="flex justify-between items-center">
            <div>
              <p
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Profit
              </p>
              <div
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {loading ? (
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  formatCurrency(data.summary.totalProfit)
                )}
              </div>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  COGS: {formatCurrency(data.totals.totalCOG)}
                </p>
              )}
            </div>
            <BarChart3
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
            />
          </div>
        </div>
      </div>

      {/* ── Mobile: Card List ── */}
      {isMobileView ? (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : data.records.length > 0 ? (
            data.records.map((record, index) => (
              <MobileRecordCard key={index} record={record} index={index} />
            ))
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
              <Calculator className="mx-auto text-gray-400 mb-3" size={40} />
              <h3 className="text-base font-medium text-gray-900">
                No data found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {selectedTab === "custom" &&
                (!customDateRange.startDate || !customDateRange.endDate)
                  ? "Please select start and end dates to view data."
                  : "No data available for the selected date range."}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Desktop: Table ── */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 text-sm font-medium">Sr.No</th>
                <th className="p-3 text-sm font-medium">Sale ($)</th>
                <th className="p-3 text-sm font-medium">COG ($)</th>
                <th className="p-3 text-sm font-medium">Expense ($)</th>
                <th className="p-3 text-sm font-medium">Payroll ($)</th>
                <th className="p-3 text-sm font-medium">Percentage (%)</th>
                <th className="p-3 text-sm font-medium">Profit ($)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                      <span className="text-gray-600">Loading data...</span>
                    </div>
                  </td>
                </tr>
              ) : data.records.length > 0 ? (
                data.records.map((record, index) => {
                  const percentage = parseFloat(record.percentage) || 0;
                  return (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${
                        index === data.records.length - 1 ? "" : "border-b"
                      }`}
                    >
                      <td className="p-3 text-sm text-gray-600 font-medium">
                        {getSerialNumber(index)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-blue-600">
                        {formatCurrency(record.sale)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-red-600">
                        {formatCurrency(record.cog)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-orange-600">
                        {formatCurrency(record.expense)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-purple-600">
                        {formatCurrency(record.payroll)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getPercentageColor(percentage)}`}
                        >
                          {formatPercentage(percentage)}
                        </span>
                      </td>
                      <td className="p-3 text-sm font-semibold text-green-600">
                        {formatCurrency(record.profit)}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center">
                    <Calculator className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No data found
                    </h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      {selectedTab === "custom" &&
                      (!customDateRange.startDate || !customDateRange.endDate)
                        ? "Please select start and end dates to view data."
                        : "No data available for the selected date range."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {renderPagination()}

      {/* ── Custom Filter Modal ── */}
      {showCustomFilter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg mx-4">
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

export default OperationCostSalesRatio;
