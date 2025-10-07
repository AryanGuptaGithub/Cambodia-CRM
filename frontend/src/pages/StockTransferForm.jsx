import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast.jsx";
import CustomDropdown from "./Utility/customDropdown.jsx";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_PRODUCT_ITEM = {
  id: null,
  productId: "",
  productName: "",
  boxQuantity: 0,
  openPieces: 0,
  qtyPerCarton: 0, // Changed from quantityPerBox to qtyPerCarton
  totalPieces: 0,
  expenses: 0,
};

const INITIAL_FORM_STATE = {
  invoiceNumber: "",
  transferDate: "",
  product: "",
  terms: "",
  notes: "",
  orderStatus: "",
  shipping: "",
  items: [],
};

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

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.transferDate)
      newErrors.transferDate = "Transfer date is required";
    if (!form.orderStatus) newErrors.orderStatus = "Order status is required";
    if (items.length === 0)
      newErrors.items = "At least one product item is required";

    items.forEach((item, index) => {
      if (!item.productId) {
        newErrors[`product_${index}`] = `Product for item ${
          index + 1
        } is required`;
      }
      if (!item.boxQuantity || parseNumber(item.boxQuantity) < 0) {
        newErrors[`boxQuantity_${index}`] = `Box quantity for item ${
          index + 1
        } must be non-negative`;
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
    (id, field, value, products = []) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updatedItem = {
              ...item,
              [field]: [
                "boxQuantity",
                "openPieces",
                "expenses",
              ].includes(field)
                ? parseNumber(value) || 0
                : value,
            };

            // ✅ Calculate Total Pieces when box quantity or open pieces change
            if (["boxQuantity", "openPieces"].includes(field)) {
              // Find the product to get qtyPerCarton
              const selectedProduct = products.find(p => p._id === item.productId);
              const qtyPerCarton = selectedProduct?.qtyPerCarton || 0;
              
              updatedItem.totalPieces =
                parseNumber(updatedItem.boxQuantity) * parseNumber(qtyPerCarton) +
                parseNumber(updatedItem.openPieces);
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
    return 1;
  }, []);

  useEffect(() => {
    const setStockTransferNumber = async () => {
      const generatedNumber = await generateStockTransferNumber();
      updateFormField("invoiceNumber", generatedNumber);
    };
    setStockTransferNumber();
  }, [generateStockTransferNumber, updateFormField]);

  // ✅ Fixed: Calculate totals - Expenses are NOT multiplied with quantity
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

// Reusable Components (keep the same as before)
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
        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${className}`}
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
        className={`border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
          error ? "border-red-500" : "border-gray-300"
        } ${className}`}
      />
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
);

const StockTransferForm = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
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

  const { totalExpenses, shipping, grandTotal } = calculateTotals();

  // Memoized options
  const productOptions = useMemo(
    () => [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: product.productName,
        qtyPerCarton: product.qtyPerCarton // Include qtyPerCarton in options
      })),
    ],
    [products]
  );

  const orderStatusOptions = useMemo(
    () => [
      { value: "", label: "Select Order Status" },
      ...orderStatuses.map((status) => ({
        value: status.code,
        label: status.name,
      })),
    ],
    [orderStatuses]
  );

  // API calls
  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products`);
      setProducts(response.data);
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
    }
  }, []);

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
    fetchProducts();
    fetchOrderStatuses();
  }, [fetchProducts, fetchOrderStatuses]);

  const handleFormChange = useCallback(
    (field, value) => {
      handleSelectChange(field, value);
    },
    [handleSelectChange]
  );

  const handleAddItem = useCallback(() => {
    if (!form.product) {
      showToast("error", "Please select a product first");
      return;
    }

    const selectedProduct = products.find((p) => p._id === form.product);
    const newItem = {
      ...INITIAL_PRODUCT_ITEM,
      id: Date.now(),
      productId: form.product,
      productName: selectedProduct?.productName || `Product ${form.product}`,
      qtyPerCarton: selectedProduct?.qtyPerCarton || 0, // Set qtyPerCarton from product
    };

    addItem(newItem);
    handleFormChange("product", "");
  }, [form.product, products, addItem, handleFormChange]);

  // ✅ Updated: Pass products to updateItem
  const handleItemChange = useCallback(
    (id, field, value) => {
      updateItem(id, field, value, products);
    },
    [updateItem, products]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);

    const payload = {
      invoiceNo: form.invoiceNumber,
      date: form.transferDate,
      items: items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        boxQuantity: parseFloat(item.boxQuantity),
        openPieces: parseFloat(item.openPieces),
        qtyPerCarton: parseFloat(item.qtyPerCarton),
        totalPieces: parseFloat(item.totalPieces),
        expenses: parseFloat(item.expenses),
      })),
      terms: form.terms,
      notes: form.notes,
      status: form.orderStatus,
      shipping: parseFloat(form.shipping),
      totalExpenses,
      grandTotal,
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
      showToast("error", error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isCurrentProductValid = useMemo(
    () => form.product && form.product.trim() !== "",
    [form.product]
  );

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white rounded-2xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Create Stock Transfer
        </h2>
      </div>

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
            disabled
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
          />
          <InputField
            label="Transfer Date"
            name="transferDate"
            type="datetime-local"
            value={form.transferDate}
            onChange={handleChange}
            error={errors.transferDate}
            required
          />
          <InputField
            label="Shipping ($)"
            name="shipping"
            value={form.shipping}
            onChange={(e) => handleNumberChange("shipping", e.target.value)}
            placeholder="Enter Shipping"
            type="number"
            min="0"
            step="0.01"
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
              <CustomDropdown
                value={form.product}
                onChange={(value) => handleFormChange("product", value)}
                placeholder="Select Product"
                options={productOptions}
                required
              />
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={!isCurrentProductValid}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isCurrentProductValid
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
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

        {/* Items Table */}
        {items.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Product Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300 text-center">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-2">Product</th>
                    <th className="border border-gray-300 px-4 py-2">Box Quantity</th>
                    <th className="border border-gray-300 px-4 py-2">Qty Per Carton</th>
                    <th className="border border-gray-300 px-4 py-2">Open Pieces</th>
                    <th className="border border-gray-300 px-4 py-2">Total Pieces</th>
                    <th className="border border-gray-300 px-4 py-2">Expenses ($)</th>
                    <th className="border border-gray-300 px-4 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 px-4 py-2">
                        {item.productName}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        <input
                          type="number"
                          value={item.boxQuantity}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "boxQuantity",
                              e.target.value
                            )
                          }
                          className="w-20 border border-gray-300 rounded px-2 py-1"
                          min="0"
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-2 font-semibold">
                        {item.qtyPerCarton}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        <input
                          type="number"
                          value={item.openPieces}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "openPieces",
                              e.target.value
                            )
                          }
                          className="w-20 border border-gray-300 rounded px-2 py-1"
                          min="0"
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-2 font-semibold">
                        {item.totalPieces}
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        <input
                          type="number"
                          value={item.expenses}
                          onChange={(e) =>
                            handleItemChange(
                              item.id,
                              "expenses",
                              e.target.value
                            )
                          }
                          className="w-24 border border-gray-300 rounded px-2 py-1"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="border border-gray-300 px-4 py-2">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Text Areas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <TextAreaField
            label="Terms & Conditions"
            name="terms"
            value={form.terms}
            onChange={handleChange}
            placeholder="Terms & Conditions"
            rows={3}
          />
          <TextAreaField
            label="Notes"
            name="notes"
            value={form.notes}
            onChange={handleChange}
            placeholder="Notes"
            rows={3}
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
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-6 py-2 rounded-lg transition-colors"
          >
            {isLoading ? "Saving..." : "Save Transfer"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StockTransferForm;