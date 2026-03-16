import React, { useState, useEffect, useRef, useMemo } from "react";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import {
  Download,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  Repeat,
  BarChart3,
  Target,
  Calendar,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return (
    str.toString().charAt(0).toUpperCase() +
    str.toString().slice(1).toLowerCase()
  );
}

const getCurrentYearLabel = () => `${new Date().getFullYear()}`;
const getPrevYearLabel = () => `${new Date().getFullYear() - 1}`;

const AnnualCustomerRepeatRate = () => {
  const emptyData = {
    summary: {
      totalCustomers: 0,
      repeatCustomers: 0,
      repeatRate: 0,
      newCustomers: 0,
    },
    records: [], // changed from zones to records
  };

  const [data, setData] = useState(emptyData);
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

  const [period, setPeriod] = useState("last_year");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  const inputRef = useRef(null);
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const getSerialNumber = (i) =>
    (pagination.currentPage - 1) * itemsPerPage + i + 1;

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchData = async (page = 1, search = searchTerm) => {
    if (period === "custom" && (!customStartDate || !customEndDate)) {
      setData(emptyData);
      return;
    }
    setLoading(true);
    try {
      const params = { page, limit: itemsPerPage, period };
      if (period === "custom") {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
      }
      if (search.trim()) params.search = search.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/customer-retention/annual`,
        { params },
      );

      // Safely extract data, ensuring records is always an array
      const rawData = response.data?.data || emptyData;
      setData({
        summary: rawData.summary || emptyData.summary,
        records: Array.isArray(rawData.records) ? rawData.records : [],
      });

      setPagination(
        response.data?.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      );
    } catch (error) {
      console.error("Error:", error);
      showToast("error", "Failed to fetch annual customer repeat rate data");
      setData(emptyData);
    } finally {
      setLoading(false);
    }
  };

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchData(1);
  }, []);

  useEffect(() => {
    if (period !== "custom") fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  useEffect(() => {
    if (period === "custom" && customStartDate && customEndDate) fetchData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStartDate, customEndDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) fetchData(page);
  };

  const handlePeriodChange = (newPeriod) => {
    setPeriod(newPeriod);
    if (newPeriod === "custom") {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      setCustomStartDate("");
      setCustomEndDate("");
    }
  };

  const exportToExcel = async () => {
    if (!data.records || data.records.length === 0) {
      showToast("warning", "No records to export");
      return;
    }
    setExporting(true);
    try {
      const params = { period };
      if (period === "custom") {
        params.startDate = customStartDate;
        params.endDate = customEndDate;
      }
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const response = await axios.get(
        `${backendUrl}/api/reports/customer-retention/annual/export`,
        { params, responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `Annual_Repeat_Rate_${period}_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded successfully!");
    } catch (error) {
      showToast("error", "Failed to download Excel report");
    } finally {
      setExporting(false);
    }
  };

  // Filter records based on search term (search by zone name)
  const filteredRecords = useMemo(() => {
    const records = data.records || [];
    if (!searchTerm.trim()) return records;
    const q = searchTerm.toLowerCase();
    return records.filter((zone) =>
      zone.zoneName?.toLowerCase().includes(q),
    );
  }, [data.records, searchTerm]);

  // Safe summary access
  const summary = data.summary || emptyData.summary;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">
          Annual Customer Repeat Rate – Zone Summary
        </h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by zone name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && fetchData(1)}
              className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
            />
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  fetchData(1, "");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={exportToExcel}
            disabled={exporting || !data.records || data.records.length === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl shadow-md ${
              exporting || !data.records || data.records.length === 0
                ? "bg-gray-400 text-white cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
            }`}
          >
            <Download size={18} />
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Period Filter Tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {[
          { id: "today", label: "Today" },
          { id: "all", label: "All Records" },
          { id: "month", label: `This Month` },
          { id: "last_year", label: `Last Year (${getPrevYearLabel()})` },
          { id: "jan_feb", label: `Jan – Now (${getCurrentYearLabel()})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handlePeriodChange(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium transition text-sm ${
              period === tab.id
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => handlePeriodChange("custom")}
          className={`px-4 py-2 rounded-lg font-medium transition text-sm flex items-center gap-2 ${
            period === "custom"
              ? "bg-indigo-600 text-white"
              : "bg-gray-200 text-gray-700 hover:bg-gray-300"
          }`}
        >
          <Calendar size={16} />
          Custom Filter
        </button>
      </div>

      {/* Custom Date Picker */}
      {showCustomPicker && (
        <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">End Date</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>
          <button
            onClick={() => {
              if (!customStartDate || !customEndDate) {
                showToast("warning", "Please select both dates");
                return;
              }
              if (customStartDate > customEndDate) {
                showToast("warning", "Start date cannot be after end date");
                return;
              }
              fetchData(1);
            }}
            className="mt-5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm cursor-pointer"
          >
            Apply
          </button>
          <button
            onClick={() => {
              setCustomStartDate("");
              setCustomEndDate("");
              setPeriod("all");
              setShowCustomPicker(false);
            }}
            className="mt-5 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        {[
          {
            label: "Total Customers",
            value: summary.totalCustomers,
            icon: <Users className="w-8 h-8 text-green-500" />,
            border: "border-green-500",
          },
          {
            label: "Repeat Customers",
            value: summary.repeatCustomers,
            icon: <Repeat className="w-8 h-8 text-blue-500" />,
            border: "border-blue-500",
          },
          {
            label: "Repeat Rate",
            value: `${summary.repeatRate?.toFixed(2) || 0}%`,
            icon: <BarChart3 className="w-8 h-8 text-purple-500" />,
            border: "border-purple-500",
          },
          {
            label: "New Customers",
            value: summary.newCustomers,
            icon: <Target className="w-8 h-8 text-orange-500" />,
            border: "border-orange-500",
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`bg-white p-6 rounded-xl shadow-md border-l-4 ${card.border}`}
          >
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{card.label}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    card.value
                  )}
                </div>
              </div>
              {card.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Zone Table (using records) */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">Sr.No</th>
              <th className="p-3 text-sm font-medium text-left">Zone Name</th>
              <th className="p-3 text-sm font-medium">Total Customers</th>
              <th className="p-3 text-sm font-medium">Retained Customers</th>
              <th className="p-3 text-sm font-medium">Retention Rate (%)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span className="text-gray-500">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : filteredRecords.length > 0 ? (
              filteredRecords.map((zone, index) => (
                <tr
                  key={zone._id || index}
                  className={`hover:bg-gray-50 ${index < filteredRecords.length - 1 ? "border-b border-gray-100" : ""}`}
                >
                  <td className="p-3 text-sm text-gray-600 font-medium">
                    {index + 1}
                  </td>
                  <td className="p-3 text-sm font-medium text-gray-900 capitalize text-left">
                    {zone.zoneName || "—"}
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center justify-center min-w-[36px] h-8 bg-indigo-50 text-indigo-700 font-bold text-sm rounded-full px-3">
                      {zone.totalCustomers || 0}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center justify-center min-w-[36px] h-8 bg-green-50 text-green-700 font-bold text-sm rounded-full px-3">
                      {zone.retainedCustomers || 0}
                    </span>
                  </td>
                  <td className="p-3 text-sm font-semibold text-gray-800">
                    {zone.retentionRate?.toFixed(2) ?? 0}%
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400">
                  {period === "custom" && (!customStartDate || !customEndDate)
                    ? "Please select start and end dates"
                    : "No zone data found for selected filter"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && filteredRecords.length > 0 && (
        <div className="flex items-center justify-start gap-2 mt-6">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <div className="flex gap-1">
            {visiblePages.map((page, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof page === "number" && handlePageChange(page)
                }
                disabled={typeof page !== "number"}
                className={`min-w-[40px] px-3 py-2 rounded-lg ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white"
                    : typeof page === "number"
                      ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                      : "bg-transparent text-gray-500 cursor-default"
                }`}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AnnualCustomerRepeatRate;