import React, { useState, useEffect, useRef } from "react";
import {
  Download,
  Calendar,
  AlertTriangle,
  Package,
  DollarSign,
  RefreshCw,
  Search,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil.js";

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

  const fetchExpiryStockData = async (
    page = currentPage,
    filterType = filter,
    search = searchTerm
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
        }
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
            pagination: {
              total: 0,
              page: 1,
              limit: 10,
              pages: 1,
            },
          }
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
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          pages: 1,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpiryStockData();
  }, []);

  // Add useEffect to handle search with debouncing
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      setCurrentPage(1);
      fetchExpiryStockData(1, filter, searchTerm);
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
    fetchExpiryStockData(1, newFilter, searchTerm);
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
        if (inputRef.current) {
          inputRef.current.classList.remove("highlight");
        }
      }, 1000);
    }
  };

  // Check if export should be enabled
  const isExportEnabled = () => {
    return data.items.length > 0;
  };

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
        {
          params: {
            filter: filter,
            search: searchTerm,
          },
        }
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

      // Prepare data for Excel
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
        "Unit Price (CIF)": `$${item.unitPrice?.toFixed(2)}`,
        "Total Value": `$${item.totalValue?.toFixed(2)}`,
        "LC Price": `$${item.lc?.toFixed(2)}`,
        "FOB Price": `$${item.fob?.toFixed(2)}`,
        Amount: `$${item.amount?.toFixed(2)}`,
        "Batch Date": item.date ? formatDateToReadable(item.date) : "N/A",
        "Product Status": item.status || "N/A",
      }));

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();

      // Prepare summary data based on active tab
      const summaryData = prepareSummaryData(exportData);

      // Create data array with headers at the top
      const allData = [
        // First row: Report title (centered)
        [`Expiry Stock Report - ${exportData.filterLabel}`, '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        // Second row: Report date (centered)
        [`Report Generated: ${exportData.generatedDate}`, '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        // Third row: Search term if exists
        searchTerm ? [`Search Term: "${searchTerm}"`, '', '', '', '', '', '', '', '', '', '', '', '', '', ''] : [],
        // Empty row for spacing
        [],
        // Summary section
        ['SUMMARY', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ...summaryData.map(row => row.map(cell => cell === null ? '' : cell)),
        // Empty row for spacing
        [],
        // Headers row
        [
          "Product Name",
          "Supplier",
          "Type",
          "Batch Number",
          "Expiry Date",
          "Status",
          "Days Remaining",
          "Quantity (Boxes)",
          "Unit Price (CIF)",
          "Total Value",
          "LC Price",
          "FOB Price",
          "Amount",
          "Batch Date",
          "Product Status",
        ],
        // Data rows
        ...excelData.map((item) => [
          item["Product Name"],
          item["Supplier"],
          item["Type"],
          item["Batch Number"],
          item["Expiry Date"],
          item["Status"],
          item["Days Remaining"],
          item["Quantity (Boxes)"],
          item["Unit Price (CIF)"],
          item["Total Value"],
          item["LC Price"],
          item["FOB Price"],
          item["Amount"],
          item["Batch Date"],
          item["Product Status"],
        ]),
      ];

      // Create worksheet from array data
      const ws = XLSX.utils.aoa_to_sheet(allData);

      // Merge cells for report header and center them
      ws["!merges"] = [
        // Report title - merge all 15 columns and center
        { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
        // Report date - merge all 15 columns and center
        { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
        // Search term - merge all 15 columns and center if exists
        ...(searchTerm ? [{ s: { r: 2, c: 0 }, e: { r: 2, c: 14 } }] : []),
        // Summary title - merge all 15 columns and center
        { s: { r: searchTerm ? 4 : 3, c: 0 }, e: { r: searchTerm ? 4 : 3, c: 14 } },
      ];

      // Set column widths
      const colWidths = [
        { wch: 30 }, // Product Name
        { wch: 25 }, // Supplier
        { wch: 15 }, // Type
        { wch: 20 }, // Batch Number
        { wch: 15 }, // Expiry Date
        { wch: 20 }, // Status
        { wch: 20 }, // Days Remaining
        { wch: 15 }, // Quantity (Boxes)
        { wch: 15 }, // Unit Price (CIF)
        { wch: 15 }, // Total Value
        { wch: 15 }, // LC Price
        { wch: 15 }, // FOB Price
        { wch: 15 }, // Amount
        { wch: 15 }, // Batch Date
        { wch: 15 }, // Product Status
      ];
      ws["!cols"] = colWidths;

      // Style the header rows
      // Report title (row 1) - Centered
      const titleCell = ws["A1"];
      if (titleCell) {
        titleCell.s = {
          font: { bold: true, sz: 16 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }

      // Report date (row 2) - Centered
      const dateCell = ws["A2"];
      if (dateCell) {
        dateCell.s = {
          font: { bold: true, sz: 12 },
          alignment: { horizontal: "center", vertical: "center" },
        };
      }

      // Search term (row 3) - Centered with light blue background if exists
      if (searchTerm) {
        const searchCell = ws["A3"];
        if (searchCell) {
          searchCell.s = {
            font: { bold: true, sz: 11, italic: true },
            fill: { fgColor: { rgb: "E6F3FF" } }, // Light blue background
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }

      // Summary title - Centered with yellow background
      const summaryTitleRow = searchTerm ? 4 : 3;
      const summaryTitleCell = ws[`A${summaryTitleRow + 1}`];
      if (summaryTitleCell) {
        summaryTitleCell.s = {
          font: { bold: true, sz: 14 },
          fill: { fgColor: { rgb: "FFFF00" } }, // Yellow background
          alignment: { horizontal: "center", vertical: "center" },
        };
      }

      // Summary data rows - Left aligned with light lavender background
      const summaryDataStartRow = summaryTitleRow + 1;
      for (let row = summaryDataStartRow; row < summaryDataStartRow + summaryData.length; row++) {
        for (let col = 0; col < 15; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[cellAddress]) {
            ws[cellAddress].s = {
              font: { bold: true, sz: 11 },
              fill: { fgColor: { rgb: "E6E6FA" } }, // Light lavender background
              alignment: { horizontal: "left", vertical: "center" },
            };
          }
        }
      }

      // Column headers row - Centered with gray background
      const headerRow = summaryDataStartRow + summaryData.length + 1; // Calculate header row position
      for (let col = 0; col < 15; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: headerRow, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "C0C0C0" } }, // Gray background
            alignment: { horizontal: "center", vertical: "center" },
          };
        }
      }

      // Data rows - Center align for all cells
      const dataStartRow = headerRow + 1;
      for (let row = dataStartRow; row < dataStartRow + excelData.length; row++) {
        for (let col = 0; col < 15; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
          if (ws[cellAddress]) {
            // Keep existing style but add center alignment
            if (!ws[cellAddress].s) {
              ws[cellAddress].s = {};
            }
            ws[cellAddress].s.alignment = { 
              horizontal: "center", 
              vertical: "center",
              wrapText: true 
            };
          }
        }
      }

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, "Expiry Stock Report");

      // Generate Excel file
      const fileName = `expiry-stock-report-${
        new Date().toISOString().split("T")[0]
      }-${filter}${searchTerm ? `-search-${searchTerm.substring(0, 10)}` : ""}.xlsx`;
      XLSX.writeFile(wb, fileName);

      showToast("success", "Excel file downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      showToast("error", "Failed to export Excel file");
    } finally {
      setExportLoading(false);
    }
  };

  // Helper function to prepare summary data based on active tab
  const prepareSummaryData = (exportData) => {
    const summaryRows = [];
    
    switch (filter) {
      case "all":
        summaryRows.push(
          ["Total Items:", exportData.summary.totalItems, "", 
           "Total Boxes:", exportData.summary.totalBoxes?.toFixed(1) || "0", "",
           "Total Value:", `$${exportData.summary.totalValue?.toFixed(2) || "0.00"}`]
        );
        summaryRows.push([]); // Empty row
        summaryRows.push(
          ["Expiring Soon (≤15 days):", exportData.summary.totalExpiringSoon, "",
           "Near Expiry Value:", `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`, "",
           "Critical Items (≤3 days):", exportData.summary.criticalItems]
        );
        summaryRows.push([]); // Empty row
        summaryRows.push(
          ["Expired Items:", exportData.summary.expiredItems, "",
           "Expired Value:", `$${exportData.summary.expiredValue?.toFixed(2) || "0.00"}`]
        );
        break;
        
      case "expired":
        summaryRows.push(
          ["Expired Items:", exportData.summary.expiredItems, "",
           "Expired Value:", `$${exportData.summary.expiredValue?.toFixed(2) || "0.00"}`]
        );
        break;
        
      case "near-expiry":
        summaryRows.push(
          ["Expiring Soon (≤15 days):", exportData.summary.totalExpiringSoon, "",
           "Near Expiry Value:", `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`]
        );
        summaryRows.push([]); // Empty row
        summaryRows.push(
          ["Critical Items (≤3 days):", exportData.summary.criticalItems]
        );
        break;
        
      case "critical":
        summaryRows.push(
          ["Critical Items (≤3 days):", exportData.summary.criticalItems, "",
           "Near Expiry Value:", `$${exportData.summary.totalNearExpiryValue?.toFixed(2) || "0.00"}`]
        );
        break;
        
      default:
        summaryRows.push(
          ["Total Items:", exportData.summary.totalItems, "",
           "Total Boxes:", exportData.summary.totalBoxes?.toFixed(1) || "0", "",
           "Total Value:", `$${exportData.summary.totalValue?.toFixed(2) || "0.00"}`]
        );
    }
    
    return summaryRows;
  };

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
    if (item.isExpired)
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (item.daysRemaining <= 3)
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (item.daysRemaining <= 7)
      return <AlertTriangle className="w-4 h-4 text-orange-500" />;
    return <Calendar className="w-4 h-4 text-yellow-500" />;
  };

  const renderPagination = () => {
    const { pagination } = data;
    const totalPages = pagination.pages;
    const currentPage = pagination.page;

    if (totalPages <= 1) return null;

    // Calculate visible pages
    const visiblePages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        visiblePages.push(i);
      }
    } else {
      // Always show first page
      visiblePages.push(1);

      // Calculate start and end of middle pages
      let startPage = Math.max(2, currentPage - 1);
      let endPage = Math.min(totalPages - 1, currentPage + 1);

      // Adjust if we're at the beginning
      if (currentPage <= 3) {
        endPage = Math.min(4, totalPages - 1);
      }

      // Adjust if we're at the end
      if (currentPage >= totalPages - 2) {
        startPage = Math.max(totalPages - 3, 2);
      }

      // Add ellipsis after first page if needed
      if (startPage > 2) {
        visiblePages.push("...");
      }

      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        visiblePages.push(i);
      }

      // Add ellipsis before last page if needed
      if (endPage < totalPages - 1) {
        visiblePages.push("...");
      }

      // Always show last page
      visiblePages.push(totalPages);
    }

    return (
      <div className="mt-4 p-5 flex gap-2">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          ← Prev
        </button>

        {visiblePages.map((page, index) => (
          <button
            key={index}
            onClick={() => typeof page === "number" && handlePageChange(page)}
            disabled={page === "..."}
            className={`px-4 py-2 rounded ${
              page === "..."
                ? "bg-gray-200 cursor-not-allowed"
                : currentPage === page
                ? "bg-blue-600 text-white cursor-pointer"
                : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
            }`}
          >
            {page}
          </button>
        ))}

        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next →
        </button>
      </div>
    );
  };

  const renderSummaryCards = () => {
    // Calculate values based on selected filter
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
    let showExpiringSoon = true;
    let showNearExpiry = true;
    let showCritical = true;
    let showExpired = true;
    let showExpiredValue = true;

    switch (filter) {
      case "all":
        // For "All" filter: show all items within 15 days or expired
        expiringSoonValue = data.summary.filteredExpiringSoon;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = data.summary.filteredExpiredItems;
        expiredItemsValue = data.summary.filteredExpiredValue || 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value";
        showExpiredValue = true;
        break;

      case "expired":
        // For "Expired" filter: only show expired items and expired value
        expiringSoonValue = 0;
        nearExpiryValue = 0;
        criticalValue = 0;
        expiredValue = data.summary.filteredExpiredItems;
        expiredItemsValue = data.summary.filteredExpiredValue || 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value";
        showExpiringSoon = false;
        showNearExpiry = false;
        showCritical = false;
        showExpiredValue = true;
        break;

      case "near-expiry":
        // For "Near Expiry" filter: show all items within 15 days (critical + non-critical)
        expiringSoonValue = data.summary.filteredExpiringSoon;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = 0;
        expiredItemsValue = 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value";
        criticalLabel = "Critical Items (≤3 days)";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value";
        showExpired = false;
        showExpiredValue = false;
        break;

      case "critical":
        // For "Critical" filter: only show items within 3 days
        expiringSoonValue = 0;
        nearExpiryValue = data.summary.filteredNearExpiryValue;
        criticalValue = data.summary.filteredCriticalItems;
        expiredValue = 0;
        expiredItemsValue = 0;
        expiringSoonLabel = "Expiring Soon (≤15 days)";
        nearExpiryLabel = "Near Expiry Value";
        criticalLabel = "Critical Items (≤3 days)";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value";
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
        nearExpiryLabel = "Near Expiry Value";
        criticalLabel = "Critical Items";
        expiredLabel = "Expired Items";
        expiredItemsLabel = "Expired Value";
        showExpiredValue = true;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        {/* Expiring Soon Card */}
        {showExpiringSoon && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-yellow-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{expiringSoonLabel}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                  ) : (
                    expiringSoonValue?.toLocaleString() || 0
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {filter === "all" &&
                    `Total: ${
                      data.summary.totalExpiringSoon?.toLocaleString() || 0
                    } boxes`}
                  {filter !== "all" && "Filtered items only"}
                </div>
              </div>
              <Calendar className="w-8 h-8 text-yellow-500" />
            </div>
          </div>
        )}

        {/* Near Expiry Value Card */}
        {showNearExpiry && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{nearExpiryLabel}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                  ) : (
                    `$${
                      nearExpiryValue?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) || "0.00"
                    }`
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {filter === "all" &&
                    `Total: $${
                      data.summary.totalNearExpiryValue?.toLocaleString(
                        undefined,
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }
                      ) || "0.00"
                    }`}
                  {filter !== "all" && "Filtered value only"}
                </div>
              </div>
              <DollarSign className="w-8 h-8 text-orange-500" />
            </div>
          </div>
        )}

        {/* Critical Items Card */}
        {showCritical && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{criticalLabel}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                  ) : (
                    criticalValue?.toLocaleString() || 0
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {filter === "all" &&
                    `Total: ${
                      data.summary.criticalItems?.toLocaleString() || 0
                    } boxes`}
                  {filter !== "all" && "Filtered items only"}
                </div>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        )}

        {/* Expired Items Card */}
        {showExpired && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-gray-500">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{expiredLabel}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                  ) : (
                    expiredValue?.toLocaleString() || 0
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {filter === "all" &&
                    `Total: ${
                      data.summary.expiredItems?.toLocaleString() || 0
                    } boxes`}
                  {filter !== "all" && "Filtered items only"}
                </div>
              </div>
              <AlertTriangle className="w-8 h-8 text-gray-500" />
            </div>
          </div>
        )}

        {/* Expired Value Card - Show for "all" and "expired" filters */}
        {showExpiredValue && (
          <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-800">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm text-gray-600">{expiredItemsLabel}</div>
                <div className="text-2xl font-bold text-gray-800">
                  {loading ? (
                    <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                  ) : (
                    `$${
                      expiredItemsValue?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) || "0.00"
                    }`
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {filter === "all" &&
                    `Total: $${
                      data.summary.expiredValue?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }) || "0.00"
                    }`}
                  {filter !== "all" && "Filtered value only"}
                </div>
              </div>
              <DollarSign className="w-8 h-8 text-red-800" />
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderFilterButtons = () => (
    <div className="flex flex-wrap gap-2 mb-4">
      <button
        onClick={() => handleFilterChange("all")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === "all"
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        All Items ({data.summary.totalItems || 0})
      </button>
      <button
        onClick={() => handleFilterChange("expired")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === "expired"
            ? "bg-red-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Expired ({data.summary.expiredItems || 0})
      </button>
      <button
        onClick={() => handleFilterChange("near-expiry")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === "near-expiry"
            ? "bg-yellow-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Near Expiry (≤15 days) ({data.summary.totalExpiringSoon || 0})
      </button>
      <button
        onClick={() => handleFilterChange("critical")}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          filter === "critical"
            ? "bg-orange-600 text-white"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Critical (≤3 days) ({data.summary.criticalItems || 0})
      </button>
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Expiry Stock Report
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Input */}
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

          {/* <button
            onClick={() => fetchExpiryStockData(currentPage, filter, searchTerm)}
            disabled={loading}
            className={`flex items-center gap-2 ${
              loading ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
            } text-white px-4 py-2 rounded-lg shadow-md transition-colors cursor-pointer`}
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {loading ? "Loading..." : "Refresh"}
          </button> */}
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

      {renderSummaryCards()}

      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            Stock Items Expiring Soon or Expired
            <span className="ml-2 text-sm font-normal text-gray-600">
              ({data.items.length} items on this page)
              {searchTerm && (
                <span className="ml-2 text-blue-600">
                  • Search: "{searchTerm}"
                </span>
              )}
            </span>
          </h2>
        </div>

        {renderFilterButtons()}

        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-center">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expiry Date
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Value
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
                          className="px-6 py-4 whitespace-nowrap"
                        >
                          <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                        </td>
                      ))}
                    </tr>
                  ))
                ) : data.items.length > 0 ? (
                  data.items.map((item, index) => (
                    <tr
                      key={index}
                      className={`hover:bg-gray-50 ${
                        item.isExpired ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="text-sm font-medium text-gray-900">
                            {item.productName}-({item.type})
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.supplierName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDateToReadable(item.expiryDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center justify-center">
                          {getStatusIcon(item)}
                          <span
                            className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getDaysRemainingColor(
                              item
                            )}`}
                          >
                            {getStatusText(item)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-medium">
                          {item.quantity?.toLocaleString()}
                        </span>{" "}
                        boxes
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${item.unitPrice?.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
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
                      <Package className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <div>
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