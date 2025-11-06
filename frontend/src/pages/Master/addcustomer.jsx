// AddCustomer.jsx
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import { getTodayDate } from "../../utils/dateUtil";
import {
  initialFormState,
  validateCustomerForm,
  fetchProvinces,
  fetchMRList,
  fetchZones,
  fetchBusinessTypes,
} from "../../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: initialCustomerCode || "",
  });
  const [errors, setErrors] = useState({});
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [businessTypesLoading, setBusinessTypesLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const navigate = useNavigate();
  const isMrListEmptyRef = useRef(false);

  // Fixed validation function that allows today's date
  const validate = useCallback(() => {
    const newErrors = {};
    const today = getTodayDate();

    if (!form.date) {
      newErrors.date = "Date is required";
    } else if (form.date > today) {
      newErrors.date = "Future dates are not allowed";
    }

    if (!form.medicalRepId)
      newErrors.medicalRepName = "Medical Representative is required";
    if (!form.name.trim()) newErrors.name = "Customer Name is required";
    if (!form.typeOfBusiness.trim())
      newErrors.typeOfBusiness = "Type of Business is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.province) newErrors.province = "Province is required";

    // Customer Number validation - only numbers allowed
    if (form.customerNumber && !/^\d+$/.test(form.customerNumber)) {
      newErrors.customerNumber = "Customer Number must contain only numbers";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // Fixed handleChange function that allows today's date
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "date" && value) {
      const today = getTodayDate();

      // Allow today's date, only block future dates
      if (value > today) {
        setErrors((prev) => ({
          ...prev,
          date: "Future dates are not allowed",
        }));
        return;
      } else {
        // Clear date error if it's valid (today or past)
        setErrors((prev) => ({ ...prev, date: "" }));
      }
    }

    // Handle Customer Number - only allow numbers
    if (name === "customerNumber") {
      const numericValue = value.replace(/[^\d]/g, "");
      setForm((prevForm) => ({
        ...prevForm,
        [name]: numericValue,
      }));
    } else {
      setForm((prevForm) => ({
        ...prevForm,
        [name]: value,
      }));
    }

    if (name !== "date") {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, []);

  // Handle business type change
  const handleBusinessTypeChange = useCallback((businessType) => {
    setForm((prevForm) => ({
      ...prevForm,
      typeOfBusiness: businessType,
    }));
    setErrors((prev) => ({ ...prev, typeOfBusiness: "" }));
  }, []);

  const handleProvinceChange = useCallback((provinceName) => {
    setForm((prevForm) => ({
      ...prevForm,
      province: provinceName,
    }));
    setErrors((prev) => ({ ...prev, province: "" }));
  }, []);

  const handleMRChange = useCallback(
    (mrId) => {
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      if (selectedMR) {
        setForm((prevForm) => ({
          ...prevForm,
          medicalRepId: mrId,
          medicalRepName: selectedMR.medicalRepName,
        }));
      }
      setErrors((prev) => ({ ...prev, medicalRepName: "" }));
    },
    [mrList]
  );

  const handleZoneChange = useCallback((zoneName) => {
    setForm((prevForm) => ({
      ...prevForm,
      zone: zoneName,
    }));
    setErrors((prev) => ({ ...prev, zone: "" }));
  }, []);

  const loadProvinces = useCallback(async () => {
    try {
      setProvincesLoading(true);
      const result = await fetchProvinces();
      if (result.success) {
        setProvinces(result.data);
      } else {
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error in loadProvinces:", error);
      showToast("error", "Failed to load provinces");
    } finally {
      setProvincesLoading(false);
    }
  }, []);

  const loadMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const result = await fetchMRList();
      if (result.success) {
        setMrList(result.data);

        if (result.data.length === 0) {
          if (!isMrListEmptyRef.current) {
            setIsMrListEmpty(true);
            isMrListEmptyRef.current = true;
            showToast(
              "error",
              "No Medical Representatives found. Please add at least one MR first."
            );
          }
        } else {
          setIsMrListEmpty(false);
          isMrListEmptyRef.current = false;
        }
      } else {
        showToast("error", result.error);
        setIsMrListEmpty(true);
        isMrListEmptyRef.current = true;
      }
    } catch (error) {
      console.error("Error in loadMRList:", error);
      showToast("error", "Failed to load Medical Representatives");
      setIsMrListEmpty(true);
      isMrListEmptyRef.current = true;
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const loadZones = useCallback(async () => {
    try {
      setZonesLoading(true);
      const result = await fetchZones();
      if (result.success) {
        setZones(result.data);
      } else {
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error in loadZones:", error);
      showToast("error", "Failed to load zones");
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const loadBusinessTypes = useCallback(async () => {
    try {
      setBusinessTypesLoading(true);
      const result = await fetchBusinessTypes();
      if (result.success) {
        setBusinessTypes(result.data);
      } else {
        showToast("error", result.error);
      }
    } catch (error) {
      console.error("Error in loadBusinessTypes:", error);
      showToast("error", "Failed to load business types");
    } finally {
      setBusinessTypesLoading(false);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isMrListEmpty) {
      showToast(
        "error",
        "Cannot add customer. No Medical Representatives available."
      );
      return;
    }

    if (!validate()) return;

    try {
      setLoading(true);
      const response = await fetch(`${backendUrl}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Something went wrong");
        return;
      }

      showToast("success", data.message || "Customer added successfully");
      navigate("/masterlayout/customer");
    } catch (error) {
      showToast("error", error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const updateFormField = useCallback((field, value) => {
    setForm((prevForm) => ({
      ...prevForm,
      [field]: value,
    }));
  }, []);

  return {
    form,
    errors,
    provinces,
    mrList,
    zones,
    businessTypes,
    loading,
    provincesLoading,
    mrListLoading,
    zonesLoading,
    businessTypesLoading,
    isMrListEmpty,
    handleChange,
    handleBusinessTypeChange,
    handleProvinceChange,
    handleMRChange,
    handleZoneChange,
    handleSubmit,
    validate,
    loadProvinces,
    loadMRList,
    loadZones,
    loadBusinessTypes,
    setForm,
    updateFormField,
    getTodayDate,
  };
};

const AddCustomer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};

  const {
    form,
    errors,
    provinces,
    mrList,
    zones,
    businessTypes,
    loading,
    provincesLoading,
    mrListLoading,
    zonesLoading,
    businessTypesLoading,
    isMrListEmpty,
    handleChange,
    handleBusinessTypeChange,
    handleProvinceChange,
    handleMRChange,
    handleZoneChange,
    handleSubmit,
    loadProvinces,
    loadMRList,
    loadZones,
    loadBusinessTypes,
    updateFormField,
    getTodayDate,
  } = useCustomerForm(customerCode);

  // Memoized province options for dropdown
  const provinceOptions = useMemo(() => {
    return [
      ...provinces.map((province) => ({
        value: province.name,
        label: province.name,
      })),
    ];
  }, [provinces]);

  // Memoized MR options for dropdown
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

    return [
      ...mrList.map((mr) => ({
        value: mr._id,
        label: `${mr.medicalRepName}`,
      })),
    ];
  }, [mrList, isMrListEmpty]);

  // Memoized zone options for dropdown
  const zoneOptions = useMemo(() => {
    return [
      ...zones.map((zone) => ({
        value: zone.name,
        label: zone.name,
      })),
    ];
  }, [zones]);

  // Memoized business type options for dropdown
  const businessTypeOptions = useMemo(() => {
    return [
      ...businessTypes
        .map((type) => {
          if (typeof type === "string") {
            return {
              value: type,
              label: type,
            };
          } else if (type && typeof type === "object") {
            return {
              value: type.name || type.value || type._id,
              label: type.name || type.label || type.value,
            };
          }
          return { value: "", label: "Invalid type" };
        })
        .filter((option) => option.value !== ""),
    ];
  }, [businessTypes]);

  // Set initial customer code and fetch data
  useEffect(() => {
    if (customerCode) {
      updateFormField("customerCode", customerCode);
    }
    loadProvinces();
    loadMRList();
    loadZones();
    loadBusinessTypes();
  }, [
    customerCode,
    loadProvinces,
    loadMRList,
    loadZones,
    loadBusinessTypes,
    updateFormField,
  ]);

  // Set today's date as default when component mounts
  useEffect(() => {
    const today = getTodayDate();
    updateFormField("date", today);
  }, [updateFormField]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return (
      !isMrListEmpty &&
      form.date &&
      form.medicalRepId &&
      form.name.trim() &&
      form.typeOfBusiness.trim() &&
      form.zone &&
      form.province &&
      !errors.customerNumber &&
      !errors.date // Ensure no date errors
    );
  }, [form, isMrListEmpty, errors.customerNumber, errors.date]);

  // Check if any field should be disabled
  const isFormDisabled = isMrListEmpty;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Add New Customer
      </h2>

      {/* Warning message if MR list is empty */}
      {isMrListEmpty && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                No Medical Representatives Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one Medical Representative before
                  creating customers. Add MRs in the staff management section.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Column 1 */}
          <div className="space-y-6">
            <InputField
              label="Customer Code"
              name="customerCode"
              value={form.customerCode}
              onChange={handleChange}
              disabled={true}
              className="bg-gray-100 text-gray-700 border rounded px-3 py-2 border-gray-300"
            />

            <InputField
              label="Joining Date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              error={errors.date}
              required
              max={getTodayDate()} // Set max to today to prevent future date selection in UI
              disabled={isFormDisabled}
            />
            <SearchableDropdown
              value={form.medicalRepId}
              onChange={handleMRChange}
              options={mrOptions}
              placeholder={isMrListEmpty ? "No MRs Available" : "Select MR"}
              required={true}
              loading={mrListLoading}
              error={errors.medicalRepName}
              label="Medical Representative"
              disabled={isMrListEmpty}
            />
          </div>
          <div className="space-y-6">
            <InputField
              label="Customer Name in English"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={errors.name}
              required
              disabled={isFormDisabled}
            />

            <SearchableDropdown
              value={form.typeOfBusiness}
              onChange={handleBusinessTypeChange}
              options={businessTypeOptions}
              placeholder="Select Business Type"
              required={true}
              loading={businessTypesLoading}
              error={errors.typeOfBusiness}
              label="Types of Business"
              disabled={isFormDisabled}
            />

            {/* Customer Number - Optional, Numbers Only */}
            <InputField
              label="Customer Number"
              name="customerNumber"
              value={form.customerNumber}
              onChange={handleChange}
              placeholder="Enter numbers only"
              error={errors.customerNumber}
              disabled={isFormDisabled}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>

          {/* Column 3 */}
          <div className="space-y-6">
            {/* Customer Address - Now Optional */}
            <InputField
              label="Customer Address"
              name="address"
              value={form.address}
              onChange={handleChange}
              error={errors.address}
              placeholder="Optional"
              disabled={isFormDisabled}
            />

            {/* Zone Dropdown */}
            <SearchableDropdown
              value={form.zone}
              onChange={handleZoneChange}
              options={zoneOptions}
              placeholder="Select Zone"
              required={true}
              loading={zonesLoading}
              error={errors.zone}
              label="Zone"
              disabled={isFormDisabled}
            />

            {/* Province Dropdown */}
            <SearchableDropdown
              value={form.province}
              onChange={handleProvinceChange}
              options={provinceOptions}
              placeholder="Select Province"
              required={true}
              loading={provincesLoading}
              error={errors.province}
              label="Province"
              disabled={isFormDisabled}
            />
          </div>
        </div>

        {/* Remark Field - Full Width */}
        <div className="mt-8">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Remark
            </label>
            <textarea
              name="remark"
              value={form.remark}
              onChange={handleChange}
              placeholder="Additional notes or comments"
              rows={4}
              disabled={isFormDisabled}
              className={`w-full border border-gray-300 rounded-md px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical ${
                isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
              }`}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="submit"
            disabled={
              loading ||
              provincesLoading ||
              mrListLoading ||
              zonesLoading ||
              businessTypesLoading ||
              !isFormValid ||
              isMrListEmpty
            }
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading ||
              provincesLoading ||
              mrListLoading ||
              zonesLoading ||
              businessTypesLoading ||
              !isFormValid ||
              isMrListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed focus:ring-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading ? "Adding..." : "Add Customer"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/customer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium transform hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCustomer;
