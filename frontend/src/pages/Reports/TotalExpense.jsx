import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  PieChart,
  Download,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Detail Modal (Responsive)
const DetailModal = ({ isOpen, onClose, title, records, isMobileView }) => {
  if (!isOpen) return null;

  const total = records.reduce((sum, r) => sum + (r.amount || 0), 0);
  const thClass = isMobileView ? "px-3 py-2 text-[10px]" : "px-4 py-3 text-xs";
  const tdClass = isMobileView ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm";

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex justify-center items-center z-50 p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b bg-indigo-50">
          <div>
            <h2
              className={`${isMobileView ? "text-base" : "text-lg"} font-bold text-indigo-800`}
            >
              {title} — Records
            </h2>
            <p className="text-xs text-indigo-500 mt-0.5">
              {records.length} record{records.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
          >
            <X size={isMobileView ? 18 : 20} />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh]">
          {records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No records found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th
                      className={`${thClass} text-left font-semibold text-gray-700`}
                    >
                      #
                    </th>
                    <th
                      className={`${thClass} text-left font-semibold text-gray-700`}
                    >
                      Date
                    </th>
                    <th
                      className={`${thClass} text-left font-semibold text-gray-700`}
                    >
                      Description
                    </th>
                    <th
                      className={`${thClass} text-right font-semibold text-gray-700`}
                    >
                      Amount ($)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((rec, idx) => (
                    <tr
                      key={rec._id || idx}
                      className={`border-b last:border-0 hover:bg-gray-50 ${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                    >
                      <td className={`${tdClass} text-gray-500`}>{idx + 1}</td>
                      <td
                        className={`${tdClass} text-gray-700 whitespace-nowrap`}
                      >
                        {rec.date
                          ? new Date(rec.date).toLocaleDateString("en-US", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td
                        className={`${tdClass} text-gray-700 max-w-[180px] md:max-w-[220px] truncate`}
                      >
                        {rec.description || rec.remarks || "—"}
                      </td>
                      <td
                        className={`${tdClass} text-right font-semibold text-red-600`}
                      >
                        $
                        {(rec.amount || 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-indigo-50 sticky bottom-0">
                  <tr>
                    <td
                      colSpan={3}
                      className={`${tdClass} font-bold text-indigo-800 text-right`}
                    >
                      Total
                    </td>
                    <td
                      className={`${tdClass} text-right font-bold text-indigo-800`}
                    >
                      $
                      {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Main Component
const TotalExpense = () => {
  const [data, setData] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalExchangeLoss: 0,
    totalRemittance: 0,
    totalExpense: 0,
    totalSalary: 0,
    totalOtherExpense: 0,
    totalTransactions: 0,
  });

  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [searchTerm, setSearchTerm] = useState("");

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  const [exportLoading, setExportLoading] = useState(false);
  const [itemsPerPage] = useState(7);

  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    title: "",
    records: [],
  });

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const inputRef = useRef(null);
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  // ROWS Definition
  const ROWS = useMemo(
    () => [
      {
        type: "exchange_loss",
        label: "Bank Charges",
        amount: summary.totalExchangeLoss,
        color: "bg-red-500",
      },
      {
        type: "remittance",
        label: "Remittance",
        amount: summary.totalRemittance,
        color: "bg-green-500",
      },
      {
        type: "expense",
        label: "Expense",
        amount: summary.totalExpense,
        color: "bg-purple-500",
      },
      {
        type: "salary",
        label: "Salary",
        amount: summary.totalSalary,
        color: "bg-orange-500",
      },
      {
        type: "other_expense",
        label: "Other Expenses",
        amount: summary.totalOtherExpense,
        color: "bg-pink-500",
      },
    ],
    [
      summary.totalExchangeLoss,
      summary.totalRemittance,
      summary.totalExpense,
      summary.totalSalary,
      summary.totalOtherExpense,
    ],
  );

  const summaryData = useMemo(() => ROWS.filter((r) => r.amount > 0), [ROWS]);

  const paginatedData = useMemo(
    () =>
      summaryData.slice(
        (pagination.currentPage - 1) * itemsPerPage,
        pagination.currentPage * itemsPerPage,
      ),
    [summaryData, pagination.currentPage, itemsPerPage],
  );

  // Update Pagination
  useEffect(() => {
    const totalRecords = summaryData.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

    setPagination((prev) => ({
      currentPage: Math.min(prev.currentPage, totalPages),
      totalPages: totalPages,
      totalRecords: totalRecords,
      hasNext: prev.currentPage < totalPages,
      hasPrev: prev.currentPage > 1,
    }));
  }, [summaryData.length, itemsPerPage]);

  const handlePageChange = useCallback(
    (page) => {
      if (page < 1 || page > pagination.totalPages) return;
      setPagination((prev) => ({
        ...prev,
        currentPage: page,
        hasPrev: page > 1,
        hasNext: page < prev.totalPages,
      }));
    },
    [pagination.totalPages],
  );

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();

  const getPreviousMonthName = () => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return prev.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = useCallback(() => {
    const currentYear = getCurrentYear();
    const currentMonth = new Date().getMonth();
    if (currentMonth === 0) {
      const prevYear = currentYear - 1;
      return {
        startDate: `${prevYear}-01-01`,
        endDate: `${prevYear}-12-31`,
        label: `Jan - Dec ${prevYear}`,
      };
    }
    const endDate = new Date(currentYear, currentMonth, 0);
    return {
      startDate: `${currentYear}-01-01`,
      endDate: endDate.toISOString().split("T")[0],
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  }, []);

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (selectedTab) {
      case "currentMonth":
        return {
          startDate: new Date(now.getFullYear(), now.getMonth(), 1)
            .toISOString()
            .split("T")[0],
          endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0)
            .toISOString()
            .split("T")[0],
        };
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange();
      case "custom":
        return {
          startDate: customDateRange.startDate
            ? customDateRange.startDate.toISOString().split("T")[0]
            : "",
          endDate: customDateRange.endDate
            ? customDateRange.endDate.toISOString().split("T")[0]
            : "",
        };
      default:
        return {};
    }
  }, [
    selectedTab,
    customDateRange.startDate,
    customDateRange.endDate,
    getJanToPreviousMonthRange,
  ]);

  const buildParams = useCallback(
    (page, search) => {
      const dateRange = getDateRange();
      let params = { page, limit: itemsPerPage };
      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        )
          return null;
        params = {
          ...params,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
      }
      if (search?.trim()) params.search = search.trim();
      return params;
    },
    [selectedTab, getDateRange, itemsPerPage],
  );

  const fetchFinancialData = useCallback(
    async (page = 1, search = searchTerm) => {
      setLoading(true);
      try {
        const params = buildParams(page, search);
        if (!params) {
          setLoading(false);
          return;
        }

        const [pageRes, allRes] = await Promise.all([
          axios.get(`${backendUrl}/api/reports/total-expense/`, { params }),
          axios.get(`${backendUrl}/api/reports/total-expense/`, {
            params: { ...params, page: 1, limit: 10000 },
          }),
        ]);

        setData(pageRes.data.data || []);
        setAllRecords(allRes.data.data || []);
        setSummary(
          pageRes.data.summary || {
            totalExchangeLoss: 0,
            totalRemittance: 0,
            totalExpense: 0,
            totalSalary: 0,
            totalOtherExpense: 0,
            totalTransactions: 0,
          },
        );
      } catch (error) {
        console.error("Error fetching financial data:", error);
        showToast("error", "Failed to fetch financial data");
      } finally {
        setLoading(false);
      }
    },
    [buildParams, searchTerm],
  );

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    ) {
      return;
    }
    fetchFinancialData(1);
  }, [selectedTab, fetchFinancialData]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchFinancialData(1);
    }
  }, [
    customDateRange.startDate,
    customDateRange.endDate,
    selectedTab,
    fetchFinancialData,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        selectedTab === "custom" &&
        (!customDateRange.startDate || !customDateRange.endDate)
      ) {
        return;
      }
      fetchFinancialData(1, searchTerm);
    }, 500);
    return () => clearTimeout(timer);
  }, [
    searchTerm,
    selectedTab,
    customDateRange.startDate,
    customDateRange.endDate,
    fetchFinancialData,
  ]);

  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));

  const handleApplyCustomFilter = useCallback(() => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both dates");
      return;
    }
    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }
    setSelectedTab("custom");
    setShowCustomFilter(false);
    fetchFinancialData(1);
  }, [customDateRange.startDate, customDateRange.endDate, fetchFinancialData]);

  const handleTabChange = useCallback((tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setCustomDateRange({ startDate: null, endDate: null });
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    }
  }, []);

  const handleClearFilters = useCallback(() => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("all");
    setPagination((prev) => ({ ...prev, currentPage: 1 }));
    fetchFinancialData(1);
  }, [fetchFinancialData]);

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  const openDetail = (type, label) => {
    const records = allRecords.filter((r) => r.type === type);
    setDetailModal({ isOpen: true, title: label, records });
  };

  const closeDetail = () =>
    setDetailModal({ isOpen: false, title: "", records: [] });

  const getActiveFilterDisplay = useCallback(() => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;
      case "custom":
        return customDateRange.startDate && customDateRange.endDate
          ? `${formatDateToReadable(customDateRange.startDate)} to ${formatDateToReadable(customDateRange.endDate)}`
          : "Select custom dates";
      default:
        return "All Records";
    }
  }, [
    selectedTab,
    customDateRange.startDate,
    customDateRange.endDate,
    getJanToPreviousMonthRange,
  ]);

  const totalAmount = useMemo(
    () => ROWS.reduce((sum, item) => sum + (item.amount || 0), 0),
    [ROWS],
  );

  // Render Pagination - Responsive
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

  // Export function (placeholder - add your actual export logic)
  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      // Add your export logic here
      showToast("success", "Export functionality to be implemented");
    } catch (error) {
      showToast("error", "Failed to export");
    } finally {
      setExportLoading(false);
    }
  };

  // Responsive table headers
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Type</th>
          <th className={thClass}>Amount ($)</th>
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    );
  };

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
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <PieChart className="w-5 h-5 text-purple-600" />
            <h1 className="text-base font-bold text-gray-800">
              Expense Report
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <PieChart className="w-8 h-8 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              Financial Summary Report
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
              />
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={handleIconClick}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exportLoading}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl shadow-md cursor-pointer"
            >
              <Download size={18} /> Export Excel
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
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
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Tabs - Responsive */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-6 border border-gray-200`}
      >
        <div
          className={`flex flex-wrap gap-2 mb-4 ${isMobileView ? "overflow-x-auto whitespace-nowrap pb-2" : ""}`}
        >
          {[
            { key: "all", label: isMobileView ? "All" : "All Records" },
            {
              key: "currentMonth",
              label: isMobileView
                ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
                : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              key: "janToPreviousMonth",
              label: isMobileView
                ? getJanToPreviousMonthRange().label.slice(0, 12)
                : getJanToPreviousMonthRange().label,
            },
            { key: "custom", label: "Custom" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
                selectedTab === key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div
            className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
          >
            <Filter size={isMobileView ? 13 : 16} />
            <span>Active Filter: </span>
            <span className="font-medium">{getActiveFilterDisplay()}</span>
            <span className="text-gray-500 ml-1">
              ({pagination.totalRecords} records)
            </span>
          </div>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className={`flex items-center gap-1 ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer`}
          >
            {showBreakdown ? (
              <EyeOff size={isMobileView ? 12 : 14} />
            ) : (
              <Eye size={isMobileView ? 12 : 14} />
            )}
            {showBreakdown
              ? isMobileView
                ? "Hide"
                : "Hide Breakdown"
              : isMobileView
                ? "View"
                : "View Breakdown"}
          </button>
        </div>
      </div>

      {/* Grand Total - Responsive */}
      <div className="bg-white p-4 md:p-6 rounded-xl shadow-md mb-6 border-l-4 border-indigo-500">
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Total Overall Expense
            </p>
            <p
              className={`${isMobileView ? "text-xl" : "text-3xl"} font-bold text-indigo-600`}
            >
              ${totalAmount.toLocaleString()}
            </p>
          </div>
          <PieChart
            className={`${isMobileView ? "w-8 h-8" : "w-12 h-12"} text-indigo-500`}
          />
        </div>
      </div>

      {/* Breakdown - Responsive */}
      {showBreakdown && totalAmount > 0 && (
        <div className="bg-white rounded-xl shadow-md mb-6 border border-gray-200">
          <div className="p-4 md:p-6 border-b flex justify-between items-center flex-wrap gap-3">
            <h3
              className={`${isMobileView ? "text-base" : "text-lg"} font-semibold text-gray-800`}
            >
              Financial Breakdown by Type
            </h3>
            <button
              onClick={() => setShowBreakdown(false)}
              className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg cursor-pointer text-xs"
            >
              <EyeOff size={12} /> Hide
            </button>
          </div>
          <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {ROWS.map((item) => (
              <div key={item.type} className="bg-gray-50 p-3 md:p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span
                    className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-700`}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`${isMobileView ? "text-sm" : "text-lg"} font-bold text-gray-800`}
                  >
                    ${item.amount.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 md:h-2 mt-2">
                  <div
                    className={`${item.color} h-1.5 md:h-2 rounded-full`}
                    style={{
                      width:
                        totalAmount > 0
                          ? `${(item.amount / totalAmount) * 100}%`
                          : "0%",
                    }}
                  />
                </div>
                <div className="text-[10px] md:text-xs text-gray-500 mt-1">
                  {totalAmount > 0
                    ? ((item.amount / totalAmount) * 100).toFixed(1)
                    : 0}
                  % of total
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[400px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-400">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className={`${isMobileView ? "text-xs" : "text-sm"}`}>
                      Loading...
                    </span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length > 0 ? (
              paginatedData.map((item, index) => (
                <tr
                  key={item.type}
                  className="hover:bg-gray-50 border-b last:border-0"
                >
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} text-gray-600 font-medium`}
                  >
                    {(pagination.currentPage - 1) * itemsPerPage + index + 1}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} font-medium text-gray-900 capitalize`}
                  >
                    {item.label}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} font-semibold text-red-600`}
                  >
                    $
                    {(item.amount || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className={isMobileView ? "p-2" : "p-3"}>
                    <button
                      onClick={() => openDetail(item.type, item.label)}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                    >
                      <Eye size={isMobileView ? 12 : 14} /> View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="4"
                  className={`p-6 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                >
                  No financial data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* Detail Modal */}
      <DetailModal
        isOpen={detailModal.isOpen}
        onClose={closeDetail}
        title={detailModal.title}
        records={detailModal.records}
        isMobileView={isMobileView}
      />

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Total Expense Filter
              </h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      setCustomDateRange((prev) => ({
                        ...prev,
                        startDate: date,
                      }))
                    }
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholderText="End date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>
              <div className="flex justify-between gap-3">
                <button
                  onClick={handleClearFilters}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer text-sm"
                >
                  Clear All
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCustomFilter(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustomFilter}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer text-sm"
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

export default TotalExpense;
