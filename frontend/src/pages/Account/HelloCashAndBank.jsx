import { Search, Download, X, Plus, Trash2, Edit, Eye } from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo } from "react";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Configuration for different account types
const accountConfig = {
  "Cash Balance": {
    fields: [
      {
        key: "categoryType",
        label: "Category Type",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "invoiceNumber",
        label: "Invoice Number",
        type: "text",
        required: true,
      },
      {
        key: "source",
        label: "Source Account",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "destination",
        label: "Destination Account",
        type: "select",
        required: false,
        options: [],
      },
      {
        key: "invoiceDate",
        label: "Invoice Date",
        type: "date",
        required: true,
        disabled: true,
      },
      {
        key: "customerName",
        label: "Customer Name",
        type: "text",
        required: true,
        disabled: true,
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        required: true,
      },
      {
        key: "exchangeLoss",
        label: "Exchange Loss",
        type: "number",
        required: false,
      },
      {
        key: "finalAmount",
        label: "Final Amount",
        type: "number",
        required: true,
        readonly: true,
        disabled: true,
      },
      {
        key: "customerAddress",
        label: "Customer Address",
        type: "text",
        required: false,
        disabled: true,
      },
      { key: "date", label: "Date", type: "date", required: true },
    ],
    searchFields: ["invoiceNumber", "customerName"],
    placeholder: "Search by Invoice Number or Customer",
  },
  "Personal Account": {
    fields: [
      {
        key: "categoryType",
        label: "Category Type",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "source",
        label: "Source Account",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "destination",
        label: "Destination Account",
        type: "select",
        required: false,
        options: [],
      },
      {
        key: "description",
        label: "Description",
        type: "text",
        required: true,
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        required: true,
      },
      { key: "date", label: "Date", type: "date", required: true },
    ],
    searchFields: ["description", "categoryType"],
    placeholder: "Search by Description or Category",
  },
  "Company Account": {
    fields: [
      {
        key: "balanceAmount",
        label: "Balance Amount",
        type: "number",
        required: true,
        readonly: true,
        disabled: true,
        defaultValue: 4000.0,
      },
      {
        key: "categoryType",
        label: "Category Type",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "source",
        label: "Source Account",
        type: "select",
        required: true,
        options: [],
      },
      {
        key: "destination",
        label: "Destination Account",
        type: "select",
        required: false,
        options: [],
      },
      {
        key: "invoiceNumber",
        label: "Invoice Number",
        type: "text",
        required: true,
      },
      {
        key: "invoiceDate",
        label: "Invoice Date",
        type: "date",
        required: true,
        disabled: true,
      },
      {
        key: "customerName",
        label: "Customer Name",
        type: "text",
        required: true,
        disabled: true,
      },
      {
        key: "amount",
        label: "Amount",
        type: "number",
        required: true,
      },
      {
        key: "exchangeLoss",
        label: "Exchange Loss",
        type: "number",
        required: false,
      },
      {
        key: "finalAmount",
        label: "Final Amount",
        type: "number",
        required: true,
        readonly: true,
        disabled: true,
      },
      {
        key: "customerAddress",
        label: "Customer Address",
        type: "text",
        required: false,
        disabled: true,
      },
      { key: "balance", label: "Balance", type: "number", required: true },
      { key: "date", label: "Date", type: "date", required: true },
    ],
    searchFields: ["invoiceNumber", "customerName"],
    placeholder: "Search by Invoice Number or Customer",
  },
};

const ITEMS_PER_PAGE = 10;

// Function to generate table columns from accountConfig fields
const generateTableColumns = (fields) => {
  const columns = fields.map((field) => ({
    id: field.key,
    name: field.label,
    dbName: field.key,
  }));
  // Add actions column
  columns.push({ id: "actions", name: "Actions", dbName: "actions" });
  return columns;
};

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
  const [saleSuggestions, setSaleSuggestions] = useState([]); // Separate state for sales suggestions
  const [isFetchingSales, setIsFetchingSales] = useState(false);

  // Create updated account config with backend options
  const currentConfig = useMemo(() => {
    const config = JSON.parse(JSON.stringify(accountConfig[activeTab]));

    // Update categoryType options
    const categoryField = config.fields.find(
      (field) => field.key === "categoryType"
    );
    if (categoryField) {
      categoryField.options = categoryOptions || [];
    }

    // Update source options
    const sourceField = config.fields.find((field) => field.key === "source");
    if (sourceField) {
      sourceField.options = sourceOptions || [];
    }

    // Update destination options
    const destinationField = config.fields.find(
      (field) => field.key === "destination"
    );
    if (destinationField) {
      destinationField.options = destinationOptions || [];
    }

    return config;
  }, [activeTab, categoryOptions, sourceOptions, destinationOptions]);

  // Initialize form data based on account type
  const initializeFormData = () => {
    const initialData = {};
    currentConfig.fields.forEach((field) => {
      if (field.type === "date") {
        initialData[field.key] = new Date().toISOString().split("T")[0];
      } else if (field.defaultValue !== undefined) {
        initialData[field.key] = field.defaultValue;
      } else {
        initialData[field.key] = "";
      }
    });
    return initialData;
  };

  useEffect(() => {
    if (isOpen) {
      if (isEdit && editData) {
        setForm(editData);
      } else {
        setForm(initializeFormData());
      }
      setErrors({});
      setSaleSuggestions([]); // Clear sale suggestions when modal opens
    }
  }, [isOpen, activeTab, isEdit, editData, currentConfig]);

  // Calculate final amount whenever amount or exchange loss changes
  useEffect(() => {
    const amount = parseFloat(form.amount) || 0;
    const exchangeLoss = parseFloat(form.exchangeLoss) || 0;
    const finalAmount = amount - exchangeLoss;

    setForm((prev) => ({
      ...prev,
      finalAmount: isNaN(finalAmount) ? "" : finalAmount.toFixed(2),
    }));
  }, [form.amount, form.exchangeLoss]);

  // Destination Account should show only for withdraw categories
  const shouldShowDestinationField = () => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";

    return categoryName === "withdraw";
  };

  // Exchange Loss should show only for deposit categories
  const shouldShowExchangeLossField = () => {
    const categoryType = form.categoryType;
    const category = categoryOptions.find((cat) => cat.value === categoryType);
    const categoryName = category?.label?.toLowerCase() || "";

    return categoryName === "deposit";
  };

  // Get filtered options for source and destination
  const getFilteredSourceOptions = () => {
    const selectedDestination = form.destination;
    return sourceOptions.filter(
      (option) => option.value !== selectedDestination
    );
  };

  const getFilteredDestinationOptions = () => {
    const selectedSource = form.source;
    return destinationOptions.filter(
      (option) => option.value !== selectedSource
    );
  };

  // Fetch sales data when invoice number is entered
  const fetchSalesData = async (invoiceNumber) => {
    if (!invoiceNumber || invoiceNumber.trim() === "") {
      setSaleSuggestions([]);
      return;
    }

    // Only fetch for Cash Balance and Company Account tabs
    if (activeTab !== "Cash Balance" && activeTab !== "Company Account") {
      setSaleSuggestions([]);
      return;
    }

    try {
      setIsFetchingSales(true);
      const salesResponse = await axios.get(
        `${backendUrl}/api/accounts/alternative?invoiceNumber=${invoiceNumber}`
      );
      const salesData = salesResponse.data;
      console.log("Sales data:", salesData);

      if (salesData && salesData.length > 0) {
        setSaleSuggestions(salesData); // Use separate state for suggestions
      } else {
        setSaleSuggestions([]);
      }
    } catch (error) {
      console.error("Error fetching sales data:", error);
      setSaleSuggestions([]);
    } finally {
      setIsFetchingSales(false);
    }
  };

  // Handle invoice number change
  const handleInvoiceNumberChange = async (value) => {
    handleInputChange("invoiceNumber", value);
    if (value && value.trim() !== "") {
      await fetchSalesData(value);
    } else {
      setSaleSuggestions([]);
    }
  };

  // Handle selecting a sale suggestion
  const handleSelectSaleSuggestion = (sale) => {
    setForm((prev) => ({
      ...prev,
      invoiceNumber: sale.invoiceNumber,
      invoiceDate:
        sale.invoiceDate?.split("T")[0] ||
        new Date().toISOString().split("T")[0],
      customerName: sale.customerName,
      customerAddress: sale.customerAddress,
      amount: sale.amount || "",
    }));
    setSaleSuggestions([]); // Clear suggestions after selection
  };

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

    // Clear destination when source is selected and vice versa
    if (field === "source" && value) {
      setForm((prev) => ({
        ...prev,
        destination: "",
      }));
    } else if (field === "destination" && value) {
      setForm((prev) => ({
        ...prev,
        source: "",
      }));
    }

    // Clear source/destination when category type changes
    if (field === "categoryType") {
      setForm((prev) => ({
        ...prev,
        source: "",
        destination: "",
        exchangeLoss: "",
        finalAmount: prev.amount || "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    currentConfig.fields.forEach((field) => {
      // Skip validation for disabled fields
      if (field.disabled) {
        return;
      }

      // Skip validation for exchange loss if it shouldn't be shown
      if (field.key === "exchangeLoss" && !shouldShowExchangeLossField()) {
        return;
      }

      // Source is always required
      if (field.key === "source") {
        if (!form[field.key]) {
          newErrors[field.key] = `${field.label} is required`;
        }
      }

      // Destination is required only when shown
      if (field.key === "destination" && shouldShowDestinationField()) {
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
        (field.key === "amount" ||
          field.key === "balance" ||
          field.key === "exchangeLoss") &&
        form[field.key]
      ) {
        const numValue = parseFloat(form[field.key]);
        if (isNaN(numValue)) {
          newErrors[field.key] = `${field.label} must be a valid number`;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Prepare transaction data
    const transactionData = {
      ...form,
    };

    if (!isEdit) {
      transactionData.id = Date.now();
    }

    // Convert number fields
    currentConfig.fields.forEach((field) => {
      if (
        (field.key === "amount" ||
          field.key === "balance" ||
          field.key === "exchangeLoss" ||
          field.key === "finalAmount" ||
          field.key === "balanceAmount") &&
        transactionData[field.key]
      ) {
        transactionData[field.key] = parseFloat(transactionData[field.key]);
      }
    });

    onAddTransaction(transactionData, isEdit);
    onClose();
  };

  // Handle numeric input for text fields
  const handleNumericInputChange = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      handleInputChange(field, value);
    }
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

    const value = form[field.key] || "";
    const error = errors[field.key];

    // Use filtered options for source and destination
    let fieldOptions = field.options || [];
    if (field.key === "source") {
      fieldOptions = getFilteredSourceOptions();
    } else if (field.key === "destination") {
      fieldOptions = getFilteredDestinationOptions();
    }

    // Special handling for readonly balance amount field
    if (field.readonly && field.disabled) {
      return (
        <input
          type="text"
          value={`${value}`}
          readOnly
          disabled
          className="w-full p-2 border-2 border-yellow-400 bg-yellow-50 rounded-lg font-semibold text-gray-700 cursor-not-allowed"
          style={{ backgroundColor: "#fffbeb", borderColor: "#f59e0b" }}
        />
      );
    }

    // Handle disabled fields (invoiceDate, customerName, customerAddress, finalAmount)
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

    switch (field.type) {
      case "select":
        return (
          <select
            value={value}
            onChange={(e) => handleInputChange(field.key, e.target.value)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 max-h-32 overflow-y-auto ${
              error ? "border-red-500" : "border-gray-300"
            }`}
            disabled={fieldOptions.length === 0}
          >
            <option value="">
              {fieldOptions.length === 0
                ? "Loading..."
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
              onBlur={(e) => {
                if (field.key === "invoiceNumber") {
                  handleInvoiceNumberChange(e.target.value);
                }
              }}
              placeholder={`Enter ${field.label}`}
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${
                error ? "border-red-500" : "border-gray-300"
              }`}
            />

            {field.key === "invoiceNumber" && (
              <>
                {isFetchingSales && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3">
                    <div className="flex items-center gap-2 text-gray-600">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                      Searching for sales data...
                    </div>
                  </div>
                )}
                {saleSuggestions.length > 0 && !isFetchingSales && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 text-xs text-gray-500 bg-gray-50 border-b">
                      Found {saleSuggestions.length} matching sale(s)
                    </div>
                    {saleSuggestions.map((sale, index) => (
                      <div
                        key={index}
                        className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                        onClick={() => handleSelectSaleSuggestion(sale)}
                      >
                        <div className="font-medium text-gray-900">
                          {sale.invoiceNumber}
                        </div>
                        <div className="text-sm text-gray-600">
                          {sale.customerName}
                        </div>
                        <div className="text-xs text-gray-500">
                          {sale.customerAddress}
                        </div>
                        {sale.amount && (
                          <div className="text-xs text-green-600 font-medium">
                            Amount: ₹{sale.amount}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
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
            {currentConfig.fields.map((field) => {
              const fieldElement = renderFormField(field);

              if (!fieldElement) {
                return null;
              }

              // Special handling for source and destination to put them in one row when both are visible
              if (field.key === "source" || field.key === "destination") {
                const showDestination = shouldShowDestinationField();

                // If both fields should be shown, render them in one row
                if (showDestination) {
                  if (field.key === "source") {
                    return (
                      <div
                        key="source-destination-row"
                        className="md:col-span-2"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Source Field */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Source Account
                              <span className="text-red-500 ml-1">*</span>
                            </label>
                            {renderFormField(
                              currentConfig.fields.find(
                                (f) => f.key === "source"
                              )
                            )}
                            {errors.source && (
                              <p className="text-red-500 text-xs mt-1">
                                {errors.source}
                              </p>
                            )}
                          </div>

                          {/* Destination Field */}
                          <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">
                              Destination Account
                              {shouldShowDestinationField() && (
                                <span className="text-red-500 ml-1">*</span>
                              )}
                            </label>
                            {renderFormField(
                              currentConfig.fields.find(
                                (f) => f.key === "destination"
                              )
                            )}
                            {errors.destination && (
                              <p className="text-red-500 text-xs mt-1">
                                {errors.destination}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  // Skip rendering destination field separately since it's already handled above
                  return null;
                }

                // If only source should be shown, render it normally
                if (field.key === "source") {
                  return (
                    <div key={field.key} className="space-y-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {field.label}
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      {fieldElement}
                      {errors[field.key] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[field.key]}
                        </p>
                      )}
                    </div>
                  );
                }
              }

              // Special handling for amount, exchange loss, and final amount
              if (
                field.key === "amount" ||
                field.key === "exchangeLoss" ||
                field.key === "finalAmount"
              ) {
                const showExchangeLoss = shouldShowExchangeLossField();

                if (field.key === "amount") {
                  return (
                    <div key={field.key} className="space-y-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {field.label}
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      {fieldElement}
                      {errors[field.key] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[field.key]}
                        </p>
                      )}
                    </div>
                  );
                }

                if (field.key === "exchangeLoss" && showExchangeLoss) {
                  return (
                    <div key={field.key} className="space-y-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {field.label}
                      </label>
                      {fieldElement}
                      {errors[field.key] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[field.key]}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        Enter exchange loss amount (will be subtracted from
                        original amount)
                      </p>
                    </div>
                  );
                }

                if (field.key === "finalAmount" && showExchangeLoss) {
                  return (
                    <div key={field.key} className="space-y-2 md:col-span-1">
                      <label className="block text-sm font-medium text-gray-700">
                        {field.label}
                        <span className="text-red-500 ml-1">*</span>
                      </label>
                      {fieldElement}
                      {errors[field.key] && (
                        <p className="text-red-500 text-xs mt-1">
                          {errors[field.key]}
                        </p>
                      )}
                      <p className="text-xs text-green-600 font-medium">
                        Final Amount = Amount - Exchange Loss
                      </p>
                    </div>
                  );
                }

                // Skip final amount if exchange loss shouldn't be shown
                if (field.key === "finalAmount" && !showExchangeLoss) {
                  return null;
                }
              }

              // Normal field rendering for all other fields
              return (
                <div
                  key={field.key}
                  className={`space-y-2 ${
                    field.key === "categoryType" ? "md:col-span-1" : ""
                  } ${
                    field.key === "balanceAmount"
                      ? "md:col-span-2 bg-yellow-50 p-4 rounded-lg border-2 border-yellow-200"
                      : ""
                  }`}
                >
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                    {field.required && !field.readonly && !field.disabled && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                    {field.readonly && (
                      <span className="text-yellow-600 ml-1">(Read Only)</span>
                    )}
                    {field.disabled && (
                      <span className="text-gray-500 ml-1">(Auto-filled)</span>
                    )}
                  </label>

                  {field.key === "categoryType" ? (
                    <div className="max-h-32 overflow-y-auto">
                      {fieldElement}
                    </div>
                  ) : (
                    fieldElement
                  )}

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
                categoryOptions.length === 0 ||
                sourceOptions.length === 0 ||
                destinationOptions.length === 0
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
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [data, setData] = useState({});
  const [selected, setSelected] = useState([]);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [viewingTransaction, setViewingTransaction] = useState(null);

  // Fetch dropdown options from backend
  const {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    loading: optionsLoading,
    error: optionsError,
  } = useDropdownOptions();

  const currentConfig = accountConfig[activeTab];
  const currentData = data[activeTab] || [];
  // Dynamically generate table columns
  const currentTableColumns = useMemo(
    () => generateTableColumns(currentConfig.fields),
    [currentConfig]
  );

  // Filter data based on search term
  const filteredData = currentData.filter((item) => {
    return currentConfig.searchFields.some((field) =>
      item[field]?.toString().toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const paginatedData = filteredData.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalAmount = filteredData.reduce(
    (sum, item) => sum + (item.amount || 0),
    0
  );
  const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

  // Handle adding new transaction
  const handleAddTransaction = (transactionData, isEdit = false) => {
    if (isEdit && editingTransaction) {
      // Update existing transaction
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].map((item) =>
          item.id === editingTransaction.id
            ? { ...transactionData, id: editingTransaction.id }
            : item
        ),
      }));
    } else {
      // Add new transaction
      setData((prev) => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] || []), transactionData],
      }));
    }
  };

  // Handle view transaction
  const handleView = (transaction) => {
    setViewingTransaction(transaction);
    setIsViewModalOpen(true);
  };

  // Handle edit transaction
  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };

  // Handle delete transaction
  const handleDelete = (transaction) => {
    if (window.confirm(`Are you sure you want to delete this transaction?`)) {
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].filter(
          (item) => item.id !== transaction.id
        ),
      }));
    }
  };

  // Handle delete selected transactions
  const handleDeleteSelected = () => {
    if (selected.length === 0) return;

    if (
      window.confirm(
        `Are you sure you want to delete ${selected.length} selected transactions?`
      )
    ) {
      setData((prev) => ({
        ...prev,
        [activeTab]: prev[activeTab].filter(
          (item) => !selected.includes(item.id)
        ),
      }));
      setSelected([]);
    }
  };

  // Handle selection
  const toggleSelect = (item) => {
    setSelected((prev) => {
      return prev.some((s) => s === item.id)
        ? prev.filter((s) => s !== item.id)
        : [...prev, item.id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(paginatedData.map((r) => r.id));
    } else {
      setSelected([]);
    }
  };

  // Helper function to get label from value
  const getLabelFromValue = (value, options) => {
    const option = options.find((opt) => opt.value === value);
    return option ? option.label : value;
  };

  // Format display values for table
  const formatDisplayValue = (field, value) => {
    if (field.dbName === "categoryType") {
      return getLabelFromValue(value, categoryOptions);
    } else if (field.dbName === "source") {
      return getLabelFromValue(value, sourceOptions);
    } else if (field.dbName === "destination") {
      return getLabelFromValue(value, destinationOptions);
    }
    return value;
  };

  // Render cell content based on field type
  const renderCellContent = (item, field) => {
    const value = item[field.dbName];

    if (field.id === "actions") {
      return (
        <div className="flex items-center justify-center gap-3 min-w-[150px]">
          <button
            className="text-blue-600 hover:text-blue-800 cursor-pointer"
            title="View"
            onClick={() => handleView(item)}
          >
            <Eye size={18} />
          </button>
          <button
            className="text-green-600 hover:text-green-800 cursor-pointer"
            title="Edit"
            onClick={() => handleEdit(item)}
          >
            <Edit size={18} />
          </button>
          <button
            view
            className="text-red-600 hover:text-red-800 cursor-pointer"
            title="Delete"
            onClick={() => handleDelete(item)}
          >
            <Trash2 size={18} />
          </button>
        </div>
      );
    }

    if (field.dbName === "amount" || field.dbName === "balance") {
      return (
        <span
          className={`font-medium ${
            value >= 0 ? "text-green-700" : "text-red-600"
          }`}
        >
          {value >= 0 ? "+" : ""}₹{Math.abs(value).toFixed(2)}
        </span>
      );
    }

    if (field.dbName === "date" || field.dbName === "invoiceDate") {
      return new Date(value).toLocaleDateString();
    }

    if (
      field.dbName === "categoryType" ||
      field.dbName === "source" ||
      field.dbName === "destination"
    ) {
      const displayValue = formatDisplayValue(field, value);
      const colorClass =
        field.dbName === "categoryType"
          ? "bg-blue-50 text-blue-700"
          : field.dbName === "source"
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

    return formatDisplayValue(field, value) || "--";
  };

  // Export functionality
  const handleExport = async () => {
    setExportLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const csvContent = [
      currentTableColumns.map((field) => field.name).join(","),
      ...filteredData.map((item) =>
        currentTableColumns
          .map((field) => {
            const value = item[field.dbName];
            if (field.dbName === "amount" || field.dbName === "balance") {
              return `"${value >= 0 ? "+" : ""}₹${Math.abs(value).toFixed(2)}"`;
            }
            if (
              field.dbName === "categoryType" ||
              field.dbName === "source" ||
              field.dbName === "destination"
            ) {
              return `"${formatDisplayValue(field, value)}"`;
            }
            return `"${value}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab.replace(/\s+/g, "_")}_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportLoading(false);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="mb-4 text-gray-600 text-sm">
          Dashboard <span className="mx-2">{">"}</span> Cash & Bank
        </div>

        {/* Show loading state */}
        {optionsLoading && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-blue-700">Loading transaction data...</span>
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
                sourceOptions.length === 0 ||
                destinationOptions.length === 0
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
            disabled={exportLoading}
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
            {Object.keys(accountConfig).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  setCurrentPage(1);
                  setSearchTerm("");
                  setSelected([]);
                }}
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
                {filteredData.length}
              </span>
            </p>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
              />
              <input
                type="text"
                placeholder={currentConfig.placeholder}
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
                  ${totalAmount.toFixed(2)}
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
                {currentTableColumns
                  .filter((field) => field.id !== "actions")
                  .map((field) => (
                    <th
                      key={field.id}
                      className="p-3 whitespace-nowrap min-w-[120px]"
                    >
                      {field.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {paginatedData.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all transactions"
                              checked={
                                selected.length === paginatedData.length &&
                                paginatedData.length > 0
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
                <th className="p-3 whitespace-nowrap min-w-[150px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentTableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No transactions found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % ITEMS_PER_PAGE === 0 ||
                      index + 1 === paginatedData.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {currentTableColumns
                      .filter((field) => field.id !== "actions")
                      .map((field) => (
                        <td
                          key={field.id}
                          className="p-3 whitespace-nowrap min-w-[120px]"
                        >
                          {field.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              <input
                                type="checkbox"
                                checked={selected.includes(item.id)}
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
                    <td className="p-3 whitespace-nowrap min-w-[150px]">
                      {renderCellContent(
                        item,
                        currentTableColumns.find(
                          (field) => field.id === "actions"
                        )
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {paginatedData.length > 0 && (
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

        {/* Add Transaction Modal */}
        <AddTransactionModal
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
