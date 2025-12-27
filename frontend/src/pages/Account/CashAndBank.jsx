// Fetch transactions when component mounts or filters change
import {
  Search,
  Download,
  X,
  Plus,
  Trash2,
  Edit,
  Eye,
  Settings,
} from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import SearchableDropdown from "../../components/common/SearchableDropdown"; // Add this import

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const ITEMS_PER_PAGE = 7;

// Helper function to convert date from "YYYY-MM-DD" to "DD MMM YYYY" format
const formatDateForInput = (dateString) => {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;

    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("en", { month: "short" });
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  } catch (error) {
    console.error("Error formatting date:", error);
    return dateString;
  }
};

// Helper function to convert date from "DD MMM YYYY" back to "YYYY-MM-DD" for form submission
const parseDateFromInput = (dateString) => {
  if (!dateString) return "";

  try {
    // If it's already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // Parse from "DD MMM YYYY" format
    const parts = dateString.split(" ");
    if (parts.length === 3) {
      const day = parts[0];
      const month = parts[1];
      const year = parts[2];

      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const monthIndex = monthNames.findIndex(
        (m) => m.toLowerCase() === month.toLowerCase()
      );

      if (monthIndex !== -1) {
        const date = new Date(year, monthIndex, day);
        return date.toISOString().split("T")[0];
      }
    }

    return dateString;
  } catch (error) {
    console.error("Error parsing date:", error);
    return dateString;
  }
};

const getDisplayValue = (value, options) => {
  try {
    if (!value && value !== 0) return "--";

    // If value is an object (populated data from backend)
    if (typeof value === "object" && value !== null) {
      // Try different possible property names
      return (
        value.name || value.label || value.title || value.toString() || "--"
      );
    }

    // If value is a string (could be ID), find the label from options
    if (typeof value === "string" && options && Array.isArray(options)) {
      const option = options.find((opt) => {
        // Handle both string and ObjectId comparisons
        return opt.value === value || opt.value?.toString() === value;
      });
      return option ? option.label : value;
    }

    // If value is a number, return it as string
    if (typeof value === "number") {
      return value.toString();
    }

    // Return the value as string for other cases
    return value ? value.toString() : "--";
  } catch (error) {
    console.error("Error in getDisplayValue:", error);
    return "--";
  }
};

// Custom hook to fetch dropdown options from backend
const useDropdownOptions = () => {
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDropdownOptions = async () => {
    try {
      setError(null);

      // Fetch category options
      const categoryResponse = await axios.get(
        `${backendUrl}/api/accounts/category-type`
      );

      const categories = categoryResponse.data.map((cat) => ({
        value: cat._id,
        label: cat.name,
      }));
      setCategoryOptions(categories);

      // Fetch destination options
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );

      const destinations = destinationResponse.data.map((dest) => ({
        value: dest._id,
        label: dest.name,
        totalAmount: dest.totalAmount || 0,
      }));
      setDestinationOptions(destinations);
      setSourceOptions(destinations);

      // Fetch supplier options - FIXED: Handle different response structures
      const supplierResponse = await axios.get(`${backendUrl}/api/suppliers`);

      // Handle different possible response structures
      let suppliers = [];
      if (supplierResponse.data && Array.isArray(supplierResponse.data)) {
        // If response is directly an array
        suppliers = supplierResponse.data;
      } else if (
        supplierResponse.data &&
        supplierResponse.data.data &&
        Array.isArray(supplierResponse.data.data)
      ) {
        // If response has { data: [] } structure
        suppliers = supplierResponse.data.data;
      } else if (
        supplierResponse.data &&
        Array.isArray(supplierResponse.data.suppliers)
      ) {
        // If response has { suppliers: [] } structure
        suppliers = supplierResponse.data.suppliers;
      }

      const supplierOptions = suppliers.map((supplier) => ({
        value: supplier._id,
        label: supplier.name,
      }));
      setSupplierOptions(supplierOptions);
    } catch (err) {
      console.error("Error fetching dropdown options:", err);
      setError(err.message);
      setCategoryOptions([]);
      setSourceOptions([]);
      setDestinationOptions([]);
      setSupplierOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDropdownOptions();
  }, []);

  return {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
    loading,
    error,
    refetch: fetchDropdownOptions,
  };
};

