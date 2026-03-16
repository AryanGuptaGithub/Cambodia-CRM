import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import ReactDOM from "react-dom";
import {
  BarChart2,
  Users,
  FlaskConical,
  ChevronDown,
  Calendar,
  Search,
  Download,
  RefreshCw,
  TrendingUp,
  Package,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  MinusCircle,
} from "lucide-react";
import axios from "axios";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);
axios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return (
    str.toString().charAt(0).toUpperCase() +
    str.toString().slice(1).toLowerCase()
  );
}

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
const PAGE_SIZE = 7;

const TABS = [
  {
    key: "all",
    label: "All",
    icon: BarChart2,
    desc: "Combined product-wise sales",
    placeholder: "Search product...",
  },
  {
    key: "mr",
    label: "MR Wise",
    icon: Users,
    desc: "Sales per Medical Representative",
    placeholder: "Search MR or product...",
  },
  {
    key: "sample",
    label: "Sample Wise",
    icon: FlaskConical,
    desc: "Daily sample records with resulting sales",
    placeholder: "Search date, customer or product...",
  },
];

const fmt = (n) =>
  n === null || n === undefined || isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtInt = (n) =>
  n === null || n === undefined || isNaN(Number(n))
    ? "—"
    : Number(n).toLocaleString("en-US");

const fmtQty = (n) => {
  if (n === null || n === undefined || isNaN(Number(n))) return "0";
  return Number(n).toLocaleString("en-US");
};

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// Pagination component (unchanged)
const Pagination = ({ total, page, onPage }) => {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    )
      pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return (
    <div className="flex items-center justify-between px-2 py-3">
      <p className="text-xs text-gray-500">
        Showing{" "}
        <span className="font-semibold text-gray-700">
          {(page - 1) * PAGE_SIZE + 1}
        </span>
        –
        <span className="font-semibold text-gray-700">
          {Math.min(page * PAGE_SIZE, total)}
        </span>{" "}
        of <span className="font-semibold text-gray-700">{total}</span> entries
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`d-${i}`} className="px-2 text-gray-400 text-sm">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-colors ${
                p === page
                  ? "bg-indigo-600 text-white shadow"
                  : "border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

// StatCard component (unchanged)
const StatCard = ({ label, value, sub, color = "indigo", icon: Icon }) => {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    green: "bg-green-50  text-green-700  border-green-200",
    amber: "bg-amber-50  text-amber-700  border-amber-200",
    rose: "bg-rose-50   text-rose-700   border-rose-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
  };
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1 ${colors[color]}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
          {label}
        </p>
        {Icon && <Icon size={16} className="opacity-50" />}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60">{sub}</p>}
    </div>
  );
};

// CustomRangeModal component (unchanged)
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
        const lm = CURRENT_MONTH === 0 ? 11 : CURRENT_MONTH - 1,
          ly = CURRENT_MONTH === 0 ? CURRENT_YEAR - 1 : CURRENT_YEAR;
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
            <X size={16} className="text-gray-500" />
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
              <ChevronLeft size={16} className="text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <select
                value={calMonth}
                onChange={(e) => setCalMonth(Number(e.target.value))}
                className="text-sm font-semibold text-gray-800 border-0 bg-transparent focus:outline-none cursor-pointer"
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
                className="text-sm font-semibold text-gray-800 border-0 bg-transparent focus:outline-none cursor-pointer"
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
              <ChevronRight size={16} className="text-gray-600" />
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
                  className={`h-9 w-full text-sm font-medium transition-all rounded-lg
                    ${s || e ? "bg-indigo-600 text-white" : ""}
                    ${r ? "bg-indigo-100 text-indigo-800" : ""}
                    ${!s && !e && !r ? "text-gray-700 hover:bg-gray-100" : ""}`}
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
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
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
            className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            Apply Range
          </button>
        </div>
      </div>
    </div>
  );
};

