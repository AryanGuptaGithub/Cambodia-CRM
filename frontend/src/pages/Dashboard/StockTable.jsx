import React, { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";

// Utility functions
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

const TABS = [
  { key: "all", label: "All Stock", icon: Package },
  { key: "mr", label: "MR Stock", icon: Users },
  { key: "warehouse", label: "Warehouse Stock", icon: Warehouse },
];

const ROWS_PER_PAGE = 10;
const MODAL_ROWS_PER_PAGE = 5;

// Summary Card Component – now accepts hideIcon prop
const SummaryCard = ({ icon: Icon, label, value, sub, color, hideIcon }) => (
  <div
    className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-4"
    style={{ borderLeft: `4px solid ${color}` }}
  >
    {!hideIcon && (
      <div
        className="rounded-lg p-2.5 flex-shrink-0"
        style={{ background: color + "18" }}
      >
        <Icon size={20} style={{ color }} />
      </div>
    )}
    <div className="min-w-0">
      <div className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">
        {label}
      </div>
      <div className="text-xl font-bold text-gray-800 truncate">{value}</div>
      {sub && <div className="text-xs text-gray-400 truncate">{sub}</div>}
    </div>
  </div>
);

// Status Badge Component
const StatusBadge = ({ boxes, minStock, isMobileView }) => {
  const isOut = boxes === 0;
  const isLow = !isOut && boxes < (minStock || 0);
  return (
    <span
      className={`py-1 rounded-full font-semibold ${
        isMobileView ? "text-[6px]" : "text-xs"
      } ${
        isOut
          ? "bg-red-100 text-red-700"
          : isLow
            ? "bg-amber-100 text-amber-700"
            : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
    </span>
  );
};

// Pagination Component (reusable) – uses text arrows on mobile
const Pagination = ({ current, total, onChange, isMobileView }) => {
  if (total <= 1) return null;

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
        {isMobileView ? (
          <span className="text-sm">←</span>
        ) : (
          <ChevronLeft size={16} />
        )}
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
                ? "bg-blue-600 text-white"
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
        {isMobileView ? (
          <span className="text-sm">→</span>
        ) : (
          <ChevronRight size={16} />
        )}
      </button>
    </div>
  );
};

// MR Breakdown Modal Component – uses text close on mobile
const MRBreakdownModal = ({
  isOpen,
  onClose,
  productName,
  mrBreakdown,
  isMobileView,
}) => {
  const [modalPage, setModalPage] = useState(1);
  const totalModalPages = Math.ceil(
    (mrBreakdown?.length || 0) / MODAL_ROWS_PER_PAGE,
  );
  const paginatedMRs =
    mrBreakdown?.slice(
      (modalPage - 1) * MODAL_ROWS_PER_PAGE,
      modalPage * MODAL_ROWS_PER_PAGE,
    ) || [];

  if (!isOpen) return null;

  const cellTextClass = isMobileView ? "text-[7px]" : "text-xs sm:text-sm";
  const headerTextClass = isMobileView
    ? "text-[9px] font-medium"
    : "text-xs font-semibold";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3
            className={`font-semibold text-gray-900 ${
              isMobileView ? "text-xs" : "text-lg"
            }`}
          >
            MR Breakdown - {productName}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            {isMobileView ? (
              <span className="text-gray-500 text-lg">✕</span>
            ) : (
              <X size={20} className="text-gray-500" />
            )}
          </button>
        </div>

        {/* Modal Body (unchanged) */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {paginatedMRs.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No MR data available
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th
                    className={`px-4 py-2 text-left uppercase ${headerTextClass} text-gray-500`}
                  >
                    MR Name
                  </th>
                  <th
                    className={`px-4 py-2 text-right uppercase ${headerTextClass} text-gray-500`}
                  >
                    Boxes
                  </th>
                  <th
                    className={`px-4 py-2 text-right uppercase ${headerTextClass} text-gray-500`}
                  >
                    Amount
                  </th>
                  <th
                    className={`px-4 py-2 text-right uppercase ${headerTextClass} text-gray-500`}
                  >
                    Assigned
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedMRs.map((mr) => (
                  <tr key={mr.mrId} className="hover:bg-gray-50">
                    <td
                      className={`px-4 py-2 font-medium text-gray-800 ${cellTextClass}`}
                    >
                      {mr.mrName}
                    </td>
                    <td className={`px-4 py-2 text-right ${cellTextClass}`}>
                      {fmt(mr.boxes)}
                    </td>
                    <td className={`px-4 py-2 text-right ${cellTextClass}`}>
                      {fmtCurrency(mr.amount)}
                    </td>
                    <td className={`px-4 py-2 text-right ${cellTextClass}`}>
                      {fmt(mr.assignedQuantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer with Pagination */}
        {totalModalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <span
              className={`text-gray-500 ${isMobileView ? "text-[9px]" : "text-xs"}`}
            >
              Showing {(modalPage - 1) * MODAL_ROWS_PER_PAGE + 1} –{" "}
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

// Main Component
export const CombinedStockTable = ({
  apiBaseUrl,
  activeTab,
  onTabChange,
}) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isMobileView, setIsMobileView] = useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Raw data from API
  const [allData, setAllData] = useState(null);
  const [mrData, setMrData] = useState(null);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch data
  const fetchData = async (searchVal = "") => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchVal ? `?search=${encodeURIComponent(searchVal)}` : "";

      const [combinedRes, mrRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/stock-in-hand/combined-stock${qs}`),
        fetch(`${apiBaseUrl}/api/stock-in-hand/mr-stock-summary${qs}`),
      ]);

      if (!combinedRes.ok) {
        throw new Error(
          `Combined stock fetch failed: ${combinedRes.status} ${combinedRes.statusText}`,
        );
      }
      if (!mrRes.ok) {
        throw new Error(
          `MR stock summary fetch failed: ${mrRes.status} ${mrRes.statusText}`,
        );
      }

      const contentTypeCombined = combinedRes.headers.get("content-type");
      const contentTypeMr = mrRes.headers.get("content-type");

      if (
        !contentTypeCombined ||
        !contentTypeCombined.includes("application/json")
      ) {
        throw new Error(
          `Expected JSON from combined-stock but received ${contentTypeCombined}`,
        );
      }
      if (!contentTypeMr || !contentTypeMr.includes("application/json")) {
        throw new Error(
          `Expected JSON from mr-stock-summary but received ${contentTypeMr}`,
        );
      }

      const [combined, mr] = await Promise.all([
        combinedRes.json(),
        mrRes.json(),
      ]);

      setAllData(combined);
      setMrData(mr);
    } catch (err) {
      console.error("Fetch error:", err);
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

  const { products } = useMemo(() => {
    if (activeTab === "all") {
      return {
        products: allData?.products || [],
        summary: allData?.summary || {},
      };
    }
    if (activeTab === "mr") {
      return {
        products: mrData?.products || [],
        summary: mrData?.summary || {},
      };
    }
    const warehouseProducts = (allData?.products || [])
      .filter((p) => p.warehouseBoxes > 0)
      .map((p) => ({
        ...p,
        displayBoxes: p.warehouseBoxes,
        displayAmount: p.warehouseAmount,
      }));
    return {
      products: warehouseProducts,
      summary: {
        totalBoxes: allData?.summary?.totalWarehouseBoxes || 0,
        totalAmount: allData?.summary?.totalWarehouseAmount || 0,
      },
    };
  }, [activeTab, allData, mrData]);

  const totalPages = Math.ceil(products.length / ROWS_PER_PAGE);
  const pageProducts = products.slice(
    (page - 1) * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE,
  );

  const summaryCards = useMemo(() => {
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
    if (activeTab === "mr") {
      const s = mrData?.summary || {};
      return [
        {
          icon: Users,
          label: "Products with MR",
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
    const s = allData?.summary || {};
    return [
      {
        icon: Warehouse,
        label: "Warehouse Products",
        value: fmt(products.length),
        color: "#6366f1",
      },
      {
        icon: Box,
        label: "Warehouse Boxes",
        value: fmt(s.totalWarehouseBoxes),
        color: "#0ea5e9",
      },
      {
        icon: DollarSign,
        label: "Warehouse Value",
        value: fmtCurrency(s.totalWarehouseAmount),
        color: "#10b981",
      },
    ];
  }, [activeTab, allData, mrData, products.length]);

  // Dynamic text classes
  const cellTextClass = isMobileView ? "text-[7px]" : "text-xs sm:text-sm";
  const headerTextClass = isMobileView
    ? "text-[9px] font-medium"
    : "text-xs font-semibold";

  const columns = useMemo(() => {
    const base = [
      {
        header: "#",
        render: (_, idx) => (
          <span
            className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
          >
            {(page - 1) * ROWS_PER_PAGE + idx + 1}
          </span>
        ),
        width: "w-10",
      },
      {
        header: "Product Name",
        render: (p) => (
          <div>
            <div
              className={`font-semibold text-gray-800 ${
                isMobileView ? "text-[7px]" : "text-sm"
              }`}
            >
              {p.productName}
            </div>
            {p.lc > 0 && (
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
                LC: {fmtCurrency(p.lc)}
              </div>
            )}
          </div>
        ),
      },
    ];

    if (activeTab === "all") {
      return [
        ...base,
        {
          header: "Warehouse Boxes",
          render: (p) => (
            <div className="text-right">
              <div className={`font-semibold text-gray-800 ${cellTextClass}`}>
                {fmt(p.warehouseBoxes)}
              </div>
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
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
              <div className={`font-semibold text-blue-700 ${cellTextClass}`}>
                {fmt(p.mrBoxes)}
              </div>
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
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
              <div className={`font-bold text-gray-900 ${cellTextClass}`}>
                {fmt(p.totalBoxes)}
              </div>
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
                {fmtCurrency(p.totalAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "Status",
          render: (p) => (
            <StatusBadge
              boxes={p.warehouseBoxes}
              minStock={p.minStockLevel}
              isMobileView={isMobileView}
            />
          ),
          className: "text-center",
        },
      ];
    }

    if (activeTab === "mr") {
      return [
        ...base,
        {
          header: "Total MR Boxes",
          render: (p) => (
            <div className="text-right">
              <div className={`font-bold text-blue-700 ${cellTextClass}`}>
                {fmt(p.totalMrBoxes)}
              </div>
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
                {fmtCurrency(p.totalMrAmount)}
              </div>
            </div>
          ),
          className: "text-right",
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
                className={`flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium ${
                  isMobileView ? "text-[7px]" : "text-xs"
                }`}
              >
                {!isMobileView && <Eye size={14} />}
                View MRs ({p.mrBreakdown?.length || 0})
              </button>
            </div>
          ),
          className: "text-center",
        },
        {
          header: "No. of MRs",
          render: (p) => (
            <div className="text-center">
              <span
                className={`inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold ${
                  isMobileView ? "text-[7px]" : "text-sm"
                }`}
              >
                {p.mrBreakdown?.length || 0}
              </span>
            </div>
          ),
          className: "text-center",
        },
      ];
    }

    // warehouse tab
    return [
      ...base,
      {
        header: "Quantity (Boxes)",
        render: (p) => (
          <div className="text-right">
            <div
              className={`font-bold ${cellTextClass} ${
                p.warehouseBoxes === 0
                  ? "text-red-600"
                  : p.warehouseBoxes < (p.minStockLevel || 0)
                    ? "text-amber-600"
                    : "text-gray-900"
              }`}
            >
              {fmt(p.warehouseBoxes)}
            </div>
            {p.minStockLevel > 0 && (
              <div
                className={`text-gray-400 ${isMobileView ? "text-[7px]" : "text-xs"}`}
              >
                Min: {p.minStockLevel}
              </div>
            )}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Stock Value",
        render: (p) => (
          <div
            className={`text-right font-semibold text-emerald-700 ${cellTextClass}`}
          >
            {fmtCurrency(p.warehouseAmount)}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Status",
        render: (p) => (
          <StatusBadge
            boxes={p.warehouseBoxes}
            minStock={p.minStockLevel}
            isMobileView={isMobileView}
          />
        ),
        className: "text-center",
      },
    ];
  }, [activeTab, page, isMobileView, cellTextClass]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans">
      {/* Modal */}
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

      {/* Header */}
      <div className="mb-6">
        <h1
          className={`font-bold text-gray-900 ${
            isMobileView ? "text-base" : "text-2xl"
          }`}
        >
          Stock Overview
        </h1>
        <p
          className={`text-gray-500 mt-0.5 ${
            isMobileView ? "text-[9px]" : "text-sm"
          }`}
        >
          Combined view of warehouse and MR stock, product-wise
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit shadow-sm">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
              isMobileView ? "text-[9px]" : "text-sm"
            } ${
              activeTab === key
                ? "bg-blue-600 text-white shadow"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {!isMobileView && <Icon size={15} />}
            {label}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      {!loading && !error && (
        <div
          className={`grid gap-4 mb-6 ${
            summaryCards.length === 4
              ? "grid-cols-2 md:grid-cols-4"
              : "grid-cols-1 sm:grid-cols-3"
          }`}
        >
          {summaryCards.map((card, i) => (
            <SummaryCard key={i} {...card} hideIcon={isMobileView} />
          ))}
        </div>
      )}

      {/* Table Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="relative">
              {!isMobileView && (
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
              )}
              <input
                type="text"
                placeholder="Search product…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 w-48 ${
                  isMobileView ? "text-[9px]" : "text-sm"
                }`}
              />
            </div>
            <button
              onClick={() => fetchData(search)}
              className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
              title="Refresh"
            >
              {isMobileView ? (
                <span className="text-sm">↻</span>
              ) : (
                <RefreshCw
                  size={14}
                  className={loading ? "animate-spin" : ""}
                />
              )}
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            <RefreshCw size={18} className="animate-spin mr-2" /> Loading stock
            data…
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-16 text-red-500 text-sm gap-2">
            <span>⚠ {error}</span>
            <button
              className="text-blue-600 underline text-xs"
              onClick={() => fetchData(search)}
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {columns.map((col, i) => (
                      <th
                        key={i}
                        className={`px-2 sm:px-4 py-2 sm:py-3 uppercase tracking-wide ${headerTextClass} text-gray-500 ${
                          col.className || "text-left"
                        } ${col.width || ""}`}
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
                        className="hover:bg-blue-50/40 transition-colors"
                      >
                        {columns.map((col, ci) => (
                          <td
                            key={ci}
                            className={`px-2 sm:px-4 py-2 sm:py-3 ${col.className || ""}`}
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

            {/* Footer / Pagination */}
            {products.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/50">
                <span
                  className={`text-gray-500 ${
                    isMobileView ? "text-[9px]" : "text-xs"
                  }`}
                >
                  Showing{" "}
                  <span className="font-medium text-gray-700">
                    {Math.min((page - 1) * ROWS_PER_PAGE + 1, products.length)}
                  </span>{" "}
                  –{" "}
                  <span className="font-medium text-gray-700">
                    {Math.min(page * ROWS_PER_PAGE, products.length)}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium text-gray-700">
                    {products.length}
                  </span>{" "}
                  products
                </span>
                <Pagination
                  current={page}
                  total={totalPages}
                  onChange={setPage}
                  isMobileView={isMobileView}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CombinedStockTable;