// Custom dropdown component with limited visible items and scroll
const CustomDropdown = ({
  value,
  onChange,
  options,
  error,
  disabled,
  placeholder,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (optionValue) => {
    onChange({ target: { value: optionValue } });
    setIsOpen(false);
  };

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-left ${
          error ? "border-red-500" : "border-gray-300"
        } ${
          disabled
            ? "bg-gray-200 cursor-not-allowed"
            : "bg-white cursor-pointer"
        }`}
        disabled={disabled || options.length === 0}
      >
        {selectedOption
          ? selectedOption.label
          : options.length === 0
          ? "Loading..."
          : placeholder || "Select an option"}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="p-2 text-gray-500 text-sm">Loading options...</div>
          ) : (
            options.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className={`p-2 cursor-pointer hover:bg-indigo-50 ${
                  value === option.value ? "bg-indigo-100 text-indigo-700" : ""
                }`}
              >
                {option.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// New hook to fetch sales invoices
const useInvoiceOptions = () => {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/sales/all`);
      if (response.data && response.data.summaries) {
        setSales(response.data.summaries);
      } else {
        setSales([]);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching sales:", err);
      setError(err.message);
      setSales([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // Get invoice options for dropdown
  const getInvoiceOptions = useCallback(() => {
    if (loading) {
      return [{ value: "", label: "Loading invoices...", disabled: true }];
    }
    
    if (error || sales.length === 0) {
      return [{ value: "", label: "No invoices available", disabled: true }];
    }

    // Remove duplicates and format options
    const uniqueInvoices = [
      ...new Set(sales.map((sale) => sale.invoiceNumber).filter(Boolean)),
    ];

    const options = [
      { value: "", label: "Select Invoice Number" },
      ...uniqueInvoices.map((invoice) => ({
        value: invoice,
        label: invoice,
      })),
    ];

    return options;
  }, [sales, loading, error]);

  return {
    sales,
    loading,
    error,
    getInvoiceOptions,
    refetch: fetchSales,
  };
};

const AddTransactionModal = ({
  isOpen,
  onClose,
  activeTab,
  onAddTransaction,
  editData = null,
  isEdit = false,
  categoryOptions = [],
  sourceOptions = [],
  destinationOptions = [],
  supplierOptions = [],
  currentData = [],
}) => {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [isFetchingSales, setIsFetchingSales] = useState(false);
  const [invoiceDataFetched, setInvoiceDataFetched] = useState(false);
  const [sourceAccountBalance, setSourceAccountBalance] = useState(0);
  const [originalAmount, setOriginalAmount] = useState(0);

  // Use the new invoice options hook
  const {
    sales,
    loading: salesLoading,
    getInvoiceOptions,
    refetch: refetchSales,
  } = useInvoiceOptions();

  // Memoized helper functions to prevent infinite re-renders
  const requiresSupplier = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "payment inward" || categoryName === "remittance";
  }, [form.categoryType, categoryOptions]);

  const isRemittance = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "remittance";
  }, [form.categoryType, categoryOptions]);

  const isPaymentInward = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "payment inward";
  }, [form.categoryType, categoryOptions]);

  const isPaymentOutward = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "payment outward";
  }, [form.categoryType, categoryOptions]);

  const isDepositOrWithdraw = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "withdraw" || categoryName === "deposit";
  }, [form.categoryType, categoryOptions]);

  const isDeposit = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "deposit";
  }, [form.categoryType, categoryOptions]);

  const isWithdraw = useMemo(() => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "withdraw";
  }, [form.categoryType, categoryOptions]);

  // Check if category requires invoice dropdown
  const requiresInvoiceDropdown = useMemo(() => {
    if (!form.categoryType) return false;
    const category = categoryOptions.find((cat) => cat.value === form.categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "cash sale" || categoryName === "credit collection";
  }, [form.categoryType, categoryOptions]);

  // Check if category requires invoice fields (text input)
  const requiresInvoiceFields = useMemo(() => {
    if (!form.categoryType) return false;
    const category = categoryOptions.find((cat) => cat.value === form.categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    
    // Invoice fields for sales-related categories (except those with dropdown)
    return (
      !isDepositOrWithdraw && 
      !requiresSupplier && 
      !isPaymentOutward &&
      !requiresInvoiceDropdown
    );
  }, [form.categoryType, categoryOptions, isDepositOrWithdraw, requiresSupplier, isPaymentOutward, requiresInvoiceDropdown]);

  // Get filtered source options (exclude destination account for deposit/withdraw)
  const getFilteredSourceOptions = useMemo(() => {
    if (!isDepositOrWithdraw) {
      return sourceOptions;
    }

    // For deposit/withdraw, exclude the selected destination account from source options
    return sourceOptions.filter(
      (source) => !form.destination || source.value !== form.destination
    );
  }, [sourceOptions, form.destination, isDepositOrWithdraw]);

  // Get filtered destination options (exclude source account for deposit/withdraw)
  const getFilteredDestinationOptions = useMemo(() => {
    if (!isDepositOrWithdraw) {
      return destinationOptions;
    }

    // For deposit/withdraw, exclude the selected source account from destination options
    return destinationOptions.filter(
      (destination) => !form.source || destination.value !== form.source
    );
  }, [destinationOptions, form.source, isDepositOrWithdraw]);

  // Get invoice options based on category
  const invoiceOptions = useMemo(() => {
    return getInvoiceOptions();
  }, [getInvoiceOptions]);

  // Define form fields configuration with custom layout
  const formFields = useMemo(() => {
    const baseFields = [
      {
        key: "categoryType",
        label: "Category Type",
        type: "select",
        required: true,
        options: categoryOptions,
        layout: "half",
      },
      {
        key: "date",
        label: "Date",
        type: "date",
        required: true,
        layout: "half",
      },
      {
        key: "amount",
        label: "Amount ($)",
        type: "number",
        required: true,
        layout: "half",
      },
    ];

    // Add supplier field for payment inward/remittance
    if (requiresSupplier) {
      baseFields.splice(1, 0, {
        key: "supplier",
        label: "Supplier Name",
        type: "select",
        required: true,
        options: supplierOptions,
        layout: "half",
      });

      // For REMITTANCE: Use SOURCE account instead of destination
      if (isRemittance) {
        baseFields.splice(2, 0, {
          key: "source",
          label: "Source Account",
          type: "select",
          required: true,
          options: sourceOptions,
          layout: "half",
        });
      }
      
      else if (isPaymentInward) {
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: destinationOptions,
          layout: "half",
        });
      }
    }
    // Add source field for payment outward
    else if (isPaymentOutward) {
      baseFields.splice(1, 0, {
        key: "supplier",
        label: "Payment To",
        type: "select",
        required: true,
        options: supplierOptions,
        layout: "half",
      });
      baseFields.splice(2, 0, {
        key: "source",
        label: "Source Account",
        type: "select",
        required: true,
        options: sourceOptions,
        layout: "half",
      });
    }
    // Add source/destination fields for deposit/withdraw
    else if (isDepositOrWithdraw) {
      if (isDeposit) {
        baseFields.splice(1, 0, {
          key: "source",
          label: "Source Account",
          type: "select",
          required: true,
          options: getFilteredSourceOptions,
          layout: "half",
        });
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: getFilteredDestinationOptions,
          layout: "half",
        });
        // Add exchange loss for deposit
        baseFields.push({
          key: "exchangeLoss",
          label: "Exchange Loss",
          type: "number",
          required: false,
          layout: "half",
        });
        baseFields.push({
          key: "finalAmount",
          label: "Final Amount ($)",
          type: "number",
          required: true,
          readonly: true,
          disabled: true,
          layout: "half",
        });
      } else if (isWithdraw) {
        baseFields.splice(1, 0, {
          key: "source",
          label: "Source Account",
          type: "select",
          required: true,
          options: getFilteredSourceOptions,
          layout: "half",
        });
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: getFilteredDestinationOptions,
          layout: "half",
        });
      }
    }
    // Add invoice fields for other categories
    else {
      // For Cash Sale and Credit Collection: use dropdown
      if (requiresInvoiceDropdown) {
        baseFields.splice(1, 0, {
          key: "invoiceNumber",
          label: "Invoice Number",
          type: "invoiceDropdown",
          required: true,
          options: invoiceOptions,
          layout: "half",
        });
      } 
      // For other sales categories: use text input
      else if (requiresInvoiceFields) {
        baseFields.splice(1, 0, {
          key: "invoiceNumber",
          label: "Invoice Number",
          type: "text",
          required: true,
          layout: "half",
        });
      }
      
      // Add destination account for invoice-based categories
      if (requiresInvoiceDropdown || requiresInvoiceFields) {
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: destinationOptions,
          layout: "half",
        });
      }

      // Add additional invoice fields for all invoice-based categories
      if (requiresInvoiceDropdown || requiresInvoiceFields) {
        baseFields.push(
          {
            key: "invoiceDate",
            label: "Invoice Date",
            type: "date",
            required: true,
            layout: "half",
            disabled: true,
          },
          {
            key: "customerName",
            label: "Customer Name",
            type: "text",
            required: true,
            layout: "half",
            disabled: true,
          },
          {
            key: "customerAddress",
            label: "Customer Address",
            type: "text",
            required: false,
            layout: "half",
            disabled: true,
          }
        );
      }
    }

    // Add remarks textarea for all category types (full width)
    baseFields.push({
      key: "remarks",
      label: "Remarks",
      type: "textarea",
      required: false,
      layout: "full",
    });

    return baseFields;
  }, [
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
    form.categoryType,
    getFilteredSourceOptions,
    getFilteredDestinationOptions,
    requiresSupplier,
    isRemittance,
    isPaymentInward,
    isPaymentOutward,
    isDepositOrWithdraw,
    isDeposit,
    isWithdraw,
    requiresInvoiceDropdown,
    requiresInvoiceFields,
    invoiceOptions,
  ]);

  // Initialize form data
  const initializeFormData = () => {
    const initialData = {};
    formFields.forEach((field) => {
      if (field.type === "date") {
        initialData[field.key] = new Date().toISOString().split("T")[0];
      } else if (field.key === "finalAmount") {
        initialData[field.key] = "0.00";
      } else {
        initialData[field.key] = "";
      }
    });
    return initialData;
  };

  useEffect(() => {
    if (isOpen) {
      if (isEdit && editData) {
        const processedEditData = {
          ...editData,
          categoryType: editData.categoryType?._id || editData.categoryType,
          source: editData.source?._id || editData.source,
          destination: editData.destination?._id || editData.destination,
          supplier: editData.supplier?._id || editData.supplier,
          remarks: editData.remarks || "",
        };
        setForm(processedEditData);
        setInvoiceDataFetched(true);
        setOriginalAmount(editData.amount || 0);

        if (editData.source && editData.source.totalAmount !== undefined) {
          setSourceAccountBalance(editData.source.totalAmount);
        }
      } else {
        setForm(initializeFormData());
        setInvoiceDataFetched(false);
        setSourceAccountBalance(0);
        setOriginalAmount(0);
      }
      setErrors({});
      
      // Refetch sales when modal opens
      refetchSales();
    }
  }, [isOpen, isEdit, editData, activeTab]);

  // Calculate final amount for deposit transactions
  useEffect(() => {
    if (isDeposit) {
      const amount = parseFloat(form.amount) || 0;
      const exchangeLoss = parseFloat(form.exchangeLoss) || 0;
      const finalAmount = amount - exchangeLoss;

      setForm((prev) => ({
        ...prev,
        finalAmount: isNaN(finalAmount) ? "0.00" : finalAmount.toFixed(2),
      }));
    }
  }, [form.amount, form.exchangeLoss, isDeposit]);

  // Update source account balance when source changes
  useEffect(() => {
    if (form.source) {
      const selectedSource = sourceOptions.find(
        (option) => option.value === form.source
      );
      if (selectedSource) {
        setSourceAccountBalance(selectedSource.totalAmount || 0);
      }
    } else {
      setSourceAccountBalance(0);
    }
  }, [form.source, sourceOptions]);

  // Handle category type change - reset relevant fields
  useEffect(() => {
    if (form.categoryType) {
      setForm((prev) => {
        const newForm = { ...prev };

        // Reset supplier field when category changes away from supplier-required categories
        if (!requiresSupplier && !isPaymentOutward && newForm.supplier) {
          newForm.supplier = "";
        }

        // Reset invoice fields when category changes to non-invoice categories
        if (!requiresInvoiceFields && !requiresInvoiceDropdown && newForm.invoiceNumber) {
          newForm.invoiceNumber = "";
          newForm.invoiceDate = "";
          newForm.customerName = "";
          newForm.customerAddress = "";
          newForm.amount = "";
        }

        // Reset source/destination for non-deposit/withdraw
        if (!isDepositOrWithdraw && !isPaymentOutward && !isRemittance) {
          if (newForm.source) newForm.source = "";
        }

        // Reset exchange loss and final amount for non-deposit
        if (!isDeposit) {
          if (newForm.exchangeLoss) newForm.exchangeLoss = "";
          if (newForm.finalAmount) newForm.finalAmount = "0.00";
        }

        return newForm;
      });
      setInvoiceDataFetched(false);
    }
  }, [form.categoryType]);

  // Find sale data by invoice number
  const findSaleByInvoice = (invoiceNumber) => {
    return sales.find((sale) => sale.invoiceNumber === invoiceNumber);
  };

  // Check if invoice already has a transaction
  const checkInvoiceExistsInCurrentData = (invoiceNumber) => {
    return currentData.some((item) => item.invoiceNumber === invoiceNumber);
  };

  const fetchSalesData = async (invoiceNumber) => {
    if (
      !invoiceNumber ||
      invoiceNumber.trim() === "" ||
      (!requiresInvoiceFields && !requiresInvoiceDropdown)
    ) {
      return;
    }

    try {
      setIsFetchingSales(true);
      
      // For Cash Sale and Credit Collection: get data from local sales array
      if (requiresInvoiceDropdown) {
        const saleRecord = findSaleByInvoice(invoiceNumber);
        
        if (saleRecord) {
          // Check if invoice already exists in current data
          const existingTransaction = checkInvoiceExistsInCurrentData(invoiceNumber);
          
          if (existingTransaction) {
            showToast(
              "error",
              `Invoice number ${invoiceNumber} already has a transaction`
            );
            setForm((prev) => ({
              ...prev,
              invoiceNumber: "",
              invoiceDate: "",
              customerName: "",
              customerAddress: "",
              amount: "",
            }));
            setInvoiceDataFetched(false);
            return;
          }

          setForm((prev) => ({
            ...prev,
            invoiceNumber: saleRecord.invoiceNumber,
            invoiceDate:
              saleRecord.invoiceDate?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            customerName: saleRecord.customerName || "",
            customerAddress: saleRecord.customerAddress || "",
            amount: saleRecord.totalAmount || "",
          }));
          setInvoiceDataFetched(true);
        } else {
          showToast("error", `Invoice ${invoiceNumber} not found in sales records`);
          setForm((prev) => ({
            ...prev,
            invoiceDate: "",
            customerName: "",
            customerAddress: "",
            amount: "",
          }));
          setInvoiceDataFetched(false);
        }
      } 
      // For other invoice-based categories: use API call
      else if (requiresInvoiceFields) {
        const salesResponse = await axios.get(
          `${backendUrl}/api/accounts/alternative?invoiceNumber=${invoiceNumber}`
        );
        const salesData = salesResponse.data;

        if (salesData.data && salesData.data.length > 0) {
          const existingTransaction = currentData.find(
            (item) => item.invoiceNumber === invoiceNumber
          );

          if (existingTransaction) {
            showToast(
              "error",
              `Invoice number ${invoiceNumber} already has a transaction with amount $${existingTransaction.amount}`
            );
            setForm((prev) => ({
              ...prev,
              invoiceDate: "",
              customerName: "",
              customerAddress: "",
              amount: "",
            }));
            setInvoiceDataFetched(false);
            return;
          }

          const saleRecord = salesData.data[0];
          setForm((prev) => ({
            ...prev,
            invoiceDate:
              saleRecord.invoiceDate?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            customerName: saleRecord.customerName || "",
            customerAddress: saleRecord.customerAddress || "",
            amount: saleRecord.amount || "",
          }));
          setInvoiceDataFetched(true);
        } else {
          setForm((prev) => ({
            ...prev,
            invoiceDate: "",
            customerName: "",
            customerAddress: "",
            amount: "",
          }));
          setInvoiceDataFetched(false);
        }
      }
    } catch (error) {
      console.error("Error fetching sales data:", error);
      setInvoiceDataFetched(false);
      if (requiresInvoiceFields) {
        showToast("error", "Error fetching invoice details");
      }
    } finally {
      setIsFetchingSales(false);
    }
  };

  // FIXED: Calculate available balance for updates
  const getAvailableBalanceForUpdate = useCallback(() => {
    if (!form.source) return sourceAccountBalance;

    if (isEdit && (isDeposit || isWithdraw)) {
      return sourceAccountBalance + originalAmount;
    }
    return sourceAccountBalance;
  }, [
    isEdit,
    form.source,
    sourceAccountBalance,
    originalAmount,
    isDeposit,
    isWithdraw,
  ]);

  // Handle input change
  const handleInputChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }

    // When category type changes, reset related fields
    if (field === "categoryType") {
      setForm((prev) => ({
        ...prev,
        invoiceNumber: "",
        source: "",
        destination: "",
        exchangeLoss: "",
        finalAmount: "0.00",
        invoiceDate: "",
        customerName: "",
        customerAddress: "",
        amount: "",
        supplier: "",
      }));
      setInvoiceDataFetched(false);
      setSourceAccountBalance(0);
      setOriginalAmount(0);
    }

    // When source changes, update source account balance
    if (field === "source" && value) {
      const selectedSource = sourceOptions.find(
        (option) => option.value === value
      );
      if (selectedSource) {
        setSourceAccountBalance(selectedSource.totalAmount || 0);
      }
    }

    // When invoice number changes, fetch the details for invoice-required categories
    if (field === "invoiceNumber" && value) {
      fetchSalesData(value);
    }

    // When amount changes, validate against source account balance
    if (
      field === "amount" &&
      value &&
      form.source &&
      (isDeposit || isWithdraw)
    ) {
      const amountValue = parseFloat(value) || 0;
      const availableBalance = getAvailableBalanceForUpdate();

      if (amountValue > availableBalance) {
        setErrors((prev) => ({
          ...prev,
          amount: `Amount cannot exceed available balance of $${availableBalance.toFixed(
            2
          )}`,
        }));
      } else if (errors.amount) {
        setErrors((prev) => ({
          ...prev,
          amount: "",
        }));
      }
    }

    // When exchange loss changes, validate it doesn't exceed amount for deposit
    if (field === "exchangeLoss" && value && isDeposit && form.amount) {
      const amountValue = parseFloat(form.amount) || 0;
      const exchangeLossValue = parseFloat(value) || 0;
      if (exchangeLossValue > amountValue) {
        setErrors((prev) => ({
          ...prev,
          exchangeLoss: `Exchange loss cannot exceed amount`,
        }));
      } else if (errors.exchangeLoss) {
        setErrors((prev) => ({
          ...prev,
          exchangeLoss: "",
        }));
      }
    }
  };

  const validateForm = () => {
    const newErrors = {};

    formFields.forEach((field) => {
      // Skip validation for readonly and disabled fields
      if (field.readonly || field.disabled) {
        return;
      }

      if (field.required && !form[field.key]) {
        newErrors[field.key] = `${field.label} is required`;
      }

      // Amount validation
      if (field.key === "amount" && form[field.key]) {
        const amountValue = parseFloat(form[field.key]);
        if (isNaN(amountValue) || amountValue <= 0) {
          newErrors[
            field.key
          ] = `${field.label} must be a valid positive number`;
        }

        // For deposit/withdraw transactions, validate against available balance
        if ((isDeposit || isWithdraw) && form.source) {
          const availableBalance = getAvailableBalanceForUpdate();

          if (amountValue > availableBalance) {
            newErrors[
              field.key
            ] = `Amount cannot exceed available balance of $${availableBalance.toFixed(
              2
            )}`;
          }
        }
      }

      // Exchange loss validation for deposit
      if (field.key === "exchangeLoss" && form[field.key] && isDeposit) {
        const exchangeLossValue = parseFloat(form[field.key]);
        const amountValue = parseFloat(form.amount) || 0;

        if (isNaN(exchangeLossValue) || exchangeLossValue < 0) {
          newErrors[
            field.key
          ] = `${field.label} must be a valid positive number`;
        }

        if (exchangeLossValue > amountValue) {
          newErrors[field.key] = `Exchange loss cannot exceed amount`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    const amount = parseFloat(form.amount) || 0;
    const exchangeLoss = parseFloat(form.exchangeLoss) || 0;

    let finalAmount = amount;
    if (isDeposit) {
      finalAmount = amount - exchangeLoss;
    }

    // Prepare transaction data based on category type
    const transactionData = {
      categoryType: form.categoryType,
      date: form.date,
      amount,
      exchangeLoss,
      finalAmount,
      accountType: activeTab,
      description: form.description,
      remarks: form.remarks || "",
    };

    if (requiresSupplier || isPaymentOutward) {
      transactionData.supplier = form.supplier;
    }

    // Add source/destination based on category type
    if (requiresSupplier) {
      if (isRemittance) {
        // REMITTANCE: supplier + source
        transactionData.source = form.source;
      } else if (isPaymentInward) {
        // PAYMENT INWARD: supplier + destination
        transactionData.destination = form.destination;
      }
    } else if (isPaymentOutward) {
      // Payment Outward: supplier + source
      transactionData.source = form.source;
    } else if (isDepositOrWithdraw) {
      // Deposit/Withdraw: source + destination
      transactionData.source = form.source;
      transactionData.destination = form.destination;
    } else {
      // Other categories: destination + invoice fields
      transactionData.destination = form.destination;
      transactionData.invoiceNumber = form.invoiceNumber;
      transactionData.invoiceDate = form.invoiceDate;
      transactionData.customerName = form.customerName;
      transactionData.customerAddress = form.customerAddress;
    }

    try {
      let response;
      if (isEdit && editData) {
        response = await axios.put(
          `${backendUrl}/api/transaction/${editData._id}`,
          transactionData
        );
      } else {
        response = await axios.post(
          `${backendUrl}/api/transaction`,
          transactionData
        );
      }

      if (response.data.success) {
        onAddTransaction(response.data.data, isEdit);
        onClose();
      }
    } catch (err) {
      console.error("Transaction submission error:", err);
      alert(
        "Failed to submit transaction: " +
          (err.response?.data?.message || err.message)
      );
    }
  };

  // Handle numeric input for text fields with validation
  const handleNumericInputChange = (e, field) => {
    const value = e.target.value;

    // Allow only numbers and decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      // Additional validation for amount field
      if (
        field === "amount" &&
        value &&
        form.source &&
        (isDeposit || isWithdraw)
      ) {
        const numericValue = parseFloat(value);
        const availableBalance = getAvailableBalanceForUpdate();

        if (!isNaN(numericValue) && numericValue > availableBalance) {
          setErrors((prev) => ({
            ...prev,
            amount: `Amount cannot exceed available balance of $${availableBalance.toFixed(
              2
            )}`,
          }));
          return; // Don't update the value if it exceeds the balance
        }

        // Clear amount error if validation passes
        if (errors.amount) {
          setErrors((prev) => ({
            ...prev,
            amount: "",
          }));
        }
      }

      handleInputChange(field, value);
    }
  };

  // Handle date input change - convert from display format to storage format
  const handleDateInputChange = (e, field) => {
    const displayValue = e.target.value;

    // Convert display format (DD MMM YYYY) to storage format (YYYY-MM-DD)
    const storageValue = parseDateFromInput(displayValue);

    handleInputChange(field, storageValue);
  };

  // Handle dropdown change
  const handleDropdownChange = (e, field) => {
    handleInputChange(field, e.target.value);
  };

  // Render form field based on type
  const renderFormField = (field) => {
    const value = form[field.key] || "";
    const fieldError = errors[field.key];

    switch (field.type) {
      case "select":
        return (
          <div>
            <CustomDropdown
              value={value}
              onChange={(e) => handleInputChange(field.key, e.target.value)}
              options={field.options || []}
              error={fieldError}
              disabled={field.disabled || false}
              placeholder={field.placeholder || `Select ${field.label}`}
            />
          </div>
        );

      case "invoiceDropdown":
        return (
          <div>
            <SearchableDropdown
              value={value}
              onChange={(val) => handleInputChange(field.key, val)}
              options={field.options || []}
              placeholder={field.placeholder || `Select ${field.label}`}
              error={fieldError}
              disabled={field.disabled || salesLoading}
              loading={salesLoading}
            />
            {isFetchingSales && (
              <div className="mt-1 text-xs text-gray-500">Fetching invoice details...</div>
            )}
          </div>
        );

      case "date":
        return field.key === "date" ? (
          <input
            type="date"
            value={value}
            onChange={(e) => handleDateInputChange(e, field.key)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              fieldError ? "border-red-500" : "border-gray-300"
            } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
            placeholder="DD MMM YYYY"
          />
        ) : (
          <input
            type="text"
            value={formatDateForInput(value)}
            onChange={(e) => handleDateInputChange(e, field.key)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              fieldError ? "border-red-500" : "border-gray-300"
            } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
            placeholder="DD MMM YYYY"
          />
        );

      case "number":
        return (
          <div>
            <input
              type="text"
              value={value}
              onChange={(e) => handleNumericInputChange(e, field.key)}
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
                fieldError ? "border-red-500" : "border-gray-300"
              } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
              disabled={field.disabled || false}
              placeholder={field.placeholder || ""}
            />
            {/* Show available balance info below amount field when source is selected */}
            {field.key === "amount" &&
              form.source &&
              (isDeposit || isWithdraw) && (
                <div className="mt-1 text-xs text-gray-500">
                  {isEdit ? (
                    <>
                      Available Balance: $
                      {getAvailableBalanceForUpdate().toFixed(2)}
                    </>
                  ) : (
                    <>
                      Available Balance: ${sourceAccountBalance.toFixed(2)}
                      <span className="block text-red-500">
                        Maximum amount: ${sourceAccountBalance.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              )}
          </div>
        );

      case "textarea":
        return (
          <textarea
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            rows={3}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              fieldError ? "border-red-500" : "border-gray-300"
            } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
            placeholder={field.placeholder || ""}
          />
        );

      case "text":
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              fieldError ? "border-red-500" : "border-gray-300"
            } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
            placeholder={field.placeholder || ""}
          />
        );
    }
  };

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            {isEdit ? "Edit" : "Add New"} Transaction - {activeTab}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {formFields.map((field) => (
              <div
                key={field.key}
                className={`space-y-2 ${
                  field.layout === "full" ? "md:col-span-2" : "md:col-span-1"
                }`}
              >
                <label className="block text-sm font-medium text-gray-700">
                  {field.label}
                  {field.required && !field.readonly && !field.disabled && (
                    <span className="text-red-500 ml-1">*</span>
                  )}
                </label>
                {renderFormField(field)}
                {errors[field.key] && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors[field.key]}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                categoryOptions.length === 0 || destinationOptions.length === 0
              }
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center
               gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              {isEdit ? "Update" : "Add"} Transaction
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

const CashAndBank = () => {
  const [activeTab, setActiveTab] = useState("Cash Balance");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const inputRef = useRef(null);

  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [allSelected, setAllSelected] = useState(false);
  const [activeColumnTab, setActiveColumnTab] = useState("add");
  const [totalAmountTab, setTotalAmountTab] = useState(0);
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "categoryType",
    "source",
    "destination",
    "amount",
    "exchangeLoss",
    "finalAmount",
    "date",
    "remarks",
    "actions",
  ]);

  // Fetch dropdown options from backend
  const {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
    loading: optionsLoading,
    error: optionsError,
    refetch: refetchDropdownOptions,
  } = useDropdownOptions();

  // Use the custom hook for visible pages
  const visiblePages = useVisiblePages(currentPage, totalPages);

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice No",
        dbName: "invoiceNumber",
      },
      {
        id: "categoryType",
        name: "Category Type",
        dbName: "categoryType",
      },
      {
        id: "source",
        name: "Source Account",
        dbName: "source",
      },
      {
        id: "destination",
        name: "Destination Account",
        dbName: "destination",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "customerName",
        name: "Customer Name",
        dbName: "customerName",
      },
      {
        id: "customerAddress",
        name: "Customer Address",
        dbName: "customerAddress",
      },
      {
        id: "amount",
        name: "Amount",
        dbName: "amount",
      },
      {
        id: "exchangeLoss",
        name: "Exchange Loss",
        dbName: "exchangeLoss",
      },
      {
        id: "finalAmount",
        name: "Final Amount",
        dbName: "finalAmount",
      },
      {
        id: "date",
        name: "Date",
        dbName: "date",
      },
      {
        id: "description",
        name: "Description",
        dbName: "description",
      },
      {
        id: "remarks",
        name: "Remarks",
        dbName: "remarks",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Required columns that cannot be removed
  const requiredColumns = ["invoiceNumber", "actions"];

  // Get available columns for Add tab (columns not currently in table)
  const availableColumns = useMemo(() => {
    return allFields.filter((item) => !tableColumns.includes(item.id));
  }, [allFields, tableColumns]);

  // Get removable columns for Remove tab (columns in table except required ones)
  const removableColumns = useMemo(() => {
    return allFields.filter(
      (item) =>
        tableColumns.includes(item.id) && !requiredColumns.includes(item.id)
    );
  }, [allFields, tableColumns]);

  // Chunk items for display in modal
  const chunkedItems = useMemo(() => {
    const items =
      activeColumnTab === "add" ? availableColumns : removableColumns;
    const chunks = [];
    for (let i = 0; i < items.length; i += 2) {
      chunks.push(items.slice(i, i + 2));
    }
    return chunks;
  }, [activeColumnTab, availableColumns, removableColumns]);

  // Toggle item selection in column modal
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
  const handleColumnSave = () => {
    if (activeColumnTab === "add") {
      // Add selected columns to table
      const newColumns = [...tableColumns, ...selectedItems];
      setTableColumns(newColumns);
    } else {
      // Remove selected columns from table (except required ones)
      const newColumns = tableColumns.filter(
        (id) => !selectedItems.includes(id) || requiredColumns.includes(id)
      );
      setTableColumns(newColumns);
    }
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };

  const handleColumnReset = () => {
    setSelectedItems([]);
    setAllSelected(false);
    // Reset to default columns
    setTableColumns([
      "invoiceNumber",
      "categoryType",
      "source",
      "destination",
      "amount",
      "exchangeLoss",
      "finalAmount",
      "date",
      "remarks",
      "actions",
    ]);
  };

  const handleColumnCancel = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
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

  const fetchTransactions = async () => {
    try {
      // Remove all parameters including searchTerm
      const response = await axios.get(`${backendUrl}/api/transaction`);
      if (response.data.success) {
        const { data: transactions, destinations } = response.data;

        // ✅ Filter transactions based on active tab - show both source AND destination entries
        const filteredData = transactions.filter((tx) => {
          const txCategoryName = tx.categoryType?.name?.toLowerCase() || "";
          const sourceName = tx.source?.name?.toLowerCase() || "";
          const destinationName = tx.destination?.name?.toLowerCase() || "";
          const activeTabLower = activeTab.toLowerCase();

          // For deposit/withdraw transactions, show entries for both source and destination
          if (txCategoryName === "deposit" || txCategoryName === "withdraw") {
            return (
              sourceName === activeTabLower ||
              destinationName === activeTabLower
            );
          }
          // For remittance, match source instead of destination
          else if (txCategoryName === "remittance") {
            return sourceName === activeTabLower;
          }
          // For other categories, match destination
          else {
            return destinationName === activeTabLower;
          }
        });

        // ✅ Find totalAmount from destinations array
        const matchingDestination = destinations.find(
          (dest) => dest.name.toLowerCase() === activeTab.toLowerCase()
        );

        const totalAmount = matchingDestination?.totalAmount || 0;
        setTotalAmountTab(totalAmount);

        // Calculate pagination
        const totalCount = filteredData.length;
        const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

        setTotalPages(totalPages);
        setTotalCount(totalCount);

        // Get current page data (only 7 records)
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const currentPageData = filteredData.slice(startIndex, endIndex);

        setData(currentPageData);
      }
    } catch (error) {
      console.error("❌ Error fetching transactions:", error);
      showToast("error", "Failed to fetch transactions");
      setData([]);
      setTotalPages(0);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [activeTab, currentPage]);

  const currentData = data || [];

  const handleAddTransaction = async (transactionData, isEdit = false) => {
    try {
      if (isEdit && editingTransaction) {
        const response = await axios.put(
          `${backendUrl}/api/transaction/${editingTransaction._id}`,
          transactionData
        );

        if (response.data.success) {
          showToast("success", "Transaction updated successfully");
          fetchTransactions();
          refetchDropdownOptions();
        }
      } else {
        showToast("success", "Transaction added successfully");
        fetchTransactions();
        refetchDropdownOptions();
      }
    } catch (error) {
      console.error("Error saving transaction:", error);
      showToast("error", "Failed to save transaction");
    }
  };

  // Handle edit transaction
  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  // Handle delete transaction (single)
  const handleDelete = async (transaction) => {
    const confirm = await confirmDialog({
      title: "Delete Transaction",
      text: `Are you sure you want to delete <b>${
        transaction.title || "This transaction"
      }</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      const response = await axios.delete(
        `${backendUrl}/api/transaction/${transaction._id}`
      );

      if (response.data.success) {
        showToast("success", "Transaction deleted successfully");
        fetchTransactions();
        refetchDropdownOptions(); // Refresh dropdown options after delete
      } else {
        showToast("error", "Failed to delete transaction");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      showToast("error", "Failed to delete transaction");
    }
  };

  // Handle delete selected transactions (bulk)
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      title: "Delete Selected Transactions",
      text: `Are you sure you want to delete <b>${selected.length}</b> selected transaction(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      await axios.delete(`${backendUrl}/api/transactions`, {
        data: { ids: selected },
      });

      showToast(
        "success",
        `${selected.length} transaction(s) deleted successfully`
      );
      setSelected([]);
      fetchTransactions();
      refetchDropdownOptions(); // Refresh dropdown options after bulk delete
    } catch (error) {
      console.error("Error deleting transactions:", error);
      showToast("error", "Failed to delete some transactions");
    }
  };

  // Handle selection
  const toggleSelect = (item) => {
    setSelected((prev) =>
      prev.some((s) => s === item._id)
        ? prev.filter((s) => s !== item._id)
        : [...prev, item._id]
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentData.map((r) => r._id));
    } else {
      setSelected([]);
    }
  };

  const renderCellContent = (item, field) => {
    const value = item[field.dbName];

    if (field.id === "actions") {
      return (
        <div className="flex items-center justify-center gap-3 min-w-[150px]">
          <button
            className="text-green-600 hover:text-green-800 cursor-pointer"
            title="Edit"
            onClick={() => handleEdit(item)}
          >
            <Edit size={18} />
          </button>
          <button
            className="text-red-600 hover:text-red-800 cursor-pointer"
            title="Delete"
            onClick={() => handleDelete(item)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      );
    }

    if (field.dbName === "categoryType") {
      const displayValue = getDisplayValue(value, categoryOptions);
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          {displayValue}
        </span>
      );
    }

    if (field.dbName === "amount") {
      // Amount field - black color, no +- symbols
      return (
        <span className="font-medium text-black">
          {(value || 0).toFixed(2)}
        </span>
      );
    }

    if (field.dbName === "finalAmount") {
      // Final Amount field - with +- symbols and color coding
      const categoryName = item.categoryType?.name?.toLowerCase() || "";

      const isNegativeDisplay =
        categoryName === "remittance" ||
        (categoryName === "withdraw" &&
          item.source?.name?.toLowerCase() === activeTab.toLowerCase()) ||
        (categoryName === "deposit" &&
          item.source?.name?.toLowerCase() === activeTab.toLowerCase());

      const isPositiveDisplay =
        (categoryName === "withdraw" &&
          item.destination?.name?.toLowerCase() === activeTab.toLowerCase()) ||
        (categoryName === "deposit" &&
          item.destination?.name?.toLowerCase() === activeTab.toLowerCase());

      return (
        <span
          className={`font-medium ${
            isNegativeDisplay
              ? "text-red-600" // Red color for money going out
              : isPositiveDisplay
              ? "text-green-700" // Green color for money coming in
              : value >= 0
              ? "text-green-700"
              : "text-red-600"
          }`}
        >
          {isNegativeDisplay
            ? "-"
            : isPositiveDisplay
            ? "+"
            : value >= 0
            ? "+"
            : ""}
          {Math.abs(value || 0).toFixed(2)}
        </span>
      );
    }

    if (field.dbName === "source" || field.dbName === "destination") {
      const displayValue = getDisplayValue(value, sourceOptions);
      const colorClass =
        field.dbName === "source"
          ? "bg-green-50 text-green-700"
          : "bg-purple-50 text-purple-700";
      return (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}
        >
          {displayValue}
        </span>
      );
    }

    if (field.dbName === "date" || field.dbName === "invoiceDate") {
      return value ? formatDateToReadable(value) : "--";
    }

    if (field.dbName === "remarks") {
      return value ? (
        <div className="max-w-xs truncate" title={value}>
          {value}
        </div>
      ) : (
        "--"
      );
    }

    return value ? value.toString() : "--";
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/transaction/export`, {
        params: {
          accountType: activeTab,
          ...(searchTerm && { search: searchTerm }),
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `transactions_${activeTab}_${
          new Date().toISOString().split("T")[0]
        }.csv`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast("success", "Export completed successfully");
    } catch (error) {
      console.error("Error exporting transactions:", error);
      showToast("error", "Failed to export transactions");
    } finally {
      setExportLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const searchValue = e.target.value;
    setSearchTerm(searchValue);
    setSelected([]);
    setCurrentPage(1);
  };

  const getSearchPlaceholder = () => {
    return activeTab === "Personal Account"
      ? "Search by Description or Category"
      : "Search by Invoice Number or Customer";
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1);
    setSearchTerm("");
    setSelected([]);
    refetchDropdownOptions();
  };

  const accountTypes = ["Cash Balance", "Personal Account", "Company Account"];

  return (
    <div className="p-6">
      <div className="container">
        <div className="mb-4 text-gray-600 text-sm">
          Dashboard <span className="mx-2">{">"}</span> Cash & Bank
        </div>

        {(optionsLoading || loading) && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-blue-700">
                {loading
                  ? "Loading transactions..."
                  : "Loading dropdown options..."}
              </span>
            </div>
          </div>
        )}

        {/* Show error state */}
        {optionsError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-red-700">
                Error loading dropdown options: {optionsError}
              </span>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={
                optionsLoading ||
                categoryOptions.length === 0 ||
                sourceOptions.length === 0
              }
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} /> Add New Transaction
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Trash2 size={18} /> Delete Selected ({selected.length})
              </button>
            )}
          </div>

          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => setIsColumnModalOpen(true)}
            >
              <Settings size={18} /> Add / Remove Column
            </button>

            <button
              onClick={handleExport}
              disabled={exportLoading || currentData.length === 0}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              <Download size={18} />
              {exportLoading ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>

        {/* Tabs - CORRECTED LAYOUT */}
        <div className="flex justify-between items-center mb-6">
          {/* Left side - Tabs */}
          <div className="flex gap-2 flex-1">
            {accountTypes.map((tab) => (
              <button
                key={`tab-${tab}`}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                  activeTab === tab
                    ? "bg-indigo-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {currentData.length > 0 && (
            <div className="flex items-center gap-4 ml-4">
              <p className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {totalCount}
                </span>
              </p>
              <div className="relative w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={() => inputRef.current?.focus()}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={getSearchPlaceholder()}
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* Account Summary */}
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-1">
                {activeTab} Summary
              </h3>
              <div className="flex items-center gap-4">
                <div className="text-2xl font-bold text-indigo-700">
                  ${totalAmountTab.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((field) => (
                    <th
                      key={`header-${field.id}`}
                      className="p-3 whitespace-nowrap min-w-[120px]"
                    >
                      {field.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentData.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all transactions"
                              checked={
                                selected.length === currentData.length &&
                                currentData.length > 0
                              }
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                            />
                          )}
                          <span className="text-sm font-medium">
                            {field.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">
                          {field.name}
                        </span>
                      )}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr key="empty-row">
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    {loading
                      ? "Loading transactions..."
                      : searchTerm
                      ? "No transactions match your search."
                      : "No transactions found."}
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => (
                  <tr
                    key={`row-${item._id || index}`}
                    className={`hover:bg-gray-50 ${
                      index < currentData.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((field) => (
                        <td
                          key={`cell-${item._id}-${field.id}`}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {field.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.includes(item._id)}
                                onChange={() => toggleSelect(item)}
                              />
                              <span className="capitalize">
                                {item.invoiceNumber || "NA"}
                              </span>
                            </div>
                          ) : (
                            renderCellContent(item, field)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {currentData.length > 1 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>
              {visiblePages.map((page, idx) =>
                page === "..." ? (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-3 py-1 text-gray-500 select-none"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
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
        </div>

        {isColumnModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={handleColumnCancel}
              />
              <div
                className="relative bg-white p-6 rounded shadow-lg max-w-4xl w-full z-10"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-semibold mb-4">
                  {activeColumnTab === "add" ? "Add Columns" : "Remove Columns"}
                </h2>

                <div className="flex w-full gap-2 mb-4">
                  <div className="w-1/2">
                    <button
                      onClick={() => {
                        setActiveColumnTab("add");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
                        activeColumnTab === "add"
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
                        setActiveColumnTab("remove");
                        setSelectedItems([]);
                        setAllSelected(false);
                      }}
                      className={`w-full px-4 py-2 font-medium text-center rounded-lg ${
                        activeColumnTab === "remove"
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
                      {activeColumnTab === "remove" && (
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
                                  className="flex items-center gap-2 bg-gray-200 rounded px-2 py-1 cursor-not-allowed"
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
                      {activeColumnTab === "add"
                        ? "All available columns are already in the table."
                        : "No columns available to remove."}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t flex justify-between items-center">
                  <button
                    onClick={handleColumnReset}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 cursor-pointer"
                  >
                    Reset to Default
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={handleColumnCancel}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleColumnSave}
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

        <AddTransactionModal
          key="add-modal"
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          activeTab={activeTab}
          onAddTransaction={handleAddTransaction}
          categoryOptions={categoryOptions}
          sourceOptions={sourceOptions}
          destinationOptions={destinationOptions}
          supplierOptions={supplierOptions}
          currentData={currentData}
        />

        <AddTransactionModal
          key="edit-modal"
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingTransaction(null);
          }}
          activeTab={activeTab}
          onAddTransaction={handleAddTransaction}
          editData={editingTransaction}
          isEdit={true}
          categoryOptions={categoryOptions}
          sourceOptions={sourceOptions}
          destinationOptions={destinationOptions}
          supplierOptions={supplierOptions}
          currentData={currentData}
        />
      </div>
    </div>
  );
};

export default CashAndBank;