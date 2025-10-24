import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  User,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  MapPin,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const NewCustomerAddition = () => {
  const [data, setData] = useState({
    summary: {
      totalNewCustomers: 0,
      totalMRs: 0,
      totalZones: 0,
      averageCustomersPerMR: 0,
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
  const [reportTypes, setReportTypes] = useState(["MR Wise", "Zone Wise"]);
  const [selectedReportType, setSelectedReportType] = useState("MR Wise");

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

  const fetchNewCustomerData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page: page,
        limit: 7,
        reportType: selectedReportType,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(`${backendUrl}/api/new-customers`, {
        params,
      });
      setData(
        response.data.data || {
          summary: {
            totalNewCustomers: 0,
            totalMRs: 0,
            totalZones: 0,
            averageCustomersPerMR: 0,
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
      console.error("Error fetching new customer data:", error);
      showToast("error", "Failed to fetch new customer data");

      // Reset data on error
      setData({
        summary: {
          totalNewCustomers: 0,
          totalMRs: 0,
          totalZones: 0,
          averageCustomersPerMR: 0,
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
    fetchNewCustomerData(1);
  }, [selectedReportType]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchNewCustomerData(page);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm("");
    fetchNewCustomerData(1);
  };

  // Debounced search effect
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchNewCustomerData(1, searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") {
      fetchNewCustomerData(1);
    }
  };

  const handleReportTypeChange = (type) => {
    setSelectedReportType(type);
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
            <p className="text-sm text-gray-600">Total New Customers</p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.totalNewCustomers?.toLocaleString() || 0}
            </p>
          </div>
          <User className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              {selectedReportType === "MR Wise" ? "Total MRs" : "Total Zones"}
            </p>
            <p className="text-2xl font-bold text-gray-800">
              {selectedReportType === "MR Wise"
                ? data.summary.totalMRs || 0
                : data.summary.totalZones || 0}
            </p>
          </div>
          {selectedReportType === "MR Wise" ? (
            <Users className="w-8 h-8 text-blue-500" />
          ) : (
            <MapPin className="w-8 h-8 text-blue-500" />
          )}
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              Average per {selectedReportType === "MR Wise" ? "MR" : "Zone"}
            </p>
            <p className="text-2xl font-bold text-gray-800">
              {data.summary.averageCustomersPerMR?.toFixed(1) || 0}
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Growth Rate</p>
            <p className="text-2xl font-bold text-gray-800">
              +{data.summary.growthRate?.toFixed(1) || 0}%
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  const renderTableHeaders = () => {
    if (selectedReportType === "MR Wise") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">MR ID</th>
            <th className="p-3 text-sm font-medium">MR Name</th>
            <th className="p-3 text-sm font-medium">Contact</th>
            <th className="p-3 text-sm font-medium">Zone</th>
            <th className="p-3 text-sm font-medium">New Customers</th>
          </tr>
        </thead>
      );
    } else {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Zone ID</th>
            <th className="p-3 text-sm font-medium">Zone Name</th>
            <th className="p-3 text-sm font-medium">Total MRs</th>
            <th className="p-3 text-sm font-medium">New Customers</th>
            <th className="p-3 text-sm font-medium">Average per MR</th>
          </tr>
        </thead>
      );
    }
  };

  const renderTableRow = (record, index) => {
    if (selectedReportType === "MR Wise") {
      return (
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
            <div className="text-sm text-gray-600 font-medium">
              {record.mrId || "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div>
              <div className="text-sm font-medium text-gray-900 capitalize">
                {record.mrName}
              </div>
              <div className="text-xs text-gray-500">
                {record.email || "N/A"}
              </div>
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-900">
              {record.contactNo || "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm text-gray-900 capitalize">
              {record.zone || "N/A"}
            </div>
          </td>
          <td className="p-3 text-sm font-semibold text-blue-600">
            {record.newCustomers?.toLocaleString() || 0}
          </td>
        </tr>
      );
    } else {
      return (
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
            <div className="text-sm text-gray-600 font-medium">
              {record.zoneId || "N/A"}
            </div>
          </td>
          <td className="p-3">
            <div className="text-sm font-medium text-gray-900 capitalize">
              {record.zoneName}
            </div>
          </td>
          <td className="p-3 text-sm font-semibold text-gray-800">
            {record.totalMRs?.toLocaleString() || 0}
          </td>
          <td className="p-3 text-sm font-semibold text-blue-600">
            {record.newCustomers?.toLocaleString() || 0}
          </td>
          <td className="p-3 text-sm font-semibold text-green-600">
            {record.averagePerMR?.toFixed(1) || 0}
          </td>
        </tr>
      );
    }
  };

  // Calculate colspan for loading and empty states
  const getColSpan = () => {
    return selectedReportType === "MR Wise" ? 7 : 7;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            New Customer Addition
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search by ${
                selectedReportType === "MR Wise" ? "MR name" : "zone name"
              }...`}
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

      {/* Report Type Tabs */}
      <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
        <div className="flex flex-wrap gap-2 mb-4">
          {reportTypes.map((type) => (
            <button
              key={type}
              onClick={() => handleReportTypeChange(type)}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedReportType === type
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {type}
            </button>
          ))}
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
              data.records.map((record, index) => renderTableRow(record, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className="p-3 text-center text-gray-500"
                >
                  No new customer data found
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

export default NewCustomerAddition;
