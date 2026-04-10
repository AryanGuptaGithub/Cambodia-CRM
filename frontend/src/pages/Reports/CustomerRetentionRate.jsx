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
  DollarSign,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CustomerRetentionRate = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      newCustomers: 0,
      existingCustomers: 0,
      retentionRate: 0,
      totalSalesAmount: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    pagination.totalPages,
  );
  const itemsPerPage = 7;

  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  const toggleZoneExpansion = (zoneId) => {
    setExpandedZones((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(zoneId)) newSet.delete(zoneId);
      else newSet.add(zoneId);
      return newSet;
    });
  };

  const fetchRetentionData = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const params = { page, limit: itemsPerPage };
      if (search && search.trim()) params.search = search.trim();
      const response = await axios.get(
        `${backendUrl}/api/reports/customer-repeate`,
        { params },
      );
      setData(
        response.data.data || {
          summary: {
            totalCustomers: 0,
            newCustomers: 0,
            existingCustomers: 0,
            retentionRate: 0,
            totalSalesAmount: 0,
          },
          records: [],
        },
      );
      setPagination(
        response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      );
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to fetch customer retention data");
      setData({
        summary: {
          totalCustomers: 0,
          newCustomers: 0,
          existingCustomers: 0,
          retentionRate: 0,
          totalSalesAmount: 0,
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
  useEffect(() => {
    const timer = setTimeout(() => fetchRetentionData(1, searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchRetentionData(page);
  };
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchRetentionData(1);
  };
  const handleSearchKey = (e) => {
    if (e.key === "Enter") fetchRetentionData(1);
  };

  const exportToExcel = async () => {
    if (data.records.length === 0) {
      showToast("warning", "No records to export");
      return;
    }
    setExporting(true);
    try {
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      const queryString = new URLSearchParams(params).toString();
      const response = await axios.get(
        `${backendUrl}/api/reports/customer-repeate/export?${queryString}`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Customer_Retention_Report_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "Excel report downloaded successfully!");
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to download Excel report");
    } finally {
      setExporting(false);
    }
  };

  // Summary Cards (4 cards)
  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Customers (All Time)</p>
            {loading ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.totalCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <Users className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">
              Existing Customers (Before Jan 1)
            </p>
            {loading ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.existingCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <Users className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">New Customers (YTD)</p>
            {loading ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-gray-800">
                {data.summary.newCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <TrendingUp className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Retention Rate</p>
            {loading ? (
              <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-gray-800">{`${data.summary.retentionRate?.toFixed(1) || 0}%`}</p>
            )}
          </div>
          <BarChart3 className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  // Zone header row
  const renderZoneHeader = (record, index) => {
    const isLastRowOnPage =
      (index + 1) % itemsPerPage === 0 || index + 1 === data.records.length;
    const zoneId = record.zoneId;
    return (
      <tr
        key={`zone-${zoneId}`}
        className={`bg-gray-50 hover:bg-gray-100 ${isLastRowOnPage ? "" : "border-b"}`}
      >
        <td className="p-3 text-sm text-gray-600 font-medium">
          {getSerialNumber(index)}
        </td>
        <td className="p-3 text-sm text-gray-600 font-medium">
          {record.zoneName || "N/A"}
        </td>
        <td className="p-3 text-sm text-gray-600">
          {record.totalCustomers?.toLocaleString() || 0}
        </td>
        <td className="p-3 text-sm font-semibold text-blue-600">
          {record.newCustomers?.toLocaleString() || 0}
        </td>
        <td className="p-3 text-sm font-semibold text-green-600">
          {record.retentionRate?.toFixed(1) || 0}%
        </td>
        <td className="p-3 text-sm text-gray-700">
          $
          {(record.totalSalesAmount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}
        </td>
        <td className="p-3 text-center">
          <button
            onClick={() => toggleZoneExpansion(zoneId)}
            disabled={loading}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs cursor-pointer ${
              expandedZones.has(zoneId)
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Users size={14} />{" "}
            {expandedZones.has(zoneId) ? "Hide Details" : "View Details"}
          </button>
        </td>
      </tr>
    );
  };

  // Customer rows for expanded zone
  const renderCustomerRows = (record, zoneIndex) => {
    const zoneId = record.zoneId;
    if (
      !expandedZones.has(zoneId) ||
      !record.customers ||
      record.customers.length === 0
    )
      return [];

    return record.customers.map((customer, custIndex) => {
      const isLastCustomerRow = custIndex === record.customers.length - 1;
      const isLastZoneRow = zoneIndex === data.records.length - 1;
      return (
        <tr
          key={`cust-${customer.customerId || custIndex}`}
          className={`bg-white hover:bg-gray-50 ${isLastCustomerRow && isLastZoneRow ? "" : "border-b"}`}
        >
          <td className="p-3"></td>
          <td className="p-3 pl-8">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
              <div>
                <div className="text-sm font-medium text-gray-900 capitalize">
                  {customer.customerName || "N/A"}
                </div>
                <div className="text-xs text-gray-500 mt-1 space-y-1">
                  <div>Code: {customer.customerCode || "N/A"}</div>
                  <div>MR: {customer.mrName || "N/A"}</div>
                  <div>Business: {customer.typeOfBusiness || "N/A"}</div>
                </div>
              </div>
            </div>
          </td>
          <td className="p-3 text-sm text-gray-600">
            {customer.totalOrdersAllTime || 0}
          </td>
          <td className="p-3 text-sm text-blue-600">
            {customer.periodOrders || 0}
          </td>
          <td className="p-3 text-sm text-green-600">
            {customer.isNew ? "New" : "Existing"}
          </td>
          <td className="p-3 text-sm text-gray-700">
            $
            {(customer.totalSalesAmountAllTime || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
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
        <th className="p-3 text-sm font-medium">New Customers (YTD)</th>
        <th className="p-3 text-sm font-medium">Retention Rate</th>
        <th className="p-3 text-sm font-medium">Total Sales (All Time)</th>
        <th className="p-3 text-sm font-medium">Action</th>
      </tr>
    </thead>
  );

  const renderTableRows = () => {
    if (loading) {
      return (
        <tr>
          <td colSpan={7} className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          </td>
        </tr>
      );
    }
    if (data.records.length === 0) {
      return (
        <tr>
          <td colSpan={7} className="p-3 text-center text-gray-500">
            No customer retention data found
          </td>
        </tr>
      );
    }
    const rows = [];
    data.records.forEach((record, idx) => {
      rows.push(renderZoneHeader(record, idx));
      rows.push(...renderCustomerRows(record, idx));
    });
    return rows;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Repeat className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">
            Customer Retention Rate (Year-to-Date)
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by zone, customer, MR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={handleSearchKey}
              disabled={loading}
              className={`pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 w-64 ${loading ? "bg-gray-100" : ""}`}
            />
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={18}
            />
            {searchTerm && !loading && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={exportToExcel}
            disabled={exporting || data.records.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md ${
              exporting || data.records.length === 0
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <Download size={18} /> {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {renderSummaryCards()}

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          {renderTableHeaders()}
          <tbody>{renderTableRows()}</tbody>
        </table>
      </div>

      {!loading && pagination.totalPages > 1 && (
        <div className="flex items-center justify-start gap-2 mt-6">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <div className="flex gap-1">
            {visiblePages.map((page, i) => (
              <button
                key={i}
                onClick={() =>
                  typeof page === "number" && handlePageChange(page)
                }
                disabled={typeof page !== "number"}
                className={`min-w-[40px] px-3 py-2 rounded-lg ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white"
                    : typeof page === "number"
                      ? "bg-gray-200 hover:bg-gray-300"
                      : "bg-transparent text-gray-500"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default CustomerRetentionRate;
