import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  Filter,
  User,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  DollarSign,
  Users,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE-SAFE: build "YYYY-MM-DD" from local year/month/day values.
// Never use .toISOString() on local Date objects — it shifts by UTC offset.
// e.g. in UTC+7: new Date(2026, 2, 1).toISOString() → "2026-02-28T17:00:00Z"
// ─────────────────────────────────────────────────────────────────────────────
const toLocalDateStr = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const MRWiseSales = () => {
  const [data, setData] = useState({
    summary: {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalMRs: 0,
      averageOrderValue: 0,
      totalCustomers: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
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
  const inputRef = useRef(null);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const getSerialNumber = (index) => {
    const itemsPerPage = 7;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });

  const getCurrentYear = () => new Date().getFullYear();

  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    if (currentMonth === 0) {
      const previousYear = currentYear - 1;
      return {
        startDate: `${previousYear}-01-01`,
        endDate: `${previousYear}-12-31`,
        label: `Jan - Dec ${previousYear}`,
      };
    }

    // Last day of previous month using local date arithmetic
    const lastDayOfPrevMonth = new Date(currentYear, currentMonth, 0);
    return {
      startDate: `${currentYear}-01-01`,
      endDate: toLocalDateStr(lastDayOfPrevMonth),
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  // ── TIMEZONE-SAFE getDateRange ─────────────────────────────────────────────
  // Always use local year/month/day — never .toISOString() on a local Date
  const getDateRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    switch (selectedTab) {
      case "currentMonth": {
        // First day of current month (local)
        const firstDay = new Date(currentYear, currentMonth, 1);
        // Last day of current month (local)
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: toLocalDateStr(firstDay),
          endDate: toLocalDateStr(lastDay),
        };
      }

      case "janToPreviousMonth": {
        const range = getJanToPreviousMonthRange();
        return {
          startDate: range.startDate,
          endDate: range.endDate,
        };
      }

      case "custom":
        return {
          // DatePicker gives a local Date — extract local parts
          startDate: customDateRange.startDate
            ? toLocalDateStr(customDateRange.startDate)
            : "",
          endDate: customDateRange.endDate
            ? toLocalDateStr(customDateRange.endDate)
            : "",
        };

      default:
        return {};
    }
  };

  const fetchMRWiseSales = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      let params = {
        page,
        limit: 7,
      };

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

        if (dateRange.startDate && dateRange.endDate) {
          params.startDate = dateRange.startDate;
          params.endDate = dateRange.endDate;
        }
      }

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/mr-wise-sales/sales`,
        { params },
      );

      setData({
        summary: {
          totalSalesAmount:
            parseFloat(response.data.data?.summary?.totalSalesAmount) || 0,
          totalOrders: parseInt(response.data.data?.summary?.totalOrders) || 0,
          totalMRs: parseInt(response.data.data?.summary?.totalMRs) || 0,
          averageOrderValue:
            parseFloat(response.data.data?.summary?.averageOrderValue) || 0,
          totalCustomers:
            parseInt(response.data.data?.summary?.totalCustomers) || 0,
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
    } catch (error) {
      console.error("Error fetching MR wise sales:", error);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
      showToast("error", "Failed to fetch MR wise sales data");

      setData({
        summary: {
          totalSalesAmount: 0,
          totalOrders: 0,
          totalMRs: 0,
          averageOrderValue: 0,
          totalCustomers: 0,
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
    fetchMRWiseSales(1);
  }, []);

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) {
        fetchMRWiseSales(1);
      } else {
        setData({
          summary: {
            totalSalesAmount: 0,
            totalOrders: 0,
            totalMRs: 0,
            averageOrderValue: 0,
            totalCustomers: 0,
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
      fetchMRWiseSales(1);
    }
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchMRWiseSales(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchMRWiseSales(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchMRWiseSales(1);
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  // Debounced search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchMRWiseSales(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchMRWiseSales(1);
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
    setSelectedTab("custom");
    setShowCustomFilter(false);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setCustomDateRange({ startDate: null, endDate: null });
    }
  };

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("currentMonth");
  };

  const exportToExcel = async () => {
    try {
      const dateRange = getDateRange();
      const params = new URLSearchParams();

      if (searchTerm && searchTerm.trim() !== "") {
        params.append("search", searchTerm.trim());
      }

      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          showToast(
            "warning",
            "Please select both start and end dates for export",
          );
          return;
        }
        if (dateRange.startDate)
          params.append("startDate", dateRange.startDate);
        if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      }

      const downloadUrl = `${backendUrl}/api/reports/mr-wise-sales/export/excel${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", "");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export to Excel");
    }
  };

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return `${toLocalDateStr(customDateRange.startDate)} to ${toLocalDateStr(
            customDateRange.endDate,
          )}`;
        }
        return "Select custom dates";
      default:
        return "All Records";
    }
  };

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasPrev
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <ChevronLeft size={16} />
          Prev
        </button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() =>
                typeof page === "number" ? handlePageChange(page) : null
              }
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number"
                    ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                    : "bg-transparent text-gray-500 cursor-default"
              }`}
              disabled={typeof page !== "number"}
            >
              {page}
            </button>
          ))}
        </div>

        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasNext
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-800">MR Wise Sales</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by MR name..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearch}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
              onClick={() => inputRef.current?.focus()}
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <button
            onClick={exportToExcel}
            disabled={loading}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleTabChange("currentMonth")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "currentMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Current Month ({getCurrentMonthName()} {getCurrentYear()})
          </button>
          <button
            onClick={() => handleTabChange("janToPreviousMonth")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "janToPreviousMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {getJanToPreviousMonthRange().label}
          </button>
          <button
            onClick={() => handleTabChange("custom")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            MR Wise Sales Filter
          </button>
          <button
            onClick={() => handleTabChange("all")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "all"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All Records
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Sales</p>
              <p className="text-2xl font-bold text-gray-800">
                $
                {data.summary.totalSalesAmount?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) || "0.00"}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Orders</p>
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalOrders || 0}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total MRs</p>
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalMRs || 0}
              </p>
            </div>
            <Users className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Avg Order Value</p>
              <p className="text-2xl font-bold text-gray-800">
                $
                {data.summary.averageOrderValue?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) || "0.00"}
              </p>
            </div>
            <User className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">MR Name</th>
              <th className="p-3 text-sm font-medium">Contact</th>
              <th className="p-3 text-sm font-medium">Region</th>
              <th className="p-3 text-sm font-medium">Total Orders</th>
              <th className="p-3 text-sm font-medium">Total Sales ($)</th>
              <th className="p-3 text-sm font-medium">Avg Order Value ($)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="p-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((mr, index) => (
                <tr
                  key={mr.mrId || index}
                  className={`hover:bg-gray-50 ${
                    index === data.records.length - 1 ? "" : "border-b"
                  }`}
                >
                  <td className="p-3">
                    <div className="text-sm text-gray-600 font-medium">
                      {getSerialNumber(index)}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {mr.mrName}
                    </div>
                    <div className="text-xs text-gray-500">{mr.email}</div>
                  </td>
                  <td className="p-3 text-sm text-gray-900">
                    {mr.contactNumber || "Not Available"}
                  </td>
                  <td className="p-3 text-sm text-gray-900">
                    {mr.region || "N/A"}
                  </td>
                  <td className="p-3 text-sm font-semibold text-blue-600">
                    {mr.totalOrders || 0}
                  </td>
                  <td className="p-3 text-sm font-semibold text-green-600">
                    $
                    {mr.totalSalesAmount?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) || "0.00"}
                  </td>
                  <td className="p-3 text-sm font-semibold text-orange-600">
                    $
                    {mr.averageOrderValue?.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    }) || "0.00"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No MR wise sales data found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
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
                Custom Filter
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
                    placeholderText="Select start date"
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
                    placeholderText="Select end date"
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

export default MRWiseSales;
