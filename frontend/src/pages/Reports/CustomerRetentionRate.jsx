import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Download,
  Search,
  X,
  Users,
  User,
  Repeat,
  BarChart3,
  Menu,
  ShoppingCart,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ── Resolve the best display label for a zone record ─────────────────────────
// Backend already sends zoneName with the fallback applied (zone → province → address → "Not Provided")
// This helper is used as a safety net on the frontend if needed.
const resolveZoneDisplay = (zoneName) => {
  if (!zoneName) return "Not Provided";
  const trimmed = zoneName.trim();
  if (
    !trimmed ||
    ["-", "--", "n/a", "na", "none", "null", "undefined"].includes(
      trimmed.toLowerCase(),
    )
  ) {
    return "Not Provided";
  }
  return trimmed;
};

const CustomerRetentionRate = () => {
  const [data, setData] = useState({
    summary: {
      analysisYear: new Date().getFullYear() - 1,
      totalCustomers: 0,
      newCustomers: 0,
      existingCustomers: 0,
      retentionRate: 0,
      totalPeriodOrders: 0,
      newCustomerPeriodOrders: 0,
      existingCustomerPeriodOrders: 0,
      avgOrdersPerExistingCustomer: 0,
      totalPeriodSalesAmount: 0,
      newCustomerPeriodSales: 0,
      existingCustomerPeriodSales: 0,
      totalSalesAmountAllTime: 0,
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

  const inputRef = useRef(null);
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const itemsPerPage = 7;

  const analysisYear =
    data.summary?.analysisYear || new Date().getFullYear() - 1;

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
            analysisYear: new Date().getFullYear() - 1,
            totalCustomers: 0,
            newCustomers: 0,
            existingCustomers: 0,
            retentionRate: 0,
            totalPeriodOrders: 0,
            newCustomerPeriodOrders: 0,
            existingCustomerPeriodOrders: 0,
            avgOrdersPerExistingCustomer: 0,
            totalPeriodSalesAmount: 0,
            newCustomerPeriodSales: 0,
            existingCustomerPeriodSales: 0,
            totalSalesAmountAllTime: 0,
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
          analysisYear: new Date().getFullYear() - 1,
          totalCustomers: 0,
          newCustomers: 0,
          existingCustomers: 0,
          retentionRate: 0,
          totalPeriodOrders: 0,
          newCustomerPeriodOrders: 0,
          existingCustomerPeriodOrders: 0,
          avgOrdersPerExistingCustomer: 0,
          totalPeriodSalesAmount: 0,
          newCustomerPeriodSales: 0,
          existingCustomerPeriodSales: 0,
          totalSalesAmountAllTime: 0,
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
    fetchRetentionData(1, "");
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
        `Customer_Retention_Report_${analysisYear}_${new Date().toISOString().split("T")[0]}.xlsx`,
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

  // ── Summary Cards ─────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    const { summary } = data;
    const cards = [
      {
        label: "Total Customers",
        sublabel: `Existing + New (${analysisYear})`,
        value: summary.totalCustomers?.toLocaleString() || "0",
        color: "green",
        icon: (
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
      },
      {
        label: `Existing Customers`,
        sublabel: `Before 1 Jan ${analysisYear}`,
        value: summary.existingCustomers?.toLocaleString() || "0",
        color: "blue",
        icon: (
          <Users
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
      },
      {
        label: `New Customers (${analysisYear})`,
        sublabel: `First purchase in ${analysisYear}`,
        value: summary.newCustomers?.toLocaleString() || "0",
        color: "purple",
        icon: (
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        ),
      },
      {
        label: "Retention Rate",
        sublabel: "Existing / Total × 100",
        value: `${summary.retentionRate?.toFixed(1) || "0"}%`,
        color: "orange",
        icon: (
          <BarChart3
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
          />
        ),
      },
      {
        label: `Total Orders (${analysisYear})`,
        sublabel: `New: ${summary.newCustomerPeriodOrders?.toLocaleString() || 0} / Existing: ${summary.existingCustomerPeriodOrders?.toLocaleString() || 0}`,
        value: summary.totalPeriodOrders?.toLocaleString() || "0",
        color: "teal",
        icon: (
          <ShoppingCart
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-teal-500`}
          />
        ),
      },
      {
        label: "Avg Orders / Existing Customer",
        sublabel: `${summary.existingCustomerPeriodOrders || 0} orders ÷ ${summary.existingCustomers || 0} customers`,
        value: summary.avgOrdersPerExistingCustomer?.toFixed(2) || "0.00",
        color: "rose",
        icon: (
          <BarChart3
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-rose-500`}
          />
        ),
      },
    ];

    const borderColors = {
      green: "border-green-500",
      blue: "border-blue-500",
      purple: "border-purple-500",
      orange: "border-orange-500",
      teal: "border-teal-500",
      rose: "border-rose-500",
    };

    return (
      <div
        className={`grid gap-4 mb-6 ${isMobileView ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-6"}`}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md border-l-4 ${borderColors[card.color]} border border-gray-200`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1 min-w-0">
                <p
                  className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-500 font-medium leading-tight`}
                >
                  {card.label}
                </p>
                {loading ? (
                  <div
                    className={`${isMobileView ? "h-5 w-14" : "h-7 w-18"} bg-gray-200 rounded animate-pulse mt-1`}
                  />
                ) : (
                  <p
                    className={`${isMobileView ? "text-sm" : "text-xl"} font-bold text-gray-800 mt-1`}
                  >
                    {card.value}
                  </p>
                )}
                <p
                  className={`${isMobileView ? "text-[9px]" : "text-[10px]"} text-gray-400 mt-1 leading-tight truncate`}
                >
                  {card.sublabel}
                </p>
              </div>
              <div className="ml-2 flex-shrink-0">{card.icon}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Table header ──────────────────────────────────────────────────────────
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={`${thClass} text-left`}>Zone / Province / Address</th>
          <th className={thClass}>Total</th>
          <th className={thClass}>Existing</th>
          <th className={thClass}>New ({analysisYear})</th>
          <th className={thClass}>Retention Rate</th>
          {!isMobileView && (
            <>
              <th className={thClass}>Period Orders</th>
              <th className={thClass}>Existing Orders</th>
              <th className={thClass}>New Orders</th>
            </>
          )}
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    );
  };

  // ── Zone row ──────────────────────────────────────────────────────────────
  const renderZoneHeader = (record, index) => {
    const zoneId = record.zoneId;
    const displayName = resolveZoneDisplay(record.zoneName);
    const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;

    return (
      <tr
        key={`zone-${zoneId}`}
        className="bg-gray-50 hover:bg-gray-100 border-b"
      >
        <td className={tdClass}>
          <span className="text-gray-600 font-medium">
            {getSerialNumber(index)}
          </span>
        </td>
        <td className={`${tdClass} text-left`}>
          <span
            className={`font-medium ${displayName === "Not Provided" ? "text-gray-400 italic" : "text-gray-900"}`}
          >
            {displayName}
          </span>
        </td>
        <td className={tdClass}>
          <span className="text-gray-700 font-semibold">
            {record.totalCustomers?.toLocaleString() || 0}
          </span>
        </td>
        <td className={tdClass}>
          <span className="text-blue-600 font-semibold">
            {record.existingCustomers?.toLocaleString() || 0}
          </span>
        </td>
        <td className={tdClass}>
          <span className="text-purple-600 font-semibold">
            {record.newCustomers?.toLocaleString() || 0}
          </span>
        </td>
        <td className={tdClass}>
          <span
            className={`font-bold ${
              (record.retentionRate || 0) >= 75
                ? "text-green-600"
                : (record.retentionRate || 0) >= 50
                  ? "text-orange-500"
                  : "text-red-500"
            }`}
          >
            {record.retentionRate?.toFixed(1) || "0"}%
          </span>
        </td>
        {!isMobileView && (
          <>
            <td className={tdClass}>
              <span className="text-gray-700">
                {record.totalPeriodOrders?.toLocaleString() || 0}
              </span>
            </td>
            <td className={tdClass}>
              <span className="text-blue-500">
                {record.existingCustomerPeriodOrders?.toLocaleString() || 0}
              </span>
            </td>
            <td className={tdClass}>
              <span className="text-purple-500">
                {record.newCustomerPeriodOrders?.toLocaleString() || 0}
              </span>
            </td>
          </>
        )}
        <td className={`${tdClass} text-center`}>
          <button
            onClick={() => toggleZoneExpansion(zoneId)}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-1 ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-1 text-xs"} rounded-lg cursor-pointer ${
              expandedZones.has(zoneId)
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
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

  // ── Customer rows (expanded) ──────────────────────────────────────────────
  const renderCustomerRows = (record) => {
    const zoneId = record.zoneId;
    if (!expandedZones.has(zoneId) || !record.customers?.length) return [];

    const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;
    const colSpanDesktop = 10;
    const colSpanMobile = 7;

    return record.customers.map((customer, custIndex) => (
      <tr
        key={`cust-${customer.customerId || custIndex}`}
        className="bg-white hover:bg-blue-50 border-b border-dashed border-gray-200"
      >
        {/* Empty Sr.No cell */}
        <td className={tdClass} />

        {/* Customer name + details */}
        <td
          className={`${tdClass} ${isMobileView ? "pl-6" : "pl-8"}`}
          colSpan={isMobileView ? 4 : 3}
        >
          <div className="flex items-start gap-2">
            <User
              className={`${isMobileView ? "w-3 h-3" : "w-4 h-4"} text-gray-400 mt-0.5 flex-shrink-0`}
            />
            <div>
              <div
                className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-900 capitalize`}
              >
                {customer.customerName || "N/A"}
              </div>
              <div
                className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-500 mt-0.5 space-y-0.5`}
              >
                <div>Code: {customer.customerCode || "N/A"}</div>
                <div>MR: {customer.mrName || "N/A"}</div>
                {!isMobileView && (
                  <div>Business: {customer.typeOfBusiness || "N/A"}</div>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Type badge */}
        <td className={tdClass}>
          <span
            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              customer.isNew
                ? "bg-purple-100 text-purple-700"
                : "bg-blue-100 text-blue-700"
            }`}
          >
            {customer.isNew ? `New (${analysisYear})` : "Existing"}
          </span>
        </td>

        {/* Orders in period */}
        <td className={tdClass}>
          <div
            className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-600`}
          >
            <div>
              Period:{" "}
              <span className="font-semibold text-indigo-600">
                {customer.periodOrders || 0}
              </span>
            </div>
            {!isMobileView && (
              <div>All time: {customer.totalOrdersAllTime || 0}</div>
            )}
          </div>
        </td>

        {/* Sales in period (desktop only) */}
        {!isMobileView && (
          <>
            <td className={tdClass}>
              <div className="text-xs text-gray-600">
                <div>
                  Period:{" "}
                  <span className="font-semibold text-green-600">
                    $
                    {(customer.periodSalesAmount || 0).toLocaleString(
                      undefined,
                      { minimumFractionDigits: 2 },
                    )}
                  </span>
                </div>
                <div>
                  All time: $
                  {(customer.totalSalesAmountAllTime || 0).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2 },
                  )}
                </div>
              </div>
            </td>
            {/* Fill remaining header columns */}
            <td className={tdClass} colSpan={3} />
          </>
        )}

        {/* Empty action cell */}
        <td className={tdClass} />
      </tr>
    ));
  };

  // ── Table body rows ───────────────────────────────────────────────────────
  const renderTableRows = () => {
    const colSpan = isMobileView ? 7 : 10;
    if (loading) {
      return (
        <tr>
          <td colSpan={colSpan} className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto" />
          </td>
        </tr>
      );
    }
    if (data.records.length === 0) {
      return (
        <tr>
          <td colSpan={colSpan} className="p-6 text-center text-gray-500">
            No customer retention data found
          </td>
        </tr>
      );
    }
    const rows = [];
    data.records.forEach((record, idx) => {
      rows.push(renderZoneHeader(record, idx));
      rows.push(...renderCustomerRows(record));
    });
    return rows;
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={!pagination.hasPrev}
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
          disabled={!pagination.hasNext}
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
        <div className="flex justify-between items-center mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <Repeat className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">
              Retention Rate {analysisYear}
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            {pagination.totalRecords} zones
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Repeat className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Customer Retention Rate — {analysisYear}
              </h1>
              <p className="text-sm text-gray-500">
                Full year: 1 Jan {analysisYear} – 31 Dec {analysisYear}
              </p>
            </div>
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
                  ? "bg-gray-400 cursor-not-allowed text-white"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              <Download size={18} />
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

      {/* ── Summary Cards ── */}
      {renderSummaryCards()}

      {/* ── Table ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[520px]" : "min-w-[900px]"}`}
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
