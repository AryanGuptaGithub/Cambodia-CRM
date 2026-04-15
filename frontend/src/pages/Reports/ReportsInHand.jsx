import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Warehouse,
  Users,
  Package,
  ChevronLeft,
  ChevronRight,
  Search,
  Box,
  DollarSign,
  RefreshCw,
  X,
  Eye,
  Download,
  CheckCircle,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Menu,
} from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ── Utilities ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n == null
    ? "0"
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const fmtCurrency = (n) =>
  n == null
    ? "$0.00"
    : "$" +
      Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const ROWS_PER_PAGE = 5;
const MODAL_ROWS_PER_PAGE = 6;

const TABS = [
  { key: "all", label: "All Stock", icon: Package },
  { key: "mr", label: "MR Stock", icon: Users },
  { key: "warehouse", label: "Warehouse", icon: Warehouse },
];

// ── Summary Card ──────────────────────────────────────────────────────────────
const SummaryCard = ({
  icon: Icon,
  label,
  value,
  sub,
  color,
  isMobileView,
}) => (
  <div
    className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 md:p-4 flex items-center gap-2 md:gap-3"
    style={{ borderLeft: `4px solid ${color}` }}
  >
    <div
      className="rounded-lg p-2 flex-shrink-0"
      style={{ background: color + "18" }}
    >
      <Icon size={isMobileView ? 16 : 20} style={{ color }} />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">
        {label}
      </div>
      <div
        className={`font-bold text-gray-800 truncate ${isMobileView ? "text-base" : "text-xl"}`}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 truncate">{sub}</div>}
    </div>
  </div>
);

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    "In Stock": "bg-emerald-100 text-emerald-700",
    "Low Stock": "bg-amber-100 text-amber-700",
    Critical: "bg-red-100 text-red-700",
    "Out of Stock": "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${map[status] || map["Out of Stock"]}`}
    >
      {status || "Out of Stock"}
    </span>
  );
};

