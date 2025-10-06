import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useInitialSaleData } from "./IntialLoading.jsx";
import { PlusSquare, MinusSquare } from "lucide-react";

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
  saleDate: "",
  totalAmount: "",
  paidAmount: "",
  dueAmount: "",
  paymentStatus: "",
  remark: "",
  products: [{ ...INITIAL_PRODUCT_STATE }],
};

// Utility function to parse numbers safely
const parseNumber = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

// Custom hook for suggestions
const useSuggestions = (items, filterField = "type", inputValue = "") => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => {
          const fieldValue =
            typeof item === "string" ? item : item[filterField];
          if (inputValue.trim() === "") {
            return true;
          }
          return fieldValue.toLowerCase().includes(inputValue.toLowerCase());
        })
        .sort((a, b) => {
          const aVal = typeof a === "string" ? a : a[filterField];
          const bVal = typeof b === "string" ? b : b[filterField];
          return aVal.localeCompare(bVal);
        }),
    [items, filterField, inputValue]
  );

  const calculatePosition = useCallback(() => {
    if (isOpen && inputRef.current) {
      const height = inputRef.current.offsetHeight;
      setDropdownTop(2 * height - 8);
    }
  }, [isOpen]);

  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  const handleKeyDown = useCallback(
    (e, onSelect) => {
      if (!isOpen || filteredItems.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredItems.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0) {
            const selected = filteredItems[highlightedIndex];
            const value =
              typeof selected === "string" ? selected : selected[filterField];
            onSelect(value);
          }
          break;
        case "Escape":
          setIsOpen(false);
          break;
        default:
          break;
      }
    },
    [isOpen, filteredItems, highlightedIndex, filterField]
  );

  const selectSuggestion = useCallback((value, onSelect) => {
    onSelect(value);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, []);

  return {
    isOpen,
    setIsOpen,
    highlightedIndex,
    setHighlightedIndex,
    inputRef,
    dropdownTop,
    filteredItems,
    handleKeyDown,
    selectSuggestion,
  };
};

