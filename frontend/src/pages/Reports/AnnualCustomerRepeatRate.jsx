import React, { useState, useEffect, useRef } from "react";
import {formatDateToReadable} from '../../utils/dateUtil.js';
import {
  TrendingUp,
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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const AnnualCustomerRepeatRate = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      repeatCustomers: 0,
      repeatRate: 0,
      newCustomers: 0,
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

  // Get serial number
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  const fetchAnnualRepeatData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: itemsPerPage,
        period: "last_year",
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/annual-customer-repeat-rate`,
        { params }
      );

      setData(
        response.data.data || {
          summary: {
            totalCustomers: 0,
            repeatCustomers: 0,
            repeatRate: 0,
            newCustomers: 0,
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
      console.error("Error fetching annual customer repeat rate data:", error);
      showToast("error", "Failed to fetch annual customer repeat rate data");

      setData({
        summary: {
          totalCustomers: 0,
          repeatCustomers: 0,
          repeatRate: 0,
          newCustomers: 0,
        },
        records: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnualRepeatData(1);
  }, []);

  // Handle pagination
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchAnnualRepeatData(page);
    }
  };

  // Search handlers
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchAnnualRepeatData(1);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchAnnualRepeatData(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchAnnualRepeatData(1);
    }
  };

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  // Render pagination
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

  // Summary Cards - FIXED: Removed <div> inside <p>
  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Customers</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.totalCustomers || 0
              )}
            </div>
          </div>
          <Users className="w-8 h-8 text-green-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Repeat Customers</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.repeatCustomers || 0
              )}
            </div>
          </div>
          <Repeat className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Repeat Rate</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.repeatRate?.toFixed(2) || 0}%`
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
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.newCustomers || 0
              )}
            </div>
          </div>
          <Target className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Customer Name</th>
        <th className="p-3 text-sm font-medium">Total Purchases</th>
        <th className="p-3 text-sm font-medium">First Purchase</th>
        <th className="p-3 text-sm font-medium">Last Purchase</th>
        <th className="p-3 text-sm font-medium">Status</th>
      </tr>
    </thead>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Annual Customer Repeat Rate
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by customer name..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearch}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
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
                <td colSpan={6} className="p-3 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => (
                <tr
                  key={index}
                  className={`hover:bg-gray-50 ${
                    (index + 1) % itemsPerPage === 0 ||
                    index + 1 === data.records.length
                      ? ""
                      : "border-b"
                  }`}
                >
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {getSerialNumber(index)}
                  </td>
                  <td className="p-3 text-sm text-gray-800">
                    {record.customerName || "N/A"}
                  </td>
                  <td className="p-3 text-sm text-gray-800">
                    {record.totalPurchases || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {record.firstPurchaseDate
                      ? formatDateToReadable(record.firstPurchaseDate)
                      : "N/A"}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {record.lastPurchaseDate
                      ? formatDateToReadable(record.lastPurchaseDate)
                      : "N/A"}
                  </td>
                  <td
                    className={`p-3 text-sm font-semibold ${
                      record.isRepeatCustomer
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  >
                    {record.isRepeatCustomer ? "Repeat" : "One-Time"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-3 text-gray-500 text-center">
                  No annual customer repeat data found
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

export default AnnualCustomerRepeatRate;