import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../utils/toast.jsx";
import axios from "axios";
import {
  Package,
  Calendar,
  Hash,
  User,
  Plus,
  Trash2,
  Eye,
  X,
} from "lucide-react";
import SearchableDropdown from "../components/common/SearchableDropdown";
import InputField from "../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Helper function to validate numeric input with consistent decimal handling
const validateNumericInput = (value) => {
  if (value === "" || value === null || value === undefined) return "";

  let stringValue = value.toString();
  let numericValue = stringValue.replace(/[^0-9.-]/g, "");

  const parts = numericValue.split(".");
  if (parts.length > 2) {
    numericValue = parts[0] + "." + parts.slice(1).join("");
  }

  const decimalIndex = numericValue.indexOf(".");
  if (decimalIndex !== -1) {
    const integerPart = numericValue.substring(0, decimalIndex);
    let decimalPart = numericValue.substring(decimalIndex + 1);

    if (decimalPart.length > 2) {
      decimalPart = decimalPart.substring(0, 2);
    }

    const cleanInteger = integerPart.replace(/^0+/, "") || "0";
    numericValue = cleanInteger + "." + decimalPart;

    if (decimalPart === "") {
      numericValue = numericValue.slice(0, -1);
    }
  } else {
    numericValue = numericValue.replace(/^0+/, "") || "0";
  }

  return numericValue;
};

// Helper function to format numbers consistently with 2 decimal places
const formatNumber = (value) => {
  if (value === "" || value === null || value === undefined) return "";

  const num = parseFloat(value);
  if (isNaN(num)) return "";

  return num.toFixed(2);
};

// Helper function to get LC from product (from batches array)
const getProductLc = (product) => {
  if (!product) return 0;
  
  // First check if there are batches with LC
  if (product.batches && Array.isArray(product.batches) && product.batches.length > 0) {
    // Get the first batch with valid LC
    const batchWithLc = product.batches.find(batch => batch.lc && batch.lc > 0);
    if (batchWithLc) return batchWithLc.lc;
    
    // If no batch with LC, check first batch
    if (product.batches[0].lc !== undefined) {
      return product.batches[0].lc || 0;
    }
  }
  
  // Fallback to product-level LC
  return product.lc || 0;
};

// Reusable Multiple Select Dropdown (same as Payroll)
const MultipleSelectDropdown = ({
  value = [],
  onChange,
  options,
  placeholder,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const filtered = options.filter((o) => {
    const isNotSelected = !value.includes(o.value);
    const matchesSearch = o.label.toLowerCase().includes(search.toLowerCase());
    return isNotSelected && matchesSearch;
  });

  const toggle = (val) => {
    if (disabled) return;
    if (!value.includes(val)) {
      onChange([...value, val]);
      setSearch("");
    }
  };

  const removeSelected = (val, e) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== val));
  };

  useEffect(() => {
    const clickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`border rounded-lg px-4 py-2 min-h-[42px] flex flex-wrap gap-2 items-center ${
          disabled
            ? "bg-gray-100 cursor-not-allowed"
            : "cursor-pointer bg-white hover:border-blue-500"
        } border-gray-300 transition`}
      >
        {value.length === 0 ? (
          <span className="text-gray-500">{placeholder}</span>
        ) : (
          value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm flex items-center gap-1"
              >
                {opt?.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeSelected(v, e)}
                    className="ml-1 hover:bg-indigo-200 rounded-full w-4 h-4 flex items-center justify-center"
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border-b sticky top-0 bg-white outline-none"
            onClick={(e) => e.stopPropagation()}
          />
          {filtered.length === 0 ? (
            <div className="p-3 text-gray-500 text-center">
              {search ? "No matching products found" : "All products selected"}
            </div>
          ) : (
            filtered.map((opt) => (
              <div
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={`px-4 py-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-3 ${
                  value.includes(opt.value) ? "bg-indigo-50" : ""
                }`}
              >
                <div className="w-4 h-4 border border-gray-300 rounded flex items-center justify-center">
                  <Plus size={12} className="text-gray-600" />
                </div>
                <span>{opt.label}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// SelectField and TextAreaField Components
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

// Custom hook for general form
const useStockTransferForm = () => {
  const [form, setForm] = useState({
    invoiceNumber: "",
    transferDate: new Date().toISOString().split("T")[0],
    selectedProducts: [],
    remarks: "",
    orderStatus: "",
    shipping: "",
    transferType: "send",
    destination: "",
    source: "",
  });
  const [errors, setErrors] = useState({});
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const parseNumber = useCallback((val) => {
    if (val === "" || val === null || val === undefined) return 0;

    const cleanVal = val.toString().replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleanVal);

    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }, []);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const validate = useCallback(
    (products = []) => {
      const newErrors = {};

      if (!form.transferDate)
        newErrors.transferDate = "Transfer date is required";
      if (!form.orderStatus) newErrors.orderStatus = "Order status is required";
      if (!form.transferType)
        newErrors.transferType = "Transfer type is required";

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
        if (!item.boxQuantity || boxQuantity <= 0) {
          newErrors[`boxQuantity_${index}`] = `Box quantity for item ${
            index + 1
          } must be greater than 0`;
        }

        if (
          form.transferType === "send" &&
          item.productId &&
          item.boxQuantity
        ) {
          const product = products.find((p) => p._id === item.productId);
          if (product) {
            const availableStock = product.totalBoxes || 0;
            if (boxQuantity > availableStock) {
              newErrors[
                `boxQuantity_${index}`
              ] = `Box quantity cannot exceed available stock (${availableStock} boxes)`;
            }
          }
        }
      });

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [form, items, parseNumber]
  );

  const addItem = useCallback((newItem) => {
    setItems((prev) => [...prev, newItem]);
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const updateItem = useCallback(
    (id, field, value, productLc = null) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updatedItem = {
              ...item,
              [field]: ["boxQuantity", "expenses"].includes(field)
                ? parseNumber(value) || 0
                : value,
            };

            if (field === "boxQuantity" && productLc !== null) {
              const boxQty = parseNumber(value) || 0;
              const lc = parseNumber(productLc) || 0;
              updatedItem.expenses = boxQty * lc;
            }

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
      const numericValue = validateNumericInput(value.toString());
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
        `${backendUrl}/api/stock-transfers/next-number`
      );

      if (response.data && response.data.nextNumber) {
        let nextNumber = response.data.nextNumber;
        if (!nextNumber.startsWith("ST-")) {
          const match = nextNumber.match(/\d+/);
          if (match) {
            const num = parseInt(match[0]);
            nextNumber = `ST-${num.toString().padStart(4, "0")}`;
          } else {
            nextNumber = "ST-0001";
          }
        }
        return nextNumber;
      }
      return "ST-0001";
    } catch (error) {
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 1000);
      return `ST-${(timestamp % 10000).toString().padStart(4, "0")}`;
    }
  }, []);

  useEffect(() => {
    const setStockTransferNumber = async () => {
      try {
        const generatedNumber = await generateStockTransferNumber();
        updateFormField("invoiceNumber", generatedNumber);
      } catch (error) {
        const timestamp = Date.now();
        const fallbackNumber = `ST-${(timestamp % 10000)
          .toString()
          .padStart(4, "0")}`;
        updateFormField("invoiceNumber", fallbackNumber);
      }
    };
    setStockTransferNumber();
  }, [generateStockTransferNumber, updateFormField]);

  const calculateTotals = useCallback(() => {
    const totalExpenses = items.reduce(
      (sum, item) => sum + parseNumber(item.expenses || 0),
      0
    );
    const shipping = parseNumber(form.shipping || 0);
    const grandTotal = parseNumber(totalExpenses + shipping);

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
    updateFormField,
  };
};

// General Transfer Form Component
const GeneralTransferForm = ({ navigate, products, productsLoading }) => {
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
    updateFormField,
  } = useStockTransferForm();

  const { totalExpenses, shipping, grandTotal } = calculateTotals();

  const productOptions = useMemo(() => {
    if (!products || !Array.isArray(products)) {
      return [];
    }
    
    const filteredProducts = products.filter((pr) => {
      const hasStock = pr.totalBoxes > 0;
      return hasStock;
    });

    const options = filteredProducts.map((p) => ({
      value: p._id,
      label: p.productName || `Product ${p._id}`,
      lc: getProductLc(p), // Use helper function to get LC from batches
    }));

    return options;
  }, [products]);

  const orderStatusOptions = useMemo(
    () => [
      { value: "", label: "Select Order Status" },
      ...(orderStatuses.map((status) => ({
        value: status.code || status._id,
        label: status.name,
      })) || []),
    ],
    [orderStatuses]
  );

  const getProductDetails = (productId) => {
    return products.find((p) => p._id === productId);
  };

  const getProductOption = (productId) => {
    return productOptions.find((option) => option.value === productId);
  };

  const fetchOrderStatuses = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/order-statuses`);
      setOrderStatuses(response.data || []);
    } catch (err) {
      showToast("error", "Failed to fetch order statuses");
    }
  }, []);

  useEffect(() => {
    fetchOrderStatuses();
  }, [fetchOrderStatuses]);

  const isProductsEmpty = !products || products.length === 0;

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

  const handleAddSelectedProducts = useCallback(() => {
    if (isProductsEmpty) {
      showToast("error", "Cannot add items. No products available.");
      return;
    }

    if (!form.selectedProducts || form.selectedProducts.length === 0) {
      showToast("error", "Please select at least one product");
      return;
    }

    const newItems = form.selectedProducts
      .map((productId) => {
        const selectedProduct = getProductDetails(productId);
        const productOption = getProductOption(productId);
        if (!selectedProduct) {
          return null;
        }

        const existingItem = items.find((item) => item.productId === productId);
        if (existingItem) {
          showToast(
            "info",
            `Product "${selectedProduct.productName}" is already added`
          );
          return null;
        }

        const lc = getProductLc(selectedProduct);

        return {
          id: Date.now() + Math.random(),
          productId: productId,
          productName: selectedProduct.productName,
          boxQuantity: "",
          expenses: 0,
          lc: lc, // Store LC with the item
        };
      })
      .filter((item) => item !== null);

    if (newItems.length === 0) {
      showToast("info", "All selected products are already in the list");
      return;
    }

    newItems.forEach((item) => addItem(item));

    handleFormChange("selectedProducts", []);
  }, [
    form.selectedProducts,
    products,
    items,
    addItem,
    handleFormChange,
    isProductsEmpty,
    productOptions,
  ]);

  const handleItemChange = useCallback(
    (id, field, value) => {
      if (isProductsEmpty) {
        showToast("error", "Cannot modify items. No products available.");
        return;
      }

      if (field === "boxQuantity") {
        const numericValue = validateNumericInput(value);
        const item = items.find((item) => item.id === id);

        if (item && item.productId) {
          const product = getProductDetails(item.productId);

          if (form.transferType === "send" && product) {
            const availableStock = product.totalBoxes || 0;
            const requestedQuantity = parseFloat(numericValue) || 0;

            if (requestedQuantity > availableStock) {
              showToast(
                "error",
                `Cannot exceed available stock (${availableStock} boxes)`
              );
              return;
            }
          }

          // Use the item's stored LC for calculation
          const lc = item.lc || 0;
          updateItem(id, field, numericValue, lc);
        }
      }
    },
    [updateItem, items, products, form.transferType, isProductsEmpty]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isProductsEmpty) {
      showToast(
        "error",
        "Cannot create stock transfer. No products available."
      );
      return;
    }

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
        lc: item.lc || 0, // Include LC in payload
      })),
      remarks: form.remarks || "",
      status: form.orderStatus,
      transferType: form.transferType,
      shipping: parseFloat(form.shipping || 0),
      totalExpenses: parseFloat(totalExpenses || 0),
      grandTotal: parseFloat(grandTotal || 0),
      destination: form.destination || "",
      source: form.source || "",
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
        navigate("/stocktransfer", {
          state: { activeTab: "general" },
        });
      } else {
        throw new Error(
          response.data.message || "Failed to create stock transfer"
        );
      }
    } catch (error) {
      let errorMessage = error.message;
      if (error.response) {
        errorMessage =
          error.response.data.message ||
          error.response.data.error ||
          error.message;
      } else if (error.request) {
        errorMessage = "Network error: Unable to connect to server";
      }

      showToast("error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const TRANSFER_TYPE_OPTIONS = [
    { value: "send", label: "Send" },
    { value: "receive", label: "Receive" },
  ];

  const isFormDisabled = isProductsEmpty || productsLoading || isLoading;

  if (productsLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <span className="ml-3">Loading products...</span>
      </div>
    );
  }

  if (isProductsEmpty) {
    return (
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
                You need to add at least one product before creating stock
                transfers. Add products in the product management section first.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (productOptions.length === 0 && !productsLoading) {
    return (
      <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-yellow-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              No Products with Available Stock
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                All products have 0 stock. You need to add stock to products
                before creating transfers.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
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
          value={form.shipping || ""}
          onChange={(e) => handleNumberChange("shipping", e.target.value)}
          placeholder="0.00"
          type="text"
          disabled={isFormDisabled}
        />
      </div>

      <div className="mb-6 p-4 border border-gray-200 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Add Products</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Products <span className="text-red-500">*</span>
            </label>
            <MultipleSelectDropdown
              value={form.selectedProducts || []}
              onChange={(selectedIds) =>
                handleFormChange("selectedProducts", selectedIds)
              }
              options={productOptions}
              placeholder={
                productOptions.length === 0
                  ? "No products with available stock"
                  : "Search and select products..."
              }
              disabled={isFormDisabled || productOptions.length === 0}
            />
          </div>
          <button
            type="button"
            onClick={handleAddSelectedProducts}
            disabled={
              (form.selectedProducts || []).length === 0 ||
              isFormDisabled ||
              productOptions.length === 0
            }
            className={`px-4 py-2 rounded-lg transition-colors ${
              (form.selectedProducts || []).length > 0 &&
              !isFormDisabled &&
              productOptions.length > 0
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                : "bg-gray-400 text-gray-200 cursor-not-allowed"
            }`}
          >
            Add Selected Products
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
              const availableStock = product?.totalBoxes || 0;
              const lc = item.lc || 0; // Use LC from item (which comes from batches)

          

              return (
                <div
                  key={item.id}
                  className="border border-gray-300 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-4">
                      <h4 className="text-md font-semibold text-gray-800">
                        {item.productName}
                      </h4>
                      {form.transferType === "send" && (
                        <span
                          className={`text-sm px-2 py-1 rounded ${
                            availableStock === 0
                              ? "bg-red-100 text-red-800 border border-red-300"
                              : availableStock <= 10
                              ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                              : "bg-green-100 text-green-800 border border-green-300"
                          }`}
                        >
                          Available: {availableStock} boxes
                        </span>
                      )}
                      {lc > 0 && (
                        <span className="text-sm px-2 py-1 rounded bg-blue-100 text-blue-800 border border-blue-300">
                          Lc: ${lc.toFixed(2)}
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
                        value={item.boxQuantity || ""}
                        onChange={(e) =>
                          handleItemChange(
                            item.id,
                            "boxQuantity",
                            e.target.value
                          )
                        }
                        disabled={isFormDisabled}
                        className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          errors[`boxQuantity_${index}`]
                            ? "border-red-500"
                            : "border-gray-300"
                        } ${
                          isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
                        }`}
                        placeholder="Enter box quantity"
                        onKeyPress={(e) => {
                          const char = String.fromCharCode(e.which);
                          if (!/[\d.]/.test(char)) {
                            e.preventDefault();
                          }
                        }}
                      />
                      {errors[`boxQuantity_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[`boxQuantity_${index}`]}
                        </p>
                      )}
                      {form.transferType === "send" && (
                        <p className="text-xs text-gray-500 mt-1">
                          Maximum allowed: {availableStock} boxes
                        </p>
                      )}
                      {lc > 0 && item.boxQuantity && (
                        <p className="text-xs text-green-600 mt-1">
                          Expenses calculated automatically: {item.boxQuantity}{" "}
                          × ${lc} = ${formatNumber(item.expenses || 0)}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col">
                      <label className="text-sm font-medium text-gray-700 mb-1">
                        Expenses ($){" "}
                        <span className="text-xs text-gray-500">
                          (Auto-calculated)
                        </span>
                      </label>
                      <input
                        type="text"
                        value={formatNumber(item.expenses) || "0.00"}
                        readOnly
                        disabled={true}
                        className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-100 cursor-not-allowed ${
                          errors[`expenses_${index}`]
                            ? "border-red-500"
                            : "border-gray-300"
                        }`}
                        placeholder="0.00"
                      />
                      {errors[`expenses_${index}`] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[`expenses_${index}`]}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        Calculated as: Box Quantity × Lc (${lc.toFixed(2)})
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold mb-4">Financial Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <strong>Total Expenses:</strong>
            <div className="text-green-600 font-semibold">
              ${formatNumber(totalExpenses)}
            </div>
          </div>
          <div>
            <strong>Shipping:</strong>
            <div className="text-blue-600 font-semibold">
              ${formatNumber(shipping)}
            </div>
          </div>
          <div>
            <strong>Grand Total:</strong>
            <div className="text-purple-600 font-bold text-lg">
              ${formatNumber(grandTotal)}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() =>
            navigate("/stocktransfer", {
              state: { activeTab: "general" },
            })
          }
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isLoading || isFormDisabled || productOptions.length === 0}
          className={`px-6 py-2 rounded-lg transition-colors ${
            isLoading || isFormDisabled || productOptions.length === 0
              ? "bg-gray-400 text-gray-200 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
          }`}
        >
          {isLoading ? "Saving..." : "Save Transfer"}
        </button>
      </div>
    </form>
  );
};

// Main Component
const CreateStockTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => {
    if (location.state && location.state.activeTab) {
      return location.state.activeTab;
    }
    return "mr";
  });

  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [showProductModal, setShowProductModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const [mrTransfer, setMrTransfer] = useState({
    transferNo: "",
    date: new Date().toISOString().split("T")[0],
    mrId: "",
    transferType: "send",
    products: [],
    remarks: "",
  });

  useEffect(() => {
    if (location.state && location.state.activeTab) {
      setTimeout(() => {
        window.history.replaceState({}, document.title);
      }, 0);
    }
  }, [location]);

  const fetchMRs = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(`${backendUrl}/api/staffs`);
      const data = response.data || [];

      if (data && data.length > 0) {
        setMrList(data);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
      }
    } catch (err) {
      showToast("error", "Failed to load MR list");
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
      setProductsLoading(true);
      const response = await axios.get(`${backendUrl}/api/dropdown-products`);
      const productsData = response.data?.data || [];

      if (!Array.isArray(productsData)) {
        showToast("error", "Invalid products data format");
        return;
      }

      const uniqueProductsMap = new Map();
      productsData.forEach((product) => {
        if (product && product._id && product.productName) {
          const name = product.productName.trim().toLowerCase();
          if (!uniqueProductsMap.has(name)) {
            uniqueProductsMap.set(name, product);
          }
        }
      });

      const uniqueProducts = Array.from(uniqueProductsMap.values());

      const formattedProducts = uniqueProducts.map((product) => ({
        id: product._id,
        _id: product._id,
        label: product.productName || `Product ${product._id}`,
        type: product.type,
        productName: product.productName,
        supplierName: product.supplierName,
        batches: product.batches || [],
        totalBoxes: product.totalBoxes || 0,
        totalAmount: product.totalAmount || 0,
        status: product.status || "Out of Stock",
        minStockLevel: product.minStockLevel || 0,
        lc: getProductLc(product), // Get LC from batches
        fob: product.fob || 0,
        cif: product.cif || 0,
        sellingPrice: product.sellingPrice,
        stockLastUpdated: product.stockLastUpdated || null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      }));

      setProducts(formattedProducts);
    } catch (error) {
      showToast("error", "Failed to load products");
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const generateTransferNo = useCallback(async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfers-mr/next-number`
      );

      if (response.data && response.data.nextNumber) {
        let nextNumber = response.data.nextNumber;
        if (!nextNumber.startsWith("ST-")) {
          const match = nextNumber.match(/\d+/);
          if (match) {
            const num = parseInt(match[0]);
            nextNumber = `ST-${num.toString().padStart(4, "0")}`;
          } else {
            nextNumber = "ST-0001";
          }
        }
        return nextNumber;
      } else {
        return "ST-0001";
      }
    } catch (error) {
      const timestamp = Date.now();
      const randomNum = Math.floor(Math.random() * 1000);
      return `ST-${(timestamp % 10000).toString().padStart(4, "0")}`;
    }
  }, []);

  useEffect(() => {
    fetchMRs();
    fetchProducts();

    const initTransferNo = async () => {
      const transferNo = await generateTransferNo();
      setMrTransfer((prev) => ({ ...prev, transferNo }));
    };

    initTransferNo();
  }, [fetchMRs, fetchProducts, generateTransferNo]);

  const TRANSFER_TYPE_OPTIONS = [
    { value: "send", label: "Send" },
    { value: "receive", label: "Receive" },
  ];

  const productOptions = useMemo(() => {
    if (!products || !Array.isArray(products)) {
      return [];
    }

    const filteredProducts = products.filter((pr) => {
      const hasStock = pr.totalBoxes > 0;
      return hasStock;
    });

    const options = filteredProducts.map((p) => ({
      value: p._id,
      label: p.productName || `Product ${p._id}`,
      lc: getProductLc(p), // Get LC from batches
    }));

    return options;
  }, [products]);

  const mrOptions = useMemo(() => {
    if (isMrListEmpty) {
      return [
        {
          value: "",
          label: "No MRs Available",
          disabled: true,
        },
      ];
    }

    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
    }));
  }, [mrList, isMrListEmpty]);

  const selectedProductIds = mrTransfer.products.map((p) => p.productId);

  const selectedMr = useMemo(() => {
    if (!mrTransfer.mrId) return null;
    return mrOptions.find((mr) => mr.value === mrTransfer.mrId);
  }, [mrTransfer.mrId, mrOptions]);

  const getTransferButtonText = useMemo(() => {
    if (loading) return "Saving...";
    if (selectedMr) {
      return mrTransfer.transferType === "send"
        ? `Transfer to ${selectedMr.label}`
        : `Receive from ${selectedMr.label}`;
    }
    return mrTransfer.transferType === "send"
      ? "Transfer to MR"
      : "Receive from MR";
  }, [loading, selectedMr, mrTransfer.transferType]);

  const handleProductSelect = (selectedIds) => {
    const updated = selectedIds.map((id) => {
      const existing = mrTransfer.products.find((p) => p.productId === id);
      if (existing) return existing;
      const product = products.find((p) => p._id === id);
      const productOption = productOptions.find((opt) => opt.value === id);
      return {
        productId: id,
        productName: product?.productName || "",
        boxQty: "",
        lc: productOption?.lc || getProductLc(product) || 0, // Store LC from batches
      };
    });
    setMrTransfer((prev) => ({ ...prev, products: updated }));
  };

  const updateProductQty = (productId, field, value) => {
    if (field === "boxQty") {
      const numericValue = validateNumericInput(value);
      setMrTransfer((prev) => ({
        ...prev,
        products: prev.products.map((p) => {
          if (p.productId === productId) {
            const updatedProduct = { ...p, [field]: numericValue };
            // Calculate expenses if LC is available
            if (p.lc && numericValue) {
              const boxQty = parseFloat(numericValue) || 0;
              const lc = parseFloat(p.lc) || 0;
              updatedProduct.expenses = boxQty * lc;
            }
            return updatedProduct;
          }
          return p;
        }),
      }));
    }
  };

  const removeProduct = (productId) => {
    setMrTransfer((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.productId !== productId),
    }));
  };

  const validateMrTransfer = () => {
    const newErrors = {};

    if (!mrTransfer.date) newErrors.date = "Transfer date is required";
    if (!mrTransfer.transferType)
      newErrors.transferType = "Transfer type is required";
    if (!mrTransfer.mrId) newErrors.mrId = "MR Name is required";

    const validProducts = mrTransfer.products.filter(
      (p) => p.boxQty && parseFloat(p.boxQty) > 0
    );
    if (validProducts.length === 0) {
      newErrors.products =
        "At least one product with valid box quantity is required";
    }

    if (mrTransfer.transferType === "send") {
      mrTransfer.products.forEach((prod, index) => {
        const product = products.find((p) => p._id === prod.productId);
        if (product) {
          const availableStock = product.totalBoxes || 0;
          const requestedQuantity = parseFloat(prod.boxQty) || 0;
          if (requestedQuantity > availableStock) {
            newErrors[
              `product_${index}`
            ] = `Box quantity cannot exceed available stock (${availableStock} boxes)`;
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleMrTransferSubmit = async (e) => {
    e.preventDefault();

    if (!validateMrTransfer()) {
      showToast("error", "Please fix the form errors before submitting");
      return;
    }

    const validProducts = mrTransfer.products.filter(
      (p) => p.boxQty && parseFloat(p.boxQty) > 0
    );

    if (!mrTransfer.mrId || validProducts.length === 0) {
      showToast(
        "error",
        "Please select MR and at least one product with valid box quantity"
      );
      return;
    }

    setLoading(true);
    try {
      const selectedMr = mrOptions.find((m) => m.value === mrTransfer.mrId);
      const payload = {
        invoiceNo: mrTransfer.transferNo,
        date: mrTransfer.date,
        transferType: mrTransfer.transferType,
        stockTransferToMr:
          mrTransfer.transferType === "send" ? selectedMr?.label || "" : "",
        stockTransferFromMrToMain:
          mrTransfer.transferType === "receive" ? selectedMr?.label || "" : "",
        items: validProducts.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          boxQuantity: parseFloat(p.boxQty) || 0,
          expenses: parseFloat(p.expenses || 0),
          lc: parseFloat(p.lc || 0),
        })),
        remarks: mrTransfer.remarks || "",
      };

      await axios.post(`${backendUrl}/api/stock-transfers-to-mr`, payload);
      showToast(
        "success",
        `Stock ${
          mrTransfer.transferType === "send"
            ? "transferred to"
            : "received from"
        } MR successfully!`
      );
      navigate("/stocktransfer", {
        state: { activeTab: "mr" },
      });
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to transfer");
    } finally {
      setLoading(false);
    }
  };

  const handleEmployeeChange = (mrId) => {
    setMrTransfer((prev) => ({ ...prev, mrId }));
  };

  const handleTransferTypeChange = (transferType) => {
    setMrTransfer((prev) => ({ ...prev, transferType }));
  };

  const handleModalClose = () => {
    const filteredProducts = mrTransfer.products.filter(
      (p) => p.boxQty && parseFloat(p.boxQty) > 0
    );
    setMrTransfer((prev) => ({ ...prev, products: filteredProducts }));
    setShowProductModal(false);
  };

  const tabs = [
    { id: "mr", label: "MR Transfer", icon: User },
    { id: "general", label: "General Transfer", icon: Package },
  ];

  const renderContent = () => {
    if (activeTab === "mr") {
      if (mrListLoading || productsLoading) {
        return (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-3">Loading data...</span>
          </div>
        );
      }

      return (
        <form onSubmit={handleMrTransferSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="space-y-4">
              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Transfer No
                </label>
                <input
                  type="text"
                  value={mrTransfer.transferNo}
                  readOnly
                  className="border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 cursor-not-allowed"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  Transfer Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={mrTransfer.date}
                  onChange={(e) =>
                    setMrTransfer((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                  required
                  className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.date ? "border-red-500" : "border-gray-300"
                  } ${isMrListEmpty ? "bg-gray-100 cursor-not-allowed" : ""}`}
                />
                {errors.date && (
                  <p className="text-red-500 text-xs mt-1">{errors.date}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <SelectField
                label="Transfer Type"
                name="transferType"
                value={mrTransfer.transferType}
                onChange={(e) => handleTransferTypeChange(e.target.value)}
                options={TRANSFER_TYPE_OPTIONS}
                error={errors.transferType}
                placeholder="Select Transfer Type"
                required
                disabled={isMrListEmpty}
              />

              <div className="flex flex-col">
                <label className="text-sm font-medium text-gray-700 mb-1">
                  MR Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={mrTransfer.mrId}
                  onChange={(e) => handleEmployeeChange(e.target.value)}
                  disabled={isMrListEmpty}
                  className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    errors.mrId ? "border-red-500" : "border-gray-300"
                  } ${isMrListEmpty ? "bg-gray-100 cursor-not-allowed" : ""}`}
                >
                  <option value="">Select MR</option>
                  {mrOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
                {errors.mrId && (
                  <p className="text-red-500 text-xs mt-1">{errors.mrId}</p>
                )}
              </div>
            </div>
          </div>

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
                    No MRs Available
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>
                      You need to add at least one MR before creating stock
                      transfer records.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {productOptions.length === 0 && !productsLoading && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-yellow-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    No Products with Available Stock
                  </h3>
                  <div className="mt-2 text-sm text-yellow-700">
                    <p>
                      All products have 0 stock. You need to add stock to
                      products before creating transfers.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-6 p-4 border border-gray-200 rounded-lg">
            <h3 className="text-lg font-semibold mb-4">Add Products</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Products <span className="text-red-500">*</span>
                </label>
                <MultipleSelectDropdown
                  value={selectedProductIds}
                  onChange={handleProductSelect}
                  options={productOptions}
                  placeholder={
                    productOptions.length === 0
                      ? "No products with available stock"
                      : "Search and select products..."
                  }
                  disabled={isMrListEmpty || productOptions.length === 0}
                />
                {errors.products && (
                  <p className="text-red-500 text-sm mt-2">{errors.products}</p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowProductModal(true)}
                  disabled={
                    mrTransfer.products.length === 0 ||
                    isMrListEmpty ||
                    productOptions.length === 0
                  }
                  className={`flex-1 px-4 py-2 h-[42px] rounded-lg transition-colors flex items-center justify-center gap-2 ${
                    mrTransfer.products.length > 0 &&
                    !isMrListEmpty &&
                    productOptions.length > 0
                      ? "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      : "bg-gray-400 text-gray-200 cursor-not-allowed"
                  }`}
                >
                  <Eye size={16} /> View
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <TextAreaField
              label="Remarks"
              name="remarks"
              value={mrTransfer.remarks}
              onChange={(e) =>
                setMrTransfer((prev) => ({
                  ...prev,
                  remarks: e.target.value,
                }))
              }
              placeholder="Enter any additional remarks or notes"
              rows={3}
              disabled={isMrListEmpty}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() =>
                navigate("/stocktransfer", {
                  state: { activeTab: "mr" },
                })
              }
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !mrTransfer.mrId ||
                mrTransfer.products.length === 0 ||
                isMrListEmpty ||
                productOptions.length === 0
              }
              className={`px-6 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                loading ||
                !mrTransfer.mrId ||
                mrTransfer.products.length === 0 ||
                isMrListEmpty ||
                productOptions.length === 0
                  ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                  : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              <Plus size={16} /> {getTransferButtonText}
            </button>
          </div>
        </form>
      );
    } else {
      return (
        <GeneralTransferForm
          navigate={navigate}
          products={products}
          productsLoading={productsLoading}
        />
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Create Stock Transfer
          </h1>
          <p className="text-gray-600 mt-2">
            Create new stock transfers for inventory management
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200">
            <div className="flex">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-8 py-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                      activeTab === tab.id
                        ? "text-blue-600"
                        : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    <Icon size={18} />
                    {tab.label}
                    {activeTab === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">{renderContent()}</div>
        </div>
      </div>

      {showProductModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Product Transfer Details</h3>
              <button
                onClick={handleModalClose}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X size={28} className="text-gray-500 hover:text-gray-700" />
              </button>
            </div>

            <div className="space-y-6">
              {mrTransfer.products.map((prod, index) => {
                const product = products.find((p) => p._id === prod.productId);
                const availableStock = product?.totalBoxes || 0;

                return (
                  <div
                    key={prod.productId}
                    className="border rounded-xl px-6 py-4 bg-gray-50"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h4 className="text-lg font-semibold text-gray-800">
                          {prod.productName}
                        </h4>
                        {mrTransfer.transferType === "send" && (
                          <p className="text-sm text-gray-600 mt-1">
                            Available: {availableStock} boxes
                          </p>
                        )}
                        {prod.lc > 0 && (
                          <p className="text-sm text-blue-600 mt-1">
                            LC: ${prod.lc.toFixed(2)}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Transfer Boxes <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={prod.boxQty || ""}
                          onChange={(e) => {
                            const value = validateNumericInput(e.target.value);
                            const numericValue = parseFloat(value) || 0;

                            if (
                              mrTransfer.transferType === "send" &&
                              numericValue > availableStock
                            ) {
                              showToast(
                                "error",
                                `Cannot exceed available stock (${availableStock} boxes)`
                              );
                              updateProductQty(
                                prod.productId,
                                "boxQty",
                                availableStock
                              );
                            } else {
                              updateProductQty(prod.productId, "boxQty", value);
                            }
                          }}
                          className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            errors[`product_${index}`]
                              ? "border-red-500"
                              : "border-gray-300"
                          }`}
                          placeholder="Enter box quantity"
                          onKeyPress={(e) => {
                            const char = String.fromCharCode(e.which);
                            if (!/[\d.]/.test(char)) {
                              e.preventDefault();
                            }
                          }}
                        />
                        {errors[`product_${index}`] && (
                          <p className="text-red-500 text-xs mt-1">
                            {errors[`product_${index}`]}
                          </p>
                        )}
                        {mrTransfer.transferType === "send" && prod.boxQty && (
                          <p className="text-xs text-gray-500 mt-1">
                            Remaining after transfer:{" "}
                            {availableStock - (parseFloat(prod.boxQty) || 0)}{" "}
                            boxes
                          </p>
                        )}
                        {prod.lc > 0 && prod.boxQty && (
                          <p className="text-xs text-green-600 mt-1">
                            Expenses: {prod.boxQty} × ${prod.lc.toFixed(2)} = $
                            {formatNumber(prod.expenses || 0)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={handleModalClose}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateStockTransfer;