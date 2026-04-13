import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  X,
  FileDown,
  Filter,
  TrendingUp,
  Package,
  Calendar,
  DollarSign,
  BarChart3,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import LoadingOverlay from "../../components/Loading";
import Sidebar from "../../components/Sidebar";

// ----------------------------------------------------------------------
// Role detection
// ----------------------------------------------------------------------
const getUserRole = () => {
  try {
    const possibleKeys = ["user", "auth", "userData", "currentUser"];
    for (const key of possibleKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.role) return parsed.role;
        } catch (e) {}
      }
    }
    const token =
      localStorage.getItem("token") || localStorage.getItem("authToken");
    if (token) {
      const parts = token.split(".");
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64));
        if (payload && payload.role) return payload.role;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

const useAuth = () => {
  const role = getUserRole();
  return { user: { role } };
};
// ----------------------------------------------------------------------

const formatLocalDate = (date) => {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const saleSummaryPerPage = 7;

const formatNumber = (num) => {
  if (num === null || num === undefined) return "0.00";
  const number = typeof num === "number" ? num : parseFloat(num);
  if (isNaN(number)) return "0.00";
  return number.toFixed(2);
};

const SaleSummary = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [selectedTab, setSelectedTab] = useState("daily");
  const [summaryData, setSummaryData] = useState([]);

  // ── Mobile detection ────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  // ────────────────────────────────────────────────────────────────────────

  const inputRef = useRef(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super admin";

  useEffect(() => {
    const fetchSalesRecords = async () => {
      if (
        selectedTab === "combine" &&
        (!customDateRange.startDate || !customDateRange.endDate)
      )
        return;
      setIsLoading(true);
      try {
        let url = `${backendUrl}/api/sales-summary/summary`;
        if (
          selectedTab === "combine" &&
          customDateRange.startDate &&
          customDateRange.endDate
        ) {
          const params = new URLSearchParams({
            startDate: formatLocalDate(customDateRange.startDate),
            endDate: formatLocalDate(customDateRange.endDate),
          });
          url += `?${params.toString()}`;
        } else if (selectedTab === "daily") {
          url += `?${new URLSearchParams({ startDate: "2000-01-01", endDate: formatLocalDate(new Date()) }).toString()}`;
        }
        const response = await fetch(url);
        const data = await response.json();
        if (data.success) {
          setSummaryData(data.data || []);
        } else {
          showToast("error", data.message || "Failed to fetch sales summary");
          setSummaryData([]);
        }
      } catch (error) {
        console.error("Error fetching sales summary:", error);
        showToast("error", "Failed to fetch sales summary data");
        setSummaryData([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSalesRecords();
  }, [
    customDateRange.startDate,
    customDateRange.endDate,
    selectedTab,
    backendUrl,
  ]);

  const calculateDailySummary = () => {
    const dailyMap = {};
    summaryData.forEach((record) => {
      const date = record.invoiceDate
        ? new Date(record.invoiceDate).toLocaleDateString("en-US", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
        : "Unknown Date";
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          products: new Map(),
          totalSales: 0,
          totalQuantity: 0,
          totalAmount: 0,
          totalProfit: 0,
        };
      }
      record.products.forEach((product) => {
        const productName = product.productName || "Unknown Product";
        const normalizedName = productName.toLowerCase().trim();
        if (!dailyMap[date].products.has(normalizedName)) {
          dailyMap[date].products.set(normalizedName, {
            productName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0,
          });
        }
        const existing = dailyMap[date].products.get(normalizedName);
        existing.salesQuantity += product.salesQty || 0;
        existing.bonusQuantity += product.bonusQty || 0;
        existing.totalQuantity += product.totalQty || 0;
        existing.amount += product.netSellingAmount || 0;
        existing.profit += product.profitLoss || 0;
        dailyMap[date].totalSales += product.netSellingAmount || 0;
        dailyMap[date].totalQuantity += product.totalQty || 0;
        dailyMap[date].totalAmount += product.netSellingAmount || 0;
        dailyMap[date].totalProfit += product.profitLoss || 0;
      });
    });
    const allRows = [];
    Object.values(dailyMap).forEach((day) => {
      Array.from(day.products.values()).forEach((product) => {
        allRows.push({
          ...product,
          date: day.date,
          salesQuantity: parseFloat(product.salesQuantity.toFixed(2)),
          bonusQuantity: parseFloat(product.bonusQuantity.toFixed(2)),
          totalQuantity: parseFloat(product.totalQuantity.toFixed(2)),
          amount: parseFloat(product.amount.toFixed(2)),
          profit: parseFloat(product.profit.toFixed(2)),
        });
      });
    });
    return allRows;
  };

  const calculateCombineSummary = () => {
    const productMap = new Map();
    summaryData.forEach((record) => {
      record.products.forEach((product) => {
        const productName = product.productName || "Unknown Product";
        const normalizedName = productName.toLowerCase().trim();
        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            productName,
            normalizedName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0,
          });
        }
        const existing = productMap.get(normalizedName);
        existing.salesQuantity += product.salesQty || 0;
        existing.bonusQuantity += product.bonusQty || 0;
        existing.totalQuantity += product.totalQty || 0;
        existing.amount += product.netSellingAmount || 0;
        existing.profit += product.profitLoss || 0;
      });
    });
    return Array.from(productMap.values())
      .map((product) => ({
        ...product,
        salesQuantity: parseFloat(product.salesQuantity.toFixed(2)),
        bonusQuantity: parseFloat(product.bonusQuantity.toFixed(2)),
        totalQuantity: parseFloat(product.totalQuantity.toFixed(2)),
        amount: parseFloat(product.amount.toFixed(2)),
        profit: parseFloat(product.profit.toFixed(2)),
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName));
  };

  const getFilteredData = useMemo(() => {
    let data =
      selectedTab === "daily"
        ? calculateDailySummary()
        : calculateCombineSummary();
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      data = data.filter((item) =>
        selectedTab === "daily"
          ? item.date?.toLowerCase().includes(search) ||
            item.productName?.toLowerCase().includes(search)
          : item.productName?.toLowerCase().includes(search),
      );
    }
    return data;
  }, [summaryData, selectedTab, searchTerm]);

  const totalPages = Math.ceil(getFilteredData.length / saleSummaryPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentData = getFilteredData.slice(
    (currentPage - 1) * saleSummaryPerPage,
    currentPage * saleSummaryPerPage,
  );

  const calculateTotals = () => {
    let totalSales = 0,
      totalQuantity = 0,
      totalProfit = 0,
      totalProducts = 0;
    if (selectedTab === "daily") {
      const dailyData = calculateDailySummary();
      dailyData.forEach((p) => {
        totalSales += p.amount || 0;
        totalQuantity += p.totalQuantity || 0;
        totalProfit += p.profit || 0;
      });
      totalProducts = new Set(
        dailyData.map((item) => `${item.productName}-${item.date}`),
      ).size;
    } else if (selectedTab === "combine") {
      const combineData = calculateCombineSummary();
      combineData.forEach((p) => {
        totalSales += p.amount || 0;
        totalQuantity += p.totalQuantity || 0;
        totalProfit += p.profit || 0;
      });
      totalProducts = combineData.length;
    }
    return {
      totalSales: parseFloat(totalSales.toFixed(2)),
      totalQuantity: parseFloat(totalQuantity.toFixed(2)),
      totalProfit: parseFloat(totalProfit.toFixed(2)),
      totalProducts,
    };
  };

  const totals = calculateTotals();

  const handleExportToExcel = async () => {
    if (getFilteredData.length === 0) {
      showToast("warning", "No data found to export");
      return;
    }
    setExportLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/sales-summary/export`,
        {
          params: {
            tab: selectedTab,
            startDate:
              selectedTab === "combine" && customDateRange.startDate
                ? formatLocalDate(customDateRange.startDate)
                : "2000-01-01",
            endDate:
              selectedTab === "combine" && customDateRange.endDate
                ? formatLocalDate(customDateRange.endDate)
                : formatLocalDate(new Date()),
          },
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `sales-summary-${selectedTab}-${formatLocalDate(new Date())}.xlsx`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response?.status === 404)
        showToast("warning", "No data found for the selected filters");
      else showToast("error", "Failed to export Excel report");
    } finally {
      setExportLoading(false);
    }
  };

  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));

  const handleApplyCustomFilter = () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }
    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }
    setShowDateFilter(false);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setCurrentPage(1);
    if (selectedTab === "combine") setShowDateFilter(true);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
    if (tab === "combine") setShowDateFilter(true);
    else {
      setCustomDateRange({ startDate: null, endDate: null });
      setShowDateFilter(false);
    }
  };

  const handleCloseDateFilterModal = () => {
    setShowDateFilter(false);
    if (
      selectedTab === "combine" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    )
      setSelectedTab("daily");
  };

  const getSerialNumber = (index) =>
    (currentPage - 1) * saleSummaryPerPage + index + 1;

  const getActiveFilterDisplay = () => {
    if (
      selectedTab === "combine" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      return `${formatDateToReadable(customDateRange.startDate)} - ${formatDateToReadable(customDateRange.endDate)}`;
    } else if (selectedTab === "daily") return "All Dates";
    return "Select Date Range";
  };

  const getEmptyColSpan = () => {
    if (selectedTab === "daily") return isSuperAdmin ? 8 : 7;
    return isSuperAdmin ? 7 : 6;
  };

  // ── Summary Cards ──────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    const cardClass = `bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border border-gray-200`;
    const labelClass = `${isMobileView ? "text-xs" : "text-sm"} text-gray-600`;
    const valueClass = `${isMobileView ? "text-lg" : "text-2xl"} font-bold text-gray-800`;
    const subClass = "text-xs text-gray-500 mt-1";
    const iconSize = isMobileView ? "w-6 h-6" : "w-8 h-8";

    return (
      <div
        className={`grid gap-3 md:gap-6 mb-4 md:mb-6 ${isSuperAdmin ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3"}`}
      >
        <div className={`${cardClass} border-blue-500`}>
          <div className="flex justify-between items-center">
            <div>
              <p className={labelClass}>Total Sales</p>
              <p className={valueClass}>
                $
                {totals.totalSales.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className={subClass}>{getActiveFilterDisplay()}</p>
            </div>
            <DollarSign className={`${iconSize} text-blue-500`} />
          </div>
        </div>

        <div className={`${cardClass} border-green-500`}>
          <div className="flex justify-between items-center">
            <div>
              <p className={labelClass}>Total Quantity</p>
              <p className={valueClass}>
                {totals.totalQuantity.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className={subClass}>{getActiveFilterDisplay()}</p>
            </div>
            <Package className={`${iconSize} text-green-500`} />
          </div>
        </div>

        {isSuperAdmin && (
          <div className={`${cardClass} border-purple-500`}>
            <div className="flex justify-between items-center">
              <div>
                <p className={labelClass}>Total Profit</p>
                <p className={valueClass}>
                  $
                  {totals.totalProfit.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className={subClass}>{getActiveFilterDisplay()}</p>
              </div>
              <TrendingUp className={`${iconSize} text-purple-500`} />
            </div>
          </div>
        )}

        <div className={`${cardClass} border-orange-500`}>
          <div className="flex justify-between items-center">
            <div>
              <p className={labelClass}>Total Products</p>
              <p className={valueClass}>
                {totals.totalProducts.toLocaleString()}
              </p>
              <p className={subClass}>
                {isMobileView
                  ? selectedTab === "combine"
                    ? "Unique"
                    : "Combinations"
                  : selectedTab === "combine"
                    ? "Unique Products"
                    : "Product-Day Combinations"}
              </p>
            </div>
            <BarChart3 className={`${iconSize} text-orange-500`} />
          </div>
        </div>
      </div>
    );
  };

  // ── Table ──────────────────────────────────────────────────────────────────
  const thClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`;
  const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;

  const renderTableHeaders = () => {
    if (selectedTab === "daily") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className={thClass}>Sr.No</th>
            <th className={thClass}>Date</th>
            <th className={thClass}>Product Name</th>
            <th className={thClass}>Sales Qty</th>
            {!isMobileView && <th className={thClass}>Bonus Qty</th>}
            <th className={thClass}>Total Qty</th>
            <th className={thClass}>Amount ($)</th>
            {isSuperAdmin && !isMobileView && (
              <th className={thClass}>Profit ($)</th>
            )}
          </tr>
        </thead>
      );
    } else {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className={thClass}>Sr.No</th>
            <th className={thClass}>Product Name</th>
            <th className={thClass}>Sales Qty</th>
            {!isMobileView && <th className={thClass}>Bonus Qty</th>}
            <th className={thClass}>Total Qty</th>
            <th className={thClass}>Amount ($)</th>
            {isSuperAdmin && !isMobileView && (
              <th className={thClass}>Profit ($)</th>
            )}
          </tr>
        </thead>
      );
    }
  };

  const renderTableRows = () =>
    currentData.map((item, index) => {
      const isLastRow = index === currentData.length - 1;
      const rowStyle = {
        borderBottom: isLastRow ? "none" : "1px solid #e5e7eb",
      };
      if (selectedTab === "daily") {
        return (
          <tr
            key={`${item.date}-${item.productName}-${index}`}
            className="hover:bg-gray-50"
            style={rowStyle}
          >
            <td className={tdClass}>
              <span className="text-gray-600 font-medium">
                {getSerialNumber(index)}
              </span>
            </td>
            <td className={`${tdClass} text-gray-600`}>
              {formatDateToReadable(item.date)}
            </td>
            <td className={`${tdClass} font-medium text-gray-900 capitalize`}>
              {item.productName}
            </td>
            <td className={`${tdClass} text-gray-800`}>
              {formatNumber(item.salesQuantity)}
            </td>
            {!isMobileView && (
              <td className={`${tdClass} text-gray-800`}>
                {formatNumber(item.bonusQuantity)}
              </td>
            )}
            <td className={`${tdClass} text-gray-800`}>
              {formatNumber(item.totalQuantity)}
            </td>
            <td className={`${tdClass} font-semibold text-green-600`}>
              ${formatNumber(item.amount)}
            </td>
            {isSuperAdmin && !isMobileView && (
              <td className={`${tdClass} font-semibold text-blue-600`}>
                ${formatNumber(item.profit)}
              </td>
            )}
          </tr>
        );
      } else {
        return (
          <tr
            key={`${item.productName}-${index}`}
            className="hover:bg-gray-50"
            style={rowStyle}
          >
            <td className={tdClass}>
              <span className="text-gray-600 font-medium">
                {getSerialNumber(index)}
              </span>
            </td>
            <td className={`${tdClass} font-medium text-gray-900 capitalize`}>
              {item.productName}
            </td>
            <td className={`${tdClass} text-gray-800`}>
              {formatNumber(item.salesQuantity)}
            </td>
            {!isMobileView && (
              <td className={`${tdClass} text-gray-800`}>
                {formatNumber(item.bonusQuantity)}
              </td>
            )}
            <td className={`${tdClass} text-gray-800`}>
              {formatNumber(item.totalQuantity)}
            </td>
            <td className={`${tdClass} font-semibold text-green-600`}>
              ${formatNumber(item.amount)}
            </td>
            {isSuperAdmin && !isMobileView && (
              <td className={`${tdClass} font-semibold text-blue-600`}>
                ${formatNumber(item.profit)}
              </td>
            )}
          </tr>
        );
      }
    });

  // ── Pagination (Improved like DailyReports component) ─────────────────────────
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          visiblePages.map((page, idx) => (
            <button
              key={idx}
              onClick={() => typeof page === "number" && setCurrentPage(page)}
              disabled={page === "..."}
              className={`px-4 py-2 rounded text-sm ${
                page === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))
        ) : (
          <span className="px-3 py-1 text-sm text-gray-700 font-medium">
            Page {currentPage} of {totalPages}
          </span>
        )}
        <button
          onClick={() =>
            setCurrentPage((prev) => Math.min(prev + 1, totalPages))
          }
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  if (isLoading && currentData.length === 0) {
    return <LoadingOverlay text="Loading sales summary..." />;
  }

  const getEmptyColSpanMobile = () => {
    if (selectedTab === "daily") return 6;
    return 5;
  };

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
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">Sales Summary</h1>
          </div>
          <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
            {getFilteredData.length} records
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={15}
          />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
          />
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Sales Summary Report
              </h1>
              <p className="text-sm text-gray-600">
                Track and analyze sales performance
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => {
                  inputRef.current?.focus();
                }}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
            {/* Export button — desktop only */}
            <button
              onClick={handleExportToExcel}
              disabled={exportLoading || getFilteredData.length === 0}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md transition-colors min-w-[140px]"
            >
              {exportLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <FileDown size={18} />
                  <span>Export Excel</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Tabs and Filter Info ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 md:mb-6 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            onClick={() => handleTabChange("daily")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === "daily" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            {isMobileView ? "Daily" : "Daily Summary"}
          </button>
          <button
            onClick={() => handleTabChange("combine")}
            className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === "combine" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            {isMobileView ? "Combine" : "Combine Summary"}
          </button>
        </div>
        <div
          className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600 flex-wrap`}
        >
          <Filter size={isMobileView ? 13 : 16} />
          <span>Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
          <span className="mx-1">•</span>
          <span className="font-medium capitalize">{selectedTab}</span>
        </div>
      </div>

      {renderSummaryCards()}

      {/* ── Data Table ── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center ${isMobileView ? "min-w-[420px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {currentData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    isMobileView ? getEmptyColSpanMobile() : getEmptyColSpan()
                  }
                  className="p-8 text-center"
                >
                  <Package className="w-12 h-12 md:w-16 md:h-16 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-base md:text-lg font-medium text-gray-900 mb-2">
                    No data found
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto text-sm">
                    {searchTerm
                      ? `No sales data found for "${searchTerm}".`
                      : selectedTab === "combine" &&
                          (!customDateRange.startDate ||
                            !customDateRange.endDate)
                        ? "Please select a date range to view combine summary"
                        : "No sales data available."}
                  </p>
                </td>
              </tr>
            ) : (
              renderTableRows()
            )}
          </tbody>
        </table>
        {currentData.length > 0 && totalPages > 1 && renderPagination()}
      </div>

      {/* ── Date Filter Modal ── */}
      {showDateFilter &&
        selectedTab === "combine" &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 px-4">
            <div className="bg-white w-full max-w-md p-5 rounded-xl shadow-lg">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-base md:text-lg font-semibold text-gray-800">
                  {isMobileView
                    ? "Select Date Range"
                    : "Select Date Range for Combine Summary"}
                </h2>
                <button
                  onClick={handleCloseDateFilterModal}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      handleCustomDateChange("startDate", date)
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholderText="Select start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={customDateRange.endDate}
                    onChange={(date) => handleCustomDateChange("endDate", date)}
                    selectsEnd
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    minDate={customDateRange.startDate}
                    className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholderText="Select end date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                    required
                  />
                </div>
              </div>
              <div className="flex justify-between gap-3">
                <button
                  onClick={handleClearFilters}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                >
                  Clear All
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleCloseDateFilterModal}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustomFilter}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default SaleSummary;
