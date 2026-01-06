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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import LoadingOverlay from "../../components/Loading";

const saleSummaryPerPage = 7;

// Helper function to format numbers to 2 decimal places
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

  const inputRef = useRef(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Fetch sales records based on date range
  useEffect(() => {
    const fetchSalesRecords = async () => {
      // For combine tab, require date range
      if (selectedTab === "combine" && (!customDateRange.startDate || !customDateRange.endDate)) {
        return;
      }

      setIsLoading(true);
      try {
        let url = `${backendUrl}/api/sales-summary/summary`;
        
        // For combine tab, add date params
        if (selectedTab === "combine" && customDateRange.startDate && customDateRange.endDate) {
          const params = new URLSearchParams({
            startDate: customDateRange.startDate.toISOString().split('T')[0],
            endDate: customDateRange.endDate.toISOString().split('T')[0]
          });
          url += `?${params.toString()}`;
        }
        // For daily tab, fetch all data without date filter initially
        else if (selectedTab === "daily") {
          // Fetch all data for daily view
          url += `?${new URLSearchParams({
            startDate: "2000-01-01", // Very old date to get all data
            endDate: new Date().toISOString().split('T')[0] // Today's date
          }).toString()}`;
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
  }, [customDateRange.startDate, customDateRange.endDate, selectedTab]);

  // Calculate aggregated data for daily view
  const calculateDailySummary = () => {
    const dailyMap = {};
    
    summaryData.forEach(record => {
      const date = new Date(record.recordingDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          products: new Map(),
          totalSales: 0,
          totalQuantity: 0,
          totalAmount: 0,
          totalProfit: 0
        };
      }
      
      record.products.forEach(product => {
        const productName = product.productName || 'Unknown Product';
        const normalizedName = productName.toLowerCase().trim();
        
        if (!dailyMap[date].products.has(normalizedName)) {
          dailyMap[date].products.set(normalizedName, {
            productName: productName, // Keep original name
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0
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
    
    // Convert Map to array of objects and flatten for pagination
    const allRows = [];
    Object.values(dailyMap).forEach(day => {
      Array.from(day.products.values()).forEach(product => {
        allRows.push({
          ...product,
          date: day.date,
          // Format quantities to 2 decimal places
          salesQuantity: parseFloat(product.salesQuantity.toFixed(2)),
          bonusQuantity: parseFloat(product.bonusQuantity.toFixed(2)),
          totalQuantity: parseFloat(product.totalQuantity.toFixed(2)),
          amount: parseFloat(product.amount.toFixed(2)),
          profit: parseFloat(product.profit.toFixed(2))
        });
      });
    });
    
    return allRows;
  };

  // Calculate aggregated data for combine view
  const calculateCombineSummary = () => {
    const productMap = new Map();
    
    summaryData.forEach(record => {
      record.products.forEach(product => {
        const productName = product.productName || 'Unknown Product';
        const normalizedName = productName.toLowerCase().trim();
        
        if (!productMap.has(normalizedName)) {
          productMap.set(normalizedName, {
            productName: productName, // Keep original name (first occurrence)
            normalizedName,
            salesQuantity: 0,
            bonusQuantity: 0,
            totalQuantity: 0,
            amount: 0,
            profit: 0
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
    
    // Convert Map to array, sort by product name, and format quantities
    return Array.from(productMap.values())
      .map(product => ({
        ...product,
        // Format quantities to 2 decimal places
        salesQuantity: parseFloat(product.salesQuantity.toFixed(2)),
        bonusQuantity: parseFloat(product.bonusQuantity.toFixed(2)),
        totalQuantity: parseFloat(product.totalQuantity.toFixed(2)),
        amount: parseFloat(product.amount.toFixed(2)),
        profit: parseFloat(product.profit.toFixed(2))
      }))
      .sort((a, b) => a.productName.localeCompare(b.productName));
  };

  // Get data based on selected tab
  const getFilteredData = useMemo(() => {
    let data = [];
    
    if (selectedTab === "daily") {
      data = calculateDailySummary();
    } else if (selectedTab === "combine") {
      data = calculateCombineSummary();
    }
    
    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      data = data.filter(item => {
        if (selectedTab === "daily") {
          return (
            item.date?.toLowerCase().includes(search) ||
            item.productName?.toLowerCase().includes(search)
          );
        } else {
          return item.productName?.toLowerCase().includes(search);
        }
      });
    }
    
    return data;
  }, [summaryData, selectedTab, searchTerm]);

  // Pagination logic
  const totalPages = Math.ceil(getFilteredData.length / saleSummaryPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  
  // Get current page data
  const currentData = getFilteredData.slice(
    (currentPage - 1) * saleSummaryPerPage,
    currentPage * saleSummaryPerPage
  );

  // Calculate totals for summary cards
  const calculateTotals = () => {
    let totalSales = 0;
    let totalQuantity = 0;
    let totalProfit = 0;
    let totalProducts = 0;
    
    if (selectedTab === "daily") {
      const dailyData = calculateDailySummary();
      dailyData.forEach(product => {
        totalSales += product.amount || 0;
        totalQuantity += product.totalQuantity || 0;
        totalProfit += product.profit || 0;
      });
      // Count unique product-date combinations
      const uniqueCombos = new Set(dailyData.map(item => `${item.productName}-${item.date}`));
      totalProducts = uniqueCombos.size;
    } else if (selectedTab === "combine") {
      const combineData = calculateCombineSummary();
      combineData.forEach(product => {
        totalSales += product.amount || 0;
        totalQuantity += product.totalQuantity || 0;
        totalProfit += product.profit || 0;
      });
      totalProducts = combineData.length;
    }
    
    return { 
      totalSales: parseFloat(totalSales.toFixed(2)), 
      totalQuantity: parseFloat(totalQuantity.toFixed(2)), 
      totalProfit: parseFloat(totalProfit.toFixed(2)), 
      totalProducts 
    };
  };

  const totals = calculateTotals();

  // Handle export to Excel
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
            startDate: selectedTab === "combine" && customDateRange.startDate
              ? customDateRange.startDate.toISOString().split('T')[0]
              : "2000-01-01", // Default start date for daily
            endDate: selectedTab === "combine" && customDateRange.endDate
              ? customDateRange.endDate.toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0], // Today for daily
          },
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `sales-summary-${selectedTab}-${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response && error.response.status === 404) {
        showToast("warning", "No data found for the selected filters");
      } else {
        showToast("error", "Failed to export Excel report");
      }
    } finally {
      setExportLoading(false);
    }
  };

  // Handle custom date filter
  const handleCustomDateChange = (name, date) => {
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  };

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
    setCustomDateRange({
      startDate: null,
      endDate: null,
    });
    setSearchTerm("");
    setCurrentPage(1);
    if (selectedTab === "combine") {
      setShowDateFilter(true);
    }
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
    if (tab === "combine") {
      // Open date filter modal when switching to combine tab
      setShowDateFilter(true);
    } else {
      // For daily tab, no date filter needed
      setCustomDateRange({ startDate: null, endDate: null });
      setShowDateFilter(false);
    }
  };

  const handleCloseDateFilterModal = () => {
    setShowDateFilter(false);
    // If user closes modal while on combine tab without selecting dates, switch to daily
    if (selectedTab === "combine" && (!customDateRange.startDate || !customDateRange.endDate)) {
      setSelectedTab("daily");
    }
  };

  const getSerialNumber = (index) => {
    return (currentPage - 1) * saleSummaryPerPage + index + 1;
  };

  const getActiveFilterDisplay = () => {
    if (selectedTab === "combine" && customDateRange.startDate && customDateRange.endDate) {
      const start = formatDateToReadable(customDateRange.startDate);
      const end = formatDateToReadable(customDateRange.endDate);
      return `${start} - ${end}`;
    } else if (selectedTab === "daily") {
      return "All Dates";
    }
    return "Select Date Range";
  };

  // Render summary cards
  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Sales</p>
            <p className="text-2xl font-bold text-gray-800">
              ${totals.totalSales.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <DollarSign className="w-8 h-8 text-blue-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Quantity</p>
            <p className="text-2xl font-bold text-gray-800">
              {totals.totalQuantity.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <Package className="w-8 h-8 text-green-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Profit</p>
            <p className="text-2xl font-bold text-gray-800">
              ${totals.totalProfit.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {getActiveFilterDisplay()}
            </p>
          </div>
          <TrendingUp className="w-8 h-8 text-purple-500" />
        </div>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500 border border-gray-200">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Total Products</p>
            <p className="text-2xl font-bold text-gray-800">
              {totals.totalProducts.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {selectedTab === "combine" 
                ? "Unique Products (Case-insensitive)" 
                : "Product-Day Combinations"}
            </p>
          </div>
          <BarChart3 className="w-8 h-8 text-orange-500" />
        </div>
      </div>
    </div>
  );

  // Render table headers based on selected tab
  const renderTableHeaders = () => {
    if (selectedTab === "daily") {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Date</th>
            <th className="p-3 text-sm font-medium">Product Name</th>
            <th className="p-3 text-sm font-medium">Sales Qty</th>
            <th className="p-3 text-sm font-medium">Bonus Qty</th>
            <th className="p-3 text-sm font-medium">Total Qty</th>
            <th className="p-3 text-sm font-medium">Amount ($)</th>
            <th className="p-3 text-sm font-medium">Profit ($)</th>
          </tr>
        </thead>
      );
    } else {
      return (
        <thead className="bg-gray-100 text-gray-700 border-b">
          <tr>
            <th className="p-3 text-sm font-medium">Sr.No</th>
            <th className="p-3 text-sm font-medium">Product Name</th>
            <th className="p-3 text-sm font-medium">Sales Qty</th>
            <th className="p-3 text-sm font-medium">Bonus Qty</th>
            <th className="p-3 text-sm font-medium">Total Qty</th>
            <th className="p-3 text-sm font-medium">Amount ($)</th>
            <th className="p-3 text-sm font-medium">Profit ($)</th>
          </tr>
        </thead>
      );
    }
  };

  // Render table rows based on selected tab
  const renderTableRows = () => {
    return currentData.map((item, index) => {
      const isLastRow = index === currentData.length - 1;
      
      if (selectedTab === "daily") {
        return (
          <tr
            key={`${item.date}-${item.productName}-${index}`}
            className="hover:bg-gray-50"
            style={{ borderBottom: isLastRow ? 'none' : '1px solid #e5e7eb' }}
          >
            <td className="p-3">
              <div className="text-sm text-gray-600 font-medium">
                {getSerialNumber(index)}
              </div>
            </td>
            <td className="p-3 text-sm text-gray-600">
              {formatDateToReadable(item.date)}
            </td>
            <td className="p-3 text-sm font-medium text-gray-900 capitalize">
              {item.productName}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.salesQuantity)}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.bonusQuantity)}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.totalQuantity)}
            </td>
            <td className="p-3 text-sm font-semibold text-green-600">
              ${formatNumber(item.amount)}
            </td>
            <td className="p-3 text-sm font-semibold text-blue-600">
              ${formatNumber(item.profit)}
            </td>
          </tr>
        );
      } else {
        return (
          <tr
            key={`${item.productName}-${index}`}
            className="hover:bg-gray-50"
            style={{ borderBottom: isLastRow ? 'none' : '1px solid #e5e7eb' }}
          >
            <td className="p-3">
              <div className="text-sm text-gray-600 font-medium">
                {getSerialNumber(index)}
              </div>
            </td>
            <td className="p-3 text-sm font-medium text-gray-900 capitalize">
              {item.productName}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.salesQuantity)}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.bonusQuantity)}
            </td>
            <td className="p-3 text-sm text-gray-800">
              {formatNumber(item.totalQuantity)}
            </td>
            <td className="p-3 text-sm font-semibold text-green-600">
              ${formatNumber(item.amount)}
            </td>
            <td className="p-3 text-sm font-semibold text-blue-600">
              ${formatNumber(item.profit)}
            </td>
          </tr>
        );
      }
    });
  };

  // Render pagination
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="mt-4 p-5 flex gap-2">
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          ← Prev
        </button>

        {visiblePages.map((p, index) => (
          <button
            key={index}
            onClick={() => typeof p === "number" && setCurrentPage(p)}
            disabled={p === "..."}
            className={`px-4 py-2 rounded ${
              p === "..."
                ? "bg-gray-200 cursor-not-allowed"
                : currentPage === p
                ? "bg-indigo-600 text-white cursor-pointer"
                : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
            }`}
          >
            {p}
          </button>
        ))}

        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          Next →
        </button>
      </div>
    );
  };

  // Handle icon click for search input
  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  if (isLoading && currentData.length === 0) {
    return <LoadingOverlay text="Loading sales summary..." />;
  }

  return (
    <div className="p-6">
      <div className="container">
        {/* Header */}
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
                onClick={handleIconClick}
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

            <button
              onClick={handleExportToExcel}
              disabled={exportLoading || getFilteredData.length === 0}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md transition-colors min-w-[140px]"
            >
              {exportLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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

        {/* Tabs and Filter Info */}
        <div className="bg-white p-4 rounded-xl shadow-md mb-6 border border-gray-200">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => handleTabChange("daily")}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedTab === "daily"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Daily Summary
            </button>
            <button
              onClick={() => handleTabChange("combine")}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                selectedTab === "combine"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Combine Summary
            </button>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Filter size={16} />
            <span>Active Filter: </span>
            <span className="font-medium">{getActiveFilterDisplay()}</span>
            <span className="mx-2">•</span>
            <span>View: </span>
            <span className="font-medium capitalize">{selectedTab}</span>
          </div>
        </div>

        {renderSummaryCards()}

        {/* Data Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            {renderTableHeaders()}
            <tbody>
              {currentData.length === 0 ? (
                <tr>
                  <td 
                    colSpan={selectedTab === "daily" ? 8 : 7} 
                    className="p-8 text-center"
                  >
                    <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No data found
                    </h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      {searchTerm
                        ? `No sales data found for "${searchTerm}". Try a different search term.`
                        : selectedTab === "combine" && (!customDateRange.startDate || !customDateRange.endDate)
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

          {/* Pagination */}
          {currentData.length > 0 && totalPages > 1 && renderPagination()}
        </div>

        {/* Date Filter Modal - Only for Combine Summary */}
        {showDateFilter && selectedTab === "combine" &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">
                    Select Date Range for Combine Summary
                  </h2>
                  <button
                    onClick={handleCloseDateFilterModal}
                    className="text-gray-500 hover:text-gray-700 cursor-pointer"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Start Date <span className="text-red-500">*</span>
                    </label>
                    <DatePicker
                      selected={customDateRange.startDate}
                      onChange={(date) => handleCustomDateChange("startDate", date)}
                      selectsStart
                      startDate={customDateRange.startDate}
                      endDate={customDateRange.endDate}
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                      className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Clear All
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={handleCloseDateFilterModal}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleApplyCustomFilter}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default SaleSummary;