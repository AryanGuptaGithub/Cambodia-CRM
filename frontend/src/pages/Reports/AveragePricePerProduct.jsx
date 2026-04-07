import React, { useState, useEffect, useRef, useCallback } from "react";
import { Download, Search, X, DollarSign, Package, Hash } from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AveragePricePerProduct = () => {
  const [data, setData] = useState({
    summary: {
      averagePrice: 0,
      totalProducts: 0,
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

  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const ITEMS_PER_PAGE = 8;

  const fetchAveragePriceData = useCallback(
    async (page = 1, search = searchTerm) => {
      setLoading(true);
      try {
        let params = {
          page: page,
          limit: ITEMS_PER_PAGE,
        };

        if (search && search.trim() !== "") {
          params.search = search.trim();
        }

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

          const overallAveragePrice = response.data.overallAveragePrice || 0;
          const totalRecords = response.data.total || 0;
          const totalProducts = response.data.totalProducts || totalRecords;

          setData({
            summary: {
              averagePrice: overallAveragePrice,
              totalProducts: totalProducts,
            },
            records: processedReports,
          });

          setPagination({
            currentPage: response.data.currentPage || 1,
            totalPages: response.data.totalPages || 1,
            totalRecords: totalRecords,
            hasNext: response.data.currentPage < response.data.totalPages,
            hasPrev: response.data.currentPage > 1,
          });
        } else {
          showToast("error", response.data.message || "Failed to fetch data");
        }
      } catch (error) {
        console.error("Error fetching average price data:", error);
        if (error.response?.status === 404) {
          showToast("error", "API endpoint not found.");
        } else if (error.response?.status === 400) {
          showToast("error", "Bad request.");
        } else if (error.response?.status === 500) {
          showToast("error", "Server error.");
        } else {
          showToast("error", "Failed to fetch average price data");
        }
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
        if (tableElement) {
          tableElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
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
    searchTimeoutRef.current = setTimeout(() => {
      fetchAveragePriceData(1, value);
    }, 500);
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
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match.length > 1) fileName = match[1];
      }
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(urlObject);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Export error:", error);
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

  const renderPagination = () => {
    if (pagination.totalPages <= 1 && !loading) return null;

    const startItem = (pagination.currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = Math.min(
      pagination.currentPage * ITEMS_PER_PAGE,
      pagination.totalRecords,
    );

    return (
      <div className="flex gap-4 mt-6">
        <div className="flex gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev || loading}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              pagination.hasPrev && !loading
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            ← Prev
          </button>
          <div className="flex gap-1">
            {visiblePages.map((page, index) => (
              <button
                key={index}
                onClick={() => {
                  if (
                    typeof page === "number" &&
                    !loading &&
                    page !== pagination.currentPage
                  ) {
                    handlePageChange(page);
                  }
                }}
                disabled={
                  typeof page !== "number" ||
                  loading ||
                  page === pagination.currentPage
                }
                className={`min-w-[40px] px-3 py-2 rounded-lg transition-colors ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white cursor-default"
                    : typeof page === "number"
                      ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                      : "bg-transparent text-gray-500 cursor-default"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext || loading}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
              pagination.hasNext && !loading
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Next →
          </button>
        </div>
      </div>
    );
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              Average Price (All Products)
            </p>
            <p className="text-2xl font-bold text-gray-800">
              $
              {data.summary.averagePrice?.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) || "0.00"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Based on {data.summary.totalProducts || 0} products
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Products</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalProducts || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Active products in stock
            </p>
          </div>
          <Package className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Records</p>
            <p className="text-2xl font-bold text-gray-800">
              {pagination.totalRecords || 0}
            </p>
            <p className="text-xs text-gray-500 mt-1">Filtered results</p>
          </div>
          <Hash className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  // --- Table with ONLY required columns (no Sr.No, no Details) ---
  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b sticky top-0">
      <tr>
        <th className="p-3 text-sm font-medium">Sr No.</th>
        <th className="p-3 text-sm font-medium">Product Name</th>
        <th className="p-3 text-sm font-medium">Category</th>
        <th className="p-3 text-sm font-medium">Avg Price ($)</th>
      </tr>
    </thead>
  );

  const renderTableRow = (product, index) => (
    <tr key={product.productId} className="hover:bg-gray-50 transition-colors">
      <td>
        {index +1}
      </td>
      <td className="p-3">
        <div className="text-sm font-medium text-gray-900 capitalize">
          {product.productName}
        </div>
      </td>
      <td className="p-3">
        <span className="text-sm text-gray-600 capitalize">
          {product.category}
        </span>
      </td>
 
      <td className="p-3">
        <div className="text-sm font-semibold text-blue-600">
          $
          {(product.averagePrice || 0)?.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="p-6">
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
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={exportToExcel}
            disabled={exportLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors ${
              exportLoading
                ? "bg-green-400 text-white cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {exportLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Download size={18} />
                Export Excel
              </>
            )}
          </button>
        </div>
      </div>

      {renderSummaryCards()}

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-sm text-center">
          {renderTableHeaders()}
          <tbody>
            {loading && data.records.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((product, index) =>
                renderTableRow(product, index),
              )
            ) : (
              <tr>
                <td colSpan={5} className="p-8 text-center text-gray-500">
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
