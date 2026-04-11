// pages/Expenses/AddExpense.jsx
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { fetchMRList } from "../../pages/ProductManager/common/fetchDropdown.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Categories that require an MR selection ────────────────────────────────
const TOUR_MR_CATEGORY_NAMES = [
  "tour allowance",
  "tour petrol expense",
  "province marketing expense",
  "rent expense - vans",
];

const categoryRequiresMR = (categoryName = "") =>
  TOUR_MR_CATEGORY_NAMES.includes(categoryName.toLowerCase().trim());

// ─── Date helpers ─────────────────────────────────────────────────────────────
const formatDateToYYYYMMDD = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateFromYYYYMMDD = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = dateString.split("-");
  return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
};

// ─── Reusable Components ────────────────────────────────────────────────────
const InputField = ({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  required = false,
  type = "text",
  readOnly = false,
  autoComplete = "off",
  onKeyPress,
}) => (
  <div className="flex flex-col">
    <label htmlFor={name} className="text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      id={name}
      name={name}
      value={value || ""}
      onChange={onChange}
      onKeyPress={onKeyPress}
      placeholder={placeholder}
      readOnly={readOnly}
      autoComplete={autoComplete}
      className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        error ? "border-red-500" : "border-gray-300"
      } ${readOnly ? "bg-gray-100 cursor-not-allowed" : ""}`}
    />
    {error && <span className="text-red-500 text-xs mt-1">{error}</span>}
  </div>
);

const TextAreaField = ({
  label,
  name,
  value,
  onChange,
  error,
  placeholder,
  required = false,
  readOnly = false,
  rows = 4,
}) => (
  <div className="flex flex-col">
    <label htmlFor={name} className="text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <textarea
      id={name}
      name={name}
      value={value || ""}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      rows={rows}
      className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical ${
        error ? "border-red-500" : "border-gray-300"
      } ${readOnly ? "bg-gray-100 cursor-not-allowed" : ""}`}
    />
    {error && <span className="text-red-500 text-xs mt-1">{error}</span>}
  </div>
);

const SelectField = ({
  label,
  name,
  value,
  onChange,
  error,
  options = [],
  required = false,
  placeholder = "Select an option",
  disabled = false,
}) => (
  <div className="flex flex-col">
    <label htmlFor={name} className="text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <select
      id={name}
      name={name}
      value={value || ""}
      onChange={onChange}
      disabled={disabled}
      className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        error ? "border-red-500" : "border-gray-300"
      } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
    {error && <span className="text-red-500 text-xs mt-1">{error}</span>}
  </div>
);

