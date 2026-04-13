import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Calendar,
  AlertTriangle,
  Package,
  DollarSign,
  Search,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const ExpiryStockReport = () => {
  const [data, setData] = useState({
    summary: {
      totalExpiringSoon: 0,
      totalNearExpiryValue: 0,
      criticalItems: 0,
      expiredItems: 0,
      expiredValue: 0,
      totalItems: 0,
      filteredExpiringSoon: 0,
      filteredNearExpiryValue: 0,
      filteredCriticalItems: 0,
      filteredExpiredItems: 0,
      filteredExpiredValue: 0,
      totalBoxes: 0,
      totalValue: 0,
    },
    items: [],
    pagination: {
      total: 0,
      page: 1,
      limit: 10,
      pages: 1,
    },
  });

  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [itemsPerPage] = useState(10);
  const inputRef = useRef(null);

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

  const fetchExpiryStockData = async (
    page = currentPage,
    filterType = filter,
    search = searchTerm,
  ) => {
    setLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/reports/expiry-stock`,
        {
          params: {
            page: page,
            limit: itemsPerPage,
            filter: filterType,
            search: search,
          },
        },
      );

      if (response.data.success) {
        setData(
          response.data.data || {
            summary: {
              totalExpiringSoon: 0,
              totalNearExpiryValue: 0,
              criticalItems: 0,
              expiredItems: 0,
              expiredValue: 0,
              totalItems: 0,
              filteredExpiringSoon: 0,
              filteredNearExpiryValue: 0,
              filteredCriticalItems: 0,
              filteredExpiredItems: 0,
              filteredExpiredValue: 0,
              totalBoxes: 0,
              totalValue: 0,
            },
            items: [],
            pagination: { total: 0, page: 1, limit: 10, pages: 1 },
          },
        );
        setCurrentPage(response.data.data.pagination.page);
      } else {
        showToast("error", response.data.message || "Failed to load data");
      }
    } catch (error) {
      console.error("Error fetching expiry stock data:", error);
      showToast("error", "Failed to fetch expiry stock data");
      setData({
        summary: {
          totalExpiringSoon: 0,
          totalNearExpiryValue: 0,
          criticalItems: 0,
          expiredItems: 0,
          expiredValue: 0,
          totalItems: 0,
          filteredExpiringSoon: 0,
          filteredNearExpiryValue: 0,
          filteredCriticalItems: 0,
          filteredExpiredItems: 0,
          filteredExpiredValue: 0,
          totalBoxes: 0,
          totalValue: 0,
        },
        items: [],
        pagination: { total: 0, page: 1, limit: 10, pages: 1 },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryStockData();
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setCurrentPage(1);
      fetchExpiryStockData(1, filter, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
    fetchExpiryStockData(1, newFilter, searchTerm);
  };

  const capitalizeFirstLetter = (str) => {
    if (!str || typeof str !== "string") return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= data.pagination.pages) {
      setCurrentPage(newPage);
      fetchExpiryStockData(newPage, filter, searchTerm);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleSearchIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  const isExportEnabled = () => data.items.length > 0;

  // ─── Export to Excel ──────────────────────────────────────────────────────
  const exportToExcel = async () => {
    if (!isExportEnabled()) {
      showToast("warning", "No data to export");
      return;
    }

    try {
      setExportLoading(true);
      showToast("info", "Preparing Excel file...");

      const response = await axios.get(
        `${backendUrl}/api/reports/expiry-stock/export`,
        { params: { filter, search: searchTerm } },
      );

      if (!response.data.success) {
        showToast("error", "Failed to fetch data for export");
        setExportLoading(false);
        return;
      }

      const exportData = response.data.data;
      const exportItems = exportData.items;

      if (exportItems.length === 0) {
        showToast("warning", "No data to export");
        setExportLoading(false);
        return;
      }

      const excelData = exportItems.map((item) => ({
        "Product Name": item.productName,
        Supplier: item.supplierName,
        Type: item.type,
        "Batch Number": item.batchNumber,
        "Expiry Date": formatDateToReadable(item.expiryDate),
        Status: getStatusText(item),
        "Days Remaining": item.isExpired
          ? `Expired ${item.daysRemaining} days ago`
          : `${item.daysRemaining} days left`,
        "Quantity (Boxes)": item.quantity,
        "Unit Price (LC)": `$${item.unitPrice?.toFixed(4)}`,
        "Total Value (LC)": `$${item.totalValue?.toFixed(2)}`,
        "CIF Price": `$${item.cif?.toFixed(4)}`,
        "FOB Price": `$${item.fob?.toFixed(4)}`,
        Amount: `$${item.amount?.toFixed(2)}`,
        "Batch Date": item.date ? formatDateToReadable(item.date) : "N/A",
        "Product Status": item.status || "N/A",
      }));

      const wb = XLSX.utils.book_new();
      const summaryData = prepareSummaryData(exportData);

      const allData = [
        [
          `Expiry Stock Report - ${exportData.filterLabel}`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        [
          `Report Generated: ${exportData.generatedDate}`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        [
          `Values calculated using LC (Landed Cost) price`,
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ],
        ...(searchTerm
          ? [
              [
                `Search Term: "${searchTerm}"`,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
              ],
            ]
          : []),
        [],
        ["SUMMARY", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
        ...summaryData.map((row) =>
          row.map((cell) => (cell === null ? "" : cell)),
        ),
        [],
        [
          "Product Name",
          "Supplier",
          "Type",
          "Batch Number",
          "Expiry Date",
          "Status",
          "Days Remaining",
          "Quantity (Boxes)",
          "Unit Price (LC)",
          "Total Value (LC)",
          "CIF Price",
          "FOB Price",
          "Amount",
          "Batch Date",
          "Product Status",
        ],
        ...excelData.map((item) => [
          item["Product Name"],
          item["Supplier"],
          item["Type"],
          item["Batch Number"],
          item["Expiry Date"],
          item["Status"],
          item["Days Remaining"],
          item["Quantity (Boxes)"],
          item["Unit Price (LC)"],
          item["Total Value (LC)"],
          item["CIF Price"],
          item["FOB Price"],
          item["Amount"],
          item["Batch Date"],
          item["Product Status"],
        ]),
      ];

      const ws = XLSX.utils.aoa_to_sheet(allData);
      ws["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 14 } },
        ...(searchTerm ? [{ s: { r: 3, c: 0 }, e: { r: 3, c: 14 } }] : []),
      ];
      ws["!cols"] = [
        { wch: 30 },
        { wch: 25 },
        { wch: 15 },
        { wch: 20 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 16 },
        { wch: 16 },
        { wch: 12 },
        { wch: 12 },
        { wch: 15 },
        { wch: 15 },
        { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Expiry Stock Report");

      const fileName = `expiry-stock-report-${new Date().toISOString().split("T")[0]}-${filter}${
        searchTerm ? `-search-${searchTerm.substring(0, 10)}` : ""
      }.xlsx`;
      XLSX.writeFile(wb, fileName);

      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export Excel file");
    } finally {
      setExportLoading(false);
    }
  };

  // ─── Summary data for Excel ───────────────────────────────────────────────
  const prepareSummaryData = (exportData) => {
    const summaryRows = [];
    switch (filter) {
      case "all":
        summaryRows.push([
          "Total Items:",
          exportData.summary.totalItems,
          "",
          "Total Boxes:",
          exportData.summary.totalBoxes?.toFixed(1) || "0",
          "",
          "Total Value (LC):",
          `$${exportData.summary.totalValue?.toFixed(2) || "0.00"}`,
        ]);
        summaryRows.push([]);
        summaryRows.push([
          "Expiring Soon (≤15 days):",
          exportData.summary.totalExpiringSoon,
          "",
          "Near Expiry Value (LC):",
          `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`,
          "",
          "Critical Items (≤3 days):",
          exportData.summary.criticalItems,
        ]);
        summaryRows.push([]);
        summaryRows.push([
          "Expired Items:",
          exportData.summary.expiredItems,
          "",
          "Expired Value (LC):",
          `$${exportData.summary.expiredValue?.toFixed(2) || "0.00"}`,
        ]);
        break;
      case "expired":
        summaryRows.push([
          "Expired Items:",
          exportData.summary.expiredItems,
          "",
          "Expired Value (LC):",
          `$${exportData.summary.expiredValue?.toFixed(2) || "0.00"}`,
        ]);
        break;
      case "near-expiry":
        summaryRows.push([
          "Expiring Soon (≤15 days):",
          exportData.summary.totalExpiringSoon,
          "",
          "Near Expiry Value (LC):",
          `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`,
        ]);
        summaryRows.push([]);
        summaryRows.push([
          "Critical Items (≤3 days):",
          exportData.summary.criticalItems,
        ]);
        break;
      case "critical":
        summaryRows.push([
          "Critical Items (≤3 days):",
          exportData.summary.criticalItems,
          "",
          "Near Expiry Value (LC):",
          `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`,
        ]);
        break;
      default:
        summaryRows.push([
          "Total Items:",
          exportData.summary.totalItems,
          "",
          "Total Boxes:",
          exportData.summary.totalBoxes?.toFixed(1) || "0",
          "",
          "Total Value (LC):",
          `$${exportData.summary.totalValue?.toFixed(2) || "0.00"}`,
        ]);
    }
    return summaryRows;
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const getDaysRemainingColor = (item) => {
    if (item.isExpired) return "text-red-800 bg-red-100";
    if (item.daysRemaining <= 3) return "text-red-600 bg-red-50";
    if (item.daysRemaining <= 7) return "text-orange-600 bg-orange-50";
    if (item.daysRemaining <= 15) return "text-yellow-600 bg-yellow-50";
    return "text-gray-600 bg-gray-50";
  };

  const getStatusText = (item) => {
    if (item.isExpired) return `Expired ${item.daysRemaining} days ago`;
    if (item.daysRemaining === 0) return "Expires today";
    if (item.daysRemaining === 1) return "1 day left";
    return `${item.daysRemaining} days left`;
  };

  const getStatusIcon = (item) => {
    if (item.isExpired || item.daysRemaining <= 3)
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (item.daysRemaining <= 7)
      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    return <Calendar className="w-4 h-4 text-yellow-500" />;
  };

  // ─── Pagination (Daily Report Style) ──────────────────────────────────────
  const renderPagination = () => {
    const { pagination } = data;
    const totalPages = pagination.pages;
    const currentPg = pagination.page;

    if (totalPages <= 1) return null;

    // Generate visible pages for desktop (full pagination)
    const visiblePages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) visiblePages.push(i);
    } else {
      visiblePages.push(1);
      let startPage = Math.max(2, currentPg - 1);
      let endPage = Math.min(totalPages - 1, currentPg + 1);
      if (currentPg <= 3) endPage = Math.min(4, totalPages - 1);
      if (currentPg >= totalPages - 2) startPage = Math.max(totalPages - 3, 2);
      if (startPage > 2) visiblePages.push("...");
      for (let i = startPage; i <= endPage; i++) visiblePages.push(i);
      if (endPage < totalPages - 1) visiblePages.push("...");
      visiblePages.push(totalPages);
    }

    return (
      <div
        className={`mt-4 p-3 md:p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"} flex-wrap`}
      >
        <button
          onClick={() => handlePageChange(currentPg - 1)}
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
          visiblePages.map((page, index) => (
            <button
              key={index}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              disabled={page === "..."}
              className={`px-3 py-1.5 md:px-4 md:py-2 rounded text-sm ${
                page === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : currentPg === page
                    ? "bg-indigo-600 text-white cursor-pointer"
                    : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
              }`}
            >
              {page}
            </button>
          ))
        )}

        <button
          onClick={() => handlePageChange(currentPg + 1)}
          disabled={currentPg === totalPages}
          className="px-3 py-1.5 md:px-4 md:py-2 text-sm bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next
        </button>
      </div>
    );
  };

  // ─── Summary Cards ────────────────────────────────────────────────────────
  const renderSummaryCards = () => {
    let expiringSoonValue,
      nearExpiryValue,
      criticalValue,
      expiredValue,
      expiredItemsValue;
    let expiringSoonLabel,
      nearExpiryLabel,
      criticalLabel,
      expiredLabel,
      expiredItemsLabel;
    let showExpiringSoon = true,
      showNearExpiry = true,
      showCritical = true,
      showExpired = true,
      showExpiredValue = true;

    switch (filter) {
      case "all":
        expiringSoonValue = data.summary.filteredExpiringSoon;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = data.summary.filteredExpiredItems;
        expiredItemsValue = data.summary.filteredExpiredValue || 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value (LC)";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value (LC)";
        showExpiredValue = true;
        break;
      case "expired":
        expiringSoonValue = 0;
        nearExpiryValue = 0;
        criticalValue = 0;
        expiredValue = data.summary.filteredExpiredItems;
        expiredItemsValue = data.summary.filteredExpiredValue || 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value (LC)";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value (LC)";
        showExpiringSoon = false;
        showNearExpiry = false;
        showCritical = false;
        showExpiredValue = true;
        break;
      case "near-expiry":
        expiringSoonValue = data.summary.filteredExpiringSoon;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = 0;
        expiredItemsValue = 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value (LC)";
        criticalLabel = "Critical Items (≤3 days)";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value (LC)";
        showExpired = false;
        showExpiredValue = false;
        break;
      case "critical":
        expiringSoonValue = 0;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = 0;
        expiredItemsValue = 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value (LC)";
        criticalLabel = "Critical Items (≤3 days)";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value (LC)";
        showExpiringSoon = false;
        showExpired = false;
        showExpiredValue = false;
        break;
      default:
        expiringSoonValue = data.summary.filteredExpiringSoon;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = data.summary.filteredExpiredItems;
        expiredItemsValue = data.summary.filteredExpiredValue || 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value (LC)";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value (LC)";
        showExpiredValue = true;
    }

    const loadingBox = (
      <div className="h-6 w-16 md:h-8 md:w-20 bg-gray-200 rounded animate-pulse" />
    );

    const cardClass = `bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4`;
    const labelClass = `${isMobileView ? "text-xs" : "text-sm"} text-gray-600`;
    const valueClass = `${isMobileView ? "text-lg" : "text-2xl"} font-bold text-gray-800`;
    const subClass = `text-xs text-gray-500 mt-1`;
    const iconSize = isMobileView ? "w-6 h-6" : "w-8 h-8";

    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-6 mb-4 md:mb-6">
        {showExpiringSoon && (
          <div className={`${cardClass} border-yellow-500`}>
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{expiringSoonLabel}</div>
                <div className={valueClass}>
                  {loading
                    ? loadingBox
                    : expiringSoonValue?.toLocaleString() || 0}
                </div>
                <div className={subClass}>
                  {filter === "all"
                    ? `Total: ${data.summary.totalExpiringSoon?.toLocaleString() || 0} boxes`
                    : "Filtered only"}
                </div>
              </div>
              <Calendar className={`${iconSize} text-yellow-500`} />
            </div>
          </div>
        )}

        {showNearExpiry && (
          <div className={`${cardClass} border-orange-500`}>
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{nearExpiryLabel}</div>
                <div className={valueClass}>
                  {loading
                    ? loadingBox
                    : `$${nearExpiryValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}`}
                </div>
                <div className={subClass}>
                  {filter === "all"
                    ? `Total: $${data.summary.totalNearExpiryValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}`
                    : "Filtered only"}
                </div>
              </div>
              <DollarSign className={`${iconSize} text-orange-500`} />
            </div>
          </div>
        )}

        {showCritical && (
          <div className={`${cardClass} border-red-500`}>
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{criticalLabel}</div>
                <div className={valueClass}>
                  {loading ? loadingBox : criticalValue?.toLocaleString() || 0}
                </div>
                <div className={subClass}>
                  {filter === "all"
                    ? `Total: ${data.summary.criticalItems?.toLocaleString() || 0} boxes`
                    : "Filtered only"}
                </div>
              </div>
              <AlertTriangle className={`${iconSize} text-red-500`} />
            </div>
          </div>
        )}

        {showExpired && (
          <div className={`${cardClass} border-gray-500`}>
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{expiredLabel}</div>
                <div className={valueClass}>
                  {loading ? loadingBox : expiredValue?.toLocaleString() || 0}
                </div>
                <div className={subClass}>
                  {filter === "all"
                    ? `Total: ${data.summary.expiredItems?.toLocaleString() || 0} boxes`
                    : "Filtered only"}
                </div>
              </div>
              <AlertTriangle className={`${iconSize} text-gray-500`} />
            </div>
          </div>
        )}

        {showExpiredValue && (
          <div className={`${cardClass} border-red-800`}>
            <div className="flex justify-between items-center">
              <div>
                <div className={labelClass}>{expiredItemsLabel}</div>
                <div className={valueClass}>
                  {loading
                    ? loadingBox
                    : `$${expiredItemsValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}`}
                </div>
                <div className={subClass}>
                  {filter === "all"
                    ? `Total: $${data.summary.expiredValue?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}`
                    : "Filtered only"}
                </div>
              </div>
              <DollarSign className={`${iconSize} text-red-800`} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ─── Filter Buttons ───────────────────────────────────────────────────────
  const renderFilterButtons = () => (
    <div className="flex flex-wrap gap-2 mb-4">
      {[
        {
          key: "all",
          label: `All (${data.summary.totalItems || 0})`,
          fullLabel: `All Items (${data.summary.totalItems || 0})`,
          color: "blue",
        },
        {
          key: "expired",
          label: `Expired (${data.summary.expiredItems || 0})`,
          fullLabel: `Expired (${data.summary.expiredItems || 0})`,
          color: "red",
        },
        {
          key: "near-expiry",
          label: `≤15 days (${data.summary.totalExpiringSoon || 0})`,
          fullLabel: `Near Expiry ≤15 days (${data.summary.totalExpiringSoon || 0})`,
          color: "yellow",
        },
        {
          key: "critical",
          label: `≤3 days (${data.summary.criticalItems || 0})`,
          fullLabel: `Critical ≤3 days (${data.summary.criticalItems || 0})`,
          color: "orange",
        },
      ].map(({ key, label, fullLabel, color }) => (
        <button
          key={key}
          onClick={() => handleFilterChange(key)}
          className={`px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-colors ${
            filter === key
              ? `bg-${color}-600 text-white`
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {isMobileView ? label : fullLabel}
        </button>
      ))}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
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
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <h1 className="text-base font-bold text-gray-800">Expiry Stock</h1>
          </div>
          <div className="bg-orange-50 text-orange-700 px-3 py-1 rounded-full text-xs font-medium">
            {data.summary.totalItems || 0} items
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Expiry Stock Report
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Values calculated using LC (Landed Cost) price
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
                size={20}
                onClick={handleSearchIconClick}
              />
              <input
                type="text"
                placeholder="Search product or supplier..."
                value={searchTerm}
                ref={inputRef}
                onChange={handleSearchChange}
                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 w-64"
              />
            </div>

            {/* Export button — desktop only */}
            <button
              className={`flex items-center gap-2 ${
                !isExportEnabled() || exportLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 cursor-pointer"
              } text-white px-4 py-2 rounded-lg shadow-md transition-colors`}
              onClick={exportToExcel}
              disabled={!isExportEnabled() || exportLoading}
            >
              <Download
                size={18}
                className={exportLoading ? "animate-spin" : ""}
              />
              {exportLoading ? "Exporting..." : "Export Excel"}
            </button>
          </div>
        </div>
      )}

      {/* ── MOBILE Search ── */}
      {isMobileView && (
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={16}
          />
          <input
            type="text"
            placeholder="Search product or supplier..."
            value={searchTerm}
            ref={inputRef}
            onChange={handleSearchChange}
            className="pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 w-full text-sm"
          />
        </div>
      )}

      {renderSummaryCards()}

      <div className="mb-6">
        <div className="flex justify-between items-center mb-3 md:mb-4">
          <h2
            className={`${isMobileView ? "text-sm" : "text-lg"} font-semibold text-gray-800`}
          >
            {isMobileView ? "Items" : "Stock Items Expiring Soon or Expired"}
            <span className="ml-2 text-xs md:text-sm font-normal text-gray-600">
              ({data.items.length} on this page)
              {searchTerm && (
                <span className="ml-2 text-blue-600">• "{searchTerm}"</span>
              )}
            </span>
          </h2>
        </div>

        {renderFilterButtons()}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table
              className={`min-w-full divide-y divide-gray-200 text-center ${isMobileView ? "min-w-[480px]" : ""}`}
            >
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expiry Date
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Qty
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price (LC)
                  </th>
                  <th className="px-3 md:px-6 py-2 md:py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Value (LC)
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  Array.from({ length: itemsPerPage }).map((_, index) => (
                    <tr key={index}>
                      {Array.from({ length: 7 }).map((_, cellIndex) => (
                        <td
                          key={cellIndex}
                          className="px-3 md:px-6 py-3 md:py-4 whitespace-nowrap"
                        >
                          <div className="h-4 bg-gray-200 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.items.length > 0 ? (
                  data.items.map((item, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${item.isExpired ? "bg-red-50" : ""}`}
                    >
                      <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap">
                        <div
                          className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-900`}
                        >
                          {capitalizeFirstLetter(item.productName)}
                        </div>
                      </td>
                      <td
                        className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap ${isMobileView ? "text-xs" : "text-sm"} text-gray-900`}
                      >
                        {item.supplierName}
                      </td>
                      <td
                        className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap ${isMobileView ? "text-xs" : "text-sm"} text-gray-900`}
                      >
                        {formatDateToReadable(item.expiryDate)}
                      </td>
                      <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          {getStatusIcon(item)}
                          <span
                            className={`ml-1 inline-flex items-center px-2 py-0.5 rounded-full ${isMobileView ? "text-xs" : "text-xs"} font-medium ${getDaysRemainingColor(item)}`}
                          >
                            {getStatusText(item)}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap ${isMobileView ? "text-xs" : "text-sm"} text-gray-900`}
                      >
                        <span className="font-medium">
                          {item.quantity?.toLocaleString()}
                        </span>
                        {!isMobileView && " boxes"}
                      </td>
                      <td
                        className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap ${isMobileView ? "text-xs" : "text-sm"} text-gray-900`}
                      >
                        ${item.unitPrice?.toFixed(4)}
                      </td>
                      <td
                        className={`px-3 md:px-6 py-2 md:py-4 whitespace-nowrap ${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-900`}
                      >
                        ${item.totalValue?.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan="7"
                      className="px-6 py-8 text-center text-gray-500"
                    >
                      <Package className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mx-auto mb-2" />
                      <div className="text-sm">
                        {searchTerm
                          ? `No items found for "${searchTerm}"`
                          : "No items found for the selected filter"}
                      </div>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm("")}
                          className="mt-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          Clear search
                        </button>
                      )}
                      <button
                        onClick={() => handleFilterChange("all")}
                        className="mt-2 ml-2 text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Show all items
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data.items.length > 0 && renderPagination()}
        </div>
      </div>
    </div>
  );
};

export default ExpiryStockReport;
