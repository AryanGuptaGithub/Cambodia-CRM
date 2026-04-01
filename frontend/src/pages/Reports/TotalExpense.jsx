import React, { useState, useEffect, useRef } from "react";
import {
  PieChart,
  Download,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Detail Modal ─────────────────────────────────────────────────────────────
const DetailModal = ({ isOpen, onClose, title, records }) => {
  if (!isOpen) return null;

  const total = records.reduce((sum, r) => sum + (r.amount || 0), 0);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex justify-center items-center z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50">
          <div>
            <h2 className="text-lg font-bold text-indigo-800">
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
            <X size={20} />
          </button>
        </div>

        {/* Table */}
        <div className="overflow-y-auto max-h-[60vh]">
          {records.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No records found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    #
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Description / Remarks
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">
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
                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {rec.date
                        ? new Date(rec.date).toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate">
                      {rec.description || rec.remarks || "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-red-600">
                      $
                      {(rec.amount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Footer total */}
              <tfoot className="bg-indigo-50 sticky bottom-0">
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-3 font-bold text-indigo-800 text-right"
                  >
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-indigo-800">
                    $
                    {total.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TotalExpense = () => {
  const [data, setData] = useState([]);
  const [allRecords, setAllRecords] = useState([]); // full unpaginated list for drill-down
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

  // ── Detail modal state ────────────────────────────────────────────────────
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    title: "",
    records: [],
  });

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();
  const getPreviousMonthName = () => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return prev.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
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
  };

  const getDateRange = () => {
    const now = new Date();
    switch (selectedTab) {
      case "currentMonth": {
        const y = now.getFullYear(),
          m = now.getMonth();
        return {
          startDate: new Date(y, m, 1).toISOString().split("T")[0],
          endDate: new Date(y, m + 1, 0).toISOString().split("T")[0],
        };
      }
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
  };

  const buildParams = (page, search) => {
    const dateRange = getDateRange();
    let params = { page, limit: 7 };
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
  };

  const fetchFinancialData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const params = buildParams(page, search);
      if (!params) {
        setLoading(false);
        return;
      }

      // Fetch paginated (for table display)
      const [pageRes, allRes] = await Promise.all([
        axios.get(`${backendUrl}/api/reports/total-expense/`, { params }),
        // Fetch all records (no pagination) so drill-down shows everything in range
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
      setPagination(
        pageRes.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      );
    } catch (error) {
      console.error("Error fetching financial data:", error);
      showToast("error", "Failed to fetch financial data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    )
      return;
    fetchFinancialData(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchFinancialData(1);
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchFinancialData(1), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handlePageChange = (p) => {
    if (p >= 1 && p <= pagination.totalPages) fetchFinancialData(p);
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));

  const handleApplyCustomFilter = () => {
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
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") setShowCustomFilter(true);
    else {
      setCustomDateRange({ startDate: null, endDate: null });
      fetchFinancialData(1);
    }
  };

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    fetchFinancialData(1);
  };

  // ── Open detail modal — filter allRecords by type ────────────────────────
  const openDetail = (type, label) => {
    const records = allRecords.filter((r) => r.type === type);
    setDetailModal({ isOpen: true, title: label, records });
  };

  const closeDetail = () =>
    setDetailModal({ isOpen: false, title: "", records: [] });

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();
      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast("warning", "Please select both dates for export");
        setExportLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      if (searchTerm) params.append("search", searchTerm);

      const response = await axios.get(
        `${backendUrl}/api/reports/total-expense/export/excel?${params.toString()}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      const today = new Date().toISOString().split("T")[0];
      link.download =
        dateRange.startDate && dateRange.endDate
          ? `financial-summary-${dateRange.startDate.replace(/-/g, "")}-to-${dateRange.endDate.replace(/-/g, "")}.xlsx`
          : `financial-summary-${today.replace(/-/g, "")}.xlsx`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting:", error);
      showToast("error", "Failed to export to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  const getActiveFilterDisplay = () => {
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
  };

  const totalAmount =
    summary.totalExchangeLoss +
    summary.totalRemittance +
    summary.totalExpense +
    summary.totalSalary +
    summary.totalOtherExpense;

  // ── Row definitions (type → label, colour) ────────────────────────────────
  const ROWS = [
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
  ];

  const summaryData = ROWS.filter((r) => r.amount > 0);

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          <ChevronLeft size={16} /> Prev
        </button>
        <div className="flex gap-1">
          {visiblePages.map((page, idx) =>
            page === "..." ? (
              <span
                key={`e-${idx}`}
                className="px-3 py-1 text-gray-500 select-none"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => handlePageChange(page)}
                className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${page === pagination.currentPage ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-700"}`}
              >
                {page}
              </button>
            ),
          )}
        </div>
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          Next <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <PieChart className="w-8 h-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Financial Summary Report
          </h1>
        </div>
        <button
          onClick={exportToExcel}
          disabled={exportLoading}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${exportLoading ? "bg-green-700 text-white opacity-75 cursor-wait" : "bg-green-600 hover:bg-green-700 text-white"}`}
        >
          <Download size={18} />
          {exportLoading ? "Exporting..." : "Export Excel"}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { key: "all", label: "All Records" },
            {
              key: "currentMonth",
              label: `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              key: "janToPreviousMonth",
              label: getJanToPreviousMonthRange().label,
            },
            { key: "custom", label: "Custom Filter" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === key ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter size={16} />
            <span>Active Filter: </span>
            <span className="font-medium">{getActiveFilterDisplay()}</span>
          </div>
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg cursor-pointer"
          >
            {showBreakdown ? <EyeOff size={16} /> : <Eye size={16} />}
            {showBreakdown ? "Hide Breakdown" : "View Breakdown"}
          </button>
        </div>
      </div>

      {/* Grand Total Card */}
      <div className="bg-white p-6 rounded-xl shadow-md mb-6 border-l-4 border-indigo-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Overall Expense</p>
            <p className="text-3xl font-bold text-indigo-600">
              ${totalAmount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Sum of all expense categories
            </p>
          </div>
          <PieChart className="w-12 h-12 text-indigo-500" />
        </div>
      </div>

      {/* Breakdown */}
      {showBreakdown && totalAmount > 0 && (
        <div className="bg-white rounded-xl shadow-md mb-6 border border-gray-200">
          <div className="p-6 border-b flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">
              Financial Breakdown by Type
            </h3>
            <button
              onClick={() => setShowBreakdown(false)}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg cursor-pointer text-sm"
            >
              <EyeOff size={14} /> Hide
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ROWS.map((item) => (
              <div key={item.type} className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">
                    {item.label}
                  </span>
                  <span className="text-lg font-bold text-gray-800">
                    ${item.amount.toLocaleString()}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className={`${item.color} h-2 rounded-full`}
                    style={{
                      width: `${totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
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

      {/* ── Main Summary Table with Actions column ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr. No.</th>
              <th className="p-3 text-sm font-medium">Type</th>
              <th className="p-3 text-sm font-medium">Amount ($)</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : summaryData.length > 0 ? (
              summaryData.map((item, index) => (
                <tr
                  key={item.type}
                  className={`hover:bg-gray-50 ${index === summaryData.length - 1 ? "" : "border-b"}`}
                >
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {index + 1}
                  </td>
                  <td className="p-3 text-sm font-medium text-gray-900 capitalize">
                    {item.label}
                  </td>
                  <td className="p-3 text-sm font-semibold text-red-600">
                    $
                    {(item.amount || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => openDetail(item.type, item.label)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                    >
                      <Eye size={14} />
                      View All
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No financial data found"}
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
      />

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
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
                      handleCustomDateChange("startDate", date)
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    className="w-full border rounded-lg px-3 py-2"
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
                    onChange={(date) => handleCustomDateChange("endDate", date)}
                    selectsEnd
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    minDate={customDateRange.startDate}
                    className="w-full border rounded-lg px-3 py-2"
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
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
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
