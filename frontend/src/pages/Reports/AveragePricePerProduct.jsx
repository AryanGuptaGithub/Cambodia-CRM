import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
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
    const itemsPerPage = 7;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const fetchAveragePriceData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: 7,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(`${backendUrl}/api/products`, {
        params,
      });
 
      const products = response.data || [];

      const totalProducts = products.length;
      const averagePrice =
        totalProducts > 0
          ? products.reduce(
              (sum, product) => sum + (product.sellingPrice || 0),
              0
            ) / totalProducts
          : 0;

      // Apply pagination manually since API returns all products
      const startIndex = (page - 1) * 7;
      const endIndex = startIndex + 7;
      const paginatedProducts = products.slice(startIndex, endIndex);

      // Transform records to match your table structure
      const records = paginatedProducts.map((product, index) => ({
        productId: product._id || `P${startIndex + index + 1}`,
        productName: product.productName || "N/A",
        category: product.type || "N/A",
        averagePrice: product.lc || 0,
        sku: product.packing || "N/A",
      }));

      setData({
        summary: {
          averagePrice: averagePrice,
          totalProducts: totalProducts,
        },
        records: records,
      });

      setPagination({
        currentPage: page,
        totalPages: Math.ceil(totalProducts / 7),
        totalRecords: totalProducts,
        hasNext: page < Math.ceil(totalProducts / 7),
        hasPrev: page > 1,
      });
    } catch (error) {
      console.error("Error fetching average price data:", error);
      showToast("error", "Failed to fetch average price data");

      // Reset data on error
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

  const exportToExcel = () => {
    showToast("info", "Export feature coming soon");
  };

  // Render Pagination Component
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasPrev
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          <ChevronLeft size={16} />
          Prev
        </button>

        {/* Page Numbers */}
        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() =>
                typeof page === "number" ? handlePageChange(page) : null
              }
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number"
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
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
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasNext
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    );
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Average Price</p>
            <p className="text-2xl font-bold text-gray-800">
              $
              {data.summary.averagePrice?.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              }) || "0.00"}
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
          </div>
          <Package className="w-8 h-8 text-blue-500" />
        </div>
      </div>
    </div>
  );

  // Render table headers - Removed Units Sold and Total Revenue
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

  // Render table row - Removed Units Sold and Total Revenue columns
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
          <div className="text-xs text-gray-500">{product.sku || "N/A"}</div>
        </div>
      </td>
      <td className="p-3">
        <div className="text-sm text-gray-900 capitalize">
          {product.category || product.productCategory || "N/A"}
        </div>
      </td>
      <td className="p-3 text-sm font-semibold text-blue-600">
        {(product.averagePrice || product.lc || 0)?.toLocaleString(
          undefined,
          { maximumFractionDigits: 2 }
        )}
      </td>
    </tr>
  );

  const getColSpan = () => 5; // Updated to 5 columns (removed 2 columns)

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
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} />
            Export Excel
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
