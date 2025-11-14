// src/pages/payroll/AddPayroll.jsx
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

/* -------------------------------------------------------------------------- */
/*  Allowance list – replace with API call if you have one                   */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*  Helper: current month in YYYY-MM format                                  */
/* -------------------------------------------------------------------------- */
const getCurrentMonth = () => {
  const now = new Date();
  return now.toISOString().slice(0, 7); // "2025-11"
};

/* -------------------------------------------------------------------------- */
/*  Custom hook – all payroll logic in one place                             */
/* -------------------------------------------------------------------------- */
const usePayrollForm = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    employeeId: "",
    period: "", // YYYY-MM
    basicSalary: "",
    allowances: [], // Changed to array of objects with type and amount
    deductions: "",
    netSalary: "0.00",
    status: "pending",
    source: "", // Added source field
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [showAllowanceBreakdown, setShowAllowanceBreakdown] = useState(false);

  // Added state for source/destination options
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(true);

  /* -------------------------- Fetch MR List -------------------------- */
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
      toast.error(error.message || "Failed to load employees");
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  /* -------------------------- Fetch Source/Destination Options -------------------------- */
  const fetchSourceOptions = useCallback(async () => {
    try {
      setSourceLoading(true);
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );

      if (destinationResponse.data && Array.isArray(destinationResponse.data)) {
        const options = destinationResponse.data
          .filter((destination) => destination.totalAmount > 0) // Filter where totalAmount > 0
          .map((destination) => ({
            value: destination._id || destination.id,
            label:
              destination.name ||
              destination.destinationName ||
              `Destination ${destination._id}`,
          }));
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
      toast.error("Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.employeeId.trim()) newErrors.employeeId = "Employee is required";
    if (!form.period) newErrors.period = "Pay period is required";
    else if (form.period > getCurrentMonth())
      newErrors.period = "Future months are not allowed";

    if (!form.basicSalary) newErrors.basicSalary = "Basic Salary is required";
    if (!form.source) newErrors.source = "Source is required"; // Added source validation

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  /* -------------------------- numeric input -------------------------- */
  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  /* -------------------------- source handling -------------------------- */
  const handleSourceChange = useCallback((sourceId) => {
    setForm((prev) => ({ ...prev, source: sourceId }));
    setErrors((prev) => ({ ...prev, source: "" }));
  }, []);

  /* -------------------------- allowance handling -------------------------- */
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

  const handleEmployeeChange = useCallback((employeeId) => {
    setForm((prev) => ({ ...prev, employeeId }));
    setErrors((prev) => ({ ...prev, employeeId: "" }));
  }, []);

  /* -------------------------- calculate totals -------------------------- */
  const totalAllowance = useMemo(() => {
    return form.allowances.reduce((total, allowance) => {
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      const payload = {
        ...form,
        totalAllowance: totalAllowance.toFixed(2),
      };
    
      const res = await fetch(`${backendUrl}/api/payrolls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.message || "Failed to save payroll");
        return;
      }

      toast.success(data.message || "Payroll added successfully");
      navigate("/hrmlayout/payroll");
    } catch (err) {
      toast.error(err.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------- load data on mount -------------------------- */
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
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handleSourceChange,
    handleSubmit,
    setForm,
    validate,
  };
};

/* -------------------------------------------------------------------------- */
/*  Custom MultipleSelectDropdown Component                                  */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*  Allowance Breakdown Modal Component                                      */
/* -------------------------------------------------------------------------- */
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
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
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

/* -------------------------------------------------------------------------- */
/*  Main component with requested layout                                     */
/* -------------------------------------------------------------------------- */
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
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handleSourceChange,
    handleSubmit,
    setForm,
  } = usePayrollForm();

  const navigate = useNavigate();

  /* default to current month */
  useEffect(() => {
    setForm((prev) => ({ ...prev, period: getCurrentMonth() }));
  }, [setForm]);

  /* -------------------------- MR/Employee options -------------------------- */
  const mrOptions = useMemo(() => {
    if (isMrListEmpty) {
      return [
        {
          value: "",
          label: "No Employees Available",
          disabled: true,
        },
      ];
    }

    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `Employee ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty]);

  /* -------------------------- get selected allowance types -------------------------- */
  const selectedAllowanceTypes = useMemo(() => {
    return form.allowances.map((allowance) => allowance.type);
  }, [form.allowances]);

  /* -------------------------- form validity for button -------------------------- */
  const isFormValid = useMemo(
    () =>
      form.employeeId &&
      form.period &&
      form.basicSalary &&
      form.source && // Added source to form validation
      !errors.period &&
      !errors.employeeId &&
      !errors.basicSalary &&
      !errors.source,
    [form, errors]
  );

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        Add New Payroll
      </h2>

      {/* Warning message if employee list is empty */}
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
                No Employees Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one Employee before creating payroll
                  records.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* First Row: Employee ID*, Pay Period*, and Source* */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <SearchableDropdown
            label="MR Name"
            value={form.employeeId}
            onChange={handleEmployeeChange}
            options={mrOptions}
            placeholder={isMrListEmpty ? "No MR List Available" : "Select MR"}
            required={true}
            loading={mrListLoading}
            error={errors.employeeId}
            disabled={isMrListEmpty}
          />

          <InputField
            label="Pay Period"
            name="period"
            type="month"
            value={form.period}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, period: e.target.value }))
            }
            error={errors.period}
            max={getCurrentMonth()}
            required
            disabled={isMrListEmpty}
          />

          <SearchableDropdown
            label="Source"
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

        {/* Second Row: Allowance Type, Allowance Amount, Basic Salary* */}
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
                disabled={isMrListEmpty || form.allowances.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                setForm((prev) => ({ ...prev, status: e.target.value }))
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

        {/* ---------- Salary Summary ---------- */}
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

        {/* ---------- Action Buttons ---------- */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="submit"
            disabled={loading || !isFormValid || isMrListEmpty}
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || !isFormValid || isMrListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading ? "Saving…" : "Save Payroll"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/hrmlayout/payroll")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors
             text-lg font-medium transform hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>

      {/* Allowance Breakdown Modal */}
      <AllowanceBreakdownModal
        allowances={form.allowances}
        isOpen={showAllowanceBreakdown}
        onClose={() => setShowAllowanceBreakdown(false)}
        onAmountChange={handleAllowanceAmountChange}
        onRemove={removeAllowance}
      />
    </div>
  );
};

export default AddPayroll;
