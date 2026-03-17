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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─────────────────────────────────────────────────────────────────────────────
//  The backend now returns flat numeric fields per record:
//
//    record.salary      → basic / adjusted salary
//    record.incentive   → sum of allowances where type === "Incentive"
//    record.allowance   → sum of all OTHER allowances (not Incentive, not Travel Allowance)
//    record.tourExpense → sum of allowances where type === "Travel Allowance"
//    record.totalExpense → salary + incentive + allowance + tourExpense
//
//  No client-side allowance parsing needed — just read the flat fields.
// ─────────────────────────────────────────────────────────────────────────────

const SalesSalaryRatio = () => {
  const [data, setData] = useState({
    summary: {
      totalSales: 0,
      totalSalary: 0,
      totalExpense: 0,
      totalProfit: 0,
      ratio: 0,
    },
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
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

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
    const y = today.getFullYear();
    const m = today.getMonth();
    switch (selectedTab) {
      case "currentMonth": {
        const f = new Date(y, m, 1);
        const l = new Date(y, m + 1, 0);
        return {
          startDate: f.toISOString().split("T")[0],
          endDate: l.toISOString().split("T")[0],
          period: `${y}-${(m + 1).toString().padStart(2, "0")}`,
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const j = new Date(y, 0, 1);
        const lm = new Date(y, m, 0);
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
      case "all":
        return {
          startDate: null,
          endDate: null,
          period: null,
          displayDate: "All Records",
        };
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
        `${backendUrl}/api/reports/sales-and-salary`,
        { params },
      );
      if (response.data.success) {
        const s = response.data.data?.summary || {};
        setData({
          summary: {
            totalSales: parseFloat(s.totalSales) || 0,
            totalSalary: parseFloat(s.totalSalary) || 0,
            totalExpense: parseFloat(s.totalExpense) || 0,
            totalProfit: parseFloat(s.totalProfit) || 0,
            ratio: parseFloat(s.ratio) || 0,
          },
          records: response.data.data?.records || [],
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
      showToast(
        "error",
        error.response?.data?.message ||
          "Failed to fetch sales salary ratio data",
      );
      setData({
        summary: {
          totalSales: 0,
          totalSalary: 0,
          totalExpense: 0,
          totalProfit: 0,
          ratio: 0,
        },
        records: [],
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
      if (customDateRange.startDate && customDateRange.endDate) fetchData(1);
      else {
        setData({
          summary: {
            totalSales: 0,
            totalSalary: 0,
            totalExpense: 0,
            totalProfit: 0,
            ratio: 0,
          },
          records: [],
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
        `${backendUrl}/api/reports/sales-and-salary/export`,
        { params, responseType: "blob" },
      );
      let filename = "sales-salary-ratio-report.xlsx";
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
    if (isNaN(n)) return "0.00%";
    return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
  };
  const fmtRatio = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? "0.0000" : n.toFixed(4);
  };

  const calcSalarySaleRatio = (sale, totalExpense) =>
    totalExpense === 0 ? 0 : (sale / totalExpense) * 100;

  const getPerformanceInfo = (ratio) => {
    if (ratio <= 25)
      return {
        label: "Excellent",
        textColor: "text-green-600",
        bgColor: "bg-green-100",
      };
    if (ratio <= 50)
      return {
        label: "Positive",
        textColor: "text-blue-600",
        bgColor: "bg-blue-100",
      };
    if (ratio <= 100)
      return {
        label: "Usual",
        textColor: "text-amber-600",
        bgColor: "bg-amber-100",
      };
    return {
      label: "Negative",
      textColor: "text-red-600",
      bgColor: "bg-red-100",
    };
  };

  // ── pagination ──────────────────────────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          ← Prev
        </button>
        <div className="flex gap-1">
          {visiblePages.map((page, i) => (
            <button
              key={i}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              disabled={typeof page !== "number"}
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${page === pagination.currentPage ? "bg-indigo-600 text-white" : typeof page === "number" ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-transparent text-gray-500 cursor-default"}`}
            >
              {page}
            </button>
          ))}
        </div>
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          Next →
        </button>
      </div>
    );
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Sales / Salary Ratio Report
            </h1>
            <p className="text-sm text-gray-600">
              Analyze sales performance against salary expenses
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

      {/* ── Date tabs ── */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { id: "currentMonth", label: "Current Month" },
            { id: "janToPreviousMonth", label: "Jan - Previous Month" },
            { id: "custom", label: "Custom Filter" },
            { id: "all", label: "All Records" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === id ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[
          {
            label: "Total Sales",
            value: fmt$(data.summary.totalSales),
            icon: <DollarSign className="w-8 h-8 text-green-500" />,
            border: "border-green-500",
          },
          {
            label: "Total Salary",
            value: fmt$(data.summary.totalSalary),
            icon: <Users className="w-8 h-8 text-blue-500" />,
            border: "border-blue-500",
          },
          {
            label: "Total Expense",
            value: fmt$(data.summary.totalExpense),
            icon: <BarChart3 className="w-8 h-8 text-purple-500" />,
            border: "border-purple-500",
          },
          {
            label: "Expense/Sales Ratio",
            value: fmtRatio(data.summary.ratio),
            icon: <Percent className="w-8 h-8 text-orange-500" />,
            border: "border-orange-500",
          },
        ].map(({ label, value, icon, border }) => (
          <div
            key={label}
            className={`bg-white p-6 rounded-xl shadow-md border-l-4 ${border} border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">{label}</p>
                <p className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <span className="block h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    value
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {getActiveFilterDisplay()}
                </p>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>

      {/* Performance legend (optional) */}
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
        <span className="font-semibold text-gray-600">
          Performance (Salary/Sale %):
        </span>
        <span className="flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-600 font-semibold">
            Excellent
          </span>
          <span>0 – 25%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-semibold">
            Positive
          </span>
          <span>26 – 50%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 font-semibold">
            Usual
          </span>
          <span>51 – 100%</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">
            Negative
          </span>
          <span>&gt; 100%</span>
        </span>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">MR Name</th>
              <th className="p-3 text-sm font-medium">Sale ($)</th>
              <th className="p-3 text-sm font-medium">Profit ($)</th>
              <th className="p-3 text-sm font-medium">Salary ($)</th>
              <th className="p-3 text-sm font-medium">Incentive ($)</th>
              <th className="p-3 text-sm font-medium">Allowance ($)</th>
              <th className="p-3 text-sm font-medium">Tour Expense ($)</th>
              <th className="p-3 text-sm font-medium">Total Expense ($)</th>
              <th className="p-3 text-sm font-medium">Salary/Sale (%)</th>
              <th className="p-3 text-sm font-medium">Performance</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="p-8 text-center">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
                    <span className="text-gray-600">
                      Loading sales salary ratio data...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => {
                const salary = parseFloat(record.salary) || 0;
                const incentive = parseFloat(record.incentive) || 0;
                const allowance = parseFloat(record.allowance) || 0;
                const tourExpense = parseFloat(record.tourExpense) || 0;
                const profit = parseFloat(record.profit) || 0;
                const sale = parseFloat(record.sale) || 0;
                const totalExpense = parseFloat(record.totalExpense) || 0;

                // Salary/Sale (%) = sale / totalExpense × 100
                const salarySaleRatio = calcSalarySaleRatio(sale, totalExpense);

                // Performance label derived from salarySaleRatio
                const {
                  label: perfLabel,
                  textColor: perfText,
                  bgColor: perfBg,
                } = getPerformanceInfo(salarySaleRatio);

                return (
                  <tr
                    key={`${record.mrId}-${index}`}
                    className={`hover:bg-gray-50 ${index === data.records.length - 1 ? "" : "border-b"}`}
                  >
                    <td className="p-3 text-sm text-gray-600 font-medium">
                      {getSerialNumber(index)}
                    </td>
                    <td className="p-3 text-sm font-medium text-gray-900 capitalize">
                      {record.mrName || "N/A"}
                    </td>
                    <td className="p-3 text-sm font-semibold text-gray-800">
                      {fmt$(record.sale)}
                    </td>
                    <td className="p-3 text-sm font-semibold text-blue-600">
                      {fmt$(profit)}
                    </td>
                    <td className="p-3 text-sm font-semibold text-purple-600">
                      {fmt$(salary)}
                    </td>
                    <td className="p-3 text-sm font-semibold text-green-600">
                      {fmt$(incentive)}
                    </td>
                    <td className="p-3 text-sm font-semibold text-yellow-600">
                      {fmt$(allowance)}
                    </td>
                    <td className="p-3 text-sm font-semibold text-red-600">
                      {fmt$(tourExpense)}
                    </td>
                    <td className="p-3 text-sm font-bold text-gray-900">
                      {fmt$(totalExpense)}
                    </td>
                    <td
                      className={`p-3 text-sm font-semibold ${salarySaleRatio >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {fmtPct(salarySaleRatio)}
                    </td>
                    <td className="p-3 text-sm font-semibold">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${perfBg} ${perfText}`}
                      >
                        {perfLabel}
                      </span>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="p-8 text-center">
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
                        : "No sales salary ratio data available for the selected date range."}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
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
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
              >
                Clear All
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer"
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

export default SalesSalaryRatio;