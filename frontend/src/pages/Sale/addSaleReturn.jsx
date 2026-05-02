import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useInitialSaleData } from "./IntialLoading.jsx";
import { PlusSquare } from "lucide-react";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import LoadingOverlay from "../../components/Loading.jsx";

// Utility function for numeric input validation
const handleNumericInputChange = (e, onChange) => {
  const { name, value } = e.target;
  if (value === "" || /^\d*\.?\d*$/.test(value)) {
    onChange({
      target: {
        name,
        value: value === "" ? "" : parseFloat(value) || 0,
      },
    });
  }
};

const parseNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

const INITIAL_PRODUCT_STATE = {
  productName: "",
  salesQty: 0,
  returnQuantity: 0,
  usedQty: 0,
  sellingPrice: 0,
  amount: 0,
  discount: 0,
  netSellingAmount: 0,
  usedPrice: 0,
  usedAmount: 0,
  bonusQty: 0,
  totalQty: 0,
  averageUnitPrice: 0,
  lc: 0,
  profitLoss: 0,
  isProductAccept: false,
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: new Date().toISOString().split("T")[0],
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
    [],
  );
  const isProductExpanded = useCallback(
    (i) => expandedProductIndex === i,
    [expandedProductIndex],
  );

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
    (prods) => prods.some((p) => p.productName && p.productName.trim()),
    [],
  );

  const calculateProductFields = useCallback((prod) => {
    const salesQty = parseNumber(prod.salesQty);
    const returnQty = parseNumber(prod.returnQuantity);
    const bonusQty = parseNumber(prod.bonusQty);
    const sellingPrice = parseNumber(prod.sellingPrice);
    const discount = parseNumber(prod.discount);
    const lc = parseNumber(prod.lc);

    const validReturn = Math.min(returnQty, salesQty);
    const usedQty = Math.max(salesQty - validReturn, 0);
    const totalQty = usedQty + bonusQty;

    const amount = usedQty * sellingPrice;
    const netSellingAmount = amount - discount;
    const usedAmount = usedQty * sellingPrice;
    const averageUnitPrice = totalQty > 0 ? netSellingAmount / totalQty : 0;
    const profitLoss = netSellingAmount - usedQty * lc;

    return {
      ...prod,
      returnQuantity: validReturn,
      usedQty: usedQty,
      totalQty: totalQty,
      amount: amount,
      netSellingAmount: netSellingAmount,
      usedAmount: usedAmount,
      averageUnitPrice: averageUnitPrice,
      profitLoss: profitLoss,
      isProductAccept: false,
    };
  }, []);

  const updateProduct = useCallback(
    (idx, field, value) => {
      setForm((prev) => {
        const prods = [...prev.products];
        const numValue = field === "productName" ? value : parseNumber(value);
        prods[idx] = { ...prods[idx], [field]: numValue };

        if (
          field === "returnQuantity" ||
          field === "discount" ||
          field === "lc" ||
          field === "salesQty" ||
          field === "sellingPrice"
        ) {
          const recalculated = prods.map((p) => calculateProductFields(p));
          const total = recalculated.reduce(
            (s, p) => s + parseNumber(p.netSellingAmount),
            0,
          );
          const paid = parseNumber(prev.paidAmount);
          const due = Math.max(0, total - paid);

          return {
            ...prev,
            products: recalculated,
            totalAmount: total,
            dueAmount: due,
          };
        }

        return {
          ...prev,
          products: prods,
        };
      });
    },
    [calculateProductFields],
  );

  const calculateDerivedFields = useCallback((name, value, cur) => {
    const upd = { ...cur, [name]: value };

    if (name === "paidAmount") {
      const tot = parseNumber(cur.totalAmount);
      const paid = parseNumber(value);
      upd.dueAmount = Math.max(0, tot - paid);
    }

    if (
      (name === "creditDays" && cur.invoiceDate) ||
      (name === "invoiceDate" && cur.creditDays)
    ) {
      const creditDays = parseNumber(
        name === "creditDays" ? value : cur.creditDays,
      );
      const invoiceDate = name === "invoiceDate" ? value : cur.invoiceDate;
      if (invoiceDate && creditDays > 0) {
        const dueDateObj = new Date(invoiceDate);
        dueDateObj.setDate(dueDateObj.getDate() + creditDays);
        upd.dueDate = dueDateObj.toISOString().split("T")[0];
      }
    }

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
    [calculateDerivedFields],
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
      if (!form[k] || form[k].toString().trim() === "") {
        err[k] = `${k.replace(/([A-Z])/g, " $1")} is required`;
      }
    });

    form.products.forEach((p, i) => {
      if (!p.productName || p.productName.trim() === "")
        err[`productName_${i}`] = `Product ${i + 1} required`;
      const returnQty = parseNumber(p.returnQuantity);
      if (returnQty < 0)
        err[`returnQuantity_${i}`] = `Return quantity cannot be negative`;

      const salesQty = parseNumber(p.salesQty);
      if (returnQty > salesQty)
        err[`returnQuantity_${i}`] =
          "Return quantity cannot exceed sales quantity";

      const sellingPrice = parseNumber(p.sellingPrice);
      if (sellingPrice <= 0 && p.productName)
        err[`sellingPrice_${i}`] = `Selling price must be greater than 0`;
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
    [expandedProductIndex, collapseAllProducts],
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
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        readOnly={readOnly || disabled}
        disabled={disabled}
        className={`border rounded-md px-3 py-2 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
        autoComplete="off"
        tabIndex={readOnly || disabled ? -1 : 0}
        {...p}
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  ),
);

const TextAreaField = React.memo(
  ({ label, name, value, onChange, error, rows = 2, disabled = false }) => (
    <div className="flex flex-col">
      <label className="text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea
        name={name}
        value={value || ""}
        onChange={onChange}
        rows={rows}
        disabled={disabled}
        className={`border rounded-md px-3 py-2 ${
          error ? "border-red-500" : "border-gray-300"
        } ${disabled ? "bg-gray-100 cursor-not-allowed" : ""}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  ),
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
        } ${readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""} ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  ),
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
  const [submitting, setSubmitting] = useState(false);
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
    isProductExpanded,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    addProduct,
    removeProduct,
  } = useReturnSaleForm();

  const { loading } = useInitialSaleData();

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

  const getTotalReturnedQuantityForProduct = useCallback(
    (invoiceNumber, productName) => {
      if (!invoiceNumber || !productName) return 0;

      const returnsForInvoice = saleReturns.filter(
        (sr) => sr.invoiceNumber === invoiceNumber,
      );

      let totalReturned = 0;
      returnsForInvoice.forEach((returnItem) => {
        returnItem.products.forEach((product) => {
          if (product.productName === productName) {
            totalReturned += product.returnQuantity || 0;
          }
        });
      });

      return totalReturned;
    },
    [saleReturns],
  );

  const getRemainingQuantityForProduct = useCallback(
    (invoiceNumber, productName, originalSalesQty) => {
      const returnedQty = getTotalReturnedQuantityForProduct(
        invoiceNumber,
        productName,
      );
      return Math.max(0, originalSalesQty - returnedQty);
    },
    [getTotalReturnedQuantityForProduct],
  );

  const getReturnedProductsMap = useCallback(
    (invoiceNumber) => {
      if (!invoiceNumber) return new Map();

      const returnsForInvoice = saleReturns.filter(
        (sr) => sr.invoiceNumber === invoiceNumber,
      );
      const returnedMap = new Map();

      returnsForInvoice.forEach((returnItem) => {
        returnItem.products.forEach((product) => {
          if (product.productName && product.returnQuantity > 0) {
            const currentReturned = returnedMap.get(product.productName) || 0;
            returnedMap.set(
              product.productName,
              currentReturned + product.returnQuantity,
            );
          }
        });
      });

      return returnedMap;
    },
    [saleReturns],
  );

  const isInvoiceFullyReturned = useCallback(
    (invoiceNumber) => {
      if (!invoiceNumber) return false;

      const sale = sales.find((s) => s.invoiceNumber === invoiceNumber);
      if (!sale || !sale.products) return false;

      const returnedMap = getReturnedProductsMap(invoiceNumber);

      return sale.products.every((product) => {
        const returnedQty = returnedMap.get(product.productName) || 0;
        return returnedQty >= (product.salesQty || 0);
      });
    },
    [sales, getReturnedProductsMap],
  );

  const isProductFullyReturned = useCallback(
    (invoiceNumber, productName, salesQty) => {
      if (!invoiceNumber || !productName) return false;
      const returnedQty = getTotalReturnedQuantityForProduct(
        invoiceNumber,
        productName,
      );
      return returnedQty >= (salesQty || 0);
    },
    [getTotalReturnedQuantityForProduct],
  );

  const invoiceOptions = useMemo(() => {
    if (isSalesEmpty) {
      return [{ value: "", label: "No Invoices Available", disabled: true }];
    }

    if (!Array.isArray(sales) || sales.length === 0) {
      return [{ value: "", label: "Loading invoices...", disabled: true }];
    }

    const availableInvoices = sales.filter(
      (sale) => !isInvoiceFullyReturned(sale.invoiceNumber),
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

  // FIXED: productOptions - shows only products with pending quantity
  const productOptions = useMemo(() => {
    return form.products.map((_, idx) => {
      const selectedProducts = form.products
        .filter((p, i) => i !== idx && p.productName && p.productName.trim())
        .map((p) => p.productName);

      const options = [];

      filteredProducts.forEach((productInfo) => {
        const isAlreadySelected = selectedProducts.includes(productInfo.name);
        const remainingQty = productInfo.remainingQty || 0;

        if (!isAlreadySelected && remainingQty > 0) {
          options.push({
            value: productInfo.name,
            label: `${productInfo.name} (Available: ${remainingQty} ${remainingQty === 1 ? "box" : "boxes"})`,
            remainingQty: remainingQty,
          });
        }
      });

      return [
        { value: "", label: "Select Product", disabled: false },
        ...options,
      ];
    });
  }, [form.products, form.invoiceNumber, filteredProducts]);

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

  const enhancedHandleChange = useCallback(
    (e) => handleChange(e),
    [handleChange],
  );

  const handleProductNameSelect = useCallback(
    (idx, selectedName) => {
      if (!selectedName) return;

      const productInfo = filteredProducts.find((p) => p.name === selectedName);
      if (!productInfo) return;

      updateProduct(idx, "productName", selectedName);
      updateProduct(idx, "salesQty", productInfo.salesQty || 0);
      updateProduct(idx, "bonusQty", productInfo.bonusQty || 0);
      updateProduct(idx, "totalQty", productInfo.totalQty || 0);
      updateProduct(idx, "sellingPrice", productInfo.sellingPrice || 0);
      updateProduct(idx, "discount", productInfo.discount || 0);
      updateProduct(idx, "amount", productInfo.amount || 0);
      updateProduct(idx, "netSellingAmount", productInfo.netSellingAmount || 0);
      updateProduct(idx, "averageUnitPrice", productInfo.averageUnitPrice || 0);
      updateProduct(idx, "lc", productInfo.lc || 0);
      updateProduct(idx, "profitLoss", productInfo.profitLoss || 0);
      updateProduct(idx, "returnQuantity", 0);

      expandProduct(idx);
    },
    [filteredProducts, updateProduct, expandProduct],
  );

  const getAvailableProductsCount = useCallback(() => {
    let count = 0;
    filteredProducts.forEach((productInfo) => {
      const isAlreadySelected = form.products.some(
        (p) => p.productName === productInfo.name && p.productName.trim(),
      );
      const remainingQty = productInfo.remainingQty || 0;

      if (!isAlreadySelected && remainingQty > 0) {
        count++;
      }
    });
    return count;
  }, [form.products, filteredProducts]);

  const isAddReturnSaleEnabled = useMemo(
    () =>
      !isSalesEmpty &&
      isInvoiceDataFetched &&
      areCommonFieldsFilled(form) &&
      hasAtLeastOneProduct(form.products),
    [
      isSalesEmpty,
      isInvoiceDataFetched,
      form,
      areCommonFieldsFilled,
      hasAtLeastOneProduct,
    ],
  );

  const isAddProductEnabled = useMemo(
    () =>
      !isSalesEmpty && isInvoiceDataFetched && getAvailableProductsCount() > 0,
    [isSalesEmpty, isInvoiceDataFetched, getAvailableProductsCount],
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
    [sales],
  );

  const handleInvoiceNumberSelect = useCallback(
    (inv) => updateFormField("invoiceNumber", inv),
    [updateFormField],
  );

  const handleRecordingDateChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField],
  );

  useEffect(() => {
    if (form.invoiceNumber && form.invoiceNumber !== lastInvoiceNumber) {
      const sale = filterSalesByInvoice(form.invoiceNumber);
      const returnedMap = getReturnedProductsMap(form.invoiceNumber);

      const productsInfo = [];
      if (sale && sale.products) {
        sale.products.forEach((product) => {
          const returnedQty = returnedMap.get(product.productName) || 0;
          const remainingQty = Math.max(
            0,
            (product.salesQty || 0) - returnedQty,
          );

          productsInfo.push({
            name: product.productName,
            salesQty: product.salesQty || 0,
            bonusQty: product.bonusQty || 0,
            totalQty: product.totalQty || 0,
            sellingPrice: product.sellingPrice || 0,
            discount: product.discount || 0,
            amount: product.amount || 0,
            netSellingAmount: product.netSellingAmount || 0,
            averageUnitPrice: product.averageUnitPrice || 0,
            lc: product.lc || 0,
            profitLoss: product.profitLoss || 0,
            remainingQty: remainingQty,
          });
        });
      }

      setFilteredProducts(productsInfo);
      setLastInvoiceNumber(form.invoiceNumber);

      if (sale) {
        setIsInvoiceDataFetched(true);
        updateFormField("invoiceDate", sale.invoiceDate?.split("T")[0] || "");
        updateFormField("mrName", sale.mrName || "");
        updateFormField("customerName", sale.customerName || "");
        updateFormField("customerId", sale.customerId || "");
        updateFormField("creditDays", sale.creditDays || 0);
        updateFormField("dueDate", sale.dueDate?.split("T")[0] || "");
        updateFormField(
          "deliveryDate",
          sale.deliveryDate?.split("T")[0] ||
            sale.invoiceDate?.split("T")[0] ||
            "",
        );
        updateFormField("totalAmount", sale.totalAmount || 0);
        updateFormField("paidAmount", sale.paidAmount || 0);
        updateFormField("dueAmount", sale.dueAmount || 0);
        updateFormField("paymentStatus", sale.paymentStatus || "");
        updateFormField("remark", sale.remark || "");
        updateFormField("products", [{ ...INITIAL_PRODUCT_STATE }]);
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
    getReturnedProductsMap,
    updateFormField,
  ]);

  const fetchSaleReturn = async () => {
    setLoadingSaleReturns(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${backendUrl}/api/sales-return`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

  const fetchSaleSummaries = async () => {
    setLoadingSales(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${backendUrl}/api/sales/all`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (submitting) return;

    if (isSalesEmpty) {
      showToast("error", "Cannot add return sale. No sales data available.");
      return;
    }

    if (!validate()) {
      showToast("error", "Please fix the validation errors");
      return;
    }

    const validProds = form.products.filter(
      (p) => p.productName && p.productName.trim(),
    );
    if (!validProds.length) {
      showToast("error", "Add at least one product");
      return;
    }

    for (const prod of validProds) {
      const returnQty = parseNumber(prod.returnQuantity);
      const salesQty = parseNumber(prod.salesQty);
      if (returnQty > salesQty) {
        showToast(
          "error",
          `Return quantity for ${prod.productName} cannot exceed sales quantity`,
        );
        return;
      }

      const remainingQty = getRemainingQuantityForProduct(
        form.invoiceNumber,
        prod.productName,
        salesQty,
      );
      if (returnQty > remainingQty) {
        showToast(
          "error",
          `Cannot return ${returnQty} of ${prod.productName}. Only ${remainingQty} remaining available for return.`,
        );
        return;
      }
    }

    setSubmitting(true);

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
        discount: parseNumber(p.discount) || 0,
        netSellingAmount: parseNumber(p.netSellingAmount),
        averageUnitPrice: parseNumber(p.averageUnitPrice),
        lc: parseNumber(p.lc) || 0,
        profitLoss: parseNumber(p.profitLoss),
        returnQuantity: parseNumber(p.returnQuantity),
        usedQty: parseNumber(p.usedQty),
        usedPrice: parseNumber(p.usedPrice) || parseNumber(p.sellingPrice),
        usedAmount: parseNumber(p.usedAmount),
        isProductAccept: false,
      })),
      creditDays: parseNumber(form.creditDays),
      dueDate: form.dueDate,
      deliveryDate: form.deliveryDate || form.invoiceDate,
      paidAmount: parseNumber(form.paidAmount),
      dueAmount: parseNumber(form.dueAmount),
      totalAmount: parseNumber(form.totalAmount),
      paymentStatus: form.paymentStatus || "Credit",
      remark: form.remark || "",
    };

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${backendUrl}/api/sales-return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || json.error || "Submit failed");
      }

      showToast("success", json.message || "Return sale added successfully");
      navigate("/salelayout/salereturn");
    } catch (err) {
      console.error("Submit error:", err);
      showToast("error", err.message || "Failed to add return sale");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      <input type="hidden" name="customerId" value={form.customerId || ""} />

      <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
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
                  You need to add at least one sale before creating return
                  sales. Add sales in the sales management section first.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Returns Summary Box */}
      {!isSalesEmpty && isInvoiceDataFetched && filteredProducts.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-800">
            📦 Pending Returns Summary:
            <span className="ml-2 font-bold">
              {filteredProducts.reduce(
                (total, p) => total + (p.remainingQty || 0),
                0,
              )}{" "}
              boxes total
            </span>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Available products for return: {getAvailableProductsCount()}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredProducts
              .filter((p) => p.remainingQty > 0)
              .map((p) => (
                <span
                  key={p.name}
                  className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full"
                >
                  {p.name}: {p.remainingQty}{" "}
                  {p.remainingQty === 1 ? "box" : "boxes"} pending
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <SearchableDropdown
          label="Invoice Number"
          value={form.invoiceNumber}
          onChange={handleInvoiceNumberSelect}
          options={invoiceOptions}
          placeholder="Select Invoice Number"
          required
          error={errors.invoiceNumber}
          loading={loadingSales || loadingSaleReturns}
          disabled={isSalesEmpty || loadingSales || loadingSaleReturns}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <InputField
          label="Total Amount"
          name="totalAmount"
          value={parseNumber(form.totalAmount).toFixed(2)}
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
          value={parseNumber(form.dueAmount).toFixed(2)}
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

      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Return Products</h3>
        {form.products.map((prod, idx) => (
          <div key={idx} className="border p-4 mb-4 rounded shadow-sm">
            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
              <div className="flex-1 min-w-[200px]">
                <SearchableDropdown
                  label="Product Name"
                  value={prod.productName || ""}
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
                        : "text-blue-600 border-blue-600 hover:bg-blue-50"
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
                        : "text-red-600 border-red-600 hover:bg-red-50"
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
                    value={prod.returnQuantity || 0}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d*$/.test(v)) {
                        const value = v === "" ? 0 : parseNumber(v);
                        const maxReturn = getRemainingQuantityForProduct(
                          form.invoiceNumber,
                          prod.productName,
                          prod.salesQty,
                        );
                        if (value <= maxReturn) {
                          updateProduct(
                            idx,
                            "returnQuantity",
                            v === "" ? 0 : v,
                          );
                        } else {
                          showToast(
                            "warning",
                            `Maximum return quantity is ${maxReturn}`,
                          );
                        }
                      }
                    }}
                    error={errors[`returnQuantity_${idx}`]}
                    required
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Sales Quantity"
                    value={prod.salesQty || 0}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Remaining Quantity"
                    value={getRemainingQuantityForProduct(
                      form.invoiceNumber,
                      prod.productName,
                      prod.salesQty,
                    )}
                    readOnly
                    disabled={isSalesEmpty}
                    className="bg-yellow-50 font-semibold"
                  />
                  <InputField
                    label="Bonus Quantity"
                    value={prod.bonusQty || 0}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Total Quantity"
                    value={prod.totalQty || 0}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Quantity"
                    value={prod.usedQty || 0}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Selling Price"
                    value={parseNumber(prod.sellingPrice).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Amount"
                    value={parseNumber(prod.amount).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Discount"
                    value={parseNumber(prod.discount).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Net Selling Amount"
                    value={parseNumber(prod.netSellingAmount).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Average Unit Price"
                    value={parseNumber(prod.averageUnitPrice).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="LC"
                    value={parseNumber(prod.lc).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Profit/Loss"
                    value={parseNumber(prod.profitLoss).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Price"
                    value={parseNumber(prod.usedPrice).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                  <InputField
                    label="Used Amount"
                    value={parseNumber(prod.usedAmount).toFixed(2)}
                    readOnly
                    disabled={isSalesEmpty}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mb-6">
        <TextAreaField
          label="Remark"
          name="remark"
          value={form.remark || ""}
          onChange={enhancedHandleChange}
          rows={2}
          disabled={isSalesEmpty}
        />
      </div>

      <div className="flex justify-end mt-6 gap-3">
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={!isAddReturnSaleEnabled || submitting}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg shadow transition-colors ${
            isAddReturnSaleEnabled && !submitting
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          {submitting ? "Submitting..." : "Add Return Sale"}
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
