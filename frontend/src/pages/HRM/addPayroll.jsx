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
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
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
// Multiple Select Dropdown Component
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
    <div className="flex flex-col" ref={dropdownRef}>
      {label && (
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <div
          className={`w-full border border-gray-300 rounded-xl px-3 py-2 cursor-pointer min-h-[48px] flex flex-wrap items-center gap-1 ${disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"} ${error ? "border-red-500" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {getSelectedLabels().length === 0 ? (
            <span className="text-gray-400 text-sm">{placeholder}</span>
          ) : (
            getSelectedLabels().map((lbl, i) => (
              <span
                key={i}
                className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-sm"
              >
                {lbl}
              </span>
            ))
          )}
        </div>
        {isOpen && !disabled && (
          <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-lg max-h-60 overflow-auto">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {loading ? (
              <div className="px-3 py-2 text-gray-500 text-sm">Loading...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500 text-sm">
                No options found
              </div>
            ) : (
              filteredOptions.map((o) => (
                <div
                  key={o.value}
                  className={`px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center gap-2 ${value.includes(o.value) ? "bg-blue-50" : ""}`}
                  onClick={() => toggleOption(o.value)}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span
                    className={`text-sm ${value.includes(o.value) ? "font-medium text-blue-800" : "text-gray-700"}`}
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

// ─────────────────────────────────────────────
// Allowance Breakdown Modal
// ─────────────────────────────────────────────
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
    if (value === "" || /^\d*\.?\d{0,15}$/.test(value))
      onAmountChange(type, value);
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">
            Allowance Breakdown
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-96 overflow-y-auto">
          {allowances.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">
              No allowances added
            </p>
          ) : (
            allowances.map((a, i) => (
              <div
                key={i}
                className="p-3 border border-gray-200 rounded-xl bg-gray-50"
              >
                <label className="text-sm font-semibold text-gray-700 block mb-2">
                  {a.type}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm font-medium">$</span>
                  <input
                    type="text"
                    value={a.amount}
                    onChange={(e) => handleNumeric(e, a.type)}
                    placeholder="0.00"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => onRemove(a.type)}
                    className="text-red-500 hover:text-red-700 text-xs font-medium"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Salary Details Modal - Shows exact values for transparency
// ─────────────────────────────────────────────
const SalaryDetailsModal = ({ calculation, isOpen, onClose }) => {
  if (!isOpen || !calculation) return null;

  const fmtExact = (v) => {
    if (v == null) return "0";
    const n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? "0" : n.toString();
  };

  const fmtDisplay = (v) => {
    if (v == null) return "0.00";
    const n = typeof v === "number" ? v : parseFloat(v);
    return isNaN(n) ? "0.00" : n.toFixed(2);
  };

  const adv = calculation.advanceDeduction || 0;
  const isFull = calculation.isFull;
  const perDaySalaryExact =
    calculation.perDaySalaryExact || calculation.perDaySalary || 0;
  const leaveDeductionExact =
    calculation.leaveDeductionExact || calculation.leaveDeduction || 0;
  const totalSalaryExact =
    calculation.totalSalaryExact || calculation.totalSalary || 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">
            Salary Calculation Details
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-4 space-y-1">
          {[
            [
              "Full Monthly Basic Salary",
              `$${fmtDisplay(calculation.basicSalary)}`,
              "gray",
            ],
            ["Per Day Salary (Exact)", fmtExact(perDaySalaryExact), "blue"],
            [
              "Per Day Salary (Display)",
              `$${fmtDisplay(perDaySalaryExact)}`,
              "gray",
            ],
            ["Total Days in Month", calculation.totalDaysInMonth, "gray"],
            ["Present Days", calculation.presentDays, "gray"],
            ["Total Leaves", calculation.totalLeaves, "gray"],
            ["Paid Leaves", calculation.paidLeaves, "green"],
            ["Unpaid Leaves", calculation.unpaidLeaves, "red"],
            ["Swap Leaves", calculation.swapLeaves, "gray"],
            ["Effective Days", calculation.effectiveDays, "blue"],
          ].map(([label, val, color]) => (
            <div
              key={label}
              className="flex justify-between items-center py-1.5 border-b border-gray-50"
            >
              <span className="text-sm text-gray-500">{label}</span>
              <span
                className={`text-sm font-mono font-semibold ${color === "red" ? "text-red-600" : color === "green" ? "text-green-600" : color === "blue" ? "text-blue-600" : "text-gray-800"}`}
              >
                {val}
              </span>
            </div>
          ))}

          {isFull ? (
            <div className="py-2 px-3 bg-green-50 border border-green-200 rounded-lg my-2">
              <p className="text-sm text-green-700 font-medium">
                ✅ Full salary applied (no unpaid leaves)
              </p>
            </div>
          ) : (
            <div className="py-2 px-3 bg-yellow-50 border border-yellow-200 rounded-lg my-2">
              <p className="text-sm text-yellow-700 font-medium">
                ⚠️ Unpaid leave deduction applied
              </p>
            </div>
          )}

          <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
            <span className="text-sm text-gray-500">
              Leave Deduction (Exact)
            </span>
            <span className="text-sm font-mono font-semibold text-red-600">
              ${fmtExact(leaveDeductionExact)}
            </span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
            <span className="text-sm text-gray-500">
              Leave Deduction (Display)
            </span>
            <span className="text-sm font-mono font-semibold text-red-600">
              ${fmtDisplay(leaveDeductionExact)}
            </span>
          </div>

          {adv > 0 && (
            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
              <span className="text-sm text-gray-500">Advance Deduction</span>
              <span className="text-sm font-mono font-semibold text-red-600">
                -${fmtDisplay(adv)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t-2 border-gray-200 mt-3">
            <span className="text-base font-bold text-gray-800">
              Basic Salary After Deductions
            </span>
            <span className="text-base font-bold text-green-700 font-mono">
              ${fmtExact(totalSalaryExact)}
            </span>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const SalarySplitModal = ({
  isOpen,
  onClose,
  selectedAccountIds,
  sources,
  onAmountChange,
  sourceOptions,
  netSalary,
}) => {
  if (!isOpen) return null;

  const selectedAccounts = sourceOptions.filter((opt) =>
    selectedAccountIds.includes(opt.value),
  );

  const net = parseFloat(netSalary) || 0;

  const uniqueSources = useMemo(() => {
    const map = new Map();
    sources.forEach((src) => {
      if (src.accountId) {
        const existing = map.get(src.accountId);
        if (!existing || (src.amount && !existing.amount)) {
          map.set(src.accountId, src);
        }
      }
    });
    return Array.from(map.values());
  }, [sources]);

  const totalFromSources = uniqueSources.reduce(
    (s, src) => s + (parseFloat(src.amount) || 0),
    0,
  );
  const diff = totalFromSources - net;

  const handleAmount = (accountId, value) => {
    if (value === "" || /^\d*\.?\d{0,15}$/.test(value)) {
      onAmountChange(accountId, value);
    }
  };

  const autoFill = (accountId) => {
    const otherTotal = uniqueSources
      .filter((s) => s.accountId !== accountId)
      .reduce((s, src) => s + (parseFloat(src.amount) || 0), 0);
    const remaining = Math.max(0, net - otherTotal);
    onAmountChange(accountId, remaining.toFixed(6));
  };

  const getRemainingBalance = (account) => {
    const source = sources.find((s) => s.accountId === account.value);
    const amountEntered = parseFloat(source?.amount) || 0;
    const originalBalance = account.balance || 0;
    return Math.max(0, originalBalance - amountEntered);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">
              Salary Split
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter amount for each selected account
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-4 space-y-4">
          {selectedAccounts.length === 0 ? (
            <p className="text-gray-500 text-center py-6 text-sm">
              No accounts selected. Close and select accounts first.
            </p>
          ) : (
            selectedAccounts.map((account) => {
              const src = sources.find((s) => s.accountId === account.value);
              const currentAmount = src?.amount || "";
              const remainingBalance = getRemainingBalance(account);
              return (
                <div
                  key={account.value}
                  className="p-4 border border-gray-200 rounded-xl bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-sm font-semibold text-gray-800">
                      {account.name ||
                        account.label?.split(" ($")[0] ||
                        account.label}
                    </span>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-500 line-through">
                        Bal: ${(account.balance || 0).toFixed(2)}
                      </span>
                      <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full mt-1">
                        Remaining: ${remainingBalance.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 font-medium text-sm">$</span>
                    <input
                      type="text"
                      value={currentAmount}
                      onChange={(e) =>
                        handleAmount(account.value, e.target.value)
                      }
                      placeholder="0.00"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => autoFill(account.value)}
                      className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 whitespace-nowrap font-medium"
                    >
                      Auto Fill
                    </button>
                  </div>
                  {(account.balance || 0) - (parseFloat(currentAmount) || 0) <
                    0 && (
                    <p className="text-xs text-red-500 mt-2">
                      ⚠️ Amount exceeds balance by $
                      {Math.abs(
                        (account.balance || 0) -
                          (parseFloat(currentAmount) || 0),
                      ).toFixed(2)}
                    </p>
                  )}
                </div>
              );
            })
          )}
          {selectedAccounts.length > 0 && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-blue-800">
                  Total from Sources:
                </span>
                <span
                  className={`text-xl font-bold ${Math.abs(diff) > 0.01 ? "text-red-700" : "text-blue-900"}`}
                >
                  ${totalFromSources.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-blue-800">
                  Net Salary:
                </span>
                <span className="text-xl font-bold text-blue-900">
                  ${net.toFixed(2)}
                </span>
              </div>
              {Math.abs(diff) > 0.01 && (
                <p
                  className={`text-sm font-medium mt-2 ${diff > 0 ? "text-red-600" : "text-orange-600"}`}
                >
                  {diff > 0 ? "Over by" : "Under by"}: $
                  {Math.abs(diff).toFixed(2)}
                </p>
              )}
              {Math.abs(diff) <= 0.01 && totalFromSources > 0 && (
                <p className="text-sm text-green-600 font-medium mt-2">
                  ✓ Balanced
                </p>
              )}
            </div>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Hook: all MRs
// ─────────────────────────────────────────────
const useAllMRList = () => {
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  useEffect(() => {
    const load = async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/hrm/payroll/mrs/all`);
        if (res.data.success) setMrList(res.data.data || []);
        else throw new Error();
      } catch {
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
// Hook: payroll form
// ─────────────────────────────────────────────
const usePayrollForm = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    employeeId: "",
    period: "",
    allowances: [],
    deductions: "",
    netSalary: "0.00",
    status: "pending",
    sources: [],
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [showAllowanceBreakdown, setShowAllowanceBreakdown] = useState(false);
  const [showSalarySplit, setShowSalarySplit] = useState(false);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [salaryCalculation, setSalaryCalculation] = useState(null);
  const [calculatingSalary, setCalculatingSalary] = useState(false);
  const [showSalaryDetails, setShowSalaryDetails] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

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
            "No MRs with basic salary. Add basic salary first.",
          );
        }
      } else throw new Error();
    } catch {
      showToast("error", "Failed to load MR list.");
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchSourceOptions = useCallback(async () => {
    try {
      setSourceLoading(true);
      const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
      const rd = res.data;
      let dests = Array.isArray(rd.data)
        ? rd.data
        : Array.isArray(rd.destinations)
          ? rd.destinations
          : Array.isArray(rd)
            ? rd
            : [];
      const options = dests
        .filter((d) => (d.totalAmount || d.amount || d.balance || 0) > 0)
        .map((d) => ({
          value: d._id || d.id,
          name: d.name || `Account ${d._id}`,
          label: d.name || `Account ${d._id}`,
          balance: d.totalAmount || d.amount || d.balance || 0,
        }));
      setSourceOptions(options);
      if (options.length === 0)
        showToast("warning", "No source accounts with balance.");
    } catch {
      showToast("error", "Failed to load source options");
      setSourceOptions([]);
    } finally {
      setSourceLoading(false);
    }
  }, []);

  const calculateSalary = useCallback(async (employeeId, period) => {
    if (!employeeId || !period) {
      setSalaryCalculation(null);
      setForm((p) => ({ ...p, deductions: "" }));
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
          deductions: sc?.leaveDeductionDisplay?.toFixed(2) || "0.00",
        }));
        setErrors((p) => ({ ...p, deductions: "" }));
        showToast("success", "Salary calculated from attendance & leaves");
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.status === 404
          ? "Basic payroll not found. Set basic salary first."
          : "Failed to calculate salary",
      );
      setSalaryCalculation(null);
      setForm((p) => ({ ...p, deductions: "" }));
    } finally {
      setCalculatingSalary(false);
    }
  }, []);

  const handleAccountIdsChange = useCallback((newIds) => {
    setSelectedAccountIds((prev) => {
      const added = newIds.filter((id) => !prev.includes(id));
      const removed = prev.filter((id) => !newIds.includes(id));
      setForm((p) => {
        let sources = [...p.sources];
        removed.forEach((id) => {
          sources = sources.filter((s) => s.accountId !== id);
        });
        added.forEach((id) => {
          if (!sources.some((s) => s.accountId === id))
            sources.push({ accountId: id, amount: "" });
        });
        return { ...p, sources };
      });
      return newIds;
    });
    setErrors((p) => ({ ...p, sources: "" }));
  }, []);

  const updateSourceAmount = useCallback((accountId, value) => {
    setForm((p) => ({
      ...p,
      sources: p.sources.map((s) =>
        s.accountId === accountId ? { ...s, amount: value } : s,
      ),
    }));
  }, []);

  const validate = useCallback(() => {
    const e = {};
    if (!form.employeeId.trim()) e.employeeId = "Employee is required";
    if (!form.period) e.period = "Pay period is required";
    else if (form.period > getCurrentMonth())
      e.period = "Future months are not allowed";
    if (!form.sources || form.sources.length === 0) {
      e.sources = "At least one source account is required";
    } else {
      let total = 0;
      for (const src of form.sources) {
        if (!src.accountId) {
          e.sources = "Select an account for each source";
          break;
        }
        if (!src.amount || parseFloat(src.amount) <= 0) {
          e.sources = "Each source must have a valid amount";
          break;
        }
        total += parseFloat(src.amount) || 0;
      }
      const net = parseFloat(form.netSalary) || 0;
      if (!e.sources && Math.abs(total - net) > 0.01)
        e.sources = `Source total ($${total.toFixed(2)}) must equal net salary ($${net.toFixed(2)})`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d{0,15}$/.test(value)) {
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
      setForm((p) => ({ ...p, employeeId, deductions: "" }));
      setErrors((p) => ({ ...p, employeeId: "" }));
      setSalaryCalculation(null);
      if (employeeId && form.period) calculateSalary(employeeId, form.period);
    },
    [form.period, calculateSalary],
  );

  const handlePeriodChange = useCallback(
    (period) => {
      setForm((p) => ({ ...p, period, deductions: "" }));
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

  // Net salary = totalSalaryDisplay (already floored to 2 decimals) + totalAllowance
  const netSalary = useMemo(() => {
    const basicAfterDeductions =
      salaryCalculation?.totalSalaryDisplay ??
      salaryCalculation?.totalSalary ??
      0;
    const result = basicAfterDeductions + totalAllowance;
    return result.toFixed(2);
  }, [salaryCalculation, totalAllowance]);

  useEffect(() => setForm((p) => ({ ...p, netSalary })), [netSalary]);

  const totalFromSources = useMemo(
    () =>
      (form.sources || []).reduce(
        (s, src) => s + (parseFloat(src.amount) || 0),
        0,
      ),
    [form.sources],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix the form errors");
      return;
    }
    try {
      setLoading(true);
      const processedAllowances = (form.allowances || [])
        .filter((a) => a.type && a.amount && parseFloat(a.amount) > 0)
        .map((a) => ({ type: a.type, amount: parseFloat(a.amount) || 0 }));
      const processedSources = (form.sources || [])
        .filter((s) => s.accountId && s.amount && parseFloat(s.amount) > 0)
        .map((s) => ({
          accountId: s.accountId,
          amount: parseFloat(s.amount) || 0,
        }));
      const payload = {
        employeeId: form.employeeId,
        period: form.period,
        allowances: processedAllowances,
        deductions: parseFloat(form.deductions) || 0,
        netSalary: parseFloat(form.netSalary) || 0,
        status: form.status,
        sources: processedSources,
      };
      const res = await axios.post(`${backendUrl}/api/hrm/payroll`, payload, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 201 || res.status === 200) {
        showToast("success", res.data.message || "Payroll added successfully");
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else {
        throw new Error(res.data.message || "Failed");
      }
    } catch (err) {
      console.error("Payroll save error:", err.response?.data);
      if (err.response?.status === 400)
        showToast("error", err.response.data?.message || "Invalid data.");
      else if (err.response?.status === 409)
        showToast(
          "error",
          err.response.data?.message || "Payroll already exists",
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
    setForm,
    errors,
    setErrors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    totalFromSources,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    showSalarySplit,
    setShowSalarySplit,
    sourceOptions,
    sourceLoading,
    salaryCalculation,
    calculatingSalary,
    showSalaryDetails,
    setShowSalaryDetails,
    selectedAccountIds,
    handleAccountIdsChange,
    updateSourceAmount,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSubmit,
    validate,
  };
};

// ─────────────────────────────────────────────
// Current Month Tab Component - CORRECTED DISPLAY
// ─────────────────────────────────────────────
const CurrentMonthTab = () => {
  const {
    form,
    setForm,
    errors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    allowanceOptions,
    totalAllowance,
    totalFromSources,
    showAllowanceBreakdown,
    setShowAllowanceBreakdown,
    showSalarySplit,
    setShowSalarySplit,
    sourceOptions,
    sourceLoading,
    salaryCalculation,
    calculatingSalary,
    showSalaryDetails,
    setShowSalaryDetails,
    selectedAccountIds,
    handleAccountIdsChange,
    updateSourceAmount,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSubmit,
  } = usePayrollForm();

  const navigate = useNavigate();
  const [actualBasicSalary, setActualBasicSalary] = useState("0.00");

  useEffect(() => {
    setForm((p) => ({ ...p, period: getCurrentMonth() }));
  }, [setForm]);

  useEffect(() => {
    const fetchActualBasicSalary = async () => {
      if (form.employeeId) {
        try {
          const res = await axios.get(
            `${backendUrl}/api/hrm/payroll/basic-payroll/employee/${form.employeeId}`,
          );
          if (res.data.success && res.data.data)
            setActualBasicSalary(
              res.data.data.currentBasicSalary?.toFixed(2) || "0.00",
            );
        } catch {
          setActualBasicSalary("0.00");
        }
      } else {
        setActualBasicSalary("0.00");
      }
    };
    fetchActualBasicSalary();
  }, [form.employeeId]);

  const mrOptions = useMemo(() => {
    if (mrListLoading)
      return [{ value: "", label: "Loading MRs...", disabled: true }];
    if (isMrListEmpty)
      return [{ value: "", label: "No MRs Available", disabled: true }];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || `MR ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty, mrListLoading]);

  const selectedAllowanceTypes = useMemo(
    () => (form.allowances || []).map((a) => a.type),
    [form.allowances],
  );
  const hasAdvance = (salaryCalculation?.advanceDeduction || 0) > 0;
  const net = parseFloat(form.netSalary) || 0;
  const sourceDiff = totalFromSources - net;

  // ✅ CORRECTED: Use totalSalaryDisplay which is already floored to 2 decimals (225.80)
  const displayBasicSalary =
    salaryCalculation?.totalSalaryDisplay?.toFixed(2) || "0.00";

  const isFormValid =
    form.employeeId &&
    form.period &&
    salaryCalculation &&
    form.sources.length > 0 &&
    !Object.values({
      period: errors.period,
      employeeId: errors.employeeId,
      sources: errors.sources,
    }).some(Boolean);

  return (
    <>
      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
          <svg
            className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293-1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800">
              No MRs Available
            </h3>
            <p className="mt-1 text-sm text-red-700">
              Add at least one MR with basic salary before creating payroll.
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
                  ? "No MRs"
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
              value={form.period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              max={getCurrentMonth()}
              disabled={isMrListEmpty}
              className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 ${isMrListEmpty ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
            />
            {errors.period && (
              <p className="mt-1 text-sm text-red-600">{errors.period}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Monthly Basic Salary ($){" "}
            </label>
            <input
              type="text"
              value={actualBasicSalary}
              readOnly
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 font-semibold text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">
              MR's fixed monthly basic (before any deductions)
            </p>
          </div>
        </div>

        {salaryCalculation && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium text-blue-800">
                Salary Calculated Automatically
              </h4>
              <p className="text-sm text-blue-600">
                Based on attendance & leaves (unpaid only)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSalaryDetails(true)}
              className="text-blue-600 hover:text-blue-800 text-sm font-semibold underline whitespace-nowrap"
            >
              View Details
            </button>
          </div>
        )}
        {calculatingSalary && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-2xl flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-600" />
            <span className="text-sm text-yellow-700">Calculating salary…</span>
          </div>
        )}

        {/* Row 2: Basic Salary, Leave Deduction, Advance, Net Salary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Basic Salary Deductions ($)
            </label>
            <input
              type="text"
              value={displayBasicSalary}
              readOnly
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 font-semibold text-gray-700 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">
              After leave &amp; advance deductions (floored)
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Leave Deduction ($)
            </label>
            <input
              type="text"
              value={form.deductions || "0.00"}
              readOnly
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">
              Based on unpaid leaves only (rounded)
            </p>
          </div>
          <div>
            <label
              className={`block text-sm font-medium mb-1 ${hasAdvance ? "text-red-700" : "text-gray-700"}`}
            >
              Advance Deduction ($)
            </label>
            <input
              type="text"
              value={salaryCalculation?.advanceDeduction?.toFixed(2) || "0.00"}
              readOnly
              className={`w-full px-4 py-3 border rounded-xl cursor-not-allowed font-semibold ${hasAdvance ? "border-red-300 bg-red-100 text-red-700" : "border-gray-300 bg-gray-100 text-gray-500"}`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Net Salary ($)
            </label>
            <input
              type="text"
              value={form.netSalary}
              readOnly
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-blue-50 font-bold text-blue-700 cursor-not-allowed text-lg"
            />
            <p className="text-xs text-gray-400 mt-1">
              Basic Salary + Allowances
            </p>
          </div>
        </div>

        {/* Row 3: Allowances */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
            <div className="flex gap-3">
              <input
                type="text"
                value={totalAllowance.toFixed(2)}
                readOnly
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 font-semibold text-gray-700 cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowAllowanceBreakdown(true)}
                disabled={!form.allowances || form.allowances.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                View
              </button>
            </div>
          </div>
        </div>

        {/* Row 4: Payment accounts / split */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <MultipleSelectDropdown
            label="Select Payment Accounts"
            value={selectedAccountIds}
            onChange={handleAccountIdsChange}
            options={sourceOptions.map((acc) => ({
              value: acc.value,
              label: acc.name,
            }))}
            placeholder="Select accounts to split salary"
            disabled={isMrListEmpty || sourceLoading}
          />
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Salary Split ($)
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={totalFromSources.toFixed(2)}
                readOnly
                className={`flex-1 px-4 py-3 border rounded-xl font-semibold cursor-not-allowed transition-colors ${selectedAccountIds.length > 0 && Math.abs(sourceDiff) > 0.01 ? "border-red-300 bg-red-50 text-red-700" : selectedAccountIds.length > 0 && Math.abs(sourceDiff) <= 0.01 && totalFromSources > 0 ? "border-green-300 bg-green-50 text-green-700" : "border-gray-300 bg-gray-100 text-gray-500"}`}
              />
              <button
                type="button"
                onClick={() => setShowSalarySplit(true)}
                disabled={selectedAccountIds.length === 0}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                View
              </button>
            </div>
            {selectedAccountIds.length > 0 && Math.abs(sourceDiff) > 0.01 && (
              <p className="text-xs text-red-500 mt-1">
                {sourceDiff > 0 ? "Over" : "Under"} by $
                {Math.abs(sourceDiff).toFixed(2)} — must equal net salary
              </p>
            )}
            {selectedAccountIds.length > 0 &&
              Math.abs(sourceDiff) <= 0.01 &&
              totalFromSources > 0 && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Balanced with net salary
                </p>
              )}
            {errors.sources && (
              <p className="text-red-500 text-xs mt-1">{errors.sources}</p>
            )}
          </div>
        </div>

        {/* Salary Summary Table */}
        <div className="mt-8 p-5 bg-white rounded-2xl shadow">
          <h3 className="text-lg font-semibold mb-4 text-center">
            Salary Summary
          </h3>
          <table className="w-full text-center border-collapse rounded-2xl overflow-hidden shadow">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3 font-medium">Basic Salary ($)</th>
                <th className="p-3 font-medium">Allowance ($)</th>
                <th className="p-3 font-medium">Net Salary ($)</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-white hover:bg-gray-50">
                <td className="p-4 font-semibold">{displayBasicSalary}</td>
                <td className="p-4 font-semibold text-blue-600">
                  +{totalAllowance.toFixed(2)}
                </td>
                <td className="p-4 font-bold text-green-600 text-lg">
                  {form.netSalary}
                </td>
              </tr>
            </tbody>
          </table>
          {salaryCalculation && (
            <div className="mt-3 flex flex-wrap gap-3 justify-center text-xs text-gray-500">
              <span className="bg-gray-100 px-3 py-1 rounded-full">
                Working Days: {salaryCalculation.workingDaysInMonth} (excl.
                Sundays &amp; holidays)
              </span>
              <span className="bg-gray-100 px-3 py-1 rounded-full">
                Present: {salaryCalculation.presentDays}
              </span>
              {salaryCalculation.isFull ? (
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium">
                  ✅ Full salary applied
                </span>
              ) : (
                <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-medium">
                  ⚠️ Unpaid leave deducted: {salaryCalculation.unpaidLeaves}{" "}
                  day(s)
                </span>
              )}
              {hasAdvance && (
                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                  Advance deducted: $
                  {salaryCalculation.advanceDeduction?.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end mt-10 gap-4">
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/payroll")}
            className="px-8 py-3 bg-gray-200 hover:bg-gray-300 rounded-2xl font-medium transition-colors"
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
            className={`px-10 py-3 rounded-2xl font-semibold transition-colors ${loading || !isFormValid || isMrListEmpty || calculatingSalary || sourceOptions.length === 0 ? "bg-gray-400 text-gray-200 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"}`}
          >
            {loading
              ? "Saving..."
              : calculatingSalary
                ? "Calculating..."
                : sourceOptions.length === 0
                  ? "No Source Account"
                  : "Save Payroll"}
          </button>
        </div>
      </form>

      <AllowanceBreakdownModal
        allowances={form.allowances || []}
        isOpen={showAllowanceBreakdown}
        onClose={() => setShowAllowanceBreakdown(false)}
        onAmountChange={handleAllowanceAmountChange}
        onRemove={removeAllowance}
      />
      <SalarySplitModal
        isOpen={showSalarySplit}
        onClose={() => setShowSalarySplit(false)}
        selectedAccountIds={selectedAccountIds}
        sources={form.sources}
        onAmountChange={updateSourceAmount}
        sourceOptions={sourceOptions}
        netSalary={form.netSalary}
      />
      <SalaryDetailsModal
        calculation={salaryCalculation}
        isOpen={showSalaryDetails}
        onClose={() => setShowSalaryDetails(false)}
      />
    </>
  );
};

// ─────────────────────────────────────────────
// MR Advance Tab Component
// ─────────────────────────────────────────────
const MrAdvanceTab = () => {
  const navigate = useNavigate();
  const { mrList, mrListLoading } = useAllMRList();
  const [sourceOptions, setSourceOptions] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [form, setForm] = useState({
    employeeId: "",
    date: new Date().toISOString().split("T")[0],
    sourceAccount: "",
    amount: "",
    remarks: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        setSourceLoading(true);
        const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
        const data = res.data.data || [];
        setSourceOptions(
          data
            .filter((d) => (d.totalAmount || 0) > 0)
            .map((d) => ({
              value: d._id,
              label: `${d.name} ($${d.totalAmount.toFixed(2)})`,
              balance: d.totalAmount,
            })),
        );
      } catch {
        showToast("error", "Failed to load source accounts");
      } finally {
        setSourceLoading(false);
      }
    };
    fetch();
  }, []);

  const mrOptions = useMemo(() => {
    if (mrListLoading)
      return [{ value: "", label: "Loading MRs...", disabled: true }];
    if (mrList.length === 0)
      return [{ value: "", label: "No MRs Available", disabled: true }];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || `MR ${mr._id}`,
    }));
  }, [mrList, mrListLoading]);

  const validate = () => {
    const e = {};
    if (!form.employeeId) e.employeeId = "MR is required";
    if (!form.date) e.date = "Date is required";
    if (!form.sourceAccount) e.sourceAccount = "Source account is required";
    if (!form.amount) e.amount = "Amount is required";
    else if (parseFloat(form.amount) <= 0) e.amount = "Amount must be > 0";
    else {
      const sel = sourceOptions.find((s) => s.value === form.sourceAccount);
      if (sel && parseFloat(form.amount) > sel.balance)
        e.amount = `Insufficient balance. Available: $${sel.balance.toFixed(2)}`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNumeric = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d{0,15}$/.test(value)) {
      setForm((p) => ({ ...p, [name]: value }));
      setErrors((p) => ({ ...p, [name]: "" }));
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await axios.post(`${backendUrl}/api/hrm/mr-advance`, {
        employeeId: form.employeeId,
        date: form.date,
        sourceAccount: form.sourceAccount,
        amount: parseFloat(form.amount),
        remarks: form.remarks,
      });
      if (res.data.success) {
        showToast("success", "Advance recorded successfully");
        setForm({
          employeeId: "",
          date: new Date().toISOString().split("T")[0],
          sourceAccount: "",
          amount: "",
          remarks: "",
        });
      } else throw new Error(res.data.message);
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to record advance",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            MR Name <span className="text-red-500">*</span>
          </label>
          <SearchableDropdown
            value={form.employeeId}
            onChange={(val) => {
              setForm((p) => ({ ...p, employeeId: val }));
              setErrors((p) => ({ ...p, employeeId: "" }));
            }}
            options={mrOptions}
            placeholder={mrListLoading ? "Loading..." : "Select MR"}
            loading={mrListLoading}
            error={errors.employeeId}
          />
          {errors.employeeId && (
            <p className="text-red-500 text-xs mt-1">{errors.employeeId}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="date"
            value={form.date}
            onChange={(e) => {
              setForm((p) => ({ ...p, date: e.target.value }));
              setErrors((p) => ({ ...p, date: "" }));
            }}
            className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none ${errors.date ? "border-red-500" : "border-gray-300 focus:ring-blue-200"}`}
          />
          {errors.date && (
            <p className="text-red-500 text-xs mt-1">{errors.date}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Source Account <span className="text-red-500">*</span>
          </label>
          <SearchableDropdown
            value={form.sourceAccount}
            onChange={(val) => {
              setForm((p) => ({ ...p, sourceAccount: val }));
              setErrors((p) => ({ ...p, sourceAccount: "" }));
            }}
            options={sourceOptions}
            placeholder={sourceLoading ? "Loading..." : "Select Account"}
            loading={sourceLoading}
            error={errors.sourceAccount}
          />
          {errors.sourceAccount && (
            <p className="text-red-500 text-xs mt-1">{errors.sourceAccount}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Amount ($) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="amount"
            value={form.amount}
            onChange={handleNumeric}
            placeholder="0.00"
            className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none ${errors.amount ? "border-red-500" : "border-gray-300 focus:ring-blue-200"}`}
          />
          {errors.amount && (
            <p className="text-red-500 text-xs mt-1">{errors.amount}</p>
          )}
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Remarks
        </label>
        <textarea
          name="remarks"
          value={form.remarks}
          onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))}
          rows="3"
          className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>
      <div className="flex justify-end gap-4 mt-6">
        <button
          type="button"
          onClick={() => navigate("/hrmlayout/payroll")}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-xl text-lg font-medium"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className={`px-6 py-3 rounded-xl shadow text-lg font-medium ${submitting ? "bg-gray-400 cursor-not-allowed text-gray-200" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"}`}
        >
          {submitting ? "Saving…" : "Record Advance"}
        </button>
      </div>
    </form>
  );
};

// ─────────────────────────────────────────────
// Previous Month Tab Component
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
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || `MR ${mr._id}`,
    }));
  }, [mrList, mrListLoading]);

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
    if (value === "" || /^\d*\.?\d{0,15}$/.test(value))
      updateRow(i, field, value);
  };
  const validateRows = () => {
    let valid = true;
    const newErrors = rows.map((row) => {
      const e = {};
      if (!row.employeeId) e.employeeId = "MR required";
      if (!row.period) e.period = "Period required";
      else if (row.period >= getCurrentMonth())
        e.period = "Must be previous month";
      if (!row.salary) e.salary = "Salary required";
      if (Object.keys(e).length > 0) valid = false;
      return e;
    });
    setRowErrors(newErrors);
    return valid;
  };
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!validateRows()) {
      showToast("error", "Fix validation errors");
      return;
    }
    try {
      setSubmitting(true);
      const payload = rows.map((row) => {
        const basicSalaryAmount = parseFloat(row.salary) || 0;
        const allowanceTotal = parseFloat(buildTotalAllowance(row)) || 0;
        const netSalaryValue = basicSalaryAmount + allowanceTotal;
        return {
          employeeId: row.employeeId,
          period: row.period,
          basicSalary: basicSalaryAmount,
          allowances: buildAllowances(row),
          totalAllowance: allowanceTotal,
          deductions: 0,
          netSalary: netSalaryValue,
          status: "pending",
          paymentMethod: "bank",
          payrollType: "previous",
        };
      });
      const res = await axios.post(
        `${backendUrl}/api/hrm/payroll/bulk`,
        payload,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 201 || res.status === 200) {
        showToast("success", res.data.message || "Payroll saved");
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else throw new Error(res.data.message);
    } catch (err) {
      console.error("Save error:", err.response?.data);
      showToast(
        "error",
        err.response?.data?.message || err.message || "Failed to save",
      );
    } finally {
      setSubmitting(false);
    }
  };
  const downloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const mainSheet = workbook.addWorksheet("Payroll");
      mainSheet.columns = EXCEL_HEADERS.map((h) => ({
        header: h,
        key: h.replace(/[^a-zA-Z]/g, ""),
        width: 22,
      }));
      mainSheet.addRow({});
      const mrSheet = workbook.addWorksheet("MR List");
      mrSheet.columns = [{ header: "MR Name", key: "name", width: 30 }];
      mrList.forEach((mr) =>
        mrSheet.addRow({ name: mr.medicalRepName || "Unknown" }),
      );
      const lastRow = mrList.length + 1;
      mainSheet.dataValidations.add(`A2:A1000`, {
        type: "list",
        allowBlank: true,
        formulae: [`'MR List'!$A$2:$A$${lastRow}`],
        error: "Invalid MR Name",
        errorTitle: "Invalid MR Name",
      });
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(
        new Blob([buffer], { type: "application/octet-stream" }),
        "previous_month_payroll_template.xlsx",
      );
    } catch {
      showToast("error", "Failed to generate template");
    }
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
          if (!row.mrName) errors.push(`Row ${row.rowIndex}: MR Name required`);
          else {
            const found = mrList.find(
              (m) =>
                (m.medicalRepName || "").toLowerCase() ===
                row.mrName.toLowerCase(),
            );
            if (!found)
              errors.push(`Row ${row.rowIndex}: MR "${row.mrName}" not found`);
          }
          if (!row.period || !/^\d{4}-\d{2}$/.test(row.period))
            errors.push(`Row ${row.rowIndex}: Period must be YYYY-MM`);
          else if (row.period >= getCurrentMonth())
            errors.push(`Row ${row.rowIndex}: Must be previous month`);
          if (!row.salary || isNaN(parseFloat(row.salary)))
            errors.push(`Row ${row.rowIndex}: Salary must be a number`);
        });
        setExcelErrors(errors);
        setExcelRows(parsed);
      } catch {
        showToast("error", "Failed to parse file. Use the template.");
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
      showToast("error", "Upload a file first");
      return;
    }
    if (excelErrors.length > 0) {
      showToast("error", "Fix errors in file");
      return;
    }
    try {
      setUploading(true);
      const payload = excelRows.map((row) => {
        const mr = mrList.find(
          (m) =>
            (m.medicalRepName || "").toLowerCase() === row.mrName.toLowerCase(),
        );
        const basicSalaryAmount = parseFloat(row.salary) || 0;
        const allowanceTotal = parseFloat(buildTotalAllowance(row)) || 0;
        const netSalaryValue = basicSalaryAmount + allowanceTotal;
        return {
          employeeId: mr?._id || null,
          employeeName: row.mrName,
          period: row.period,
          basicSalary: basicSalaryAmount,
          allowances: buildAllowances(row),
          totalAllowance: allowanceTotal,
          deductions: 0,
          netSalary: netSalaryValue,
          status: "pending",
          paymentMethod: "bank",
          payrollType: "previous",
        };
      });
      const missing = payload
        .filter((p) => !p.employeeId)
        .map((p) => p.employeeName);
      if (missing.length > 0) {
        showToast("error", `MRs not found: ${missing.join(", ")}`);
        setUploading(false);
        return;
      }
      const res = await axios.post(
        `${backendUrl}/api/hrm/payroll/bulk`,
        payload,
        { headers: { "Content-Type": "application/json" } },
      );
      if (res.status === 201 || res.status === 200) {
        showToast("success", res.data.message || "Payroll uploaded");
        setTimeout(() => navigate("/hrmlayout/payroll"), 1000);
      } else throw new Error(res.data.message);
    } catch (err) {
      console.error("Upload error:", err.response?.data);
      showToast(
        "error",
        err.response?.data?.message || err.message || "Failed to upload",
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
      <div className="mb-5 p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2">
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
          All MRs listed here. Enter previous month payroll manually or via
          Excel.
        </p>
      </div>
      <div className="flex gap-3 mb-6">
        {["manual", "excel"].map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setEntryMode(mode)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${entryMode === mode ? (mode === "manual" ? "bg-blue-600 text-white shadow" : "bg-green-600 text-white shadow") : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {mode === "manual" ? "✏️ Manual Entry" : "📊 Upload Excel"}
          </button>
        ))}
      </div>
      {entryMode === "manual" && (
        <form onSubmit={handleManualSubmit}>
          <div className="space-y-6">
            {rows.map((row, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-2xl p-5 bg-gray-50"
              >
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Entry #{index + 1}
                  </h4>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="text-red-500 hover:text-red-700 text-sm font-medium"
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      MR Name <span className="text-red-500">*</span>
                    </label>
                    <SearchableDropdown
                      value={row.employeeId}
                      onChange={(v) => updateRow(index, "employeeId", v)}
                      options={mrOptions}
                      placeholder={mrListLoading ? "Loading..." : "Select MR"}
                      loading={mrListLoading}
                      error={rowErrors[index]?.employeeId}
                    />
                    {rowErrors[index]?.employeeId && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].employeeId}
                      </p>
                    )}
                  </div>
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
                      className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none bg-white ${rowErrors[index]?.period ? "border-red-500" : "border-gray-300 focus:ring-blue-200"}`}
                    />
                    {rowErrors[index]?.period && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].period}
                      </p>
                    )}
                  </div>
                  {[
                    ["salary", "Salary ($)", true],
                    ["incentive", "Incentive ($)", false],
                    ["allowance", "Allowance ($)", false],
                    ["tourExpense", "Tour Expense ($)", false],
                    ["otherExpense", "Other Expense ($)", false],
                  ].map(([field, label, required]) => (
                    <div key={field} className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        {label}
                        {required && <span className="text-red-500"> *</span>}
                      </label>
                      <input
                        type="text"
                        value={row[field]}
                        onChange={(e) =>
                          handleNumericRow(index, field, e.target.value)
                        }
                        placeholder="0.00"
                        className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:outline-none bg-white ${rowErrors[index]?.[field] ? "border-red-500" : "border-gray-300 focus:ring-blue-200"}`}
                      />
                      {rowErrors[index]?.[field] && (
                        <p className="text-red-500 text-xs mt-1">
                          {rowErrors[index][field]}
                        </p>
                      )}
                    </div>
                  ))}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium text-gray-700 mb-1">
                      Total ($)
                    </label>
                    <input
                      type="text"
                      value={computeTotal(row)}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl bg-green-50 font-semibold text-green-700 cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-2xl flex justify-between items-center">
            <span className="text-sm font-medium text-blue-800">
              Grand Total Expense
            </span>
            <span className="text-lg font-bold text-blue-900">
              ${totalExpenseSum}
            </span>
          </div>
          <div className="flex justify-between items-center mt-6">
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-300 text-blue-700 rounded-xl hover:bg-blue-100 font-medium"
            >
              <span className="text-lg font-bold">+</span> Add Another MR
            </button>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate("/hrmlayout/payroll")}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-xl text-lg font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || mrListLoading}
                className={`px-6 py-3 rounded-xl shadow text-lg font-medium ${submitting || mrListLoading ? "bg-gray-400 cursor-not-allowed text-gray-200" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"}`}
              >
                {submitting ? "Saving…" : "Save Previous Month Payroll"}
              </button>
            </div>
          </div>
        </form>
      )}
      {entryMode === "excel" && (
        <form onSubmit={handleExcelSubmit}>
          <div className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center mb-6 bg-gray-50">
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
              Upload Excel (.xlsx, .xls)
            </p>
            <p className="text-gray-400 text-sm mb-4">
              Columns: MR Name · Pay Period (YYYY-MM) · Salary · Incentive ·
              Allowance · Tour Expense · Other Expense
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={downloadTemplate}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 text-sm font-medium"
              >
                ⬇ Download Template
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 text-sm font-medium"
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
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
              <h4 className="text-sm font-semibold text-red-800 mb-2">
                Fix these errors:
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
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm text-center border-collapse">
                  <thead className="bg-gray-100">
                    <tr>
                      {[
                        "MR Name",
                        "Pay Period",
                        "Salary ($)",
                        "Incentive ($)",
                        "Allowance ($)",
                        "Tour ($)",
                        "Other ($)",
                        "Total ($)",
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
              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl flex justify-between items-center">
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
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-xl text-lg font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                uploading || excelRows.length === 0 || excelErrors.length > 0
              }
              className={`px-6 py-3 rounded-xl shadow text-lg font-medium ${uploading || excelRows.length === 0 || excelErrors.length > 0 ? "bg-gray-400 cursor-not-allowed text-gray-200" : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"}`}
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
// Main Component
// ─────────────────────────────────────────────
const AddPayroll = () => {
  const [activeTab, setActiveTab] = useState("current");
  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-2xl font-semibold text-gray-800 mb-8">
        Add New Payroll
      </h2>
      <div className="flex border-b border-gray-200 mb-8">
        {[
          ["current", "Current Month"],
          ["previous", "Previous Month"],
          ["advance", "MR Advance"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`py-3 px-8 font-medium text-sm border-b-2 transition-colors ${activeTab === key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "current" && <CurrentMonthTab />}
      {activeTab === "previous" && <PreviousMonthTab />}
      {activeTab === "advance" && <MrAdvanceTab />}
    </div>
  );
};

export default AddPayroll;
