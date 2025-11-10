import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useInitialSaleData } from "./IntialLoading.jsx";
import { PlusSquare } from "lucide-react";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const INITIAL_PRODUCT_STATE = {
  productName: "",
  salesQty: "",
  returnQuantity: "",
  usedQty: "",
  sellingPrice: "",
  amount: "",
  discount: "",
  netSellingAmount: "",
  usedPrice: "",
  usedAmount: "",
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  customerName: "",
  customerId: "", // ← Hidden ID field
  saleDate: "",
  totalAmount: "",
  paidAmount: "",
  dueAmount: "",
  paymentStatus: "",
  remark: "",
  products: [{ ...INITIAL_PRODUCT_STATE }],
};

/* ────────────────────── Utility ────────────────────── */
const parseNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

/* ────────────────────── Form Hook ────────────────────── */
const useReturnSaleForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);

  const updateFormField = useCallback((name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
  }, []);

  const toggleView = useCallback((i) => {
    setExpandedProductIndex((p) => (p === i ? -1 : i));
  }, []);

  const expandProduct = useCallback((i) => setExpandedProductIndex(i), []);
  const collapseAllProducts = useCallback(
    () => setExpandedProductIndex(-1),
    []
  );
  const isProductExpanded = useCallback(
    (i) => expandedProductIndex === i,
    [expandedProductIndex]
  );

  // Only user-visible fields required
  const areCommonFieldsFilled = useCallback((f) => {
    const req = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
    ];
    return req.every((k) => f[k] && f[k].toString().trim());
  }, []);

  const hasAtLeastOneProduct = useCallback(
    (prods) => prods.some((p) => p.productName.trim()),
    []
  );

  const calculateProductFields = useCallback((prod) => {
    const salesQty = parseInt(prod.salesQty) || 0;
    const returnQty = parseInt(prod.returnQuantity) || 0;
    const price = parseFloat(prod.sellingPrice) || 0;
    const disc = parseFloat(prod.discount) || 0;

    const validReturn = Math.min(returnQty, salesQty);
    const used = Math.max(salesQty - validReturn, 0);
    const amount = (price * salesQty).toFixed(2);
    const net = (parseFloat(amount) - disc).toFixed(2);
    const usedPrice = (price * used).toFixed(2);
    const usedAmt = (parseFloat(usedPrice) - (disc / salesQty) * used).toFixed(
      2
    );

    return {
      ...prod,
      returnQuantity: validReturn.toString(),
      usedQty: used.toString(),
      amount,
      netSellingAmount: net,
      usedPrice,
      usedAmount: usedAmt,
    };
  }, []);

  const updateProduct = useCallback(
    (idx, field, value) => {
      setForm((prev) => {
        const prods = [...prev.products];
        prods[idx] = { ...prods[idx], [field]: value };
        const recalculated = prods.map(calculateProductFields);
        const total = recalculated
          .reduce((s, p) => s + parseFloat(p.usedAmount || 0), 0)
          .toFixed(2);
        const paid = parseNumber(prev.paidAmount);
        const due = (total - paid).toFixed(2);
        return {
          ...prev,
          products: recalculated,
          totalAmount: total,
          dueAmount: due,
        };
      });
    },
    [calculateProductFields]
  );

  const calculateDerivedFields = useCallback((name, value, cur) => {
    const upd = { ...cur, [name]: value };
    if (name === "paidAmount") {
      const tot = parseNumber(cur.totalAmount);
      const paid = parseNumber(value);
      upd.dueAmount = (tot - paid).toFixed(2);
    }
    return upd;
  }, []);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setForm((p) => calculateDerivedFields(name, value, p));
    },
    [calculateDerivedFields]
  );

  const validate = useCallback(() => {
    const err = {};
    const req = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
      "paymentStatus",
    ];
    req.forEach((k) => {
      if (!form[k]) err[k] = `${k.replace(/([A-Z])/g, " $1")} is required`;
    });

    form.products.forEach((p, i) => {
      if (!p.productName) err[`productName_${i}`] = `Product ${i + 1} required`;
      if (!p.returnQuantity || Number(p.returnQuantity) < 0)
        err[`returnQuantity_${i}`] = `Return qty >= 0`;
      if (!p.sellingPrice || Number(p.sellingPrice) <= 0)
        err[`sellingPrice_${i}`] = `Selling price > 0`;

      const sq = Number(p.salesQty) || 0;
      const rq = Number(p.returnQuantity) || 0;
      if (rq > sq)
        err[`returnQuantity_${i}`] = "Return qty cannot exceed sales qty";
    });

    setErrors(err);
    return Object.keys(err).length === 0;
  }, [form]);

  const addProduct = useCallback(() => {
    setForm((p) => ({
      ...p,
      products: [...p.products, { ...INITIAL_PRODUCT_STATE }],
    }));
    collapseAllProducts();
  }, [collapseAllProducts]);

  const removeProduct = useCallback(
    (i) => {
      setForm((p) => ({
        ...p,
        products: p.products.filter((_, idx) => idx !== i),
      }));
      if (expandedProductIndex === i) collapseAllProducts();
    },
    [expandedProductIndex, collapseAllProducts]
  );

  return {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    updateProduct,
    toggleView,
    expandProduct,
    collapseAllProducts,
    isProductExpanded,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    setErrors,
    addProduct,
    removeProduct,
  };
};

