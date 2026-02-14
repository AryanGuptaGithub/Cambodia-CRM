import React, { useState, useEffect, useRef } from "react";
import {
  UserPlus,
  Trash2,
  Edit,
  X,
  Search,
  ChevronDown,
  ChevronUp,
  Calendar,
  AlertCircle,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { formatDateToReadable } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom Dropdown Component
const CustomDropdown = ({
  value,
  onChange,
  options,
  error,
  disabled,
  placeholder,
}) => {
  return (
    <select
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
        disabled ? "bg-gray-100 cursor-not-allowed" : ""
      } ${error ? "border-red-500" : ""}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

// Custom hook for dropdown options
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
      setLoading(true);

      // Fetch category options
      const categoryResponse = await axios.get(
        `${backendUrl}/api/accounts/category-type`
      );
      // Access the 'data' property from the response
      const categories = categoryResponse.data?.data || [];
      if (!Array.isArray(categories)) {
        throw new Error("Invalid category response format");
      }
      setCategoryOptions(
        categories.map((cat) => ({
          value: cat._id,
          label: cat.name,
        }))
      );

      // Fetch destination options (used as source for payments out)
      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );
      const destinations = destinationResponse.data?.data || [];
      if (!Array.isArray(destinations)) {
        throw new Error("Invalid destination response format");
      }
      const destOptions = destinations.map((dest) => ({
        value: dest._id,
        label: dest.name,
        totalAmount: dest.totalAmount || 0,
      }));
      setDestinationOptions(destOptions);
      setSourceOptions(destOptions);

      // Fetch supplier options
      const supplierResponse = await axios.get(`${backendUrl}/api/suppliers`);
      // Handle different possible response structures
      let suppliers = [];
      if (supplierResponse.data && Array.isArray(supplierResponse.data)) {
        suppliers = supplierResponse.data;
      } else if (
        supplierResponse.data &&
        supplierResponse.data.data &&
        Array.isArray(supplierResponse.data.data)
      ) {
        suppliers = supplierResponse.data.data;
      } else if (
        supplierResponse.data &&
        Array.isArray(supplierResponse.data.suppliers)
      ) {
        suppliers = supplierResponse.data.suppliers;
      } else {
        throw new Error("Invalid supplier response format");
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

const PurchaseOut = () => {
  const [payments, setPayments] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showInvoiceSuggestions, setShowInvoiceSuggestions] = useState(false);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [paymentDate, setPaymentDate] = useState(null);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [isInvoicesEmpty, setIsInvoicesEmpty] = useState(false);
  const [amountError, setAmountError] = useState("");
  const inputRef = useRef(null);

  // New state variables for amount tracking
  const [availableAmount, setAvailableAmount] = useState(0);
  const [afterPaymentAmount, setAfterPaymentAmount] = useState(0);

  // Use the custom hook for dropdown options
  const {
    sourceOptions: bankOptions,
    loading: optionsLoading,
    refetch: refetchBankOptions,
  } = useDropdownOptions();

  const [newPayment, setNewPayment] = useState({
    paymentDate: "",
    invoiceNo: "",
    invoiceDate: "",
    supplierName: "",
    amount: "",
    invoiceAmount: "",
    bank: "",
    remarks: "",
  });

  const paymentsPerPage = 10;

  // Fetch payments, suppliers and invoices data
  useEffect(() => {
    fetchPayments();
    fetchSuppliers();
    fetchInvoices();
  }, []);

  // Update filtered invoices when invoices data changes
  useEffect(() => {
    setFilteredInvoices(invoices);
  }, [invoices]);

  const fetchPayments = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/purchase-out`);
      // Assuming backend returns array directly; adjust if needed
      setPayments(response.data || []);
    } catch (error) {
      console.error("Error fetching payments:", error);
      showToast("error", "Failed to fetch payments");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      // Handle nested data if present
      let suppliersData = response.data;
      if (response.data?.data && Array.isArray(response.data.data)) {
        suppliersData = response.data.data;
      } else if (response.data?.suppliers && Array.isArray(response.data.suppliers)) {
        suppliersData = response.data.suppliers;
      }
      setSuppliers(suppliersData || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      showToast("error", "Failed to fetch suppliers");
    }
  };

  const fetchInvoices = async () => {
    try {
      setInvoicesLoading(true);
      const response = await axios.get(`${backendUrl}/api/purchase/invoice`);
      // Assuming backend returns array directly; adjust if needed
      const invoicesData = response.data?.data || response.data || [];
      setInvoices(invoicesData);

      if (invoicesData.length === 0) {
        setIsInvoicesEmpty(true);
      } else {
        setIsInvoicesEmpty(false);
      }
    } catch (error) {
      console.error("Error fetching invoices:", error);
      showToast("error", "Failed to fetch invoices");
      setIsInvoicesEmpty(true);
    } finally {
      setInvoicesLoading(false);
    }
  };

  // Fetch fresh bank data to get updated amounts
  const fetchFreshBankData = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/accounts/destinations`
      );
      const freshBanks = (response.data?.data || []).map((bank) => ({
        value: bank._id,
        label: bank.name,
        totalAmount: bank.totalAmount || 0,
      }));
      return freshBanks;
    } catch (error) {
      console.error("Error fetching fresh bank data:", error);
      return bankOptions; // Return existing options if fetch fails
    }
  };

  // Filter invoices based on search input
  const filterInvoices = (searchValue) => {
    if (!searchValue.trim()) {
      setFilteredInvoices(invoices);
      return;
    }

    const filtered = invoices.filter(
      (invoice) =>
        invoice.invoiceNumber
          ?.toLowerCase()
          .includes(searchValue.toLowerCase()) ||
        invoice.supplierName?.toLowerCase().includes(searchValue.toLowerCase())
    );
    setFilteredInvoices(filtered);
  };

  // Format number to 2 decimal places
  const formatToTwoDecimals = (value) => {
    if (value === "" || value === null || value === undefined) return "";
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  // Validate if paid amount exceeds invoice amount and bank balance
  const validateAmount = (amount, invoiceAmount) => {
    let errors = [];

    if (amount && invoiceAmount) {
      const paidAmount = parseFloat(amount);
      const invAmount = parseFloat(invoiceAmount);

      if (paidAmount > invAmount) {
        errors.push("Paid amount cannot exceed invoice amount");
      }
    }

    // Check if paid amount exceeds available bank amount
    if (amount && availableAmount > 0) {
      const paidAmount = parseFloat(amount);
      if (paidAmount > availableAmount) {
        errors.push("Paid amount cannot exceed available bank amount");
      }
    }

    if (errors.length > 0) {
      setAmountError(errors.join(" and "));
      return false;
    } else {
      setAmountError("");
      return true;
    }
  };

  // Update the handleBankChange function to calculate available amount with fresh data
  const handleBankChange = async (value) => {
    try {
      // Fetch fresh bank data to ensure we have the latest amounts
      const freshBanks = await fetchFreshBankData();
      const selectedBank = freshBanks.find((bank) => bank.value === value);
      const bankAmount = selectedBank?.totalAmount || 0;

      setAvailableAmount(bankAmount);

      // Calculate after payment amount when bank changes
      if (newPayment.amount) {
        const paidAmount = parseFloat(newPayment.amount) || 0;
        const remaining = bankAmount - paidAmount;
        setAfterPaymentAmount(remaining >= 0 ? remaining : 0);
      } else {
        setAfterPaymentAmount(bankAmount);
      }

      setNewPayment((prev) => ({
        ...prev,
        bank: value,
      }));
    } catch (error) {
      console.error("Error handling bank change:", error);
      // Fallback to existing bank options if fresh fetch fails
      const selectedBank = bankOptions.find((bank) => bank.value === value);
      const bankAmount = selectedBank?.totalAmount || 0;

      setAvailableAmount(bankAmount);
      setAfterPaymentAmount(bankAmount);
      setNewPayment((prev) => ({
        ...prev,
        bank: value,
      }));
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Handle numeric inputs (amount + invoiceAmount)
    if (name === "amount" || name === "invoiceAmount") {
      if (value === "" || /^\d*\.?\d*$/.test(value)) {
        setNewPayment((prev) => ({
          ...prev,
          [name]: value,
        }));

        if (name === "amount") {
          validateAmount(value, newPayment.invoiceAmount);

          // Update after payment amount when paid amount changes
          const paidAmount = parseFloat(value) || 0;
          const remaining = availableAmount - paidAmount;
          setAfterPaymentAmount(remaining >= 0 ? remaining : 0);
        }
      }
    } else {
      setNewPayment((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // When invoice number changes
    if (name === "invoiceNo") {
      setShowInvoiceSuggestions(true);
      filterInvoices(value);

      if (value) {
        const selectedInvoice = invoices.find(
          (inv) => inv.invoiceNumber?.toLowerCase() === value.toLowerCase()
        );

        if (selectedInvoice) {
          const invAmount = formatToTwoDecimals(selectedInvoice.totalAmount);

          // Set values from invoice
          setNewPayment((prev) => ({
            ...prev,
            invoiceDate: selectedInvoice.invoiceDate || "",
            supplierName: selectedInvoice.supplierName || "",
            invoiceAmount: invAmount,
          }));

          validateAmount(newPayment.amount, invAmount);
        } else {
          // Clear if invoice not found
          setNewPayment((prev) => ({
            ...prev,
            invoiceDate: "",
            supplierName: "",
            invoiceAmount: "",
          }));
          setAmountError("");
        }
      }
    }
  };

  // Handle invoice selection from suggestions
  const handleInvoiceSelect = (invoice) => {
    const invoiceAmount = formatToTwoDecimals(invoice.totalAmount || "");

    setNewPayment({
      ...newPayment,
      invoiceNo: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate || "",
      supplierName: invoice.supplierName || "",
      invoiceAmount: invoiceAmount,
      amount: "", // Reset paid amount when invoice changes
    });

    // Validate amount with new invoice amount
    validateAmount("", invoiceAmount);
    setShowInvoiceSuggestions(false);
  };

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".invoice-suggestions-container")) {
        setShowInvoiceSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter payments by search term - Updated to search sourceBank
  const filteredPayments = payments.filter((p) => {
    if (searchTerm.trim() === "") return true;

    const lowerSearch = searchTerm.toLowerCase();
    return (
      p.paymentDate?.toLowerCase().includes(lowerSearch) ||
      p.invoiceNo?.toLowerCase().includes(lowerSearch) ||
      p.supplierName?.toLowerCase().includes(lowerSearch) ||
      (p.sourceBank && p.sourceBank.toLowerCase().includes(lowerSearch)) || // Search by sourceBank name
      p.remarks?.toLowerCase().includes(lowerSearch)
    );
  });

  // Pagination calculations
  const indexOfLastPayment = currentPage * paymentsPerPage;
  const indexOfFirstPayment = indexOfLastPayment - paymentsPerPage;
  const currentPayments = filteredPayments.slice(
    indexOfFirstPayment,
    indexOfLastPayment
  );
  const totalPages = Math.ceil(filteredPayments.length / paymentsPerPage);

  // Toggle checkbox select of one row
  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  // Select/Deselect all on current page
  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentPayments.map((p) => p._id || p.id));
    } else {
      setSelected([]);
    }
  };

  // Delete selected payments
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> payment(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        // Delete from backend
        await Promise.all(
          selected.map((id) =>
            axios.delete(`${backendUrl}/api/purchase-out/${id}`)
          )
        );
        // Update local state
        setPayments((prev) =>
          prev.filter((p) => !selected.includes(p._id || p.id))
        );
        setSelected([]);
        // Refresh bank options to get updated amounts
        await refetchBankOptions();
        showToast(
          "success",
          `${selected.length} payment(s) deleted successfully`
        );
      } catch (error) {
        console.error("Error deleting payments:", error);
        showToast("error", "Failed to delete payments");
      }
    }
  };

  // Reset selection and page when search changes
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  // Handle Enter key press for search
  const handleSearchKeyPress = (e) => {
    if (e.key === "Enter") {
      setCurrentPage(1);
    }
  };

  // Open modal for new payment - Fetch fresh bank data when modal opens
  const handleAddNewPayment = async () => {
    setNewPayment({
      paymentDate: "",
      invoiceNo: "",
      invoiceDate: "",
      supplierName: "",
      amount: "",
      invoiceAmount: "",
      bank: "",
      remarks: "",
    });
    setPaymentDate(null); // Reset date picker
    setFilteredInvoices(invoices);
    setAmountError(""); // Reset amount error
    setAvailableAmount(0);
    setAfterPaymentAmount(0);

    // Fetch fresh bank data to ensure we have latest amounts
    try {
      await refetchBankOptions();
    } catch (error) {
      console.error("Error refreshing bank options:", error);
    }

    setIsModalOpen(true);
  };

  // Handle payment date change - PREVENT FUTURE DATES
  const handlePaymentDateChange = (date) => {
    // Prevent future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day for accurate comparison

    if (date && date > today) {
      showToast("error", "Payment date cannot be in the future");
      return;
    }

    setPaymentDate(date);
    const formattedDate = date ? date.toISOString().split("T")[0] : "";
    setNewPayment((prev) => ({
      ...prev,
      paymentDate: formattedDate,
    }));
  };

  // Submit new payment
  const handleSubmitPayment = async (e) => {
    e.preventDefault();

    // Check if invoices are empty
    if (isInvoicesEmpty) {
      showToast(
        "error",
        "Cannot add payment. No invoices available. Please add at least one invoice first."
      );
      return;
    }

    // Validate required fields
    if (
      !newPayment.paymentDate ||
      !newPayment.invoiceNo ||
      !newPayment.supplierName ||
      !newPayment.amount ||
      !newPayment.invoiceAmount ||
      !newPayment.bank
    ) {
      showToast("warning", "Please fill in all required fields");
      return;
    }

    // Validate payment date is not in future
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(newPayment.paymentDate);
    if (selectedDate > today) {
      showToast("error", "Payment date cannot be in the future");
      return;
    }

    // Validate amount
    if (!validateAmount(newPayment.amount, newPayment.invoiceAmount)) {
      showToast("warning", amountError);
      return;
    }

    // Additional validation for bank balance
    const paidAmount = parseFloat(newPayment.amount);
    if (paidAmount > availableAmount) {
      showToast("error", "Paid amount exceeds available bank balance");
      return;
    }

    setLoading(true);

    try {
      const paymentToAdd = {
        paymentDate: newPayment.paymentDate,
        invoiceNo: newPayment.invoiceNo,
        invoiceDate: newPayment.invoiceDate,
        supplierName: newPayment.supplierName,
        amount: parseFloat(newPayment.amount),
        invoiceAmount: parseFloat(newPayment.invoiceAmount),
        bank: newPayment.bank,
        remarks: newPayment.remarks,
      };

      const response = await axios.post(
        `${backendUrl}/api/purchase-out`,
        paymentToAdd
      );

      if (response.status === 200 || response.status === 201) {
        // Refresh payments from server to get the actual data with _id
        await fetchPayments();
        // Refresh bank options to get updated amounts
        await refetchBankOptions();

        setIsModalOpen(false);
        setNewPayment({
          paymentDate: "",
          invoiceNo: "",
          invoiceDate: "",
          supplierName: "",
          amount: "",
          invoiceAmount: "",
          bank: "",
          remarks: "",
        });
        setPaymentDate(null); // Reset date picker
        setShowInvoiceSuggestions(false);
        setAmountError(""); // Reset amount error
        setAvailableAmount(0);
        setAfterPaymentAmount(0);
        showToast("success", "Payment added successfully");
      }
    } catch (error) {
      console.error("Error adding payment:", error);

      // Show specific error message from backend if available
      const errorMessage =
        error.response?.data?.message || "Failed to add payment";
      showToast("error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNewPayment({
      paymentDate: "",
      invoiceNo: "",
      invoiceDate: "",
      supplierName: "",
      amount: "",
      invoiceAmount: "",
      bank: "",
      remarks: "",
    });
    setPaymentDate(null); // Reset date picker
    setShowInvoiceSuggestions(false);
    setAmountError(""); // Reset amount error
    setAvailableAmount(0);
    setAfterPaymentAmount(0);
  };

  // Format currency with 2 decimal places
  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return "$0.00";
    const num = parseFloat(amount);
    return `$${
      isNaN(num)
        ? "0.00"
        : num.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
    }`;
  };

  // Format display amount for input fields (shows 2 decimal places)
  const formatDisplayAmount = (amount) => {
    if (amount === "" || amount === null || amount === undefined) return "";
    const num = parseFloat(amount);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toISOString().split("T")[0];
    } catch (error) {
      return dateString;
    }
  };

  // Check if form is disabled due to empty invoices
  const isFormDisabled = isInvoicesEmpty;

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:bg-indigo-400 disabled:cursor-not-allowed"
              onClick={handleAddNewPayment}
              disabled={isInvoicesEmpty}
            >
              <UserPlus size={18} /> Add New Payment Out
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
          {payments.length > 0 && (
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={() => inputRef.current?.focus()}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search payment date, invoice no, supplier, source account..."
                value={searchTerm}
                onChange={handleSearchChange}
                onKeyPress={handleSearchKeyPress}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        {/* Warning message if invoices list is empty */}
        {isInvoicesEmpty && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  No Invoices Available
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    You need to add at least one invoice before creating
                    payments. Add invoices in the purchase invoice section.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b sticky top-0 z-10">
              <tr>
                {/* Remove checkbox column header when there are no payments */}
                {currentPayments.length > 0 && (
                  <th className="p-3 text-center bg-gray-100 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentPayments.length &&
                        currentPayments.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      autoComplete="off"
                    />
                  </th>
                )}
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice No
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Payment Date
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice Date
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Supplier Name
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Invoice Amount($)
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Paid Amount($)
                </th>
                <th className="p-3 bg-gray-100 text-sm font-medium">
                  Source Account
                </th>

                <th className="p-3 bg-gray-100 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentPayments.length === 0 ? (
                <tr>
                  {/* Adjust colspan based on whether checkbox column is present */}
                  <td
                    colSpan={currentPayments.length > 0 ? 10 : 9}
                    className="p-4 text-center text-gray-500"
                  >
                    {searchTerm
                      ? "No payments match your search."
                      : "No payments found."}
                  </td>
                </tr>
              ) : (
                currentPayments.map((payment, index) => (
                  <tr
                    key={payment._id || payment.id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % paymentsPerPage === 0 ||
                      index + 1 === currentPayments.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    {/* Only show checkbox column when there are payments */}
                    {currentPayments.length > 0 && (
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.includes(payment._id || payment.id)}
                          onChange={() =>
                            toggleSelect(payment._id || payment.id)
                          }
                          autoComplete="off"
                        />
                      </td>
                    )}
                    <td className="p-3">{payment.invoiceNo}</td>
                    <td className="p-3">
                      {formatDateToReadable(payment.paymentDate)}
                    </td>
                    <td className="p-3">
                      {formatDateToReadable(payment.invoiceDate)}
                    </td>
                    <td className="p-3">{payment.supplierName}</td>
                    <td className="p-3 font-medium">{payment.invoiceAmount}</td>
                    <td className="p-3 font-semibold">
                      {payment.paidAmount || payment.amount}
                    </td>
                    <td className="p-3">
                      {payment.sourceBank || payment.bankName || "N/A"}
                    </td>

                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => {
                          setNewPayment({
                            paymentDate: payment.paymentDate,
                            invoiceNo: payment.invoiceNo,
                            invoiceDate: payment.invoiceDate,
                            supplierName: payment.supplierName,
                            amount: formatDisplayAmount(
                              payment.paidAmount || payment.amount
                            ),
                            invoiceAmount: formatDisplayAmount(
                              payment.invoiceAmount
                            ),
                            bank: payment.bank,
                            remarks: payment.remarks,
                          });
                          // Set the date picker value when editing
                          setPaymentDate(
                            payment.paymentDate
                              ? new Date(payment.paymentDate)
                              : null
                          );
                          setIsModalOpen(true);
                        }}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={async () => {
                          const confirm = await confirmDialog({
                            text: `Are you sure you want to delete payment <b>${payment.invoiceNo}</b>?`,
                            icon: "warning",
                            confirmButtonText: "Yes, delete",
                            cancelButtonText: "Cancel",
                          });

                          if (confirm.isConfirmed) {
                            try {
                              await axios.delete(
                                `${backendUrl}/api/purchase-out/${
                                  payment._id || payment.id
                                }`
                              );
                              setPayments((prev) =>
                                prev.filter(
                                  (p) =>
                                    (p._id || p.id) !==
                                    (payment._id || payment.id)
                                )
                              );
                              setSelected((prev) =>
                                prev.filter(
                                  (id) => id !== (payment._id || payment.id)
                                )
                              );
                              // Refresh bank options after delete
                              await refetchBankOptions();
                              showToast(
                                "success",
                                "Payment deleted successfully"
                              );
                            } catch (error) {
                              console.error("Error deleting payment:", error);
                              showToast("error", "Failed to delete payment");
                            }
                          }
                        }}
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Pagination */}
          {currentPayments.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2 bg-white">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                (page) => (
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

        {/* Add New Payment Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <div
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-800">
                  Add New Payment Out
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={loading}
                >
                  <X size={24} />
                </button>
              </div>

              <form
                onSubmit={handleSubmitPayment}
                className="p-6"
                autoComplete="off"
              >
                {/* Warning message in modal if invoices are empty */}
                {isInvoicesEmpty && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <svg
                          className="h-5 w-5 text-red-400"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">
                          No Invoices Available
                        </h3>
                        <div className="mt-2 text-sm text-red-700">
                          <p>
                            You need to add at least one invoice before creating
                            payments. Add invoices in the purchase invoice
                            section.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Amount Summary Section - Displayed at the top */}
                {(newPayment.bank || newPayment.amount) && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-blue-800 mb-3">
                      Amount Summary
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {newPayment.bank && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">
                            Available Amount:
                          </span>
                          <span className="text-lg font-bold text-green-600">
                            {formatCurrency(availableAmount)}
                          </span>
                        </div>
                      )}
                      {newPayment.amount && newPayment.bank && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">
                            After Payment Amount:
                          </span>
                          <span
                            className={`text-lg font-bold ${
                              afterPaymentAmount < 0
                                ? "text-red-600"
                                : "text-blue-600"
                            }`}
                          >
                            {formatCurrency(afterPaymentAmount)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {/* Invoice No - Text Input with Suggestions */}
                  <div className="invoice-suggestions-container relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice No <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        name="invoiceNo"
                        value={newPayment.invoiceNo}
                        onChange={handleInputChange}
                        onFocus={() => setShowInvoiceSuggestions(true)}
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                          isInvoicesEmpty
                            ? "bg-gray-100 cursor-not-allowed"
                            : ""
                        }`}
                        placeholder={
                          isInvoicesEmpty
                            ? "No invoices available"
                            : "Enter invoice number"
                        }
                        required
                        autoComplete="off"
                        disabled={isInvoicesEmpty}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() =>
                          setShowInvoiceSuggestions(!showInvoiceSuggestions)
                        }
                        disabled={isInvoicesEmpty}
                      >
                        {showInvoiceSuggestions ? (
                          <ChevronUp size={16} />
                        ) : (
                          <ChevronDown size={16} />
                        )}
                      </button>
                    </div>

                    {/* Invoice Suggestions Dropdown */}
                    {showInvoiceSuggestions && !isInvoicesEmpty && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {invoicesLoading ? (
                          <div className="px-3 py-2 text-gray-500 text-center">
                            Loading invoices...
                          </div>
                        ) : filteredInvoices.length === 0 ? (
                          <div className="px-3 py-2 text-gray-500 text-center">
                            No matching invoices found
                          </div>
                        ) : (
                          filteredInvoices.map((invoice) => (
                            <div
                              key={invoice._id || invoice.id}
                              className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                              onClick={() => handleInvoiceSelect(invoice)}
                            >
                              <div className="font-medium text-gray-800">
                                {invoice.invoiceNumber}
                              </div>
                              <div className="text-sm text-gray-600">
                                {invoice.supplierName} •{" "}
                                {formatDateToReadable(invoice.invoiceDate)} •{" "}
                                {formatCurrency(
                                  invoice.totalAmount || invoice.amount || 0
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Payment Date with DatePicker - FUTURE DATES PREVENTED */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Payment Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <DatePicker
                        selected={paymentDate}
                        onChange={handlePaymentDateChange}
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select payment date"
                        className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 pr-10 ${
                          isInvoicesEmpty
                            ? "bg-gray-100 cursor-not-allowed"
                            : ""
                        }`}
                        required
                        autoComplete="off"
                        showPopperArrow={false}
                        disabled={isInvoicesEmpty}
                        maxDate={new Date()} // Prevent future dates in calendar
                      />
                      <Calendar
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                        size={16}
                      />
                    </div>
                  </div>

                  {/* Invoice Date - Auto-filled and disabled */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Date
                    </label>
                    <input
                      type="text"
                      name="invoiceDate"
                      value={formatDate(newPayment.invoiceDate)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  {/* Supplier Name - Auto-filled and disabled */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Supplier Name
                    </label>
                    <input
                      type="text"
                      name="supplierName"
                      value={newPayment.supplierName}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Amount
                    </label>
                    <input
                      type="text"
                      name="invoiceAmount"
                      value={formatDisplayAmount(newPayment.invoiceAmount)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100 text-gray-600"
                      disabled
                      autoComplete="off"
                    />
                  </div>

                  {/* Source Account Dropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Source Account <span className="text-red-500">*</span>
                    </label>
                    <CustomDropdown
                      value={newPayment.bank}
                      onChange={(e) => handleBankChange(e.target.value)}
                      options={bankOptions}
                      disabled={isInvoicesEmpty || optionsLoading}
                      placeholder={
                        optionsLoading
                          ? "Loading banks..."
                          : "Select Source Account"
                      }
                    />
                  </div>

                  {/* Paid Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Paid Amount <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="amount"
                      value={newPayment.amount}
                      onChange={handleInputChange}
                      className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                        isInvoicesEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                      } ${amountError ? "border-red-500" : ""}`}
                      placeholder="0.00"
                      required
                      autoComplete="off"
                      disabled={isInvoicesEmpty}
                    />

                    {amountError && (
                      <div className="flex items-center mt-1 text-red-600 text-sm">
                        <AlertCircle size={14} className="mr-1" />
                        {amountError}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={newPayment.remarks}
                    onChange={handleInputChange}
                    rows="3"
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-600 ${
                      isInvoicesEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                    }`}
                    placeholder="Additional notes..."
                    autoComplete="off"
                    disabled={isInvoicesEmpty}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 cursor-pointer"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={`px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 cursor-pointer
                     disabled:bg-indigo-400 disabled:cursor-not-allowed ${
                       isInvoicesEmpty || amountError
                         ? "bg-indigo-400 cursor-not-allowed"
                         : ""
                     }`}
                    disabled={loading || isInvoicesEmpty || !!amountError}
                  >
                    {loading ? "Adding..." : "Add Payment"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseOut;