import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";
import axios from "axios";

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

// Searchable Dropdown Component (Consistent with first file)
const SearchableDropdown = React.memo(({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select option",
  required = false,
  loading = false,
  error = "",
  label = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return options;
    const filtered = options.filter(option =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return filtered.length > 0 ? filtered : [{ value: "", label: "No options found", disabled: true }];
  }, [options, searchTerm]);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="flex flex-col">
      {label && (
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative w-full" ref={dropdownRef}>
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
          className={`w-full border rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            error ? "border-red-500" : "border-gray-300"
          } ${
            disabled || loading
              ? "bg-gray-100 cursor-not-allowed opacity-60"
              : "bg-white cursor-pointer hover:border-gray-400"
          } ${!value ? "text-gray-500" : "text-gray-900"}`}
        >
          {loading ? (
            <span className="text-gray-500">Loading...</span>
          ) : (
            <span className="truncate">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
          )}
        </button>

        {isOpen && !disabled && !loading && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsOpen(false);
                    setSearchTerm("");
                  }
                }}
              />
            </div>

            {/* Options List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.map((option) => (
                <button
                  key={option.value || `option-${option.label}`}
                  type="button"
                  onClick={() => !option.disabled && handleSelect(option.value)}
                  className={`w-full px-3 py-2 text-left transition-colors duration-150 ${
                    option.disabled 
                      ? "text-gray-400 cursor-not-allowed bg-gray-50" 
                      : "hover:bg-blue-50 hover:text-blue-900 text-gray-900 cursor-pointer"
                  } ${
                    value === option.value
                      ? "bg-blue-100 text-blue-900 font-medium"
                      : ""
                  }`}
                  disabled={option.disabled}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  );
});

const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: initialCustomerCode || "",
  });
  const [errors, setErrors] = useState({});
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [zonesLoading, setZonesLoading] = useState(true);
  const navigate = useNavigate();

  // Get today's date in YYYY-MM-DD format for max date
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    else {
      const selectedDate = new Date(form.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time part for accurate comparison
      
      if (selectedDate > today) {
        newErrors.date = "Future dates are not allowed";
      }
    }
    
    if (!form.medicalRepId) newErrors.medicalRepName = "Medical Representative is required";
    if (!form.name.trim()) newErrors.name = "Customer Name is required";
    if (!form.typeOfBusiness.trim()) newErrors.typeOfBusiness = "Type of Business is required";
    if (!form.customerNumber.trim()) newErrors.customerNumber = "Customer Number is required";
    if (!form.address.trim()) newErrors.address = "Customer Address is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.province) newErrors.province = "Province is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Special validation for date field
    if (name === "date" && value) {
      const selectedDate = new Date(value);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (selectedDate > today) {
        setErrors((prev) => ({ 
          ...prev, 
          date: "Future dates are not allowed" 
        }));
        return; // Don't update the form if it's a future date
      }
    }
    
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));

    // Clear error when user starts typing
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  // Updated to store province name directly
  const handleProvinceChange = useCallback((provinceName) => {
    setForm((prevForm) => ({
      ...prevForm,
      province: provinceName,
    }));
    setErrors((prev) => ({ ...prev, province: "" }));
  }, []);

  const handleMRChange = useCallback((mrId) => {
    const selectedMR = mrList.find((mr) => mr._id === mrId);
    if (selectedMR) {
      setForm((prevForm) => ({
        ...prevForm,
        medicalRepId: mrId,
        medicalRepName: selectedMR.medicalRepName,
      }));
    }
    setErrors((prev) => ({ ...prev, medicalRepName: "" }));
  }, [mrList]);

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
      setMrList(response.data || []);
    } catch (error) {
      console.error("Error fetching MR list:", error);
      showToast("error", "Failed to load Medical Representatives");
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchZones = useCallback(async () => {
    try {
      setZonesLoading(true);
      const commonZones = [
        "North Zone",
        "South Zone", 
        "East Zone",
        "West Zone",
        "Central Zone",
        "Metro Zone",
        "Urban Zone",
        "Rural Zone",
        "Commercial Zone",
        "Industrial Zone"
      ];
      setZones(commonZones);
    } catch (error) {
      console.error("Error fetching zones:", error);
      showToast("error", "Failed to load zones");
    } finally {
      setZonesLoading(false);
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
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
    loading,
    provincesLoading,
    mrListLoading,
    zonesLoading,
    handleChange,
    handleProvinceChange,
    handleMRChange,
    handleZoneChange,
    handleSubmit,
    validate,
    fetchProvinces,
    fetchMRList,
    fetchZones,
    setForm,
    updateFormField,
    getTodayDate,
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
    disabled = false,
    className = "",
    max = "", // Add max prop for date input
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
        disabled={disabled}
        max={max} // Pass max attribute
        className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100" : ""} ${className}`}
        autoComplete="off"
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

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
    loading,
    provincesLoading,
    mrListLoading,
    zonesLoading,
    handleChange,
    handleProvinceChange,
    handleMRChange,
    handleZoneChange,
    handleSubmit,
    fetchProvinces,
    fetchMRList,
    fetchZones,
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
    return [
      { value: "", label: "Select MR" },
      ...mrList.map((mr) => ({
        value: mr._id,
        label: `${mr.medicalRepName}`,
      })),
    ];
  }, [mrList]);

  // Memoized zone options for dropdown
  const zoneOptions = useMemo(() => {
    return [
      { value: "", label: "Select Zone" },
      ...zones.map((zone) => ({
        value: zone,
        label: zone,
      })),
    ];
  }, [zones]);

  // Set initial customer code and fetch data
  useEffect(() => {
    if (customerCode) {
      updateFormField("customerCode", customerCode);
    }
    fetchProvinces();
    fetchMRList();
    fetchZones();
  }, [customerCode, fetchProvinces, fetchMRList, fetchZones, updateFormField]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return (
      form.date &&
      form.medicalRepId &&
      form.name.trim() &&
      form.typeOfBusiness.trim() &&
      form.customerNumber.trim() &&
      form.address.trim() &&
      form.zone &&
      form.province
    );
  }, [form]);

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
      <h2 className="text-3xl font-bold mb-8 text-gray-800 text-center">
        Add New Customer
      </h2>

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
              label="Date"
              name="date"
              type="date"
              value={form.date}
              onChange={handleChange}
              error={errors.date}
              required
              max={getTodayDate()} // Prevent future date selection
            />
            
            {/* Medical Representative Dropdown */}
            <SearchableDropdown
              value={form.medicalRepId}
              onChange={handleMRChange}
              options={mrOptions}
              placeholder="Select MR"
              required={true}
              loading={mrListLoading}
              error={errors.medicalRepName}
              label="Medical Representative"
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
            />
            
            <InputField
              label="Types of Business"
              name="typeOfBusiness"
              value={form.typeOfBusiness}
              onChange={handleChange}
              error={errors.typeOfBusiness}
              required
            />
            
            <InputField
              label="Customer Number"
              name="customerNumber"
              value={form.customerNumber}
              onChange={handleChange}
              error={errors.customerNumber}
              required
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
              required
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
              className="w-full border border-gray-300 rounded-md px-3 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="submit"
            disabled={loading || provincesLoading || mrListLoading || zonesLoading || !isFormValid}
            className={`px-8 py-3 rounded-lg shadow transition-colors text-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              loading || provincesLoading || mrListLoading || zonesLoading || !isFormValid
                ? "bg-gray-400 text-gray-200 cursor-not-allowed focus:ring-gray-300"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform focus:ring-green-500"
            }`}
          >
            {loading ? "Adding..." : "Add Customer"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/customer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-8 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium transform
             hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCustomer;