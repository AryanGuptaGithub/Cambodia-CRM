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
  Plus,
  Wallet,
  CheckCircle,
  Clock,
  FileText,
  ArrowLeft,
  Menu,
  TrendingUp,
  Users,
  DollarSign,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { getVisiblePages } from "../../utils/useVisiblePages";
import * as XLSX from "xlsx";
import OutstandingCollectionSampleExcelDownload from "../../excels/OutstandingCollectionSampleExcelDownload.jsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const _cache = {
  customers: null,
  destinations: null,
  categoryLabel: null,
  ts: 0,
};
const CACHE_TTL = 5 * 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// CustomerDropdown
// ─────────────────────────────────────────────────────────────────────────────
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
    (o) =>
      o.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.code?.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const selectedOption = options.find((opt) => opt.value === value);
  useEffect(() => {
    const h = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer ${disabled ? "bg-gray-100" : "bg-white hover:border-gray-400"}`}
      >
        {selectedOption ? (
          <div className="flex items-center justify-between">
            <span>{selectedOption.label}</span>
            <span className="text-gray-500 text-sm">{selectedOption.code}</span>
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search..."
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((o) => (
              <div
                key={o.value}
                onClick={() => {
                  onChange(o.value);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${value === o.value ? "bg-blue-50" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span>{o.label}</span>
                  <span className="text-gray-500 text-sm">{o.code}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No customers found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDropdown
// ─────────────────────────────────────────────────────────────────────────────
const InvoiceDropdown = ({ value, onChange, options, disabled, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const filtered = options.filter((o) =>
    (o.label || "").toLowerCase().includes(search.toLowerCase()),
  );
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left text-sm ${disabled ? "bg-gray-100 cursor-not-allowed text-gray-400" : "bg-white cursor-pointer hover:border-gray-400"}`}
      >
        {loading
          ? "Loading invoices..."
          : selected
            ? selected.label
            : "Select Invoice Number"}
      </button>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          <div className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm focus:outline-none"
              placeholder="Search invoice..."
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-gray-500 text-sm text-center">
              No invoices found
            </div>
          ) : (
            filtered.map((o) => (
              <div
                key={o.value}
                onClick={() => {
                  if (!o.disabled) {
                    onChange(o.value);
                    setIsOpen(false);
                    setSearch("");
                  }
                }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${value === o.value ? "bg-indigo-100 text-indigo-700" : ""} ${o.disabled ? "text-gray-400 cursor-default" : ""}`}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const pickAddress = (obj) => {
  if (!obj) return "";
  for (const c of [
    obj.address,
    obj.customerAddress,
    obj.billingAddress,
    obj.shippingAddress,
    obj.deliveryAddress,
    obj.custAddress,
    obj.customer_address,
    obj.billing_address,
    obj.permanentAddress,
    obj.contactAddress,
  ]) {
    if (c && String(c).trim() !== "") return String(c).trim();
  }
  return "";
};

const buildCustomerMaps = (custRaw) => {
  const byId = {},
    byCode = {},
    byName = {};
  if (!Array.isArray(custRaw)) return { byId, byCode, byName };
  custRaw.forEach((c) => {
    const addr = pickAddress(c);
    if (c._id)
      byId[String(c._id)] = { addr, name: c.name, phone: c.customerNumber };
    if (c.customerCode) {
      byCode[String(c.customerCode)] = addr;
      byCode[String(c.customerCode).replace(/^0+/, "") || "0"] = addr;
    }
    if (c.name) byName[c.name.toLowerCase().trim()] = addr;
  });
  return { byId, byCode, byName };
};

// ─────────────────────────────────────────────────────────────────────────────
// CollectedInvoicesSection — Full-page list of ALL collected invoices
// with date filters and global totals
// ─────────────────────────────────────────────────────────────────────────────
const CollectedInvoicesSection = ({ onBack }) => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [summary, setSummary] = useState({
    totalCollected: 0,
    totalInvoices: 0,
  });

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const visiblePages = getVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const formatLocalDate = (date) => {
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const getCurrentMonthRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
      label: `${now.toLocaleString("default", { month: "long" })} ${y}`,
    };
  };

  const getJanToTodayRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const start = new Date(y, 0, 1);
    const end = now;
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
      label: `Jan 1 – ${formatDateToReadable(end)}`,
    };
  };

  const getDateRange = () => {
    switch (selectedTab) {
      case "currentMonth":
        return getCurrentMonthRange();
      case "janToToday":
        return getJanToTodayRange();
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
        return { startDate: "", endDate: "" };
    }
  };

  const fetchCollectedInvoices = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      const params = { page, limit: 10 };
      if (search && search.trim() !== "") params.search = search.trim();
      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          setLoading(false);
          return;
        }
        params.startDate = dateRange.startDate;
        params.endDate = dateRange.endDate;
      }
      const res = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections/collected-all`,
        { params },
      );
      setCollections(res.data?.data || []);
      setPagination(
        res.data?.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      );
      setSummary(res.data?.summary || { totalCollected: 0, totalInvoices: 0 });
    } catch (err) {
      console.error("Error fetching collected invoices:", err);
      showToast("error", "Failed to load collected invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectedInvoices(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchCollectedInvoices(1);
    }
  }, [customDateRange.startDate, customDateRange.endDate, selectedTab]);

  useEffect(() => {
    const d = setTimeout(() => fetchCollectedInvoices(1, searchTerm), 500);
    return () => clearTimeout(d);
  }, [searchTerm]);

  const handleTabChange = (tab) => {
    if (tab === selectedTab) return;
    setSelectedTab(tab);
    setPagination((p) => ({ ...p, currentPage: 1 }));
    if (tab === "custom") setShowCustomFilter(true);
    else {
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
    setSelectedTab("custom");
    setShowCustomFilter(false);
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages)
      fetchCollectedInvoices(page);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return getCurrentMonthRange().label;
      case "janToToday":
        return getJanToTodayRange().label;
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          return `${formatDateToReadable(customDateRange.startDate)} to ${formatDateToReadable(customDateRange.endDate)}`;
        }
        return "Select custom dates";
      default:
        return "All Records";
    }
  };

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

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-4"} relative`}>
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* Mobile Header */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <button
              onClick={onBack}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs"
            >
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex items-center gap-1">
              <CheckCircle size={16} className="text-green-600" />
              <h1 className="text-base font-bold text-gray-800">Collected</h1>
            </div>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobileView && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 cursor-pointer text-sm transition-colors"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                <CheckCircle size={18} className="text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Collected Invoices
                </h1>
                <p className="text-xs text-gray-500">
                  All payment collections recorded
                </p>
              </div>
            </div>
          </div>
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search invoice, customer..."
              className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-64"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile Search */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search invoice, customer..."
            className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div
        className={`flex items-center gap-2 mb-3 flex-wrap ${isMobileView ? "text-xs" : ""}`}
      >
        {["all", "currentMonth", "janToToday", "custom"].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg cursor-pointer transition-colors ${isMobileView ? "text-[10px]" : "text-sm"} ${
              selectedTab === tab
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab === "all"
              ? "All Records"
              : tab === "currentMonth"
                ? isMobileView
                  ? "Current Month"
                  : "Current Month"
                : tab === "janToToday"
                  ? isMobileView
                    ? "Jan→Today"
                    : "Jan → Today"
                  : "Custom"}
          </button>
        ))}
      </div>

      <div
        className={`flex items-center gap-2 mb-4 ${isMobileView ? "text-[10px]" : "text-sm"} text-gray-600`}
      >
        <Filter size={isMobileView ? 12 : 14} />
        <span>
          Active Filter: <strong>{getActiveFilterDisplay()}</strong> (
          {pagination.totalRecords} transactions)
        </span>
      </div>

      {/* Summary Cards */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-3 gap-4 mb-6"}`}
      >
        <div
          className={`border border-green-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between bg-green-50`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Total Collected
            </p>
            <p
              className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold text-green-700`}
            >
              $
              {(summary.totalCollected || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
          <Wallet
            className={`${isMobileView ? "w-5 h-5" : "w-9 h-9"} text-green-400`}
          />
        </div>
        <div
          className={`border border-indigo-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between bg-indigo-50`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Transactions
            </p>
            <p
              className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold text-indigo-700`}
            >
              {pagination.totalRecords || 0}
            </p>
          </div>
          <FileText
            className={`${isMobileView ? "w-5 h-5" : "w-9 h-9"} text-indigo-400`}
          />
        </div>
        <div
          className={`border border-blue-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between bg-blue-50 ${isMobileView ? "col-span-2" : ""}`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Unique Invoices
            </p>
            <p
              className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold text-blue-700`}
            >
              {summary.totalInvoices || 0}
            </p>
          </div>
          <Receipt
            className={`${isMobileView ? "w-5 h-5" : "w-9 h-9"} text-blue-400`}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full text-sm border-collapse ${isMobileView ? "min-w-[600px]" : ""}`}
        >
          <thead className="bg-gray-50 border-b">
            <tr>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Sr.No
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Invoice
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Date
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Customer
              </th>
              {!isMobileView && (
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Destination
                </th>
              )}
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right font-semibold text-gray-600`}
              >
                Amount ($)
              </th>
              {!isMobileView && (
                <th className="px-4 py-3 text-center font-semibold text-gray-600">
                  Type
                </th>
              )}
              {!isMobileView && (
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Remarks
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={isMobileView ? 5 : 8}
                  className="text-center py-12 text-gray-400"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                    <span className={`${isMobileView ? "text-xs" : "text-sm"}`}>
                      Loading collected invoices...
                    </span>
                  </div>
                </td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td
                  colSpan={isMobileView ? 5 : 8}
                  className="text-center py-14 text-gray-400"
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                      <Receipt size={24} className="text-gray-400" />
                    </div>
                    <p className="font-medium text-gray-500 text-sm">
                      No collected invoices found
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              collections.map((col, index) => {
                const amt = Number(col.amount) || 0;
                return (
                  <tr
                    key={col._id || index}
                    className="border-b hover:bg-green-50/30 transition-colors"
                  >
                    <td
                      className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-gray-500`}
                    >
                      {(pagination.currentPage - 1) * 10 + index + 1}
                    </td>
                    <td
                      className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"}`}
                    >
                      <span
                        className={`font-mono font-semibold text-indigo-700 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                      >
                        {col.invoiceNumber}
                      </span>
                    </td>
                    <td
                      className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-gray-600`}
                    >
                      <div className="flex items-center gap-1">
                        <Clock
                          size={isMobileView ? 10 : 12}
                          className="text-gray-400"
                        />
                        {formatDate(col.date)}
                      </div>
                    </td>
                    <td
                      className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} font-medium text-gray-800`}
                    >
                      {col.customerName}
                    </td>
                    {!isMobileView && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-gray-600">
                          <Wallet size={12} className="text-indigo-400" />
                          <span className="text-sm">
                            {col.destinationAccount}
                          </span>
                        </div>
                      </td>
                    )}
                    <td
                      className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right`}
                    >
                      <span
                        className={`font-bold text-green-700 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                      >
                        $
                        {amt.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </td>
                    {!isMobileView && (
                      <>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full capitalize font-medium">
                            credit collection
                          </span>
                        </td>
                        <td
                          className="px-4 py-3 text-gray-400 text-xs italic max-w-[180px] truncate"
                          title={col.remarks}
                        >
                          {col.remarks || "—"}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* Custom Date Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-md p-6 relative">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold mb-5">Select Date Range</h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="Start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="End date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// AddCreditCollectionModal
// ─────────────────────────────────────────────────────────────────────────────
const AddCreditCollectionModal = ({ isOpen, onClose, onSuccess }) => {
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [categoryLabel, setCategoryLabel] = useState("Credit Collection");
  const [allSales, setAllSales] = useState([]);
  const [allInvoiceOptions, setAllInvoiceOptions] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [staticLoading, setStaticLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerById, setCustomerById] = useState({});
  const [customerByCode, setCustomerByCode] = useState({});
  const [customerByName, setCustomerByName] = useState({});
  const [mrCashInfo, setMrCashInfo] = useState(null);
  const [isMrInStockTransfer, setIsMrInStockTransfer] = useState(false);
  const [mrCashLoading, setMrCashLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [form, setForm] = useState({
    invoiceNumber: "",
    destinationAccount: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    invoiceDate: "",
    customerName: "",
    customerAddress: "",
    remarks: "",
  });
  const [errors, setErrors] = useState({});
  const [invoiceDueAmount, setInvoiceDueAmount] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    loadData();
  }, [isOpen]);

  const resetForm = () => {
    setForm({
      invoiceNumber: "",
      destinationAccount: "",
      date: new Date().toISOString().split("T")[0],
      amount: "",
      invoiceDate: "",
      customerName: "",
      customerAddress: "",
      remarks: "",
    });
    setErrors({});
    setInvoiceDueAmount(0);
    setAllInvoiceOptions([]);
    setMrCashInfo(null);
    setIsMrInStockTransfer(false);
    setSelectedSale(null);
  };

  const loadData = async () => {
    setInvoicesLoading(true);
    try {
      const salesRes = await axios.get(`${backendUrl}/api/sales/all`);
      const allSalesData = salesRes.data?.summaries || [];
      setAllSales(allSalesData);
      const invoiceOpts = allSalesData
        .filter((s) => {
          const ps = (s.paymentStatus || "").toLowerCase();
          return (
            (ps === "credit" ||
              ps === "partial paid" ||
              ps === "unpaid" ||
              ps === "due") &&
            (s.pendingAmountPaid || "").toLowerCase() !== "paid" &&
            (s.dueAmount || 0) > 0 &&
            s.invoiceNumber
          );
        })
        .map((s) => ({
          value: s.invoiceNumber,
          label: `${s.invoiceNumber} — Due: $${(s.dueAmount || 0).toFixed(2)}`,
          dueAmount: s.dueAmount || 0,
        }));
      setAllInvoiceOptions([
        { value: "", label: "Select Invoice Number" },
        ...invoiceOpts,
      ]);
    } catch (err) {
      showToast("error", "Failed to load invoices");
    } finally {
      setInvoicesLoading(false);
    }

    const now = Date.now();
    if (
      _cache.ts &&
      now - _cache.ts < CACHE_TTL &&
      _cache.customers &&
      _cache.destinations
    ) {
      const { byId, byCode, byName } = _cache.customers;
      setCustomerById(byId);
      setCustomerByCode(byCode);
      setCustomerByName(byName);
      setDestinationOptions(_cache.destinations);
      if (_cache.categoryLabel) setCategoryLabel(_cache.categoryLabel);
      return;
    }
    setStaticLoading(true);
    try {
      const [destRes, catRes, custRes] = await Promise.all([
        axios.get(`${backendUrl}/api/accounts/destinations`),
        axios.get(`${backendUrl}/api/accounts/category-type`),
        axios.get(`${backendUrl}/api/customers`),
      ]);
      const destinations = Array.isArray(destRes.data)
        ? destRes.data
        : destRes.data?.data || [];
      const destOpts = destinations.map((d) => ({
        value: d._id,
        label: d.name,
        totalAmount: d.totalAmount || 0,
      }));
      setDestinationOptions(destOpts);
      _cache.destinations = destOpts;
      const categories = Array.isArray(catRes.data)
        ? catRes.data
        : catRes.data?.data || [];
      const label =
        categories.find((c) =>
          c.name?.toLowerCase().includes("credit collection"),
        )?.name || "Credit Collection";
      setCategoryLabel(label);
      _cache.categoryLabel = label;
      const custRaw =
        custRes.data?.customers ||
        custRes.data?.data ||
        (Array.isArray(custRes.data) ? custRes.data : []);
      const maps = buildCustomerMaps(custRaw);
      setCustomerById(maps.byId);
      setCustomerByCode(maps.byCode);
      setCustomerByName(maps.byName);
      _cache.customers = maps;
      _cache.ts = Date.now();
    } catch (err) {
      console.error("Phase 2 load error:", err);
    } finally {
      setStaticLoading(false);
    }
  };

  const resolveAddress = (sale, byId, byCode, byName) => {
    const fromSale = pickAddress(sale);
    if (fromSale) return fromSale;
    if (sale.customerId) {
      const rec = byId[String(sale.customerId)];
      if (rec?.addr) return rec.addr;
    }
    if (sale.customerCode) {
      const raw = String(sale.customerCode);
      const stripped = raw.replace(/^0+/, "") || "0";
      if (byCode[raw]) return byCode[raw];
      if (byCode[stripped]) return byCode[stripped];
    }
    if (sale.customerName) {
      const a = byName[sale.customerName.toLowerCase().trim()];
      if (a) return a;
    }
    return "";
  };

  const handleAmountChange = (e) => {
    const sanitized = e.target.value
      .replace(/[^0-9.]/g, "")
      .replace(/^(\d*\.?\d*).*$/, "$1");
    setForm((p) => ({ ...p, amount: sanitized }));
    if (invoiceDueAmount > 0) {
      const amt = parseFloat(sanitized) || 0;
      if (sanitized !== "" && amt > invoiceDueAmount)
        setErrors((p) => ({
          ...p,
          amount: `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`,
        }));
      else if (sanitized !== "" && amt <= 0)
        setErrors((p) => ({ ...p, amount: "Amount must be greater than 0" }));
      else setErrors((p) => ({ ...p, amount: "" }));
    } else {
      if (errors.amount) setErrors((p) => ({ ...p, amount: "" }));
    }
  };

  const handleInvoiceSelect = async (invoiceNumber) => {
    if (!invoiceNumber) {
      setForm((p) => ({
        ...p,
        invoiceNumber: "",
        invoiceDate: "",
        amount: "",
        customerName: "",
        customerAddress: "",
        destinationAccount: "",
      }));
      setInvoiceDueAmount(0);
      setMrCashInfo(null);
      setIsMrInStockTransfer(false);
      setSelectedSale(null);
      return;
    }
    const sale = allSales.find((s) => s.invoiceNumber === invoiceNumber);
    if (!sale) return;
    const dueAmount = sale.dueAmount || 0;
    if (dueAmount <= 0) {
      showToast(
        "error",
        `Invoice "${invoiceNumber}" has no outstanding due amount.`,
      );
      return;
    }
    setInvoiceDueAmount(dueAmount);
    setSelectedSale(sale);
    setForm((p) => ({
      ...p,
      invoiceNumber,
      invoiceDate: sale.invoiceDate ? sale.invoiceDate.split("T")[0] : "",
      customerName: sale.customerName || "",
      customerAddress: resolveAddress(
        sale,
        customerById,
        customerByCode,
        customerByName,
      ),
      amount: dueAmount.toFixed(2),
      destinationAccount: "",
    }));
    setErrors((p) => ({
      ...p,
      invoiceNumber: "",
      customerName: "",
      destinationAccount: "",
      amount: "",
    }));
    const mrName = sale.mrName;
    if (mrName && mrName.trim() !== "" && mrName.toLowerCase() !== "unknown") {
      setMrCashLoading(true);
      try {
        const mrCashRes = await axios.get(`${backendUrl}/api/mr-cash`);
        const rec = (mrCashRes.data?.data || []).find(
          (m) => m.mrName?.toLowerCase().trim() === mrName.toLowerCase().trim(),
        );
        if (rec) {
          setIsMrInStockTransfer(true);
          setMrCashInfo({
            _id: rec._id,
            mrName: rec.mrName,
            currentCash: rec.currentCash || 0,
          });
        } else {
          setIsMrInStockTransfer(false);
          setMrCashInfo(null);
        }
      } catch {
        setIsMrInStockTransfer(false);
        setMrCashInfo(null);
      } finally {
        setMrCashLoading(false);
      }
    } else {
      setIsMrInStockTransfer(false);
      setMrCashInfo(null);
    }
  };

  const handleChange = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.invoiceNumber) e.invoiceNumber = "Invoice Number is required";
    if (!form.customerName) e.customerName = "Customer Name is required";
    if (!isMrInStockTransfer && !form.destinationAccount)
      e.destinationAccount = "Destination Account is required";
    if (!form.date) e.date = "Date is required";
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0)
      e.amount = "Valid amount is required";
    else if (invoiceDueAmount > 0 && amt > invoiceDueAmount)
      e.amount = `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const amount = parseFloat(form.amount);
    const destinationName =
      isMrInStockTransfer && mrCashInfo
        ? mrCashInfo.mrName
        : destinationOptions.find((d) => d.value === form.destinationAccount)
            ?.label || "";
    const payload = {
      categoryType: categoryLabel,
      transactionType: "credit collection",
      invoiceNo: form.invoiceNumber,
      sourceAccount: "",
      destination: destinationName,
      amount,
      exchangeLoss: 0,
      finalAmount: amount,
      date: form.date,
      invoiceDate: form.invoiceDate || undefined,
      customerName: form.customerName,
      customerAddress: form.customerAddress || "",
      accountType: isMrInStockTransfer
        ? "MR Cash"
        : destinationName || "Cash Balance",
      remarks:
        form.remarks || `Credit collection from invoice ${form.invoiceNumber}`,
    };
    setSubmitting(true);
    try {
      const response = await axios.post(
        `${backendUrl}/api/transactions`,
        payload,
      );
      if (!response.data.success)
        throw new Error(response.data.message || "Transaction failed");
      if (selectedSale) {
        const currentPaid = parseFloat(selectedSale.paidAmount) || 0;
        const currentTotal = parseFloat(selectedSale.totalAmount) || 0;
        try {
          await axios.post(
            `${backendUrl}/api/reports/outstanding-collections/bulk-update`,
            {
              updates: [
                {
                  invoiceNumber: form.invoiceNumber,
                  totalAmount: currentTotal,
                  paidAmount: Math.min(currentPaid + amount, currentTotal),
                  creditDays: selectedSale.creditDays || 30,
                  remarks: `Payment collected: $${amount.toFixed(2)} on ${form.date}`,
                },
              ],
            },
          );
        } catch {
          showToast(
            "warning",
            "Transaction saved but sale amount update failed.",
          );
        }
      }
      _cache.ts = 0;
      showToast(
        "success",
        `Transaction added — $${amount.toFixed(2)} collected from invoice ${form.invoiceNumber}`,
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message ||
          err.message ||
          "Failed to add transaction",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (s) => {
    if (!s) return "";
    try {
      const d = new Date(s);
      return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
    } catch {
      return s;
    }
  };

  if (!isOpen) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Add New Transaction - Cash Balance
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Category Type <span className="text-red-500">*</span>
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm">
                {categoryLabel}
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <InvoiceDropdown
                value={form.invoiceNumber}
                onChange={handleInvoiceSelect}
                options={allInvoiceOptions}
                disabled={invoicesLoading}
                loading={invoicesLoading}
              />
              {errors.invoiceNumber && (
                <p className="text-red-500 text-xs">{errors.invoiceNumber}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.customerName}
                readOnly
                placeholder="Auto-filled on invoice selection"
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 cursor-not-allowed ${errors.customerName ? "border-red-500" : "border-gray-200"} text-gray-700`}
              />
              {errors.customerName && (
                <p className="text-red-500 text-xs">{errors.customerName}</p>
              )}
            </div>
            <div className="space-y-1">
              {mrCashLoading ? (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Destination
                  </label>
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm animate-pulse">
                    Checking MR cash...
                  </div>
                </>
              ) : isMrInStockTransfer && mrCashInfo ? (
                <>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Wallet size={14} className="text-indigo-500" /> MR Cash
                    Balance
                  </label>
                  <div className="w-full px-3 py-3 border border-indigo-200 rounded-lg bg-indigo-50 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-indigo-800">
                        {mrCashInfo.mrName}
                      </p>
                      <div className="text-right">
                        <p className="text-xs text-indigo-500">Current Cash</p>
                        <p className="text-lg font-bold text-indigo-700">
                          $
                          {mrCashInfo.currentCash.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-indigo-500">
                    Collection will be added to this MR's current cash
                  </p>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Destination Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.destinationAccount}
                    onChange={(e) =>
                      handleChange("destinationAccount", e.target.value)
                    }
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${errors.destinationAccount ? "border-red-500" : "border-gray-300"}`}
                    disabled={staticLoading || !form.invoiceNumber}
                  >
                    <option value="">
                      {staticLoading
                        ? "Loading accounts..."
                        : "Select Destination Account"}
                    </option>
                    {destinationOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label} (Balance: ${d.totalAmount.toFixed(2)})
                      </option>
                    ))}
                  </select>
                  {errors.destinationAccount && (
                    <p className="text-red-500 text-xs">
                      {errors.destinationAccount}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChange("date", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${errors.date ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.date && (
                <p className="text-red-500 text-xs">{errors.date}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Amount ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                disabled={!form.invoiceNumber}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${errors.amount ? "border-red-500" : "border-gray-300"} ${!form.invoiceNumber ? "bg-gray-50 cursor-not-allowed" : ""}`}
              />
              {invoiceDueAmount > 0 && (
                <p className="text-xs text-orange-500">
                  Due Amount: <strong>${invoiceDueAmount.toFixed(2)}</strong> —
                  You can enter a partial amount
                </p>
              )}
              {errors.amount && (
                <p className="text-red-500 text-xs">{errors.amount}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Invoice Date
              </label>
              <input
                type="text"
                value={fmtDate(form.invoiceDate)}
                readOnly
                placeholder="DD MMM YYYY"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Customer Address
              </label>
              <input
                type="text"
                value={form.customerAddress}
                readOnly
                placeholder={
                  form.invoiceNumber
                    ? "No address on record"
                    : "Auto-filled on invoice selection"
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Remarks
              </label>
              <textarea
                value={form.remarks}
                onChange={(e) => handleChange("remarks", e.target.value)}
                rows={3}
                placeholder="Optional remarks..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-5 mt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || invoicesLoading || mrCashLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Plus size={15} />
              {submitting ? "Adding..." : "+ Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
const OutstandingCollection = () => {
  // ========== ALL HOOKS (unconditional) ==========
  const [activeView, setActiveView] = useState("outstanding");
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
  const [filter, setFilter] = useState({ customerName: "", status: "all" });
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
  const [customerOptions, setCustomerOptions] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [showAddTxModal, setShowAddTxModal] = useState(false);

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

  const visiblePages = getVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * 7 + index + 1;

  const formatLocalDate = (date) => {
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
    const y = getCurrentYear();
    const m = new Date().getMonth();
    if (m === 0) {
      const py = y - 1;
      return {
        startDate: `${py}-01-01`,
        endDate: `${py}-12-31`,
        label: `Jan - Dec ${py}`,
      };
    }
    return {
      startDate: `${y}-01-01`,
      endDate: formatLocalDate(new Date(y, m, 0)),
      label: `Jan - ${getPreviousMonthName()} ${y}`,
    };
  };

  const getDateRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (selectedTab) {
      case "currentMonth":
        return {
          startDate: formatLocalDate(new Date(y, m, 1)),
          endDate: formatLocalDate(new Date(y, m + 1, 0)),
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

  const fetchOutstandingCollections = async (page = 1, search = searchTerm) => {
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
          return;
        }
        params = {
          ...params,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
      }
      if (search && search.trim() !== "") params.search = search.trim();
      if (selectedTab === "custom") {
        if (filter.customerName) params.customerCode = filter.customerName;
        if (filter.status !== "all") params.status = filter.status;
      }
      const response = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections`,
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
    } catch {
      showToast("error", "Failed to fetch outstanding collections data");
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerOptions = async () => {
    setLoadingCustomers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/customers`);
      setCustomerOptions(
        (response.data.customers || []).map((c) => ({
          value: c.customerCode,
          label: c.name || "Unnamed Customer",
          code: c.customerCode,
          phone: c.customerNumber,
          address: c.address,
        })),
      );
    } catch {
      showToast("error", "Failed to fetch customer list");
      setCustomerOptions([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages)
      fetchOutstandingCollections(page);
  };

  const handleTabChange = (tab) => {
    if (tab === selectedTab) return;
    setSelectedTab(tab);
    setPagination((p) => ({ ...p, currentPage: 1 }));
    if (tab === "custom") setShowCustomFilter(true);
    else {
      setFilter({ customerName: "", status: "all" });
      setCustomDateRange({ startDate: null, endDate: null });
    }
  };

  const handleClearFilters = () => {
    setFilter({ customerName: "", status: "all" });
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("all");
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
      if (data.records.length === 0) {
        showToast("warning", "No data available to export");
        setExportLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      if (searchTerm) params.append("search", searchTerm);
      if (selectedTab === "custom" && filter.customerName)
        params.append("customerCode", filter.customerName);
      const response = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections/export/excel?${params.toString()}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(
        new Blob([response.data], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download =
        (dateRange.startDate && dateRange.endDate
          ? `outstanding-collections-${dateRange.startDate.replace(/-/g, "")}-to-${dateRange.endDate.replace(/-/g, "")}`
          : `outstanding-collections-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`) +
        ".xlsx";
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      showToast(
        "error",
        error.response?.status === 400
          ? "Invalid date format"
          : "Failed to export to Excel",
      );
    } finally {
      setExportLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), {
          type: "array",
          cellDates: true,
          cellNF: false,
          cellText: false,
        });
        const rows = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
          {
            header: 1,
            defval: "",
            blankrows: true,
            raw: true,
          },
        );
        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          if (
            rows[i]?.[0]?.toString().trim().toLowerCase() === "invoice number"
          ) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          showToast(
            "error",
            "Header row not found. Make sure first column is 'Invoice Number'",
          );
          return;
        }
        const headers = rows[headerIdx].map((h) => h?.toString().trim() || "");
        const validData = rows
          .slice(headerIdx + 1)
          .map((row) => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] !== undefined ? row[i] : "";
            });
            return obj;
          })
          .filter((o) => o["Invoice Number"]?.toString().trim() !== "")
          .map((item) => ({
            invoiceNumber: item["Invoice Number"]?.toString().trim() || "",
            totalAmount: parseFloat(item["Total Amount"] || 0) || 0,
            paidAmount: parseFloat(item["Paid Amount"] || 0) || 0,
            creditDays: parseInt(item["Credit Days"] || 0) || 0,
            remarks: item["Remarks"]?.toString().trim() || "",
          }))
          .filter((item) => item.invoiceNumber);
        if (validData.length === 0) {
          showToast("warning", "No valid records found in the Excel file");
          return;
        }
        setParsedData(validData);
      } catch (err) {
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
        { updates: parsedData },
      );
      if (response.data.success) {
        showToast(
          "success",
          `Successfully updated ${response.data.successCount} sales. Failed: ${response.data.failedCount}`,
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchOutstandingCollections(1);
      } else
        showToast("error", response.data.message || "Failed to update sales");
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Failed to upload file",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
          let d = `${formatDateToReadable(customDateRange.startDate)} to ${formatDateToReadable(customDateRange.endDate)}`;
          if (filter.customerName) {
            const sc = customerOptions.find(
              (o) => o.value === filter.customerName,
            );
            d += ` | Customer: ${sc?.label || filter.customerName}`;
          }
          return d;
        }
        return "Select custom dates";
      default:
        return "All Records";
    }
  };

  // ── Pagination (Improved like DailyReports component) ─────────────────────────
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

  // ========== useEffect hooks (unconditional) ==========
  useEffect(() => {
    fetchCustomerOptions();
  }, []);

  useEffect(() => {
    setPagination((p) => ({ ...p, currentPage: 1 }));
    fetchOutstandingCollections(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchOutstandingCollections(1);
  }, [customDateRange.startDate, customDateRange.endDate, selectedTab]);

  useEffect(() => {
    const d = setTimeout(() => fetchOutstandingCollections(1, searchTerm), 500);
    return () => clearTimeout(d);
  }, [searchTerm]);

  // ========== EARLY RETURN (after all hooks) ==========
  if (activeView === "collected") {
    return (
      <CollectedInvoicesSection onBack={() => setActiveView("outstanding")} />
    );
  }

  // ========== JSX for Outstanding view ==========
  const isExportDisabled =
    loading || exportLoading || data.records.length === 0;

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-4"} relative`}>
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
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Receipt size={18} className="text-orange-500" />
            <h1 className="text-base font-bold text-gray-800">Outstanding</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Receipt className="text-orange-500" size={28} />
            <h1 className="text-2xl font-bold">Outstanding Collection</h1>
            <button
              onClick={() => setActiveView("collected")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium cursor-pointer transition-colors shadow-sm"
            >
              <CheckCircle size={15} />
              Collected
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddTxModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer text-sm"
            >
              <Plus size={16} /> Add Transaction
            </button>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") fetchOutstandingCollections(1);
                }}
                placeholder="Search by invoice or customer"
                className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    fetchOutstandingCollections(1, "");
                  }}
                  className="absolute right-2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setShowImportModal(true);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              disabled={isUploading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${isUploading ? "bg-purple-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 cursor-pointer"} text-sm`}
            >
              <Upload size={16} />
              {isUploading ? "Uploading..." : "Upload Excel"}
            </button>
            <button
              onClick={exportToExcel}
              disabled={isExportDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isExportDisabled ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"} text-sm`}
            >
              <Download size={16} />
              {exportLoading ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE: Only Collected Button (No Add Transaction or Upload Excel) ── */}
      {isMobileView && (
        <div className="mb-3">
          <button
            onClick={() => setActiveView("collected")}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium cursor-pointer transition-colors shadow-sm"
          >
            <CheckCircle size={14} />
            View Collected Invoices
          </button>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchOutstandingCollections(1);
            }}
            placeholder="Search by invoice or customer..."
            className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
          />
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm("");
                fetchOutstandingCollections(1, "");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Filter Tabs */}
      <div
        className={`flex items-center gap-2 mb-3 flex-wrap ${isMobileView ? "text-[10px]" : ""}`}
      >
        {["all", "currentMonth", "janToPreviousMonth", "custom"].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg cursor-pointer transition-colors ${isMobileView ? "text-[10px]" : "text-sm"} ${selectedTab === tab ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            {tab === "all"
              ? "All"
              : tab === "currentMonth"
                ? isMobileView
                  ? "Current"
                  : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`
                : tab === "janToPreviousMonth"
                  ? isMobileView
                    ? "Jan→Prev"
                    : getJanToPreviousMonthRange().label
                  : "Custom"}
          </button>
        ))}
      </div>

      <div
        className={`flex items-center gap-2 mb-4 ${isMobileView ? "text-[10px]" : "text-sm"} text-gray-600 flex-wrap`}
      >
        <Filter size={isMobileView ? 12 : 14} />
        <span>
          Active Filter: <strong>{getActiveFilterDisplay()}</strong> (
          {pagination.totalRecords} records)
        </span>
      </div>

      {/* Summary Cards */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-4 gap-4 mb-6"}`}
      >
        <div
          className={`border border-orange-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Total Outstanding
            </p>
            <p className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold`}>
              ${(data.summary.totalOutstandingAmount || 0).toLocaleString()}
            </p>
          </div>
          <Receipt
            className={`${isMobileView ? "w-6 h-6" : "w-9 h-9"} text-orange-400`}
          />
        </div>
        <div
          className={`border border-red-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Total Overdue
            </p>
            <p className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold`}>
              ${(data.summary.totalOverdueAmount || 0).toLocaleString()}
            </p>
          </div>
          <User
            className={`${isMobileView ? "w-6 h-6" : "w-9 h-9"} text-red-400`}
          />
        </div>
        {!isMobileView && (
          <div
            className={`border border-gray-300 rounded-xl p-4 flex items-center justify-between bg-gray-50`}
          >
            <div>
              <p className="text-sm text-gray-500">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-700">
                {data.summary.totalInvoices || 0}
              </p>
            </div>
            <FileText className="w-9 h-9 text-blue-400" />
          </div>
        )}
        {/* <div
          className={`border border-gray-300 rounded-xl ${isMobileView ? "p-2" : "p-4"} flex items-center justify-between ${isMobileView ? "col-span-2" : ""}`}
        >
          <div>
            <p
              className={`${isMobileView ? "text-[9px]" : "text-sm"} text-gray-500`}
            >
              Total Invoices
            </p>
            <p className={`${isMobileView ? "text-sm" : "text-2xl"} font-bold`}>
              {data.summary.totalInvoices || 0}
            </p>
          </div>
          <FileText
            className={`${isMobileView ? "w-6 h-6" : "w-9 h-9"} text-blue-400`}
          />
        </div> */}
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full text-sm border-collapse ${isMobileView ? "min-w-[650px]" : ""}`}
        >
          <thead>
            <tr className="bg-gray-50 border-b">
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Sr.No
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Invoice
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Date
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-left font-semibold text-gray-600`}
              >
                Customer
              </th>
              {!isMobileView && (
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Contact
                </th>
              )}
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right font-semibold text-gray-600`}
              >
                Outstanding ($)
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right font-semibold text-gray-600`}
              >
                Overdue ($)
              </th>
              <th
                className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-center font-semibold text-gray-600`}
              >
                Days
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={isMobileView ? 7 : 8}
                  className="text-center py-10 text-gray-500"
                >
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
                    <span>Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => (
                <tr
                  key={record.invoiceNumber || index}
                  className="border-b hover:bg-gray-50"
                >
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-gray-600`}
                  >
                    {getSerialNumber(index)}
                  </td>
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} font-mono font-semibold text-indigo-700`}
                  >
                    {record.invoiceNumber || "N/A"}
                  </td>
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-gray-600`}
                  >
                    {record.invoiceDate
                      ? formatDateToReadable(record.invoiceDate)
                      : "N/A"}
                  </td>
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} font-medium`}
                  >
                    <div>{record.customerName}</div>
                    {isMobileView && record.customerCode && (
                      <div className="text-[8px] text-gray-400 font-mono">
                        {record.customerCode}
                      </div>
                    )}
                  </td>
                  {!isMobileView && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Phone size={12} />
                        {record.phone || "N/A"}
                      </div>
                    </td>
                  )}
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right font-medium`}
                  >
                    ${(record.totalOutstandingAmount || 0).toLocaleString()}
                  </td>
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-right font-medium text-red-600`}
                  >
                    ${(record.overdueAmount || 0).toLocaleString()}
                  </td>
                  <td
                    className={`${isMobileView ? "px-2 py-2 text-[9px]" : "px-4 py-3"} text-center`}
                  >
                    <span
                      className={`font-medium ${record.overdueDays > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {record.overdueDays > 0
                        ? `${record.overdueDays}d`
                        : "On Time"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={isMobileView ? 7 : 8}
                  className="text-center py-10 text-gray-500"
                >
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

      <AddCreditCollectionModal
        isOpen={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSuccess={() => fetchOutstandingCollections(pagination.currentPage)}
      />

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-md p-6 relative">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={isUploading}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold mb-4">
                Import Outstanding Collection
              </h2>
              {isSampleFile && <OutstandingCollectionSampleExcelDownload />}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-sm text-gray-500 mb-2">
                  Download the template above, fill in your data, and upload
                  here.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                >
                  Choose File
                </label>
              </div>
              {parsedData.length > 0 ? (
                <p className="text-sm text-green-600 mb-4">
                  Rows to import: <strong>{parsedData.length}</strong>
                </p>
              ) : (
                <p className="text-sm text-gray-400 mb-4">No data to import</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedData([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${isUploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-300 hover:bg-gray-400 text-gray-700"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg text-white ${isUploading || parsedData.length === 0 ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"}`}
                >
                  {isUploading ? "Uploading…" : `Upload (${parsedData.length})`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[90%] max-w-md p-6 relative">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold mb-5">
                Outstanding Collection Filter
              </h2>
              <div className="space-y-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="Start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
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
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="End date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1">
                  Customer Name
                </label>
                {loadingCustomers && (
                  <p className="text-xs text-gray-400 mb-1">
                    Loading customers...
                  </p>
                )}
                <CustomerDropdown
                  value={filter.customerName}
                  onChange={(v) =>
                    setFilter((p) => ({ ...p, customerName: v }))
                  }
                  options={customerOptions}
                  placeholder="Select customer..."
                  disabled={loadingCustomers}
                />
              </div>
              <div className="flex justify-between items-center">
                <button
                  onClick={handleClearFilters}
                  className="text-sm text-red-500 hover:text-red-700 cursor-pointer"
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
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer"
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

export default OutstandingCollection;
