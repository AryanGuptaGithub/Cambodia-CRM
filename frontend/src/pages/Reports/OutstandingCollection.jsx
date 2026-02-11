import React, { useState, useEffect, useRef } from "react";
import {
  Receipt,
  Download,
  Filter,
  User,
  Phone,
  Mail,
  X,
  Upload,
  Search,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import * as XLSX from "xlsx";
import OutstandingCollectionSampleExcelDownload from "../../excels/OutstandingCollectionSampleExcelDownload.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// Customer Dropdown Component
const CustomerDropdown = ({
  value,
  onChange,
  options,
  placeholder = "Select customer...",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.code?.toLowerCase().includes(searchTerm.toLowerCase())
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
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer ${
          disabled ? "bg-gray-100" : "bg-white hover:border-gray-400"
        }`}
      >
        {selectedOption ? (
          <div className="flex justify-between items-center">
            <span className="text-sm">{selectedOption.label}</span>
            <span className="text-xs text-gray-500">{selectedOption.code}</span>
          </div>
        ) : (
          <span className="text-gray-400 text-sm">{placeholder}</span>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-hidden">
          <div className="p-2 border-b">
            <input
              type="text"
              placeholder="Search customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                    value === option.value ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm">{option.label}</span>
                    <span className="text-xs text-gray-500">{option.code}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-gray-500">
                No customers found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const OutstandingCollection = () => {
  const [data, setData] = useState({
    summary: {
      totalOutstandingAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalInvoices: 0,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Customer dropdown states
  const [customerOptions, setCustomerOptions] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  // Calculate serial number based on current page and items per page
  const getSerialNumber = (index) => {
    const itemsPerPage = 7;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  // Fetch ALL customer options from your API
  const fetchCustomerOptions = async () => {
    setLoadingCustomers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/customers`);
      const customers = response.data.customers || [];
      const options = customers.map((customer) => ({
        value: customer.customerCode,
        label: customer.name || "Unnamed Customer",
        code: customer.customerCode,
        phone: customer.customerNumber,
        address: customer.address,
      }));
      setCustomerOptions(options);
    } catch (error) {
      console.error("Error fetching customers:", error);
      showToast("error", "Failed to fetch customer list");
      setCustomerOptions([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Load ALL customers on component mount
  useEffect(() => {
    fetchCustomerOptions();
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

  const fetchOutstandingCollections = async (page = 1, search = searchTerm) => {
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

      // Only include customer name and status filters when custom tab is selected
      if (selectedTab === "custom") {
        if (filter.customerName) {
          params.customerCode = filter.customerName;
        }
        if (filter.status !== "all") {
          params.status = filter.status;
        }
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections`,
        { params }
      );

      console.log('valueso f response', response.data.data);
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
    fetchOutstandingCollections(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchOutstandingCollections(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchOutstandingCollections(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchOutstandingCollections(1, "");
  };

  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilter((prev) => ({ ...prev, [name]: value }));
  };

  // Handle customer name change from dropdown
  const handleCustomerNameChange = (value) => {
    setFilter((prev) => ({ ...prev, customerName: value }));
  };

  // Debounced search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchOutstandingCollections(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchOutstandingCollections(1);
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
    fetchOutstandingCollections(1);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setFilter({
        customerName: "",
        status: "all",
      });
      setCustomDateRange({
        startDate: null,
        endDate: null,
      });
      fetchOutstandingCollections(1);
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
    setSearchTerm("");
    setSelectedTab("all");
    fetchOutstandingCollections(1);
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast("warning", "Please select both start and end dates for export");
        setExportLoading(false);
        return;
      }

      if (data.records.length === 0) {
        showToast("warning", "No data available to export");
        setExportLoading(false);
        return;
      }
      const params = new URLSearchParams();

      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      if (searchTerm) params.append("search", searchTerm);
      if (selectedTab === "custom" && filter.customerName) {
        params.append("customerCode", filter.customerName);
      }

      const downloadUrl = `${backendUrl}/api/reports/outstanding-collections/export/excel?${params.toString()}`;

      const response = await axios.get(downloadUrl, {
        responseType: "blob",
      });

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      let fileName = "outstanding-collections-report";
      if (dateRange.startDate && dateRange.endDate) {
        fileName = `outstanding-collections-${dateRange.startDate.replace(
          /-/g,
          ""
        )}-to-${dateRange.endDate.replace(/-/g, "")}`;
      } else {
        const today = new Date().toISOString().split("T")[0];
        fileName = `outstanding-collections-${today.replace(/-/g, "")}`;
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

  // Handle Import Click - Open modal without file selection
  const handleImportClick = () => {
    setShowImportModal(true);
    // Reset file input when opening modal
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle Excel Upload - Parse file and set parsed data
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true,
          cellNF: false,
          cellText: false,
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true,
        });

        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }

        // Find header row
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const firstCell = rows[i]?.[0]?.toString().trim().toLowerCase();
          if (firstCell === "invoice number") {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          showToast("error", "Header row not found. Make sure first column is 'Invoice Number'");
          return;
        }

        const headers = rows[headerIdx].map((h) => h?.toString().trim() || "");
        const dataRows = rows.slice(headerIdx + 1);

        const json = dataRows
          .map((row) => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] !== undefined ? row[i] : "";
            });
            return obj;
          })
          .filter((o) => o["Invoice Number"]?.toString().trim() !== "");

        const validData = json.map((item) => ({
          invoiceNumber: item["Invoice Number"]?.toString().trim() || "",
          totalAmount: parseFloat(item["Total Amount"] || 0) || 0,
          paidAmount: parseFloat(item["Paid Amount"] || 0) || 0,
          creditDays: parseInt(item["Credit Days"] || 0) || 0,
          remarks: item["Remarks"]?.toString().trim() || "",
        })).filter(item => item.invoiceNumber && item.totalAmount > 0);

        if (validData.length === 0) {
          showToast("warning", "No valid records found in the Excel file");
          return;
        }

        setParsedData(validData);
      } catch (err) {
        console.error("Error parsing file:", err);
        showToast("error", "Failed to parse file: " + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = async () => {
    if (!parsedData.length) {
      showToast("warning", "Upload a valid file first");
      return;
    }

    setIsUploading(true);
    try {
      const response = await axios.post(
        `${backendUrl}/api/reports/outstanding-collections/bulk-update`,
        { updates: parsedData }
      );

      console.log('values of response', response.data);
      if (response.data.success) {
        showToast(
          "success",
          `Successfully updated ${response.data.successCount} sales. Failed: ${response.data.failedCount}`
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchOutstandingCollections(1);
      } else {
        showToast("error", response.data.message || "Failed to update sales");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      let errorMsg = "Failed to upload file";
      if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      showToast("error", errorMsg);
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
            customDateRange.startDate
          )} to ${formatDateForDisplay(customDateRange.endDate)}`;

          // Add customer name filter if applied
          if (filter.customerName) {
            const selectedCustomer = customerOptions.find(
              (opt) => opt.value === filter.customerName
            );
            display += ` | Customer: ${
              selectedCustomer?.label || filter.customerName
            }`;
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

    const startItem = (pagination.currentPage - 1) * 7 + 1;
    const endItem = Math.min(
      pagination.currentPage * 7,
      pagination.totalRecords
    );

    return (
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasPrev
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            ← Prev
          </button>

          {/* Page Numbers */}
          <div className="flex gap-1">
            {visiblePages.map((page, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof page === "number" ? handlePageChange(page) : null
                }
                className={`min-w-[40px] px-3 py-2 rounded-lg ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white cursor-default"
                    : typeof page === "number"
                    ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
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
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasNext
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Next →
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Showing {startItem} to {endItem} of {pagination.totalRecords} records
        </div>
      </div>
    );
  };

  const isExportDisabled = loading || exportLoading || data.records.length === 0;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Receipt className="w-8 h-8 text-orange-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Outstanding Collection
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by customer name or customer code..."
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

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button
            onClick={handleImportClick}
            disabled={isUploading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-md cursor-pointer ${
              isUploading
                ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            }`}
          >
            <Upload size={18} />
            {isUploading ? "Uploading..." : "Upload Excel"}
          </button>

          <button
            onClick={exportToExcel}
            disabled={isExportDisabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              isExportDisabled
                ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
            title={
              data.records.length === 0
                ? "No data available to export"
                : "Export to Excel"
            }
          >
            <Download size={18} />
            {exportLoading ? "Exporting..." : "Export Excel"}
          </button>
        </div>
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
          <span className="text-gray-500 ml-2">
            ({pagination.totalRecords} records found)
          </span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-800">
                ${(data.summary.totalOutstandingAmount || 0).toLocaleString()}
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
                ${(data.summary.totalOverdueAmount || 0).toLocaleString()}
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
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalInvoices || 0}
              </p>
            </div>
            <Receipt className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">Customer Code</th>
              <th className="p-3 text-sm font-medium">Customer Name</th>
              <th className="p-3 text-sm font-medium">Contact</th>
              <th className="p-3 text-sm font-medium">Total Outstanding ($)</th>
              <th className="p-3 text-sm font-medium">Overdue Amount ($)</th>
              <th className="p-3 text-sm font-medium">Overdue Days</th>
              <th className="p-3 text-sm font-medium">Last Transaction</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="p-3 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((customer, index) => (
                <tr
                  key={customer._id || index}
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
                    <div className="text-sm text-gray-600 font-medium">
                      {customer.customerCode || "N/A"}
                    </div>
                  </td>
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
                        <span className="text-xs">{customer.phone || "N/A"}</span>
                      </div>
                      {customer.email && (
                        <div className="flex items-center justify-center gap-1">
                          <Mail size={12} />
                          <span className="text-xs">{customer.email}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-sm font-semibold text-orange-600">
                    ${(customer.totalOutstandingAmount || 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-sm font-semibold text-red-600">
                    ${(customer.overdueAmount || 0).toLocaleString()}
                  </td>
                  <td className="p-3">
                    <div className={`text-sm font-medium ${customer.overdueDays > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {customer.overdueDays > 0 ? `${customer.overdueDays} days` : 'On Time'}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {customer.lastTransactionDate ? formatDateToReadable(customer.lastTransactionDate) : 'N/A'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="p-3 text-center text-gray-500">
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

      {renderPagination()}

      {/* Import Modal - EXACTLY LIKE CUSTOMER COMPONENT */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                  }
                }}
                disabled={isUploading}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold mb-4">Import Outstanding Collection</h2>
              
              {/* Sample Download - Inside Modal */}
              {isSampleFile && <OutstandingCollectionSampleExcelDownload />}
              
              <div className="mb-6 mt-4">
                <label className="block text-gray-700 mb-2 font-medium">File</label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Download the template above, fill in your data, and upload here.
                </p>
              </div>
              
              <div className="flex justify-between items-center mt-6">
                <div className="text-gray-700">
                  {parsedData.length > 0 ? (
                    <>
                      Rows to import:{" "}
                      <span className="font-semibold text-blue-600">
                        {parsedData.length}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-500">No data to import</span>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setParsedData([]);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                    }}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImportSubmit}
                    disabled={isUploading || parsedData.length === 0}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading || parsedData.length === 0
                        ? "bg-blue-400 text-white cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isUploading ? "Uploading…" : `Upload (${parsedData.length})`}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Outstanding Collection Filter
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

                {/* Customer Name Dropdown with Search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name
                  </label>
                  <CustomerDropdown
                    value={filter.customerName}
                    onChange={handleCustomerNameChange}
                    options={customerOptions}
                    placeholder={
                      loadingCustomers
                        ? "Loading customers..."
                        : "Select or search customer..."
                    }
                    disabled={loadingCustomers}
                  />
                  {loadingCustomers && (
                    <p className="text-xs text-gray-500 mt-1">
                      Loading customers...
                    </p>
                  )}
                  {!loadingCustomers && customerOptions.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {customerOptions.length} customers available
                    </p>
                  )}
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