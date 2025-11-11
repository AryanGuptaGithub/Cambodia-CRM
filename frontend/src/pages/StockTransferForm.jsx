import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast.jsx";
import CustomDropdown from "./Utility/customDropdown.jsx";
import axios from "axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_PRODUCT_ITEM = {
  id: null,
  productId: "",
  productName: "",
  boxQuantity: "",
  expenses: "",
};

const INITIAL_FORM_STATE = {
  invoiceNumber: "",
  transferDate: "",
  product: "",
  remarks: "",
  orderStatus: "",
  shipping: "",
  transferType: "send",
  destination: "", // New field for Send
  source: "", // New field for Receive
  items: [],
};

// Transfer type options
const TRANSFER_TYPE_OPTIONS = [
  { value: "send", label: "Send" },
  { value: "receive", label: "Receive" },
];

// Custom hook for form state management
const useStockTransferForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const parseNumber = useCallback((val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const validate = useCallback((products = []) => {
    const newErrors = {};

    if (!form.transferDate)
      newErrors.transferDate = "Transfer date is required";
    if (!form.orderStatus) newErrors.orderStatus = "Order status is required";
    if (!form.transferType)
      newErrors.transferType = "Transfer type is required";

    // Conditional validation for destination/source
    if (form.transferType === "send" && !form.destination) {
      newErrors.destination = "Destination is required for Send transfers";
    }
    if (form.transferType === "receive" && !form.source) {
      newErrors.source = "Source is required for Receive transfers";
    }

    if (items.length === 0)
      newErrors.items = "At least one product item is required";

    items.forEach((item, index) => {
      if (!item.productId) {
        newErrors[`product_${index}`] = `Product for item ${
          index + 1
        } is required`;
      }
      
      const boxQuantity = parseNumber(item.boxQuantity);
      if (!item.boxQuantity || boxQuantity < 0) {
        newErrors[`boxQuantity_${index}`] = `Box quantity for item ${
          index + 1
        } must be non-negative`;
      }

      // Stock validation - ONLY for send transfers
      if (form.transferType === "send" && item.productId && item.boxQuantity) {
        const product = products.find(p => p._id === item.productId);
        if (product && product.inStock) {
          const availableStock = product.inStock.boxes;
          if (boxQuantity > availableStock) {
            newErrors[`boxQuantity_${index}`] = `Box quantity cannot exceed available stock (${availableStock} boxes)`;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, items, parseNumber]);

  const addItem = useCallback((newItem) => {
    setItems((prev) => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback(
    (id, field, value) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updatedItem = {
              ...item,
              [field]: ["boxQuantity", "expenses"].includes(field)
                ? parseNumber(value) || 0
                : value,
            };

            return updatedItem;
          }
          return item;
        })
      );
    },
    [parseNumber]
  );

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

  const handleNumberChange = useCallback(
    (name, value) => {
      const numericValue = value.toString().replace(/[^0-9.]/g, "");
      updateFormField(name, numericValue);
    },
    [updateFormField]
  );

  const handleSelectChange = useCallback(
    (name, value) => {
      updateFormField(name, value);
    },
    [updateFormField]
  );

  const generateStockTransferNumber = useCallback(async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfers/last-number`
      );

      if (response.data.success) {
        const lastNumber = response.data.lastNumber || 0;
        const nextNumber = lastNumber + 1;

        // Format the number, e.g., ST-0002
        const formattedNumber = `ST-${String(nextNumber).padStart(4, "0")}`;

        return formattedNumber;
      } else {
        console.error("Failed to fetch last number");
        return null;
      }
    } catch (error) {
      console.error("Error generating stock transfer number:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    const setStockTransferNumber = async () => {
      const generatedNumber = await generateStockTransferNumber();
      updateFormField("invoiceNumber", generatedNumber);
    };
    setStockTransferNumber();
  }, [generateStockTransferNumber, updateFormField]);

  // Calculate totals - Expenses are NOT multiplied with quantity
  const calculateTotals = useCallback(() => {
    const totalExpenses = items.reduce(
      (sum, item) => sum + parseNumber(item.expenses),
      0
    );
    const shipping = parseNumber(form.shipping);
    const grandTotal = totalExpenses + shipping;

    return {
      totalExpenses,
      shipping,
      grandTotal,
    };
  }, [items, form.shipping, parseNumber]);

  return {
    form,
    errors,
    items,
    isLoading,
    setIsLoading,
    handleChange,
    handleNumberChange,
    handleSelectChange,
    validate,
    addItem,
    removeItem,
    updateItem,
    calculateTotals,
    setErrors,
  };
};

// Reusable Components
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
        readOnly={readOnly}
        disabled={disabled}
        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${
          readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""
        } ${className}`}
        autoComplete="off"
        {...props}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

const SelectField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    options,
    error,
    placeholder = "",
    required = false,
    disabled = false,
    className = "",
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""} ${className}`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

const TextAreaField = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    error,
    placeholder = "",
    rows = 3,
    disabled = false,
    className = "",
  }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""} ${className}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

// Custom hook to fetch products with stock data
const useProductsWithStock = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProductsEmpty, setIsProductsEmpty] = useState(false);

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const backendUrl = import.meta.env.VITE_BACKEND_URL;
      const response = await axios.get(`${backendUrl}/api/products-with-in-stock`);
      const productsData = response.data || [];
      setProducts(productsData);
      
      // Check if products are empty
      if (productsData.length === 0) {
        setIsProductsEmpty(true);
      } else {
        setIsProductsEmpty(false);
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setIsProductsEmpty(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return { products, loading, isProductsEmpty, refetch: fetchProducts };
};

const StockTransferForm = () => {
  const navigate = useNavigate();
  const [orderStatuses, setOrderStatuses] = useState([]);

  const {
    form,
    errors,
    items,
    isLoading,
    setIsLoading,
    handleChange,
    handleNumberChange,
    handleSelectChange,
    validate,
    addItem,
    removeItem,
    updateItem,
    calculateTotals,
  } = useStockTransferForm();

  const { products, loading, isProductsEmpty } = useProductsWithStock();
  const { totalExpenses, shipping, grandTotal } = calculateTotals();

  // Check if form should be disabled
  const isFormDisabled = isProductsEmpty;

  // Memoized options with stock information
  const productOptions = useMemo(() => {
    if (isProductsEmpty) {
      return [
        {
          value: "",
          label: "No Products Available",
          disabled: true,
        },
      ];
    }

    if (!products || products.length === 0) {
      return [{ value: "", label: "Loading products..." }];
    }

    return [
      { value: "", label: "Select Product" },
      ...products.map((product) => {
        const stockInfo = product.inStock;
        // Only show stock info in dropdown for send transfers
        const stockLabel = form.transferType === "send" && stockInfo
          ? `${product.productName}`
          : product.productName;

        return {
          value: product._id,
          label: stockLabel,
          product: product, // Include full product data for stock info
        };
      }),
    ];
  }, [products, form.transferType, isProductsEmpty]);

  const orderStatusOptions = useMemo(
    () => [
      ...orderStatuses.map((status) => ({
        value: status.code,
        label: status.name,
      })),
    ],
    [orderStatuses]
  );

  // Helper function to get product details including stock
  const getProductDetails = (productId) => {
    return products.find((p) => p._id === productId);
  };

  // API calls
  const fetchOrderStatuses = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/order-statuses`);
      setOrderStatuses(response.data);
    } catch (err) {
      console.error("Error fetching order statuses:", err);
      showToast("error", "Failed to fetch order statuses");
    }
  }, []);

  useEffect(() => {
    fetchOrderStatuses();
  }, [fetchOrderStatuses]);

  const handleFormChange = useCallback(
    (field, value) => {
      if (isProductsEmpty) {
        showToast("error", "Cannot modify form. No products available.");
        return;
      }
      handleSelectChange(field, value);
    },
    [handleSelectChange, isProductsEmpty]
  );

  const handleAddItem = useCallback(() => {
    if (isProductsEmpty) {
      showToast("error", "Cannot add items. No products available.");
      return;
    }

    if (!form.product) {
      showToast("error", "Please select a product first");
      return;
    }

    const selectedProduct = getProductDetails(form.product);
    if (!selectedProduct) {
      showToast("error", "Selected product not found");
      return;
    }

    const newItem = {
      ...INITIAL_PRODUCT_ITEM,
      id: Date.now(),
      productId: form.product,
      productName: selectedProduct.productName,
    };

    addItem(newItem);
    handleFormChange("product", "");
  }, [form.product, products, addItem, handleFormChange, isProductsEmpty]);

  const handleItemChange = useCallback(
    (id, field, value) => {
      if (isProductsEmpty) {
        showToast("error", "Cannot modify items. No products available.");
        return;
      }

      if (field === "boxQuantity" && form.transferType === "send") {
        const item = items.find(item => item.id === id);
        if (item && item.productId) {
          const product = getProductDetails(item.productId);
          if (product && product.inStock) {
            const availableStock = product.inStock.boxes;
            const requestedQuantity = parseFloat(value);
            
            if (requestedQuantity > availableStock) {
              showToast("error", `Cannot exceed available stock (${availableStock} boxes)`);
              // You can choose to either block the input or allow it but show error
              // For now, we'll allow the input but validation will catch it on submit
            }
          }
        }
      }
      
      updateItem(id, field, value);
    },
    [updateItem, items, products, form.transferType, isProductsEmpty]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (isProductsEmpty) {
      showToast("error", "Cannot create stock transfer. No products available.");
      return;
    }

    // Pass products to validate for stock validation
    if (!validate(products)) {
      showToast("error", "Please fix the form errors before submitting");
      return;
    }

    setIsLoading(true);

    const payload = {
      invoiceNo: form.invoiceNumber,
      date: form.transferDate,
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        boxQuantity: parseFloat(item.boxQuantity || 0),
        expenses: parseFloat(item.expenses || 0),
      })),
      remarks: form.remarks || "",
      status: form.orderStatus,
      transferType: form.transferType,
      shipping: parseFloat(form.shipping || 0),
      totalExpenses: parseFloat(totalExpenses || 0),
      grandTotal: parseFloat(grandTotal || 0),
      destination: form.destination || "", // Include destination in payload
      source: form.source || "", // Include source in payload
    };

    try {
      const response = await axios.post(
        `${backendUrl}/api/stock-transfers`,
        payload
      );

      if (response.data.success) {
        showToast(
          "success",
          response.data.message || "Stock transfer created successfully"
        );
        navigate("/stocktransfer");
      } else {
        throw new Error(
          response.data.message || "Failed to create stock transfer"
        );
      }
    } catch (error) {
      console.error("Error creating stock transfer:", error);

      // Handle different error types
      let errorMessage = error.message;
      if (error.response) {
        // Server responded with error status
        errorMessage =
          error.response.data.message ||
          error.response.data.error ||
          error.message;
      } else if (error.request) {
        // Request was made but no response received
        errorMessage = "Network error: Unable to connect to server";
      }

      showToast("error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const isCurrentProductValid = useMemo(
    () =>
      !isProductsEmpty &&
      form.product &&
      form.product.trim() !== "" &&
      form.shipping &&
      form.shipping.trim() !== "" &&
      form.transferDate &&
      form.transferDate.trim() !== "" &&
      form.orderStatus &&
      form.orderStatus.trim() !== "" &&
      form.transferType &&
      form.transferType.trim() !== "" &&
      // Additional validation for destination/source
      ((form.transferType === "send" &&
        form.destination &&
        form.destination.trim() !== "") ||
        (form.transferType === "receive" &&
          form.source &&
          form.source.trim() !== "")),
    [
      form.product,
      form.shipping,
      form.transferDate,
      form.orderStatus,
      form.transferType,
      form.destination,
      form.source,
      isProductsEmpty,
    ]
  );

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Create Stock Transfer
        </h2>
      </div>

      {/* Warning message if products are empty */}
      {isProductsEmpty && (
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
                No Products Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one product before creating stock transfers. 
                  Add products in the product management section first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Form Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <InputField
            label="Stock Transfer No"
            name="invoiceNumber"
            value={form.invoiceNumber}
            onChange={handleChange}
            placeholder="Auto-generated"
            readOnly
            disabled={isFormDisabled}
          />
          <SelectField
            label="Order Status"
            name="orderStatus"
            value={form.orderStatus}
            onChange={(e) => handleSelectChange("orderStatus", e.target.value)}
            options={orderStatusOptions}
            error={errors.orderStatus}
            placeholder="Select Order Status"
            required
            disabled={isFormDisabled}
          />
          <InputField
            label="Transfer Date"
            name="transferDate"
            type="date"
            value={form.transferDate}
            onChange={handleChange}
            error={errors.transferDate}
            required
            disabled={isFormDisabled}
          />
          <SelectField
            label="Transfer Type"
            name="transferType"
            value={form.transferType}
            onChange={(e) => handleSelectChange("transferType", e.target.value)}
            options={TRANSFER_TYPE_OPTIONS}
            error={errors.transferType}
            placeholder="Select Transfer Type"
            required
            disabled={isFormDisabled}
          />

          {/* Conditional Destination/Source Field */}
          {form.transferType === "send" && (
            <InputField
              label="Destination"
              name="destination"
              value={form.destination}
              onChange={handleChange}
              error={errors.destination}
              placeholder="Enter destination"
              required
              disabled={isFormDisabled}
            />
          )}

          {form.transferType === "receive" && (
            <InputField
              label="Source"
              name="source"
              value={form.source}
              onChange={handleChange}
              error={errors.source}
              placeholder="Enter source"
              required
              disabled={isFormDisabled}
            />
          )}

          <InputField
            label="Shipping ($)"
            name="shipping"
            value={form.shipping}
            onChange={(e) => handleNumberChange("shipping", e.target.value)}
            placeholder="Enter Shipping"
            type="text"
            disabled={isFormDisabled}
          />
        </div>

        {/* Product Selection */}
        <div className="mb-6 p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Add Products</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product <span className="text-red-500">*</span>
              </label>
              {loading ? (
                <div className="border rounded-lg px-3 py-2 bg-gray-100 text-gray-500">
                  Loading products...
                </div>
              ) : (
                <CustomDropdown
                  value={form.product}
                  onChange={(value) => handleFormChange("product", value)}
                  placeholder={isProductsEmpty ? "No Products Available" : "Select Product"}
                  options={productOptions}
                  required
                  disabled={isFormDisabled}
                />
              )}
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={!isCurrentProductValid || isFormDisabled}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isCurrentProductValid && !isFormDisabled
                  ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                  : "bg-gray-400 text-gray-200 cursor-not-allowed"
              }`}
            >
              Add Product
            </button>
          </div>
          {errors.items && (
            <p className="text-red-500 text-sm mt-2">{errors.items}</p>
          )}
        </div>

        {items.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Product Items</h3>
            <div className="space-y-4">
              {items.map((item, index) => {
                const product = getProductDetails(item.productId);
                const stockInfo = product?.inStock;
                
                return (
                  <div key={item.id} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-4">
                        <h4 className="text-md font-semibold text-gray-800">
                          {item.productName}
                        </h4>
                        {/* Stock information display - ONLY for send transfers */}
                        {form.transferType === "send" && stockInfo && (
                          <span
                            className={`text-sm px-2 py-1 rounded ${
                              stockInfo.status === "Out of Stock"
                                ? "bg-red-100 text-red-800 border border-red-300"
                                : stockInfo.status === "Low Stock" ||
                                  stockInfo.status === "Critical"
                                ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                                : "bg-green-100 text-green-800 border border-green-300"
                            }`}
                          >
                            Available: {stockInfo.boxes} boxes
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        disabled={isFormDisabled}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          isFormDisabled
                            ? "bg-gray-400 text-white opacity-50 cursor-not-allowed"
                            : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                        }`}
                      >
                        Remove
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                          Box Quantity <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={item.boxQuantity}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "boxQuantity",
                              e.target.value
                            )
                          }
                          disabled={isFormDisabled}
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            errors[`boxQuantity_${index}`] ? "border-red-500" : "border-gray-300"
                          } ${isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
                          placeholder="Enter box quantity"
                          max={form.transferType === "send" ? stockInfo?.boxes : undefined} // Only set max for send transfers
                        />
                        {errors[`boxQuantity_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors[`boxQuantity_${index}`]}
                          </p>
                        )}
                        {/* Show maximum allowed ONLY for send transfers */}
                        {form.transferType === "send" && stockInfo && (
                          <p className="text-xs text-gray-500 mt-1">
                            Maximum allowed: {stockInfo.boxes} boxes
                          </p>
                        )}
                      </div>
                      
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                          Expenses ($)
                        </label>
                        <input
                          type="text"
                          value={item.expenses}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "expenses",
                              e.target.value
                            )
                          }
                          disabled={isFormDisabled}
                          className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
                          }`}
                          placeholder="Enter expenses"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Remarks Field - Full Width */}
        <div className="mb-6">
          <TextAreaField
            label="Remarks"
            name="remarks"
            value={form.remarks}
            onChange={handleChange}
            placeholder="Enter remarks or additional information"
            rows={4}
            disabled={isFormDisabled}
            className="w-full"
          />
        </div>

        {/* Summary Section */}
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h3 className="text-lg font-semibold mb-4">Financial Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <strong>Total Expenses:</strong>
              <div className="text-green-600 font-semibold">
                ${totalExpenses.toFixed(2)}
              </div>
            </div>
            <div>
              <strong>Shipping:</strong>
              <div className="text-blue-600 font-semibold">
                ${shipping.toFixed(2)}
              </div>
            </div>
            <div>
              <strong>Grand Total:</strong>
              <div className="text-purple-600 font-bold text-lg">
                ${grandTotal.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate("/stocktransfer")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading || isFormDisabled}
            className={`px-6 py-2 rounded-lg transition-colors ${
              isLoading || isFormDisabled
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
            }`}
          >
            {isLoading ? "Saving..." : "Save Transfer"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StockTransferForm;