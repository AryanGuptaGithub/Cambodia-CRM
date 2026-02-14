import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useInitialSaleData } from "./IntialLoading.jsx";
import { PlusSquare } from "lucide-react";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import LoadingOverlay from "../../components/Loading.jsx";
import { handleNumericInputChange } from "../../utils/inputValidators.jsx";

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
  bonusQty: "",
  totalQty: "",
  averageUnitPrice: "",
  lc: "",
  profitLoss: "",
  isProductAccept: false,
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  customerName: "",
  customerId: "",
  creditDays: 0,
  dueDate: "",
  deliveryDate: "",
  totalAmount: 0,
  paidAmount: 0,
  dueAmount: 0,
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
    const salesQty = parseNumber(prod.salesQty);
    const returnQty = parseNumber(prod.returnQuantity);
    const bonusQty = parseNumber(prod.bonusQty);
    const sellingPrice = parseNumber(prod.sellingPrice);
    const discount = parseNumber(prod.discount);
    const lc = parseNumber(prod.lc);

    // Ensure return quantity doesn't exceed sales quantity
    const validReturn = Math.min(returnQty, salesQty);
    const usedQty = Math.max(salesQty - validReturn, 0);
    const totalQty = usedQty + bonusQty;

    // Calculate Amount based on used quantity * lc
    const amount = (usedQty * lc).toFixed(2);

    // Calculate Net Selling Amount (Amount - discount)
    const netSellingAmount = (parseNumber(amount) - discount).toFixed(2);

    // Calculate Average Unit Price (Amount / totalQty)
    const averageUnitPrice = totalQty > 0 ? (parseNumber(amount) / totalQty).toFixed(2) : "0.00";

    // Calculate Profit/Loss: usedQty * sellingPrice - (usedQty + bonusQty) * lc
    const profitLoss = (usedQty * sellingPrice - (usedQty + bonusQty) * lc).toFixed(2);

    // Calculate used amount (usedQty * sellingPrice)
    const usedAmount = (usedQty * sellingPrice).toFixed(2);

    return {
      ...prod,
      returnQuantity: validReturn.toString(),
      usedQty: usedQty.toString(),
      totalQty: totalQty.toString(),
      amount,
      netSellingAmount,
      usedPrice: sellingPrice.toString(),
      usedAmount,
      averageUnitPrice,
      profitLoss,
      isProductAccept: false,
    };
  }, []);

  const updateProduct = useCallback(
    (idx, field, value) => {
      setForm((prev) => {
        const prods = [...prev.products];
        prods[idx] = { ...prods[idx], [field]: value };

        // Recalculate product fields when return quantity or other key fields change
        if (field === "returnQuantity" || field === "discount" || field === "lc") {
          const recalculated = prods.map(calculateProductFields);
          const total = recalculated
            .reduce((s, p) => s + parseFloat(p.netSellingAmount || 0), 0)
            .toFixed(2);
          const paid = parseNumber(prev.paidAmount);
          const due = Math.max(0, total - paid).toFixed(2);

          return {
            ...prev,
            products: recalculated,
            totalAmount: total,
            dueAmount: due,
          };
        }

        // Just update the single product without recalculating all
        return {
          ...prev,
          products: prods,
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
      upd.dueAmount = Math.max(0, tot - paid).toFixed(2);
    }

    // Calculate due date when credit days or invoice date changes
    if (
      (name === "creditDays" && cur.invoiceDate) ||
      (name === "invoiceDate" && cur.creditDays)
    ) {
      const creditDays = parseNumber(cur.creditDays);
      const invoiceDate = name === "invoiceDate" ? value : cur.invoiceDate;
      if (invoiceDate && creditDays > 0) {
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + creditDays);
        upd.dueDate = dueDate.toISOString().split("T")[0];
      }
    }

    // Set delivery date same as invoice date
    if (name === "invoiceDate" && value) {
      upd.deliveryDate = value;
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
    disabled = false,
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
        readOnly={readOnly || disabled}
        disabled={disabled}
        className={`border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly || disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
        autoComplete="off"
        tabIndex={readOnly || disabled ? -1 : 0}
        {...p}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

const TextAreaField = React.memo(
  ({ label, name, value, onChange, error, rows = 2, disabled = false }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        disabled={disabled}
        className={`border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
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
    maxDate,
    disabled = false,
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
        readOnly={readOnly || disabled}
        disabled={disabled}
        maxDate={maxDate}
        className={`w-full border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly || disabled ? "bg-gray-200 cursor-not-allowed" : ""} ${className}`}
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
  const [saleReturns, setSaleReturns] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [isInvoiceDataFetched, setIsInvoiceDataFetched] = useState(false);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState("");
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingSaleReturns, setLoadingSaleReturns] = useState(false);
  const [isSalesEmpty, setIsSalesEmpty] = useState(false);
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

  /* ───── Check if sales data is empty ───── */
  const checkIfSalesEmpty = useCallback(() => {
    if (!loadingSales && Array.isArray(sales) && sales.length === 0) {
      setIsSalesEmpty(true);
      return true;
    }
    setIsSalesEmpty(false);
    return false;
  }, [sales, loadingSales]);

  useEffect(() => {
    checkIfSalesEmpty();
  }, [checkIfSalesEmpty]);

  /* ───── Get returned products for an invoice ───── */
  const getReturnedProductsForInvoice = useCallback(
    (invoiceNumber) => {
      if (!invoiceNumber) return new Set();

      const returnsForInvoice = saleReturns.filter(
        (sr) => sr.invoiceNumber === invoiceNumber
      );

      const returnedProducts = new Set();
      returnsForInvoice.forEach((returnItem) => {
        returnItem.products.forEach((product) => {
          returnedProducts.add(product.productName);
        });
      });

      return returnedProducts;
    },
    [saleReturns]
  );

  /* ───── Check if all products are returned for an invoice ───── */
  const isInvoiceFullyReturned = useCallback(
    (invoiceNumber) => {
      if (!invoiceNumber) return false;

      const sale = sales.find((s) => s.invoiceNumber === invoiceNumber);
      if (!sale || !sale.products) return false;

      const returnedProducts = getReturnedProductsForInvoice(invoiceNumber);

      // Check if every product in the sale has been returned
      return sale.products.every((product) =>
        returnedProducts.has(product.productName)
      );
    },
    [sales, getReturnedProductsForInvoice]
  );

  /* ───── Invoice Dropdown Options (FILTERED) ───── */
  const invoiceOptions = useMemo(() => {
    if (isSalesEmpty) {
      return [
        {
          value: "",
          label: "No Invoices Available",
          disabled: true,
        },
      ];
    }

    if (!Array.isArray(sales)) {
      return [{ value: "", label: "Loading invoices...", disabled: true }];
    }

    // Filter out invoices where all products are already returned
    const availableInvoices = sales.filter(
      (sale) => !isInvoiceFullyReturned(sale.invoiceNumber)
    );

    const uniq = [
      ...new Set(availableInvoices.map((s) => s.invoiceNumber).filter(Boolean)),
    ];

    if (uniq.length === 0) {
      return [
        {
          value: "",
          label: "No invoices available for return",
          disabled: true,
        },
      ];
    }

    return [
      { value: "", label: "Select Invoice Number" },
      ...uniq.map((inv) => ({ value: inv, label: inv })),
    ];
  }, [sales, isInvoiceFullyReturned, isSalesEmpty]);

  /* ───── Product Dropdown Options (per row) - FILTERED ───── */
  const productOptions = useMemo(() => {
    return form.products.map((_, idx) => {
      const selected = form.products
        .filter((p, i) => i !== idx && p.productName.trim())
        .map((p) => p.productName);

      const returnedProducts = getReturnedProductsForInvoice(
        form.invoiceNumber
      );

      const options = filteredProducts
        .filter(
          (name) => !selected.includes(name) && !returnedProducts.has(name)
        )
        .map((name) => ({ value: name, label: name }));

      return [{ value: "", label: "Select Product" }, ...options];
    });
  }, [
    form.products,
    form.invoiceNumber,
    filteredProducts,
    getReturnedProductsForInvoice,
  ]);

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
        // Set all product fields from the original sale
        updateProduct(idx, "salesQty", prod.salesQty?.toString() ?? "");
        updateProduct(idx, "bonusQty", prod.bonusQty?.toString() ?? "0");
        updateProduct(idx, "totalQty", prod.totalQty?.toString() ?? "");
        updateProduct(idx, "sellingPrice", prod.sellingPrice?.toString() ?? "");
        updateProduct(idx, "discount", prod.discount?.toString() ?? "0");
        updateProduct(idx, "amount", prod.amount?.toString() ?? "");
        updateProduct(
          idx,
          "netSellingAmount",
          prod.netSellingAmount?.toString() ?? ""
        );
        updateProduct(
          idx,
          "averageUnitPrice",
          prod.averageUnitPrice?.toString() ?? ""
        );
        updateProduct(idx, "lc", prod.lc?.toString() ?? "0");
        updateProduct(idx, "profitLoss", prod.profitLoss?.toString() ?? "0");
        updateProduct(idx, "isProductAccept", false);

        // Trigger recalculation with initial values
        updateProduct(idx, "returnQuantity", "0");

        expandProduct(idx);
      }
    },
    [form.invoiceNumber, sales, updateProduct, expandProduct]
  );

  const getAvailableProductsCount = useCallback(() => {
    const selected = form.products
      .filter((p) => p.productName.trim())
      .map((p) => p.productName);

    const returnedProducts = getReturnedProductsForInvoice(form.invoiceNumber);

    return filteredProducts.filter(
      (p) => !selected.includes(p) && !returnedProducts.has(p)
    ).length;
  }, [
    form.products,
    form.invoiceNumber,
    filteredProducts,
    getReturnedProductsForInvoice,
  ]);

  const isAddReturnSaleEnabled = useMemo(
    () =>
      !isSalesEmpty &&
      isInvoiceDataFetched &&
      areCommonFieldsFilled(form) &&
      hasAtLeastOneProduct(form.products),
    [isSalesEmpty, isInvoiceDataFetched, form, areCommonFieldsFilled, hasAtLeastOneProduct]
  );

  const isAddProductEnabled = useMemo(
    () => !isSalesEmpty && isInvoiceDataFetched && getAvailableProductsCount() > 0,
    [isSalesEmpty, isInvoiceDataFetched, getAvailableProductsCount]
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

      // Filter out already returned products
      const returnedProducts = getReturnedProductsForInvoice(
        form.invoiceNumber
      );
      const availableProds = prods.filter((p) => !returnedProducts.has(p));

      setFilteredProducts(availableProds);
      setLastInvoiceNumber(form.invoiceNumber);

      if (sale) {
        setIsInvoiceDataFetched(true);
        updateFormField("invoiceDate", sale.invoiceDate?.split("T")[0] ?? "");
        updateFormField("mrName", sale.mrName ?? "");
        updateFormField("customerName", sale.customerName ?? "");
        updateFormField("customerId", sale.customerId ?? "");
        updateFormField("creditDays", sale.creditDays ?? 0);
        updateFormField("dueDate", sale.dueDate?.split("T")[0] ?? "");
        updateFormField(
          "deliveryDate",
          sale.deliveryDate?.split("T")[0] ??
            sale.invoiceDate?.split("T")[0] ??
            ""
        );
        updateFormField("totalAmount", sale.totalAmount ?? 0);
        updateFormField("paidAmount", sale.paidAmount ?? 0);
        updateFormField("dueAmount", sale.dueAmount ?? 0);
        updateFormField("paymentStatus", sale.paymentStatus ?? "");
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
    getReturnedProductsForInvoice,
    updateFormField,
  ]);

  /* ───── Fetch Sale Returns ───── */
  const fetchSaleReturn = async () => {
    setLoadingSaleReturns(true);
    try {
      const res = await fetch(`${backendUrl}/api/sales-return`);
      if (!res.ok) throw new Error("Failed to fetch sale returns");
      const data = await res.json();
      setSaleReturns(data.data || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale returns");
    } finally {
      setLoadingSaleReturns(false);
    }
  };

  useEffect(() => {
    fetchSaleReturn();
  }, []);

  /* ───── Fetch Sales ───── */
  const fetchSaleSummaries = async () => {
    setLoadingSales(true);
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sales");
      const data = await res.json();
      setSales(Array.isArray(data.summaries) ? data.summaries : []);
    } catch (err) {
      console.error(err);
      showToast("error", err.message || "Error loading sales");
      setSales([]);
    } finally {
      setLoadingSales(false);
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  /* ───── Submit ───── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSalesEmpty) {
      showToast("error", "Cannot add return sale. No sales data available.");
      return;
    }

    if (!validate()) return;

    const validProds = form.products.filter((p) => p.productName.trim());
    if (!validProds.length) {
      showToast("error", "Add at least one product");
      return;
    }

    // Create payload with products array structure
    const payload = {
      recordingDate: form.recordingDate,
      invoiceNumber: form.invoiceNumber,
      invoiceDate: form.invoiceDate,
      mrName: form.mrName,
      customerName: form.customerName,
      customerId: form.customerId,
      products: validProds.map((p) => ({
        productName: p.productName,
        salesQty: parseNumber(p.salesQty),
        bonusQty: parseNumber(p.bonusQty),
        totalQty: parseNumber(p.totalQty),
        sellingPrice: parseNumber(p.sellingPrice),
        amount: parseNumber(p.amount),
        discount: parseNumber(p.discount),
        netSellingAmount: parseNumber(p.netSellingAmount),
        averageUnitPrice: parseNumber(p.averageUnitPrice),
        lc: parseNumber(p.lc),
        profitLoss: parseNumber(p.profitLoss),
        returnQuantity: parseNumber(p.returnQuantity),
        usedQty: parseNumber(p.usedQty),
        usedPrice: parseNumber(p.usedPrice),
        usedAmount: parseNumber(p.usedAmount),
        isProductAccept: false,
      })),
      creditDays: parseNumber(form.creditDays),
      dueDate: form.dueDate,
      deliveryDate: form.deliveryDate,
      paidAmount: parseNumber(form.paidAmount),
      dueAmount: parseNumber(form.dueAmount),
      totalAmount: parseNumber(form.totalAmount),
      paymentStatus: form.paymentStatus,
      remark: form.remark,
    };

    try {
      const res = await fetch(`${backendUrl}/api/sales-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");
      showToast("success", json.message || "Return sale added successfully");
      navigate("/salelayout/salereturn");
    } catch (err) {
      console.error(err);
      showToast("error", err.message);
    }
  };

  if (loading) return <LoadingOverlay text="Please wait..." />;

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
          {!isSalesEmpty && isInvoiceDataFetched && (
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

      {/* Warning message if sales data is empty */}
      {isSalesEmpty && (
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
                No Sales Data Available
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>
                  You need to add at least one sale before creating return sales. 
                  Add sales in the sales management section first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

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
          loading={loadingSales || loadingSaleReturns}
          disabled={
            isSalesEmpty ||
            loadingSales ||
            loadingSaleReturns ||
            (invoiceOptions.length === 1 && invoiceOptions[0].disabled)
          }
        />
        <DatePickerField
          label="Recording Date"
          name="recordingDate"
          value={form.recordingDate}
          onChange={handleRecordingDateChange}
          error={errors.recordingDate}
          required
          maxDate={new Date()}
          disabled={isSalesEmpty}
        />

        <DatePickerField
          label="Invoice Date"
          name="invoiceDate"
          value={form.invoiceDate}
          onChange={enhancedHandleChange}
          error={errors.invoiceDate}
          readOnly
          disabled={isSalesEmpty}
        />
        <InputField
          label="Medical Representative Name"
          name="mrName"
          value={form.mrName}
          onChange={enhancedHandleChange}
          error={errors.mrName}
          readOnly
          disabled={isSalesEmpty}
        />
        <InputField
          label="Customer Name"
          name="customerName"
          value={form.customerName}
          onChange={enhancedHandleChange}
          readOnly
          disabled={isSalesEmpty}
        />
        <InputField
          label="Credit Days"
          name="creditDays"
          value={form.creditDays}
          onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
          type="text"
          readOnly
          disabled={isSalesEmpty}
        />
      </div>

      {/* Payment Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <InputField
          label="Total Amount"
          name="totalAmount"
          value={form.totalAmount}
          readOnly
          className="bg-gray-100 font-semibold"
          disabled={isSalesEmpty}
        />
        <InputField
          label="Paid Amount"
          name="paidAmount"
          type="text"
          value={form.paidAmount}
          onChange={(e) => handleNumericInputChange(e, enhancedHandleChange)}
          error={errors.paidAmount}
          disabled={isSalesEmpty}
        />
        <InputField
          label="Due Amount"
          name="dueAmount"
          value={form.dueAmount}
          readOnly
          disabled={isSalesEmpty}
        />
        <DatePickerField
          label="Due Date"
          name="dueDate"
          value={form.dueDate}
          onChange={enhancedHandleChange}
          readOnly
          disabled={isSalesEmpty}
        />
        <DatePickerField
          label="Delivery Date"
          name="deliveryDate"
          value={form.deliveryDate}
          onChange={enhancedHandleChange}
          readOnly
          disabled={isSalesEmpty}
        />
        <InputField
          label="Payment Status*"
          name="paymentStatus"
          value={form.paymentStatus}
          readOnly
          className="bg-blue-50"
          disabled={isSalesEmpty}
        />
      </div>

      {/* Products */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Return Products</h3>
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
                  disabled={isSalesEmpty || !isInvoiceDataFetched}
                />
              </div>
              <div className="flex gap-2 mt-5">
                {prod.productName && (
                  <button
                    type="button"
                    onClick={() => toggleView(idx)}
                    disabled={isSalesEmpty}
                    className={`px-3 py-1 border rounded ${
                      isSalesEmpty
                        ? "text-gray-400 border-gray-400 cursor-not-allowed"
                        : "text-blue-600 border-blue-600"
                    }`}
                  >
                    {isProductExpanded(idx) ? "Hide Details" : "Show Details"}
                  </button>
                )}
                {form.products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(idx)}
                    disabled={isSalesEmpty}
                    className={`px-3 py-1 border rounded ${
                      isSalesEmpty
                        ? "text-gray-400 border-gray-400 cursor-not-allowed"
                        : "text-red-600 border-red-600"
                    }`}
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
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Sales Quantity"
                    value={prod.salesQty}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Bonus Quantity"
                    value={prod.bonusQty}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Total Quantity"
                    value={prod.totalQty}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Quantity"
                    value={prod.usedQty}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Selling Price"
                    value={prod.sellingPrice}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField 
                    label="Amount" 
                    value={prod.amount} 
                    readOnly 
                    disabled={isSalesEmpty}
                  />
                  <InputField 
                    label="Discount" 
                    value={prod.discount} 
                    readOnly 
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Net Selling Amount"
                    value={prod.netSellingAmount}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Average Unit Price"
                    value={prod.averageUnitPrice}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField 
                    label="LC" 
                    value={prod.lc} 
                    readOnly 
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Profit/Loss"
                    value={prod.profitLoss}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Price"
                    value={prod.usedPrice}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Amount"
                    value={prod.usedAmount}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Remark */}
      <div className="mb-6">
        <TextAreaField
          label="Remark"
          name="remark"
          value={form.remark}
          onChange={enhancedHandleChange}
          rows={2}
          disabled={isSalesEmpty}
        />
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