// ── Pagination ────────────────────────────────────────────────────────────────
const Pagination = ({ current, total, onChange, isMobileView }) => {
  if (total <= 1) return null;

  if (isMobileView) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(current - 1)}
          disabled={current === 1}
          className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-gray-700 font-medium">
          {current} / {total}
        </span>
        <button
          onClick={() => onChange(current + 1)}
          disabled={current === total}
          className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  const pages = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push("…");
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push("…");
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push("…");
    for (let i = current - 1; i <= current + 1; i++) pages.push(i);
    pages.push("…");
    pages.push(total);
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-1 text-gray-400 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[32px] h-8 rounded-md text-sm font-medium transition-colors ${
              p === current
                ? "bg-indigo-600 text-white"
                : "border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className="p-1.5 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

// ── MR Breakdown Modal ────────────────────────────────────────────────────────
const MRBreakdownModal = ({
  isOpen,
  onClose,
  productName,
  mrBreakdown,
  isMobileView,
}) => {
  const [modalPage, setModalPage] = useState(1);
  useEffect(() => {
    setModalPage(1);
  }, [productName]);
  if (!isOpen) return null;

  const totalModalPages = Math.ceil(
    (mrBreakdown?.length || 0) / MODAL_ROWS_PER_PAGE,
  );
  const paginatedMRs = (mrBreakdown || []).slice(
    (modalPage - 1) * MODAL_ROWS_PER_PAGE,
    modalPage * MODAL_ROWS_PER_PAGE,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-gray-900">
              MR Breakdown
            </h3>
            <p className="text-xs md:text-sm text-gray-500 capitalize">
              {productName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-auto px-3 md:px-6 py-3 md:py-4">
          {paginatedMRs.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No MR data available
            </p>
          ) : (
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-2 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                    #
                  </th>
                  <th className="px-2 md:px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">
                    MR Name
                  </th>
                  <th className="px-2 md:px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                    Boxes
                  </th>
                  <th className="px-2 md:px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                    Amount
                  </th>
                  {!isMobileView && (
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase">
                      Assigned
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMRs.map((mr, i) => (
                  <tr key={mr.mrId} className="hover:bg-gray-50">
                    <td className="px-2 md:px-4 py-2.5 text-gray-400 text-xs">
                      {(modalPage - 1) * MODAL_ROWS_PER_PAGE + i + 1}
                    </td>
                    <td className="px-2 md:px-4 py-2.5 font-medium text-gray-800">
                      {mr.mrName}
                    </td>
                    <td className="px-2 md:px-4 py-2.5 text-right font-semibold text-blue-700">
                      {fmt(mr.boxes)}
                    </td>
                    <td className="px-2 md:px-4 py-2.5 text-right text-emerald-700">
                      {fmtCurrency(mr.amount)}
                    </td>
                    {!isMobileView && (
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {fmt(mr.assignedQuantity)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Footer */}
        {totalModalPages > 1 && (
          <div className="flex items-center justify-between px-4 md:px-6 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <span className="text-xs text-gray-500">
              {(modalPage - 1) * MODAL_ROWS_PER_PAGE + 1}–
              {Math.min(
                modalPage * MODAL_ROWS_PER_PAGE,
                mrBreakdown?.length || 0,
              )}{" "}
              of {mrBreakdown?.length || 0}
            </span>
            <Pagination
              current={modalPage}
              total={totalModalPages}
              onChange={setModalPage}
              isMobileView={isMobileView}
            />
          </div>
        )}
      </div>
    </div>
  );
};

// ── Mobile Product Card ───────────────────────────────────────────────────────
const MobileProductCard = ({ product, activeTab, idx, page, onViewMR }) => {
  const srNo = (page - 1) * ROWS_PER_PAGE + idx + 1;

  if (activeTab === "warehouse") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-400 mr-1">#{srNo}</span>
            <span className="font-semibold text-gray-800 text-sm capitalize">
              {product.productName}
            </span>
            {product.supplierName && (
              <div className="text-xs text-gray-400 mt-0.5">
                {product.supplierName}
              </div>
            )}
          </div>
          <StatusBadge status={product.status} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-indigo-50 rounded-lg p-2">
            <div className="text-xs text-gray-500 mb-0.5">Boxes</div>
            <div className="font-bold text-indigo-700 text-sm">
              {fmt(product.warehouseBoxes)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2">
            <div className="text-xs text-gray-500 mb-0.5">LC ($)</div>
            <div className="font-semibold text-gray-700 text-sm">
              {Number(product.lc || 0).toFixed(3)}
            </div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2">
            <div className="text-xs text-gray-500 mb-0.5">Total</div>
            <div className="font-bold text-emerald-700 text-sm">
              {fmtCurrency(product.warehouseAmount)}
            </div>
          </div>
        </div>
        {product.minStockLevel > 0 && (
          <div className="text-xs text-gray-400">
            Min Stock: {product.minStockLevel}
          </div>
        )}
      </div>
    );
  }

  if (activeTab === "mr") {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-400 mr-1">#{srNo}</span>
            <span className="font-semibold text-gray-800 text-sm capitalize">
              {product.productName}
            </span>
            {product.lc > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">
                LC: {fmtCurrency(product.lc)}
              </div>
            )}
          </div>
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex-shrink-0">
            {product.mrBreakdown?.length || 0}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-blue-50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500 mb-0.5">MR Boxes</div>
            <div className="font-bold text-blue-700 text-sm">
              {fmt(product.totalMrBoxes)}
            </div>
          </div>
          <div className="bg-emerald-50 rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500 mb-0.5">MR Amount</div>
            <div className="font-bold text-emerald-700 text-sm">
              {fmtCurrency(product.totalMrAmount)}
            </div>
          </div>
        </div>
        <button
          onClick={() => onViewMR(product)}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
        >
          <Eye size={13} />
          View MR Details
        </button>
      </div>
    );
  }

  // all tab
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-400 mr-1">#{srNo}</span>
          <span className="font-semibold text-gray-800 text-sm capitalize">
            {product.productName}
          </span>
          {product.supplierName && (
            <div className="text-xs text-gray-400 mt-0.5">
              {product.supplierName}
            </div>
          )}
        </div>
        <StatusBadge status={product.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-indigo-50 rounded-lg p-2">
          <div className="text-xs text-gray-500 mb-0.5">WH Boxes</div>
          <div className="font-bold text-indigo-700 text-sm">
            {fmt(product.warehouseBoxes)}
          </div>
          <div className="text-xs text-gray-400">
            {fmtCurrency(product.warehouseAmount)}
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-2">
          <div className="text-xs text-gray-500 mb-0.5">MR Boxes</div>
          <div className="font-bold text-blue-700 text-sm">
            {fmt(product.mrBoxes)}
          </div>
          <div className="text-xs text-gray-400">
            {fmtCurrency(product.mrAmount)}
          </div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2">
          <div className="text-xs text-gray-500 mb-0.5">Total</div>
          <div className="font-bold text-emerald-700 text-sm">
            {fmt(product.totalBoxes)}
          </div>
          <div className="text-xs text-gray-400">
            {fmtCurrency(product.totalAmount)}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
const ReportsInHand = () => {
  const [activeTab, setActiveTab] = useState("warehouse");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mobile state
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Raw API data
  const [allData, setAllData] = useState(null);
  const [mrData, setMrData] = useState(null);

  const inputRef = useRef(null);

  // ── Mobile detection ───────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async (searchVal = "") => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchVal ? `?search=${encodeURIComponent(searchVal)}` : "";
      const [combinedRes, mrRes] = await Promise.all([
        fetch(`${backendUrl}/api/stock-in-hand/combined-stock${qs}`),
        fetch(`${backendUrl}/api/stock-in-hand/mr-stock-summary${qs}`),
      ]);
      if (!combinedRes.ok)
        throw new Error(`Combined stock: ${combinedRes.status}`);
      if (!mrRes.ok) throw new Error(`MR summary: ${mrRes.status}`);
      const [combined, mr] = await Promise.all([
        combinedRes.json(),
        mrRes.json(),
      ]);
      setAllData(combined);
      setMrData(mr);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchData(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, allData, mrData]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const { products } = useMemo(() => {
    if (activeTab === "all") return { products: allData?.products || [] };
    if (activeTab === "mr") return { products: mrData?.products || [] };
    return {
      products: (allData?.products || []).filter((p) => p.warehouseBoxes > 0),
    };
  }, [activeTab, allData, mrData]);

  const statusCounts = useMemo(() => {
    const base = {
      "In Stock": 0,
      "Low Stock": 0,
      Critical: 0,
      "Out of Stock": 0,
    };
    const src =
      activeTab === "mr"
        ? []
        : (allData?.products || []).filter((p) =>
            activeTab === "warehouse" ? p.warehouseBoxes > 0 : true,
          );
    src.forEach((p) => {
      const s = p.status || "Out of Stock";
      if (s in base) base[s]++;
    });
    return base;
  }, [activeTab, allData]);

  const totalPages = Math.ceil(products.length / ROWS_PER_PAGE);
  const pageProducts = products.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  );

  // ── Summary cards ──────────────────────────────────────────────────────────
  const summaryCards = useMemo(() => {
    if (activeTab === "mr") {
      const s = mrData?.summary || {};
      return [
        {
          icon: Users,
          label: "Products w/ MR",
          value: fmt(mrData?.count || 0),
          color: "#6366f1",
        },
        {
          icon: Box,
          label: "Total MR Boxes",
          value: fmt(s.totalMrBoxes),
          color: "#0ea5e9",
        },
        {
          icon: DollarSign,
          label: "Total MR Value",
          value: fmtCurrency(s.totalMrAmount),
          color: "#10b981",
        },
      ];
    }
    if (activeTab === "all") {
      const s = allData?.summary || {};
      return [
        {
          icon: Package,
          label: "Total Products",
          value: fmt(allData?.count || 0),
          color: "#6366f1",
        },
        {
          icon: Box,
          label: "Total Boxes",
          value: fmt(s.totalBoxes),
          sub: `WH: ${fmt(s.totalWarehouseBoxes)} | MR: ${fmt(s.totalMrBoxes)}`,
          color: "#0ea5e9",
        },
        {
          icon: DollarSign,
          label: "Total Value",
          value: fmtCurrency(s.totalAmount),
          sub: `WH: ${fmtCurrency(s.totalWarehouseAmount)}`,
          color: "#10b981",
        },
        {
          icon: Users,
          label: "MR Value",
          value: fmtCurrency(s.totalMrAmount),
          color: "#f59e0b",
        },
      ];
    }
    const s = allData?.summary || {};
    return [
      {
        icon: CheckCircle,
        label: "In Stock",
        value: statusCounts["In Stock"],
        color: "#10b981",
      },
      {
        icon: AlertTriangle,
        label: "Low Stock",
        value: statusCounts["Low Stock"],
        color: "#f59e0b",
      },
      {
        icon: AlertCircle,
        label: "Critical",
        value: statusCounts["Critical"],
        color: "#ef4444",
      },
      {
        icon: XCircle,
        label: "Out of Stock",
        value: statusCounts["Out of Stock"],
        color: "#6b7280",
      },
      {
        icon: Box,
        label: "Total Boxes",
        value: fmt(s.totalWarehouseBoxes),
        color: "#6366f1",
      },
      {
        icon: DollarSign,
        label: "Total Value",
        value: fmtCurrency(s.totalWarehouseAmount),
        color: "#0ea5e9",
      },
    ];
  }, [activeTab, allData, mrData, statusCounts]);

  // ── Summary grid cols ──────────────────────────────────────────────────────
  const summaryGridClass = useMemo(() => {
    if (summaryCards.length === 6) {
      return isMobileView
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6";
    }
    if (summaryCards.length === 4) {
      return isMobileView ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4";
    }
    return isMobileView ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3";
  }, [summaryCards.length, isMobileView]);

  // ── Desktop columns ────────────────────────────────────────────────────────
  const columns = useMemo(() => {
    const srCol = {
      header: "#",
      render: (_, idx) => (
        <span className="text-gray-400 text-xs">
          {(page - 1) * ROWS_PER_PAGE + idx + 1}
        </span>
      ),
      width: "w-10",
    };
    const nameCol = {
      header: "Product Name",
      render: (p) => (
        <div>
          <div className="font-semibold text-gray-800 text-sm capitalize">
            {p.productName}
          </div>
          {p.supplierName && (
            <div className="text-xs text-gray-400">{p.supplierName}</div>
          )}
          {p.lc > 0 && (
            <div className="text-xs text-gray-400">LC: {fmtCurrency(p.lc)}</div>
          )}
        </div>
      ),
    };

    if (activeTab === "all") {
      return [
        srCol,
        nameCol,
        {
          header: "Warehouse Boxes",
          render: (p) => (
            <div className="text-right">
              <div className="font-semibold text-gray-800">
                {fmt(p.warehouseBoxes)}
              </div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.warehouseAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "MR Boxes",
          render: (p) => (
            <div className="text-right">
              <div className="font-semibold text-blue-700">
                {fmt(p.mrBoxes)}
              </div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.mrAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "Total Boxes",
          render: (p) => (
            <div className="text-right">
              <div className="font-bold text-gray-900 text-base">
                {fmt(p.totalBoxes)}
              </div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.totalAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "Status",
          render: (p) => <StatusBadge status={p.status} />,
          className: "text-center",
        },
      ];
    }

    if (activeTab === "mr") {
      return [
        srCol,
        nameCol,
        {
          header: "Total MR Boxes",
          render: (p) => (
            <div className="text-right">
              <div className="font-bold text-blue-700 text-base">
                {fmt(p.totalMrBoxes)}
              </div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.totalMrAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "No. of MRs",
          render: (p) => (
            <div className="flex justify-center">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
                {p.mrBreakdown?.length || 0}
              </span>
            </div>
          ),
          className: "text-center",
        },
        {
          header: "MR Details",
          render: (p) => (
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setSelectedProduct(p);
                  setModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-xs font-medium"
              >
                <Eye size={13} /> View MRs
              </button>
            </div>
          ),
          className: "text-center",
        },
      ];
    }

    return [
      srCol,
      nameCol,
      {
        header: "Qty (Boxes)",
        render: (p) => (
          <div className="text-right">
            <span
              className={`font-bold text-base px-3 py-0.5 rounded-full inline-block ${
                p.warehouseBoxes === 0
                  ? "bg-red-50 text-red-700"
                  : p.warehouseBoxes < (p.minStockLevel || 0)
                    ? "bg-amber-50 text-amber-700"
                    : "bg-indigo-50 text-indigo-900"
              }`}
            >
              {fmt(p.warehouseBoxes)}
            </span>
            {p.minStockLevel > 0 && (
              <div className="text-xs text-gray-400 mt-0.5">
                Min: {p.minStockLevel}
              </div>
            )}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "LC Price ($)",
        render: (p) => (
          <div className="text-right text-sm text-gray-700">
            {Number(p.lc || 0).toFixed(3)}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "FOB Price ($)",
        render: (p) => (
          <div className="text-right text-sm text-gray-700">
            {Number(p.fob || 0).toFixed(3)}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Total Amount ($)",
        render: (p) => (
          <div className="text-right font-semibold text-emerald-700">
            {fmtCurrency(p.warehouseAmount)}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Status",
        render: (p) => <StatusBadge status={p.status} />,
        className: "text-center",
      },
    ];
  }, [activeTab, page]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportToExcel = () => {
    try {
      let excelData = [];
      let sheetName = "Stock Report";

      if (activeTab === "warehouse") {
        sheetName = "Warehouse Stock";
        excelData = products.map((p, i) => ({
          "Sr No.": i + 1,
          Product: p.productName,
          Supplier: p.supplierName || "",
          "Total Boxes": p.warehouseBoxes,
          "Min Stock": p.minStockLevel || 0,
          Status: p.status || "",
          "LC Price ($)": Number(p.lc || 0).toFixed(3),
          "FOB Price ($)": Number(p.fob || 0).toFixed(3),
          "Total Amount ($)": Number(p.warehouseAmount || 0).toFixed(2),
        }));
      } else if (activeTab === "mr") {
        sheetName = "MR Stock";
        excelData = products.map((p, i) => ({
          "Sr No.": i + 1,
          Product: p.productName,
          "LC ($)": Number(p.lc || 0).toFixed(3),
          "Total MR Boxes": p.totalMrBoxes,
          "Total MR Amount ($)": Number(p.totalMrAmount || 0).toFixed(2),
          "No. of MRs": p.mrBreakdown?.length || 0,
        }));
      } else {
        sheetName = "All Stock";
        excelData = products.map((p, i) => ({
          "Sr No.": i + 1,
          Product: p.productName,
          Supplier: p.supplierName || "",
          "Warehouse Boxes": p.warehouseBoxes,
          "MR Boxes": p.mrBoxes,
          "Total Boxes": p.totalBoxes,
          "Warehouse Amount ($)": Number(p.warehouseAmount || 0).toFixed(2),
          "MR Amount ($)": Number(p.mrAmount || 0).toFixed(2),
          "Total Amount ($)": Number(p.totalAmount || 0).toFixed(2),
          Status: p.status || "",
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      const buffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
        cellStyles: true,
      });
      saveAs(
        new Blob([buffer], { type: "application/octet-stream" }),
        `Stock_${sheetName.replace(" ", "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className={`${isMobileView ? "p-3 pb-6" : "p-4 md:p-6"} bg-gray-50 min-h-screen`}
    >
      {/* MR Breakdown Modal */}
      <MRBreakdownModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedProduct(null);
        }}
        productName={selectedProduct?.productName}
        mrBreakdown={selectedProduct?.mrBreakdown}
        isMobileView={isMobileView}
      />

      {/* Mobile Sidebar */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView ? (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
              >
                <Menu size={20} className="text-gray-700" />
              </button>
              <Warehouse size={18} className="text-indigo-600" />
              <h1 className="text-base font-bold text-gray-800">
                Stock In Hand
              </h1>
            </div>
            <div className="bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-medium">
              Total Records: {products.length}
            </div>
          </div>

          {/* Mobile Search */}
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search product…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Mobile action row - NO EXPORT BUTTON on mobile */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(search)}
              title="Refresh"
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
            {/* Export button REMOVED on mobile */}
          </div>
        </div>
      ) : (
        /* ── DESKTOP Header ── */
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Stock In Hand Reports
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Combined view of warehouse and MR stock, product-wise
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => fetchData(search)}
              title="Refresh"
              className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={exportToExcel}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-sm text-sm font-medium transition-colors"
            >
              <Download size={15} />
              Export Excel
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div
        className={`flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-4 md:mb-6 w-full md:w-fit shadow-sm`}
      >
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all ${
              activeTab === key
                ? "bg-indigo-600 text-white shadow"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Summary Cards ── */}
      {!loading && !error && (
        <div className={`grid gap-3 md:gap-4 mb-4 md:mb-6 ${summaryGridClass}`}>
          {summaryCards.map((card, i) => (
            <SummaryCard key={i} {...card} isMobileView={isMobileView} />
          ))}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm">
          <RefreshCw size={18} className="animate-spin mr-2" />
          Loading stock data…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-20 gap-2">
          <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-5 text-center max-w-sm">
            <p className="text-red-600 text-sm font-medium mb-1">
              Failed to load data
            </p>
            <p className="text-red-400 text-xs mb-3">{error}</p>
            <button
              onClick={() => fetchData(search)}
              className="bg-red-100 text-red-700 px-4 py-1.5 rounded text-sm hover:bg-red-200 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Mobile: Card List ── */}
      {!loading && !error && isMobileView && (
        <div className="space-y-3">
          {pageProducts.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
              No products found{search ? ` for "${search}"` : ""}
            </div>
          ) : (
            pageProducts.map((product, idx) => (
              <MobileProductCard
                key={product.productName + idx}
                product={product}
                activeTab={activeTab}
                idx={idx}
                page={page}
                onViewMR={(p) => {
                  setSelectedProduct(p);
                  setModalOpen(true);
                }}
              />
            ))
          )}

          {products.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-gray-500">
                {Math.min((page - 1) * ROWS_PER_PAGE + 1, products.length)}–
                {Math.min(page * ROWS_PER_PAGE, products.length)} of{" "}
                {products.length}
              </span>
              <Pagination
                current={page}
                total={totalPages}
                onChange={setPage}
                isMobileView={true}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Desktop: Table ── */}
      {!loading && !error && !isMobileView && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {columns.map((col, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide ${col.className || "text-left"} ${col.width || ""}`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center py-16 text-gray-400"
                    >
                      No products found{search ? ` for "${search}"` : ""}
                    </td>
                  </tr>
                ) : (
                  pageProducts.map((product, idx) => (
                    <tr
                      key={product.productName + idx}
                      className="hover:bg-indigo-50/30 transition-colors"
                    >
                      {columns.map((col, ci) => (
                        <td
                          key={ci}
                          className={`px-4 py-3 ${col.className || ""}`}
                        >
                          {col.render(product, idx)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {products.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <span className="text-xs text-gray-500">
                {Math.min((page - 1) * ROWS_PER_PAGE + 1, products.length)}–
                {Math.min(page * ROWS_PER_PAGE, products.length)} of{" "}
                {products.length} products
              </span>
              <Pagination
                current={page}
                total={totalPages}
                onChange={setPage}
                isMobileView={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsInHand;
