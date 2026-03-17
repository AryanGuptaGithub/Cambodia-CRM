import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
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
      expenseTour: 0,
      travelAllowance: 0,
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
        // Use UTC to avoid timezone shifts
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
        `${backendUrl}/api/reports/tour-expense-sales`,
        { params },
      );

      if (response.data.success) {
        const summary = response.data.data?.summary || {};
        setData({
          summary: {
            tourExpense: parseFloat(summary.tourExpense) || 0,
            totalSales: parseFloat(summary.totalSales) || 0,
            totalProfit: parseFloat(summary.totalProfit) || 0,
            ratio: parseFloat(summary.ratio) || 0,
            expenseTour: parseFloat(summary.expenseTour) || 0,
            travelAllowance: parseFloat(summary.travelAllowance) || 0,
          },
          records: response.data.data?.records || [],
          totals: response.data.data?.totals || {
            totalSale: 0,
            totalCOG: 0,
            totalTourExpense: 0,
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
      console.error("Error fetching tour expense data:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to fetch data",
      );
      setData({
        summary: { tourExpense: 0, totalSales: 0, totalProfit: 0, ratio: 0 },
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
        fetchData(1);
      } else {
        setData({
          summary: { tourExpense: 0, totalSales: 0, totalProfit: 0, ratio: 0 },
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
    if (ratio <= 0.1) return "text-green-600";
    if (ratio <= 0.2) return "text-yellow-600";
    return "text-red-600";
  };

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    const maxVisible = 5;
    let start = Math.max(
      1,
      pagination.currentPage - Math.floor(maxVisible / 2),
    );
    let end = Math.min(pagination.totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div className="flex items-center justify-between mt-6">
        <div className="text-sm text-gray-700">
          Showing {(pagination.currentPage - 1) * itemsPerPage + 1} to{" "}
          {Math.min(
            pagination.currentPage * itemsPerPage,
            pagination.totalRecords,
          )}{" "}
          of {pagination.totalRecords} entries
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
              pagination.hasPrev
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <div className="flex gap-1">
            {pages.map((page) => (
              <button
                key={page}
                onClick={() => fetchData(page)}
                className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
              pagination.hasNext
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
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

  return (
    <div className="p-6">
      {/* Header */}
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

      {/* Date Filter Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                selectedTab === key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Filter size={16} />
          <span>Active Filter:</span>
          <span className="font-medium text-indigo-700">
            {getDateRange().displayDate}
          </span>
        </div>
      </div>

      {/* Summary Cards */}
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
              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                <p>Expense: {formatCurrency(data.summary.expenseTour || 0)}</p>
                <p>
                  Travel Allowance:{" "}
                  {formatCurrency(data.summary.travelAllowance || 0)}
                </p>
              </div>
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
              <p className="text-sm text-gray-600">
                Tour Expense / Sales Ratio
              </p>
              <div
                className={`text-2xl font-bold mt-1 ${getRatioColor(
                  data.summary.ratio,
                )}`}
              >
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

      {/* Table — NO Date column */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">Sale ($)</th>
              <th className="p-3 text-sm font-medium">Tour Expense ($)</th>
              <th className="p-3 text-sm font-medium">Percentage (%)</th>
              <th className="p-3 text-sm font-medium">Profit ($)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                    <span className="text-gray-600">Loading data...</span>
                    <span className="text-sm text-gray-500 mt-2">
                      Please wait while we fetch the latest data
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => (
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
                  <td className="p-3 text-sm font-semibold text-purple-600">
                    {formatCurrency(record.tourExpense)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        record.percentage < 10
                          ? "bg-green-100 text-green-800"
                          : record.percentage < 20
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {formatPercentage(record.percentage)}
                    </span>
                  </td>
                  <td className="p-3 text-sm font-semibold text-green-600">
                    {formatCurrency(record.profit)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No data found
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto">
                    {selectedTab === "custom" &&
                    (!customDateRange.startDate || !customDateRange.endDate)
                      ? "Please select start and end dates to view data."
                      : "No tour expense data available for the selected date range."}
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* Custom Filter Modal */}
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