// DateFilterBar component (unchanged)
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
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-center shadow-sm">
      {recentMonths.map((rm) => (
        <button
          key={`${rm.month}-${rm.year}`}
          onClick={() => onMonthClick(rm.month, rm.year)}
          className={`px-4 py-2 text-sm rounded-lg font-medium transition-all border ${
            filterMode === "month" && month === rm.month && year === rm.year
              ? "bg-indigo-600 text-white border-indigo-600 shadow"
              : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
          }`}
        >
          {rm.label}
        </button>
      ))}
      <div className="h-8 w-px bg-gray-200 hidden sm:block" />
      <select
        value={year}
        onChange={(e) => onYearChange(Number(e.target.value))}
        className={`border rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300 cursor-pointer ${
          filterMode === "year"
            ? "border-indigo-500 text-indigo-700 bg-indigo-50"
            : "border-gray-300 text-gray-600"
        }`}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <div className="h-8 w-px bg-gray-200 hidden sm:block" />
      <button
        onClick={onOpenCustom}
        className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg font-medium border transition-all ${
          filterMode === "custom"
            ? "bg-indigo-600 text-white border-indigo-600 shadow"
            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
        }`}
      >
        <Calendar size={14} />
        {filterMode === "custom" && startDate && endDate
          ? filterLabel
          : "Custom Range"}
      </button>
      <button
        onClick={onApply}
        disabled={loading}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium ml-auto"
      >
        {loading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
        ) : (
          <RefreshCw size={14} />
        )}
        Apply
      </button>
    </div>
  );
};

// AllTab component (unchanged)
const AllTab = forwardRef(({ data, loading, search, onExport }, ref) => {
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const withSales = data.filter(
      (r) => (r.totalSalesQty || 0) > 0 || (r.totalBonusQty || 0) > 0,
    );
    if (!search.trim()) return withSales;
    const q = search.toLowerCase();
    return withSales.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.category?.toLowerCase().includes(q) ||
        r.supplierName?.toLowerCase().includes(q),
    );
  }, [data, search]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length, search]);

  const totals = useMemo(
    () => ({
      salesQty: filtered.reduce((s, r) => s + (r.totalSalesQty || 0), 0),
      bonusQty: filtered.reduce((s, r) => s + (r.totalBonusQty || 0), 0),
      totalQty: filtered.reduce((s, r) => s + (r.periodSoldQuantity || 0), 0),
      netAmount: filtered.reduce((s, r) => s + (r.periodSales || 0), 0),
      profitLoss: filtered.reduce((s, r) => s + (r.profitAmount || 0), 0),
    }),
    [filtered],
  );

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);
  useImperativeHandle(ref, () => ({ getFilteredData: () => filtered }));
  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Products"
          value={fmtInt(filtered.length)}
          icon={Package}
          color="indigo"
        />
        <StatCard
          label="Sales Qty"
          value={fmtInt(totals.salesQty)}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Bonus Qty"
          value={fmtInt(totals.bonusQty)}
          color="amber"
        />
        <StatCard
          label="Total Qty"
          value={fmtInt(totals.totalQty)}
          color="purple"
        />
        <StatCard
          label="Net Amount"
          value={`$${fmt(totals.netAmount)}`}
          color="green"
        />
      </div>
      <div className="rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white text-center">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  "#",
                  "Product Name",
                  "Current Stock",
                  "Sales Qty",
                  "Bonus Qty",
                  "Total Qty",
                  "Avg Price",
                  "Net Amount",
                  "Profit",
                  "Margin",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    No sales data found for the selected period.
                  </td>
                </tr>
              ) : (
                paginated.map((row, i) => (
                  <tr
                    key={row._id || i}
                    className="border-b border-gray-100 hover:bg-indigo-50/40 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-400">
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {capitalizeFirstLetter(row.name)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {fmtInt(row.currentStock)}
                    </td>
                    <td className="px-4 py-3">{fmtInt(row.totalSalesQty)}</td>
                    <td className="px-4 py-3 text-amber-600 font-medium">
                      {fmtInt(row.totalBonusQty)}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {fmtInt(row.periodSoldQuantity)}
                    </td>
                    <td className="px-4 py-3">
                      ${fmt(row.weightedAveragePrice)}
                    </td>
                    <td className="px-4 py-3 text-green-700 font-semibold">
                      ${fmt(row.periodSales)}
                    </td>
                    <td
                      className={`px-4 py-3 font-semibold ${row.profitAmount >= 0 ? "text-green-700" : "text-red-600"}`}
                    >
                      ${fmt(row.profitAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {row.profitMargin}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${
                          row.status === "In Stock"
                            ? "bg-green-100 text-green-700"
                            : row.status === "Low Stock"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-600"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && page === totalPages && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-700">
                    Grand Total
                  </td>
                  <td className="px-4 py-3 text-center font-bold">
                    {fmtInt(totals.salesQty)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold text-amber-600">
                    {fmtInt(totals.bonusQty)}
                  </td>
                  <td className="px-4 py-3 text-center font-bold">
                    {fmtInt(totals.totalQty)}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 font-bold text-green-700">
                    ${fmt(totals.netAmount)}
                  </td>
                  <td
                    className={`px-4 py-3 font-bold ${totals.profitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    ${fmt(totals.profitLoss)}
                  </td>
                  <td colSpan={2} className="px-4 py-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {filtered.length > PAGE_SIZE && (
          <div className="border-t border-gray-100 bg-white px-4">
            <Pagination total={filtered.length} page={page} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
});

// MRWiseTab component (unchanged)
const MRWiseTab = forwardRef(({ data, loading, search, onExport }, ref) => {
  const [expanded, setExpanded] = useState({});
  const [page, setPage] = useState(1);
  const toggle = (n) => setExpanded((p) => ({ ...p, [n]: !p[n] }));

  const filtered = useMemo(() => {
    const withSales = data.filter(
      (mr) => (mr.totalSalesQty || 0) > 0 || (mr.totalBonusQty || 0) > 0,
    );
    if (!search.trim()) return withSales;
    const q = search.toLowerCase();
    return withSales
      .filter(
        (mr) =>
          mr.mrName?.toLowerCase().includes(q) ||
          mr.products?.some((p) => p.productName?.toLowerCase().includes(q)),
      )
      .map((mr) => ({
        ...mr,
        products: mr.products?.filter((p) =>
          p.productName?.toLowerCase().includes(q),
        ),
      }));
  }, [data, search]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length, search]);

  const totals = useMemo(
    () => ({
      salesQty: filtered.reduce((s, mr) => s + (mr.totalSalesQty || 0), 0),
      bonusQty: filtered.reduce((s, mr) => s + (mr.totalBonusQty || 0), 0),
      totalQty: filtered.reduce((s, mr) => s + (mr.totalQty || 0), 0),
      netAmount: filtered.reduce((s, mr) => s + (mr.totalNetAmount || 0), 0),
      profitLoss: filtered.reduce((s, mr) => s + (mr.totalProfitLoss || 0), 0),
    }),
    [filtered],
  );

  const paginated = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);
  useImperativeHandle(ref, () => ({ getFilteredData: () => filtered }));
  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="MRs"
          value={fmtInt(filtered.length)}
          icon={Users}
          color="indigo"
        />
        <StatCard
          label="Sales Qty"
          value={fmtInt(totals.salesQty)}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Bonus Qty"
          value={fmtInt(totals.bonusQty)}
          color="amber"
        />
        <StatCard
          label="Total Qty"
          value={fmtInt(totals.totalQty)}
          color="purple"
        />
        <StatCard
          label="Net Amount"
          value={`$${fmt(totals.netAmount)}`}
          color="green"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            setExpanded(
              Object.fromEntries(filtered.map((mr) => [mr.mrName, true])),
            )
          }
          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
        >
          Expand All
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setExpanded({})}
          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
        >
          Collapse All
        </button>
      </div>
      <div className="space-y-3">
        {paginated.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-12 text-center text-gray-400 bg-white">
            No MR sales data found.
          </div>
        ) : (
          paginated.map((mr) => (
            <div
              key={mr.mrName}
              className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
            >
              <button
                onClick={() => toggle(mr.mrName)}
                className="w-full flex items-center justify-between px-5 py-4 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                    {mr.mrName?.[0]?.toUpperCase() || "M"}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">
                      {mr.mrName || "Unknown MR"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mr.products?.length || 0} product(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm flex-wrap">
                  <span className="text-gray-600">
                    Sales: <strong>{fmtInt(mr.totalSalesQty)}</strong>
                  </span>
                  <span className="text-amber-600">
                    Bonus: <strong>{fmtInt(mr.totalBonusQty)}</strong>
                  </span>
                  <span className="text-purple-600">
                    Total: <strong>{fmtInt(mr.totalQty)}</strong>
                  </span>
                  <span className="text-green-700">
                    Net: <strong>${fmt(mr.totalNetAmount)}</strong>
                  </span>
                  <span
                    className={
                      mr.totalProfitLoss >= 0
                        ? "text-green-700"
                        : "text-red-600"
                    }
                  >
                    P/L: <strong>${fmt(mr.totalProfitLoss)}</strong>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${expanded[mr.mrName] ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {expanded[mr.mrName] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white text-center">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {[
                          "#",
                          "Product Name",
                          "Sales Qty",
                          "Bonus Qty",
                          "Total Qty",
                          "Avg Price",
                          "Net Amount",
                          "Profit/Loss",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(mr.products || [])
                        .filter(
                          (p) => (p.salesQty || 0) > 0 || (p.bonusQty || 0) > 0,
                        )
                        .map((p, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-100 hover:bg-indigo-50/30"
                          >
                            <td className="px-4 py-2.5 text-gray-400">
                              {i + 1}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">
                              {capitalizeFirstLetter(p.productName)}
                            </td>
                            <td className="px-4 py-2.5">
                              {fmtInt(p.salesQty)}
                            </td>
                            <td className="px-4 py-2.5 text-amber-600">
                              {fmtInt(p.bonusQty)}
                            </td>
                            <td className="px-4 py-2.5 font-semibold">
                              {fmtInt(p.totalQty)}
                            </td>
                            <td className="px-4 py-2.5">${fmt(p.avgPrice)}</td>
                            <td className="px-4 py-2.5 text-green-700 font-semibold">
                              ${fmt(p.netSellingAmount)}
                            </td>
                            <td
                              className={`px-4 py-2.5 font-semibold ${p.profitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
                            >
                              ${fmt(p.profitLoss)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-300">
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-2.5 font-bold text-gray-700"
                        >
                          MR Total
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold">
                          {fmtInt(mr.totalSalesQty)}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold text-amber-600">
                          {fmtInt(mr.totalBonusQty)}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold">
                          {fmtInt(mr.totalQty)}
                        </td>
                        <td className="px-4 py-2.5 font-bold">
                          ${fmt(mr.avgPrice)}
                        </td>
                        <td className="px-4 py-2.5 font-bold text-green-700">
                          ${fmt(mr.totalNetAmount)}
                        </td>
                        <td
                          className={`px-4 py-2.5 font-bold ${mr.totalProfitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
                        >
                          ${fmt(mr.totalProfitLoss)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 shadow-sm">
          <Pagination total={filtered.length} page={page} onPage={setPage} />
        </div>
      )}
    </div>
  );
});

// ─── SampleWiseTab (UPDATED with clickable order qty and modal) ─────────────────
const SampleWiseTab = forwardRef(({ data, loading, search, onExport }, ref) => {
  const [expanded, setExpanded] = useState({});
  const [page, setPage] = useState(1);
  const [salesModal, setSalesModal] = useState({ open: false, sales: [], productName: '', customerName: '' });

  const toggle = (key) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  // Filter: keep all days that have entries
  const filtered = useMemo(() => {
    const allDays = data.filter((day) => (day.entries?.length || 0) > 0);

    if (!search.trim()) return allDays;

    const q = search.toLowerCase();
    return allDays
      .filter(
        (day) =>
          formatDate(day.date).toLowerCase().includes(q) ||
          day.dateKey?.includes(q) ||
          day.entries?.some(
            (e) =>
              e.customerName?.toLowerCase().includes(q) ||
              e.customerCode?.toLowerCase().includes(q) ||
              e.productName?.toLowerCase().includes(q) ||
              e.mrName?.toLowerCase().includes(q),
          ),
      )
      .map((day) => ({
        ...day,
        entries: (day.entries || []).filter(
          (e) =>
            formatDate(day.date).toLowerCase().includes(q) ||
            day.dateKey?.includes(q) ||
            e.customerName?.toLowerCase().includes(q) ||
            e.customerCode?.toLowerCase().includes(q) ||
            e.productName?.toLowerCase().includes(q) ||
            e.mrName?.toLowerCase().includes(q),
        ),
      }))
      .filter((day) => day.entries.length > 0);
  }, [data, search]);

  useEffect(() => {
    setPage(1);
  }, [filtered.length, search]);

  // Summary stats
  const totals = useMemo(() => {
    let totalEntries = 0,
      totalSampleQty = 0,
      totalOrderQty = 0,
      totalSaleAmount = 0,
      totalProfit = 0;
    for (const day of filtered) {
      for (const e of day.entries || []) {
        totalEntries++;
        totalSampleQty += e.sampleQty ?? 0;
        totalOrderQty += e.orderQty ?? 0;
        totalSaleAmount += e.saleAmount ?? 0;
        totalProfit += e.profit ?? 0;
      }
    }
    return {
      totalDays: filtered.length,
      totalEntries,
      totalSampleQty,
      totalOrderQty,
      totalSaleAmount,
      totalProfit,
    };
  }, [filtered]);

  const paginated = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE;
    return filtered.slice(s, s + PAGE_SIZE);
  }, [filtered, page]);

  useImperativeHandle(ref, () => ({ getFilteredData: () => filtered }));

  const handleOrderQtyClick = (entry) => {
    setSalesModal({
      open: true,
      sales: entry.sales || [],
      productName: entry.productName,
      customerName: entry.customerName,
    });
  };

  if (loading) return <TableSkeleton />;

  return (
    <div className="space-y-4">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard
          label="Total Days"
          value={fmtInt(totals.totalDays)}
          icon={Calendar}
          color="indigo"
        />
        <StatCard
          label="Total Entries"
          value={fmtInt(totals.totalEntries)}
          icon={FlaskConical}
          color="purple"
          sub="All sample records"
        />
        <StatCard
          label="Sample Qty"
          value={fmtInt(totals.totalSampleQty)}
          icon={Package}
          color="amber"
          sub="Samples given"
        />
        <StatCard
          label="Order Qty"
          value={fmtInt(totals.totalOrderQty)}
          icon={ShoppingCart}
          color="green"
          sub="Sale quantity"
        />
        <StatCard
          label="Sale Amount"
          value={`$${fmt(totals.totalSaleAmount)}`}
          icon={TrendingUp}
          color="green"
        />
      </div>

      {/* Expand / Collapse */}
      <div className="flex gap-2">
        <button
          onClick={() =>
            setExpanded(
              Object.fromEntries(filtered.map((d) => [d.dateKey, true])),
            )
          }
          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
        >
          Expand All
        </button>
        <span className="text-gray-300">|</span>
        <button
          onClick={() => setExpanded({})}
          className="text-xs text-indigo-600 hover:text-indigo-800 underline"
        >
          Collapse All
        </button>
      </div>

      {/* Day-grouped cards */}
      <div className="space-y-3">
        {paginated.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-12 text-center text-gray-400 bg-white">
            No sample data found for the selected period.
          </div>
        ) : (
          paginated.map((day) => {
            const dayTotalSample = (day.entries || []).reduce(
              (acc, e) => acc + (e.sampleQty ?? 0),
              0,
            );
            const dayTotalOrder = (day.entries || []).reduce(
              (acc, e) => acc + (e.orderQty ?? 0),
              0,
            );

            return (
              <div
                key={day.dateKey}
                className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                {/* Day header */}
                <button
                  onClick={() => toggle(day.dateKey)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-purple-50 hover:bg-purple-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
                      <Calendar size={16} />
                    </div>
                    <div className="text-left">
                      <p className="font-semibold text-gray-800">
                        {formatDate(day.date)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {day.entries?.length || 0} record(s)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 text-sm">
                    <span className="text-gray-600">
                      Sample Qty:{" "}
                      <strong className="text-amber-700">
                        {fmtInt(dayTotalSample)}
                      </strong>
                    </span>
                    <span className="text-gray-600">
                      Order Qty:{" "}
                      <strong className="text-green-700">
                        {fmtInt(dayTotalOrder)}
                      </strong>
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-gray-400 transition-transform flex-shrink-0 ${
                        expanded[day.dateKey] ? "rotate-180" : ""
                      }`}
                    />
                  </div>
                </button>

                {/* Expanded entries table */}
                {expanded[day.dateKey] && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm bg-white text-center">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">
                            SR
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Customer
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Product
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Sample Qty
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Order Qty
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Sale Amount
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Profit
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            MR
                          </th>
                          <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Remark
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(day.entries || []).length === 0 ? (
                          <tr>
                            <td
                              colSpan={9}
                              className="px-4 py-6 text-center text-gray-400 text-xs"
                            >
                              No entries for this date.
                            </td>
                          </tr>
                        ) : (
                          (day.entries || []).map((entry, i) => {
                            const hasSale = entry.orderQty > 0;

                            return (
                              <tr
                                key={i}
                                className={`border-b border-gray-100 transition-colors ${
                                  hasSale
                                    ? "hover:bg-green-50/30"
                                    : "bg-rose-50/30 hover:bg-rose-50/60"
                                }`}
                              >
                                {/* SR */}
                                <td className="px-4 py-2.5 text-center">
                                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                                    {entry.srNo || i + 1}
                                  </span>
                                </td>

                                {/* Customer Name + Code */}
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-gray-800">
                                    {entry.customerName}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {entry.customerCode}
                                  </div>
                                </td>

                                {/* Product Name */}
                                <td className="px-4 py-2.5 text-gray-700">
                                  {capitalizeFirstLetter(entry.productName)}
                                </td>

                                {/* Sample Qty */}
                                <td className="px-4 py-2.5">
                                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                                    {fmtInt(entry.sampleQty)}
                                  </span>
                                </td>

                                {/* Order Qty – Clickable */}
                                <td className="px-4 py-2.5">
                                  {hasSale ? (
                                    <button
                                      onClick={() => handleOrderQtyClick(entry)}
                                      className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold hover:bg-green-200 focus:outline-none cursor-pointer transition-colors"
                                      title="Click to see sale details"
                                    >
                                      <ShoppingCart size={10} className="inline mr-1" />
                                      {fmtInt(entry.orderQty)}
                                    </button>
                                  ) : (
                                    <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-600 text-xs font-semibold">
                                      <MinusCircle size={10} className="inline mr-1" />
                                      0
                                    </span>
                                  )}
                                </td>

                                {/* Sale Amount */}
                                <td className="px-4 py-2.5 text-green-700 font-semibold">
                                  {hasSale ? `$${fmt(entry.saleAmount)}` : "—"}
                                </td>

                                {/* Profit */}
                                <td
                                  className={`px-4 py-2.5 font-semibold ${
                                    entry.profit >= 0
                                      ? "text-green-700"
                                      : "text-red-600"
                                  }`}
                                >
                                  {hasSale ? `$${fmt(entry.profit)}` : "—"}
                                </td>

                                {/* MR Name */}
                                <td className="px-4 py-2.5 text-gray-600">
                                  {entry.mrName}
                                </td>

                                {/* Remark */}
                                <td className="px-4 py-2.5 text-gray-400 text-xs max-w-[160px] truncate">
                                  {entry.remark || "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>

                      {/* Day total footer */}
                      <tfoot className="bg-gray-50 border-t border-gray-300">
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-2.5 font-bold text-gray-700 text-sm"
                          >
                            Day Total
                          </td>
                          <td className="px-4 py-2.5 text-center font-bold text-green-700">
                            {fmtInt(dayTotalOrder)}
                          </td>
                          <td
                            colSpan={4}
                            className="px-4 py-2.5 font-bold text-green-700"
                          >
                            {/* Optionally sum sale amount for the day */}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 shadow-sm">
          <Pagination total={filtered.length} page={page} onPage={setPage} />
        </div>
      )}

      {/* Sales Details Modal */}
      {salesModal.open &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden mx-4">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-gray-800">
                  Sale Details for {capitalizeFirstLetter(salesModal.productName)}
                </h3>
                <button
                  onClick={() => setSalesModal({ open: false, sales: [] })}
                  className="p-1.5 rounded-lg hover:bg-gray-100"
                >
                  <X size={16} className="text-gray-500" />
                </button>
              </div>
              <div className="px-6 py-3 bg-gray-50">
                <p className="text-sm text-gray-600">
                  Customer: <span className="font-medium">{capitalizeFirstLetter(salesModal.customerName)}</span>
                </p>
              </div>
              <div className="overflow-y-auto p-6 max-h-96">
                {salesModal.sales.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">No sale records found.</p>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">#</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Invoice #</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Sales Qty</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Bonus Qty</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Total Qty</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Amount ($)</th>
                        <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Profit ($)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesModal.sales.map((sale, idx) => (
                        <tr key={idx} className="border-b border-gray-100">
                          <td className="px-4 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-4 py-2 font-mono text-xs">{sale.invoiceNumber || '—'}</td>
                          <td className="px-4 py-2">{formatDate(sale.invoiceDate)}</td>
                          <td className="px-4 py-2">{fmtInt(sale.salesQty)}</td>
                          <td className="px-4 py-2">{fmtInt(sale.bonusQty)}</td>
                          <td className="px-4 py-2 font-semibold">{fmtInt(sale.totalQty)}</td>
                          <td className="px-4 py-2 text-green-700">${fmt(sale.amount)}</td>
                          <td className={`px-4 py-2 ${sale.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                            ${fmt(sale.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-end px-6 py-4 border-t border-gray-100">
                <button
                  onClick={() => setSalesModal({ open: false, sales: [] })}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
});

// TableSkeleton (unchanged)
const TableSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="h-10 bg-gray-100 animate-pulse" />
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <div
          key={i}
          className="h-12 border-t border-gray-100 bg-white animate-pulse"
        />
      ))}
    </div>
  </div>
);

// Export function (updated sample export)
const exportToExcel = (data, mode, filterLabel) => {
  let rows = [];
  const title = `Product Report — ${filterLabel}`;

  if (mode === "all") {
    rows = [
      [title],
      [],
      [
        "#",
        "Product Name",
        "Category",
        "Sales Qty",
        "Bonus Qty",
        "Total Qty",
        "Avg Price ($)",
        "Net Amount ($)",
        "Profit ($)",
        "Profit Margin",
        "Status",
      ],
      ...data.map((r, i) => [
        i + 1,
        r.name,
        r.category,
        r.totalSalesQty,
        r.totalBonusQty,
        r.periodSoldQuantity,
        r.weightedAveragePrice,
        r.periodSales,
        r.profitAmount,
        r.profitMargin,
        r.status,
      ]),
    ];
  } else if (mode === "mr") {
    rows = [[title], []];
    data.forEach((mr) => {
      rows.push([
        `MR: ${mr.mrName}`,
        "",
        "",
        `Sales: ${mr.totalSalesQty}`,
        `Bonus: ${mr.totalBonusQty}`,
        `Total: ${mr.totalQty}`,
        `Avg: ${mr.avgPrice}`,
        `Net: ${mr.totalNetAmount}`,
        `P/L: ${mr.totalProfitLoss}`,
      ]);
      rows.push([
        "#",
        "Product Name",
        "Sales Qty",
        "Bonus Qty",
        "Total Qty",
        "Avg Price",
        "Net Amount",
        "Profit/Loss",
      ]);
      (mr.products || [])
        .filter((p) => (p.salesQty || 0) > 0 || (p.bonusQty || 0) > 0)
        .forEach((p, i) =>
          rows.push([
            i + 1,
            p.productName,
            p.salesQty,
            p.bonusQty,
            p.totalQty,
            p.avgPrice,
            p.netSellingAmount,
            p.profitLoss,
          ]),
        );
      rows.push([]);
    });
  } else if (mode === "sample") {
    // Flat export – includes sample qty and order qty, sale amount, profit
    rows = [
      [title],
      [],
      [
        "SR",
        "Sample Date",
        "Customer Name",
        "Customer Code",
        "Product Name",
        "Sample Qty",
        "Order Qty",
        "Sale Amount ($)",
        "Profit ($)",
        "MR Name",
        "Remark",
      ],
    ];
    let globalSr = 1;
    data.forEach((day) => {
      (day.entries || []).forEach((e) => {
        rows.push([
          globalSr++,
          formatDate(day.date),
          e.customerName || "",
          e.customerCode || "",
          e.productName || "",
          e.sampleQty ?? 0,
          e.orderQty ?? 0,
          e.saleAmount ?? 0,
          e.profit ?? 0,
          e.mrName || "",
          e.remark || "",
        ]);
      });
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `sales_report_${mode}_${Date.now()}.xlsx`);
};

// Main Component
const ProductSalesReport = () => {
  const today = new Date();
  const [activeTab, setActiveTab] = useState("all");
  const [filterMode, setFilterMode] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [allData, setAllData] = useState([]);
  const [mrData, setMrData] = useState([]);
  const [sampleData, setSampleData] = useState([]);
  const [search, setSearch] = useState("");

  const allTabRef = useRef();
  const mrTabRef = useRef();
  const sampleTabRef = useRef();

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

  const fetchData = useCallback(
    async (
      mode = filterMode,
      y = year,
      m = month,
      sDate = startDate,
      eDate = endDate,
    ) => {
      let params = {};
      if (mode === "custom") {
        if (!sDate || !eDate) {
          showToast("warning", "Please select both start and end dates.");
          return;
        }
        params = {
          period: "custom",
          startDate: sDate.toISOString().split("T")[0],
          endDate: eDate.toISOString().split("T")[0],
        };
      } else if (mode === "year") {
        params = { period: "year", year: String(y) };
      } else {
        params = { period: "month", year: String(y), month: String(m + 1) };
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams(params).toString();
        const [allRes, mrRes, sampleRes] = await Promise.allSettled([
          axios.get(`${backendUrl}/api/reports/product-report/all?${qs}`),
          axios.get(`${backendUrl}/api/reports/product-report/mr-wise?${qs}`),
          axios.get(
            `${backendUrl}/api/reports/product-report/sample-wise?${qs}`,
          ),
        ]);
        setAllData(
          allRes.status === "fulfilled" && allRes.value.data?.success
            ? allRes.value.data.data || []
            : [],
        );
        setMrData(
          mrRes.status === "fulfilled" && mrRes.value.data?.success
            ? mrRes.value.data.data || []
            : [],
        );
        setSampleData(
          sampleRes.status === "fulfilled" && sampleRes.value.data?.success
            ? sampleRes.value.data.data || []
            : [],
        );
      } catch (err) {
        console.error("Error fetching report data:", err);
        showToast("error", "Failed to load report data.");
      } finally {
        setLoading(false);
      }
    },
    [filterMode, year, month, startDate, endDate],
  );

  useEffect(() => {
    fetchData("month", today.getFullYear(), today.getMonth(), null, null);
  }, []);
  useEffect(() => {
    setSearch("");
  }, [activeTab]);

  const handleMonthClick = useCallback(
    (m, y) => {
      setFilterMode("month");
      setMonth(m);
      setYear(y);
      setStartDate(null);
      setEndDate(null);
      fetchData("month", y, m, null, null);
    },
    [fetchData],
  );

  const handleYearChange = useCallback(
    (y) => {
      setFilterMode("year");
      setYear(y);
      setStartDate(null);
      setEndDate(null);
      fetchData("year", y, month, null, null);
    },
    [fetchData, month],
  );

  const handleCustomApply = useCallback(
    (s, e) => {
      setFilterMode("custom");
      setStartDate(s);
      setEndDate(e);
      fetchData("custom", year, month, s, e);
    },
    [fetchData, year, month],
  );

  const handleApply = useCallback(() => {
    fetchData(filterMode, year, month, startDate, endDate);
  }, [fetchData, filterMode, year, month, startDate, endDate]);

  const handleExport = useCallback(
    (data, mode) => {
      exportToExcel(data, mode, filterLabel);
    },
    [filterLabel],
  );

  const handleExportCurrentTab = () => {
    let filteredData = [];
    if (activeTab === "all" && allTabRef.current)
      filteredData = allTabRef.current.getFilteredData();
    else if (activeTab === "mr" && mrTabRef.current)
      filteredData = mrTabRef.current.getFilteredData();
    else if (activeTab === "sample" && sampleTabRef.current)
      filteredData = sampleTabRef.current.getFilteredData();
    handleExport(filteredData, activeTab);
  };

  const currentTab = TABS.find((t) => t.key === activeTab);

  return (
    <div className="p-6 space-y-6 min-h-screen bg-gray-50">
      <CustomRangeModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onApply={handleCustomApply}
        initialStart={startDate}
        initialEnd={endDate}
      />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Viewing:{" "}
            <span className="font-semibold text-indigo-600">{filterLabel}</span>
          </p>
        </div>
      </div>

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
      />

      {/* Tabs + Search + Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? "bg-indigo-600 text-white shadow"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={currentTab?.placeholder || "Search..."}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64"
            />
          </div>
          <button
            onClick={handleExportCurrentTab}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 -mt-2">{currentTab?.desc}</p>

      {activeTab === "all" && (
        <AllTab
          ref={allTabRef}
          data={allData}
          loading={loading}
          search={search}
          onExport={handleExport}
        />
      )}
      {activeTab === "mr" && (
        <MRWiseTab
          ref={mrTabRef}
          data={mrData}
          loading={loading}
          search={search}
          onExport={handleExport}
        />
      )}
      {activeTab === "sample" && (
        <SampleWiseTab
          ref={sampleTabRef}
          data={sampleData}
          loading={loading}
          search={search}
          onExport={handleExport}
        />
      )}
    </div>
  );
};

export default ProductSalesReport;