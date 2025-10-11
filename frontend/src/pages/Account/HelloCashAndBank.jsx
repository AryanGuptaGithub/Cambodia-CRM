import { Search, Download, X, Plus, Trash2, Edit, Eye } from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo } from "react";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const ITEMS_PER_PAGE = 10;

// Account types configuration
const accountTypes = ["Cash Balance", "Personal Account", "Company Account"];

// Custom hook to fetch dropdown options from backend
const useDropdownOptions = () => {
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDropdownOptions = async () => {
    try {
      setLoading(true);
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
      }));
      setDestinationOptions(destinations);
      setSourceOptions(destinations);
    } catch (err) {
      console.error("Error fetching dropdown options:", err);
      setError(err.message);
      setCategoryOptions([]);
      setSourceOptions([]);
      setDestinationOptions([]);
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
    loading,
    error,
    refetch: fetchDropdownOptions,
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
}) => {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [isFetchingSales, setIsFetchingSales] = useState(false);

  // Define form fields configuration with custom layout
  const formFields = useMemo(() => {
    return [
      {
        key: "invoiceNumber",
        label: "Invoice Number",
        type: "text",
        required: true,
        layout: "half",
      },
      {
        key: "categoryType",
        label: "Category Type",
        type: "select",
        required: true,
        options: categoryOptions,
        layout: "half",
      },
      {
        key: "source",
        label: "Source Account",
        type: "select",
        required: true,
        options: sourceOptions,
        layout: "half",
      },
      {
        key: "destination",
        label: "Destination Account",
        type: "select",
        required: false,
        options: destinationOptions,
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
        key: "invoiceDate",
        label: "Invoice Date",
        type: "date",
        required: true,
        disabled: true,
        layout: "half",
      },
      {
        key: "customerName",
        label: "Customer Name",
        type: "text",
        required: true,
        disabled: true,
        layout: "half",
      },
      {
        key: "customerAddress",
        label: "Customer Address",
        type: "text",
        required: false,
        disabled: true,
        layout: "half",
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        required: true,
        layout: "half",
      },
      {
        key: "exchangeLoss",
        label: "Exchange Loss",
        type: "number",
        required: false,
        layout: "half",
      },
      {
        key: "finalAmount",
        label: "Final Amount",
        type: "number",
        required: true,
        readonly: true,
        disabled: true,
        layout: "half",
      },
    ];
  }, [categoryOptions, sourceOptions, destinationOptions]);

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
        // Handle populated data from backend
        const processedEditData = {
          ...editData,
          categoryType: editData.categoryType?._id || editData.categoryType,
          source: editData.source?._id || editData.source,
          destination: editData.destination?._id || editData.destination,
        };
        setForm(processedEditData);
      } else {
        setForm(initializeFormData());
      }
      setErrors({});
    }
  }, [isOpen, isEdit, editData, activeTab]);

  // Calculate final amount whenever amount or exchange loss changes
  useEffect(() => {
    if (activeTab === "Cash Balance" || activeTab === "Company Account") {
      const amount = parseFloat(form.amount) || 0;
      const exchangeLoss = parseFloat(form.exchangeLoss) || 0;

      // Only calculate final amount for deposit categories
      if (shouldShowExchangeLossField()) {
        // For deposit categories: Final Amount = Amount - Exchange Loss
        const finalAmount = amount - exchangeLoss;

        setForm((prev) => ({
          ...prev,
          finalAmount: isNaN(finalAmount) ? "0.00" : finalAmount.toFixed(2),
        }));
      } else {
        // For other categories: Clear final amount
        setForm((prev) => ({
          ...prev,
          finalAmount: "0.00",
        }));
      }
    }
  }, [form.amount, form.exchangeLoss, activeTab, form.categoryType]);

  // Fetch sales data when invoice number is entered AND category type is selected
  const fetchSalesData = async (invoiceNumber) => {
    if (!invoiceNumber || invoiceNumber.trim() === "") {
      return;
    }

    // Only fetch for Cash Balance and Company Account tabs
    if (activeTab !== "Cash Balance" && activeTab !== "Company Account") {
      return;
    }

    try {
      setIsFetchingSales(true);
      const salesResponse = await axios.get(
        `${backendUrl}/api/accounts/alternative?invoiceNumber=${invoiceNumber}`
      );
      const salesData = salesResponse.data;

      if (salesData.data.length > 0) {
        // Auto-fill with the first matching record
        const saleRecord = salesData.data[0];
        setForm((prev) => ({
          ...prev,
          invoiceNumber: saleRecord.invoiceNumber || prev.invoiceNumber,
          invoiceDate:
            saleRecord.invoiceDate?.split("T")[0] ||
            new Date().toISOString().split("T")[0],
          customerName: saleRecord.customerName || "",
          customerAddress: saleRecord.customerAddress || "",
          amount: saleRecord.amount || "",
        }));
      } else {
        setForm((prev) => ({
          ...prev,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: "",
          customerName: "",
          customerAddress: "",
          amount: "",
        }));
        showToast(
          "error",
          `Invoice No <b>${form.invoiceNumber}</b> is not found in sale`
        );
      }
    } catch (error) {
      console.error("Error fetching sales data:", error);
    } finally {
      setIsFetchingSales(false);
    }
  };

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

    if (field === "categoryType" && value && form.invoiceNumber) {
      fetchSalesData(form.invoiceNumber);
    }

    if (field === "source" && value) {
      setForm((prev) => ({
        ...prev,
      }));
    } else if (field === "destination" && value) {
      setForm((prev) => ({
        ...prev,
      }));
    }

    // Clear source/destination when category type changes
    if (field === "categoryType") {
      setForm((prev) => ({
        ...prev,
        source: "",
        destination: "",
        exchangeLoss: "",
        finalAmount: "0.00",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    formFields.forEach((field) => {
      // Skip validation for disabled fields
      if (field.disabled) {
        return;
      }

      // Skip validation for exchange loss if it shouldn't be shown
      if (field.key === "exchangeLoss" && !shouldShowExchangeLossField()) {
        return;
      }

      // Skip validation for destination if it shouldn't be shown
      if (field.key === "destination" && !shouldShowDestinationField()) {
        return;
      }

      // Skip validation for final amount if it shouldn't be shown
      if (field.key === "finalAmount" && !shouldShowFinalAmountField()) {
        return;
      }

      // Source is always required
      if (field.key === "destination") {
        if (!form[field.key]) {
          newErrors[field.key] = `${field.label} is required`;
        }
      }

      // Destination is required only when shown
      if (field.key === "source" && shouldShowDestinationField()) {
        if (!form[field.key]) {
          newErrors[
            field.key
          ] = `${field.label} is required for this category type`;
        }
      }

      if (
        field.required &&
        !form[field.key] &&
        !field.readonly &&
        !field.disabled
      ) {
        newErrors[field.key] = `${field.label} is required`;
      }

      // Validate numeric fields
      if (
        (field.key === "amount" || field.key === "exchangeLoss") &&
        form[field.key]
      ) {
        const numValue = parseFloat(form[field.key]);
        if (isNaN(numValue) || numValue < 0) {
          newErrors[
            field.key
          ] = `${field.label} must be a valid positive number`;
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
    const finalAmount = amount - exchangeLoss;

    // Only send the ObjectIds to the server
    const transactionData = {
      invoiceNumber: form.invoiceNumber,
      categoryType: form.categoryType,
      source: form.source,
      destination: form.destination || null,
      date: form.date,
      invoiceDate: form.invoiceDate,
      customerName: form.customerName,
      customerAddress: form.customerAddress,
      amount,
      exchangeLoss,
      finalAmount,
      accountType: activeTab,
      description: form.description,
    };

    try {
      const response = await axios.post(
        `${backendUrl}/api/transaction`,
        transactionData
      );

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

  // Handle numeric input for text fields
  const handleNumericInputChange = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      handleInputChange(field, value);
    }
  };

  // Destination Account should show only for withdraw and deposit categories
  const shouldShowDestinationField = () => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "withdraw" || categoryName === "deposit";
  };

  // Exchange Loss should show only for deposit categories
  const shouldShowExchangeLossField = () => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "deposit";
  };

  // Final Amount should show only for deposit categories
  const shouldShowFinalAmountField = () => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";
    return categoryName === "deposit";
  };

  // Get filtered source options (exclude selected destination)
  const getFilteredSourceOptions = () => {
    if (!form.destination) {
      return sourceOptions;
    }
    return sourceOptions.filter((option) => option.value !== form.destination);
  };

  // Get filtered destination options (exclude selected source)
  const getFilteredDestinationOptions = () => {
    if (!form.source) {
      return destinationOptions;
    }
    return destinationOptions.filter((option) => option.value !== form.source);
  };

  const renderFormField = (field) => {
    // Skip rendering destination if it shouldn't be shown
    if (field.key === "destination" && !shouldShowDestinationField()) {
      return null;
    }

    // Skip rendering exchange loss if it shouldn't be shown
    if (field.key === "exchangeLoss" && !shouldShowExchangeLossField()) {
      return null;
    }

    // Skip rendering final amount if it shouldn't be shown
    if (field.key === "finalAmount" && !shouldShowFinalAmountField()) {
      return null;
    }

    const value = form[field.key] || "";
    const error = errors[field.key];
    let fieldOptions = field.options || [];

    // Use filtered options for source and destination
    if (field.key === "source") {
      fieldOptions = getFilteredSourceOptions();
    } else if (field.key === "destination") {
      fieldOptions = getFilteredDestinationOptions();
    }

    // Handle disabled fields
    if (field.disabled) {
      return (
        <input
          type={field.type === "date" ? "date" : "text"}
          value={value}
          readOnly
          disabled
          className="w-full p-2 border border-gray-300 bg-gray-100 rounded-lg text-gray-600 cursor-not-allowed"
        />
      );
    }

    const isCategoryTypeDisabled =
      field.key === "categoryType" &&
      (!form.invoiceNumber || form.invoiceNumber.trim() === "");

    switch (field.type) {
      case "select":
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              error ? "border-red-500" : "border-gray-300"
            } ${
              isCategoryTypeDisabled ? "bg-gray-100 cursor-not-allowed" : ""
            }`}
            disabled={fieldOptions.length === 0 || isCategoryTypeDisabled}
          >
            <option value="">
              {fieldOptions.length === 0
                ? "Loading..."
                : isCategoryTypeDisabled
                ? "Enter Invoice Number first"
                : `Select ${field.label}`}
            </option>
            {fieldOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "date":
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              error ? "border-red-500" : "border-gray-300"
            }`}
          />
        );

      case "number":
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleNumericInputChange(e, field.key)}
            placeholder={`Enter ${field.label}`}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
              error ? "border-red-500" : "border-gray-300"
            }`}
          />
        );

      default:
        return (
          <div className="relative">
            <input
              type="text"
              value={value}
              onChange={(e) => handleInputChange(field.key, e.target.value)}
              placeholder={`Enter ${field.label}`}
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
                error ? "border-red-500" : "border-gray-300"
              }`}
            />
            {field.key === "invoiceNumber" && isFetchingSales && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
              </div>
            )}
          </div>
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
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {formFields.map((field) => {
              const fieldElement = renderFormField(field);
              if (!fieldElement) return null;

              return (
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
                  {fieldElement}
                  {errors[field.key] && (
                    <p className="text-red-500 text-xs mt-1">
                      {errors[field.key]}
                    </p>
                  )}
                </div>
              );
            })}
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
                categoryOptions.length === 0 || sourceOptions.length === 0
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

