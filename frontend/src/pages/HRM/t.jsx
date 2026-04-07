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
// SHARED MULTIPLE SELECT DROPDOWN
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
    o.label.toLowerCase().includes(searchTerm.toLowerCase())
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
          className={`w-full border border-gray-300 rounded-xl px-4 py-3 cursor-pointer min-h-[48px] flex flex-wrap items-center gap-2 bg-white ${
            disabled ? "bg-gray-100 cursor-not-allowed" : ""
          } ${error ? "border-red-500" : ""}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
        >
          {getSelectedLabels().length === 0 ? (
            <span className="text-gray-500">{placeholder}</span>
          ) : (
            getSelectedLabels().map((lbl, i) => (
              <span
                key={i}
                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-lg text-sm font-medium"
              >
                {lbl}
              </span>
            ))
          )}
        </div>

        {isOpen && !disabled && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-xl shadow-xl max-h-60 overflow-auto">
            <div className="p-3 border-b">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {loading ? (
              <div className="px-4 py-3 text-gray-500">Loading...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-4 py-3 text-gray-500">No options found</div>
            ) : (
              filteredOptions.map((o) => (
                <div
                  key={o.value}
                  className={`px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3 border-b last:border-b-0 ${
                    value.includes(o.value) ? "bg-blue-50" : ""
                  }`}
                  onClick={() => toggleOption(o.value)}
                >
                  <input
                    type="checkbox"
                    checked={value.includes(o.value)}
                    onChange={() => {}}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <span className={value.includes(o.value) ? "font-medium" : ""}>
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
// SALARY SOURCES SECTION - SAME LAYOUT AS ALLOWANCE TYPE
// ─────────────────────────────────────────────
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
        opt.label.toLowerCase().includes("cash")
      );
      if (cashAccount) {
        setSources([{ accountId: cashAccount.value, amount: "", type: "cash_balance" }]);
        setSelectedAccountIds([cashAccount.value]);
      }
    }
  }, [sourceOptions]);

  const toggleAccount = (account) => {
    const isSelected = selectedAccountIds.includes(account.value);

    if (isSelected) {
      setSelectedAccountIds((prev) => prev.filter((id) => id !== account.value));
      setSources((prev) => prev.filter((s) => s.accountId !== account.value));
    } else {
      setSelectedAccountIds((prev) => [...prev, account.value]);
      setSources((prev) => [
        ...prev,
        { accountId: account.value, amount: "", type: account.type || "personal" },
      ]);
    }
    setErrors((prev) => ({ ...prev, sources: "" }));
  };

  const updateAmount = (accountId, amount) => {
    setSources((prev) =>
      prev.map((src) =>
        src.accountId === accountId ? { ...src, amount } : src
      )
    );

    const total = sources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    if (Math.abs(total - parseFloat(netSalary)) > 0.01) {
      setErrors((prev) => ({
        ...prev,
        sources: `Total sources ($${total.toFixed(2)}) must equal net salary ($${parseFloat(netSalary).toFixed(2)})`,
      }));
    } else {
      setErrors((prev) => ({ ...prev, sources: "" }));
    }
  };

  const totalFromSources = sources.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

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
            const account = sourceOptions.find((a) => a.value === src.accountId);
            return (
              <div key={idx} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="font-medium text-gray-800 mb-3">{account?.label}</div>
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
            <span className="text-sm font-medium text-gray-700">Total from Sources</span>
            <span className={`text-2xl font-bold ${Math.abs(totalFromSources - parseFloat(netSalary)) < 0.01 ? "text-green-600" : "text-red-600"}`}>
              ${totalFromSources.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {errors.sources && <p className="text-red-500 text-sm mt-3">{errors.sources}</p>}
    </div>
  );
};

// ─────────────────────────────────────────────
// CURRENT MONTH TAB
// ─────────────────────────────────────────────
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
    [form.allowances]
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
            placeholder={mrListLoading ? "Loading..." : isMrListEmpty ? "No MRs Available" : "Select MR"}
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
          <h3 className="text-lg font-semibold mb-4 text-center">Salary Summary</h3>
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
                <td className="p-4 font-semibold">{form.basicSalary || "0.00"}</td>
                <td className="p-4 font-semibold">{totalAllowance.toFixed(2)}</td>
                <td className="p-4 font-semibold text-red-600">-{form.deductions || "0.00"}</td>
                <td className="p-4 font-semibold text-green-600">{form.netSalary}</td>
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








export default AddPayroll;