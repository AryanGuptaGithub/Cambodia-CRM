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
  Menu,
} from "lucide-react";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const CarryStockView = () => {
  const [allStockData, setAllStockData] = useState([]);
  const [groupedData, setGroupedData] = useState([]);
  const [pagedData, setPagedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMr, setSelectedMr] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [usedTab, setUsedTab] = useState("all");
  const [modalUsedTab, setModalUsedTab] = useState("all");
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
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

  // Mobile detection and sidebar state
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const ROWS_PER_PAGE = 10;

  // ─── Fetch MR List ────────────────────────────────────────────────────────
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const res = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs`);
      if (res.data.success) setMrList(res.data.data || []);
      else showToast("error", "Failed to load MR list");
    } catch (e) {
      console.error(e);
      showToast("error", "Failed to load MR list");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  // ─── Fetch Stock Data ─────────────────────────────────────────────────────
  const fetchStockData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedMr !== "all") {
        params.mrName =
          typeof selectedMr === "object" ? selectedMr.value : selectedMr;
      }
      if (searchTerm.trim()) params.search = searchTerm;

      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-hand`,
        { params },
      );

      if (response.status === 200) {
        let rawData = response.data;
        if (rawData && Array.isArray(rawData.data)) rawData = rawData.data;
        else if (!Array.isArray(rawData)) rawData = [];

        const transformedData = rawData.map((item, index) => {
          const remainingQty =
            item.remainingQty ?? item.quantity ?? item.boxQuantity ?? 0;

          const assignedQty =
            item.assignedQty ?? item.assignedQuantity ?? remainingQty;

          const usedQty = Math.max(0, assignedQty - remainingQty);
          const utilization =
            assignedQty > 0 ? Math.round((usedQty / assignedQty) * 100) : 0;

          let status = "Active";
          if (assignedQty > 0 && remainingQty === 0) {
            status = "Full Used";
          } else if (usedQty > 0 && remainingQty > 0) {
            status = "Partial Used";
          }

          return {
            id: item.id || `${item.mrName}-${item.productId}-${index}`,
            mrCode: item.mrName || "N/A",
            mrName: item.mrName || "N/A",
            productId: item.productId || `PROD-${index}`,
            productCode: item.productCode || "",
            productName: item.productName || "Unknown Product",
            assignedQty,
            remainingQty,
            usedQty,
            utilization,
            status,
            assignedDate:
              item.assignedDate || item.lastUpdated || new Date().toISOString(),
            createdAt: item.createdAt || item.assignedDate,
            invoiceNumbers: item.invoiceNumbers || [],
            lc: item.lc || 0,
            unit: item.unit || "pcs",
            category: item.category || "General",
            boxQuantity: remainingQty,
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

  // ─── Date Filter ─────────────────────────────────────────────────────────
  const applyDateFilter = useCallback(
    (data, filterType, startDate, endDate) => {
      if (filterType === "all" || !data || !data.length) return data;
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
        const d = new Date(item.assignedDate);
        return d >= dateFrom && d <= dateTo;
      });
    },
    [],
  );

  // ─── Filters + Group by MR ────────────────────────────────────────────────
  const applyFiltersAndGroup = useCallback(
    (data, sterm, dateF, startD, endD, mrFilter, usedTabFilter) => {
      let filtered = [...data];

      if (mrFilter !== "all") {
        const mrVal =
          typeof mrFilter === "object"
            ? mrFilter.value || mrFilter.label || mrFilter.mrName
            : mrFilter;
        filtered = filtered.filter(
          (i) => i.mrName === mrVal || i.mrCode === mrVal,
        );
      }

      if (sterm.trim()) {
        filtered = filtered.filter(
          (i) =>
            i.productName?.toLowerCase().includes(sterm.toLowerCase()) ||
            i.mrName?.toLowerCase().includes(sterm.toLowerCase()) ||
            i.productCode?.toLowerCase().includes(sterm.toLowerCase()),
        );
      }

      filtered = applyDateFilter(filtered, dateF, startD, endD);

      if (usedTabFilter === "partial") {
        filtered = filtered.filter((i) => i.usedQty > 0 && i.remainingQty > 0);
      } else if (usedTabFilter === "full") {
        filtered = filtered.filter(
          (i) => i.assignedQty > 0 && i.remainingQty === 0,
        );
      }

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

  // ─── Effects ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMRList();
  }, []);

  useEffect(() => {
    if (mrList.length > 0 || selectedMr === "all") fetchStockData();
  }, [selectedMr, fetchStockData]);

  useEffect(() => {
    const grouped = applyFiltersAndGroup(
      allStockData,
      searchTerm,
      dateFilter,
      customStartDate,
      customEndDate,
      selectedMr,
      usedTab,
    );
    setGroupedData(grouped);
    setTotalCount(grouped.length);
    setCurrentPage(1);
  }, [
    allStockData,
    searchTerm,
    dateFilter,
    customStartDate,
    customEndDate,
    selectedMr,
    usedTab,
    applyFiltersAndGroup,
  ]);

  useEffect(() => {
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    setPagedData(groupedData.slice(start, start + ROWS_PER_PAGE));
  }, [currentPage, groupedData]);

  const tabStats = useMemo(
    () => ({
      all: allStockData.length,
      partial: allStockData.filter((i) => i.usedQty > 0 && i.remainingQty > 0)
        .length,
      full: allStockData.filter(
        (i) => i.assignedQty > 0 && i.remainingQty === 0,
      ).length,
    }),
    [allStockData],
  );

  // ─── Filtered products for modal based on modalUsedTab ───────────────────
  const getFilteredModalProducts = useCallback(() => {
    if (!selectedMrProducts.length) return [];

    if (modalUsedTab === "all") {
      return selectedMrProducts;
    } else if (modalUsedTab === "partial") {
      return selectedMrProducts.filter(
        (product) => product.usedQty > 0 && product.remainingQty > 0,
      );
    } else if (modalUsedTab === "full") {
      return selectedMrProducts.filter(
        (product) => product.assignedQty > 0 && product.remainingQty === 0,
      );
    }
    return selectedMrProducts;
  }, [selectedMrProducts, modalUsedTab]);

  // ─── Modal tab stats ─────────────────────────────────────────────────────
  const modalTabStats = useMemo(() => {
    return {
      all: selectedMrProducts.length,
      partial: selectedMrProducts.filter(
        (p) => p.usedQty > 0 && p.remainingQty > 0,
      ).length,
      full: selectedMrProducts.filter(
        (p) => p.assignedQty > 0 && p.remainingQty === 0,
      ).length,
    };
  }, [selectedMrProducts]);

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const calcUtil = (assigned, remaining) => {
    if (!assigned || assigned === 0) return 0;
    return Math.round((Math.max(0, assigned - remaining) / assigned) * 100);
  };

  const formatDate = (ds) => {
    if (!ds) return "N/A";
    try {
      const d = new Date(ds);
      if (isNaN(d.getTime())) return "N/A";
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const mrOptions = useMemo(() => {
    const opts = [{ value: "all", label: "All MRs" }];
    mrList.forEach((mr) => opts.push({ value: mr.mrName, label: mr.mrName }));
    return opts;
  }, [mrList]);

  const totalPages = Math.ceil(totalCount / ROWS_PER_PAGE) || 1;

  const getVisiblePages = (current, total) => {
    const delta = 2,
      range = [],
      out = [];
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
        if (i - l === 2) out.push(l + 1);
        else if (i - l !== 1) out.push("...");
      }
      out.push(i);
      l = i;
    });
    return out;
  };
  const visiblePages = getVisiblePages(currentPage, totalPages);

  const handleMrChange = (opt) => {
    if (!opt) {
      setSelectedMr("all");
      return;
    }
    setSelectedMr(typeof opt === "string" ? opt : opt.value || "all");
  };

  const getMrLabel = () => {
    if (selectedMr === "all") return "All MRs";
    const opt = mrOptions.find(
      (o) => o.value === selectedMr || o.label === selectedMr,
    );
    return opt ? opt.label : selectedMr;
  };

  const clearDates = () => {
    setCustomStartDate(null);
    setCustomEndDate(null);
    setDateFilter("all");
  };

  const handleViewDetails = (s) => {
    setSelectedStock(s);
    setIsViewModalOpen(true);
  };

  const handleOpenProductsModal = (grp) => {
    setSelectedMrProducts(grp.products);
    setSelectedMrName(grp.mrName);
    setModalUsedTab("all");
    setIsProductsModalOpen(true);
  };

  const handleRefresh = () => {
    setCurrentPage(1);
    fetchStockData();
  };

  const capitalizeFirstLetter = (string) => {
    if (!string) return "";
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  };

  // ─── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      showToast("info", "Preparing export...");
      const rows = allStockData;
      const headers = [
        "MR Name",
        "Product Name",
        "Assigned Qty",
        "Remaining Qty",
        "Used Qty",
        "Utilization %",
        "Status",
        "Assigned Date",
      ];
      const csvRows = rows.map((item) =>
        [
          item.mrName,
          item.productName,
          item.assignedQty,
          item.remainingQty,
          item.usedQty,
          `${item.utilization}%`,
          item.status,
          item.assignedDate || "",
        ]
          .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
          .join(","),
      );
      const csv = [headers.map((h) => `"${h}"`).join(","), ...csvRows].join(
        "\n",
      );
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute(
        "download",
        `carry-stock-${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Export downloaded!");
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to export");
    }
  };

  // ─── Sub-components ───────────────────────────────────────────────────────
  const StatusBadge = ({ product }) => {
    const { remainingQty, assignedQty, usedQty } = product;
    if (assignedQty > 0 && remainingQty === 0)
      return (
        <span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-red-100 text-red-800">
          Full Used
        </span>
      );
    if (usedQty > 0 && remainingQty > 0)
      return (
        <span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
          Partial Used
        </span>
      );
    return (
      <span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-green-100 text-green-800">
        Active
      </span>
    );
  };

  const UtilizationBar = ({ value }) => (
    <div className="flex items-center gap-2 justify-center min-w-[130px]">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${
            value >= 100
              ? "bg-red-500"
              : value >= 60
                ? "bg-yellow-500"
                : value > 0
                  ? "bg-green-500"
                  : "bg-gray-300"
          }`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-gray-700 w-10 text-right">
        {value}%
      </span>
    </div>
  );

  // ─── Used Tab Component ───────────────────────────────────────────────────
  const UsedTabButton = ({ tabKey, label, count, activeTab, setActiveTab }) => (
    <button
      onClick={() => setActiveTab(tabKey)}
      className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-medium transition-all duration-200 cursor-pointer ${
        activeTab === tabKey
          ? "bg-blue-600 text-white shadow-md"
          : "bg-gray-200 text-gray-700 hover:bg-gray-300"
      }`}
    >
      {label}
      <span
        className={`ml-2 ${isMobileView ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5"} rounded-full ${
          activeTab === tabKey
            ? "bg-white text-blue-600"
            : "bg-gray-400 text-white"
        }`}
      >
        {count}
      </span>
    </button>
  );

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading && currentPage === 1) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading carry stock data...</p>
        </div>
      </div>
    );
  }

  const filteredModalProducts = getFilteredModalProducts();

  return (
    <div className={`${isMobileView ? "px-3 pb-20" : "p-6"} relative`}>
      {/* Sidebar for mobile */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* Mobile Header with Hamburger Menu */}
      {isMobileView && (
        <div className="bg-gray-200 shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40 rounded-2xl mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <h1 className="text-sm font-bold text-gray-800">
              Carry Stock View
            </h1>
          </div>
        </div>
      )}

      <div className="container">
        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
          {!isMobileView && (
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Carry Stock View
              </h1>
              <p className="text-gray-600">View stock assigned to MRs</p>
            </div>
          )}

          <div className="flex items-center gap-6 flex-wrap justify-end w-full md:w-auto">
            {/* Desktop: Show both buttons, Mobile: Hide both */}
            {!isMobileView && (
              <div className="flex gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 cursor-pointer shadow-sm"
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
            )}

            <div
              className={`relative ${isMobileView ? "w-full" : "w-full md:w-72"}`}
            >
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
                className={`pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 ${isMobileView ? "text-sm" : ""}`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-3">
          <div className="flex flex-wrap gap-3">
            {[
              { key: "all", label: "All Dates" },
              { key: "today", label: "Today" },
              {
                key: "currentMonth",
                label: isMobileView ? "This Month" : "Current Month",
              },
              {
                key: "yearToDate",
                label: isMobileView ? "YTD" : "Year to Date",
              },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateFilter(key)}
                className={`${isMobileView ? "px-1 py-1 text-[10px]" : "px-4 py-2 text-sm"} rounded-lg mt-4 transition-all duration-200 cursor-pointer ${
                  dateFilter === key
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setDateFilter("custom")}
              className={`${isMobileView ? "px-1 py-1 text-[10px]" : "px-4 py-2 text-sm"} rounded-lg mt-4 transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                dateFilter === "custom"
                  ? "bg-blue-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              <Calendar className="w-4 h-4" />
              {isMobileView ? "Custom" : "Custom Range"}
            </button>
          </div>

          {dateFilter === "custom" && (
            <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2">
                <span
                  className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-700`}
                >
                  From:
                </span>
                <DatePicker
                  selected={customStartDate}
                  onChange={(d) => {
                    setCustomStartDate(d);
                    if (d && customEndDate && d > customEndDate)
                      setCustomEndDate(null);
                  }}
                  selectsStart
                  startDate={customStartDate}
                  endDate={customEndDate}
                  maxDate={new Date()}
                  className={`border border-gray-300 rounded-lg ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-2"} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholderText="Start"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`${isMobileView ? "text-xs" : "text-sm"} font-medium text-gray-700`}
                >
                  To:
                </span>
                <DatePicker
                  selected={customEndDate}
                  onChange={(d) => setCustomEndDate(d)}
                  selectsEnd
                  startDate={customStartDate}
                  endDate={customEndDate}
                  minDate={customStartDate}
                  maxDate={new Date()}
                  disabled={!customStartDate}
                  className={`border border-gray-300 rounded-lg ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-2"} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  placeholderText="End"
                  dateFormat="yyyy-MM-dd"
                />
              </div>
              {(customStartDate || customEndDate) && (
                <button
                  onClick={clearDates}
                  className={`px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 cursor-pointer ${isMobileView ? "text-xs" : "text-sm"}`}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {!isMobileView &&
            (dateFilter !== "all" ||
              selectedMr !== "all" ||
              searchTerm ||
              usedTab !== "all") && (
              <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                <Filter className="w-4 h-4" />
                {selectedMr !== "all" && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    MR: {getMrLabel()}
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
                    setUsedTab("all");
                    setCurrentPage(1);
                  }}
                  className="text-blue-600 hover:text-blue-800 underline text-xs"
                >
                  Clear all
                </button>
              </div>
            )}
        </div>

        {/* ── MR Filter Dropdown and Clear All in same row (Mobile) ── */}
        {isMobileView ? (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1">
              <SearchableDropdown
                label="MR"
                value={
                  selectedMr === "all"
                    ? { value: "all", label: "All MRs" }
                    : mrOptions.find((o) => o.value === selectedMr) || {
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
            {(selectedMr !== "all" ||
              searchTerm ||
              usedTab !== "all" ||
              dateFilter !== "all") && (
              <button
                onClick={() => {
                  setDateFilter("all");
                  setSelectedMr("all");
                  setCustomStartDate(null);
                  setCustomEndDate(null);
                  setSearchTerm("");
                  setUsedTab("all");
                  setCurrentPage(1);
                }}
                className="px-4 mt-5 py-2 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 transition-colors whitespace-nowrap"
              >
                Clear All
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2 w-full md:w-72">
              <Filter
                className={`${isMobileView ? "w-4 h-4" : "w-5 h-5"} text-gray-500 flex-shrink-0`}
              />
              <div className="w-full">
                <SearchableDropdown
                  label={!isMobileView ? "Filter by MR" : "MR"}
                  value={
                    selectedMr === "all"
                      ? { value: "all", label: "All MRs" }
                      : mrOptions.find((o) => o.value === selectedMr) || {
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
        )}

        {/* ── Summary ── */}
        <div
          className={`mb-3 text-gray-500 ${isMobileView ? "text-xs" : "text-sm"}`}
        >
          Showing {pagedData.length} of {totalCount} MR
          {totalCount !== 1 ? "s" : ""}
          {totalCount > 0 && ` (${allStockData.length} total product records)`}
        </div>

        {/* ── Main Table ── */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "min-w-[140px] text-xs" : "min-w-[180px] text-sm"} font-medium text-left pl-5`}
                >
                  MR Name
                </th>
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "min-w-[100px] text-xs" : "min-w-[140px] text-sm"} font-medium`}
                >
                  Products
                </th>
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "min-w-[120px] text-xs" : "min-w-[160px] text-sm"} font-medium`}
                >
                  Last Assigned Date
                </th>
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "min-w-[80px] text-xs" : "min-w-[120px] text-sm"} font-medium`}
                >
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
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                      </div>
                    ) : (
                      <div>
                        <div
                          className={`${isMobileView ? "text-sm" : "text-lg"} mb-2`}
                        >
                          No carry stock records found
                        </div>
                        <div className="text-xs text-gray-400">
                          {selectedMr !== "all"
                            ? `No stock for: ${getMrLabel()}`
                            : "Try changing your filters"}
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
                    <td
                      className={`p-3 text-left pl-5 ${isMobileView ? "text-xs" : "text-sm"}`}
                    >
                      <div className="font-semibold text-gray-900">
                        {mrGroup.mrName}
                      </div>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleOpenProductsModal(mrGroup)}
                        className={`inline-flex items-center gap-2 ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-1.5"} bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors cursor-pointer border border-indigo-200`}
                      >
                        <Package size={isMobileView ? 12 : 16} />
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
                    <td
                      className={`p-3 ${isMobileView ? "text-xs" : "text-sm"} text-gray-700`}
                    >
                      {formatDate(mrGroup.lastAssignedDate)}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => handleOpenProductsModal(mrGroup)}
                          className="text-blue-600 hover:text-blue-800 cursor-pointer p-1 hover:bg-blue-50 rounded"
                          title="View MR Products"
                        >
                          <Eye size={isMobileView ? 16 : 18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {totalCount > ROWS_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div
                className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}
              >
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1 || loading}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
                >
                  ← Prev
                </button>
                {!isMobileView ? (
                  visiblePages.map((page, idx) =>
                    page === "..." ? (
                      <span
                        key={`e-${idx}`}
                        className="px-3 py-1 text-gray-500"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={`p-${page}-${idx}`}
                        onClick={() => setCurrentPage(page)}
                        disabled={loading}
                        className={`px-3 py-1 rounded w-10 text-center cursor-pointer ${currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
                      >
                        {page}
                      </button>
                    ),
                  )
                ) : (
                  <span className="px-3 py-1 text-sm text-gray-700 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages || loading}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            PRODUCTS MODAL
        ══════════════════════════════════════════════════════════════════ */}
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
                  <h2
                    className={`${isMobileView ? "text-base" : "text-xl"} font-semibold text-gray-800`}
                  >
                    Products for MR:{" "}
                    <span className="text-indigo-600">{selectedMrName}</span>
                  </h2>

                  <div className="flex flex-wrap gap-2 mt-6 mb-1">
                    {[
                      {
                        key: "all",
                        label: "All",
                        count: modalTabStats.all,
                      },
                      {
                        key: "partial",
                        label: "Partial Used",
                        count: modalTabStats.partial,
                      },
                      {
                        key: "full",
                        label: "Full Used",
                        count: modalTabStats.full,
                      },
                    ].map(({ key, label, count }) => (
                      <button
                        key={key}
                        onClick={() => setModalUsedTab(key)}
                        className={`${isMobileView ? "px-1 py-1.5 text-[10px]" : "px-4 py-2 text-sm"} rounded-lg font-medium transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                          modalUsedTab === key
                            ? "bg-blue-600 text-white shadow-md"
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        {label}
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                            modalUsedTab === key
                              ? "bg-white text-blue-600"
                              : "bg-gray-400 text-white"
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {filteredModalProducts.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    No products found for this filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-gray-100 text-gray-700">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-xs">
                            #
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-xs">
                            Product Details
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-xs">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-xs">
                            Utilization
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-xs">
                            Status
                          </th>
                          <th className="px-4 py-3 text-center font-medium text-xs">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredModalProducts.map((product, idx) => {
                          const assignedQty = product.assignedQty ?? 0;
                          const remainingQty = product.remainingQty ?? 0;
                          const usedQty =
                            product.usedQty ??
                            Math.max(0, assignedQty - remainingQty);
                          const utilization =
                            product.utilization ??
                            calcUtil(assignedQty, remainingQty);

                          return (
                            <tr
                              key={product.id || idx}
                              className={`hover:bg-gray-50 ${idx < filteredModalProducts.length - 1 ? "border-b" : ""}`}
                            >
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {idx + 1}
                              </td>

                              <td className="px-4 py-3 text-left">
                                <div className="font-semibold text-gray-900 text-sm">
                                  {capitalizeFirstLetter(product.productName)}
                                </div>
                              </td>

                              <td className="px-4 py-3 text-center">
                                <div className="inline-block text-xs space-y-0.5 min-w-[110px] text-left">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">
                                      Assigned:
                                    </span>
                                    <span className="font-semibold text-gray-800">
                                      {assignedQty}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">
                                      Remaining:
                                    </span>
                                    <span className="font-semibold text-green-700">
                                      {remainingQty}
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-gray-500">Used:</span>
                                    <span
                                      className={`font-semibold ${usedQty > 0 ? "text-orange-600" : "text-gray-400"}`}
                                    >
                                      {usedQty}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-3 text-center">
                                <UtilizationBar value={utilization} />
                              </td>

                              <td className="px-4 py-3 text-center">
                                <StatusBadge product={product} />
                              </td>

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

                <div className="mt-6 flex justify-between items-center border-t border-gray-200 pt-4">
                  <div className="text-xs text-gray-500">
                    Showing {filteredModalProducts.length} of{" "}
                    {selectedMrProducts.length} products
                  </div>
                  <button
                    onClick={() => setIsProductsModalOpen(false)}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-5 py-2 rounded-lg cursor-pointer text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}

        {/* ══════════════════════════════════════════════════════════════════
            VIEW DETAILS MODAL
        ══════════════════════════════════════════════════════════════════ */}
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
                <h2
                  className={`${isMobileView ? "text-base" : "text-xl"} font-semibold text-gray-800 mb-4`}
                >
                  Stock Details
                </h2>

                <div className="mb-6">
                  <h3
                    className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-700 mb-3`}
                  >
                    MR Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm">
                        {selectedStock?.mrName || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3
                    className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-700 mb-3`}
                  >
                    Product Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Product Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm">
                        {selectedStock?.productName || "-"}
                      </p>
                    </div>
                    {selectedStock?.lc > 0 && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600">
                          LC Rate
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm">
                          {selectedStock.lc}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <h3
                    className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-700 mb-3`}
                  >
                    Stock Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Assigned Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold">
                        {selectedStock?.assignedQty ?? 0}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Remaining Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold text-green-700">
                        {selectedStock?.remainingQty ?? 0}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Used Quantity
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-lg font-semibold text-orange-600">
                        {selectedStock?.usedQty ??
                          Math.max(
                            0,
                            (selectedStock?.assignedQty ?? 0) -
                              (selectedStock?.remainingQty ?? 0),
                          )}
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Utilization
                      </label>
                      <UtilizationBar
                        value={
                          selectedStock?.utilization ??
                          calcUtil(
                            selectedStock?.assignedQty ?? 0,
                            selectedStock?.remainingQty ?? 0,
                          )
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3
                    className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-700 mb-3`}
                  >
                    Additional Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Assigned Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm">
                        {formatDate(selectedStock?.assignedDate) || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">
                        Status
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 text-sm">
                        {selectedStock?.status || "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedStock?.invoiceNumbers?.length > 0 && (
                  <div className="mb-6">
                    <h3
                      className={`${isMobileView ? "text-sm" : "text-lg"} font-medium text-gray-700 mb-3`}
                    >
                      Related Invoices
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedStock.invoiceNumbers.map((inv, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                        >
                          {inv}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end border-t border-gray-300 pt-4">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer text-sm"
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
