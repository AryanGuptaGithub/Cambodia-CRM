import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  DollarSign,
  Package,
} from "lucide-react";
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

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  // Calculate serial number based on current page and items per page
  const getSerialNumber = (index) => {
    const itemsPerPage = 9;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const fetchAveragePriceData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: 9,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/average-price`,
        {
          params,
        }
      );

      const reports = response.data.reports || [];

      // Process reports for table display
      const processedReports = reports.map((report) => {
        const avgPrice = report.averagePrice || 0;
        return {
          productId: report._id,
          productName: report.productName || "N/A",
          category: report.type || "N/A",
          averagePrice: avgPrice,
          sku: report.batches?.[0]?.sku || "N/A",
        };
      });

      // Use the OVERALL average price from backend response
      const overallAveragePrice = response.data.overallAveragePrice || 0;
      const totalRecords = response.data.total || 0;

      setData({
        summary: {
          averagePrice: overallAveragePrice,
          totalProducts: totalRecords,
        },
        records: processedReports,
      });

      // Use pagination data from backend response
      const currentPage = response.data.currentPage || 1;
      const totalPages = response.data.totalPages || 1;

      setPagination({
        currentPage: currentPage,
        totalPages: totalPages,
        totalRecords: totalRecords,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      });
    } catch (error) {
      console.error("Error fetching average price data:", error);

      if (error.response?.status === 404) {
        showToast(
          "error",
          "API endpoint not found. Please check backend configuration."
        );
      } else if (error.response?.status === 400) {
        showToast("error", "Bad request. Please check your parameters.");
      } else {
        showToast("error", "Failed to fetch average price data");
      }

      setData({
        summary: {
          averagePrice: 0,
          totalProducts: 0,
        },
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
  };

  useEffect(() => {
    fetchAveragePriceData(1);
  }, []);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchAveragePriceData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchAveragePriceData(1);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchAveragePriceData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchAveragePriceData(1);
    }
  };

  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      let url = `${backendUrl}/api/reports/average-price/export`;
      if (searchTerm) {
        url += `?search=${encodeURIComponent(searchTerm)}`;
      }

      // Make request to export endpoint
      const response = await axios.get(url, {
        responseType: "blob", // Important for file download
      });

      // Create a download link
      const urlObject = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = urlObject;

      // Get filename from content-disposition header or use default
      const contentDisposition = response.headers["content-disposition"];
      let fileName = "average_price_report.xlsx";

      if (contentDisposition) {
        const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
        if (fileNameMatch && fileNameMatch.length > 1) {
          fileName = fileNameMatch[1];
        }
      }

      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.remove();
      window.URL.revokeObjectURL(urlObject);

      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export to Excel. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  // Render Pagination Component
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    const startItem = (pagination.currentPage - 1) * 9 + 1;
    const endItem = Math.min(
      pagination.currentPage * 9,
      pagination.totalRecords
    );

    return (
      <div className="flex items-center justify-between mt-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasPrev
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            ← Prev
          </button>

          {/* Page Numbers */}
          <div className="flex gap-1">
            {visiblePages.map((page, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof page === "number" ? handlePageChange(page) : null
                }
                className={`min-w-[40px] px-3 py-2 rounded-lg ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white cursor-default"
                    : typeof page === "number"
                    ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                    : "bg-transparent text-gray-500 cursor-default"
                }`}
                disabled={typeof page !== "number"}
              >
                {page}
              </button>
            ))}
          </div>

          {/* Next Button */}
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasNext
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
            <p className="text-xs text-gray-500 mt-1">Across all pages</p>
          </div>
          <Package className="w-8 h-8 text-blue-500" />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Product Name</th>
        <th className="p-3 text-sm font-medium">Category</th>
        <th className="p-3 text-sm font-medium">Average Price ($)</th>
      </tr>
    </thead>
  );

  // Render table row
  const renderTableRow = (product, index) => (
    <tr
      key={index}
      className={`hover:bg-gray-50 ${
        index === data.records.length - 1 ? "" : "border-b"
      }`}
    >
      <td className="p-3">
        <div className="text-sm text-gray-600 font-medium">
          {getSerialNumber(index)}
        </div>
      </td>

      <td className="p-3">
        <div>
          <div className="text-sm font-medium text-gray-900 capitalize">
            {product.productName || product.name || "N/A"}
          </div>
        </div>
      </td>
      <td className="p-3">
        <div className="text-sm text-gray-900 capitalize">
          {product.category || "N/A"}
        </div>
      </td>
      <td className="p-3 text-sm font-semibold text-blue-600">
        $
        {(product.averagePrice || 0)?.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </td>
    </tr>
  );

  const getColSpan = () => 4;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
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
              onKeyPress={handleSearch}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64"
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
              onClick={() => inputRef.current?.focus()}
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              exportLoading
                ? "bg-green-400 text-white"
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
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-3 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((product, index) =>
                renderTableRow(product, index)
              )
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-3 text-center text-gray-500"
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