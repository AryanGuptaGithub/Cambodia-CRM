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
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  customerCode: "",
  date: "",
  medicalRepName: "",
  medicalRepId: "",
  name: "",
  typeOfBusiness: "",
  customerNumber: "",
  address: "",
  zone: "",
  province: "",
  remark: "",
};

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

  // Get today's date in YYYY-MM-DD format for max date
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    else {
      const selectedDate = new Date(form.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate > today) {
        newErrors.date = "Future dates are not allowed";
      }
    }

    if (!form.medicalRepId)
      newErrors.medicalRepName = "Medical Representative is required";
    if (!form.name.trim()) newErrors.name = "Customer Name is required";
    if (!form.typeOfBusiness.trim())
      newErrors.typeOfBusiness = "Type of Business is required";
    // Removed address validation to make it optional
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.province) newErrors.province = "Province is required";

    // Customer Number validation - only numbers allowed
    if (form.customerNumber && !/^\d+$/.test(form.customerNumber)) {
      newErrors.customerNumber = "Customer Number must contain only numbers";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;

    if (name === "date" && value) {
      const selectedDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDate > today) {
        setErrors((prev) => ({
          ...prev,
          date: "Future dates are not allowed",
        }));
        return;
      }
    }

    // Handle Customer Number - only allow numbers
    if (name === "customerNumber") {
      // Allow only numbers, remove any non-digit characters
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

    setErrors((prev) => ({ ...prev, [name]: "" }));
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

  const fetchProvinces = useCallback(async () => {
    try {
      setProvincesLoading(true);
      const response = await axios.get(`${backendUrl}/api/customers/provinces`);

      if (response.data.success) {
        setProvinces(response.data.data || []);
      } else {
        throw new Error(response.data.message || "Failed to fetch provinces");
      }
    } catch (error) {
      console.error("Error fetching provinces:", error);
      showToast("error", "Failed to load provinces");
    } finally {
      setProvincesLoading(false);
    }
  }, []);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(`${backendUrl}/api/staffs`);
      const mrData = response.data || [];
      setMrList(mrData);

      if (mrData.length === 0) {
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
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load Medical Representatives");
      setIsMrListEmpty(true);
      isMrListEmptyRef.current = true;
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      setZonesLoading(true);
      const response = await axios.get(`${backendUrl}/api/zones`);
      console.log("Zones API response:", response);

      const zonesData = response.data || [];
      setZones(zonesData);
    } catch (error) {
      console.error("Error fetching zones:", error);
      showToast("error", "Failed to load zones");
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const fetchBusinessTypes = useCallback(async () => {
    try {
      setBusinessTypesLoading(true);
      const response = await axios.get(`${backendUrl}/api/business-types`);
      console.log("Business Types API response:", response);

      // Handle different response structures
      let businessTypesData = [];

      if (response.data && Array.isArray(response.data)) {
        // If response.data is directly an array
        businessTypesData = response.data;
      } else if (
        response.data &&
        response.data.data &&
        Array.isArray(response.data.data)
      ) {
        // If response.data has a data property that is an array
        businessTypesData = response.data.data;
      } else if (
        response.data &&
        response.data.success &&
        Array.isArray(response.data.data)
      ) {
        // If response follows the success/data pattern
        businessTypesData = response.data.data;
      }

      setBusinessTypes(businessTypesData);
    } catch (error) {
      console.error("Error fetching business types:", error);
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
    fetchProvinces,
    fetchMRList,
    fetchZones,
    fetchBusinessTypes,
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
    fetchProvinces,
    fetchMRList,
    fetchZones,
    fetchBusinessTypes,
    updateFormField,
    getTodayDate,
  } = useCustomerForm(customerCode);

  // Memoized province options for dropdown
  const provinceOptions = useMemo(() => {
    return [
      { value: "", label: "Select Province" },
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
      { value: "", label: "Select MR" },
      ...mrList.map((mr) => ({
        value: mr._id,
        label: `${mr.medicalRepName}`,
      })),
    ];
  }, [mrList, isMrListEmpty]);

  // Memoized zone options for dropdown
  const zoneOptions = useMemo(() => {
    return [
      { value: "", label: "Select Zone" },
      ...zones.map((zone) => ({
        value: zone.name,
        label: zone.name,
      })),
    ];
  }, [zones]);

  // Memoized business type options for dropdown
  const businessTypeOptions = useMemo(() => {
    return [
      { value: "", label: "Select Business Type" },
      ...businessTypes
        .map((type) => {
          // Handle both string and object formats
          if (typeof type === "string") {
            return {
              value: type,
              label: type,
            };
          } else if (type && typeof type === "object") {
            // If business types are objects with name property
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
    fetchProvinces();
    fetchMRList();
    fetchZones();
    fetchBusinessTypes();
  }, [
    customerCode,
    fetchProvinces,
    fetchMRList,
    fetchZones,
    fetchBusinessTypes,
    updateFormField,
  ]);

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
      !errors.customerNumber // Ensure customer number is valid if provided
    );
  }, [form, isMrListEmpty, errors.customerNumber]);

  // Check if any field should be disabled
  const isFormDisabled = isMrListEmpty;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        {" "}
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
              className="bg-gray-100 text-gray-700"
            />

            <InputField
              label="Joining Date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              error={errors.date}
              required
              max={getTodayDate()}
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
              type="tel" // Use tel type for better mobile keyboard
              inputMode="numeric" // Show numeric keyboard on mobile
              pattern="[0-9]*" // HTML5 pattern for numbers only
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