const CashandBank = () => {
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

  // Fetch dropdown options from backend
  const {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    loading: optionsLoading,
    error: optionsError,
  } = useDropdownOptions();

  // Fetch transactions from backend
  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: ITEMS_PER_PAGE,
        accountType: activeTab,
        ...(searchTerm && { search: searchTerm }),
      };

      const response = await axios.get(`${backendUrl}/api/transaction`, {
        params,
      });

      if (response.data.success) {
        setData(response.data.data);
        setTotalPages(response.data.totalPages);
        setTotalCount(response.data.total);
      }
    } catch (error) {
      console.error("Error fetching transactions:", error);
      showToast("error", "Failed to fetch transactions");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch transactions when component mounts or filters change
  useEffect(() => {
    fetchTransactions();
  }, [activeTab, searchTerm, currentPage]);

  // Define table columns using useMemo
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
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Use data directly from backend
  const currentData = data || [];

  const totalAmount = currentData.reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );

  // Helper function to safely extract display value
  const getDisplayValue = (value, options) => {
    if (!value) return "--";

    // If value is an object (populated data from backend)
    if (typeof value === "object" && value !== null) {
      return value.name || value.label || "--";
    }

    // If value is a string (ID), find the label from options
    const option = options.find((opt) => opt.value === value);
    return option ? option.label : value;
  };

  // Handle adding new transaction
  const handleAddTransaction = async (transactionData, isEdit = false) => {
    try {
      if (isEdit && editingTransaction) {
        // Update transaction
        const response = await axios.put(
          `${backendUrl}/api/transaction/${editingTransaction._id}`,
          transactionData
        );

        if (response.data.success) {
          showToast("success", "Transaction updated successfully");
          fetchTransactions(); // Refresh data
        }
      } else {
        // Add new transaction - already handled in modal
        showToast("success", "Transaction added successfully");
        fetchTransactions(); // Refresh data
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

  // Handle delete transaction
  const handleDelete = async (transaction) => {
    if (window.confirm(`Are you sure you want to delete this transaction?`)) {
      try {
        const response = await axios.delete(
          `${backendUrl}/api/transaction/${transaction._id}`
        );

        if (response.data.success) {
          showToast("success", "Transaction deleted successfully");
          fetchTransactions(); // Refresh data
        }
      } catch (error) {
        console.error("Error deleting transaction:", error);
        showToast("error", "Failed to delete transaction");
      }
    }
  };

  // Handle delete selected transactions
  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected transactions?`
      )
    ) {
      try {
        // Delete multiple transactions
        const deletePromises = selected.map((id) =>
          axios.delete(`${backendUrl}/api/transaction/${id}`)
        );

        await Promise.all(deletePromises);
        showToast(
          "success",
          `${selected.length} transactions deleted successfully`
        );
        setSelected([]);
        fetchTransactions(); // Refresh data
      } catch (error) {
        console.error("Error deleting transactions:", error);
        showToast("error", "Failed to delete some transactions");
      }
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

  // Render cell content based on field type
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

    if (field.dbName === "amount" || field.dbName === "finalAmount") {
      return (
        <span
          className={`font-medium ${
            value >= 0 ? "text-green-700" : "text-red-600"
          }`}
        >
          {value >= 0 ? "+" : ""}₹{Math.abs(value || 0).toFixed(2)}
        </span>
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
      return value ? new Date(value).toLocaleDateString() : "--";
    }

    // Handle all other fields safely
    return value ? value.toString() : "--";
  };

  // Export functionality
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
    setSearchTerm(e.target.value);
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
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="mb-4 text-gray-600 text-sm">
          Dashboard <span className="mx-2">{">"}</span> Cash & Bank
        </div>

        {/* Show loading state */}
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

          <button
            onClick={handleExport}
            disabled={exportLoading || currentData.length === 0}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
          >
            <Download size={18} />
            {exportLoading ? "Exporting..." : "Export"}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex justify-between items-center mb-6">
          {/* Left side - Tabs */}
          <div className="flex gap-2">
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

          {/* Right side - Total Count & Search */}
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {totalCount}
              </span>
            </p>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
              />
              <input
                type="text"
                placeholder={getSearchPlaceholder()}
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
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
                  ₹{totalAmount.toFixed(2)}
                </div>
                <div className="text-sm text-gray-600">
                  Showing {currentData.length} of {totalCount} transactions
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto shadow">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((field) => field.id !== "actions")
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
                          <span>{field.name}</span>
                        </div>
                      ) : (
                        field.name
                      )}
                    </th>
                  ))}
                <th
                  key="header-actions"
                  className="p-3 whitespace-nowrap min-w-[150px]"
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {currentData.length === 0 ? (
                <tr key="empty-row">
                  <td
                    colSpan={allFields.length}
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
                      .filter((field) => field.id !== "actions")
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
                                {item.invoiceNumber}
                              </span>
                            </div>
                          ) : (
                            renderCellContent(item, field)
                          )}
                        </td>
                      ))}
                    <td
                      key={`actions-${item._id}`}
                      className="p-3 whitespace-nowrap min-w-[150px]"
                    >
                      {renderCellContent(
                        item,
                        allFields.find((field) => field.id === "actions")
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 p-5 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              Page {currentPage} of {totalPages} • {totalCount} total
              transactions
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={`page-${page}`}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded cursor-pointer ${
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
          </div>
        )}

        {/* Add Transaction Modal */}
        <AddTransactionModal
          key="add-modal"
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          activeTab={activeTab}
          onAddTransaction={handleAddTransaction}
          categoryOptions={categoryOptions}
          sourceOptions={sourceOptions}
          destinationOptions={destinationOptions}
        />

        {/* Edit Transaction Modal */}
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
        />
      </div>
    </div>
  );
};

export default CashandBank;