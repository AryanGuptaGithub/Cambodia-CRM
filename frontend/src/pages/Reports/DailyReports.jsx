import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  Filter,
  User,
  Search,
  X,
  DollarSign,
  Users,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

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

  const inputRef = useRef(null);
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const formatDateLocal = (date) => {
    if (!date) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateToDisplay = (dateString) => {
    if (!dateString) return "N/A";
    if (
      typeof dateString === "string" &&
      dateString.match(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/)
    )
      return dateString;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "N/A";
    return `${date.getDate()} ${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
  };

  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * 7 + index + 1;
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
        return { startDate: null, endDate: null, displayDate: "All Records" };
      case "currentMonth": {
        const firstDay = new Date(currentYear, currentMonth, 1);
        const lastDay = new Date(currentYear, currentMonth + 1, 0);
        return {
          startDate: formatDateLocal(firstDay),
          endDate: formatDateLocal(lastDay),
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const r = getJanToPreviousMonthRange();
        return {
          startDate: r.startDate,
          endDate: r.endDate,
          displayDate: r.label,
        };
      }
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
        return { startDate: null, endDate: null, displayDate: "Today" };
    }
  };

  const fetchDailyReports = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      let params = { page, limit: 7, dateFilter: selectedTab };
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
        if (dateRange.startDate && dateRange.endDate)
          params = {
            ...params,
            startDate: dateRange.startDate,
            endDate: dateRange.endDate,
          };
      }
      if (search && search.trim() !== "") params.search = search.trim();
      if (selectedSaleType !== "Total sales")
        params.saleType = selectedSaleType;

      const response = await axios.get(
        `${backendUrl}/api/reports/daily-reports`,
        { params },
      );
      let records = response.data.data?.records || [];

      if (
        selectedTab === "custom" &&
        dateRange.startDate &&
        dateRange.endDate
      ) {
        const dateRangeText = `${formatDateToDisplay(customDateRange.startDate)} - ${formatDateToDisplay(customDateRange.endDate)}`;
        records = records.map((record) => ({ ...record, date: dateRangeText }));
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
        records,
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
      setSaleTypes(response.data || []);
    } catch (error) {
      console.error("Error fetching sale types:", error);
    }
  };

  useEffect(() => {
    const defaultType = saleTypes.find((t) => t.sequenceNumber === 1);
    if (defaultType) setSelectedSaleType(defaultType.type);
  }, [saleTypes]);

  useEffect(() => {
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate)
        fetchDailyReports(1);
      else
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
    } else {
      fetchDailyReports(1);
    }
  }, [selectedTab, selectedSaleType]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchDailyReports(1);
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    fetchSaleTypes();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchDailyReports(1, searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchDailyReports(page);
  };
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchDailyReports(1);
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));

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
      setCustomDateRange({ startDate: null, endDate: null });
    }
  };

  const handleSaleTypeChange = (type) => setSelectedSaleType(type);

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
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
        { params: exportParams, responseType: "blob" },
      );
      let filename = "daily_reports.xlsx";
      const cd = response.headers["content-disposition"];
      if (cd) {
        const m = cd.match(/filename="(.+)"/);
        if (m?.[1]) filename = m[1];
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      if (error.response?.status === 404)
        showToast("warning", "No data found for the selected filters");
      else showToast("error", "Failed to export data to Excel");
    } finally {
      setExporting(false);
    }
  };

  const getActiveFilterDisplay = () => getDateRange().displayDate || "Today";
  const capitalizeFirstLetter = (str) => {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const getTableColumns = () => {
    switch (selectedSaleType) {
      case "Cash Sales":
        return ["cash", "totalSales"];
      case "Credit Sales":
        return ["credits", "totalSales"];
      default:
        return ["credits", "cash", "totalSales"];
    }
  };

  const getColSpan = () => {
    const columns = getTableColumns();
    let count = isMobileView ? 4 : 6;
    if (columns.includes("credits")) count++;
    if (columns.includes("cash")) count++;
    return count;
  };

  // ── Pagination ─────────────────────────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          ← Prev
        </button>
        <div className="flex gap-1">
          {isMobileView ? (
            <span className="px-3 py-2 text-sm text-gray-700 font-medium">
              {pagination.currentPage} / {pagination.totalPages}
            </span>
          ) : (
            visiblePages.map((page, i) => (
              <button
                key={i}
                onClick={() =>
                  typeof page === "number" && handlePageChange(page)
                }
                disabled={typeof page !== "number"}
                className={`min-w-[36px] px-3 py-2 rounded-lg cursor-pointer text-sm ${page === pagination.currentPage ? "bg-indigo-600 text-white" : typeof page === "number" ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-transparent text-gray-500 cursor-default"}`}
              >
                {page}
              </button>
            ))
          )}
        </div>
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer text-sm ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
        >
          Next →
        </button>
      </div>
    );
  };

  // ── Summary Cards ──────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    const cards = [
      {
        label: "Total Sales",
        value: `$${data.summary.totalSalesAmount?.toLocaleString() || 0}`,
        icon: (
          <DollarSign
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
        border: "border-green-500",
      },
      {
        label: "Total Orders",
        value: data.summary.totalOrders?.toLocaleString() || 0,
        icon: (
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
        border: "border-blue-500",
      },
      {
        label: "Total MRs",
        value: data.summary.totalMRs?.toLocaleString() || 0,
        icon: (
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        ),
        border: "border-purple-500",
      },
      {
        label: "Total Customers",
        value: data.summary.totalCustomers?.toLocaleString() || 0,
        icon: (
          <User
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
          />
        ),
        border: "border-orange-500",
      },
    ];
    return (
      <div
        className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 mb-6"}`}
      >
        {cards.map(({ label, value, icon, border }) => (
          <div
            key={label}
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 ${border} border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                >
                  {label}
                </p>
                <p
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
                >
                  {value}
                </p>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Payment Breakdown ──────────────────────────────────────────────────────
  const renderPaymentBreakdown = () => {
    const columns = getTableColumns();
    return (
      <div
        className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2 mb-6"}`}
      >
        {columns.includes("credits") && (
          <div
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                >
                  Total Credits
                </p>
                <p
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
                >
                  ${data.summary.credits?.toLocaleString() || 0}
                </p>
              </div>
              <DollarSign
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
              />
            </div>
          </div>
        )}
        {columns.includes("cash") && (
          <div
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                >
                  Total Cash
                </p>
                <p
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
                >
                  ${data.summary.cash?.toLocaleString() || 0}
                </p>
              </div>
              <DollarSign
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Table Headers ──────────────────────────────────────────────────────────
  const renderTableHeaders = () => {
    const columns = getTableColumns();
    const thClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>MR Name</th>
          {!isMobileView && <th className={thClass}>Contact</th>}
          {!isMobileView && <th className={thClass}>Email</th>}
          {!isMobileView && <th className={thClass}>Team</th>}
          {columns.includes("credits") && (
            <th className={thClass}>Credits ($)</th>
          )}
          {columns.includes("cash") && <th className={thClass}>Cash ($)</th>}
          <th className={thClass}>Total Sales ($)</th>
          <th className={thClass}>Date</th>
        </tr>
      </thead>
    );
  };

  // ── Table Row ──────────────────────────────────────────────────────────────
  const renderTableRow = (mr, index) => {
    const columns = getTableColumns();
    let displayDate = mr.date;
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      displayDate = `${formatDateToDisplay(customDateRange.startDate)} - ${formatDateToDisplay(customDateRange.endDate)}`;
    } else if (mr.date && mr.date !== "N/A" && mr.date !== "") {
      displayDate = formatDateToDisplay(mr.date);
    } else {
      displayDate = "N/A";
    }
    const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;
    return (
      <tr
        key={index}
        className={`hover:bg-gray-50 ${index === data.records.length - 1 ? "" : "border-b"}`}
      >
        <td className={tdClass}>
          <span className="text-gray-600 font-medium">
            {getSerialNumber(index)}
          </span>
        </td>
        <td className={tdClass}>
          <span
            className={`font-medium text-gray-900 capitalize ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            {mr.mrName}
          </span>
          {isMobileView && mr.mrContactNo && (
            <div className="text-xs text-gray-400 mt-0.5">{mr.mrContactNo}</div>
          )}
        </td>
        {!isMobileView && (
          <td className={tdClass}>
            <span className="text-gray-900">
              {mr.mrContactNo || "Not Available"}
            </span>
          </td>
        )}
        {!isMobileView && (
          <td className={tdClass}>
            <span className="text-gray-900">
              {mr.mrEmail || "Not Available"}
            </span>
          </td>
        )}
        {!isMobileView && (
          <td className={tdClass}>
            <span className="text-gray-900">
              {mr.mrTeamName || "Not Available"}
            </span>
          </td>
        )}
        {columns.includes("credits") && (
          <td className={`${tdClass} font-semibold text-blue-600`}>
            $
            {mr.credits?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || "0.00"}
          </td>
        )}
        {columns.includes("cash") && (
          <td className={`${tdClass} font-semibold text-green-600`}>
            $
            {mr.cash?.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }) || "0.00"}
          </td>
        )}
        <td className={`${tdClass} font-semibold text-gray-800`}>
          $
          {mr.totalSalesAmount?.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) || "0.00"}
        </td>
        <td className={`${tdClass} text-gray-600`}>
          {isMobileView
            ? displayDate.split(" ").slice(0, 2).join(" ")
            : displayDate}
        </td>
      </tr>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
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
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            {/* Hamburger menu — same as Customer */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <TrendingUp className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">Daily Reports</h1>
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
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exporting || data.records.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${exporting || data.records.length === 0 ? "bg-gray-400 text-white cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"}`}
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />{" "}
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={18} /> Export Excel
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
            placeholder="Search by MR name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* ── Sale Type Tabs ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2">
          {saleTypes.map((typeObj) => (
            <button
              key={typeObj.type}
              onClick={() => handleSaleTypeChange(typeObj.type)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedSaleType === typeObj.type ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {capitalizeFirstLetter(typeObj.type)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Time Filter Tabs ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { key: "today", label: "Today" },
            { key: "all", label: "All Records" },
            {
              key: "currentMonth",
              label: isMobileView
                ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
                : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              key: "janToPreviousMonth",
              label: isMobileView
                ? getJanToPreviousMonthRange()
                    .label.replace("January", "Jan")
                    .replace("February", "Feb")
                    .replace("March", "Mar")
                : getJanToPreviousMonthRange().label,
            },
            { key: "custom", label: "Custom" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === key ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
        >
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
          {selectedSaleType !== "Total sales" && (
            <>
              <span className="mx-1">•</span>
              <span className="font-medium">{selectedSaleType}</span>
            </>
          )}
        </div>
      </div>

      {renderSummaryCards()}
      {renderPaymentBreakdown()}

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
              data.records.map((mr, index) => renderTableRow(mr, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className={`p-6 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
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

      {/* ── MOBILE bottom action bar ── */}
      {isMobileView && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3 z-40 shadow-lg">
          <button
            onClick={exportToExcel}
            disabled={exporting || data.records.length === 0}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition ${exporting || data.records.length === 0 ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"}`}
          >
            {exporting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={16} />
                <span>Export Excel</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* ── Custom Filter Modal ── */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10 mx-4">
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
