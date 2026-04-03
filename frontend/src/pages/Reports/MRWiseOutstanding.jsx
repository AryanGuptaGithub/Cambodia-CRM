import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Download,
  Filter,
  User,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  FileText,
  Eye,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Helper: format date to YYYY-MM-DD in LOCAL timezone (no UTC shift)
const formatLocalDate = (date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const MRWiseOutstanding = () => {
  const [data, setData] = useState({
    summary: {
      totalOutstandingAmount: 0,
      totalCustomers: 0,
      totalMRs: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingModal, setExportingModal] = useState(false);
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

  // State for customer modal
  const [selectedMR, setSelectedMR] = useState(null);
  const [customerDetails, setCustomerDetails] = useState([]);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

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
      endDate: formatLocalDate(endDate),
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  const getDateRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    switch (selectedTab) {
      case "currentMonth":
        return {
          startDate: formatLocalDate(new Date(currentYear, currentMonth, 1)),
          endDate: formatLocalDate(new Date(currentYear, currentMonth + 1, 0)),
        };
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange();
      case "custom":
        return {
          startDate: customDateRange.startDate
            ? formatLocalDate(customDateRange.startDate)
            : "",
          endDate: customDateRange.endDate
            ? formatLocalDate(customDateRange.endDate)
            : "",
        };
      default:
        return {};
    }
  };

  const fetchMRWiseOutstanding = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      let params = { page, limit: 7 };
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
        params = {
          ...params,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
      }
      if (search && search.trim() !== "") params.search = search.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/mr-wise-outstanding`,
        { params },
      );

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
      console.error("Error fetching MR wise outstanding:", error);
      showToast("error", "Failed to fetch MR wise outstanding data");
      setData({
        summary: { totalOutstandingAmount: 0, totalCustomers: 0, totalMRs: 0 },
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

  // Fetch invoice-level details for a specific MR
  const fetchCustomerDetails = async (mrName) => {
    setLoadingCustomers(true);
    try {
      const dateRange = getDateRange();
      const params = {};
      if (selectedTab !== "all") {
        params.startDate = dateRange.startDate;
        params.endDate = dateRange.endDate;
      }
      const response = await axios.get(
        `${backendUrl}/api/reports/mr-wise-outstanding/customers/${encodeURIComponent(mrName)}`,
        { params },
      );
      if (response.data.success) {
        setCustomerDetails(response.data.data);
      } else {
        showToast("error", "Failed to load invoice details");
      }
    } catch (error) {
      console.error("Error fetching invoice details:", error);
      showToast("error", "Failed to load invoice details");
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Export modal data to Excel
  const exportModalToExcel = async () => {
    if (!selectedMR || customerDetails.length === 0) {
      showToast("warning", "No data to export");
      return;
    }

    setExportingModal(true);
    try {
      const dateRange = getDateRange();
      const params = new URLSearchParams();
      params.append("mrName", selectedMR.mrName);
      if (selectedTab !== "all") {
        if (dateRange.startDate)
          params.append("startDate", dateRange.startDate);
        if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/mr-wise-outstanding/export/mr-excel`,
        { params, responseType: "blob" },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const fileName = `${selectedMR.mrName.replace(/\s/g, "_")}_outstanding_invoices.xlsx`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "MR invoice details exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to export MR invoice details.",
      );
    } finally {
      setExportingModal(false);
    }
  };

  const handleRowClick = (mr) => {
    setSelectedMR(mr);
    setCustomerModalOpen(true);
    fetchCustomerDetails(mr.mrName);
  };

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate) {
        fetchMRWiseOutstanding(1);
      } else {
        setData({
          summary: {
            totalOutstandingAmount: 0,
            totalCustomers: 0,
            totalMRs: 0,
          },
          records: [],
        });
      }
    } else {
      fetchMRWiseOutstanding(1);
    }
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchMRWiseOutstanding(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchMRWiseOutstanding(1);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages)
      fetchMRWiseOutstanding(page);
  };

  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchMRWiseOutstanding(1);
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  const handleSearch = (e) => {
    if (e.key === "Enter") fetchMRWiseOutstanding(1);
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
    setSelectedTab("all");
  };

  const exportToExcel = async () => {
    setExporting(true);
    try {
      const dateRange = getDateRange();
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (selectedTab !== "all") {
        if (dateRange.startDate)
          params.append("startDate", dateRange.startDate);
        if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      }
      const response = await axios.get(
        `${backendUrl}/api/reports/mr-wise-outstanding/export/excel`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      let fileName = "mr-wise-outstanding.xlsx";
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const m = contentDisposition.match(/filename="?(.+)"?/);
        if (m?.[1]) fileName = m[1];
      }
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Export error:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to export to Excel.",
      );
    } finally {
      setExporting(false);
    }
  };

  const formatDateForDisplay = (date) =>
    date ? formatDateToReadable(date) : "";

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return `${formatDateForDisplay(customDateRange.startDate)} to ${formatDateForDisplay(customDateRange.endDate)}`;
        }
        return "Select custom dates";
      default:
        return "All Records";
    }
  };

  // Totals for modal footer
  const modalTotals = customerDetails.reduce(
    (acc, row) => {
      acc.totalAmount += row.totalAmount || 0;
      acc.collectedAmount += row.collectedAmount || 0;
      acc.pendingAmount += row.pendingAmount || 0;
      return acc;
    },
    { totalAmount: 0, collectedAmount: 0, pendingAmount: 0 },
  );

  const fmt = (num) =>
    (num || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

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
          <ChevronLeft size={16} /> Prev
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
          <Users className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            MR Wise Outstanding
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by MR name or ID..."
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
            disabled={
              exporting ||
              (selectedTab === "custom" &&
                (!customDateRange.startDate || !customDateRange.endDate))
            }
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              exporting ||
              (selectedTab === "custom" &&
                (!customDateRange.startDate || !customDateRange.endDate))
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <Download size={18} />
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            {
              key: "currentMonth",
              label: `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              key: "janToPreviousMonth",
              label: getJanToPreviousMonthRange().label,
            },
            { key: "custom", label: "Custom Filter" },
            { key: "all", label: "All Records" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
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
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Outstanding</p>
              <p className="text-2xl font-bold text-gray-800">
                ${fmt(data.summary.totalOutstandingAmount)}
              </p>
            </div>
            <FileText className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total Customers</p>
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalCustomers || 0}
              </p>
            </div>
            <Users className="w-8 h-8 text-green-500" />
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
            <User className="w-8 h-8 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium">MR ID</th>
              <th className="p-3 text-sm font-medium">MR Name</th>
              <th className="p-3 text-sm font-medium">Contact</th>
              <th className="p-3 text-sm font-medium">Total Customers</th>
              <th className="p-3 text-sm font-medium">Total Outstanding ($)</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="p-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((mr, index) => (
                <tr
                  key={index}
                  className={`hover:bg-gray-50 cursor-pointer ${
                    index === data.records.length - 1 ? "" : "border-b"
                  }`}
                  onClick={() => handleRowClick(mr)}
                >
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {getSerialNumber(index)}
                  </td>
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {mr.mrId || "N/A"}
                  </td>
                  <td className="p-3">
                    <div className="text-sm font-medium text-gray-900 capitalize">
                      {mr.mrName}
                    </div>
                    <div className="text-xs text-gray-500">
                      {mr.staff?.email || "No email"}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-gray-900">
                    {mr.staff?.contactNo || "Not Available"}
                  </td>
                  <td className="p-3 text-sm font-semibold text-green-600">
                    {mr.totalCustomers || 0}
                  </td>
                  <td className="p-3 text-sm font-semibold text-blue-600">
                    ${fmt(mr.totalOutstandingAmount)}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowClick(mr);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                      title="View Invoice Details"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="p-8 text-center text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No MR wise outstanding data found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {customerModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-5xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <div>
                  <h2 className="text-xl font-semibold text-gray-800">
                    Invoice Details — {selectedMR?.mrName}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    All outstanding invoices for this MR
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportModalToExcel}
                    disabled={exportingModal || customerDetails.length === 0}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer ${
                      exportingModal || customerDetails.length === 0
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    }`}
                    title="Export to Excel"
                  >
                    <Download size={16} />
                    {exportingModal ? "Exporting..." : "Export"}
                  </button>
                  <button
                    onClick={() => setCustomerModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingCustomers ? (
                  <div className="flex justify-center items-center h-40 gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                    <span>Loading invoice details...</span>
                  </div>
                ) : customerDetails.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      No outstanding invoices found for this MR.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Sr.No
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Invoice
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Customer Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Customer Address
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Total Amount ($)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Collected Amount ($)
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider border-b">
                            Pending Amount ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {customerDetails.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-500">
                              {idx + 1}
                            </td>
                            <td className="px-4 py-3 font-mono font-semibold text-indigo-700">
                              {row.invoiceNumber || "N/A"}
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {row.customerName || "N/A"}
                            </td>
                            <td
                              className="px-4 py-3 text-gray-600 max-w-[200px] truncate"
                              title={row.customerAddress}
                            >
                              {row.customerAddress || "N/A"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">
                              ${fmt(row.totalAmount)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-green-600">
                              ${fmt(row.collectedAmount)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">
                              ${fmt(row.pendingAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {/* Footer totals row */}
                      <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                        <tr>
                          <td
                            colSpan="4"
                            className="px-4 py-3 text-sm font-bold text-gray-800 text-right"
                          >
                            Grand Total:
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-800">
                            ${fmt(modalTotals.totalAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">
                            ${fmt(modalTotals.collectedAmount)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-red-600">
                            ${fmt(modalTotals.pendingAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
                <p className="text-sm text-gray-500">
                  {customerDetails.length} invoice
                  {customerDetails.length !== 1 ? "s" : ""} found
                </p>
                <button
                  onClick={() => setCustomerModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
                MR Wise Outstanding Filter
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
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholderText="Select end date"
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

export default MRWiseOutstanding;
