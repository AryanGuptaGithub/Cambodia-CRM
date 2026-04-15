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
  FileSpreadsheet,
  UserCheck,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { getVisiblePages } from "../../utils/useVisiblePages";
import Sidebar from "../../components/Sidebar";

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
  const [exportLoading, setExportLoading] = useState(false);
  const [customerExportLoading, setCustomerExportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [expandedZones, setExpandedZones] = useState(new Set());
  const [showExportOptions, setShowExportOptions] = useState(false);

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
  const exportOptionsRef = useRef(null);

  const visiblePages = getVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
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
        `${backendUrl}/api/reports/zone-wise-customers`,
        { params },
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
      console.error("Error fetching zone wise customer data:", error);
      showToast("error", "Failed to fetch zone wise customer data");

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

  // Close export options when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        exportOptionsRef.current &&
        !exportOptionsRef.current.contains(event.target)
      ) {
        setShowExportOptions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
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

  // Export Zone Wise Data (Summary + Zones + Customers)
  const exportZoneWiseData = async () => {
    setExportLoading(true);
    try {
      const params = {};
      if (searchTerm && searchTerm.trim() !== "") {
        params.search = searchTerm.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/zone-wise-customers/export`,
        {
          params,
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileName = `zone_wise_customers_${new Date().toISOString().split("T")[0]}.xlsx`;

      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Zone wise data exported successfully!");
      setShowExportOptions(false);
    } catch (error) {
      console.error("Export error:", error);
      showToast("error", "Failed to export data to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  // Export Only Customer List
  const exportCustomerList = async () => {
    setCustomerExportLoading(true);
    try {
      const params = {};
      if (searchTerm && searchTerm.trim() !== "") {
        params.search = searchTerm.trim();
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/zone-wise-customers/export-customers`,
        {
          params,
          responseType: "blob",
        },
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileName = `customer_list_${new Date().toISOString().split("T")[0]}.xlsx`;

      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Customer list exported successfully!");
      setShowExportOptions(false);
    } catch (error) {
      console.error("Customer export error:", error);
      showToast("error", "Failed to export customer list");
    } finally {
      setCustomerExportLoading(false);
    }
  };

  // ── Pagination (Improved like Product component) ─────────────────────────
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

  const renderSummaryCards = () => (
    <div
      className={`grid gap-4 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 mb-6"}`}
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
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.totalCustomers?.toLocaleString() || 0}
            </p>
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
              Total Zones
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.totalZones || 0}
            </p>
          </div>
          <MapPin
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
              Total MRs
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.totalMRs || 0}
            </p>
          </div>
          <User
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
          />
        </div>
      </div>
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200 ${isMobileView ? "col-span-2" : ""}`}
      >
        <div className="flex justify-between items-center">
          <div>
            <p
              className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
            >
              Avg per Zone
            </p>
            <p
              className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
            >
              {data.summary.averageCustomersPerZone?.toFixed(1) || 0}
            </p>
          </div>
          <TrendingUp
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
          />
        </div>
      </div>
    </div>
  );

  // Render zone header row
  const renderZoneHeader = (record, index) => {
    const tdClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"}`;
    return (
      <tr
        key={`zone-${record.zoneId}`}
        className={`hover:bg-gray-50 ${index < data.records.length - 1 ? "border-b" : ""}`}
      >
        <td className={`${tdClass} text-gray-600 font-medium`}>
          {getSerialNumber(index)}
        </td>
        <td className={`${tdClass} font-medium text-gray-900 capitalize`}>
          {record.zoneName || "N/A"}
          {isMobileView && (
            <div className="text-[8px] text-gray-400 mt-0.5">
              MRs: {record.totalMRs?.toLocaleString() || 0} | Customers:{" "}
              {record.totalCustomers?.toLocaleString() || 0}
            </div>
          )}
        </td>
        {!isMobileView && (
          <td className={`${tdClass} text-gray-600`}>
            {record.totalMRs?.toLocaleString() || 0}
          </td>
        )}
        {!isMobileView && (
          <td className={`${tdClass} font-semibold text-blue-600`}>
            {record.totalCustomers?.toLocaleString() || 0}
          </td>
        )}
        {!isMobileView && (
          <td className={`${tdClass} font-semibold text-green-600`}>
            {record.averagePerMR?.toFixed(1) || 0}
          </td>
        )}
        <td className={tdClass}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleZoneExpansion(record.zoneId);
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-xs cursor-pointer ${
              expandedZones.has(record.zoneId)
                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700"
            }`}
          >
            <Eye size={isMobileView ? 12 : 14} />
            {expandedZones.has(record.zoneId) ? "Hide" : "View"}
          </button>
        </td>
      </tr>
    );
  };

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

    const tdClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"}`;

    return record.customers.map((customer, customerIndex) => (
      <tr
        key={`customer-${customer.customerId}`}
        className="bg-gray-50 hover:bg-gray-100 border-b"
      >
        <td className={tdClass}></td>
        <td className={`${tdClass} pl-4 md:pl-8`}>
          <div className="flex items-start gap-2 md:gap-3">
            <div className="flex-shrink-0">
              <User
                className={`${isMobileView ? "w-3 h-3" : "w-4 h-4"} text-gray-400 mt-0.5`}
              />
            </div>
            <div className="flex-1">
              <div
                className={`font-medium text-gray-900 capitalize ${isMobileView ? "text-[10px]" : "text-sm"}`}
              >
                {customer.customerName || "N/A"}
              </div>
              <div
                className={`${isMobileView ? "text-[8px]" : "text-xs"} text-gray-500 mt-0.5 space-y-0.5`}
              >
                {customer.customerCode && (
                  <div>Code: {customer.customerCode}</div>
                )}
                {customer.typeOfBusiness && (
                  <div>Business: {customer.typeOfBusiness}</div>
                )}
                {customer.medicalRepName && (
                  <div>MR: {customer.medicalRepName}</div>
                )}
                {isMobileView && customer.contactNumber && (
                  <div>Contact: {customer.contactNumber}</div>
                )}
                {isMobileView && customer.province && (
                  <div>Province: {customer.province}</div>
                )}
              </div>
            </div>
          </div>
        </td>
        {!isMobileView && (
          <td className={tdClass}>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone size={14} />
              {customer.contactNumber || "N/A"}
            </div>
          </td>
        )}
        {!isMobileView && (
          <td className={`${tdClass} text-gray-600`}>
            {customer.province || "N/A"}
          </td>
        )}
        {!isMobileView && (
          <td className={`${tdClass} text-gray-600 max-w-xs truncate`}>
            {customer.address || "N/A"}
          </td>
        )}
        <td className={tdClass}></td>
      </tr>
    ));
  };

  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`;
    if (isMobileView) {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className={thClass}>Sr.No</th>
            <th className={thClass}>Zone / Customer</th>
            <th className={thClass}>Action</th>
          </tr>
        </thead>
      );
    }
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Zone Name / Customer Name</th>
          <th className={thClass}>MR Count</th>
          <th className={thClass}>Customer Count</th>
          <th className={thClass}>MR Average</th>
          <th className={thClass}>Action</th>
        </tr>
      </thead>
    );
  };

  // Get column span
  const getColSpan = () => (isMobileView ? 3 : 6);

  // Export Options Dropdown (Desktop only)
  const renderExportOptions = () => (
    <div
      ref={exportOptionsRef}
      className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50"
    >
      <div className="p-2">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-2">
          Export Options
        </div>

        <button
          onClick={exportZoneWiseData}
          disabled={exportLoading}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md mb-1 ${
            exportLoading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "hover:bg-blue-50 text-blue-700 hover:text-blue-800"
          }`}
        >
          {exportLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <FileSpreadsheet size={16} />
              <div className="text-left">
                <div className="font-medium">Zone Wise Report</div>
                <div className="text-xs text-gray-500">
                  Summary + Zones + Customers
                </div>
              </div>
            </>
          )}
        </button>

        <div className="border-t my-1"></div>

        <button
          onClick={exportCustomerList}
          disabled={customerExportLoading}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md ${
            customerExportLoading
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "hover:bg-green-50 text-green-700 hover:text-green-800"
          }`}
        >
          {customerExportLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
              <span>Exporting...</span>
            </>
          ) : (
            <>
              <UserCheck size={16} />
              <div className="text-left">
                <div className="font-medium">Customer List Only</div>
                <div className="text-xs text-gray-500">
                  Detailed customer data
                </div>
              </div>
            </>
          )}
        </button>
      </div>
    </div>
  );

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
            <MapPin className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-bold text-gray-800">Zone Wise</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {pagination.totalRecords}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
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

            {/* Export Button with Dropdown (Desktop only) */}
            <div className="relative">
              <button
                onClick={() => setShowExportOptions(!showExportOptions)}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Download size={18} />
                Export Excel
              </button>

              {showExportOptions && renderExportOptions()}
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search by zone, customer, MR..."
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyPress={handleSearch}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Search result hint */}
      {searchTerm && pagination.totalRecords > 0 && (
        <div className="mb-3 p-2 bg-blue-50 rounded-lg">
          <p
            className={`text-blue-700 ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            Searching: <span className="font-semibold">"{searchTerm}"</span>
            <span className="ml-3">
              Found:{" "}
              <span className="font-bold">{pagination.totalRecords}</span>{" "}
              zone(s)
            </span>
          </p>
        </div>
      )}

      {renderSummaryCards()}

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[400px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-6 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                    <span
                      className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                    >
                      Loading...
                    </span>
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
                  className={`p-6 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
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
