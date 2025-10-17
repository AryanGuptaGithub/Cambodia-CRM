import React, { useState, useEffect } from "react";
import {
  Receipt,
  Download,
  Filter,
  User,
  Phone,
  Mail,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const OutstandingCollection = () => {
  const [data, setData] = useState({
    summary: {
      totalOutstandingAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalRecords: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [filter, setFilter] = useState({
    customerName: "",
    status: "all",
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

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

  const getJanToPreviousMonthRange = () => {
    const currentYear = getCurrentYear();
    const currentMonth = new Date().getMonth();

    if (currentMonth === 0) {
      const previousYear = currentYear - 1;
      return {
        startDate: `${previousYear}-01-01`,
        endDate: `${previousYear}-12-31`,
        label: `Jan - Dec ${previousYear}`,
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
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    switch (selectedTab) {
      case "currentMonth":
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: firstDay.toISOString().split("T")[0],
          endDate: lastDay.toISOString().split("T")[0],
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
  };

  const fetchOutstandingCollections = async (page = 1) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      let params = {
        page: page,
        limit: 7,
      };

      // Only include date range for non-all tabs
      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          setLoading(false);
          return;
        }
        params = {
          ...params,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
      }

      // Only include customer name and status filters when custom tab is selected
      if (selectedTab === "custom") {
        params = {
          ...params,
          customerName: filter.customerName,
          status: filter.status,
        };
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections`,
        {
          params,
        }
      );

      setData(response.data.data || { summary: {}, records: [] });
      setPagination(
        response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        }
      );
    } catch (error) {
      console.error("Error fetching outstanding collections:", error);
      showToast("error", "Failed to fetch outstanding collections data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    ) {
      return;
    }
    fetchOutstandingCollections(1); // Reset to page 1 when tab changes
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchOutstandingCollections(1); // Reset to page 1 when date changes
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchOutstandingCollections(page);
    }
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter((prev) => ({ ...prev, [name]: value }));
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
    // Data will be fetched automatically by the useEffect
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    }
  };

  const handleClearFilters = () => {
    setFilter({
      customerName: "",
      status: "all",
    });
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
  };

  const exportToExcel = () => {
    showToast("info", "Export feature coming soon");
  };

  const formatDateForDisplay = (date) => {
    return date ? formatDateToReadable(date) : "";
  };

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;

      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;

      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          let display = `${formatDateForDisplay(
            customDateRange.startDate
          )} to ${formatDateForDisplay(customDateRange.endDate)}`;

          // Add customer name filter if applied
          if (filter.customerName) {
            display += ` | Customer: ${filter.customerName}`;
          }

          // Add status filter if not "all"
          if (filter.status !== "all") {
            display += ` | Status: ${filter.status}`;
          }

          return display;
        }
        return "Select custom dates";

      default:
        return "All Records";
    }
  };

  // Render Pagination Component
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

        {/* Page Numbers */}
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

        {/* Next Button */}
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
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Receipt className="w-8 h-8 text-orange-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Outstanding Collection
          </h1>
        </div>
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
        >
          <Download size={18} />
          Export Excel
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-800">
                ${data.summary.totalOutstandingAmount?.toLocaleString() || 0}
              </p>
            </div>
            <Receipt className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Overdue</p>
              <p className="text-2xl font-bold text-gray-800">
                ${data.summary.totalOverdueAmount?.toLocaleString() || 0}
              </p>
            </div>
            <User className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Customers</p>
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalCustomers || 0}
              </p>
            </div>
            <User className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Customer</th>
              <th className="p-3 text-sm font-medium">Contact</th>
              <th className="p-3 text-sm font-medium">Total Outstanding ($)</th>
              <th className="p-3 text-sm font-medium">Overdue Amount ($)</th>
              <th className="p-3 text-sm font-medium">Last Payment Date</th>
              <th className="p-3 text-sm font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" className="p-3 text-center">
                  Loading...
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((customer, index) => (
                <tr
                  key={index}
                  className={`hover:bg-gray-50 ${
                    index === data.records.length - 1 ? "" : "border-b"
                  }`}
                >
                  <td className="p-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 capitalize">
                        {customer.customerName}
                      </div>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="text-sm text-gray-900 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <Phone size={14} />
                        {customer.phone || "N/A"}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-sm font-semibold text-orange-600">
                    {customer.netSellingAmount?.toLocaleString()}
                  </td>
                  <td className="p-3 text-sm font-semibold text-red-600">
                    
                    {(customer.deliveryDate < new Date()
                      ? customer.netSellingAmount
                      : 0
                    )?.toLocaleString()}
                  </td>
                  <td className="p-3 text-sm text-gray-900">
                    {customer.deliveryDate
                      ? formatDateToReadable(customer.deliveryDate)
                      : "N/A"}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        customer.deliveryDate < new Date()
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {customer.deliveryDate < new Date()
                        ? "Overdue"
                        : "Pending"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="p-3 text-center text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No outstanding collections found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {renderPagination()}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />

            {/* Modal Content */}
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10">
              {/* Close Button */}
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
                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
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
                      onChange={(date) =>
                        handleCustomDateChange("endDate", date)
                      }
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

                {/* Customer Name Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={filter.customerName}
                    onChange={handleFilterChange}
                    placeholder="Search customer..."
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>

                {/* Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={filter.status}
                    onChange={handleFilterChange}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="all">All Status</option>
                    <option value="overdue">Overdue</option>
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                  </select>
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
          document.body
        )}
    </div>
  );
};

export default OutstandingCollection;
