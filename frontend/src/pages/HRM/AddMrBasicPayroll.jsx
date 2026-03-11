import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";

import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom hook for MR Basic Payroll form
const useMrBasicPayrollForm = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    employeeId: "",
    employeeName: "",
    basicSalary: "",
    effectiveFrom: "",
    remarks: "",
  });

  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);

  /* -------------------------- Fetch MR List -------------------------- */
  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);

      // Use the correct endpoint
      const endpoint = `${backendUrl}/api/stock-transfer-to-mr/mrs-list`;
      const response = await axios.get(endpoint, {
        timeout: 8000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Handle response structure
      let mrData = [];

      if (response.data.success && Array.isArray(response.data.data)) {
        mrData = response.data.data;
      } else if (Array.isArray(response.data)) {
        mrData = response.data;
      }

      const filteredMRs = mrData.filter(
        (staff) =>
          staff &&
          staff._id &&
          (staff.medicalRepName ||
            staff.name ||
            staff.staffName ||
            staff.fullName),
      );

      setMrList(filteredMRs);
      setIsMrListEmpty(filteredMRs.length === 0);

      if (filteredMRs.length === 0) {
        toast.error("No MRs found. Please add MRs first.", {
          duration: 4000,
        });
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);

      // Show user-friendly error message
      if (error.response?.status === 404) {
        toast.error("Endpoint not found. Please check backend routes.", {
          duration: 4000,
        });
      } else if (error.code === "ECONNABORTED") {
        toast.error("Request timeout. Server might be down.", {
          duration: 4000,
        });
      } else if (error.code === "ERR_NETWORK") {
        toast.error("Network error. Please check connection.", {
          duration: 4000,
        });
      } else {
        toast.error("Failed to load MR list. Please try again.", {
          duration: 4000,
        });
      }

      // Set empty list as fallback
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  /* -------------------------- Validation -------------------------- */
  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.employeeId.trim()) newErrors.employeeId = "MR is required";
    if (!form.basicSalary || form.basicSalary.trim() === "")
      newErrors.basicSalary = "Basic Salary is required";
    if (!form.effectiveFrom || form.effectiveFrom.trim() === "")
      newErrors.effectiveFrom = "Effective From date is required";

    // Validate basic salary is positive
    if (form.basicSalary) {
      const salary = parseFloat(form.basicSalary);
      if (isNaN(salary) || salary <= 0) {
        newErrors.basicSalary = "Basic Salary must be greater than 0";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  /* -------------------------- Event Handlers -------------------------- */
  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    // Allow only numbers and one decimal point
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  const handleEmployeeChange = useCallback(
    (employeeId) => {
      // Find the selected MR to get their name
      const selectedMR = mrList.find((mr) => mr._id === employeeId);
      setForm((prev) => ({
        ...prev,
        employeeId,
        employeeName: selectedMR
          ? selectedMR.medicalRepName ||
            selectedMR.name ||
            selectedMR.fullName ||
            `${selectedMR.firstName || ""} ${selectedMR.lastName || ""}`.trim() ||
            ""
          : "",
      }));
      setErrors((prev) => ({ ...prev, employeeId: "" }));
    },
    [mrList],
  );

  const handleDateChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  const handleRemarksChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  /* -------------------------- Form Submission -------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      toast.error("Please fix the errors in the form");
      return;
    }

    try {
      setLoading(true);

      // Prepare the data to send
      const formData = {
        employeeId: form.employeeId,
        basicSalary: parseFloat(form.basicSalary),
        effectiveFrom: form.effectiveFrom,
        remarks: form.remarks || "",
      };

      const res = await axios.post(
        `${backendUrl}/api/hrm/mr-basic-payrolls`,
        formData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      if (res.status === 201 || res.status === 200) {
        toast.success(
          res.data.message || "MR Basic Payroll added successfully",
        );
        // Wait a moment before navigating to ensure toast is shown
        setTimeout(() => {
          navigate("/hrmlayout/mrbasicpayroll");
        }, 1000);
      }
    } catch (err) {
      console.error("Submission error:", err);

      // Handle specific error cases
      if (err.code === "ERR_NETWORK") {
        toast.error("Network error. Please check your connection.");
      } else if (err.response?.status === 400) {
        if (err.response?.data?.errors) {
          err.response.data.errors.forEach((error) => {
            toast.error(
              `${error.param || error.path}: ${error.msg || error.message}`,
            );
          });
        } else if (err.response?.data?.message) {
          toast.error(err.response.data.message);
        } else {
          toast.error("Invalid data. Please check your inputs.");
        }
      } else if (err.response?.status === 409) {
        toast.error(
          err.response.data.message || "This MR already has a payroll record.",
        );
      } else if (err.response?.status === 500) {
        toast.error("Server error. Please try again later.");
      } else {
        toast.error(err.message || "An error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* -------------------------- Load Data -------------------------- */
  useEffect(() => {
    fetchMRList();
  }, [fetchMRList]);

  // Refresh MR list function
  const refreshMRList = useCallback(async () => {
    await fetchMRList();
    toast.success("MR list refreshed");
  }, [fetchMRList]);

  return {
    form,
    setForm,
    errors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    handleNumeric,
    handleEmployeeChange,
    handleDateChange,
    handleRemarksChange,
    handleSubmit,
    refreshMRList,
  };
};

/* -------------------------------------------------------------------------- */
/*  Main component                                                           */
/* -------------------------------------------------------------------------- */
const AddMrBasicPayroll = () => {
  const {
    form,
    setForm,
    errors,
    loading,
    mrList,
    mrListLoading,
    isMrListEmpty,
    handleNumeric,
    handleEmployeeChange,
    handleDateChange,
    handleRemarksChange,
    handleSubmit,
    refreshMRList,
  } = useMrBasicPayrollForm();

  const navigate = useNavigate();

  /* -------------------------- MR/Employee options -------------------------- */
  const mrOptions = useMemo(() => {
    if (mrListLoading) {
      return [
        {
          value: "",
          label: "Loading MRs...",
          disabled: true,
        },
      ];
    }

    if (isMrListEmpty) {
      return [
        {
          value: "",
          label: "No MRs Available",
          disabled: true,
        },
      ];
    }

    return mrList.map((mr) => {
      // Determine the display name
      const displayName =
        mr.medicalRepName ||
        mr.name ||
        mr.fullName ||
        `${mr.firstName || ""} ${mr.lastName || ""}`.trim() ||
        `MR ${mr._id?.substring(0, 6) || "Unknown"}`;

      return {
        value: mr._id,
        label: displayName,
      };
    });
  }, [mrList, isMrListEmpty, mrListLoading]);

  /* -------------------------- Set default effective date -------------------------- */
  useEffect(() => {
    // Set default effective date to today if not already set
    if (!form.effectiveFrom) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      const formattedDate = `${year}-${month}-${day}`;
      setForm((prev) => ({ ...prev, effectiveFrom: formattedDate }));
    }
  }, [form.effectiveFrom, setForm]);

  /* -------------------------- Form validity for button -------------------------- */
  const isFormValid = useMemo(() => {
    const isValid =
      form.employeeId &&
      form.basicSalary &&
      !isNaN(parseFloat(form.basicSalary)) &&
      parseFloat(form.basicSalary) > 0 &&
      form.effectiveFrom &&
      !errors.employeeId &&
      !errors.basicSalary &&
      !errors.effectiveFrom;

    return isValid;
  }, [form, errors]);

  // Handle refresh MR list
  const handleRefreshMRList = async () => {
    await refreshMRList();
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-2xl font-semibold text-gray-800 mb-6">
        Add MR Basic Payroll
      </h2>

      {/* Refresh button */}
      <div className="mb-4 flex justify-between items-center">
        <button
          type="button"
          onClick={() => navigate("/hrmlayout/mrbasicpayroll")}
          className="flex items-center gap-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          Back to List
        </button>

        <button
          type="button"
          onClick={handleRefreshMRList}
          disabled={mrListLoading}
          className="flex items-center gap-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {mrListLoading ? "Refreshing..." : "Refresh MR List"}
        </button>
      </div>

      {/* MR list info */}
      {mrList.length > 0 && !mrListLoading && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-700">
            Found {mrList.length} MR(s) available for payroll assignment
          </p>
        </div>
      )}

      {/* Warning message if MR list is empty */}
      {isMrListEmpty && !mrListLoading && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-yellow-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No Available MRs Found
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>This could mean:</p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>All MRs already have payroll records assigned</li>
                  <li>No MRs are registered in the system</li>
                  <li>The server connection failed</li>
                </ul>
                <p className="mt-2">
                  Please check with your administrator or refresh the list.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <SearchableDropdown
              label="MR Name"
              value={form.employeeId}
              onChange={handleEmployeeChange}
              options={mrOptions}
              placeholder={
                mrListLoading
                  ? "Loading MRs..."
                  : isMrListEmpty
                    ? "No MR Available"
                    : "Select MR"
              }
              required={true}
              loading={mrListLoading}
              error={errors.employeeId}
              disabled={isMrListEmpty || mrListLoading}
            />
            {mrListLoading && (
              <p className="text-xs text-gray-500 mt-1 animate-pulse">
                Loading MR list...
              </p>
            )}
            {!mrListLoading && isMrListEmpty && (
              <p className="text-xs text-red-500 mt-1">
                No MRs available for payroll assignment.
              </p>
            )}
          </div>

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
              disabled={isMrListEmpty || mrListLoading}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                errors.basicSalary
                  ? "border-red-500 focus:ring-red-200 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              } ${
                isMrListEmpty || mrListLoading
                  ? "bg-gray-100 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
            {errors.basicSalary && (
              <p className="mt-1 text-sm text-red-600">{errors.basicSalary}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter amount without currency symbol
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective From <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="effectiveFrom"
              value={form.effectiveFrom}
              onChange={handleDateChange}
              disabled={isMrListEmpty || mrListLoading}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                errors.effectiveFrom
                  ? "border-red-500 focus:ring-red-200 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              } ${
                isMrListEmpty || mrListLoading
                  ? "bg-gray-100 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
            {errors.effectiveFrom && (
              <p className="mt-1 text-sm text-red-600">{errors.effectiveFrom}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Date when this salary becomes effective
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <input
              type="text"
              name="remarks"
              value={form.remarks}
              onChange={handleRemarksChange}
              placeholder="Enter any remarks (optional)..."
              disabled={isMrListEmpty || mrListLoading}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:outline-none transition-colors ${
                errors.remarks
                  ? "border-red-500 focus:ring-red-200 focus:border-red-500"
                  : "border-gray-300 focus:ring-blue-200 focus:border-blue-500"
              } ${
                isMrListEmpty || mrListLoading
                  ? "bg-gray-100 cursor-not-allowed"
                  : "bg-white"
              }`}
            />
            <p className="mt-1 text-xs text-gray-500">
              Optional notes about this payroll entry
            </p>
          </div>
        </div>

        {/* Display selected MR info */}
        {form.employeeId && form.employeeName && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 className="text-sm font-medium text-blue-800 mb-2">
              Selected MR Information:
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <span className="text-sm text-gray-600">Name:</span>
                <span className="ml-2 text-sm font-medium text-gray-800">
                  {form.employeeName}
                </span>
              </div>
              <div>
                <span className="text-sm text-gray-600">Effective From:</span>
                <span className="ml-2 text-sm font-medium text-gray-800">
                  {new Date(form.effectiveFrom).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Summary Card */}
        {form.employeeId && form.basicSalary && (
          <div className="mt-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg shadow-sm border border-green-200">
            <h3 className="text-lg font-semibold mb-4 text-center text-green-800">
              Payroll Summary
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm text-gray-600">MR Name</p>
                <p className="font-semibold text-gray-800 truncate">
                  {form.employeeName || "Not selected"}
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm text-gray-600">Basic Salary</p>
                <p className="font-semibold text-gray-800">
                  {form.basicSalary
                    ? `$${parseFloat(form.basicSalary).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "$0.00"}
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm text-gray-600">Effective From</p>
                <p className="font-semibold text-gray-800">
                  {form.effectiveFrom
                    ? new Date(form.effectiveFrom).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Not set"}
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg">
                <p className="text-sm text-gray-600">Status</p>
                <p className="font-semibold text-green-600">Ready to Save</p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="button"
            onClick={() => navigate("/hrmlayout/mrbasicpayroll")}
            className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg cursor-pointer transition-colors text-base font-medium"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={loading || !isFormValid || isMrListEmpty || mrListLoading}
            className={`px-6 py-3 rounded-lg shadow transition-all duration-200 text-base font-medium ${
              loading || !isFormValid || isMrListEmpty || mrListLoading
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:-translate-y-0.5"
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </span>
            ) : (
              "Save MR Basic Payroll"
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddMrBasicPayroll;