import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Upload,
  X,
  Search,
  DollarSign,
  View,
  List,
  Calendar,
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadPayroll from "../../excels/SampleExcelDownloadPayroll";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { parseExcelDate } from "../../utils/excelUtility";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const payrollsPerPage = 7;

// Allowance types array
const allowanceTypes = [
  "House Rent Allowance",
  "Dearness Allowance",
  "Conveyance Allowance",
  "Medical Allowance",
  "Special Allowance",
  "Travel Allowance",
  "Bonus",
  "Overtime",
  "Incentive",
  "Other",
];

// Custom hook for form management
const usePayrollForm = (initialForm = {}) => {
  const [form, setForm] = useState({
    employeeId: "",
    employeeName: "",
    period: "",
    basicSalary: "",
    allowances: [],
    deductions: "",
    netSalary: "0.00",
    status: "pending",
    paymentMethod: "",
    bankAccount: "",
    paymentDate: "",
    remarks: "",
    payrollCode: "",
    source: "", // Added source field
    ...initialForm,
  });

  const [errors, setErrors] = useState({});
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [showAllowanceBreakdown, setShowAllowanceBreakdown] = useState(false);

  // Fetch MR List
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await fetch(`${backendUrl}/api/staffs`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to fetch employees");
      }

      if (data && data.length > 0) {
        setMrList(data);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
      }
    } catch (error) {
      console.error("Error fetching employees:", error);
      showToast("error", error.message || "Failed to load employees");
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  // Handle numeric input
  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  // Allowance handling
  const allowanceOptions = useMemo(
    () =>
      allowanceTypes.map((t) => ({
        value: t,
        label: t,
      })),
    []
  );

  const handleAllowanceChange = useCallback((selectedTypes) => {
    setForm((prev) => {
      const currentAllowances = prev.allowances || [];

      // Remove allowances that are no longer selected
      const updatedAllowances = currentAllowances.filter((allowance) =>
        selectedTypes.includes(allowance.type)
      );

      // Add new allowances that weren't previously selected
      selectedTypes.forEach((type) => {
        if (!updatedAllowances.some((allowance) => allowance.type === type)) {
          updatedAllowances.push({ type, amount: "" });
        }
      });

      return { ...prev, allowances: updatedAllowances };
    });
  }, []);

  const handleAllowanceAmountChange = useCallback((type, amount) => {
    setForm((prev) => ({
      ...prev,
      allowances: prev.allowances.map((allowance) =>
        allowance.type === type ? { ...allowance, amount } : allowance
      ),
    }));
  }, []);

  const removeAllowance = useCallback((type) => {
    setForm((prev) => ({
      ...prev,
      allowances: prev.allowances.filter(
        (allowance) => allowance.type !== type
      ),
    }));
  }, []);

  const handleEmployeeChange = useCallback(
    (employeeId) => {
      const selectedEmployee = mrList.find((mr) => mr._id === employeeId);
      setForm((prev) => ({
        ...prev,
        employeeId,
        employeeName:
          selectedEmployee?.medicalRepName ||
          selectedEmployee?.employeeName ||
          "",
      }));
      setErrors((prev) => ({ ...prev, employeeId: "" }));
    },
    [mrList]
  );

  // Calculate totals
  const totalAllowance = useMemo(() => {
    return (form.allowances || []).reduce((total, allowance) => {
      return total + (parseFloat(allowance.amount) || 0);
    }, 0);
  }, [form.allowances]);

  const netSalary = useMemo(() => {
    const basic = parseFloat(form.basicSalary) || 0;
    const ded = parseFloat(form.deductions) || 0;
    return (basic + totalAllowance - ded).toFixed(2);
  }, [form.basicSalary, totalAllowance, form.deductions]);

  // Update net salary whenever dependencies change
  useEffect(() => {
    setForm((prev) => ({ ...prev, netSalary }));
  }, [netSalary]);

  // Load data on mount
  useEffect(() => {
    fetchMRList();
  }, [fetchMRList]);

  return {
    form,
    setForm,
    errors,
    setErrors,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    fetchMRList,
  };
};

