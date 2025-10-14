// components/AddExpense.jsx
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
  onKeyPress, // Add onKeyPress prop
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
      onKeyPress={onKeyPress} // Add onKeyPress handler
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

// New TextAreaField component
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

// New SelectField component for dropdowns
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

const AddExpense = ({
  onCancel,
  initialData = null,
  isEditing = false,
  onSuccess, // Callback for successful submission
}) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    date: "",
    amount: "",
    description: "",
    expenseCategory: "", // Dropdown field
    sourceAccount: "", // Dropdown field
    paymentMethod: "cash",
    notes: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for dropdown options
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [sourceAccountOptions, setSourceAccountOptions] = useState([]);

  // Function to allow only numbers and decimal point
  const handleAmountChange = (value) => {
    // Allow only numbers and one decimal point
    const sanitizedValue = value.replace(/[^0-9.]/g, "");

    // Ensure only one decimal point
    const decimalCount = (sanitizedValue.match(/\./g) || []).length;
    if (decimalCount > 1) {
      // If more than one decimal point, remove the extra ones
      const parts = sanitizedValue.split(".");
      const finalValue = parts[0] + "." + parts.slice(1).join("");
      setFormData((prev) => ({ ...prev, amount: finalValue }));
    } else {
      setFormData((prev) => ({ ...prev, amount: sanitizedValue }));
    }

    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: "" }));
    }
  };

  // Function to prevent non-numeric input on key press
  const handleKeyPress = (e) => {
    const charCode = e.which ? e.which : e.keyCode;
    const char = String.fromCharCode(charCode);

    // Allow numbers (0-9), decimal point (.), and control keys (backspace, tab, etc.)
    if (
      !/[\d.]/.test(char) &&
      charCode > 31 &&
      (charCode < 48 || charCode > 57)
    ) {
      e.preventDefault();
      return false;
    }

    // Prevent multiple decimal points
    if (char === "." && e.target.value.includes(".")) {
      e.preventDefault();
      return false;
    }

    return true;
  };

  // Populate form data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        date: initialData.date || "",
        amount: initialData.amount || "",
        description: initialData.description || "",
        expenseCategory: initialData.expenseCategory || "",
        sourceAccount: initialData.sourceAccount || "",
        paymentMethod: initialData.paymentMethod || "cash",
        notes: initialData.notes || "",
      });
    } else {
      // Set default date to today
      const today = new Date().toISOString().split("T")[0];
      setFormData({
        date: today,
        amount: "",
        description: "",
        expenseCategory: "",
        sourceAccount: "",
        paymentMethod: "cash",
        notes: "",
      });
    }
  }, [initialData]);

  // Handle form field changes
  const handleInputChange = useCallback(
    (field, value) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));

      if (errors[field]) {
        setErrors((prev) => ({ ...prev, [field]: "" }));
      }
    },
    [errors]
  );

  // Handle dropdown changes
  const handleSelectChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));

      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [errors]
  );

  const fetchDropdownOptions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch expense category options
      const categoryResponse = await axios.get(
        `${backendUrl}/api/expense-categary`
      );

      if (categoryResponse.data.success) {
        const categories = categoryResponse.data.data.map((cat) => ({
          value: cat._id,
          label: cat.category, // Using category field for display
        }));
        setCategoryOptions(categories);
      } else {
        throw new Error(
          categoryResponse.data.message || "Failed to fetch categories"
        );
      }

      // Fetch source account options from destinations
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );

      if (destinationResponse.status == "200") {
        console.log("inside if ", destinationResponse);
        const destinations = destinationResponse.data.map((dest) => ({
          value: dest._id,
          label: dest.name,
          totalAmount: dest.totalAmount || 0,
        }));
        setSourceAccountOptions(destinations);
      }
    } catch (err) {
      console.log("values of err", err);
      setError(err.message);
      setCategoryOptions([]);
      setSourceAccountOptions([]);
      showToast("error", `Failed to load options: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  // Validate form before submission
  const validate = useCallback(() => {
    const newErrors = {};

    if (!formData.date) {
      newErrors.date = "Date is required";
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = "Valid amount is required";
    } else if (isNaN(parseFloat(formData.amount))) {
      newErrors.amount = "Amount must be a valid number";
    }

    if (!formData.description?.trim()) {
      newErrors.description = "Description is required";
    } else if (formData.description.trim().length < 3) {
      newErrors.description = "Description must be at least 3 characters long";
    }

    // Validate dropdown fields
    if (!formData.expenseCategory) {
      newErrors.expenseCategory = "Expense Category is required";
    }

    if (!formData.sourceAccount) {
      newErrors.sourceAccount = "Source Account is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Handle form submit - Direct API call for expenses
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const submitData = {
        date: formData.date,
        amount: parseFloat(formData.amount),
        description: formData.description.trim(),
        category: formData.expenseCategory, // Using the selected category ID
        sourceAccount: formData.sourceAccount,
        paymentMethod: formData.paymentMethod,
        notes: formData.notes?.trim() || "",
      };
      console.log('valueso f submitData', submitData);
      setIsSubmitting(true);

      let response;

      if (isEditing && initialData?._id) {
        response = await axios.put(
          `${backendUrl}/api/expenses/${initialData._id}`,
          submitData
        );
      } else {
        response = await axios.post(`${backendUrl}/api/expenses`, submitData);
      }

      if (response.data.success) {
        showToast("success", `${response.data.message}`);

        // Call onSuccess callback if provided
        if (typeof onSuccess === "function") {
          onSuccess(response.data.data);
        }

        navigate("/expenselayout/expenses"); // Redirect to expenses list
      } else {
        throw new Error(response.data.message || "Operation failed");
      }
    } catch (error) {
      console.error("Error submitting expense:", error);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to save expense. Please try again.";

      setErrors({ submit: errorMessage });

      // Handle specific error cases
      if (error.response?.status === 400) {
        setErrors({
          ...errors,
          ...error.response.data.errors,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle cancel with fallback
  const handleCancelClick = useCallback(() => {
    if (typeof onCancel === "function") {
      onCancel();
    } else {
      navigate("/expenselayout/expenses");
    }
  }, [onCancel, navigate]);

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            {isEditing ? "Edit Expense" : "Add New Expense"}
          </h3>
          <button
            onClick={handleCancelClick}
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
                  required={true}
                  placeholder="Select an option"
                  disabled={loading}
                />

                {/* Source Account Dropdown */}
                <SelectField
                  label="Source Account"
                  name="sourceAccount"
                  value={formData.sourceAccount}
                  onChange={handleSelectChange}
                  error={errors.sourceAccount}
                  options={sourceAccountOptions}
                  required={true}
                  placeholder="Select an option"
                  disabled={loading}
                />

                {/* Description - Full width */}
                <div className="md:col-span-2">
                  <InputField
                    label="Description"
                    name="description"
                    value={formData.description}
                    onChange={(e) =>
                      handleInputChange("description", e.target.value)
                    }
                    error={errors.description}
                    placeholder="Enter expense description"
                    required
                  />
                </div>

                {/* Notes - Full width */}
                <div className="md:col-span-2">
                  <TextAreaField
                    label="Notes (Optional)"
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    error={errors.notes}
                    placeholder="Additional notes about this expense"
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
                onClick={handleCancelClick}
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
