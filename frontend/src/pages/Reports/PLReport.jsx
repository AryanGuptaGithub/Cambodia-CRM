import React, { useState, useEffect } from "react";
import {
  Download,
  FileBarChart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  X,
  Users,
  CreditCard,
  ShoppingBag,
  Menu,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDateToReadable } from "../../utils/dateUtil";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const PLReport = () => {
  const [data, setData] = useState({
    summary: {
      revenue: 0,
      cogs: 0,
      grossProfit: 0,
      expenses: 0,
      netProfit: 0,
      profitMargin: 0,
    },
  });

  const [tableData, setTableData] = useState([]);
  const [salaryDetails, setSalaryDetails] = useState([]);
  const [expenseDetails, setExpenseDetails] = useState([]);
  const [profitDetails, setProfitDetails] = useState([]);
  const [totals, setTotals] = useState({
    totalSalesRevenue: 0,
    totalProfitFromSales: 0,
    totalExpense: 0,
    totalSalaryExpense: 0,
    totalOtherExpense: 0,
    totalProfit: 0,
    totalLoss: 0,
    grossProfit: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("currentMonth");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [showSalaryDetailsModal, setShowSalaryDetailsModal] = useState(false);
  const [showExpenseDetailsModal, setShowExpenseDetailsModal] = useState(false);
  const [showProfitDetailsModal, setShowProfitDetailsModal] = useState(false);

  // ── Mobile detection ───────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedCard, setExpandedCard] = useState(null);

  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── Date helpers ───────────────────────────────────────────────────────────
  const formatDateToYYYYMMDD = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getCurrentDateInfo = () => {
    const now = new Date();
    return {
      now,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth(),
      currentMonthName: now.toLocaleString("default", { month: "long" }),
    };
  };

  const getDateRanges = () => {
    const { currentYear, currentMonth, currentMonthName } =
      getCurrentDateInfo();
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const janToPreviousStart = new Date(currentYear, 0, 1);
    const janToPreviousEnd = new Date(currentYear, currentMonth, 0);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const previousMonthName =
      currentMonth > 0 ? monthNames[currentMonth - 1] : "Dec";

    return {
      currentMonth: {
        start: currentMonthStart,
        end: currentMonthEnd,
        startStr: formatDateToYYYYMMDD(currentMonthStart),
        endStr: formatDateToYYYYMMDD(currentMonthEnd),
        label: currentMonthName,
      },
      janToPrevious: {
        start: janToPreviousStart,
        end: janToPreviousEnd,
        startStr: formatDateToYYYYMMDD(janToPreviousStart),
        endStr: formatDateToYYYYMMDD(janToPreviousEnd),
        label: `Jan - ${previousMonthName}`,
      },
      custom: {
        start: customStartDate,
        end: customEndDate,
        startStr: formatDateToYYYYMMDD(customStartDate),
        endStr: formatDateToYYYYMMDD(customEndDate),
        label:
          customStartDate && customEndDate
            ? `${formatDateToReadable(customStartDate)} - ${formatDateToReadable(customEndDate)}`
            : "Custom Date",
      },
    };
  };

  const dateRanges = getDateRanges();
  const currentRange = dateRanges[activeTab];

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchTableData = async (startDateStr = null, endDateStr = null) => {
    setTableLoading(true);
    try {
      const params = {};
      if (startDateStr) params.startDate = startDateStr;
      if (endDateStr) params.endDate = endDateStr;

      const response = await axios.get(
        `${backendUrl}/api/reports/profit-and-loss`,
        { params },
      );

      if (response.data.success) {
        const responseData = response.data.data || [];
        const details = response.data.details || {};
        const backendTotals = response.data.totals || {};
        const backendSummary = response.data.summary || {};

        setTableData(responseData);
        setSalaryDetails(details.salaryDetails || []);
        setExpenseDetails(details.expenseDetails || []);
        setProfitDetails(details.profitDetails || []);

        if (backendSummary.revenue !== undefined) {
          setData({ summary: backendSummary });
        }

        setTotals({
          totalSalesRevenue: backendTotals.totalSalesRevenue || 0,
          totalProfitFromSales: backendTotals.totalProfitFromSales || 0,
          grossProfit: backendTotals.grossProfit || 0,
          totalExpense: backendTotals.totalExpense || 0,
          totalSalaryExpense: backendTotals.payrollExpense || 0,
          totalOtherExpense: backendTotals.otherExpense || 0,
          totalProfit: backendTotals.totalProfit || 0,
          totalLoss: backendTotals.totalLoss || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching table data:", error);
      showToast("error", "Failed to fetch table data");
      setTableData([]);
      setSalaryDetails([]);
      setExpenseDetails([]);
      setProfitDetails([]);
      setTotals({
        totalSalesRevenue: 0,
        totalProfitFromSales: 0,
        grossProfit: 0,
        totalExpense: 0,
        totalSalaryExpense: 0,
        totalOtherExpense: 0,
        totalProfit: 0,
        totalLoss: 0,
      });
    } finally {
      setTableLoading(false);
    }
  };

  const fetchAllData = (startDateStr = null, endDateStr = null) => {
    fetchTableData(startDateStr, endDateStr);
  };

  useEffect(() => {
    fetchAllData(
      dateRanges.currentMonth.startStr,
      dateRanges.currentMonth.endStr,
    );
  }, []);

  useEffect(() => {
    if (activeTab === "custom" && (!customStartDate || !customEndDate)) return;
    const startStr = currentRange.startStr;
    const endStr = currentRange.endStr;
    if (startStr && endStr) fetchAllData(startStr, endStr);
  }, [activeTab, customStartDate, customEndDate]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTabClick = (tab) => {
    if (tab === "custom") setShowCustomModal(true);
    else setActiveTab(tab);
  };

  const handleCustomDateApply = () => {
    if (!customStartDate || !customEndDate) {
      showToast("error", "Please select both start and end dates");
      return;
    }
    if (customStartDate > customEndDate) {
      showToast("error", "Start date cannot be after end date");
      return;
    }
    setActiveTab("custom");
    setShowCustomModal(false);
  };

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  // ── Summary cards config ───────────────────────────────────────────────────
  const summaryCardConfig = [
    {
      label: "Total Revenue",
      value: data.summary.revenue,
      color: "green",
      icon: TrendingUp,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
    {
      label: "COGS (Purchase Cost)",
      value: data.summary.cogs,
      color: "orange",
      icon: ShoppingBag,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
    {
      label: "Gross Profit",
      value: data.summary.grossProfit,
      color: "blue",
      icon: DollarSign,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
    {
      label: "Total Expenses",
      value: data.summary.expenses,
      color: "red",
      icon: TrendingDown,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
    {
      label: "Net Profit/Loss",
      value: data.summary.netProfit,
      color: data.summary.netProfit >= 0 ? "green" : "red",
      icon: data.summary.netProfit >= 0 ? TrendingUp : TrendingDown,
      format: (v) =>
        `$${typeof v === "number" ? Math.abs(v).toLocaleString() : "0"} ${v >= 0 ? "" : "(Loss)"}`,
    },
    {
      label: "Profit Margin",
      value: `${data.summary.profitMargin?.toFixed(2) || 0}%`,
      color: "indigo",
      icon: FileBarChart,
      format: (v) => v,
    },
    {
      label: "Profit from Sales",
      value: totals.totalProfitFromSales,
      color: "purple",
      icon: DollarSign,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
    {
      label: "Sales Revenue",
      value: totals.totalSalesRevenue,
      color: "teal",
      icon: TrendingUp,
      format: (v) => `$${typeof v === "number" ? v.toLocaleString() : "0"}`,
    },
  ];

  const colorMap = {
    green: {
      border: "border-green-500",
      text: "text-green-500",
      bg: "bg-green-50",
    },
    red: { border: "border-red-500", text: "text-red-500", bg: "bg-red-50" },
    blue: {
      border: "border-blue-500",
      text: "text-blue-500",
      bg: "bg-blue-50",
    },
    orange: {
      border: "border-orange-500",
      text: "text-orange-500",
      bg: "bg-orange-50",
    },
    indigo: {
      border: "border-indigo-500",
      text: "text-indigo-500",
      bg: "bg-indigo-50",
    },
    purple: {
      border: "border-purple-500",
      text: "text-purple-500",
      bg: "bg-purple-50",
    },
    teal: {
      border: "border-teal-500",
      text: "text-teal-500",
      bg: "bg-teal-50",
    },
  };

  // ── Render summary cards ───────────────────────────────────────────────────
  const renderSummaryCards = () => (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-6">
      {summaryCardConfig.map((card, index) => {
        const colors = colorMap[card.color] || colorMap.teal;
        const Icon = card.icon;
        return (
          <div
            key={index}
            className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md border-l-4 border border-gray-200 ${colors.border}`}
          >
            <div className="flex justify-between items-center">
              <div className="min-w-0 flex-1">
                <div
                  className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600 truncate`}
                >
                  {card.label}
                </div>
                <div
                  className={`${isMobileView ? "text-base" : "text-2xl"} font-bold ${
                    card.label === "Net Profit/Loss"
                      ? card.value >= 0
                        ? "text-green-700"
                        : "text-red-700"
                      : "text-gray-800"
                  }`}
                >
                  {loading ? (
                    <div
                      className={`${isMobileView ? "h-5 w-14" : "h-8 w-20"} bg-gray-200 rounded animate-pulse`}
                    ></div>
                  ) : (
                    card.format(card.value)
                  )}
                </div>
                {card.label === "Profit Margin" &&
                  data.summary.grossProfit > 0 &&
                  !isMobileView && (
                    <div className="text-xs text-gray-500 mt-1">
                      {(
                        (data.summary.netProfit / data.summary.grossProfit) *
                        100
                      ).toFixed(1)}
                      % of gross profit
                    </div>
                  )}
              </div>
              <Icon
                className={`flex-shrink-0 ml-2 ${isMobileView ? "w-5 h-5" : "w-8 h-8"} ${colors.text}`}
              />
            </div>
          </div>
        );
      })}
    </div>
  );

  // ── Mobile summary row (inside the period card) ────────────────────────────
  const renderMobilePeriodCard = () => {
    const netProfitPositive = totals.totalProfit > 0;
    const netLoss = totals.totalLoss > 0;

    const rows = [
      {
        label: "Sales Revenue",
        value: `$${totals.totalSalesRevenue?.toLocaleString() || 0}`,
        color: "text-gray-700",
        action:
          profitDetails.length > 0
            ? () => setShowProfitDetailsModal(true)
            : null,
        actionIcon: ShoppingBag,
        actionColor: "text-purple-600",
      },
      {
        label: "Profit from Sales",
        value: `$${totals.totalProfitFromSales?.toLocaleString() || 0}`,
        color: "text-purple-700",
      },
      {
        label: "Gross Profit",
        value: `$${totals.grossProfit?.toLocaleString() || 0}`,
        color: "text-blue-700",
      },
      {
        label: "Salary Expense",
        value: `$${totals.totalSalaryExpense?.toLocaleString() || 0}`,
        color: "text-gray-700",
        action:
          salaryDetails.length > 0
            ? () => setShowSalaryDetailsModal(true)
            : null,
        actionIcon: Users,
        actionColor: "text-blue-600",
      },
      {
        label: "Other Expenses",
        value: `$${totals.totalOtherExpense?.toLocaleString() || 0}`,
        color: "text-gray-700",
        action:
          expenseDetails.length > 0
            ? () => setShowExpenseDetailsModal(true)
            : null,
        actionIcon: CreditCard,
        actionColor: "text-green-600",
      },
      {
        label: "Total Expense",
        value: `$${totals.totalExpense?.toLocaleString() || 0}`,
        color: "text-gray-700",
      },
      {
        label: "Net Profit/Loss",
        value: netProfitPositive
          ? `+$${totals.totalProfit.toLocaleString()}`
          : netLoss
            ? `-$${totals.totalLoss.toLocaleString()}`
            : "$0",
        color: netProfitPositive
          ? "text-green-700"
          : netLoss
            ? "text-red-700"
            : "text-gray-700",
        bold: true,
      },
    ];

    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <span className="text-sm font-semibold text-gray-700">
            {currentRange.label}
          </span>
        </div>
        <div className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-xs text-gray-500">{row.label}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm font-${row.bold ? "bold" : "semibold"} ${row.color}`}
                >
                  {row.value}
                </span>
                {row.action && row.actionIcon && (
                  <button
                    onClick={row.action}
                    className={`${row.actionColor} p-1 rounded hover:bg-gray-100 transition-colors`}
                  >
                    <row.actionIcon size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Desktop table ──────────────────────────────────────────────────────────
  const renderMainTable = () => (
    <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
      <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
        <thead className="bg-gray-100 text-gray-700">
          <tr>
            <th className="p-3 text-sm font-medium">Period</th>
            <th className="p-3 text-sm font-medium">Sales Revenue($)</th>
            <th className="p-3 text-sm font-medium">Profit from Sales($)</th>
            <th className="p-3 text-sm font-medium">Gross Profit($)</th>
            <th className="p-3 text-sm font-medium">Salary Expense($)</th>
            <th className="p-3 text-sm font-medium">Other Expenses($)</th>
            <th className="p-3 text-sm font-medium">Total Expense($)</th>
            <th className="p-3 text-sm font-medium">Net Profit/Loss($)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="hover:bg-gray-50 border-t">
            <td className="p-3 text-gray-600 font-medium">
              {currentRange.label}
            </td>
            <td className="p-3">
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-700">
                  {totals.totalSalesRevenue?.toLocaleString() || 0}
                </span>
                <button
                  onClick={() => setShowProfitDetailsModal(true)}
                  className="text-purple-600 hover:text-purple-800 transition-colors p-1 rounded hover:bg-purple-50 cursor-pointer"
                  title="View Profit Details"
                  disabled={profitDetails.length === 0}
                >
                  <ShoppingBag size={16} />
                </button>
              </div>
            </td>
            <td className="p-3">
              <span className="text-purple-700 font-medium">
                {totals.totalProfitFromSales?.toLocaleString() || 0}
              </span>
            </td>
            <td className="p-3">
              <span className="text-blue-700 font-medium">
                {totals.grossProfit?.toLocaleString() || 0}
              </span>
            </td>
            <td className="p-3">
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-700">
                  {totals.totalSalaryExpense?.toLocaleString() || 0}
                </span>
                <button
                  onClick={() => setShowSalaryDetailsModal(true)}
                  className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 cursor-pointer"
                  title="View Salary Details"
                  disabled={salaryDetails.length === 0}
                >
                  <Users size={16} />
                </button>
              </div>
            </td>
            <td className="p-3">
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-700">
                  {totals.totalOtherExpense?.toLocaleString() || 0}
                </span>
                <button
                  onClick={() => setShowExpenseDetailsModal(true)}
                  className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50 cursor-pointer"
                  title="View Expense Details"
                  disabled={expenseDetails.length === 0}
                >
                  <CreditCard size={16} />
                </button>
              </div>
            </td>
            <td className="p-3">
              <span className="text-gray-700 font-medium">
                {totals.totalExpense?.toLocaleString() || 0}
              </span>
            </td>
            <td className="p-3">
              <span
                className={`font-medium ${
                  totals.totalProfit > 0
                    ? "text-green-700"
                    : totals.totalLoss > 0
                      ? "text-red-700"
                      : "text-gray-700"
                }`}
              >
                {totals.totalProfit > 0
                  ? `+$${totals.totalProfit.toLocaleString()}`
                  : totals.totalLoss > 0
                    ? `-$${totals.totalLoss.toLocaleString()}`
                    : "$0"}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  // ── Modals ─────────────────────────────────────────────────────────────────
  const ModalWrapper = ({ show, onClose, title, children }) => {
    if (!show) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-3 md:p-0">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
            <h2 className="text-base md:text-xl font-semibold text-gray-800">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 cursor-pointer p-1"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 md:p-6">{children}</div>
          <div className="flex justify-end p-4 md:p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderProfitDetailsModal = () => (
    <ModalWrapper
      show={showProfitDetailsModal}
      onClose={() => setShowProfitDetailsModal(false)}
      title={`Profit Details - ${currentRange.label}`}
    >
      <div className="mb-4 p-3 md:p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-blue-800 mb-1 text-sm md:text-base">
          Profit Calculation Method
        </h3>
        <p className="text-xs md:text-sm text-blue-600">
          Profit = (Selling Price - LC Price) × Quantity Sold
        </p>
      </div>
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Invoice
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Date
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Customer</th>
              )}
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Revenue
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Purchase Cost</th>
              )}
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Profit
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {profitDetails.length > 0 ? (
              profitDetails.map((item, index) => (
                <tr key={index} className="border-b hover:bg-gray-50">
                  <td className="p-2 md:p-3 font-medium text-gray-800 text-xs md:text-sm">
                    {item.invoiceNumber}
                  </td>
                  <td className="p-2 md:p-3 text-gray-600 text-xs md:text-sm">
                    {formatDateToReadable(item.date)}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-gray-800 text-sm">
                      {item.customer}
                    </td>
                  )}
                  <td className="p-2 md:p-3 font-semibold text-gray-700 text-xs md:text-sm">
                    ${item.totalAmount?.toLocaleString() || 0}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-orange-600 text-sm">
                      ${item.purchaseCost?.toLocaleString() || 0}
                    </td>
                  )}
                  <td className="p-2 md:p-3 font-semibold text-green-600 text-xs md:text-sm">
                    ${item.profit?.toLocaleString() || 0}
                  </td>
                  <td className="p-2 md:p-3">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        item.margin >= 30
                          ? "bg-green-100 text-green-800"
                          : item.margin >= 15
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                      }`}
                    >
                      {item.margin?.toFixed(1) || 0}%
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={isMobileView ? 5 : 7}
                  className="text-center py-8 text-gray-500 text-sm"
                >
                  No sales profit records found
                </td>
              </tr>
            )}
          </tbody>
          {profitDetails.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-semibold text-xs md:text-sm">
                <td
                  colSpan={isMobileView ? 2 : 3}
                  className="p-2 md:p-3 text-left"
                >
                  Total:
                </td>
                <td className="p-2 md:p-3">
                  $
                  {profitDetails
                    .reduce((s, i) => s + (i.totalAmount || 0), 0)
                    .toLocaleString()}
                </td>
                {!isMobileView && (
                  <td className="p-3 text-orange-600">
                    $
                    {profitDetails
                      .reduce((s, i) => s + (i.purchaseCost || 0), 0)
                      .toLocaleString()}
                  </td>
                )}
                <td className="p-2 md:p-3 text-green-600">
                  $
                  {profitDetails
                    .reduce((s, i) => s + (i.profit || 0), 0)
                    .toLocaleString()}
                </td>
                <td className="p-2 md:p-3">
                  {profitDetails.reduce((s, i) => s + (i.totalAmount || 0), 0) >
                  0
                    ? (
                        (profitDetails.reduce(
                          (s, i) => s + (i.profit || 0),
                          0,
                        ) /
                          profitDetails.reduce(
                            (s, i) => s + (i.totalAmount || 0),
                            0,
                          )) *
                        100
                      ).toFixed(1) + "%"
                    : "0%"}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ModalWrapper>
  );

  const renderSalaryDetailsModal = () => (
    <ModalWrapper
      show={showSalaryDetailsModal}
      onClose={() => setShowSalaryDetailsModal(false)}
      title={`Salary Details - ${currentRange.label}`}
    >
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Date
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Employee
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Basic Salary ($)</th>
              )}
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Allowances ($)</th>
              )}
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Deductions ($)</th>
              )}
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Net Salary ($)
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {salaryDetails.length > 0 ? (
              salaryDetails.map((item) => (
                <tr key={item._id} className="border-b hover:bg-gray-50">
                  <td className="p-2 md:p-3 text-gray-600 text-xs md:text-sm">
                    {formatDateToReadable(item.date)}
                  </td>
                  <td className="p-2 md:p-3 font-medium text-xs md:text-sm">
                    {item.description?.replace("Salary for ", "") || "N/A"}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-sm">
                      {item.details?.basicSalary?.toLocaleString() || 0}
                    </td>
                  )}
                  {!isMobileView && (
                    <td className="p-3 text-green-600 text-sm">
                      {item.details?.allowances?.toLocaleString() || 0}
                    </td>
                  )}
                  {!isMobileView && (
                    <td className="p-3 text-red-600 text-sm">
                      {item.details?.deductions?.toLocaleString() || 0}
                    </td>
                  )}
                  <td className="p-2 md:p-3 font-semibold text-xs md:text-sm">
                    {item.expense?.toLocaleString() || 0}
                  </td>
                  <td className="p-2 md:p-3">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        item.status === "paid"
                          ? "bg-green-100 text-green-800"
                          : item.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {item.status || "N/A"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={isMobileView ? 4 : 7}
                  className="text-center py-8 text-gray-500 text-sm"
                >
                  No salary records found
                </td>
              </tr>
            )}
          </tbody>
          {salaryDetails.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-semibold text-xs md:text-sm">
                <td colSpan={2} className="p-2 md:p-3 text-left">
                  Total:
                </td>
                {!isMobileView && (
                  <td className="p-3">
                    {salaryDetails
                      .reduce((s, i) => s + (i.details?.basicSalary || 0), 0)
                      .toLocaleString()}
                  </td>
                )}
                {!isMobileView && (
                  <td className="p-3 text-green-600">
                    {salaryDetails
                      .reduce((s, i) => s + (i.details?.allowances || 0), 0)
                      .toLocaleString()}
                  </td>
                )}
                {!isMobileView && (
                  <td className="p-3 text-red-600">
                    {salaryDetails
                      .reduce((s, i) => s + (i.details?.deductions || 0), 0)
                      .toLocaleString()}
                  </td>
                )}
                <td className="p-2 md:p-3">
                  {salaryDetails
                    .reduce((s, i) => s + (i.expense || 0), 0)
                    .toLocaleString()}
                </td>
                <td className="p-2 md:p-3">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ModalWrapper>
  );

  const renderExpenseDetailsModal = () => (
    <ModalWrapper
      show={showExpenseDetailsModal}
      onClose={() => setShowExpenseDetailsModal(false)}
      title={`Expense Details - ${currentRange.label}`}
    >
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Date
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Expense Type
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Description</th>
              )}
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Amount ($)
              </th>
              <th className="p-2 md:p-3 text-xs md:text-sm font-medium">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {expenseDetails.length > 0 ? (
              expenseDetails.map((item) => (
                <tr key={item._id} className="border-b hover:bg-gray-50">
                  <td className="p-2 md:p-3 text-gray-600 text-xs md:text-sm">
                    {formatDateToReadable(item.date)}
                  </td>
                  <td className="p-2 md:p-3 font-medium text-gray-800 text-xs md:text-sm">
                    {item.title || "General Expense"}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-gray-600 text-sm">
                      {item.description || item.title || "N/A"}
                    </td>
                  )}
                  <td className="p-2 md:p-3 font-semibold text-xs md:text-sm">
                    {item.expense?.toLocaleString() || 0}
                  </td>
                  <td className="p-2 md:p-3">
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        item.status === "paid"
                          ? "bg-green-100 text-green-800"
                          : item.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : item.status === "approved"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {item.status || "N/A"}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={isMobileView ? 4 : 5}
                  className="text-center py-8 text-gray-500 text-sm"
                >
                  No expense records found
                </td>
              </tr>
            )}
          </tbody>
          {expenseDetails.length > 0 && (
            <tfoot>
              <tr className="bg-gray-100 font-semibold text-xs md:text-sm">
                <td
                  colSpan={isMobileView ? 2 : 3}
                  className="p-2 md:p-3 text-left"
                >
                  Total Expenses:
                </td>
                <td className="p-2 md:p-3">
                  {expenseDetails
                    .reduce((s, i) => s + (i.expense || 0), 0)
                    .toLocaleString()}
                </td>
                <td className="p-2 md:p-3">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </ModalWrapper>
  );

  const renderCustomDateModal = () => {
    if (!showCustomModal) return null;
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-3 md:p-0">
        <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-200">
            <h2 className="text-base md:text-lg font-semibold text-gray-800">
              Select Custom Date Range
            </h2>
            <button
              onClick={() => setShowCustomModal(false)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4 md:p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <DatePicker
                  selected={customStartDate}
                  onChange={setCustomStartDate}
                  selectsStart
                  startDate={customStartDate}
                  endDate={customEndDate}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholderText="Select start date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <DatePicker
                  selected={customEndDate}
                  onChange={setCustomEndDate}
                  selectsEnd
                  startDate={customStartDate}
                  endDate={customEndDate}
                  minDate={customStartDate}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholderText="Select end date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 p-4 md:p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowCustomModal(false)}
              className="px-4 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomDateApply}
              disabled={!customStartDate || !customEndDate}
              className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer text-sm"
            >
              Apply Date Range
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`${isMobileView ? "p-3 pb-6" : "p-6"}`}>
      {/* Mobile Sidebar */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView ? (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <FileBarChart size={18} className="text-indigo-600" />
            <div>
              <h1 className="text-base font-bold text-gray-800 leading-tight">
                P&L Report
              </h1>
              <p className="text-xs text-gray-500">
                Profit = Selling - LC Price
              </p>
            </div>
          </div>
          {/* Export is HIDDEN on mobile as requested */}
        </div>
      ) : (
        /* ── DESKTOP Header ── */
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">
              Profit & Loss Report
            </h1>
            <span className="text-sm text-gray-500">
              (Profit = Selling Price - LC Price)
            </span>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} /> Export Excel
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {renderSummaryCards()}

      {/* ── Tabs + Table Section ── */}
      <div
        className={`bg-white ${isMobileView ? "p-3" : "p-6"} rounded-xl shadow-md`}
      >
        {/* Tabs */}
        <div
          className={`flex ${isMobileView ? "gap-1 mb-4 flex-wrap" : "border-b border-gray-200 mb-6"}`}
        >
          {[
            { key: "currentMonth", label: dateRanges.currentMonth.label },
            { key: "janToPrevious", label: dateRanges.janToPrevious.label },
            { key: "custom", label: dateRanges.custom.label },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={
                isMobileView
                  ? `flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      activeTab === tab.key
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`
                  : `px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                      activeTab === tab.key
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`
              }
            >
              {tab.key === "custom" && (
                <Calendar size={isMobileView ? 12 : 16} />
              )}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {tableLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-2 text-sm text-gray-600">
              Loading report data...
            </span>
          </div>
        ) : isMobileView ? (
          renderMobilePeriodCard()
        ) : (
          renderMainTable()
        )}
      </div>

      {renderCustomDateModal()}
      {renderProfitDetailsModal()}
      {renderSalaryDetailsModal()}
      {renderExpenseDetailsModal()}
    </div>
  );
};

export default PLReport;
