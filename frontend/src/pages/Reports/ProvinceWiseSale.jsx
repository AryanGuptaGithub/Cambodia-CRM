import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  Search,
  TrendingUp,
  Users,
  FileText,
  Target,
  Download,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatCurrency } from "../../utils/formatCurrency";
import { formatPercentage } from "../../utils/formatPercentage";

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
    <div className="p-6">
      {/* Header */}
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

          {/* Export */}
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

      {/* Period Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
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
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Provinces */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Provinces
              </p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {summary.totalProvinces}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Target className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        {/* Total Customers */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Total Customers
              </p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {summary.totalCustomers.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Users className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        {/* Active Customers */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Active Customers
              </p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {summary.activeCustomers.toLocaleString()}
              </p>
              <p className="text-sm text-green-600 mt-1">
                {formatPercentage(summary.customerActivationRate)} activation
                rate
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        {/* ── FIX: Total Sales card — was not rendering correctly ── */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sales</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">
                {formatCurrency(summary.totalSalesAmount || 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Avg:{" "}
                {formatCurrency(
                  summary.totalCustomers > 0
                    ? (summary.totalSalesAmount || 0) / summary.totalCustomers
                    : 0,
                )}
                /customer
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <FileText className="text-orange-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Table ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-center p-4 font-semibold text-gray-700 w-16">
                  Sr No
                </th>
                <th className="text-left   p-4 font-semibold text-gray-700">
                  Province
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
                  Customers
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
                  Active
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
                  New
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
                  Retention Rate
                </th>
                {/* FIX: Total Sales column — was missing value */}
                <th className="text-center p-4 font-semibold text-gray-700">
                  Total Sales
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
                  Avg Sales/Customer
                </th>
                <th className="text-center p-4 font-semibold text-gray-700">
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
                    <td className="p-4 text-center text-sm font-medium text-gray-600">
                      {(currentPage - 1) * itemsPerPage + index + 1}
                    </td>

                    {/* Province */}
                    <td className="p-4">
                      <span className="font-medium text-gray-800 capitalize">
                        {record.province}
                      </span>
                    </td>

                    {/* Customers */}
                    <td className="p-4 text-center">
                      <span className="font-semibold text-gray-800">
                        {record.totalCustomers}
                      </span>
                      <div className="text-xs text-gray-500">
                        {record.inactiveCustomers} inactive
                      </div>
                    </td>

                    {/* Active */}
                    <td className="p-4 text-center">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          record.activeCustomers > 0
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {record.activeCustomers}
                      </span>
                    </td>

                    {/* New */}
                    <td className="p-4 text-center">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        {record.newCustomers}
                      </span>
                    </td>

                    {/* Retention Rate */}
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

                    {/* ── FIX: Total Sales — render totalSalesAmount directly ── */}
                    <td className="p-4 text-center">
                      <span className="font-semibold text-gray-800">
                        {formatCurrency(record.totalSalesAmount || 0)}
                      </span>
                    </td>

                    {/* Avg Sales/Customer */}
                    <td className="p-4 text-center">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(record.averageSalesPerCustomer || 0)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-4 text-center">
                      <button
                        onClick={() => toggleProvinceExpand(record.province)}
                        className="p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                        title="View Customer Details"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>

                  {/* ── Expanded Customer Details ─────────────────────────── */}
                  {expandedProvince === record.province && (
                    <tr>
                      <td colSpan={9} className="p-4 bg-blue-50">
                        <h4 className="font-semibold text-gray-800 mb-3">
                          Customer Details — {record.province}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {record.customerDetails.map((customer, ci) => (
                            <div
                              key={ci}
                              className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
                            >
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <h5 className="font-medium text-gray-800 capitalize">
                                    {customer.customerName}
                                  </h5>
                                  <p className="text-sm text-gray-600">
                                    {customer.customerCode}
                                  </p>
                                </div>
                                {customer.isNew && (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                    New
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-gray-600">
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
                                {/* FIX: show totalSales per customer correctly */}
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
          <div className="text-center py-12">
            <Users className="mx-auto text-gray-400" size={48} />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              No provinces found
            </h3>
            <p className="mt-2 text-gray-500">
              {searchTerm
                ? "Try adjusting your search criteria"
                : "No customer data available for the selected period"}
            </p>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              ← Prev
            </button>

            {visiblePages.map((page, idx) =>
              page === "..." ? (
                <span
                  key={`e-${idx}`}
                  className="px-3 py-1 text-gray-500 select-none"
                >
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ),
            )}

            <button
              onClick={() => {
                setCurrentPage((p) => Math.min(p + 1, pagination.totalPages));
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              disabled={currentPage === pagination.totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProvinceWiseCustomer;
