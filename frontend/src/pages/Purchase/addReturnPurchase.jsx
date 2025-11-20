import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_FORM_STATE = {
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  productId: "",
  productName: "",
  supplierId: "",
  supplierName: "",
  purchaseQty: 0,
  returnQuantity: 0,
  usedQty: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  amount: 0,
  returnAmount: 0,
  remarks: "",
  returnReason: "",
  expiredDate: "",
};

// Define numeric fields for proper handling
const NUMERIC_FIELDS = [
  "purchaseQty",
  "returnQuantity",
  "usedQty",
  "fob",
  "cif",
  "amount",
  "returnAmount",
];

// Custom hook for form state management
const useReturnForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [showInvoiceSuggestions, setShowInvoiceSuggestions] = useState(false);
  const [filteredPurchases, setFilteredPurchases] = useState([]);
  const [loading, setLoading] = useState({
    products: false,
    suppliers: false,
    purchases: false,
  });
  console.log("filteredPurchases", filteredPurchases);
  const [isPurchasesEmpty, setIsPurchasesEmpty] = useState(false);
  const [isProductsEmpty, setIsProductsEmpty] = useState(false);
  const [isSuppliersEmpty, setIsSuppliersEmpty] = useState(false);
  const isPurchasesEmptyRef = useRef(false);
  const isProductsEmptyRef = useRef(false);
  const isSuppliersEmptyRef = useRef(false);

  const parseNumber = useCallback((val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }, []);

  // Calculate return amount when return quantity or unit price changes
  useEffect(() => {
    const returnQty = parseNumber(form.returnQuantity);
    const purchaseQty = parseNumber(form.purchaseQty);
    const totalAmount = parseNumber(form.amount);

    // Calculate unit price
    const unitPrice = purchaseQty > 0 ? totalAmount / purchaseQty : 0;

    // Calculate return amount
    const calculatedReturnAmount = returnQty * unitPrice;
    const roundedReturnAmount = Math.round(calculatedReturnAmount * 100) / 100;

    setForm((prev) => ({
      ...prev,
      returnAmount: roundedReturnAmount,
    }));
  }, [form.returnQuantity, form.purchaseQty, form.amount, parseNumber]);

  console.log('setFilteredPurchases', purchases);
  // Filter purchases based on invoice number input
  const filterPurchases = (searchValue) => {
    // Extract the purchases array from the response object
    const purchasesArray = purchases.purchases || purchases || [];
    
    if (!searchValue.trim()) {
      setFilteredPurchases(purchasesArray);
      return;
    }

    const filtered = purchasesArray.filter(
      (purchase) =>
        purchase.invoiceNumber
          ?.toLowerCase()
          .includes(searchValue.toLowerCase()) ||
        purchase.productName
          ?.toLowerCase()
          .includes(searchValue.toLowerCase()) ||
        purchase.supplierName?.toLowerCase().includes(searchValue.toLowerCase())
    );
    console.log("filtered", filtered);
    setFilteredPurchases(filtered);
  };

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      let processedValue = value;

      // Handle numeric fields - keep as strings for text fields
      if (NUMERIC_FIELDS.includes(name)) {
        // Allow only numbers and decimal point
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          processedValue = value; // Keep as string for text input
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

  // Handle invoice number change - auto-fill purchase data with suggestions
  const handleInvoiceNumberChange = useCallback(
    (e) => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, invoiceNumber: value }));

      // Show suggestions and filter
      setShowInvoiceSuggestions(true);
      filterPurchases(value);

      // Extract purchases array from response object
      const purchasesArray = purchases.purchases || purchases || [];
      
      // Find exact match for auto-fill
      const purchase = purchasesArray.find(
        (p) => p.invoiceNumber?.toLowerCase() === value.toLowerCase()
      );

      if (purchase) {
        setForm((prev) => ({
          ...prev,
          invoiceDate: purchase.invoiceDate || "",
          deliveryNumber: purchase.deliveryNumber || "",
          receivedDate: purchase.receivedDate || "",
          productId: purchase.productId || "",
          productName: purchase.productName || "",
          supplierId: purchase.supplierId || "",
          supplierName: purchase.supplierName || "",
          purchaseQty: purchase.quantityPerBoxStrip || purchase.qtyBox || 0,
          fob: purchase.fob || 0,
          cif: purchase.cif || 0,
          lcNumber: purchase.lcNumber || "",
          amount: purchase.amount || 0,
          expiredDate: purchase.expiredDate || purchase.expiryDate || "",
        }));
      }

      // Clear error when user starts typing
      if (errors.invoiceNumber) {
        setErrors((prev) => ({ ...prev, invoiceNumber: "" }));
      }
    },
    [purchases, errors]
  );

  // Handle invoice selection from suggestions
  const handleInvoiceSelect = (purchase) => {
    setForm((prev) => ({
      ...prev,
      invoiceNumber: purchase.invoiceNumber,
      invoiceDate: purchase.invoiceDate || "",
      deliveryNumber: purchase.deliveryNumber || "",
      receivedDate: purchase.receivedDate || "",
      productId: purchase.productId || "",
      productName: purchase.productName || "",
      supplierId: purchase.supplierId || "",
      supplierName: purchase.supplierName || "",
      purchaseQty: purchase.quantityPerBoxStrip || purchase.qtyBox || 0,
      fob: purchase.fob || 0,
      cif: purchase.cif || 0,
      lcNumber: purchase.lcNumber || "",
      amount: purchase.amount || 0,
      expiredDate: purchase.expiredDate || purchase.expiryDate || "",
    }));
    setShowInvoiceSuggestions(false);
  };

  // Handle product selection from dropdown
  const handleProductChange = useCallback(
    (productId) => {
      const selectedProduct = products.find(
        (product) => product.value === productId
      );
      if (selectedProduct) {
        setForm((prev) => ({
          ...prev,
          productId: selectedProduct.value,
          productName: selectedProduct.label,
        }));

        // Clear product error
        if (errors.productId) {
          setErrors((prev) => ({ ...prev, productId: "" }));
        }
      }
    },
    [products, errors]
  );

  // Handle supplier selection from dropdown
  const handleSupplierChange = useCallback(
    (supplierId) => {
      const selectedSupplier = suppliers.find(
        (supplier) => supplier.value === supplierId
      );
      if (selectedSupplier) {
        setForm((prev) => ({
          ...prev,
          supplierId: selectedSupplier.value,
          supplierName: selectedSupplier.label,
        }));

        // Clear supplier error
        if (errors.supplierId) {
          setErrors((prev) => ({ ...prev, supplierId: "" }));
        }
      }
    },
    [suppliers, errors]
  );

  const validate = useCallback(() => {
    const newErrors = {};

    if (!form.invoiceNumber?.trim())
      newErrors.invoiceNumber = "Invoice number is required";
    if (!form.productId) newErrors.productId = "Product is required";
    if (!form.supplierId) newErrors.supplierId = "Supplier is required";
    if (!form.deliveryNumber?.trim())
      newErrors.deliveryNumber = "Delivery number is required";
    if (!form.invoiceDate) newErrors.invoiceDate = "Invoice date is required";
    if (!form.receivedDate)
      newErrors.receivedDate = "Received date is required";
    if (!form.recordingDate)
      newErrors.recordingDate = "Recording date is required";
    if (!form.returnReason?.trim())
      newErrors.returnReason = "Return reason is required";

    // Convert to numbers for numeric validation
    const purchaseQtyNum = parseNumber(form.purchaseQty);
    const returnQtyNum = parseNumber(form.returnQuantity);

    const amountNum = parseNumber(form.amount);
    const returnAmountNum = parseNumber(form.returnAmount);

    if (purchaseQtyNum <= 0)
      newErrors.purchaseQty = "Purchase quantity must be greater than 0";
    if (returnQtyNum <= 0)
      newErrors.returnQuantity = "Return quantity must be greater than 0";
    if (returnQtyNum > purchaseQtyNum)
      newErrors.returnQuantity =
        "Return quantity cannot exceed purchase quantity";

    if (amountNum < 0) newErrors.amount = "Amount cannot be negative";
    if (returnAmountNum < 0)
      newErrors.returnAmount = "Return amount cannot be negative";
    if (returnAmountNum > amountNum)
      newErrors.returnAmount = "Return amount cannot exceed original amount";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, parseNumber]);

  // Fetch products with proper error handling
  const fetchProducts = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, products: true }));
      const response = await axios.get(`${backendUrl}/api/products`);
      const productsData = response.data || [];

      // Transform to SearchableDropdown format
      const transformedProducts = productsData.map((product) => ({
        value: product._id,
        label: product.productName,
      }));

      setProducts(transformedProducts);

      if (transformedProducts.length === 0) {
        if (!isProductsEmptyRef.current) {
          setIsProductsEmpty(true);
          isProductsEmptyRef.current = true;
        }
      } else {
        setIsProductsEmpty(false);
        isProductsEmptyRef.current = false;
      }
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setProducts([]);
      setIsProductsEmpty(true);
      isProductsEmptyRef.current = true;
    } finally {
      setLoading((prev) => ({ ...prev, products: false }));
    }
  }, []);

  // Fetch suppliers with proper error handling
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, suppliers: true }));
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      const suppliersData = response.data || [];

      // Transform to SearchableDropdown format
      const transformedSuppliers = suppliersData.map((supplier) => ({
        value: supplier._id,
        label: supplier.supplierName || supplier.name,
      }));

      setSuppliers(transformedSuppliers);

      if (transformedSuppliers.length === 0) {
        if (!isSuppliersEmptyRef.current) {
          setIsSuppliersEmpty(true);
          isSuppliersEmptyRef.current = true;
        }
      } else {
        setIsSuppliersEmpty(false);
        isSuppliersEmptyRef.current = false;
      }
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
      setSuppliers([]);
      setIsSuppliersEmpty(true);
      isSuppliersEmptyRef.current = true;
    } finally {
      setLoading((prev) => ({ ...prev, suppliers: false }));
    }
  }, []);

  // Fetch purchases for auto-fill
  const fetchPurchases = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, purchases: true }));
      const response = await axios.get(`${backendUrl}/api/purchase`);
      
      // Handle different response formats
      let purchaseData = [];
      if (response.data && response.data.purchases) {
        purchaseData = response.data.purchases;
      } else if (response.data && Array.isArray(response.data)) {
        purchaseData = response.data;
      } else if (response.data && response.data.reports) {
        purchaseData = response.data.reports;
      }

      setPurchases(purchaseData);
      setFilteredPurchases(purchaseData);

      if (purchaseData.length === 0) {
        if (!isPurchasesEmptyRef.current) {
          setIsPurchasesEmpty(true);
          isPurchasesEmptyRef.current = true;
        }
      } else {
        setIsPurchasesEmpty(false);
        isPurchasesEmptyRef.current = false;
      }
    } catch (err) {
      console.error("Error fetching purchases:", err);
      showToast("error", "Failed to fetch purchases");
      setPurchases([]);
      setFilteredPurchases([]);
      setIsPurchasesEmpty(true);
      isPurchasesEmptyRef.current = true;
    } finally {
      setLoading((prev) => ({ ...prev, purchases: false }));
    }
  }, []);

  return {
    form,
    errors,
    products,
    suppliers,
    purchases,
    loading,
    showInvoiceSuggestions,
    filteredPurchases,
    isPurchasesEmpty,
    isProductsEmpty,
    isSuppliersEmpty,
    handleChange,
    validate,
    updateFormField,
    handleDateChange,
    handleProductChange,
    handleSupplierChange,
    handleInvoiceNumberChange,
    handleInvoiceSelect,
    setShowInvoiceSuggestions,
    fetchProducts,
    fetchSuppliers,
    fetchPurchases,
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
    disabled = false,
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
        disabled={disabled}
        className={`w-full border px-3 py-2 rounded-lg ${
          error ? "border-red-500" : "border-gray-300"
        } ${
          readOnly || disabled ? "bg-gray-100 cursor-not-allowed" : ""
        } ${className}`}
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

const AddReturnPurchase = () => {
  const navigate = useNavigate();
  const {
    form,
    errors,
    products,
    suppliers,
    purchases,
    loading,
    showInvoiceSuggestions,
    filteredPurchases,
    isPurchasesEmpty,
    isProductsEmpty,
    isSuppliersEmpty,
    handleChange,
    validate,
    updateFormField,
    handleDateChange,
    handleProductChange,
    handleSupplierChange,
    handleInvoiceNumberChange,
    handleInvoiceSelect,
    setShowInvoiceSuggestions,
    fetchProducts,
    fetchSuppliers,
    fetchPurchases,
  } = useReturnForm();

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".invoice-suggestions-container")) {
        setShowInvoiceSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Memoized product options for dropdown
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
    return [{ value: "", label: "Select Product" }, ...products];
  }, [products, isProductsEmpty]);

  // Memoized supplier options for dropdown
  const supplierOptions = useMemo(() => {
    if (isSuppliersEmpty) {
      return [
        {
          value: "",
          label: "No Suppliers Available",
          disabled: true,
        },
      ];
    }
    return [{ value: "", label: "Select Supplier" }, ...suppliers];
  }, [suppliers, isSuppliersEmpty]);

  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchPurchases();
  }, [fetchProducts, fetchSuppliers, fetchPurchases]);

  // Numeric input handler
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if any required data is empty
    if (isPurchasesEmpty || isProductsEmpty || isSuppliersEmpty) {
      showToast(
        "error",
        "Cannot add purchase return. Required data is not available."
      );
      return;
    }

    if (!validate()) return;

    try {
      // Prepare data for submission - convert numeric strings to numbers
      const submissionData = {
        recordingDate: form.recordingDate,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        deliveryNumber: form.deliveryNumber,
        receivedDate: form.receivedDate,
        productId: form.productId,
        productName: form.productName,
        supplierId: form.supplierId,
        supplierName: form.supplierName,
        purchaseQty: parseFloat(form.purchaseQty) || 0,
        returnQuantity: parseFloat(form.returnQuantity) || 0,
        usedQty: parseFloat(form.usedQty) || 0,
        fob: parseFloat(form.fob) || 0,
        cif: parseFloat(form.cif) || 0,
        lcNumber: form.lcNumber,
        amount: parseFloat(form.amount) || 0,
        returnAmount: parseFloat(form.returnAmount) || 0,
        remarks: form.remarks,
        returnReason: form.returnReason,
        expiredDate: form.expiredDate,
      };

      const response = await fetch(`${backendUrl}/api/purchase-return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      const data = await response.json();

      if (!response.ok) {
        showToast("error", data.message || "Error adding purchase return");
        return;
      }

      showToast(
        "success",
        data.message || "Purchase return added successfully"
      );
      navigate("/purchaselayout/purchasereturn");
    } catch (err) {
      showToast("error", err.message || "Network error");
    }
  };

  // Check if form is valid for submission
  const isFormValid = useMemo(() => {
    const purchaseQtyNum = parseFloat(form.purchaseQty) || 0;
    const returnQtyNum = parseFloat(form.returnQuantity) || 0;
    const usedQtyNum = parseFloat(form.usedQty) || 0;
    const amountNum = parseFloat(form.amount) || 0;
    const returnAmountNum = parseFloat(form.returnAmount) || 0;

    return (
      !isPurchasesEmpty &&
      !isProductsEmpty &&
      !isSuppliersEmpty &&
      form.invoiceNumber?.trim() &&
      form.productId &&
      form.supplierId &&
      form.deliveryNumber?.trim() &&
      form.invoiceDate &&
      form.receivedDate &&
      form.recordingDate &&
      form.returnReason?.trim() &&
      purchaseQtyNum > 0 &&
      returnQtyNum > 0 &&
      returnQtyNum <= purchaseQtyNum &&
      usedQtyNum >= 0 &&
      usedQtyNum <= purchaseQtyNum &&
      amountNum >= 0 &&
      returnAmountNum >= 0 &&
      returnAmountNum <= amountNum
    );
  }, [form, isPurchasesEmpty, isProductsEmpty, isSuppliersEmpty]);

  // Calculate used quantity automatically
  useEffect(() => {
    const purchaseQty = parseFloat(form.purchaseQty) || 0;
    const returnQty = parseFloat(form.returnQuantity) || 0;

    const calculatedUsedQty = Math.max(0, purchaseQty - returnQty);

    if (calculatedUsedQty !== parseFloat(form.usedQty)) {
      updateFormField("usedQty", calculatedUsedQty.toString());
    }
  }, [form.purchaseQty, form.returnQuantity, form.usedQty, updateFormField]);

  // Calculate unit price
  const unitPrice = useMemo(() => {
    const purchaseQty = parseFloat(form.purchaseQty) || 0;
    const amount = parseFloat(form.amount) || 0;
    return purchaseQty > 0 ? amount / purchaseQty : 0;
  }, [form.purchaseQty, form.amount]);

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      });
    } catch (error) {
      return dateString;
    }
  };

  // Check if form should be disabled
  const isFormDisabled =
    isPurchasesEmpty || isProductsEmpty || isSuppliersEmpty;

  // Ensure filteredPurchases is always an array for mapping
  const purchasesToDisplay = Array.isArray(filteredPurchases) 
    ? filteredPurchases 
    : filteredPurchases.purchases || [];

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add Purchase Return
      </h2>

      {/* Warning messages if data is empty */}
      {(isPurchasesEmpty || isProductsEmpty || isSuppliersEmpty) && (
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
                <ul className="list-disc list-inside space-y-1">
                  {isPurchasesEmpty && (
                    <li>
                      No purchases found. Please add at least one purchase
                      first.
                    </li>
                  )}
                  {isProductsEmpty && (
                    <li>
                      No products found. Please add at least one product first.
                    </li>
                  )}
                  {isSuppliersEmpty && (
                    <li>
                      No suppliers found. Please add at least one supplier
                      first.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* First Row - Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Invoice Number with Suggestions */}
          <div className="invoice-suggestions-container relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                name="invoiceNumber"
                value={form.invoiceNumber}
                onChange={handleInvoiceNumberChange}
                onFocus={() => setShowInvoiceSuggestions(true)}
                className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                  isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                placeholder={
                  isPurchasesEmpty
                    ? "No purchases available"
                    : "Enter invoice number"
                }
                required
                autoComplete="off"
                disabled={isFormDisabled}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() =>
                  setShowInvoiceSuggestions(!showInvoiceSuggestions)
                }
                disabled={isFormDisabled}
              >
                {showInvoiceSuggestions ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </button>
            </div>

            {/* Invoice Suggestions Dropdown */}
            {showInvoiceSuggestions && !isPurchasesEmpty && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {loading.purchases ? (
                  <div className="px-3 py-2 text-gray-500 text-center">
                    Loading purchases...
                  </div>
                ) : purchasesToDisplay.length === 0 ? (
                  <div className="px-3 py-2 text-gray-500 text-center">
                    No matching purchases found
                  </div>
                ) : (
                  purchasesToDisplay.map((purchase) => (
                    <div
                      key={purchase._id || purchase.id}
                      className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      onClick={() => handleInvoiceSelect(purchase)}
                    >
                      <div className="font-medium text-gray-800">
                        {purchase.invoiceNumber}
                      </div>
                      <div className="text-sm text-gray-600">
                        {purchase.productName} • {purchase.supplierName} •{" "}
                        {formatDate(purchase.invoiceDate)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {errors.invoiceNumber && (
              <p className="text-red-500 text-xs mt-0.5">
                {errors.invoiceNumber}
              </p>
            )}
          </div>

          <InputField
            label="Delivery Number"
            name="deliveryNumber"
            value={form.deliveryNumber}
            onChange={handleChange}
            error={errors.deliveryNumber}
            placeholder="Enter delivery number"
            required
            readOnly
            disabled={isFormDisabled}
          />

          <DatePickerField
            label="Recording Date"
            name="recordingDate"
            value={form.recordingDate}
            onChange={handleDateChange}
            error={errors.recordingDate}
            required
            disabled={isFormDisabled}
          />
        </div>

        {/* Second Row - Product and Supplier */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          {/* Product Dropdown */}
          <SearchableDropdown
            label="Product"
            value={form.productId}
            onChange={handleProductChange}
            options={productOptions}
            placeholder={
              isProductsEmpty ? "No Products Available" : "Select Product"
            }
            required={true}
            error={errors.productId}
            loading={loading.products}
            disabled={isFormDisabled || isProductsEmpty}
          />

          {/* Supplier Dropdown */}
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
            disabled={isFormDisabled || isSuppliersEmpty}
          />

          <InputField
            label="LC Number"
            name="lcNumber"
            value={form.lcNumber}
            onChange={handleChange}
            error={errors.lcNumber}
            placeholder="Enter LC number"
            readOnly
            disabled={isFormDisabled}
          />
        </div>

        {/* Third Row - Dates */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <DatePickerField
            label="Invoice Date"
            name="invoiceDate"
            value={form.invoiceDate}
            onChange={handleDateChange}
            error={errors.invoiceDate}
            required
            readOnly
            disabled={isFormDisabled}
          />

          <DatePickerField
            label="Received Date"
            name="receivedDate"
            value={form.receivedDate}
            onChange={handleDateChange}
            error={errors.receivedDate}
            required
            readOnly
            disabled={isFormDisabled}
          />

          <DatePickerField
            label="Expired Date"
            name="expiredDate"
            value={form.expiredDate}
            onChange={handleDateChange}
            placeholder="Select expired date"
            readOnly
            disabled={isFormDisabled}
          />
        </div>

        {/* Fourth Row - Quantities */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <NumericInputField
            label="Purchase Quantity"
            name="purchaseQty"
            value={form.purchaseQty}
            onChange={handleNumericInputChange}
            error={errors.purchaseQty}
            placeholder="0"
            required
            readOnly
            disabled={isFormDisabled}
          />

          <NumericInputField
            label="Used Quantity"
            name="usedQty"
            value={form.usedQty}
            onChange={handleNumericInputChange}
            error={errors.usedQty}
            placeholder="0"
            readOnly
            disabled={isFormDisabled}
          />

          <NumericInputField
            label="Return Quantity"
            name="returnQuantity"
            value={form.returnQuantity}
            onChange={handleNumericInputChange}
            error={errors.returnQuantity}
            placeholder="0"
            required
            disabled={isFormDisabled}
          />
        </div>

        {/* Fifth Row - Amounts */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mt-6">
          <NumericInputField
            label="FOB (USD)"
            name="fob"
            value={form.fob}
            onChange={handleNumericInputChange}
            error={errors.fob}
            placeholder="0.00"
            readOnly
            disabled={isFormDisabled}
          />

          <NumericInputField
            label="CIF (USD)"
            name="cif"
            value={form.cif}
            onChange={handleNumericInputChange}
            error={errors.cif}
            placeholder="0.00"
            readOnly
            disabled={isFormDisabled}
          />

          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">
              Unit Price (USD)
            </label>
            <input
              type="text"
              value={unitPrice.toFixed(2)}
              className="w-full border px-3 py-2 rounded-lg bg-gray-100 border-gray-300"
              readOnly
              disabled={isFormDisabled}
            />
          </div>

          <NumericInputField
            label="Total Amount (USD)"
            name="amount"
            value={form.amount}
            onChange={handleNumericInputChange}
            error={errors.amount}
            placeholder="0.00"
            readOnly
            disabled={isFormDisabled}
          />
        </div>

        {/* Sixth Row - Return Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <NumericInputField
            label="Return Amount (USD)"
            name="returnAmount"
            value={form.returnAmount}
            onChange={handleNumericInputChange}
            error={errors.returnAmount}
            placeholder="0.00"
            required
            readOnly
            disabled={isFormDisabled}
          />

          <InputField
            label="Return Reason"
            name="returnReason"
            value={form.returnReason}
            onChange={handleChange}
            error={errors.returnReason}
            placeholder="Enter return reason"
            required
            disabled={isFormDisabled}
          />
        </div>

        {/* Remarks */}
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
            className={`w-full border border-gray-300 rounded-md px-3 py-2 mt-1 ${
              isFormDisabled ? "bg-gray-100 cursor-not-allowed" : ""
            }`}
            disabled={isFormDisabled}
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end mt-8 gap-4">
          <button
            type="submit"
            disabled={!isFormValid || isFormDisabled}
            className={`px-6 py-2 rounded-lg cursor-pointer transition-colors ${
              isFormValid && !isFormDisabled
                ? "bg-green-600 hover:bg-green-700 text-white"
                : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
            }`}
          >
            Submit Return
          </button>
          <button
            type="button"
            onClick={() => navigate("/purchaselayout/purchasereturn")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddReturnPurchase;