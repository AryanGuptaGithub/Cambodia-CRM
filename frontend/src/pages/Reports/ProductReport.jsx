import React, { useState, useEffect, useMemo, useCallback } from "react";
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
  TrendingDown,
  Package,
} from "lucide-react";
import axios from "axios";
import * as XLSX from "xlsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Axios interceptors ──────────────────────────────────────────────────────
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

// ─── Constants ───────────────────────────────────────────────────────────────
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

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - 2 + i);

const TABS = [
  {
    key: "all",
    label: "All",
    icon: BarChart2,
    desc: "Combined product-wise sales",
  },
  {
    key: "mr",
    label: "MR Wise",
    icon: Users,
    desc: "Sales per Medical Representative",
  },
  {
    key: "sample",
    label: "Sample Wise",
    icon: FlaskConical,
    desc: "Daily doctor sample orders",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

const buildDateParams = (filterMode, year, month, startDate, endDate) => {
  const params = {};
  if (filterMode === "custom") {
    params.period = "custom";
    params.startDate = startDate ? startDate.toISOString().split("T")[0] : "";
    params.endDate = endDate ? endDate.toISOString().split("T")[0] : "";
  } else if (filterMode === "year") {
    params.period = "year";
    params.year = String(year);
  } else {
    // month
    params.period = "month";
    params.year = String(year);
    params.month = String(month + 1); // convert to 1‑based
  }
  return params;
};

// ─── StatCard ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color = "indigo", icon: Icon }) => {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
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

// ─── DateFilterBar ────────────────────────────────────────────────────────────
const DateFilterBar = ({
  filterMode,
  setFilterMode,
  year,
  setYear,
  month,
  setMonth,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  onApply,
  loading,
}) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-3 items-end shadow-sm">
    {/* Mode selector */}
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {[
        { key: "month", label: "Monthly" },
        { key: "year", label: "Yearly" },
        { key: "custom", label: "Custom" },
      ].map((m) => (
        <button
          key={m.key}
          onClick={() => setFilterMode(m.key)}
          className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
            filterMode === m.key
              ? "bg-white text-indigo-700 shadow"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>

    {/* Year picker (always visible) */}
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">Year</label>
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>

    {/* Month picker */}
    {filterMode === "month" && (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500">Month</label>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {MONTHS.map((m, i) => (
            <option key={i} value={i}>
              {m}
            </option>
          ))}
        </select>
      </div>
    )}

    {/* Custom date range */}
    {filterMode === "custom" && (
      <>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">From</label>
          <DatePicker
            selected={startDate}
            onChange={(d) => setStartDate(d)}
            selectsStart
            startDate={startDate}
            endDate={endDate}
            dateFormat="yyyy-MM-dd"
            placeholderText="Start date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">To</label>
          <DatePicker
            selected={endDate}
            onChange={(d) => setEndDate(d)}
            selectsEnd
            startDate={startDate}
            endDate={endDate}
            minDate={startDate}
            dateFormat="yyyy-MM-dd"
            placeholderText="End date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </>
    )}

    <button
      onClick={onApply}
      disabled={loading}
      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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

// ─── AllTab ───────────────────────────────────────────────────────────────────
const AllTab = ({ data, loading, onExport }) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter((r) => r.productName?.toLowerCase().includes(q));
  }, [data, search]);

  const totals = useMemo(
    () => ({
      salesQty: filtered.reduce((s, r) => s + (r.salesQty || 0), 0),
      bonusQty: filtered.reduce((s, r) => s + (r.bonusQty || 0), 0),
      totalQty: filtered.reduce((s, r) => s + (r.totalQty || 0), 0),
      netAmount: filtered.reduce((s, r) => s + (r.netSellingAmount || 0), 0),
      discount: filtered.reduce((s, r) => s + (r.discount || 0), 0),
      profitLoss: filtered.reduce((s, r) => s + (r.profitLoss || 0), 0),
    }),
    [filtered],
  );

  if (loading) return <TableSkeleton cols={8} />;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <StatCard
          label="Profit / Loss"
          value={`$${fmt(totals.profitLoss)}`}
          color={totals.profitLoss >= 0 ? "green" : "rose"}
          icon={totals.profitLoss >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={14}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64"
          />
        </div>
        <button
          onClick={() => onExport(filtered, "all")}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Download size={14} /> Export
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm bg-white">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                "#",
                "Product Name",
                "Sales Qty",
                "Bonus Qty",
                "Total Qty",
                "Selling Price",
                "Discount",
                "Net Amount",
                "Profit/Loss",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-12 text-center text-gray-400"
                >
                  No sales data found for the selected period.
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-gray-100 hover:bg-indigo-50/40 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {row.productName}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fmtInt(row.salesQty)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {fmtInt(row.bonusQty)}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold">
                    {fmtInt(row.totalQty)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ${fmt(row.sellingPrice)}
                  </td>
                  <td className="px-4 py-3 text-right text-rose-600">
                    ${fmt(row.discount)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700 font-semibold">
                    ${fmt(row.netSellingAmount)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold ${row.profitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
                  >
                    ${fmt(row.profitLoss)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-gray-50 border-t-2 border-gray-300">
              <tr>
                <td colSpan={2} className="px-4 py-3 font-bold text-gray-700">
                  Total
                </td>
                <td className="px-4 py-3 text-center font-bold">
                  {fmtInt(totals.salesQty)}
                </td>
                <td className="px-4 py-3 text-center font-bold">
                  {fmtInt(totals.bonusQty)}
                </td>
                <td className="px-4 py-3 text-center font-bold">
                  {fmtInt(totals.totalQty)}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-bold text-rose-600">
                  ${fmt(totals.discount)}
                </td>
                <td className="px-4 py-3 text-right font-bold text-green-700">
                  ${fmt(totals.netAmount)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-bold ${totals.profitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
                >
                  ${fmt(totals.profitLoss)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

// ─── MRWiseTab ────────────────────────────────────────────────────────────────
const MRWiseTab = ({ data, loading, onExport }) => {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggle = (mrName) =>
    setExpanded((prev) => ({ ...prev, [mrName]: !prev[mrName] }));

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data
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

  const totals = useMemo(
    () => ({
      salesQty: filtered.reduce((s, mr) => s + (mr.totalSalesQty || 0), 0),
      netAmount: filtered.reduce((s, mr) => s + (mr.totalNetAmount || 0), 0),
      profitLoss: filtered.reduce((s, mr) => s + (mr.totalProfitLoss || 0), 0),
    }),
    [filtered],
  );

  if (loading) return <TableSkeleton cols={6} />;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="MRs"
          value={fmtInt(filtered.length)}
          icon={Users}
          color="indigo"
        />
        <StatCard
          label="Total Sales Qty"
          value={fmtInt(totals.salesQty)}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Net Amount"
          value={`$${fmt(totals.netAmount)}`}
          color="purple"
        />
        <StatCard
          label="Profit / Loss"
          value={`$${fmt(totals.profitLoss)}`}
          color={totals.profitLoss >= 0 ? "green" : "rose"}
          icon={totals.profitLoss >= 0 ? TrendingUp : TrendingDown}
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={14}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search MR or product..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-64"
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
          <button
            onClick={() => onExport(filtered, "mr")}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium ml-2"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* MR rows */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-12 text-center text-gray-400 bg-white">
            No MR sales data found for the selected period.
          </div>
        ) : (
          filtered.map((mr) => (
            <div
              key={mr.mrName}
              className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
            >
              {/* MR header row */}
              <button
                onClick={() => toggle(mr.mrName)}
                className="w-full flex items-center justify-between px-5 py-4 bg-indigo-50 hover:bg-indigo-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                    {mr.mrName?.[0]?.toUpperCase() || "M"}
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">
                      {mr.mrName || "Unknown MR"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mr.products?.length || 0} product(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-600">
                    Sales Qty: <strong>{fmtInt(mr.totalSalesQty)}</strong>
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

              {/* Expanded product table */}
              {expanded[mr.mrName] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {[
                          "#",
                          "Product Name",
                          "Sales Qty",
                          "Bonus Qty",
                          "Total Qty",
                          "Selling Price",
                          "Discount",
                          "Net Amount",
                          "Profit/Loss",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(mr.products || []).map((p, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-100 hover:bg-indigo-50/30"
                        >
                          <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {p.productName}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {fmtInt(p.salesQty)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {fmtInt(p.bonusQty)}
                          </td>
                          <td className="px-4 py-2.5 text-center font-semibold">
                            {fmtInt(p.totalQty)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            ${fmt(p.sellingPrice)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-rose-600">
                            ${fmt(p.discount)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-700 font-semibold">
                            ${fmt(p.netSellingAmount)}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold ${p.profitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
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
                        <td className="px-4 py-2.5 text-center font-bold">
                          {fmtInt(mr.totalBonusQty)}
                        </td>
                        <td className="px-4 py-2.5 text-center font-bold">
                          {fmtInt(mr.totalQty)}
                        </td>
                        <td className="px-4 py-2.5" />
                        <td className="px-4 py-2.5 text-right font-bold text-rose-600">
                          ${fmt(mr.totalDiscount)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-green-700">
                          ${fmt(mr.totalNetAmount)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-bold ${mr.totalProfitLoss >= 0 ? "text-green-700" : "text-red-600"}`}
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
    </div>
  );
};

// ─── SampleWiseTab ────────────────────────────────────────────────────────────
const SampleWiseTab = ({ data, loading, onExport }) => {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});

  const toggle = (date) =>
    setExpanded((prev) => ({ ...prev, [date]: !prev[date] }));

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data
      .filter(
        (day) =>
          day.date?.toLowerCase().includes(q) ||
          day.entries?.some(
            (e) =>
              e.doctorName?.toLowerCase().includes(q) ||
              e.productName?.toLowerCase().includes(q),
          ),
      )
      .map((day) => ({
        ...day,
        entries: day.entries?.filter(
          (e) =>
            e.doctorName?.toLowerCase().includes(q) ||
            e.productName?.toLowerCase().includes(q),
        ),
      }));
  }, [data, search]);

  const totals = useMemo(
    () => ({
      samples: filtered.reduce((s, d) => s + (d.totalSamples || 0), 0),
      withSale: filtered.reduce((s, d) => s + (d.withSale || 0), 0),
      withoutSale: filtered.reduce((s, d) => s + (d.withoutSale || 0), 0),
    }),
    [filtered],
  );

  if (loading) return <TableSkeleton cols={6} />;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Total Samples"
          value={fmtInt(totals.samples)}
          icon={FlaskConical}
          color="indigo"
        />
        <StatCard
          label="With Sale"
          value={fmtInt(totals.withSale)}
          icon={TrendingUp}
          color="green"
          sub={
            totals.samples
              ? `${((totals.withSale / totals.samples) * 100).toFixed(1)}% conversion`
              : undefined
          }
        />
        <StatCard
          label="Without Sale"
          value={fmtInt(totals.withoutSale)}
          icon={TrendingDown}
          color="rose"
          sub={
            totals.samples
              ? `${((totals.withoutSale / totals.samples) * 100).toFixed(1)}% no order`
              : undefined
          }
        />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={14}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search date, doctor or product..."
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 w-72"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() =>
              setExpanded(
                Object.fromEntries(filtered.map((d) => [d.date, true])),
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
          <button
            onClick={() => onExport(filtered, "sample")}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium ml-2"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Day rows */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-12 text-center text-gray-400 bg-white">
            No sample data found for the selected period.
          </div>
        ) : (
          filtered.map((day) => (
            <div
              key={day.date}
              className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
            >
              {/* Day header */}
              <button
                onClick={() => toggle(day.date)}
                className="w-full flex items-center justify-between px-5 py-4 bg-purple-50 hover:bg-purple-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-purple-600" />
                  <div className="text-left">
                    <p className="font-semibold text-gray-800">
                      {formatDate(day.date)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {day.entries?.length || 0} sample record(s)
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-gray-600">
                    Samples: <strong>{fmtInt(day.totalSamples)}</strong>
                  </span>
                  <span className="text-green-700">
                    With Sale: <strong>{fmtInt(day.withSale)}</strong>
                  </span>
                  <span className="text-red-600">
                    No Sale: <strong>{fmtInt(day.withoutSale)}</strong>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${expanded[day.date] ? "rotate-180" : ""}`}
                  />
                </div>
              </button>

              {/* Expanded entries */}
              {expanded[day.date] && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm bg-white">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {[
                          "#",
                          "Doctor Name",
                          "Product Name",
                          "Qty Given",
                          "Customer",
                          "Sale Linked",
                          "Sale Amount",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(day.entries || []).map((e, i) => (
                        <tr
                          key={i}
                          className="border-b border-gray-100 hover:bg-purple-50/30"
                        >
                          <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-800">
                            {e.doctorName || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700">
                            {e.productName || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {fmtInt(e.qtyGiven)}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">
                            {e.customerName || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {e.hasSale ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                ✓ Yes
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                                ✗ No
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right text-green-700 font-semibold">
                            {e.hasSale ? `$${fmt(e.saleAmount)}` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─── Skeleton ──────────────────────────────────────────────────────────────────
const TableSkeleton = ({ cols = 6 }) => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="h-10 bg-gray-100 animate-pulse" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="h-12 border-t border-gray-100 bg-white animate-pulse"
        />
      ))}
    </div>
  </div>
);

// ─── Export helpers ───────────────────────────────────────────────────────────
const exportToExcel = (data, mode, filterLabel) => {
  let rows = [];
  const title = `Sales Report — ${filterLabel}`;

  if (mode === "all") {
    rows = [
      [title],
      [],
      [
        "#",
        "Product Name",
        "Sales Qty",
        "Bonus Qty",
        "Total Qty",
        "Selling Price (USD)",
        "Discount (USD)",
        "Net Amount (USD)",
        "Profit/Loss (USD)",
      ],
      ...data.map((r, i) => [
        i + 1,
        r.productName,
        r.salesQty,
        r.bonusQty,
        r.totalQty,
        r.sellingPrice,
        r.discount,
        r.netSellingAmount,
        r.profitLoss,
      ]),
    ];
  } else if (mode === "mr") {
    rows = [[title], []];
    data.forEach((mr) => {
      rows.push([
        `MR: ${mr.mrName}`,
        "",
        "",
        "",
        "",
        "",
        "",
        "Net: " + mr.totalNetAmount,
        "P/L: " + mr.totalProfitLoss,
      ]);
      rows.push([
        "#",
        "Product Name",
        "Sales Qty",
        "Bonus Qty",
        "Total Qty",
        "Selling Price",
        "Discount",
        "Net Amount",
        "Profit/Loss",
      ]);
      (mr.products || []).forEach((p, i) => {
        rows.push([
          i + 1,
          p.productName,
          p.salesQty,
          p.bonusQty,
          p.totalQty,
          p.sellingPrice,
          p.discount,
          p.netSellingAmount,
          p.profitLoss,
        ]);
      });
      rows.push([]);
    });
  } else if (mode === "sample") {
    rows = [[title], []];
    data.forEach((day) => {
      rows.push([
        `Date: ${formatDate(day.date)}`,
        "",
        "",
        `Samples: ${day.totalSamples}`,
        `With Sale: ${day.withSale}`,
        `No Sale: ${day.withoutSale}`,
      ]);
      rows.push([
        "#",
        "Doctor Name",
        "Product Name",
        "Qty Given",
        "Customer",
        "Sale Linked",
        "Sale Amount",
      ]);
      (day.entries || []).forEach((e, i) => {
        rows.push([
          i + 1,
          e.doctorName,
          e.productName,
          e.qtyGiven,
          e.customerName,
          e.hasSale ? "Yes" : "No",
          e.hasSale ? e.saleAmount : "",
        ]);
      });
      rows.push([]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `sales_report_${mode}_${Date.now()}.xlsx`);
};

// ─── Main Component ───────────────────────────────────────────────────────────
const ProductSalesReport = () => {
  const today = new Date();
  const [activeTab, setActiveTab] = useState("all");
  const [filterMode, setFilterMode] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [loading, setLoading] = useState(false);

  // Tab data states
  const [allData, setAllData] = useState([]);
  const [mrData, setMrData] = useState([]);
  const [sampleData, setSampleData] = useState([]);

  const filterLabel = useMemo(() => {
    if (filterMode === "custom") {
      const s = startDate
        ? startDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "?";
      const e = endDate
        ? endDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "?";
      return `${s} – ${e}`;
    }
    if (filterMode === "year") return String(year);
    return `${MONTHS[month]} ${year}`;
  }, [filterMode, year, month, startDate, endDate]);

  const fetchData = useCallback(async () => {
    const params = buildDateParams(filterMode, year, month, startDate, endDate);

    // Validate custom range
    if (filterMode === "custom" && (!params.startDate || !params.endDate)) {
      showToast("warning", "Please select both start and end dates.");
      return;
    }

    setLoading(true);
    try {
      const qs = new URLSearchParams(params).toString();

      // FIX: append query string to ALL three endpoints
      const [allRes, mrRes, sampleRes] = await Promise.allSettled([
        axios.get(`${backendUrl}/api/reports/product-report/all?${qs}`),
        axios.get(`${backendUrl}/api/reports/product-report/mr-wise?${qs}`),
        axios.get(`${backendUrl}/api/reports/product-report/sample-wise?${qs}`),
      ]);

      if (allRes.status === "fulfilled" && allRes.value.data?.success) {
        setAllData(allRes.value.data.data || []);
      } else {
        setAllData([]);
      }

      if (mrRes.status === "fulfilled" && mrRes.value.data?.success) {
        setMrData(mrRes.value.data.data || []);
      } else {
        setMrData([]);
      }

      if (sampleRes.status === "fulfilled" && sampleRes.value.data?.success) {
        setSampleData(sampleRes.value.data.data || []);
      } else {
        setSampleData([]);
      }
    } catch (err) {
      console.error("Error fetching report data:", err);
      showToast("error", "Failed to load report data.");
    } finally {
      setLoading(false);
    }
  }, [filterMode, year, month, startDate, endDate]);

  // Auto-fetch on mount and whenever filter defaults change
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = useCallback(
    (data, mode) => {
      exportToExcel(data, mode, filterLabel);
    },
    [filterLabel],
  );

  return (
    <div className="p-6 space-y-6 min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Viewing:{" "}
            <span className="font-semibold text-indigo-600">{filterLabel}</span>
          </p>
        </div>
      </div>

      {/* Date filter bar */}
      <DateFilterBar
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        onApply={fetchData}
        loading={loading}
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm w-fit">
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

      {/* Tab description */}
      <p className="text-sm text-gray-500 -mt-2">
        {TABS.find((t) => t.key === activeTab)?.desc}
      </p>

      {/* Tab content */}
      {activeTab === "all" && (
        <AllTab data={allData} loading={loading} onExport={handleExport} />
      )}
      {activeTab === "mr" && (
        <MRWiseTab data={mrData} loading={loading} onExport={handleExport} />
      )}
      {activeTab === "sample" && (
        <SampleWiseTab
          data={sampleData}
          loading={loading}
          onExport={handleExport}
        />
      )}
    </div>
  );
};

export default ProductSalesReport;
