import React, { useState, useEffect } from "react";
import {
  DollarSign,
  Download,
  Filter,
  Calendar,
  X,
  Package,
  ChevronLeft,
  ChevronRight,
  Menu,
  TrendingUp,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─────────────────────────────────────────────────────────────────────────────
// TIMEZONE-SAFE: build "YYYY-MM-DD" from local year/month/day values
// new Date(year, month, 1).toISOString() → shifts to previous day in UTC+7
// Using padded string directly avoids any timezone conversion
// ─────────────────────────────────────────────────────────────────────────────
const toDateStr = (year, month, day) => {
  const m = String(month + 1).padStart(2, "0"); // month is 0-indexed
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
};

const CashSales = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedSaleInfo, setSelectedSaleInfo] = useState(null);
  const [grandTotal, setGrandTotal] = useState(0);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(8);

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

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();

  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    if (currentMonth === 0) {
      // January → use entire previous year
      const previousYear = currentYear - 1;
      return {
        startDate: `${previousYear}-01-01`,
        endDate: `${previousYear}-12-31`,
        label: `Jan - Dec ${previousYear}`,
      };
    }

    // Last day of previous month: month 0-indexed, so currentMonth - 1 last day
    const lastDayOfPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    return {
      startDate: `${currentYear}-01-01`,
      endDate: toDateStr(currentYear, currentMonth - 1, lastDayOfPrevMonth),
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  // ── TIMEZONE-SAFE getDateRange ─────────────────────────────────────────────
  // Never use .toISOString() on local Date objects — it shifts by UTC offset
  const getDateRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    switch (selectedTab) {
      case "currentMonth": {
        // First day of current month
        const startDate = toDateStr(currentYear, currentMonth, 1);
        // Last day of current month
        const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
        const endDate = toDateStr(currentYear, currentMonth, lastDay);
        return { startDate, endDate };
      }

      case "janToPreviousMonth":
        return getJanToPreviousMonthRange();

      case "custom":
        return {
          // DatePicker returns a Date object — extract local parts to avoid shift
          startDate: customDateRange.startDate
            ? toDateStr(
                customDateRange.startDate.getFullYear(),
                customDateRange.startDate.getMonth(),
                customDateRange.startDate.getDate(),
              )
            : "",
          endDate: customDateRange.endDate
            ? toDateStr(
                customDateRange.endDate.getFullYear(),
                customDateRange.endDate.getMonth(),
                customDateRange.endDate.getDate(),
              )
            : "",
        };

      default:
        return {};
    }
  };

  const fetchCashSales = async () => {
    setLoading(true);
    try {
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        setData([]);
        setGrandTotal(0);
        setCurrentPage(1);
        return;
      }

      const response = await axios.get(`${backendUrl}/api/reports/cash-sales`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        },
      });

      const records = response.data.data || [];
      setData(records);
      setGrandTotal(response.data.totalSalesAmount || 0);
      setCurrentPage(1); // Reset to first page when new data loads
    } catch (error) {
      console.error("Error fetching cash sales:", error);
      showToast("error", "Failed to fetch cash sales data");
      setData([]);
      setGrandTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    ) {
      setData([]);
      setGrandTotal(0);
      return;
    }
    fetchCashSales();
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    ) {
      fetchCashSales();
    }
  }, [customDateRange.startDate, customDateRange.endDate]);

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
    setSelectedTab("custom");
    setShowCustomFilter(false);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") setShowCustomFilter(true);
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();

      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast(
          "warning",
          "Please select both start and end dates for export",
        );
        return;
      }

      if (data.length === 0) {
        showToast("warning", "No data available to export");
        return;
      }

      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);

      const response = await axios.get(
        `${backendUrl}/api/reports/cash-sales/export/excel?${params.toString()}`,
        { responseType: "blob" },
      );

      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      let fileName =
        dateRange.startDate && dateRange.endDate
          ? `cash-sales-${dateRange.startDate.replace(/-/g, "")}-to-${dateRange.endDate.replace(/-/g, "")}`
          : `cash-sales-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`;
      fileName += ".xlsx";

      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  const showProductDetails = (products, sale) => {
    setSelectedProducts(products);
    setSelectedSaleInfo({
      invoiceNumber: sale.invoiceNumber,
      customerName: sale.customerName,
      invoiceDate: sale.invoiceDate,
      collectedAmount: sale.collectedAmount || sale.totalAmount || 0,
    });
    setShowProductModal(true);
  };

  // Format a date string/object for display — use UTC fields to avoid shift
  const fmtDate = (d) => {
    if (!d) return "N/A";
    return formatDateToReadable(d);
  };

  const getActiveFilterDisplay = () => {
    const dr = getDateRange();
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;
      case "custom":
        if (dr.startDate && dr.endDate)
          return `${dr.startDate} to ${dr.endDate}`;
        return "Select custom dates";
      default:
        return "";
    }
  };

  const isExportDisabled = loading || exportLoading || data.length === 0;

  // Pagination calculations
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = data.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(data.length / itemsPerPage);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;

    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const startPage = Math.max(1, currentPage - 2);
      const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

      if (startPage > 1) {
        pageNumbers.push(1);
        if (startPage > 2) pageNumbers.push("...");
      }

      for (let i = startPage; i <= endPage; i++) {
        pageNumbers.push(i);
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) pageNumbers.push("...");
        pageNumbers.push(totalPages);
      }
    }

    return pageNumbers;
  };

  // ── Responsive Pagination ─────────────────────────────────────────────────
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-3 md:p-5 flex gap-2 ${isMobileView ? "justify-center items-center flex-wrap" : "justify-start"}`}
      >
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-xs md:text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          getPageNumbers().map((pageNum, idx) => (
            <button
              key={idx}
              onClick={() =>
                typeof pageNum === "number" && handlePageChange(pageNum)
              }
              disabled={typeof pageNum !== "number"}
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded text-xs md:text-sm ${
                pageNum === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : currentPage === pageNum
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {pageNum}
            </button>
          ))
        ) : (
          <span className="px-3 py-1 text-xs text-gray-700 font-medium">
            Page {currentPage} of {totalPages}
          </span>
        )}
        <button
          onClick={handleNextPage}
          disabled={currentPage === totalPages}
          className="px-3 md:px-4 py-1.5 md:py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-xs md:text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  // ── Summary Cards ──────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    const cards = [
      {
        label: "Total Cash Sales",
        value: `$${grandTotal.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        icon: (
          <DollarSign
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
          />
        ),
        border: "border-green-500",
        sub: "Sum of paid amounts only",
      },
      {
        label: "Total Transactions",
        value: data.length,
        icon: (
          <Calendar
            className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
          />
        ),
        border: "border-blue-500",
        sub: "",
      },
    ];
    return (
      <div
        className={`grid gap-4 mb-6 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-2"}`}
      >
        {cards.map(({ label, value, icon, border, sub }) => (
          <div
            key={label}
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 ${border} border border-gray-200`}
          >
            <div className="flex justify-between items-center">
              <div>
                <p
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                >
                  {label}
                </p>
                <p
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold text-gray-800`}
                >
                  {value}
                </p>
                {sub && (
                  <p
                    className={`${isMobileView ? "text-[10px]" : "text-xs"} text-gray-400 mt-1`}
                  >
                    {sub}
                  </p>
                )}
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ── Table Headers ──────────────────────────────────────────────────────────
  const renderTableHeaders = () => {
    const thClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`;
    return (
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className={thClass}>Sr.No</th>
          <th className={thClass}>Invoice Date</th>
          <th className={thClass}>Invoice Number</th>
          <th className={thClass}>Customer</th>
          <th className={thClass}>Product</th>
          <th className={thClass}>Status</th>
          <th className={thClass}>Collected Amount ($)</th>
        </tr>
      </thead>
    );
  };

  // ── Table Row ──────────────────────────────────────────────────────────────
  const renderTableRow = (sale, index) => {
    const tdClass = `${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`;
    const hasMultipleProducts =
      sale.displayProducts && sale.displayProducts.length > 1;
    const productCount = sale.displayProducts?.length || 1;

    return (
      <tr
        key={index}
        className={`hover:bg-gray-50 ${index === currentItems.length - 1 ? "" : "border-b"}`}
      >
        <td className={tdClass}>
          <div className="text-gray-600 font-medium">
            {indexOfFirstItem + index + 1}
          </div>
        </td>
        <td className={tdClass}>
          <div className="text-gray-900">{fmtDate(sale.invoiceDate)}</div>
        </td>
        <td className={tdClass}>
          <div
            className={`font-mono font-semibold text-indigo-700 ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            {sale.invoiceNumber}
          </div>
        </td>
        <td className={tdClass}>
          <div className="text-gray-900 capitalize">{sale.customerName}</div>
        </td>
        <td className={tdClass}>
          <div className="flex items-center justify-center gap-2">
            {hasMultipleProducts ? (
              <button
                onClick={() => showProductDetails(sale.displayProducts, sale)}
                className={`flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 cursor-pointer ${isMobileView ? "text-xs" : "text-sm"}`}
              >
                <Package size={isMobileView ? 12 : 14} />
                <span>{productCount} products</span>
              </button>
            ) : (
              <span className="capitalize">
                {sale.displayProducts?.[0]?.productName ||
                  sale.productName ||
                  "N/A"}
              </span>
            )}
          </div>
        </td>
        <td className={tdClass}>
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              (sale.paymentStatus || "").toLowerCase() === "cash"
                ? "bg-green-100 text-green-700"
                : (sale.paymentStatus || "").toLowerCase() === "paid"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {sale.paymentStatus || "N/A"}
          </span>
        </td>
        <td className={`${tdClass} font-semibold text-green-600`}>
          $
          {(sale.collectedAmount || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </td>
      </tr>
    );
  };

  // Get colSpan for table
  const getColSpan = () => {
    return 7;
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
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">Cash Sales</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total Records: {data.length}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-800">
              Total Cash Sales
            </h1>
          </div>
          {/* Export button - hidden on mobile, visible on desktop */}
          <button
            onClick={exportToExcel}
            disabled={isExportDisabled}
            className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl shadow-md cursor-pointer ${
              isExportDisabled
                ? "bg-gray-400 text-gray-700 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            <Download size={18} />
            {exportLoading ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-6 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            {
              key: "currentMonth",
              label: isMobileView
                ? `${getCurrentMonthName().slice(0, 3)} ${getCurrentYear()}`
                : `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`,
            },
            {
              key: "janToPreviousMonth",
              label: isMobileView
                ? getJanToPreviousMonthRange()
                    .label.replace("January", "Jan")
                    .replace("February", "Feb")
                    .replace("March", "Mar")
                : getJanToPreviousMonthRange().label,
            },
            { key: "custom", label: "Custom Filter" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${
                selectedTab === key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className={`flex items-center gap-2 ${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
        >
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
          <span className="text-gray-500 ml-2">
            ({data.length} records found)
          </span>
        </div>
      </div>

      {renderSummaryCards()}

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table
          className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[700px]" : ""}`}
        >
          {renderTableHeaders()}
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={getColSpan()} className="p-8 text-center">
                  <div className="flex justify-center items-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                    <span
                      className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
                    >
                      Loading...
                    </span>
                  </div>
                </td>
              </tr>
            ) : currentItems.length > 0 ? (
              currentItems.map((sale, index) => renderTableRow(sale, index))
            ) : (
              <tr>
                <td
                  colSpan={getColSpan()}
                  className={`p-8 text-center ${isMobileView ? "text-xs" : "text-sm"} text-gray-500`}
                >
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No cash sales data found for the selected period"}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && data.length > 0 && (
          <div className="bg-gray-50 border-t">
            <div className="flex flex-col sm:flex-row justify-between items-center p-3 md:p-4 gap-3">
              <div className="text-xs md:text-sm text-gray-600 order-2 sm:order-1">
                Showing {indexOfFirstItem + 1} to{" "}
                {Math.min(indexOfLastItem, data.length)} of {data.length}{" "}
                entries
              </div>
              <div className="flex gap-1 order-1 sm:order-2">
                {renderPagination()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Product Details Modal - Responsive */}
      {showProductModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowProductModal(false)}
            />
            <div className="bg-white w-full max-w-6xl p-4 md:p-6 rounded-xl shadow-lg relative z-10 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setShowProductModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4">
                Product Details
              </h2>

              {selectedSaleInfo && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 p-3 md:p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs text-gray-600">Invoice Number</p>
                    <p className="text-xs md:text-sm font-medium">
                      {selectedSaleInfo.invoiceNumber}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Customer</p>
                    <p className="text-xs md:text-sm font-medium capitalize">
                      {selectedSaleInfo.customerName}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Invoice Date</p>
                    <p className="text-xs md:text-sm font-medium">
                      {fmtDate(selectedSaleInfo.invoiceDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Collected Amount</p>
                    <p className="text-xs md:text-sm font-medium text-green-600">
                      $
                      {(selectedSaleInfo.collectedAmount || 0).toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                    </p>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-[600px] w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm text-center">
                  <thead className="bg-gray-100 text-gray-700">
                    <tr>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Sr.No
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Product Name
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Sales Qty
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Bonus Qty
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Total Qty
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Selling Price ($)
                      </th>
                      <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        Amount ($)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.map((product, index) => {
                      const totalQty =
                        product.totalQty ||
                        (product.salesQty || 0) + (product.bonusQty || 0);
                      return (
                        <tr
                          key={index}
                          className={`hover:bg-gray-50 ${index === selectedProducts.length - 1 ? "" : "border-b"}`}
                        >
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900">
                            {index + 1}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900 capitalize">
                            {product.productName}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900">
                            {product.salesQty || 0}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900">
                            {product.bonusQty || 0}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900 font-medium">
                            {totalQty}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900">
                            $
                            {product.sellingPrice
                              ? product.sellingPrice.toFixed(2)
                              : "0.00"}
                          </td>
                          <td className="p-2 md:p-3 text-xs md:text-sm text-gray-900">
                            $
                            {product.amount
                              ? product.amount.toLocaleString()
                              : "0"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td
                        colSpan="2"
                        className="p-2 md:p-3 text-right text-xs md:text-sm font-medium text-gray-700"
                      >
                        Total:
                      </td>
                      <td className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        {selectedProducts.reduce(
                          (s, p) => s + (p.salesQty || 0),
                          0,
                        )}
                      </td>
                      <td className="p-2 md:p-3 text-xs md:text-sm font-medium">
                        {selectedProducts.reduce(
                          (s, p) => s + (p.bonusQty || 0),
                          0,
                        )}
                      </td>
                      <td className="p-2 md:p-3 text-xs md:text-sm font-bold text-blue-700">
                        {selectedProducts.reduce(
                          (s, p) =>
                            s +
                            (p.totalQty ||
                              (p.salesQty || 0) + (p.bonusQty || 0)),
                          0,
                        )}
                      </td>
                      <td className="p-2 md:p-3" />
                      <td className="p-2 md:p-3 text-xs md:text-sm font-bold text-green-700">
                        $
                        {selectedProducts
                          .reduce((s, p) => s + (p.amount || 0), 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowProductModal(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-5 py-1.5 md:py-2 rounded-lg cursor-pointer text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Custom Filter Modal - Responsive */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowCustomFilter(false)}
            />
            <div className="bg-white w-full max-w-md p-4 md:p-6 rounded-xl shadow-lg relative z-10">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-base md:text-lg font-semibold text-gray-800 mb-4">
                Total Cash Sales Filter
              </h2>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      handleCustomDateChange("startDate", date)
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholderText="Select start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <DatePicker
                    selected={customDateRange.endDate}
                    onChange={(date) => handleCustomDateChange("endDate", date)}
                    selectsEnd
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    minDate={customDateRange.startDate}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholderText="Select end date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 md:px-5 py-1.5 md:py-2 rounded-lg cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-5 py-1.5 md:py-2 rounded-lg cursor-pointer text-sm"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default CashSales;
