import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  Search,
  TrendingUp,
  Users,
  FileText,
  Target,
  Download,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatPercentage } from "../../utils/formatPercentage";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const ProvinceWiseCustomer = () => {
  const [data, setData] = useState({
    summary: {
      totalCustomers: 0,
      totalProvinces: 0,
      newCustomers: 0,
      activeCustomers: 0,
      totalSalesAmount: 0,
      averageCustomersPerProvince: 0,
      customerActivationRate: 0,
    },
    records: [],
    uniqueProvincesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [period, setPeriod] = useState("all");
  const [expandedProvince, setExpandedProvince] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);
  const inputRef = useRef(null);

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

  const itemsPerPage = 6;

  useEffect(() => {
    fetchProvinceData();
  }, [currentPage, period, searchTerm]);

  const fetchProvinceData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/reports/province-wise-customers`,
        {
          params: {
            page: currentPage,
            limit: itemsPerPage,
            search: searchTerm,
            period,
          },
        },
      );

      if (response.data.success) {
        setData({
          ...response.data.data,
          pagination: response.data.pagination,
        });
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (err) {
      console.error("Error fetching province data:", err);
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load province-wise customer data");
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      setExportLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (period !== "all") params.append("period", period);

      const response = await axios.get(
        `${backendUrl}/api/reports/province-wise-customers/export`,
        { params, responseType: "blob" },
      );

      const blob = new Blob([response.data], {
        type: response.headers["content-type"],
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `province_wise_customers_${
        new Date().toISOString().split("T")[0]
      }.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast("success", "Export downloaded successfully!");
    } catch (err) {
      console.error("Error exporting data:", err);
      showToast("error", "Failed to export data. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const toggleProvinceExpand = (province) => {
    setExpandedProvince(expandedProvince === province ? null : province);
  };

  const getVisiblePages = (cp, tp) => {
    if (tp <= 5) return Array.from({ length: tp }, (_, i) => i + 1);
    if (cp <= 3) return [1, 2, 3, "...", tp];
    if (cp >= tp - 2) return [1, "...", tp - 2, tp - 1, tp];
    return [1, "...", cp, "...", tp];
  };

  const { summary, records, pagination } = data;
  const visiblePages = pagination
    ? getVisiblePages(currentPage, pagination.totalPages)
    : [];

  // ── Pagination (Daily Report Style) ───────────────────────────────────────
  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;
    const totalPages = pagination.totalPages;
    const currentPg = currentPage;

    return (
      <div
        className={`mt-4 p-3 md:p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"} flex-wrap`}
      >
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPg === 1}
          className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Prev
        </button>

        {isMobileView ? (
          // Mobile: Simple page indicator (like Daily Reports)
          <span className="px-3 py-1.5 text-sm text-gray-700 font-medium">
            Page {currentPg} of {totalPages}
          </span>
        ) : (
          // Desktop: Full pagination with numbers
          visiblePages.map((page, idx) =>
            page === "..." ? (
              <span
                key={`e-${idx}`}
                className="px-3 py-1.5 md:px-4 md:py-2 text-gray-500 select-none"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1.5 md:px-4 md:py-2 rounded text-sm transition cursor-pointer ${
                  currentPg === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            ),
          )
        )}

        <button
          onClick={() => {
            setCurrentPage((p) => Math.min(p + 1, totalPages));
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          disabled={currentPg === totalPages}
          className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    );
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      </div>
    );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-red-500 text-center">
          <p className="text-lg font-semibold">Error Loading Data</p>
          <p className="text-sm text-gray-600">{error}</p>
          <button
            onClick={fetchProvinceData}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`${isMobileView ? "p-3 pb-6" : "p-6"} relative`}>
      {/* Sidebar (mobile only) */}
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
            <Target className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">
              Province Analytics
            </h1>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {summary.totalProvinces}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Province-wise Customer Analytics
            </h1>
            <p className="text-gray-600 mt-1">
              Analyze customer distribution and performance across provinces
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={20}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search provinces..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 w-64"
              />
            </div>

            {/* Export button — desktop only */}
            <button
              onClick={exportToCSV}
              disabled={exportLoading || records.length === 0}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                exportLoading || records.length === 0
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {exportLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={18} />
                  Export CSV
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search provinces..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 pr-4 py-2 w-full border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 text-sm"
          />
        </div>
      )}

      {/* Period Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-4 md:space-x-8 overflow-x-auto">
            {[
              { id: "all", label: "All Time" },
              { id: "last_month", label: "Last Month" },
              { id: "last_year", label: "Last Year" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  setPeriod(id);
                  setCurrentPage(1);
                }}
                className={`py-2 px-1 border-b-2 font-medium text-xs md:text-sm transition-colors whitespace-nowrap ${
                  period === id
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-8">
        {/* Total Provinces */}
        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Provinces
              </p>
              <p className="text-lg md:text-2xl font-bold text-gray-800 mt-1">
                {summary.totalProvinces}
              </p>
            </div>
            <div className="p-2 md:p-3 bg-blue-100 rounded-lg">
              <Target className="text-blue-600" size={isMobileView ? 18 : 24} />
            </div>
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Customers
              </p>
              <p className="text-lg md:text-2xl font-bold text-gray-800 mt-1">
                {summary.totalCustomers.toLocaleString()}
              </p>
            </div>
            <div className="p-2 md:p-3 bg-green-100 rounded-lg">
              <Users className="text-green-600" size={isMobileView ? 18 : 24} />
            </div>
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Active Customers
              </p>
              <p className="text-lg md:text-2xl font-bold text-gray-800 mt-1">
                {summary.activeCustomers.toLocaleString()}
              </p>
              <p className="text-xs text-green-600 mt-0.5 md:mt-1">
                {formatPercentage(summary.customerActivationRate)} rate
              </p>
            </div>
            <div className="p-2 md:p-3 bg-purple-100 rounded-lg">
              <TrendingUp
                className="text-purple-600"
                size={isMobileView ? 18 : 24}
              />
            </div>
          </div>
        </div>

        {/* Total Sales */}
        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Sales
              </p>
              <p className="text-lg md:text-2xl font-bold text-gray-800 mt-1">
                {formatCurrency(summary.totalSalesAmount || 0)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 md:mt-1">
                Avg:{" "}
                {formatCurrency(
                  summary.totalCustomers > 0
                    ? (summary.totalSalesAmount || 0) / summary.totalCustomers
                    : 0,
                )}
              </p>
            </div>
            <div className="p-2 md:p-3 bg-orange-100 rounded-lg">
              <FileText
                className="text-orange-600"
                size={isMobileView ? 18 : 24}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={`w-full ${isMobileView ? "min-w-[600px]" : ""}`}>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Sr No
                </th>
                <th
                  className={`text-left ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Province
                </th>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Customers
                </th>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Active
                </th>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  New
                </th>
                {!isMobileView && (
                  <th
                    className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                  >
                    Retention
                  </th>
                )}
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Total Sales
                </th>
                {!isMobileView && (
                  <th
                    className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                  >
                    Avg/Customer
                  </th>
                )}
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {records.map((record, index) => (
                <React.Fragment key={record.province}>
                  <tr
                    className={`hover:bg-gray-50 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    {/* Sr No */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center font-medium text-gray-600`}
                    >
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>

                    {/* Province */}
                    <td className={`${isMobileView ? "p-2 text-xs" : "p-4"}`}>
                      <span className="font-medium text-gray-800 capitalize">
                        {record.province}
                      </span>
                    </td>

                    {/* Customers */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-semibold text-gray-800">
                        {record.totalCustomers}
                      </span>
                      <div className="text-xs text-gray-500">
                        {record.inactiveCustomers} inactive
                      </div>
                    </td>

                    {/* Active */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span
                        className={`px-1.5 md:px-2 py-0.5 md:py-1 rounded-full text-xs font-medium ${
                          record.activeCustomers > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {record.activeCustomers}
                      </span>
                    </td>

                    {/* New */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {record.newCustomers}
                      </span>
                    </td>

                    {/* Retention Rate - Desktop only */}
                    {!isMobileView && (
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{
                                width: `${Math.min(record.customerRetentionRate, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700">
                            {formatPercentage(record.customerRetentionRate)}
                          </span>
                        </div>
                      </td>
                    )}

                    {/* Total Sales */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-semibold text-gray-800">
                        {formatCurrency(record.totalSalesAmount || 0)}
                      </span>
                    </td>

                    {/* Avg Sales/Customer - Desktop only */}
                    {!isMobileView && (
                      <td className="p-4 text-center">
                        <span className="text-sm text-gray-600">
                          {formatCurrency(record.averageSalesPerCustomer || 0)}
                        </span>
                      </td>
                    )}

                    {/* Actions */}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <button
                        onClick={() => toggleProvinceExpand(record.province)}
                        className="p-1 md:p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                        title="View Customer Details"
                      >
                        <Eye size={isMobileView ? 14 : 18} />
                      </button>
                    </td>
                  </tr>

                  {/* ── Expanded Customer Details ─────────────────────────── */}
                  {expandedProvince === record.province && (
                    <tr>
                      <td
                        colSpan={isMobileView ? 6 : 9}
                        className="p-3 md:p-4 bg-blue-50"
                      >
                        <h4 className="font-semibold text-gray-800 mb-2 md:mb-3 text-sm md:text-base">
                          Customer Details — {record.province}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                          {record.customerDetails.map((customer, ci) => (
                            <div
                              key={ci}
                              className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h5 className="font-medium text-gray-800 capitalize text-sm md:text-base">
                                    {customer.customerName}
                                  </h5>
                                  <p className="text-xs text-gray-600">
                                    {customer.customerCode}
                                  </p>
                                </div>
                                {customer.isNew && (
                                  <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-xs md:text-sm text-gray-600">
                                <p>
                                  Zone:{" "}
                                  <span className="font-medium capitalize">
                                    {customer.zone || "N/A"}
                                  </span>
                                </p>
                                <p>
                                  Medical Rep:{" "}
                                  <span className="font-medium capitalize">
                                    {customer.medicalRepName || "N/A"}
                                  </span>
                                </p>
                                <p>
                                  Invoices:{" "}
                                  <span className="font-medium">
                                    {customer.invoiceCount}
                                  </span>
                                </p>
                                <p>
                                  Total Sales:{" "}
                                  <span className="font-medium text-green-600">
                                    {formatCurrency(customer.totalSales || 0)}
                                  </span>
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {records.length === 0 && (
          <div className="text-center py-8 md:py-12">
            <Users
              className="mx-auto text-gray-400"
              size={isMobileView ? 36 : 48}
            />
            <h3 className="mt-3 md:mt-4 text-base md:text-lg font-medium text-gray-900">
              No provinces found
            </h3>
            <p className="mt-1 md:mt-2 text-xs md:text-sm text-gray-500">
              {searchTerm
                ? "Try adjusting your search criteria"
                : "No customer data available for the selected period"}
            </p>
          </div>
        )}

        {/* Pagination (Daily Report Style) */}
        {records.length > 0 && renderPagination()}
      </div>  
    </div>
  );
};

export default ProvinceWiseCustomer;
