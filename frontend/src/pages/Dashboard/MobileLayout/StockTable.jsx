import React, { useState, useEffect, useMemo } from "react";
import {
  Warehouse,
  Users,
  Package,
  ChevronLeft,
  ChevronRight,
  Search,
  RefreshCw,
  X,
  Eye,
} from "lucide-react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

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
  { key: "all", label: "All Stock" },
  { key: "mr", label: "MR Stock" },
  { key: "warehouse", label: "Warehouse Stock" },
];

const ROWS_PER_PAGE = 10;
const MODAL_ROWS_PER_PAGE = 5;

// Summary Card - No icon (clean version)
const SummaryCard = ({ label, value, sub, color }) => (
  <div
    className="bg-white rounded-xl border border-gray-100 shadow-sm p-4"
    style={{ borderLeft: `4px solid ${color}` }}
  >
    <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
      {label}
    </div>
    <div className="text-lg font-bold text-gray-900 mt-1">{value}</div>
    {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
  </div>
);

// Status Badge
const StatusBadge = ({ boxes, minStock }) => {
  const isOut = boxes === 0;
  const isLow = !isOut && boxes < (minStock || 0);
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
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

// Pagination
const Pagination = ({ current, total, onChange }) => {
  if (total <= 1) return null;
  // ... (your pagination logic - kept as is)
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
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(current - 1)}
        disabled={current === 1}
        className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={i} className="px-2 text-gray-400 text-sm">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[28px] h-7 rounded text-xs font-medium ${
              p === current
                ? "bg-blue-600 text-white"
                : "border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {p}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(current + 1)}
        disabled={current === total}
        className="p-1.5 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

// MR Breakdown Modal
const MRBreakdownModal = ({ isOpen, onClose, productName, mrBreakdown }) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-900 text-base">
            MR Breakdown - {productName}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 text-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                  MR Name
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Boxes
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedMRs.map((mr) => (
                <tr key={mr.mrId} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{mr.mrName}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {fmt(mr.boxes)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {fmtCurrency(mr.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalModalPages > 1 && (
          <div className="p-4 border-t bg-gray-50 flex justify-center">
            <Pagination
              current={modalPage}
              total={totalModalPages}
              onChange={setModalPage}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const CombinedStockTable = ({ activeTab = "all", onTabChange }) => {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [allData, setAllData] = useState(null);
  const [mrData, setMrData] = useState(null);

  const fetchData = async (searchVal = "") => {
    setLoading(true);
    setError(null);
    try {
      const qs = searchVal ? `?search=${encodeURIComponent(searchVal)}` : "";

      const [combinedRes, mrRes] = await Promise.all([
        fetch(`${backendUrl}/api/stock-in-hand/combined-stock${qs}`),
        fetch(`${backendUrl}/api/stock-in-hand/mr-stock-summary${qs}`),
      ]);

      const combined = await combinedRes.json();
      const mr = await mrRes.json();

      setAllData(combined);
      setMrData(mr);
    } catch (err) {
      console.error("Stock fetch error:", err);
      setError("Failed to load stock data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchData(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const { products, summary } = useMemo(() => {
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
          label: "Total Products",
          value: fmt(allData?.count || 0),
          color: "#6366f1",
        },
        {
          label: "Total Boxes",
          value: fmt(s.totalBoxes),
          sub: `WH: ${fmt(s.totalWarehouseBoxes)} | MR: ${fmt(s.totalMrBoxes)}`,
          color: "#0ea5e9",
        },
        {
          label: "Total Value",
          value: fmtCurrency(s.totalAmount),
          color: "#10b981",
        },
        {
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
          label: "Products with MR",
          value: fmt(mrData?.count || 0),
          color: "#6366f1",
        },
        {
          label: "Total MR Boxes",
          value: fmt(s.totalMrBoxes),
          color: "#0ea5e9",
        },
        {
          label: "Total MR Value",
          value: fmtCurrency(s.totalMrAmount),
          color: "#10b981",
        },
      ];
    }
    const s = allData?.summary || {};
    return [
      {
        label: "Warehouse Products",
        value: fmt(products.length),
        color: "#6366f1",
      },
      {
        label: "Warehouse Boxes",
        value: fmt(s.totalWarehouseBoxes),
        color: "#0ea5e9",
      },
      {
        label: "Warehouse Value",
        value: fmtCurrency(s.totalWarehouseAmount),
        color: "#10b981",
      },
    ];
  }, [activeTab, allData, mrData, products.length]);

  const columns = useMemo(() => {
    const base = [
      {
        header: "#",
        render: (_, idx) => (
          <span className="text-gray-400 text-xs">
            {(page - 1) * ROWS_PER_PAGE + idx + 1}
          </span>
        ),
      },
      {
        header: "Product Name",
        render: (p) => (
          <div className="text-sm">
            <div className="font-medium text-gray-900">{p.productName}</div>
            {p.lc > 0 && (
              <div className="text-xs text-gray-400">
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
          header: "Warehouse",
          render: (p) => (
            <div className="text-right text-sm">
              <div className="font-medium">{fmt(p.warehouseBoxes)}</div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.warehouseAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "MR Stock",
          render: (p) => (
            <div className="text-right text-sm">
              <div className="font-medium text-blue-700">{fmt(p.mrBoxes)}</div>
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.mrAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "Total",
          render: (p) => (
            <div className="text-right text-sm font-bold">
              {fmt(p.totalBoxes)}
              <div className="text-xs text-gray-400">
                {fmtCurrency(p.totalAmount)}
              </div>
            </div>
          ),
          className: "text-right",
        },
        {
          header: "Status",
          render: (p) => (
            <StatusBadge boxes={p.warehouseBoxes} minStock={p.minStockLevel} />
          ),
          className: "text-center",
        },
      ];
    }

    if (activeTab === "mr") {
      return [
        ...base,
        {
          header: "MR Boxes",
          render: (p) => (
            <div className="text-right text-sm font-bold text-blue-700">
              {fmt(p.totalMrBoxes)}
            </div>
          ),
          className: "text-right",
        },
        {
          header: "MR Details",
          render: (p) => (
            <button
              onClick={() => {
                setSelectedProduct(p);
                setModalOpen(true);
              }}
              className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1 mx-auto"
            >
              <Eye size={14} /> View ({p.mrBreakdown?.length || 0})
            </button>
          ),
          className: "text-center",
        },
      ];
    }

    return [
      ...base,
      {
        header: "Boxes",
        render: (p) => (
          <div className="text-right text-sm">
            <div
              className={`font-bold ${p.warehouseBoxes === 0 ? "text-red-600" : p.warehouseBoxes < (p.minStockLevel || 0) ? "text-amber-600" : "text-gray-900"}`}
            >
              {fmt(p.warehouseBoxes)}
            </div>
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Value",
        render: (p) => (
          <div className="text-right text-sm font-medium text-emerald-700">
            {fmtCurrency(p.warehouseAmount)}
          </div>
        ),
        className: "text-right",
      },
      {
        header: "Status",
        render: (p) => (
          <StatusBadge boxes={p.warehouseBoxes} minStock={p.minStockLevel} />
        ),
        className: "text-center",
      },
    ];
  }, [activeTab, page]);

  return (
    <div className="bg-gray-50 p-4 font-sans">
      <MRBreakdownModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedProduct(null);
        }}
        productName={selectedProduct?.productName}
        mrBreakdown={selectedProduct?.mrBreakdown}
      />

      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Stock Overview</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          Real-time stock across warehouse & MRs
        </p>
      </div>

      <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-6 w-fit shadow-sm">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onTabChange(key)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === key
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          {summaryCards.map((card, i) => (
            <SummaryCard key={i} {...card} />
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => fetchData(search)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {loading && (
          <div className="py-20 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
            <RefreshCw size={18} className="animate-spin" /> Loading stock
            data...
          </div>
        )}

        {error && !loading && (
          <div className="py-20 text-center text-red-500 text-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b">
                  {columns.map((col, i) => (
                    <th
                      key={i}
                      className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide ${col.className || "text-left"}`}
                    >
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pageProducts.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="text-center py-12 text-gray-400 text-sm"
                    >
                      No products found{search ? ` for "${search}"` : ""}
                    </td>
                  </tr>
                ) : (
                  pageProducts.map((product, idx) => (
                    <tr
                      key={product.productName + idx}
                      className="hover:bg-gray-50 transition-colors"
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
        )}

        {products.length > 0 && !loading && !error && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-gray-50 text-xs">
            <span className="text-gray-500">
              Showing {(page - 1) * ROWS_PER_PAGE + 1} –{" "}
              {Math.min(page * ROWS_PER_PAGE, products.length)} of{" "}
              {products.length}
            </span>
            <Pagination current={page} total={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

export default CombinedStockTable;