// ─── ADD EXPENSE COMPONENT ────────────────────────────────────────────────────
const AddExpense = ({
  onSuccess,
  onCancel,
  initialData = null,
  isEditing = false,
}) => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    date: formatDateToYYYYMMDD(new Date()),
    category: "", // ObjectId string
    categoryName: "", // human-readable name (for requiresMR check)
    remarks: "",
    amount: "",
    sourceAccount: "", // ObjectId string
    paymentMethod: "cash",
    notes: "",
    mrId: "",
    mrName: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Drop-down data ──
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(false);

  // ── Fetch categories ──
  useEffect(() => {
    const load = async () => {
      setCategoriesLoading(true);
      try {
        const res = await axios.get(`${backendUrl}/api/expenses/categories`);
        if (res.data.success) setCategories(res.data.data || []);
      } catch (err) {
        showToast("error", "Failed to load expense categories");
      } finally {
        setCategoriesLoading(false);
      }
    };
    load();
  }, []);

  // ── Fetch source accounts (Destinations) ──
  useEffect(() => {
    const load = async () => {
      setAccountsLoading(true);
      try {
        const res = await axios.get(`${backendUrl}/api/accounts/destinations`);
        if (res.data.success) setAccounts(res.data.data || []);
      } catch (err) {
        showToast("error", "Failed to load accounts");
      } finally {
        setAccountsLoading(false);
      }
    };
    load();
  }, []);

  // ── Fetch MR list whenever a tour-related category is selected ──
  const needsMR = useMemo(
    () => categoryRequiresMR(form.categoryName),
    [form.categoryName],
  );

  useEffect(() => {
    if (!needsMR) return;
    const load = async () => {
      setMrListLoading(true);
      try {
        const result = await fetchMRList();
        if (result.success) setMrList(result.data || []);
        else showToast("error", result.error || "Failed to load MR list");
      } catch (err) {
        showToast("error", "Failed to load Medical Representatives");
      } finally {
        setMrListLoading(false);
      }
    };
    load();
  }, [needsMR]);

  // Load initial data for editing
  useEffect(() => {
    if (initialData && isEditing) {
      setForm({
        date: initialData.date || formatDateToYYYYMMDD(new Date()),
        category: initialData.category?._id || initialData.category || "",
        categoryName: initialData.categoryName || "",
        remarks: initialData.remarks || "",
        amount: initialData.amount?.toString() || "",
        sourceAccount:
          initialData.sourceAccount?._id || initialData.sourceAccount || "",
        paymentMethod: initialData.paymentMethod || "cash",
        notes: initialData.notes || "",
        mrId: initialData.mrId || "",
        mrName: initialData.mrName || "",
      });
    }
  }, [initialData, isEditing]);

  // ── Dropdown options ──
  const categoryOptions = useMemo(() => {
    if (categoriesLoading) return [];
    return categories.map((cat) => ({
      value: cat._id,
      label: cat.Category,
      categoryName: cat.Category,
    }));
  }, [categories, categoriesLoading]);

  const accountOptions = useMemo(() => {
    if (accountsLoading) return [];
    return accounts.map((acc) => ({
      value: acc._id,
      label: `${acc.name} ($${acc.totalAmount?.toFixed(2) ?? "0.00"})`,
      totalAmount: acc.totalAmount || 0,
    }));
  }, [accounts, accountsLoading]);

  const mrOptions = useMemo(() => {
    if (mrListLoading) return [];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName,
    }));
  }, [mrList, mrListLoading]);

  // Get selected account balance
  const getSelectedAccountBalance = useCallback(() => {
    if (!form.sourceAccount) return 0;
    const acc = accountOptions.find((a) => a.value === form.sourceAccount);
    return acc ? acc.totalAmount : 0;
  }, [form.sourceAccount, accountOptions]);

  // Validate amount against balance
  const validateAmountAgainstBalance = useCallback(
    (amount) => {
      if (!form.sourceAccount) return true;
      const balance = getSelectedAccountBalance();
      const amt = parseFloat(amount) || 0;
      return amt <= balance;
    },
    [form.sourceAccount, getSelectedAccountBalance],
  );

  // ── Handlers ──
  const handleCategoryChange = useCallback(
    (e) => {
      const categoryId = e.target.value;
      const found = categories.find((c) => c._id === categoryId);
      const catName = found ? found.Category : "";
      setForm((prev) => ({
        ...prev,
        category: categoryId,
        categoryName: catName,
        mrId: "",
        mrName: "",
      }));
      setErrors((prev) => ({ ...prev, category: "", mrId: "" }));
    },
    [categories],
  );

  const handleAccountChange = useCallback((e) => {
    const accountId = e.target.value;
    setForm((prev) => ({ ...prev, sourceAccount: accountId }));
    setErrors((prev) => ({ ...prev, sourceAccount: "", amount: "" }));
  }, []);

  const handleMRChange = useCallback(
    (e) => {
      const mrId = e.target.value;
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      setForm((prev) => ({
        ...prev,
        mrId,
        mrName: selectedMR ? selectedMR.medicalRepName : "",
      }));
      setErrors((prev) => ({ ...prev, mrId: "" }));
    },
    [mrList],
  );

  const handleInputChange = useCallback((field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }, []);

  const handleAmountChange = (value) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    const decimalCount = (sanitized.match(/\./g) || []).length;
    let final = sanitized;
    if (decimalCount > 1) {
      const parts = sanitized.split(".");
      final = parts[0] + "." + parts.slice(1).join("");
    }
    setForm((prev) => ({ ...prev, amount: final }));
    setErrors((prev) => ({ ...prev, amount: "" }));
  };

  const handleKeyPress = (e) => {
    const charCode = e.which ? e.which : e.keyCode;
    const char = String.fromCharCode(charCode);
    if (
      !/[\d.]/.test(char) &&
      charCode > 31 &&
      (charCode < 48 || charCode > 57)
    ) {
      e.preventDefault();
      return false;
    }
    if (char === "." && e.target.value.includes(".")) {
      e.preventDefault();
      return false;
    }
    return true;
  };

  const handleDateChange = useCallback((date) => {
    if (date && !isNaN(date.getTime())) {
      setForm((prev) => ({ ...prev, date: formatDateToYYYYMMDD(date) }));
      setErrors((prev) => ({ ...prev, date: "" }));
    }
  }, []);

  // ── Validation ──
  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    if (!form.category) newErrors.category = "Category is required";
    if (!form.remarks?.trim()) newErrors.remarks = "Remarks are required";
    if (form.remarks?.trim() && form.remarks.trim().length < 3) {
      newErrors.remarks = "Remarks must be at least 3 characters long";
    }

    if (
      !form.amount ||
      isNaN(Number(form.amount)) ||
      Number(form.amount) <= 0
    ) {
      newErrors.amount = "A valid positive amount is required";
    } else if (!validateAmountAgainstBalance(form.amount)) {
      const bal = getSelectedAccountBalance();
      newErrors.amount = `Amount exceeds available balance ($${bal.toFixed(2)})`;
    }

    if (!form.sourceAccount)
      newErrors.sourceAccount = "Source account is required";
    if (needsMR && !form.mrId) {
      newErrors.mrId = `Medical Representative is required for "${form.categoryName}"`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, needsMR, validateAmountAgainstBalance, getSelectedAccountBalance]);

  // Clear amount error when source account changes
  useEffect(() => {
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: "" }));
    }
  }, [form.sourceAccount]);

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix the errors before submitting");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        date: form.date,
        category: form.category,
        remarks: form.remarks.trim(),
        amount: Number(form.amount),
        sourceAccount: form.sourceAccount,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        ...(needsMR && { mrId: form.mrId, mrName: form.mrName }),
      };

      let res;
      if (isEditing && initialData?._id) {
        res = await axios.put(
          `${backendUrl}/api/expenses/${initialData._id}`,
          payload,
        );
      } else {
        res = await axios.post(`${backendUrl}/api/expenses`, payload);
      }

      if (res.data.success) {
        showToast(
          "success",
          res.data.message || `${isEditing ? "Updated" : "Added"} successfully`,
        );
        if (typeof onSuccess === "function") {
          onSuccess(res.data.data);
        }
        if (!isEditing) {
          setForm({
            date: formatDateToYYYYMMDD(new Date()),
            category: "",
            categoryName: "",
            remarks: "",
            amount: "",
            sourceAccount: "",
            paymentMethod: "cash",
            notes: "",
            mrId: "",
            mrName: "",
          });
        }
        navigate("/expenselayout/expenses");
      } else {
        showToast("error", res.data.message || "Failed to save expense");
      }
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save expense";
      showToast("error", msg);
      setErrors((prev) => ({ ...prev, submit: msg }));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBal = getSelectedAccountBalance();
  const remaining = form.amount
    ? selectedBal - parseFloat(form.amount)
    : selectedBal;

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate("/expenselayout/expenses");
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex justify-center items-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            {isEditing ? "Edit Expense" : "Add New Expense"}
          </h3>
          <button
            onClick={handleCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            disabled={submitting}
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {errors.submit && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {errors.submit}
            </div>
          )}

          {(categoriesLoading || accountsLoading) && (
            <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded">
              Loading options...
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Date */}
                <div className="flex flex-col">
                  <label className="text-sm font-medium text-gray-700 mb-1">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <DatePicker
                    selected={parseDateFromYYYYMMDD(form.date)}
                    onChange={handleDateChange}
                    dateFormat="yyyy-MM-dd"
                    maxDate={new Date()}
                    className={`px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full ${
                      errors.date ? "border-red-500" : "border-gray-300"
                    }`}
                    autoComplete="off"
                  />
                  {errors.date && (
                    <span className="text-red-500 text-xs mt-1">
                      {errors.date}
                    </span>
                  )}
                </div>

                {/* Category */}
                <SelectField
                  label="Expense Category"
                  name="category"
                  value={form.category}
                  onChange={handleCategoryChange}
                  error={errors.category}
                  options={categoryOptions}
                  required
                  disabled={categoriesLoading}
                  placeholder="Select Category"
                />

                {/* Medical Representative - shown only for tour-related categories */}
                {needsMR && (
                  <div className="md:col-span-2">
                    <SelectField
                      label="Medical Representative"
                      name="mrId"
                      value={form.mrId}
                      onChange={handleMRChange}
                      error={errors.mrId}
                      options={mrOptions}
                      required
                      disabled={mrListLoading}
                      placeholder="Select Medical Representative"
                    />
                    {form.categoryName && (
                      <p className="text-xs text-blue-600 mt-1">
                        MR is required for <strong>{form.categoryName}</strong>{" "}
                        expenses
                      </p>
                    )}
                  </div>
                )}

                {/* Amount */}
                <InputField
                  label="Amount ($)"
                  name="amount"
                  type="text"
                  value={form.amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  error={errors.amount}
                  required
                  placeholder="Enter amount"
                />

                {/* Source Account */}
                <div className="flex flex-col">
                  <SelectField
                    label="Source Account"
                    name="sourceAccount"
                    value={form.sourceAccount}
                    onChange={handleAccountChange}
                    error={errors.sourceAccount}
                    options={accountOptions}
                    required
                    disabled={accountsLoading}
                    placeholder="Select Account"
                  />
                  {form.sourceAccount && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="text-gray-500">
                        Current balance:{" "}
                        <span className="font-semibold">
                          ${selectedBal.toFixed(2)}
                        </span>
                      </div>
                      {form.amount && (
                        <div
                          className={`font-semibold ${
                            remaining >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          Remaining after expense: ${remaining.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Remarks */}
                <div className="md:col-span-2">
                  <TextAreaField
                    label="Remarks"
                    name="remarks"
                    value={form.remarks}
                    onChange={(e) =>
                      handleInputChange("remarks", e.target.value)
                    }
                    error={errors.remarks}
                    placeholder="Enter expense remarks"
                    required
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={submitting || categoriesLoading || accountsLoading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  submitting || categoriesLoading || accountsLoading
                    ? "bg-green-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <Save size={18} />
                {submitting
                  ? "Saving..."
                  : isEditing
                    ? "Update Expense"
                    : "Add Expense"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddExpense;
