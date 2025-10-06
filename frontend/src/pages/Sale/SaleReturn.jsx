import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  X,
  Settings,
  Eye,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { useInitialSaleData } from "./IntialLoading.jsx";

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

// Custom hook for suggestions (simplified for string arrays)
const useSuggestions = (items = [], inputValue = "") => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const [dropdownTop, setDropdownTop] = useState(0);

  const filteredItems = useMemo(() => {
    if (!items || items.length === 0) return [];

    return items
      .filter((item) => {
        if (!item) return false;
        return item.toLowerCase().includes(inputValue.toLowerCase());
      })
      .sort((a, b) => a.localeCompare(b));
  }, [items, inputValue]);

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
            onSelect(selected);
            setIsOpen(false);
            setHighlightedIndex(-1);
          }
          break;
        case "Escape":
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
        default:
          break;
      }
    },
    [isOpen, filteredItems, highlightedIndex]
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

const SaleReturn = () => {
  const [saleReturns, setSaleReturns] = useState([]);
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [isOpen, setIsOpen] = useState(false);
  const { statuses, productNames, loading } = useInitialSaleData();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // Column configuration state
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("add");
  const [selectedItems, setSelectedItems] = useState([]);
  const [allSelected, setAllSelected] = useState(false);

  const returnsPerPage = 10;
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Define all available table columns
  const allFields = useMemo(
    () => [
      {
        id: "recordingDate",
        name: "Recording Date",
        dbName: "recordingDate",
      },
      {
        id: "invoiceNumber",
        name: "Invoice Number",
        dbName: "invoiceNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "mrName",
        name: "MR Name",
        dbName: "mrName",
      },
      {
        id: "customerName",
        name: "Customer Name",
        dbName: "customerName",
      },
      {
        id: "productName",
        name: "Product Name",
        dbName: "productName",
      },
      {
        id: "salesQty",
        name: "Sales Quantity",
        dbName: "salesQty",
      },
      {
        id: "returnQuantity",
        name: "Return Quantity",
        dbName: "returnQuantity",
      },
      {
        id: "usedQty",
        name: "Used Quantity",
        dbName: "usedQty",
      },
      {
        id: "sellingPrice",
        name: "Selling Price",
        dbName: "sellingPrice",
      },
      {
        id: "amount",
        name: "Amount",
        dbName: "amount",
      },
      {
        id: "discount",
        name: "Discount",
        dbName: "discount",
      },
      {
        id: "netSellingAmount",
        name: "Net Selling Amount",
        dbName: "netSellingAmount",
      },
      {
        id: "usedPrice",
        name: "Used Price",
        dbName: "usedPrice",
      },
      {
        id: "usedAmount",
        name: "Used Amount",
        dbName: "usedAmount",
      },
      {
        id: "paidAmount",
        name: "Paid Amount",
        dbName: "paidAmount",
      },
      {
        id: "dueAmount",
        name: "Due Amount",
        dbName: "dueAmount",
      },
      {
        id: "paymentStatus",
        name: "Payment Status",
        dbName: "paymentStatus",
      },
      {
        id: "remark",
        name: "Remark",
        dbName: "remark",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Extract just the string values from the objects
  const paymentStatusStrings = useMemo(
    () => (statuses ? statuses.map((s) => s.type) : []),
    [statuses]
  );

  const productNameStrings = useMemo(
    () => (productNames ? productNames.map((p) => p) : []),
    [productNames]
  );

  // Use the custom hook for suggestions with string arrays
  const paymentStatusSuggestions = useSuggestions(
    paymentStatusStrings,
    form.paymentStatus
  );

  const productNameSuggestions = useSuggestions(
    productNameStrings,
    form.productName
  );

  const requiredColumns = [
    "invoiceNumber",
    "invoiceDate",
    "productName",
    "actions",
  ];

  // Select product from suggestions
  const selectProduct = (product) => {
    setForm((prev) => ({
      ...prev,
      productName: product,
    }));
    productNameSuggestions.setIsOpen(false);
  };

  // Select payment status from suggestions
  const selectPaymentStatus = (status) => {
    setForm((prev) => ({
      ...prev,
      paymentStatus: status,
    }));
    paymentStatusSuggestions.setIsOpen(false);
  };

  // Default table columns
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "invoiceDate",
    "productName",
    "mrName",
    "customerName",
    "salesQty",
    "returnQuantity",
    "amount",
    "paymentStatus",
    "programStatus",
    "actions",
  ]);

  // Get available columns for Add tab (columns not currently in table)
  const availableColumns = useMemo(() => {
    return allFields.filter((item) => !tableColumns.includes(item.id));
  }, [allFields, tableColumns]);

  const removableColumns = useMemo(() => {
    return allFields.filter(
      (item) =>
        tableColumns.includes(item.id) && !requiredColumns.includes(item.id)
    );
  }, [allFields, tableColumns]);

  const chunkedItems = useMemo(() => {
    const items = activeTab === "add" ? availableColumns : removableColumns;
    const chunks = [];
    for (let i = 0; i < items.length; i += 2) {
      chunks.push(items.slice(i, i + 2));
    }
    return chunks;
  }, [activeTab, availableColumns, removableColumns]);

  // Toggle item selection
  const toggleItem = (id) => {
    if (id === "all") {
      if (allSelected) {
        setSelectedItems([]);
        setAllSelected(false);
      } else {
        const allIds = chunkedItems.flat().map((item) => item.id);
        setSelectedItems(allIds);
        setAllSelected(true);
      }
    } else {
      let updatedItems;
      if (selectedItems.includes(id)) {
        updatedItems = selectedItems.filter((itemId) => itemId !== id);
      } else {
        updatedItems = [...selectedItems, id];
      }

      setSelectedItems(updatedItems);
      setAllSelected(updatedItems.length === chunkedItems.flat().length);
    }
  };

  // Handle save for column configuration
  const handleSaveFields = () => {
    if (activeTab === "add") {
      // Add selected columns to table
      const newColumns = [...tableColumns, ...selectedItems];
      setTableColumns(newColumns);
    } else {
      const newColumns = tableColumns.filter(
        (id) => !selectedItems.includes(id) || requiredColumns.includes(id)
      );
      setTableColumns(newColumns);
    }
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };

  const handleResetFields = () => {
    setSelectedItems([]);
    setAllSelected(false);
    // Reset to default columns
    setTableColumns([
      "invoiceNumber",
      "invoiceDate",
      "productName",
      "mrName",
      "customerName",
      "salesQty",
      "returnQuantity",
      "amount",
      "paymentStatus",
      "programStatus",
      "actions",
    ]);
  };

  const handleCancelEvent = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };

  // Fetch sale returns
  const fetchSaleReturn = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/salesreturn`);
      if (!res.ok) throw new Error("Failed to fetch sale returns");
      const data = await res.json();
      setSaleReturns(data.data || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale returns");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSaleReturn();
  }, []);

  // Calculate amounts based on the data
  const calculateAmounts = (product) => {
    const salesQty = parseFloat(product.salesQty) || 0;
    const sellingPrice = parseFloat(product.sellingPrice) || 0;
    const discount = parseFloat(product.discount) || 0;
    const usedQty = parseFloat(product.usedQty) || 0;
    const usedPrice = parseFloat(product.usedPrice) || 0;

    // Calculate amount (sales quantity * selling price)
    const amount = salesQty * sellingPrice;

    // Calculate net selling amount (amount - discount)
    const netSellingAmount = amount - discount;

    // Calculate used amount (used quantity * used price)
    const usedAmount = usedQty * usedPrice;

    return {
      amount: amount.toFixed(2),
      netSellingAmount: netSellingAmount.toFixed(2),
      usedAmount: usedAmount.toFixed(2),
    };
  };

  // Enhanced handle change for form fields
  const enhancedHandleChange = (e) => {
    const { name, value } = e.target;

    setForm((prevForm) => {
      const updatedForm = {
        ...prevForm,
        [name]: value,
      };

      // Extract relevant numeric values
      const salesQty =
        parseFloat(name === "salesQty" ? value : prevForm.salesQty) || 0;
      const returnQuantity =
        parseFloat(
          name === "returnQuantity" ? value : prevForm.returnQuantity
        ) || 0;
      const sellingPrice =
        parseFloat(name === "sellingPrice" ? value : prevForm.sellingPrice) ||
        0;
      const paidAmount =
        parseFloat(name === "paidAmount" ? value : prevForm.paidAmount) || 0;
      const amount =
        parseFloat(name === "amount" ? value : prevForm.amount) || 0;
      const discount =
        parseFloat(name === "discount" ? value : prevForm.discount) || 0;

      // Calculated fields
      const usedQty = Math.max(0, salesQty - returnQuantity);
      const usedAmount = usedQty * sellingPrice;
      const netSellingAmount = Math.max(0, amount - discount);
      const dueAmount = Math.max(0, usedAmount - paidAmount);

      return {
        ...updatedForm,
        usedQty: usedQty.toFixed(2),
        usedAmount: usedAmount.toFixed(2),
        netSellingAmount: netSellingAmount.toFixed(2),
        dueAmount: dueAmount.toFixed(2),
      };
    });

    // Autocomplete trigger
    if (name === "productName") {
      productNameSuggestions.setIsOpen(true);
      productNameSuggestions.setHighlightedIndex(-1);
    } else if (name === "paymentStatus") {
      paymentStatusSuggestions.setIsOpen(true);
      paymentStatusSuggestions.setHighlightedIndex(-1);
    }
  };

  const handleDateChange = (date, fieldName) => {
    setForm((prevForm) => ({
      ...prevForm,
      [fieldName]: date ? date.toISOString() : "",
    }));
  };

  const handleUpdateSales = async (e, formData) => {
    e.preventDefault();
    try {
      // Recalculate all amounts before submitting
      const calculatedAmounts = calculateAmounts(formData);

      const totalAmount = parseFloat(calculatedAmounts.netSellingAmount) || 0;
      const paidAmount = parseFloat(formData.paidAmount) || 0;
      const dueAmount = Math.max(0, totalAmount - paidAmount);

      const updatedForm = {
        ...formData,
        ...calculatedAmounts,
        totalAmount: totalAmount.toFixed(2),
        dueAmount: dueAmount.toFixed(2),
      };

      const response = await fetch(
        `${backendUrl}/api/salesreturn/${formData._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedForm),
        }
      );

      if (!response.ok) throw new Error("Failed to update sale return");

      const result = await response.json();
      showToast("success", "Sale return updated successfully");
      setIsEditModalOpen(false);
      setForm(INITIAL_FORM_STATE);
      fetchSaleReturn(); // Refresh the data
    } catch (error) {
      console.error("Update error:", error);
      showToast("error", error.message || "Error updating sale return");
    }
  };

  // Filtering logic
  const filteredReturns = saleReturns.filter((r) => {
    if (searchTerm.trim() === "") return true;
    const lower = searchTerm.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(lower) ||
      false ||
      r.productName?.toLowerCase().includes(lower) ||
      false ||
      r.customerName?.toLowerCase().includes(lower) ||
      false ||
      r.mrName?.toLowerCase().includes(lower) ||
      false
    );
  });

  // Pagination
  const indexOfLast = currentPage * returnsPerPage;
  const indexOfFirst = indexOfLast - returnsPerPage;
  const currentReturns = filteredReturns.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);

  const toggleSelect = (ret) => {
    setSelected((prev) => {
      return prev.some((s) => s === ret._id)
        ? prev.filter((s) => s !== ret._id)
        : [...prev, ret._id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentReturns.map((r) => r._id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sale returns?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/salesreturn`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected sale returns deleted successfully");
          fetchSaleReturn();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected sale returns.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSingle = async (id, invoiceNumber) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete sale return <b>${invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/salesreturn/${id}`);
        if (res.status === 200) {
          showToast(
            "success",
            `Sale return <b>${invoiceNumber}</b> deleted successfully`
          );
          fetchSaleReturn();
        }
      } catch (error) {
        showToast("error", "Failed to delete sale return.");
      }
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const editReturnSale = (returnSale) => {
    // Ensure all amounts are calculated correctly when editing
    const calculatedAmounts = calculateAmounts(returnSale);

    const calculatedReturnSale = {
      ...returnSale,
      ...calculatedAmounts,
    };

    setForm(calculatedReturnSale);
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const viewReturnSale = (returnSale) => {
    setForm(returnSale);
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  // Get field value from sale return object
  const getFieldValue = (saleReturn, dbName) => {
    if (["recordingDate", "invoiceDate"].includes(dbName)) {
      return formatDateToReadable(saleReturn[dbName]) || "--";
    }

    if (dbName === "amount") {
      const amount =
        (saleReturn.salesQty || 0) * (saleReturn.sellingPrice || 0);
      return amount.toFixed(2);
    }

    if (dbName === "netSellingAmount") {
      const amount =
        (saleReturn.salesQty || 0) * (saleReturn.sellingPrice || 0);
      const netAmount = amount - (saleReturn.discount || 0);
      return netAmount.toFixed(2);
    }

    return saleReturn[dbName] ?? "--";
  };

  // Helper function to handle numeric input
  const handleNumericInputChange = (e, onChangeHandler) => {
    const { name, value } = e.target;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      onChangeHandler(e);
    }
  };

  const handleProductNameHighlight = useCallback(
    (value, shouldUpdateForm = false) => {
      if (shouldUpdateForm && typeof value === "string") {
        setForm((prevForm) => ({
          ...prevForm,
          productName: value,
        }));
      }
    },
    []
  );

  // Also add the payment status highlight function if needed
  const handlePaymentStatusHighlight = useCallback(
    (value, shouldUpdateForm = false) => {
      if (shouldUpdateForm && typeof value === "string") {
        setForm((prevForm) => ({
          ...prevForm,
          paymentStatus: value,
        }));
      }
    },
    []
  );
  // Helper function to render form field based on type
  const renderFormField = (fieldId) => {
    const fieldConfig = allFields.find((f) => f.id === fieldId);
    if (!fieldConfig) return null;

    // Define numeric fields
    const numericFields = [
      "salesQty",
      "returnQuantity",
      "usedQty",
      "sellingPrice",
      "discount",
      "usedPrice",
      "paidAmount",
    ];

    // Define disabled calculated fields
    const calculatedFields = [
      "amount",
      "netSellingAmount",
      "usedAmount",
      "dueAmount",
      "totalAmount",
    ];

    // Define date fields
    const dateFields = ["recordingDate", "invoiceDate"];

    // Reusable input field
    const renderInput = ({
      type = "text",
      value = "",
      onChange,
      disabled = false,
      className = "w-full border px-3 py-2 rounded-lg",
      onFocus,
      onBlur,
      onKeyDown,
    }) => (
      <input
        type={type}
        name={fieldId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={className + (disabled ? " bg-gray-200" : "")}
        autoComplete="off"
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
    );

    if (dateFields.includes(fieldId)) {
      return (
        <div key={fieldId} className="relative">
          <label className="block text-sm font-medium">
            {fieldConfig.name}
          </label>
          <DatePicker
            selected={form[fieldId] ? new Date(form[fieldId]) : null}
            onChange={(date) => handleDateChange(date, fieldId)}
            dateFormat="yyyy-MM-dd"
            className="w-full border px-3 py-2 rounded-lg"
            autoComplete="off"
          />
        </div>
      );
    }

    if (numericFields.includes(fieldId)) {
      return (
        <div key={fieldId}>
          <label className="block text-sm font-medium">
            {fieldConfig.name}
          </label>
          {renderInput({
            value: form[fieldId] || "",
            onChange: (e) => handleNumericInputChange(e, enhancedHandleChange),
          })}
        </div>
      );
    }

    if (calculatedFields.includes(fieldId)) {
      return (
        <div key={fieldId}>
          <label className="block text-sm font-medium">
            {fieldConfig.name}
          </label>
          {renderInput({
            value: form[fieldId] || "",
            disabled: true,
          })}
        </div>
      );
    }

    if (fieldId === "productName") {
      return (
        <div key={fieldId} className="relative">
          <label className="block text-sm font-medium">
            {fieldConfig.name}
          </label>
          <div className="relative">
            {renderInput({
              value: form[fieldId] || "",
              onChange: enhancedHandleChange,
              onFocus: () => productNameSuggestions.setIsOpen(true),
              onBlur: () =>
                setTimeout(() => productNameSuggestions.setIsOpen(false), 200),
              onKeyDown: (e) =>
                productNameSuggestions.handleKeyDown(e, selectProduct),
            })}
            <button
              type="button"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              onClick={() =>
                productNameSuggestions.setIsOpen(!productNameSuggestions.isOpen)
              }
            >
              {productNameSuggestions.isOpen ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>

            {productNameSuggestions.isOpen &&
              productNameSuggestions.filteredItems.length > 0 && (
                <ul className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg">
                  {productNameSuggestions.filteredItems.map(
                    (product, index) => (
                      <li
                        key={index}
                        className={`cursor-pointer px-3 py-2 ${
                          index === productNameSuggestions.highlightedIndex
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-900 hover:bg-gray-100"
                        }`}
                        onMouseDown={() =>
                          productNameSuggestions.selectSuggestion(
                            product,
                            selectProduct
                          )
                        }
                        onMouseEnter={() =>
                          productNameSuggestions.setHighlightedIndex(index)
                        }
                      >
                        {product}
                      </li>
                    )
                  )}
                </ul>
              )}
          </div>
        </div>
      );
    }
    if (fieldId === "paymentStatus") {
      return (
        <div key={fieldId} className="relative">
          <label className="block text-sm font-medium">
            {fieldConfig.name}
          </label>
          <div className="relative">
            {renderInput({
              value: form[fieldId] || "",
              onChange: enhancedHandleChange,
              onFocus: () => paymentStatusSuggestions.setIsOpen(true),
              onBlur: () =>
                setTimeout(
                  () => paymentStatusSuggestions.setIsOpen(false),
                  200
                ),
              onKeyDown: (e) =>
                paymentStatusSuggestions.handleKeyDown(e, selectPaymentStatus),
            })}
            <button
              type="button"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
              onClick={() =>
                paymentStatusSuggestions.setIsOpen(
                  !paymentStatusSuggestions.isOpen
                )
              }
            >
              {paymentStatusSuggestions.isOpen ? (
                <ChevronUp size={16} />
              ) : (
                <ChevronDown size={16} />
              )}
            </button>

            {paymentStatusSuggestions.isOpen &&
              paymentStatusSuggestions.filteredItems.length > 0 && (
                <ul className="absolute z-10 bg-white border border-gray-300 w-full rounded-md max-h-60 overflow-auto shadow-lg">
                  {paymentStatusSuggestions.filteredItems.map(
                    (status, index) => (
                      <li
                        key={index}
                        className={`cursor-pointer px-3 py-2 ${
                          index === paymentStatusSuggestions.highlightedIndex
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-900 hover:bg-gray-100"
                        }`}
                        onMouseDown={() =>
                          paymentStatusSuggestions.selectSuggestion(
                            status,
                            selectPaymentStatus
                          )
                        }
                        onMouseEnter={() =>
                          paymentStatusSuggestions.setHighlightedIndex(index)
                        }
                      >
                        {status}
                      </li>
                    )
                  )}
                </ul>
              )}
          </div>
        </div>
      );
    }

    // Default text input for other fields
    return (
      <div key={fieldId}>
        <label className="block text-sm font-medium">{fieldConfig.name}</label>
        {renderInput({
          value: form[fieldId] || "",
          onChange: enhancedHandleChange,
        })}
      </div>
    );
  };

  if (loadingData) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg">Loading sale returns...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/salelayout/salereturn/new")}
            >
              <UserPlus size={18} /> Add New Sales Return
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}

            {/* Column Configuration Button */}
            <button
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => setIsColumnModalOpen(true)}
            >
              <Settings size={18} /> Add /Remove Column
            </button>
          </div>

          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredReturns.length}
              </span>
            </p>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search invoice, customer, product..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto shadow">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th
                      key={item.id}
                      className="p-3 whitespace-nowrap min-w-[120px]"
                    >
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentReturns.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all return sales"
                              checked={
                                selected.length === currentReturns.length &&
                                currentReturns.length > 0
                              }
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                            />
                          )}
                          <span>{item.name}</span>
                        </div>
                      ) : (
                        item.name
                      )}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {currentReturns.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No sale returns found.
                  </td>
                </tr>
              ) : (
                currentReturns.map((ret, index) => (
                  <tr
                    key={ret._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % returnsPerPage === 0 ||
                      index + 1 === currentReturns.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item) => (
                        <td
                          key={item.id}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {item.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.includes(ret._id)}
                                onChange={() => toggleSelect(ret)}
                              />
                              <span className="capitalize">
                                {ret.invoiceNumber}
                              </span>
                            </div>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                onClick={() => viewReturnSale(ret)}
                                title="View"
                              >
                                <Eye size={18} />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editReturnSale(ret)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() =>
                                  handleDeleteSingle(ret._id, ret.invoiceNumber)
                                }
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(ret, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {currentReturns.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded cursor-pointer ${
                  currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                {page}
              </button>
            ))}

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}

        {isColumnModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsColumnModalOpen(false)}
              />
              <div
                className="relative bg-white p-6 rounded shadow-lg max-w-4xl w-full z-10 max-h-[90vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">
                  {activeTab === "add" ? "Add Columns" : "Remove Columns"}
                </h2>

                <div className="flex w-full gap-2 mb-4">
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("add");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg cursor-pointer ${
                        activeTab === "add"
                          ? "bg-green-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Add Columns ({availableColumns.length})
                    </button>
                  </div>
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveTab("remove");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg cursor-pointer ${
                        activeTab === "remove"
                          ? "bg-red-600 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Remove Columns ({removableColumns.length})
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {chunkedItems.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
                      {/* Select All option */}
                      {chunkedItems.flat().length > 0 && (
                        <div className="flex gap-4 border-b pb-2 mb-2 sticky top-0 bg-white">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer select-none font-semibold">
                            <input
                              type="checkbox"
                              checked={allSelected}
                              onChange={() => toggleItem("all")}
                            />
                            Select All
                          </label>
                          <div className="flex-1"></div>
                        </div>
                      )}

                      {chunkedItems.map((pair, index) => (
                        <div key={index} className="flex gap-4">
                          {pair.map(({ id, name }) => (
                            <label
                              key={id}
                              className="flex items-center gap-1 flex-1 cursor-pointer select-none hover:bg-gray-50 rounded"
                            >
                              <input
                                type="checkbox"
                                checked={selectedItems.includes(id)}
                                onChange={() => toggleItem(id)}
                              />
                              <span className="flex-1">{name}</span>
                            </label>
                          ))}
                          {pair.length === 1 && <div className="flex-1"></div>}
                        </div>
                      ))}

                      {/* REQUIRED COLUMNS shown on Remove tab */}
                      {activeTab === "remove" && (
                        <div className="mt-6 border-t pt-4">
                          <h3 className="text-sm font-semibold text-gray-600 mb-2">
                            Compulsory Fields
                          </h3>
                          <div className="grid grid-cols-2 gap-3 text-gray-400 text-sm">
                            {allFields
                              .filter((field) =>
                                requiredColumns.includes(field.id)
                              )
                              .map((field) => (
                                <div
                                  key={field.id}
                                  className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 cursor-not-allowed"
                                >
                                  <input type="checkbox" checked disabled />
                                  <div className="flex flex-col">
                                    <span>{field.name}</span>
                                    <span className="text-xs text-red-500">
                                      This field is compulsory
                                    </span>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {activeTab === "add"
                        ? "All available columns are already in the table."
                        : "No columns available to remove."}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <button
                    onClick={handleResetFields}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                  >
                    Reset to Default
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCancelEvent}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveFields}
                      disabled={selectedItems.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Sales Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                  {[
                    ["Recording Date", "recordingDate"],
                    ["Invoice Date", "invoiceDate"],
                    ["Invoice Number", "invoiceNumber"],
                    ["MR Name", "mrName"],
                    ["Customer Code", "customerCode"],
                    ["Product Name", "productName"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-600">
                        {label}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form[key]
                          ? [
                              "recordingDate",
                              "invoiceDate",
                              "saleDate",
                            ].includes(key)
                            ? new Date(form[key]).toLocaleDateString()
                            : form[key]
                          : "-"}
                      </p>
                    </div>
                  ))}

                  {/* Numeric Fields */}
                  {[
                    ["Sales Quantity", "salesQty"],
                    ["Return Quantity", "returnQuantity"],
                    ["Used Quantity", "usedQty"],
                    ["Bonus Quantity", "bonusQty"],
                    ["Total Quantity", "totalQty"],
                    ["Selling Price", "sellingPrice"],
                    ["Amount", "amount"],
                    ["Discount", "discount"],
                    ["Net Selling Amount", "netSellingAmount"],
                    ["Used Price", "usedPrice"],
                    ["Used Amount", "usedAmount"],
                    ["Average Unit Price", "averageUnitPrice"],
                    ["Profit / Loss", "profitLoss"],
                    ["Credit Days", "creditDays"],
                    ["Paid Amount", "paidAmount"],
                    ["Due Amount", "dueAmount"],
                    ["Total Amount", "totalAmount"],
                  ].map(([label, key]) => {
                    // Fallback calculations if field is not available
                    let value = form[key];

                    if (!value || isNaN(value)) {
                      const f = (k) => parseFloat(form[k]) || 0;

                      if (key === "amount")
                        value = (f("salesQty") * f("sellingPrice")).toFixed(2);
                      if (key === "netSellingAmount") {
                        const amount = f("salesQty") * f("sellingPrice");
                        value = (amount - f("discount")).toFixed(2);
                      }
                      if (key === "usedAmount")
                        value = (f("usedQty") * f("usedPrice")).toFixed(2);
                    }

                    return (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-600">
                          {label}
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100">
                          {value ? parseFloat(value).toFixed(2) : "0.00"}
                        </p>
                      </div>
                    );
                  })}

                  {/* Date Fields */}
                  {[
                    ["Due Date", "dueDate"],
                    ["Delivery Date", "deliveryDate"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-600">
                        {label}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form[key]
                          ? new Date(form[key]).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  ))}

                  {/* Payment Status */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Payment Status
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.paymentStatus || "-"}
                    </p>
                  </div>

                  {/* Remark - Full Width */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-600">
                      Remark
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.remark || "-"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setForm(INITIAL_FORM_STATE);
                    productNameSuggestions.setIsOpen(false);
                    paymentStatusSuggestions.setIsOpen(false);
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-6">
                  Edit Sales Return Record - {form.invoiceNumber || "N/A"}
                </h2>

                <form
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto"
                  onSubmit={(e) => handleUpdateSales(e, form)}
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Recording Date
                    </label>
                    <DatePicker
                      selected={
                        form.recordingDate ? new Date(form.recordingDate) : null
                      }
                      onChange={(date) =>
                        handleDateChange(date, "recordingDate")
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  {/* Invoice Number */}
                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                      autoComplete="off"
                    />
                  </div>

                  {/* Invoice Date */}
                  <div>
                    <label className="block text-sm font-medium">
                      Invoice Date
                    </label>
                    <DatePicker
                      selected={
                        form.invoiceDate ? new Date(form.invoiceDate) : null
                      }
                      onChange={(date) => handleDateChange(date, "invoiceDate")}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg"
                    />
                  </div>

                  {/* MR Name */}
                  <div>
                    <label className="block text-sm font-medium">MR Name</label>
                    <input
                      type="text"
                      name="mrName"
                      value={form.mrName}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                      autoComplete="off"
                    />
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="block text-sm font-medium">
                      Customer Name
                    </label>
                    <input
                      type="text"
                      name="customerName"
                      value={form.customerName}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                      autoComplete="off"
                    />
                  </div>

                  {/* Product Name with Suggestions */}
                  <div className="relative">
                    <label className="block text-sm font-medium">
                      Product Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="productName"
                        value={form.productName}
                        onChange={enhancedHandleChange}
                        onFocus={() => productNameSuggestions.setIsOpen(true)}
                        onBlur={() =>
                          setTimeout(
                            () => productNameSuggestions.setIsOpen(false),
                            200
                          )
                        }
                        onKeyDown={(e) =>
                          productNameSuggestions.handleKeyDown(e, selectProduct)
                        }
                        className="w-full border px-3 py-2 rounded-lg capitalize"
                        autoComplete="off"
                        ref={productNameSuggestions.inputRef}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                        onClick={() =>
                          productNameSuggestions.setIsOpen(
                            !productNameSuggestions.isOpen
                          )
                        }
                      >
                        {productNameSuggestions.isOpen ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>

                      {productNameSuggestions.isOpen &&
                        productNameSuggestions.filteredItems.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {productNameSuggestions.filteredItems.map(
                              (product, index) => (
                                <div
                                  key={index}
                                  className={`px-3 py-2 hover:bg-gray-100 cursor-pointer ${
                                    index ===
                                    productNameSuggestions.highlightedIndex
                                      ? "bg-blue-50"
                                      : ""
                                  }`}
                                  onMouseDown={() =>
                                    productNameSuggestions.selectSuggestion(
                                      product,
                                      selectProduct
                                    )
                                  }
                                  onMouseEnter={() =>
                                    productNameSuggestions.setHighlightedIndex(
                                      index
                                    )
                                  }
                                  onSuggestionSelect={(value, isHighlight) => {
                                    if (isHighlight) {
                                      // Just highlight, don't update form
                                      handleProductNameHighlight(value, false);
                                    } else {
                                      // Actually select the value and update form
                                      productNameSuggestions.selectSuggestion(
                                        value,
                                        (val) =>
                                          updateFormField("productName", val)
                                      );
                                    }
                                  }}
                                >
                                  {product}
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Sales Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Sales Quantity
                    </label>
                    <input
                      type="text"
                      name="salesQty"
                      value={form.salesQty}
                      disabled
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      autoComplete="off"
                    />
                  </div>

                  {/* Return Quantity */}
                  <div>
                    <label className="block text-sm font-medium">
                      Return Quantity
                    </label>
                    <input
                      type="text"
                      name="returnQuantity"
                      value={form.returnQuantity}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Used Quantity
                    </label>
                    <input
                      type="text"
                      name="usedQty"
                      value={form.usedQty}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      autoComplete="off"
                      disabled
                    />
                  </div>

                  {/* Selling Price */}
                  <div>
                    <label className="block text-sm font-medium">
                      Selling Price
                    </label>
                    <input
                      type="text"
                      name="sellingPrice"
                      value={form.sellingPrice}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  {/* Amount (Calculated) */}
                  <div>
                    <label className="block text-sm font-medium">Amount</label>
                    <input
                      type="text"
                      disabled
                      value={form.amount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                    />
                  </div>

                  {/* Discount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Discount
                    </label>
                    <input
                      type="text"
                      name="discount"
                      value={form.discount}
                      disabled
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      autoComplete="off"
                    />
                  </div>

                  {/* Net Selling Amount (Calculated) */}
                  <div>
                    <label className="block text-sm font-medium">
                      Net Selling Amount
                    </label>
                    <input
                      type="text"
                      value={form.netSellingAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  {/* Used Price */}
                  <div>
                    <label className="block text-sm font-medium">
                      Used Price
                    </label>
                    <input
                      type="text"
                      name="usedPrice"
                      value={form.usedPrice}
                      disabled
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      autoComplete="off"
                    />
                  </div>

                  {/* Used Amount (Calculated) */}
                  <div>
                    <label className="block text-sm font-medium">
                      Used Amount
                    </label>
                    <input
                      type="text"
                      value={form.usedAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  {/* Total Amount (Calculated) */}
                  <div>
                    <label className="block text-sm font-medium">
                      Total Amount
                    </label>
                    <input
                      type="text"
                      value={form.totalAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  {/* Paid Amount */}
                  <div>
                    <label className="block text-sm font-medium">
                      Paid Amount
                    </label>
                    <input
                      type="text"
                      name="paidAmount"
                      value={form.paidAmount}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  {/* Due Amount (Calculated) */}
                  <div>
                    <label className="block text-sm font-medium">
                      Due Amount
                    </label>
                    <input
                      type="text"
                      value={form.dueAmount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  {/* Payment Status with Suggestions */}
                  <div className="relative">
                    <label className="block text-sm font-medium">
                      Payment Status
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="paymentStatus"
                        value={form.paymentStatus}
                        onChange={enhancedHandleChange}
                        onFocus={() => paymentStatusSuggestions.setIsOpen(true)}
                        onBlur={() =>
                          setTimeout(
                            () => paymentStatusSuggestions.setIsOpen(false),
                            200
                          )
                        }
                        onKeyDown={(e) =>
                          paymentStatusSuggestions.handleKeyDown(
                            e,
                            selectPaymentStatus
                          )
                        }
                        className="w-full border px-3 py-2 rounded-lg capitalize"
                        autoComplete="off"
                        ref={paymentStatusSuggestions.inputRef}
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
                        onClick={() =>
                          paymentStatusSuggestions.setIsOpen(
                            !paymentStatusSuggestions.isOpen
                          )
                        }
                      >
                        {paymentStatusSuggestions.isOpen ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>

                      {paymentStatusSuggestions.isOpen &&
                        paymentStatusSuggestions.filteredItems.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {paymentStatusSuggestions.filteredItems.map(
                              (status, index) => (
                                <div
                                  key={index}
                                  className={`px-3 py-2 hover:bg-gray-100 cursor-pointer ${
                                    index ===
                                    paymentStatusSuggestions.highlightedIndex
                                      ? "bg-blue-50"
                                      : ""
                                  }`}
                                  onMouseDown={() =>
                                    paymentStatusSuggestions.selectSuggestion(
                                      status,
                                      selectPaymentStatus
                                    )
                                  }
                                  onMouseEnter={() =>
                                    paymentStatusSuggestions.setHighlightedIndex(
                                      index
                                    )
                                  }
                                >
                                  {status}
                                </div>
                              )
                            )}
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Remark</label>
                    <textarea
                      name="remark"
                      value={form.remark}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize resize-vertical min-h-[80px]"
                      autoComplete="off"
                    />
                  </div>

                  {/* Footer buttons - full width */}
                  <div className="md:col-span-3 mt-6 flex justify-end gap-3 border-t pt-6">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        setForm(INITIAL_FORM_STATE);
                        productNameSuggestions.setIsOpen(false);
                        paymentStatusSuggestions.setIsOpen(false);
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg cursor-pointer transition-colors"
                    >
                      Update Sale Return
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default SaleReturn;
