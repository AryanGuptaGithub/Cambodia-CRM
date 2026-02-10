import {
  Search,
  Download,
  X,
  Plus,
  Trash2,
  Edit,
  Eye,
  Settings,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import TransactionExcelDownload from "../../excels/TransactionExcelDownload.jsx";
import * as XLSX from "xlsx"; // Added missing import

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Helper function to get display value
const getDisplayValue = (value, options) => {
  try {
    if (value === undefined || value === null || value === "") return "--";

    // If value is an object (populated data from backend)
    if (typeof value === "object" && value !== null) {
      return (
        value.name ||
        value.label ||
        value.title ||
        (typeof value === "string" ? value : "--")
      );
    }

    // If value is a string or number (could be ID)
    if (
      (typeof value === "string" || typeof value === "number") &&
      options &&
      Array.isArray(options)
    ) {
      const option = options.find((opt) => {
        if (!opt) return false;

        if (opt.value === value || opt.value?.toString() === value.toString()) {
          return true;
        }

        if (typeof opt === "string" && opt === value) {
          return true;
        }

        if (opt._id && opt._id.toString() === value.toString()) {
          return true;
        }

        return false;
      });

      if (option) {
        return option.label || option.name || option.toString();
      }

      return value.toString();
    }

    return value !== undefined && value !== null ? value.toString() : "--";
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
  const [customerOptions, setCustomerOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDropdownOptions = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch category options
      const categoryResponse = await axios.get(
        `${backendUrl}/api/accounts/category-type`,
      );

      const categories = (categoryResponse.data || []).map((cat) => ({
        value: cat._id || cat.id,
        label: cat.name || "Unnamed Category",
      }));
      setCategoryOptions(categories);

      // Fetch destination options (which also serve as source options)
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      const destinations = (destinationResponse.data || []).map((dest) => ({
        value: dest._id || dest.id,
        label: dest.name || "Unnamed Destination",
        totalAmount: dest.totalAmount || 0,
      }));
      setDestinationOptions(destinations);
      setSourceOptions(destinations);

      // Fetch supplier options
      const supplierResponse = await axios.get(
        `${backendUrl}/api/suppliers/all`,
      );

      let suppliers = [];
      if (supplierResponse.data && Array.isArray(supplierResponse.data)) {
        suppliers = supplierResponse.data;
      }

      const supplierOptions = suppliers.map((supplier) => ({
        value: supplier._id || supplier.id,
        label: supplier.name || supplier.supplierName || "Unnamed Supplier",
        supplierName: supplier.supplierName || "",
        address: supplier.address || "",
        contact: supplier.contact || "",
        email: supplier.email || "",
      }));
      setSupplierOptions(supplierOptions);

      // Fetch customer options
      const customerResponse = await axios.get(`${backendUrl}/api/customers`);

      let customers = [];
      if (
        customerResponse.data &&
        Array.isArray(customerResponse.data.customers)
      ) {
        customers = customerResponse.data.customers;
      } else if (
        customerResponse.data &&
        Array.isArray(customerResponse.data)
      ) {
        customers = customerResponse.data;
      }

      const customerOptions = customers.map((customer) => ({
        value: customer._id || customer.id,
        label: customer.name || customer.customerName || "Unnamed Customer",
        customerCode: customer.customerCode || "",
        address: customer.address || "",
        typeOfBusiness: customer.typeOfBusiness || "",
      }));
      setCustomerOptions(customerOptions);
    } catch (err) {
      console.error("Error fetching dropdown options:", err);
      setError(err.message);
      setCategoryOptions([]);
      setSourceOptions([]);
      setDestinationOptions([]);
      setSupplierOptions([]);
      setCustomerOptions([]);
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
    customerOptions,
    loading,
    error,
    refetch: fetchDropdownOptions,
  };
};

// New hook to fetch sales invoices with payment status filtering
const useInvoiceOptions = (categoryName = "") => {
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

  // Get invoice options for dropdown with payment status filtering
  const getInvoiceOptions = useCallback(() => {
    if (loading) {
      return [{ value: "", label: "Loading invoices...", disabled: true }];
    }

    if (error || sales.length === 0) {
      return [{ value: "", label: "No invoices available", disabled: true }];
    }

    // Filter invoices based on category name and payment status
    let filteredSales = sales;

    // Get the category name to understand the context
    const categoryNameLower = categoryName?.toLowerCase() || "";

    if (categoryNameLower.includes("cash sale")) {
      // Filter for Cash Sale: invoices with payment status "cash" or "paid"
      filteredSales = sales.filter((sale) => {
        const paymentStatus = sale.paymentStatus?.toLowerCase() || "";
        return paymentStatus === "cash" || paymentStatus === "paid";
      });
    } else if (categoryNameLower.includes("credit collection")) {
      // Filter for Credit Collection: invoices with payment status "credit" or "pending"
      filteredSales = sales.filter((sale) => {
        const paymentStatus = sale.paymentStatus?.toLowerCase() || "";
        return (
          paymentStatus === "credit" ||
          paymentStatus === "pending" ||
          paymentStatus === "unpaid" ||
          paymentStatus === "due"
        );
      });
    }
    // If no category specified or doesn't require filtering, show all

    // Remove duplicates and format options
    const uniqueInvoices = [
      ...new Set(
        filteredSales.map((sale) => sale.invoiceNumber).filter(Boolean),
      ),
    ];

    const options = [
      { value: "", label: "Select Invoice Number" },
      ...uniqueInvoices.map((invoice) => ({
        value: invoice,
        label: invoice,
      })),
    ];

    return options;
  }, [sales, loading, error, categoryName]);

  // Also return filtered sales for use in findSaleByInvoice
  const getFilteredSales = useCallback(() => {
    if (!categoryName) return sales;

    const categoryNameLower = categoryName.toLowerCase();

    if (categoryNameLower.includes("cash sale")) {
      return sales.filter((sale) => {
        const paymentStatus = sale.paymentStatus?.toLowerCase() || "";
        return paymentStatus === "cash" || paymentStatus === "paid";
      });
    } else if (categoryNameLower.includes("credit collection")) {
      return sales.filter((sale) => {
        const paymentStatus = sale.paymentStatus?.toLowerCase() || "";
        return (
          paymentStatus === "credit" ||
          paymentStatus === "pending" ||
          paymentStatus === "unpaid" ||
          paymentStatus === "due"
        );
      });
    }

    return sales;
  }, [sales, categoryName]);

  return {
    sales,
    filteredSales: getFilteredSales(),
    loading,
    error,
    getInvoiceOptions,
    refetch: fetchSales,
  };
};

// Import Excel Modal Component
const ImportExcelModal = ({
  isOpen,
  onClose,
  activeTab,
  data = [],
  categoryOptions = [],
  sourceOptions = [],
  destinationOptions = [],
  supplierOptions = [],
  customerOptions = [],
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];

    if (!validTypes.includes(file.type)) {
      showToast("error", "Please select a valid Excel or CSV file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("error", "File size should be less than 10MB");
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      showToast("error", "Please select a file first");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      setUploading(true);

      const response = await axios.post(
        `${backendUrl}/api/transaction/import`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (response.data.success) {
        showToast(
          "success",
          response.data.message || "File imported successfully",
        );
        setSelectedFile(null);
        onClose();
        window.location.reload();
      } else {
        showToast("error", response.data.message || "Import failed");
      }
    } catch (error) {
      console.error("Error importing file:", error);

      showToast(
        "error",
        error.response?.data?.message ||
          "Import failed. Please check Excel format and data.",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    // Create template data structure
    const templateData = [
      {
        "Invoice No": "INV-001",
        "Category Type": "Cash Sale",
        "Source Account": "Cash Balance",
        "Destination Account": "Company Account",
        Amount: "1000.00",
        "Exchange Loss": "0.00",
        "Final Amount": "1000.00",
        Date: "2024-01-15",
        Remarks: "Sample transaction",
      },
      {
        "Invoice No": "INV-002",
        "Category Type": "Deposit",
        "Source Account": "Personal Account",
        "Destination Account": "Cash Balance",
        Amount: "500.00",
        "Exchange Loss": "5.00",
        "Final Amount": "495.00",
        Date: "2024-01-16",
        Remarks: "Deposit example",
      },
    ];

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(templateData);

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transactions Template");

    // Generate Excel file
    XLSX.writeFile(
      wb,
      `transactions_template_${activeTab.replace(/\s+/g, "_")}.xlsx`,
    );

    showToast("success", "Template downloaded successfully");
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
            Import Excel - {activeTab}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Download Template Section */}
          <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Download Excel Template
            </h3>
            <p className="text-gray-600 mb-4">
              Download a template file with the correct format for importing
              transactions.
            </p>
            <TransactionExcelDownload
              data={data}
              categoryOptions={categoryOptions}
              sourceOptions={sourceOptions}
              destinationOptions={destinationOptions}
              supplierOptions={supplierOptions}
              customerOptions={customerOptions}
              activeTab={activeTab}
            />
          </div>

          {/* Import Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              Upload Excel File
            </h3>
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto text-gray-400 mb-3" size={48} />
                <p className="text-gray-600 mb-2">
                  {selectedFile
                    ? selectedFile.name
                    : "Click to select Excel file"}
                </p>
                <p className="text-sm text-gray-500">
                  Supported formats: .xlsx, .xls, .csv (Max 10MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-green-800">
                        Selected file: {selectedFile.name}
                      </p>
                      <p className="text-sm text-green-600">
                        Size: {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-lg shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={18} /> Upload File
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="font-medium text-gray-800 mb-2">Instructions:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Download the template for the correct format</li>
              <li>• Fill in the transaction data</li>
              <li>• Save the file and upload it here</li>
              <li>• Make sure dates are in YYYY-MM-DD format</li>
              <li>• Amounts should be in numeric format (e.g., 1000.00)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
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
  customerOptions = [],
  currentData = [],
}) => {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [isFetchingSales, setIsFetchingSales] = useState(false);
  const [invoiceDataFetched, setInvoiceDataFetched] = useState(false);
  const [sourceAccountBalance, setSourceAccountBalance] = useState(0);
  const [originalAmount, setOriginalAmount] = useState(0);

  // Get category name for filtering
  const getCategoryName = useMemo(() => {
    if (!form.categoryType) return "";
    const category = categoryOptions.find(
      (cat) => cat.value === form.categoryType,
    );
    return category?.label || "";
  }, [form.categoryType, categoryOptions]);

  // Use the new invoice options hook with category filtering
  const {
    sales,
    filteredSales,
    loading: salesLoading,
    getInvoiceOptions,
    refetch: refetchSales,
  } = useInvoiceOptions(getCategoryName);

  // Memoized helper functions
  const requiresSupplier = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return (
      categoryName.includes("payment inward") ||
      categoryName.includes("remittance")
    );
  }, [getCategoryName]);

  const isRemittance = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return categoryName.includes("remittance");
  }, [getCategoryName]);

  const isPaymentInward = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return categoryName.includes("payment inward");
  }, [getCategoryName]);

  const isPaymentOutward = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return categoryName.includes("payment outward");
  }, [getCategoryName]);

  const isDepositOrWithdraw = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return (
      categoryName.includes("withdraw") || categoryName.includes("deposit")
    );
  }, [getCategoryName]);

  const isDeposit = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return categoryName.includes("deposit");
  }, [getCategoryName]);

  const isWithdraw = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return categoryName.includes("withdraw");
  }, [getCategoryName]);

  // Check if category requires invoice dropdown
  const requiresInvoiceDropdown = useMemo(() => {
    const categoryName = getCategoryName.toLowerCase();
    return (
      categoryName.includes("cash sale") ||
      categoryName.includes("credit collection")
    );
  }, [getCategoryName]);

  // Check if category requires invoice fields (text input)
  const requiresInvoiceFields = useMemo(() => {
    if (!form.categoryType) return false;
    const categoryName = getCategoryName.toLowerCase();

    // Invoice fields for sales-related categories (except those with dropdown)
    return (
      !isDepositOrWithdraw &&
      !requiresSupplier &&
      !isPaymentOutward &&
      !requiresInvoiceDropdown
    );
  }, [
    getCategoryName,
    isDepositOrWithdraw,
    requiresSupplier,
    isPaymentOutward,
    requiresInvoiceDropdown,
  ]);

  // Get filtered source options (exclude destination account for deposit/withdraw)
  const getFilteredSourceOptions = useMemo(() => {
    if (!isDepositOrWithdraw) {
      return sourceOptions;
    }

    // For deposit/withdraw, exclude the selected destination account from source options
    return sourceOptions.filter(
      (source) => !form.destination || source.value !== form.destination,
    );
  }, [sourceOptions, form.destination, isDepositOrWithdraw]);

  // Get filtered destination options (exclude source account for deposit/withdraw)
  const getFilteredDestinationOptions = useMemo(() => {
    if (!isDepositOrWithdraw) {
      return destinationOptions;
    }

    // For deposit/withdraw, exclude the selected source account from destination options
    return destinationOptions.filter(
      (destination) => !form.source || destination.value !== form.source,
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
      } else if (isPaymentInward) {
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
        const categoryName = getCategoryName.toLowerCase();
        let paymentStatusNote = "";

        baseFields.splice(1, 0, {
          key: "invoiceNumber",
          label: `Invoice Number ${paymentStatusNote}`,
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
            type: "customerDropdown",
            required: true,
            options: customerOptions,
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
          },
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
    customerOptions,
    getCategoryName,
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
  const initializeFormData = useCallback(() => {
    const initialData = {};
    formFields.forEach((field) => {
      if (field.type === "date" && field.key === "date") {
        initialData[field.key] = new Date().toISOString().split("T")[0];
      } else if (field.key === "finalAmount") {
        initialData[field.key] = "0.00";
      } else {
        initialData[field.key] = "";
      }
    });
    return initialData;
  }, [formFields]);

  useEffect(() => {
    if (isOpen) {
      if (isEdit && editData) {
        const processedEditData = {
          ...editData,
          categoryType:
            editData.categoryType?._id || editData.categoryType || "",
          source: editData.source?._id || editData.source || "",
          destination: editData.destination?._id || editData.destination || "",
          supplier: editData.supplier?._id || editData.supplier || "",
          remarks: editData.remarks || "",
          customerName: editData.customerName || "",
          customerAddress: editData.customerAddress || "",
          invoiceDate: editData.invoiceDate || "",
          invoiceNumber: editData.invoiceNumber || "",
          exchangeLoss: editData.exchangeLoss || "",
          finalAmount: editData.finalAmount || "0.00",
          amount: editData.amount || "",
          date: editData.date || new Date().toISOString().split("T")[0],
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
  }, [isOpen, isEdit, editData, activeTab, initializeFormData]);

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
        (option) => option.value === form.source,
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
        if (
          !requiresInvoiceFields &&
          !requiresInvoiceDropdown &&
          newForm.invoiceNumber
        ) {
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
  const findSaleByInvoice = useCallback((invoiceNumber) => {
    // First check filtered sales (already filtered by payment status)
    let sale = filteredSales.find(
      (sale) => sale.invoiceNumber === invoiceNumber,
    );

    // If not found in filtered sales, check all sales (for edit mode)
    if (!sale) {
      sale = sales.find((sale) => sale.invoiceNumber === invoiceNumber);
    }

    return sale;
  }, [filteredSales, sales]);

  // Check if invoice already has a transaction (excluding current edit)
  const checkInvoiceExistsInCurrentData = useCallback((invoiceNumber) => {
    if (isEdit && editData && editData.invoiceNumber === invoiceNumber) {
      return false; // Allow same invoice when editing
    }
    return currentData.some((item) => item.invoiceNumber === invoiceNumber);
  }, [currentData, isEdit, editData]);

  const fetchSalesData = useCallback(async (invoiceNumber) => {
    if (
      !invoiceNumber ||
      invoiceNumber.trim() === "" ||
      (!requiresInvoiceFields && !requiresInvoiceDropdown)
    ) {
      return;
    }

    try {
      setIsFetchingSales(true);

      // For Cash Sale and Credit Collection: get data from filtered sales
      if (requiresInvoiceDropdown) {
        const saleRecord = findSaleByInvoice(invoiceNumber);

        if (saleRecord) {
          // Check if invoice already exists in current data
          const existingTransaction =
            checkInvoiceExistsInCurrentData(invoiceNumber);

          if (existingTransaction) {
            showToast(
              "error",
              `Invoice number ${invoiceNumber} already has a transaction`,
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

          // Find the customer in customerOptions
          const customer = customerOptions.find(
            (c) => c.label === saleRecord.customerName,
          );

          setForm((prev) => ({
            ...prev,
            invoiceNumber: saleRecord.invoiceNumber,
            invoiceDate:
              saleRecord.invoiceDate?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            customerName: saleRecord.customerName || "",
            customerAddress:
              customer?.address || saleRecord.customerAddress || "",
            amount: saleRecord.totalAmount || "",
          }));
          setInvoiceDataFetched(true);
        } else {
          // Check if invoice exists but doesn't match payment status filter
          const allSaleRecord = sales.find(
            (s) => s.invoiceNumber === invoiceNumber,
          );
          if (allSaleRecord) {
            const paymentStatus = allSaleRecord.paymentStatus || "Unknown";
            const categoryName = getCategoryName.toLowerCase();

            if (categoryName.includes("cash sale")) {
              showToast(
                "error",
                `Invoice ${invoiceNumber} has payment status "${paymentStatus}". Cash Sale requires invoices with "Cash" or "Paid" status.`,
              );
            } else if (categoryName.includes("credit collection")) {
              showToast(
                "error",
                `Invoice ${invoiceNumber} has payment status "${paymentStatus}". Credit Collection requires invoices with "Credit" or "Pending" status.`,
              );
            } else {
              showToast(
                "error",
                `Invoice ${invoiceNumber} not available for ${getCategoryName}`,
              );
            }
          } else {
            showToast(
              "error",
              `Invoice ${invoiceNumber} not found in sales records`,
            );
          }

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
          `${backendUrl}/api/accounts/alternative?invoiceNumber=${invoiceNumber}`,
        );
        const salesData = salesResponse.data;

        if (salesData.data && salesData.data.length > 0) {
          const existingTransaction = checkInvoiceExistsInCurrentData(invoiceNumber);

          if (existingTransaction) {
            const existingTx = currentData.find(
              (item) => item.invoiceNumber === invoiceNumber,
            );
            showToast(
              "error",
              `Invoice number ${invoiceNumber} already has a transaction with amount $${existingTx.amount}`,
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

          // Find the customer in customerOptions
          const customer = customerOptions.find(
            (c) => c.label === saleRecord.customerName,
          );

          setForm((prev) => ({
            ...prev,
            invoiceDate:
              saleRecord.invoiceDate?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            customerName: saleRecord.customerName || "",
            customerAddress:
              customer?.address || saleRecord.customerAddress || "",
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
  }, [
    requiresInvoiceFields,
    requiresInvoiceDropdown,
    findSaleByInvoice,
    checkInvoiceExistsInCurrentData,
    customerOptions,
    sales,
    getCategoryName,
    currentData,
  ]);

  // Calculate available balance for updates
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
  const handleInputChange = useCallback((field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    setErrors((prev) => ({
      ...prev,
      [field]: "",
    }));

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
        (option) => option.value === value,
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
            2,
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
  }, [
    sourceOptions,
    fetchSalesData,
    form.source,
    form.amount,
    isDeposit,
    isWithdraw,
    getAvailableBalanceForUpdate,
    errors,
  ]);

  const validateForm = useCallback(() => {
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
          newErrors[field.key] =
            `${field.label} must be a valid positive number`;
        }

        // For deposit/withdraw transactions, validate against available balance
        if ((isDeposit || isWithdraw) && form.source) {
          const availableBalance = getAvailableBalanceForUpdate();

          if (amountValue > availableBalance) {
            newErrors[field.key] =
              `Amount cannot exceed available balance of $${availableBalance.toFixed(
                2,
              )}`;
          }
        }
      }

      // Exchange loss validation for deposit
      if (field.key === "exchangeLoss" && form[field.key] && isDeposit) {
        const exchangeLossValue = parseFloat(form[field.key]);
        const amountValue = parseFloat(form.amount) || 0;

        if (isNaN(exchangeLossValue) || exchangeLossValue < 0) {
          newErrors[field.key] =
            `${field.label} must be a valid positive number`;
        }

        if (exchangeLossValue > amountValue) {
          newErrors[field.key] = `Exchange loss cannot exceed amount`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form, formFields, isDeposit, isWithdraw, getAvailableBalanceForUpdate]);

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
          transactionData,
        );
      } else {
        response = await axios.post(
          `${backendUrl}/api/transaction`,
          transactionData,
        );
      }

      if (response.data.success) {
        onAddTransaction(response.data.data, isEdit);
        onClose();
        showToast(
          "success",
          `Transaction ${isEdit ? "updated" : "added"} successfully`,
        );
      }
    } catch (err) {
      console.error("Transaction submission error:", err);
      showToast(
        "error",
        "Failed to submit transaction: " +
          (err.response?.data?.message || err.message),
      );
    }
  };

  // Handle numeric input for text fields with validation
  const handleNumericInputChange = useCallback((e, field) => {
    const value = e.target.value;

    // Allow only numbers and decimal point
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      handleInputChange(field, value);
    }
  }, [handleInputChange]);

  // Custom dropdown component
  const CustomDropdown = ({
    value,
    onChange,
    options = [],
    error,
    disabled,
    placeholder,
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
      const handleClickOutside = (event) => {
        if (
          dropdownRef.current &&
          !dropdownRef.current.contains(event.target)
        ) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleSelect = (optionValue) => {
      onChange({ target: { value: optionValue } });
      setIsOpen(false);
    };

    const selectedOption = useMemo(() => {
      if (!value && value !== 0) return null;
      return options.find((opt) => {
        if (!opt) return false;
        return (
          opt.value === value || opt.value?.toString() === value.toString()
        );
      });
    }, [value, options]);

    const displayText = useMemo(() => {
      if (selectedOption) {
        return selectedOption.label || selectedOption.value || "Selected";
      }
      if (options.length === 0) {
        return "Loading options...";
      }
      return placeholder;
    }, [selectedOption, options, placeholder]);

    return (
      <div className="relative w-full" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && options.length > 0 && setIsOpen(!isOpen)}
          className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-left flex justify-between items-center ${
            error ? "border-red-500" : "border-gray-300"
          } ${
            disabled
              ? "bg-gray-100 cursor-not-allowed"
              : "bg-white cursor-pointer hover:border-indigo-300"
          }`}
          disabled={disabled || options.length === 0}
        >
          <span className="truncate">{displayText}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {isOpen && !disabled && options.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {options.map((option, index) => (
              <div
                key={option.value || index}
                onClick={() => handleSelect(option.value)}
                className={`p-3 cursor-pointer hover:bg-indigo-50 transition-colors ${
                  value === option.value
                    ? "bg-indigo-50 text-indigo-700 font-medium"
                    : "text-gray-700"
                }`}
              >
                {option.label || option.value || "Unnamed option"}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render form field based on type
  const renderFormField = useCallback((field) => {
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
              <div className="mt-1 text-xs text-gray-500">
                Fetching invoice details...
              </div>
            )}
          </div>
        );

      case "customerDropdown":
        return (
          <div>
            <SearchableDropdown
              value={value}
              onChange={(val) => handleInputChange(field.key, val)}
              options={field.options || []}
              placeholder={field.placeholder || `Select ${field.label}`}
              error={fieldError}
              disabled={field.disabled}
            />
          </div>
        );

      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              fieldError ? "border-red-500" : "border-gray-300"
            } ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
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
                  Available Balance: $
                  {getAvailableBalanceForUpdate().toFixed(2)}
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
  }, [form, errors, handleInputChange, handleNumericInputChange, salesLoading, isFetchingSales, isDeposit, isWithdraw, getAvailableBalanceForUpdate]);

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
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              {isEdit ? "Update" : "Add"} Transaction
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// Column Management Modal
const ColumnManagementModal = ({ isOpen, onClose }) => {
  const [visibleColumns, setVisibleColumns] = useState([
    { key: "invoiceNumber", label: "Invoice No", visible: true },
    { key: "categoryType", label: "Category Type", visible: true },
    { key: "source", label: "Source Account", visible: true },
    { key: "destination", label: "Destination Account", visible: true },
    { key: "amount", label: "Amount", visible: true },
    { key: "exchangeLoss", label: "Exchange Loss", visible: true },
    { key: "finalAmount", label: "Final Amount", visible: true },
    { key: "date", label: "Date", visible: true },
    { key: "remarks", label: "Remarks", visible: true },
    { key: "actions", label: "Actions", visible: true },
  ]);

  const toggleColumn = (key) => {
    setVisibleColumns((prev) =>
      prev.map((col) =>
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const moveColumn = (fromIndex, toIndex) => {
    const newColumns = [...visibleColumns];
    const [removed] = newColumns.splice(fromIndex, 1);
    newColumns.splice(toIndex, 0, removed);
    setVisibleColumns(newColumns);
  };

  const saveColumns = () => {
    localStorage.setItem("cashbank_columns", JSON.stringify(visibleColumns));
    showToast("success", "Column settings saved successfully");
    onClose();
    window.location.reload();
  };

  const resetColumns = () => {
    setVisibleColumns([
      { key: "invoiceNumber", label: "Invoice No", visible: true },
      { key: "categoryType", label: "Category Type", visible: true },
      { key: "source", label: "Source Account", visible: true },
      { key: "destination", label: "Destination Account", visible: true },
      { key: "amount", label: "Amount", visible: true },
      { key: "exchangeLoss", label: "Exchange Loss", visible: true },
      { key: "finalAmount", label: "Final Amount", visible: true },
      { key: "date", label: "Date", visible: true },
      { key: "remarks", label: "Remarks", visible: true },
      { key: "actions", label: "Actions", visible: true },
    ]);
    localStorage.removeItem("cashbank_columns");
  };

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("cashbank_columns");
      if (saved) {
        try {
          setVisibleColumns(JSON.parse(saved));
        } catch (e) {
          console.error("Error loading saved columns:", e);
        }
      }
    }
  }, [isOpen]);

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
            Column Management
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Manage Table Columns
            </h3>
            <p className="text-gray-600 mb-4">
              Select which columns to show and drag to reorder them.
            </p>
          </div>

          <div className="space-y-4">
            {visibleColumns.map((column, index) => (
              <div
                key={column.key}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleColumn(column.key)}
                    className={`w-6 h-6 rounded border flex items-center justify-center ${
                      column.visible
                        ? "bg-indigo-600 border-indigo-600"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    {column.visible && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className="font-medium text-gray-800">
                    {column.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {index > 0 && (
                    <button
                      onClick={() => moveColumn(index, index - 1)}
                      className="p-2 text-gray-600 hover:text-indigo-600 cursor-pointer"
                      title="Move up"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  )}
                  {index < visibleColumns.length - 1 && (
                    <button
                      onClick={() => moveColumn(index, index + 1)}
                      className="p-2 text-gray-600 hover:text-indigo-600 cursor-pointer"
                      title="Move down"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between gap-3 mt-8 pt-6 border-t">
            <button
              onClick={resetColumns}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
            >
              Reset to Default
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveColumns}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const CashAndBank = () => {
  const [activeTab, setActiveTab] = useState("Cash Balance");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [data, setData] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [totalAmountTab, setTotalAmountTab] = useState(0);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState([]);

  // Fetch dropdown options
  const {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
    customerOptions,
    loading: optionsLoading,
    error: optionsError,
    refetch: refetchDropdownOptions,
  } = useDropdownOptions();

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/transaction`);
      if (response.data.success) {
        const { data: transactions, destinations } = response.data;

        // Filter transactions based on active tab
        const filteredData = transactions.filter((tx) => {
          const txCategoryName = tx.categoryType?.name?.toLowerCase() || "";
          const sourceName = tx.source?.name?.toLowerCase() || "";
          const destinationName = tx.destination?.name?.toLowerCase() || "";
          const activeTabLower = activeTab.toLowerCase();

          // For deposit/withdraw transactions
          if (txCategoryName === "deposit" || txCategoryName === "withdraw") {
            return (
              sourceName === activeTabLower ||
              destinationName === activeTabLower
            );
          }
          // For remittance, match source
          else if (txCategoryName === "remittance") {
            return sourceName === activeTabLower;
          }
          // For other categories, match destination
          else {
            return destinationName === activeTabLower;
          }
        });

        // Find totalAmount from destinations array
        const matchingDestination = destinations.find(
          (dest) => dest.name.toLowerCase() === activeTab.toLowerCase(),
        );
        const totalAmount = matchingDestination?.totalAmount || 0;
        setTotalAmountTab(totalAmount);

        setData(filteredData);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      showToast("error", "Failed to fetch transactions");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [activeTab]);

  useEffect(() => {
    // Load saved column settings
    const saved = localStorage.getItem("cashbank_columns");
    if (saved) {
      try {
        setVisibleColumns(JSON.parse(saved));
      } catch (e) {
        console.error("Error loading saved columns:", e);
        setVisibleColumns([
          { key: "invoiceNumber", label: "Invoice No", visible: true },
          { key: "categoryType", label: "Category Type", visible: true },
          { key: "source", label: "Source Account", visible: true },
          { key: "destination", label: "Destination Account", visible: true },
          { key: "amount", label: "Amount", visible: true },
          { key: "exchangeLoss", label: "Exchange Loss", visible: true },
          { key: "finalAmount", label: "Final Amount", visible: true },
          { key: "date", label: "Date", visible: true },
          { key: "remarks", label: "Remarks", visible: true },
          { key: "actions", label: "Actions", visible: true },
        ]);
      }
    } else {
      setVisibleColumns([
        { key: "invoiceNumber", label: "Invoice No", visible: true },
        { key: "categoryType", label: "Category Type", visible: true },
        { key: "source", label: "Source Account", visible: true },
        { key: "destination", label: "Destination Account", visible: true },
        { key: "amount", label: "Amount", visible: true },
        { key: "exchangeLoss", label: "Exchange Loss", visible: true },
        { key: "finalAmount", label: "Final Amount", visible: true },
        { key: "date", label: "Date", visible: true },
        { key: "remarks", label: "Remarks", visible: true },
        { key: "actions", label: "Actions", visible: true },
      ]);
    }
  }, []);

  const handleAddTransaction = async (transactionData, isEdit = false) => {
    try {
      fetchTransactions();
      refetchDropdownOptions();
    } catch (error) {
      console.error("Error saving transaction:", error);
    }
  };

  // Handle edit transaction
  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  // Handle delete transaction
  const handleDelete = async (transaction) => {
    const confirm = await confirmDialog({
      title: "Delete Transaction",
      text: `Are you sure you want to delete this transaction?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) return;

    try {
      const response = await axios.delete(
        `${backendUrl}/api/transaction/${transaction._id}`,
      );

      if (response.data.success) {
        showToast("success", "Transaction deleted successfully");
        fetchTransactions();
        refetchDropdownOptions();
      } else {
        showToast("error", "Failed to delete transaction");
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      showToast("error", "Failed to delete transaction");
    }
  };

  const accountTypes = ["Cash Balance", "Personal Account", "Company Account"];

  // Get visible column headers
  const visibleColumnHeaders = visibleColumns
    .filter(col => col.visible)
    .map(col => ({
      key: col.key,
      label: col.label
    }));

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Cash & Bank
      </div>

      {/* Loading/Error States */}
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

      {optionsError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <span className="text-red-700">
              Error loading dropdown options: {optionsError}
            </span>
          </div>
        </div>
      )}

      {/* Top Buttons */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            disabled={optionsLoading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={18} /> Add New Transaction
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import Excel
          </button>
        </div>

        <button
          className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg shadow-md cursor-pointer"
          onClick={() => setIsColumnModalOpen(true)}
        >
          <Settings size={18} /> Add / Remove Column
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {accountTypes.map((tab) => (
          <button
            key={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
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

      {/* Account Summary */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-1">
              {activeTab} Summary
            </h3>
            <div className="text-2xl font-bold text-indigo-700">
              ${totalAmountTab.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-lg border border-gray-200">
        <table className="w-full min-w-max border-collapse bg-white rounded-lg overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              {visibleColumnHeaders.map((col) => (
                <th key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                  <span className="text-sm font-medium">{col.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnHeaders.length} className="p-8 text-center text-gray-500">
                  No transactions found.
                </td>
              </tr>
            ) : (
              data.map((item, index) => (
                <tr
                  key={`row-${item._id || index}`}
                  className={`hover:bg-gray-50 ${
                    index < data.length - 1 ? "border-b" : ""
                  }`}
                >
                  {visibleColumnHeaders.map((col) => {
                    if (col.key === "invoiceNumber") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          {item.invoiceNumber || "--"}
                        </td>
                      );
                    }
                    if (col.key === "categoryType") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {getDisplayValue(item.categoryType, categoryOptions)}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "source") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            {getDisplayValue(item.source, sourceOptions)}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "destination") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            {getDisplayValue(item.destination, destinationOptions)}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "amount") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <span className="font-medium text-black">
                            {parseFloat(item.amount || 0).toFixed(2)}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "exchangeLoss") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          {parseFloat(item.exchangeLoss || 0).toFixed(2)}
                        </td>
                      );
                    }
                    if (col.key === "finalAmount") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <span className="font-medium text-green-700">
                            +{parseFloat(item.finalAmount || 0).toFixed(2)}
                          </span>
                        </td>
                      );
                    }
                    if (col.key === "date") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          {item.date ? formatDateToReadable(item.date) : "--"}
                        </td>
                      );
                    }
                    if (col.key === "remarks") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <div className="max-w-xs truncate" title={item.remarks}>
                            {item.remarks || "--"}
                          </div>
                        </td>
                      );
                    }
                    if (col.key === "actions") {
                      return (
                        <td key={col.key} className="p-3 whitespace-nowrap min-w-[120px]">
                          <div className="flex items-center justify-center gap-3">
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
                        </td>
                      );
                    }
                    return null;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
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
        customerOptions={customerOptions}
        currentData={data}
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
        customerOptions={customerOptions}
        currentData={data}
      />

      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        activeTab={activeTab}
        data={data}
        categoryOptions={categoryOptions}
        sourceOptions={sourceOptions}
        destinationOptions={destinationOptions}
        supplierOptions={supplierOptions}
        customerOptions={customerOptions}
      />

      <ColumnManagementModal
        isOpen={isColumnModalOpen}
        onClose={() => setIsColumnModalOpen(false)}
      />
    </div>
  );
};

export default CashAndBank;