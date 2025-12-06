import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { Eye, EyeOff, PlusSquare, MinusSquare } from "lucide-react";
import { handleNumericInputChange } from "../../utils/inputValidators.jsx";

// Import reusable API functions
import {
  fetchProducts as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../../pages/ProductManager/common/fetchDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

/* ────────────────────── Initial States ────────────────────── */
const INITIAL_PRODUCT_STATE = {
  productId: "",
  productName: "",
  qtyBox: "",
  lcNumber: "",
  cif: "",
  fob: "",
  amount: "",
  expiredDate: "",
  remainingStock: 0,
  type: "", // Added type field
  sellingPrice: "", // ADDED: sellingPrice field
};

const INITIAL_FORM_STATE = {
  invoiceNumber: "",
  deliveryNumber: "",
  supplierId: "",
  supplierName: "",
  invoiceDate: "",
  receivedDate: "",
  remarks: "",
  products: [{ ...INITIAL_PRODUCT_STATE }],
};

/* ────────────────────── Utility ────────────────────── */
const parseNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

/* ────────────────────── Form Hook ────────────────────── */
const usePurchaseForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expandedProductIndex, setExpandedProductIndex] = useState(0);
  const [loading, setLoading] = useState({
    products: false,
    suppliers: false,
  });
  const [isSuppliersEmpty, setIsSuppliersEmpty] = useState(false);
  const [isProductsEmpty, setIsProductsEmpty] = useState(false);

  /* ───── Form Field Updates ───── */
  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const updateProduct = useCallback((index, field, value) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((product, i) =>
        i === index ? { ...product, [field]: value } : product
      ),
    }));
  }, []);

  /* ───── Product View Management ───── */
  const toggleProductView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  const isProductExpanded = useCallback(
    (index) => {
      return expandedProductIndex === index;
    },
    [expandedProductIndex]
  );

  /* ───── Add/Remove Products ───── */
  const addProduct = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, { ...INITIAL_PRODUCT_STATE }],
    }));
    setExpandedProductIndex(form.products.length);
  }, [form.products.length]);

  const removeProduct = useCallback(
    (index) => {
      if (form.products.length > 1) {
        setForm((prev) => ({
          ...prev,
          products: prev.products.filter((_, i) => i !== index),
        }));
        setExpandedProductIndex((prevIndex) => {
          if (prevIndex === index) return 0;
          else if (prevIndex > index) return prevIndex - 1;
          return prevIndex;
        });
      }
    },
    [form.products.length]
  );

  /* ───── Field Validation ───── */
  const areCommonFieldsFilled = useCallback((formData) => {
    const required = [
      "invoiceNumber",
      "deliveryNumber",
      "supplierId",
      "invoiceDate",
      "receivedDate",
    ];
    return required.every(
      (field) => formData[field] && formData[field].toString().trim()
    );
  }, []);

  const isProductValid = useCallback((product) => {
    return (
      product.productId &&
      parseNumber(product.qtyBox) > 0 &&
      product.expiredDate
    );
  }, []);

  const isProductFilled = useCallback((product) => {
    return product.productId && product.productName.trim() !== "";
  }, []);

  const hasAtLeastOneProduct = useCallback((products) => {
    return products.some(
      (product) => product.productId && product.productName.trim() !== ""
    );
  }, []);

  /* ───── Amount Calculation ───── */
  const calculateProductAmount = useCallback((product) => {
    const lcValue = parseNumber(product.lcNumber);
    const fobValue = parseNumber(product.fob);
    const qtyBoxValue = parseNumber(product.qtyBox);

    const baseValue = lcValue;
    const amount = baseValue * qtyBoxValue;
    return Math.round(amount * 100) / 100;
  }, []);

  /* ───── Change Handlers ───── */
  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

  const handleProductChange = useCallback(
    (index, field, value) => {
      updateProduct(index, field, value);
    },
    [updateProduct]
  );

  const handleDateChange = useCallback(
    (name, date) => {
      updateFormField(name, date ? new Date(date).toISOString() : "");
    },
    [updateFormField]
  );

  const handleProductDateChange = useCallback(
    (index, name, date) => {
      updateProduct(index, name, date ? new Date(date).toISOString() : "");
    },
    [updateProduct]
  );

  /* ───── Dropdown Handlers ───── */
  const handleProductSelection = useCallback(
    (index, productId) => {
      const selectedProduct = products.find(
        (product) => product.value === productId
      );
      if (selectedProduct) {
        setForm((prev) => ({
          ...prev,
          products: prev.products.map((product, i) =>
            i === index
              ? {
                  ...product,
                  productId: selectedProduct.value,
                  productName: selectedProduct.label,
                  lcNumber: selectedProduct.lc || selectedProduct.lcNumber || 0,
                  fob: selectedProduct.fob || 0,
                  cif: selectedProduct.cif || 0,
                  type: selectedProduct.type || "Tablet",
                  remainingStock: selectedProduct.remainingStock || 0,
                  sellingPrice: selectedProduct.sellingPrice || 0, // ADDED: Set sellingPrice from selected product
                  qtyBox: product.qtyBox,
                  expiredDate: product.expiredDate,
                  amount: product.amount,
                }
              : product
          ),
        }));
      }
    },
    [products]
  );

  const handleSupplierChange = useCallback(
    (supplierId) => {
      const selectedSupplier = suppliers.find(
        (supplier) => supplier.value === supplierId
      );
      if (selectedSupplier) {
        updateFormField("supplierId", selectedSupplier.value);
        updateFormField("supplierName", selectedSupplier.label);
      }
    },
    [suppliers, updateFormField]
  );

  const handleFobUpdate = useCallback(
    (index, fobValue) => {
      updateProduct(index, "fob", fobValue);
    },
    [updateProduct]
  );

  /* ───── Validation ───── */
  const validate = useCallback(() => {
    const newErrors = {};

    // Common fields validation
    if (!form.invoiceNumber?.trim())
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.supplierId)
      newErrors.supplierId = "Supplier selection is required";
    if (!form.deliveryNumber?.trim())
      newErrors.deliveryNumber = "Delivery number is required";

    // Date validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!form.invoiceDate) {
      newErrors.invoiceDate = "Invoice date is required";
    } else if (new Date(form.invoiceDate) > today) {
      newErrors.invoiceDate = "Invoice date cannot be in the future";
    }

    if (!form.receivedDate) {
      newErrors.receivedDate = "Received date is required";
    } else if (new Date(form.receivedDate) > today) {
      newErrors.receivedDate = "Received date cannot be in the future";
    }

    // Products validation
    form.products.forEach((product, index) => {
      if (product.productId) {
        if (!product.productId)
          newErrors[`productId_${index}`] = "Product selection is required";

        const qtyBoxNum = parseNumber(product.qtyBox);
        const fobNum = parseNumber(product.fob);
        const cifNum = parseNumber(product.cif);
        const lcNumberStr = String(product.lcNumber || "");

        if (qtyBoxNum <= 0)
          newErrors[`qtyBox_${index}`] = "Box quantity must be greater than 0";
        if (qtyBoxNum > 100000)
          newErrors[`qtyBox_${index}`] =
            "Box quantity seems too large, please verify";
        if (fobNum < 0) newErrors[`fob_${index}`] = "FOB cannot be negative";
        if (cifNum < 0) newErrors[`cif_${index}`] = "CIF cannot be negative";

        if (!lcNumberStr.trim() && fobNum <= 0) {
          newErrors[`lcNumber_${index}`] = "Either LC or FOB is required";
        }

        if (!product.expiredDate)
          newErrors[`expiredDate_${index}`] = "Expired date is required";
      }
    });

    // Check if at least one product is filled
    if (!hasAtLeastOneProduct(form.products)) {
      newErrors.products = "At least one product is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, hasAtLeastOneProduct]);

  /* ───── Data Fetching ───── */
  const fetchProducts = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, products: true }));
      const result = await fetchProductsAPI();

      if (result.success) {
        const transformedProducts = result.data.map((product) => {
          let totalBoxes = 0;
          if (product.batches && Array.isArray(product.batches)) {
            totalBoxes = product.batches.reduce(
              (sum, batch) => sum + (batch.boxes || 0),
              0
            );
          } else if (product.totalBoxes !== undefined) {
            totalBoxes = product.totalBoxes;
          }

          return {
            value: product._id || product.id,
            label: product.productName || product.name,
            lc: product.lc || product.lcNumber || 0,
            fob: product.fob || 0,
            cif: product.cif || 0,
            type: product.type || "Tablet", // Added type field
            remainingStock: totalBoxes,
            sellingPrice: product.sellingPrice || 0, // ADDED: Include sellingPrice
          };
        });

        setProducts(transformedProducts);
        setIsProductsEmpty(transformedProducts.length === 0);
      } else {
        showToast("error", result.error || "Failed to fetch products");
        setProducts([]);
        setIsProductsEmpty(true);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setProducts([]);
      setIsProductsEmpty(true);
    } finally {
      setLoading((prev) => ({ ...prev, products: false }));
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, suppliers: true }));
      const result = await fetchSuppliersAPI();

      if (result.success) {
        const transformedSuppliers = result.data.map((supplier) => ({
          value: supplier.id,
          label: supplier.name || supplier.supplierName,
        }));
        setSuppliers(transformedSuppliers);
        setIsSuppliersEmpty(transformedSuppliers.length === 0);
      } else {
        showToast("error", result.error || "Failed to fetch suppliers");
        setSuppliers([]);
        setIsSuppliersEmpty(true);
      }
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
      setSuppliers([]);
      setIsSuppliersEmpty(true);
    } finally {
      setLoading((prev) => ({ ...prev, suppliers: false }));
    }
  }, []);

  /* ───── Stock Calculation ───── */
  const calculateFutureStock = useCallback((currentStock, purchaseQty) => {
    const current = parseNumber(currentStock);
    const purchase = parseNumber(purchaseQty);
    return current + purchase;
  }, []);

  // Auto-calculate amount when relevant fields change for each product
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((product) => ({
        ...product,
        amount: calculateProductAmount(product),
      })),
    }));
  }, [
    form.products.map((p) => `${p.lcNumber}-${p.fob}-${p.qtyBox}`).join(),
    calculateProductAmount,
  ]);

  return {
    form,
    errors,
    products,
    suppliers,
    loading,
    isSuppliersEmpty,
    isProductsEmpty,
    expandedProductIndex,
    handleChange,
    handleProductChange,
    validate,
    updateFormField,
    updateProduct,
    handleDateChange,
    handleProductDateChange,
    handleProductSelection,
    handleSupplierChange,
    handleFobUpdate,
    toggleProductView,
    isProductExpanded,
    isProductValid,
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    addProduct,
    removeProduct,
    setErrors,
    calculateFutureStock,
    fetchProducts,
    fetchSuppliers,
  };
};