// Custom hook for product suggestions
const useProductSuggestions = (products, filteredProducts) => {
  const [suggestionsList, setSuggestionsList] = useState([]);
  const inputRefs = useRef([]);

  useEffect(() => {
    const initialSuggestions = products.map(() => ({
      isOpen: false,
      highlightedIndex: -1,
      dropdownTop: 0,
    }));
    setSuggestionsList(initialSuggestions);
    inputRefs.current = products.map(
      (_, i) => inputRefs.current[i] || React.createRef()
    );
  }, [products.length]);

  const filteredItems = useMemo(() => {
    return products.map((product, productIndex) => {
      const selectedProductNames = products
        .filter((p, idx) => idx !== productIndex && p.productName.trim() !== "")
        .map((p) => p.productName);

      return filteredProducts
        .filter((productName) => {
          // Filter out already selected products
          if (selectedProductNames.includes(productName)) {
            return false;
          }

          // If product name is empty, show all available products
          if (product.productName.trim() === "") {
            return true;
          }

          // Filter based on input
          return productName
            .toLowerCase()
            .includes(product.productName.toLowerCase());
        })
        .sort((a, b) => a.localeCompare(b));
    });
  }, [products, filteredProducts]);

  const setIsOpen = useCallback((index, isOpen) => {
    setSuggestionsList((prev) =>
      prev.map((suggestion, i) =>
        i === index ? { ...suggestion, isOpen } : suggestion
      )
    );
  }, []);

  const setHighlightedIndex = useCallback((index, highlightedIndex) => {
    setSuggestionsList((prev) =>
      prev.map((suggestion, i) =>
        i === index ? { ...suggestion, highlightedIndex } : suggestion
      )
    );
  }, []);

  const setDropdownTop = useCallback((index) => {
    const inputRef = inputRefs.current[index];
    if (inputRef?.current) {
      const height = inputRef.current.offsetHeight;
      setSuggestionsList((prev) =>
        prev.map((suggestion, i) =>
          i === index
            ? { ...suggestion, dropdownTop: 2 * height - 8 }
            : suggestion
        )
      );
    }
  }, []);

  const handleKeyDown = useCallback(
    (index, e, onSelect) => {
      const suggestion = suggestionsList[index];
      if (!suggestion?.isOpen || filteredItems[index].length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex(
            index,
            suggestion.highlightedIndex < filteredItems[index].length - 1
              ? suggestion.highlightedIndex + 1
              : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex(
            index,
            suggestion.highlightedIndex > 0
              ? suggestion.highlightedIndex - 1
              : filteredItems[index].length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (suggestion.highlightedIndex >= 0) {
            const selected = filteredItems[index][suggestion.highlightedIndex];
            onSelect(selected);
            setIsOpen(index, false);
            setHighlightedIndex(index, -1);
          }
          break;
        case "Escape":
          setIsOpen(index, false);
          setHighlightedIndex(index, -1);
          break;
        default:
          break;
      }
    },
    [suggestionsList, filteredItems, setHighlightedIndex, setIsOpen]
  );

  const selectSuggestion = useCallback(
    (index, value, onSelect) => {
      onSelect(value);
      setIsOpen(index, false);
      setHighlightedIndex(index, -1);
    },
    [setIsOpen, setHighlightedIndex]
  );

  const getInputRef = useCallback((index) => {
    return inputRefs.current[index];
  }, []);

  return {
    suggestionsList,
    filteredItems,
    setIsOpen,
    setHighlightedIndex,
    setDropdownTop,
    handleKeyDown,
    selectSuggestion,
    getInputRef,
  };
};

// Custom hook for form state management
const useReturnSaleForm = () => {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Toggle product view - only one product can be expanded at a time
  const toggleView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => (prevIndex === index ? -1 : index));
  }, []);

  // Expand a specific product
  const expandProduct = useCallback((index) => {
    setExpandedProductIndex(index);
  }, []);

  // Collapse all products
  const collapseAllProducts = useCallback(() => {
    setExpandedProductIndex(-1);
  }, []);

  // Check if a product is expanded
  const isProductExpanded = useCallback(
    (index) => {
      return expandedProductIndex === index;
    },
    [expandedProductIndex]
  );

  // Check if a product is filled (has product name)
  const isProductFilled = useCallback((product) => {
    return product.productName.trim() !== "";
  }, []);

  // Check if all required common fields are filled
  const areCommonFieldsFilled = useCallback((currentForm) => {
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
      "paymentStatus",
    ];
    return requiredFields.every(
      (field) =>
        currentForm[field] && currentForm[field].toString().trim() !== ""
    );
  }, []);

  // Check if at least one product is filled
  const hasAtLeastOneProduct = useCallback((products) => {
    return products.some((product) => product.productName.trim() !== "");
  }, []);

  // Calculate derived fields for a single product
  const calculateProductFields = useCallback((product) => {
    const salesQty = parseInt(product.salesQty) || 0;
    const returnQty = parseInt(product.returnQuantity) || 0;
    const sellingPrice = parseFloat(product.sellingPrice) || 0;
    const discount = parseFloat(product.discount) || 0;

    // Validate return quantity doesn't exceed sales quantity
    const validatedReturnQty = Math.min(returnQty, salesQty);

    const usedQty = Math.max(salesQty - validatedReturnQty, 0);
    const amount = (sellingPrice * salesQty).toFixed(2);
    const netSellingAmount = (parseFloat(amount) - discount).toFixed(2);
    const usedPrice = (sellingPrice * usedQty).toFixed(2);
    const usedAmount = (
      parseFloat(usedPrice) -
      (discount / salesQty) * usedQty
    ).toFixed(2);

    return {
      ...product,
      returnQuantity: validatedReturnQty.toString(),
      usedQty: usedQty.toString(),
      amount,
      netSellingAmount,
      usedPrice,
      usedAmount,
    };
  }, []);

  // Update product field
  const updateProduct = useCallback(
    (index, field, value) => {
      setForm((prev) => {
        const updatedProducts = [...prev.products];
        updatedProducts[index] = { ...updatedProducts[index], [field]: value };

        // Recalculate derived fields for this product
        const recalculatedProducts = updatedProducts.map((product) =>
          calculateProductFields(product)
        );

        // Calculate total amount from all products
        const totalAmount = recalculatedProducts
          .reduce(
            (sum, product) => sum + parseFloat(product.usedAmount || 0),
            0
          )
          .toFixed(2);

        // Calculate due amount
        const paidAmount = parseNumber(prev.paidAmount);
        const dueAmount = (totalAmount - paidAmount).toFixed(2);

        return {
          ...prev,
          products: recalculatedProducts,
          totalAmount: totalAmount.toString(),
          dueAmount: dueAmount.toString(),
        };
      });
    },
    [calculateProductFields]
  );

  const calculateDerivedFields = useCallback((name, value, currentForm) => {
    const updatedForm = { ...currentForm, [name]: value };

    if (name === "invoiceDate") {
      updatedForm.deliveryDate = value;
    }

    if (name === "paidAmount") {
      const totalAmount = parseNumber(currentForm.totalAmount);
      const paidAmount = parseNumber(value);
      updatedForm.dueAmount = (totalAmount - paidAmount).toFixed(2);
    }

    return updatedForm;
  }, []);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setForm((prev) => calculateDerivedFields(name, value, prev));
    },
    [calculateDerivedFields]
  );

  const validate = useCallback(() => {
    const newErrors = {};
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerName",
      "paymentStatus",
    ];

    // Validate common fields
    requiredFields.forEach((field) => {
      if (!form[field]) {
        newErrors[field] = `${field.replace(/([A-Z])/g, " $1")} is required`;
      }
    });

    // Validate products
    form.products.forEach((product, index) => {
      if (!product.productName) {
        newErrors[`productName_${index}`] = `Product Name for item ${
          index + 1
        } is required`;
      }
      if (!product.returnQuantity || Number(product.returnQuantity) < 0) {
        newErrors[`returnQuantity_${index}`] = `Return Quantity for item ${
          index + 1
        } must be >= 0`;
      }
      if (!product.sellingPrice || Number(product.sellingPrice) <= 0) {
        newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
          index + 1
        } must be > 0`;
      }

      // Validate that return quantity doesn't exceed sales quantity
      const salesQty = Number(product.salesQty) || 0;
      const returnQty = Number(product.returnQuantity) || 0;
      if (returnQty > salesQty) {
        newErrors[
          `returnQuantity_${index}`
        ] = `Return quantity cannot exceed sales quantity for item ${
          index + 1
        }`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // Add new product row
  const addProduct = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, { ...INITIAL_PRODUCT_STATE }],
    }));
    // Collapse all products when adding a new one
    setExpandedProductIndex(-1);
  }, []);

  // Remove product row
  const removeProduct = useCallback(
    (index) => {
      setForm((prev) => ({
        ...prev,
        products: prev.products.filter((_, i) => i !== index),
      }));
      // If the removed product was expanded, collapse all
      if (expandedProductIndex === index) {
        setExpandedProductIndex(-1);
      }
    },
    [expandedProductIndex]
  );

  // Clear all products data
  const clearAllProducts = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.map(() => ({ ...INITIAL_PRODUCT_STATE })),
    }));
    setExpandedProductIndex(-1);
  }, []);

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
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    setErrors,
    addProduct,
    removeProduct,
    clearAllProducts,
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
        className={`border rounded-md px-2 py-1 ${className} ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-200" : ""}`}
        autoComplete="off"
        tabIndex={readOnly ? -1 : 0}
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
        onChange={(date) => {
          if (date) {
            const event = {
              target: {
                name: name,
                value: date.toISOString().split("T")[0],
              },
            };
            onChange(event);
          } else {
            const event = {
              target: {
                name: name,
                value: "",
              },
            };
            onChange(event);
          }
        }}
        dateFormat="yyyy-MM-dd"
        placeholderText={placeholder}
        readOnly={readOnly}
        className={`w-full border rounded-md px-2 py-1 ${
          error ? "border-red-500" : "border-gray-300"
        } ${readOnly ? "bg-gray-200" : ""} ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

// Enhanced Suggestion Input Component
const SuggestionInput = React.memo(
  ({
    label,
    name,
    value,
    onChange,
    onFocus,
    onBlur,
    error,
    suggestions,
    isOpen,
    highlightedIndex,
    inputRef,
    dropdownTop,
    onSuggestionSelect,
    getSuggestionValue = (item) => item,
    getSuggestionDisplay = (item) => item,
    setHighlightedIndex,
    handleKeyDown,
  }) => {
    const handleMouseEnter = useCallback(
      (index) => {
        setHighlightedIndex(index);
      },
      [setHighlightedIndex]
    );

    const handleClick = useCallback(
      (item) => {
        const value = getSuggestionValue(item);
        onSuggestionSelect && onSuggestionSelect(value);
      },
      [onSuggestionSelect, getSuggestionValue]
    );

    return (
      <div className="relative flex flex-col">
        <label className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </label>
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          className={`border rounded-md px-2 py-1 ${
            error ? "border-red-500" : "border-gray-300"
          }`}
          placeholder="Type to search..."
          autoComplete="off"
        />
        {isOpen && suggestions.length > 0 && (
          <ul
            className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
            style={{ top: dropdownTop }}
          >
            {suggestions.map((item, idx) => (
              <li
                key={typeof item === "object" ? item._id ?? idx : idx}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleClick(item)}
                onMouseEnter={() => handleMouseEnter(idx)}
                className={`cursor-pointer px-3 py-2 ${
                  highlightedIndex === idx
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-900 hover:bg-gray-100"
                }`}
              >
                {getSuggestionDisplay(item)}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
      </div>
    );
  }
);

const AddReturnSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
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
    isProductFilled,
    areCommonFieldsFilled,
    hasAtLeastOneProduct,
    addProduct,
    removeProduct,
    clearAllProducts,
  } = useReturnSaleForm();

  const { statuses, productNames, loading } = useInitialSaleData();

  // Payment Status Suggestions
  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );

  // Product Suggestions using custom hook for product rows
  const productSuggestions = useProductSuggestions(
    form.products,
    filteredProducts
  );

  // Enhanced handleChange for payment status
  const enhancedHandleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      handleChange(e);

      if (name === "paymentStatus") {
        paymentStatusSuggestions.setIsOpen(true);
        if (value.trim().length > 0) {
          paymentStatusSuggestions.setHighlightedIndex(0);
        } else {
          paymentStatusSuggestions.setHighlightedIndex(0);
        }
      }
    },
    [handleChange, paymentStatusSuggestions]
  );

  // Enhanced product change handler
  const enhancedProductChange = useCallback(
    (index, field, value) => {
      updateProduct(index, field, value);

      if (field === "productName") {
        productSuggestions.setIsOpen(index, true);
        productSuggestions.setDropdownTop(index);
        if (value.length > 0) {
          productSuggestions.setHighlightedIndex(index, 0);
        } else {
          productSuggestions.setHighlightedIndex(index, 0);
        }
      }
    },
    [updateProduct, productSuggestions]
  );

  // Handle payment status keyboard events
  const handlePaymentStatusKeyDown = useCallback(
    (e) => {
      paymentStatusSuggestions.handleKeyDown(e, (value) => {
        updateFormField("paymentStatus", value);
      });
    },
    [paymentStatusSuggestions, updateFormField]
  );

  // Handle product name keyboard events for specific index
  const handleProductNameKeyDown = useCallback(
    (index, e) => {
      productSuggestions.handleKeyDown(index, e, (value) => {
        enhancedProductChange(index, "productName", value);
      });
    },
    [productSuggestions, enhancedProductChange]
  );

  // Handle payment status focus
  const handlePaymentStatusFocus = useCallback(() => {
    paymentStatusSuggestions.setIsOpen(true);
    paymentStatusSuggestions.setHighlightedIndex(0);
  }, [paymentStatusSuggestions]);

  // Handle product name focus
  const handleProductNameFocus = useCallback(
    (index) => {
      productSuggestions.setIsOpen(index, true);
      productSuggestions.setDropdownTop(index);
      productSuggestions.setHighlightedIndex(index, 0);
    },
    [productSuggestions]
  );

  const handleProductRowHighlight = useCallback(
    (productIndex, suggestionIndex) => {
      productSuggestions.setHighlightedIndex(productIndex, suggestionIndex);
    },
    [productSuggestions]
  );

  // Get available products count (products that haven't been selected yet)
  const getAvailableProductsCount = useCallback(() => {
    const selectedProducts = form.products
      .filter((product) => product.productName.trim() !== "")
      .map((product) => product.productName);

    return filteredProducts.filter(
      (product) => !selectedProducts.includes(product)
    ).length;
  }, [form.products, filteredProducts]);

  // Check if "Add Return Sale" button should be enabled
  const isAddReturnSaleEnabled = useMemo(() => {
    return (
      isInvoiceDataFetched &&
      areCommonFieldsFilled(form) &&
      hasAtLeastOneProduct(form.products)
    );
  }, [isInvoiceDataFetched, form, areCommonFieldsFilled, hasAtLeastOneProduct]);

  // Check if "Add Product" button should be enabled - FIXED LOGIC
  const isAddProductEnabled = useMemo(() => {
    // Only enable if invoice data is fetched AND there are available products to select
    return isInvoiceDataFetched && getAvailableProductsCount() > 0;
  }, [isInvoiceDataFetched, getAvailableProductsCount]);

  // Enhanced add product function that prevents adding when no products available
  const enhancedAddProduct = useCallback(() => {
    if (!isAddProductEnabled) {
      showToast("error", "No more products available to add");
      return;
    }
    addProduct();
  }, [isAddProductEnabled, addProduct]);

  // Function to filter sales based on invoiceNumber
  const filterSalesByInvoice = useCallback(
    (invoiceNum) => {
      const matches = sales.filter((sale) => sale.invoiceNumber === invoiceNum);
      return matches;
    },
    [sales]
  );

  // Get unique product names from filtered sales
  const getProductNamesFromFilteredSales = useCallback((filteredSales) => {
    const uniqueProducts = [];
    const productMap = new Map();

    filteredSales.forEach((sale) => {
      if (sale.productName && !productMap.has(sale.productName)) {
        productMap.set(sale.productName, true);
        uniqueProducts.push(sale.productName);
      }
    });

    return uniqueProducts;
  }, []);

  // Handle invoice number change
  const handleInvoiceNumberChange = useCallback(
    (e) => {
      const { value } = e.target;
      updateFormField("invoiceNumber", value);
    },
    [updateFormField]
  );

  // Handle recording date change - check invoice validity
  const handleRecordingDateChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);

      // Check if invoice number exists when recording date is changed
      if (form.invoiceNumber && form.invoiceNumber.trim() !== "") {
        const filtered = filterSalesByInvoice(form.invoiceNumber);
        if (filtered.length === 0) {
          showToast("error", `Invoice number ${form.invoiceNumber} not found`);
          setIsInvoiceDataFetched(false);
          setFilteredProducts([]);

          // Clear auto-filled fields
          updateFormField("invoiceDate", "");
          updateFormField("mrName", "");
          updateFormField("customerName", "");
          updateFormField("totalAmount", "");

          // Clear all product data
          clearAllProducts();
        }
      }
    },
    [
      form.invoiceNumber,
      filterSalesByInvoice,
      updateFormField,
      clearAllProducts,
    ]
  );

  // Update filtered products when invoice number changes
  useEffect(() => {
    if (form.invoiceNumber && form.invoiceNumber !== lastInvoiceNumber) {
      const filtered = filterSalesByInvoice(form.invoiceNumber);
      const products = getProductNamesFromFilteredSales(filtered);
      setFilteredProducts(products);
      setLastInvoiceNumber(form.invoiceNumber);

      if (filtered.length > 0) {
        setIsInvoiceDataFetched(true);
        const firstSale = filtered[0];
        updateFormField("invoiceDate", firstSale.invoiceDate ?? "");
        updateFormField("mrName", firstSale.mrName ?? "");
        updateFormField("customerName", firstSale.customerInfo?.name ?? "");
        updateFormField("customerCode", firstSale.customerCode ?? "");
        updateFormField("saleDate", firstSale.invoiceDate ?? "");
        updateFormField("remark", firstSale.remark ?? "");
      } else {
        setIsInvoiceDataFetched(false);
      }
    } else if (!form.invoiceNumber) {
      setFilteredProducts([]);
      setIsInvoiceDataFetched(false);
      setLastInvoiceNumber("");
    }
  }, [
    form.invoiceNumber,
    lastInvoiceNumber,
    sales,
    filterSalesByInvoice,
    getProductNamesFromFilteredSales,
    updateFormField,
  ]);

  // Handle product name selection and auto-fill product data
  const handleProductNameSelect = useCallback(
    (index, selectedProductName) => {
      enhancedProductChange(index, "productName", selectedProductName);

      // Find the specific sale record for this product
      const filtered = filterSalesByInvoice(form.invoiceNumber);
      const productSale = filtered.find(
        (sale) => sale.productName === selectedProductName
      );

      if (productSale) {
        const salesQty = Number(productSale.salesQty) || 0;
        const returnQty = Number(form.products[index]?.returnQuantity) || 0;
        const sellingPrice = Number(productSale.sellingPrice) || 0;
        const discount = Number(productSale.discount) || 0;

        // Update product fields with sale data
        updateProduct(index, "salesQty", salesQty.toString());
        updateProduct(index, "sellingPrice", sellingPrice.toString());
        updateProduct(index, "discount", discount.toString());

        // Auto-expand the product details when product is selected
        expandProduct(index);
      }
    },
    [
      form.invoiceNumber,
      form.products,
      enhancedProductChange,
      filterSalesByInvoice,
      updateProduct,
      expandProduct,
    ]
  );

  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");
      const data = await res.json();
      setSales(data);
    } catch (error) {
      console.error("Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      // Filter out empty products and create return sale data
      const validProducts = form.products.filter(
        (product) => product.productName.trim() !== ""
      );

      if (validProducts.length === 0) {
        showToast("error", "Please add at least one product");
        return;
      }
      console.log("values of form", form);
      // Create return sales data array
      const returnSalesData = validProducts.map((product) => ({
        recordingDate: form.recordingDate,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        mrName: form.mrName,
        customerName: form.customerName,
        customerCode: form.customerCode,
        productName: product.productName,
        salesQty: product.salesQty,
        returnQuantity: product.returnQuantity,
        usedQty: product.usedQty,
        sellingPrice: product.sellingPrice,
        amount: product.amount,
        discount: product.discount,
        netSellingAmount: product.netSellingAmount,
        usedPrice: product.usedPrice,
        totalAmount: form.totalAmount,
        paidAmount: form.paidAmount,
        dueAmount: form.dueAmount,
        usedAmount: product.usedAmount,
        paymentStatus: form.paymentStatus,
        remark: form.remark,
      }));

      const response = await fetch(`${backendUrl}/api/salesreturn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(returnSalesData),
      });

      const respData = await response.json();
      console.log("respData", respData);

      if (!response.ok) {
        throw new Error(respData.error || "Something went wrong");
      }

      showToast(
        "success",
        respData.message || "Return sales added successfully"
      );
      navigate("/salelayout/salereturn");
    } catch (err) {
      console.error("Error submitting return sales:", err);
      showToast("error", err.message || "Error submitting return sales");
    }
  };

  const handleNumericInputChange = (e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      updateFunc(e);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
        <div className="flex justify-center items-center h-32">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      {/* Header with title and Add Product button */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          Add New Sale Return
        </h2>
        <div className="flex items-center gap-4">
          {/* Show available products count */}
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
                ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
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
        <InputField
          label="Invoice Number"
          name="invoiceNumber"
          value={form.invoiceNumber}
          onChange={handleInvoiceNumberChange}
          error={errors.invoiceNumber}
          required
        />
        <DatePickerField
          label="Recording Date"
          name="recordingDate"
          value={form.recordingDate}
          onChange={handleRecordingDateChange}
          error={errors.recordingDate}
          required
          placeholder="Select recording date"
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
        <div></div> {/* Empty div for grid alignment */}
      </div>

      {/* Product Section */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Products</h3>

        {form.products.map((product, index) => (
          <div key={index} className="border p-4 mb-4 rounded shadow-sm">
            {/* Product Name and Actions */}
            <div className="flex justify-between items-center mb-2">
              <div className="flex-1 mr-4">
                <div className="relative flex flex-col">
                  <label className="text-sm font-medium text-gray-700 mb-1">
                    Product Name
                    <span className="text-red-500 ml-1">*</span>
                  </label>
                  <input
                    ref={productSuggestions.getInputRef(index)}
                    type="text"
                    value={product.productName}
                    onChange={(e) =>
                      enhancedProductChange(
                        index,
                        "productName",
                        e.target.value
                      )
                    }
                    onKeyDown={(e) => handleProductNameKeyDown(index, e)}
                    onFocus={() => handleProductNameFocus(index)}
                    onBlur={() =>
                      setTimeout(
                        () => productSuggestions.setIsOpen(index, false),
                        150
                      )
                    }
                    className={`border rounded-md px-2 py-1 ${
                      errors[`productName_${index}`]
                        ? "border-red-500"
                        : "border-gray-300"
                    }`}
                    placeholder="Select product name"
                    autoComplete="off"
                    disabled={!isInvoiceDataFetched}
                  />
                  {productSuggestions.suggestionsList[index]?.isOpen &&
                    productSuggestions.filteredItems[index]?.length > 0 && (
                      <ul
                        className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg"
                        style={{
                          top: productSuggestions.suggestionsList[index]
                            .dropdownTop,
                        }}
                      >
                        {productSuggestions.filteredItems[index].map(
                          (productName, idx) => (
                            <li
                              key={idx}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                productSuggestions.selectSuggestion(
                                  index,
                                  productName,
                                  (value) =>
                                    handleProductNameSelect(index, value)
                                )
                              }
                              onMouseEnter={() =>
                                handleProductRowHighlight(index, idx)
                              }
                              className={`cursor-pointer px-3 py-2 ${
                                productSuggestions.suggestionsList[index]
                                  .highlightedIndex === idx
                                  ? "bg-blue-600 text-white"
                                  : "bg-white text-gray-900 hover:bg-gray-100"
                              }`}
                            >
                              {productName}
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  {errors[`productName_${index}`] && (
                    <p className="text-red-500 text-xs mt-0.5">
                      {errors[`productName_${index}`]}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {product.productName && (
                  <button
                    type="button"
                    onClick={() => toggleView(index)}
                    className="text-blue-600 underline px-3 py-1 border border-blue-600 rounded"
                  >
                    {isProductExpanded(index) ? "Hide Details" : "Show Details"}
                  </button>
                )}
                {form.products.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeProduct(index)}
                    className="text-red-600 underline px-3 py-1 border border-red-600 rounded"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            {/* Product Details - Auto-show when product has name and is expanded */}
            {product.productName && isProductExpanded(index) && (
              <div className="border rounded-lg p-4 mt-2 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InputField
                    label="Return Quantity"
                    name={`returnQuantity_${index}`}
                    type="text"
                    value={product.returnQuantity}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                        enhancedProductChange(index, "returnQuantity", value);
                      }
                    }}
                    error={errors[`returnQuantity_${index}`]}
                    required
                  />

                  <InputField
                    label="Sales Quantity"
                    name={`salesQty_${index}`}
                    type="text"
                    value={product.salesQty}
                    readOnly
                  />

                  <InputField
                    label="Used Quantity"
                    name={`usedQty_${index}`}
                    value={product.usedQty}
                    readOnly
                  />

                  <InputField
                    label="Selling Price"
                    name={`sellingPrice_${index}`}
                    type="text"
                    value={product.sellingPrice}
                    readOnly
                  />

                  <InputField
                    label="Amount"
                    name={`amount_${index}`}
                    value={product.amount}
                    readOnly
                  />

                  <InputField
                    label="Discount"
                    name={`discount_${index}`}
                    type="text"
                    value={product.discount}
                    readOnly
                  />

                  <InputField
                    label="Net Selling Amount"
                    name={`netSellingAmount_${index}`}
                    value={product.netSellingAmount}
                    readOnly
                  />

                  <InputField
                    label="Used Price"
                    name={`usedPrice_${index}`}
                    value={product.usedPrice}
                    readOnly
                  />

                  <InputField
                    label="Used Amount"
                    name={`usedAmount_${index}`}
                    value={product.usedAmount}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Payment Fields */}
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
          onChange={enhancedHandleChange}
          error={errors.dueAmount}
          readOnly
        />

        <SuggestionInput
          label="Payment Status*"
          name="paymentStatus"
          value={form.paymentStatus}
          onChange={enhancedHandleChange}
          error={errors.paymentStatus}
          suggestions={paymentStatusSuggestions.filteredItems}
          isOpen={paymentStatusSuggestions.isOpen}
          highlightedIndex={paymentStatusSuggestions.highlightedIndex}
          inputRef={paymentStatusSuggestions.inputRef}
          dropdownTop={paymentStatusSuggestions.dropdownTop}
          onFocus={handlePaymentStatusFocus}
          onBlur={() =>
            setTimeout(() => paymentStatusSuggestions.setIsOpen(false), 150)
          }
          onSuggestionSelect={(value) =>
            updateFormField("paymentStatus", value)
          }
          getSuggestionValue={(item) => item.type}
          getSuggestionDisplay={(item) => item.type}
          setHighlightedIndex={paymentStatusSuggestions.setHighlightedIndex}
          handleKeyDown={handlePaymentStatusKeyDown}
          required
        />

        <div className="sm:col-span-3">
          <InputField
            label="Remark"
            name="remark"
            value={form.remark}
            onChange={enhancedHandleChange}
            error={errors.remark}
          />
        </div>
      </div>

      <div className="flex justify-end mt-6 gap-3">
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={!isAddReturnSaleEnabled}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg shadow transition-colors ${
            isAddReturnSaleEnabled
              ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
              : "bg-gray-400 text-white opacity-50 cursor-not-allowed"
          }`}
        >
          Add Return Sale
        </button>
        <button
          type="button"
          onClick={() => navigate("/salelayout/salereturn")}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export default AddReturnSale;
