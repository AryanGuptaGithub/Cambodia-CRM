import React, { useState, useEffect, useRef } from "react";
import {
  TrendingUp,
  Search,
  X,
  Users,
  DollarSign,
  BarChart3,
  Percent,
  FileDown,
  Filter,
  Menu,
  ChevronDown,
  ChevronUp,
  UserCheck,
  CheckSquare,
  Square,
  Save,
  RefreshCw,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const toLocalDateStr = (d) => {
  if (!d) return "";
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${dy}`;
};

const SalesSalaryRatio = () => {
  const [data, setData] = useState({
    summary: {
      totalSales: 0,
      totalSalary: 0,
      totalExpense: 0,
      totalProfit: 0,
      ratio: 0,
      totalTourExpense: 0,
      totalTourAllowance: 0,
      totalAllowance: 0,
      totalIncentive: 0,
      expenseSaleRatio: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTab, setSelectedTab] = useState("currentMonth");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [expandedMr, setExpandedMr] = useState(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // MR Filter State
  const [showMrFilterModal, setShowMrFilterModal] = useState(false);
  const [allMrList, setAllMrList] = useState([]);
  const [activeMrIds, setActiveMrIds] = useState([]);
  const [tempSelected, setTempSelected] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);
  const [mrSaveLoading, setMrSaveLoading] = useState(false);
  const [mrSearchTerm, setMrSearchTerm] = useState("");

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const inputRef = useRef(null);
  const itemsPerPage = 7;
  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * itemsPerPage + index + 1;

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();
  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };
  const getJanToPreviousMonthDisplay = () => {
    const now = new Date();
    return now.getMonth() === 0
      ? `Jan - Dec ${now.getFullYear() - 1}`
      : `Jan - ${getPreviousMonthName()} ${now.getFullYear()}`;
  };
  const getYearMonthFromDate = (date) => {
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
  };

  const getDateRange = () => {
    const today = new Date();
    const y = today.getFullYear(),
      m = today.getMonth();
    switch (selectedTab) {
      case "currentMonth": {
        const f = new Date(y, m, 1),
          l = new Date(y, m + 1, 0);
        return {
          startDate: toLocalDateStr(f),
          endDate: toLocalDateStr(l),
          period: `${y}-${(m + 1).toString().padStart(2, "0")}`,
          displayDate: `${getCurrentMonthName()} ${getCurrentYear()}`,
        };
      }
      case "janToPreviousMonth": {
        const j = new Date(y, 0, 1),
          lm = new Date(y, m, 0);
        return {
          startDate: toLocalDateStr(j),
          endDate: toLocalDateStr(lm),
          period: null,
          displayDate: getJanToPreviousMonthDisplay(),
        };
      }
      case "custom": {
        const ss = toLocalDateStr(customDateRange.startDate);
        const es = toLocalDateStr(customDateRange.endDate);
        return {
          startDate: ss,
          endDate: es,
          period: customDateRange.startDate
            ? getYearMonthFromDate(customDateRange.startDate)
            : null,
          displayDate: ss && es ? `${ss} – ${es}` : "Select custom dates",
        };
      }
      case "all":
        return {
          startDate: null,
          endDate: null,
          period: null,
          displayDate: "All Records",
        };
      default:
        return {
          startDate: null,
          endDate: null,
          period: null,
          displayDate: "Current Month",
        };
    }
  };

  const emptyData = () => ({
    summary: {
      totalSales: 0,
      totalSalary: 0,
      totalExpense: 0,
      totalProfit: 0,
      ratio: 0,
      totalTourExpense: 0,
      totalTourAllowance: 0,
      totalAllowance: 0,
      totalIncentive: 0,
      expenseSaleRatio: 0,
    },
    records: [],
  });

  const fetchActiveMrs = async () => {
    try {
      const res = await axios.get(
        `${backendUrl}/api/reports/sales-and-salary/active-mrs`,
      );
      if (res.data.success) setActiveMrIds(res.data.data || []);
    } catch {
      setActiveMrIds([]);
    }
  };

  const fetchMrList = async () => {
    setMrListLoading(true);
    try {
      const res = await axios.get(
        `${backendUrl}/api/reports/sales-and-salary/mrs`,
      );
      if (res.data.success) {
        const validMrs = (res.data.data || []).filter((m) => m.mrId);
        setAllMrList(validMrs);
      }
    } catch {
      showToast("error", "Failed to fetch MR list");
    } finally {
      setMrListLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveMrs();
  }, []);

  const fetchData = async (
    page = 1,
    search = searchTerm,
    activeIds = activeMrIds,
  ) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      const params = { page, limit: itemsPerPage, dateFilter: selectedTab };
      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          setLoading(false);
          showToast(
            "warning",
            "Please select both start and end dates for custom filter",
          );
          return;
        }
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        if (dateRange.period) params.period = dateRange.period;
      }
      if (search?.trim()) params.search = search.trim();
      if (activeIds && activeIds.length > 0) params.mrIds = activeIds.join(",");

      const response = await axios.get(
        `${backendUrl}/api/reports/sales-and-salary`,
        { params },
      );
      if (response.data.success) {
        const s = response.data.data?.summary || {};
        setData({
          summary: {
            totalSales: parseFloat(s.totalSales) || 0,
            totalSalary: parseFloat(s.totalSalary) || 0,
            totalExpense: parseFloat(s.totalExpense) || 0,
            totalProfit: parseFloat(s.totalProfit) || 0,
            ratio: parseFloat(s.ratio) || 0,
            totalTourExpense: parseFloat(s.totalTourExpense) || 0,
            totalTourAllowance: parseFloat(s.totalTourAllowance) || 0,
            totalAllowance: parseFloat(s.totalAllowance) || 0,
            totalIncentive: parseFloat(s.totalIncentive) || 0,
            expenseSaleRatio: parseFloat(s.expenseSaleRatio) || 0,
          },
          records: response.data.data?.records || [],
        });
        setPagination(
          response.data.pagination || {
            currentPage: 1,
            totalPages: 1,
            totalRecords: 0,
            hasNext: false,
            hasPrev: false,
          },
        );
      } else {
        throw new Error(response.data.message || "Failed to fetch data");
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          "Failed to fetch sales salary ratio data",
      );
      setData(emptyData());
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
    if (selectedTab === "custom") {
      if (customDateRange.startDate && customDateRange.endDate)
        fetchData(1, searchTerm, activeMrIds);
      else {
        setData(emptyData());
        setPagination({
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        });
      }
    } else {
      fetchData(1, searchTerm, activeMrIds);
    }
  }, [selectedTab, activeMrIds]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchData(1, searchTerm, activeMrIds);
  }, [customDateRange.startDate, customDateRange.endDate]);

  useEffect(() => {
    const t = setTimeout(() => fetchData(1, searchTerm, activeMrIds), 500);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchData(page, searchTerm, activeMrIds);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchData(1, "", activeMrIds);
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((p) => ({ ...p, [name]: date }));
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
    fetchData(1, searchTerm, activeMrIds);
  };
  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") setShowCustomFilter(true);
    else {
      setCustomDateRange({ startDate: null, endDate: null });
      setShowCustomFilter(false);
    }
  };
  const handleClearFilters = () => {
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("currentMonth");
    setShowCustomFilter(false);
  };
  const toggleMrExpand = (mrId) =>
    setExpandedMr(expandedMr === mrId ? null : mrId);

  const openMrFilterModal = async () => {
    await fetchMrList();
    const validMrList = allMrList.filter((m) => m.mrId);
    setTempSelected(
      activeMrIds.length > 0
        ? [...activeMrIds]
        : validMrList.map((m) => m.mrId),
    );
    setMrSearchTerm("");
    setShowMrFilterModal(true);
  };

  useEffect(() => {
    if (
      showMrFilterModal &&
      allMrList.length > 0 &&
      tempSelected.length === 0 &&
      activeMrIds.length === 0
    ) {
      const validMrList = allMrList.filter((m) => m.mrId);
      setTempSelected(validMrList.map((m) => m.mrId));
    }
  }, [allMrList, showMrFilterModal]);

  const toggleMrInTemp = (mrId) => {
    setTempSelected((prev) =>
      prev.includes(mrId) ? prev.filter((id) => id !== mrId) : [...prev, mrId],
    );
  };
  const selectAllMrs = () => {
    const validIds = allMrList.filter((m) => m.mrId).map((m) => m.mrId);
    setTempSelected(validIds);
  };
  const clearAllMrs = () => setTempSelected([]);

  const saveMrFilter = async () => {
    setMrSaveLoading(true);
    try {
      const toSave = tempSelected.filter((id) => id && typeof id === "string");
      await axios.post(
        `${backendUrl}/api/reports/sales-and-salary/active-mrs`,
        { mrIds: toSave },
      );
      setActiveMrIds(toSave);
      setShowMrFilterModal(false);
      showToast("success", "MR filter saved successfully");
      fetchData(1, searchTerm, toSave);
    } catch {
      showToast("error", "Failed to save MR filter");
    } finally {
      setMrSaveLoading(false);
    }
  };

  const filteredMrList = allMrList.filter((m) =>
    m.mrName.toLowerCase().includes(mrSearchTerm.toLowerCase()),
  );

  const exportToExcel = async () => {
    if (!data.records.length) {
      showToast("warning", "No data found to export");
      return;
    }
    setExportLoading(true);
    try {
      const dateRange = getDateRange();
      const params = {
        dateFilter: selectedTab,
        search: searchTerm.trim() || undefined,
        export: "true",
      };
      if (selectedTab !== "all") {
        if (dateRange.startDate) params.startDate = dateRange.startDate;
        if (dateRange.endDate) params.endDate = dateRange.endDate;
        if (dateRange.period) params.period = dateRange.period;
      }
      if (activeMrIds.length > 0) params.mrIds = activeMrIds.join(",");
      const response = await axios.get(
        `${backendUrl}/api/reports/sales-and-salary/export`,
        { params, responseType: "blob" },
      );
      let filename = "sales-salary-ratio-report.xlsx";
      const cd = response.headers["content-disposition"];
      if (cd) {
        const match = cd.match(/filename="(.+)"/);
        if (match?.[1]) filename = match[1];
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Excel report downloaded successfully");
    } catch (error) {
      showToast(
        "error",
        error.response?.status === 404
          ? "No data found for the selected filters"
          : "Failed to export Excel report",
      );
    } finally {
      setExportLoading(false);
    }
  };

  const getActiveFilterDisplay = () =>
    getDateRange().displayDate || "Current Month";
  const fmt$ = (v) => {
    const n = parseFloat(v);
    return isNaN(n)
      ? "$0.00"
      : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtPct = (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return "0.00%";
    return `${n.toFixed(2)}%`;
  };
  const fmtRatio = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? "0.00" : n.toFixed(2);
  };

  const calcSalarySaleRatio = (salary, sale) =>
    sale === 0 ? 0 : (salary / sale) * 100;
  const calcExpenseSaleRatio = (totalExpense, sale) =>
    sale === 0 ? 0 : (totalExpense / sale) * 100;

  const getPerformanceInfo = (ratio) => {
    if (ratio <= 25)
      return {
        label: "Excellent",
        textColor: "text-green-600",
        bgColor: "bg-green-100",
      };
    if (ratio <= 50)
      return {
        label: "Positive",
        textColor: "text-blue-600",
        bgColor: "bg-blue-100",
      };
    if (ratio <= 100)
      return {
        label: "Usual",
        textColor: "text-amber-600",
        bgColor: "bg-amber-100",
      };
    return {
      label: "Negative",
      textColor: "text-red-600",
      bgColor: "bg-red-100",
    };
  };

  const renderPagination = () => {
    if (pagination.totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => handlePageChange(pagination.currentPage - 1)}
          disabled={pagination.currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          visiblePages.map((page, idx) => (
            <button
              key={idx}
              onClick={() => typeof page === "number" && handlePageChange(page)}
              disabled={page === "..."}
              className={`px-4 py-2 rounded text-sm ${page === "..." ? "bg-gray-200 cursor-not-allowed" : pagination.currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300 cursor-pointer"}`}
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
          disabled={pagination.currentPage === pagination.totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  const MobileRecordCard = ({ record, index }) => {
    const isExpanded = expandedMr === record.mrId;
    const salary = parseFloat(record.salary) || 0;
    const incentive = parseFloat(record.incentive) || 0;
    const allowance = parseFloat(record.allowance) || 0;
    const tourExpense = parseFloat(record.tourExpense) || 0;
    const tourAllowance = parseFloat(record.tourAllowance) || 0;
    const profit = parseFloat(record.profit) || 0;
    const sale = parseFloat(record.sale) || 0;
    const totalExpense = parseFloat(record.totalExpense) || 0;
    const salarySaleRatio = calcSalarySaleRatio(salary, sale);
    const expenseSaleRatio =
      parseFloat(record.expenseSaleRatio) ||
      calcExpenseSaleRatio(totalExpense, sale);
    const {
      label: perfLabel,
      textColor: perfText,
      bgColor: perfBg,
    } = getPerformanceInfo(salarySaleRatio);

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">
              #{getSerialNumber(index)}
            </span>
            <span className="font-semibold text-gray-800 capitalize text-sm">
              {record.mrName || "N/A"}
            </span>
          </div>
          <button
            onClick={() => toggleMrExpand(record.mrId)}
            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-px bg-gray-100">
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Sale ($)</div>
            <div className="font-bold text-gray-800 text-sm">{fmt$(sale)}</div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Profit ($)</div>
            <div className="font-semibold text-blue-600 text-sm">
              {fmt$(profit)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Net Salary ($)</div>
            <div className="font-semibold text-purple-600 text-sm">
              {fmt$(salary)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Incentive ($)</div>
            <div className="font-semibold text-green-600 text-sm">
              {fmt$(incentive)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">
              Total Expense ($)
            </div>
            <div className="font-bold text-gray-800 text-sm">
              {fmt$(totalExpense)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Salary/Sale (%)</div>
            <div
              className={`font-semibold text-sm ${salarySaleRatio > 100 ? "text-red-600" : "text-green-600"}`}
            >
              {fmtPct(salarySaleRatio)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">
              Expense/Sales (%)
            </div>
            <div
              className={`font-semibold text-sm ${expenseSaleRatio > 100 ? "text-red-600" : "text-orange-600"}`}
            >
              {fmtPct(expenseSaleRatio)}
            </div>
          </div>
          <div className="bg-white px-4 py-3">
            <div className="text-xs text-gray-500 mb-0.5">Performance</div>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-bold ${perfBg} ${perfText}`}
            >
              {perfLabel}
            </span>
          </div>
        </div>
        {isExpanded && (
          <div className="px-4 py-4 bg-blue-50 border-t border-blue-100">
            <h4 className="font-semibold text-gray-800 mb-3 text-sm">
              Expense Breakdown — {record.mrName}
            </h4>
            <div className="space-y-2">
              {/* ── CHANGED: Allowance now shows allowance + tourAllowance combined ── */}
              <div className="flex justify-between items-center py-1 border-b border-blue-200">
                <span className="text-xs text-gray-600">
                  Allowance ($){" "}
                  <span className="text-gray-400">
                    (Salary Allow. + Tour Allow.)
                  </span>
                </span>
                <span className="font-semibold text-yellow-600 text-sm">
                  {fmt$(allowance + tourAllowance)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-blue-200">
                <span className="text-xs text-gray-600">
                  Incentive ($){" "}
                  <span className="text-gray-400">(in salary)</span>
                </span>
                <span className="font-semibold text-green-600 text-sm">
                  {fmt$(incentive)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-blue-200">
                <span className="text-xs text-gray-600">Tour Expense ($)</span>
                <span className="font-semibold text-red-600 text-sm">
                  {fmt$(tourExpense)}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 pt-1 border-t-2 border-blue-300">
                <span className="text-xs font-bold text-gray-700">
                  Total Expense = Salary + Tour Allow. + Tour Exp.
                </span>
                <span className="font-bold text-gray-800 text-sm">
                  {fmt$(totalExpense)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const MrFilterModal = () => {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
        <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <UserCheck size={20} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">
                  Manage Active MRs
                </h2>
                <p className="text-xs text-gray-500">
                  Select MRs to include in reports
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowMrFilterModal(false)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700"
            >
              <X size={20} />
            </button>
          </div>
          <div className="px-6 pt-3">
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-xs text-green-700 font-medium">
                Showing only active MRs (isActive: true)
              </span>
            </div>
          </div>
          <div className="px-6 py-3 border-b border-gray-100 space-y-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search MR name..."
                value={mrSearchTerm}
                onChange={(e) => setMrSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {tempSelected.length} of {allMrList.length} MRs selected
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAllMrs}
                  className="text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={clearAllMrs}
                  className="text-xs px-3 py-1 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-3">
            {mrListLoading ? (
              <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : filteredMrList.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">
                No MRs found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredMrList.map((mr) => {
                  const isSelected = tempSelected.includes(mr.mrId);
                  return (
                    <button
                      key={mr.mrId}
                      onClick={() => toggleMrInTemp(mr.mrId)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${isSelected ? "bg-indigo-50 border border-indigo-200" : "bg-gray-50 border border-transparent hover:bg-gray-100"}`}
                    >
                      {isSelected ? (
                        <CheckSquare
                          size={18}
                          className="text-indigo-600 flex-shrink-0"
                        />
                      ) : (
                        <Square
                          size={18}
                          className="text-gray-400 flex-shrink-0"
                        />
                      )}
                      <span
                        className={`text-sm font-medium capitalize ${isSelected ? "text-indigo-700" : "text-gray-700"}`}
                      >
                        {mr.mrName}
                      </span>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                        Active
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
        
            <div className="flex gap-2">
              <button
                onClick={() => setShowMrFilterModal(false)}
                className="px-4 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveMrFilter}
                disabled={mrSaveLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-medium transition-colors"
              >
                {mrSaveLoading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={14} />
                    <span>Save Filter</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* MOBILE Header */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-3 bg-gray-200 border-gray-200 p-2 rounded-2xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <h1 className="text-base font-bold text-gray-800">
              Sales/Salary Ratio
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openMrFilterModal}
              className="relative flex items-center gap-1 bg-indigo-600 text-white px-3 py-1.5 rounded-full text-xs font-medium"
            >
              <UserCheck size={13} />
              <span>MRs</span>
              {activeMrIds.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {activeMrIds.length}
                </span>
              )}
            </button>
            <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium">
              Total: {pagination.totalRecords}
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP Header */}
      {!isMobileView && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Sales / Salary Ratio Report
              </h1>
              <p className="text-sm text-gray-600">
                Analyze sales performance against salary expenses
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                placeholder="Search MR Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={18}
              />
              {searchTerm && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={openMrFilterModal}
              className="relative flex items-center justify-center gap-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 px-4 py-2 rounded-lg font-medium transition-colors min-w-[140px]"
            >
              <UserCheck size={18} />
              <span>
                {activeMrIds.length > 0
                  ? `MR Filter (${activeMrIds.length})`
                  : "Filter MRs"}
              </span>
              {activeMrIds.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {activeMrIds.length}
                </span>
              )}
            </button>
            <button
              onClick={exportToExcel}
              disabled={exportLoading || !data.records.length}
              className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg shadow-md min-w-[140px]"
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

      {/* MOBILE Search */}
      {isMobileView && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search MR Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
          />
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={15}
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Date tabs */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-4"} rounded-xl shadow-md mb-4 border border-gray-200`}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {[
            { id: "currentMonth", label: "Current Month" },
            {
              id: "janToPreviousMonth",
              label: isMobileView ? "Jan - Prev" : "Jan - Previous Month",
            },
            { id: "custom", label: "Custom" },
            { id: "all", label: "All Records" },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`${isMobileView ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg cursor-pointer transition-colors ${selectedTab === id ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <Filter size={isMobileView ? 13 : 16} />
          <span>Active Filter: </span>
          <span className="font-medium">{getActiveFilterDisplay()}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-6 mb-6"}`}
      >
        {[
          {
            label: "Total Sales",
            value: fmt$(data.summary.totalSales),
            icon: (
              <DollarSign
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-green-500`}
              />
            ),
            border: "border-green-500",
          },
          {
            label: "Total Salary",
            value: fmt$(data.summary.totalSalary),
            icon: (
              <Users
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-blue-500`}
              />
            ),
            border: "border-blue-500",
          },
          {
            label: "Total Expense",
            value: fmt$(data.summary.totalExpense),
            icon: (
              <BarChart3
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-purple-500`}
              />
            ),
            border: "border-purple-500",
          },
          {
            label: "Expense/Sales Ratio",
            value: fmtRatio(data.summary.ratio),
            icon: (
              <Percent
                className={`${isMobileView ? "w-6 h-6" : "w-8 h-8"} text-orange-500`}
              />
            ),
            border: "border-orange-500",
          },
        ].map(({ label, value, icon, border }) => (
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
                  {loading ? (
                    <span className="block h-6 w-16 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    value
                  )}
                </p>
              </div>
              {icon}
            </div>
          </div>
        ))}
      </div>

      {/* Summary breakdown cards */}
      <div
        className={`grid gap-3 mb-4 ${isMobileView ? "grid-cols-2" : "grid-cols-1 md:grid-cols-4 gap-4 mb-6"}`}
      >
        <div className="bg-white p-3 rounded-lg shadow-md border-l-4 border-purple-400 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-600">
                Tour Expense
              </p>
              <p className="text-base font-bold text-purple-600">
                {fmt$(data.summary.totalTourExpense)}
              </p>
              <p className="text-[10px] text-gray-400">
                Petrol / Van / Province
              </p>
            </div>
            <BarChart3 className="w-6 h-6 text-purple-400" />
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-md border-l-4 border-indigo-400 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-600">
                Tour Allowance
              </p>
              <p className="text-base font-bold text-indigo-600">
                {fmt$(data.summary.totalTourAllowance)}
              </p>
              <p className="text-[10px] text-gray-400">
                Tour allowance category
              </p>
            </div>
            <DollarSign className="w-6 h-6 text-indigo-400" />
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-md border-l-4 border-amber-400 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-600">Allowance</p>
              <p className="text-base font-bold text-amber-600">
                {fmt$(data.summary.totalAllowance)}
              </p>
              <p className="text-[10px] text-gray-400">
                In Net Salary (display only)
              </p>
            </div>
            <DollarSign className="w-6 h-6 text-amber-400" />
          </div>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-md border-l-4 border-green-400 border border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs font-semibold text-gray-600">Incentive</p>
              <p className="text-base font-bold text-green-600">
                {fmt$(data.summary.totalIncentive)}
              </p>
              <p className="text-[10px] text-gray-400">
                In Net Salary (display only)
              </p>
            </div>
            <Percent className="w-6 h-6 text-green-400" />
          </div>
        </div>
      </div>


      {/* Performance legend */}
      {!isMobileView && (
        <div className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">
            Performance (Salary/Sale %):
          </span>
          {[
            {
              label: "Excellent",
              bg: "bg-green-100",
              text: "text-green-600",
              range: "0 – 25%",
            },
            {
              label: "Positive",
              bg: "bg-blue-100",
              text: "text-blue-600",
              range: "26 – 50%",
            },
            {
              label: "Usual",
              bg: "bg-amber-100",
              text: "text-amber-600",
              range: "51 – 100%",
            },
            {
              label: "Negative",
              bg: "bg-red-100",
              text: "text-red-600",
              range: "> 100%",
            },
          ].map(({ label, bg, text, range }) => (
            <span key={label} className="flex items-center gap-1">
              <span
                className={`px-2 py-0.5 rounded-full ${bg} ${text} font-semibold`}
              >
                {label}
              </span>
              <span>{range}</span>
            </span>
          ))}
        </div>
      )}

      {/* Mobile: Card List */}
      {isMobileView ? (
        <div className="space-y-3">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : data.records.length > 0 ? (
            data.records.map((record, index) => (
              <MobileRecordCard
                key={record.mrId}
                record={record}
                index={index}
              />
            ))
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 py-12 text-center">
              <BarChart3 className="mx-auto text-gray-400 mb-3" size={40} />
              <h3 className="text-base font-medium text-gray-900">
                No data found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {selectedTab === "custom" &&
                (!customDateRange.startDate || !customDateRange.endDate)
                  ? "Please select start and end dates"
                  : searchTerm
                    ? `No data found for "${searchTerm}"`
                    : "No sales salary ratio data available"}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── DESKTOP TABLE ── */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 text-sm font-medium">Sr.No</th>
                <th className="p-3 text-sm font-medium">MR Name</th>
                <th className="p-3 text-sm font-medium">Sale ($)</th>
                <th className="p-3 text-sm font-medium">Profit ($)</th>
                <th className="p-3 text-sm font-medium">Net Salary ($)</th>
                <th className="p-3 text-sm font-medium">Incentive ($)</th>
                {/* ── CHANGED: merged Allowance + Tour Allow into one column ── */}
                <th className="p-3 text-sm font-medium">Allowance ($)</th>
                <th className="p-3 text-sm font-medium">Tour Expense ($)</th>
                <th className="p-3 text-sm font-medium">Total Expense ($)</th>
                <th className="p-3 text-sm font-medium">Salary/Sale (%)</th>
                <th className="p-3 text-sm font-medium">Expense/Sales (%)</th>
                <th className="p-3 text-sm font-medium">Performance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  {/* ── CHANGED: colSpan 13 → 12 (one column removed) ── */}
                  <td colSpan={12} className="p-8 text-center">
                    <div className="flex flex-col items-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
                      <span className="text-gray-600">Loading data...</span>
                    </div>
                  </td>
                </tr>
              ) : data.records.length > 0 ? (
                data.records.map((record, index) => {
                  const salary = parseFloat(record.salary) || 0;
                  const incentive = parseFloat(record.incentive) || 0;
                  const allowance = parseFloat(record.allowance) || 0;
                  const tourExpense = parseFloat(record.tourExpense) || 0;
                  const tourAllowance = parseFloat(record.tourAllowance) || 0;
                  const profit = parseFloat(record.profit) || 0;
                  const sale = parseFloat(record.sale) || 0;
                  const totalExpense = parseFloat(record.totalExpense) || 0;
                  const salarySaleRatio = calcSalarySaleRatio(salary, sale);
                  const expenseSaleRatio =
                    parseFloat(record.expenseSaleRatio) ||
                    calcExpenseSaleRatio(totalExpense, sale);
                  const {
                    label: perfLabel,
                    textColor: perfText,
                    bgColor: perfBg,
                  } = getPerformanceInfo(salarySaleRatio);

                  return (
                    <tr
                      key={record.mrId}
                      className={`hover:bg-gray-50 ${index === data.records.length - 1 ? "" : "border-b"}`}
                    >
                      <td className="p-3 text-sm text-gray-600 font-medium">
                        {getSerialNumber(index)}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900 capitalize">
                        {record.mrName || "N/A"}
                      </td>
                      <td className="p-3 text-sm font-semibold text-gray-800">
                        {fmt$(sale)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-blue-600">
                        {fmt$(profit)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-purple-600">
                        {fmt$(salary)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-green-600">
                        {fmt$(incentive)}
                      </td>
                      {/* ── CHANGED: allowance + tourAllowance combined in one cell ── */}
                      <td className="p-3 text-sm font-semibold text-yellow-600">
                        {fmt$(allowance + tourAllowance)}
                      </td>
                      <td className="p-3 text-sm font-semibold text-red-600">
                        {fmt$(tourExpense)}
                      </td>
                      <td className="p-3 text-sm font-bold text-gray-900">
                        {fmt$(totalExpense)}
                      </td>
                      <td
                        className={`p-3 text-sm font-semibold ${salarySaleRatio > 100 ? "text-red-600" : "text-green-600"}`}
                      >
                        {fmtPct(salarySaleRatio)}
                      </td>
                      <td
                        className={`p-3 text-sm font-semibold ${expenseSaleRatio > 100 ? "text-red-600" : "text-orange-600"}`}
                      >
                        {fmtPct(expenseSaleRatio)}
                      </td>
                      <td className="p-3 text-sm font-semibold">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${perfBg} ${perfText}`}
                        >
                          {perfLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  {/* ── CHANGED: colSpan 13 → 12 (one column removed) ── */}
                  <td colSpan={12} className="p-8 text-center">
                    <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No data found
                    </h3>
                    <p className="text-gray-500 max-w-md mx-auto">
                      {selectedTab === "custom" &&
                      (!customDateRange.startDate || !customDateRange.endDate)
                        ? "Please select start and end dates"
                        : searchTerm
                          ? `No data found for "${searchTerm}"`
                          : "No sales salary ratio data available"}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {renderPagination()}

      {/* Custom Date Filter Modal */}
      {showCustomFilter && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                Custom Filter
              </h2>
              <button
                onClick={() => setShowCustomFilter(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <DatePicker
                  selected={customDateRange.startDate}
                  onChange={(d) => handleCustomDateChange("startDate", d)}
                  selectsStart
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="Start date"
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
                  onChange={(d) => handleCustomDateChange("endDate", d)}
                  selectsEnd
                  startDate={customDateRange.startDate}
                  endDate={customDateRange.endDate}
                  minDate={customDateRange.startDate}
                  className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholderText="End date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <button
                onClick={handleClearFilters}
                className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
              >
                Clear All
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCustomFilter(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustomFilter}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMrFilterModal && <MrFilterModal />}
    </div>
  );
};

export default SalesSalaryRatio;
