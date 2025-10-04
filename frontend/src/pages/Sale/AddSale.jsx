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
  bonusQty: "",
  totalQty: "",
  sellingPrice: "",
  amount: "",
  discount: "",
  netSellingAmount: "",
  averageUnitPrice: "",
  lc: "",
  profitLoss: "",
};

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  customerCode: "",
  paymentStatus: "",
  remark: "",
  creditDays: "",
  dueDate: "",
  deliveryDate: "",
  paidAmount: "",
  dueAmount: "",
  totalAmount: "0.00", // Added totalAmount field
  products: [
    {
      ...INITIAL_PRODUCT_STATE,
      totalQty: "0",
      amount: "0.00",
      netSellingAmount: "0.00",
      averageUnitPrice: "0.00",
      profitLoss: "0.00",
    },
  ],
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
const useProductSuggestions = (products, productNames) => {
  const [suggestionsList, setSuggestionsList] = useState([]);
  const inputRefs = useRef([]);

  useEffect(() => {
    // Initialize suggestions for each product
    const initialSuggestions = products.map((product) => ({
      isOpen: false,
      highlightedIndex: -1,
      dropdownTop: 0,
    }));
    setSuggestionsList(initialSuggestions);

    // Initialize refs array
    inputRefs.current = products.map(
      (_, i) => inputRefs.current[i] || React.createRef()
    );
  }, [products.length]);

  const filteredItems = useMemo(() => {
    return products.map((product) =>
      productNames
        .filter((item) => {
          const fieldValue = typeof item === "string" ? item : item.name;
          return fieldValue
            .toLowerCase()
            .includes(product.productName.toLowerCase());
        })
        .sort((a, b) => {
          const aVal = typeof a === "string" ? a : a.name;
          const bVal = typeof b === "string" ? b : b.name;
          return aVal.localeCompare(bVal);
        })
    );
  }, [products, productNames]);

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
            const value =
              typeof selected === "string" ? selected : selected.name;
            onSelect(value);
          }
          break;
        case "Escape":
          setIsOpen(index, false);
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
const useSaleForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    customerCode: initialCustomerCode,
  });
  const [errors, setErrors] = useState({});
  const [expandedProductIndex, setExpandedProductIndex] = useState(0); // Track only one expanded product

  const parseNumber = useCallback((val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  // Calculate total amount from all products
  const calculateTotalAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.amount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  // Calculate total net amount from all products
  const calculateTotalNetAmount = useCallback((products) => {
    const total = products.reduce((sum, product) => {
      return sum + parseFloat(product.netSellingAmount || 0);
    }, 0);
    return total.toFixed(2);
  }, []);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Toggle product view - only one product can be expanded at a time
  const toggleView = useCallback((index) => {
    setExpandedProductIndex((prevIndex) => 
      prevIndex === index ? -1 : index
    );
  }, []);

  // Check if a product is expanded
  const isProductExpanded = useCallback((index) => {
    return expandedProductIndex === index;
  }, [expandedProductIndex]);

  // Check if a product is filled (has product name)
  const isProductFilled = useCallback((product) => {
    return product.productName.trim() !== "";
  }, []);

  // Add new product
  const addProduct = useCallback(() => {
    setForm((prev) => {
      const newProducts = [
        ...prev.products,
        {
          ...INITIAL_PRODUCT_STATE,
          totalQty: "0",
          amount: "0.00",
          netSellingAmount: "0.00",
          averageUnitPrice: "0.00",
          profitLoss: "0.00",
        },
      ];
      
      const totalAmount = calculateTotalAmount(newProducts);
      const totalNetAmount = calculateTotalNetAmount(newProducts);
      
      return {
        ...prev,
        products: newProducts,
        totalAmount,
        dueAmount: (parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)).toFixed(2),
      };
    });
    
    // Expand the new product and collapse others
    setExpandedProductIndex(form.products.length);
  }, [form.products.length, calculateTotalAmount, calculateTotalNetAmount]);

  // Remove product
  const removeProduct = useCallback(
    (index) => {
      if (form.products.length > 1) {
        const removedProduct = form.products[index];
        
        setForm((prev) => {
          const newProducts = prev.products.filter((_, i) => i !== index);
          const totalAmount = calculateTotalAmount(newProducts);
          const totalNetAmount = calculateTotalNetAmount(newProducts);
          
          return {
            ...prev,
            products: newProducts,
            totalAmount,
            dueAmount: (parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)).toFixed(2),
          };
        });

        // Adjust expanded index after removal
        setExpandedProductIndex((prevIndex) => {
          if (prevIndex === index) {
            // If the removed product was expanded, expand the first product
            return 0;
          } else if (prevIndex > index) {
            // If expanded product was after the removed one, adjust index
            return prevIndex - 1;
          }
          return prevIndex;
        });
      }
    },
    [form.products, calculateTotalAmount, calculateTotalNetAmount]
  );

  // Update product field
  const updateProduct = useCallback((index, field, value) => {
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[index] = { ...updatedProducts[index], [field]: value };

      // Recalculate derived fields for this product
      const recalculatedProducts = updatedProducts.map((product) =>
        calculateProductFields(product)
      );

      // Recalculate total amounts
      const totalAmount = calculateTotalAmount(recalculatedProducts);
      const totalNetAmount = calculateTotalNetAmount(recalculatedProducts);

      return {
        ...prev,
        products: recalculatedProducts,
        totalAmount,
        dueAmount: (parseFloat(totalNetAmount) - parseFloat(prev.paidAmount || 0)).toFixed(2),
      };
    });
  }, [calculateTotalAmount, calculateTotalNetAmount]);

  // Calculate derived fields for a single product
  const calculateProductFields = useCallback((product) => {
    const salesQty = parseInt(product.salesQty) || 0;
    const bonusQty = parseInt(product.bonusQty) || 0;
    const sellingPrice = parseFloat(product.sellingPrice) || 0;
    const discount = parseFloat(product.discount) || 0;
    const lc = parseFloat(product.lc) || 0;

    const totalQty = salesQty + bonusQty;
    const amount = (sellingPrice * salesQty).toFixed(2);
    const netSellingAmount = (parseFloat(amount) - discount).toFixed(2);
    const averageUnitPrice =
      totalQty > 0
        ? (parseFloat(netSellingAmount) / totalQty).toFixed(2)
        : "0.00";
    const profitLoss = (parseFloat(netSellingAmount) - lc * totalQty).toFixed(
      2
    );

    return {
      ...product,
      totalQty: totalQty.toString(),
      amount,
      netSellingAmount,
      averageUnitPrice,
      profitLoss,
    };
  }, []);

  const calculateDerivedFields = useCallback(
    (name, value, currentForm) => {
      const updatedForm = { ...currentForm, [name]: value };

      if (name === "invoiceDate") {
        updatedForm.deliveryDate = value;
      }

      if (name === "creditDays") {
        const creditDays = parseInt(value, 10);
        if (!isNaN(creditDays)) {
          const due = new Date();
          due.setDate(due.getDate() + creditDays);
          updatedForm.dueDate = due.toISOString().split("T")[0];
        } else {
          updatedForm.dueDate = "";
        }
      }

      if (["paidAmount"].includes(name)) {
        const totalNetAmount = calculateTotalNetAmount(currentForm.products);
        const paidAmount = parseNumber(value);
        updatedForm.dueAmount = (parseFloat(totalNetAmount) - paidAmount).toFixed(2);
      }

      return updatedForm;
    },
    [parseNumber, calculateTotalNetAmount]
  );

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
      "customerCode",
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
      if (!product.salesQty || Number(product.salesQty) <= 0) {
        newErrors[`salesQty_${index}`] = `Sales Quantity for item ${
          index + 1
        } must be > 0`;
      }
      if (!product.sellingPrice || Number(product.sellingPrice) <= 0) {
        newErrors[`sellingPrice_${index}`] = `Selling Price for item ${
          index + 1
        } must be > 0`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  return {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    isProductFilled,
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
        className={`border rounded-md px-2 py-1 ${className} ${
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
        } ${readOnly ? "bg-gray-100" : ""} ${className}`}
        autoComplete="off"
      />
      {error && <p className="text-red-500 text-xs mt-0.5">{error}</p>}
    </div>
  )
);

// Suggestion Input Component
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

    const handleKeyDown = useCallback(
      (e) => {
        if (!isOpen || suggestions.length === 0) return;

        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setHighlightedIndex((prev) =>
              prev < suggestions.length - 1 ? prev + 1 : 0
            );
            break;
          case "ArrowUp":
            e.preventDefault();
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : suggestions.length - 1
            );
            break;
          case "Enter":
            e.preventDefault();
            if (
              highlightedIndex >= 0 &&
              highlightedIndex < suggestions.length
            ) {
              const selectedItem = suggestions[highlightedIndex];
              const value = getSuggestionValue(selectedItem);
              onSuggestionSelect && onSuggestionSelect(value);
            }
            break;
          default:
            break;
        }
      },
      [
        highlightedIndex,
        suggestions,
        isOpen,
        onSuggestionSelect,
        getSuggestionValue,
        setHighlightedIndex,
      ]
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
          aria-autocomplete="list"
          aria-expanded={isOpen}
          role="combobox"
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

const AddSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  const {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    addProduct,
    removeProduct,
    updateProduct,
    toggleView,
    isProductExpanded,
    isProductFilled,
  } = useSaleForm(customerCode);

  const { statuses, productNames, loading } = useInitialSaleData();

  // Payment Status Suggestions
  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );

  // Product Suggestions using custom hook for product rows
  const productSuggestions = useProductSuggestions(form.products, productNames);

  // Enhanced handleChange to handle suggestion opening
  const enhancedHandleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      handleChange(e);

      // Auto-open suggestions when typing in these fields
      if (name === "paymentStatus" && value.length > 0) {
        paymentStatusSuggestions.setIsOpen(true);
        paymentStatusSuggestions.setHighlightedIndex(-1);
      }
    },
    [handleChange, paymentStatusSuggestions]
  );

  // Enhanced product change handler
  const enhancedProductChange = useCallback(
    (index, field, value) => {
      updateProduct(index, field, value);

      // Auto-open product name suggestions when typing
      if (field === "productName" && value.length > 0) {
        productSuggestions.setIsOpen(index, true);
        productSuggestions.setHighlightedIndex(index, -1);
        productSuggestions.setDropdownTop(index);
      }
    },
    [updateProduct, productSuggestions]
  );

  const handleProductRowHighlight = useCallback(
    (productIndex, suggestionIndex) => {
      productSuggestions.setHighlightedIndex(productIndex, suggestionIndex);
    },
    [productSuggestions]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      // Filter out empty products (where productName is empty)
      const validProducts = form.products.filter(
        (product) => product.productName.trim() !== ""
      );

      if (validProducts.length === 0) {
        showToast("error", "Please add at least one product");
        return;
      }

      // Create sales data array with common fields + individual product data
      const salesData = validProducts.map((product) => ({
        recordingDate: form.recordingDate,
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        mrName: form.mrName,
        customerCode: form.customerCode,
        productName: product.productName,
        salesQty: product.salesQty,
        bonusQty: product.bonusQty,
        totalQty: product.totalQty,
        sellingPrice: product.sellingPrice,
        amount: product.amount,
        discount: product.discount,
        netSellingAmount: product.netSellingAmount,
        averageUnitPrice: product.averageUnitPrice,
        lc: product.lc,
        profitLoss: product.profitLoss,
        creditDays: form.creditDays,
        dueDate: form.dueDate,
        deliveryDate: form.deliveryDate,
        paidAmount: form.paidAmount,
        dueAmount: form.dueAmount,
        totalAmount: form.totalAmount, // Include totalAmount in submission
        paymentStatus: form.paymentStatus,
        remark: form.remark,
      }));

      const response = await fetch(`${backendUrl}/api/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(salesData),
      });

      const respData = await response.json();

      if (!response.ok) {
        throw new Error(respData.error || "Something went wrong");
      }

      showToast("success", respData.message || "Sales added successfully");
      navigate("/salelayout/sale");
    } catch (err) {
      console.error("Error submitting sales:", err);
      showToast("error", err.message || "Error submitting sales");
    }
  };

  const isCurrentProductValid = () => {
    const currentProduct = form.products[form.products.length - 1];
    return (
      currentProduct.productName.trim() !== "" &&
      currentProduct.salesQty.trim() !== "" &&
      currentProduct.sellingPrice.trim() !== "" &&
      currentProduct.lc.trim() !== ""
    );
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
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Add New Sale</h2>
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

      {/* Product Summary View */}
      <div className="mb-6">
        {form.products.map((product, index) => (
          <div key={index} className="border p-4 mb-4 rounded shadow-sm">
            {/* Product Name and View Button */}
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">
                {product.productName || `Product ${index + 1}`}
              </h3>
              <button
                type="button"
                onClick={() => toggleView(index)}
                className="text-blue-600 underline"
              >
                {isProductExpanded(index) ? "Hide" : "View"}
              </button>
            </div>

            {/* Conditionally render full details - only if this product is expanded */}
            {isProductExpanded(index) && (
              <div className="border rounded-lg p-4 mt-2">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Product Details
                  </h3>
                  {form.products.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProduct(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <MinusSquare className="w-5 h-5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Product Name Field with Suggestions */}
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
                      onKeyDown={(e) =>
                        productSuggestions.handleKeyDown(index, e, (value) =>
                          enhancedProductChange(index, "productName", value)
                        )
                      }
                      onFocus={() => {
                        productSuggestions.setIsOpen(index, true);
                        productSuggestions.setDropdownTop(index);
                      }}
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
                      placeholder="Type to search..."
                      autoComplete="off"
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
                            (item, idx) => (
                              <li
                                key={
                                  typeof item === "object"
                                    ? item._id ?? idx
                                    : idx
                                }
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  productSuggestions.selectSuggestion(
                                    index,
                                    typeof item === "string" ? item : item.name,
                                    (value) =>
                                      enhancedProductChange(
                                        index,
                                        "productName",
                                        value
                                      )
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
                                {typeof item === "string" ? item : item.name}
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

                  <InputField
                    label="Sales Quantity"
                    name={`salesQty_${index}`}
                    type="text"
                    value={product.salesQty}
                    onChange={(e) =>
                      updateProduct(index, "salesQty", e.target.value)
                    }
                    error={errors[`salesQty_${index}`]}
                    required
                  />

                  <InputField
                    label="Bonus Quantity"
                    name={`bonusQty_${index}`}
                    type="text"
                    value={product.bonusQty}
                    onChange={(e) =>
                      updateProduct(index, "bonusQty", e.target.value)
                    }
                    error={errors[`bonusQty_${index}`]}
                  />

                  <InputField
                    label="Selling Price"
                    name={`sellingPrice_${index}`}
                    type="text"
                    value={product.sellingPrice}
                    onChange={(e) =>
                      updateProduct(index, "sellingPrice", e.target.value)
                    }
                    error={errors[`sellingPrice_${index}`]}
                    required
                  />

                  <InputField
                    label="Discount"
                    name={`discount_${index}`}
                    type="text"
                    value={product.discount}
                    onChange={(e) =>
                      updateProduct(index, "discount", e.target.value)
                    }
                    error={errors[`discount_${index}`]}
                  />

                  <InputField
                    label="LC"
                    name={`lc_${index}`}
                    type="text"
                    value={product.lc}
                    onChange={(e) => updateProduct(index, "lc", e.target.value)}
                    error={errors[`lc_${index}`]}
                  />

                  {/* Calculated Fields */}
                  <InputField
                    label="Total Quantity"
                    name={`totalQty_${index}`}
                    value={product.totalQty}
                    readOnly
                  />
                  <InputField
                    label="Amount"
                    name={`amount_${index}`}
                    value={product.amount}
                    readOnly
                  />
                  <InputField
                    label="Net Selling Amount"
                    name={`netSellingAmount_${index}`}
                    value={product.netSellingAmount}
                    readOnly
                  />
                  <InputField
                    label="Average Unit Price"
                    name={`averageUnitPrice_${index}`}
                    value={product.averageUnitPrice}
                    readOnly
                  />
                  <InputField
                    label="Profit / Loss"
                    name={`profitLoss_${index}`}
                    value={product.profitLoss}
                    readOnly
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Common Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <DatePickerField
            label="Recording Date"
            name="recordingDate"
            value={form.recordingDate}
            onChange={enhancedHandleChange}
            error={errors.recordingDate}
            required
            placeholder="Select recording date"
          />
          <InputField
            label="Invoice Number"
            name="invoiceNumber"
            value={form.invoiceNumber}
            onChange={enhancedHandleChange}
            error={errors.invoiceNumber}
            required
          />
          <DatePickerField
            label="Invoice Date"
            name="invoiceDate"
            value={form.invoiceDate}
            onChange={enhancedHandleChange}
            error={errors.invoiceDate}
            required
            placeholder="Select invoice date"
          />
          <InputField
            label="Medical Representative Name"
            name="mrName"
            value={form.mrName}
            onChange={enhancedHandleChange}
            error={errors.mrName}
            required
          />
          <InputField
            label="Customer Code"
            name="customerCode"
            value={form.customerCode}
            onChange={enhancedHandleChange}
            error={errors.customerCode}
            required
          />
          <DatePickerField
            label="Delivery Date"
            name="deliveryDate"
            value={form.deliveryDate}
            onChange={enhancedHandleChange}
            error={errors.deliveryDate}
            readOnly
            placeholder="Delivery date will be set automatically"
          />
        </div>

        {/* Additional Common Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <InputField
            label="Credit Days"
            name="creditDays"
            type="text"
            value={form.creditDays}
            onChange={enhancedHandleChange}
            error={errors.creditDays}
          />

          <DatePickerField
            label="Due Date"
            name="dueDate"
            value={form.dueDate}
            onChange={enhancedHandleChange}
            error={errors.dueDate}
            readOnly
            placeholder="Due date will be calculated"
          />

          <InputField
            label="Total Amount"
            name="totalAmount"
            value={form.totalAmount}
            onChange={enhancedHandleChange}
            error={errors.totalAmount}
            readOnly
          />

          <InputField
            label="Paid Amount"
            name="paidAmount"
            type="text"
            value={form.paidAmount}
            onChange={enhancedHandleChange}
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
            label="Payment Status"
            name="paymentStatus"
            value={form.paymentStatus}
            onChange={enhancedHandleChange}
            error={errors.paymentStatus}
            suggestions={paymentStatusSuggestions.filteredItems}
            isOpen={paymentStatusSuggestions.isOpen}
            highlightedIndex={paymentStatusSuggestions.highlightedIndex}
            inputRef={paymentStatusSuggestions.inputRef}
            dropdownTop={paymentStatusSuggestions.dropdownTop}
            onFocus={() => paymentStatusSuggestions.setIsOpen(true)}
            onBlur={() =>
              setTimeout(() => paymentStatusSuggestions.setIsOpen(false), 150)
            }
            onSuggestionSelect={(value) =>
              updateFormField("paymentStatus", value)
            }
            getSuggestionValue={(item) => item.type}
            getSuggestionDisplay={(item) => item.type}
            setHighlightedIndex={paymentStatusSuggestions.setHighlightedIndex}
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
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow transition-colors cursor-pointer"
          >
            Add Sale
          </button>
          <button
            type="button"
            onClick={() => navigate("/salelayout/sale")}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddSale;