import React, { useState, useEffect, useRef } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  AlertCircle,
} from "lucide-react";
import axios from "axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Reusable dropdown (same as original)
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

const PaymentOutModal = ({
  isOpen,
  onClose,
  onSubmit,
  editingId,
  initialData,
  invoices,
  bankOptions,
  isInvoicesEmpty,
}) => {
  // Form state
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
  const [paymentDate, setPaymentDate] = useState(null);
  const [availableAmount, setAvailableAmount] = useState(0);
  const [afterPaymentAmount, setAfterPaymentAmount] = useState(0);
  const [amountError, setAmountError] = useState("");
  const [showInvoiceSuggestions, setShowInvoiceSuggestions] = useState(false);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  // Update filtered invoices when invoices change
  useEffect(() => {
    setFilteredInvoices(invoices);
  }, [invoices]);

  // Populate form when editing
  useEffect(() => {
    if (editingId && initialData) {
      setNewPayment({
        paymentDate: initialData.paymentDate || "",
        invoiceNo: initialData.invoiceNo || "",
        invoiceDate: initialData.invoiceDate || "",
        supplierName: initialData.supplierName || "",
        amount: formatDisplayAmount(initialData.paidAmount || initialData.amount),
        invoiceAmount: formatDisplayAmount(initialData.invoiceAmount),
        bank: initialData.bank || "",
        remarks: initialData.remarks || "",
      });
      setPaymentDate(
        initialData.paymentDate ? new Date(initialData.paymentDate) : null,
      );
      // Fetch bank amount for the selected bank
      if (initialData.bank) {
        updateBankAmounts(initialData.bank, initialData.paidAmount || initialData.amount);
      }
    } else {
      // Reset for add
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
      setPaymentDate(null);
      setAvailableAmount(0);
      setAfterPaymentAmount(0);
      setAmountError("");
      setShowInvoiceSuggestions(false);
    }
  }, [editingId, initialData]);

  // Fetch fresh bank data for the selected bank
  const fetchFreshBankData = async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      const freshBanks = (response.data?.data || []).map((bank) => ({
        value: bank._id,
        label: bank.name,
        totalAmount: bank.totalAmount || 0,
      }));
      return freshBanks;
    } catch (error) {
      console.error("Error fetching fresh bank data:", error);
      return bankOptions; // fallback
    }
  };

  // Update available and after‑payment amounts
  const updateBankAmounts = async (bankId, paidAmount) => {
    try {
      const freshBanks = await fetchFreshBankData();
      const selectedBank = freshBanks.find((bank) => bank.value === bankId);
      const bankAmount = selectedBank?.totalAmount || 0;
      setAvailableAmount(bankAmount);

      const paid = parseFloat(paidAmount) || 0;
      const remaining = bankAmount - paid;
      setAfterPaymentAmount(remaining >= 0 ? remaining : 0);
    } catch (error) {
      console.error("Error updating bank amounts:", error);
    }
  };

  // Handle bank change
  const handleBankChange = async (value) => {
    setNewPayment((prev) => ({ ...prev, bank: value }));
    await updateBankAmounts(value, newPayment.amount);
  };

  // Formatting helpers
  const formatToTwoDecimals = (value) => {
    if (value === "" || value == null) return "";
    const num = parseFloat(value);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  const formatCurrency = (amount) => {
    if (amount == null) return "$0.00";
    const num = parseFloat(amount);
    return `$${isNaN(num) ? "0.00" : num.toFixed(2)}`;
  };

  const formatDisplayAmount = (amount) => {
    if (amount === "" || amount == null) return "";
    const num = parseFloat(amount);
    return isNaN(num) ? "" : num.toFixed(2);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      return new Date(dateString).toISOString().split("T")[0];
    } catch {
      return dateString;
    }
  };

  // Validation
  const validateAmount = (amount, invoiceAmount) => {
    const errors = [];
    if (amount && invoiceAmount) {
      const paid = parseFloat(amount);
      const inv = parseFloat(invoiceAmount);
      if (paid > inv) errors.push("Paid amount cannot exceed invoice amount");
    }
    if (amount && availableAmount > 0) {
      const paid = parseFloat(amount);
      if (paid > availableAmount)
        errors.push("Paid amount cannot exceed available bank amount");
    }
    if (errors.length > 0) {
      setAmountError(errors.join(" and "));
      return false;
    } else {
      setAmountError("");
      return true;
    }
  };

  // Input change handler
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "amount" || name === "invoiceAmount") {
      if (value === "" || /^\d*\.?\d*$/.test(value)) {
        setNewPayment((prev) => ({ ...prev, [name]: value }));

        if (name === "amount") {
          validateAmount(value, newPayment.invoiceAmount);
          if (newPayment.bank) {
            const paid = parseFloat(value) || 0;
            const remaining = availableAmount - paid;
            setAfterPaymentAmount(remaining >= 0 ? remaining : 0);
          }
        }
      }
    } else {
      setNewPayment((prev) => ({ ...prev, [name]: value }));
    }

    // Invoice number search
    if (name === "invoiceNo") {
      setShowInvoiceSuggestions(true);
      filterInvoices(value);

      const selectedInvoice = invoices.find(
        (inv) =>
          inv.invoiceNumber?.toLowerCase() === value.toLowerCase(),
      );

      if (selectedInvoice) {
        const invAmount = formatToTwoDecimals(selectedInvoice.totalAmount);
        setNewPayment((prev) => ({
          ...prev,
          invoiceDate: selectedInvoice.invoiceDate || "",
          supplierName: selectedInvoice.supplierName || "",
          invoiceAmount: invAmount,
        }));
        validateAmount(newPayment.amount, invAmount);
      } else {
        setNewPayment((prev) => ({
          ...prev,
          invoiceDate: "",
          supplierName: "",
          invoiceAmount: "",
        }));
        setAmountError("");
      }
    }
  };

  // Filter invoices for suggestions
  const filterInvoices = (searchValue) => {
    if (!searchValue.trim()) {
      setFilteredInvoices(invoices);
      return;
    }
    const filtered = invoices.filter(
      (inv) =>
        inv.invoiceNumber?.toLowerCase().includes(searchValue.toLowerCase()) ||
        inv.supplierName?.toLowerCase().includes(searchValue.toLowerCase()),
    );
    setFilteredInvoices(filtered);
  };

  // Select invoice from dropdown
  const handleInvoiceSelect = (invoice) => {
    const invoiceAmount = formatToTwoDecimals(invoice.totalAmount || "");
    setNewPayment({
      ...newPayment,
      invoiceNo: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate || "",
      supplierName: invoice.supplierName || "",
      invoiceAmount: invoiceAmount,
      amount: "",
    });
    validateAmount("", invoiceAmount);
    setShowInvoiceSuggestions(false);
  };

  // Date change handler (prevent future dates)
  const handlePaymentDateChange = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date && date > today) {
      showToast("error", "Payment date cannot be in the future");
      return;
    }
    setPaymentDate(date);
    const formattedDate = date ? date.toISOString().split("T")[0] : "";
    setNewPayment((prev) => ({ ...prev, paymentDate: formattedDate }));
  };

  // Form submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isInvoicesEmpty) {
      showToast(
        "error",
        "Cannot add payment. No invoices available. Please add at least one invoice first.",
      );
      return;
    }

    // Required fields
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

    // Future date check
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(newPayment.paymentDate);
    if (selectedDate > today) {
      showToast("error", "Payment date cannot be in the future");
      return;
    }

    // Amount validation
    if (!validateAmount(newPayment.amount, newPayment.invoiceAmount)) {
      showToast("warning", amountError);
      return;
    }

    const paidAmount = parseFloat(newPayment.amount);
    if (paidAmount > availableAmount) {
      showToast("error", "Paid amount exceeds available bank balance");
      return;
    }

    setLoading(true);

    const paymentData = {
      paymentDate: newPayment.paymentDate,
      invoiceNo: newPayment.invoiceNo,
      invoiceDate: newPayment.invoiceDate,
      supplierName: newPayment.supplierName,
      amount: paidAmount,
      invoiceAmount: parseFloat(newPayment.invoiceAmount),
      bank: newPayment.bank,
      remarks: newPayment.remarks,
    };

    try {
      await onSubmit(paymentData, editingId);
      // onClose will be called by parent after successful submit
    } catch (error) {
      // Error already shown by parent, just stop loading
      console.error("Submit failed", error);
    } finally {
      setLoading(false);
    }
  };

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest(".invoice-suggestions-container")) {
        setShowInvoiceSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            {editingId ? "Edit Payment Out" : "Add New Payment Out"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 cursor-pointer"
            disabled={loading}
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6" autoComplete="off">
          {/* Warning if no invoices */}
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

          {/* Amount Summary */}
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
                        afterPaymentAmount < 0 ? "text-red-600" : "text-blue-600"
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
            {/* Invoice No with suggestions */}
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
                    isInvoicesEmpty ? "bg-gray-100 cursor-not-allowed" : ""
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

              {showInvoiceSuggestions && !isInvoicesEmpty && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredInvoices.length === 0 ? (
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
                            invoice.totalAmount || invoice.amount || 0,
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Payment Date */}
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
                    isInvoicesEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                  }`}
                  required
                  autoComplete="off"
                  showPopperArrow={false}
                  disabled={isInvoicesEmpty}
                  maxDate={new Date()}
                />
                <Calendar
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={16}
                />
              </div>
            </div>

            {/* Invoice Date (disabled) */}
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

            {/* Supplier Name (disabled) */}
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

            {/* Invoice Amount (disabled) */}
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
                disabled={isInvoicesEmpty}
                placeholder="Select Source Account"
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

          {/* Remarks */}
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

          {/* Buttons */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
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
              {loading
                ? "Saving..."
                : editingId
                ? "Update Payment"
                : "Add Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentOutModal;