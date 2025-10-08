import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";
import CustomDropdown from "../Utility/customDropdown.jsx";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_FORM_STATE = {
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiredDate: "",
  productId: "", // Changed from productName to productId
  productName: "", // Keep for display
  qtyBox: 0,
  qtyPerCarton: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  remarks: "",
  amount: 0,
};

// Define numeric fields for proper handling
const NUMERIC_FIELDS = ["qtyBox", "qtyPerCarton", "fob", "cif", "amount"];

// Custom hook for form state management
const usePurchaseForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [products, setProducts] = useState([]);

  const parseNumber = useCallback((val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  // Calculate amount when lcNumber or qtyBox changes
  useEffect(() => {
    const lcValue = parseNumber(form.lcNumber);
    const qtyBoxValue = parseNumber(form.qtyBox);
    const qtyPerCarton = parseNumber(form.qtyPerCarton);
    const amount = lcValue * qtyBoxValue * qtyPerCarton;

    // Round to 2 decimal places
    const roundedAmount = Math.round(amount * 100) / 100;

    setForm((prev) => ({
      ...prev,
      amount: roundedAmount,
    }));
  }, [form.lcNumber, form.qtyBox, parseNumber]);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      let processedValue = value;

      // Handle numeric fields
      if (NUMERIC_FIELDS.includes(name)) {
        // Allow empty, numbers, and decimal point with proper format
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          // Keep as string during input, convert to number when complete
          if (value === "" || value === "-") {
            processedValue = value;
          } else if (!value.endsWith(".")) {
            const numValue = parseFloat(value);
            processedValue = isNaN(numValue) ? 0 : numValue;
          }
          // If value ends with ".", keep it as string to allow decimal input
        } else {
          return; // Invalid input, don't update
        }
      }

      setForm((prev) => ({
        ...prev,
        [name]: processedValue,
      }));

      // Clear error when user starts typing
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [errors]
  );

  const handleDateChange = useCallback((name, date) => {
    setForm((prev) => ({
      ...prev,
      [name]: date ? new Date(date).toISOString() : "",
    }));
  }, []);

  // Handle product selection from dropdown
  const handleProductChange = useCallback(
    (productId) => {
      const selectedProduct = products.find(
        (product) => product._id === productId
      );
      if (selectedProduct) {
        setForm((prev) => ({
          ...prev,
          productId: selectedProduct._id,
          productName: selectedProduct.productName,
          qtyPerCarton: selectedProduct.qtyPerCarton || 0,
          // You can also set other product-related fields if needed
        }));
      }
    },
    [products]
  );

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.invoiceNumber?.trim())
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.productId) newErrors.productId = "Product selection is required";
    if (!form.deliveryNumber?.trim())
      newErrors.deliveryNumber = "Delivery number is required";
    if (!form.invoiceDate) newErrors.invoiceDate = "Invoice date is required";
    if (!form.receivedDate)
      newErrors.receivedDate = "Received date is required";
    if (form.qtyBox <= 0)
      newErrors.qtyBox = "Box quantity must be greater than 0";
    if (form.qtyPerCarton <= 0)
      newErrors.qtyPerCarton = "Quantity per carton must be greater than 0";
    if (form.fob < 0) newErrors.fob = "FOB cannot be negative";
    if (form.cif < 0) newErrors.cif = "CIF cannot be negative";
    if (!form.lcNumber?.trim()) newErrors.lcNumber = "LC number is required";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products`);
      setProducts(response.data);
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
    }
  }, []);

  return {
    form,
    errors,
    products,
    handleChange,
    validate,
    updateFormField,
    handleDateChange,
    handleProductChange,
    fetchProducts,
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
        className={`w-full border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-100" : ""}`}
        autoComplete="off"
        tabIndex={readOnly ? -1 : 0}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

