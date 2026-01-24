import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";

import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import { getTodayDate } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

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

const getCurrentMonth = () => {
  const now = new Date();
  return now.toISOString().slice(0, 7);
};

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

const AllowanceBreakdownModal = ({
  allowances,
  isOpen,
  onClose,
  onAmountChange,
  onRemove,
}) => {
  if (!isOpen) return null;

  const handleNumeric = (e, type) => {
    const { value } = e.target;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      onAmountChange(type, value);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Allowance Breakdown</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto">
          {allowances.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No allowances added
            </p>
          ) : (
            allowances.map((allowance, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 border rounded"
              >
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    {allowance.type}
                  </label>
                  <input
                    type="text"
                    value={allowance.amount}
                    onChange={(e) => handleNumeric(e, allowance.type)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(allowance.type)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const usePayrollForm = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    employeeId: "",
    period: "",
    basicSalary: "",
    allowances: [],
    deductions: "",
    netSalary: "0.00",
    status: "pending",
    source: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [showAllowanceBreakdown, setShowAllowanceBreakdown] = useState(false);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [salaryCalculation, setSalaryCalculation] = useState(null);
  const [calculatingSalary, setCalculatingSalary] = useState(false);
  const [showSalaryDetails, setShowSalaryDetails] = useState(false);

  // Fetch MR list from the correct endpoint
// Update the fetchMRList function in your AddPayroll.jsx:
const fetchMRList = useCallback(async () => {
  try {
    setMrListLoading(true);
    
    // Use the new endpoint to get MRs from basic payroll
    const response = await axios.get(`${backendUrl}/api/mrs/from-basic-payroll`);
    
    if (response.data.success) {
      const mrData = response.data.data || [];
      
      if (mrData.length > 0) {
        setMrList(mrData);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
        toast.error("No MRs found with basic salary. Please add basic salary for MRs first.");
      }
    } else {
      throw new Error(response.data.message || "Failed to fetch MR list");
    }
  } catch (error) {
    console.error("Error fetching MR list:", error);
    
    // Try alternative endpoint if the new one fails
    try {
      // Fallback to the original endpoint
      const fallbackResponse = await axios.get(`${backendUrl}/api/mrs/from-basic-payroll`);
       console.log('values fallbackResponse', fallbackResponse)
      if (fallbackResponse.data.success) {
        const mrData = fallbackResponse.data.data || [];
        
        if (mrData.length > 0) {
          setMrList(mrData);
          setIsMrListEmpty(false);
        } else {
          setMrList([]);
          setIsMrListEmpty(true);
          toast.error("No MRs available for payroll.");
        }
      } else {
        throw new Error("Failed to fetch MR list from fallback endpoint");
      }
    } catch (fallbackError) {
      console.error("Fallback also failed:", fallbackError);
      toast.error("Failed to load MR list. Please check the server connection.");
      setMrList([]);
      setIsMrListEmpty(true);
    }
  } finally {
    setMrListLoading(false);
  }
}, []);

  const fetchSourceOptions = useCallback(async () => {
    try {
      setSourceLoading(true);
      const response = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );

      if (response.data.success && Array.isArray(response.data.data)) {
        const options = response.data.data
          .filter((destination) => destination.totalAmount > 0)
          .map((destination) => ({
            value: destination._id,
            label: destination.name || `Account ${destination.code || destination._id}`,
          }));
        setSourceOptions(options);
      } else {
        setSourceOptions([]);
        console.warn(
          "Unexpected response format for destinations:",
          response.data,
        );
      }
    } catch (error) {
      console.error("Error fetching destination options:", error);
      toast.error("Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  // Calculate salary for employee and period
  const calculateSalary = useCallback(async (employeeId, period) => {
    if (!employeeId || !period) {
      setSalaryCalculation(null);
      setForm((prev) => ({
        ...prev,
        basicSalary: "",
        deductions: "",
      }));
      return;
    }

    try {
      setCalculatingSalary(true);
      const endpoint = `${backendUrl}/api/payrolls/calculate/${employeeId}/${period}`;      
      const response = await axios.get(endpoint);
      if (response.data.success && response.data.data) {
        const { salaryCalculation } = response.data.data;
        setSalaryCalculation(salaryCalculation);

        // Safely update form with calculated values
        setForm((prev) => ({
          ...prev,
          basicSalary: salaryCalculation?.totalSalary?.toFixed(2) || "",
          deductions: salaryCalculation?.leaveDeduction?.toFixed(2) || "",
        }));

        // Clear any previous errors
        setErrors((prev) => ({
          ...prev,
          basicSalary: "",
          deductions: "",
        }));
        
        toast.success("Salary calculated successfully based on attendance and leaves");
      }
    } catch (error) {
      console.error("❌ Error calculating salary:", error);
      console.error("Error details:", error.response?.data);

      if (error.response?.status === 404) {
        if (error.response.data?.message?.includes("Basic payroll record not found")) {
          toast.error(
            "Basic payroll record not found for this employee. Please set basic salary first in MR Basic Payroll.",
            { duration: 5000 }
          );
        } else {
          toast.error("Employee or payroll data not found");
        }
        setSalaryCalculation(null);
        setForm((prev) => ({
          ...prev,
          basicSalary: "",
          deductions: "",
        }));
      } else if (error.response?.status === 400) {
        toast.error(error.response.data?.message || "Invalid period format");
      } else if (error.response?.status === 500) {
        toast.error("Server error calculating salary. Please try again.");
      } else if (error.code === "ERR_NETWORK") {
        toast.error("Network error. Please check connection.");
      } else {
        toast.error("Failed to calculate salary");
      }
      
      setSalaryCalculation(null);
    } finally {
      setCalculatingSalary(false);
    }
  }, []);

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.employeeId.trim()) newErrors.employeeId = "Employee is required";
    if (!form.period) newErrors.period = "Pay period is required";
    else if (form.period > getCurrentMonth())
      newErrors.period = "Future months are not allowed";

    if (!form.basicSalary) newErrors.basicSalary = "Basic Salary is required";
    if (!form.source) newErrors.source = "Source is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  const handleSourceChange = useCallback((sourceId) => {
    setForm((prev) => ({ ...prev, source: sourceId }));
    setErrors((prev) => ({ ...prev, source: "" }));
  }, []);

  const allowanceOptions = useMemo(
    () =>
      allowanceTypes.map((t) => ({
        value: t,
        label: t,
      })),
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
      setForm((prev) => ({ ...prev, employeeId }));
      setErrors((prev) => ({ ...prev, employeeId: "" }));

      // Reset salary calculation when employee changes
      setSalaryCalculation(null);
      setForm((prev) => ({
        ...prev,
        basicSalary: "",
        deductions: "",
      }));

      if (employeeId && form.period) {
        calculateSalary(employeeId, form.period);
      }
    },
    [form.period, calculateSalary],
  );

  const handlePeriodChange = useCallback(
    (period) => {
      setForm((prev) => ({ ...prev, period }));
      setErrors((prev) => ({ ...prev, period: "" }));

      // Reset salary calculation when period changes
      setSalaryCalculation(null);
      setForm((prev) => ({
        ...prev,
        basicSalary: "",
        deductions: "",
      }));

      if (form.employeeId && period) {
        calculateSalary(form.employeeId, period);
      }
    },
    [form.employeeId, calculateSalary],
  );

  const totalAllowance = useMemo(() => {
    if (!form.allowances || !Array.isArray(form.allowances)) return 0;
    return form.allowances.reduce((total, allowance) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("Please fix the form errors");
      return;
    }

    try {
      setLoading(true);
      
      // Validate allowances
      const processedAllowances = form.allowances
        .filter(allowance => allowance.type && allowance.amount)
        .map(allowance => ({
          type: allowance.type,
          amount: parseFloat(allowance.amount) || 0
        }));

      const payload = {
        ...form,
        totalAllowance: totalAllowance.toFixed(2),
        allowances: processedAllowances,
        basicSalary: parseFloat(form.basicSalary) || 0,
        deductions: parseFloat(form.deductions) || 0,
        netSalary: parseFloat(form.netSalary) || 0,
      };

      const res = await axios.post(`${backendUrl}/api/payrolls`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      
      const data = res.data;

      if (res.status === 201 || res.status === 200) {
        toast.success(data.message || "Payroll added successfully");
        setTimeout(() => {
          navigate("/hrmlayout/payroll");
        }, 1000);
      } else {
        throw new Error(data.message || "Failed to save payroll");
      }
    } catch (error) {
      console.error("❌ Payroll submission error:", error);
      
      if (error.response?.status === 400) {
        if (error.response.data?.errors) {
          error.response.data.errors.forEach(err => {
            toast.error(err.message || err.msg);
          });
        } else if (error.response.data?.message) {
          toast.error(error.response.data.message);
        } else {
          toast.error("Invalid data. Please check your inputs.");
        }
      } else if (error.response?.status === 404) {
        toast.error(error.response.data?.message || "Employee or account not found");
      } else if (error.response?.status === 409) {
        toast.error(error.response.data?.message || "Payroll already exists for this period");
      } else if (error.code === "ERR_NETWORK") {
        toast.error("Network error. Please check your connection.");
      } else {
        toast.error(error.message || "Failed to save payroll");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMRList();
    fetchSourceOptions();
  }, [fetchMRList, fetchSourceOptions]);

  return {
    form,
    errors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    sourceOptions,
    sourceLoading,
    salaryCalculation,
    calculatingSalary,
    showSalaryDetails,
    setShowSalaryDetails,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSourceChange,
    handleSubmit,
    setForm,
    validate,
  };
};

const SalaryDetailsModal = ({ calculation, isOpen, onClose }) => {
  if (!isOpen || !calculation) return null;

  const formatNumber = (value) => {
    if (value === null || value === undefined) return "0.00";
    if (typeof value === "number") return value.toFixed(2);
    if (typeof value === "string") {
      const num = parseFloat(value);
      return isNaN(num) ? "0.00" : num.toFixed(2);
    }
    return "0.00";
  };

  const formatCount = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Salary Calculation Details</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-sm font-medium text-gray-700">
              Basic Salary:
            </div>
            <div className="text-sm">
              ${formatNumber(calculation.basicSalary)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Per Day Salary:
            </div>
            <div className="text-sm">
              ${formatNumber(calculation.perDaySalary)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Per Minute Salary:
            </div>
            <div className="text-sm">
              ${formatNumber(calculation.perMinuteSalary)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Working Days:
            </div>
            <div className="text-sm">
              {formatCount(calculation.totalWorkingDays)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Present Days:
            </div>
            <div className="text-sm">
              {formatCount(calculation.presentDays)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Total Leaves:
            </div>
            <div className="text-sm">
              {formatCount(calculation.totalLeaves)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Paid Leaves:
            </div>
            <div className="text-sm">{formatCount(calculation.paidLeaves)}</div>

            <div className="text-sm font-medium text-gray-700">
              Unpaid Leaves:
            </div>
            <div className="text-sm">
              {formatCount(calculation.unpaidLeaves)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Swap Leaves:
            </div>
            <div className="text-sm">{formatCount(calculation.swapLeaves)}</div>

            <div className="text-sm font-medium text-gray-700 text-red-600">
              Leave Deduction:
            </div>
            <div className="text-sm text-red-600">
              -${formatNumber(calculation.leaveDeduction)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Adjusted Basic Salary:
            </div>
            <div className="text-sm">
              ${formatNumber(calculation.adjustedBasicSalary)}
            </div>

            <div className="text-sm font-medium text-gray-700 text-green-600">
              Extra Minutes:
            </div>
            <div className="text-sm text-green-600">
              {formatNumber(calculation.extraMinutes)} mins
            </div>

            <div className="text-sm font-medium text-gray-700 text-green-600">
              Extra Time Amount:
            </div>
            <div className="text-sm text-green-600">
              +${formatNumber(calculation.extraTimeAmount)}
            </div>

            <div className="text-sm font-medium text-gray-700">
              Total Salary:
            </div>
            <div className="text-sm font-semibold">
              ${formatNumber(calculation.totalSalary)}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const AddPayroll = () => {
  const {
    form,
    errors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    sourceOptions,
    sourceLoading,
    salaryCalculation,
    calculatingSalary,
    showSalaryDetails,
    setShowSalaryDetails,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSourceChange,
    handleSubmit,
    setForm,
  } = usePayrollForm();

  const navigate = useNavigate();

  useEffect(() => {
    const currentMonth = getCurrentMonth();
    setForm((prev) => ({ ...prev, period: currentMonth }));
  }, [setForm]);

  const mrOptions = useMemo(() => {
    if (mrListLoading) {
      return [
        {
          value: "",
          label: "Loading MRs...",
          disabled: true,
        },
      ];
    }

    if (isMrListEmpty) {
      return [
        {
          value: "",
          label: "No MRs Available",
          disabled: true,
        },
      ];
    }

    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty, mrListLoading]);

  const selectedAllowanceTypes = useMemo(() => {
    if (!form.allowances || !Array.isArray(form.allowances)) return [];
    return form.allowances.map((allowance) => allowance.type);
  }, [form.allowances]);

  const isFormValid = useMemo(
    () =>
      form.employeeId &&
      form.period &&
      form.basicSalary &&
      form.source &&
      !errors.period &&
      !errors.employeeId &&
      !errors.basicSalary &&
      !errors.source,
    [form, errors],
  );

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        Add New Payroll
      </h2>

      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                No MRs Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one MR with basic salary before creating payroll
                  records. Please go to MR Basic Payroll first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <SearchableDropdown
            label="MR Name"
            value={form.employeeId}
            onChange={handleEmployeeChange}
            options={mrOptions}
            placeholder={mrListLoading ? "Loading..." : isMrListEmpty ? "No MRs Available" : "Select MR"}
            required={true}
            loading={mrListLoading}
            error={errors.employeeId}
            disabled={isMrListEmpty || mrListLoading}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pay Period <span className="text-red-500">*</span>
            </label>
            <input
              type="month"
              name="period"
              value={form.period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              max={getCurrentMonth()}
              disabled={isMrListEmpty}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                errors.period
                  ? "border-red-500 focus:ring-red-200 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              } ${isMrListEmpty ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
            />
            {errors.period && (
              <p className="mt-1 text-sm text-red-600">{errors.period}</p>
            )}
          </div>

          <SearchableDropdown
            label="Source Account"
            value={form.source}
            onChange={handleSourceChange}
            options={sourceOptions}
            placeholder={sourceLoading ? "Loading sources..." : "Select Source"}
            required={true}
            loading={sourceLoading}
            error={errors.source}
            disabled={isMrListEmpty || sourceLoading}
          />
        </div>

        {salaryCalculation && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-medium text-blue-800">
                  Salary Calculated Automatically
                </h4>
                <p className="text-sm text-blue-700">
                  Based on attendance and leave records (including swap leaves
                  and extra time)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSalaryDetails(true)}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View Details
              </button>
            </div>
          </div>
        )}

        {calculatingSalary && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600 mr-2"></div>
              <span className="text-sm text-yellow-700">
                Calculating salary based on attendance, leaves, and extra
                time...
              </span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Basic Salary ($) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="basicSalary"
              value={form.basicSalary}
              onChange={handleNumeric}
              placeholder="0.00"
              disabled={isMrListEmpty || calculatingSalary}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                errors.basicSalary
                  ? "border-red-500 focus:ring-red-200 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              } ${
                isMrListEmpty || calculatingSalary
                  ? "bg-gray-100 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
            {errors.basicSalary && (
              <p className="mt-1 text-sm text-red-600">{errors.basicSalary}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deductions ($)
            </label>
            <input
              type="text"
              name="deductions"
              value={form.deductions}
              readOnly
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">
              Automatically calculated based on unpaid leaves
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Net Salary ($)
            </label>
            <input
              type="text"
              name="netSalary"
              value={form.netSalary}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed font-semibold"
            />
            <p className="text-xs text-gray-500 mt-1">
              Basic Salary + Allowances - Deductions
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <MultipleSelectDropdown
            label="Allowance Type"
            value={selectedAllowanceTypes}
            onChange={handleAllowanceChange}
            options={allowanceOptions}
            placeholder="Select allowance types"
            disabled={isMrListEmpty || calculatingSalary}
          />
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Total Allowance ($)
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
                disabled={
                  isMrListEmpty ||
                  !form.allowances ||
                  form.allowances.length === 0 ||
                  calculatingSalary
                }
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                View
              </button>
            </div>
          </div>
        </div>

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
                <th className="p-3 font-medium text-gray-700">Allowance ($)</th>
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

        <div className="flex justify-end mt-10 gap-4">
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/payroll")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors
             text-lg font-medium transform hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={
              loading || !isFormValid || isMrListEmpty || calculatingSalary
            }
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || !isFormValid || isMrListEmpty || calculatingSalary
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading
              ? "Saving…"
              : calculatingSalary
                ? "Calculating…"
                : "Save Payroll"}
          </button>
        </div>
      </form>

      <SalaryDetailsModal
        calculation={salaryCalculation}
        isOpen={showSalaryDetails}
        onClose={() => setShowSalaryDetails(false)}
      />

      <AllowanceBreakdownModal
        allowances={form.allowances || []}
        isOpen={showAllowanceBreakdown}
        onClose={() => setShowAllowanceBreakdown(false)}
        onAmountChange={handleAllowanceAmountChange}
        onRemove={removeAllowance}
      />
    </div>
  );
};

export default AddPayroll;