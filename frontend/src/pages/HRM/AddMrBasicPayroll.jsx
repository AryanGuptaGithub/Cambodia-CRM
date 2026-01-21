import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
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
      // Try different endpoints to get MRs
      let response;
      
      try {
        // First try /api/mrs endpoint
        response = await axios.get(`${backendUrl}/api/mr-basic-payrolls/mrs/list`);
      } catch (error) {
        response = await axios.get(`${backendUrl}/api/staffs`);
        
        // Filter only MRs if staffs endpoint is used
        if (response.data && Array.isArray(response.data)) {
          response.data = response.data.filter(staff => 
            staff.designation === "MR" || 
            staff.role === "MR" || 
            staff.medicalRepName // If it has medicalRepName field, it's likely an MR
          );
        }
      }
      if (response.data.success && response.data.data.length > 0) {
        setMrList(response.data.data);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
      }
    } catch (error) {
      console.error("Error fetching MR list:", error);
      toast.error(error.response?.data?.message || "Failed to load MR list");
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
    if (!form.basicSalary) newErrors.basicSalary = "Basic Salary is required";
    if (!form.employeeName.trim()) newErrors.employeeName = "Employee name is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  /* -------------------------- Event Handlers -------------------------- */
  const handleNumeric = useCallback((e) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setForm((prev) => ({ ...prev, [name]: value }));
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  const handleEmployeeChange = useCallback((employeeId) => {
    // Find the selected MR to get their name
    const selectedMR = mrList.find(mr => mr._id === employeeId);
    setForm((prev) => ({ 
      ...prev, 
      employeeId,
      employeeName: selectedMR ? (selectedMR.medicalRepName || selectedMR.employeeName || selectedMR.name || "") : ""
    }));
    setErrors((prev) => ({ ...prev, employeeId: "", employeeName: "" }));
  }, [mrList]);

  /* -------------------------- Form Submission -------------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    
    try {
      setLoading(true);
      
      // Prepare the data to send
      const formData = {
        employeeId: form.employeeId,
        employeeName: form.employeeName,
        basicSalary: parseFloat(form.basicSalary),
        remarks: form.remarks || ""
      };
      
      const res = await axios.post(`${backendUrl}/api/mr-basic-payrolls`, formData);
      
      if (res.status === 201 || res.status === 200) {
        toast.success(res.data.message || "MR Basic Payroll added successfully");
        
        // Refresh MR list after successful submission
        await fetchMRList();
        
        navigate("/hrmlayout/mrbasicpayroll");
      }
    } catch (err) {
      console.error("Submission error:", err.response?.data || err);
      toast.error(err.response?.data?.message || err.message || "Network error");
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
    handleSubmit,
    refreshMRList,
  } = useMrBasicPayrollForm();

  const navigate = useNavigate();

  /* -------------------------- MR/Employee options -------------------------- */
  const mrOptions = useMemo(() => {
    if (isMrListEmpty) {
      return [
        {
          value: "",
          label: "No MR Available",
          disabled: true,
        },
      ];
    }

    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || mr.name || `MR ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty]);

  /* -------------------------- Form validity for button -------------------------- */
  const isFormValid = useMemo(
    () =>
      form.employeeId &&
      form.employeeName &&
      form.basicSalary &&
      !errors.employeeId &&
      !errors.employeeName &&
      !errors.basicSalary,
    [form, errors]
  );

  // Handle refresh MR list
  const handleRefreshMRList = async () => {
    await refreshMRList();
    toast.success("MR list refreshed successfully");
  };

  // Debug: Log MR list
  useEffect(() => {
  }, [mrList]);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-6">
        Add MR Basic Payroll
      </h2>

      {/* Add refresh button */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={handleRefreshMRList}
          className="flex items-center gap-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1 rounded-lg"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh MR List
        </button>
      </div>

      {/* Debug info */}
      {mrList.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <p className="text-xs text-gray-600">
            Found {mrList.length} MR(s) in the system
          </p>
        </div>
      )}

      {/* Warning message if MR list is empty */}
      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                No MR Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one MR before creating basic payroll records.
                </p>
                <p className="mt-1">
                  Check if your backend has an MRs endpoint or if staffs endpoint returns MR data.
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
              placeholder={isMrListEmpty ? "No MR Available" : "Select MR"}
              required={true}
              loading={mrListLoading}
              error={errors.employeeId || errors.employeeName}
              disabled={isMrListEmpty}
            />
            {mrListLoading && (
              <p className="text-xs text-gray-500 mt-1">Loading MR list...</p>
            )}
            {!mrListLoading && mrList.length === 0 && (
              <p className="text-xs text-red-500 mt-1">No MRs found. Please add MRs first.</p>
            )}
          </div>

          <InputField
            label="Basic Salary"
            name="basicSalary"
            value={form.basicSalary}
            onChange={handleNumeric}
            placeholder="0.00"
            error={errors.basicSalary}
            required
            disabled={isMrListEmpty}
          />
        </div>

        {/* Display selected MR name */}
        {form.employeeId && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700">
              <span className="font-medium">Selected MR:</span> {form.employeeName || "Unknown"}
            </p>
          </div>
        )}

        {/* Second Row: Remarks */}
        <div className="grid grid-cols-1 gap-6 mb-8">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              value={form.remarks}
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
              disabled={isMrListEmpty}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows="3"
              placeholder="Enter any remarks..."
            />
          </div>
        </div>

        {/* Summary Card */}
        <div className="mt-8 p-4 bg-blue-50 rounded-md shadow-md border border-blue-100">
          <h3 className="text-lg font-semibold mb-4 text-center text-blue-800">
            MR Basic Payroll Summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-sm text-blue-600">Selected MR</p>
              <p className="font-semibold text-blue-800">
                {form.employeeName || "Not selected"}
              </p>
            </div>
            
            <div className="text-center">
              <p className="text-sm text-blue-600">Basic Salary</p>
              <p className="font-semibold text-blue-800">
                {form.basicSalary ? `$${form.basicSalary}` : "$0.00"}
              </p>
            </div>
          </div>
        </div>

        {/* ---------- Action Buttons ---------- */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="submit"
            disabled={loading || !isFormValid || isMrListEmpty}
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || !isFormValid || isMrListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading ? "Saving…" : "Save MR Basic Payroll"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/hrmlayout/mrbasicpayroll")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors
             text-lg font-medium transform hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddMrBasicPayroll;