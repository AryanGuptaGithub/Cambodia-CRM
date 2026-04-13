// pages/Reports/SalaryCOGSRatio.jsx
import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Search,
  X,
  Users,
  DollarSign,
  BarChart3,
  Percent,
  FileDown,
  Filter,
  Scale,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Sidebar from "../../components/Sidebar";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const EMPTY_SUMMARY = {
  totalSalary: 0,
  totalCOGS: 0,
  totalSales: 0,
  totalProfit: 0,
  totalExpense: 0,
  salaryCOGSRatio: 0,
  expenseCOGSRatio: 0,
  salarySaleRatio: 0,
  totalAllowance: 0,
  totalIncentive: 0,
  totalTourExpense: 0,
  totalTourAllowance: 0,
  profitMargin: 0,
  cogsPercentage: 0,
};
const EMPTY_PAGINATION = {
  currentPage: 1,
  totalPages: 1,
  totalRecords: 0,
  hasNext: false,
  hasPrev: false,
};

const SalaryCOGSRatio = () => {
  const [data, setData] = useState({
    summary: { ...EMPTY_SUMMARY },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [pagination, setPagination] = useState({ ...EMPTY_PAGINATION });

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const inputRef = useRef(null);
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  // ── date helpers ────────────────────────────────────────────────────────────
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
    return now.getMonth() === 0
      ? `Jan - Dec ${now.getFullYear() - 1}`
      : `Jan - ${getPreviousMonthName()} ${now.getFullYear()}`;
  };
  const getYearMonthFromDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  };

  const getDateRange = () => {
    const today = new Date();
    const y = today.getFullYear(),
      m = today.getMonth();
    switch (selectedTab) {
      case "all":
        return {
          startDate: null,
          endDate: null,
          period: null,
          displayDate: "All Records",
        };
      case "currentMonth": {
        const f = new Date(y, m, 1),
          l = new Date(y, m + 1, 0);
        return {
          startDate: f.toISOString().split("T")[0],
          endDate: l.toISOString().split("T")[0],
          period: `${y}-${(m + 1).toString().padStart(2, "0")}`,
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const j = new Date(y, 0, 1),
          lm = new Date(y, m, 0);
        return {
          startDate: j.toISOString().split("T")[0],
          endDate: lm.toISOString().split("T")[0],
          period: null,
          displayDate: getJanToPreviousMonthDisplay(),
        };
      }
      case "custom": {
        const ss = customDateRange.startDate
          ? customDateRange.startDate.toISOString().split("T")[0]
          : "";
        const es = customDateRange.endDate
          ? customDateRange.endDate.toISOString().split("T")[0]
          : "";
        return {
          startDate: ss,
          endDate: es,
          period: customDateRange.startDate
            ? getYearMonthFromDate(customDateRange.startDate)
            : null,
          displayDate: ss && es ? `${ss} - ${es}` : "Select custom dates",
        };
      }
      default:
        return {
          startDate: null,
          endDate: null,
          period: null,
          displayDate: "Current Month",
        };
    }
  };

  // ── fetch ───────────────────────────────────────────────────────────────────
  const fetchData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      const params = { page, limit: itemsPerPage, dateFilter: selectedTab };

      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          setLoading(false);
          showToast(
            "warning",
            "Please select both start and end dates for custom filter",
          );
          return;
        }
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        if (dateRange.period) params.period = dateRange.period;
      }
      if (search?.trim()) params.search = search.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/salary-cogs-ratio`,
        { params },
      );

      if (response.data.success) {
        const s = response.data.data?.summary || {};
        setData({
          summary: {
            totalSalary: parseFloat(s.totalSalary) || 0,
            totalCOGS: parseFloat(s.totalCOGS) || 0,
            totalSales: parseFloat(s.totalSales) || 0,
            totalProfit: parseFloat(s.totalProfit) || 0,
            totalExpense: parseFloat(s.totalExpense) || 0,
            salaryCOGSRatio: parseFloat(s.salaryCOGSRatio) || 0,
            expenseCOGSRatio: parseFloat(s.expenseCOGSRatio) || 0,
            salarySaleRatio: parseFloat(s.salarySaleRatio) || 0,
            totalAllowance: parseFloat(s.totalAllowance) || 0,
            totalIncentive: parseFloat(s.totalIncentive) || 0,
            totalTourExpense: parseFloat(s.totalTourExpense) || 0,
            totalTourAllowance: parseFloat(s.totalTourAllowance) || 0,
            profitMargin: parseFloat(s.profitMargin) || 0,
            cogsPercentage: parseFloat(s.cogsPercentage) || 0,
          },
          records: response.data.data?.records || [],
        });
        setPagination(response.data.pagination || { ...EMPTY_PAGINATION });
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          "Failed to fetch salary COGS ratio data",
      );
      setData({ summary: { ...EMPTY_SUMMARY }, records: [] });
      setPagination({ ...EMPTY_PAGINATION });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) fetchData(1);
      else {
        setData({ summary: { ...EMPTY_SUMMARY }, records: [] });
        setPagination({ ...EMPTY_PAGINATION });
      }
    } else {
      fetchData(1);
    }
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchData(1);
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchData(page);
  };
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchData(1);
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((p) => ({ ...p, [name]: date }));

  const handleApplyCustomFilter = () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }
    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }
    setSelectedTab("custom");
    setShowCustomFilter(false);
    fetchData(1);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") setShowCustomFilter(true);
    else {
      setCustomDateRange({ startDate: null, endDate: null });
      setShowCustomFilter(false);
    }
  };

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("currentMonth");
    setShowCustomFilter(false);
  };

  // ── export ──────────────────────────────────────────────────────────────────
  const exportToExcel = async () => {
    if (!data.records.length) {
      showToast("warning", "No data found to export");
      return;
    }
    setExportLoading(true);
    try {
      const dateRange = getDateRange();
      const params = {
        dateFilter: selectedTab,
        search: searchTerm.trim() || undefined,
        export: "true",
      };
      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        if (dateRange.period) params.period = dateRange.period;
      }
      const response = await axios.get(
        `${backendUrl}/api/reports/salary-cogs-ratio/export`,
        { params, responseType: "blob" },
      );
      let filename = "salary-cogs-ratio-report.xlsx";
      const cd = response.headers["content-disposition"];
      if (cd) {
        const m = cd.match(/filename="(.+)"/);
        if (m?.[1]) filename = m[1];
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      showToast(
        "error",
        error.response?.status === 404
          ? "No data found for the selected filters"
          : "Failed to export Excel report",
      );
    } finally {
      setExportLoading(false);
    }
  };

  // ── formatting ──────────────────────────────────────────────────────────────
  const getActiveFilterDisplay = () =>
    getDateRange().displayDate || "Current Month";
  const fmt$ = (v) => {
    const n = parseFloat(v);
    return isNaN(n)
      ? "$0.00"
      : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtPct = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? "0.00%" : `${n.toFixed(2)}%`;
  };
  const fmtRatio = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? "0.0000" : n.toFixed(4);
  };
  const formatDate = (d) => {
    if (!d) return "N/A";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return String(d);
    }
  };
  const ratioColor = (r) =>
    parseFloat(r) <= 0.5
      ? "text-green-600"
      : parseFloat(r) <= 1
        ? "text-yellow-600"
        : "text-red-600";
  const pctColor = (p) =>
    parseFloat(p) >= 50
      ? "text-green-600"
      : parseFloat(p) >= 30
        ? "text-yellow-600"
        : "text-red-600";

  // ── pagination (mobile optimized like DailyReports) ────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
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
                    : "bg-gray-200 hover:bg-gray-300"
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
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  // ── Summary cards (responsive) ──────────────────────────────────────────────
  const renderSummaryCards = () => {
    const cards = [
      {
        label: "Total Salary",
        value: fmt$(data.summary.totalSalary),
        sub: `${fmtPct(data.summary.salarySaleRatio * 100 || 0)} of Sales`,
        icon: (
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
        border: "border-blue-500",
      },
      {
        label: "Total COGS",
        value: fmt$(data.summary.totalCOGS),
        sub: `${fmtPct(data.summary.cogsPercentage || 0)} of Sales`,
        icon: (
          <DollarSign
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-red-500`}
          />
        ),
        border: "border-red-500",
      },
      {
        label: "Salary/COGS",
        value: fmtRatio(data.summary.salaryCOGSRatio),
        sub: "Lower is better",
        icon: (
          <Scale
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        ),
        border: "border-purple-500",
        valueClass: ratioColor(data.summary.salaryCOGSRatio),
      },
      {
        label: "Profit Margin",
        value: fmtPct(data.summary.profitMargin || 0),
        sub: `Profit: ${fmt$(data.summary.totalProfit)}`,
        icon: (
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
        border: "border-green-500",
        valueClass: pctColor(data.summary.profitMargin),
      },
    ];

    return (
      <div
        className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 mb-6"}`}
      >
        {cards.map(({ label, value, sub, icon, border, valueClass }) => (
          <div
            key={label}
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 ${border} border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                >
                  {label}
                </p>
                <p
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold mt-1 ${valueClass || "text-gray-800"}`}
                >
                  {loading ? (
                    <span
                      className={`block ${isMobileView ? "h-5 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                    />
                  ) : (
                    value
                  )}
                </p>
                <p
                  className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-500 mt-1`}
                >
                  {sub}
                </p>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Additional metrics cards ────────────────────────────────────────────────
  const renderAdditionalMetrics = () => {
    const metrics = [
      {
        label: "Total Sales",
        value: fmt$(data.summary.totalSales),
        icon: (
          <BarChart3
            className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"} text-gray-400`}
          />
        ),
      },
      {
        label: "Total Expense",
        value: fmt$(data.summary.totalExpense),
        icon: (
          <DollarSign
            className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"} text-gray-400`}
          />
        ),
      },
      {
        label: "Expense/COGS",
        value: fmtRatio(data.summary.expenseCOGSRatio),
        icon: (
          <Percent
            className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"} text-gray-400`}
          />
        ),
        valueClass: ratioColor(data.summary.expenseCOGSRatio),
      },
      {
        label: "Total Incentive",
        value: fmt$(data.summary.totalIncentive),
        icon: (
          <TrendingUp
            className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"} text-gray-400`}
          />
        ),
      },
    ];

    return (
      <div
        className={`grid ${isMobileView ? "grid-cols-2 gap-2 mb-4" : "grid-cols-1 md:grid-cols-4 gap-4 mb-6"}`}
      >
        {metrics.map(({ label, value, icon, valueClass }) => (
          <div
            key={label}
            className={`bg-white ${isMobileView ? "p-2" : "p-4"} rounded-lg shadow-md border`}
          >
            <div className="flex justify-between items-center">
              <div>
                <div
                  className={`${isMobileView ? "text-[10px]" : "text-sm"} text-gray-600`}
                >
                  {label}
                </div>
                <div
                  className={`${isMobileView ? "text-sm" : "text-lg"} font-bold ${valueClass || "text-gray-800"}`}
                >
                  {value}
                </div>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── render ──────────────────────────────────────────────────────────────────
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
            <Scale className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">Salary/COGS</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <Scale className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Salary / COGS Ratio Report
              </h1>
              <p className="text-sm text-gray-600">
                Analyze salary and expense efficiency against cost of goods sold
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search MR Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exportLoading || !data.records.length}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md min-w-[140px]"
            >
              {exportLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search MR Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Date tabs ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            {
              id: "currentMonth",
              label: isMobileView
                ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
                : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              id: "janToPreviousMonth",
              label: isMobileView
                ? getJanToPreviousMonthDisplay()
                    .replace("January", "Jan")
                    .replace("February", "Feb")
                    .replace("March", "Mar")
                : getJanToPreviousMonthDisplay(),
            },
            { id: "custom", label: "Custom" },
            { id: "all", label: "All" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === id ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
        >
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {renderSummaryCards()}
      {renderAdditionalMetrics()}

      {/* ── Table ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[600px]" : ""}`}
        >
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                #
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Date
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                MR
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                COGS
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Sales</th>
              )}
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Salary
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                S/COGS
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Profit%
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={isMobileView ? 7 : 8} className="p-8 text-center">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
                    <span className="text-gray-600">
                      Loading salary COGS ratio data...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => {
                const salary = parseFloat(record.salary) || 0;
                return (
                  <tr
                    key={`${record.mrId || record.mrName}-${index}`}
                    className={`hover:bg-gray-50 ${index === data.records.length - 1 ? "" : "border-b"}`}
                  >
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600 font-medium`}
                    >
                      {getSerialNumber(index)}
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600`}
                    >
                      {formatDate(record.srDate)}
                    </td>
                    <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>
                      <div className="font-medium text-gray-900 capitalize">
                        {record.mrName || "N/A"}
                      </div>
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-red-600`}
                    >
                      {fmt$(record.cogs)}
                    </td>
                    {!isMobileView && (
                      <td className="p-3 text-sm font-semibold text-blue-600">
                        {fmt$(record.totalSales)}
                      </td>
                    )}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-purple-600`}
                    >
                      {fmt$(salary)}
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold ${ratioColor(record.salaryCOGSRatio)}`}
                    >
                      {fmtRatio(record.salaryCOGSRatio)}
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold ${pctColor(record.profitMargin)}`}
                    >
                      {fmtPct(record.profitMargin)}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={isMobileView ? 7 : 8} className="p-8 text-center">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No data found
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    {selectedTab === "custom" &&
                    (!customDateRange.startDate || !customDateRange.endDate)
                      ? "Please select start and end dates"
                      : searchTerm
                        ? `No data found for "${searchTerm}". Try a different search term.`
                        : "No salary COGS ratio data available for the selected date range."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* ── Custom Filter Modal ── */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10 mx-4">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Custom Filter
              </h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(d) => handleCustomDateChange("startDate", d)}
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
                    onChange={(d) => handleCustomDateChange("endDate", d)}
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
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SalaryCOGSRatio;
