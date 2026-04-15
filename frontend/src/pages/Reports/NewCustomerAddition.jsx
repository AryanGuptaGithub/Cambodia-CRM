import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  Filter,
  User,
  Search,
  X,
  Users,
  MapPin,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  Menu,
} from "lucide-react";
import axios from "axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { showToast } from "../../utils/toast";
import { getVisiblePages } from "../../utils/useVisiblePages";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const NewCustomerAddition = () => {
  const [data, setData] = useState({
    summary: {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

  // ── View type tabs ──────────────────────────────────────────────────────
  const [selectedReportType, setSelectedReportType] = useState("MR Wise");

  // ── Date filter state ───────────────────────────────────────────────────
  const [selectedDateTab, setSelectedDateTab] = useState("all");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });

  // ── Customer Modal State ────────────────────────────────────────────────
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [modalCustomers, setModalCustomers] = useState([]);
  const [modalPagination, setModalPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [modalLoading, setModalLoading] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState(null);

  const inputRef = useRef(null);
  const visiblePages = getVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const modalVisiblePages = getVisiblePages(
    modalPagination.currentPage,
    modalPagination.totalPages,
  );

  // ── Helper: Format Date object to YYYY-MM-DD (local) ────────────────────
  const formatDateLocal = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // ── Helper: Format date string (YYYY-MM-DD) to "4 Mar 2026" ───────────
  const formatDateReadable = (dateStr) => {
    if (!dateStr) return "N/A";
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Date.UTC(year, month - 1, day));
      return date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "Invalid Date";
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ── Date helpers ────────────────────────────────────────────────────────
  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();
  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
    const currentYear = getCurrentYear();
    const currentMonth = new Date().getMonth();
    if (currentMonth === 0) {
      return {
        startDate: `${currentYear - 1}-01-01`,
        endDate: `${currentYear - 1}-12-31`,
        label: `Jan – Dec ${currentYear - 1}`,
      };
    }
    const end = new Date(currentYear, currentMonth, 0);
    return {
      startDate: `${currentYear}-01-01`,
      endDate: formatDateLocal(end),
      label: `Jan – ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  const getDateParams = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    switch (selectedDateTab) {
      case "today":
        return {
          startDate: formatDateLocal(today),
          endDate: formatDateLocal(today),
          displayLabel: "Today",
        };
      case "all":
        return { displayLabel: "All Records" };
      case "currentMonth": {
        const first = new Date(currentYear, currentMonth, 1);
        const last = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: formatDateLocal(first),
          endDate: formatDateLocal(last),
          displayLabel: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const range = getJanToPreviousMonthRange();
        return {
          startDate: range.startDate,
          endDate: range.endDate,
          displayLabel: range.label,
        };
      }
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return {
            startDate: formatDateLocal(customDateRange.startDate),
            endDate: formatDateLocal(customDateRange.endDate),
            displayLabel: `${customDateRange.startDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} – ${customDateRange.endDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
          };
        }
        return { displayLabel: "Select dates" };
      default:
        return { displayLabel: "All Records" };
    }
  };

  // ── Fetch main report data ──────────────────────────────────────────────
  const fetchData = async (page = 1, search = searchTerm) => {
    if (
      selectedDateTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    ) {
      setData({
        summary: {
          totalNewCustomers: 0,
          totalMRs: 0,
          totalZones: 0,
          averageCustomersPerMR: 0,
        },
        records: [],
      });
      return;
    }

    setLoading(true);
    try {
      const dateParams = getDateParams();
      const params = {
        page,
        limit: 7,
        reportType: selectedReportType,
        dateFilter: selectedDateTab,
      };
      if (dateParams.startDate) params.startDate = dateParams.startDate;
      if (dateParams.endDate) params.endDate = dateParams.endDate;
      if (search?.trim()) params.search = search.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/new-customers`,
        { params },
      );
      setData(
        response.data.data || {
          summary: {
            totalNewCustomers: 0,
            totalMRs: 0,
            totalZones: 0,
            averageCustomersPerMR: 0,
          },
          records: [],
        },
      );
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
      console.error("Error fetching new customer data:", error);
      showToast("error", "Failed to fetch new customer data");
      setData({
        summary: {
          totalNewCustomers: 0,
          totalMRs: 0,
          totalZones: 0,
          averageCustomersPerMR: 0,
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

  // ── Fetch customers for modal ───────────────────────────────────────────
  const fetchModalCustomers = async (entity, page = 1) => {
    if (!entity) return;

    setModalLoading(true);
    try {
      const dateParams = getDateParams();
      const params = {
        page,
        limit: 10,
        dateFilter: selectedDateTab,
      };
      if (dateParams.startDate) params.startDate = dateParams.startDate;
      if (dateParams.endDate) params.endDate = dateParams.endDate;

      if (entity.type === "mr") {
        if (entity.id && entity.id !== "N/A") {
          params.mrId = entity.id;
        } else {
          params.mrName = entity.name;
        }
      } else if (entity.type === "zone") {
        params.zone = entity.name;
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/new-customers/customers`,
        { params },
      );

      if (response.data.success) {
        setModalCustomers(response.data.data || []);
        setModalPagination(
          response.data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 0,
            hasNext: false,
            hasPrev: false,
          },
        );
      } else {
        showToast("error", response.data.message || "Failed to load customers");
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      showToast("error", "Failed to load customers");
    } finally {
      setModalLoading(false);
    }
  };

  // ── Open modal for MR or Zone ───────────────────────────────────────────
  const openCustomerModal = (entity) => {
    setSelectedEntity(entity);
    setIsCustomerModalOpen(true);
    fetchModalCustomers(entity, 1);
  };

  const closeCustomerModal = () => {
    setIsCustomerModalOpen(false);
    setSelectedEntity(null);
    setModalCustomers([]);
  };

  const handleModalPageChange = (newPage) => {
    if (newPage >= 1 && newPage <= modalPagination.totalPages) {
      fetchModalCustomers(selectedEntity, newPage);
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchData(page);
  };

  const handleDateTabChange = (tab) => {
    setSelectedDateTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setCustomDateRange({ startDate: null, endDate: null });
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
    setSearchTerm("");
    setSelectedDateTab("all");
    setCustomDateRange({ startDate: null, endDate: null });
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No records to export");
      return;
    }
    setExporting(true);
    try {
      const dateParams = getDateParams();
      const params = {
        reportType: selectedReportType,
        dateFilter: selectedDateTab,
      };
      if (dateParams.startDate) params.startDate = dateParams.startDate;
      if (dateParams.endDate) params.endDate = dateParams.endDate;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/new-customers/export`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `New_Customer_${selectedReportType.replace(" ", "_")}_${selectedDateTab}_${Date.now()}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded!");
    } catch {
      showToast("error", "Failed to download Excel report");
    } finally {
      setExporting(false);
    }
  };

  // ── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData(1);
  }, [selectedReportType, selectedDateTab]);

  useEffect(() => {
    if (
      selectedDateTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchData(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // ── Active filter label ─────────────────────────────────────────────────
  const getActiveFilterLabel = () =>
    getDateParams().displayLabel || "All Records";

  // ── Render helpers ──────────────────────────────────────────────────────
  const renderSummaryCards = () => (
    <div
      className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3 mb-6"}`}
    >
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Total New Customers
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.totalNewCustomers?.toLocaleString() || 0}
            </p>
          </div>
          <User
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              {selectedReportType === "MR Wise" ? "Total MRs" : "Total Zones"}
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {selectedReportType === "MR Wise"
                ? data.summary.totalMRs || 0
                : data.summary.totalZones || 0}
            </p>
          </div>
          {selectedReportType === "MR Wise" ? (
            <Users
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
            />
          ) : (
            <MapPin
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
            />
          )}
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200 ${isMobileView ? "col-span-2" : ""}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Avg per {selectedReportType === "MR Wise" ? "MR" : "Zone"}
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.averageCustomersPerMR?.toFixed(1) || "0.0"}
            </p>
          </div>
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    if (selectedReportType === "MR Wise") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className={thClass}>Sr.No</th>
            <th className={thClass}>MR Name</th>
            {!isMobileView && <th className={thClass}>Contact</th>}
            {!isMobileView && <th className={thClass}>Zone</th>}
            <th className={thClass}>New Customers</th>
            {!isMobileView && <th className={thClass}>Latest Date</th>}
            <th className={thClass}>Action</th>
          </tr>
        </thead>
      );
    }
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Zone Name</th>
          {!isMobileView && <th className={thClass}>Total MRs</th>}
          <th className={thClass}>New Customers</th>
          {!isMobileView && <th className={thClass}>Avg per MR</th>}
          {!isMobileView && <th className={thClass}>Latest Date</th>}
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    );
  };

  const renderTableRow = (record, index) => {
    const tdClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"}`;
    if (selectedReportType === "MR Wise") {
      return (
        <tr
          key={index}
          className={`hover:bg-gray-50 ${index < data.records.length - 1 ? "border-b" : ""}`}
        >
          <td className={`${tdClass} text-gray-600 font-medium`}>
            {record.srNo}
          </td>
          <td className={`${tdClass} font-medium text-gray-900 capitalize`}>
            {record.mrName}
            {isMobileView && record.contactNo && (
              <div className="text-[8px] text-gray-400 mt-0.5">
                {record.contactNo}
              </div>
            )}
            {isMobileView && record.zone && (
              <div className="text-[8px] text-gray-400">
                Zone: {record.zone}
              </div>
            )}
          </td>
          {!isMobileView && (
            <td className={tdClass}>{record.contactNo || "N/A"}</td>
          )}
          {!isMobileView && (
            <td className={`${tdClass} capitalize`}>{record.zone || "N/A"}</td>
          )}
          <td className={`${tdClass} font-semibold text-blue-600`}>
            {record.newCustomers?.toLocaleString() || 0}
          </td>
          {!isMobileView && (
            <td className={`${tdClass} text-gray-500`}>
              {formatDateReadable(record.date)}
            </td>
          )}
          <td className={tdClass}>
            <button
              onClick={() =>
                openCustomerModal({
                  type: "mr",
                  id: record.medicalRepId,
                  name: record.mrName,
                })
              }
              className="inline-flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer border border-indigo-200 text-[10px] md:text-sm"
              title="View Customers"
            >
              <Eye size={isMobileView ? 12 : 16} />
              <span>View</span>
            </button>
          </td>
        </tr>
      );
    }
    // Zone Wise
    return (
      <tr
        key={index}
        className={`hover:bg-gray-50 ${index < data.records.length - 1 ? "border-b" : ""}`}
      >
        <td className={`${tdClass} text-gray-600 font-medium`}>
          {record.srNo}
        </td>
        <td className={`${tdClass} font-medium text-gray-900 capitalize`}>
          {record.zoneName}
          {isMobileView && (
            <div className="text-[8px] text-gray-400">
              MRs: {record.totalMRs || 0} | Avg:{" "}
              {record.averagePerMR?.toFixed(1) || "0.0"}
            </div>
          )}
        </td>
        {!isMobileView && (
          <td className={`${tdClass} font-semibold text-gray-800`}>
            {record.totalMRs?.toLocaleString() || 0}
          </td>
        )}
        <td className={`${tdClass} font-semibold text-blue-600`}>
          {record.newCustomers?.toLocaleString() || 0}
        </td>
        {!isMobileView && (
          <td className={`${tdClass} font-semibold text-green-600`}>
            {record.averagePerMR?.toFixed(1) || "0.0"}
          </td>
        )}
        {!isMobileView && (
          <td className={`${tdClass} text-gray-500`}>
            {formatDateReadable(record.date)}
          </td>
        )}
        <td className={tdClass}>
          <button
            onClick={() =>
              openCustomerModal({
                type: "zone",
                name: record.zoneName,
              })
            }
            className="inline-flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer border border-indigo-200 text-[10px] md:text-sm"
            title="View Customers"
          >
            <Eye size={isMobileView ? 12 : 16} />
            <span>View</span>
          </button>
        </td>
      </tr>
    );
  };

  // ── Pagination (Improved like Product/DailyReports component) ─────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
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
          disabled={!pagination.hasNext}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  const getColSpan = () => {
    if (selectedReportType === "MR Wise") {
      return isMobileView ? 4 : 7;
    }
    return isMobileView ? 3 : 7;
  };

  const tabBtn = (tab, active, label) => (
    <button
      key={tab}
      onClick={() => handleDateTabChange(tab)}
      className={`${isMobileView ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${
        active === tab
          ? "bg-indigo-600 text-white"
          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
      }`}
    >
      {isMobileView && tab === "currentMonth"
        ? label.slice(0, 12) + "..."
        : label}
    </button>
  );

  // ── Customer Modal ──────────────────────────────────────────────────────
  const renderCustomerModal = () => {
    if (!isCustomerModalOpen || !selectedEntity) return null;

    const title =
      selectedEntity.type === "mr"
        ? `Customers for MR: ${selectedEntity.name}`
        : `Customers in Zone: ${selectedEntity.name}`;

    return ReactDOM.createPortal(
      <div className="fixed inset-0 flex justify-center items-center z-50">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={closeCustomerModal}
        />
        <div className="bg-white w-full max-w-5xl p-6 rounded-xl shadow-2xl relative overflow-y-auto max-h-[90vh] mx-4">
          <button
            onClick={closeCustomerModal}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 mb-5">{title}</h2>

          {modalLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : modalCustomers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No customers found for this {selectedEntity.type}.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm border-collapse min-w-[600px]">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">#</th>
                      <th className="px-4 py-3 text-left font-medium">
                        Customer Name
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Customer Code
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Contact
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Address
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Province
                      </th>
                      <th className="px-4 py-3 text-left font-medium">
                        Date Added
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalCustomers.map((cust, idx) => (
                      <tr
                        key={cust._id || idx}
                        className={`hover:bg-gray-50 ${idx < modalCustomers.length - 1 ? "border-b" : ""}`}
                      >
                        <td className="px-4 py-3 text-gray-500">
                          {(modalPagination.currentPage - 1) * 10 + idx + 1}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 capitalize">
                          {cust.name || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {cust.customerCode || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {cust.customerNumber || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">
                          {cust.address || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {cust.province || "N/A"}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {cust.date ? formatDateReadable(cust.date) : "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal Pagination */}
              {modalPagination.totalPages > 1 && (
                <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">
                    Page {modalPagination.currentPage} of{" "}
                    {modalPagination.totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        handleModalPageChange(modalPagination.currentPage - 1)
                      }
                      disabled={!modalPagination.hasPrev}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg ${
                        modalPagination.hasPrev
                          ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      <ChevronLeft size={16} />
                      Prev
                    </button>
                    <div className="flex gap-1">
                      {modalVisiblePages.map((page, idx) =>
                        page === "..." ? (
                          <span
                            key={`dot-${idx}`}
                            className="px-3 py-1 text-gray-500"
                          >
                            ...
                          </span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => handleModalPageChange(page)}
                            className={`min-w-[40px] px-3 py-1 rounded-lg ${
                              page === modalPagination.currentPage
                                ? "bg-indigo-600 text-white"
                                : "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                            }`}
                          >
                            {page}
                          </button>
                        ),
                      )}
                    </div>
                    <button
                      onClick={() =>
                        handleModalPageChange(modalPagination.currentPage + 1)
                      }
                      disabled={!modalPagination.hasNext}
                      className={`flex items-center gap-1 px-3 py-1 rounded-lg ${
                        modalPagination.hasNext
                          ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={closeCustomerModal}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

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
        <div className="flex justify-between items-center mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <User className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">New Customers</h1>
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
            <User className="w-8 h-8 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              New Customer Addition
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder={`Search by ${selectedReportType === "MR Wise" ? "MR name" : "zone name"}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && fetchData(1)}
                className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    fetchData(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exporting || data.records.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md ${
                exporting || data.records.length === 0
                  ? "bg-gray-400 text-white cursor-not-allowed opacity-70"
                  : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
              }`}
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
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
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder={`Search by ${selectedReportType === "MR Wise" ? "MR name" : "zone name"}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && fetchData(1)}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm("");
                fetchData(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Search result hint */}
      {searchTerm && pagination.totalRecords > 0 && (
        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
          <p
            className={`text-blue-700 ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            Searching: <span className="font-semibold">"{searchTerm}"</span>
            <span className="ml-3">
              Found:{" "}
              <span className="font-bold">{pagination.totalRecords}</span>{" "}
              record(s)
            </span>
          </p>
        </div>
      )}

      {/* View Type Tabs */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <p
          className={`${isMobileView ? "text-[9px]" : "text-xs"} font-semibold text-gray-500 uppercase tracking-wide mb-3`}
        >
          Report Type
        </p>
        <div className="flex flex-wrap gap-2">
          {["MR Wise", "Zone Wise"].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedReportType(type)}
              className={`${isMobileView ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${
                selectedReportType === type
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Date Filter Tabs */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <p
          className={`${isMobileView ? "text-[9px]" : "text-xs"} font-semibold text-gray-500 uppercase tracking-wide mb-3`}
        >
          Date Filter
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {tabBtn("today", selectedDateTab, "Today")}
          {tabBtn("all", selectedDateTab, "All Records")}
          {tabBtn(
            "currentMonth",
            selectedDateTab,
            isMobileView
              ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
              : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
          )}
          {tabBtn(
            "janToPreviousMonth",
            selectedDateTab,
            isMobileView
              ? getJanToPreviousMonthRange()
                  .label.replace("January", "Jan")
                  .replace("February", "Feb")
                  .replace("March", "Mar")
              : getJanToPreviousMonthRange().label,
          )}
          {tabBtn("custom", selectedDateTab, "Custom")}
        </div>
      </div>

      {/* Active Filter Display - Moved outside summary cards */}
      <div
        className={`bg-indigo-50 rounded-lg p-3 mb-4 flex items-center justify-between flex-wrap gap-2 ${isMobileView ? "text-xs" : "text-sm"}`}
      >
        <div className="flex items-center gap-2">
          <Filter size={isMobileView ? 14 : 16} className="text-indigo-600" />
          <span className="text-gray-700">Active Filter:</span>
          <span className="font-semibold text-indigo-700">
            {getActiveFilterLabel()}
          </span>
          {selectedReportType !== "All" && (
            <span className="text-gray-400 mx-1">•</span>
          )}
          <span className="font-medium text-gray-600">
            {selectedReportType}
          </span>
        </div>
        {selectedDateTab !== "all" && (
          <button
            onClick={handleClearFilters}
            className="text-red-500 hover:text-red-700 underline text-xs md:text-sm"
          >
            Clear All Filters
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {renderSummaryCards()}

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[480px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-6 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span
                      className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                    >
                      Loading...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => renderTableRow(record, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className={`p-8 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-400`}
                >
                  {selectedDateTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates for custom filter"
                    : "No new customer data found for the selected filter"}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10 mx-4">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-400 hover:text-gray-700"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-5">
                Custom Date Filter
              </h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      setCustomDateRange((p) => ({ ...p, startDate: date }))
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
                    onChange={(date) =>
                      setCustomDateRange((p) => ({ ...p, endDate: date }))
                    }
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
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg"
                >
                  Clear All
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCustomFilter(false)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustomFilter}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Customer Modal */}
      {renderCustomerModal()}
    </div>
  );
};

export default NewCustomerAddition;