// MultipleSelectDropdown Component
const MultipleSelectDropdown = ({
  label,
  value = [],
  onChange,
  options,
  placeholder = "Select options",
  loading = false,
  error,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const filteredOptions = options.filter((option) =>
    option.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (optionValue) => {
    const newValue = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(newValue);
  };

  const getSelectedLabels = () => {
    return value.map((val) => {
      const option = options.find((opt) => opt.value === val);
      return option ? option.label : val;
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = getSelectedLabels();

  return (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <div
          className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer min-h-[42px] flex flex-wrap items-center gap-1 ${
            disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
          } ${error ? "border-red-500" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {selectedLabels.length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            selectedLabels.map((label, index) => (
              <span
                key={index}
                className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm"
              >
                {label}
              </span>
            ))
          )}
        </div>

        {isOpen && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            {/* Search input */}
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search allowances..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Options list */}
            {loading ? (
              <div className="px-3 py-2 text-gray-500">Loading...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500">No options found</div>
            ) : (
              filteredOptions.map((option, index) => (
                <div
                  key={option.value}
                  className={`px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center ${
                    value.includes(option.value) ? "bg-blue-50" : ""
                  }`}
                  onClick={() => toggleOption(option.value)}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(option.value)}
                    onChange={() => {}} // Handled by parent div click
                    className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span
                    className={
                      value.includes(option.value) ? "font-medium" : ""
                    }
                  >
                    {option.label}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
};

// Allowance Breakdown Modal Component
const AllowanceBreakdownModal = ({
  allowances,
  isOpen,
  onClose,
  onAmountChange,
  onRemove,
  disabled = false,
}) => {
  if (!isOpen) return null;

  const handleNumeric = (e, type) => {
    const { value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onAmountChange(type, value);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Allowance Breakdown</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-3">
            {allowances.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No allowances added
              </p>
            ) : (
              allowances.map((allowance, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 border rounded-lg"
                >
                  <div className="flex-1">
                    <label className="text-sm font-medium text-gray-700 block mb-1">
                      {allowance.type}
                    </label>
                    <input
                      type="text"
                      value={allowance.amount}
                      onChange={(e) => handleNumeric(e, allowance.type)}
                      placeholder="0.00"
                      disabled={disabled}
                      className={`w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        disabled ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                    />
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onRemove(allowance.type)}
                      className="text-red-500 hover:text-red-700 p-2 rounded transition-colors"
                      title="Remove allowance"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {!disabled && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-2">
              Tip: You can add new allowances by selecting them in the
              "Allowance Type" dropdown
            </p>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Custom Date Range Modal Component
const CustomDateRangeModal = ({ isOpen, onClose, onDateRangeSelect }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);

  // Get today's date to disable future dates
  const today = new Date();

  const handleApply = () => {
    if (!startDate || !endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }

    if (startDate > endDate) {
      showToast("error", "Start date cannot be after end date");
      return;
    }

    onDateRangeSelect({
      start: startDate,
      end: endDate,
      label: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
    });
    onClose();
  };

  // Reset dates when modal opens
  useEffect(() => {
    if (isOpen) {
      setStartDate(null);
      setEndDate(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
      <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Select Custom Date Range
          </h2>
          <button
            onClick={onClose}
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
                selected={startDate}
                onChange={setStartDate}
                selectsStart
                startDate={startDate}
                endDate={endDate}
                maxDate={today} // Disable future dates
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
                selected={endDate}
                onChange={setEndDate}
                selectsEnd
                startDate={startDate}
                endDate={endDate}
                minDate={startDate}
                maxDate={today} // Disable future dates
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
            onClick={onClose}
            className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!startDate || !endDate}
            className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Apply Date Range
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// Fixed Date Selection Tabs Component
const DateSelectionTabs = ({ onDateRangeSelect, selectedRange }) => {
  const [activeTab, setActiveTab] = useState("previousMonth");
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Get current date info
  const getCurrentDateInfo = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed (0 = January, 11 = December)
    const currentDate = now.getDate();

    return { now, currentYear, currentMonth, currentDate };
  };

  // Get previous month range
  const getPreviousMonthRange = () => {
    const { currentYear, currentMonth } = getCurrentDateInfo();

    let prevMonth, prevYear;
    if (currentMonth === 0) {
      // If current month is January, previous month is December of previous year
      prevMonth = 11;
      prevYear = currentYear - 1;
    } else {
      prevMonth = currentMonth - 1;
      prevYear = currentYear;
    }

    const start = new Date(prevYear, prevMonth, 1);
    const end = new Date(prevYear, prevMonth + 1, 0); // Last day of previous month

    // Get month name for label
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return {
      start,
      end,
      label: monthNames[prevMonth],
    };
  };

  // Get Jan to [current month - 1] range
  const getJanToPreviousMonthRange = () => {
    const { currentYear, currentMonth } = getCurrentDateInfo();

    // If current month is January, then Jan to Previous Month would be empty, so we handle this case
    if (currentMonth === 0) {
      // If it's January, show previous year Jan to Dec
      const start = new Date(currentYear - 1, 0, 1);
      const end = new Date(currentYear - 1, 11, 31);
      return { start, end, label: `Jan to Dec ${currentYear - 1}` };
    }

    const start = new Date(currentYear, 0, 1); // January 1st
    const end = new Date(currentYear, currentMonth - 1, 0); // Last day of month before current

    // Get month names for label
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

    const endMonthName = monthNames[currentMonth - 1];

    return {
      start,
      end,
      label: `Jan to ${endMonthName}`,
    };
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);

    if (tab === "previousMonth") {
      const range = getPreviousMonthRange();
      onDateRangeSelect(range);
    } else if (tab === "janToPrevious") {
      const range = getJanToPreviousMonthRange();
      onDateRangeSelect(range);
    } else if (tab === "custom") {
      setShowCustomModal(true);
    }
  };

  const handleCustomDateSelect = (dateRange) => {
    onDateRangeSelect(dateRange);
    setActiveTab("custom");
  };

  // Get tab labels based on current date
  const getTabLabels = () => {
    const prevMonthRange = getPreviousMonthRange();
    const janToPrevRange = getJanToPreviousMonthRange();

    return {
      previousMonth: prevMonthRange.label,
      janToPrevious: janToPrevRange.label,
    };
  };

  const tabLabels = getTabLabels();

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Select Date Range
        </h3>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
          <button
            className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${
              activeTab === "previousMonth"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => handleTabClick("previousMonth")}
          >
            {tabLabels.previousMonth}
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${
              activeTab === "janToPrevious"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => handleTabClick("janToPrevious")}
          >
            {tabLabels.janToPrevious}
          </button>
          <button
            className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${
              activeTab === "custom"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => handleTabClick("custom")}
          >
            Custom Calendar
          </button>
        </div>
      </div>

      {/* Custom Date Range Modal */}
      <CustomDateRangeModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onDateRangeSelect={handleCustomDateSelect}
      />
    </>
  );
};

const Payroll = () => {
  const navigate = useNavigate();

  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState(null);

  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [nextPayrollCode, setNextPayrollCode] = useState(null);
  const inputRef = useRef(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAllowanceModalOpen, setIsAllowanceModalOpen] = useState(false);
  const [currentAllowances, setCurrentAllowances] = useState([]);

  // Use custom hook for form management
  const {
    form,
    setForm,
    errors,
    setErrors,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    fetchMRList,
  } = usePayrollForm();

  // Fetch source options - Fixed version
  const fetchSourceOptions = useCallback(async () => {
    try {
      setSourceLoading(true);
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );

      if (destinationResponse.data && Array.isArray(destinationResponse.data)) {
        const options = destinationResponse.data
          .filter((destination) => destination.totalAmount > 0)
          .map((destination) => {
            // Ensure label is always a string
            let label = "";
            if (typeof destination.name === "string") {
              label = destination.name;
            } else if (typeof destination.destinationName === "string") {
              label = destination.destinationName;
            } else {
              label = `Destination ${destination._id}`;
            }

            return {
              value: destination._id || destination.id,
              label: label,
            };
          });
        setSourceOptions(options);
      } else {
        setSourceOptions([]);
        console.warn(
          "Unexpected response format for destinations:",
          destinationResponse.data
        );
      }
    } catch (error) {
      console.error("Error fetching destination options:", error);
      showToast("error", "Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  // Handle source change
  const handleSourceChange = (sourceId) => {
    setForm((prev) => ({
      ...prev,
      source: sourceId,
    }));
    setErrors((prev) => ({ ...prev, source: "" }));
  };

  useEffect(() => {
    fetchPayrolls();
    fetchSourceOptions();
  }, []);

  // Modified fetchPayrolls to handle period-based filtering
  const fetchPayrolls = async (periodRange = null) => {
    try {
      setLoading(true);
      setError(null);
      
      let url = `${backendUrl}/api/payrolls`;
      
      // If period range is provided, add it as query parameters
      if (periodRange) {
        const params = new URLSearchParams();
        if (periodRange.startPeriod) params.append('startPeriod', periodRange.startPeriod);
        if (periodRange.endPeriod) params.append('endPeriod', periodRange.endPeriod);
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch payrolls");
      const data = await response.json();

      setPayrolls(data.data || []);
      if (data.nextPayrollCode) {
        setNextPayrollCode(data.nextPayrollCode);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  // Convert date range to period range for API call
  const convertDateRangeToPeriodRange = (dateRange) => {
    if (!dateRange) return null;
    
    const startPeriod = `${dateRange.start.getFullYear()}-${(dateRange.start.getMonth() + 1).toString().padStart(2, '0')}`;
    const endPeriod = `${dateRange.end.getFullYear()}-${(dateRange.end.getMonth() + 1).toString().padStart(2, '0')}`;
    
    return { startPeriod, endPeriod };
  };

  // Handle date range selection - now fetches data from API
  const handleDateRangeSelect = async (dateRange) => {
    setSelectedDateRange(dateRange);
    setCurrentPage(1);
    
    // Convert date range to period range and fetch payrolls
    const periodRange = convertDateRangeToPeriodRange(dateRange);
    await fetchPayrolls(periodRange);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDateRange]);

  const filteredPayrolls = useMemo(() => {
    if (!payrolls.length) return [];

    let filtered = payrolls.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.designation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.paymentMethod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payrollCode?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Note: We're now filtering on the backend based on period, so no need for frontend date filtering
    return filtered;
  }, [payrolls, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredPayrolls.length / payrollsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPayrolls = filteredPayrolls.slice(
    (currentPage - 1) * payrollsPerPage,
    currentPage * payrollsPerPage
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
  }

  // Select/unselect a payroll by id
  const toggleSelect = (payroll) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.id === payroll._id);

      if (exists) {
        return prev.filter((p) => p.id !== payroll._id);
      } else {
        return [...prev, { id: payroll._id, name: payroll.employeeName }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentPayrolls.map((s) => ({
        id: s._id,
        name: s.employeeName,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> payroll records`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/payrolls`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected payroll records deleted successfully");
          await fetchPayrolls();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected payroll records.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected payroll data
  const editPayroll = async (payroll) => {
    try {
      // Convert allowances from backend format to array format
      let allowances = [];
      if (Array.isArray(payroll.allowances)) {
        allowances = payroll.allowances;
      } else if (typeof payroll.allowances === "string") {
        try {
          allowances = JSON.parse(payroll.allowances);
        } catch (e) {
          // If it's a string but not JSON, treat it as a single amount
          const amount = parseFloat(payroll.allowances);
          if (!isNaN(amount)) {
            allowances = [{ type: "Total Allowance", amount: amount }];
          }
        }
      } else if (typeof payroll.allowances === "number") {
        allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
      }

      // Ensure allowances is an array of objects with type and amount
      if (!Array.isArray(allowances)) {
        allowances = [];
      }

      // Fetch MR list to ensure we have the latest data
      await fetchMRList();

      setForm({
        ...payroll,
        employeeId: payroll.employeeId || "",
        employeeName: payroll.employeeName || "",
        period: payroll.period || "",
        basicSalary: payroll.basicSalary?.toString() || "",
        allowances: allowances,
        deductions: payroll.deductions?.toString() || "",
        netSalary: payroll.netSalary?.toString() || "0.00",
        status: payroll.status || "pending",
        paymentMethod: payroll.paymentMethod || "",
        bankAccount: payroll.bankAccount || "",
        paymentDate: payroll.paymentDate || "",
        remarks: payroll.remarks || "",
        payrollCode: payroll.payrollCode || "",
        source: payroll.source || "",
        _id: payroll._id,
      });

      setIsEditModalOpen(true);
    } catch (error) {
      console.error("Error preparing edit form:", error);
      showToast("error", "Failed to load payroll data for editing");
    }
  };

  // Open view modal with selected payroll data
  const handleView = async (payroll) => {
    try {
      // Convert allowances from backend format to array format
      let allowances = [];
      if (Array.isArray(payroll.allowances)) {
        allowances = payroll.allowances;
      } else if (typeof payroll.allowances === "string") {
        try {
          allowances = JSON.parse(payroll.allowances);
        } catch (e) {
          // If it's a string but not JSON, treat it as a single amount
          const amount = parseFloat(payroll.allowances);
          if (!isNaN(amount)) {
            allowances = [{ type: "Total Allowance", amount: amount }];
          }
        }
      } else if (typeof payroll.allowances === "number") {
        allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
      }

      // Ensure allowances is an array of objects with type and amount
      if (!Array.isArray(allowances)) {
        allowances = [];
      }

      setForm({
        ...payroll,
        employeeId: payroll.employeeId || "",
        employeeName: payroll.employeeName || "",
        period: payroll.period || "",
        basicSalary: payroll.basicSalary?.toString() || "",
        allowances: allowances,
        deductions: payroll.deductions?.toString() || "",
        netSalary: payroll.netSalary?.toString() || "0.00",
        status: payroll.status || "pending",
        paymentMethod: payroll.paymentMethod || "",
        bankAccount: payroll.bankAccount || "",
        paymentDate: payroll.paymentDate || "",
        remarks: payroll.remarks || "",
        payrollCode: payroll.payrollCode || "",
        source: payroll.source || "",
        _id: payroll._id,
      });

      setIsViewModalOpen(true);
    } catch (error) {
      console.error("Error preparing view form:", error);
      showToast("error", "Failed to load payroll data for viewing");
    }
  };

  // Open allowance modal with selected payroll allowances
  const handleViewAllowances = (payroll) => {
    let allowances = [];

    if (Array.isArray(payroll.allowances)) {
      allowances = payroll.allowances;
    } else if (typeof payroll.allowances === "string") {
      try {
        allowances = JSON.parse(payroll.allowances);
      } catch (e) {
        const amount = parseFloat(payroll.allowances);
        if (!isNaN(amount)) {
          allowances = [{ type: "Total Allowance", amount: amount }];
        }
      }
    } else if (typeof payroll.allowances === "number") {
      allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
    }

    setCurrentAllowances(allowances);
    setIsAllowanceModalOpen(true);
  };

  const deletePayroll = async (payroll) => {
    if (!payroll._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete payroll record for <b>${payroll.employeeName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/payrolls/${payroll._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Payroll record for <b>${payroll.employeeName}</b> deleted successfully`
          );
          await fetchPayrolls();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete payroll record.");
      }
    }
  };

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    const validTypes = [".csv", ".xlsx", ".xls"];
    const fileExtension = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(fileExtension)) {
      showToast("error", "Please upload a valid Excel or CSV file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("error", "File size must be less than 10MB");
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        if (rows.length === 0) {
          showToast("warning", "Excel file is empty");
          return;
        }

        const requiredHeaders = [
          "payroll code",
          "date",
          "employee name",
          "department",
          "designation",
          "basic salary",
          "allowances",
          "deductions",
          "net salary",
          "bank account",
          "payment date",
          "status",
          "remarks",
        ];

        let headerRowIndex = -1;
        let matchedHeaders = [];

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            cell?.toString().trim().toLowerCase()
          );
          const matched = requiredHeaders.filter((header) =>
            row.includes(header)
          );
          if (matched.length >= 5) {
            headerRowIndex = i;
            matchedHeaders = matched;
            break;
          }
        }

        if (
          headerRowIndex === -1 ||
          matchedHeaders.length < requiredHeaders.length
        ) {
          const missingHeaders = requiredHeaders.filter(
            (header) => !matchedHeaders.includes(header)
          );
          const errorMsg = `Required headers not found in Excel file: ${missingHeaders.join(
            ", "
          )}`;
          showToast("error", errorMsg);
          return;
        }

        const rawHeaders = rows[headerRowIndex];
        const headersMap = {};
        rawHeaders.forEach((header, index) => {
          if (!header) return;
          const cleaned = header.toString().trim().toLowerCase();
          headersMap[index] = cleaned;
        });

        const dataRows = rows.slice(headerRowIndex + 1);
        if (dataRows.length === 0) {
          showToast("warning", "No data rows found in Excel file");
          return;
        }

        const mappedData = dataRows
          .map((row, rowIndex) => {
            const item = {};
            Object.entries(headersMap).forEach(([index, key]) => {
              item[key] = row[index] || "";
            });

            const basicSalary = parseFloat(item["basic salary"]) || 0;
            const allowances = parseFloat(item["allowances"]) || 0;
            const deductions = parseFloat(item["deductions"]) || 0;
            const netSalary =
              parseFloat(item["net salary"]) ||
              basicSalary + allowances - deductions;

            return {
              payrollCode: item["payroll code"]?.toString().trim(),
              date: parseExcelDate(item["date"]),
              employeeName: item["employee name"]?.toString().trim(),
              department: item["department"]?.toString().trim(),
              designation: item["designation"]?.toString().trim(),
              basicSalary: basicSalary,
              allowances: allowances,
              deductions: deductions,
              netSalary: netSalary,
              paymentDate: parseExcelDate(item["payment date"]),
              status: (item["status"] || "pending")?.toString().trim(),
              remarks: item["remarks"]?.toString().trim(),
            };
          })
          .filter((entry, index) => {
            const keep = !!entry.payrollCode && !!entry.employeeName;
            if (!keep) {
              console.warn(
                `Skipping row ${
                  index + headerRowIndex + 2
                }: Missing payrollCode or employeeName`
              );
            }
            return keep;
          });

        if (mappedData.length === 0) {
          showToast("warning", "No valid data found after parsing");
          return;
        }

        setParsedData(mappedData);
        showToast(
          "success",
          `Successfully parsed ${mappedData.length} records`
        );
      } catch (error) {
        console.error("File parsing error:", error);
        showToast("error", "Error parsing file. Please check the format.");
      }
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  // Import parsed payrolls to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/payrolls/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Payroll records imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        await fetchPayrolls();
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");
        showToast("error", cleanMessage || "Failed to import payroll records.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Update payroll on backend
  const handleUpdatePayroll = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        totalAllowance: totalAllowance.toFixed(2),
        // Convert allowances array to the format expected by backend
        allowances: form.allowances,
      };

      const res = await axios.put(
        `${backendUrl}/api/payrolls/${form._id}`,
        payload
      );

      if (res.status === 200) {
        showToast(
          "success",
          `Payroll record for <b>${form.employeeName}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        await fetchPayrolls();
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast("error", "Failed to update payroll record.");
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.classList.remove("highlight");
        }
      }, 1000);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  // Helper function to get total allowance amount
  const getTotalAllowance = (payroll) => {
    if (Array.isArray(payroll.allowances)) {
      return payroll.allowances.reduce(
        (total, allowance) => total + (allowance.amount || 0),
        0
      );
    } else if (typeof payroll.allowances === "number") {
      return payroll.allowances;
    } else if (typeof payroll.allowances === "string") {
      try {
        const parsed = JSON.parse(payroll.allowances);
        if (Array.isArray(parsed)) {
          return parsed.reduce(
            (total, allowance) => total + (allowance.amount || 0),
            0
          );
        }
        return parseFloat(payroll.allowances) || 0;
      } catch (e) {
        return parseFloat(payroll.allowances) || 0;
      }
    }
    return 0;
  };

  // MR options for dropdown - FIXED: Include current employee if not in mrList
  const mrOptions = useMemo(() => {
    if (isMrListEmpty) {
      // If no employees available but we have a current employee in form, include it
      if (form.employeeId && form.employeeName) {
        return [
          {
            value: form.employeeId,
            label: form.employeeName,
          },
        ];
      }
      return [
        {
          value: "",
          label: "No Employees Available",
          disabled: true,
        },
      ];
    }

    let options = mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `Employee ${mr._id}`,
    }));

    // Add current employee if it's not in the list (for edit mode)
    if (
      form.employeeId &&
      form.employeeName &&
      !options.some((opt) => opt.value === form.employeeId)
    ) {
      options = [
        ...options,
        {
          value: form.employeeId,
          label: form.employeeName,
        },
      ];
    }

    return options;
  }, [mrList, isMrListEmpty, form.employeeId, form.employeeName]);

  // Get selected allowance types
  const selectedAllowanceTypes = useMemo(() => {
    return (form.allowances || []).map((allowance) => allowance.type);
  }, [form.allowances]);

  // Get source label for display
  const getSourceLabel = (sourceId) => {
    if (!sourceId) return "Not specified";
    const source = sourceOptions.find((opt) => opt.value === sourceId);
    return source ? source.label.toString() : sourceId;
  };

  // Add keyboard navigation support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsEditModalOpen(false);
        setIsViewModalOpen(false);
        setIsAllowanceModalOpen(false);
        setShowImportModal(false);
        setShowAllowanceBreakdown(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading)
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );

  if (error)
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: {error}</p>
          <button
            onClick={fetchPayrolls}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="p-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              navigate("/hrmlayout/payroll/new", {
                state: { payrollCode: nextPayrollCode },
              })
            }
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
          >
            <UserPlus size={18} /> Add New Payroll
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={18} /> Delete Selected ({selected.length})
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <p className="text-sm font-medium text-blue-800">
              Total Count:{" "}
              <span className="font-bold">{filteredPayrolls.length}</span>
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={handleIconClick}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search payrolls..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Date Selection Tabs */}
      <DateSelectionTabs
        onDateRangeSelect={handleDateRangeSelect}
        selectedRange={selectedDateRange}
      />

      {/* Payroll Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-left">
                <div className="flex items-center gap-4">
                  {currentPayrolls.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentPayrolls.length &&
                        currentPayrolls.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  )}
                  <span className="text-sm font-medium">Employee</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Team Name</th>
              <th className="p-3 text-sm font-medium">Contact No</th>
              <th className="p-3 text-sm font-medium">Basic Salary ($)</th>
              <th className="p-3 text-sm font-medium">Allowances</th>
              <th className="p-3 text-sm font-medium">Deductions ($)</th>
              <th className="p-3 text-sm font-medium">Net Salary ($)</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPayrolls.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  No payroll records found.
                </td>
              </tr>
            ) : (
              currentPayrolls.map((payroll, idx) => (
                <tr
                  key={payroll._id}
                  className={`hover:bg-gray-50 ${
                    idx < currentPayrolls.length - 1 ? "border-b" : ""
                  }`}
                >
                  <td className="p-3 text-left">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selected.some((s) => s.id === payroll._id)}
                        onChange={() => toggleSelect(payroll)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-gray-900 capitalize">
                        {payroll.employeeName}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-600 capitalize">
                    {payroll.employeeId?.teamName}
                  </td>
                  <td className="p-3 text-gray-600 capitalize">
                    {payroll.employeeId?.contactNo}
                  </td>
                  <td className="p-3 text-gray-600">{payroll.basicSalary}</td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-center">
                      <span className="text-gray-600">
                        {getTotalAllowance(payroll)}
                      </span>
                      <button
                        onClick={() => handleViewAllowances(payroll)}
                        className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                        title="View Allowance Details"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  </td>
                  <td className="p-3 text-red-600">{-payroll.deductions}</td>
                  <td className="p-3 font-semibold text-green-400">
                    {payroll.netSalary}
                  </td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button
                      onClick={() => handleView(payroll)}
                      className="text-blue-600 hover:text-blue-800 cursor-pointer"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => editPayroll(payroll)}
                      className="text-green-600 hover:text-green-800 cursor-pointer"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deletePayroll(payroll)}
                      className="text-red-600 hover:text-red-800 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {currentPayrolls.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>
            {visiblePages.map((p, index) => (
              <button
                key={index}
                onClick={() => typeof p === "number" && setCurrentPage(p)}
                disabled={p === "..."}
                className={`px-3 py-1 rounded ${
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
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Allowance Details Modal */}
      {isAllowanceModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">
                  Allowance Details
                </h2>
                <button
                  onClick={() => setIsAllowanceModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {currentAllowances.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign
                      className="mx-auto text-gray-400 mb-3"
                      size={48}
                    />
                    <p className="text-gray-500 text-lg">
                      No allowance details available
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto mb-6">
                      <table className="w-full border-collapse">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                              Allowance Type
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {currentAllowances.map((allowance, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">
                                {allowance.type || "Allowance"}
                              </td>
                              <td className="px-4 py-3 text-sm text-right font-semibold">
                                {formatCurrency(allowance.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50 border-t border-gray-200">
                          <tr>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                              Total Allowances
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold text-right text-green-600">
                              {formatCurrency(
                                currentAllowances.reduce(
                                  (total, allowance) =>
                                    total + (allowance.amount || 0),
                                  0
                                )
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm font-medium text-blue-800">
                          Total Allowances
                        </p>
                        <p className="text-2xl font-bold text-blue-900">
                          {currentAllowances.length}
                        </p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <p className="text-sm font-medium text-green-800">
                          Total Amount
                        </p>
                        <p className="text-2xl font-bold text-green-900">
                          {formatCurrency(
                            currentAllowances.reduce(
                              (total, allowance) =>
                                total + (allowance.amount || 0),
                              0
                            )
                          )}
                        </p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <p className="text-sm font-medium text-purple-800">
                          Average per Allowance
                        </p>
                        <p className="text-2xl font-bold text-purple-900">
                          {formatCurrency(
                            currentAllowances.length > 0
                              ? currentAllowances.reduce(
                                  (total, allowance) =>
                                    total + (allowance.amount || 0),
                                  0
                                ) / currentAllowances.length
                              : 0
                          )}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setIsAllowanceModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
            <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">
                  Import Payroll
                </h2>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedData([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isUploading}
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6">
                {isSampleFile && <SampleExcelDownloadPayroll />}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload File
                  </label>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported formats: CSV, XLSX, XLS (Max 10MB)
                  </p>
                  {parsedData.length > 0 && (
                    <p className="text-sm text-green-600 mt-2">
                      ✅ {parsedData.length} records ready to import
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedData([]);
                  }}
                  disabled={isUploading}
                  className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isUploading || parsedData.length === 0}
                  className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploading ? "Uploading..." : "Import Records"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Payroll Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">
                  Edit Payroll
                </h2>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                <form onSubmit={handleUpdatePayroll}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Payroll Code - Readonly */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Payroll Code
                      </label>
                      <input
                        type="text"
                        value={form.payrollCode || ""}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                        disabled
                      />
                    </div>

                    {/* Employee Name - Searchable Dropdown - DISABLED */}
                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Employee Name
                      </label>
                      <input
                        type="text"
                        value={form.employeeName || ""}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                        disabled
                      />
                    </div>
                  </div>

                  {/* Salary Information */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <InputField
                      label="Basic Salary"
                      name="basicSalary"
                      value={form.basicSalary}
                      onChange={handleNumeric}
                      placeholder="0.00"
                      error={errors.basicSalary}
                      required
                      disabled={isMrListEmpty}
                    />
                    <InputField
                      label="Deductions"
                      name="deductions"
                      value={form.deductions}
                      onChange={handleNumeric}
                      placeholder="0.00"
                      disabled={isMrListEmpty}
                    />
                    <InputField
                      label="Net Salary"
                      name="netSalary"
                      value={form.netSalary}
                      className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 border-gray-300 bg-gray-200 cursor-not-allowed"
                      disabled
                    />
                  </div>

                  {/* Allowances Section */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <MultipleSelectDropdown
                      label="Allowance Type"
                      value={selectedAllowanceTypes}
                      onChange={handleAllowanceChange}
                      options={allowanceOptions}
                      placeholder="Select allowance types"
                      disabled={isMrListEmpty}
                    />
                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Total Allowance
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={totalAllowance.toFixed(2)}
                          readOnly
                          className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 cursor-not-allowed"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAllowanceBreakdown(true)}
                          disabled={isMrListEmpty}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Status
                      </label>
                      <select
                        name="status"
                        value={form.status}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            status: e.target.value,
                          }))
                        }
                        disabled={isMrListEmpty}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  </div>

                  {/* Source Field - SearchableDropdown */}
                  <div className="mb-6">
                    <SearchableDropdown
                      label="Source"
                      value={form.source}
                      onChange={handleSourceChange}
                      options={sourceOptions}
                      placeholder={
                        sourceLoading ? "Loading sources..." : "Select Source"
                      }
                      required={true}
                      loading={sourceLoading}
                      error={errors.source}
                      disabled={isMrListEmpty || sourceLoading}
                    />
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remarks
                    </label>
                    <textarea
                      value={form.remarks || ""}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          remarks: e.target.value,
                        }))
                      }
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      rows="3"
                    />
                  </div>

                  {/* Salary Summary */}
                  <div className="mt-8 p-4 bg-white rounded-md shadow-md">
                    <h3 className="text-lg font-semibold mb-4 text-center">
                      Salary Summary
                    </h3>
                    <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
                      <thead className="bg-gray-200 text-gray-700 border-b">
                        <tr>
                          <th className="p-3 font-medium text-gray-700">
                            Basic Salary ($)
                          </th>
                          <th className="p-3 font-medium text-gray-700">
                            Allowance ($)
                          </th>
                          <th className="p-3 font-medium text-gray-700">
                            Deductions ($)
                          </th>
                          <th className="p-3 font-medium text-gray-700">
                            Net Salary ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="bg-white hover:bg-gray-50">
                          <td className="p-3 font-semibold">
                            {form.basicSalary || "0.00"}
                          </td>
                          <td className="p-3 font-semibold">
                            {totalAllowance.toFixed(2)}
                          </td>
                          <td className="p-3 font-semibold text-red-600">
                            -{form.deductions || "0.00"}
                          </td>
                          <td className="p-3 font-semibold text-green-600">
                            {form.netSalary}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    >
                      Update Payroll
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* View Payroll Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-lg relative flex flex-col">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">
                  View Payroll
                </h2>
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Payroll Code
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {form.payrollCode}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Employee Name
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 capitalize">
                      {form.employeeName}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Basic Salary
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatCurrency(form.basicSalary)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Total Allowances
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatCurrency(totalAllowance)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Deductions
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatCurrency(form.deductions)}
                    </p>
                  </div>
                </div>

                <div
                  className={`grid gap-4 mb-6 ${
                    form.status === "paid"
                      ? "grid-cols-1 md:grid-cols-2"
                      : "grid-cols-1 md:grid-cols-3"
                  }`}
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Net Salary
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 font-semibold">
                      {formatCurrency(form.netSalary)}
                    </p>
                  </div>

                  {/* Show Source in view modal */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Source
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 capitalize">
                      {getSourceLabel(form.source)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Status
                    </label>
                    <p
                      className={`border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 capitalize ${
                        form.status === "paid"
                          ? "text-green-600"
                          : form.status === "pending"
                          ? "text-yellow-600"
                          : "text-red-600"
                      }`}
                    >
                      {form.status}
                    </p>
                  </div>
                </div>

                {/* Allowance Details in View Mode */}
                {form.allowances && form.allowances.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-600 mb-2">
                      Allowance Breakdown
                    </label>
                    <div className="border border-gray-300 rounded-lg overflow-hidden">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-sm font-medium text-gray-700">
                              Allowance Type
                            </th>
                            <th className="px-4 py-2 text-right text-sm font-medium text-gray-700">
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {form.allowances.map((allowance, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-sm text-gray-900 capitalize">
                                {allowance.type}
                              </td>
                              <td className="px-4 py-2 text-sm text-right font-medium">
                                {formatCurrency(allowance.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td className="px-4 py-2 text-sm font-semibold text-gray-900">
                              Total Allowances
                            </td>
                            <td className="px-4 py-2 text-sm font-semibold text-right text-green-600">
                              {formatCurrency(totalAllowance)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Remarks
                  </label>
                  <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 min-h-[80px]">
                    {form.remarks?.trim() ? form.remarks : "No Remarks"}
                  </p>
                </div>
              </div>
              <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="px-6 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Allowance Breakdown Modal */}
      {showAllowanceBreakdown && (
        <AllowanceBreakdownModal
          allowances={form.allowances || []}
          isOpen={showAllowanceBreakdown}
          onClose={() => setShowAllowanceBreakdown(false)}
          onAmountChange={handleAllowanceAmountChange}
          onRemove={removeAllowance}
        />
      )}
    </div>
  );
};

export default Payroll;