// DatePicker Field Component
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
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <DatePicker
        selected={value ? new Date(value) : null}
        onChange={(date) => onChange(name, date)}
        dateFormat="yyyy-MM-dd"
        placeholderText={placeholder}
        readOnly={readOnly}
        className={`w-full border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-100" : ""} ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

// Numeric Input Component
const NumericInputField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    placeholder = "",
    required = false,
    className = "",
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type="text"
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

const AddNewPurchase = () => {
  const navigate = useNavigate();
  const {
    form,
    errors,
    products,
    handleChange,
    validate,
    updateFormField,
    handleDateChange,
    handleProductChange,
    fetchProducts,
  } = usePurchaseForm();

  // Memoized product options for dropdown
  const productOptions = useMemo(() => {
    return [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: product.productName,
      })),
    ];
  }, [products]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleNumericInputChange = useCallback(
    (e) => {
      const value = e.target.value;
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        handleChange(e);
      }
    },
    [handleChange]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      // Prepare the data for submission
      const submissionData = {
        ...form,
        productName:
          products.find((p) => p._id === form.productId)?.productName || "",
      };

      const response = await fetch(`${backendUrl}/api/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Error adding purchase");
        return;
      }

      showToast("success", data.message || "Purchase added successfully");
      navigate("/purchaselayout/purchase");
    } catch (err) {
      showToast("error", err.message || "Network error");
    }
  };

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    return (
      form.invoiceNumber?.trim() &&
      form.productId && // Check for productId instead of productName
      form.deliveryNumber?.trim() &&
      form.invoiceDate &&
      form.receivedDate &&
      form.qtyBox > 0 &&
      form.qtyPerCarton > 0 &&
      form.fob >= 0 &&
      form.cif >= 0 &&
      form.lcNumber?.trim()
    );
  }, [form]);

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Purchase
      </h2>

      <form onSubmit={handleSubmit}>
        {/* First Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <InputField
            label="Invoice Number"
            name="invoiceNumber"
            value={form.invoiceNumber}
            onChange={handleChange}
            error={errors.invoiceNumber}
            placeholder="INV-001"
            required
          />
          <InputField
            label="Delivery Number"
            name="deliveryNumber"
            value={form.deliveryNumber}
            onChange={handleChange}
            error={errors.deliveryNumber}
            placeholder="DEL-001"
            required
          />

          {/* Product Dropdown - Replacing the manual product name input */}
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Product <span className="text-red-500">*</span>
            </label>
            <CustomDropdown
              value={form.productId}
              onChange={handleProductChange}
              placeholder="Select Product"
              options={productOptions}
              required
            />
            {errors.productId && (
              <p className="text-red-500 text-xs mt-0.5">{errors.productId}</p>
            )}
          </div>
        </div>

        {/* Second Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <NumericInputField
            label="Box Quantity"
            name="qtyBox"
            value={form.qtyBox}
            onChange={handleNumericInputChange}
            error={errors.qtyBox}
            placeholder="0"
            required
          />
          <NumericInputField
            label="Quantity Per Carton"
            name="qtyPerCarton"
            value={form.qtyPerCarton}
            onChange={handleNumericInputChange}
            error={errors.qtyPerCarton}
            placeholder="0"
            required
            disabled
          />
          <InputField
            label="LC"
            name="lcNumber"
            value={form.lcNumber}
            onChange={handleChange}
            error={errors.lcNumber}
            placeholder="LC-001"
            required
          />
        </div>

        {/* Third Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <NumericInputField
            label="FOB (USD)"
            name="fob"
            value={form.fob}
            onChange={handleNumericInputChange}
            error={errors.fob}
            placeholder="0.00"
          />
          <NumericInputField
            label="CIF (USD)"
            name="cif"
            value={form.cif}
            onChange={handleNumericInputChange}
            error={errors.cif}
            placeholder="0.00"
          />
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Amount (USD)
            </label>
            <input
              type="text"
              name="amount"
              value={form.amount ? parseFloat(form.amount).toFixed(2) : "0.00"}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100"
              readOnly
            />
            <p className="text-xs text-gray-500 mt-1">
              Calculated: LC Number × Box Quantity
            </p>
          </div>
        </div>

        {/* Dates Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <DatePickerField
            label="Invoice Date"
            name="invoiceDate"
            value={form.invoiceDate}
            onChange={handleDateChange}
            error={errors.invoiceDate}
            required
          />
          <DatePickerField
            label="Received Date"
            name="receivedDate"
            value={form.receivedDate}
            onChange={handleDateChange}
            error={errors.receivedDate}
            required
          />
          <DatePickerField
            label="Expired Date"
            name="expiredDate"
            value={form.expiredDate}
            onChange={handleDateChange}
            error={errors.expiredDate}
          />
        </div>

        {/* Remarks - Full width */}
        <div className="mt-6">
          <label className="text-sm font-medium text-gray-700 mb-1">
            Remarks
          </label>
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder="Additional notes or comments"
            rows={3}
            className="w-full border border-gray-300 rounded-md px-3 py-2 mt-1"
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            disabled={!isFormValid}
            className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
              isFormValid
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            Submit
          </button>
          <button
            type="button"
            onClick={() => navigate("/purchaselayout/purchase")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddNewPurchase;
