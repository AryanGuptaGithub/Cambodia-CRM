import React, { useCallback, useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../../utils/toast.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

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
}) => {
  const getOptionKey = (option, index) => {
    return option.value || option._id || option.label || `option-${index}`;
  };

  return (
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
        {options.map((option, index) => (
          <option key={getOptionKey(option, index)} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className="text-red-500 text-xs mt-1">{error}</span>}
    </div>
  );
};

const AddExpense = ({
  onCancel,
  initialData = null,
  isEditing = false,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: "",
    amount: "",
    remarks: "",
    expenseCategory: "",
    sourceAccount: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [categoryOptions, setCategoryOptions] = useState([]);
  const [sourceAccountOptions, setSourceAccountOptions] = useState([]);

  const getSelectedAccountBalance = useCallback(() => {
    if (!formData.sourceAccount) return 0;
    const acc = sourceAccountOptions.find(
      (a) => a.value === formData.sourceAccount
    );
    return acc ? acc.totalAmount : 0;
  }, [formData.sourceAccount, sourceAccountOptions]);

  const validateAmountAgainstBalance = useCallback(
    (amount) => {
      if (!formData.sourceAccount) return true;
      const balance = getSelectedAccountBalance();
      const amt = parseFloat(amount) || 0;
      return amt <= balance;
    },
    [formData.sourceAccount, getSelectedAccountBalance]
  );

  const handleAmountChange = (value) => {
    const sanitized = value.replace(/[^0-9.]/g, "");
    const decimalCount = (sanitized.match(/\./g) || []).length;
    let final = sanitized;
    if (decimalCount > 1) {
      const parts = sanitized.split(".");
      final = parts[0] + "." + parts.slice(1).join("");
    }
    setFormData((prev) => ({ ...prev, amount: final }));
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

  useEffect(() => {
    if (initialData) {
      setFormData({
        date: initialData.date || "",
        amount: initialData.amount?.toString() || "",
        remarks: initialData.remarks || "",
        expenseCategory: initialData.expenseCategory || "",
        sourceAccount: initialData.sourceAccount || "",
      });
    } else {
      const today = new Date().toISOString().split("T")[0];
      setFormData((prev) => ({ ...prev, date: today }));
    }
  }, [initialData]);

  const handleInputChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: "" }));
      }
    },
    [errors]
  );

  const handleSelectChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
      if (name === "sourceAccount") {
        setErrors((prev) => ({ ...prev, amount: "" }));
      }
    },
    [errors]
  );

  const fetchDropdownOptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const catResp = await axios.get(`${backendUrl}/api/expense-categary`);

      let categories = [];

      if (catResp.data && catResp.data.success) {
        const responseData = catResp.data.data;

        if (Array.isArray(responseData)) {
          categories = responseData
            .filter((c) => c && (c.Category || c.category))
            .map((c, index) => ({
              value: c.Sr || c._id || c.id || `cat-${index}`,
              label: c.Category || c.category,
            }));
        } else if (responseData && typeof responseData === "object") {
          if (responseData.Category || responseData.category) {
            categories = [
              {
                value:
                  responseData.Sr ||
                  responseData._id ||
                  responseData.id ||
                  "cat-1",
                label: responseData.Category || responseData.category,
              },
            ];
          } else {
            const arrayKeys = Object.keys(responseData).filter((key) =>
              Array.isArray(responseData[key])
            );

            if (arrayKeys.length > 0) {
              const firstArray = responseData[arrayKeys[0]];
              categories = firstArray
                .filter((c) => c && (c.Category || c.category))
                .map((c, index) => ({
                  value: c._id || c.id || `cat-${index}`,
                  label: c.Category || c.category,
                }));
            }
          }
        }
        setCategoryOptions(categories);
      } else {
        setCategoryOptions([]);
      }

      const destResp = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );
      if (destResp.status === 200 && Array.isArray(destResp.data)) {
        const destinations = destResp.data
          .filter((d) => d && d._id && d.name)
          .map((d) => ({
            value: d._id,
            label: d.name,
            totalAmount: d.totalAmount || 0,
          }));
        setSourceAccountOptions(destinations);
      } else {
        setSourceAccountOptions([]);
      }
    } catch (err) {
      console.error("Error loading dropdowns:", err);
      setError(err.message);
      showToast("error", `Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  useEffect(() => {
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: "" }));
    }
  }, [formData.sourceAccount]);

  const validate = useCallback(() => {
    const newErrors = {};

    if (!formData.date) {
      newErrors.date = "Date is required";
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = "Valid amount is required";
    } else if (isNaN(parseFloat(formData.amount))) {
      newErrors.amount = "Amount must be a valid number";
    } else if (!validateAmountAgainstBalance(formData.amount)) {
      const bal = getSelectedAccountBalance();
      newErrors.amount = `Amount exceeds available balance ($${bal})`;
    }

    if (!formData.remarks?.trim()) {
      newErrors.remarks = "Remarks are required";
    } else if (formData.remarks.trim().length < 3) {
      newErrors.remarks = "Remarks must be at least 3 characters long";
    }

    if (!formData.expenseCategory) {
      newErrors.expenseCategory = "Expense Category is required";
    }
    if (!formData.sourceAccount) {
      newErrors.sourceAccount = "Source Account is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData, validateAmountAgainstBalance, getSelectedAccountBalance]);

  // REMOVED: updateDestinationAccount function (not needed anymore)

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const amt = parseFloat(formData.amount);
      const submitData = {
        date: formData.date,
        amount: amt,
        remarks: formData.remarks.trim(),
        category: formData.expenseCategory, // Backend expects "category" not "expenseCategory"
        sourceAccount: formData.sourceAccount,
      };

      setIsSubmitting(true);

      let resp;

      if (isEditing && initialData?._id) {
        // For editing, just send the update request
        resp = await axios.put(
          `${backendUrl}/api/expenses/${initialData._id}`,
          submitData
        );
        // The backend handles the balance update automatically
      } else {
        // For creating, just send the create request
        resp = await axios.post(`${backendUrl}/api/expenses`, submitData);
        // The backend handles the balance update automatically
      }

      if (resp.data.success) {
        showToast("success", resp.data.message);
        if (typeof onSuccess === "function") {
          onSuccess(resp.data.data);
        }
        navigate("/expenselayout/expenses");
      } else {
        throw new Error(resp.data.message || "Operation failed");
      }
    } catch (err) {
      console.error("Error submitting:", err);
      const msg =
        err.response?.data?.message || err.message || "Failed to save expense";
      setErrors({ submit: msg });
      showToast("error", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedBal = getSelectedAccountBalance();
  const remaining = formData.amount
    ? selectedBal - parseFloat(formData.amount)
    : selectedBal;

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            {isEditing ? "Edit Expense" : "Add New Expense"}
          </h3>
          <button
            onClick={onCancel ?? (() => navigate("/expenselayout/expenses"))}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            disabled={isSubmitting}
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
          {loading && (
            <div className="mb-4 p-3 bg-blue-100 border border-blue-400 text-blue-700 rounded">
              Loading options...
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputField
                  label="Date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  error={errors.date}
                  required
                />
                <InputField
                  label="Amount ($)"
                  name="amount"
                  type="text"
                  value={formData.amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  onKeyPress={handleKeyPress}
                  error={errors.amount}
                  placeholder="0.00"
                  required
                />
                <SelectField
                  label="Expense Category"
                  name="expenseCategory"
                  value={formData.expenseCategory}
                  onChange={handleSelectChange}
                  error={errors.expenseCategory}
                  options={categoryOptions}
                  required
                  disabled={loading}
                />
                <div className="flex flex-col">
                  <SelectField
                    label="Source Account"
                    name="sourceAccount"
                    value={formData.sourceAccount}
                    onChange={handleSelectChange}
                    error={errors.sourceAccount}
                    options={sourceAccountOptions}
                    required
                    disabled={loading}
                  />
                  {formData.sourceAccount && (
                    <div className="mt-2 space-y-1 text-xs">
                      <div className="text-gray-500">
                        Current balance:{" "}
                        <span className="font-semibold">${selectedBal}</span>
                      </div>
                      {formData.amount && (
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

                <div className="md:col-span-2">
                  <TextAreaField
                    label="Remarks"
                    name="remarks"
                    value={formData.remarks}
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
                disabled={isSubmitting || loading}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  isSubmitting || loading
                    ? "bg-green-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <Save size={18} />
                {isSubmitting
                  ? "Saving..."
                  : isEditing
                  ? "Update Expense"
                  : "Add Expense"}
              </button>
              <button
                type="button"
                onClick={
                  onCancel ?? (() => navigate("/expenselayout/expenses"))
                }
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-500 text-white rounded-lg hover:bg-gray-600
                 transition-colors cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
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