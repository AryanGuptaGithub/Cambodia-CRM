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
  returnQuantity: "",
  usedQty: "",
  sellingPrice: "",
  amount: "",
  discount: "",
  netSellingAmount: "",
  usedPrice: "",
  lc: "",
  profitLoss: "",
  creditDays: "",
  dueDate: "",
  deliveryDate: "",
  paidAmount: "",
  dueAmount: "",
  balanceAmount: "",
  paymentStatus: "",
  remark: "",
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

const AddReturnSale = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sales, setSales] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [errors, setErrors] = useState({});
  const [filteredSales, setFilteredSales] = useState([]);
  
  const { customerCode } = location.state || {};
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Use your custom hook for initial data
  const { statuses, productNames, loading } = useInitialSaleData();

  // Calculate derived fields
  const calculateDerivedFields = useCallback(
    (name, value, currentForm) => {
      const updatedForm = { ...currentForm, [name]: value };
      const getNum = (field) =>
        parseNumber(updatedForm[field] || currentForm[field]);
      const getInt = (field) =>
        parseInt(updatedForm[field] || currentForm[field] || 0, 10);

      // Calculations for Return Sale
      if (name === "salesQty" || name === "returnQuantity") {
        const salesQty = getInt("salesQty");
        const returnQty = getInt("returnQuantity");
        updatedForm.usedQty = Math.max(salesQty - returnQty, 0);
      }

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

      // Calculate Used Price (price for used quantity)
      if (["netSellingAmount", "salesQty", "returnQuantity"].includes(name)) {
        const netAmount = getNum("netSellingAmount");
        const salesQty = getInt("salesQty");
        if (salesQty > 0) {
          updatedForm.usedPrice = (netAmount / salesQty).toFixed(2);
        } else {
          updatedForm.usedPrice = "";
        }
      }

      if (
        ["amount", "discount", "lc", "salesQty", "returnQuantity"].includes(name)
      ) {
        const amount = getNum("amount");
        const discount = getNum("discount");
        const lc = getNum("lc");
        const usedQty = getInt("usedQty");
        updatedForm.profitLoss = (amount - discount - lc * usedQty).toFixed(2);
      }

      if (["netSellingAmount", "paidAmount"].includes(name)) {
        const netAmount = getNum("netSellingAmount");
        const paidAmount = getNum("paidAmount");
        updatedForm.dueAmount = Math.max(netAmount - paidAmount, 0).toFixed(2);
        updatedForm.balanceAmount = updatedForm.dueAmount;
      }

      return updatedForm;
    },
    []
  );

  // Validation function
  const validate = useCallback(() => {
    const newErrors = {};
    const requiredFields = [
      "recordingDate",
      "invoiceNumber",
      "mrName",
      "customerCode",
      "productName",
      "returnQuantity",
      "sellingPrice",
    ];

    requiredFields.forEach((field) => {
      if (!form[field]) {
        newErrors[field] = `${field.replace(/([A-Z])/g, " $1")} is required`;
      }
    });

    if (!form.returnQuantity || Number(form.returnQuantity) < 0) {
      newErrors.returnQuantity = "Return Quantity must be >= 0";
    }

    if (!form.sellingPrice || Number(form.sellingPrice) <= 0) {
      newErrors.sellingPrice = "Selling Price must be > 0";
    }

    // Validate that return quantity doesn't exceed sales quantity
    const salesQty = Number(form.salesQty) || 0;
    const returnQty = Number(form.returnQuantity) || 0;
    if (returnQty > salesQty) {
      newErrors.returnQuantity = "Return quantity cannot exceed sales quantity";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  // Update form field with derived calculations
  const updateFormField = useCallback((name, value) => {
    setForm(prev => calculateDerivedFields(name, value, prev));
  }, [calculateDerivedFields]);

  // Enhanced handle change
  const enhancedHandleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      updateFormField(name, value);
    },
    [updateFormField]
  );

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

  // Function to filter sales based on invoiceNumber
  const filterSalesByInvoice = useCallback((invoiceNumber) => {
    if (!invoiceNumber) {
      setFilteredSales(sales);
    } else {
      const filtered = sales.filter((sale) =>
        sale.invoiceNumber.toLowerCase().includes(invoiceNumber.toLowerCase())
      );
      setFilteredSales(filtered);
    }
  }, [sales]);

  // Handle invoice number change
  const handleInvoiceNumberChange = useCallback((e) => {
    const { value } = e.target;
    updateFormField("invoiceNumber", value);
    filterSalesByInvoice(value);
  }, [updateFormField, filterSalesByInvoice]);

  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();
      setSales(data);
      setFilteredSales(data);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  // Handle suggestion selection for product name
  const handleProductNameSelect = useCallback((value) => {
    updateFormField("productName", value);
  }, [updateFormField]);

  // Handle mouse enter for product name suggestions
  const handleProductNameHighlight = useCallback(
    (index) => {
      productNameSuggestions.setHighlightedIndex(index);
    },
    [productNameSuggestions]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const response = await fetch(`${backendUrl}/api/sales/return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const respData = await response.json();
      console.log("values of respData", respData);

      if (!response.ok) {
        throw new Error(respData.error || "Something went wrong");
      }

      showToast(
        "success",
        respData.message || "Return Sale added successfully"
      );
      navigate("/salelayout/salereturn");
    } catch (err) {
      console.error("Error submitting return sale:", err);
      showToast("error", err.message || "Error submitting return sale");
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
console.log('valueso f filteredSales', filteredSales);
  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-2xl shadow">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">
        Add New Sale Return
      </h2>

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
            onChange={handleInvoiceNumberChange}
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
            onSuggestionSelect={handleProductNameSelect}
            getSuggestionValue={(item) =>
              typeof item === "string" ? item : item.name
            }
            getSuggestionDisplay={(item) =>
              typeof item === "string" ? item : item.name
            }
            setHighlightedIndex={productNameSuggestions.setHighlightedIndex}
          />

          {/* Continue with remaining fields in exact order */}
          <InputField
            label="Sales Quantity"
            name="salesQty"
            type="number"
            value={form.salesQty}
            onChange={enhancedHandleChange}
            error={errors.salesQty}
            placeholder="Original sales quantity"
          />

          <InputField
            label="Return Quantity"
            name="returnQuantity"
            type="number"
            value={form.returnQuantity}
            onChange={enhancedHandleChange}
            error={errors.returnQuantity}
            required={true}
            placeholder="Quantity being returned"
          />

          <InputField
            label="Used Quantity"
            name="usedQty"
            value={form.usedQty}
            onChange={enhancedHandleChange}
            error={errors.usedQty}
            readOnly={true}
            placeholder="Auto-calculated"
          />

          <InputField
            label="Selling Price"
            name="sellingPrice"
            type="number"
            step="0.01"
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
            type="number"
            step="0.01"
            value={form.discount}
            onChange={enhancedHandleChange}
            error={errors.discount}
            placeholder="Discount amount"
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
            label="Used Price"
            name="usedPrice"
            value={form.usedPrice}
            onChange={enhancedHandleChange}
            error={errors.usedPrice}
            readOnly={true}
          />

          <InputField
            label="Paid Amount"
            name="paidAmount"
            type="number"
            step="0.01"
            value={form.paidAmount}
            onChange={enhancedHandleChange}
            error={errors.paidAmount}
            placeholder="Amount already paid"
          />

          <InputField
            label="Due Amount"
            name="dueAmount"
            value={form.dueAmount}
            onChange={enhancedHandleChange}
            error={errors.dueAmount}
            readOnly={true}
          />

          <InputField
            label="Balance Amount"
            name="balanceAmount"
            value={form.balanceAmount}
            onChange={enhancedHandleChange}
            error={errors.balanceAmount}
            readOnly={true}
          />

          {/* Remark field - full width */}
          <div className="sm:col-span-3">
            <InputField
              label="Remark"
              name="remark"
              value={form.remark}
              onChange={enhancedHandleChange}
              error={errors.remark}
              placeholder="Additional notes for return"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6 gap-3">
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg shadow transition-colors cursor-pointer"
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
      </form>
    </div>
  );
};

export default AddReturnSale;