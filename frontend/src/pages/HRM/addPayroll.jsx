import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import axios from "axios";
import * as XLSX from "xlsx";

import SearchableDropdown from "../../components/common/SearchableDropdown";

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

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const getPreviousMonth = () => {
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  return now.toISOString().slice(0, 7);
};

// ─────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────

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

  const filteredOptions = options.filter((o) =>
    o.label.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const toggleOption = (v) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const getSelectedLabels = () =>
    value.map((v) => options.find((o) => o.value === v)?.label ?? v);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <div
          className={`w-full border border-gray-300 rounded-md px-3 py-2 cursor-pointer min-h-[42px] flex flex-wrap items-center gap-1 ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"} ${error ? "border-red-500" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {getSelectedLabels().length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            getSelectedLabels().map((lbl, i) => (
              <span
                key={i}
                className="bg-blue-100 text-blue-800 px-2 py-1 rounded-md text-sm"
              >
                {lbl}
              </span>
            ))
          )}
        </div>
        {isOpen && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search..."
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
              filteredOptions.map((o) => (
                <div
                  key={o.value}
                  className={`px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center ${value.includes(o.value) ? "bg-blue-50" : ""}`}
                  onClick={() => toggleOption(o.value)}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={() => {}}
                    className="mr-2 h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span
                    className={value.includes(o.value) ? "font-medium" : ""}
                  >
                    {o.label}
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
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value))
      onAmountChange(type, value);
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
            allowances.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 border rounded"
              >
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-700">
                    {a.type}
                  </label>
                  <input
                    type="text"
                    value={a.amount}
                    onChange={(e) => handleNumeric(e, a.type)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(a.type)}
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

const SalaryDetailsModal = ({ calculation, isOpen, onClose }) => {
  if (!isOpen || !calculation) return null;
  const fmt = (v) => {
    if (v == null) return "0.00";
    const n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? "0.00" : n.toFixed(2);
  };
  const fmtN = (v) => {
    if (v == null) return 0;
    const n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  const rows = [
    ["Basic Salary", `$${fmt(calculation.basicSalary)}`],
    ["Per Day Salary", `$${fmt(calculation.perDaySalary)}`],
    ["Per Minute Salary", `$${fmt(calculation.perMinuteSalary)}`],
    ["Working Days", fmtN(calculation.totalWorkingDays)],
    ["Present Days", fmtN(calculation.presentDays)],
    ["Total Leaves", fmtN(calculation.totalLeaves)],
    ["Paid Leaves", fmtN(calculation.paidLeaves)],
    ["Unpaid Leaves", fmtN(calculation.unpaidLeaves)],
    ["Swap Leaves", fmtN(calculation.swapLeaves)],
  ];
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
        <div className="grid grid-cols-2 gap-2">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <div className="text-sm font-medium text-gray-700">{k}:</div>
              <div className="text-sm">{v}</div>
            </React.Fragment>
          ))}
          <div className="text-sm font-medium text-red-600">
            Leave Deduction:
          </div>
          <div className="text-sm text-red-600">
            -${fmt(calculation.leaveDeduction)}
          </div>
          <div className="text-sm font-medium text-gray-700">
            Adjusted Basic Salary:
          </div>
          <div className="text-sm">${fmt(calculation.adjustedBasicSalary)}</div>
          <div className="text-sm font-medium text-green-600">
            Extra Minutes:
          </div>
          <div className="text-sm text-green-600">
            {fmt(calculation.extraMinutes)} mins
          </div>
          <div className="text-sm font-medium text-green-600">
            Extra Time Amount:
          </div>
          <div className="text-sm text-green-600">
            +${fmt(calculation.extraTimeAmount)}
          </div>
          <div className="text-sm font-medium text-gray-700">Total Salary:</div>
          <div className="text-sm font-semibold">
            ${fmt(calculation.totalSalary)}
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

// ─────────────────────────────────────────────
// HOOK: fetch ALL MRs from Staff collection
// Used exclusively by the Previous Month tab
// ─────────────────────────────────────────────

const useAllMRList = () => {
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setMrListLoading(true);
        // Primary: dedicated endpoint that returns ALL staff members
        const res = await axios.get(`${backendUrl}/api/hrm/payroll/mrs/all`);
        if (res.data.success) {
          setMrList(res.data.data || []);
        } else {
          throw new Error("Primary endpoint failed");
        }
      } catch {
        // Fallback: try general staff endpoint
        try {
          const fb = await axios.get(`${backendUrl}/api/staff`);
          const raw = Array.isArray(fb.data) ? fb.data : fb.data?.data || [];
          setMrList(
            raw.map((s) => ({
              _id: s._id,
              medicalRepName: s.medicalRepName || s.name || `MR ${s._id}`,
            })),
          );
        } catch {
          showToast("error", "Failed to load MR list");
          setMrList([]);
        }
      } finally {
        setMrListLoading(false);
      }
    };
    load();
  }, []);

  return { mrList, mrListLoading };
};

// ─────────────────────────────────────────────
// CURRENT MONTH — hook
// ─────────────────────────────────────────────

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
  const [selectedSourceAccount, setSelectedSourceAccount] = useState(null);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const res = await axios.get(
        `${backendUrl}/api/hrm/payroll/mrs/from-basic-payroll`,
      );
      if (res.data.success) {
        const d = res.data.data || [];
        if (d.length > 0) {
          setMrList(d);
          setIsMrListEmpty(false);
        } else {
          setMrList([]);
          setIsMrListEmpty(true);
          showToast(
            "error",
            "No MRs found with basic salary. Please add basic salary for MRs first.",
          );
        }
      } else throw new Error("Failed");
    } catch {
      try {
        const fb = await axios.get(`${backendUrl}/api/mrs/from-basic-payroll`);
        if (fb.data.success) {
          const d = fb.data.data || [];
          if (d.length > 0) {
            setMrList(d);
            setIsMrListEmpty(false);
          } else {
            setMrList([]);
            setIsMrListEmpty(true);
            showToast("error", "No MRs available for payroll.");
          }
        } else throw new Error("Fallback failed");
      } catch {
        showToast("error", "Failed to load MR list.");
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
      const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
      const rd = res.data;
      let destinations = Array.isArray(rd.data)
        ? rd.data
        : Array.isArray(rd.destinations)
          ? rd.destinations
          : Array.isArray(rd)
            ? rd
            : Array.isArray(rd.results)
              ? rd.results
              : [];
      const options = destinations
        .filter((d) => (d.totalAmount || d.amount || d.balance || 0) > 0)
        .map((d) => ({
          value: d._id || d.id,
          label: `${d.name || `Account ${d.code || d._id || d.id}`} ($${(d.totalAmount || d.amount || d.balance || 0).toFixed(2)})`,
          ...d,
        }));
      setSourceOptions(options);
      if (options.length === 0)
        showToast("warning", "No source accounts with balance available.");
    } catch {
      showToast("error", "Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const handleSourceChange = useCallback(
    (sourceId) => {
      setForm((p) => ({ ...p, source: sourceId }));
      setErrors((p) => ({ ...p, source: "" }));
      setSelectedSourceAccount(sourceOptions.find((o) => o.value === sourceId));
    },
    [sourceOptions],
  );

  const calculateSalary = useCallback(async (employeeId, period) => {
    if (!employeeId || !period) {
      setSalaryCalculation(null);
      setForm((p) => ({ ...p, basicSalary: "", deductions: "" }));
      return;
    }
    try {
      setCalculatingSalary(true);
      const res = await axios.get(
        `${backendUrl}/api/hrm/payroll/calculate/${employeeId}/${period}`,
      );
      if (res.data.success && res.data.data) {
        const sc = res.data.data.salaryCalculation;
        setSalaryCalculation(sc);
        setForm((p) => ({
          ...p,
          basicSalary: sc?.totalSalary?.toFixed(2) || "",
          deductions: sc?.leaveDeduction?.toFixed(2) || "",
        }));
        setErrors((p) => ({ ...p, basicSalary: "", deductions: "" }));
        showToast(
          "success",
          "Salary calculated successfully based on attendance and leaves",
        );
      }
    } catch (err) {
      if (err.response?.status === 404) {
        showToast(
          "error",
          err.response.data?.message?.includes("Basic payroll")
            ? "Basic payroll record not found. Please set basic salary first."
            : "Employee or payroll data not found",
        );
      } else showToast("error", "Failed to calculate salary");
      setSalaryCalculation(null);
      setForm((p) => ({ ...p, basicSalary: "", deductions: "" }));
    } finally {
      setCalculatingSalary(false);
    }
  }, []);

  const validate = useCallback(() => {
    const e = {};
    if (!form.employeeId.trim()) e.employeeId = "Employee is required";
    if (!form.period) e.period = "Pay period is required";
    else if (form.period > getCurrentMonth())
      e.period = "Future months are not allowed";
    if (!form.basicSalary) e.basicSalary = "Basic Salary is required";
    if (!form.source) e.source = "Source is required";
    if (selectedSourceAccount && form.netSalary) {
      const net = parseFloat(form.netSalary) || 0;
      const bal =
        selectedSourceAccount.totalAmount ||
        selectedSourceAccount.amount ||
        selectedSourceAccount.balance ||
        0;
      if (bal < net)
        e.source = `Insufficient balance. Available: $${bal.toFixed(2)}, Required: $${net.toFixed(2)}`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form, selectedSourceAccount]);

  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setForm((p) => ({ ...p, [name]: value }));
      setErrors((p) => ({ ...p, [name]: "" }));
    }
  }, []);

  const allowanceOptions = useMemo(
    () => allowanceTypes.map((t) => ({ value: t, label: t })),
    [],
  );

  const handleAllowanceChange = useCallback((selectedTypes) => {
    setForm((p) => {
      const updated = (p.allowances || []).filter((a) =>
        selectedTypes.includes(a.type),
      );
      selectedTypes.forEach((type) => {
        if (!updated.some((a) => a.type === type))
          updated.push({ type, amount: "" });
      });
      return { ...p, allowances: updated };
    });
  }, []);

  const handleAllowanceAmountChange = useCallback(
    (type, amount) =>
      setForm((p) => ({
        ...p,
        allowances: p.allowances.map((a) =>
          a.type === type ? { ...a, amount } : a,
        ),
      })),
    [],
  );
  const removeAllowance = useCallback(
    (type) =>
      setForm((p) => ({
        ...p,
        allowances: p.allowances.filter((a) => a.type !== type),
      })),
    [],
  );

  const handleEmployeeChange = useCallback(
    (employeeId) => {
      setForm((p) => ({ ...p, employeeId, basicSalary: "", deductions: "" }));
      setErrors((p) => ({ ...p, employeeId: "" }));
      setSalaryCalculation(null);
      if (employeeId && form.period) calculateSalary(employeeId, form.period);
    },
    [form.period, calculateSalary],
  );

  const handlePeriodChange = useCallback(
    (period) => {
      setForm((p) => ({ ...p, period, basicSalary: "", deductions: "" }));
      setErrors((p) => ({ ...p, period: "" }));
      setSalaryCalculation(null);
      if (form.employeeId && period) calculateSalary(form.employeeId, period);
    },
    [form.employeeId, calculateSalary],
  );

  const totalAllowance = useMemo(
    () =>
      (form.allowances || []).reduce(
        (t, a) => t + (parseFloat(a.amount) || 0),
        0,
      ),
    [form.allowances],
  );
  const netSalary = useMemo(
    () =>
      (
        (parseFloat(form.basicSalary) || 0) +
        totalAllowance -
        (parseFloat(form.deductions) || 0)
      ).toFixed(2),
    [form.basicSalary, totalAllowance, form.deductions],
  );
  useEffect(() => setForm((p) => ({ ...p, netSalary })), [netSalary]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix the form errors");
      return;
    }
    try {
      setLoading(true);
      const processedAllowances = form.allowances
        .filter((a) => a.type && a.amount)
        .map((a) => ({ type: a.type, amount: parseFloat(a.amount) || 0 }));
      const payload = {
        ...form,
        totalAllowance: totalAllowance.toFixed(2),
        allowances: processedAllowances,
        basicSalary: parseFloat(form.basicSalary) || 0,
        deductions: parseFloat(form.deductions) || 0,
        netSalary: parseFloat(form.netSalary) || 0,
      };
      const res = await axios.post(`${backendUrl}/api/hrm/payroll`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 201 || res.status === 200) {
        showToast("success", res.data.message || "Payroll added successfully");
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else throw new Error(res.data.message || "Failed to save payroll");
    } catch (err) {
      if (err.response?.status === 400) {
        if (err.response.data?.errors)
          err.response.data.errors.forEach((e) =>
            showToast("error", e.message || e.msg),
          );
        else showToast("error", err.response.data?.message || "Invalid data.");
      } else if (err.response?.status === 409)
        showToast(
          "error",
          err.response.data?.message ||
            "Payroll already exists for this period",
        );
      else showToast("error", err.message || "Failed to save payroll");
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
    selectedSourceAccount,
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

// ─────────────────────────────────────────────
// CURRENT MONTH TAB
// ─────────────────────────────────────────────

const CurrentMonthTab = () => {
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
    selectedSourceAccount,
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
    setForm((p) => ({ ...p, period: getCurrentMonth() }));
  }, [setForm]);

  const mrOptions = useMemo(() => {
    if (mrListLoading)
      return [{ value: "", label: "Loading MRs...", disabled: true }];
    if (isMrListEmpty)
      return [{ value: "", label: "No MRs Available", disabled: true }];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty, mrListLoading]);

  const selectedAllowanceTypes = useMemo(
    () => (form.allowances || []).map((a) => a.type),
    [form.allowances],
  );
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
  const srcBal = selectedSourceAccount
    ? selectedSourceAccount.totalAmount ||
      selectedSourceAccount.amount ||
      selectedSourceAccount.balance ||
      0
    : 0;

  return (
    <>
      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <svg
            className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800">
              No MRs Available
            </h3>
            <p className="mt-1 text-sm text-red-700">
              You need to add at least one MR with basic salary before creating
              payroll records. Please go to MR Basic Payroll first.
            </p>
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
            placeholder={
              mrListLoading
                ? "Loading..."
                : isMrListEmpty
                  ? "No MRs Available"
                  : "Select MR"
            }
            required
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
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${errors.period ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"} ${isMrListEmpty ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
            />
            {errors.period && (
              <p className="mt-1 text-sm text-red-600">{errors.period}</p>
            )}
          </div>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Source Account <span className="text-red-500">*</span>
            </label>
            <SearchableDropdown
              value={form.source}
              onChange={handleSourceChange}
              options={sourceOptions}
              placeholder={
                sourceLoading
                  ? "Loading sources..."
                  : sourceOptions.length === 0
                    ? "No accounts available"
                    : "Select Source"
              }
              required
              loading={sourceLoading}
              error={errors.source}
              disabled={
                isMrListEmpty || sourceLoading || sourceOptions.length === 0
              }
            />
            {selectedSourceAccount && (
              <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                <p className="text-sm text-green-700">
                  <span className="font-medium">Account Balance:</span> $
                  {srcBal.toFixed(2)}
                </p>
                {form.netSalary && parseFloat(form.netSalary) > 0 && (
                  <p className="text-sm text-blue-700 mt-1">
                    <span className="font-medium">After Payment:</span> $
                    {(srcBal - parseFloat(form.netSalary)).toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {salaryCalculation && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-blue-800">
                Salary Calculated Automatically
              </h4>
              <p className="text-sm text-blue-700">
                Based on attendance and leave records (including swap leaves and
                extra time)
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
        )}
        {calculatingSalary && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600"></div>
            <span className="text-sm text-yellow-700">
              Calculating salary based on attendance, leaves, and extra time...
            </span>
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
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${errors.basicSalary ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"} ${isMrListEmpty || calculatingSalary ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
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
                <th className="p-3 font-medium">Basic Salary ($)</th>
                <th className="p-3 font-medium">Allowance ($)</th>
                <th className="p-3 font-medium">Deductions ($)</th>
                <th className="p-3 font-medium">Net Salary ($)</th>
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
          {selectedSourceAccount && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-md font-semibold mb-2 text-center">
                Source Account Summary
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded border">
                  <p className="text-sm text-gray-600">Account Name</p>
                  <p className="font-medium">
                    {selectedSourceAccount.name ||
                      `Account ${selectedSourceAccount.code || selectedSourceAccount._id}`}
                  </p>
                </div>
                <div className="bg-white p-3 rounded border">
                  <p className="text-sm text-gray-600">Current Balance</p>
                  <p className="font-medium text-green-600">
                    ${srcBal.toFixed(2)}
                  </p>
                </div>
                {form.netSalary && parseFloat(form.netSalary) > 0 && (
                  <>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-sm text-gray-600">Payment Amount</p>
                      <p className="font-medium text-red-600">
                        -${parseFloat(form.netSalary).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded border">
                      <p className="text-sm text-gray-600">
                        Balance After Payment
                      </p>
                      <p className="font-medium text-blue-600">
                        ${(srcBal - parseFloat(form.netSalary)).toFixed(2)}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end mt-10 gap-4">
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/payroll")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              loading ||
              !isFormValid ||
              isMrListEmpty ||
              calculatingSalary ||
              sourceOptions.length === 0
            }
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${loading || !isFormValid || isMrListEmpty || calculatingSalary || sourceOptions.length === 0 ? "bg-gray-400 text-gray-200 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 focus:ring-green-500"}`}
          >
            {loading
              ? "Saving…"
              : calculatingSalary
                ? "Calculating…"
                : sourceOptions.length === 0
                  ? "No Source Account"
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
    </>
  );
};

// ─────────────────────────────────────────────
// PREVIOUS MONTH TAB
// ─────────────────────────────────────────────

const PREV_INITIAL_ROW = {
  employeeId: "",
  period: "",
  salary: "",
  incentive: "",
  allowance: "",
  tourExpense: "",
  otherExpense: "",
};

const computeTotal = (row) =>
  (
    (parseFloat(row.salary) || 0) +
    (parseFloat(row.incentive) || 0) +
    (parseFloat(row.allowance) || 0) +
    (parseFloat(row.tourExpense) || 0) +
    (parseFloat(row.otherExpense) || 0)
  ).toFixed(2);

const buildAllowances = (row) => [
  ...(parseFloat(row.incentive) > 0
    ? [{ type: "Incentive", amount: parseFloat(row.incentive) }]
    : []),
  ...(parseFloat(row.allowance) > 0
    ? [{ type: "Special Allowance", amount: parseFloat(row.allowance) }]
    : []),
  ...(parseFloat(row.tourExpense) > 0
    ? [{ type: "Travel Allowance", amount: parseFloat(row.tourExpense) }]
    : []),
  ...(parseFloat(row.otherExpense) > 0
    ? [{ type: "Other", amount: parseFloat(row.otherExpense) }]
    : []),
];

const buildTotalAllowance = (row) =>
  (
    (parseFloat(row.incentive) || 0) +
    (parseFloat(row.allowance) || 0) +
    (parseFloat(row.tourExpense) || 0) +
    (parseFloat(row.otherExpense) || 0)
  ).toFixed(2);

