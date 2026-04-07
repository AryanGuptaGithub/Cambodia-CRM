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
          className={`w-full border border-gray-300 rounded-md px-3 py-2 cursor-pointer min-h-[42px] flex flex-wrap items-center gap-1 ${
            disabled ? "bg-gray-100 cursor-not-allowed" : "bg-white"
          } ${error ? "border-red-500" : ""}`}
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
                  className={`px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 flex items-center ${
                    value.includes(o.value) ? "bg-blue-50" : ""
                  }`}
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

// Updated Allowance Breakdown Modal with Cash Balance and User Value
const AllowanceBreakdownModal = ({
  allowances,
  isOpen,
  onClose,
  onAmountChange,
  onRemove,
  cashBalance,
}) => {
  const [splitType, setSplitType] = useState({});
  const [userValue, setUserValue] = useState({});

  if (!isOpen) return null;

  const handleSplitTypeChange = (type, split) => {
    setSplitType({ ...splitType, [type]: split });
    if (split === "cash") {
      const halfAmount = (cashBalance / 2).toFixed(2);
      onAmountChange(type, halfAmount);
      setUserValue({ ...userValue, [type]: "" });
    } else {
      onAmountChange(type, "");
    }
  };

  const handleUserValueChange = (type, value) => {
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setUserValue({ ...userValue, [type]: value });
      onAmountChange(type, value);
    }
  };

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
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {allowances.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No allowances added
            </p>
          ) : (
            allowances.map((a, i) => (
              <div key={i} className="p-3 border rounded-lg bg-gray-50">
                <div className="mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    {a.type}
                  </label>
                </div>

                {splitType[a.type] === "cash" && (
                  <div className="mb-2">
                    <label className="text-xs text-gray-600 mb-1 block">
                      Amount (50% of Cash Balance):
                    </label>
                    <input
                      type="text"
                      value={(cashBalance / 2).toFixed(2)}
                      readOnly
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm bg-gray-100 cursor-not-allowed"
                    />
                    <p className="text-xs text-green-600 mt-1">
                      Cash Balance: ${cashBalance.toFixed(2)} → Half: $
                      {(cashBalance / 2).toFixed(2)}
                    </p>
                  </div>
                )}

                {splitType[a.type] === "user" && (
                  <div className="mb-2">
                    <label className="text-xs text-gray-600 mb-1 block">
                      Enter Amount:
                    </label>
                    <input
                      type="text"
                      value={userValue[a.type] || a.amount}
                      onChange={(e) =>
                        handleUserValueChange(a.type, e.target.value)
                      }
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {!splitType[a.type] && (
                  <div className="mb-2">
                    <label className="text-xs text-gray-600 mb-1 block">
                      Amount:
                    </label>
                    <input
                      type="text"
                      value={a.amount}
                      onChange={(e) => handleNumeric(e, a.type)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => onRemove(a.type)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
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

  const advanceDeduction = calculation.advanceDeduction || 0;
  const totalAfterAdvance = (calculation.totalSalary || 0) - advanceDeduction;

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
          <div className="text-sm font-medium text-gray-700">Basic Salary:</div>
          <div className="text-sm">${fmt(calculation.basicSalary)}</div>

          <div className="text-sm font-medium text-gray-700">
            Per Day Salary:
          </div>
          <div className="text-sm">${fmt(calculation.perDaySalary)}</div>

          <div className="text-sm font-medium text-gray-700">
            Per Minute Salary:
          </div>
          <div className="text-sm">${fmt(calculation.perMinuteSalary)}</div>

          <div className="text-sm font-medium text-gray-700">Working Days:</div>
          <div className="text-sm">{fmtN(calculation.totalWorkingDays)}</div>

          <div className="text-sm font-medium text-gray-700">Present Days:</div>
          <div className="text-sm">{fmtN(calculation.presentDays)}</div>

          <div className="text-sm font-medium text-gray-700">Total Leaves:</div>
          <div className="text-sm">{fmtN(calculation.totalLeaves)}</div>

          <div className="text-sm font-medium text-gray-700">Paid Leaves:</div>
          <div className="text-sm">{fmtN(calculation.paidLeaves)}</div>

          <div className="text-sm font-medium text-gray-700">
            Unpaid Leaves:
          </div>
          <div className="text-sm">{fmtN(calculation.unpaidLeaves)}</div>

          <div className="text-sm font-medium text-gray-700">Swap Leaves:</div>
          <div className="text-sm">{fmtN(calculation.swapLeaves)}</div>

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

          {advanceDeduction > 0 && (
            <>
              <div className="text-sm font-medium text-red-600">
                Advance Deduction:
              </div>
              <div className="text-sm text-red-600">
                -${fmt(advanceDeduction)}
              </div>
            </>
          )}

          <div className="text-sm font-medium text-gray-700">Total Salary:</div>
          <div className="text-sm font-semibold">${fmt(totalAfterAdvance)}</div>
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

// Updated Salary Sources List Component with Checkboxes
const SalarySourcesList = ({
  sources,
  setSources,
  sourceOptions,
  netSalary,
  errors,
  setErrors,
}) => {
  const addSource = () => {
    setSources([...sources, { accountId: "", amount: "", type: "" }]);
  };

  const updateSource = (idx, field, value) => {
    const updated = [...sources];
    updated[idx][field] = value;

    // If type is selected, find the matching account and set amount
    if (field === "type") {
      const selectedAccount = sourceOptions.find((opt) => opt.type === value);
      if (selectedAccount) {
        updated[idx].accountId = selectedAccount.value;
        updated[idx].amount = selectedAccount.balance.toString();
      } else {
        updated[idx].amount = "";
      }
    }

    setSources(updated);

    // Validate total after change
    const total = updated.reduce(
      (sum, s) => sum + (parseFloat(s.amount) || 0),
      0,
    );
    if (Math.abs(total - parseFloat(netSalary)) > 0.01) {
      setErrors((prev) => ({
        ...prev,
        sources: `Total sources (${total.toFixed(2)}) must equal net salary (${parseFloat(netSalary).toFixed(2)})`,
      }));
    } else {
      setErrors((prev) => ({ ...prev, sources: "" }));
    }
  };

  const removeSource = (idx) => {
    const updated = sources.filter((_, i) => i !== idx);
    setSources(updated);
    const total = updated.reduce(
      (sum, s) => sum + (parseFloat(s.amount) || 0),
      0,
    );
    if (Math.abs(total - parseFloat(netSalary)) > 0.01) {
      setErrors((prev) => ({
        ...prev,
        sources: `Total sources (${total.toFixed(2)}) must equal net salary (${parseFloat(netSalary).toFixed(2)})`,
      }));
    } else {
      setErrors((prev) => ({ ...prev, sources: "" }));
    }
  };

  // Group source options by type
  const getOptionsByType = () => {
    const grouped = {
      cash_balance: [],
      personal: [],
      company: [],
    };

    sourceOptions.forEach((option) => {
      if (option.type === "cash_balance" || option.type === "cashbalance") {
        grouped.cash_balance.push(option);
      } else if (
        option.type === "personal" ||
        option.type === "personal_account"
      ) {
        grouped.personal.push(option);
      } else if (
        option.type === "company" ||
        option.type === "company_account"
      ) {
        grouped.company.push(option);
      }
    });

    return grouped;
  };

  const groupedOptions = getOptionsByType();

  const accountTypes = [
    {
      value: "cash_balance",
      label: "Cash Balance Account",
      options: groupedOptions.cash_balance,
    },
    {
      value: "personal",
      label: "Personal Account",
      options: groupedOptions.personal,
    },
    {
      value: "company",
      label: "Company Account",
      options: groupedOptions.company,
    },
  ];

  // Check if a type is selected for a source
  const isTypeSelected = (idx, typeValue) => {
    return sources[idx]?.type === typeValue;
  };

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Salary Sources (Split Payment) *
      </label>
      {sources.map((src, idx) => (
        <div key={idx} className="border rounded-lg p-4 mb-3 bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-700">
              Source {idx + 1}
            </h4>
            {sources.length > 1 && (
              <button
                type="button"
                onClick={() => removeSource(idx)}
                className="text-red-500 hover:text-red-700 text-sm"
              >
                Remove
              </button>
            )}
          </div>

          <div className="mb-3">
            <label className="text-xs text-gray-600 mb-2 block">
              Select Account Type:
            </label>
            <div className="space-y-3">
              {accountTypes.map(
                (type) =>
                  type.options.length > 0 && (
                    <div
                      key={type.value}
                      className="border rounded-md p-3 bg-white"
                    >
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isTypeSelected(idx, type.value)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              // Uncheck other types first
                              updateSource(idx, "type", type.value);
                            } else {
                              // Uncheck this type
                              updateSource(idx, "type", "");
                            }
                          }}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">
                          {type.label}
                        </span>
                      </label>

                      {isTypeSelected(idx, type.value) &&
                        type.options.length > 0 && (
                          <div className="mt-3 ml-6 pl-3 border-l-2 border-blue-200">
                            {type.options.map((option) => (
                              <div
                                key={option.value}
                                className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0"
                              >
                                <input
                                  className="text-sm text-gray-600"
                                  type="text"
                                />

                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-semibold text-green-600">
                                    Balance: ${option.balance.toFixed(2)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      updateSource(idx, "type", type.value);
                                    }}
                                    className={`px-3 py-1 text-xs rounded ${
                                      src.type === type.value &&
                                      src.accountId === option.value
                                        ? "bg-green-600 text-white"
                                        : "bg-blue-600 text-white hover:bg-blue-700"
                                    }`}
                                  >
                                    Use This
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  ),
              )}
            </div>
          </div>

          {/* Selected Source Details */}
          {src.type && src.accountId && (
            <div className="mt-3 p-3 bg-blue-50 rounded-md">
              <div className="flex justify-between items-center">
                <div>
                  <span className="text-xs text-gray-600">
                    Selected Account:
                  </span>
                  <p className="text-sm font-medium text-gray-800">
                    {sourceOptions.find((opt) => opt.value === src.accountId)
                      ?.label || "Account selected"}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-600">
                    Amount to Transfer:
                  </span>
                  <p className="text-lg font-bold text-green-600">
                    ${parseFloat(src.amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {errors.sources && (
        <p className="text-red-500 text-xs mt-2">{errors.sources}</p>
      )}

      {/* Total Sources Summary */}
      {sources.length > 0 && (
        <div className="mt-4 p-3 bg-gray-100 rounded-md">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Total from all sources:
            </span>
            <span
              className={`text-lg font-bold ${Math.abs(parseFloat(sources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)).toFixed(2) - parseFloat(netSalary)) < 0.01 ? "text-green-600" : "text-red-600"}`}
            >
              $
              {sources
                .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
                .toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center mt-1">
            <span className="text-sm font-medium text-gray-700">
              Net Salary:
            </span>
            <span className="text-lg font-bold text-blue-600">
              ${netSalary}
            </span>
          </div>
          {Math.abs(
            parseFloat(
              sources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0),
            ).toFixed(2) - parseFloat(netSalary),
          ) > 0.01 && (
            <p className="text-xs text-red-500 mt-2">
              Total source amounts must equal net salary
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// HOOK: fetch ALL MRs from Staff collection
// ─────────────────────────────────────────────
const useAllMRList = () => {
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setMrListLoading(true);
        const res = await axios.get(`${backendUrl}/api/hrm/payroll/mrs/all`);
        if (res.data.success) {
          setMrList(res.data.data || []);
        } else {
          throw new Error("Primary endpoint failed");
        }
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
// CURRENT MONTH — hook (updated for multiple sources)
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
    sources: [],
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
  const [cashBalance, setCashBalance] = useState(0);

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
          label: `${d.name || `Account ${d.code || d._id || d.id}`} ($${(
            d.totalAmount ||
            d.amount ||
            d.balance ||
            0
          ).toFixed(2)})`,
          balance: d.totalAmount || d.amount || d.balance || 0,
          type: d.code || d.name?.toLowerCase().replace(/\s/g, "_") || "",
        }));
      setSourceOptions(options);

      // Find the cash balance account specifically
      const cashBalanceAccount = destinations.find(
        (d) =>
          d.code === "cash_balance" || d.name?.toLowerCase() === "cash balance",
      );
      const cashBalanceAmount =
        cashBalanceAccount?.totalAmount ||
        cashBalanceAccount?.amount ||
        cashBalanceAccount?.balance ||
        0;
      setCashBalance(cashBalanceAmount);

      if (options.length === 0)
        showToast("warning", "No source accounts with balance available.");
    } catch (error) {
      console.error("Error fetching source options:", error);
      showToast("error", "Failed to load source options");
      setSourceOptions([]);
      setCashBalance(0);
    } finally {
      setSourceLoading(false);
    }
  }, []);

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
    if (!form.sources || form.sources.length === 0) {
      e.sources = "At least one source account is required";
    } else {
      let totalSources = 0;
      for (let src of form.sources) {
        if (!src.type) {
          e.sources = "Please select account type for each source";
          break;
        }
        if (!src.accountId) {
          e.sources = "Please select an account for each source";
          break;
        }
        totalSources += parseFloat(src.amount) || 0;
      }
      const net = parseFloat(form.netSalary) || 0;
      if (Math.abs(totalSources - net) > 0.01) {
        e.sources = `Total source amounts (${totalSources.toFixed(2)}) must equal net salary (${net.toFixed(2)})`;
      }
    }
    const basic = parseFloat(form.basicSalary) || 0;
    const net = parseFloat(form.netSalary) || 0;
    if (net > basic) {
      e.netSalary = `Net salary cannot exceed basic salary (${basic.toFixed(2)})`;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }, [form]);

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

  const handleSourcesChange = useCallback((newSources) => {
    setForm((p) => ({ ...p, sources: newSources }));
    setErrors((p) => ({ ...p, sources: "" }));
  }, []);

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
        employeeId: form.employeeId,
        period: form.period,
        basicSalary: parseFloat(form.basicSalary) || 0,
        allowances: processedAllowances,
        deductions: parseFloat(form.deductions) || 0,
        netSalary: parseFloat(form.netSalary) || 0,
        status: form.status,
        sources: form.sources.map((s) => ({
          accountId: s.accountId,
          accountType: s.type,
          amount: parseFloat(s.amount) || 0,
        })),
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
    setErrors,
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
    cashBalance,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSourcesChange,
    handleSubmit,
    setForm,
    validate,
  };
};
const SalarySourcesSection = ({
  sources,
  setSources,
  sourceOptions,
  netSalary,
  errors,
  setErrors,
}) => {
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  // Auto select cash balance if available
  useEffect(() => {
    if (sourceOptions.length > 0 && sources.length === 0) {
      const cashAccount = sourceOptions.find((opt) =>
        opt.label.toLowerCase().includes("cash"),
      );
      if (cashAccount) {
        setSources([
          { accountId: cashAccount.value, amount: "", type: "cash_balance" },
        ]);
        setSelectedAccountIds([cashAccount.value]);
      }
    }
  }, [sourceOptions]);

  const toggleAccount = (account) => {
    const isSelected = selectedAccountIds.includes(account.value);

    if (isSelected) {
      setSelectedAccountIds((prev) =>
        prev.filter((id) => id !== account.value),
      );
      setSources((prev) => prev.filter((s) => s.accountId !== account.value));
    } else {
      setSelectedAccountIds((prev) => [...prev, account.value]);
      setSources((prev) => [
        ...prev,
        {
          accountId: account.value,
          amount: "",
          type: account.type || "personal",
        },
      ]);
    }
    setErrors((prev) => ({ ...prev, sources: "" }));
  };

  const updateAmount = (accountId, amount) => {
    setSources((prev) =>
      prev.map((src) =>
        src.accountId === accountId ? { ...src, amount } : src,
      ),
    );

    const total = sources.reduce(
      (sum, s) => sum + (parseFloat(s.amount) || 0),
      0,
    );
    if (Math.abs(total - parseFloat(netSalary)) > 0.01) {
      setErrors((prev) => ({
        ...prev,
        sources: `Total sources ($${total.toFixed(2)}) must equal net salary ($${parseFloat(netSalary).toFixed(2)})`,
      }));
    } else {
      setErrors((prev) => ({ ...prev, sources: "" }));
    }
  };

  const totalFromSources = sources.reduce(
    (sum, s) => sum + (parseFloat(s.amount) || 0),
    0,
  );

  return (
    <div className="mb-8">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Salary Sources (Split Payment) <span className="text-red-500">*</span>
      </label>

      {/* Same as Allowance Type */}
      <MultipleSelectDropdown
        label="Select Payment Accounts"
        value={selectedAccountIds}
        onChange={setSelectedAccountIds}
        options={sourceOptions.map((acc) => ({
          value: acc.value,
          label: acc.label,
        }))}
        placeholder="Select accounts to split salary"
      />

      {/* Amount Input Fields */}
      {sources.length > 0 && (
        <div className="mt-6 space-y-4">
          {sources.map((src, idx) => {
            const account = sourceOptions.find(
              (a) => a.value === src.accountId,
            );
            return (
              <div
                key={idx}
                className="bg-white border border-gray-200 rounded-xl p-5"
              >
                <div className="font-medium text-gray-800 mb-3">
                  {account?.label}
                </div>
                <input
                  type="text"
                  value={src.amount || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || /^\d*\.?\d{0,2}$/.test(val)) {
                      updateAmount(src.accountId, val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full px-5 py-4 border border-gray-300 rounded-xl text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            );
          })}

          {/* Total from Sources - Same as Total Allowance */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl p-5">
            <span className="text-sm font-medium text-gray-700">
              Total from Sources
            </span>
            <span
              className={`text-2xl font-bold ${Math.abs(totalFromSources - parseFloat(netSalary)) < 0.01 ? "text-green-600" : "text-red-600"}`}
            >
              ${totalFromSources.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {errors.sources && (
        <p className="text-red-500 text-sm mt-3">{errors.sources}</p>
      )}
    </div>
  );
};

const CurrentMonthTab = () => {
  const {
    form,
    errors,
    setErrors,
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
    cashBalance,
    handleNumeric,
    handleAllowanceChange,
    handleAllowanceAmountChange,
    removeAllowance,
    handleEmployeeChange,
    handlePeriodChange,
    handleSourcesChange,
    handleSubmit,
    setForm,
  } = usePayrollForm();

  const navigate = useNavigate();

  const selectedAllowanceTypes = useMemo(
    () => (form.allowances || []).map((a) => a.type),
    [form.allowances],
  );

  return (
    <>
      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <h3 className="text-sm font-medium text-red-800">No MRs Available</h3>
          <p className="text-sm text-red-700 mt-1">
            Please add basic salary for MRs first in MR Basic Payroll section.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <SearchableDropdown
            label="MR Name"
            value={form.employeeId}
            onChange={handleEmployeeChange}
            options={mrList.map((mr) => ({
              value: mr._id,
              label: mr.medicalRepName || `MR ${mr._id}`,
            }))}
            placeholder={
              mrListLoading
                ? "Loading..."
                : isMrListEmpty
                  ? "No MRs Available"
                  : "Select MR"
            }
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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Basic Salary, Deductions, Net Salary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deductions ($)
            </label>
            <input
              type="text"
              value={form.deductions || "0.00"}
              readOnly
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-100"
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
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-blue-50 font-semibold text-blue-700"
            />
          </div>
        </div>

        {/* Allowance Type + Total Allowance */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <MultipleSelectDropdown
            label="Allowance Type"
            value={selectedAllowanceTypes}
            onChange={handleAllowanceChange}
            options={allowanceOptions}
            placeholder="Select allowance types"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Total Allowance ($)
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={totalAllowance.toFixed(2)}
                readOnly
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl bg-gray-100 font-medium"
              />
              <button
                type="button"
                onClick={() => setShowAllowanceBreakdown(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-xl font-medium"
              >
                View
              </button>
            </div>
          </div>
        </div>

        {/* Salary Sources - Same Layout as Allowance Type */}
        <SalarySourcesSection
          sources={form.sources}
          setSources={handleSourcesChange}
          sourceOptions={sourceOptions}
          netSalary={form.netSalary}
          errors={errors}
          setErrors={setErrors}
        />

        {/* Summary Table */}
        <div className="mt-10 p-5 bg-white rounded-2xl shadow">
          <h3 className="text-lg font-semibold mb-4 text-center">
            Salary Summary
          </h3>
          <table className="w-full text-center">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3">Basic Salary ($)</th>
                <th className="p-3">Allowance ($)</th>
                <th className="p-3">Deductions ($)</th>
                <th className="p-3">Net Salary ($)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-4 font-semibold">
                  {form.basicSalary || "0.00"}
                </td>
                <td className="p-4 font-semibold">
                  {totalAllowance.toFixed(2)}
                </td>
                <td className="p-4 font-semibold text-red-600">
                  -{form.deductions || "0.00"}
                </td>
                <td className="p-4 font-semibold text-green-600">
                  {form.netSalary}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4 mt-10">
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/payroll")}
            className="px-8 py-3 bg-gray-200 hover:bg-gray-300 rounded-2xl font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-10 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-semibold disabled:bg-gray-400"
          >
            {loading ? "Saving..." : "Save Payroll"}
          </button>
        </div>
      </form>

      <AllowanceBreakdownModal
        allowances={form.allowances || []}
        isOpen={showAllowanceBreakdown}
        onClose={() => setShowAllowanceBreakdown(false)}
        onAmountChange={handleAllowanceAmountChange}
        onRemove={removeAllowance}
        cashBalance={cashBalance}
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
// MR ADVANCE TAB
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
    const fetchSourceOptions = async () => {
      try {
        setSourceLoading(true);
        const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
        const data = res.data.data || [];
        const options = data
          .filter((d) => (d.totalAmount || 0) > 0)
          .map((d) => ({
            value: d._id,
            label: `${d.name} ($${d.totalAmount.toFixed(2)})`,
            balance: d.totalAmount,
          }));
        setSourceOptions(options);
      } catch (error) {
        showToast("error", "Failed to load source accounts");
      } finally {
        setSourceLoading(false);
      }
    };
    fetchSourceOptions();
  }, []);

  const mrOptions = useMemo(() => {
    if (mrListLoading)
      return [{ value: "", label: "Loading MRs...", disabled: true }];
    if (mrList.length === 0)
      return [{ value: "", label: "No MRs Available", disabled: true }];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
    }));
  }, [mrList, mrListLoading]);

  const validate = () => {
    const e = {};
    if (!form.employeeId) e.employeeId = "MR is required";
    if (!form.date) e.date = "Date is required";
    if (!form.sourceAccount) e.sourceAccount = "Source account is required";
    if (!form.amount) e.amount = "Amount is required";
    else if (parseFloat(form.amount) <= 0)
      e.amount = "Amount must be greater than 0";
    else {
      const selected = sourceOptions.find(
        (s) => s.value === form.sourceAccount,
      );
      if (selected && parseFloat(form.amount) > selected.balance) {
        e.amount = `Insufficient balance. Available: $${selected.balance.toFixed(2)}`;
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNumeric = (e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        employeeId: form.employeeId,
        date: form.date,
        sourceAccount: form.sourceAccount,
        amount: parseFloat(form.amount),
        remarks: form.remarks,
      };
      const res = await axios.post(`${backendUrl}/api/hrm/mr-advance`, payload);
      if (res.data.success) {
        showToast("success", "Advance recorded successfully");
        setForm({
          employeeId: "",
          date: new Date().toISOString().split("T")[0],
          sourceAccount: "",
          amount: "",
          remarks: "",
        });
        const fetchOptions = async () => {
          const res2 = await axios.get(
            `${backendUrl}/api/accounts/destinations`,
          );
          const data = res2.data.data || [];
          const options = data
            .filter((d) => (d.totalAmount || 0) > 0)
            .map((d) => ({
              value: d._id,
              label: `${d.name} ($${d.totalAmount.toFixed(2)})`,
              balance: d.totalAmount,
            }));
          setSourceOptions(options);
        };
        fetchOptions();
      } else {
        throw new Error(res.data.message);
      }
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
    <div>
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MR Name <span className="text-red-500">*</span>
            </label>
            <SearchableDropdown
              value={form.employeeId}
              onChange={(val) => {
                setForm((prev) => ({ ...prev, employeeId: val }));
                setErrors((prev) => ({ ...prev, employeeId: "" }));
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
                setForm((prev) => ({ ...prev, date: e.target.value }));
                setErrors((prev) => ({ ...prev, date: "" }));
              }}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.date
                  ? "border-red-500 focus:ring-red-200"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              }`}
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
                setForm((prev) => ({ ...prev, sourceAccount: val }));
                setErrors((prev) => ({ ...prev, sourceAccount: "" }));
              }}
              options={sourceOptions}
              placeholder={
                sourceLoading ? "Loading..." : "Select Source Account"
              }
              loading={sourceLoading}
              error={errors.sourceAccount}
            />
            {errors.sourceAccount && (
              <p className="text-red-500 text-xs mt-1">
                {errors.sourceAccount}
              </p>
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
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none ${
                errors.amount
                  ? "border-red-500 focus:ring-red-200"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              }`}
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
            onChange={(e) =>
              setForm((prev) => ({ ...prev, remarks: e.target.value }))
            }
            rows="3"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

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
            disabled={submitting}
            className={`px-6 py-3 rounded-lg shadow text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              submitting
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"
            }`}
          >
            {submitting ? "Saving…" : "Record Advance"}
          </button>
        </div>
      </form>
    </div>
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
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
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
      mrList.forEach((mr) => {
        mrSheet.addRow({
          name: mr.medicalRepName || mr.employeeName || "Unknown",
        });
      });
      const lastRow = mrList.length + 1;
      const validationFormula = `'MR List'!$A$2:$A$${lastRow}`;
      mainSheet.dataValidations.add(`A2:A1000`, {
        type: "list",
        allowBlank: true,
        formulae: [validationFormula],
        error: "Please select a valid MR name from the list",
        errorTitle: "Invalid MR Name",
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      saveAs(blob, "previous_month_payroll_template.xlsx");
    } catch (error) {
      console.error("Error generating template:", error);
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

      <div className="flex gap-3 mb-6">
        <button
          type="button"
          onClick={() => setEntryMode("manual")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
            entryMode === "manual"
              ? "bg-blue-600 text-white shadow"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          ✏️ Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setEntryMode("excel")}
          className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
            entryMode === "excel"
              ? "bg-green-600 text-white shadow"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          📊 Upload Excel
        </button>
      </div>

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
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors bg-white ${
                        rowErrors[index]?.period
                          ? "border-red-500 focus:ring-red-200"
                          : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
                      }`}
                    />
                    {rowErrors[index]?.period && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].period}
                      </p>
                    )}
                  </div>
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
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none bg-white ${
                        rowErrors[index]?.salary
                          ? "border-red-500 focus:ring-red-200"
                          : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
                      }`}
                    />
                    {rowErrors[index]?.salary && (
                      <p className="text-red-500 text-xs mt-1">
                        {rowErrors[index].salary}
                      </p>
                    )}
                  </div>
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
                className={`px-6 py-3 rounded-lg shadow text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  submitting || mrListLoading
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"
                }`}
              >
                {submitting ? "Saving…" : "Save Previous Month Payroll"}
              </button>
            </div>
          </div>
        </form>
      )}

      {entryMode === "excel" && (
        <form onSubmit={handleExcelSubmit}>
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
              className={`px-6 py-3 rounded-lg shadow text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                uploading || excelRows.length === 0 || excelErrors.length > 0
                  ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white cursor-pointer focus:ring-green-500"
              }`}
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
      <h2 className="text-2xl font-semibold text-gray-800 mb-8">
        Add New Payroll
      </h2>

      <div className="flex border-b border-gray-200 mb-8">
        {[
          { key: "current", label: "Current Month" },
          { key: "previous", label: "Previous Month" },
          { key: "advance", label: "MR Advance" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`py-3 px-8 font-medium text-sm border-b-2 transition-colors ${
              activeTab === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
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
