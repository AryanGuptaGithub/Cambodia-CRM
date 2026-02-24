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
  Package,
} from "lucide-react";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CarryStockView = () => {
  const [allStockData, setAllStockData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [pagedData, setPagedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMr, setSelectedMr] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // View Details modal (original per-product modal)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);

  // Products modal (package icon click → show all products for an MR)
  const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
  const [selectedMrProducts, setSelectedMrProducts] = useState([]);
  const [selectedMrName, setSelectedMrName] = useState("");

  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const inputRef = useRef(null);

  const ROWS_PER_PAGE = 10;

  // ─── Fetch MR List ───────────────────────────────────────────────────────
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mrs`,
      );
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

  // ─── Fetch Stock Data ────────────────────────────────────────────────────
  // const fetchStockData = useCallback(async () => {
  //   try {
  //     setLoading(true);
  //     const params = {};
  //     if (selectedMr !== "all") {
  //       const mrValue =
  //         typeof selectedMr === "object" ? selectedMr.value : selectedMr;
  //       params.mrName = mrValue;
  //     }
  //     if (searchTerm.trim()) {
  //       params.search = searchTerm;
  //     }

  //     const response = await axios.get(
  //       `${backendUrl}/api/stock-transfer-to-mr/mr-hand`,
  //       { params },
  //     );

  //     console.log("values of resposnt", response);
  //     if (response.status === 200) {
  //       // Determine the data array
  //       let rawData = response.data;
  //       // If response.data has a 'data' property that is an array, use that (common paginated response)
  //       if (rawData && Array.isArray(rawData.data)) {
  //         rawData = rawData.data;
  //       } else if (!Array.isArray(rawData)) {
  //         // If it's not an array, maybe it's an object with some other structure; fallback to empty array
  //         console.warn("Unexpected response data format", rawData);
  //         rawData = [];
  //       }
  //       const transformedData = rawData.map((item, index) => ({
  //         id: item.id || `${item.mrName}-${item.productId}-${index}`,
  //         mrCode: item.mrName || "N/A",
  //         mrName: item.mrName || "N/A",
  //         productId: item.productId || `PROD-${index}`,
  //         productCode: item.productCode || `PROD-${index}`,
  //         productName: item.productName || "Unknown Product",
  //         batch: item.batch || "N/A",
  //         expiry: item.expiry || "N/A",
  //         assignedQty: item.assignedQty || 0,
  //         remainingQty: item.remainingQty || item.boxQuantity || 0,
  //         usedQty: item.usedQty || 0,
  //         assignedDate:
  //           item.assignedDate || new Date().toISOString().split("T")[0],
  //         createdAt: item.createdAt || item.assignedDate,
  //         status: (item.remainingQty || 0) > 0 ? "Active" : "Depleted",
  //         invoiceNumbers: item.invoiceNumbers || [],
  //         lc: item.lc || 0,
  //         unit: item.unit || "pcs",
  //         category: item.category || "General",
  //         packSize: item.packSize || 0,
  //         costPrice: item.costPrice || 0,
  //         boxQuantity: item.boxQuantity || item.remainingQty || 0,
  //       }));
  //       setAllStockData(transformedData);
  //     } else {
  //       showToast(
  //         "error",
  //         response.data.message || "Failed to load carry stock data",
  //       );
  //       setAllStockData([]);
  //     }
  //   } catch (error) {
  //     console.error("Error fetching stock data:", error);
  //     showToast("error", "Failed to load carry stock data");
  //     setAllStockData([]);
  //   } finally {
  //     setLoading(false);
  //   }
  // }, [selectedMr, searchTerm]);

  const fetchStockData = useCallback(async () => {
  try {
    setLoading(true);
    const params = {};
    if (selectedMr !== "all") {
      const mrValue =
        typeof selectedMr === "object" ? selectedMr.value : selectedMr;
      params.mrName = mrValue;
    }
    if (searchTerm.trim()) {
      params.search = searchTerm;
    }

    const response = await axios.get(
      `${backendUrl}/api/stock-transfer-to-mr/mr-hand`,
      { params },
    );

    console.log("API Response:", response);

    if (response.status === 200) {
      // Extract the data array – handle both direct array and { data: [...] }
      let rawData = response.data;
      if (rawData && Array.isArray(rawData.data)) {
        rawData = rawData.data;
      } else if (!Array.isArray(rawData)) {
        console.warn("Unexpected response data format", rawData);
        rawData = [];
      }

      const transformedData = rawData.map((item, index) => {
        // Try to find assigned quantity from common field names
        const assignedQty =
          item.assignedQty ??
          item.originalQuantity ??
          item.totalBoxes ??
          item.quantity ??
          item.boxes ??
          0;

        // Remaining quantity – use remainingQty or boxQuantity
        const remainingQty = item.remainingQty ?? item.boxQuantity ?? 0;

        // Used quantity – if provided, use it; otherwise compute from assigned - remaining
        const usedQty =
          item.usedQty ??
          (assignedQty > 0 ? Math.max(0, assignedQty - remainingQty) : 0);

        return {
          id: item.id || `${item.mrName}-${item.productId}-${index}`,
          mrCode: item.mrName || "N/A",
          mrName: item.mrName || "N/A",
          productId: item.productId || `PROD-${index}`,
          productCode: item.productCode || `PROD-${index}`,
          productName: item.productName || "Unknown Product",
          batch: item.batch || "N/A",
          expiry: item.expiry || "N/A",
          assignedQty,
          remainingQty,
          usedQty,
          assignedDate:
            item.assignedDate || new Date().toISOString().split("T")[0],
          createdAt: item.createdAt || item.assignedDate,
          status: remainingQty > 0 ? "Active" : "Depleted",
          invoiceNumbers: item.invoiceNumbers || [],
          lc: item.lc || 0,
          unit: item.unit || "pcs",
          category: item.category || "General",
          packSize: item.packSize || 0,
          costPrice: item.costPrice || 0,
          boxQuantity: remainingQty, // store remaining for backward compatibility
        };
      });

      setAllStockData(transformedData);
    } else {
      showToast(
        "error",
        response.data?.message || "Failed to load carry stock data",
      );
      setAllStockData([]);
    }
  } catch (error) {
    console.error("Error fetching stock data:", error);
    showToast("error", "Failed to load carry stock data");
    setAllStockData([]);
  } finally {
    setLoading(false);
  }
}, [selectedMr, searchTerm]);

  // ─── Apply Date Filter ───────────────────────────────────────────────────
  const applyDateFilter = useCallback(
    (data, filterType, startDate, endDate) => {
      if (filterType === "all" || !data || data.length === 0) return data;
      const now = new Date();
      let dateFrom, dateTo;
      switch (filterType) {
        case "today":
          dateFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          dateTo = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() + 1,
          );
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
              endDate.getDate() + 1,
            );
          } else return data;
          break;
        default:
          return data;
      }
      return data.filter((item) => {
        if (!item.assignedDate) return false;
        const itemDate = new Date(item.assignedDate);
        return itemDate >= dateFrom && itemDate <= dateTo;
      });
    },
    [],
  );

  // ─── Apply All Filters + Group by MR ────────────────────────────────────
  const applyFiltersAndGroup = useCallback(
    (data, sterm, dateF, startD, endD, mrFilter) => {
      let filtered = [...data];

      // MR filter
      if (mrFilter !== "all") {
        const mrVal =
          typeof mrFilter === "object"
            ? mrFilter.value || mrFilter.label || mrFilter.mrName
            : mrFilter;
        filtered = filtered.filter(
          (item) => item.mrName === mrVal || item.mrCode === mrVal,
        );
      }

      // Search
      if (sterm.trim()) {
        filtered = filtered.filter(
          (item) =>
            item.productName?.toLowerCase().includes(sterm.toLowerCase()) ||
            item.productCode?.toLowerCase().includes(sterm.toLowerCase()) ||
            item.mrName?.toLowerCase().includes(sterm.toLowerCase()) ||
            item.mrCode?.toLowerCase().includes(sterm.toLowerCase()) ||
            item.batch?.toLowerCase().includes(sterm.toLowerCase()),
        );
      }

      // Date
      filtered = applyDateFilter(filtered, dateF, startD, endD);

      // Group by MR
      const grouped = {};
      filtered.forEach((item) => {
        const key = item.mrName;
        if (!grouped[key]) {
          grouped[key] = {
            mrName: item.mrName,
            mrCode: item.mrCode,
            products: [],
            lastAssignedDate: item.assignedDate,
          };
        }
        grouped[key].products.push(item);
        // Track latest assigned date
        if (item.assignedDate > grouped[key].lastAssignedDate) {
          grouped[key].lastAssignedDate = item.assignedDate;
        }
      });

      return Object.values(grouped).sort((a, b) =>
        a.mrName.localeCompare(b.mrName),
      );
    },
    [applyDateFilter],
  );

  // ─── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMRList();
  }, []);

  useEffect(() => {
    if (mrList.length > 0 || selectedMr === "all") {
      fetchStockData();
    }
  }, [selectedMr, fetchStockData]);

  useEffect(() => {
    if (allStockData.length >= 0) {
      const grouped = applyFiltersAndGroup(
        allStockData,
        searchTerm,
        dateFilter,
        customStartDate,
        customEndDate,
        selectedMr,
      );
      setGroupedData(grouped);
      setTotalCount(grouped.length);
      setCurrentPage(1);
    }
  }, [
    allStockData,
    searchTerm,
    dateFilter,
    customStartDate,
    customEndDate,
    selectedMr,
    applyFiltersAndGroup,
  ]);

  // Paginate grouped data
  useEffect(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    setPagedData(groupedData.slice(startIndex, startIndex + ROWS_PER_PAGE));
  }, [currentPage, groupedData]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const calculateUtilization = (assigned, remaining) => {
    if (!assigned || assigned === 0) return 0;
    const used = Math.max(0, assigned - remaining);
    return Math.round((used / assigned) * 100);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "N/A";
    }
  };

  const mrOptions = useMemo(() => {
    const options = [{ value: "all", label: "All MRs" }];
    mrList.forEach((mr) => {
      options.push({ value: mr.mrName, label: mr.mrName });
    });
    return options;
  }, [mrList]);

  const totalPages = Math.ceil(totalCount / ROWS_PER_PAGE) || 1;

  const getVisiblePages = (current, total) => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;
    for (let i = 1; i <= total; i++) {
      if (
        i === 1 ||
        i === total ||
        (i >= current - delta && i <= current + delta)
      )
        range.push(i);
    }
    range.forEach((i) => {
      if (l) {
        if (i - l === 2) rangeWithDots.push(l + 1);
        else if (i - l !== 1) rangeWithDots.push("...");
      }
      rangeWithDots.push(i);
      l = i;
    });
    return rangeWithDots;
  };
  const visiblePages = getVisiblePages(currentPage, totalPages);

  const handleMrChange = (selectedOption) => {
    if (!selectedOption) {
      setSelectedMr("all");
      return;
    }
    if (typeof selectedOption === "string") {
      setSelectedMr(selectedOption);
      return;
    }
    setSelectedMr(selectedOption.value || "all");
  };

  const getCurrentMrDisplayName = () => {
    if (selectedMr === "all") return "All MRs";
    const opt = mrOptions.find(
      (o) => o.value === selectedMr || o.label === selectedMr,
    );
    return opt ? opt.label : selectedMr;
  };

  const handleDateFilterChange = (filterType) => setDateFilter(filterType);
  const clearCustomDateRange = () => {
    setCustomStartDate(null);
    setCustomEndDate(null);
    setDateFilter("all");
  };

  const handleViewDetails = (stock) => {
    setSelectedStock(stock);
    setIsViewModalOpen(true);
  };

  const handleOpenProductsModal = (mrGroup) => {
    setSelectedMrProducts(mrGroup.products);
    setSelectedMrName(mrGroup.mrName);
    setIsProductsModalOpen(true);
  };

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchStockData();
  };

  // ─── Export (fixed: CSV fallback, not blob) ───────────────────────────────
  const handleExport = async () => {
    try {
      showToast("info", "Preparing export...");

      // Build params same as view
      const params = {};
      if (selectedMr !== "all") {
        const mrValue =
          typeof selectedMr === "object"
            ? selectedMr.value || selectedMr.label
            : selectedMr;
        params.mrName = mrValue;
      }
      if (dateFilter === "custom" && customStartDate && customEndDate) {
        params.dateFrom = customStartDate.toISOString().split("T")[0];
        params.dateTo = customEndDate.toISOString().split("T")[0];
      }

      // Fetch the JSON data (backend returns JSON, not xlsx blob)
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-hand-admin`,
        { params },
      );

      if (!response.data.success) {
        showToast("error", "Failed to fetch data for export");
        return;
      }

      const rows = response.data.data || [];

      // Build CSV
      const headers = [
        "MR Name",
        "Product Name",
        "Product Code",
        "Category",
        "Unit",
        "Assigned Qty",
        "Remaining Qty",
        "Used Qty",
        "Utilization %",
        "Assigned Date",
        "Status",
        "Invoice Numbers",
      ];

      const csvRows = rows.map((item) => {
        const assignedQty = item.assignedQty || 0;
        const remainingQty = item.remainingQty || 0;
        const usedQty = item.usedQty || Math.max(0, assignedQty - remainingQty);
        const utilization =
          assignedQty > 0
            ? Math.round(
                (Math.max(0, assignedQty - remainingQty) / assignedQty) * 100,
              )
            : 0;
        const invoices = Array.isArray(item.invoiceNumbers)
          ? item.invoiceNumbers.join("; ")
          : "";

        return [
          item.mrName || "",
          item.productName || "",
          item.productCode || "",
          item.category || "",
          item.unit || "",
          assignedQty,
          remainingQty,
          usedQty,
          `${utilization}%`,
          item.assignedDate || "",
          item.status || (remainingQty > 0 ? "Active" : "Depleted"),
          invoices,
        ]
          .map((val) => `"${String(val).replace(/"/g, '""')}"`)
          .join(",");
      });

      const csvContent = [
        headers.map((h) => `"${h}"`).join(","),
        ...csvRows,
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `carry-stock-${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      showToast("success", "Export downloaded successfully!");
    } catch (error) {
      console.error("Error exporting data:", error);
      showToast("error", "Failed to export data");
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
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
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              Carry Stock View
            </h1>
            <p className="text-gray-600">View stock assigned to MRs</p>
          </div>
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
                {loading ? "Loading..." : "Refresh"}
              </button>
              <button
                onClick={handleExport}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search by product / MR name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        {/* ── Date Filter Tabs ── */}
        <div className="flex flex-col gap-4 mb-6 mt-6">
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "All Dates", color: "bg-blue-600" },
              { key: "today", label: "Today", color: "bg-green-600" },
              {
                key: "currentMonth",
                label: "Current Month",
                color: "bg-purple-600",
              },
              {
                key: "yearToDate",
                label: "Year to Date",
                color: "bg-orange-600",
              },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => handleDateFilterChange(key)}
                className={`px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                  dateFilter === key
                    ? `${color} text-white shadow-md`
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
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

          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">From:</span>
                <DatePicker
                  selected={customStartDate}
                  onChange={(date) => {
                    setCustomStartDate(date);
                    if (date && customEndDate && date > customEndDate)
                      setCustomEndDate(null);
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

          {(dateFilter !== "all" || selectedMr !== "all" || searchTerm) && (
            <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
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
                }}
                className="text-blue-600 hover:text-blue-800 underline text-xs"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ── MR Filter Dropdown ── */}
        <div className="flex gap-4 mb-6">
          <div className="flex items-center gap-2 w-full md:w-72">
            <Filter className="w-5 h-5 text-gray-500 flex-shrink-0" />
            <div className="w-full">
              <SearchableDropdown
                label="Filter by MR"
                value={
                  selectedMr === "all"
                    ? { value: "all", label: "All MRs" }
                    : mrOptions.find((opt) => opt.value === selectedMr) || {
                        value: selectedMr,
                        label: selectedMr,
                      }
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

        {/* ── Summary ── */}
        <div className="mb-3 text-sm text-gray-500">
          Showing {pagedData.length} of {totalCount} MR
          {totalCount !== 1 ? "s" : ""}
          {totalCount > 0 && ` (${allStockData.length} total product records)`}
        </div>

        {/* ── Main Table ── */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 whitespace-nowrap min-w-[180px] text-sm font-medium text-left pl-5">
                  MR Name
                </th>
                <th className="p-3 whitespace-nowrap min-w-[140px] text-sm font-medium">
                  Products
                </th>
                <th className="p-3 whitespace-nowrap min-w-[160px] text-sm font-medium">
                  Last Assigned Date
                </th>
                <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-gray-500">
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
                pagedData.map((mrGroup, index) => (
                  <tr
                    key={mrGroup.mrName}
                    className={`hover:bg-gray-50 ${index < pagedData.length - 1 ? "border-b" : ""}`}
                  >
                    {/* MR Name */}
                    <td className="p-3 text-left pl-5">
                      <div className="font-semibold text-gray-900">
                        {mrGroup.mrName}
                      </div>
                      {mrGroup.mrCode && mrGroup.mrCode !== mrGroup.mrName && (
                        <div className="text-xs text-gray-500">
                          {mrGroup.mrCode}
                        </div>
                      )}
                    </td>

                    {/* Products count + package icon */}
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenProductsModal(mrGroup)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer border border-indigo-200"
                        title={`View ${mrGroup.products.length} product(s)`}
                      >
                        <Package size={16} />
                        <span className="font-semibold">
                          {mrGroup.products.length}
                        </span>
                        <span className="text-xs text-indigo-500">
                          {mrGroup.products.length === 1
                            ? "product"
                            : "products"}
                        </span>
                      </button>
                    </td>

                    {/* Last Assigned Date */}
                    <td className="p-3 text-sm text-gray-700">
                      {formatDate(mrGroup.lastAssignedDate)}
                    </td>

                    {/* Actions */}
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenProductsModal(mrGroup)}
                          className="text-blue-600 hover:text-blue-800 cursor-pointer p-1 hover:bg-blue-50 rounded"
                          title="View MR Products"
                        >
                          <Eye size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {totalCount > ROWS_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
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
                      onClick={() => setCurrentPage(page)}
                      disabled={loading}
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
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages || loading}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            PRODUCTS MODAL  — opens when clicking package icon / eye in table
            Shows Product Details, Quantity, Utilization for all products of an MR
            ════════════════════════════════════════════════════════════════════ */}
        {isProductsModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsProductsModalOpen(false)}
              />
              <div className="bg-white w-full max-w-5xl p-6 rounded-xl shadow-2xl relative overflow-y-auto max-h-[90vh] mx-4">
                <button
                  onClick={() => setIsProductsModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <div className="mb-5">
                  <h2 className="text-xl font-semibold text-gray-800">
                    Products for MR:{" "}
                    <span className="text-indigo-600">{selectedMrName}</span>
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedMrProducts.length} product
                    {selectedMrProducts.length !== 1 ? "s" : ""} in hand
                  </p>
                </div>

                {selectedMrProducts.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    No products found.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium whitespace-nowrap">
                            #
                          </th>
                          <th className="px-4 py-3 text-left font-medium whitespace-nowrap">
                            Product Details
                          </th>
                          <th className="px-4 py-3 text-center font-medium whitespace-nowrap">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-center font-medium whitespace-nowrap">
                            Utilization
                          </th>
                          <th className="px-4 py-3 text-center font-medium whitespace-nowrap">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center font-medium whitespace-nowrap">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMrProducts.map((product, idx) => {
                          const utilization = calculateUtilization(
                            product.assignedQty,
                            product.remainingQty,
                          );
                          const used =
                            product.usedQty ||
                            Math.max(
                              0,
                              (product.assignedQty || 0) -
                                (product.remainingQty || 0),
                            );
                          return (
                            <tr
                              key={product.id || idx}
                              className={`hover:bg-gray-50 ${idx < selectedMrProducts.length - 1 ? "border-b" : ""}`}
                            >
                              {/* # */}
                              <td className="px-4 py-3 text-gray-500">
                                {idx + 1}
                              </td>

                              {/* Product Details */}
                              <td className="px-4 py-3 text-left">
                                <div className="font-semibold text-gray-900">
                                  {product.productName}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {product.productCode}
                                </div>
                                {product.category && (
                                  <div className="text-xs text-gray-400">
                                    {product.category}
                                  </div>
                                )}
                                {product.unit && (
                                  <div className="text-xs text-indigo-500">
                                    {product.unit}
                                  </div>
                                )}
                              </td>

                              {/* Quantity */}
                              <td className="px-4 py-3 text-center">
                                <div className="inline-block text-xs space-y-0.5 min-w-[110px] text-left">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">
                                      Assigned:
                                    </span>
                                    <span className="font-semibold text-gray-800">
                                      {product.assignedQty || 0}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">
                                      Remaining:
                                    </span>
                                    <span className="font-semibold text-green-700">
                                      {product.remainingQty || 0}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Used:</span>
                                    <span className="font-semibold text-orange-600">
                                      {used}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              {/* Utilization */}
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center gap-2 justify-center min-w-[120px]">
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div
                                      className={`h-2 rounded-full transition-all ${
                                        utilization >= 80
                                          ? "bg-green-600"
                                          : utilization >= 50
                                            ? "bg-yellow-500"
                                            : "bg-red-500"
                                      }`}
                                      style={{
                                        width: `${Math.min(utilization, 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-gray-700 w-10 text-right">
                                    {utilization}%
                                  </span>
                                </div>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                    (product.remainingQty || 0) > 0
                                      ? "bg-green-100 text-green-800"
                                      : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {(product.remainingQty || 0) > 0
                                    ? "Active"
                                    : "Depleted"}
                                </span>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => {
                                    setIsProductsModalOpen(false);
                                    setTimeout(
                                      () => handleViewDetails(product),
                                      100,
                                    );
                                  }}
                                  className="text-blue-600 hover:text-blue-800 cursor-pointer p-1 hover:bg-blue-50 rounded"
                                  title="View Full Details"
                                >
                                  <Eye size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="mt-6 flex justify-end border-t border-gray-200 pt-4">
                  <button
                    onClick={() => setIsProductsModalOpen(false)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ════════════════════════════════════════════════════════════════════
            VIEW DETAILS MODAL  — full single-product details
            ════════════════════════════════════════════════════════════════════ */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />
              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen mx-4">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Stock Details
                </h2>

                {/* MR Information */}
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

                {/* Product Information */}
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
                          {selectedStock.category}
                        </p>
                      </div>
                    )}
                    {selectedStock?.unit && (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          Unit
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedStock.unit}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stock Information */}
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
                        {selectedStock?.remainingQty ||
                          selectedStock?.boxQuantity ||
                          0}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Used Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold">
                        {selectedStock?.usedQty ||
                          Math.max(
                            0,
                            (selectedStock?.assignedQty || 0) -
                              (selectedStock?.remainingQty || 0),
                          )}
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
                                selectedStock?.remainingQty || 0,
                              ) > 80
                                ? "bg-green-600"
                                : calculateUtilization(
                                      selectedStock?.assignedQty || 0,
                                      selectedStock?.remainingQty || 0,
                                    ) > 50
                                  ? "bg-yellow-500"
                                  : "bg-red-600"
                            }`}
                            style={{
                              width: `${calculateUtilization(selectedStock?.assignedQty || 0, selectedStock?.remainingQty || 0)}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {calculateUtilization(
                            selectedStock?.assignedQty || 0,
                            selectedStock?.remainingQty || 0,
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
                    {selectedStock?.lc ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-600">
                          LC Rate
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {selectedStock.lc}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* Invoice Numbers */}
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
            document.body,
          )}
      </div>
    </div>
  );
};

export default CarryStockView;
