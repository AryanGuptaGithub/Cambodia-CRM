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
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const ProvinceWiseSale = () => {
  const [data, setData] = useState({
    summary: {
      totalSales: 0,
      totalProvinces: 0,
      totalInvoices: 0,
      totalCustomers: 0,
      averageSalePerProvince: 0,
      averageSalePerInvoice: 0,
    },
    records: [],
    uniqueProvincesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [period, setPeriod] = useState("all");
  const [expandedProvince, setExpandedProvince] = useState(null);
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

  const itemsPerPage = 9;

  useEffect(() => {
    fetchProvinceData();
  }, [currentPage, period, searchTerm]);

  const fetchProvinceData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/reports/province-wise-sales`,
        {
          params: {
            page: currentPage,
            limit: itemsPerPage,
            search: searchTerm,
            period: period,
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
      console.error("Error fetching province sale data:", err);
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load province-wise sale data");
    } finally {
      setLoading(false);
    }
  };

  const toggleProvinceExpand = (province) => {
    setExpandedProvince(expandedProvince === province ? null : province);
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);

      const response = await axios.get(
        `${backendUrl}/api/reports/province-wise-sales/export`,
        {
          params: {
            search: searchTerm,
            period: period,
          },
          responseType: "blob",
        },
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      const contentDisposition = response.headers["content-disposition"];
      let filename = `Province-Wise-Sales-${period === "all" ? "All-Time" : period === "last_month" ? "Last-Month" : "Last-Year"}.xlsx`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch && filenameMatch.length === 2) {
          filename = filenameMatch[1];
        }
      }

      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      showToast("success", "Excel file downloaded successfully!");
    } catch (err) {
      console.error("Error exporting to Excel:", err);
      if (err.response?.status === 404) {
        showToast("warning", "No data available to export");
      } else {
        showToast("error", "Failed to export data to Excel");
      }
    } finally {
      setExportLoading(false);
    }
  };

  const { summary, records, pagination } = data;

  const isExportDisabled = records.length === 0 || exportLoading;

  // ── Pagination (Daily Report Style) ───────────────────────────────────────
  const renderPagination = () => {
    if (!pagination || pagination.totalPages <= 1) return null;
    const totalPages = pagination.totalPages;
    const currentPg = currentPage;

    // Generate visible pages for desktop
    const maxVisible = 5;
    let start = Math.max(1, currentPg - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) start = Math.max(1, end - maxVisible + 1);
    const pages = [];
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <div
        className={`mt-4 p-3 md:p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"} flex-wrap`}
      >
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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
          pages.map((page) => (
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
          ))
        )}

        <button
          onClick={() => {
            setCurrentPage((prev) => Math.min(prev + 1, totalPages));
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

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );

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
              Province Sales
            </h1>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {summary.totalProvinces}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Province-wise Sales Analytics
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Analyze sales performance across provinces
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
                size={20}
                onClick={handleIconClick}
              />
              <input
                type="text"
                placeholder="Search provinces..."
                value={searchTerm}
                ref={inputRef}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 w-64"
              />
            </div>
            {/* Export button — desktop only */}
            <button
              onClick={exportToExcel}
              disabled={isExportDisabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors ${
                isExportDisabled
                  ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
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
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={15}
          />
          <input
            type="text"
            placeholder="Search provinces..."
            value={searchTerm}
            ref={inputRef}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-8">
        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Sales
              </p>
              <p className="text-sm md:text-2xl font-bold text-gray-800 mt-0.5 md:mt-1">
                {formatCurrency(summary.totalSales)}
              </p>
              {!isMobileView && summary.totalInvoices > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {summary.totalInvoices?.toLocaleString()} invoices
                </p>
              )}
            </div>
            <div className="p-2 md:p-3 bg-green-100 rounded-lg">
              <FileText
                className="text-green-600"
                size={isMobileView ? 18 : 24}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Provinces
              </p>
              <p className="text-sm md:text-2xl font-bold text-gray-800 mt-0.5 md:mt-1">
                {summary.totalProvinces}
              </p>
              {!isMobileView && records.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {records.length} with sales
                </p>
              )}
            </div>
            <div className="p-2 md:p-3 bg-blue-100 rounded-lg">
              <Target className="text-blue-600" size={isMobileView ? 18 : 24} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Invoices
              </p>
              <p className="text-sm md:text-2xl font-bold text-gray-800 mt-0.5 md:mt-1">
                {summary.totalInvoices?.toLocaleString()}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  Avg: {formatCurrency(summary.averageSalePerInvoice)}
                </p>
              )}
            </div>
            <div className="p-2 md:p-3 bg-purple-100 rounded-lg">
              <TrendingUp
                className="text-purple-600"
                size={isMobileView ? 18 : 24}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-3 md:p-6 shadow-sm border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs md:text-sm font-medium text-gray-600">
                Total Customers
              </p>
              <p className="text-sm md:text-2xl font-bold text-gray-800 mt-0.5 md:mt-1">
                {summary.totalCustomers?.toLocaleString()}
              </p>
              {!isMobileView && (
                <p className="text-xs text-gray-500 mt-1">
                  Avg:{" "}
                  {formatCurrency(
                    summary.totalSales / (summary.totalCustomers || 1),
                  )}
                </p>
              )}
            </div>
            <div className="p-2 md:p-3 bg-orange-100 rounded-lg">
              <Users
                className="text-orange-600"
                size={isMobileView ? 18 : 24}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Table */}
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
                  Sales ($)
                </th>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Invoices
                </th>
                <th
                  className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                >
                  Customers
                </th>
                {!isMobileView && (
                  <th
                    className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                  >
                    Avg Sale Value ($)
                  </th>
                )}
                {!isMobileView && (
                  <th
                    className={`text-center ${isMobileView ? "p-2 text-xs" : "p-4"} font-semibold text-gray-700`}
                  >
                    Avg/Customer ($)
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
                <React.Fragment key={`${record.province}-${index}`}>
                  <tr
                    className={`hover:bg-gray-50 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-medium text-gray-600">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </span>
                    </td>
                    <td className={`${isMobileView ? "p-2 text-xs" : "p-4"}`}>
                      <span className="font-medium text-gray-800 capitalize">
                        {record.province}
                      </span>
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-semibold text-gray-800">
                        {formatCurrency(record.totalSalesAmount || 0)}
                      </span>
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-semibold text-gray-800">
                        {record.totalInvoices?.toLocaleString() || 0}
                      </span>
                    </td>
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <span className="font-semibold text-gray-800">
                        {record.totalCustomers?.toLocaleString() || 0}
                      </span>
                    </td>
                    {!isMobileView && (
                      <td className="p-4 text-center">
                        <span className="text-sm text-gray-600">
                          {formatCurrency(record.averageSaleValue || 0)}
                        </span>
                      </td>
                    )}
                    {!isMobileView && (
                      <td className="p-4 text-center">
                        <span className="text-sm text-gray-600">
                          {formatCurrency(record.averageSalePerCustomer || 0)}
                        </span>
                      </td>
                    )}
                    <td
                      className={`${isMobileView ? "p-2 text-xs" : "p-4"} text-center`}
                    >
                      <button
                        onClick={() => toggleProvinceExpand(record.province)}
                        className="p-1 md:p-2 text-gray-600 hover:text-indigo-600 transition-colors"
                        title="View Details"
                      >
                        <Eye size={isMobileView ? 14 : 18} />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Sale Details */}
                  {expandedProvince === record.province && (
                    <tr>
                      <td
                        colSpan={isMobileView ? 6 : 8}
                        className="p-3 md:p-4 bg-blue-50"
                      >
                        <div className="mb-4">
                          <h4 className="font-semibold text-gray-800 mb-2 md:mb-3 text-sm md:text-base">
                            Sale Details - {record.province}
                          </h4>
                          <div className="mb-3 md:mb-4 p-2 md:p-3 bg-blue-100 rounded-lg">
                            <p className="text-xs md:text-sm text-blue-800">
                              <strong>Summary:</strong> {record.totalCustomers}{" "}
                              customers, {record.totalInvoices} invoices, Total
                              Sales: {formatCurrency(record.totalSalesAmount)}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                            {record.customerDetails?.map(
                              (customer, customerIndex) => (
                                <div
                                  key={`${customer.customerCode}-${customerIndex}`}
                                  className="bg-white rounded-lg p-3 md:p-4 shadow-sm border border-gray-200"
                                >
                                  <div className="flex justify-between items-start mb-2">
                                    <div>
                                      <h5 className="font-medium text-gray-800 capitalize text-sm md:text-base">
                                        {customer.customerName ||
                                          customer.customerCode}
                                      </h5>
                                      <p className="text-xs text-gray-600">
                                        Code: {customer.customerCode}
                                      </p>
                                    </div>
                                    <span className="px-1.5 md:px-2 py-0.5 md:py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                      {customer.invoiceCount} invoices
                                    </span>
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
                                      Total Sales:{" "}
                                      <span className="font-medium text-green-600">
                                        {formatCurrency(customer.totalSales)}
                                      </span>
                                    </p>
                                    {!isMobileView && (
                                      <p>
                                        Avg per Invoice:{" "}
                                        <span className="font-medium text-blue-600">
                                          {formatCurrency(
                                            customer.averageSalePerInvoice,
                                          )}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
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
            <FileText
              className="mx-auto text-gray-400"
              size={isMobileView ? 36 : 48}
            />
            <h3 className="mt-3 md:mt-4 text-base md:text-lg font-medium text-gray-900">
              No sales data found
            </h3>
            <p className="mt-1 md:mt-2 text-xs md:text-sm text-gray-500">
              {searchTerm
                ? "Try adjusting your search criteria"
                : "No sales data available for the selected period"}
            </p>
          </div>
        )}

        {/* Pagination (Daily Report Style) */}
        {records.length > 0 && renderPagination()}
      </div>
    </div>
  );
};

export default ProvinceWiseSale;