const EXCEL_HEADERS = [
  "MR Name",
  "Pay Period (YYYY-MM)",
  "Salary ($)",
  "Incentive ($)",
  "Allowance ($)",
  "Tour Expense ($)",
  "Other Expense ($)",
];

const PreviousMonthTab = () => {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState("manual");

  // ── ALL MRs — not filtered by basic payroll ──
  const { mrList, mrListLoading } = useAllMRList();

  const [rows, setRows] = useState([
    { ...PREV_INITIAL_ROW, period: getPreviousMonth() },
  ]);
  const [rowErrors, setRowErrors] = useState([{}]);
  const [submitting, setSubmitting] = useState(false);

  const [excelRows, setExcelRows] = useState([]);
  const [excelFileName, setExcelFileName] = useState("");
  const [excelErrors, setExcelErrors] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const mrOptions = useMemo(() => {
    if (mrListLoading)
      return [{ value: "", label: "Loading MRs...", disabled: true }];
    if (mrList.length === 0)
      return [{ value: "", label: "No MRs Available", disabled: true }];
    // Show ALL MRs from Staff collection
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
    }));
  }, [mrList, mrListLoading]);

  // ── Manual helpers ──
  const addRow = () => {
    setRows((p) => [...p, { ...PREV_INITIAL_ROW, period: getPreviousMonth() }]);
    setRowErrors((p) => [...p, {}]);
  };
  const removeRow = (i) => {
    if (rows.length === 1) return;
    setRows((p) => p.filter((_, idx) => idx !== i));
    setRowErrors((p) => p.filter((_, idx) => idx !== i));
  };
  const updateRow = (i, field, value) => {
    setRows((p) => {
      const n = [...p];
      n[i] = { ...n[i], [field]: value };
      return n;
    });
    setRowErrors((p) => {
      const n = [...p];
      n[i] = { ...n[i], [field]: "" };
      return n;
    });
  };
  const handleNumericRow = (i, field, value) => {
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value))
      updateRow(i, field, value);
  };

  const validateRows = () => {
    let valid = true;
    const newErrors = rows.map((row) => {
      const e = {};
      if (!row.employeeId) e.employeeId = "MR is required";
      if (!row.period) e.period = "Pay period is required";
      else if (row.period >= getCurrentMonth())
        e.period = "Must be a previous month";
      if (!row.salary) e.salary = "Salary is required";
      if (Object.keys(e).length > 0) valid = false;
      return e;
    });
    setRowErrors(newErrors);
    return valid;
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!validateRows()) {
      showToast("error", "Please fix validation errors");
      return;
    }
    try {
      setSubmitting(true);
      const payload = rows.map((row) => ({
        employeeId: row.employeeId,
        period: row.period,
        basicSalary: parseFloat(row.salary) || 0,
        allowances: buildAllowances(row),
        totalAllowance: buildTotalAllowance(row),
        deductions: 0,
        netSalary: parseFloat(computeTotal(row)) || 0,
        status: "pending",
        payrollType: "previous",
      }));
      const res = await axios.post(
        `${backendUrl}/api/hrm/payroll/bulk`,
        payload,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 201 || res.status === 200) {
        showToast(
          "success",
          res.data.message || "Previous month payroll saved successfully",
        );
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else throw new Error(res.data.message || "Failed to save payroll");
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || err.message || "Failed to save payroll",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Excel helpers ──
  const downloadTemplate = () => {
    const exampleRows =
      mrList.length > 0
        ? mrList
            .slice(0, 3)
            .map((mr) => [
              mr.medicalRepName || mr.employeeName || "MR Name",
              getPreviousMonth(),
              "30000",
              "2000",
              "1500",
              "500",
              "300",
            ])
        : [
            [
              "John Doe",
              getPreviousMonth(),
              "30000",
              "2000",
              "1500",
              "500",
              "300",
            ],
          ];
    const ws = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...exampleRows]);
    ws["!cols"] = EXCEL_HEADERS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payroll");
    XLSX.writeFile(wb, "previous_month_payroll_template.xlsx");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExcelFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), {
          type: "array",
        });
        const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
          header: 1,
        });
        const dataRows = jsonData
          .slice(1)
          .filter((r) => r.some((c) => c !== undefined && c !== ""));
        const parsed = dataRows.map((row, i) => ({
          rowIndex: i + 2,
          mrName: String(row[0] || "").trim(),
          period: String(row[1] || "").trim(),
          salary: String(row[2] || "").trim(),
          incentive: String(row[3] || "").trim(),
          allowance: String(row[4] || "").trim(),
          tourExpense: String(row[5] || "").trim(),
          otherExpense: String(row[6] || "").trim(),
        }));
        const errors = [];
        parsed.forEach((row) => {
          if (!row.mrName) {
            errors.push(`Row ${row.rowIndex}: MR Name is required`);
          } else {
            const found = mrList.find(
              (m) =>
                (m.medicalRepName || m.employeeName || "").toLowerCase() ===
                row.mrName.toLowerCase(),
            );
            if (!found)
              errors.push(
                `Row ${row.rowIndex}: MR "${row.mrName}" not found in system`,
              );
          }
          if (!row.period || !/^\d{4}-\d{2}$/.test(row.period))
            errors.push(
              `Row ${row.rowIndex}: Pay Period must be YYYY-MM format`,
            );
          else if (row.period >= getCurrentMonth())
            errors.push(
              `Row ${row.rowIndex}: Pay Period must be a previous month`,
            );
          if (!row.salary || isNaN(parseFloat(row.salary)))
            errors.push(`Row ${row.rowIndex}: Salary must be a valid number`);
        });
        setExcelErrors(errors);
        setExcelRows(parsed);
      } catch {
        showToast(
          "error",
          "Failed to parse Excel file. Please use the template.",
        );
        setExcelRows([]);
        setExcelErrors(["Failed to parse file"]);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleExcelSubmit = async (e) => {
    e.preventDefault();
    if (excelRows.length === 0) {
      showToast("error", "Please upload an Excel file first");
      return;
    }
    if (excelErrors.length > 0) {
      showToast("error", "Please fix errors in the uploaded file");
      return;
    }
    try {
      setUploading(true);
      const payload = excelRows.map((row) => {
        const mr = mrList.find(
          (m) =>
            (m.medicalRepName || m.employeeName || "").toLowerCase() ===
            row.mrName.toLowerCase(),
        );
        return {
          employeeId: mr?._id || null,
          employeeName: row.mrName,
          period: row.period,
          basicSalary: parseFloat(row.salary) || 0,
          allowances: buildAllowances(row),
          totalAllowance: buildTotalAllowance(row),
          deductions: 0,
          netSalary: parseFloat(computeTotal(row)) || 0,
          status: "pending",
          payrollType: "previous",
        };
      });
      const missing = payload
        .filter((p) => !p.employeeId)
        .map((p) => p.employeeName);
      if (missing.length > 0) {
        showToast("error", `MRs not found in system: ${missing.join(", ")}`);
        setUploading(false);
        return;
      }
      const res = await axios.post(
        `${backendUrl}/api/hrm/payroll/bulk`,
        payload,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 201 || res.status === 200) {
        showToast(
          "success",
          res.data.message || "Payroll uploaded successfully",
        );
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else throw new Error(res.data.message || "Failed to upload payroll");
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message ||
          err.message ||
          "Failed to upload payroll",
      );
    } finally {
      setUploading(false);
    }
  };

  const totalExpenseSum = useMemo(
    () =>
      rows
        .reduce((s, r) => s + (parseFloat(computeTotal(r)) || 0), 0)
        .toFixed(2),
    [rows],
  );
  const excelTotalSum = useMemo(
    () =>
      excelRows
        .reduce((s, r) => s + (parseFloat(computeTotal(r)) || 0), 0)
        .toFixed(2),
    [excelRows],
  );

  return (
    <div>
      {/* Info banner */}
      <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
        <svg
          className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm text-blue-700">
          All MRs are listed here regardless of basic payroll setup. Enter
          previous month payroll manually or upload via Excel.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => setEntryMode("manual")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${entryMode === "manual" ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          ✏️ Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setEntryMode("excel")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${entryMode === "excel" ? "bg-green-600 text-white shadow" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
        >
          📊 Upload Excel
        </button>
      </div>

      {/* ── MANUAL ENTRY ── */}
      {entryMode === "manual" && (
        <form onSubmit={handleManualSubmit}>
          <div className="space-y-6">
            {rows.map((row, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-xl p-5 bg-gray-50"
              >
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Entry #{index + 1}
                  </h4>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* MR Name — ALL MRs from staff */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      MR Name <span className="text-red-500">*</span>
                    </label>
                    <SearchableDropdown
                      value={row.employeeId}
                      onChange={(v) => updateRow(index, "employeeId", v)}
                      options={mrOptions}
                      placeholder={
                        mrListLoading ? "Loading MRs..." : "Select MR"
                      }
                      loading={mrListLoading}
                      error={rowErrors[index]?.employeeId}
                    />
                    {rowErrors[index]?.employeeId && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].employeeId}
                      </p>
                    )}
                  </div>
                  {/* Pay Period */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Pay Period <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="month"
                      value={row.period}
                      onChange={(e) =>
                        updateRow(index, "period", e.target.value)
                      }
                      max={getPreviousMonth()}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors bg-white ${rowErrors[index]?.period ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"}`}
                    />
                    {rowErrors[index]?.period && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].period}
                      </p>
                    )}
                  </div>
                  {/* Salary */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Salary ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.salary}
                      onChange={(e) =>
                        handleNumericRow(index, "salary", e.target.value)
                      }
                      placeholder="0.00"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none bg-white ${rowErrors[index]?.salary ? "border-red-500 focus:ring-red-200" : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"}`}
                    />
                    {rowErrors[index]?.salary && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].salary}
                      </p>
                    )}
                  </div>
                  {/* Incentive */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Incentive ($)
                    </label>
                    <input
                      type="text"
                      value={row.incentive}
                      onChange={(e) =>
                        handleNumericRow(index, "incentive", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  {/* Allowance */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Allowance ($)
                    </label>
                    <input
                      type="text"
                      value={row.allowance}
                      onChange={(e) =>
                        handleNumericRow(index, "allowance", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  {/* Tour Expense */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Tour Expense ($)
                    </label>
                    <input
                      type="text"
                      value={row.tourExpense}
                      onChange={(e) =>
                        handleNumericRow(index, "tourExpense", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  {/* Other Expense */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Other Expense ($)
                    </label>
                    <input
                      type="text"
                      value={row.otherExpense}
                      onChange={(e) =>
                        handleNumericRow(index, "otherExpense", e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  {/* Total Expense */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Total Expense ($)
                    </label>
                    <input
                      type="text"
                      value={computeTotal(row)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-green-50 font-semibold text-green-700 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
            <span className="text-sm font-medium text-blue-800">
              Grand Total Expense (All Entries)
            </span>
            <span className="text-lg font-bold text-blue-900">
              ${totalExpenseSum}
            </span>
          </div>

          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
            >
              <span className="text-lg font-bold">+</span> Add Another MR
            </button>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate("/hrmlayout/payroll")}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || mrListLoading}
                className={`px-6 py-3 rounded-lg shadow text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${submitting || mrListLoading ? "bg-gray-400 text-gray-200 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"}`}
              >
                {submitting ? "Saving…" : "Save Previous Month Payroll"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ── EXCEL UPLOAD ── */}
      {entryMode === "excel" && (
        <form onSubmit={handleExcelSubmit}>
          {/* MR name reference chip list */}
          {mrList.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="text-xs text-gray-600 font-medium mb-2">
                Available MR names (copy exactly into Excel):
              </p>
              <div className="flex flex-wrap gap-2">
                {mrList.map((mr) => (
                  <span
                    key={mr._id}
                    className="text-xs bg-white border border-gray-300 rounded px-2 py-1 text-gray-700"
                  >
                    {mr.medicalRepName || mr.employeeName}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-6 bg-gray-50">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-gray-600 mb-2 font-medium">
              Upload Excel file (.xlsx, .xls)
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Columns: MR Name · Pay Period (YYYY-MM) · Salary · Incentive ·
              Allowance · Tour Expense · Other Expense
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={downloadTemplate}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"
              >
                ⬇ Download Template
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"
              >
                📂 Choose File
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            {excelFileName && (
              <p className="mt-3 text-sm text-gray-600">
                📄 <span className="font-medium">{excelFileName}</span>
              </p>
            )}
          </div>

          {excelErrors.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="text-sm font-semibold text-red-800 mb-2">
                Please fix the following errors:
              </h4>
              <ul className="space-y-1">
                {excelErrors.map((err, i) => (
                  <li key={i} className="text-sm text-red-700">
                    • {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {excelRows.length > 0 && excelErrors.length === 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">
                Preview ({excelRows.length} record
                {excelRows.length !== 1 ? "s" : ""})
              </h4>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      {[
                        "MR Name",
                        "Pay Period",
                        "Salary ($)",
                        "Incentive ($)",
                        "Allowance ($)",
                        "Tour Expense ($)",
                        "Other Expense ($)",
                        "Total Expense ($)",
                      ].map((h) => (
                        <th
                          key={h}
                          className="p-3 font-medium text-gray-700 border-b whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {excelRows.map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-gray-50 border-b border-gray-100"
                      >
                        <td className="p-3">{row.mrName}</td>
                        <td className="p-3">{row.period}</td>
                        <td className="p-3">{row.salary || "0.00"}</td>
                        <td className="p-3">{row.incentive || "0.00"}</td>
                        <td className="p-3">{row.allowance || "0.00"}</td>
                        <td className="p-3">{row.tourExpense || "0.00"}</td>
                        <td className="p-3">{row.otherExpense || "0.00"}</td>
                        <td className="p-3 font-semibold text-green-700">
                          {computeTotal(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
                <span className="text-sm font-medium text-blue-800">
                  Grand Total
                </span>
                <span className="text-lg font-bold text-blue-900">
                  ${excelTotalSum}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-4 mt-6">
            <button
              type="button"
              onClick={() => navigate("/hrmlayout/payroll")}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg transition-colors text-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                uploading || excelRows.length === 0 || excelErrors.length > 0
              }
              className={`px-6 py-3 rounded-lg shadow text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${uploading || excelRows.length === 0 || excelErrors.length > 0 ? "bg-gray-400 text-gray-200 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"}`}
            >
              {uploading ? "Uploading…" : "Upload & Save Payroll"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────

const AddPayroll = () => {
  const [activeTab, setActiveTab] = useState("current");
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        Add New Payroll
      </h2>
      <div className="flex border-b border-gray-200 mb-6">
        {[
          ["current", "Current Month"],
          ["previous", "Previous Month"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`py-2 px-4 font-medium text-sm focus:outline-none transition-colors ${activeTab === key ? "border-b-2 border-blue-600 text-blue-600" : "text-gray-500 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "current" && <CurrentMonthTab />}
      {activeTab === "previous" && <PreviousMonthTab />}
    </div>
  );
};

export default AddPayroll;
