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
  Upload,
  X,
  Eye,
  Search,
  Settings,
} from "lucide-react";
import ReactDOM from "react-dom";
import SampleExcelDownloadSale from "../../excels/SampleExcelDownloadSale";
import { handleAxiosError } from "../../utils/errorHandler";
import * as XLSX from "xlsx";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useNavigate } from "react-router-dom";
import SaleExcelDownload from "../../excels/download/SaleExcelDownload";
import { useInitialSaleData } from "./IntialLoading.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const Sales = () => {
  const navigate = useNavigate();
  const [sales, setSales] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [types, setTypes] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState([]);
  const [allSelected, setAllSelected] = useState(false);
  const inputRef = useRef(null);
  const { statuses, productNames, loading } = useInitialSaleData();
  const [errors, setErrors] = useState({});
  const [activeTab, setActiveTab] = useState("add");
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "invoiceDate",
    "productName",
    "mrName",
    "customerName",
    "salesQty",
    "amount",
    "paymentStatus",
    "actions",
  ]); // Default visible columns

  const [form, setForm] = useState({
    _id: null,
    recordingDate: "",
    invoiceNumber: "",
    invoiceDate: "",
    mrName: "",
    customerCode: "",
    productName: "",
    salesQty: 0,
    bonusQty: 0,
    totalQty: 0,
    sellingPrice: 0.0,
    amount: 0,
    discount: 0,
    netSellingAmount: 0,
    averageUnitPrice: 0,
    profitLoss: 0,
    creditDays: 0,
    dueDate: "",
    deliveryDate: "",
    paidAmount: 0,
    dueAmount: 0,
    paymentStatus: "",
    remark: "",
  });

  // Add the missing function to fix the ReferenceError
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
            return fieldValue;
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

  const paymentStatusSuggestions = useSuggestions(
    statuses,
    "type",
    form.paymentStatus
  );
  const productNameSuggestions = useSuggestions(
    productNames,
    "name",
    form.productName
  );

  const salesPerPage = 9;

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice No",
        dbName: "invoiceNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "productName",
        name: "Product Name",
        dbName: "productName",
      },
      { id: "mrName", name: "MR Name", dbName: "mrName" },
      {
        id: "customerName",
        name: "Customer Name",
        dbName: "customerInfo.name",
      },
      {
        id: "salesQty",
        name: "Sales Qty",
        dbName: "salesQty",
      },
      {
        id: "totalQty",
        name: "Total Qty",
        dbName: "totalQty",
      },
      {
        id: "bonusQty",
        name: "Bonus Qty",
        dbName: "bonusQty",
      },
      {
        id: "sellingPrice",
        name: "Selling Price (USD)",
        dbName: "sellingPrice",
      },
      {
        id: "averageUnitPrice",
        name: "Average Unit Price (USD)",
        dbName: "averageUnitPrice",
      },
      {
        id: "discount",
        name: "Discount (USD)",
        dbName: "discount",
      },
      {
        id: "netSellingAmount",
        name: "Net Selling Amount (USD)",
        dbName: "netSellingAmount",
      },
      {
        id: "amount",
        name: "Total Amount ($)",
        dbName: "amount",
      },
      {
        id: "profitLoss",
        name: "Prof/Loss",
        dbName: "profitLoss",
      },
      { id: "lc", name: "LC", dbName: "lc" },
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
        id: "creditDays",
        name: "Credit (Days)",
        dbName: "creditDays",
      },
      {
        id: "recordingDate",
        name: "Recording Date",
        dbName: "recordingDate",
      },
      { id: "dueDate", name: "Due Date", dbName: "dueDate" },
      {
        id: "deliveryDate",
        name: "Delivery Date",
        dbName: "deliveryDate",
      },
      { id: "remark", name: "Remark", dbName: "remark" },
      {
        id: "customerCode",
        name: "Customer Code",
        dbName: "customerCode",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );
  const requiredColumns = [
    "invoiceNumber",
    "invoiceDate",
    "productName",
    "actions",
  ];
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
  const handleSave = () => {
    if (activeTab === "add") {
      // Add selected columns to table
      const newColumns = [...tableColumns, ...selectedItems];
      setTableColumns(newColumns);
    } else {
      const requiredColumns = [
        "invoiceNumber",
        "invoiceDate",
        "productName",
        "actions",
      ];
      const newColumns = tableColumns.filter(
        (id) => !selectedItems.includes(id) || requiredColumns.includes(id)
      );
      setTableColumns(newColumns);
    }
    setSelectedItems([]);
    setAllSelected(false);
    setIsModalOpen(false);
  };

  const handleReset = () => {
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
      "amount",
      "paymentStatus",
      "actions",
    ]);
  };

  const handleCancelEvent = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsModalOpen(false);
  };

  // Get field value from sale object
  const getFieldValue = (sale, dbName) => {
    if (dbName === "customerInfo.name") {
      return sale.customerInfo?.name || "--";
    }

    if (
      ["recordingDate", "dueDate", "deliveryDate", "invoiceDate"].includes(
        dbName
      )
    ) {
      return formatDateToReadable(sale[dbName]) || "--";
    }

    if (dbName === "amount") {
      return Math.ceil(sale.amount || 0);
    }

    if (
      dbName === "salesQty" ||
      dbName === "totalQty" ||
      dbName === "bonusQty"
    ) {
      return Math.ceil(sale[dbName] || 0);
    }

    return sale[dbName] ?? "--";
  };

  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (string) => {
    if (!string) return "--";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  // Update allSelected state when individual selections change
  useEffect(() => {
    const currentItems = chunkedItems.flat();
    if (
      currentItems.length > 0 &&
      selectedItems.length === currentItems.length
    ) {
      setAllSelected(true);
    } else {
      setAllSelected(false);
    }
  }, [selectedItems, chunkedItems]);

  // Form change handlers
  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleChangeEvent = (name, value, prevForm) => {
    const updatedForm = { ...prevForm, [name]: value };

    const getNum = (field) => {
      const num = parseFloat(updatedForm[field]);
      return isNaN(num) ? 0 : num;
    };

    const getInt = (field) => {
      const num = parseInt(updatedForm[field], 10);
      return isNaN(num) ? 0 : num;
    };

    // Total Qty = Sales + Bonus
    if (["salesQty", "bonusQty"].includes(name)) {
      updatedForm.totalQty = getInt("salesQty") + getInt("bonusQty");
    }

    // Delivery Date = Invoice Date
    if (name === "invoiceDate") {
      updatedForm.deliveryDate = value;
    }

    // Due Date = Credit Days
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

    // Amount = sellingPrice * salesQty
    if (["sellingPrice", "salesQty"].includes(name)) {
      updatedForm.amount = (
        getNum("sellingPrice") * getInt("salesQty")
      ).toFixed(2);
    }

    // Net Selling Amount = amount - discount
    if (["amount", "discount", "sellingPrice", "salesQty"].includes(name)) {
      updatedForm.netSellingAmount = (
        getNum("amount") - getNum("discount")
      ).toFixed(2);
    }

    // Profit / Loss = amount - discount - (lc * totalQty)
    if (
      ["amount", "discount", "lc", "totalQty", "salesQty", "bonusQty"].includes(
        name
      )
    ) {
      updatedForm.profitLoss = (
        getNum("amount") -
        getNum("discount") -
        getNum("lc") * getInt("totalQty")
      ).toFixed(2);
    }

    // Due Amount = netSellingAmount - paidAmount
    if (["netSellingAmount", "paidAmount"].includes(name)) {
      updatedForm.dueAmount = (
        getNum("netSellingAmount") - getNum("paidAmount")
      ).toFixed(2);
    }

    // Average Unit Price = netSellingAmount / totalQty
    if (
      [
        "netSellingAmount",
        "salesQty",
        "bonusQty",
        "discount",
        "sellingPrice",
      ].includes(name)
    ) {
      const totalQty = getInt("totalQty");
      updatedForm.averageUnitPrice =
        totalQty > 0 ? (getNum("netSellingAmount") / totalQty).toFixed(2) : "";
    }

    return updatedForm;
  };

  const enhancedHandleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      if (name === "paymentStatus" || name === "productName") {
        updateFormField(name, value);
      } else {
        setForm((prev) => handleChangeEvent(name, value, prev));
      }

      // Suggestion logic
      if (name === "paymentStatus" && value.length > 0) {
        paymentStatusSuggestions.setIsOpen(true);
        paymentStatusSuggestions.setHighlightedIndex(-1);
      }

      if (name === "productName" && value.length > 0) {
        productNameSuggestions.setIsOpen(true);
        productNameSuggestions.setHighlightedIndex(-1);
      }
    },
    [updateFormField, paymentStatusSuggestions, productNameSuggestions]
  );

  // Fetch function
  const fetchSaleSummaries = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/sales`);
      if (!res.ok) throw new Error("Failed to fetch sale summaries");

      const data = await res.json();
      const uniqueTypes = Array.from(
        new Set(data.map((item) => item.paymentStatus?.toLowerCase()))
      );

      setTypes(["All", ...uniqueTypes]);
      setSales(data);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching sale summaries");
    } finally {
      setLoadingData(false);
    }
  };

  const handleView = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };
  const editSale = (sale) => {
    setForm({ ...sale });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };
  // Memoized filtered sales
  const filteredSales = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    const selectedTabLower = selectedTab.toLowerCase();

    return sales.filter((sale) => {
      const paymentStatus = (sale.paymentStatus || "pending").toLowerCase();

      // Tab filter
      if (selectedTabLower !== "all" && selectedTabLower !== paymentStatus) {
        return false;
      }

      if (!lowerSearch) {
        return true;
      }

      // Prepare searchable values
      const fields = [
        sale.invoiceNumber,
        sale.customerInfo?.name,
        sale.productName,
      ];

      return fields.some((f) =>
        (f ?? "").toString().toLowerCase().includes(lowerSearch)
      );
    });
  }, [sales, searchTerm, selectedTab]);

  const currentSales = useMemo(() => {
    const start = (currentPage - 1) * salesPerPage;
    return filteredSales.slice(start, start + salesPerPage);
  }, [filteredSales, currentPage, salesPerPage]);

  const totalPages = useMemo(
    () => Math.ceil(filteredSales.length / salesPerPage),
    [filteredSales, salesPerPage]
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  );

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  // Fetch data on mount
  useEffect(() => {
    fetchSaleSummaries();
  }, []);

  const toggleSelect = (sale) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === sale._id);

      if (exists) {
        return prev.filter((c) => c.id !== sale._id);
      } else {
        return [...prev, { id: sale._id }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentSales.map((s) => ({ id: s._id }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDateChange = (date, fieldName) => {
    setForm((prev) => {
      const updatedForm = {
        ...prev,
        [fieldName]: date ? date.toISOString().split("T")[0] : "",
      };
      if (fieldName === "invoiceDate" && date) {
        updatedForm.deliveryDate = date.toISOString().split("T")[0];
      }

      return updatedForm;
    });
  };

  // Fixed SuggestionInput component with proper highlighting
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
          // Get the suggestion value for highlighting
          if (index >= 0 && index < suggestions.length) {
            const suggestion = suggestions[index];
            const suggestionValue = getSuggestionValue(suggestion);
            // Call onSuggestionSelect with highlight only (no form update)
            onSuggestionSelect && onSuggestionSelect(suggestionValue, true);
          }
        },
        [
          suggestions,
          getSuggestionValue,
          onSuggestionSelect,
          setHighlightedIndex,
        ]
      );

      const handleClick = useCallback(
        (item) => {
          const value = getSuggestionValue(item);
          onSuggestionSelect && onSuggestionSelect(value, false);
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
              // Auto-highlight when navigating with keyboard
              if (highlightedIndex < suggestions.length - 1) {
                const nextIndex = highlightedIndex + 1;
                const nextSuggestion = suggestions[nextIndex];
                const nextValue = getSuggestionValue(nextSuggestion);
                onSuggestionSelect && onSuggestionSelect(nextValue, true);
              }
              break;
            case "ArrowUp":
              e.preventDefault();
              setHighlightedIndex((prev) =>
                prev > 0 ? prev - 1 : suggestions.length - 1
              );
              // Auto-highlight when navigating with keyboard
              if (highlightedIndex > 0) {
                const prevIndex = highlightedIndex - 1;
                const prevSuggestion = suggestions[prevIndex];
                const prevValue = getSuggestionValue(prevSuggestion);
                onSuggestionSelect && onSuggestionSelect(prevValue, true);
              }
              break;
            case "Enter":
              e.preventDefault();
              if (
                highlightedIndex >= 0 &&
                highlightedIndex < suggestions.length
              ) {
                const selectedItem = suggestions[highlightedIndex];
                const value = getSuggestionValue(selectedItem);
                onSuggestionSelect && onSuggestionSelect(value, false);
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

  // Render loading
  if (loadingData) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50">
        <div className="text-xl font-medium text-gray-600 flex gap-1">
          Loading
          <span className="animate-bounce [animation-delay:0s]">.</span>
          <span className="animate-bounce [animation-delay:0.2s]">.</span>
          <span className="animate-bounce [animation-delay:0.4s]">.</span>
        </div>
      </div>
    );
  }

  const handleUpdateSales = async (e, sale) => {
    e.preventDefault();

    try {
      const res = await axios.put(`${backendUrl}/api/sales/${sale._id}`, sale);
      if (res.status === 200) {
        showToast("success", "Sales record updated successfully");
        setIsEditModalOpen(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      showToast("error", "Failed to update sales record.");
    }
  };

  const deleteSale = async (sale) => {
    if (!sale._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${sale.invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales/${sale._id}`);
        if (res.status === 200) {
          showToast(
            "success",
            `Customer <b>${sale.invoiceNumber}</b> deleted successfully`
          );
          fetchSaleSummaries();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> sales`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/sales`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Selected Sales deleted successfully");
          fetchSaleSummaries();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        if (rows.length === 0) {
          showToast("warning", "Excel file is empty");
          return;
        }

        let headerRowIndex = -1;
        let headersMap = {};

        const headerPatterns = [
          "no",
          "recording date",
          "invoice #",
          "invoice date",
          "mr name",
        ];

        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );

          const matches = headerPatterns.filter((pattern) =>
            row.some((cell) => cell.includes(pattern))
          );

          if (matches.length >= 3) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast("error", "❌ Could not identify header row in Excel file");
          return;
        }

        const rawHeaders = rows[headerRowIndex];

        // 🧹 Removed 'lc' from mapping
        const columnMapping = [
          { index: 0, key: "no" },
          { index: 1, key: "recordingDate" },
          { index: 2, key: "invoiceNumber" },
          { index: 3, key: "invoiceDate" },
          { index: 4, key: "mrName" },
          { index: 5, key: "customerCode" },
          { index: 6, key: "productName" },
          { index: 7, key: "salesQty" },
          { index: 8, key: "bonusQty" },
          { index: 9, key: "sellingPrice" },
          { index: 10, key: "discount" },
          { index: 11, key: "creditDays" },
          { index: 12, key: "paidAmount" },
          { index: 13, key: "paymentStatus" },
          { index: 14, key: "remark" },
        ];

        columnMapping.forEach(({ index, key }) => {
          if (index < rawHeaders.length) {
            headersMap[index] = key;
          }
        });

        const essentialHeaders = [
          "productName",
          "salesQty",
          "sellingPrice",
          "paymentStatus",
        ];
        const missingEssential = essentialHeaders.filter(
          (header) => !Object.values(headersMap).includes(header)
        );

        if (missingEssential.length > 0) {
          showToast(
            "error",
            `❌ Missing essential columns: ${missingEssential.join(", ")}`
          );
          return;
        }

        const dataRows = rows.slice(headerRowIndex + 1);

        const mappedData = dataRows
          .map((row, index) => {
            if (
              !row ||
              row.length === 0 ||
              row.every((cell) => !cell || cell.toString().trim() === "")
            ) {
              return null;
            }

            const item = {};
            Object.entries(headersMap).forEach(([colIndex, key]) => {
              const colIndexNum = parseInt(colIndex);
              const value = row[colIndexNum] ?? "";

              if (
                [
                  "salesQty",
                  "bonusQty",
                  "sellingPrice",
                  "discount",
                  "paidAmount",
                  "creditDays",
                ].includes(key)
              ) {
                const numValue = parseFloat(value);
                item[key] = !isNaN(numValue) ? numValue : 0;
              } else {
                item[key] = value.toString().trim();
              }
            });

            if (!item.productName || item.productName === "") {
              return null;
            }

            return {
              recordingDate: item.recordingDate,
              invoiceNumber: item.invoiceNumber || "",
              invoiceDate: item.invoiceDate,
              mrName: item.mrName || "",
              customerCode: item.customerCode || "",
              productName: item.productName,
              salesQty: item.salesQty || 0,
              bonusQty: item.bonusQty || 0,
              sellingPrice: item.sellingPrice || 0,
              discount: item.discount || 0,
              creditDays: item.creditDays || 0,
              paidAmount: item.paidAmount || 0,
              paymentStatus: item.paymentStatus || "",
              remark: item.remark || "",
              _rowIndex: headerRowIndex + index + 2,
            };
          })
          .filter((entry) => entry !== null);

        if (mappedData.length === 0) {
          showToast("warning", "No valid data records found in the Excel file");
          return;
        }

        setParsedData(mappedData);
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", "Failed to process the Excel file");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleProductImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(`${backendUrl}/api/sale/import`, parsedData);

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Sale Summary imported successfully!"
        );
        setShowImportModal(false);
        fetchSaleSummaries();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const handleNumericInputChange = (e, updateFunc) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      updateFunc(e);
    }
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/salelayout/sale/new")}
            >
              <UserPlus size={18} /> Add New Sales
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Product
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
          <SaleExcelDownload />
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {sales.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="flex gap-4">
                {types.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setSelectedTab(tab);
                      setCurrentPage(1);
                      setSelected([]);
                    }}
                    className={`px-4 py-2 rounded-lg cursor-pointer ${
                      selectedTab === tab
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {capitalizeFirstLetter(tab)}
                  </button>
                ))}
              </div>

              <button
                className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={() => setIsModalOpen(true)}
              >
                <Settings size={18} /> Add /Remove Column
              </button>
            </div>
          ) : (
            <div></div>
          )}

          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredSales.length}
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
                placeholder="Search invoice,product name, customer name..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th
                      key={item.id}
                      className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium"
                    >
                      {item.name === "Invoice No" ? (
                        <div className="flex items-center gap-4">
                          {currentSales.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all sales"
                              checked={
                                selected.length === currentSales.length &&
                                currentSales.length > 0
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
              {currentSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No Sales found.
                  </td>
                </tr>
              ) : (
                currentSales.map((sale, index) => (
                  <tr
                    key={sale._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % salesPerPage === 0 ||
                      index + 1 === currentSales.length
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
                                checked={selected.some(
                                  (s) => s.id === sale._id
                                )}
                                onChange={() => toggleSelect(sale)}
                              />
                              <span className="capitalize">
                                {sale.invoiceNumber}
                              </span>
                            </div>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                                <Eye
                                  onClick={() => handleView(sale)}
                                  size={18}
                                />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editSale(sale)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() => deleteSale(sale)}
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(sale, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {currentSales.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => {
                  setCurrentPage((prev) => {
                    const prevPage = Math.max(prev - 1, 1);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return prevPage;
                  });
                }}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>

              {visiblePages.map((page, idx) =>
                page === "..." ? (
                  <span
                    key={`sales-ellipsis-${idx}`}
                    className="px-3 py-1 text-gray-500 select-none cursor-pointer"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => {
                      setCurrentPage(page);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
                      currentPage === page
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => {
                  setCurrentPage((prev) => {
                    const nextPage = Math.min(prev + 1, totalPages);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                    return nextPage;
                  });
                }}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Products</h2>
                {isSampleFile && <SampleExcelDownloadSale />}
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 mb-6"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => handleCancelEvent}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                        : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleProductImport}
                    disabled={isUploading}
                    className={`px-5 py-2 rounded-lg cursor-pointer ${
                      isUploading
                        ? "bg-blue-400 text-white cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {isUploading ? "Uploading…" : "Upload"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {isModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsModalOpen(false)}
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
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
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
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
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
                      {/* Select All option (only when not in required tab) */}
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
                    onClick={handleReset}
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
                      onClick={handleSave}
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

        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
              />
              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Sales Record
                </h2>

                <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh]">
                  {/* Recording Date */}
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

                  {/* Customer Code */}
                  <div>
                    <label className="block text-sm font-medium">
                      Customer Code
                    </label>
                    <input
                      type="text"
                      name="customerCode"
                      value={form.customerCode}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                      autoComplete="off"
                    />
                  </div>

                  {/* Product Name - Fixed SuggestionInput */}
                  <div>
                    <SuggestionInput
                      label="Product Name"
                      name="productName"
                      value={form.productName || ""}
                      onChange={enhancedHandleChange}
                      suggestions={productNameSuggestions.filteredItems}
                      isOpen={productNameSuggestions.isOpen}
                      highlightedIndex={productNameSuggestions.highlightedIndex}
                      inputRef={productNameSuggestions.inputRef}
                      dropdownTop={productNameSuggestions.dropdownTop}
                      onFocus={() => productNameSuggestions.setIsOpen(true)}
                      onBlur={() =>
                        setTimeout(
                          () => productNameSuggestions.setIsOpen(false),
                          150
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
                            (val) => updateFormField("productName", val)
                          );
                        }
                      }}
                      getSuggestionValue={(item) =>
                        typeof item === "string" ? item : item.name
                      }
                      getSuggestionDisplay={(item) =>
                        typeof item === "string" ? item : item.name
                      }
                      setHighlightedIndex={
                        productNameSuggestions.setHighlightedIndex
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Sales Quantity
                    </label>
                    <input
                      type="text"
                      name="salesQty"
                      value={form.salesQty}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Bonus Quantity
                    </label>
                    <input
                      type="text"
                      name="bonusQty"
                      value={form.bonusQty}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Total Quantity
                    </label>
                    <input
                      type="text"
                      value={form.totalQty}
                      disabled
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200"
                    />
                  </div>

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

                  <div>
                    <label className="block text-sm font-medium">Amount</label>
                    <input
                      type="text"
                      disabled
                      value={form.amount}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Discount
                    </label>
                    <input
                      type="text"
                      name="discount"
                      value={form.discount}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

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

                  <div>
                    <label className="block text-sm font-medium">
                      Average Unit Price
                    </label>
                    <input
                      type="text"
                      value={form.averageUnitPrice}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Profit / Loss
                    </label>
                    <input
                      type="text"
                      value={form.profitLoss}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Credit Days
                    </label>
                    <input
                      type="text"
                      name="creditDays"
                      value={form.creditDays}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Due Date
                    </label>
                    <DatePicker
                      selected={form.dueDate ? new Date(form.dueDate) : null}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium">
                      Delivery Date
                    </label>
                    <DatePicker
                      selected={
                        form.deliveryDate ? new Date(form.deliveryDate) : null
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                      disabled
                    />
                  </div>

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

                  {/* Payment Status */}
                  <div>
                    <SuggestionInput
                      label="Payment Status"
                      name="paymentStatus"
                      onChange={enhancedHandleChange}
                      value={form.paymentStatus}
                      error={errors.paymentStatus}
                      suggestions={paymentStatusSuggestions.filteredItems}
                      isOpen={paymentStatusSuggestions.isOpen}
                      highlightedIndex={
                        paymentStatusSuggestions.highlightedIndex
                      }
                      inputRef={paymentStatusSuggestions.inputRef}
                      dropdownTop={paymentStatusSuggestions.dropdownTop}
                      onFocus={() => paymentStatusSuggestions.setIsOpen(true)}
                      onBlur={() =>
                        setTimeout(
                          () => paymentStatusSuggestions.setIsOpen(false),
                          150
                        )
                      }
                      onSuggestionSelect={(value, isHighlight) => {
                        if (isHighlight) {
                          // Just highlight, don't update form
                          handlePaymentStatusHighlight(value, false);
                        } else {
                          // Actually select the value and update form
                          paymentStatusSuggestions.selectSuggestion(
                            value,
                            (val) => updateFormField("paymentStatus", val)
                          );
                        }
                      }}
                      getSuggestionValue={(item) => item.type}
                      getSuggestionDisplay={(item) => item.type}
                      setHighlightedIndex={
                        paymentStatusSuggestions.setHighlightedIndex
                      }
                    />
                  </div>

                  {/* Remark - full width */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium">Remark</label>
                    <input
                      type="text"
                      value={form.remark}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                    />
                  </div>

                  {/* Footer buttons - full width */}
                  <div className="md:col-span-3 mt-4 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                      onClick={(e) => handleUpdateSales(e, form)}
                    >
                      Update
                    </button>
                  </div>
                </form>
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
                  View Sales Record
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Recording Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.recordingDate
                        ? new Date(form.recordingDate).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Invoice Number
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.invoiceNumber || "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Invoice Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.invoiceDate
                        ? new Date(form.invoiceDate).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.mrName || "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Customer Code
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.customerCode || "-"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Product Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.productName || "-"}
                    </p>
                  </div>

                  {[
                    ["Sales Quantity", "salesQty"],
                    ["Bonus Quantity", "bonusQty"],
                    ["Total Quantity", "totalQty"],
                    ["Selling Price", "sellingPrice"],
                    ["Amount", "amount"],
                    ["Discount", "discount"],
                    ["Net Selling Amount", "netSellingAmount"],
                    ["Average Unit Price", "averageUnitPrice"],
                    ["Profit / Loss", "profitLoss"],
                    ["Credit Days", "creditDays"],
                    ["Paid Amount", "paidAmount"],
                    ["Due Amount", "dueAmount"],
                  ].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-600">
                        {label}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form[key] ?? 0}
                      </p>
                    </div>
                  ))}

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

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Payment Status
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.paymentStatus || "-"}
                    </p>
                  </div>

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
      </div>
    </div>
  );
};

export default Sales;
