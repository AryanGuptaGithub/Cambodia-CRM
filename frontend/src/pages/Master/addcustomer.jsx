import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";
import CustomDropdown from "../Utility/customDropdown.jsx";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const initialFormState = {
  customerCode: "",
  date: "",
  medicalRepName: "",
  name: "",
  typeOfBusiness: "",
  customerNumber: "",
  address: "",
  zone: "",
  location: "",
  remark: "",
};

const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...initialFormState,
    customerCode: initialCustomerCode || "",
  });
  const [errors, setErrors] = useState({});
  const [provinces, setProvinces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const navigate = useNavigate();

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.date) newErrors.date = "Date is required";
    if (!form.medicalRepName) newErrors.medicalRepName = "Medical Representative Name is required";
    if (!form.name) newErrors.name = "Customer Name is required";
    if (!form.typeOfBusiness) newErrors.typeOfBusiness = "Type of Business is required";
    if (!form.customerNumber) newErrors.customerNumber = "Customer Number is required";
    if (!form.address) newErrors.address = "Customer Address is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.location) newErrors.location = "Location is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));

    // Clear error when user starts typing
    setErrors((prev) => ({ ...prev, [name]: "" }));
  }, []);

  const handleLocationChange = useCallback((provinceId) => {
    const selectedProvince = provinces.find((province) => province._id === provinceId);
    if (selectedProvince) {
      setForm((prevForm) => ({
        ...prevForm,
        location: selectedProvince.name,
      }));
    }
    // Clear location error when user selects a province
    setErrors((prev) => ({ ...prev, location: "" }));
  }, [provinces]);

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

  // Function to update form fields externally
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
    loading,
    provincesLoading,
    handleChange,
    handleLocationChange,
    handleSubmit,
    validate,
    fetchProvinces,
    setForm,
    updateFormField,
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
        className={`w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
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
    loading,
    provincesLoading,
    handleChange,
    handleLocationChange,
    handleSubmit,
    fetchProvinces,
    updateFormField,
  } = useCustomerForm(customerCode);

  // Memoized province options for dropdown
  const provinceOptions = useMemo(() => {
    return [
      { value: "", label: "Select Province" },
      ...provinces.map((province) => ({
        value: province._id,
        label: province.name,
      })),
    ];
  }, [provinces]);

  // Set initial customer code and fetch provinces
  useEffect(() => {
    if (customerCode) {
      updateFormField("customerCode", customerCode);
    }
    fetchProvinces();
  }, [customerCode, fetchProvinces, updateFormField]);

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return (
      form.date &&
      form.medicalRepName &&
      form.name &&
      form.typeOfBusiness &&
      form.customerNumber &&
      form.address &&
      form.zone &&
      form.location
    );
  }, [form]);

  return (
    <div className="max-w-6xl mx-auto p-8 bg-white rounded-3xl shadow-lg">
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
            />
            
            <InputField
              label="Medical Representative Name"
              name="medicalRepName"
              value={form.medicalRepName}
              onChange={handleChange}
              error={errors.medicalRepName}
              required
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
            
            <InputField
              label="Zone"
              name="zone"
              value={form.zone}
              onChange={handleChange}
              error={errors.zone}
              required
            />
            
            {/* Location Dropdown */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">
                Location (Province) <span className="text-red-500">*</span>
              </label>
              
              {provincesLoading ? (
                <div className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-500">
                  Loading provinces...
                </div>
              ) : (
                <CustomDropdown
                  value={provinces.find(p => p.name === form.location)?._id || ""}
                  onChange={handleLocationChange}
                  placeholder="Select Province"
                  options={provinceOptions}
                  required
                />
              )}
              
              {errors.location && (
                <p className="text-red-500 text-xs mt-0.5">{errors.location}</p>
              )}
            </div>
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
              className="w-full border border-gray-300 rounded-md px-3 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end mt-10 gap-4">
          <button
            type="submit"
            disabled={loading || provincesLoading || !isFormValid}
            className={`px-8 py-3 rounded-lg shadow transition-colors text-lg font-medium ${
              loading || provincesLoading || !isFormValid
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer transform hover:scale-105 transition-transform"
            }`}
          >
            {loading ? "Adding..." : "Add Customer"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/masterlayout/customer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-8 py-3 rounded-lg cursor-pointer transition-colors text-lg font-medium transform hover:scale-105 transition-transform"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddCustomer;