import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Percent,
  FlaskConical,
  Users,
  Eye,
  RefreshCw,
  Calendar,
  Package,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import ReactDOM from "react-dom";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Date filter constants ────────────────────────────────────────────────
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 2 + i);

// ─── Modal to show sample details (like in DailySample) ──────────────────
const SampleDetailsModal = ({
  isOpen,
  onClose,
  sampleDetails,
  productName,
}) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Sample Details for {productName}
        </h2>
        {!sampleDetails || sampleDetails.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No sample records found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse text-center">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">Date</th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    MR Name
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Quantity
                  </th>
                  <th className="px-4 py-2 font-medium text-gray-600">
                    Remark
                  </th>
                </tr>
              </thead>
              <tbody>
                {sampleDetails.map((detail, idx) => (
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {formatDateToReadable(detail.date)}
                    </td>
                    <td className="px-4 py-2 capitalize">
                      {detail.mrName || "—"}
                    </td>
                    <td className="px-4 py-2">{detail.quantity}</td>
                    <td className="px-4 py-2">{detail.remark || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Custom Range Calendar Modal (same as before) ────────────────────────
const CustomRangeModal = ({
  isOpen,
  onClose,
  onApply,
  initialStart,
  initialEnd,
}) => {
  const [calYear, setCalYear] = useState(CURRENT_YEAR);
  const [calMonth, setCalMonth] = useState(CURRENT_MONTH);
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [hovering, setHovering] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setStart(initialStart || null);
      setEnd(initialEnd || null);
      setCalYear(CURRENT_YEAR);
      setCalMonth(CURRENT_MONTH);
      setHovering(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y, m) => new Date(y, m, 1).getDay();

  const prevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear((y) => y - 1);
    } else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear((y) => y + 1);
    } else setCalMonth((m) => m + 1);
  };
  const handleDayClick = (day) => {
    const clicked = new Date(calYear, calMonth, day);
    if (!start || (start && end)) {
      setStart(clicked);
      setEnd(null);
    } else {
      if (clicked < start) {
        setEnd(start);
        setStart(clicked);
      } else setEnd(clicked);
    }
  };

  const toKey = (d) => d?.toDateString();
  const isStart = (day) =>
    toKey(new Date(calYear, calMonth, day)) === toKey(start);
  const isEnd = (day) => toKey(new Date(calYear, calMonth, day)) === toKey(end);
  const isInRange = (day) => {
    const d = new Date(calYear, calMonth, day),
      e = end || hovering;
    if (!start || !e) return false;
    const [a, b] = start <= e ? [start, e] : [e, start];
    return d > a && d < b;
  };

  const days = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDayOfMonth(calYear, calMonth);
  const fmtShort = (d) =>
    d
      ? d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const presets = [
    {
      label: "Last 7 days",
      fn: () => {
        const e = new Date(),
          s = new Date();
        s.setDate(s.getDate() - 6);
        setStart(s);
        setEnd(e);
      },
    },
    {
      label: "Last 30 days",
      fn: () => {
        const e = new Date(),
          s = new Date();
        s.setDate(s.getDate() - 29);
        setStart(s);
        setEnd(e);
      },
    },
    {
      label: "This month",
      fn: () => {
        setStart(new Date(CURRENT_YEAR, CURRENT_MONTH, 1));
        setEnd(new Date());
      },
    },
    {
      label: "Last month",
      fn: () => {
        const lm = CURRENT_MONTH === 0 ? 11 : CURRENT_MONTH - 1;
        const ly = CURRENT_MONTH === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR;
        setStart(new Date(ly, lm, 1));
        setEnd(new Date(ly, lm + 1, 0));
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-800">
            Select Date Range
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-3 bg-indigo-50 flex items-center justify-between text-sm">
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">From</p>
            <p className="font-semibold text-indigo-700">{fmtShort(start)}</p>
          </div>
          <div className="text-gray-400 text-lg">→</div>
          <div className="text-center">
            <p className="text-xs text-gray-500 mb-0.5">To</p>
            <p className="font-semibold text-indigo-700">{fmtShort(end)}</p>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-2">
              <select
                value={calMonth}
                onChange={(e) => setCalMonth(Number(e.target.value))}
                className="text-sm font-semibold text-gray-800 border-0 bg-transparent"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={calYear}
                onChange={(e) => setCalYear(Number(e.target.value))}
                className="text-sm font-semibold text-gray-800 border-0 bg-transparent"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-semibold text-gray-400 py-1"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => {
              const s = isStart(day),
                e = isEnd(day),
                r = isInRange(day);
              return (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() =>
                    start &&
                    !end &&
                    setHovering(new Date(calYear, calMonth, day))
                  }
                  onMouseLeave={() => setHovering(null)}
                  className={`h-9 w-full text-sm font-medium transition-all rounded-lg ${s || e ? "bg-indigo-600 text-white" : ""} ${r ? "bg-indigo-100 text-indigo-800" : ""} ${!s && !e && !r ? "text-gray-700 hover:bg-gray-100" : ""}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={p.fn}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 font-medium rounded-lg hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            disabled={!start || !end}
            onClick={() => {
              if (start && end) {
                onApply(start, end);
                onClose();
              }
            }}
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg"
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Date Filter Bar (Responsive) ─────────────────────────────────────────
const DateFilterBar = ({
  filterMode,
  year,
  month,
  startDate,
  endDate,
  onMonthClick,
  onYearChange,
  onOpenCustom,
  onApply,
  loading,
  filterLabel,
  isMobileView,
}) => {
  const recentMonths = useMemo(() => {
    const result = [];
    for (let i = 2; i >= 0; i--) {
      let m = CURRENT_MONTH - i,
        y = CURRENT_YEAR;
      if (m < 0) {
        m += 12;
        y -= 1;
      }
      result.push({ month: m, year: y, label: `${SHORT_MONTHS[m]} ${y}` });
    }
    return result;
  }, []);

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center shadow-sm ${isMobileView ? "flex-col" : ""}`}
    >
      <div className={`flex flex-wrap gap-2 ${isMobileView ? "w-full" : ""}`}>
        {recentMonths.map((rm) => (
          <button
            key={`${rm.month}-${rm.year}`}
            onClick={() => onMonthClick(rm.month, rm.year)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all border ${filterMode === "month" && month === rm.month && year === rm.year ? "bg-indigo-600 text-white border-indigo-600 shadow" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}
          >
            {rm.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={year}
          onChange={(e) => onYearChange(Number(e.target.value))}
          className={`border rounded-lg px-3 py-1.5 text-xs font-medium ${filterMode === "year" ? "border-indigo-500 text-indigo-700 bg-indigo-50" : "border-gray-300 text-gray-600"}`}
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={onOpenCustom}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium border ${filterMode === "custom" ? "bg-indigo-600 text-white border-indigo-600 shadow" : "bg-white text-gray-600 border-gray-200"}`}
        >
          <Calendar size={12} />
          {filterMode === "custom" && startDate && endDate && !isMobileView
            ? filterLabel
            : "Custom"}
        </button>
      </div>
      <button
        onClick={onApply}
        disabled={loading}
        className={`flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium ${isMobileView ? "w-full" : "ml-auto"}`}
      >
        {loading ? (
          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
        ) : (
          <RefreshCw size={12} />
        )}{" "}
        Apply
      </button>
    </div>
  );
};

// ─── Summary Card (Responsive) ────────────────────────────────────────────
const SummaryCard = ({ title, value, icon, borderColor, isMobileView }) => (
  <div
    className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 ${borderColor} border border-gray-200`}
  >
    <div className="flex justify-between items-center">
      <div>
        <p className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}>
          {title}
        </p>
        <p
          className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
        >
          {value}
        </p>
      </div>
      <div className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"}`}>{icon}</div>
    </div>
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────
const CustomerProductAcceptanceRate = () => {
  const today = new Date();

  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      totalSamples: 0,
      totalAccepted: 0,
      totalRejected: 0,
      acceptanceRate: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });

  // Date filter state
  const [filterMode, setFilterMode] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Modal state for product details
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
  const [selectedSampleDetails, setSelectedSampleDetails] = useState([]);
  const [selectedProductName, setSelectedProductName] = useState("");

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const inputRef = useRef(null);
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const filterLabel = useMemo(() => {
    if (filterMode === "custom" && startDate && endDate) {
      const s = startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const e = endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `${s} – ${e}`;
    }
    if (filterMode === "year") return String(year);
    return `${MONTHS[month]} ${year}`;
  }, [filterMode, year, month, startDate, endDate]);

  const buildParams = useCallback(
    (
      page = 1,
      search = searchTerm,
      mode = filterMode,
      y = year,
      m = month,
      sDate = startDate,
      eDate = endDate,
    ) => {
      const params = { page, limit: itemsPerPage };
      if (search.trim()) params.search = search.trim();
      if (mode === "custom" && sDate && eDate) {
        params.period = "custom";
        params.startDate = sDate.toISOString().split("T")[0];
        params.endDate = eDate.toISOString().split("T")[0];
      } else if (mode === "year") {
        params.period = "year";
        params.year = String(y);
      } else {
        params.period = "month";
        params.year = String(y);
        params.month = String(m + 1);
      }
      return params;
    },
    [filterMode, year, month, startDate, endDate, searchTerm],
  );

  const fetchData = useCallback(
    async (
      page = 1,
      search = searchTerm,
      mode = filterMode,
      y = year,
      m = month,
      sDate = startDate,
      eDate = endDate,
    ) => {
      if (mode === "custom" && (!sDate || !eDate)) {
        showToast("warning", "Please select both start and end dates.");
        return;
      }
      setLoading(true);
      try {
        const params = buildParams(page, search, mode, y, m, sDate, eDate);
        const response = await axios.get(
          `${backendUrl}/api/reports/customer-expectation-ratio`,
          { params },
        );
        const d = response.data.data;
        setData({
          summary: d?.summary ?? {
            totalCustomers: 0,
            totalSamples: 0,
            totalAccepted: 0,
            totalRejected: 0,
            acceptanceRate: 0,
          },
          records: d?.records || [],
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
      } catch {
        showToast("error", "Failed to fetch acceptance rate data");
      } finally {
        setLoading(false);
      }
    },
    [filterMode, year, month, startDate, endDate, searchTerm, buildParams],
  );

  useEffect(() => {
    fetchData(
      1,
      "",
      "month",
      today.getFullYear(),
      today.getMonth(),
      null,
      null,
    );
  }, []);
  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handleMonthClick = useCallback(
    (m, y) => {
      setFilterMode("month");
      setMonth(m);
      setYear(y);
      setStartDate(null);
      setEndDate(null);
      fetchData(1, searchTerm, "month", y, m, null, null);
    },
    [fetchData, searchTerm],
  );
  const handleYearChange = useCallback(
    (y) => {
      setFilterMode("year");
      setYear(y);
      setStartDate(null);
      setEndDate(null);
      fetchData(1, searchTerm, "year", y, month, null, null);
    },
    [fetchData, searchTerm, month],
  );
  const handleCustomApply = useCallback(
    (s, e) => {
      setFilterMode("custom");
      setStartDate(s);
      setEndDate(e);
      fetchData(1, searchTerm, "custom", year, month, s, e);
    },
    [fetchData, searchTerm, year, month],
  );
  const handleApply = useCallback(() => {
    fetchData(
      pagination.currentPage,
      searchTerm,
      filterMode,
      year,
      month,
      startDate,
      endDate,
    );
  }, [
    fetchData,
    pagination.currentPage,
    searchTerm,
    filterMode,
    year,
    month,
    startDate,
    endDate,
  ]);
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchData(page);
  };

  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      const params = buildParams(1, searchTerm);
      delete params.page;
      delete params.limit;
      const response = await axios.get(
        `${backendUrl}/api/reports/customer-expectation-ratio/export`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `customer_product_acceptance_rate_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel file downloaded successfully");
    } catch {
      showToast("error", "Failed to export to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  const handleProductClick = (record) => {
    setSelectedSampleDetails(record.sampleDetails || []);
    setSelectedProductName(record.productName);
    setIsSampleModalOpen(true);
  };

  // Table headers (responsive)
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Customer</th>
          <th className={thClass}>Product</th>
          <th className={thClass}>Acc</th>
          <th className={thClass}>Rej</th>
          <th className={thClass}>Total</th>
          <th className={thClass}>Rate</th>
        </tr>
      </thead>
    );
  };

  // Table row
  const renderTableRow = (record, index) => {
    const tdClass = `${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"}`;
    return (
      <tr
        key={index}
        className={`hover:bg-gray-50 ${index !== data.records.length - 1 ? "border-b" : ""}`}
      >
        <td className={tdClass}>
          <span className="text-gray-600 font-medium">
            {getSerialNumber(index)}
          </span>
        </td>
        <td className={`${tdClass} text-gray-800 capitalize`}>
          {record.customerName || "N/A"}
        </td>
        <td className={tdClass}>
          <button
            onClick={() => handleProductClick(record)}
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer"
          >
            <Package size={isMobileView ? 12 : 16} />
            <span className={isMobileView ? "text-[10px]" : "text-sm"}>
              {isMobileView
                ? record.productName?.length > 20
                  ? record.productName.substring(0, 15) + "..."
                  : record.productName
                : record.productName}
            </span>
          </button>
        </td>
        <td className={`${tdClass} text-green-600 font-semibold`}>
          {record.acceptedCount || 0}
        </td>
        <td className={`${tdClass} text-red-500 font-semibold`}>
          {record.rejectedCount || 0}
        </td>
        <td className={`${tdClass} text-gray-700 font-medium`}>
          {record.totalProducts || 0}
        </td>
        <td className={`${tdClass} text-blue-600 font-semibold`}>
          {record.acceptanceRate?.toFixed(2) || 0}%
        </td>
      </tr>
    );
  };

  // Pagination (responsive)
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

  return (
    <div
      className={`${isMobileView ? "p-3 pb-20" : "p-6"} space-y-4 min-h-screen bg-gray-50 relative`}
    >
      <SampleDetailsModal
        isOpen={isSampleModalOpen}
        onClose={() => setIsSampleModalOpen(false)}
        sampleDetails={selectedSampleDetails}
        productName={selectedProductName}
      />
      <CustomRangeModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onApply={handleCustomApply}
        initialStart={startDate}
        initialEnd={endDate}
      />

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
            <FlaskConical className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">
              Acceptance Rate
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Customer Product Acceptance Rate
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Viewing:{" "}
              <span className="font-semibold text-indigo-600">
                {filterLabel}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by customer or product..."
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
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exportLoading}
              className={`flex items-center gap-2 ${exportLoading ? "bg-green-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"} text-white px-4 py-2 rounded-xl shadow-md`}
            >
              {exportLoading ? (
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
            ref={inputRef}
            type="text"
            placeholder="Search customer or product..."
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
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Date Filter Bar */}
      <DateFilterBar
        filterMode={filterMode}
        year={year}
        month={month}
        startDate={startDate}
        endDate={endDate}
        onMonthClick={handleMonthClick}
        onYearChange={handleYearChange}
        onOpenCustom={() => setShowCustomModal(true)}
        onApply={handleApply}
        loading={loading}
        filterLabel={filterLabel}
        isMobileView={isMobileView}
      />

      {/* Summary Cards */}
      <div
        className={`grid gap-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-5 gap-6"}`}
      >
        <SummaryCard
          title="Total Customers"
          value={
            loading ? "—" : data.summary.totalCustomers?.toLocaleString() || 0
          }
          icon={
            <Users
              className={`${isMobileView ? "w-5 h-5" : "w-8 h-8"} text-green-500`}
            />
          }
          borderColor="border-green-500"
          isMobileView={isMobileView}
        />
        <SummaryCard
          title="Total Samples"
          value={
            loading ? "—" : data.summary.totalSamples?.toLocaleString() || 0
          }
          icon={
            <FlaskConical
              className={`${isMobileView ? "w-5 h-5" : "w-8 h-8"} text-blue-500`}
            />
          }
          borderColor="border-blue-500"
          isMobileView={isMobileView}
        />
        <SummaryCard
          title="Accepted"
          value={
            loading ? "—" : data.summary.totalAccepted?.toLocaleString() || 0
          }
          icon={
            <Eye
              className={`${isMobileView ? "w-5 h-5" : "w-8 h-8"} text-purple-500`}
            />
          }
          borderColor="border-purple-500"
          isMobileView={isMobileView}
        />
        <SummaryCard
          title="Rejected"
          value={
            loading ? "—" : data.summary.totalRejected?.toLocaleString() || 0
          }
          icon={
            <TrendingUp
              className={`${isMobileView ? "w-5 h-5" : "w-8 h-8"} text-red-500`}
            />
          }
          borderColor="border-red-500"
          isMobileView={isMobileView}
        />
        <SummaryCard
          title="Acceptance Rate"
          value={
            loading ? "—" : `${data.summary.acceptanceRate?.toFixed(1) || 0}%`
          }
          icon={
            <Percent
              className={`${isMobileView ? "w-5 h-5" : "w-8 h-8"} text-orange-500`}
            />
          }
          borderColor="border-orange-500"
          isMobileView={isMobileView}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[500px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className={`${isMobileView ? "text-xs" : "text-sm"}`}>
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
                  colSpan={7}
                  className={`p-8 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                >
                  No customer product acceptance data found for the selected
                  period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* ── MOBILE bottom action bar (Export button REMOVED) ── */}
      {/* Export button is completely removed on mobile view */}
    </div>
  );
};

export default CustomerProductAcceptanceRate;
