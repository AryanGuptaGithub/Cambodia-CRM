import React, { useState, useEffect } from "react";
import {
  Download,
  FileBarChart,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Calendar,
  X,
  Eye,
  Users,
  CreditCard,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

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
  const [totals, setTotals] = useState({
    totalAmount: 0,
    totalProfit: 0,
    totalExpense: 0,
    totalSalaryExpense: 0,
    totalOtherExpense: 0,
  });
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [sortDirection, setSortDirection] = useState("Newest");
  const [activeTab, setActiveTab] = useState("currentMonth");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(null);
  const [customEndDate, setCustomEndDate] = useState(null);
  const [showSalaryDetails, setShowSalaryDetails] = useState(false);
  const [showExpenseDetails, setShowExpenseDetails] = useState(false);
  const [salaryDetails, setSalaryDetails] = useState([]);
  const [expenseDetails, setExpenseDetails] = useState([]);

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

    // Current Month Range
    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);

    // Jan to Previous Month Range
    const janToPreviousStart = new Date(currentYear, 0, 1);
    const janToPreviousEnd = new Date(currentYear, currentMonth, 0);

    // Get month names for labels
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
        apiLabel: `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`,
      },
      janToPrevious: {
        start: janToPreviousStart,
        end: janToPreviousEnd,
        label: `Jan - ${previousMonthName}`,
        apiLabel: `${currentYear}-01_to_${currentYear}-${String(currentMonth).padStart(2, "0")}`,
      },
      custom: {
        start: customStartDate,
        end: customEndDate,
        label: customStartDate && customEndDate
          ? `${customStartDate.toLocaleDateString()} - ${customEndDate.toLocaleDateString()}`
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
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          expenses: 0,
          netProfit: 0,
          profitMargin: 0,
        },
      });
    } catch (error) {
      console.error("Error fetching P&L data:", error);
      showToast("error", "Failed to fetch P&L report data");
      setData({
        summary: {
          revenue: 0,
          cogs: 0,
          grossProfit: 0,
          expenses: 0,
          netProfit: 0,
          profitMargin: 0,
        },
      });
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
      const tableData = response.data.data || [];
      setTableData(tableData);
      
      // Calculate totals from the data
      const payrollRecords = tableData.filter(item => item.type === 'payroll');
      const expenseRecords = tableData.filter(item => item.type === 'expense');
      
      const totalSalaryExpense = payrollRecords.reduce((sum, item) => sum + (item.expense || 0), 0);
      const totalOtherExpense = expenseRecords.reduce((sum, item) => sum + (item.expense || 0), 0);
      const totalExpense = totalSalaryExpense + totalOtherExpense;
      
      setTotals({
        totalAmount: response.data.totals?.totalAmount || 0,
        totalProfit: response.data.totals?.totalProfit || 0,
        totalExpense: totalExpense,
        totalSalaryExpense: totalSalaryExpense,
        totalOtherExpense: totalOtherExpense,
      });
    } catch (error) {
      console.error("Error fetching table data:", error);
      showToast("error", "Failed to fetch table data");
      setTableData([]);
      setTotals({
        totalAmount: 0,
        totalProfit: 0,
        totalExpense: 0,
        totalSalaryExpense: 0,
        totalOtherExpense: 0,
      });
    } finally {
      setTableLoading(false);
    }
  };

  // Fetch all data for current date range
  const fetchAllData = (startDate = null, endDate = null) => {
    fetchPLData(startDate, endDate);
    fetchTableData(startDate, endDate);
  };

  useEffect(() => {
    fetchAllData(dateRanges.currentMonth.start, dateRanges.currentMonth.end);
  }, []);

  // Fetch data when tab changes
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

  const handleSortToggle = () => {
    setSortDirection((prev) => (prev === "Newest" ? "Oldest" : "Newest"));
  };

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

  const handleViewSalaryDetails = () => {
    // Filter payroll records from tableData
    const payrollRecords = tableData.filter(item => item.type === 'payroll');
    setSalaryDetails(payrollRecords);
    setShowSalaryDetails(true);
  };

  const handleViewExpenseDetails = () => {
    // Filter expense records (non-payroll)
    const expenseRecords = tableData.filter(item => item.type === 'expense');
    setExpenseDetails(expenseRecords);
    setShowExpenseDetails(true);
  };

  const exportToExcel = () => {
    showToast("info", "Export to Excel feature coming soon");
  };

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-green-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Revenue</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.revenue?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingUp className="w-8 h-8 text-green-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-red-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">COGS</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.cogs?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingDown className="w-8 h-8 text-red-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-blue-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Gross Profit</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.grossProfit?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-blue-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-orange-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Total Expenses</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.expenses?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <TrendingDown className="w-8 h-8 text-orange-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-purple-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Net Profit</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `$${data.summary.netProfit?.toLocaleString() || 0}`
              )}
            </div>
          </div>
          <DollarSign className="w-8 h-8 text-purple-500" />
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-md border-l-4 border-indigo-500">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-sm text-gray-600">Profit Margin</div>
            <div className="text-2xl font-bold text-gray-800">
              {loading ? (
                <div className="h-8 w-20 bg-gray-200 rounded animate-pulse"></div>
              ) : (
                `${data.summary.profitMargin?.toFixed(2) || 0}%`
              )}
            </div>
          </div>
          <FileBarChart className="w-8 h-8 text-indigo-500" />
        </div>
      </div>
    </div>
  );

  const renderMainTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
        <thead className="bg-gray-100 text-gray-700 text-sm">
          <tr>
            <th className="p-3 text-left">Date</th>
            <th className="p-3 text-center">Salary Expense</th>
            <th className="p-3 text-center">Other Expenses</th>
            <th className="p-3 text-center">Total Expense</th>
            <th className="p-3 text-right">Profit</th>
            <th className="p-3 text-right">Loss</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b hover:bg-gray-50 text-sm">
            <td className="p-3 text-gray-600 font-medium">
              {currentRange.label}
            </td>
            <td className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-700">
                  ${totals.totalSalaryExpense?.toLocaleString() || 0}
                </span>
                <button
                  onClick={handleViewSalaryDetails}
                  className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                  title="View Salary Details"
                >
                  <Users size={16} />
                </button>
              </div>
            </td>
            <td className="p-3 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="text-gray-700">
                  ${totals.totalOtherExpense?.toLocaleString() || 0}
                </span>
                <button
                  onClick={handleViewExpenseDetails}
                  className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50"
                  title="View Expense Details"
                >
                  <CreditCard size={16} />
                </button>
              </div>
            </td>
            <td className="p-3 text-center">
              <span className="text-gray-700 font-medium">
                ${totals.totalExpense?.toLocaleString() || 0}
              </span>
            </td>
            <td className="p-3 text-right">
              <span className={`font-medium ${
                totals.totalProfit > 0 ? "text-green-700" : "text-gray-700"
              }`}>
                ${totals.totalProfit?.toLocaleString() || 0}
              </span>
            </td>
            <td className="p-3 text-right">
              <span className={`font-medium ${
                totals.totalLoss > 0 ? "text-red-700" : "text-gray-700"
              }`}>
                ${totals.totalLoss?.toLocaleString() || 0}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const renderSalaryDetailsModal = () => {
    if (!showSalaryDetails) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Salary Details - {currentRange.label}
            </h2>
            <button
              onClick={() => setShowSalaryDetails(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
                <thead className="bg-gray-100 text-gray-700 text-sm">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">Payroll Code</th>
                    <th className="p-3 text-right">Basic Salary</th>
                    <th className="p-3 text-right">Allowances</th>
                    <th className="p-3 text-right">Deductions</th>
                    <th className="p-3 text-right">Net Salary</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {salaryDetails.length > 0 ? (
                    salaryDetails.map((item) => (
                      <tr
                        key={item._id}
                        className="border-b hover:bg-gray-50 text-sm"
                      >
                        <td className="p-3 text-gray-600">
                          {new Date(item.date).toLocaleDateString()}
                        </td>
                        <td className="p-3 font-medium">
                          {item.description?.replace('Salary for ', '') || 'N/A'}
                        </td>
                        <td className="p-3 text-gray-600">{item.title || 'N/A'}</td>
                        <td className="p-3 text-right">
                          ${item.details?.basicSalary?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-right text-green-600">
                          ${item.details?.allowances?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-right text-red-600">
                          ${item.details?.deductions?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          ${item.expense?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              item.status === "paid"
                                ? "bg-green-100 text-green-800"
                                : item.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {item.status || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="8" className="text-center py-8 text-gray-500">
                        No salary records found for the selected period
                      </td>
                    </tr>
                  )}
                </tbody>
                {salaryDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="3" className="p-3 text-right">Total:</td>
                      <td className="p-3 text-right">
                        ${salaryDetails.reduce((sum, item) => sum + (item.details?.basicSalary || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-green-600">
                        ${salaryDetails.reduce((sum, item) => sum + (item.details?.allowances || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-red-600">
                        ${salaryDetails.reduce((sum, item) => sum + (item.details?.deductions || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        ${salaryDetails.reduce((sum, item) => sum + (item.expense || 0), 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-center">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowSalaryDetails(false)}
              className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderExpenseDetailsModal = () => {
    if (!showExpenseDetails) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
        <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-800">
              Expense Details - {currentRange.label}
            </h2>
            <button
              onClick={() => setShowExpenseDetails(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-xl overflow-hidden">
                <thead className="bg-gray-100 text-gray-700 text-sm">
                  <tr>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Expense Type</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-left">Vendor/Supplier</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3 text-center">Payment Method</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseDetails.length > 0 ? (
                    expenseDetails.map((item) => (
                      <tr
                        key={item._id}
                        className="border-b hover:bg-gray-50 text-sm"
                      >
                        <td className="p-3 text-gray-600">
                          {new Date(item.date).toLocaleDateString()}
                        </td>
                        <td className="p-3 font-medium text-gray-800">
                          {item.expenseType || 'General Expense'}
                        </td>
                        <td className="p-3 text-gray-600">
                          {item.description || item.title || 'N/A'}
                        </td>
                        <td className="p-3 text-gray-600">
                          {item.vendor || 'N/A'}
                        </td>
                        <td className="p-3 text-right font-semibold">
                          ${item.expense?.toLocaleString() || 0}
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-gray-700 capitalize">
                            {item.paymentMethod || 'N/A'}
                          </span>
                        </td>
                        <td className="p-3 text-center">
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
                            {item.status || 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="text-center py-8 text-gray-500">
                        No expense records found for the selected period
                      </td>
                    </tr>
                  )}
                </tbody>
                {expenseDetails.length > 0 && (
                  <tfoot>
                    <tr className="bg-gray-100 font-semibold text-sm">
                      <td colSpan="4" className="p-3 text-right">Total Expenses:</td>
                      <td className="p-3 text-right">
                        ${expenseDetails.reduce((sum, item) => sum + (item.expense || 0), 0).toLocaleString()}
                      </td>
                      <td colSpan="2" className="p-3 text-center">-</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => setShowExpenseDetails(false)}
              className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
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
      <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
        <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800">
              Select Custom Date Range
            </h2>
            <button
              onClick={() => setShowCustomModal(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
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
              className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCustomDateApply}
              disabled={!customStartDate || !customEndDate}
              className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
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
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Download size={18} />
            Export Excel
          </button>
        </div>
      </div>

      {renderSummaryCards()}

      {/* Tabs Section */}
      <div className="bg-white p-6 rounded-xl shadow-md">
        {/* Tabs Header */}
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

        {/* Date Range Info */}
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            Showing data from <strong>{currentRange.start?.toLocaleDateString()}</strong> to <strong>{currentRange.end?.toLocaleDateString()}</strong>
          </p>
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

      {/* Custom Date Modal */}
      {renderCustomDateModal()}

      {/* Salary Details Modal */}
      {renderSalaryDetailsModal()}

      {/* Expense Details Modal */}
      {renderExpenseDetailsModal()}
    </div>
  );
};

export default PLReport;