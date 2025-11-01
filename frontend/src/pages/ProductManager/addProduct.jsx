import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// 🧩 Reusable Searchable Dropdown (Consistent implementation)
const SearchableDropdown = React.memo(
  ({
    label,
    value,
    onChange,
    options,
    placeholder = "Select",
    required = false,
    loading = false,
    error = "",
    disabled = false,
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = React.useRef(null);

    // Close dropdown when clicking outside
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

    // Filter options
    const filteredOptions = useMemo(() => {
      if (!searchTerm) return options;
      const filtered = options.filter((option) =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return filtered.length > 0
        ? filtered
        : [{ value: "", label: "No results found", disabled: true }];
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
            onClick={() => !disabled && !loading && setIsOpen((prev) => !prev)}
            className={`w-full border rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              error ? "border-red-500" : "border-gray-300"
            } ${
              disabled || loading
                ? "bg-gray-100 cursor-not-allowed opacity-60"
                : "bg-white cursor-pointer hover:border-gray-400"
            } ${!value ? "text-gray-500" : "text-gray-900"}`}
          >
            {loading
              ? "Loading..."
              : selectedOption
              ? selectedOption.label
              : placeholder}
          </button>

          {isOpen && !loading && !disabled && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
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
              <div className="max-h-48 overflow-y-auto">
                {filteredOptions.map((option) => (
                  <button
                    key={option.value || `option-${option.label}`}
                    type="button"
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    className={`w-full text-left px-3 py-2 transition-colors duration-150 ${
                      option.disabled
                        ? "text-gray-400 bg-gray-50 cursor-not-allowed"
                        : "hover:bg-blue-50 hover:text-blue-900 cursor-pointer"
                    } ${
                      value === option.value
                        ? "bg-blue-100 text-blue-900 font-medium"
                        : ""
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </div>
    );
  }
);

const AddProduct = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    productName: "",
    type: "",
    packing: "",
    qtyPerBoxStrip: "",
    supplierName: "",
    drugLicense: "",
    licenseValidityDate: "",
    remarks: "",
    sellingPrice: "",
    lc: "",
    fob: "",
    taxSellingPrice: "",
  });

  const [errors, setErrors] = useState({});
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // 🔹 Product types
  const typeOptions = useMemo(() => [
    { value: "Tablet", label: "Tablet" },
    { value: "Capsule", label: "Capsule" },
    { value: "Syrup", label: "Syrup" },
    { value: "Injection", label: "Injection" },
    { value: "Cream", label: "Cream" },
    { value: "Ointment", label: "Ointment" },
    { value: "Drops", label: "Drops" },
  ], []);

  // 🔹 Fetch supplier list for dropdown
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoadingSuppliers(true);
      const res = await axios.get(`${backendUrl}/api/suppliers`);
      const suppliers = res.data?.data || res.data;
      if (Array.isArray(suppliers)) {
        setSupplierOptions(
          suppliers.map((s) => ({ value: s.name, label: s.name }))
        );
      }
    } catch (error) {
      console.error(error);
      showToast("error", "Failed to load suppliers");
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // 🔹 Validation
  const validate = () => {
    const newErrors = {};
    if (!form.productName.trim()) newErrors.productName = "Product name is required";
    if (!form.type) newErrors.type = "Type is required";
    if (!form.packing.trim()) newErrors.packing = "Packing is required";
    if (!form.supplierName) newErrors.supplierName = "Supplier name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 🔹 Handle text input (allow only numbers where needed)
  const handleChange = (e) => {
    const { name, value } = e.target;

    const numericFields = [
      "sellingPrice",
      "lc",
      "fob",
      "taxSellingPrice",
      "qtyPerBoxStrip",
    ];

    if (numericFields.includes(name)) {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setForm((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }

    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  // 🔹 Submit form
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/product/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          sellingPrice: Number(form.sellingPrice) || 0,
          lc: Number(form.lc) || 0,
          fob: Number(form.fob) || 0,
          taxSellingPrice: Number(form.taxSellingPrice) || 0,
          qtyPerBoxStrip: Number(form.qtyPerBoxStrip) || 0,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to add product");

      showToast("success", data.message || "Product added successfully");
      navigate("/productmanagerlayout/product");
    } catch (error) {
      showToast("error", error.message || "Network error");
    }
  };

  // 🔹 Simple input field renderer
  const renderInput = (label, name, type = "text", placeholder = "", required = false) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={form[name]}
        onChange={handleChange}
        placeholder={placeholder}
        className={`w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          errors[name] ? "border-red-500" : "border-gray-300"
        }`}
        autoComplete="off"
      />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Product</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {renderInput("Product Name", "productName", "text", "", true)}

          {/* 🔹 Type Dropdown */}
          <SearchableDropdown
            label="Type"
            value={form.type}
            onChange={(val) => setForm((prev) => ({ ...prev, type: val }))}
            options={typeOptions}
            placeholder="Select Type"
            required
            error={errors.type}
          />

          {renderInput("Packing", "packing", "text", "", true)}
          {renderInput("Quantity per Box/Strip", "qtyPerBoxStrip", "text", "Enter number")}

          {/* 🔹 Supplier Dropdown */}
          <SearchableDropdown
            label="Supplier Name"
            value={form.supplierName}
            onChange={(val) => setForm((prev) => ({ ...prev, supplierName: val }))}
            options={supplierOptions}
            loading={loadingSuppliers}
            placeholder="Select Supplier"
            required
            error={errors.supplierName}
          />

          {renderInput("Drug License", "drugLicense", "text")}
          {renderInput("License Validity Date", "licenseValidityDate", "date")}
          {renderInput("Selling Price (USD)", "sellingPrice", "text", "Enter number")}
          {renderInput("LC (USD)", "lc", "text", "Enter number")}
          {renderInput("FOB (USD)", "fob", "text", "Enter number")}
          {renderInput("Tax Selling Price (USD)", "taxSellingPrice", "text", "Enter number")}
          {renderInput("Remarks", "remarks", "text")}
        </div>

        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow transition duration-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/productmanagerlayout/product")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddProduct;