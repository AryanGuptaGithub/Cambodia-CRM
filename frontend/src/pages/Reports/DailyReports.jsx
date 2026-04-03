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

const DailyReports = () => {
  const [data, setData] = useState({
    summary: {
      totalSalesAmount: 0,
      totalOrders: 0,
      totalMRs: 0,
      totalCustomers: 0,
      credits: 0,
      cash: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("today");
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
  const [saleTypes, setSaleTypes] = useState([]);
  const [selectedSaleType, setSelectedSaleType] = useState("Total sales");
  const [exporting, setExporting] = useState(false);

  const inputRef = useRef(null);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  // Helper: Convert local Date to YYYY-MM-DD string (no timezone shift)
  const formatDateLocal = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Format date to "1 April 2026" format
  const formatDateToDisplay = (dateString) => {
    if (!dateString) return "N/A";

    // If dateString is already in "1 April 2026" format, return as is
    if (
      typeof dateString === "string" &&
      dateString.match(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/)
    ) {
      return dateString;
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "N/A";

    const day = date.getDate();
    const month = date.toLocaleString("default", { month: "long" });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  };

  // Calculate serial number based on current page and items per page
  const getSerialNumber = (index) => {
    const itemsPerPage = 7;
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
      endDate: formatDateLocal(endDate),
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  const getDateRange = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (selectedTab) {
      case "today":
        return {
          startDate: formatDateLocal(today),
          endDate: formatDateLocal(today),
          displayDate: formatDateLocal(today),
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
          startDate: formatDateLocal(firstDay),
          endDate: formatDateLocal(lastDay),
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };

      case "janToPreviousMonth":
        const janToPrevRange = getJanToPreviousMonthRange();
        return {
          startDate: janToPrevRange.startDate,
          endDate: janToPrevRange.endDate,
          displayDate: janToPrevRange.label,
        };

      case "custom":
        return {
          startDate: customDateRange.startDate
            ? formatDateLocal(customDateRange.startDate)
            : "",
          endDate: customDateRange.endDate
            ? formatDateLocal(customDateRange.endDate)
            : "",
          displayDate:
            customDateRange.startDate && customDateRange.endDate
              ? `${formatDateToDisplay(customDateRange.startDate)} - ${formatDateToDisplay(customDateRange.endDate)}`
              : "Select custom dates",
        };

      default:
        return {
          startDate: null,
          endDate: null,
          displayDate: "Today",
        };
    }
  };

  const fetchDailyReports = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      let params = {
        page: page,
        limit: 7,
        dateFilter: selectedTab,
      };

      // Only add date parameters for tabs that require them
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
          params = {
            ...params,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          };
        }
      }

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      if (selectedSaleType !== "Total sales") {
        params.saleType = selectedSaleType;
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/daily-reports`,
        {
          params,
        },
      );

      let records = response.data.data?.records || [];

      // For custom date filter, set the date field to the selected range display
      if (
        selectedTab === "custom" &&
        dateRange.startDate &&
        dateRange.endDate
      ) {
        const startDateObj = customDateRange.startDate;
        const endDateObj = customDateRange.endDate;
        const dateRangeText = `${formatDateToDisplay(startDateObj)} - ${formatDateToDisplay(endDateObj)}`;

        records = records.map((record) => ({
          ...record,
          date: dateRangeText,
        }));
      }

      setData({
        summary: response.data.data?.summary || {
          totalSalesAmount: 0,
          totalOrders: 0,
          totalMRs: 0,
          totalCustomers: 0,
          credits: 0,
          cash: 0,
        },
        records: records,
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
      console.error("Error fetching daily reports:", error);
      showToast("error", "Failed to fetch daily reports data");

      setData({
        summary: {
          totalSalesAmount: 0,
          totalOrders: 0,
          totalMRs: 0,
          totalCustomers: 0,
          credits: 0,
          cash: 0,
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

  const fetchSaleTypes = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/reports/daily-reports/types`,
      );
      const types = response.data || [];
      setSaleTypes(types);
    } catch (error) {
      console.error("Error fetching sale types:", error);
      showToast("error", "Failed to fetch sale types");
    }
  };

  useEffect(() => {
    const defaultType = saleTypes.find(
      (typeObj) => typeObj.sequenceNumber === 1,
    );
    if (defaultType) {
      setSelectedSaleType(defaultType.type);
    }
  }, [saleTypes]);

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) {
        fetchDailyReports(1);
      } else {
        setData({
          summary: {
            totalSalesAmount: 0,
            totalOrders: 0,
            totalMRs: 0,
            totalCustomers: 0,
            credits: 0,
            cash: 0,
          },
          records: [],
        });
      }
    } else {
      fetchDailyReports(1);
    }
  }, [selectedTab, selectedSaleType]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchDailyReports(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    fetchSaleTypes();
  }, []);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchDailyReports(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchDailyReports(1);
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  // Debounced search
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchDailyReports(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchDailyReports(1);
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
    fetchDailyReports(1);
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
    }
  };

  const handleSaleTypeChange = (type) => {
    setSelectedSaleType(type);
  };

  const handleClearFilters = () => {
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
    setSearchTerm("");
    setSelectedTab("today");
    setSelectedSaleType("Total sales");
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }

    setExporting(true);
    try {
      const dateRange = getDateRange();

      const exportParams = {
        saleType:
          selectedSaleType !== "Total sales" ? selectedSaleType : undefined,
        dateFilter: selectedTab,
        search: searchTerm.trim() || undefined,
        export: true,
      };

      if (selectedTab !== "all" && dateRange.startDate && dateRange.endDate) {
        exportParams.startDate = dateRange.startDate;
        exportParams.endDate = dateRange.endDate;
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/daily-reports/export`,
        {
          params: exportParams,
          responseType: "blob",
        },
      );

      let filename = "daily_reports.xlsx";
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

      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response && error.response.status === 404) {
        showToast("warning", "No data found for the selected filters");
      } else {
        showToast("error", "Failed to export data to Excel");
      }
    } finally {
      setExporting(false);
    }
  };

  const getActiveFilterDisplay = () => {
    const dateRange = getDateRange();
    return dateRange.displayDate || "Today";
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

  const capitalizeFirstLetter = (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getTableColumns = () => {
    switch (selectedSaleType) {
      case "Total sales":
        return ["credits", "cash", "totalSales"];
      case "Cash Sales":
        return ["cash", "totalSales"];
      case "Credit Sales":
        return ["credits", "totalSales"];
      default:
        return ["credits", "cash", "totalSales"];
    }
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Sales</p>
            <p className="text-2xl font-bold text-gray-800">
              ${data.summary.totalSalesAmount?.toLocaleString() || 0}
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
              {data.summary.totalOrders?.toLocaleString() || 0}
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
              {data.summary.totalMRs?.toLocaleString() || 0}
            </p>
          </div>
          <Users className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalCustomers?.toLocaleString() || 0}
            </p>
          </div>
          <User className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  const renderPaymentBreakdown = () => {
    const columns = getTableColumns();

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {columns.includes("credits") && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Total Credits</p>
                <p className="text-2xl font-bold text-gray-800">
                  ${data.summary.credits?.toLocaleString() || 0}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-500" />
            </div>
          </div>
        )}

        {columns.includes("cash") && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Total Cash</p>
                <p className="text-2xl font-bold text-gray-800">
                  ${data.summary.cash?.toLocaleString() || 0}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTableHeaders = () => {
    const columns = getTableColumns();

    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className="p-3 text-sm font-medium">Sr.No</th>
          <th className="p-3 text-sm font-medium">MR Name</th>
          <th className="p-3 text-sm font-medium">Contact</th>
          <th className="p-3 text-sm font-medium">Email</th>
          <th className="p-3 text-sm font-medium">Team</th>
          {columns.includes("credits") && (
            <th className="p-3 text-sm font-medium">Credits ($)</th>
          )}
          {columns.includes("cash") && (
            <th className="p-3 text-sm font-medium">Cash ($)</th>
          )}
          <th className="p-3 text-sm font-medium">Total Sales ($)</th>
          <th className="p-3 text-sm font-medium">Date</th>
        </tr>
      </thead>
    );
  };

  const renderTableRow = (mr, index) => {
    const columns = getTableColumns();

    // Get the date to display
    let displayDate = mr.date;

    // If it's custom filter and we have date range, show the range
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      const startDateObj = customDateRange.startDate;
      const endDateObj = customDateRange.endDate;
      displayDate = `${formatDateToDisplay(startDateObj)} - ${formatDateToDisplay(endDateObj)}`;
    } else if (mr.date && mr.date !== "N/A" && mr.date !== "") {
      displayDate = formatDateToDisplay(mr.date);
    } else {
      displayDate = "N/A";
    }

    return (
      <tr
        key={index}
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
          <div>
            <div className="text-sm font-medium text-gray-900 capitalize">
              {mr.mrName}
            </div>
          </div>
        </td>

        <td className="p-3">
          <div className="text-sm text-gray-900">
            {mr.mrContactNo || "Not Available"}
          </div>
        </td>

        <td className="p-3">
          <div className="text-sm text-gray-900">
            {mr.mrEmail || "Not Available"}
          </div>
        </td>

        <td className="p-3">
          <div className="text-sm text-gray-900">
            {mr.mrTeamName || "Not Available"}
          </div>
        </td>

        {columns.includes("credits") && (
          <td className="p-3 text-sm font-semibold text-blue-600">
            $
            {mr.credits?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || "0.00"}
          </td>
        )}

        {columns.includes("cash") && (
          <td className="p-3 text-sm font-semibold text-green-600">
            $
            {mr.cash?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || "0.00"}
          </td>
        )}

        <td className="p-3 text-sm font-semibold text-gray-800">
          $
          {mr.totalSalesAmount?.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) || "0.00"}
        </td>

        <td className="p-3 text-sm text-gray-600">{displayDate}</td>
      </tr>
    );
  };

  const getColSpan = () => {
    const columns = getTableColumns();
    let colCount = 6; // Sr.No, MR Name, Contact, Email, Team, Total Sales, Date
    if (columns.includes("credits")) colCount++;
    if (columns.includes("cash")) colCount++;
    return colCount;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-800">Daily Reports</h1>
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
            disabled={exporting || data.records.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              exporting || data.records.length === 0
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download size={18} />
                Export Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sale Type Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {saleTypes.map((typeObj) => (
            <button
              key={typeObj.type}
              onClick={() => handleSaleTypeChange(typeObj.type)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedSaleType === typeObj.type
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {capitalizeFirstLetter(typeObj.type)}
            </button>
          ))}
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
          {selectedSaleType !== "Total sales" && (
            <>
              <span className="mx-2">•</span>
              <span className="font-medium">{selectedSaleType}</span>
            </>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {renderSummaryCards()}

      {/* Payment Breakdown */}
      {renderPaymentBreakdown()}

      {/* Data Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-3 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((mr, index) => renderTableRow(mr, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-3 text-center text-gray-500"
                >
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No daily reports data found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

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
                <div className="space-y-4">
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
                        handleCustomDateChange("endDate", date)
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
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
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

export default DailyReports;
