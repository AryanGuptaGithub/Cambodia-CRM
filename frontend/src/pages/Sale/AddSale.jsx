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
                value: date.toISOString().split("T")[0], // Format as YYYY-MM-DD
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
    setHighlightedIndex, // <-- NEW: Pass this from parent to allow keyboard navigation
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

  const { form, errors, handleChange, validate, updateFormField } =
    useSaleForm(customerCode);

  // Use your custom hook for initial data
  const { statuses, productNames, loading } = useInitialSaleData();

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
      const response = await fetch(`${backendUrl}/api/sales`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const respData = await response.json();

      if (!response.ok) {
        throw new Error(respData.error || "Something went wrong");
      }

      showToast("success", respData.message || "Sale added successfully");
      navigate("/salelayout/sale");
    } catch (err) {
      console.error("Error submitting sale:", err);
      showToast("error", err.message || "Error submitting sale");
    }
  };

  // Show loading state if needed
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
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Add New Sale</h2>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* DatePicker for Recording Date */}
          <DatePickerField
            label="Recording Date"
            name="recordingDate"
            value={form.recordingDate}
            onChange={enhancedHandleChange}
            error={errors.recordingDate}
            required={true}
            placeholder="Select recording date"
          />

          <InputField
            label="Invoice Number"
            name="invoiceNumber"
            value={form.invoiceNumber}
            onChange={enhancedHandleChange}
            error={errors.invoiceNumber}
            required={true}
          />

          {/* DatePicker for Invoice Date */}
          <DatePickerField
            label="Invoice Date"
            name="invoiceDate"
            value={form.invoiceDate}
            onChange={enhancedHandleChange}
            error={errors.invoiceDate}
            required={true}
            placeholder="Select invoice date"
          />

          <InputField
            label="Medical Representative Name"
            name="mrName"
            value={form.mrName}
            onChange={enhancedHandleChange}
            error={errors.mrName}
            required={true}
          />

          <InputField
            label="Customer Code"
            name="customerCode"
            value={form.customerCode}
            onChange={enhancedHandleChange}
            error={errors.customerCode}
            required={true}
          />

          {/* Product Name Suggestion - placed after Customer Code */}
          {/* <SuggestionInput
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
          /> */}
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
            setHighlightedIndex={productNameSuggestions.setHighlightedIndex} // ✅ Pass this
          />

          {/* Continue with remaining fields in exact order */}
          <InputField
            label="Sales Quantity"
            name="salesQty"
            type="text"
            value={form.salesQty}
            onChange={enhancedHandleChange}
            error={errors.salesQty}
            required={true}
          />

          <InputField
            label="Bonus Quantity"
            name="bonusQty"
            type="text"
            value={form.bonusQty}
            onChange={enhancedHandleChange}
            error={errors.bonusQty}
          />

          <InputField
            label="Total Quantity"
            name="totalQty"
            value={form.totalQty}
            onChange={enhancedHandleChange}
            error={errors.totalQty}
            readOnly={true}
          />

          <InputField
            label="Selling Price"
            name="sellingPrice"
            type="text"
            value={form.sellingPrice}
            onChange={enhancedHandleChange}
            error={errors.sellingPrice}
            required={true}
          />

          <InputField
            label="Amount"
            name="amount"
            value={form.amount}
            onChange={enhancedHandleChange}
            error={errors.amount}
            readOnly={true}
          />

          <InputField
            label="Discount"
            name="discount"
            type="text"
            value={form.discount}
            onChange={enhancedHandleChange}
            error={errors.discount}
          />

          <InputField
            label="Net Selling Amount"
            name="netSellingAmount"
            value={form.netSellingAmount}
            onChange={enhancedHandleChange}
            error={errors.netSellingAmount}
            readOnly={true}
          />

          <InputField
            label="Average Unit Price"
            name="averageUnitPrice"
            value={form.averageUnitPrice}
            onChange={enhancedHandleChange}
            error={errors.averageUnitPrice}
            readOnly={true}
          />

          <InputField
            label="LC"
            name="lc"
            type="text"
            value={form.lc}
            onChange={enhancedHandleChange}
            error={errors.lc}
          />

          <InputField
            label="Profit / Loss"
            name="profitLoss"
            value={form.profitLoss}
            onChange={enhancedHandleChange}
            error={errors.profitLoss}
            readOnly={true}
          />

          <InputField
            label="Credit Days"
            name="creditDays"
            type="text"
            value={form.creditDays}
            onChange={enhancedHandleChange}
            error={errors.creditDays}
          />

          {/* DatePicker for Due Date (read-only) */}
          <DatePickerField
            label="Due Date"
            name="dueDate"
            value={form.dueDate}
            onChange={enhancedHandleChange}
            error={errors.dueDate}
            readOnly={true}
            placeholder="Due date will be calculated"
          />

          {/* DatePicker for Delivery Date (read-only) */}
          <DatePickerField
            label="Delivery Date"
            name="deliveryDate"
            value={form.deliveryDate}
            onChange={enhancedHandleChange}
            error={errors.deliveryDate}
            readOnly={true}
            placeholder="Delivery date will be set automatically"
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
            readOnly={true}
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
            setHighlightedIndex={paymentStatusSuggestions.setHighlightedIndex} // ✅ Pass this
          />

          {/* Remark field - full width */}
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
