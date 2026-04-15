import React, { useState, useEffect, useRef } from "react";
import {
  Coins,
  Download,
  Filter,
  Calendar,
  Building2,
  X,
  ChevronLeft,
  ChevronRight,
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

// Supplier Dropdown Component (Responsive)
const SupplierDropdown = ({
  value,
  onChange,
  options,
  placeholder = "Select supplier...",
  disabled = false,
  isMobileView = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center ${
          disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
        } ${isMobileView ? "text-sm" : "text-sm"}`}
      >
        <span className={!selectedOption ? "text-gray-400" : "text-gray-800"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronRight
          size={16}
          className={`transform transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2 border-b sticky top-0 bg-white">
            <input
              type="text"
              placeholder="Search supplier..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              No suppliers found
            </div>
          ) : (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
                className={`px-3 py-2 cursor-pointer hover:bg-indigo-50 text-sm ${
                  value === option.value ? "bg-indigo-100 text-indigo-700" : ""
                }`}
              >
                {option.label}
                {option.code && (
                  <span className="text-xs text-gray-400 ml-2">
                    ({option.code})
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const Remittance = () => {
  const [data, setData] = useState({
    summary: {
      totalRemittanceAmount: 0,
      totalFinalAmount: 0,
      totalExchangeLoss: 0,
      totalRecords: 0,
      totalSuppliers: 0,
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
    search: "",
    supplierId: "",
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
  const inputRef = useRef(null);

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Supplier dropdown states
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  // Fetch ALL supplier options from your API
  const fetchSupplierOptions = async () => {
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      const suppliers = response.data.data || [];
      const options = suppliers.map((supplier) => ({
        value: supplier._id,
        label: supplier.name || "Unnamed Supplier",
        code: supplier.code,
      }));
      setSupplierOptions(options);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      showToast("error", "Failed to fetch supplier list");
      setSupplierOptions([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  useEffect(() => {
    fetchSupplierOptions();
  }, []);

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

  const fetchRemittance = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      let params = {
        page: page,
        limit: 7,
      };

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

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      if (selectedTab === "custom") {
        if (filter.supplierId) {
          params.supplierId = filter.supplierId;
        }
        if (filter.search) {
          params.search = filter.search;
        }
      }

      const response = await axios.get(`${backendUrl}/api/reports/remittance`, {
        params,
      });

      setData(response.data.data || { summary: {}, records: [] });
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
      console.error("Error fetching remittance:", error);
      showToast("error", "Failed to fetch remittance data");
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
    fetchRemittance(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchRemittance(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchRemittance(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchRemittance(1);
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter((prev) => ({ ...prev, [name]: value }));
  };

  const handleSupplierChange = (value) => {
    setFilter((prev) => ({ ...prev, supplierId: value }));
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchRemittance(1);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchRemittance(1);
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
    fetchRemittance(1);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setFilter({
        search: "",
        supplierId: "",
      });
      setCustomDateRange({
        startDate: null,
        endDate: null,
      });
      setSearchTerm("");
      fetchRemittance(1);
    }
  };

  const handleClearFilters = () => {
    setFilter({
      search: "",
      supplierId: "",
    });
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
    setSearchTerm("");
    fetchSupplierOptions();
    fetchRemittance(1);
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast(
          "warning",
          "Please select both start and end dates for export",
        );
        setExportLoading(false);
        return;
      }

      const params = new URLSearchParams();

      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      if (searchTerm) params.append("search", searchTerm);
      if (selectedTab === "custom" && filter.supplierId) {
        params.append("supplierId", filter.supplierId);
      }

      const downloadUrl = `${backendUrl}/api/reports/remittance/export/excel?${params.toString()}`;

      const response = await axios.get(downloadUrl, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      let fileName = "remittance-report";
      if (dateRange.startDate && dateRange.endDate) {
        fileName = `remittance-${dateRange.startDate.replace(
          /-/g,
          "",
        )}-to-${dateRange.endDate.replace(/-/g, "")}`;
      } else {
        const today = new Date().toISOString().split("T")[0];
        fileName = `remittance-${today.replace(/-/g, "")}`;
      }
      fileName += ".xlsx";

      link.download = fileName;
      document.body.appendChild(link);
      link.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response?.status === 400) {
        showToast("error", "Invalid date format for export");
      } else if (error.response?.status === 404) {
        showToast("error", "Export service not available");
      } else {
        showToast("error", "Failed to export to Excel");
      }
    } finally {
      setExportLoading(false);
    }
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
            customDateRange.startDate,
          )} to ${formatDateForDisplay(customDateRange.endDate)}`;

          if (filter.supplierId) {
            const selectedSupplier = supplierOptions.find(
              (opt) => opt.value === filter.supplierId,
            );
            display += ` | Supplier: ${
              selectedSupplier?.label || filter.supplierId
            }`;
          }

          if (filter.search) {
            display += ` | Search: ${filter.search}`;
          }

          return display;
        }
        return "Select custom dates";

      default:
        if (searchTerm) {
          return `Search: ${searchTerm}`;
        }
        return "All Records";
    }
  };

  // Responsive table headers
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Supplier</th>
          <th className={thClass}>Amount ($)</th>
          <th className={thClass}>Transactions</th>
        </tr>
      </thead>
    );
  };

  // Responsive summary cards
  const renderSummaryCards = () => {
    const cardClass = `bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4`;
    const valueClass = `${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`;
    const labelClass = `${isMobileView ? "text-xs" : "text-sm"} text-gray-600`;

    const cards = [
      {
        label: "Total Remittance",
        value: `$${(data.summary.totalRemittanceAmount || 0).toLocaleString()}`,
        icon: (
          <Coins
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-yellow-500`}
          />
        ),
        border: "border-yellow-500",
      },
      {
        label: "Total Final Amount",
        value: `$${(data.summary.totalFinalAmount || 0).toLocaleString()}`,
        icon: (
          <Coins
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
        border: "border-blue-500",
      },
      {
        label: "Total Bank Charges",
        value: `$${(data.summary.totalExchangeLoss || 0).toLocaleString()}`,
        icon: (
          <Building2
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-red-500`}
          />
        ),
        border: "border-red-500",
      },
      {
        label: "Total Records",
        value: (data.summary.totalRecords || 0).toLocaleString(),
        icon: (
          <Calendar
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
        border: "border-green-500",
      },
    ];

    return (
      <div
        className={`grid gap-4 mb-6 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-6"}`}
      >
        {cards.map(({ label, value, icon, border }) => (
          <div
            key={label}
            className={`${cardClass} ${border} border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{label}</div>
                <div className={valueClass}>{value}</div>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Responsive pagination
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

  const isExportDisabled = exportLoading || false;

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
        <div className="flex justify-between items-center mb-4 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Coins className="w-5 h-5 text-yellow-600" />
            <h1 className="text-base font-bold text-gray-800">Remittance</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <Coins className="w-8 h-8 text-yellow-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              Remittance Report
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by supplier name..."
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
              disabled={isExportDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
                isExportDisabled
                  ? "bg-green-700 text-white opacity-75 cursor-wait"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
              title={exportLoading ? "Exporting..." : "Export to Excel"}
            >
              <Download size={18} />
              {exportLoading ? "Exporting..." : "Export Excel"}
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
            placeholder="Search supplier..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyPress={handleSearch}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
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
          <button
            onClick={() => handleTabChange("all")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              selectedTab === "all"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            All Records
          </button>
          <button
            onClick={() => handleTabChange("currentMonth")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              selectedTab === "currentMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {isMobileView
              ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
              : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`}
          </button>
          <button
            onClick={() => handleTabChange("janToPreviousMonth")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              selectedTab === "janToPreviousMonth"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {isMobileView
              ? getJanToPreviousMonthRange().label.slice(0, 12)
              : getJanToPreviousMonthRange().label}
          </button>
          <button
            onClick={() => handleTabChange("custom")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
              selectedTab === "custom"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Custom
          </button>
        </div>

        {/* Active Filter Display */}
        <div
          className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
        >
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter: </span>
          <span className="font-medium break-all">
            {getActiveFilterDisplay()}
          </span>
          <span className="text-gray-500 ml-1">
            ({pagination.totalRecords} records)
          </span>
        </div>
      </div>

      {renderSummaryCards()}

      {/* Data Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[400px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4" className="p-6 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className={`${isMobileView ? "text-xs" : "text-sm"}`}>
                      Loading...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((remittance, index) => (
                <tr
                  key={remittance.supplierId || index}
                  className={`hover:bg-gray-50 ${
                    index === data.records.length - 1 ? "" : "border-b"
                  }`}
                >
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} text-gray-600 font-medium`}
                  >
                    {(pagination.currentPage - 1) * 7 + index + 1}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} text-gray-900 capitalize font-medium`}
                  >
                    {remittance.supplierName || "N/A"}
                    {isMobileView && remittance.transactionCount && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {remittance.transactionCount} transactions
                      </div>
                    )}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} font-semibold text-yellow-600`}
                  >
                    ${(remittance.totalRemittanceAmount || 0).toLocaleString()}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} text-gray-900`}
                  >
                    {remittance.transactionCount || 0}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan="4"
                  className={`p-6 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                >
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No remittance data found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* ── MOBILE bottom action bar (Export button REMOVED) ── */}
      {/* Export button is completely removed on mobile view */}

      {/* Custom Filter Modal - Responsive */}
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
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Remittance Report Filter
              </h2>

              <div className="space-y-4 mb-6">
                <div
                  className={`grid ${isMobileView ? "grid-cols-1 gap-4" : "grid-cols-2 gap-4"}`}
                >
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
                        handleCustomDateChange("endDate", date)
                      }
                      selectsEnd
                      startDate={customDateRange.startDate}
                      endDate={customDateRange.endDate}
                      minDate={customDateRange.startDate}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholderText="End date"
                      dateFormat="yyyy-MM-dd"
                      isClearable
                    />
                  </div>
                </div>

                {/* Supplier Dropdown with Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Supplier
                  </label>
                  <SupplierDropdown
                    value={filter.supplierId}
                    onChange={handleSupplierChange}
                    options={supplierOptions}
                    placeholder={
                      loadingSuppliers
                        ? "Loading suppliers..."
                        : "Select or search supplier..."
                    }
                    disabled={loadingSuppliers}
                    isMobileView={isMobileView}
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

export default Remittance;
