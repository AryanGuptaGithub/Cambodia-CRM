import React, { useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const INITIAL_HOLIDAY_STATE = {
  name: "",
  date: "",
  description: "",
};

// Custom hook for form state management
const useHolidayForm = () => {
  const [form, setForm] = useState(INITIAL_HOLIDAY_STATE);
  const [errors, setErrors] = useState({});

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.name.trim()) {
      newErrors.name = "Holiday name is required";
    }

    if (!form.date) {
      newErrors.date = "Date is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const resetForm = useCallback(() => {
    setForm(INITIAL_HOLIDAY_STATE);
    setErrors({});
  }, []);

  return {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    resetForm,
    setErrors,
  };
};

// Reusable Input Component
const InputField = React.memo(
  ({
    label,
    name,
    type = "text",
    value,
    onChange,
    error,
    placeholder = "",
    required = false,
    readOnly = false,
    className = "",
    ...props
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-100" : ""}`}
        autoComplete="off"
        tabIndex={readOnly ? -1 : 0}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

// DatePicker Field Component - FIXED TIMEZONE ISSUE
const DatePickerField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    required = false,
    readOnly = false,
    placeholder = "Select a date",
    className = "",
  }) => {
    const formatDateToLocalYYYYMMDD = (date) => {
      if (!date) return "";
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    const parseDateFromYYYYMMDD = (dateString) => {
      if (!dateString) return null;
      const [year, month, day] = dateString.split("-").map(Number);
      return new Date(year, month - 1, day);
    };

    return (
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <DatePicker
          selected={value ? parseDateFromYYYYMMDD(value) : null}
          onChange={(date) => {
            if (date) {
              // Use local date formatting to avoid timezone issues
              const localDateString = formatDateToLocalYYYYMMDD(date);
              const event = {
                target: {
                  name: name,
                  value: localDateString,
                },
              };
              onChange(event);
            } else {
              const event = {
                target: {
                  name: name,
                  value: "",
                },
              };
              onChange(event);
            }
          }}
          dateFormat="yyyy-MM-dd"
          placeholderText={placeholder}
          readOnly={readOnly}
          className={`w-full border rounded-md px-3 py-2 ${
            error ? "border-red-500" : "border-gray-300"
          } ${readOnly ? "bg-gray-100" : ""} ${className}`}
          autoComplete="off"
        />
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    );
  }
);

// TextArea Field Component
const TextAreaField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    placeholder = "",
    required = false,
    readOnly = false,
    rows = 3,
    className = "",
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={rows}
        className={`border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-100" : ""}`}
        autoComplete="off"
        tabIndex={readOnly ? -1 : 0}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

export default function AddHoliday() {
  const navigate = useNavigate();
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const { form, errors, handleChange, validate, updateFormField, resetForm } =
    useHolidayForm();

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return form.name.trim() && form.date;
  }, [form]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      toast.error("Please fix the errors before submitting");
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/holidays`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to add holiday");
      }

      toast.success("Holiday added successfully!");
      resetForm();
      navigate("/hrmlayout/holidays");
    } catch (error) {
      console.error("Error adding holiday:", error);
      toast.error(error.message || "Error adding holiday");
    }
  };

  const handleCancel = useCallback(() => {
    navigate("/hrmlayout/holidays");
  }, [navigate]);

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Add New Holiday</h2>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Holiday Name */}
          <InputField
            label="Holiday Name"
            name="name"
            value={form.name}
            onChange={handleChange}
            error={errors.name}
            placeholder="Enter holiday name"
            required
          />

          {/* Date */}
          <DatePickerField
            label="Date"
            name="date"
            value={form.date}
            onChange={handleChange}
            error={errors.date}
            required
            placeholder="Select holiday date"
          />
        </div>

        {/* Description */}
        <div className="mb-6">
          <TextAreaField
            label="Description"
            name="description"
            value={form.description}
            onChange={handleChange}
            error={errors.description}
            placeholder="Optional description about the holiday"
            rows={4}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={handleCancel}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isFormValid}
            className={`px-6 py-2 rounded-lg shadow transition-colors ${
              isFormValid
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            Save Holiday
          </button>
        </div>
      </form>
    </div>
  );
}