/* ────────────────────── Reusable UI ────────────────────── */
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
    ...p
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
        className={`border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-200" : ""}`}
        autoComplete="off"
        tabIndex={readOnly ? -1 : 0}
        {...p}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

const TextAreaField = React.memo(
  ({ label, name, value, onChange, error, rows = 2 }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        className={`border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        }`}
        autoComplete="off"
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
        onChange={(d) => {
          const ev = {
            target: { name, value: d ? d.toISOString().split("T")[0] : "" },
          };
          onChange(ev);
        }}
        dateFormat="yyyy-MM-dd"
        placeholderText={placeholder}
        readOnly={readOnly}
        className={`w-full border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-200" : ""} ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

/* ────────────────────── MAIN COMPONENT ────────────────────── */
const AddReturnSale = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [isInvoiceDataFetched, setIsInvoiceDataFetched] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    updateProduct,
    toggleView,
    expandProduct,
    collapseAllProducts,
    isProductExpanded,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    addProduct,
    removeProduct,
  } = useReturnSaleForm();

  const { loading } = useInitialSaleData();

  /* ───── Invoice Dropdown Options ───── */
  const invoiceOptions = useMemo(() => {
    if (!Array.isArray(sales)) return [];
    const uniq = [
      ...new Set(sales.map((s) => s.invoiceNumber).filter(Boolean)),
    ];
    return [
      { value: "", label: "Select Invoice Number" },
      ...uniq.map((inv) => ({ value: inv, label: inv })),
    ];
  }, [sales]);

  /* ───── Product Dropdown Options (per row) ───── */
  const productOptions = useMemo(() => {
    return form.products.map((_, idx) => {
      const selected = form.products
        .filter((p, i) => i !== idx && p.productName.trim())
        .map((p) => p.productName);
      const options = filteredProducts
        .filter((name) => !selected.includes(name))
        .map((name) => ({ value: name, label: name }));
      return [{ value: "", label: "Select Product" }, ...options];
    });
  }, [form.products, filteredProducts]);

  /* ───── Auto Update Payment Status ───── */
  useEffect(() => {
    const total = parseNumber(form.totalAmount);
    const paid = parseNumber(form.paidAmount);

    let status = "";
    if (total === 0) status = "";
    else if (paid === total) status = "Cash";
    else if (paid === 0) status = "Credit";
    else if (paid > 0 && paid < total) status = "Partial Paid";

    if (status && form.paymentStatus !== status) {
      updateFormField("paymentStatus", status);
    }
  }, [form.totalAmount, form.paidAmount, form.paymentStatus, updateFormField]);

  /* ───── Handlers ───── */
  const enhancedHandleChange = useCallback(
    (e) => handleChange(e),
    [handleChange]
  );

  const handleProductNameSelect = useCallback(
    (idx, selectedName) => {
      if (!selectedName) return;
      updateProduct(idx, "productName", selectedName);

      const sale = sales.find((s) => s.invoiceNumber === form.invoiceNumber);
      const prod = sale?.products?.find((p) => p.productName === selectedName);
      if (prod) {
        updateProduct(idx, "salesQty", prod.salesQty?.toString() ?? "");
        updateProduct(idx, "sellingPrice", prod.sellingPrice?.toString() ?? "");
        updateProduct(idx, "discount", prod.discount?.toString() ?? "");
        expandProduct(idx);
      }
    },
    [form.invoiceNumber, sales, updateProduct, expandProduct]
  );

  const getAvailableProductsCount = useCallback(() => {
    const selected = form.products
      .filter((p) => p.productName.trim())
      .map((p) => p.productName);
    return filteredProducts.filter((p) => !selected.includes(p)).length;
  }, [form.products, filteredProducts]);

  const isAddReturnSaleEnabled = useMemo(
    () =>
      isInvoiceDataFetched &&
      areCommonFieldsFilled(form) &&
      hasAtLeastOneProduct(form.products),
    [isInvoiceDataFetched, form, areCommonFieldsFilled, hasAtLeastOneProduct]
  );

  const isAddProductEnabled = useMemo(
    () => isInvoiceDataFetched && getAvailableProductsCount() > 0,
    [isInvoiceDataFetched, getAvailableProductsCount]
  );

  const enhancedAddProduct = useCallback(() => {
    if (!isAddProductEnabled) {
      showToast("error", "No more products available to add");
      return;
    }
    addProduct();
  }, [isAddProductEnabled, addProduct]);

  const filterSalesByInvoice = useCallback(
    (inv) => sales.find((s) => s.invoiceNumber === inv) || null,
    [sales]
  );

  const getProductNamesFromFilteredSales = useCallback((sale) => {
    if (!sale?.products?.length) return [];
    const map = new Map();
    return sale.products
      .filter((p) => p.productName && !map.has(p.productName))
      .map((p) => {
        map.set(p.productName, true);
        return p.productName;
      });
  }, []);

  const handleInvoiceNumberSelect = useCallback(
    (inv) => updateFormField("invoiceNumber", inv),
    [updateFormField]
  );

  const handleRecordingDateChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

  /* ───── Auto-fill on invoice change ───── */
  useEffect(() => {
    if (form.invoiceNumber && form.invoiceNumber !== lastInvoiceNumber) {
      const sale = filterSalesByInvoice(form.invoiceNumber);
      const prods = getProductNamesFromFilteredSales(sale);
      setFilteredProducts(prods);
      setLastInvoiceNumber(form.invoiceNumber);
      
      if (sale) {
        setIsInvoiceDataFetched(true);
        updateFormField("invoiceDate", sale.invoiceDate?.split("T")[0] ?? "");
        updateFormField("mrName", sale.mrName ?? "");
        updateFormField("customerName", sale.customerName ?? "");
        updateFormField("customerId", sale.customerId ?? ""); // ← Auto-fill ID
        updateFormField("saleDate", sale.invoiceDate?.split("T")[0] ?? "");
        updateFormField("remark", sale.remark ?? "");
      } else {
        setIsInvoiceDataFetched(false);
        updateFormField("customerId", "");
      }
    } else if (!form.invoiceNumber) {
      setFilteredProducts([]);
      setIsInvoiceDataFetched(false);
      setLastInvoiceNumber("");
      updateFormField("customerId", "");
    }
  }, [
    form.invoiceNumber,
    lastInvoiceNumber,
    filterSalesByInvoice,
    getProductNamesFromFilteredSales,
    updateFormField,
  ]);

  /* ───── Fetch Sales ───── */
  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sales");
      const data = await res.json();
      setSales(Array.isArray(data.summaries) ? data.summaries : []);
    } catch (err) {
      console.error(err);
      showToast("error", err.message || "Error loading sales");
      setSales([]);
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  /* ───── Submit ───── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const validProds = form.products.filter((p) => p.productName.trim());
    if (!validProds.length) {
      showToast("error", "Add at least one product");
      return;
    }

    const payload = validProds.map((p) => ({
      recordingDate: form.recordingDate,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      mrName: form.mrName,
      customerName: form.customerName,
      customerId: form.customerId, // ← Send ID
      productName: p.productName,
      salesQty: p.salesQty,
      returnQuantity: p.returnQuantity,
      usedQty: p.usedQty,
      sellingPrice: p.sellingPrice,
      amount: p.amount,
      discount: p.discount,
      netSellingAmount: p.netSellingAmount,
      usedPrice: p.usedPrice,
      usedAmount: p.usedAmount,
      totalAmount: form.totalAmount,
      paidAmount: form.paidAmount,
      dueAmount: form.dueAmount,
      paymentStatus: form.paymentStatus,
      remark: form.remark,
    }));

    try {
      const res = await fetch(`${backendUrl}/api/salesreturn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");
      showToast("success", json.message || "Return sale added");
      navigate("/salelayout/salereturn");
    } catch (err) {
      console.error(err);
      showToast("error", err.message);
    }
  };

  const handleNumericInputChange = (e, fn) => {
    const v = e.target.value;
    if (v === "" || /^-?\d*\.?\d*$/.test(v)) fn(e);
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow flex justify-center items-center h-32">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      {/* Hidden customerId */}
      <input type="hidden" name="customerId" value={form.customerId} />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Add New Sale Return
        </h2>
        <div className="flex items-center gap-4">
          {isInvoiceDataFetched && (
            <span className="text-sm text-gray-600">
              Available products: {getAvailableProductsCount()}
            </span>
          )}
          <button
            type="button"
            onClick={enhancedAddProduct}
            disabled={!isAddProductEnabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isAddProductEnabled
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            <PlusSquare size={18} />
            Add Return Product
          </button>
        </div>
      </div>

      {/* Common Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <SearchableDropdown
          label="Invoice Number"
          value={form.invoiceNumber}
          onChange={handleInvoiceNumberSelect}
          options={invoiceOptions}
          placeholder="Select Invoice Number"
          required
          error={errors.invoiceNumber}
          loading={loading}
        />
        <DatePickerField
          label="Recording Date"
          name="recordingDate"
          value={form.recordingDate}
          onChange={handleRecordingDateChange}
          error={errors.recordingDate}
          required
        />
        <DatePickerField
          label="Invoice Date"
          name="invoiceDate"
          value={form.invoiceDate}
          onChange={enhancedHandleChange}
          error={errors.invoiceDate}
          readOnly
        />
        <InputField
          label="Medical Representative Name"
          name="mrName"
          value={form.mrName}
          onChange={enhancedHandleChange}
          error={errors.mrName}
          readOnly
        />
        <InputField
          label="Customer Name"
          name="customerName"
          value={form.customerName}
          onChange={enhancedHandleChange}
          readOnly
        />
        <div />
      </div>

      {/* Products */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Products</h3>
        {form.products.map((prod, idx) => (
          <div key={idx} className="border p-4 mb-4 rounded shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <div className="flex-1 mr-4">
                <SearchableDropdown
                  label="Product Name"
                  value={prod.productName}
                  onChange={(val) => handleProductNameSelect(idx, val)}
                  options={productOptions[idx] || []}
                  placeholder="Select product"
                  required
                  error={errors[`productName_${idx}`]}
                  disabled={!isInvoiceDataFetched}
                />
              </div>
              <div className="flex gap-2">
                {prod.productName && (
                  <button
                    type="button"
                    onClick={() => toggleView(idx)}
                    className="text-blue-600 underline px-3 py-1 border border-blue-600 rounded"
                  >
                    {isProductExpanded(idx) ? "Hide Details" : "Show Details"}
                  </button>
                )}
                {form.products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(idx)}
                    className="text-red-600 underline px-3 py-1 border border-red-600 rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {prod.productName && isProductExpanded(idx) && (
              <div className="border rounded-lg p-4 mt-2 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InputField
                    label="Return Quantity"
                    name={`returnQuantity_${idx}`}
                    type="text"
                    value={prod.returnQuantity}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^-?\d*\.?\d*$/.test(v))
                        updateProduct(idx, "returnQuantity", v);
                    }}
                    error={errors[`returnQuantity_${idx}`]}
                    required
                  />
                  <InputField
                    label="Sales Quantity"
                    value={prod.salesQty}
                    readOnly
                  />
                  <InputField
                    label="Used Quantity"
                    value={prod.usedQty}
                    readOnly
                  />
                  <InputField
                    label="Selling Price"
                    value={prod.sellingPrice}
                    readOnly
                  />
                  <InputField label="Amount" value={prod.amount} readOnly />
                  <InputField label="Discount" value={prod.discount} readOnly />
                  <InputField
                    label="Net Selling Amount"
                    value={prod.netSellingAmount}
                    readOnly
                  />
                  <InputField
                    label="Used Price"
                    value={prod.usedImports}
                    readOnly
                  />
                  <InputField
                    label="Used Amount"
                    value={prod.usedAmount}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Payment Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <InputField
          label="Total Amount"
          name="totalAmount"
          value={form.totalAmount}
          readOnly
          className="bg-gray-100 font-semibold"
        />
        <InputField
          label="Paid Amount"
          name="paidAmount"
          type="text"
          value={form.paidAmount}
          onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
          error={errors.paidAmount}
        />
        <InputField
          label="Due Amount"
          name="dueAmount"
          value={form.dueAmount}
          readOnly
        />
        <InputField
          label="Payment Status*"
          name="paymentStatus"
          value={form.paymentStatus}
          readOnly
          className="bg-blue-50"
        />
        <div className="sm:col-span-3">
          <TextAreaField
            label="Remark"
            name="remark"
            value={form.remark}
            onChange={enhancedHandleChange}
            rows={2}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end mt-6 gap-3">
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={!isAddReturnSaleEnabled}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg shadow transition-colors ${
            isAddReturnSaleEnabled
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          Add Return Sale
        </button>
        <button
          type="button"
          onClick={() => navigate("/salelayout/salereturn")}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default AddReturnSale;
