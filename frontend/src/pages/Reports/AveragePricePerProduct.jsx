import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Search,
  X,
  DollarSign,
  Package,
  Hash,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { getVisiblePages } from "../../utils/useVisiblePages";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AveragePricePerProduct = () => {
  const [data, setData] = useState({
    summary: { averagePrice: 0, totalProducts: 0 },
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
  const searchTimeoutRef = useRef(null);
  const ITEMS_PER_PAGE = 8;

  const fetchAveragePriceData = useCallback(
    async (page = 1, search = searchTerm) => {
      setLoading(true);
      try {
        const params = { page, limit: ITEMS_PER_PAGE };
        if (search && search.trim() !== "") params.search = search.trim();
        const response = await axios.get(
          `${backendUrl}/api/reports/average-price`,
          { params },
        );

        if (response.data.success) {
          const reports = response.data.reports || [];
          const processedReports = reports.map((report) => ({
            productId: report.productId,
            productName: report.productName || "N/A",
            category: report.category || "N/A",
            qty: report.qty || 0,
            amount: report.amount || 0,
            averagePrice: report.averagePrice || 0,
          }));
          const totalRecords = response.data.total || 0;
          setData({
            summary: {
              averagePrice: response.data.overallAveragePrice || 0,
              totalProducts: response.data.totalProducts || totalRecords,
            },
            records: processedReports,
          });
          setPagination({
            currentPage: response.data.currentPage || 1,
            totalPages: response.data.totalPages || 1,
            totalRecords,
            hasNext: response.data.currentPage < response.data.totalPages,
            hasPrev: response.data.currentPage > 1,
          });
        } else {
          showToast("error", response.data.message || "Failed to fetch data");
        }
      } catch (error) {
        showToast("error", "Failed to fetch average price data");
        setData({
          summary: { averagePrice: 0, totalProducts: 0 },
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
    },
    [searchTerm],
  );

  useEffect(() => {
    fetchAveragePriceData(1, "");
  }, []);

  const handlePageChange = useCallback(
    (page) => {
      if (
        page >= 1 &&
        page <= pagination.totalPages &&
        page !== pagination.currentPage &&
        !loading
      ) {
        fetchAveragePriceData(page);
        const tableElement = document.querySelector(".overflow-x-auto");
        if (tableElement)
          tableElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [
      pagination.totalPages,
      pagination.currentPage,
      fetchAveragePriceData,
      loading,
    ],
  );

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(
      () => fetchAveragePriceData(1, value),
      500,
    );
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    fetchAveragePriceData(1, "");
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      fetchAveragePriceData(1, searchTerm);
    }
  };

  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      let url = `${backendUrl}/api/reports/average-price/export`;
      if (searchTerm) url += `?search=${encodeURIComponent(searchTerm)}`;
      const response = await axios.get(url, { responseType: "blob" });
      const urlObject = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = urlObject;
      let fileName = "average_price_report.xlsx";
      const cd = response.headers["content-disposition"];
      if (cd) {
        const m = cd.match(/filename="(.+)"/);
        if (m?.[1]) fileName = m[1];
      }
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(urlObject);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      showToast("error", "Failed to export to Excel.");
    } finally {
      setExportLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const visiblePages = getVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  // ── Pagination ─────────────────────────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1 && !loading) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev || loading}
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
          disabled={!pagination.hasNext || loading}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
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
        label: "Average Price (All Products)",
        value: `$${data.summary.averagePrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}`,
        sub: `Based on ${data.summary.totalProducts || 0} products`,
        icon: (
          <DollarSign
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
        border: "border-green-500",
      },
      {
        label: "Total Products",
        value: data.summary.totalProducts || 0,
        sub: "Active products in stock",
        icon: (
          <Package
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
        border: "border-blue-500",
      },
      {
        label: "Total Records",
        value: pagination.totalRecords || 0,
        sub: "Filtered results",
        icon: (
          <Hash
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        ),
        border: "border-purple-500",
      },
    ];
    return (
      <div
        className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-3 mb-6"}`}
      >
        {cards.map(({ label, value, sub, icon, border }, i) => (
          <div
            key={label}
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 ${border} border border-gray-200 ${isMobileView && i === 2 ? "col-span-2" : ""}`}
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
                <p className="text-xs text-gray-500 mt-1">{sub}</p>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Table Headers ──────────────────────────────────────────────────────────
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr No.</th>
          <th className={thClass}>Product Name</th>
          {!isMobileView && <th className={thClass}>Category</th>}
          <th className={thClass}>Avg Price ($)</th>
        </tr>
      </thead>
    );
  };

  // ── Table Row ──────────────────────────────────────────────────────────────
  const renderTableRow = (product, index) => {
    const tdClass = `${isMobileView ? "p-2" : "p-3"}`;
    return (
      <tr
        key={product.productId}
        className="hover:bg-gray-50 transition-colors border-b last:border-b-0"
      >
        <td
          className={`${tdClass} ${isMobileView ? "text-xs" : "text-sm"} text-gray-600 font-medium text-center`}
        >
          {(pagination.currentPage - 1) * ITEMS_PER_PAGE + index + 1}
        </td>
        <td className={tdClass}>
          <div
            className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-900 capitalize`}
          >
            {product.productName}
          </div>
          {isMobileView && (
            <div className="text-xs text-gray-400 mt-0.5 capitalize">
              {product.category}
            </div>
          )}
        </td>
        {!isMobileView && (
          <td className={`${tdClass} text-center`}>
            <span className="text-sm text-gray-600 capitalize">
              {product.category}
            </span>
          </td>
        )}
        <td className={`${tdClass} text-center`}>
          <span
            className={`${isMobileView ? "text-xs" : "text-sm"} font-semibold text-blue-600`}
          >
            $
            {(product.averagePrice || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </td>
      </tr>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`${isMobileView ? "p-3 pb-24" : "p-6"} relative`}>
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
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">
              Avg Price / Product
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              Average Price Per Product
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by product name..."
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
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
              disabled={exportLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors ${exportLoading ? "bg-green-400 text-white cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"}`}
            >
              {exportLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Export Excel</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE Search (no export button on mobile) ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search by product name..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyPress={handleSearchKeyPress}
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

      {/* Search result hint */}
      {searchTerm && pagination.totalRecords > 0 && (
        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
          <p
            className={`text-blue-700 ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            Searching: <span className="font-semibold">"{searchTerm}"</span>
            <span className="ml-3">
              Found:{" "}
              <span className="font-bold">{pagination.totalRecords}</span>{" "}
              product(s)
            </span>
          </p>
        </div>
      )}

      {renderSummaryCards()}

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-sm text-center ${isMobileView ? "min-w-[320px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading && data.records.length === 0 ? (
              <tr>
                <td colSpan={isMobileView ? 3 : 4} className="p-8 text-center">
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
              data.records.map((product, index) =>
                renderTableRow(product, index),
              )
            ) : (
              <tr>
                <td
                  colSpan={isMobileView ? 3 : 4}
                  className={`p-8 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                >
                  No average price data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}
    </div>
  );
};

export default AveragePricePerProduct;
