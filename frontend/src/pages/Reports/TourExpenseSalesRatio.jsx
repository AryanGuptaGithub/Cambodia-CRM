import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  Search,
  X,
  MapPin,
  DollarSign,
  BarChart3,
  Percent,
  FileDown,
  Calendar,
  Filter,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const TourExpenseSalesRatio = () => {
  const [data, setData] = useState({
    summary: {
      tourExpense: 0,
      totalSales: 0,
      totalProfit: 0,
      ratio: 0,
    },
    records: [],
    totals: {
      totalSale: 0,
      totalCOG: 0,
      totalTourExpense: 0,
      totalProfit: 0,
      totalSaleCount: 0,
    },
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
    pagination.totalPages
  );

  const getSerialNumber = (index) => {
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const getCurrentMonthName = () => {
    return new Date().toLocaleString("default", { month: "long" });
  };

  const getCurrentYear = () => {
    return new Date().getFullYear();
  };

  const getPreviousMonthName = () => {
    const previousMonth = new Date();
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    return previousMonth.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthDisplay = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    if (currentMonth === 0) {
      return `Jan - Dec ${currentYear - 1}`;
    } else {
      return `Jan - ${getPreviousMonthName()} ${currentYear}`;
    }
  };

  const getDateRange = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (selectedTab) {
      case "today":
        const todayStr = today.toISOString().split("T")[0];
        return {
          startDate: todayStr,
          endDate: todayStr,
          displayDate: todayStr,
        };

      case "all":
        return {
          startDate: null,
          endDate: null,
          displayDate: "All Records",
        };

      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: firstDay.toISOString().split("T")[0],
          endDate: lastDay.toISOString().split("T")[0],
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };

      case "janToPreviousMonth":
        const janFirst = new Date(currentYear, 0, 1);
        const lastMonthLastDay = new Date(currentYear, currentMonth, 0);
        return {
          startDate: janFirst.toISOString().split("T")[0],
          endDate: lastMonthLastDay.toISOString().split("T")[0],
          displayDate: getJanToPreviousMonthDisplay(),
        };

      case "custom":
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
            customDateRange.startDate && customDateRange.endDate
              ? `${startStr} - ${endStr}`
              : "Select custom dates",
        };

      default:
        return {
          startDate: null,
          endDate: null,
          displayDate: "Current Month",
        };
    }
  };

  const fetchTourExpenseSalesData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      let params = {
        page: page,
        limit: itemsPerPage,
        dateFilter: selectedTab,
      };

      if (selectedTab !== "all") {
        if (selectedTab === "custom" && (!dateRange.startDate || !dateRange.endDate)) {
          setLoading(false);
          showToast("warning", "Please select both start and end dates for custom filter");
          return;
        }

        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
      }

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(`${backendUrl}/api/tour-expense-sales-ratio`, {
        params,
      });

      if (response.data.success) {
        const summary = response.data.data?.summary || {
          tourExpense: 0,
          totalSales: 0,
          totalProfit: 0,
          ratio: 0,
        };

        const safeSummary = {
          tourExpense: parseFloat(summary.tourExpense) || 0,
          totalSales: parseFloat(summary.totalSales) || 0,
          totalProfit: parseFloat(summary.totalProfit) || 0,
          ratio: parseFloat(summary.ratio) || 0,
        };

        setData({
          summary: safeSummary,
          records: response.data.data?.records || [],
          totals: response.data.data?.totals || {
            totalSale: 0,
            totalCOG: 0,
            totalTourExpense: 0,
            totalProfit: 0,
            totalSaleCount: 0,
          }
        });

        setPagination(
          response.data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 0,
            hasNext: false,
            hasPrev: false,
          }
        );
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      console.error("Error fetching tour expense sales ratio data:", error);
      showToast("error", error.response?.data?.message || "Failed to fetch tour expense sales ratio data");
      setData({
        summary: {
          tourExpense: 0,
          totalSales: 0,
          totalProfit: 0,
          ratio: 0,
        },
        records: [],
        totals: {
          totalSale: 0,
          totalCOG: 0,
          totalTourExpense: 0,
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
        fetchTourExpenseSalesData(1);
      } else {
        setData({
          summary: {
            tourExpense: 0,
            totalSales: 0,
            totalProfit: 0,
            ratio: 0,
          },
          records: [],
          totals: {
            totalSale: 0,
            totalCOG: 0,
            totalTourExpense: 0,
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
      fetchTourExpenseSalesData(1);
    }
  }, [selectedTab]);

  useEffect(() => {
    if (selectedTab === "custom" && customDateRange.startDate && customDateRange.endDate) {
      fetchTourExpenseSalesData(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchTourExpenseSalesData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchTourExpenseSalesData(1);
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchTourExpenseSalesData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

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
    fetchTourExpenseSalesData(1);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setCustomDateRange({
        startDate: null,
        endDate: null,
      });
      setShowCustomFilter(false);
    }
  };

  const handleClearFilters = () => {
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
    setSearchTerm("");
    setSelectedTab("currentMonth");
    setShowCustomFilter(false);
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }

    setExportLoading(true);
    try {
      const dateRange = getDateRange();

      const params = {
        dateFilter: selectedTab,
        search: searchTerm.trim() || undefined,
      };

      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
      }

      const response = await axios.get(
        `${backendUrl}/api/tour-expense-sales-ratio/export`,
        {
          params,
          responseType: "blob",
        }
      );

      let filename = "tour-expense-sales-ratio-report.xlsx";
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1];
        }
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
      console.error("Error exporting to Excel:", error);
      if (error.response && error.response.status === 404) {
        showToast("warning", "No data found for the selected filters");
      } else {
        showToast("error", "Failed to export Excel report");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const getActiveFilterDisplay = () => {
    const dateRange = getDateRange();
    return dateRange.displayDate || "Current Month";
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
    if (isNaN(num)) return "0.00%";
    return `${num.toFixed(2)}%`;
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

  const getPercentageColor = (percentage) => {
    if (percentage <= 10) return "text-green-600";
    if (percentage <= 20) return "text-yellow-600";
    return "text-red-600";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch {
      return dateString;
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
          ← Prev
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
          Next →
        </button>
      </div>
    );
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Tour Expense</p>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatCurrency(data.summary.tourExpense)
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <MapPin className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Sales</p>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatCurrency(data.summary.totalSales)
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {data.totals.totalSaleCount} invoices
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-green-500" />
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Tour Expense/Sales Ratio</p>
            <div className={`text-2xl font-bold mt-1 ${getRatioColor(data.summary.ratio)}`}>
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatRatio(data.summary.ratio)
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatPercentage(data.summary.ratio * 100)}
            </p>
          </div>
          <Percent className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Profit</p>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                formatCurrency(data.summary.totalProfit)
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              COGS: {formatCurrency(data.totals.totalCOG)}
            </p>
          </div>
          <BarChart3 className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Date</th>
        <th className="p-3 text-sm font-medium">Sale ($)</th>
        <th className="p-3 text-sm font-medium">Tour Expense ($)</th>
        <th className="p-3 text-sm font-medium">Percentage (%)</th>
        <th className="p-3 text-sm font-medium">Profit ($)</th>
      </tr>
    </thead>
  );

  const renderTableRow = (record, index) => {
    return (
      <tr
        key={`${record.date}-${index}`}
        className={`hover:bg-gray-50 ${index === data.records.length - 1 ? "" : "border-b"}`}
      >
        <td className="p-3">
          <div className="text-sm text-gray-600 font-medium">
            {getSerialNumber(index)}
          </div>
        </td>
        <td className="p-3 text-sm text-gray-600">
          {formatDate(record.date)}
        </td>
        <td className="p-3 text-sm font-semibold text-blue-600">
          {formatCurrency(record.sale)}
        </td>
        <td className="p-3 text-sm font-semibold text-purple-600">
          {formatCurrency(record.tourExpense)}
        </td>
        <td className="p-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            record.percentage < 10
              ? "bg-green-100 text-green-800"
              : record.percentage < 20
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}>
            {formatPercentage(record.percentage)}
          </span>
        </td>
        <td className="p-3 text-sm font-semibold text-green-600">
          {formatCurrency(record.profit)}
        </td>
      </tr>
    );
  };

  const getColSpan = () => {
    return 7; // Number of columns in the table
  };

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Tour Expense / Sales Ratio Report
            </h1>
            <p className="text-sm text-gray-600">
              Analyze tour expenses compared to total sales
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
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
      </div>

      {/* Time Filter Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => handleTabChange("today")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "today"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Today
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
            {getJanToPreviousMonthDisplay()}
          </button>
          <button
            onClick={() => handleTabChange("custom")}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
              selectedTab === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Custom Filter
          </button>
        </div>

        {/* Active Filter Display */}
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {renderSummaryCards()}
      
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <span className="text-gray-600">
                      Loading tour expense sales ratio data...
                    </span>
                    <span className="text-sm text-gray-500 mt-2">
                      Please wait while we fetch the latest data
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => renderTableRow(record, index))
            ) : (
              <tr>
                <td colSpan={getColSpan()} className="p-8 text-center">
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
                      : "No tour expense sales ratio data available for the selected date range."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

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
                  onChange={(date) => handleCustomDateChange("startDate", date)}
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
                  onChange={(date) => handleCustomDateChange("endDate", date)}
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