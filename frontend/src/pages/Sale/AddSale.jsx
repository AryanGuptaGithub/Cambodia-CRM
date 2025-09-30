import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Constants
const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  mrName: "",
  customerCode: "",
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
  creditDays: "",
  dueDate: "",
  deliveryDate: "",
  paidAmount: "",
  dueAmount: "",
  paymentStatus: "",
  remark: "",
};

// Custom hook for API calls
const useApi = () => {
  const fetchData = useCallback(async (endpoint, options = {}) => {
    try {
      const response = await fetch(`${backendUrl}${endpoint}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error);
      throw error;
    }
  }, []);

  return { fetchData };
};

// Custom hook for form state management
const useSaleForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    ...INITIAL_FORM_STATE,
    customerCode: initialCustomerCode,
  });
  const [errors, setErrors] = useState({});

  const parseNumber = useCallback((val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }, []);

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const calculateDerivedFields = useCallback(
    (name, value, currentForm) => {
      const updatedForm = { ...currentForm, [name]: value };
      const getNum = (field) =>
        parseNumber(updatedForm[field] || currentForm[field]);
      const getInt = (field) =>
        parseInt(updatedForm[field] || currentForm[field] || 0, 10);

      // Calculations
      if (name === "salesQty" || name === "bonusQty") {
        const salesQty =
          name === "salesQty" ? parseInt(value, 10) || 0 : getInt("salesQty");
        const bonusQty =
          name === "bonusQty" ? parseInt(value, 10) || 0 : getInt("bonusQty");
        updatedForm.totalQty = salesQty + bonusQty;
      }

      if (name === "invoiceDate" && !currentForm.deliveryDate) {
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

      if (name === "sellingPrice" || name === "salesQty") {
        const price = getNum("sellingPrice");
        const qty = getInt("salesQty");
        updatedForm.amount = (price * qty).toFixed(2);
      }

      if (["amount", "discount", "sellingPrice", "salesQty"].includes(name)) {
        const amount = getNum("amount");
        const discount = getNum("discount");
        updatedForm.netSellingAmount = (amount - discount).toFixed(2);
      }

      if (
        [
          "amount",
          "discount",
          "lc",
          "totalQty",
          "salesQty",
          "bonusQty",
        ].includes(name)
      ) {
        const amount = getNum("amount");
        const discount = getNum("discount");
        const lc = getNum("lc");
        const totalQty = getInt("totalQty");
        updatedForm.profitLoss = (amount - discount - lc * totalQty).toFixed(2);
      }

      if (["netSellingAmount", "paidAmount"].includes(name)) {
        const netAmount = getNum("netSellingAmount");
        const paidAmount = getNum("paidAmount");
        updatedForm.dueAmount = (netAmount - paidAmount).toFixed(2);
      }

      if (
        [
          "netSellingAmount",
          "salesQty",
          "bonusQty",
          "discount",
          "sellingPrice",
        ].includes(name)
      ) {
        const net = getNum("netSellingAmount");
        const totalQty = getInt("totalQty");
        updatedForm.averageUnitPrice =
          totalQty > 0 ? (net / totalQty).toFixed(2) : "";
      }

      return updatedForm;
    },
    [parseNumber]
  );

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;

      if (name === "paymentStatus" || name === "productName") {
        updateFormField(name, value);
        return;
      }

      setForm((prev) => calculateDerivedFields(name, value, prev));
    },
    [updateFormField, calculateDerivedFields]
  );

  const validate = useCallback(() => {
    const newErrors = {};
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "invoiceDate",
      "mrName",
      "customerCode",
      "productName",
      "paymentStatus",
    ];

    requiredFields.forEach((field) => {
      if (!form[field]) {
        newErrors[field] = `${field.replace(/([A-Z])/g, " $1")} is required`;
      }
    });

    if (!form.salesQty || Number(form.salesQty) <= 0) {
      newErrors.salesQty = "Sales Quantity must be > 0";
    }

    if (!form.sellingPrice || Number(form.sellingPrice) <= 0) {
      newErrors.sellingPrice = "Selling Price must be > 0";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  return {
    form,
    errors,
    handleChange,
    validate,
    updateFormField,
    setErrors,
  };
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
    onKeyDown,
    onSuggestionSelect,
    getSuggestionValue = (item) => item,
    getSuggestionDisplay = (item) => item,
  }) => {
    const handleMouseEnter = useCallback(
      (index) => {
        onSuggestionSelect && onSuggestionSelect(index, true);
      },
      [onSuggestionSelect]
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
          onKeyDown={onKeyDown}
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
                key={typeof item === "object" ? item._id : idx}
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

const validateProductName = (value) => {
  return /^[A-Za-z][A-Za-z0-9]*$/.test(value);
};

const AddSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { customerCode } = location.state || {};

  const { fetchData } = useApi();
  const { form, errors, handleChange, validate, updateFormField } =
    useSaleForm(customerCode);

  const [statuses, setStatuses] = useState([]);
  const [productNames, setProductNames] = useState([]);

  // Fetch data on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [statusesData, productsData] = await Promise.all([
          fetchData("/api/sales/payment-status"),
          fetchData("/api/sales/unique-names"),
        ]);

        setStatuses(statusesData);
        setProductNames(productsData.productNames || []);
      } catch (error) {
        showToast("error", "Failed to load initial data");
      }
    };

    fetchInitialData();
  }, [fetchData]);

  // Payment Status Suggestions
  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );

  // Product Name Suggestions
  const productNameSuggestions = useSuggestions(
    productNames,
    "name",
    form.productName
  );

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
      if (name === "productName" && value.length > 0) {
        productNameSuggestions.setIsOpen(true);
        productNameSuggestions.setHighlightedIndex(-1);
      }
    },
    [handleChange, paymentStatusSuggestions, productNameSuggestions]
  );

  // Handle mouse enter for suggestions
  const handlePaymentStatusHighlight = useCallback(
    (index, isHighlight) => {
      if (isHighlight) {
        paymentStatusSuggestions.setHighlightedIndex(index);
      }
    },
    [paymentStatusSuggestions]
  );

  const handleProductNameHighlight = useCallback(
    (index, isHighlight) => {
      if (isHighlight) {
        productNameSuggestions.setHighlightedIndex(index);
      }
    },
    [productNameSuggestions]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const respData = await fetchData("/api/sales", {
        method: "POST",
        body: JSON.stringify(form),
      });

      showToast("success", respData.message || "Sale added successfully");
      navigate("/salelayout/sale");
    } catch (err) {
      showToast("error", err.message || "Error submitting sale");
    }
  };

  // Define form fields in the desired order
  const formFields = [
    {
      label: "Recording Date",
      name: "recordingDate",
      type: "date",
      required: true,
    },
    { label: "Invoice Number", name: "invoiceNumber", required: true },
    {
      label: "Invoice Date",
      name: "invoiceDate",
      type: "date",
      required: true,
    },
    { label: "Medical Representative Name", name: "mrName", required: true },
    { label: "Customer Code", name: "customerCode", required: true },
    { label: "Sales Quantity", name: "salesQty", type: "text", required: true },
    { label: "Bonus Quantity", name: "bonusQty", type: "text" },
    { label: "Total Quantity", name: "totalQty", readOnly: true },
    {
      label: "Selling Price",
      name: "sellingPrice",
      type: "text",
      required: true,
    },
    { label: "Amount", name: "amount", readOnly: true },
    { label: "Discount", name: "discount", type: "text" },
    { label: "Net Selling Amount", name: "netSellingAmount", readOnly: true },
    { label: "Average Unit Price", name: "averageUnitPrice", readOnly: true },
    { label: "LC", name: "lc", type: "text" },

    { label: "Credit Days", name: "creditDays", type: "text" },
    { label: "Due Date", name: "dueDate", type: "date", readOnly: true },
    {
      label: "Delivery Date",
      name: "deliveryDate",
      type: "date",
      readOnly: true,
    },
    { label: "Paid Amount", name: "paidAmount", type: "text" },
    { label: "Due Amount", name: "dueAmount", readOnly: true },
    { label: "Remark", name: "remark", colSpan: 3 },
    { label: "Profit / Loss", name: "profitLoss", readOnly: true },
  ];

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Sale</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Render fields up to Customer Code */}
          {formFields.slice(0, 5).map((field) => (
            <div
              key={field.name}
              className={field.colSpan ? `sm:col-span-${field.colSpan}` : ""}
            >
              <InputField
                label={field.label}
                name={field.name}
                type={field.type}
                value={form[field.name]}
                onChange={enhancedHandleChange}
                error={errors[field.name]}
                required={field.required}
                readOnly={field.readOnly}
              />
            </div>
          ))}
          <SuggestionInput
            label="Product Name"
            name="productName"
            value={form.productName}
            onChange={enhancedHandleChange}
            error={errors.productName}
            suggestions={productNameSuggestions.filteredItems}
            isOpen={productNameSuggestions.isOpen}
            highlightedIndex={productNameSuggestions.highlightedIndex}
            inputRef={productNameSuggestions.inputRef}
            dropdownTop={productNameSuggestions.dropdownTop}
            onKeyDown={(e) =>
              productNameSuggestions.handleKeyDown(e, (value) =>
                updateFormField("productName", value)
              )
            }
            onFocus={() => productNameSuggestions.setIsOpen(true)}
            onBlur={() =>
              setTimeout(() => productNameSuggestions.setIsOpen(false), 150)
            }
            onSuggestionSelect={(value, isHighlight) => {
              if (typeof value === "number" && isHighlight) {
                handleProductNameHighlight(value, true);
              } else {
                productNameSuggestions.selectSuggestion(value, (val) =>
                  updateFormField("productName", val)
                );
              }
            }}
            getSuggestionValue={(item) =>
              typeof item === "string" ? item : item.name
            }
            getSuggestionDisplay={(item) =>
              typeof item === "string" ? item : item.name
            }
          />
    
          {formFields.slice(5, 19).map((field) => (
            <div
              key={field.name}
              className={field.colSpan ? `sm:col-span-${field.colSpan}` : ""}
            >
              <InputField
                label={field.label}
                name={field.name}
                type={field.type}
                value={form[field.name]}
                onChange={enhancedHandleChange}
                error={errors[field.name]}
                required={field.required}
                readOnly={field.readOnly}
              />
            </div>
          ))}{" "}
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
            onKeyDown={(e) =>
              paymentStatusSuggestions.handleKeyDown(e, (value) =>
                updateFormField("paymentStatus", value)
              )
            }
            onFocus={() => paymentStatusSuggestions.setIsOpen(true)}
            onBlur={() =>
              setTimeout(() => paymentStatusSuggestions.setIsOpen(false), 150)
            }
            onSuggestionSelect={(value, isHighlight) => {
              if (typeof value === "number" && isHighlight) {
                handlePaymentStatusHighlight(value, true);
              } else {
                paymentStatusSuggestions.selectSuggestion(value, (val) =>
                  updateFormField("paymentStatus", val)
                );
              }
            }}
            getSuggestionValue={(item) => item.type}
            getSuggestionDisplay={(item) => item.type}
          />
          {formFields.slice(19).map((field) => (
            <div
              key={field.name}
              className={field.colSpan ? `sm:col-span-${field.colSpan}` : ""}
            >
              <InputField
                label={field.label}
                name={field.name}
                type={field.type}
                value={form[field.name]}
                onChange={enhancedHandleChange}
                error={errors[field.name]}
                required={field.required}
                readOnly={field.readOnly}
              />
            </div>
          ))}
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
