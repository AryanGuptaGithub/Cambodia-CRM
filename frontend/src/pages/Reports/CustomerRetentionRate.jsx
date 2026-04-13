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
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

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

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  // ─────────────────────────────────────────────────────────────────────────

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

  // Summary Cards (4 cards) - Responsive
  const renderSummaryCards = () => (
    <div
      className={`grid gap-4 mb-6 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-6"}`}
    >
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Total Customers
            </p>
            {loading ? (
              <div
                className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
              ></div>
            ) : (
              <p
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {data.summary.totalCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Existing Customers
            </p>
            {loading ? (
              <div
                className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
              ></div>
            ) : (
              <p
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {data.summary.existingCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              New Customers (YTD)
            </p>
            {loading ? (
              <div
                className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
              ></div>
            ) : (
              <p
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {data.summary.newCustomers?.toLocaleString() || 0}
              </p>
            )}
          </div>
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Retention Rate
            </p>
            {loading ? (
              <div
                className={`${isMobileView ? "h-6 w-16" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
              ></div>
            ) : (
              <p
                className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
              >
                {`${data.summary.retentionRate?.toFixed(1) || 0}%`}
              </p>
            )}
          </div>
          <BarChart3
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
          />
        </div>
      </div>
    </div>
  );

  // Zone header row - Responsive
  const renderZoneHeader = (record, index) => {
    const isLastRowOnPage =
      (index + 1) % itemsPerPage === 0 || index + 1 === data.records.length;
    const zoneId = record.zoneId;
    const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;
    return (
      <tr
        key={`zone-${zoneId}`}
        className={`bg-gray-50 hover:bg-gray-100 ${isLastRowOnPage ? "" : "border-b"}`}
      >
        <td className={tdClass}>
          <span className="text-gray-600 font-medium">
            {getSerialNumber(index)}
          </span>
        </td>
        <td className={tdClass}>
          <span className="font-medium text-gray-900">
            {record.zoneName || "N/A"}
          </span>
        </td>
        <td className={tdClass}>
          <span className="text-gray-600">
            {record.totalCustomers?.toLocaleString() || 0}
          </span>
        </td>
        <td className={`${tdClass} font-semibold text-blue-600`}>
          {record.newCustomers?.toLocaleString() || 0}
        </td>
        <td className={`${tdClass} font-semibold text-green-600`}>
          {record.retentionRate?.toFixed(1) || 0}%
        </td>
        {!isMobileView && (
          <td className={tdClass}>
            <span className="text-gray-700">
              $
              {(record.totalSalesAmount || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span>
          </td>
        )}
        <td className={`${tdClass} text-center`}>
          <button
            onClick={() => toggleZoneExpansion(zoneId)}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-1 ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-1 text-xs"} rounded-lg cursor-pointer ${
              expandedZones.has(zoneId)
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Users size={isMobileView ? 12 : 14} />
            {expandedZones.has(zoneId)
              ? isMobileView
                ? "Hide"
                : "Hide Details"
              : isMobileView
                ? "View"
                : "View Details"}
          </button>
        </td>
      </tr>
    );
  };

  // Customer rows for expanded zone - Responsive
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
      const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;
      return (
        <tr
          key={`cust-${customer.customerId || custIndex}`}
          className={`bg-white hover:bg-gray-50 ${isLastCustomerRow && isLastZoneRow ? "" : "border-b"}`}
        >
          <td className={tdClass}> </td>
          <td className={`${tdClass} ${isMobileView ? "pl-6" : "pl-8"}`}>
            <div className="flex items-start gap-2 md:gap-3">
              <User
                className={`${isMobileView ? "w-3 h-3" : "w-4 h-4"} text-gray-400 mt-1 flex-shrink-0`}
              />
              <div>
                <div
                  className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-900 capitalize`}
                >
                  {customer.customerName || "N/A"}
                </div>
                <div
                  className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-500 mt-1 space-y-1`}
                >
                  <div>Code: {customer.customerCode || "N/A"}</div>
                  <div>MR: {customer.mrName || "N/A"}</div>
                  {!isMobileView && (
                    <div>Business: {customer.typeOfBusiness || "N/A"}</div>
                  )}
                </div>
                {isMobileView && (
                  <div className="text-[10px] text-gray-500 mt-1">
                    Business: {customer.typeOfBusiness || "N/A"}
                  </div>
                )}
              </div>
            </div>
          </td>
          <td className={tdClass}>{customer.totalOrdersAllTime || 0}</td>
          <td className={`${tdClass} text-blue-600`}>
            {customer.periodOrders || 0}
          </td>
          <td
            className={`${tdClass} ${customer.isNew ? "text-green-600" : "text-orange-600"}`}
          >
            {customer.isNew ? "New" : "Existing"}
          </td>
          {!isMobileView && (
            <td className={tdClass}>
              $
              {(customer.totalSalesAmountAllTime || 0).toLocaleString(
                undefined,
                {
                  minimumFractionDigits: 2,
                },
              )}
            </td>
          )}
          <td className={tdClass}> </td>
        </tr>
      );
    });
  };

  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Zone / Customer</th>
          <th className={thClass}>Total</th>
          <th className={thClass}>New</th>
          <th className={thClass}>Rate</th>
          {!isMobileView && <th className={thClass}>Total Sales</th>}
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    );
  };

  const renderTableRows = () => {
    if (loading) {
      const colSpan = isMobileView ? 6 : 7;
      return (
        <tr>
          <td colSpan={colSpan} className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          </td>
        </tr>
      );
    }
    if (data.records.length === 0) {
      const colSpan = isMobileView ? 6 : 7;
      return (
        <tr>
          <td colSpan={colSpan} className="p-3 text-center text-gray-500">
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

  // Pagination - Responsive
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          visiblePages.map((page, idx) => (
            <button
              key={idx}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              disabled={page === "..."}
              className={`px-4 py-2 rounded text-sm ${
                page === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : pagination.currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))
        ) : (
          <span className="px-3 py-1 text-sm text-gray-700 font-medium">
            Page {pagination.currentPage} of {pagination.totalPages}
          </span>
        )}
        <button
          onClick={() => handlePageChange(pagination.currentPage + 1)}
          disabled={pagination.currentPage === pagination.totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* ── Sidebar (mobile only) ── */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Repeat className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">
              Retention Rate
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
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
              <Download size={18} />{" "}
              {exporting ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-4">
          <input
            ref={inputRef}
            type="text"
            placeholder="Search zone, customer, MR..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleSearchKey}
            disabled={loading}
            className={`pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 w-full text-sm ${loading ? "bg-gray-100" : ""}`}
          />
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && !loading && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {renderSummaryCards()}

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[500px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>{renderTableRows()}</tbody>
        </table>
      </div>

      {renderPagination()}
    </div>
  );
};

export default CustomerRetentionRate;
