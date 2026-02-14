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
  fetchZonesByProvince,
  fetchBusinessTypes,
} from "../../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: initialCustomerCode || "",
    customerNumber: "",
  });
  const [errors, setErrors] = useState({});
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [zonesLoading, setZonesLoading] = useState(false);
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

  const handleProvinceChange = useCallback(async (provinceName) => {
    setForm((prevForm) => ({
      ...prevForm,
      province: provinceName,
      zone: "", // Reset zone when province changes
    }));

    setErrors((prev) => ({ ...prev, province: "" }));
    setErrors((prev) => ({ ...prev, zone: "" }));

    if (provinceName) {
      await loadZones(provinceName);
    } else {
      // If province is cleared, reset zones
      setZones([]);
    }
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
        let provincesData = result.data;

        // Handle different possible response formats
        if (result.data && result.data.provinces) {
          provincesData = result.data.provinces;
        } else if (result.data && Array.isArray(result.data.data)) {
          provincesData = result.data.data;
        }

        // Ensure provincesData is an array
        if (Array.isArray(provincesData)) {
          setProvinces(provincesData);
        } else {
          setProvinces([]);
          showToast("error", "Provinces data format is incorrect");
        }
      } else {
        showToast("error", result.error || "Failed to load provinces");
        setProvinces([]);
      }
    } catch (error) {
      console.error("Error in loadProvinces:", error);
      showToast("error", "Failed to load provinces");
      setProvinces([]);
    } finally {
      setProvincesLoading(false);
    }
  }, []);

  const loadMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const result = await fetchMRList();
      if (result.success) {
        let mrData = result.data;

        // Handle different possible response formats
        if (result.data && result.data.mrList) {
          mrData = result.data.mrList;
        } else if (result.data && Array.isArray(result.data.data)) {
          mrData = result.data.data;
        }

        // Ensure mrData is an array
        if (Array.isArray(mrData)) {
          setMrList(mrData);

          if (mrData.length === 0) {
            if (!isMrListEmptyRef.current) {
              setIsMrListEmpty(true);
              isMrListEmptyRef.current = true;
            }
          } else {
            setIsMrListEmpty(false);
            isMrListEmptyRef.current = false;
          }
        } else {
          console.error("MR data is not an array:", mrData);
          setMrList([]);
          setIsMrListEmpty(true);
          showToast("error", "MR data format is incorrect");
        }
      } else {
        showToast(
          "error",
          result.error || "Failed to load Medical Representatives"
        );
        setIsMrListEmpty(true);
        isMrListEmptyRef.current = true;
        setMrList([]);
      }
    } catch (error) {
      console.error("Error in loadMRList:", error);
      showToast("error", "Failed to load Medical Representatives");
      setIsMrListEmpty(true);
      isMrListEmptyRef.current = true;
      setMrList([]);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const loadZones = useCallback(async (provinceName) => {
    try {
      setZonesLoading(true);

      // Call fetchZonesByProvince with the province name
      const result = await fetchZonesByProvince(provinceName);

      if (result.success) {
        let zonesData = result.data;

        // Handle different possible response formats
        if (result.data && result.data.zones) {
          zonesData = result.data.zones;
        } else if (result.data && Array.isArray(result.data.data)) {
          zonesData = result.data.data;
        }

        // Ensure zonesData is an array
        if (Array.isArray(zonesData)) {
          // If no zones returned, use the province name as the zone
          if (zonesData.length === 0) {
            console.log(`No zones found for ${provinceName}, using province as zone`);
            setZones([{ name: provinceName, _id: provinceName }]);
          } else {
            setZones(zonesData);
          }
        } else {
          console.error("Zones data is not an array:", zonesData);
          // Fallback to province name as zone
          setZones([{ name: provinceName, _id: provinceName }]);
        }
      } else {
        // If fetch failed, use province name as zone
        console.log(`Failed to fetch zones for ${provinceName}, using province as zone`);
        setZones([{ name: provinceName, _id: provinceName }]);
      }
    } catch (error) {
      console.error("Error in loadZones:", error);
      // On error, use province name as zone
      setZones([{ name: provinceName, _id: provinceName }]);
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const loadBusinessTypes = useCallback(async () => {
    try {
      setBusinessTypesLoading(true);
      const result = await fetchBusinessTypes();
      if (result.success) {
        let businessData = result.data;

        // Handle different possible response formats
        if (result.data && result.data.businessTypes) {
          businessData = result.data.businessTypes;
        } else if (result.data && Array.isArray(result.data.data)) {
          businessData = result.data.data;
        }

        // Ensure businessData is an array
        if (Array.isArray(businessData)) {
          setBusinessTypes(businessData);
        } else {
          console.error("Business types data is not an array:", businessData);
          setBusinessTypes([]);
          showToast("error", "Business types data format is incorrect");
        }
      } else {
        showToast("error", result.error || "Failed to load business types");
        setBusinessTypes([]);
      }
    } catch (error) {
      console.error("Error in loadBusinessTypes:", error);
      showToast("error", "Failed to load business types");
      setBusinessTypes([]);
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
      
      // Prepare the data for submission
      const formData = {
        date: form.date,
        medicalRepId: form.medicalRepId,
        medicalRepName: form.medicalRepName,
        name: form.name,
        typeOfBusiness: form.typeOfBusiness,
        customerNumber: form.customerNumber,
        address: form.address,
        zone: form.zone,
        province: form.province,
        remark: form.remark
      };

      const response = await fetch(`${backendUrl}/api/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.duplicateCode) {
          // If customer code duplicate, fetch new code and retry
          await fetchNewCustomerCode();
          showToast("error", data.message || "Customer code conflict. Please try again.");
        } else {
          showToast("error", data.message || "Something went wrong");
        }
        return;
      }

      showToast("success", data.message || "Customer added successfully");
      navigate("/masterlayout/customer");
    } catch (error) {
      console.error("Error adding customer:", error);
      showToast("error", error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch new customer code
  const fetchNewCustomerCode = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/customers?limit=1`);
      const data = await response.json();
      
      if (data.ok && data.nextCustomerCode) {
        setForm(prev => ({
          ...prev,
          customerCode: data.nextCustomerCode
        }));
      }
    } catch (error) {
      console.error("Error fetching new customer code:", error);
    }
  }, []);

  const updateFormField = useCallback((field, value) => {
    setForm((prevForm) => ({
      ...prevForm,
      [field]: value,
    }));
  }, []);

  // Function to fetch next customer code on mount
  const fetchNextCustomerCode = useCallback(async () => {
    try {
      const response = await fetch(`${backendUrl}/api/customers?limit=1`);
      const data = await response.json();
      
      if (data.ok && data.nextCustomerCode) {
        // If initialCustomerCode is provided, use it, otherwise use the fetched code
        const codeToUse = initialCustomerCode || data.nextCustomerCode;
        updateFormField("customerCode", codeToUse);
      }
    } catch (error) {
      console.error("Error fetching customer code:", error);
    }
  }, [initialCustomerCode, updateFormField]);

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
    fetchNextCustomerCode,
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
    fetchNextCustomerCode,
  } = useCustomerForm(customerCode);

  // Memoized province options for dropdown - with safety checks
  const provinceOptions = useMemo(() => {
    if (!provinces || !Array.isArray(provinces)) {
      console.warn("Provinces is not an array:", provinces);
      return [];
    }

    try {
      return provinces
        .map((province) => {
          // Handle different province object structures
          const provinceName =
            province.name ||
            province.provinceName ||
            province.value ||
            province.label ||
            province.province ||
            "";
          if (!provinceName) {
            console.warn("Province without name found:", province);
            return null;
          }
          return {
            value: provinceName,
            label: provinceName,
          };
        })
        .filter(Boolean); // Remove null entries
    } catch (error) {
      console.error("Error creating province options:", error);
      return [];
    }
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

    if (!mrList || !Array.isArray(mrList)) {
      console.warn("MR list is not an array:", mrList);
      return [];
    }

    return mrList
      .map((mr) => {
        const mrName = mr.medicalRepName || mr.name || mr.fullName || "";
        if (!mrName) {
          console.warn("MR without name found:", mr);
          return null;
        }
        return {
          value: mr._id || mr.id || "",
          label: mrName,
        };
      })
      .filter(Boolean); // Remove null entries
  }, [mrList, isMrListEmpty]);

  // Memoized zone options for dropdown - only show zones for selected province
  const zoneOptions = useMemo(() => {
    if (!zones || !Array.isArray(zones)) {
      console.warn("Zones is not an array:", zones);
      return [];
    }

    return zones
      .map((zone) => {
        const zoneName =
          zone.name ||
          zone.zoneName ||
          zone.value ||
          zone.label ||
          zone.zone ||
          "";
        if (!zoneName) {
          console.warn("Zone without name found:", zone);
          return null;
        }
        return {
          value: zoneName,
          label: zoneName,
        };
      })
      .filter(Boolean); // Remove null entries
  }, [zones]);

  // Memoized business type options for dropdown
  const businessTypeOptions = useMemo(() => {
    if (!businessTypes || !Array.isArray(businessTypes)) {
      console.warn("Business types is not an array:", businessTypes);
      return [];
    }

    return businessTypes
      .map((type) => {
        if (typeof type === "string") {
          return {
            value: type,
            label: type,
          };
        } else if (type && typeof type === "object") {
          const typeValue = type.name || type.value || type._id || "";
          const typeLabel = type.name || type.label || type.value || "";

          if (!typeValue || !typeLabel) {
            console.warn("Business type without value/label found:", type);
            return null;
          }

          return {
            value: typeValue,
            label: typeLabel,
          };
        }
        console.warn("Invalid business type format:", type);
        return null;
      })
      .filter(Boolean); // Remove null entries
  }, [businessTypes]);

  // Set initial customer code and fetch data
  useEffect(() => {
    // Fetch next customer code on mount
    fetchNextCustomerCode();

    // Load data with error handling
    const loadData = async () => {
      try {
        await Promise.allSettled([
          loadProvinces(),
          loadMRList(),
          loadBusinessTypes(),
        ]);
      } catch (error) {
        console.error("Error loading data:", error);
        showToast("error", "Failed to load required data");
      }
    };

    loadData();
  }, [
    loadProvinces,
    loadMRList,
    loadBusinessTypes,
    fetchNextCustomerCode,
  ]);

  // Set today's date as default when component mounts
  useEffect(() => {
    try {
      const today = getTodayDate();
      updateFormField("date", today);
    } catch (error) {
      console.error("Error setting default date:", error);
    }
  }, [updateFormField]);

  // Load zones when province changes
  useEffect(() => {
    const loadZonesForProvince = async () => {
      if (form.province && form.province.trim() !== "") {
        await loadZones(form.province);
      } else {
        // Reset zones when province is cleared
        // Note: zones state is managed in useCustomerForm hook
      }
    };

    if (form.province) {
      loadZonesForProvince();
    }
  }, [form.province, loadZones]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    try {
      return (
        !isMrListEmpty &&
        form.date &&
        form.medicalRepId &&
        form.name &&
        form.name.trim() &&
        form.typeOfBusiness &&
        form.typeOfBusiness.trim() &&
        form.zone &&
        form.province &&
        (!form.customerNumber || /^\d+$/.test(form.customerNumber)) &&
        !errors.date
      );
    } catch (error) {
      console.error("Error checking form validity:", error);
      return false;
    }
  }, [form, isMrListEmpty, errors.date]);

  // Check if any field should be disabled
  const isFormDisabled = isMrListEmpty;

  // Show loading state
  if (provincesLoading || mrListLoading || businessTypesLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Add New Customer
        </h2>
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading form data...</p>
          </div>
        </div>
      </div>
    );
  }

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
              className="bg-gray-100 text-gray-700 border rounded px-3 py-2 border-gray-300 font-mono text-lg"
              placeholder="Auto-generated (e.g., 00001)"
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

          {/* Column 2 */}
          <div className="space-y-6">
            <InputField
              label="Customer Name in English"
              name="name"
              value={form.name}
              onChange={handleChange}
              error={errors.name}
              required
              disabled={isFormDisabled}
              placeholder="Enter customer name"
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
              emptyMessage="No business types available"
            />

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
              emptyMessage="No provinces available"
            />
          </div>

          {/* Column 3 */}
          <div className="space-y-6">
            <InputField
              label="Customer Address"
              name="address"
              value={form.address}
              onChange={handleChange}
              error={errors.address}
              placeholder="Optional"
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
              emptyMessage="No MRs available"
            />

            <SearchableDropdown
              value={form.zone}
              onChange={handleZoneChange}
              options={zoneOptions}
              placeholder={
                form.province 
                  ? zonesLoading 
                    ? "Loading zones..." 
                    : "Select Zone"
                  : "Select a province first"
              }
              required={true}
              loading={zonesLoading && form.province !== ""}
              error={errors.zone}
              label="Zone"
              disabled={isFormDisabled || !form.province || zonesLoading}
              emptyMessage={
                form.province
                  ? "Select Zone"
                  : "Select a province first"
              }
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
              businessTypesLoading ||
              !isFormValid ||
              isMrListEmpty
            }
            className={`px-4 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading ||
              provincesLoading ||
              mrListLoading ||
              businessTypesLoading ||
              !isFormValid ||
              isMrListEmpty
                ? "bg-gray-400 text-gray-200 cursor-not-allowed focus:ring-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Adding...
              </span>
            ) : (
              `Add Customer`
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/customer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium
             transform hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCustomer;