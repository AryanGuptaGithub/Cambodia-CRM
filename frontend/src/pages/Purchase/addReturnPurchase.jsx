import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  PlusSquare,
  MinusSquare,
} from "lucide-react";
import { formatDateToReadable } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

/* ────────────────────── Initial States ────────────────────── */
const INITIAL_PRODUCT_STATE = {
  productName: "",
  purchaseQty: "",
  returnQuantity: "", // Changed from 0 to empty string
  usedQty: "",
  fob: "",
  cif: "",
  lc: "",
  amount: "",
  returnAmount: "",
  expiredDate: "",
};

const INITIAL_FORM_STATE = {
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  supplierName: "",
  returnReason: "",
  products: [{ ...INITIAL_PRODUCT_STATE }],
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

const ReadOnlyField = React.memo(({ label, value, className = "" }) => (
  <div className="flex flex-col">
    <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
    <div
      className={`w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100 ${className}`}
    >
      {value || "-"}
    </div>
  </div>
));

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
const AddReturnPurchase = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [purchases, setPurchases] = useState([]);
  const [invoiceProducts, setInvoiceProducts] = useState([]);
  const [showInvoices, setShowInvoices] = useState(false);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [expandedProductIndex, setExpandedProductIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /* ───── Utility Functions ───── */
  const formatDate = (str) => {
    if (!str) return "";
    return new Date(str).toLocaleDateString("en-GB");
  };

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const updateProductField = useCallback((index, field, value) => {
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[index] = { ...updatedProducts[index], [field]: value };
      return { ...prev, products: updatedProducts };
    });
  }, []);

  /* ───── Fetch Purchases ───── */
  useEffect(() => {
    const loadPurchases = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/purchase`);
        const data = await response.json();

        if (response.ok) {
          const purchasesData = data?.purchases || [];
          setPurchases(purchasesData);
          setFilteredInvoices(purchasesData);
        } else {
          showToast("error", data.message || "Could not load purchases");
        }
      } catch (err) {
        showToast("error", "Failed to fetch purchases");
      }
    };

    loadPurchases();
  }, []);

  /* ───── Invoice Search and Selection ───── */
  const handleInvoiceInput = useCallback(
    (e) => {
      const value = e.target.value;
      updateFormField("invoiceNumber", value);
      setShowInvoices(true);

      if (!value.trim()) {
        setFilteredInvoices(purchases);
        return;
      }

      const filtered = purchases.filter((p) =>
        p.invoiceNumber.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredInvoices(filtered);
    },
    [purchases, updateFormField]
  );

  const selectInvoice = useCallback(
    (invoice) => {
      updateFormField("invoiceNumber", invoice.invoiceNumber);
      updateFormField("invoiceDate", invoice.invoiceDate);
      updateFormField("deliveryNumber", invoice.deliveryNumber);
      updateFormField("receivedDate", invoice.receivedDate);
      updateFormField("supplierName", invoice.supplierName);

      // Load its products
      setInvoiceProducts(invoice.products);

      // Reset all products to initial state and add first product
      setForm((prev) => ({
        ...prev,
        products: [{ ...INITIAL_PRODUCT_STATE }],
      }));

      setShowInvoices(false);
    },
    [updateFormField]
  );

  /* ───── Product Selection ───── */
  const selectProduct = useCallback(
    (index, productName) => {
      const product = invoiceProducts.find(
        (p) => p.productName === productName
      );
      if (!product) return;

      updateProductField(index, "productName", productName);
      updateProductField(
        index,
        "expiredDate",
        product.expiredDate || product.expiryDate
      );
      updateProductField(
        index,
        "purchaseQty",
        product.quantityPerBoxStrip || product.qtyBox || 0
      );
      updateProductField(index, "fob", product.fob || 0);
      updateProductField(index, "cif", product.cif || 0);
      updateProductField(index, "lc", product.lc || 0);
      updateProductField(index, "amount", product.amount || 0);
      // CHANGED: Set to empty string instead of 0
      updateProductField(index, "returnQuantity", "");
      updateProductField(index, "returnAmount", 0);
      updateProductField(
        index,
        "usedQty",
        product.quantityPerBoxStrip || product.qtyBox || 0
      );
    },
    [invoiceProducts, updateProductField]
  );

  /* ───── Calculations ───── */
  const calculateProductFields = useCallback(
    (index) => {
      const product = form.products[index];
      const purchaseQty = Number(product.purchaseQty);
      const returnQty = product.returnQuantity
        ? Number(product.returnQuantity)
        : 0;
      const amount = Number(product.amount);

      const usedQty = Math.max(0, purchaseQty - returnQty);
      const unitPrice = purchaseQty > 0 ? amount / purchaseQty : 0;
      const returnAmount = returnQty * unitPrice;

      updateProductField(index, "usedQty", usedQty);
      updateProductField(index, "returnAmount", returnAmount);
    },
    [form.products, updateProductField]
  );

  useEffect(() => {
    form.products.forEach((_, index) => {
      calculateProductFields(index);
    });
  }, [
    form.products.map((p) => p.returnQuantity).join(","),
    calculateProductFields,
  ]);

  /* ───── Product Management ───── */
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
          if (prevIndex > index) return prevIndex - 1;
          return prevIndex;
        });
      }
    },
    [form.products.length]
  );

  const toggleProductView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  const isProductExpanded = useCallback(
    (index) => {
      return expandedProductIndex === index;
    },
    [expandedProductIndex]
  );

  const isProductFilled = useCallback((product) => {
    return product.productName && product.productName.trim() !== "";
  }, []);

  const hasAtLeastOneProduct = useCallback((products) => {
    return products.some(
      (product) => product.productName && product.productName.trim() !== ""
    );
  }, []);

  /* ───── Validation ───── */
  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.invoiceNumber?.trim())
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.recordingDate)
      newErrors.recordingDate = "Recording date is required";
    if (!form.returnReason?.trim())
      newErrors.returnReason = "Return reason is required";

    // Validate products
    let hasValidProduct = false;
    form.products.forEach((product, index) => {
      if (product.productName.trim()) {
        hasValidProduct = true;

        if (!product.productName.trim()) {
          newErrors[`productName_${index}`] = `Product Name for item ${
            index + 1
          } is required`;
        }

        const returnQty = product.returnQuantity
          ? Number(product.returnQuantity)
          : 0;
        const purchaseQty = Number(product.purchaseQty);

        // CHANGED: Check if returnQuantity is provided
        if (!product.returnQuantity || product.returnQuantity.trim() === "") {
          newErrors[`returnQuantity_${index}`] = `Return quantity for item ${
            index + 1
          } is required`;
        } else if (returnQty <= 0) {
          newErrors[`returnQuantity_${index}`] = `Return quantity for item ${
            index + 1
          } must be greater than 0`;
        } else if (returnQty > purchaseQty) {
          newErrors[`returnQuantity_${index}`] = `Return quantity for item ${
            index + 1
          } cannot exceed purchase quantity`;
        }
      }
    });

    if (!hasValidProduct) {
      newErrors.products = "At least one product is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  /* ───── Submit Handler - UPDATED TO MATCH YOUR DATA STRUCTURE ───── */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      // Filter valid products for return
      const validReturnProducts = form.products
        .filter(
          (product) =>
            product.productName.trim() &&
            product.returnQuantity &&
            Number(product.returnQuantity) > 0
        )
        .map((product) => ({
          productName: product.productName,
          purchaseQty: Number(product.purchaseQty),
          returnQuantity: Number(product.returnQuantity),
          usedQty: Number(product.usedQty),
          fob: Number(product.fob),
          cif: Number(product.cif),
          lc: Number(product.lc),
          amount: Number(product.amount),
          returnAmount: Number(product.returnAmount),
          expiredDate: product.expiredDate,
        }));

      // Check if we have any products to submit
      if (validReturnProducts.length === 0) {
        showToast("error", "No valid products to return");
        setIsSubmitting(false);
        return;
      }

      // Create the return data object matching your structure
      const returnData = {
        recordingDate: form.recordingDate,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        deliveryNumber: form.deliveryNumber,
        receivedDate: form.receivedDate,
        supplierName: form.supplierName,
        returnReason: form.returnReason,
        products: validReturnProducts,
      };

      console.log("Submitting return data:", returnData);

      const response = await fetch(`${backendUrl}/api/purchase-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(returnData),
      });

      const result = await response.json();

      if (response.ok && result.success !== false) {
        showToast("success", "Purchase return added successfully");
        // FIXED: Use relative navigation instead of absolute path
        navigate(".."); // This will go back to the purchasereturn list
      } else {
        showToast("error", result.message || "Failed to add purchase return");
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error("Submit error:", err);
      showToast("error", "Network error occurred");
      setIsSubmitting(false);
    }
  };

  /* ───── Enhanced Handlers ───── */
  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

  const handleDateChange = useCallback(
    (name, date) => {
      updateFormField(name, date ? new Date(date).toISOString() : "");
    },
    [updateFormField]
  );

  const handleProductChange = useCallback(
    (index, e) => {
      const { name, value } = e.target;
      updateProductField(index, name, value);
    },
    [updateProductField]
  );

  const handleNumericProductChange = useCallback(
    (index, e) => {
      const { name, value } = e.target;
      const regex = /^-?\d*\.?\d*$/;

      if (value === "" || regex.test(value)) {
        updateProductField(index, name, value);
      }
    },
    [updateProductField]
  );

  /* ───── Form Validation State ───── */
  const isFormValid = useMemo(() => {
    const hasValidProducts = form.products.some(
      (product) =>
        product.productName &&
        product.returnQuantity &&
        Number(product.returnQuantity) > 0 &&
        Number(product.returnQuantity) <= Number(product.purchaseQty)
    );

    return (
      form.invoiceNumber &&
      form.recordingDate &&
      form.returnReason &&
      hasValidProducts
    );
  }, [form]);

  const isCurrentProductValid = useCallback(() => {
    const currentProduct = form.products[form.products.length - 1];
    return isProductFilled(currentProduct);
  }, [form.products, isProductFilled]);

  // FIXED: Cancel handler
  const handleCancel = useCallback(() => {
    // Use relative navigation to go back to the purchasereturn list
    navigate("..");
  }, [navigate]);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Add Purchase Return
        </h2>
        <button
          type="button"
          disabled={!isCurrentProductValid()}
          onClick={addProduct}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
            isCurrentProductValid()
              ? "bg-green-600 text-white hover:bg-green-700"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          <PlusSquare className="w-5 h-5" />
          Add Product
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Invoice Information Section */}
        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Invoice Information
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Invoice Search */}
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="flex items-center border border-gray-300 rounded-lg px-2">
                  <input
                    type="text"
                    value={form.invoiceNumber}
                    onChange={handleInvoiceInput}
                    onFocus={() => setShowInvoices(true)}
                    className="w-full p-2 outline-none"
                    placeholder="Search for invoice..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowInvoices((v) => !v)}
                    className="text-gray-500 p-1"
                  >
                    {showInvoices ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </button>
                </div>
                {errors.invoiceNumber && (
                  <p className="text-red-500 text-xs mt-0.5">
                    {errors.invoiceNumber}
                  </p>
                )}

                {showInvoices && (
                  <div className="absolute z-20 bg-white border border-gray-300 w-full mt-1 max-h-48 overflow-auto rounded-lg shadow-lg">
                    {filteredInvoices.length === 0 ? (
                      <div className="p-3 text-gray-500 text-center">
                        No matching invoices found
                      </div>
                    ) : (
                      filteredInvoices.map((invoice) => (
                        <div
                          key={invoice._id}
                          onClick={() => selectInvoice(invoice)}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-semibold text-gray-800">
                            {invoice.invoiceNumber}
                          </div>
                          <div className="text-sm text-gray-600">
                            {invoice.supplierName} •{" "}
                            {formatDateToReadable(invoice.invoiceDate)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <DatePickerField
              label="Recording Date"
              name="recordingDate"
              value={form.recordingDate}
              onChange={handleDateChange}
              error={errors.recordingDate}
              required
              maxDate={new Date()}
            />

            <ReadOnlyField
              label="Delivery Number"
              value={form.deliveryNumber}
            />

            <ReadOnlyField label="Supplier" value={form.supplierName} />

            <ReadOnlyField
              label="Invoice Date"
              value={formatDateToReadable(form.invoiceDate)}
            />

            <ReadOnlyField
              label="Received Date"
              value={formatDateToReadable(form.receivedDate)}
            />
          </div>
        </div>

        {/* Products Section */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Return Products
          </h3>

          {form.products.map((product, index) => (
            <div key={index} className="border border-gray-200 rounded-lg mb-4">
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
                          Purchase: {product.purchaseQty} boxes
                        </span>
                        <span className="text-sm px-2 py-1 bg-green-100 text-green-800 rounded border border-green-300">
                          After Return: {product.usedQty} boxes
                        </span>
                        {product.returnQuantity &&
                          Number(product.returnQuantity) > 0 && (
                            <span className="text-sm px-2 py-1 bg-red-100 text-red-800 rounded border border-red-300">
                              -{product.returnQuantity} boxes
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
                        className="text-red-600 hover:text-red-800 p-1"
                      >
                        <MinusSquare size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Details - Single Row Layout */}
              {isProductExpanded(index) && (
                <div className="p-6 border-t">
                  <div className="space-y-6">
                    {/* Product Selection Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                          Product <span className="text-red-500">*</span>
                        </label>
                        <select
                          className={`w-full border px-3 py-2 rounded-lg ${
                            errors[`productName_${index}`]
                              ? "border-red-500"
                              : "border-gray-300"
                          }`}
                          value={product.productName}
                          onChange={(e) => selectProduct(index, e.target.value)}
                        >
                          <option value="">Select product</option>
                          {invoiceProducts
                            .filter(
                              (invoiceProduct) =>
                                !form.products.some(
                                  (p, i) =>
                                    i !== index &&
                                    p.productName === invoiceProduct.productName
                                )
                            )
                            .map((invoiceProduct) => (
                              <option
                                key={invoiceProduct._id}
                                value={invoiceProduct.productName}
                              >
                                {invoiceProduct.productName}
                              </option>
                            ))}
                        </select>
                        {errors[`productName_${index}`] && (
                          <p className="text-red-500 text-xs mt-0.5">
                            {errors[`productName_${index}`]}
                          </p>
                        )}
                      </div>

                      {/* CHANGED: Added placeholder for return quantity */}
                      <NumericInputField
                        label="Return Quantity"
                        name="returnQuantity"
                        value={product.returnQuantity}
                        onChange={(e) => handleNumericProductChange(index, e)}
                        error={errors[`returnQuantity_${index}`]}
                        placeholder="Enter return quantity"
                        required
                        allowDecimal={false}
                      />

                      <ReadOnlyField
                        label="Purchase Quantity"
                        value={product.purchaseQty}
                      />
                    </div>

                    {/* Financial Details Row */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      <ReadOnlyField label="FOB (USD)" value={product.fob} />
                      <ReadOnlyField label="CIF (USD)" value={product.cif} />
                      <ReadOnlyField label="LC (USD)" value={product.lc} />
                      <ReadOnlyField
                        label="Total Amount (USD)"
                        value={product.amount}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <ReadOnlyField
                        label="Expiry Date"
                        value={formatDateToReadable(product.expiredDate)}
                      />
                      <ReadOnlyField
                        label="Used Quantity"
                        value={product.usedQty}
                      />

                      <ReadOnlyField
                        label="Return Amount (USD)"
                        value={Number(product.returnAmount).toFixed(2)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {errors.products && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded">
              <p className="text-red-700 text-sm">{errors.products}</p>
            </div>
          )}
        </div>

        <div className="mb-8 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-700">
            Return Details
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">
                Return Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                name="returnReason"
                value={form.returnReason}
                onChange={handleChange}
                placeholder="Enter return reason..."
                rows={2}
                className={`w-full border rounded-lg px-3 py-2 ${
                  errors.returnReason ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.returnReason && (
                <p className="text-red-500 text-xs mt-0.5">
                  {errors.returnReason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-4">
          <button
            type="submit"
            disabled={!isFormValid || isSubmitting}
            className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
              isFormValid && !isSubmitting
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? "Submitting..." : "Submit Return"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddReturnPurchase;
