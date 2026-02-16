import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Percent,
  PackageCheck,
  Users,
  Eye,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CustomerProductAcceptanceRate = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      totalProducts: 0,
      totalAccepted: 0,
      totalRejected: 0,
      acceptanceRate: 0,
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
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages
  );

  // Get serial number
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  // Fetch Data
  const fetchAcceptanceData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      let params = {
        page,
        limit: itemsPerPage,
      };

      if (search && search.trim() !== "") {
        params.search = search.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/customer-expectation-ratio`,
        { params }
      );

      setData(
        response.data.data || {
          summary: {
            totalCustomers: 0,
            totalProducts: 0,
            totalAccepted: 0,
            totalRejected: 0,
            acceptanceRate: 0,
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
      showToast("error", "Failed to fetch acceptance rate data");
      setData({
        summary: {
          totalCustomers: 0,
          totalProducts: 0,
          totalAccepted: 0,
          totalRejected: 0,
          acceptanceRate: 0,
        },
        records: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAcceptanceData(1);
  }, []);

  // Pagination
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchAcceptanceData(page);
    }
  };

  // Search handlers
  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchAcceptanceData(1);
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchAcceptanceData(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") fetchAcceptanceData(1);
  };

  // Export to Excel function
  const exportToExcel = async () => {
    setExportLoading(true);
    try {
      const params = {};
      if (searchTerm && searchTerm.trim() !== "") {
        params.search = searchTerm.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/customer-expectation-ratio/export`,
        {
          params,
          responseType: 'blob', // Important for file download
        }
      );

      // Create blob from response
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = `customer_product_acceptance_rate_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      console.error('Export error:', error);
      showToast("error", "Failed to export to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  // Pagination render
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-start gap-2 mt-6">
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
            pagination.hasPrev
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
           ← Prev
        </button>

        <div className="flex gap-1">
          {visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() =>
                typeof page === "number" ? handlePageChange(page) : null
              }
              className={`min-w-[40px] px-3 py-2 rounded-lg ${
                page === pagination.currentPage
                  ? "bg-indigo-600 text-white"
                  : typeof page === "number"
                  ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  : "bg-transparent text-gray-500"
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
          className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
            pagination.hasNext
              ? "bg-gray-200 hover:bg-gray-300 text-gray-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next →
        </button>
      </div>
    );
  };

  // Summary Cards
  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
      <SummaryCard
        title="Total Customers"
        value={data.summary.totalCustomers}
        icon={<Users className="w-8 h-8 text-green-500" />}
        borderColor="border-green-500"
      />
      <SummaryCard
        title="Total Products"
        value={data.summary.totalProducts}
        icon={<PackageCheck className="w-8 h-8 text-blue-500" />}
        borderColor="border-blue-500"
      />
      <SummaryCard
        title="Accepted"
        value={data.summary.totalAccepted}
        icon={<Eye className="w-8 h-8 text-purple-500" />}
        borderColor="border-purple-500"
      />
      <SummaryCard
        title="Rejected"
        value={data.summary.totalRejected}
        icon={<TrendingUp className="w-8 h-8 text-red-500" />}
        borderColor="border-red-500"
      />
      <SummaryCard
        title="Acceptance Rate"
        value={`${data.summary.acceptanceRate?.toFixed(2)}%`}
        icon={<Percent className="w-8 h-8 text-orange-500" />}
        borderColor="border-orange-500"
      />
    </div>
  );

  const SummaryCard = ({ title, value, icon, borderColor }) => (
    <div
      className={`bg-white p-6 rounded-xl shadow-md border-l-4 ${borderColor}`}
    >
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );

  // Updated table headers
  const renderTableHeaders = () => (
    <thead className="bg-gray-100 text-gray-700 border-b">
      <tr>
        <th className="p-3 text-sm font-medium">Sr.No</th>
        <th className="p-3 text-sm font-medium">Customer Name</th>
        <th className="p-3 text-sm font-medium">Product Name</th>
        <th className="p-3 text-sm font-medium">Accepted</th>
        <th className="p-3 text-sm font-medium">Rejected</th>
        <th className="p-3 text-sm font-medium">Total Sales</th>
        <th className="p-3 text-sm font-medium">Acceptance %</th>
      </tr>
    </thead>
  );

  return (
    <div className="p-6">
      {/* Header + Search */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Customer Product Acceptance Rate
        </h1>

        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by customer or product..."
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
            disabled={exportLoading}
            className={`flex items-center gap-2 ${
              exportLoading 
                ? 'bg-green-500 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700'
            } text-white px-4 py-2 rounded-xl shadow-md cursor-pointer`}
          >
            {exportLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Exporting...
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

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-3 text-center">
                  <div className="flex justify-center items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span className="ml-2">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((record, index) => (
                <tr key={index} className="hover:bg-gray-50 border-b">
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {getSerialNumber(index)}
                  </td>
                  <td className="p-3 text-sm text-gray-800">
                    {record.customerName || "N/A"}
                  </td>
                  <td className="p-3 text-sm text-gray-800">
                    {record.productName
                      ? record.productName.charAt(0).toUpperCase() +
                        record.productName.slice(1).toLowerCase()
                      : "N/A"}
                  </td>
                  <td className="p-3 text-sm text-green-600 font-semibold">
                    {record.acceptedCount || 0}
                  </td>
                  <td className="p-3 text-sm text-red-500 font-semibold">
                    {record.rejectedCount || 0}
                  </td>
                  <td className="p-3 text-sm text-gray-700 font-medium">
                    {record.totalProducts || 0}
                  </td>
                  <td className="p-3 text-sm text-blue-600 font-semibold">
                    {record.acceptanceRate?.toFixed(2) || 0}%
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="p-3 text-gray-500 text-center">
                  No customer product acceptance data found
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

export default CustomerProductAcceptanceRate;