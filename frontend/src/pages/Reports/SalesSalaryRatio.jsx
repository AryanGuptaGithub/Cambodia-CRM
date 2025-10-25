import React, { useState, useEffect,useRef } from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  DollarSign,
  BarChart3,
  Percent,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const SalesSalaryRatio = () => {
  const [data, setData] = useState({
    summary: {
      totalSales: 0,
      totalSalary: 0,
      ratio: 0,
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
  const itemsPerPage = 7;

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  const fetchSalesSalaryData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: itemsPerPage,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/sales-salary-ratio`,
        { params }
      );
      
      setData(
        response.data.data || {
          summary: {
            totalSales: 0,
            totalSalary: 0,
            ratio: 0,
          },
          records: [],
        }
      );

      setPagination(
        response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        }
      );
    } catch (error) {
      console.error("Error fetching sales salary ratio data:", error);
      showToast("error", "Failed to fetch sales salary ratio data");
      setData({
        summary: {
          totalSales: 0,
          totalSalary: 0,
          ratio: 0,
        },
        records: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesSalaryData(1);
  }, []);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchSalesSalaryData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchSalesSalaryData(1);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchSalesSalaryData(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Sales</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.totalSales?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-green-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Salary</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.totalSalary?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <Users className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Sales/Salary Ratio</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.ratio?.toFixed(2) || 0}`
              )}
            </div>
          </div>
          <Percent className="w-8 h-8 text-purple-500" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Sales / Salary Ratio Report
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
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
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {renderSummaryCards()}
      
      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="text-center text-gray-500">
          {loading ? (
            <div className="flex justify-center items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="ml-2">Loading sales salary ratio data...</span>
            </div>
          ) : (
            <p>Sales salary ratio analysis will be displayed here</p>
          )}
        </div>
      </div>
      
      {renderPagination()}
    </div>
  );
};

export default SalesSalaryRatio;