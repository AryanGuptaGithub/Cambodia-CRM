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
  Download,
  Menu,
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
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const payrollsPerPage = 7;
const advancesPerPage = 7;

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

// ─── Custom hook for payroll form (unchanged) ─────────────────────────────
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
    source: "",
    ...initialForm,
  });

  const [errors, setErrors] = useState({});
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [showAllowanceBreakdown, setShowAllowanceBreakdown] = useState(false);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await fetch(`${backendUrl}/api/staff`);
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

  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  const allowanceOptions = useMemo(
    () => allowanceTypes.map((t) => ({ value: t, label: t })),
    [],
  );

  const handleAllowanceChange = useCallback((selectedTypes) => {
    setForm((prev) => {
      const currentAllowances = prev.allowances || [];
      const updatedAllowances = currentAllowances.filter((allowance) =>
        selectedTypes.includes(allowance.type),
      );
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
        allowance.type === type ? { ...allowance, amount } : allowance,
      ),
    }));
  }, []);

  const removeAllowance = useCallback((type) => {
    setForm((prev) => ({
      ...prev,
      allowances: prev.allowances.filter(
        (allowance) => allowance.type !== type,
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
    [mrList],
  );

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

  useEffect(() => {
    setForm((prev) => ({ ...prev, netSalary }));
  }, [netSalary]);

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

// ─── MultipleSelectDropdown Component ─────────────────────────
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
    option.label.toLowerCase().includes(searchTerm.toLowerCase()),
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
            {loading ? (
              <div className="px-3 py-2 text-gray-500">Loading...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500">No options found</div>
            ) : (
              filteredOptions.map((option) => (
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
                    onChange={() => {}}
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

// ─── AllowanceBreakdownModal (unchanged) ─────────────────────────────────
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
    document.body,
  );
};

// ─── CustomDateRangeModal (unchanged) ────────────────────────────────────
const CustomDateRangeModal = ({ isOpen, onClose, onDateRangeSelect }) => {
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
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
                maxDate={today}
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
                maxDate={today}
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
    document.body,
  );
};

// ─── DateSelectionTabs (unchanged) ───────────────────────────────────────
const DateSelectionTabs = ({ onDateRangeSelect, selectedRange }) => {
  const [activeTab, setActiveTab] = useState("previousMonth");
  const [showCustomModal, setShowCustomModal] = useState(false);

  const getCurrentDateInfo = () => {
    const now = new Date();
    return {
      now,
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth(),
    };
  };

  const getPreviousMonthRange = () => {
    const { currentYear, currentMonth } = getCurrentDateInfo();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
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
      start: new Date(prevYear, prevMonth, 1),
      end: new Date(prevYear, prevMonth + 1, 0),
      label: monthNames[prevMonth],
    };
  };

  const getJanToPreviousMonthRange = () => {
    const { currentYear, currentMonth } = getCurrentDateInfo();
    if (currentMonth === 0) {
      return {
        start: new Date(currentYear - 1, 0, 1),
        end: new Date(currentYear - 1, 11, 31),
        label: `Jan to Dec ${currentYear - 1}`,
      };
    }
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
    return {
      start: new Date(currentYear, 0, 1),
      end: new Date(currentYear, currentMonth, 0),
      label: `Jan to ${monthNames[currentMonth - 1]}`,
    };
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === "previousMonth") onDateRangeSelect(getPreviousMonthRange());
    else if (tab === "janToPrevious")
      onDateRangeSelect(getJanToPreviousMonthRange());
    else if (tab === "custom") setShowCustomModal(true);
  };

  const tabLabels = {
    previousMonth: getPreviousMonthRange().label,
    janToPrevious: getJanToPreviousMonthRange().label,
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Filter by Month Range
        </h3>
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {[
            ["previousMonth", tabLabels.previousMonth],
            ["janToPrevious", tabLabels.janToPrevious],
            ["custom", "Custom Calendar"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === key
                  ? "border-b-2 border-blue-500 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => handleTabClick(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <CustomDateRangeModal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        onDateRangeSelect={(range) => {
          onDateRangeSelect(range);
          setActiveTab("custom");
        }}
      />
    </>
  );
};

// ─── YearFilterButtons (unchanged) ───────────────────────────────────────
const YearFilterButtons = ({
  allPayrolls,
  selectedYear,
  onYearSelect,
  isMobileView,
}) => {
  const currentYear = new Date().getFullYear();

  const years = useMemo(() => {
    const yearSet = new Set([currentYear]);
    allPayrolls.forEach((p) => {
      if (p.period) {
        const yr = parseInt(p.period.split("-")[0], 10);
        if (!isNaN(yr)) yearSet.add(yr);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [allPayrolls, currentYear]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Filter by Year
      </h3>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onYearSelect(null)}
          className={`px-3 md:px-4 py-1.5 md:py-1.5 rounded-full text-xs md:text-sm font-medium border transition-all ${
            selectedYear === null
              ? "bg-indigo-600 text-white border-indigo-600 shadow"
              : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600"
          }`}
        >
          All Years
        </button>
        {years.map((yr) => (
          <button
            key={yr}
            onClick={() => onYearSelect(yr)}
            className={`px-3 md:px-4 py-1.5 md:py-1.5 rounded-full text-xs md:text-sm font-medium border transition-all ${
              selectedYear === yr
                ? "bg-indigo-600 text-white border-indigo-600 shadow"
                : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400 hover:text-indigo-600"
            }`}
          >
            {yr}
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── CSVImportModal (unchanged) ──────────────────────────────────────────
const CSVImportModal = ({ isOpen, onClose, onImport }) => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (
        selectedFile.type === "text/csv" ||
        selectedFile.name.endsWith(".csv")
      ) {
        setFile(selectedFile);
        setImportResult(null);
      } else {
        showToast("error", "Please select a CSV file");
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      showToast("error", "Please select a CSV file first");
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(
        `${backendUrl}/api/hrm/payroll/import/csv`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (response.data.success) {
        setImportResult(response.data.data);
        showToast(
          "success",
          `Imported ${response.data.data.success} payrolls successfully`,
        );
        if (response.data.data.failed > 0)
          showToast(
            "error",
            `${response.data.data.failed} payrolls failed to import`,
          );
        if (onImport) onImport();
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Failed to import CSV",
      );
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/hrm/payroll/import/template`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "payroll_import_template.csv");
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "Template downloaded successfully");
    } catch {
      showToast("error", "Failed to download template");
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Import Payrolls from CSV</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload CSV File
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer ${
                file
                  ? "border-green-500 bg-green-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
              onClick={() => fileInputRef.current.click()}
            >
              {file ? (
                <div>
                  <p className="text-green-600 font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-gray-600">Click to select CSV file</p>
                  <p className="text-sm text-gray-500 mt-1">
                    or drag and drop here
                  </p>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>
          {importResult && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-800 mb-2">Import Results</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total:</span>
                  <span className="font-medium">{importResult.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">Successful:</span>
                  <span className="font-medium text-green-600">
                    {importResult.success}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-red-600">Failed:</span>
                  <span className="font-medium text-red-600">
                    {importResult.failed}
                  </span>
                </div>
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="mt-3">
                  <h5 className="text-sm font-medium text-gray-700 mb-1">
                    Errors:
                  </h5>
                  <div className="max-h-40 overflow-y-auto text-xs">
                    {importResult.errors.map((error, index) => (
                      <p key={index} className="text-red-600 mb-1">
                        {error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Download Template
            </button>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!file || loading}
            className={`px-4 py-2 rounded-md text-white ${
              !file || loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? "Importing..." : "Import CSV"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ============================================================================
// Simplified Advance List Component (no date/year filters)
// ============================================================================
const AdvanceList = ({ isMobileView, onDelete }) => {
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const fetchAdvances = async (page = 1) => {
    try {
      setLoading(true);
      const params = { page, limit: advancesPerPage };
      const res = await axios.get(`${backendUrl}/api/hrm/mr-advance`, {
        params,
      });
      if (res.data.success) {
        setAdvances(res.data.data);
        setTotalPages(res.data.pagination.pages);
        setTotalItems(res.data.pagination.total);
      } else {
        throw new Error(res.data.message);
      }
    } catch (err) {
      setError(err.message);
      showToast("error", "Failed to load advances");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvances(1);
  }, []);

  const filteredAdvances = useMemo(() => {
    if (!advances.length) return [];
    return advances.filter(
      (a) =>
        a.employeeId?.medicalRepName
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        a.sourceAccount?.name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        a.remarks?.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [advances, searchTerm]);

  const currentAdvances = filteredAdvances.slice(
    (currentPage - 1) * advancesPerPage,
    currentPage * advancesPerPage,
  );

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);

  const getStatusBadge = (status) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      adjusted: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const handleDelete = async (adv) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete advance of $${adv.amount} for ${adv.employeeId?.medicalRepName}?`,
    });
    if (confirm.isConfirmed) {
      try {
        await axios.delete(`${backendUrl}/api/hrm/mr-advance/${adv._id}`);
        showToast("success", "Advance deleted");
        fetchAdvances(currentPage);
      } catch (err) {
        showToast("error", err.response?.data?.message || "Delete failed");
      }
    }
  };

  if (loading)
    return <div className="text-center py-8 text-sm">Loading advances...</div>;
  if (error)
    return (
      <div className="text-center py-8 text-red-600 text-sm">
        Error: {error}
      </div>
    );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="relative w-full md:w-64">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={isMobileView ? 14 : 16}
          />
          <input
            type="text"
            placeholder="Search advances..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className={`pl-9 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 ${isMobileView ? "text-sm" : ""}`}
          />
        </div>
        <div className="bg-blue-50 px-3 md:px-4 py-1.5 md:py-2 rounded-lg">
          <p
            className={`font-medium text-blue-800 ${isMobileView ? "text-xs" : "text-sm"}`}
          >
            Total: <span className="font-bold">{totalItems}</span>
          </p>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium text-left`}
              >
                Employee
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Date</th>
              )}
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Source
              </th>
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Amount
              </th>
              {!isMobileView && (
                <th className="p-3 text-sm font-medium">Remarks</th>
              )}
              <th
                className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
              >
                Status
              </th>
              {!isMobileView && (
                <th className={"p-3 text-sm font-medium"}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {currentAdvances.length === 0 ? (
              <tr>
                <td
                  colSpan={isMobileView ? 5 : 7}
                  className="p-6 text-gray-500 text-sm"
                >
                  No advances found.
                </td>
              </tr>
            ) : (
              currentAdvances.map((adv, idx) => (
                <tr
                  key={adv._id}
                  className={`hover:bg-gray-50 ${
                    idx < currentAdvances.length - 1 ? "border-b" : ""
                  }`}
                >
                  <td
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-left font-medium`}
                  >
                    {adv.employeeId?.medicalRepName ||
                      adv.employeeId?.name ||
                      "Unknown"}
                    {isMobileView && (
                      <div className="text-xs text-gray-400 mt-0.5">
                        {formatDateToReadable(adv.date)}
                      </div>
                    )}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-sm">
                      {formatDateToReadable(adv.date)}
                    </td>
                  )}
                  <td
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                  >
                    {adv.sourceAccount?.name || "N/A"}
                  </td>
                  <td
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold`}
                  >
                    {formatCurrency(adv.amount)}
                  </td>
                  {!isMobileView && (
                    <td className="p-3 text-sm">{adv.remarks || "-"}</td>
                  )}
                  <td
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                  >
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadge(
                        adv.status,
                      )}`}
                    >
                      {adv.status}
                    </span>
                  </td>
                  {!isMobileView && (
                    <td className={"p-3 text-sm"}>
                      <button
                        onClick={() => handleDelete(adv)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
          >
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setCurrentPage(p)}
              className={`px-3 py-1 rounded text-sm ${
                currentPage === p
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN Payroll Component with Tabs
// ============================================================================
const Payroll = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("payroll");

  // ─── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ─── All existing payroll state and functions ───────────────────────────
  const [payrolls, setPayrolls] = useState([]);
  const [allPayrolls, setAllPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState(null);
  const [selectedYear, setSelectedYear] = useState(null);
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

  // ─── Functions ──────────────────────────────────────────────────────────
  const fetchSourceOptions = useCallback(async () => {
    try {
      setSourceLoading(true);
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      if (destinationResponse.data && Array.isArray(destinationResponse.data)) {
        const options = destinationResponse.data
          .filter((d) => d.totalAmount > 0)
          .map((d) => ({
            value: d._id || d.id,
            label:
              typeof d.name === "string"
                ? d.name
                : typeof d.destinationName === "string"
                  ? d.destinationName
                  : `Destination ${d._id}`,
          }));
        setSourceOptions(options);
      } else {
        setSourceOptions([]);
      }
    } catch (error) {
      showToast("error", "Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const handleSourceChange = (sourceId) => {
    setForm((prev) => ({ ...prev, source: sourceId }));
    setErrors((prev) => ({ ...prev, source: "" }));
  };

  const exportToCSV = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/hrm/payroll/export/csv`,
        { responseType: "blob" },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `payrolls_export_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      showToast("success", "Payrolls exported successfully");
    } catch (error) {
      showToast("error", "Failed to export payrolls");
    }
  };

  const handleCSVImportSuccess = () => {
    fetchPayrolls();
  };

  useEffect(() => {
    fetchPayrolls();
    fetchSourceOptions();
  }, []);

  const fetchPayrolls = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${backendUrl}/api/hrm/payroll`);
      if (response.data.success) {
        const payrollData = response.data.data || [];
        setAllPayrolls(payrollData);
        setPayrolls(payrollData);
        if (response.data.nextPayrollCode)
          setNextPayrollCode(response.data.nextPayrollCode);
      } else {
        throw new Error(response.data.message || "Failed to fetch payrolls");
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load payroll data");
    } finally {
      setLoading(false);
    }
  };

  const filterPayrollsByDateRange = (
    dateRange,
    payrollsToFilter = allPayrolls,
  ) => {
    if (!dateRange || !dateRange.start || !dateRange.end)
      return payrollsToFilter;
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    return payrollsToFilter.filter((payroll) => {
      if (!payroll.period) return false;
      const [year, month] = payroll.period.split("-").map(Number);
      const payrollDate = new Date(year, month - 1, 1);
      return payrollDate >= startDate && payrollDate <= endDate;
    });
  };

  const handleDateRangeSelect = (dateRange) => {
    setSelectedDateRange(dateRange);
    setSelectedYear(null);
    setCurrentPage(1);
    setPayrolls(filterPayrollsByDateRange(dateRange, allPayrolls));
  };

  const handleClearDateFilter = () => {
    setSelectedDateRange(null);
    setPayrolls(allPayrolls);
    setCurrentPage(1);
  };

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setSelectedDateRange(null);
    setCurrentPage(1);
    if (year === null) {
      setPayrolls(allPayrolls);
    } else {
      setPayrolls(
        allPayrolls.filter((p) => {
          if (!p.period) return false;
          return parseInt(p.period.split("-")[0], 10) === year;
        }),
      );
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDateRange, selectedYear]);

  const filteredPayrolls = useMemo(() => {
    if (!payrolls.length) return [];
    return payrolls.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.designation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.paymentMethod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payrollCode?.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [payrolls, searchTerm]);

  const totalPages = Math.ceil(filteredPayrolls.length / payrollsPerPage);
  const currentPayrolls = filteredPayrolls.slice(
    (currentPage - 1) * payrollsPerPage,
    currentPage * payrollsPerPage,
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2)
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", currentPage, "...", totalPages];
  }

  const visiblePages = getVisiblePages(currentPage, totalPages);

  const toggleSelect = (payroll) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.id === payroll._id);
      if (exists) return prev.filter((p) => p.id !== payroll._id);
      return [...prev, { id: payroll._id, name: payroll.employeeName }];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked)
      setSelected(
        currentPayrolls.map((s) => ({ id: s._id, name: s.employeeName })),
      );
    else setSelected([]);
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      showToast("warning", "Please select payroll records to delete");
      return;
    }
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${selected.length} payroll records?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/hrm/payroll`, {
          data: { ids: selected.map((s) => s.id) },
        });
        if (res.data.success) {
          showToast("success", "Selected payroll records deleted successfully");
          await fetchPayrolls();
          setSelected([]);
        } else throw new Error(res.data.message);
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message ||
            "Failed to delete selected payroll records",
        );
      }
    }
  };

  const deletePayroll = async (payroll) => {
    if (!payroll._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete Payroll",
      text: `Are you sure you want to delete payroll record for <b>${payroll.employeeName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/hrm/payroll/${payroll._id}`,
        );
        if (res.data.success) {
          showToast(
            "success",
            `Payroll record for <b>${payroll.employeeName}</b> deleted successfully`,
          );
          await fetchPayrolls();
          setSelected((prev) => prev.filter((p) => p.id !== payroll._id));
        } else throw new Error(res.data.message);
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete payroll record",
        );
      }
    }
  };

  const formatPeriodToMonth = (period) => {
    if (!period) return "N/A";
    try {
      const [, month] = period.split("-").map(Number);
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
      return month >= 1 && month <= 12 ? monthNames[month - 1] : "N/A";
    } catch {
      return "N/A";
    }
  };

  const formatPeriodToYear = (period) => {
    if (!period) return "N/A";
    return period.split("-")[0] || "N/A";
  };

  const editPayroll = async (payroll) => {
    try {
      let allowances = [];
      if (Array.isArray(payroll.allowances)) allowances = payroll.allowances;
      else if (typeof payroll.allowances === "string") {
        try {
          allowances = JSON.parse(payroll.allowances);
        } catch {
          const amt = parseFloat(payroll.allowances);
          if (!isNaN(amt))
            allowances = [{ type: "Total Allowance", amount: amt }];
        }
      } else if (typeof payroll.allowances === "number")
        allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
      if (!Array.isArray(allowances)) allowances = [];
      await fetchMRList();
      setForm({
        ...payroll,
        employeeId: payroll.employeeId || "",
        employeeName: payroll.employeeName || "",
        period: payroll.period || "",
        basicSalary: payroll.basicSalary?.toString() || "",
        allowances,
        deductions: payroll.deductions?.toString() || "",
        netSalary: payroll.netSalary?.toString() || "0.00",
        status: payroll.status || "pending",
        paymentMethod: payroll.paymentMethod || "",
        bankAccount: payroll.bankAccount || "",
        paymentDate: payroll.paymentDate || "",
        remarks: payroll.remarks || "",
        payrollCode: payroll.payrollCode || "",
        source:
          (typeof payroll.source === "object"
            ? payroll.source._id
            : payroll.source) || "",
        _id: payroll._id,
      });
      setIsEditModalOpen(true);
    } catch (error) {
      showToast("error", "Failed to load payroll data for editing");
    }
  };

  const handleView = async (payroll) => {
    try {
      let allowances = [];
      if (Array.isArray(payroll.allowances)) allowances = payroll.allowances;
      else if (typeof payroll.allowances === "string") {
        try {
          allowances = JSON.parse(payroll.allowances);
        } catch {
          const amt = parseFloat(payroll.allowances);
          if (!isNaN(amt))
            allowances = [{ type: "Total Allowance", amount: amt }];
        }
      } else if (typeof payroll.allowances === "number")
        allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
      if (!Array.isArray(allowances)) allowances = [];
      setForm({
        ...payroll,
        employeeId: payroll.employeeId || "",
        employeeName: payroll.employeeName || "",
        period: payroll.period || "",
        basicSalary: payroll.basicSalary?.toString() || "",
        allowances,
        deductions: payroll.deductions?.toString() || "",
        netSalary: payroll.netSalary?.toString() || "0.00",
        status: payroll.status || "pending",
        paymentMethod: payroll.paymentMethod || "",
        bankAccount: payroll.bankAccount || "",
        paymentDate: payroll.paymentDate || "",
        remarks: payroll.remarks || "",
        payrollCode: payroll.payrollCode || "",
        source:
          (typeof payroll.source === "object"
            ? payroll.source._id
            : payroll.source) || "",
        _id: payroll._id,
      });
      setIsViewModalOpen(true);
    } catch (error) {
      showToast("error", "Failed to load payroll data for viewing");
    }
  };

  const handleViewAllowances = (payroll) => {
    let allowances = [];
    if (Array.isArray(payroll.allowances)) allowances = payroll.allowances;
    else if (typeof payroll.allowances === "string") {
      try {
        allowances = JSON.parse(payroll.allowances);
      } catch {
        const amt = parseFloat(payroll.allowances);
        if (!isNaN(amt))
          allowances = [{ type: "Total Allowance", amount: amt }];
      }
    } else if (typeof payroll.allowances === "number")
      allowances = [{ type: "Total Allowance", amount: payroll.allowances }];
    setCurrentAllowances(allowances);
    setIsAllowanceModalOpen(true);
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  const handleUpdatePayroll = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        totalAllowance: totalAllowance.toFixed(2),
        allowances: form.allowances,
      };
      const res = await axios.put(
        `${backendUrl}/api/hrm/payroll/${form._id}`,
        payload,
      );
      if (res.data.success) {
        showToast(
          "success",
          `Payroll record for <b>${form.employeeName}</b> updated successfully`,
        );
        setIsEditModalOpen(false);
        await fetchPayrolls();
      } else throw new Error(res.data.message);
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update payroll record.",
      );
    }
  };

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(parseFloat(amount) || 0);

  const getTotalAllowance = (payroll) => {
    if (Array.isArray(payroll.allowances))
      return payroll.allowances.reduce(
        (total, a) => total + (a.amount || 0),
        0,
      );
    if (typeof payroll.allowances === "number") return payroll.allowances;
    if (typeof payroll.allowances === "string") {
      try {
        const p = JSON.parse(payroll.allowances);
        return Array.isArray(p)
          ? p.reduce((t, a) => t + (a.amount || 0), 0)
          : parseFloat(payroll.allowances) || 0;
      } catch {
        return parseFloat(payroll.allowances) || 0;
      }
    }
    return 0;
  };

  const mrOptions = useMemo(() => {
    if (isMrListEmpty) {
      if (form.employeeId && form.employeeName)
        return [{ value: form.employeeId, label: form.employeeName }];
      return [{ value: "", label: "No Employees Available", disabled: true }];
    }
    let options = mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `Employee ${mr._id}`,
    }));
    if (
      form.employeeId &&
      form.employeeName &&
      !options.some((opt) => opt.value === form.employeeId)
    )
      options = [
        ...options,
        { value: form.employeeId, label: form.employeeName },
      ];
    return options;
  }, [mrList, isMrListEmpty, form.employeeId, form.employeeName]);

  const selectedAllowanceTypes = useMemo(
    () => (form.allowances || []).map((a) => a.type),
    [form.allowances],
  );

  const getSourceLabel = (sourceId) => {
    if (!sourceId) return "Not specified";
    if (typeof sourceId === "object") {
      if (sourceId.name) return sourceId.name.toString();
      if (sourceId.destinationName) return sourceId.destinationName.toString();
      return `Destination ${sourceId._id || sourceId.id || "Unknown"}`;
    }
    const source = sourceOptions.find((opt) => opt.value === sourceId);
    return source ? source.label.toString() : sourceId.toString();
  };

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

  if (loading && activeTab === "payroll")
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );

  if (error && activeTab === "payroll")
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
    <div className={`${isMobileView ? "px-3 pb-20" : "p-6"} relative`}>
      {/* ── Sidebar (mobile only) ── */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">Payroll</h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {filteredPayrolls.length}
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="flex border-b border-gray-200 mb-4 md:mb-6">
        <button
          onClick={() => setActiveTab("payroll")}
          className={`py-2 px-4 font-medium text-sm focus:outline-none transition-colors ${
            activeTab === "payroll"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Payroll
        </button>
        <button
          onClick={() => setActiveTab("advance")}
          className={`py-2 px-4 font-medium text-sm focus:outline-none transition-colors ${
            activeTab === "advance"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Advance
        </button>
      </div>

      {activeTab === "payroll" ? (
        // ── Existing Payroll Content ────────────────────────────────────────
        <>
          {/* Desktop Header */}
          {!isMobileView && (
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
                  onClick={exportToCSV}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
                >
                  <Download size={18} /> Export CSV
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
          )}

          {/* MOBILE Search Bar */}
          {isMobileView && (
            <div className="relative mb-4">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                size={14}
              />
              <input
                type="text"
                placeholder="Search payrolls..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 text-sm"
              />
            </div>
          )}

          {/* Year Filter Buttons */}
          <YearFilterButtons
            allPayrolls={allPayrolls}
            selectedYear={selectedYear}
            onYearSelect={handleYearSelect}
            isMobileView={isMobileView}
          />

          {/* Month Range Tabs */}
          <DateSelectionTabs
            onDateRangeSelect={handleDateRangeSelect}
            selectedRange={selectedDateRange}
          />

          {/* Active filter badge */}
          {(selectedYear !== null || selectedDateRange) && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-xs md:text-sm text-indigo-700 font-medium bg-indigo-50 border border-indigo-200 px-2 md:px-3 py-1 rounded-full">
                {selectedYear !== null
                  ? `Showing payrolls for ${selectedYear}`
                  : `Showing: ${selectedDateRange?.label}`}
              </span>
              <button
                onClick={() => {
                  setSelectedYear(null);
                  setSelectedDateRange(null);
                  setPayrolls(allPayrolls);
                  setCurrentPage(1);
                }}
                className="text-xs md:text-sm text-gray-500 hover:text-red-600 font-medium flex items-center gap-1"
              >
                <X size={14} /> Clear filter
              </button>
            </div>
          )}

          {/* Payroll Table */}
          <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
            <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
              <thead className="bg-gray-100 text-gray-700 border-b">
                <tr>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium text-left`}
                  >
                    <div className="flex items-center gap-2 md:gap-4">
                      {!isMobileView && currentPayrolls.length > 0 && (
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
                      <span>Employee</span>
                    </div>
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Month
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Year
                  </th>
                  {!isMobileView && (
                    <th className="p-3 text-sm font-medium">Team</th>
                  )}
                  {!isMobileView && (
                    <th className="p-3 text-sm font-medium">Contact</th>
                  )}
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Basic
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Allow.
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Ded.
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Net
                  </th>
                  <th
                    className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-medium`}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentPayrolls.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isMobileView ? 9 : 11}
                      className="p-6 text-center text-gray-500 text-sm"
                    >
                      {selectedYear !== null
                        ? `No payroll records found for ${selectedYear}.`
                        : selectedDateRange
                          ? "No payroll records found for the selected date range."
                          : "No payroll records found."}
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
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-left`}
                      >
                        <div className="flex items-center gap-2 md:gap-4">
                          {!isMobileView && (
                            <input
                              type="checkbox"
                              checked={selected.some(
                                (s) => s.id === payroll._id,
                              )}
                              onChange={() => toggleSelect(payroll)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          )}
                          <span className="font-medium text-gray-900 capitalize">
                            {payroll.employeeName}
                          </span>
                          {isMobileView && (
                            <div className="text-xs text-gray-400">
                              {payroll.employeeId?.teamName || "N/A"}
                            </div>
                          )}
                        </div>
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600 font-medium`}
                      >
                        {formatPeriodToMonth(payroll.period)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600 font-medium`}
                      >
                        {formatPeriodToYear(payroll.period)}
                      </td>
                      {!isMobileView && (
                        <td className="p-3 text-sm text-gray-600 capitalize">
                          {payroll.employeeId?.teamName ||
                            payroll.teamName ||
                            "N/A"}
                        </td>
                      )}
                      {!isMobileView && (
                        <td className="p-3 text-sm text-gray-600">
                          {payroll.employeeId?.contactNo ||
                            payroll.contactNo ||
                            "N/A"}
                        </td>
                      )}
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-gray-600`}
                      >
                        <span
                          title={
                            payroll.payrollType === "current" &&
                            payroll.adjustedBasicSalary != null &&
                            payroll.adjustedBasicSalary !== payroll.basicSalary
                              ? `Full salary: ${formatCurrency(payroll.basicSalary)}`
                              : undefined
                          }
                          className={
                            payroll.payrollType === "current" &&
                            payroll.adjustedBasicSalary != null &&
                            payroll.adjustedBasicSalary !== payroll.basicSalary
                              ? "cursor-help"
                              : ""
                          }
                        >
                          {formatCurrency(
                            payroll.displayBasicSalary != null
                              ? payroll.displayBasicSalary
                              : payroll.basicSalary,
                          )}
                        </span>
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                      >
                        <div className="flex gap-1 justify-center items-center">
                          <span className="text-gray-600">
                            {formatCurrency(getTotalAllowance(payroll))}
                          </span>
                          <button
                            onClick={() => handleViewAllowances(payroll)}
                            className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50"
                            title="View Allowance Details"
                          >
                            <Eye size={isMobileView ? 14 : 18} />
                          </button>
                        </div>
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} text-red-600`}
                      >
                        {formatCurrency(payroll.deductions)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"} font-semibold text-green-600`}
                      >
                        {formatCurrency(payroll.netSalary)}
                      </td>
                      <td
                        className={`${isMobileView ? "p-2 text-xs" : "p-3 text-sm"}`}
                      >
                        <div className="flex items-center justify-center gap-2 md:gap-3">
                          <button
                            onClick={() => handleView(payroll)}
                            className="text-blue-600 hover:text-blue-800 cursor-pointer"
                            title="View Details"
                          >
                            <Eye size={isMobileView ? 16 : 18} />
                          </button>
                          {!isMobileView && (
                            <button
                              onClick={() => deletePayroll(payroll)}
                              className="text-red-600 hover:text-red-800 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {currentPayrolls.length > 0 && (
              <div
                className={`mt-4 p-3 md:p-5 flex ${isMobileView ? "justify-center" : "justify-start"} gap-1 md:gap-2 flex-wrap`}
              >
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-xs md:text-sm"
                >
                  Prev
                </button>
                {!isMobileView ? (
                  visiblePages.map((p, index) => (
                    <button
                      key={index}
                      onClick={() => typeof p === "number" && setCurrentPage(p)}
                      disabled={p === "..."}
                      className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm ${
                        p === "..."
                          ? "bg-gray-200 cursor-not-allowed"
                          : currentPage === p
                            ? "bg-indigo-600 text-white cursor-pointer"
                            : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
                      }`}
                    >
                      {p}
                    </button>
                  ))
                ) : (
                  <span className="px-3 py-1 text-xs text-gray-700 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-xs md:text-sm"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Modals (unchanged - keep existing modal code) */}
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
                                      (total, a) => total + (a.amount || 0),
                                      0,
                                    ),
                                  )}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
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
                                  (total, a) => total + (a.amount || 0),
                                  0,
                                ),
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
                                      (t, a) => t + (a.amount || 0),
                                      0,
                                    ) / currentAllowances.length
                                  : 0,
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
              document.body,
            )}

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
                      </div>

                      <div className="mb-6">
                        <SearchableDropdown
                          label="Source"
                          value={form.source}
                          onChange={handleSourceChange}
                          options={sourceOptions}
                          placeholder={
                            sourceLoading
                              ? "Loading sources..."
                              : "Select Source"
                          }
                          required
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

                      <div className="mt-8 p-4 bg-white rounded-md shadow-md">
                        <h3 className="text-lg font-semibold mb-4 text-center">
                          Salary Summary
                        </h3>
                        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
                          <thead className="bg-gray-200 text-gray-700 border-b">
                            <tr>
                              <th className="p-3 font-medium text-gray-700">
                                Basic Salary
                              </th>
                              <th className="p-3 font-medium text-gray-700">
                                Allowance
                              </th>
                              <th className="p-3 font-medium text-gray-700">
                                Deductions
                              </th>
                              <th className="p-3 font-medium text-gray-700">
                                Net Salary
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="bg-white hover:bg-gray-50">
                              <td className="p-3 font-semibold">
                                {formatCurrency(form.basicSalary || 0)}
                              </td>
                              <td className="p-3 font-semibold">
                                {formatCurrency(totalAllowance)}
                              </td>
                              <td className="p-3 font-semibold text-red-600">
                                -{formatCurrency(form.deductions || 0)}
                              </td>
                              <td className="p-3 font-semibold text-green-600">
                                {formatCurrency(form.netSalary || 0)}
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
              document.body,
            )}

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
                          {form.payrollCode || "N/A"}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Employee Name
                        </label>
                        <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 capitalize">
                          {form.employeeName || "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Basic Salary
                          {form.payrollType === "current" &&
                            form.adjustedBasicSalary != null &&
                            form.adjustedBasicSalary !== form.basicSalary && (
                              <span className="ml-1 text-xs text-gray-400 font-normal">
                                (Full: {formatCurrency(form.basicSalary)})
                              </span>
                            )}
                        </label>
                        <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                          {formatCurrency(
                            form.displayBasicSalary != null
                              ? form.displayBasicSalary
                              : form.basicSalary,
                          )}
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
                          {form.status || "N/A"}
                        </p>
                      </div>
                    </div>
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
              document.body,
            )}

          {showAllowanceBreakdown && (
            <AllowanceBreakdownModal
              allowances={form.allowances || []}
              isOpen={showAllowanceBreakdown}
              onClose={() => setShowAllowanceBreakdown(false)}
              onAmountChange={handleAllowanceAmountChange}
              onRemove={removeAllowance}
            />
          )}
        </>
      ) : (
        // ── Advance Tab Content ────────────────────────────────────────────────
        <AdvanceList isMobileView={isMobileView} />
      )}
    </div>
  );
};

export default Payroll;