/* ────────────────────── Reusable UI Components ────────────────────── */
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
    disabled = false,
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
        disabled={disabled}
        className={`w-full border px-3 py-2 rounded-lg ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
        autoComplete="off"
        tabIndex={readOnly || disabled ? -1 : 0}
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

const DatePickerField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    required = false,
    readOnly = false,
    disabled = false,
    placeholder = "Select a date",
    className = "",
    maxDate = null,
  }) => {
    const today = new Date();

    return (
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
          disabled={disabled}
          maxDate={maxDate || today}
          className={`w-full border px-3 py-2 rounded-lg ${
            error ? "border-red-500" : "border-gray-300"
          } ${
            readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""
          } ${className}`}
          autoComplete="off"
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

const ProductDatePickerField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    required = false,
    readOnly = false,
    disabled = false,
    placeholder = "Select a date",
    className = "",
    showYearDropdown = true,
    showMonthDropdown = true,
  }) => {
    const today = new Date();
    const maxYearDate = new Date(2040, 11, 31);

    return (
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
          disabled={disabled}
          className={`w-full border px-3 py-2 rounded-lg ${
            error ? "border-red-500" : "border-gray-300"
          } ${
            readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""
          } ${className}`}
          showYearDropdown={showYearDropdown}
          showMonthDropdown={showMonthDropdown}
          dropdownMode="select"
          minDate={today}
          maxDate={maxYearDate}
          filterDate={(date) => date >= today && date <= maxYearDate}
          yearDropdownItemNumber={2040 - today.getFullYear() + 1}
        />

        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

const NumericInputField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    placeholder = "",
    required = false,
    readOnly = false,
    disabled = false,
    className = "",
    allowDecimal = true,
  }) => {
    const handleNumericChange = (e) => {
      const { value } = e.target;
      const regex = allowDecimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

      if (value === "" || regex.test(value)) {
        onChange(e);
      }
    };

    return (
      <div className="flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          type="text"
          name={name}
          value={value}
          onChange={handleNumericChange}
          placeholder={placeholder}
          readOnly={readOnly}
          disabled={disabled}
          className={`w-full border px-3 py-2 rounded-lg ${className} ${
            error ? "border-red-500" : "border-gray-300"
          } ${readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
          autoComplete="off"
          inputMode={allowDecimal ? "decimal" : "numeric"}
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

/* ────────────────────── MAIN COMPONENT ────────────────────── */
const AddNewPurchase = () => {
  const navigate = useNavigate();
  const {
    form,
    errors,
    products,
    suppliers,
    loading,
    isSuppliersEmpty,
    isProductsEmpty,
    expandedProductIndex,
    handleChange,
    handleProductChange,
    validate,
    handleDateChange,
    handleProductDateChange,
    handleProductSelection,
    handleSupplierChange,
    handleFobUpdate,
    toggleProductView,
    isProductExpanded,
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    addProduct,
    removeProduct,
    calculateFutureStock,
    fetchProducts,
    fetchSuppliers,
  } = usePurchaseForm();

  /* ───── Memoized Options ───── */
  const productOptions = useMemo(() => {
    if (isProductsEmpty) {
      return [{ value: "", label: "No Products Available", disabled: true }];
    }
    return [{ value: "", label: "Select Product" }, ...products];
  }, [products, isProductsEmpty]);

  const supplierOptions = useMemo(() => {
    if (isSuppliersEmpty) {
      return [{ value: "", label: "No Suppliers Available", disabled: true }];
    }
    return [{ value: "", label: "Select Supplier" }, ...suppliers];
  }, [suppliers, isSuppliersEmpty]);

  /* ───── Effects ───── */
  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, [fetchProducts, fetchSuppliers]);

  /* ───── Enhanced Handlers ───── */
  const enhancedHandleChange = useCallback(
    (e) => handleChange(e),
    [handleChange]
  );

  const enhancedProductChange = useCallback(
    (index, field, value) => {
      if (field === "fob") {
        handleFobUpdate(index, value);
      } else {
        handleProductChange(index, field, value);
      }
    },
    [handleProductChange, handleFobUpdate]
  );

  /* ───── Submit Handler ───── */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isSuppliersEmpty || isProductsEmpty) {
      showToast(
        "error",
        "Cannot add purchase. No suppliers or products available."
      );
      return;
    }

    if (!validate()) return;

    try {
      const submissionData = {
        invoiceNumber: form.invoiceNumber,
        deliveryNumber: form.deliveryNumber,
        supplierId: form.supplierId,
        supplierName: form.supplierName,
        invoiceDate: form.invoiceDate,
        receivedDate: form.receivedDate,
        remarks: form.remarks,
        products: form.products
          .filter((product) => product.productId) // Only include products with productId
          .map((product) => ({
            productId: product.productId,
            productName: product.productName,
            qtyBox: parseFloat(product.qtyBox) || 0,
            lc: product.lcNumber, // Note: Changed from lcNumber to lc to match backend
            cif: parseFloat(product.cif) || 0,
            fob: parseFloat(product.fob) || 0,
            amount: parseFloat(product.amount) || 0,
            expiredDate: product.expiredDate,
            type: product.type || "Tablet", // Added type field with default
            sellingPrice: parseFloat(product.sellingPrice) || 0, // ADDED: sellingPrice to backend
          })),
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

  /* ───── Validation States ───── */
  const isFormDisabled = isSuppliersEmpty || isProductsEmpty;

  const isFormValid = useMemo(() => {
    if (isFormDisabled) return false;
    return areCommonFieldsFilled(form) && hasAtLeastOneProduct(form.products);
  }, [form, isFormDisabled, areCommonFieldsFilled, hasAtLeastOneProduct]);

  // Check if current product is valid for enabling "Add Product" button
  const isCurrentProductValid = useCallback(() => {
    if (isFormDisabled) return false;

    const currentProduct = form.products[form.products.length - 1];
    return isProductFilled(currentProduct);
  }, [form.products, isFormDisabled, isProductFilled]);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Add New Purchase</h2>
        <button
          type="button"
          disabled={!isCurrentProductValid() || isFormDisabled}
          onClick={addProduct}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isCurrentProductValid() && !isFormDisabled
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          <PlusSquare className="w-5 h-5" />
          Add Product
        </button>
      </div>

      {/* Warning message if suppliers or products are empty */}
      {(isSuppliersEmpty || isProductsEmpty) && (
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
                Missing Required Data
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  {isSuppliersEmpty && isProductsEmpty
                    ? "No suppliers and products found. Please add at least one supplier and one product first."
                    : isSuppliersEmpty
                    ? "No suppliers found. Please add at least one supplier first."
                    : "No products found. Please add at least one product first."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Common Fields Section */}
        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Common Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <InputField
              label="Invoice Number"
              name="invoiceNumber"
              value={form.invoiceNumber}
              onChange={enhancedHandleChange}
              error={errors.invoiceNumber}
              placeholder="INV-001-A"
              required
              disabled={isFormDisabled}
            />

            <InputField
              label="Delivery Number"
              name="deliveryNumber"
              value={form.deliveryNumber}
              onChange={enhancedHandleChange}
              error={errors.deliveryNumber}
              placeholder="DEL-001-A"
              required
              disabled={isFormDisabled}
            />

            <SearchableDropdown
              label="Supplier"
              value={form.supplierId}
              onChange={handleSupplierChange}
              options={supplierOptions}
              placeholder={
                isSuppliersEmpty ? "No Suppliers Available" : "Select Supplier"
              }
              required={true}
              error={errors.supplierId}
              loading={loading.suppliers}
              disabled={isSuppliersEmpty}
            />

            <DatePickerField
              label="Invoice Date"
              name="invoiceDate"
              value={form.invoiceDate}
              onChange={handleDateChange}
              error={errors.invoiceDate}
              required
              maxDate={new Date()}
              disabled={isFormDisabled}
            />

            <DatePickerField
              label="Received Date"
              name="receivedDate"
              value={form.receivedDate}
              onChange={handleDateChange}
              error={errors.receivedDate}
              required
              maxDate={new Date()}
              disabled={isFormDisabled}
            />
          </div>
        </div>

        {/* Products Section */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Products Information
          </h3>

          {form.products.map((product, index) => {
            const currentStock = product.remainingStock || 0;
            const purchaseQty = parseNumber(product.qtyBox) || 0;
            const futureStock = calculateFutureStock(currentStock, purchaseQty);

            return (
              <div
                key={index}
                className="border border-gray-200 rounded-lg mb-4"
              >
                {/* Product Header */}
                <div className="p-4 bg-gray-50 rounded-t-lg">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <h4 className="text-md font-medium text-gray-700">
                        {product.productName || `Product ${index + 1}`}
                      </h4>
                      {!product.productName && (
                        <span className="text-xs text-red-500">
                          (Product not selected)
                        </span>
                      )}
                      {product.productName && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm px-2 py-1 bg-blue-100 text-blue-800 rounded border border-blue-300">
                            Current: {currentStock} boxes
                          </span>
                          <span className="text-sm px-2 py-1 bg-green-100 text-green-800 rounded border border-green-300">
                            After Purchase: {futureStock} boxes
                          </span>
                          {purchaseQty > 0 && (
                            <span className="text-sm px-2 py-1 bg-purple-100 text-purple-800 rounded border border-purple-300">
                              +{purchaseQty} boxes
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleProductView(index)}
                        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        disabled={isFormDisabled}
                      >
                        {isProductExpanded(index) ? (
                          <>
                            <EyeOff size={16} />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <Eye size={16} />
                            Show Details
                          </>
                        )}
                      </button>
                      {form.products.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProduct(index)}
                          disabled={isFormDisabled}
                          className="text-red-600 hover:text-red-800 p-1"
                        >
                          <MinusSquare size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Product Details */}
                {isProductExpanded(index) && (
                  <div className="p-6 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      <SearchableDropdown
                        label="Product"
                        value={product.productId}
                        onChange={(productId) =>
                          handleProductSelection(index, productId)
                        }
                        options={productOptions}
                        placeholder={
                          isProductsEmpty
                            ? "No Products Available"
                            : "Select Product"
                        }
                        required={true}
                        error={errors[`productId_${index}`]}
                        loading={loading.products}
                        disabled={isProductsEmpty}
                      />
                      <NumericInputField
                        label="Box Quantity"
                        name={`qtyBox_${index}`}
                        value={product.qtyBox}
                        onChange={(e) =>
                          enhancedProductChange(index, "qtyBox", e.target.value)
                        }
                        error={errors[`qtyBox_${index}`]}
                        placeholder="0"
                        required
                        allowDecimal={false}
                        disabled={isFormDisabled}
                      />
                      <NumericInputField
                        label="LC (USD)"
                        name={`lcNumber_${index}`}
                        value={product.lcNumber}
                        onChange={(e) =>
                          enhancedProductChange(
                            index,
                            "lcNumber",
                            e.target.value
                          )
                        }
                        error={errors[`lcNumber_${index}`]}
                        placeholder="0.00"
                        allowDecimal={true}
                        disabled={isFormDisabled}
                      />
                      <NumericInputField
                        label="FOB (USD)"
                        name={`fob_${index}`}
                        value={product.fob}
                        onChange={(e) =>
                          enhancedProductChange(index, "fob", e.target.value)
                        }
                        error={errors[`fob_${index}`]}
                        placeholder="0.00"
                        allowDecimal={true}
                        disabled={isFormDisabled}
                      />
                      <NumericInputField
                        label="CIF (USD)"
                        name={`cif_${index}`}
                        value={product.cif}
                        onChange={(e) =>
                          enhancedProductChange(index, "cif", e.target.value)
                        }
                        error={errors[`cif_${index}`]}
                        placeholder="0.00"
                        allowDecimal={true}
                        disabled={isFormDisabled}
                      />
                      {/* ADDED: Selling Price Field */}
                      <NumericInputField
                        label="Selling Price (USD)"
                        name={`sellingPrice_${index}`}
                        value={product.sellingPrice}
                        onChange={(e) =>
                          enhancedProductChange(
                            index,
                            "sellingPrice",
                            e.target.value
                          )
                        }
                        error={errors[`sellingPrice_${index}`]}
                        placeholder="0.00"
                        allowDecimal={true}
                        disabled={isFormDisabled}
                      />
                      <ProductDatePickerField
                        label="Expired Date"
                        name={`expiredDate_${index}`}
                        value={product.expiredDate}
                        onChange={(name, date) =>
                          handleProductDateChange(index, "expiredDate", date)
                        }
                        error={errors[`expiredDate_${index}`]}
                        required
                        disabled={isFormDisabled}
                        showYearDropdown
                        showMonthDropdown
                      />

                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                          Amount (USD)
                        </label>
                        <input
                          type="text"
                          name={`amount_${index}`}
                          value={
                            product.amount
                              ? parseFloat(product.amount).toFixed(2)
                              : "0.00"
                          }
                          className="w-full border px-3 py-2 rounded-lg bg-gray-100 border-gray-300"
                          readOnly
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Calculated: (FOB or LC) × Box Quantity
                        </p>
                      </div>

                      {/* Display Product Type */}
                      {product.type && (
                        <div className="flex flex-col">
                          <label className="text-sm font-medium text-gray-700 mb-1">
                            Product Type
                          </label>
                          <input
                            type="text"
                            value={product.type}
                            className="w-full border px-3 py-2 rounded-lg bg-gray-100 border-gray-300"
                            readOnly
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {errors.products && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded">
              <p className="text-red-700 text-sm">{errors.products}</p>
            </div>
          )}
        </div>

        {/* Remarks Section */}
        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Remarks</h3>
          <textarea
            name="remarks"
            value={form.remarks}
            onChange={enhancedHandleChange}
            placeholder="Additional notes or comments"
            rows={3}
            disabled={isFormDisabled}
            className={`w-full border border-gray-300 rounded-md px-3 py-2 mt-1 ${
              isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
            }`}
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4">
          <button
            type="submit"
            disabled={!isFormValid || isFormDisabled}
            className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
              isFormValid && !isFormDisabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            Submit Purchase
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
