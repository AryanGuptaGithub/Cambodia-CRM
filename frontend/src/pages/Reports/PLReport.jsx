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
  const [totals, setTotals] = useState({
    totalAmount: 0,
    totalProfit: 0,
    totalExpense: 0,
    totalSalaryExpense: 0,
    totalOtherExpense: 0,
    totalLoss: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("currentMonth");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [showSalaryDetailsModal, setShowSalaryDetailsModal] = useState(false);
  const [showExpenseDetailsModal, setShowExpenseDetailsModal] = useState(false);

  // Get current date information
  const getCurrentDateInfo = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentMonthName = now.toLocaleString("default", { month: "long" });

    return { now, currentYear, currentMonth, currentMonthName };
  };

  // Get date ranges for tabs
  const getDateRanges = () => {
    const { currentYear, currentMonth, currentMonthName } = getCurrentDateInfo();

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);

    const janToPreviousStart = new Date(currentYear, 0, 1);
    const janToPreviousEnd = new Date(currentYear, currentMonth, 0);

    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const previousMonthName = currentMonth > 0 ? monthNames[currentMonth - 1] : "Dec";

    return {
      currentMonth: {
        start: currentMonthStart,
        end: currentMonthEnd,
        label: currentMonthName,
      },
      janToPrevious: {
        start: janToPreviousStart,
        end: janToPreviousEnd,
        label: `Jan - ${previousMonthName}`,
      },
      custom: {
        start: customStartDate,
        end: customEndDate,
        label: customStartDate && customEndDate
          ? `${formatDateToReadable(customStartDate)} - ${formatDateToReadable(customEndDate)}`
          : "Custom Date",
      },
    };
  };

  const dateRanges = getDateRanges();
  const currentRange = dateRanges[activeTab];

  const fetchPLData = async (startDate = null, endDate = null) => {
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate.toISOString().split("T")[0];
      if (endDate) params.endDate = endDate.toISOString().split("T")[0];

      const response = await axios.get(`${backendUrl}/api/pl-report/summary`, { params });
      setData({
        summary: response.data.data || {
          revenue: 0, cogs: 0, grossProfit: 0, expenses: 0, netProfit: 0, profitMargin: 0,
        },
      });
    } catch (error) {
      console.error("Error fetching P&L data:", error);
      showToast("error", "Failed to fetch P&L report data");
    } finally {
      setLoading(false);
    }
  };

  const fetchTableData = async (startDate = null, endDate = null) => {
    setTableLoading(true);
    try {
      const params = {};
      if (startDate) params.startDate = startDate.toISOString().split("T")[0];
      if (endDate) params.endDate = endDate.toISOString().split("T")[0];

      const response = await axios.get(`${backendUrl}/api/pl-report`, { params });
      const responseData = response.data.data || [];
      const details = response.data.details || {};
      const backendTotals = response.data.totals || {};
      
      setTableData(responseData);
      setSalaryDetails(details.salaryDetails || []);
      setExpenseDetails(details.expenseDetails || []);

      // Use the totals directly from backend response
      setTotals({
        totalAmount: backendTotals.totalRevenue || 0,
        totalProfit: backendTotals.totalProfit || 0,
        totalLoss: backendTotals.totalLoss || 0,
        totalExpense: backendTotals.totalExpense || 0,
        totalSalaryExpense: backendTotals.payrollExpense || 0,
        totalOtherExpense: backendTotals.otherExpense || 0,
      });
    } catch (error) {
      console.error("Error fetching table data:", error);
      showToast("error", "Failed to fetch table data");
      setTableData([]);
      setSalaryDetails([]);
      setExpenseDetails([]);
      setTotals({
        totalAmount: 0, totalProfit: 0, totalExpense: 0,
        totalSalaryExpense: 0, totalOtherExpense: 0, totalLoss: 0,
      });
    } finally {
      setTableLoading(false);
    }
  };

  const fetchAllData = (startDate = null, endDate = null) => {
    fetchPLData(startDate, endDate);
    fetchTableData(startDate, endDate);
  };

  useEffect(() => {
    fetchAllData(dateRanges.currentMonth.start, dateRanges.currentMonth.end);
  }, []);

  useEffect(() => {
    if (activeTab === "custom" && (!customStartDate || !customEndDate)) {
      return;
    }
    const startDate = currentRange.start;
    const endDate = currentRange.end;
    if (startDate && endDate) {
      fetchAllData(startDate, endDate);
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      {[
        { label: "Total Revenue", value: data.summary.revenue, color: "green", icon: TrendingUp },
        { label: "COGS", value: data.summary.cogs, color: "red", icon: TrendingDown },
        { label: "Gross Profit", value: data.summary.grossProfit, color: "blue", icon: DollarSign },
        { label: "Total Expenses", value: data.summary.expenses, color: "orange", icon: TrendingDown },
        { 
          label: "Net Profit/Loss", 
          value: data.summary.netProfit, 
          color: data.summary.netProfit >= 0 ? "green" : "red", 
          icon: data.summary.netProfit >= 0 ? TrendingUp : TrendingDown 
        },
        { label: "Profit Margin", value: `${data.summary.profitMargin?.toFixed(2) || 0}%`, color: "indigo", icon: FileBarChart },
      ].map((card, index) => (
        <div key={index} className={`bg-white p-6 rounded-xl shadow-md border-l-4 ${
          card.color === 'green' ? 'border-green-500' : 
          card.color === 'red' ? 'border-red-500' : 
          card.color === 'blue' ? 'border-blue-500' : 
          card.color === 'orange' ? 'border-orange-500' : 
          'border-indigo-500'
        }`}>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">{card.label}</div>
              <div className={`text-2xl font-bold ${
                card.label === "Net Profit/Loss" 
                  ? (card.value >= 0 ? "text-green-700" : "text-red-700")
                  : "text-gray-800"
              }`}>
                {loading ? (
                  <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
                ) : card.label.includes("Margin") ? (
                  card.value
                ) : card.label === "Net Profit/Loss" ? (
                  `$${typeof card.value === 'number' ? Math.abs(card.value).toLocaleString() : '0'} ${card.value >= 0 ? '' : '(Loss)'}`
                ) : (
                  `$${typeof card.value === 'number' ? card.value.toLocaleString() : '0'}`
                )}
              </div>
            </div>
            <card.icon className={`w-8 h-8 ${
              card.color === 'green' ? 'text-green-500' : 
              card.color === 'red' ? 'text-red-500' : 
              card.color === 'blue' ? 'text-blue-500' : 
              card.color === 'orange' ? 'text-orange-500' : 
              'text-indigo-500'
            }`} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderMainTable = () => {
    // Use the totals directly from backend
    const displayProfit = totals.totalProfit;
    const displayLoss = totals.totalLoss;

    return (
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="p-3 text-sm font-medium">Period</th>
              <th className="p-3 text-sm font-medium">Salary Expense($)</th>
              <th className="p-3 text-sm font-medium">Other Expenses($)</th>
              <th className="p-3 text-sm font-medium">Total Expense($)</th>
              <th className="p-3 text-sm font-medium">Profit($)</th>
              <th className="p-3 text-sm font-medium">Loss($)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-gray-50 border-t">
              <td className="p-3 text-gray-600 font-medium">{currentRange.label}</td>
              <td className="p-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-gray-700">{totals.totalSalaryExpense?.toLocaleString() || 0}</span>
                  <button
                    onClick={() => setShowSalaryDetailsModal(true)}
                    className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 cursor-pointer"
                    title="View Salary Details"
                  >
                    <Users size={16} />
                  </button>
                </div>
              </td>
              <td className="p-3">
                <div className="flex items-center justify-center gap-2">
                  <span className="text-gray-700">{totals.totalOtherExpense?.toLocaleString() || 0}</span>
                  <button
                    onClick={() => setShowExpenseDetailsModal(true)}
                    className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50 cursor-pointer"
                    title="View Expense Details"
                  >
                    <CreditCard size={16} />
                  </button>
                </div>
              </td>
              <td className="p-3">
                <span className="text-gray-700 font-medium">{totals.totalExpense?.toLocaleString() || 0}</span>
              </td>
              <td className="p-3">
                <span className={`font-medium ${displayProfit > 0 ? "text-green-700" : "text-gray-700"}`}>
                  {displayProfit > 0 ? displayProfit.toLocaleString() : "0"}
                </span>
              </td>
              <td className="p-3">
                <span className={`font-medium ${displayLoss > 0 ? "text-red-700" : "text-gray-700"}`}>
                  {displayLoss > 0 ? displayLoss.toLocaleString() : "0"}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const renderSalaryDetailsModal = () => {
    if (!showSalaryDetailsModal) return null;

    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">Salary Details - {currentRange.label}</h2>
            <button onClick={() => setShowSalaryDetailsModal(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
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
                    <th className="p-3 text-sm font-medium">Basic Salary ($)</th>
                    <th className="p-3 text-sm font-medium">Allowances ($)</th>
                    <th className="p-3 text-sm font-medium">Deductions ($)</th>
                    <th className="p-3 text-sm font-medium">Net Salary ($)</th>
                    <th className="p-3 text-sm font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryDetails.length > 0 ? salaryDetails.map((item) => (
                    <tr key={item._id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{formatDateToReadable(item.date)}</td>
                      <td className="p-3 font-medium">{item.description?.replace("Salary for ", "") || "N/A"}</td>
                      <td className="p-3">{item.details?.basicSalary?.toLocaleString() || 0}</td>
                      <td className="p-3 text-green-600">{item.details?.allowances?.toLocaleString() || 0}</td>
                      <td className="p-3 text-red-600">{item.details?.deductions?.toLocaleString() || 0}</td>
                      <td className="p-3 font-semibold">{item.expense?.toLocaleString() || 0}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === "paid" ? "bg-green-100 text-green-800" :
                          item.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {item.status || "N/A"}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="7" className="text-center py-8 text-gray-500">No salary records found</td></tr>
                  )}
                </tbody>
                {salaryDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="2" className="p-3 text-left">Total:</td>
                      <td className="p-3">{salaryDetails.reduce((sum, item) => sum + (item.details?.basicSalary || 0), 0).toLocaleString()}</td>
                      <td className="p-3 text-green-600">{salaryDetails.reduce((sum, item) => sum + (item.details?.allowances || 0), 0).toLocaleString()}</td>
                      <td className="p-3 text-red-600">{salaryDetails.reduce((sum, item) => sum + (item.details?.deductions || 0), 0).toLocaleString()}</td>
                      <td className="p-3">{salaryDetails.reduce((sum, item) => sum + (item.expense || 0), 0).toLocaleString()}</td>
                      <td className="p-3">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button onClick={() => setShowSalaryDetailsModal(false)} className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer">
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
            <h2 className="text-xl font-semibold text-gray-800">Expense Details - {currentRange.label}</h2>
            <button onClick={() => setShowExpenseDetailsModal(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
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
                  {expenseDetails.length > 0 ? expenseDetails.map((item) => (
                    <tr key={item._id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-600">{formatDateToReadable(item.date)}</td>
                      <td className="p-3 font-medium text-gray-800">{item.title || "General Expense"}</td>
                      <td className="p-3 text-gray-600">{item.description || item.title || "N/A"}</td>
                      <td className="p-3 font-semibold">{item.expense?.toLocaleString() || 0}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.status === "paid" ? "bg-green-100 text-green-800" :
                          item.status === "pending" ? "bg-yellow-100 text-yellow-800" :
                          item.status === "approved" ? "bg-blue-100 text-blue-800" :
                          "bg-gray-100 text-gray-800"
                        }`}>
                          {item.status || "N/A"}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="5" className="text-center py-8 text-gray-500">No expense records found</td></tr>
                  )}
                </tbody>
                {expenseDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="3" className="p-3 text-left">Total Expenses:</td>
                      <td className="p-3">{expenseDetails.reduce((sum, item) => sum + (item.expense || 0), 0).toLocaleString()}</td>
                      <td className="p-3">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button onClick={() => setShowExpenseDetailsModal(false)} className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer">
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
            <h2 className="text-lg font-semibold text-gray-800">Select Custom Date Range</h2>
            <button onClick={() => setShowCustomModal(false)} className="text-gray-500 hover:text-gray-700 cursor-pointer">
              <X size={20} />
            </button>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
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
            <button onClick={() => setShowCustomModal(false)} className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer">
              Cancel
            </button>
            <button onClick={handleCustomDateApply} disabled={!customStartDate || !customEndDate} className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed cursor-pointer">
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
          <h1 className="text-2xl font-bold text-gray-800">Profit & Loss Report</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={exportToExcel} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer">
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
            <button key={tab.key} onClick={() => handleTabClick(tab.key)} className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === tab.key ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}>
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
      {renderSalaryDetailsModal()}
      {renderExpenseDetailsModal()}
    </div>
  );
};

export default PLReport;