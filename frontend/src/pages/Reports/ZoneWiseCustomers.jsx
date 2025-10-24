import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  MapPin,
  Users,
  User,
  Phone,
  Building,
  Eye,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const ZoneWiseCustomers = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      totalZones: 0,
      totalMRs: 0,
      averageCustomersPerZone: 0,
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

  const fetchZoneWiseData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: 7,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/zone-wise-customers`,
        {
          params,
        }
      );

      setData(
        response.data.data || {
          summary: {
            totalCustomers: 0,
            totalZones: 0,
            totalMRs: 0,
            averageCustomersPerZone: 0,
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
      console.error("Error fetching zone wise customer data:", error);
      showToast("error", "Failed to fetch zone wise customer data");

      // Reset data on error
      setData({
        summary: {
          totalCustomers: 0,
          totalZones: 0,
          totalMRs: 0,
          averageCustomersPerZone: 0,
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
    fetchZoneWiseData(1);
  }, []);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchZoneWiseData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchZoneWiseData(1);
  };

  // Debounced search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchZoneWiseData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchZoneWiseData(1);
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
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalCustomers?.toLocaleString() || 0}
            </p>
          </div>
          <Users className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Zones</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalZones || 0}
            </p>
          </div>
          <MapPin className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total MRs</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalMRs || 0}
            </p>
          </div>
          <User className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Avg per Zone</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.averageCustomersPerZone?.toFixed(1) || 0}
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  // Render zone header row
  const renderZoneHeader = (record, index) => (
    <tr
      key={`zone-${record.zoneId}`}
      className={`hover:bg-gray-50 ${
        (index + 1) % itemsPerPage === 0 || index + 1 === data.summary.totalZones
          ? ""
          : "border-b"
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
          {record.totalMRs?.toLocaleString() || 0}
        </div>
      </td>
      <td className="p-3">
        <div className="text-sm font-semibold text-blue-600">
          {record.totalCustomers?.toLocaleString() || 0}
        </div>
      </td>
      <td className="p-3">
        <div className="text-sm font-semibold text-green-600">
          {record.averagePerMR?.toFixed(1) || 0}
        </div>
      </td>
      <td className="p-3 text-center">
        <div className="flex justify-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleZoneExpansion(record.zoneId);
            }}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs cursor-pointer ${
              expandedZones.has(record.zoneId)
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
            }`}
          >
            <Eye size={14} />
            {expandedZones.has(record.zoneId)
              ? "Hide Customers"
              : "View Customers"}
          </button>
        </div>
      </td>
    </tr>
  );

  // Render customer rows for expanded zone
  const renderCustomerRows = (record) => {
    const shouldShowCustomers = expandedZones.has(record.zoneId);

    if (
      !shouldShowCustomers ||
      !record.customers ||
      record.customers.length === 0
    ) {
      return null;
    }

    return record.customers.map((customer, customerIndex) => (
      <tr
        key={`customer-${customer.customerId}`}
        className="bg-white hover:bg-gray-50 border-b"
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
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Phone size={14} />
            {customer.contactNumber || "N/A"}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm text-gray-600">
            {customer.province || "N/A"}
          </div>
        </td>
        <td className="p-3">
          <div className="text-sm text-gray-600">
            {customer.address || "N/A"}
          </div>
        </td>
        <td className="p-3"></td>
      </tr>
    ));
  };

  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Zone Name / Customer Name</th>
        <th className="p-3 text-sm font-medium">MR Count</th>
        <th className="p-3 text-sm font-medium">Customer Count</th>
        <th className="p-3 text-sm font-medium">MR Average</th>
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
          <MapPin className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Zone Wise Customers
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
              data.records.map((record, index) => (
                <React.Fragment key={`fragment-${record.zoneId}`}>
                  {renderZoneHeader(record, index)}
                  {renderCustomerRows(record)}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-3 text-center text-gray-500"
                >
                  No zone wise customer data found
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

export default ZoneWiseCustomers;
