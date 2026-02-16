// components/AddExpenseCategory.jsx
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

const AddExpenseCategory = ({
  onCancel,
  initialData = null,
  isEditing = false,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    category: "",
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form data if editing
  useEffect(() => {
    if (initialData) {
      setFormData({
        category: initialData.category || "",
        description: initialData.description || "",
      });
    } else {
      setFormData({
        category: "",
        description: "",
      });
    }
  }, [initialData]);

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

  const validate = useCallback(() => {
    const newErrors = {};

    if (!formData.category?.trim()) {
      newErrors.category = "Category name is required";
    } else if (formData.category.trim().length < 2) {
      newErrors.category = "Category name must be at least 2 characters long";
    }

    if (!formData.description?.trim()) {
      newErrors.description = "Description is required";
    } else if (formData.description.trim().length < 5) {
      newErrors.description = "Description must be at least 5 characters long";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const submitData = {
        category: formData.category.trim(),
        description: formData.description.trim(),
      };

      setIsSubmitting(true);

      let response;

      if (isEditing && initialData?._id) {
        // Use backendUrl for consistency
        response = await axios.put(
          `${backendUrl}/api/expense-categories/${initialData._id}`,
          submitData
        );
      } else {
        response = await axios.post(
          `${backendUrl}/api/expense-categories`,
          submitData
        );
      }

      if (response.data.success) {
        showToast("success", response.data.message);
        navigate("/expenselayout/expensecategories");
      } else {
        throw new Error(response.data.message || "Operation failed");
      }
    } catch (error) {
      console.error("Error submitting category:", error);

      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to save category. Please try again.";

      setErrors({ submit: errorMessage });

      if (error.response?.status === 409) {
        setErrors({
          category:
            "Category name already exists. Please choose a different name.",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelClick = useCallback(() => {
    if (typeof onCancel === "function") {
      onCancel();
    } else {
      navigate("/expenselayout/expensecategories");
    }
  }, [onCancel, navigate]);

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-30 flex justify-center items-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800">
            {isEditing ? "Edit Expense Category" : "Add New Expense Category"}
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

          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <InputField
                  label="Category Name"
                  name="category"
                  value={formData.category}
                  onChange={(e) =>
                    handleInputChange("category", e.target.value)
                  }
                  error={errors.category}
                  placeholder="Enter category name (e.g., Office Supplies)"
                  autoComplete="off"
                  required
                />
                <TextAreaField
                  label="Description"
                  name="description"
                  value={formData.description}
                  onChange={(e) =>
                    handleInputChange("description", e.target.value)
                  }
                  error={errors.description}
                  placeholder="Enter description (e.g., Stationery and office utilities including pens, papers, printers, etc.)"
                  required
                  rows={4}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-gray-200">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors cursor-pointer ${
                  isSubmitting
                    ? "bg-green-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <Save size={18} />
                {isSubmitting
                  ? "Saving..."
                  : isEditing
                  ? "Save Changes"
                  : "Add Category"}
              </button>
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={isSubmitting}
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

export default AddExpenseCategory;