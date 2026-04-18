  import React, { useState, useEffect, useRef, useMemo } from "react";
  import { useNavigate, useOutletContext } from "react-router-dom";
  import { DashboardCards } from "./DashboardCards";
  import { SidePanel } from "./SidePanel";
  import { SubTabs } from "./SubTabs";
  import { SalesTable } from "./SalesTable";
  import { PayrollTable } from "./PayrollTable";
  import { ExpenseTable } from "./ExpenseTable";
  import ProductsModal from "./ProductModal";
  import AllMRsSalaryModal from "./AllMRSalaryModal";
  import { useDashboardData } from "./useDataboardData";
  import {
    getDateRanges,
    getPreviousMonthRanges,
    getStockDateRanges,
    formatCurrency,
  } from "./DashboardUtil";
  import axios from "axios";
  import { CombinedStockTable } from "./StockTable";
  import BatchDetailsModal from "./BatchDetailsModal";
  import { OverdueTable } from "./OverdueTable";
  import { CreditSaleTable } from "./CreditSaleTable";
  import { CompanyBalancePanel } from "./CompanyBalancePanel";
  import {
    Calendar,
    X,
    Users,
    Package,
    ShoppingCart,
    RotateCcw,
    DollarSign,
    CreditCard,
    AlertTriangle,
  } from "lucide-react";

  const backendUrl = import.meta.env.VITE_BACKEND_URL || "";

  // ─── SVG Area Chart for mobile ───────────────────────────────────────────────
  const SalesChart = ({ data = [] }) => {
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const W = 300,
      H = 120;
    const PAD = { top: 10, right: 8, bottom: 28, left: 48 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;
    const values = data.map((d) => d.value || 0);
    const maxVal = Math.max(...values, 1);
    const yTicks = [0, 1, 2, 3].map((i) => (maxVal / 3) * i);
    const xStep = chartW / Math.max(values.length - 1, 1);
    const points = values.map((v, i) => ({
      x: PAD.left + i * xStep,
      y: PAD.top + chartH - (v / maxVal) * chartH,
    }));
    const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
    const areaPath = `M ${points[0]?.x},${PAD.top + chartH} ${points.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${points[points.length - 1]?.x},${PAD.top + chartH} Z`;

    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 130 }}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, i) => {
          const y = PAD.top + chartH - (tick / maxVal) * chartH;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={PAD.left - 4}
                y={y + 4}
                textAnchor="end"
                fontSize="8"
                fill="#9ca3af"
              >
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}
        {points.length > 1 && <path d={areaPath} fill="url(#areaGrad)" />}
        {points.length > 1 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#14b8a6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill="#14b8a6" />
            <text
              x={p.x}
              y={H - 4}
              textAnchor="middle"
              fontSize="9"
              fill="#6b7280"
            >
              {DAYS[i % 7]}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  // ─── Mobile Dashboard ────────────────────────────────────────────────────────
  const MobileDashboard = ({
    salesData,
    stockData,
    expenseData,
    creditSaleTotal,
    overdueTableData,
    totalPayroll,
    companyBalance,
    loadingSalesData,
    onNavigate,
    onTabChange,
  }) => {
    const userName = localStorage.getItem("username") || "User";
    const weeklyData = useMemo(() => {
      const today = new Date();
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (6 - i));
        const value = salesData?.dailySales?.[i]?.amount || 0;
        return { day: d.getDay(), value };
      });
    }, [salesData]);

    const statCards = [
      {
        label: "Customers",
        value: salesData?.totalCustomers ?? 0,
        icon: Users,
        color: "#3b82f6",
        bg: "#eff6ff",
      },
      {
        label: "Stocks",
        value: stockData?.totalStockQty ?? 0,
        icon: Package,
        color: "#3b82f6",
        bg: "#eff6ff",
        sub: `Qty: ${(stockData?.totalStockQty ?? 0).toLocaleString()}`,
        subColor: "#ef4444",
        dot: true,
      },
      {
        label: "Sales",
        value: salesData?.totalSalesCount ?? 0,
        icon: ShoppingCart,
        color: "#3b82f6",
        bg: "#eff6ff",
        sub: `$ ${(salesData?.allSales ?? salesData?.monthlySales ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        subColor: "#3b82f6",
      },
      {
        label: "Returns",
        value: salesData?.totalReturns ?? 0,
        icon: RotateCcw,
        color: "#8b5cf6",
        bg: "#f5f3ff",
        sub: `$ ${(salesData?.totalReturnsValue ?? 0).toFixed(2)}`,
        subColor: "#8b5cf6",
      },
    ];

    const quickActions = [
      { label: "Customers", icon: Users, tab: "Customers" },
      { label: "New Sale", icon: ShoppingCart, tab: "Sales" },
      { label: "Products", icon: Package, tab: "Stock in Hands" },
      { label: "Returns", icon: RotateCcw, tab: "Returns" },
      { label: "Payroll", icon: DollarSign, tab: "Total Payroll" },
      { label: "Attendance", icon: Calendar, tab: "Attendance" },
      { label: "Stocks", icon: Package, tab: "Stock in Hands" },
      {
        label: "Cash & Credit",
        icon: CreditCard,
        tab: "Credit Sale Cash Not Receive",
      },
    ];
    const outOfStockCount = stockData?.outOfStockCount ?? 0;

    return (
      <div className="flex flex-col bg-[#F0F4FF] min-h-full pb-8">
        <div className="mx-4 mt-4 mb-4">
          <div className="bg-white rounded-2xl px-5 py-4 shadow-sm">
            <p className="text-base font-semibold text-gray-800">
              Hello 👋 Mr {userName}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              Here's your overview for today.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 mb-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="bg-white rounded-2xl p-4 shadow-sm relative"
              >
                {card.dot && (
                  <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-red-500 rounded-full" />
                )}
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: card.bg }}
                >
                  <Icon className="w-5 h-5" style={{ color: card.color }} />
                </div>
                <p
                  className="text-2xl font-bold text-gray-900"
                  style={{ lineHeight: 1.1 }}
                >
                  {loadingSalesData ? "…" : (card.value || 0).toLocaleString()}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
                {card.sub && (
                  <p
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: card.subColor || card.color }}
                  >
                    {card.sub}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {outOfStockCount > 0 && (
          <div className="mx-4 mb-4">
            <div className="bg-red-50 border-l-4 border-red-400 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">
                  ⚠️ Stock Alert
                </p>
                <p className="text-xs text-red-600">
                  {outOfStockCount} product(s) out of stock
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="mx-4">
          <p className="text-base font-bold text-gray-800 mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => onTabChange(action.tab)}
                  className="bg-white rounded-2xl px-5 py-5 flex flex-col items-center gap-3 shadow-sm active:bg-gray-50 transition-colors"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: "#EEF2FF" }}
                  >
                    <Icon className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-sm font-semibold text-gray-800">
                    {action.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 mt-6">
          <span className="text-sm text-gray-500">Sync Status:</span>
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          <span className="text-sm text-green-600 font-medium">Synced</span>
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // DATE FILTER MODAL
  // CRITICAL: defined OUTSIDE Dashboard so it is never re-mounted on re-render.
  // All values come in as props — no closure over Dashboard state.
  // ─────────────────────────────────────────────────────────────────────────────
  const DateFilterModal = ({
    isOpen,
    cardLabel,
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    onApply,
    onClose,
  }) => {
    if (!isOpen || !cardLabel) return null;

    return (
      // Backdrop — click does nothing (no onClose here intentionally)
      <div
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal card — all clicks stay inside */}
        <div
          className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md mx-auto"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
              <span className="truncate">Custom Date – {cardLabel}</span>
            </h3>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onStartDateChange(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onFocus={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onEndDateChange(e.target.value);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onApply();
                }}
                disabled={!startDate || !endDate}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md cursor-pointer ${
                  !startDate || !endDate
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Apply Filter
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Main Dashboard ────────────────────────────────────────────────────────────
  const Dashboard = () => {
    const navigate = useNavigate();
    let isMobile = false;
    try {
      const ctx = useOutletContext();
      isMobile = ctx?.isMobile ?? false;
    } catch (_) {}

    const {
      loading,
      mrList,
      allTeams,
      previousMonthLabel,
      payrollData,
      totalPayroll,
      payrollYTDTotal,
      salesData,
      outstandingData,
      expenseData,
      stockData,
      fetchSalesBySubTab,
      fetchOutstandingBySubTab,
      setSalesData,
      setOutstandingData,
      setMrList,
    } = useDashboardData();

    const [activeTab, setActiveTab] = useState("Sales");
    const [previousActiveTab, setPreviousActiveTab] = useState("Sales");
    const [activeSalesSubTab, setActiveSalesSubTab] = useState("Today");
    const [activeExpenseSubTab, setActiveExpenseSubTab] = useState("Month");
    const [activePayrollSubTab, setActivePayrollSubTab] = useState("Prev Month");
    const [activeStockSubTab, setActiveStockSubTab] = useState("all");
    const [activePendingCollectionSubTab, setActivePendingCollectionSubTab] =
      useState("Month");
    const [isSalesMonthOnly, setIsSalesMonthOnly] = useState(false);

    const [salesTableData, setSalesTableData] = useState([]);
    const [loadingSalesData, setLoadingSalesData] = useState(false);
    const [expenseTableData, setExpenseTableData] = useState([]);
    const [loadingExpenseData, setLoadingExpenseData] = useState(false);
    const [payrollTableData, setPayrollTableData] = useState([]);
    const [loadingPayrollData, setLoadingPayrollData] = useState(false);
    const [pendingCollectionData, setPendingCollectionData] = useState([]);
    const [loadingPendingCollectionData, setLoadingPendingCollectionData] =
      useState(false);
    const [overdueTableData, setOverdueTableData] = useState([]);
    const [loadingOverdueData, setLoadingOverdueData] = useState(false);
    const [creditSaleTableData, setCreditSaleTableData] = useState([]);
    const [loadingCreditSaleData, setLoadingCreditSaleData] = useState(false);

    const [currentPayrollTotal, setCurrentPayrollTotal] = useState(0);
    const [currentYTDTotal, setCurrentYTDTotal] = useState(0);
    const [expenseSummary, setExpenseSummary] = useState({
      monthlyExpense: 0,
      yearExpense: 0,
      allExpense: 0,
      customExpenseTotal: 0,
    });
    const [companyBalance, setCompanyBalance] = useState(0);
    const [companyBalanceAccounts, setCompanyBalanceAccounts] = useState([]);
    const [loadingCompanyBalance, setLoadingCompanyBalance] = useState(false);
    const [creditSaleTotal, setCreditSaleTotal] = useState(0);

    const [showBatchModal, setShowBatchModal] = useState(false);
    const [selectedProductName, setSelectedProductName] = useState("");
    const [selectedBatches, setSelectedBatches] = useState([]);
    const [showProductsModal, setShowProductsModal] = useState(false);
    const [selectedMRProducts, setSelectedMRProducts] = useState([]);
    const [selectedMRName, setSelectedMRName] = useState("");
    const [showAllMRsModal, setShowAllMRsModal] = useState(false);
    const [allMRsWithSalary, setAllMRsWithSalary] = useState([]);
    const [showAllMRsInSidePanel, setShowAllMRsInSidePanel] = useState(false);
    const [sidePanelCurrentPage, setSidePanelCurrentPage] = useState(1);

    const dateRanges = useMemo(() => getDateRanges(), []);
    const prevMonthRanges = useMemo(() => getPreviousMonthRanges(), []);
    const [user] = useState({ name: "User", role: "User", initials: "U" });

    // ======================= DATE FILTER STATE =======================
    const [showDateFilter, setShowDateFilter] = useState(false);
    const [selectedCardForFilter, setSelectedCardForFilter] = useState(null);
    const [modalStartDate, setModalStartDate] = useState("");
    const [modalEndDate, setModalEndDate] = useState("");
    const [isCustomDateActive, setIsCustomDateActive] = useState({
      "Total Sales": false,
      Outstanding: false,
      "Total Expense": false,
      "Total Payroll": false,
      "Pending Collection": false,
    });
    const [customDateRanges, setCustomDateRanges] = useState({
      "Total Sales": { start: "", end: "" },
      Outstanding: { start: "", end: "" },
      "Total Expense": { start: "", end: "" },
      "Total Payroll": { start: "", end: "" },
      "Pending Collection": { start: "", end: "" },
    });

    const handleDateFilterClick = (cardId, e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setSelectedCardForFilter(cardId);
      const saved = customDateRanges[cardId];
      if (saved?.start && saved?.end) {
        setModalStartDate(saved.start);
        setModalEndDate(saved.end);
      } else {
        const today = new Date();
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        setModalStartDate(firstDay.toISOString().split("T")[0]);
        setModalEndDate(lastDay.toISOString().split("T")[0]);
      }
      setShowDateFilter(true);
    };

    const handleCloseDateFilter = () => {
      setShowDateFilter(false);
      setSelectedCardForFilter(null);
    };

    const handleApplyDateFilter = () => {
      if (!selectedCardForFilter || !modalStartDate || !modalEndDate) return;
      if (modalStartDate > modalEndDate) {
        alert("Start date cannot be after end date");
        return;
      }
      setCustomDateRanges((prev) => ({
        ...prev,
        [selectedCardForFilter]: { start: modalStartDate, end: modalEndDate },
      }));
      setIsCustomDateActive((prev) => ({
        ...prev,
        [selectedCardForFilter]: true,
      }));
      switch (selectedCardForFilter) {
        case "Total Sales":
          setActiveSalesSubTab("Custom");
          fetchSalesTableData("Custom", modalStartDate, modalEndDate);
          break;
        case "Total Expense":
          setActiveExpenseSubTab("Custom");
          fetchExpenseTableData("Custom", modalStartDate, modalEndDate);
          break;
        case "Total Payroll":
          setActivePayrollSubTab("Custom");
          fetchPayrollTableData("Custom", modalStartDate, modalEndDate);
          break;
        case "Pending Collection":
          setActivePendingCollectionSubTab("Custom");
          fetchCreditSaleTableData("Custom", modalStartDate, modalEndDate);
          break;
        default:
          break;
      }
      setShowDateFilter(false);
      setSelectedCardForFilter(null);
    };

    const handleClearDateFilter = (cardId, e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setIsCustomDateActive((prev) => ({ ...prev, [cardId]: false }));
      setCustomDateRanges((prev) => ({
        ...prev,
        [cardId]: { start: "", end: "" },
      }));
      switch (cardId) {
        case "Total Sales":
          setActiveSalesSubTab("Today");
          fetchSalesTableData("Today");
          break;
        case "Total Expense":
          setActiveExpenseSubTab("Month");
          fetchExpenseTableData("Month");
          break;
        case "Total Payroll":
          setActivePayrollSubTab("Prev Month");
          fetchPayrollTableData("Prev Month");
          break;
        case "Pending Collection":
          setActivePendingCollectionSubTab("Month");
          fetchCreditSaleTableData("Month");
          break;
        default:
          break;
      }
    };
    // ======================= END DATE FILTER STATE =======================

    const fetchSalesTableData = async (period, startDateParam, endDateParam) => {
      try {
        setLoadingSalesData(true);
        const periodMap = {
          Today: "Today",
          Month: "Month",
          Year: "Year",
          All: "All",
          Custom: "custom",
        };
        const params = { period: periodMap[period] || period };
        if (period === "Custom") {
          params.startDate =
            startDateParam || customDateRanges["Total Sales"]?.start;
          params.endDate = endDateParam || customDateRanges["Total Sales"]?.end;
        }
        const response = await axios.get(`${backendUrl}/api/sales/table-data`, {
          params,
        });
        const data = response.data.success ? response.data.data : [];
        setSalesTableData(data);
        const total = data.reduce((s, sale) => s + (sale.amount || 0), 0);
        setSalesData((prev) => {
          switch (period) {
            case "Today":
              return { ...prev, todaySales: total };
            case "Month":
              return { ...prev, monthlySales: total };
            case "Year":
              return { ...prev, yearSales: total };
            case "All":
              return { ...prev, allSales: total };
            case "Custom":
              return { ...prev, customSales: total };
            default:
              return prev;
          }
        });
      } catch (error) {
        console.error(error);
        setSalesTableData([]);
      } finally {
        setLoadingSalesData(false);
      }
    };

    const fetchExpenseTableData = async (period, s, e) => {
      try {
        setLoadingExpenseData(true);
        const params = {
          period:
            { Month: "Month", Year: "Year", All: "All", Custom: "custom" }[
              period
            ] || period,
        };
        if (period === "Custom") {
          params.startDate = s || customDateRanges["Total Expense"]?.start;
          params.endDate = e || customDateRanges["Total Expense"]?.end;
        }
        const res = await axios.get(`${backendUrl}/api/expenses`, { params });
        const raw = res.data.data || [];
        setExpenseTableData(
          raw.map((ex) => ({
            ...ex,
            category: ex.category?.category || ex.category || "Unknown",
          })),
        );
        const total = raw.reduce((sum, ex) => sum + (ex.amount || 0), 0);
        setExpenseSummary((prev) => {
          switch (period) {
            case "Month":
              return { ...prev, monthlyExpense: total };
            case "Year":
              return { ...prev, yearExpense: total };
            case "All":
              return { ...prev, allExpense: total };
            case "Custom":
              return { ...prev, customExpenseTotal: total };
            default:
              return prev;
          }
        });
      } catch (err) {
        console.error(err);
        setExpenseTableData([]);
      } finally {
        setLoadingExpenseData(false);
      }
    };

    const fetchPayrollTableData = async (period, s, e) => {
      try {
        setLoadingPayrollData(true);
        let params = {};
        if (period === "Custom") {
          params.period = "custom";
          params.startDate = s || customDateRanges["Total Payroll"]?.start;
          params.endDate = e || customDateRanges["Total Payroll"]?.end;
        } else if (period !== "All") {
          const cur = new Date();
          if (period === "Prev Month") {
            let pm = cur.getMonth() - 1,
              y = cur.getFullYear();
            if (pm < 0) {
              pm = 11;
              y--;
            }
            params.period = `${y}-${String(pm + 1).padStart(2, "0")}`;
          } else if (period === "YTD") params.period = `${cur.getFullYear()}-YTD`;
          else if (period === "Overdue") params.period = "overdue";
          else if (period === "Unreceive_Payment") params.period = "unreceived";
        }
        const res = await axios.get(`${backendUrl}/api/hrm/payroll`, { params });
        const payrolls = res.data?.data || [];
        const total = payrolls.reduce((sum, i) => sum + (i.netSalary || 0), 0);
        setPayrollTableData(payrolls);
        if (["Prev Month", "Custom", "Overdue", "All"].includes(period))
          setCurrentPayrollTotal(total);
        else if (["YTD", "Unreceive_Payment"].includes(period))
          setCurrentYTDTotal(total);
      } catch (err) {
        console.error(err);
        setPayrollTableData([]);
      } finally {
        setLoadingPayrollData(false);
      }
    };

    const fetchOverdueTableData = async () => {
      try {
        setLoadingOverdueData(true);
        const res = await axios.get(`${backendUrl}/api/overdue`, {
          params: { currentDate: new Date().toISOString() },
        });
        if (res.data.success) {
          setOverdueTableData(
            res.data.data.map((inv) => ({
              ...inv,
              overdueAmount:
                inv.dueAmount > 0
                  ? inv.dueAmount
                  : Math.max(0, inv.totalAmount - (inv.paidAmount || 0)),
            })),
          );
          if (salesData)
            setSalesData((prev) => ({
              ...prev,
              overdueAmount: res.data.totalOverdueAmount || 0,
            }));
        }
      } catch (err) {
        console.error(err);
        setOverdueTableData([]);
      } finally {
        setLoadingOverdueData(false);
      }
    };

    const fetchCreditSaleTableData = async (period = "Today", s, e) => {
      try {
        setLoadingCreditSaleData(true);
        let params = {};
        if (period === "Custom") {
          params.period = "custom";
          params.startDate = s || customDateRanges["Pending Collection"]?.start;
          params.endDate = e || customDateRanges["Pending Collection"]?.end;
        } else if (period !== "All") {
          const bp = { Today: "today", Month: "month", Year: "year" }[period];
          if (bp) params.period = bp;
        }
        const res = await axios.get(
          `${backendUrl}/api/sales/credit-sale-not-received`,
          { params },
        );
        if (res.data.success) {
          setCreditSaleTableData(res.data.data || []);
          setCreditSaleTotal(parseFloat(res.data.totalAmount) || 0);
        } else {
          setCreditSaleTableData([]);
          setCreditSaleTotal(0);
        }
      } catch (err) {
        console.error(err);
        setCreditSaleTableData([]);
        setCreditSaleTotal(0);
      } finally {
        setLoadingCreditSaleData(false);
      }
    };

    const fetchPendingCollectionData = async () => {
      try {
        setLoadingPendingCollectionData(true);
        const res = await axios.get(
          `${backendUrl}/api/sales/pending-collection-today`,
        );
        setPendingCollectionData(res.data.success ? res.data.data || [] : []);
      } catch (err) {
        console.error(err);
        setPendingCollectionData([]);
      } finally {
        setLoadingPendingCollectionData(false);
      }
    };

    const fetchCompanyBalance = async () => {
      try {
        setLoadingCompanyBalance(true);
        const res = await axios.get(`${backendUrl}/api/accounts/balance`);
        if (res.data.success) {
          setCompanyBalance(res.data.totalBalance || 0);
          setCompanyBalanceAccounts(
            (res.data.accounts || []).map((a) => ({
              ...a,
              transactions: a.transactions || [],
            })),
          );
        }
      } catch (err) {
        console.error(err);
        try {
          const r2 = await axios.get(`${backendUrl}/api/accounts/destinations`);
          const dst = r2.data?.data || r2.data || [];
          setCompanyBalance(dst.reduce((s, a) => s + (a.totalAmount || 0), 0));
          setCompanyBalanceAccounts(
            dst.map((d) => ({
              _id: d._id,
              name: d.name,
              code: d.code || "",
              totalAmount: d.totalAmount || 0,
              transactionCount: 0,
              transactions: [],
            })),
          );
        } catch {
          setCompanyBalance(0);
          setCompanyBalanceAccounts([]);
        }
      } finally {
        setLoadingCompanyBalance(false);
      }
    };

    const handleViewProducts = (n, p) => {
      setSelectedMRName(n);
      setSelectedMRProducts(p);
      setShowProductsModal(true);
    };
    const handleViewInvoices = (n, i) => {
      setSelectedMRName(n);
      setSelectedMRProducts(i);
      setShowProductsModal(true);
    };
    const handleViewExpenseDetails = (n, d) => {
      setSelectedMRName(n);
      setSelectedMRProducts(d);
      setShowProductsModal(true);
    };
    const handleViewStockDetails = (n, b) => {
      setSelectedProductName(n);
      setSelectedBatches(b);
      setShowBatchModal(true);
    };

    const handleViewInvoiceDetails = (invoice) => {
      const details = [
        `Invoice: ${invoice.invoiceNumber || "N/A"}`,
        `Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`,
        `Customer: ${invoice.customerName || "N/A"}`,
        `Total: $${formatCurrency(invoice.totalAmount || 0)}`,
        `Paid: $${formatCurrency(invoice.paidAmount || 0)}`,
        `Due: $${formatCurrency(invoice.dueAmount || 0)}`,
      ];
      setSelectedMRName(`Invoice: ${invoice.invoiceNumber || "Details"}`);
      setSelectedMRProducts(details);
      setShowProductsModal(true);
    };

    const handleViewCreditSaleDetails = (invoice) => {
      const details = [
        `Invoice: ${invoice.invoiceNumber || "N/A"}`,
        `Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`,
        `MR: ${invoice.mrName || "N/A"}`,
        `Customer: ${invoice.customerName || "N/A"}`,
        `Total: $${formatCurrency(invoice.totalAmount || 0)}`,
        `Due: $${formatCurrency(invoice.dueAmount || 0)}`,
      ];
      setSelectedMRName(`Credit Sale: ${invoice.invoiceNumber || "Details"}`);
      setSelectedMRProducts(details);
      setShowProductsModal(true);
    };

    const handleCurrentMonthSaleClick = () => {
      setActiveTab("Sales");
      setActiveSalesSubTab("Month");
      setIsSalesMonthOnly(true);
      fetchSalesTableData("Month");
    };

    const handleParentTabChange = (newTab) => {
      setPreviousActiveTab(activeTab);
      setActiveTab(newTab);
      if (newTab !== "Sales") setIsSalesMonthOnly(false);
      switch (newTab) {
        case "Sales":
          fetchSalesTableData(
            isCustomDateActive["Total Sales"] ? "Custom" : "Today",
          );
          break;
        case "Total Payroll":
          fetchPayrollTableData(
            isCustomDateActive["Total Payroll"] ? "Custom" : "Prev Month",
          );
          break;
        case "Expenses":
          fetchExpenseTableData(
            isCustomDateActive["Total Expense"] ? "Custom" : "Month",
          );
          break;
        case "Overdue":
          fetchOverdueTableData();
          break;
        case "Credit Sale Cash Not Receive":
          fetchCreditSaleTableData(
            isCustomDateActive["Pending Collection"]
              ? "Custom"
              : activePendingCollectionSubTab,
          );
          break;
        case "Pending Collection":
          fetchPendingCollectionData();
          break;
        case "Company Balance":
          fetchCompanyBalance();
          break;
        default:
          break;
      }
    };

    const handleSalesSubTabChange = (subTab) => {
      setActiveSalesSubTab(subTab);
      if (isSalesMonthOnly && subTab !== "Month") setIsSalesMonthOnly(false);
      if (activeTab === "Sales") {
        if (subTab === "Custom") {
          if (!isCustomDateActive["Total Sales"]) return;
          fetchSalesTableData("Custom");
        } else {
          setIsCustomDateActive((p) => ({ ...p, "Total Sales": false }));
          fetchSalesTableData(subTab);
        }
      }
    };

    const handleExpenseSubTabChange = (subTab) => {
      setActiveExpenseSubTab(subTab);
      if (activeTab === "Expenses") {
        if (subTab === "Custom") {
          if (!isCustomDateActive["Total Expense"]) return;
          fetchExpenseTableData("Custom");
        } else {
          setIsCustomDateActive((p) => ({ ...p, "Total Expense": false }));
          fetchExpenseTableData(subTab);
        }
      }
    };

    const handlePayrollSubTabChange = (subTab) => {
      setActivePayrollSubTab(subTab);
      if (activeTab === "Total Payroll") {
        if (subTab === "Custom") {
          if (!isCustomDateActive["Total Payroll"]) return;
          fetchPayrollTableData("Custom");
        } else {
          setIsCustomDateActive((p) => ({ ...p, "Total Payroll": false }));
          fetchPayrollTableData(subTab);
        }
      }
    };

    const handlePendingCollectionSubTabChange = (subTab) => {
      setActivePendingCollectionSubTab(subTab);
      if (activeTab === "Credit Sale Cash Not Receive") {
        if (subTab === "Custom") {
          if (!isCustomDateActive["Pending Collection"]) return;
          fetchCreditSaleTableData("Custom");
        } else {
          setIsCustomDateActive((p) => ({ ...p, "Pending Collection": false }));
          fetchCreditSaleTableData(subTab);
        }
      }
    };

    const handleStockSubTabChange = (subTab) => setActiveStockSubTab(subTab);

    useEffect(() => {
      const init = async () => {
        await Promise.all([
          fetchSalesTableData("Today"),
          fetchExpenseTableData("Month"),
          fetchCreditSaleTableData("Month"),
          fetchCompanyBalance(),
        ]);
        setCurrentPayrollTotal(totalPayroll);
        setCurrentYTDTotal(payrollYTDTotal);
      };
      init();
    }, []);

    useEffect(() => {
      setCurrentPayrollTotal(totalPayroll);
      setCurrentYTDTotal(payrollYTDTotal);
    }, [totalPayroll, payrollYTDTotal]);

    const renderMainTable = () => {
      const fmtRange = (s, e) => {
        const sd = new Date(s),
          ed = new Date(e);
        const opts = { day: "numeric", month: "short" };
        if (sd.getFullYear() !== ed.getFullYear()) opts.year = "numeric";
        return `${sd.toLocaleDateString("en-US", opts)} – ${ed.toLocaleDateString("en-US", opts)}`;
      };
      const getCustomText = (t) =>
        isCustomDateActive[t] && customDateRanges[t]?.start
          ? fmtRange(customDateRanges[t].start, customDateRanges[t].end)
          : null;

      if (activeTab === "Company Balance") return <CompanyBalancePanel />;
      switch (activeTab) {
        case "Sales":
          return (
            <SalesTable
              salesTableData={salesTableData}
              loadingSalesData={loadingSalesData}
              activeSalesSubTab={activeSalesSubTab}
              dateRanges={dateRanges}
              onViewProducts={handleViewProducts}
              isCustomDateActive={isCustomDateActive["Total Sales"]}
              customDateRange={getCustomText("Total Sales")}
            />
          );
        case "Total Payroll":
          return (
            <PayrollTable
              payrollData={payrollTableData}
              loading={loadingPayrollData}
              activePayrollSubTab={activePayrollSubTab}
              prevMonthRanges={prevMonthRanges}
              isCustomDateActive={isCustomDateActive["Total Payroll"]}
              customDateRange={getCustomText("Total Payroll")}
            />
          );
        case "Expenses":
          return (
            <ExpenseTable
              expenseTableData={expenseTableData}
              loadingExpenseData={loadingExpenseData}
              activeExpenseSubTab={activeExpenseSubTab}
              dateRanges={dateRanges}
              onViewExpenseDetails={handleViewExpenseDetails}
              isCustomDateActive={isCustomDateActive["Total Expense"]}
              customDateRange={getCustomText("Total Expense")}
            />
          );
        case "Stock in Hands":
          return (
            <CombinedStockTable
              apiBaseUrl={backendUrl}
              activeTab={activeStockSubTab}
              onTabChange={handleStockSubTabChange}
            />
          );
        case "Overdue":
          return (
            <OverdueTable
              overdueData={overdueTableData}
              loading={loadingOverdueData}
              onViewDetails={handleViewInvoiceDetails}
            />
          );
        case "Credit Sale Cash Not Receive":
          return (
            <CreditSaleTable
              creditSaleData={creditSaleTableData}
              loading={loadingCreditSaleData}
              onViewDetails={handleViewCreditSaleDetails}
              activePendingCollectionSubTab={activePendingCollectionSubTab}
            />
          );
        default:
          return (
            <div className="p-4 text-sm text-gray-500">Table for {activeTab}</div>
          );
      }
    };

    const mergedExpenseData = {
      ...(expenseData || {}),
      monthlyExpense: expenseSummary.monthlyExpense,
      yearExpense: expenseSummary.yearExpense,
      allExpense: expenseSummary.allExpense,
      customExpenseTotal: expenseSummary.customExpenseTotal,
    };

    if (isMobile) {
      return (
        <>
          <MobileDashboard
            salesData={salesData}
            stockData={stockData}
            expenseData={mergedExpenseData}
            creditSaleTotal={creditSaleTotal}
            overdueTableData={overdueTableData}
            totalPayroll={currentPayrollTotal}
            companyBalance={companyBalance}
            loadingSalesData={loadingSalesData}
            onNavigate={(route) => navigate(route)}
            onTabChange={handleParentTabChange}
          />
          <ProductsModal
            showModal={showProductsModal}
            onClose={() => setShowProductsModal(false)}
            selectedMRName={selectedMRName}
            selectedMRProducts={selectedMRProducts}
            activeTab={activeTab}
          />
          <BatchDetailsModal
            showModal={showBatchModal}
            onClose={() => setShowBatchModal(false)}
            productName={selectedProductName}
            batches={selectedBatches}
          />
        </>
      );
    }

    return (
      <div className="p-3 sm:p-4 md:p-6">
        <div className="w-full overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <DashboardCards
            activeTab={activeTab}
            onTabChange={handleParentTabChange}
            salesData={salesData}
            outstandingData={outstandingData}
            stockData={stockData}
            expenseData={mergedExpenseData}
            totalPayroll={currentPayrollTotal}
            payrollYTDTotal={currentYTDTotal}
            companyBalance={companyBalance}
            activeSalesSubTab={activeSalesSubTab}
            activeOutstandingSubTab="Today"
            activeExpenseSubTab={activeExpenseSubTab}
            activePayrollSubTab={activePayrollSubTab}
            activeStockSubTab={activeStockSubTab}
            activePendingCollectionSubTab={activePendingCollectionSubTab}
            creditSaleTotal={creditSaleTotal}
            onSalesSubTabChange={handleSalesSubTabChange}
            onExpenseSubTabChange={handleExpenseSubTabChange}
            onPayrollSubTabChange={handlePayrollSubTabChange}
            onOutstandingSubTabChange={() => {}}
            onStockSubTabChange={handleStockSubTabChange}
            onPendingCollectionSubTabChange={handlePendingCollectionSubTabChange}
            dateRanges={dateRanges}
            prevMonthRanges={prevMonthRanges}
            overdueTableData={overdueTableData}
            creditSaleTableData={creditSaleTableData}
            onDateFilterClick={handleDateFilterClick}
            onClearDateFilter={handleClearDateFilter}
            isCustomDateActive={isCustomDateActive}
            customDateRanges={customDateRanges}
            onCurrentMonthSaleClick={handleCurrentMonthSaleClick}
          />
        </div>

        {/* DateFilterModal is now a stable external component — never re-mounts */}
        <DateFilterModal
          isOpen={showDateFilter}
          cardLabel={selectedCardForFilter}
          startDate={modalStartDate}
          endDate={modalEndDate}
          onStartDateChange={setModalStartDate}
          onEndDateChange={setModalEndDate}
          onApply={handleApplyDateFilter}
          onClose={handleCloseDateFilter}
        />

        <div className="w-full overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <SubTabs
            activeTab={activeTab}
            activeSalesSubTab={activeSalesSubTab}
            activeExpenseSubTab={activeExpenseSubTab}
            activePayrollSubTab={activePayrollSubTab}
            activeOutstandingSubTab="Today"
            activeStockSubTab={activeStockSubTab}
            activePendingCollectionSubTab={activePendingCollectionSubTab}
            onSalesSubTabChange={handleSalesSubTabChange}
            onExpenseSubTabChange={handleExpenseSubTabChange}
            onPayrollSubTabChange={handlePayrollSubTabChange}
            onOutstandingSubTabChange={() => {}}
            onStockSubTabChange={handleStockSubTabChange}
            onPendingCollectionSubTabChange={handlePendingCollectionSubTabChange}
            dateRanges={dateRanges}
            prevMonthRanges={prevMonthRanges}
            isCustomDateActive={isCustomDateActive}
            customDateRanges={customDateRanges}
            onDateFilterClick={handleDateFilterClick}
            forceSalesMonthOnly={isSalesMonthOnly}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mt-2">
          <div className="order-1 lg:order-2 lg:col-span-2 min-w-0 overflow-x-auto">
            {renderMainTable()}
          </div>
          <div className="order-2 lg:order-1 lg:col-span-1 min-w-0">
            <SidePanel
              activeTab={activeTab}
              showAllMRsInSidePanel={showAllMRsInSidePanel}
              onPanelIconClick={() => {}}
              sidePanelCurrentPage={sidePanelCurrentPage}
              onSidePanelPageChange={(page) => setSidePanelCurrentPage(page)}
              salesTableData={salesTableData}
              loadingSalesData={loadingSalesData}
              outstandingTableData={[]}
              loadingOutstandingData={false}
              expenseTableData={expenseTableData}
              loadingExpenseData={loadingExpenseData}
              stockData={stockData}
              expenseData={mergedExpenseData}
              mrList={mrList}
              onViewProducts={handleViewProducts}
              onViewInvoices={handleViewInvoices}
              onViewExpenseDetails={handleViewExpenseDetails}
              overdueTableData={overdueTableData}
              loadingOverdueData={loadingOverdueData}
              pendingCollectionData={pendingCollectionData || []}
              loadingPendingCollectionData={loadingPendingCollectionData || false}
              creditSaleTableData={creditSaleTableData || []}
              loadingCreditSaleData={loadingCreditSaleData || false}
              companyBalanceAccounts={companyBalanceAccounts}
              loadingCompanyBalance={loadingCompanyBalance}
            />
          </div>
        </div>

        <ProductsModal
          showModal={showProductsModal}
          onClose={() => setShowProductsModal(false)}
          selectedMRName={selectedMRName}
          selectedMRProducts={selectedMRProducts}
          activeTab={activeTab}
        />
        <AllMRsSalaryModal
          showModal={showAllMRsModal}
          onClose={() => setShowAllMRsModal(false)}
          previousMonthLabel={previousMonthLabel}
          allMRsWithSalary={allMRsWithSalary}
        />
        <BatchDetailsModal
          showModal={showBatchModal}
          onClose={() => setShowBatchModal(false)}
          productName={selectedProductName}
          batches={selectedBatches}
        />
      </div>
    );
  };

  export default Dashboard;
