import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  User,
  Repeat,
  BarChart3,
  Target,
  Calendar,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CustomerRetentionRate = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      retainedCustomers: 0,
      retentionRate: 0,
      repeatCustomers: 0,
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
  const [expandedZones, setExpandedZones] = useState(new Set());

  const inputRef = useRef(null);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  const itemsPerPage = 7;
  const getSerialNumber = (index) => {
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  // Toggle zone expansion
  const toggleZoneExpansion = (zoneId) => {
    setExpandedZones((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(zoneId)) {
        newSet.delete(zoneId);
      } else {
        newSet.add(zoneId);
      }
      return newSet;
    });
  };

  const fetchRetentionData = async (page = 1, search = searchTerm) => {
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
        `${backendUrl}/api/customer-retention`,
        {
          params,
        }
      );

      setData(
        response.data.data || {
          summary: {
            totalCustomers: 0,
            retainedCustomers: 0,
            retentionRate: 0,
            repeatCustomers: 0,
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
      console.error("Error fetching customer retention data:", error);
      showToast("error", "Failed to fetch customer retention data");

      // Reset data on error
      setData({
        summary: {
          totalCustomers: 0,
          retainedCustomers: 0,
          retentionRate: 0,
          repeatCustomers: 0,
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
    fetchRetentionData(1);
  }, []);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchRetentionData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchRetentionData(1);
  };

  // Debounced search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchRetentionData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchRetentionData(1);
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
          disabled={!pagination.hasPrev || loading}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasPrev && !loading
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
                typeof page === "number" && !loading ? handlePageChange(page) : null
              }
              className={`min-w-[40px] px-3 py-2 rounded-lg cursor-pointer ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number" && !loading
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  : "bg-transparent text-gray-500 cursor-default"
              }`}
              disabled={typeof page !== "number" || loading}
            >
              {page}
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={!pagination.hasNext || loading}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg cursor-pointer ${
            pagination.hasNext && !loading
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

  // Loading Spinner Component
  const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.totalCustomers?.toLocaleString() || 0
              )}
            </p>
          </div>
          <Users className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Retained Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.retainedCustomers?.toLocaleString() || 0
              )}
            </p>
          </div>
          <Repeat className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Retention Rate</p>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.retentionRate?.toFixed(1) || 0}%`
              )}
            </p>
          </div>
          <BarChart3 className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Repeat Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                data.summary.repeatCustomers?.toLocaleString() || 0
              )}
            </p>
          </div>
          <Target className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  // Render zone header row - Fixed border-b for 7th row
  const renderZoneHeader = (record, index) => {
    const isLastRowOnPage = (index + 1) % itemsPerPage === 0 || index + 1 === data.records.length;
    
    return (
      <tr
        key={`zone-${record.zoneId}`}
        className={`bg-gray-50 hover:bg-gray-100 ${
          isLastRowOnPage ? "" : "border-b"
        }`}
      >
        <td className="p-3">
          <div className="text-sm text-gray-600 font-medium">
            {getSerialNumber(index)}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm text-gray-600 font-medium">
            {record.zoneName || "N/A"}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm text-gray-600 font-medium">
            {record.totalCustomers?.toLocaleString() || 0}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm font-semibold text-blue-600">
            {record.retainedCustomers?.toLocaleString() || 0}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm font-semibold text-green-600">
            {record.retentionRate?.toFixed(1) || 0}%
          </div>
        </td>
        <td className="p-3 text-center">
          <div className="flex justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleZoneExpansion(record.zoneId);
              }}
              disabled={loading}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs cursor-pointer ${
                expandedZones.has(record.zoneId)
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Users size={14} />
              {expandedZones.has(record.zoneId)
                ? "Hide Details"
                : "View Details"}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  // Render customer rows for expanded zone - Fixed border-b for last customer row
  const renderCustomerRows = (record, zoneIndex) => {
    const shouldShowCustomers = expandedZones.has(record.zoneId);

    if (
      !shouldShowCustomers ||
      !record.customers ||
      record.customers.length === 0
    ) {
      return null;
    }

    return record.customers.map((customer, customerIndex) => {
      const isLastCustomerRow = customerIndex === record.customers.length - 1;
      const isLastZoneRow = zoneIndex === data.records.length - 1;
      
      return (
        <tr
          key={`customer-${customer.customerId}`}
          className={`bg-white hover:bg-gray-50 ${
            isLastCustomerRow && isLastZoneRow ? "" : "border-b"
          }`}
        >
          <td className="p-3"></td>
          <td className="p-3 pl-8">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <User className="w-4 h-4 text-gray-400 mt-1" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 capitalize">
                  {customer.customerName || "N/A"}
                </div>
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  {customer.customerCode && (
                    <div>Code: {customer.customerCode}</div>
                  )}
                  {customer.typeOfBusiness && (
                    <div>Business: {customer.typeOfBusiness}</div>
                  )}
                  {customer.medicalRepName && (
                    <div>MR: {customer.medicalRepName}</div>
                  )}
                </div>
              </div>
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600">
              {customer.totalSales || 0} sales
            </div>
          </td>
          <td className="p-3">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar size={14} />
              {customer.firstPurchaseDate ? 
                new Date(customer.firstPurchaseDate).toLocaleDateString() : "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-600">
              {customer.lastPurchaseDate ? 
                new Date(customer.lastPurchaseDate).toLocaleDateString() : "N/A"}
            </div>
          </td>
          <td className="p-3"></td>
        </tr>
      );
    });
  };

  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Zone Name / Customer Name</th>
        <th className="p-3 text-sm font-medium">Total Customers</th>
        <th className="p-3 text-sm font-medium">Retained Customers</th>
        <th className="p-3 text-sm font-medium">Retention Rate</th>
        <th className="p-3 text-sm font-medium">Action</th>
      </tr>
    </thead>
  );

  // Get column span
  const getColSpan = () => 6;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <Repeat className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Customer Retention/Repeat Rate
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by zone, customer, MR..."
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyPress={handleSearch}
              disabled={loading}
              className={`pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-64 ${
                loading ? "bg-gray-100 cursor-not-allowed" : ""
              }`}
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
              onClick={() => !loading && inputRef.current?.focus()}
            />
            {searchTerm && !loading && (
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
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              loading 
                ? "bg-gray-400 cursor-not-allowed text-white" 
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
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
                <td colSpan={getColSpan()} className="p-0">
                  <LoadingSpinner />
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => (
                <React.Fragment key={`fragment-${record.zoneId}`}>
                  {renderZoneHeader(record, index)}
                  {renderCustomerRows(record, index)}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-3 text-center text-gray-500"
                >
                  No customer retention data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && renderPagination()}
    </div>
  );
};

export default CustomerRetentionRate;