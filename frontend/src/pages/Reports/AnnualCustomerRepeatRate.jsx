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
  BarChart3,
  Calendar,
  UserCheck,
  UserPlus,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

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
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate().toString().padStart(2, "0")} ${d.toLocaleString("default", { month: "short" })} ${d.getFullYear()}`;
}

const getCurrentYearLabel = () => `${new Date().getFullYear()}`;
const getPrevYearLabel = () => `${new Date().getFullYear() - 1}`;

// ─── CUSTOMER DETAIL MODAL (Responsive) ──────────────────────────────────────
const CustomerDetailModal = ({
  isOpen,
  onClose,
  period,
  customStartDate,
  customEndDate,
  filterType,
  mrName,
  title,
  isMobileView,
}) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setSearchTerm("");
    setExpandedIdx(null);
    const fetchCustomers = async () => {
      setLoading(true);
      try {
        const params = { period, filterType };
        if (period === "custom") {
          params.startDate = customStartDate;
          params.endDate = customEndDate;
        }
        if (mrName) params.mrName = mrName;
        const res = await axios.get(
          `${backendUrl}/api/reports/customer-retention/customer-details`,
          { params },
        );
        setCustomers(res.data?.data || []);
      } catch (error) {
        console.error("Error fetching customers:", error);
        showToast("error", "Failed to load customer details");
      } finally {
        setLoading(false);
      }
    };
    fetchCustomers();
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

  const tdClass = isMobileView ? "p-2 text-xs" : "p-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-200">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ArrowLeft
                size={isMobileView ? 16 : 18}
                className="text-gray-600"
              />
            </button>
            <div>
              <h2
                className={`${isMobileView ? "text-base" : "text-lg"} font-bold text-gray-800`}
              >
                {title}
              </h2>
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
            <X size={isMobileView ? 16 : 18} className="text-gray-500" />
          </button>
        </div>

        <div className="p-3 md:p-4 border-b border-gray-100">
          <div className="relative">
            <input
              type="text"
              placeholder="Search customer name, code, or MR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 md:pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isMobileView ? "text-xs" : "text-sm"}`}
            />
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 ${isMobileView ? "w-3.5 h-3.5" : "w-4 h-4"}`}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={isMobileView ? 12 : 14} />
              </button>
            )}
          </div>
        </div>

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
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr className="border-b border-gray-200">
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold w-10`}
                    >
                      Sr.
                    </th>
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold`}
                    >
                      Customer Name
                    </th>
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold`}
                    >
                      Code
                    </th>
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold`}
                    >
                      MR Name
                    </th>
                    <th
                      className={`${tdClass} text-center text-gray-600 font-semibold`}
                    >
                      Orders
                    </th>
                    <th
                      className={`${tdClass} text-center text-gray-600 font-semibold`}
                    >
                      Type
                    </th>
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold`}
                    >
                      First Purchase
                    </th>
                    <th
                      className={`${tdClass} text-left text-gray-600 font-semibold`}
                    >
                      Last Purchase
                    </th>
                    <th
                      className={`${tdClass} text-center text-gray-600 font-semibold`}
                    >
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
                        <td className={tdClass}>{idx + 1}</td>
                        <td className={`${tdClass} font-medium text-gray-900`}>
                          {capitalizeWords(c.customerName)}
                        </td>
                        <td
                          className={`${tdClass} text-gray-600 ${isMobileView ? "text-[10px]" : "text-xs"}`}
                        >
                          {c.customerCode || "—"}
                        </td>
                        <td
                          className={`${tdClass} text-gray-600 ${isMobileView ? "text-[10px]" : "text-xs"}`}
                        >
                          {capitalizeWords(c.mrName)}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          <span className="inline-flex items-center justify-center w-7 h-7 md:w-8 md:h-8 bg-indigo-50 text-indigo-700 font-bold rounded-full text-xs">
                            {c.totalOrders}
                          </span>
                        </td>
                        <td className={`${tdClass} text-center`}>
                          {c.isRetained ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              <UserPlus size={10} /> New
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                              <UserCheck size={10} /> Existing
                            </span>
                          )}
                        </td>
                        <td
                          className={`${tdClass} text-gray-600 ${isMobileView ? "text-[10px]" : "text-xs"}`}
                        >
                          {formatDate(
                            c.absoluteFirstPurchase || c.firstPurchaseDate,
                          )}
                        </td>
                        <td
                          className={`${tdClass} text-gray-600 ${isMobileView ? "text-[10px]" : "text-xs"}`}
                        >
                          {formatDate(c.lastPurchaseDate)}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          <button
                            onClick={() =>
                              setExpandedIdx(expandedIdx === idx ? null : idx)
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs transition"
                          >
                            <ShoppingBag size={isMobileView ? 10 : 12} />
                            {c.invoices?.length || 0}
                            {expandedIdx === idx ? (
                              <ChevronUp size={isMobileView ? 10 : 12} />
                            ) : (
                              <ChevronDown size={isMobileView ? 10 : 12} />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedIdx === idx && c.invoices?.length > 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="bg-indigo-50/30 px-4 md:px-6 py-2 md:py-3"
                          >
                            <div className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                              <ShoppingBag size={12} /> Invoice History —{" "}
                              {capitalizeWords(c.customerName)}
                            </div>
                            <div className="flex flex-col gap-1">
                              {c.invoices.map((inv, iIdx) => (
                                <div
                                  key={iIdx}
                                  className="flex flex-wrap items-center gap-2 md:gap-3 bg-white rounded-lg px-2 md:px-3 py-1.5 md:py-2 border border-indigo-100 text-xs text-gray-700"
                                >
                                  <span className="font-semibold text-indigo-600 min-w-[70px] md:min-w-[80px]">
                                    #{inv.invoiceNumber}
                                  </span>
                                  <span className="text-gray-500">
                                    {formatDate(inv.invoiceDate)}
                                  </span>
                                  <span className="font-medium">
                                    ৳{(inv.totalAmount || 0).toLocaleString()}
                                  </span>
                                  <span
                                    className={`px-1.5 md:px-2 py-0.5 rounded-full text-[10px] md:text-xs font-semibold ${
                                      inv.paymentStatus === "Paid"
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {inv.paymentStatus}
                                  </span>
                                  <span className="text-gray-400 text-[10px] md:text-xs">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
const AnnualCustomerRepeatRate = () => {
  const emptyData = {
    summary: {
      totalCustomers: 0,
      retainedCustomers: 0,
      retentionRate: 0,
      newCustomers: 0,
      existingCustomers: 0,
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

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Default = current month (for annual view, use current month as starting point)
  const [period, setPeriod] = useState("month");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);
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
        if (search && search.trim()) params.search = search.trim();
        const res = await axios.get(
          `${backendUrl}/api/reports/customer-retention/annual`,
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
      } catch (error) {
        console.error("Error fetching data:", error);
        showToast("error", "Failed to fetch annual data");
        setData(emptyData);
      } finally {
        setLoading(false);
      }
    },
    [period, customStartDate, customEndDate, searchTerm],
  );

  useEffect(() => {
    fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (period !== "custom") {
      fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (period === "custom" && customStartDate && customEndDate) {
      fetchData(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate, customEndDate]);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchData(page);
    }
  };

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (p === "custom") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      setCustomStartDate("");
      setCustomEndDate("");
    }
  };

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
        `${backendUrl}/api/reports/customer-retention/annual/export`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute(
        "download",
        `Annual_Repeat_Rate_${period}_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel downloaded!");
    } catch (error) {
      console.error("Export error:", error);
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

  // Responsive table headers
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={`${thClass} text-left`}>MR Name</th>
          <th className={thClass}>
            Total
            {!isMobileView && (
              <div className="text-[9px] text-gray-400">click to view</div>
            )}
          </th>
          <th className={thClass}>
            New
            {!isMobileView && (
              <div className="text-[9px] text-gray-400">click to view</div>
            )}
          </th>
          <th className={thClass}>
            Existing
            {!isMobileView && (
              <div className="text-[9px] text-gray-400">before period</div>
            )}
          </th>
          <th className={thClass}>
            Rate
            {!isMobileView && (
              <div className="text-[9px] text-gray-400">New/Existing%</div>
            )}
          </th>
        </tr>
      </thead>
    );
  };

  // Responsive summary cards
  const renderSummaryCards = () => {
    const cardClass = `bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4`;
    const valueClass = `${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`;
    const labelClass = `${isMobileView ? "text-xs" : "text-sm"} text-gray-600`;

    return (
      <div
        className={`grid gap-4 mb-6 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-6"}`}
      >
        {/* Total Customers */}
        <button
          onClick={() => openModal("all", null, "All Customers in Period")}
          className={`${cardClass} border-green-500 text-left hover:shadow-lg transition-all cursor-pointer`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className={labelClass}>Total Customers</div>
              <div className={valueClass}>
                {loading ? (
                  <div
                    className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                  />
                ) : (
                  summary.totalCustomers?.toLocaleString() || 0
                )}
              </div>
              {!isMobileView && (
                <div className="text-xs text-green-600 mt-0.5 opacity-0 group-hover:opacity-100 transition">
                  Click to view all →
                </div>
              )}
            </div>
            <Users
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
            />
          </div>
        </button>

        {/* New Customers */}
        <button
          onClick={() => openModal("retained", null, "New Customers in Period")}
          className={`${cardClass} border-blue-500 text-left hover:shadow-lg transition-all cursor-pointer`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className={labelClass}>New Customers</div>
              <div className={valueClass}>
                {loading ? (
                  <div
                    className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                  />
                ) : (
                  summary.retainedCustomers?.toLocaleString() || 0
                )}
              </div>
              {!isMobileView && (
                <div className="text-xs text-blue-600 mt-0.5 opacity-0 group-hover:opacity-100 transition">
                  Click to view →
                </div>
              )}
            </div>
            <UserPlus
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
            />
          </div>
        </button>

        {/* Existing Customers */}
        <div className={`${cardClass} border-purple-500`}>
          <div className="flex justify-between items-center">
            <div>
              <div className={labelClass}>Existing Customers</div>
              <div className={valueClass}>
                {loading ? (
                  <div
                    className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                  />
                ) : (
                  (() => {
                    const existing =
                      summary.existingCustomers ??
                      summary.totalCustomers - summary.retainedCustomers;
                    return existing?.toLocaleString() || 0;
                  })()
                )}
              </div>
              {!isMobileView && (
                <div className="text-xs text-gray-400 mt-1">
                  Bought before this period
                </div>
              )}
            </div>
            <UserCheck
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
            />
          </div>
        </div>

        {/* Retention Rate */}
        <div className={`${cardClass} border-orange-500`}>
          <div className="flex justify-between items-center">
            <div>
              <div className={labelClass}>Retention Rate</div>
              <div className={valueClass}>
                {loading ? (
                  <div
                    className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                  />
                ) : (
                  `${summary.retentionRate?.toFixed(2) || 0}%`
                )}
              </div>
              {!isMobileView && (
                <div className="text-xs text-gray-400 mt-1">
                  Existing / Total × 100
                </div>
              )}
            </div>
            <BarChart3
              className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
            />
          </div>
        </div>
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
        isMobileView={isMobileView}
      />

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
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h1 className="text-base font-bold text-gray-800">Annual Rate</h1>
            </div>
            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
              Total Records: {pagination.totalRecords}
            </div>
          </div>
        )}

        {/* ── DESKTOP Header ── */}
        {!isMobileView && (
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-800">
              Annual Customer Repeat Rate – MR Summary
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
        )}

        {/* ── MOBILE Search ── */}
        {isMobileView && (
          <div className="relative mb-4">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search MR name..."
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
                  fetchData(1, "");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Period Tabs - Responsive */}
        <div
          className={`flex flex-wrap gap-2 mb-4 ${isMobileView ? "overflow-x-auto whitespace-nowrap pb-2" : ""}`}
        >
          {[
            { id: "today", label: isMobileView ? "Today" : "Today" },
            { id: "all", label: isMobileView ? "All" : "All Records" },
            { id: "month", label: isMobileView ? "Month" : "This Month" },
            {
              id: "last_year",
              label: isMobileView
                ? `Last Yr`
                : `Last Year (${getPrevYearLabel()})`,
            },
            {
              id: "jan_feb",
              label: isMobileView
                ? `Jan-Now`
                : `Jan – Now (${getCurrentYearLabel()})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handlePeriodChange(tab.id)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition whitespace-nowrap ${period === tab.id ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => handlePeriodChange("custom")}
            className={`flex items-center gap-1 ${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition whitespace-nowrap ${period === "custom" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            <Calendar size={isMobileView ? 12 : 16} /> Custom
          </button>
        </div>

        {/* Custom Date Picker - Responsive */}
        {showCustomPicker && (
          <div
            className={`flex flex-wrap items-center gap-3 mb-6 p-3 bg-gray-50 rounded-lg border border-gray-200 ${isMobileView ? "flex-col items-stretch" : ""}`}
          >
            <div className={isMobileView ? "w-full" : "flex-1"}>
              <label className="block text-xs text-gray-600 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 ${isMobileView ? "text-xs" : "text-sm"}`}
              />
            </div>
            <div className={isMobileView ? "w-full" : "flex-1"}>
              <label className="block text-xs text-gray-600 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 ${isMobileView ? "text-xs" : "text-sm"}`}
              />
            </div>
            <div className="flex gap-2">
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
                className={`flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 ${isMobileView ? "text-xs" : "text-sm"} cursor-pointer`}
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                  setPeriod("month");
                  setShowCustomPicker(false);
                }}
                className={`flex-1 sm:flex-none px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 ${isMobileView ? "text-xs" : "text-sm"} cursor-pointer`}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {renderSummaryCards()}

        {/* MR Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table
            className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[500px]" : ""}`}
          >
            {renderTableHeaders()}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    <div className="flex justify-center items-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                      <span
                        className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                      >
                        Loading...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((mr, index) => (
                  <tr
                    key={mr._id || index}
                    className={`hover:bg-gray-50 ${index < filteredRecords.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <td
                      className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} text-gray-600 font-medium`}
                    >
                      {(pagination.currentPage - 1) * itemsPerPage + index + 1}
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} font-medium text-gray-900 capitalize text-left`}
                    >
                      {mr.mrName || "—"}
                    </td>
                    <td className={isMobileView ? "p-2" : "p-3"}>
                      <button
                        onClick={() =>
                          openModal(
                            "all",
                            mr.mrName,
                            `${mr.mrName || "MR"} — All Customers`,
                          )
                        }
                        className={`inline-flex items-center justify-center min-w-[32px] h-7 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-full px-2 hover:bg-indigo-200 transition-all cursor-pointer ring-1 ring-indigo-200`}
                      >
                        {mr.totalCustomers || 0}
                      </button>
                    </td>
                    <td className={isMobileView ? "p-2" : "p-3"}>
                      <button
                        onClick={() =>
                          openModal(
                            "retained",
                            mr.mrName,
                            `${mr.mrName || "MR"} — New Customers`,
                          )
                        }
                        className={`inline-flex items-center justify-center min-w-[32px] h-7 bg-blue-50 text-blue-700 font-bold text-xs rounded-full px-2 hover:bg-blue-200 transition-all cursor-pointer ring-1 ring-blue-200`}
                      >
                        {mr.retainedCustomers || 0}
                      </button>
                    </td>
                    <td className={isMobileView ? "p-2" : "p-3"}>
                      <span
                        className={`inline-flex items-center justify-center min-w-[32px] h-7 bg-green-50 text-green-700 font-bold text-xs rounded-full px-2 ring-1 ring-green-200`}
                      >
                        {mr.existingCustomers || 0}
                      </span>
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-[11px]" : "p-3 text-sm"} font-semibold text-gray-800`}
                    >
                      {mr.retentionRate?.toFixed(2) ?? 0}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className={`p-8 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-400`}
                  >
                    {period === "custom" && (!customStartDate || !customEndDate)
                      ? "Please select start and end dates"
                      : "No MR data found for selected filter"}
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
    </>
  );
};

export default AnnualCustomerRepeatRate;
