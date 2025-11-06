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
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { Eye, EyeOff } from "lucide-react";

// Import reusable API functions
import {
  fetchProducts as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../../pages/ProductManager/common/fetchDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_FORM_STATE = {
  // Common to all products
  invoiceNumber: "",
  deliveryNumber: "",
  supplierId: "",
  supplierName: "",
  invoiceDate: "",
  receivedDate: "",
  remarks: "",

  // Product array for multiple products
  products: [
    {
      productId: "",
      productName: "",
      qtyBox: "",
      lcNumber: "",
      cif: "",
      fob: "",
      amount: "",
      expiredDate: "",
    },
  ],
};

// Define numeric fields for proper handling
const NUMERIC_FIELDS = [];
const PRODUCT_NUMERIC_FIELDS = ["qtyBox", "lcNumber", "cif", "fob", "amount"];

// Custom hook for form state management
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

  const parseNumber = useCallback((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }, []);

  // Calculate amount for each product when lcNumber, fob, or qtyBox changes
  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((product) => {
        const lcValue = parseNumber(product.lcNumber);
        const fobValue = parseNumber(product.fob);
        const qtyBoxValue = parseNumber(product.qtyBox);

        // Use FOB for amount calculation if available, otherwise use LC
        const baseValue = lcValue;
        const amount = baseValue * qtyBoxValue;
        const roundedAmount = Math.round(amount * 100) / 100;

        return {
          ...product,
          amount: roundedAmount,
        };
      }),
    }));
  }, [
    form.products.map((p) => p.lcNumber + p.fob + p.qtyBox).join(","),
    parseNumber,
  ]);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const updateProductField = useCallback((productIndex, field, value) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex ? { ...product, [field]: value } : product
      ),
    }));
  }, []);

  // Toggle product view - only one product can be expanded at a time
  const toggleProductView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  // Check if a product is expanded
  const isProductExpanded = useCallback(
    (index) => {
      return expandedProductIndex === index;
    },
    [expandedProductIndex]
  );

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      let processedValue = value;

      // Handle numeric fields - keep as strings for text fields
      if (NUMERIC_FIELDS.includes(name)) {
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          processedValue = value;
        } else {
          return;
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

  const handleProductChange = useCallback(
    (productIndex, e) => {
      const { name, value } = e.target;

      let processedValue = value;

      // Handle numeric fields for products
      if (PRODUCT_NUMERIC_FIELDS.includes(name)) {
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          processedValue = value;
        } else {
          return;
        }
      }

      updateProductField(productIndex, name, processedValue);

      // Clear error when user starts typing
      const errorKey = `${name}_${productIndex}`;
      if (errors[errorKey]) {
        setErrors((prev) => ({ ...prev, [errorKey]: "" }));
      }
    },
    [errors, updateProductField]
  );

  const handleDateChange = useCallback((name, date) => {
    setForm((prev) => ({
      ...prev,
      [name]: date ? new Date(date).toISOString() : "",
    }));
  }, []);

  const handleProductDateChange = useCallback(
    (productIndex, name, date) => {
      updateProductField(
        productIndex,
        name,
        date ? new Date(date).toISOString() : ""
      );
    },
    [updateProductField]
  );

  // Handle product selection from dropdown - UPDATED to handle FOB like LC
  const handleProductSelection = useCallback(
    (productIndex, productId) => {
      const selectedProduct = products.find(
        (product) => product.value === productId
      );
      if (selectedProduct) {
        console.log("value  of selectedProduct", selectedProduct);
        setForm((prev) => ({
          ...prev,
          products: prev.products.map((product, index) =>
            index === productIndex
              ? {
                  ...product,
                  productId: selectedProduct.value,
                  productName: selectedProduct.label,
                  lcNumber: selectedProduct.lc || selectedProduct.lcNumber || 0,
                  fob: selectedProduct.fob || 0,
                  cif: selectedProduct.cif || 0,
                }
              : product
          ),
        }));
      }
    },
    [products]
  );

  // Handle FOB update separately - NEW FUNCTION
  const handleFobUpdate = useCallback((productIndex, fobValue) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map((product, index) =>
        index === productIndex
          ? {
              ...product,
              fob: fobValue,
            }
          : product
      ),
    }));
  }, []);

  // FIXED: Handle supplier selection - ensure we get both ID and name
  const handleSupplierChange = useCallback(
    (supplierId) => {
      const selectedSupplier = suppliers.find(
        (supplier) => supplier.value === supplierId
      );
      if (selectedSupplier) {
        setForm((prev) => ({
          ...prev,
          supplierId: selectedSupplier.value, // This should be the ID
          supplierName: selectedSupplier.label, // This should be the name
        }));
      }
    },
    [suppliers]
  );

  // Check if current product is valid for adding new product
  const isCurrentProductValid = useCallback(
    (productIndex) => {
      const product = form.products[productIndex];
      return (
        product.productId &&
        product.qtyBox > 0 &&
        (product.lcNumber || product.fob) && // Updated to accept either LC or FOB
        product.expiredDate
      );
    },
    [form.products]
  );

  const addProduct = useCallback(() => {
    const currentIndex = form.products.length - 1;
    if (!isCurrentProductValid(currentIndex)) {
      showToast(
        "error",
        "Please fill all required fields for the current product before adding a new one"
      );
      return;
    }

    setForm((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          productId: "",
          productName: "",
          qtyBox: 0,
          lcNumber: "",
          cif: 0,
          fob: 0,
          amount: 0,
          expiredDate: "",
        },
      ],
    }));

    // Expand the new product and collapse others
    setExpandedProductIndex(form.products.length);
  }, [form.products, isCurrentProductValid]);

  // Remove product
  const removeProduct = useCallback(
    (productIndex) => {
      if (form.products.length > 1) {
        const removedProduct = form.products[productIndex];

        setForm((prev) => ({
          ...prev,
          products: prev.products.filter((_, index) => index !== productIndex),
        }));

        // Adjust expanded index after removal
        setExpandedProductIndex((prevIndex) => {
          if (prevIndex === productIndex) {
            return 0;
          } else if (prevIndex > productIndex) {
            return prevIndex - 1;
          }
          return prevIndex;
        });
      }
    },
    [form.products.length]
  );

  const validate = useCallback(() => {
    const newErrors = {};

    // Validate common fields
    const invoiceNumberStr = String(form.invoiceNumber || "");
    const deliveryNumberStr = String(form.deliveryNumber || "");

    if (!invoiceNumberStr.trim())
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.supplierId)
      newErrors.supplierId = "Supplier selection is required";
    if (!deliveryNumberStr.trim())
      newErrors.deliveryNumber = "Delivery number is required";

    // Validate dates are not in future
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

    // Validate products - UPDATED to require either LC or FOB
    form.products.forEach((product, index) => {
      if (!product.productId)
        newErrors[`productId_${index}`] = "Product selection is required";

      const qtyBoxNum = parseNumber(product.qtyBox);
      const fobNum = parseNumber(product.fob);
      const cifNum = parseNumber(product.cif);
      const lcNumberStr = String(product.lcNumber || "");

      if (qtyBoxNum <= 0)
        newErrors[`qtyBox_${index}`] = "Box quantity must be greater than 0";
      if (fobNum < 0) newErrors[`fob_${index}`] = "FOB cannot be negative";
      if (cifNum < 0) newErrors[`cif_${index}`] = "CIF cannot be negative";

      // Updated: Require either LC or FOB, not necessarily both
      if (!lcNumberStr.trim() && fobNum <= 0)
        newErrors[`lcNumber_${index}`] = "Either LC or FOB is required";

      if (!product.expiredDate)
        newErrors[`expiredDate_${index}`] = "Expired date is required";
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, parseNumber]);

  // Fetch products - UPDATED to include FOB data
  const fetchProducts = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, products: true }));
      const result = await fetchProductsAPI();

      if (result.success) {
        // Transform product data to ensure proper format with FOB
        const transformedProducts = result.data.map((product) => ({
          value: product._id || product.id,
          label: product.productName || product.name,
          lc: product.lc || product.lcNumber || 0,
          fob: product.fob || 0, // Ensure FOB is included
          cif: product.cif || 0,
        }));
        setProducts(transformedProducts);
      } else {
        showToast("error", result.error || "Failed to fetch products");
        setProducts([]);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setProducts([]);
    } finally {
      setLoading((prev) => ({ ...prev, products: false }));
    }
  }, []);

  // Fetch suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, suppliers: true }));
      const result = await fetchSuppliersAPI();
      console.log("values of result", result);
      if (result.success) {
        const transformedSuppliers = result.data.map((supplier) => ({
          value: supplier.id,
          label: supplier.name || supplier.supplierName,
        }));
        setSuppliers(transformedSuppliers);
      } else {
        showToast("error", result.error || "Failed to fetch suppliers");
        setSuppliers([]);
      }
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
      setSuppliers([]);
    } finally {
      setLoading((prev) => ({ ...prev, suppliers: false }));
    }
  }, []);

  return {
    form,
    errors,
    products,
    suppliers,
    loading,
    handleChange,
    handleProductChange,
    validate,
    updateFormField,
    updateProductField,
    handleDateChange,
    handleProductDateChange,
    handleProductSelection,
    handleSupplierChange,
    handleFobUpdate, // NEW: Export the FOB update handler
    addProduct,
    removeProduct,
    toggleProductView,
    isProductExpanded,
    isCurrentProductValid,
    fetchProducts,
    fetchSuppliers,
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
        className={`w-full border px-3 py-2 rounded-lg ${className} ${
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

// DatePicker Field Component with future dates disabled
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
          maxDate={maxDate || today}
          className={`w-full border px-3 py-2 rounded-lg ${
            error ? "border-red-500" : "border-gray-300"
          } ${readOnly ? "bg-gray-100" : ""} ${className}`}
          autoComplete="off"
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

// Product DatePicker Field Component (for expired date - can be future)
const ProductDatePickerField = React.memo(
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
        className={`w-full border px-3 py-2 rounded-lg ${
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
    readOnly = false,
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
          className={`w-full border px-3 py-2 rounded-lg ${className} ${
            error ? "border-red-500" : "border-gray-300"
          } ${readOnly ? "bg-gray-100" : ""}`}
          autoComplete="off"
          inputMode={allowDecimal ? "decimal" : "numeric"}
        />
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

const AddNewPurchase = () => {
  const navigate = useNavigate();
  const {
    form,
    errors,
    products,
    suppliers,
    loading,
    handleChange,
    handleProductChange,
    validate,
    handleDateChange,
    handleProductDateChange,
    handleProductSelection,
    handleSupplierChange,
    handleFobUpdate, // NEW: Get the FOB update handler
    addProduct,
    removeProduct,
    toggleProductView,
    isProductExpanded,
    isCurrentProductValid,
    fetchProducts,
    fetchSuppliers,
  } = usePurchaseForm();

  // Memoized product options for dropdown
  const productOptions = useMemo(() => {
    return [{ value: "", label: "Select Product" }, ...products];
  }, [products]);

  // Memoized supplier options for dropdown
  const supplierOptions = useMemo(() => {
    return [{ value: "", label: "Select Supplier" }, ...suppliers];
  }, [suppliers]);

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
  }, [fetchProducts, fetchSuppliers]);

  // Numeric input handler for common fields
  const handleNumericInputChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      if (NUMERIC_FIELDS.includes(name)) {
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          handleChange(e);
        }
      } else {
        handleChange(e);
      }
    },
    [handleChange]
  );

  // Numeric input handler for product fields - UPDATED to handle FOB specifically
  const handleProductNumericInputChange = useCallback(
    (productIndex, e) => {
      const { name, value } = e.target;

      if (PRODUCT_NUMERIC_FIELDS.includes(name)) {
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          // If it's FOB field, use the specific handler
          if (name === "fob") {
            handleFobUpdate(productIndex, value);
          } else {
            handleProductChange(productIndex, e);
          }
        }
      } else {
        handleProductChange(productIndex, e);
      }
    },
    [handleProductChange, handleFobUpdate]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      // Prepare data for submission
      const submissionData = {
        // Common fields
        invoiceNumber: form.invoiceNumber,
        deliveryNumber: form.deliveryNumber,
        supplierId: form.supplierId,
        supplierName: form.supplierName,
        invoiceDate: form.invoiceDate,
        receivedDate: form.receivedDate,
        remarks: form.remarks,

        // Products array
        products: form.products.map((product) => ({
          productId: product.productId,
          productName: product.productName,
          qtyBox: parseFloat(product.qtyBox) || 0,
          lc: product.lcNumber,
          cif: parseFloat(product.cif) || 0,
          fob: parseFloat(product.fob) || 0,
          amount: parseFloat(product.amount) || 0,
          expiredDate: product.expiredDate,
        })),
      };

      console.log("Submitting purchase data:", submissionData);

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

  // Check if form is valid for submission - UPDATED for FOB
  const isFormValid = useMemo(() => {
    const invoiceNumberStr = String(form.invoiceNumber || "");
    const deliveryNumberStr = String(form.deliveryNumber || "");

    // Check common fields
    const commonFieldsValid =
      invoiceNumberStr.trim() &&
      form.supplierId &&
      deliveryNumberStr.trim() &&
      form.invoiceDate &&
      form.receivedDate;

    // Check all products - UPDATED to require either LC or FOB
    const productsValid = form.products.every((product) => {
      const qtyBoxNum = parseFloat(product.qtyBox) || 0;
      const fobNum = parseFloat(product.fob) || 0;
      const cifNum = parseFloat(product.cif) || 0;
      const lcNumberStr = String(product.lcNumber || "");

      return (
        product.productId &&
        qtyBoxNum > 0 &&
        fobNum >= 0 &&
        cifNum >= 0 &&
        (lcNumberStr.trim() || fobNum > 0) && // Either LC or FOB is required
        product.expiredDate
      );
    });

    return commonFieldsValid && productsValid;
  }, [form]);

  // Check if "Add Product" button should be enabled for current product
  const isAddProductEnabled = useMemo(() => {
    const currentProductIndex = form.products.length - 1;
    return isCurrentProductValid(currentProductIndex);
  }, [form.products, isCurrentProductValid]);

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Purchase
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Common Fields Section */}
        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Common Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InputField
              label="Invoice Number"
              name="invoiceNumber"
              value={form.invoiceNumber}
              onChange={handleChange}
              error={errors.invoiceNumber}
              placeholder="INV-001-A"
              required
            />

            <InputField
              label="Delivery Number"
              name="deliveryNumber"
              value={form.deliveryNumber}
              onChange={handleChange}
              error={errors.deliveryNumber}
              placeholder="DEL-001-A"
              required
            />

            {/* Supplier dropdown */}
            <SearchableDropdown
              label="Supplier"
              value={form.supplierId}
              onChange={handleSupplierChange}
              options={supplierOptions}
              placeholder="Select Supplier"
              required={true}
              error={errors.supplierId}
              loading={loading.suppliers}
            />

            <DatePickerField
              label="Invoice Date"
              name="invoiceDate"
              value={form.invoiceDate}
              onChange={handleDateChange}
              error={errors.invoiceDate}
              required
              maxDate={new Date()}
            />

            <DatePickerField
              label="Received Date"
              name="receivedDate"
              value={form.receivedDate}
              onChange={handleDateChange}
              error={errors.receivedDate}
              required
              maxDate={new Date()}
            />
          </div>
        </div>

        {/* Products Section */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-700">
              Product Information
            </h3>
            <button
              type="button"
              onClick={addProduct}
              disabled={!isAddProductEnabled}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                isAddProductEnabled
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
              }`}
            >
              + Add Product
            </button>
          </div>

          {form.products.map((product, productIndex) => (
            <div
              key={productIndex}
              className="mb-4 border border-gray-200 rounded-lg"
            >
              {/* Product Header - Always Visible */}
              <div className="p-4 bg-gray-50 rounded-t-lg">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <h4 className="text-md font-medium text-gray-700">
                      {product.productName || `Product ${productIndex + 1}`}
                    </h4>
                    {!product.productName && (
                      <span className="text-xs text-red-500">
                        (Product not selected)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleProductView(productIndex)}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                    >
                      {isProductExpanded(productIndex) ? (
                        <>
                          <EyeOff size={16} />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye size={16} />
                          View
                        </>
                      )}
                    </button>
                    {form.products.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeProduct(productIndex)}
                        className="text-red-600 hover:text-red-800 text-sm ml-2"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Details - Expandable */}
              {isProductExpanded(productIndex) && (
                <div className="p-6 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <SearchableDropdown
                      label="Product"
                      value={product.productId}
                      onChange={(productId) =>
                        handleProductSelection(productIndex, productId)
                      }
                      options={productOptions}
                      placeholder="Select Product"
                      required={true}
                      error={errors[`productId_${productIndex}`]}
                      loading={loading.products}
                    />

                    <NumericInputField
                      label="Box Quantity"
                      name="qtyBox"
                      value={product.qtyBox}
                      onChange={(e) =>
                        handleProductNumericInputChange(productIndex, e)
                      }
                      error={errors[`qtyBox_${productIndex}`]}
                      placeholder="0"
                      required
                      allowDecimal={false}
                    />

                    <NumericInputField
                      label="LC (USD)"
                      name="lcNumber"
                      value={product.lcNumber}
                      onChange={(e) =>
                        handleProductNumericInputChange(productIndex, e)
                      }
                      error={errors[`lcNumber_${productIndex}`]}
                      placeholder="0.00"
                      allowDecimal={true}
                    />

                    <NumericInputField
                      label="FOB (USD)"
                      name="fob"
                      value={product.fob}
                      onChange={(e) =>
                        handleProductNumericInputChange(productIndex, e)
                      }
                      error={errors[`fob_${productIndex}`]}
                      placeholder="0.00"
                      allowDecimal={true}
                    />

                    <NumericInputField
                      label="CIF (USD)"
                      name="cif"
                      value={product.cif}
                      onChange={(e) =>
                        handleProductNumericInputChange(productIndex, e)
                      }
                      error={errors[`cif_${productIndex}`]}
                      placeholder="0.00"
                      allowDecimal={true}
                    />

                    <ProductDatePickerField
                      label="Expired Date"
                      name="expiredDate"
                      value={product.expiredDate}
                      onChange={(name, date) =>
                        handleProductDateChange(productIndex, name, date)
                      }
                      error={errors[`expiredDate_${productIndex}`]}
                      required
                    />

                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Amount (USD)
                      </label>
                      <input
                        type="text"
                        name="amount"
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
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Remarks Section */}
        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">Remarks</h3>
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
        <div className="flex justify-end gap-4">
          <button
            type="submit"
            disabled={!isFormValid}
            className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
              isFormValid
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
