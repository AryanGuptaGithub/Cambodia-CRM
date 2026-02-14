import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Eye,
  Search,
  Filter,
  Download,
  RefreshCw,
  X,
  Calendar,
} from "lucide-react";
import { showToast } from "../../utils/toast";   // <-- Replaced react-hot-toast with custom toast
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CarryStockView = () => {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMr, setSelectedMr] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [allStockData, setAllStockData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const inputRef = useRef(null);

  const STOCK_PER_PAGE = 5;

  // Fetch MR List for dropdown
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs`);

      if (response.data.success) {
        setMrList(response.data.data || []);
      } else {
        showToast("error", "Failed to load MR list");
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load MR list");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  // Fetch API data
  const fetchStockData = useCallback(async () => {
    try {
      setLoading(true);

      // Build query parameters
      const params = {};

      // Add MR filter - use mrName parameter for backend
      if (selectedMr !== "all") {
        // If selectedMr is an object from dropdown, extract the value
        const mrValue = typeof selectedMr === 'object' ? selectedMr.value : selectedMr;
        params.mrName = mrValue;
      }

      // Add search term if needed
      if (searchTerm.trim()) {
        params.search = searchTerm;
      }

      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-hand-admin`,
        { params }
      );

      if (response.data.success) {
        const transformedData = response.data.data.map((item, index) => ({
          id: item.id || `${item.mrName}-${item.productId}-${index}`,
          mrCode: item.mrName || "N/A",
          mrName: item.mrName || "N/A",
          productId: item.productId || `PROD-${index}`,
          productCode: item.productCode || `PROD-${index}`,
          productName: item.productName || "Unknown Product",
          batch: item.batch || "N/A",
          expiry: item.expiry || "N/A",
          assignedQty: item.assignedQty || 0,
          remainingQty: item.remainingQty || item.boxQuantity || 0,
          usedQty: item.usedQty || 0,
          assignedDate: item.assignedDate || new Date().toISOString().split("T")[0],
          createdAt: item.createdAt || item.assignedDate,
          status: (item.remainingQty || 0) > 0 ? "Active" : "Depleted",
          invoiceNumbers: item.invoiceNumbers || [],
          lc: item.lc || 0,
          unit: item.unit || "pcs",
          category: item.category || "General",
          packSize: item.packSize || 0,
          costPrice: item.costPrice || 0,
          boxQuantity: item.boxQuantity || item.remainingQty || 0,
        }));

        // Store all data
        setAllStockData(transformedData);

        // Apply initial filtering
        const filtered = applyAllFilters(
          transformedData,
          searchTerm,
          dateFilter,
          customStartDate,
          customEndDate
        );
        setFilteredData(filtered);
        setTotalCount(filtered.length);

        // Reset to first page
        setCurrentPage(1);

        // Get data for current page
        const startIndex = 0;
        const endIndex = STOCK_PER_PAGE;
        const paginatedData = filtered.slice(startIndex, endIndex);
        setStockData(paginatedData);
      } else {
        showToast("error", response.data.message || "Failed to load carry stock data");
        setAllStockData([]);
        setFilteredData([]);
        setStockData([]);
        setTotalCount(0);
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      showToast("error", "Failed to load carry stock data");
      setAllStockData([]);
      setFilteredData([]);
      setStockData([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [
    selectedMr,
    searchTerm,
    dateFilter,
    customStartDate,
    customEndDate,
  ]);

  // Apply all filters
  const applyAllFilters = (
    data,
    searchTerm,
    dateFilter,
    customStartDate,
    customEndDate
  ) => {
    let filtered = [...data];

    // Apply MR filter if needed (client-side for better UX)
    if (selectedMr !== "all") {
      // Extract MR value from selectedMr (could be string or object)
      const selectedMrValue = typeof selectedMr === 'object' 
        ? (selectedMr.value || selectedMr.label || selectedMr.mrName)
        : selectedMr;
      
      filtered = filtered.filter(
        (item) =>
          item.mrName === selectedMrValue || 
          item.mrCode === selectedMrValue
      );
    }

    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(
        (item) =>
          item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.productCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.mrName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.mrCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.batch?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply date filter
    filtered = applyDateFilter(
      filtered,
      dateFilter,
      customStartDate,
      customEndDate
    );

    return filtered;
  };

  // Apply date filter to data
  const applyDateFilter = (data, filterType, startDate, endDate) => {
    if (filterType === "all" || !data || data.length === 0) return data;

    const now = new Date();
    let dateFrom, dateTo;

    switch (filterType) {
      case "today":
        dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dateTo = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      case "currentMonth":
        dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
        dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "yearToDate":
        dateFrom = new Date(now.getFullYear(), 0, 1);
        dateTo = new Date(now.getFullYear(), 11, 31);
        break;
      case "custom":
        if (startDate && endDate) {
          dateFrom = startDate;
          dateTo = new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate() + 1
          );
        } else {
          return data;
        }
        break;
      default:
        return data;
    }

    return data.filter((item) => {
      if (!item.assignedDate) return false;

      const itemDate = new Date(item.assignedDate);
      return itemDate >= dateFrom && itemDate <= dateTo;
    });
  };

  // Initial fetch
  useEffect(() => {
    fetchMRList();
  }, []);

  // Fetch stock data when MR list is loaded and MR is selected
  useEffect(() => {
    if (mrList.length > 0 || selectedMr === "all") {
      fetchStockData();
    }
  }, [selectedMr, fetchStockData]);

  // Handle filters change (search and date)
  useEffect(() => {
    if (allStockData.length > 0) {
      const filtered = applyAllFilters(
        allStockData,
        searchTerm,
        dateFilter,
        customStartDate,
        customEndDate
      );
      setFilteredData(filtered);
      setTotalCount(filtered.length);
      setCurrentPage(1);
      
      // Update paginated data
      const startIndex = 0;
      const endIndex = STOCK_PER_PAGE;
      const paginatedData = filtered.slice(startIndex, endIndex);
      setStockData(paginatedData);
    }
  }, [searchTerm, dateFilter, customStartDate, customEndDate, allStockData]);

  // Handle page change
  useEffect(() => {
    if (filteredData.length > 0) {
      const startIndex = (currentPage - 1) * STOCK_PER_PAGE;
      const endIndex = startIndex + STOCK_PER_PAGE;
      const paginatedData = filteredData.slice(startIndex, endIndex);
      setStockData(paginatedData);
    } else {
      setStockData([]);
    }
  }, [currentPage, filteredData]);

  // Calculate utilization percentage
  const calculateUtilization = (assigned, remaining) => {
    if (!assigned || assigned === 0) return 0;
    const used = Math.max(0, assigned - remaining);
    return Math.round((used / assigned) * 100);
  };

  // Get MR options for dropdown
  const mrOptions = useMemo(() => {
    const options = [{ value: "all", label: "All MRs" }];

    // Add MRs from API
    mrList.forEach((mr) => {
      options.push({
        value: mr.mrName, // Use mrName as value for consistency
        label: `${mr.mrName}`,
      });
    });

    return options;
  }, [mrList]);

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / STOCK_PER_PAGE) || 1;

  const getVisiblePages = (currentPage, totalPages) => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - delta && i <= currentPage + delta)
      ) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push("...");
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };

  const visiblePages = getVisiblePages(currentPage, totalPages);

  // Handle view details
  const handleViewDetails = (stock) => {
    setSelectedStock(stock);
    setIsViewModalOpen(true);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "N/A";
      const options = { year: "numeric", month: "short", day: "numeric" };
      return date.toLocaleDateString(undefined, options);
    } catch {
      return "N/A";
    }
  };

  // Format date time
  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "N/A";
      const options = {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      };
      return date.toLocaleDateString(undefined, options);
    } catch {
      return "N/A";
    }
  };

  // Handle date filter change
  const handleDateFilterChange = (filterType) => {
    setDateFilter(filterType);
  };

  // Clear custom date range
  const clearCustomDateRange = () => {
    setCustomStartDate(null);
    setCustomEndDate(null);
    setDateFilter("all");
  };

  // Handle MR change
  const handleMrChange = (selectedOption) => {
    if (!selectedOption) {
      setSelectedMr("all");
      return;
    }
    if (typeof selectedOption === 'string') {
      setSelectedMr(selectedOption);
    } else if (typeof selectedOption === 'object') {
      setSelectedMr(selectedOption.value || selectedOption.label || "all");
    } else {
      setSelectedMr("all");
    }
  };

  // Get current MR display name
  const getCurrentMrDisplayName = () => {
    if (selectedMr === "all") return "All MRs";
    
    // Try to find the MR in options
    const mrOption = mrOptions.find(opt => 
      opt.value === selectedMr || 
      opt.label === selectedMr
    );
    
    return mrOption ? mrOption.label : selectedMr;
  };

  // Handle export
  const handleExport = async () => {
    try {
      const params = { export: true };

      if (selectedMr !== "all") {
        const mrValue = typeof selectedMr === 'object' 
          ? (selectedMr.value || selectedMr.label)
          : selectedMr;
        params.mrName = mrValue;
      }

      if (dateFilter === "custom" && customStartDate && customEndDate) {
        params.dateFrom = customStartDate.toISOString().split("T")[0];
        params.dateTo = customEndDate.toISOString().split("T")[0];
      }

      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-hand-admin`,
        {
          params,
          responseType: "blob",
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `carry-stock-${new Date().toISOString().split("T")[0]}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();

      showToast("success", "Export started successfully!");
    } catch (error) {
      console.error("Error exporting data:", error);
      showToast("error", "Failed to export data");
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    setCurrentPage(1);
    fetchStockData();
  };

  // Table columns configuration
  const tableColumns = useMemo(
    () => [
      "mrDetails",
      "productDetails",
      "quantity",
      "utilization",
      "assignedDate",
      "status",
      "actions",
    ],
    []
  );

  const allFields = useMemo(
    () => [
      {
        id: "mrDetails",
        name: "MR Details",
        dbName: "mrDetails",
      },
      {
        id: "productDetails",
        name: "Product Details",
        dbName: "productDetails",
      },
      {
        id: "quantity",
        name: "Quantity",
        dbName: "quantity",
      },
      {
        id: "utilization",
        name: "Utilization",
        dbName: "utilization",
      },
      {
        id: "assignedDate",
        name: "Assigned Date",
        dbName: "assignedDate",
      },
      {
        id: "status",
        name: "Status",
        dbName: "status",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Get field value for table
  const getFieldValue = (item, dbName) => {
    if (!item) return "--";

    switch (dbName) {
      case "mrDetails":
        return (
          <div>
            <div className="font-semibold text-gray-900">{item.mrName}</div>
            <div className="text-xs text-gray-500">{item.mrCode}</div>
          </div>
        );

      case "productDetails":
        return (
          <div>
            <div className="font-semibold text-gray-900">
              {item.productName}
            </div>
            <div className="text-xs text-gray-500">{item.productCode}</div>
            {item.category && (
              <div className="text-xs text-gray-500">{item.category}</div>
            )}
          </div>
        );

      case "quantity":
        const used = item.usedQty || Math.max(0, (item.assignedQty || 0) - (item.remainingQty || 0));
        return (
          <div className="text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Assigned:</span>
              <span className="font-semibold">{item.assignedQty || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining:</span>
              <span className="font-semibold">{item.remainingQty || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Used:</span>
              <span className="font-semibold">{used}</span>
            </div>
          </div>
        );

      case "utilization":
        const utilization = calculateUtilization(
          item.assignedQty,
          item.remainingQty
        );
        return (
          <div className="flex items-center">
            <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
              <div
                className={`h-2.5 rounded-full ${
                  utilization >= 80
                    ? "bg-green-600"
                    : utilization >= 50
                    ? "bg-yellow-500"
                    : "bg-red-600"
                }`}
                style={{ width: `${Math.min(utilization, 100)}%` }}
              ></div>
            </div>
            <span className="text-sm font-medium">{utilization}%</span>
          </div>
        );

      case "assignedDate":
        return (
          <div>
            <span className="text-sm text-gray-900">
              {formatDate(item.assignedDate)}
            </span>
            {item.createdAt && (
              <div className="text-xs text-gray-500">
                Last: {formatDateTime(item.createdAt)}
              </div>
            )}
          </div>
        );

      case "status":
        return (
          <span
            className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
              item.status === "Active" || (item.remainingQty || 0) > 0
                ? "bg-green-100 text-green-800"
                : item.status === "Depleted" || (item.remainingQty || 0) === 0
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {item.status ||
              ((item.remainingQty || 0) > 0 ? "Active" : "Depleted")}
          </span>
        );

      case "actions":
        return (
          <div className="flex items-center justify-center gap-3 min-w-[150px]">
            <button
              className="text-blue-600 hover:text-blue-800 cursor-pointer p-1 hover:bg-blue-50 rounded"
              onClick={() => handleViewDetails(item)}
              title="View Details"
            >
              <Eye size={18} />
            </button>
          </div>
        );

      default:
        return "--";
    }
  };

  if (loading && currentPage === 1) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading carry stock data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Carry Stock View
            </h1>
            <p className="text-gray-600">View stock assigned to MRs</p>
          </div>

          {/* RIGHT SIDE: TOTAL + BUTTONS + SEARCH */}
          <div className="flex items-center gap-6 flex-wrap justify-end">
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 cursor-pointer shadow-sm"
                disabled={loading}
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
                {loading && currentPage > 1 ? "Loading..." : "Refresh"}
              </button>
              <button
                onClick={handleExport}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </div>

            {/* SEARCH BOX */}
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by product name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex flex-col gap-4 mb-6 mt-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleDateFilterChange("all")}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                dateFilter === "all"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              All Dates
            </button>
            <button
              onClick={() => handleDateFilterChange("today")}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                dateFilter === "today"
                  ? "bg-green-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => handleDateFilterChange("currentMonth")}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                dateFilter === "currentMonth"
                  ? "bg-purple-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Current Month
            </button>
            <button
              onClick={() => handleDateFilterChange("yearToDate")}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                dateFilter === "yearToDate"
                  ? "bg-orange-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Year to Date
            </button>
            <button
              onClick={() => handleDateFilterChange("custom")}
              className={`px-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center gap-2 ${
                dateFilter === "custom"
                  ? "bg-red-600 text-white shadow-md"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <Calendar className="w-4 h-4" />
              Custom Range
            </button>
          </div>

          {/* Custom Date Range Picker */}
          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">From:</span>
                <DatePicker
                  selected={customStartDate}
                  onChange={(date) => {
                    setCustomStartDate(date);
                    if (date && customEndDate && date > customEndDate) {
                      setCustomEndDate(null);
                    }
                  }}
                  selectsStart
                  startDate={customStartDate}
                  endDate={customEndDate}
                  maxDate={new Date()}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholderText="Select start date"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">To:</span>
                <DatePicker
                  selected={customEndDate}
                  onChange={(date) => setCustomEndDate(date)}
                  selectsEnd
                  startDate={customStartDate}
                  endDate={customEndDate}
                  minDate={customStartDate}
                  maxDate={new Date()}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholderText="Select end date"
                  disabled={!customStartDate}
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={clearCustomDateRange}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 cursor-pointer text-sm"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Active Filter Indicator */}
          {(dateFilter !== "all" || selectedMr !== "all" || searchTerm) && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Filter className="w-4 h-4" />
              <span>Active filters:</span>
              {dateFilter !== "all" && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {dateFilter === "today" && "Today"}
                  {dateFilter === "currentMonth" && "Current Month"}
                  {dateFilter === "yearToDate" && "Year to Date"}
                  {dateFilter === "custom" && "Custom Range"}
                </span>
              )}
              {selectedMr !== "all" && (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                  MR: {getCurrentMrDisplayName()}
                </span>
              )}
              {searchTerm && (
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                  Search: {searchTerm}
                </span>
              )}
              <button
                onClick={() => {
                  setDateFilter("all");
                  setSelectedMr("all");
                  setCustomStartDate(null);
                  setCustomEndDate(null);
                  setSearchTerm("");
                  setCurrentPage(1);
                  fetchStockData();
                }}
                className="text-blue-600 hover:text-blue-800 underline text-xs"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Filters Section with SearchableDropdown for MR */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2 w-full md:w-72">
            <Filter className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="w-full">
              <SearchableDropdown
                label="Filter by MR"
                value={selectedMr === "all" 
                  ? { value: "all", label: "All MRs" }
                  : mrOptions.find(opt => opt.value === selectedMr) || { value: selectedMr, label: selectedMr }
                }
                onChange={handleMrChange}
                options={mrOptions}
                placeholder={mrListLoading ? "Loading MRs..." : "Select MR"}
                loading={mrListLoading}
                className="w-full"
                showCount={false}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item, index) => (
                    <th
                      key={`header-${item.id}-${index}`}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.name}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {stockData.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-8 text-center text-gray-500"
                  >
                    {loading ? (
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-lg mb-2">
                          No carry stock records found
                        </div>
                        <div className="text-sm text-gray-400">
                          {selectedMr !== "all"
                            ? `No stock found for selected MR: ${getCurrentMrDisplayName()}`
                            : "Try changing your filters or search term"}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                stockData.map((item, index) => (
                  <tr
                    key={item.id || `row-${index}`}
                    className={`hover:bg-gray-50 ${
                      index < stockData.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {allFields
                      .filter((itemField) =>
                        tableColumns.includes(itemField.id)
                      )
                      .map((itemField, cellIndex) => (
                        <td
                          key={`${item.id}-${itemField.id}-${cellIndex}`}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {getFieldValue(item, itemField.dbName)}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Enhanced Pagination Controls */}
          {totalCount > STOCK_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const prevPage = Math.max(currentPage - 1, 1);
                    setCurrentPage(prevPage);
                  }}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  ← Prev
                </button>

                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-3 py-1 text-gray-500 select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${page}-${idx}`}
                      onClick={() => {
                        setCurrentPage(page);
                      }}
                      disabled={loading}
                      className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                        currentPage === page
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 hover:bg-gray-300"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  onClick={() => {
                    const nextPage = Math.min(currentPage + 1, totalPages);
                    setCurrentPage(nextPage);
                  }}
                  disabled={currentPage === totalPages || loading}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* VIEW MODAL */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Stock Details
                </h2>

                {/* MR Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    MR Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedStock?.mrName || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR Code
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedStock?.mrCode || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Product Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Product Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Product Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedStock?.productName || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Product Code
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedStock?.productCode || "-"}
                      </p>
                    </div>
                    {selectedStock?.category && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Category
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedStock?.category || "-"}
                        </p>
                      </div>
                    )}
                    {selectedStock?.unit && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Unit
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedStock?.unit || "-"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stock Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Stock Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Assigned Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold">
                        {selectedStock?.assignedQty || 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Remaining Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold">
                        {selectedStock?.remainingQty || selectedStock?.boxQuantity || 0}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Used Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold">
                        {selectedStock?.usedQty || Math.max(0, (selectedStock?.assignedQty || 0) - (selectedStock?.remainingQty || 0))}
                      </p>
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-sm font-medium text-gray-600">
                        Utilization
                      </label>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full ${
                              calculateUtilization(
                                selectedStock?.assignedQty || 0,
                                selectedStock?.remainingQty || 0
                              ) > 80
                                ? "bg-green-600"
                                : calculateUtilization(
                                    selectedStock?.assignedQty || 0,
                                    selectedStock?.remainingQty || 0
                                  ) > 50
                                ? "bg-yellow-500"
                                : "bg-red-600"
                            }`}
                            style={{
                              width: `${calculateUtilization(
                                selectedStock?.assignedQty || 0,
                                selectedStock?.remainingQty || 0
                              )}%`,
                            }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">
                          {calculateUtilization(
                            selectedStock?.assignedQty || 0,
                            selectedStock?.remainingQty || 0
                          )}
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Information */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Additional Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Assigned Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {formatDate(selectedStock?.assignedDate) || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Status
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {selectedStock?.status || "-"}
                      </p>
                    </div>
                    {selectedStock?.lc && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          LC Rate
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedStock?.lc || 0}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Invoice Numbers Section */}
                {selectedStock?.invoiceNumbers &&
                  selectedStock.invoiceNumbers.length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-medium text-gray-700 mb-3">
                        Related Invoices
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedStock.invoiceNumbers.map((invoice, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                          >
                            {invoice}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                <div className="mt-6 flex justify-end border-t border-gray-300 pt-4">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default CarryStockView;