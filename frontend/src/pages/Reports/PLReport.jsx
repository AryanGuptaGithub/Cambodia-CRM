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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDateToReadable } from "../../utils/dateUtil";

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

  // Helper function to format date as YYYY-MM-DD without timezone issues
  const formatDateToYYYYMMDD = (date) => {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Get current date information
  const getCurrentDateInfo = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentMonthName = now.toLocaleString("default", { month: "long" });

    return { now, currentYear, currentMonth, currentMonthName };
  };

  // Get date ranges for tabs - using local date strings to avoid timezone issues
  const getDateRanges = () => {
    const { currentYear, currentMonth, currentMonthName } =
      getCurrentDateInfo();

    // Create dates using local date values to avoid timezone shift
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

  const fetchPLData = async (startDateStr = null, endDateStr = null) => {
    setLoading(true);
    try {
      const params = {};
      if (startDateStr) params.startDate = startDateStr;
      if (endDateStr) params.endDate = endDateStr;

      const response = await axios.get(
        `${backendUrl}/api/reports/profit-and-loss/summary`,
        { params },
      );
      if (response.data.success && response.data.data) {
        setData({
          summary: response.data.data || {
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            expenses: 0,
            netProfit: 0,
            profitMargin: 0,
          },
        });
      }
    } catch (error) {
      console.error("Error fetching P&L data:", error);
      showToast("error", "Failed to fetch P&L report data");
    } finally {
      setLoading(false);
    }
  };

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
          setData({
            summary: backendSummary,
          });
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
    // Use the pre-formatted date strings to avoid timezone issues
    fetchAllData(
      dateRanges.currentMonth.startStr,
      dateRanges.currentMonth.endStr,
    );
  }, []);

  useEffect(() => {
    if (activeTab === "custom" && (!customStartDate || !customEndDate)) {
      return;
    }
    const startStr = currentRange.startStr;
    const endStr = currentRange.endStr;
    if (startStr && endStr) {
      fetchAllData(startStr, endStr);
    }
  }, [activeTab, customStartDate, customEndDate]);

  const handleTabClick = (tab) => {
    if (tab === "custom") {
      setShowCustomModal(true);
    } else {
      setActiveTab(tab);
    }
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

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      {[
        {
          label: "Total Revenue",
          value: data.summary.revenue,
          color: "green",
          icon: TrendingUp,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
        {
          label: "COGS (Purchase Cost)",
          value: data.summary.cogs,
          color: "orange",
          icon: ShoppingBag,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
        {
          label: "Gross Profit",
          value: data.summary.grossProfit,
          color: "blue",
          icon: DollarSign,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
        {
          label: "Total Expenses",
          value: data.summary.expenses,
          color: "red",
          icon: TrendingDown,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
        {
          label: "Net Profit/Loss",
          value: data.summary.netProfit,
          color: data.summary.netProfit >= 0 ? "green" : "red",
          icon: data.summary.netProfit >= 0 ? TrendingUp : TrendingDown,
          format: (val) =>
            `$${typeof val === "number" ? Math.abs(val).toLocaleString() : "0"} ${val >= 0 ? "" : "(Loss)"}`,
        },
        {
          label: "Profit Margin",
          value: `${data.summary.profitMargin?.toFixed(2) || 0}%`,
          color: "indigo",
          icon: FileBarChart,
          format: (val) => val,
        },
        {
          label: "Profit from Sales",
          value: totals.totalProfitFromSales,
          color: "purple",
          icon: DollarSign,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
        {
          label: "Sales Revenue",
          value: totals.totalSalesRevenue,
          color: "teal",
          icon: TrendingUp,
          format: (val) =>
            `$${typeof val === "number" ? val.toLocaleString() : "0"}`,
        },
      ].map((card, index) => (
        <div
          key={index}
          className={`bg-white p-6 rounded-xl shadow-md border-l-4 ${
            card.color === "green"
              ? "border-green-500"
              : card.color === "red"
                ? "border-red-500"
                : card.color === "blue"
                  ? "border-blue-500"
                  : card.color === "orange"
                    ? "border-orange-500"
                    : card.color === "indigo"
                      ? "border-indigo-500"
                      : card.color === "purple"
                        ? "border-purple-500"
                        : "border-teal-500"
          }`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">{card.label}</div>
              <div
                className={`text-2xl font-bold ${
                  card.label === "Net Profit/Loss"
                    ? card.value >= 0
                      ? "text-green-700"
                      : "text-red-700"
                    : "text-gray-800"
                }`}
              >
                {loading ? (
                  <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                ) : (
                  card.format(card.value)
                )}
              </div>
              {card.label === "Profit Margin" &&
                data.summary.grossProfit > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    {(
                      (data.summary.netProfit / data.summary.grossProfit) *
                      100
                    ).toFixed(1)}
                    % of gross profit
                  </div>
                )}
            </div>
            <card.icon
              className={`w-8 h-8 ${
                card.color === "green"
                  ? "text-green-500"
                  : card.color === "red"
                    ? "text-red-500"
                    : card.color === "blue"
                      ? "text-blue-500"
                      : card.color === "orange"
                        ? "text-orange-500"
                        : card.color === "indigo"
                          ? "text-indigo-500"
                          : card.color === "purple"
                            ? "text-purple-500"
                            : "text-teal-500"
              }`}
            />
          </div>
        </div>
      ))}
    </div>
  );

  const renderMainTable = () => {
    return (
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
  };

  const renderProfitDetailsModal = () => {
    if (!showProfitDetailsModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Profit Details - {currentRange.label}
            </h2>
            <button
              onClick={() => setShowProfitDetailsModal(false)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-800 mb-2">
                Profit Calculation Method
              </h3>
              <p className="text-sm text-blue-600">
                Profit = (Selling Price - LC Price) × Quantity Sold
              </p>
            </div>

            <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
              <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
                <thead className="bg-gray-100 text-gray-700 border-b">
                  <tr>
                    <th className="p-3 text-sm font-medium">Invoice</th>
                    <th className="p-3 text-sm font-medium">Date</th>
                    <th className="p-3 text-sm font-medium">Customer</th>
                    <th className="p-3 text-sm font-medium">Total Revenue</th>
                    <th className="p-3 text-sm font-medium">Purchase Cost</th>
                    <th className="p-3 text-sm font-medium">Profit</th>
                    <th className="p-3 text-sm font-medium">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profitDetails.length > 0 ? (
                    profitDetails.map((item, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-800">
                          {item.invoiceNumber}
                        </td>
                        <td className="p-3 text-gray-600">
                          {formatDateToReadable(item.date)}
                        </td>
                        <td className="p-3 text-gray-800">{item.customer}</td>
                        <td className="p-3 font-semibold text-gray-700">
                          ${item.totalAmount?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-orange-600">
                          ${item.purchaseCost?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 font-semibold text-green-600">
                          ${item.profit?.toLocaleString() || 0}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                        colSpan="7"
                        className="text-center py-8 text-gray-500"
                      >
                        No sales profit records found
                      </td>
                    </tr>
                  )}
                </tbody>
                {profitDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="3" className="p-3 text-left">
                        Total:
                      </td>
                      <td className="p-3">
                        $
                        {profitDetails
                          .reduce(
                            (sum, item) => sum + (item.totalAmount || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td className="p-3 text-orange-600">
                        $
                        {profitDetails
                          .reduce(
                            (sum, item) => sum + (item.purchaseCost || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td className="p-3 text-green-600">
                        $
                        {profitDetails
                          .reduce((sum, item) => sum + (item.profit || 0), 0)
                          .toLocaleString()}
                      </td>
                      <td className="p-3">
                        {profitDetails.length > 0 &&
                        profitDetails.reduce(
                          (sum, item) => sum + (item.totalAmount || 0),
                          0,
                        ) > 0
                          ? (
                              (profitDetails.reduce(
                                (sum, item) => sum + (item.profit || 0),
                                0,
                              ) /
                                profitDetails.reduce(
                                  (sum, item) => sum + (item.totalAmount || 0),
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
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowProfitDetailsModal(false)}
              className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSalaryDetailsModal = () => {
    if (!showSalaryDetailsModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Salary Details - {currentRange.label}
            </h2>
            <button
              onClick={() => setShowSalaryDetailsModal(false)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
              <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
                <thead className="bg-gray-100 text-gray-700 border-b">
                  <tr>
                    <th className="p-3 text-sm font-medium">Date</th>
                    <th className="p-3 text-sm font-medium">Employee</th>
                    <th className="p-3 text-sm font-medium">
                      Basic Salary ($)
                    </th>
                    <th className="p-3 text-sm font-medium">Allowances ($)</th>
                    <th className="p-3 text-sm font-medium">Deductions ($)</th>
                    <th className="p-3 text-sm font-medium">Net Salary ($)</th>
                    <th className="p-3 text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryDetails.length > 0 ? (
                    salaryDetails.map((item) => (
                      <tr key={item._id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-600">
                          {formatDateToReadable(item.date)}
                        </td>
                        <td className="p-3 font-medium">
                          {item.description?.replace("Salary for ", "") ||
                            "N/A"}
                        </td>
                        <td className="p-3">
                          {item.details?.basicSalary?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-green-600">
                          {item.details?.allowances?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-red-600">
                          {item.details?.deductions?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 font-semibold">
                          {item.expense?.toLocaleString() || 0}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                        colSpan="7"
                        className="text-center py-8 text-gray-500"
                      >
                        No salary records found
                      </td>
                    </tr>
                  )}
                </tbody>
                {salaryDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="2" className="p-3 text-left">
                        Total:
                      </td>
                      <td className="p-3">
                        {salaryDetails
                          .reduce(
                            (sum, item) =>
                              sum + (item.details?.basicSalary || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td className="p-3 text-green-600">
                        {salaryDetails
                          .reduce(
                            (sum, item) =>
                              sum + (item.details?.allowances || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td className="p-3 text-red-600">
                        {salaryDetails
                          .reduce(
                            (sum, item) =>
                              sum + (item.details?.deductions || 0),
                            0,
                          )
                          .toLocaleString()}
                      </td>
                      <td className="p-3">
                        {salaryDetails
                          .reduce((sum, item) => sum + (item.expense || 0), 0)
                          .toLocaleString()}
                      </td>
                      <td className="p-3">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowSalaryDetailsModal(false)}
              className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderExpenseDetailsModal = () => {
    if (!showExpenseDetailsModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Expense Details - {currentRange.label}
            </h2>
            <button
              onClick={() => setShowExpenseDetailsModal(false)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
              <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
                <thead className="bg-gray-100 text-gray-700 border-b">
                  <tr>
                    <th className="p-3 text-sm font-medium">Date</th>
                    <th className="p-3 text-sm font-medium">Expense Type</th>
                    <th className="p-3 text-sm font-medium">Description</th>
                    <th className="p-3 text-sm font-medium">Amount ($)</th>
                    <th className="p-3 text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseDetails.length > 0 ? (
                    expenseDetails.map((item) => (
                      <tr key={item._id} className="border-b hover:bg-gray-50">
                        <td className="p-3 text-gray-600">
                          {formatDateToReadable(item.date)}
                        </td>
                        <td className="p-3 font-medium text-gray-800">
                          {item.title || "General Expense"}
                        </td>
                        <td className="p-3 text-gray-600">
                          {item.description || item.title || "N/A"}
                        </td>
                        <td className="p-3 font-semibold">
                          {item.expense?.toLocaleString() || 0}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
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
                        colSpan="5"
                        className="text-center py-8 text-gray-500"
                      >
                        No expense records found
                      </td>
                    </tr>
                  )}
                </tbody>
                {expenseDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="3" className="p-3 text-left">
                        Total Expenses:
                      </td>
                      <td className="p-3">
                        {expenseDetails
                          .reduce((sum, item) => sum + (item.expense || 0), 0)
                          .toLocaleString()}
                      </td>
                      <td className="p-3">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowExpenseDetailsModal(false)}
              className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomDateModal = () => {
    if (!showCustomModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">
              Select Custom Date Range
            </h2>
            <button
              onClick={() => setShowCustomModal(false)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholderText="Select end date"
                  dateFormat="yyyy-MM-dd"
                  isClearable
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowCustomModal(false)}
              className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomDateApply}
              disabled={!customStartDate || !customEndDate}
              className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer"
            >
              Apply Date Range
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-800">
            Profit & Loss Report
          </h1>
          <span className="text-sm text-gray-500">
            (Profit = Selling Price - LC Price)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} /> Export Excel
          </button>
        </div>
      </div>

      {renderSummaryCards()}

      <div className="bg-white p-6 rounded-xl shadow-md">
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { key: "currentMonth", label: dateRanges.currentMonth.label },
            { key: "janToPrevious", label: dateRanges.janToPrevious.label },
            { key: "custom", label: dateRanges.custom.label },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabClick(tab.key)}
              className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.key === "custom" && <Calendar size={16} />}
              {tab.label}
            </button>
          ))}
        </div>

        {tableLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-2">Loading report data...</span>
          </div>
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
