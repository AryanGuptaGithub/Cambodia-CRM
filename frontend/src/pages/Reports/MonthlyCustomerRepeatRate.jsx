import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  Repeat,
  BarChart3,
  Target,
  Calendar,
  UserCheck,
  UserPlus,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function capitalizeWords(str) {
  if (!str) return "—";
  return str
    .toString()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
}
const getCurrentMonthLabel = () => {
  const n = new Date();
  return `${n.toLocaleString("default", { month: "long" })} ${n.getFullYear()}`;
};
const getJanToPrevMonthLabel = () => {
  const n = new Date();
  const yr = n.getFullYear();
  const mo = n.getMonth();
  if (mo === 0) return `Jan – Dec ${yr - 1}`;
  return `Jan – ${new Date(yr, mo, 0).toLocaleString("default", { month: "long" })} ${yr}`;
};

// ─── CUSTOMER DETAIL MODAL ───────────────────────────────────────────────────
// mrName=null → all MRs | mrName="Mr X" → that MR only
// filterType="all" | "retained"
const CustomerDetailModal = ({
  isOpen,
  onClose,
  period,
  customStartDate,
  customEndDate,
  filterType,
  mrName,
  title,
}) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm("");
    setExpandedIdx(null);
    (async () => {
      setLoading(true);
      try {
        const params = { period, filterType };
        if (period === "custom") {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        }
        if (mrName) params.mrName = mrName; // key fix: pass mrName to backend
        const res = await axios.get(
          `${backendUrl}/api/reports/customer-retention/customer-details`,
          { params },
        );
        setCustomers(res.data?.data || []);
      } catch {
        showToast("error", "Failed to load customer details");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, period, customStartDate, customEndDate, filterType, mrName]);

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return customers;
    const q = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        c.customerName?.toLowerCase().includes(q) ||
        c.customerCode?.toLowerCase().includes(q) ||
        c.mrName?.toLowerCase().includes(q),
    );
  }, [customers, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-gray-800">{title}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {loading
                  ? "Loading..."
                  : `${filtered.length} customer${filtered.length !== 1 ? "s" : ""} found`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer name, code, or MR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              <span className="ml-3 text-gray-500">Loading customers...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              No customers found
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th className="p-3 text-left text-gray-600 font-semibold w-10">
                    Sr.
                  </th>
                  <th className="p-3 text-left text-gray-600 font-semibold">
                    Customer Name
                  </th>
                  <th className="p-3 text-left text-gray-600 font-semibold">
                    Code
                  </th>
                  <th className="p-3 text-left text-gray-600 font-semibold">
                    MR Name
                  </th>
                  <th className="p-3 text-center text-gray-600 font-semibold">
                    Orders
                  </th>
                  <th className="p-3 text-center text-gray-600 font-semibold">
                    Status
                  </th>
                  <th className="p-3 text-left text-gray-600 font-semibold">
                    First Purchase
                  </th>
                  <th className="p-3 text-left text-gray-600 font-semibold">
                    Last Purchase
                  </th>
                  <th className="p-3 text-center text-gray-600 font-semibold">
                    Invoices
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <React.Fragment key={c.customerCode || idx}>
                    <tr
                      className={`border-b border-gray-100 hover:bg-gray-50 transition ${expandedIdx === idx ? "bg-indigo-50/40" : ""}`}
                    >
                      <td className="p-3 text-gray-500">{idx + 1}</td>
                      <td className="p-3 font-medium text-gray-900">
                        {capitalizeWords(c.customerName)}
                      </td>
                      <td className="p-3 text-gray-600 text-xs">
                        {c.customerCode || "—"}
                      </td>
                      <td className="p-3 text-gray-600 text-xs">
                        {capitalizeWords(c.mrName)}
                      </td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-indigo-50 text-indigo-700 font-bold rounded-full text-sm">
                          {c.totalOrders}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {c.isRetained ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                            <UserCheck size={11} /> Retained
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
                            <UserPlus size={11} /> New
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-gray-600 text-xs">
                        {formatDate(c.firstPurchaseDate)}
                      </td>
                      <td className="p-3 text-gray-600 text-xs">
                        {formatDate(c.lastPurchaseDate)}
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() =>
                            setExpandedIdx(expandedIdx === idx ? null : idx)
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition"
                        >
                          <ShoppingBag size={12} />
                          {c.invoices?.length || 0}
                          {expandedIdx === idx ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                      </td>
                    </tr>
                    {expandedIdx === idx && c.invoices?.length > 0 && (
                      <tr>
                        <td colSpan={9} className="bg-indigo-50/30 px-6 py-3">
                          <div className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                            <ShoppingBag size={12} /> Invoice History —{" "}
                            {capitalizeWords(c.customerName)}
                          </div>
                          <div className="flex flex-col gap-1">
                            {c.invoices.map((inv, iIdx) => (
                              <div
                                key={iIdx}
                                className="flex items-center gap-4 bg-white rounded-lg px-3 py-2 border border-indigo-100 text-xs text-gray-700"
                              >
                                <span className="font-semibold text-indigo-600 min-w-[80px]">
                                  #{inv.invoiceNumber}
                                </span>
                                <span className="text-gray-500">
                                  {formatDate(inv.invoiceDate)}
                                </span>
                                <span className="font-medium">
                                  ${(inv.totalAmount || 0).toLocaleString()}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full font-semibold ${
                                    inv.paymentStatus === "Paid" ||
                                    inv.paymentStatus === "Cash"
                                      ? "bg-green-100 text-green-700"
                                      : inv.paymentStatus === "Partial Paid"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-red-100 text-red-700"
                                  }`}
                                >
                                  {inv.paymentStatus}
                                </span>
                                <span className="text-gray-400">
                                  {inv.saleType}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const MonthlyCustomerRepeatRate = () => {
  const emptyData = {
    summary: {
      totalCustomers: 0,
      retainedCustomers: 0,
      retentionRate: 0,
      newCustomers: 0,
    },
    records: [],
  };
  const [data, setData] = useState(emptyData);
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
  const [period, setPeriod] = useState("last_month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  // mrName=null means "all MRs" (summary card click); mrName=string means specific row click
  const [modal, setModal] = useState({
    open: false,
    filterType: "all",
    mrName: null,
    title: "",
  });

  const inputRef = useRef(null);
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const fetchData = useCallback(
    async (page = 1, search = searchTerm) => {
      if (period === "custom" && (!customStartDate || !customEndDate)) {
        setData(emptyData);
        return;
      }
      setLoading(true);
      try {
        const params = { page, limit: itemsPerPage, period };
        if (period === "custom") {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        }
        if (search.trim()) params.search = search.trim();
        const res = await axios.get(
          `${backendUrl}/api/reports/customer-retention/monthly`,
          { params },
        );
        const raw = res.data?.data || emptyData;
        setData({
          summary: raw.summary || emptyData.summary,
          records: Array.isArray(raw.records) ? raw.records : [],
        });
        setPagination(
          res.data?.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 0,
            hasNext: false,
            hasPrev: false,
          },
        );
      } catch {
        showToast("error", "Failed to fetch data");
        setData(emptyData);
      } finally {
        setLoading(false);
      }
    },
    [period, customStartDate, customEndDate, searchTerm],
  );

  useEffect(() => {
    fetchData(1);
  }, []);
  useEffect(() => {
    if (period !== "custom") fetchData(1);
  }, [period]);
  useEffect(() => {
    if (period === "custom" && customStartDate && customEndDate) fetchData(1);
  }, [customStartDate, customEndDate]);
  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchData(page);
  };
  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p === "custom") setShowCustomPicker(true);
    else {
      setShowCustomPicker(false);
      setCustomStartDate("");
      setCustomEndDate("");
    }
  };

  // openModal(filterType, mrName, title)
  // mrName=null → all MRs, mrName=string → specific MR row
  const openModal = (filterType, mrName, title) =>
    setModal({ open: true, filterType, mrName: mrName ?? null, title });

  const exportToExcel = async () => {
    if (!data.records?.length) {
      showToast("warning", "No records to export");
      return;
    }
    setExporting(true);
    try {
      const params = { period };
      if (period === "custom") {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
      }
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const res = await axios.get(
        `${backendUrl}/api/reports/customer-retention/monthly/export`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute(
        "download",
        `Monthly_Repeat_Rate_${period}_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel downloaded!");
    } catch {
      showToast("error", "Failed to download Excel");
    } finally {
      setExporting(false);
    }
  };

  const filteredRecords = useMemo(() => {
    const records = data.records || [];
    if (!searchTerm.trim()) return records;
    const q = searchTerm.toLowerCase();
    return records.filter((r) => r.mrName?.toLowerCase().includes(q));
  }, [data.records, searchTerm]);

  const summary = data.summary || emptyData.summary;

  return (
    <>
      <CustomerDetailModal
        isOpen={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        period={period}
        customStartDate={customStartDate}
        customEndDate={customEndDate}
        filterType={modal.filterType}
        mrName={modal.mrName}
        title={modal.title}
      />

      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-800">
            Monthly Customer Repeat Rate – MR Summary
          </h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by MR name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && fetchData(1)}
                className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    fetchData(1, "");
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={exportToExcel}
              disabled={exporting || !data.records?.length}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md ${exporting || !data.records?.length ? "bg-gray-400 text-white cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"}`}
            >
              <Download size={18} />
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>

        {/* Period Tabs */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {[
            { id: "today", label: "Today" },
            { id: "all", label: "All Records" },
            { id: "month", label: `Current Month (${getCurrentMonthLabel()})` },
            { id: "jan_feb", label: getJanToPrevMonthLabel() },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handlePeriodChange(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition text-sm ${period === tab.id ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => handlePeriodChange("custom")}
            className={`px-4 py-2 rounded-lg font-medium transition text-sm flex items-center gap-2 ${period === "custom" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            <Calendar size={16} /> Custom Filter
          </button>
        </div>

        {showCustomPicker && (
          <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            <button
              onClick={() => {
                if (!customStartDate || !customEndDate) {
                  showToast("warning", "Please select both dates");
                  return;
                }
                if (customStartDate > customEndDate) {
                  showToast("warning", "Start date cannot be after end date");
                  return;
                }
                fetchData(1);
              }}
              className="mt-5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm cursor-pointer"
            >
              Apply
            </button>
            <button
              onClick={() => {
                setCustomStartDate("");
                setCustomEndDate("");
                setPeriod("all");
                setShowCustomPicker(false);
              }}
              className="mt-5 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <button
            onClick={() => openModal("all", null, "All Customers")}
            className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 text-left hover:shadow-lg hover:scale-[1.02] transition-all group cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600 group-hover:text-green-700 transition">
                  Total Customers
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    summary.totalCustomers
                  )}
                </div>
                <div className="text-xs text-green-600 mt-1 opacity-0 group-hover:opacity-100 transition">
                  Click to view all →
                </div>
              </div>
              <Users className="w-8 h-8 text-green-500" />
            </div>
          </button>

          <button
            onClick={() =>
              openModal("retained", null, "Retained Customers (2+ Orders)")
            }
            className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 text-left hover:shadow-lg hover:scale-[1.02] transition-all group cursor-pointer"
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600 group-hover:text-blue-700 transition">
                  Retained Customers
                </div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    summary.retainedCustomers
                  )}
                </div>
                <div className="text-xs text-blue-600 mt-1 opacity-0 group-hover:opacity-100 transition">
                  Click to view retained →
                </div>
              </div>
              <Repeat className="w-8 h-8 text-blue-500" />
            </div>
          </button>

          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">Retention Rate</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    `${summary.retentionRate?.toFixed(2) || 0}%`
                  )}
                </div>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-500" />
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">New Customers</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    summary.newCustomers
                  )}
                </div>
              </div>
              <Target className="w-8 h-8 text-orange-500" />
            </div>
          </div>
        </div>

        {/* MR Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 text-sm font-medium">Sr.No</th>
                <th className="p-3 text-sm font-medium text-left">MR Name</th>
                <th className="p-3 text-sm font-medium">
                  Total Customers
                  <div className="text-xs text-gray-400 font-normal leading-tight">
                    click badge to view
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">
                  Retained Customers
                  <div className="text-xs text-gray-400 font-normal leading-tight">
                    click badge to view
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Retention Rate (%)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                      <span className="text-gray-500">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((mr, index) => (
                  <tr
                    key={mr._id || index}
                    className={`hover:bg-gray-50 ${index < filteredRecords.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <td className="p-3 text-sm text-gray-600 font-medium">
                      {index + 1}
                    </td>
                    <td className="p-3 text-sm font-medium text-gray-900 capitalize text-left">
                      {mr.mrName || "—"}
                    </td>

                    {/* Clickable Total Customers badge → opens modal for this MR, all customers */}
                    <td className="p-3">
                      <button
                        onClick={() =>
                          openModal(
                            "all",
                            mr.mrName,
                            `${mr.mrName || "MR"} — All Customers`,
                          )
                        }
                        title={`View all customers for ${mr.mrName}`}
                        className="inline-flex items-center justify-center min-w-[36px] h-8 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-full px-3 hover:bg-indigo-200 hover:scale-110 transition-all cursor-pointer ring-1 ring-indigo-200"
                      >
                        {mr.totalCustomers || 0}
                      </button>
                    </td>

                    {/* Clickable Retained Customers badge → opens modal for this MR, retained only */}
                    <td className="p-3">
                      <button
                        onClick={() =>
                          openModal(
                            "retained",
                            mr.mrName,
                            `${mr.mrName || "MR"} — Retained Customers`,
                          )
                        }
                        title={`View retained customers for ${mr.mrName}`}
                        className="inline-flex items-center justify-center min-w-[36px] h-8 bg-green-50 text-green-700 font-bold text-sm rounded-full px-3 hover:bg-green-200 hover:scale-110 transition-all cursor-pointer ring-1 ring-green-200"
                      >
                        {mr.retainedCustomers || 0}
                      </button>
                    </td>

                    <td className="p-3 text-sm font-semibold text-gray-800">
                      {mr.retentionRate?.toFixed(2) ?? 0}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-gray-400">
                    {period === "custom" && (!customStartDate || !customEndDate)
                      ? "Please select start and end dates"
                      : "No MR data found for selected filter"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && filteredRecords.length > 0 && (
          <div className="flex items-center justify-start gap-2 mt-6">
            <button
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.hasPrev}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <div className="flex gap-1">
              {visiblePages.map((page, i) => (
                <button
                  key={i}
                  onClick={() =>
                    typeof page === "number" && handlePageChange(page)
                  }
                  disabled={typeof page !== "number"}
                  className={`min-w-[40px] px-3 py-2 rounded-lg ${page === pagination.currentPage ? "bg-indigo-600 text-white" : typeof page === "number" ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-transparent text-gray-500 cursor-default"}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.hasNext}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default MonthlyCustomerRepeatRate;
