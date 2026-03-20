import React, { useState, useEffect, useRef } from "react";
import {
  Receipt,
  Download,
  Filter,
  User,
  Phone,
  Mail,
  X,
  Upload,
  Search,
  Plus,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import * as XLSX from "xlsx";
import OutstandingCollectionSampleExcelDownload from "../../excels/OutstandingCollectionSampleExcelDownload.jsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// ─────────────────────────────────────────────────────────────────────────────
// CustomerDropdown — unchanged from original
// ─────────────────────────────────────────────────────────────────────────────
const CustomerDropdown = ({
  value,
  onChange,
  options,
  placeholder = "Select customer...",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  const filteredOptions = options.filter(
    (option) =>
      option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      option.code?.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-3 py-2 cursor-pointer ${
          disabled ? "bg-gray-100" : "bg-white hover:border-gray-400"
        }`}
      >
        {selectedOption ? (
          <div className="flex items-center justify-between">
            <span>{selectedOption.label}</span>
            <span className="text-gray-500 text-sm">{selectedOption.code}</span>
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search..."
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
                className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                  value === option.value ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{option.label}</span>
                  <span className="text-gray-500 text-sm">{option.code}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No customers found
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceDropdown — searchable, used inside AddCreditCollectionModal
// ─────────────────────────────────────────────────────────────────────────────
const InvoiceDropdown = ({ value, onChange, options, disabled, loading }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  const filtered = options.filter((o) =>
    (o.label || "").toLowerCase().includes(search.toLowerCase()),
  );
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-3 py-2 border rounded-lg text-left text-sm ${
          disabled
            ? "bg-gray-100 cursor-not-allowed text-gray-400"
            : "bg-white cursor-pointer hover:border-gray-400"
        }`}
      >
        {loading
          ? "Loading invoices..."
          : selected
            ? selected.label
            : "Select Invoice Number"}
      </button>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          <div className="p-2 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm focus:outline-none"
              placeholder="Search invoice..."
              autoFocus
            />
          </div>
          {filtered.length === 0 ? (
            <div className="p-3 text-gray-500 text-sm text-center">
              No invoices found
            </div>
          ) : (
            filtered.map((option) => (
              <div
                key={option.value}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearch("");
                  }
                }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 ${
                  value === option.value ? "bg-indigo-100 text-indigo-700" : ""
                } ${option.disabled ? "text-gray-400 cursor-default" : ""}`}
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

// ─────────────────────────────────────────────────────────────────────────────
// AddCreditCollectionModal
// Opened by the "Add New Transaction" header button.
// - Category Type: locked to "Credit Collection"
// - Customer Name: searchable dropdown of all customers with outstanding invoices
// - Invoice dropdown: filters to selected customer's outstanding invoices
// - Amount: pre-fills with dueAmount, editable for partial payment
// - Invoice Date / Customer Address: auto-filled, read-only
// On submit → POST /api/transactions
// ─────────────────────────────────────────────────────────────────────────────
const AddCreditCollectionModal = ({ isOpen, onClose, onSuccess }) => {
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [categoryLabel, setCategoryLabel] = useState("Credit Collection");
  const [allSales, setAllSales] = useState([]);
  const [usedInvoices, setUsedInvoices] = useState(new Set());
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const customerDropdownRef = useRef(null);

  const [form, setForm] = useState({
    selectedCustomer: null, // { code, name, address }
    invoiceNumber: "",
    destinationAccount: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    invoiceDate: "",
    customerName: "",
    customerAddress: "",
    remarks: "",
  });
  const [errors, setErrors] = useState({});
  const [invoiceDueAmount, setInvoiceDueAmount] = useState(0);

  // Close customer dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target)
      )
        setCustomerDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    loadOptions();
  }, [isOpen]);

  const resetForm = () => {
    setForm({
      selectedCustomer: null,
      invoiceNumber: "",
      destinationAccount: "",
      date: new Date().toISOString().split("T")[0],
      amount: "",
      invoiceDate: "",
      customerName: "",
      customerAddress: "",
      remarks: "",
    });
    setErrors({});
    setInvoiceDueAmount(0);
    setInvoiceOptions([]);
    setCustomerSearch("");
  };

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const [destRes, catRes, salesRes, txRes] = await Promise.all([
        axios.get(`${backendUrl}/api/accounts/destinations`),
        axios.get(`${backendUrl}/api/accounts/category-type`),
        axios.get(`${backendUrl}/api/sales/all`),
        axios.get(`${backendUrl}/api/transactions`),
      ]);

      // Destination accounts
      let destinations = [];
      if (destRes.data && Array.isArray(destRes.data))
        destinations = destRes.data;
      else if (destRes.data?.data) destinations = destRes.data.data;
      setDestinationOptions(
        destinations.map((d) => ({
          value: d._id,
          label: d.name,
          totalAmount: d.totalAmount || 0,
        })),
      );

      // Credit Collection category label from master
      let categories = [];
      if (catRes.data && Array.isArray(catRes.data)) categories = catRes.data;
      else if (catRes.data?.data) categories = catRes.data.data;
      const creditCat = categories.find((c) =>
        c.name?.toLowerCase().includes("credit collection"),
      );
      if (creditCat) setCategoryLabel(creditCat.name);

      // Used invoice numbers
      const allTx = txRes.data?.data || [];
      const usedSet = new Set(
        allTx
          .filter((tx) => tx.invoiceNo && tx.invoiceNo !== "NA")
          .map((tx) => tx.invoiceNo),
      );
      setUsedInvoices(usedSet);

      // All sales
      const allSalesData = salesRes.data?.summaries || [];
      setAllSales(allSalesData);

      // Build unique customer list from sales that have outstanding invoices
      const customerMap = new Map();
      allSalesData.forEach((s) => {
        const ps = (s.paymentStatus || "").toLowerCase();
        const isCredit =
          ps === "credit" ||
          ps === "partial paid" ||
          ps === "unpaid" ||
          ps === "due";
        const notPaid = (s.pendingAmountPaid || "").toLowerCase() !== "paid";
        const notUsed = !usedSet.has(s.invoiceNumber);
        const hasDue = (s.dueAmount || 0) > 0;

        if (isCredit && notPaid && notUsed && hasDue && s.customerName) {
          const key = String(s.customerCode || s.customerName);
          if (!customerMap.has(key)) {
            customerMap.set(key, {
              code: s.customerCode || "",
              name: s.customerName,
              address: s.customerAddress || s.billingAddress || "",
            });
          }
        }
      });
      setCustomerOptions(Array.from(customerMap.values()));
    } catch (err) {
      console.error("AddCreditCollectionModal loadOptions error:", err);
      showToast("error", "Failed to load options");
    } finally {
      setLoadingOptions(false);
    }
  };

  // When customer is selected, filter invoices for that customer
  const handleCustomerSelect = (customer) => {
    setCustomerSearch(customer.name);
    setCustomerDropdownOpen(false);
    setForm((prev) => ({
      ...prev,
      selectedCustomer: customer,
      customerName: customer.name,
      customerAddress: customer.address || "",
      invoiceNumber: "",
      invoiceDate: "",
      amount: "",
    }));
    setInvoiceDueAmount(0);
    setErrors((prev) => ({ ...prev, selectedCustomer: "", invoiceNumber: "" }));

    // Build invoice options for this customer
    const custCode = customer.code;
    const custName = customer.name;
    const filtered = allSales.filter((s) => {
      const codeMatch = custCode
        ? String(s.customerCode).replace(/^0+/, "") ===
          String(custCode).replace(/^0+/, "")
        : false;
      const nameMatch = custName
        ? (s.customerName || "").toLowerCase() === custName.toLowerCase()
        : false;
      const matchesCustomer = codeMatch || nameMatch;
      const ps = (s.paymentStatus || "").toLowerCase();
      const isCredit =
        ps === "credit" ||
        ps === "partial paid" ||
        ps === "unpaid" ||
        ps === "due";
      const notPaid = (s.pendingAmountPaid || "").toLowerCase() !== "paid";
      const notUsed = !usedInvoices.has(s.invoiceNumber);
      const hasDue = (s.dueAmount || 0) > 0;
      return matchesCustomer && isCredit && notPaid && notUsed && hasDue;
    });

    setInvoiceOptions([
      { value: "", label: "Select Invoice Number" },
      ...filtered.map((s) => ({
        value: s.invoiceNumber,
        label: `${s.invoiceNumber} — Due: $${(s.dueAmount || 0).toFixed(2)}`,
      })),
    ]);
  };

  const handleInvoiceSelect = (invoiceNumber) => {
    if (!invoiceNumber) {
      setForm((prev) => ({
        ...prev,
        invoiceNumber: "",
        invoiceDate: "",
        amount: "",
      }));
      setInvoiceDueAmount(0);
      return;
    }
    if (usedInvoices.has(invoiceNumber)) {
      showToast(
        "error",
        `Invoice "${invoiceNumber}" already has a transaction.`,
      );
      return;
    }
    const sale = allSales.find((s) => s.invoiceNumber === invoiceNumber);
    if (sale) {
      const due = sale.dueAmount || 0;
      setInvoiceDueAmount(due);
      setForm((prev) => ({
        ...prev,
        invoiceNumber,
        invoiceDate: sale.invoiceDate ? sale.invoiceDate.split("T")[0] : "",
        customerName: sale.customerName || prev.customerName || "",
        customerAddress:
          sale.customerAddress ||
          sale.billingAddress ||
          prev.customerAddress ||
          "",
        amount: due.toFixed(2),
      }));
      setErrors((prev) => ({ ...prev, invoiceNumber: "" }));
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));

    if (field === "amount" && invoiceDueAmount > 0) {
      const amt = parseFloat(value) || 0;
      if (amt > invoiceDueAmount) {
        setErrors((prev) => ({
          ...prev,
          amount: `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`,
        }));
      } else if (amt <= 0) {
        setErrors((prev) => ({
          ...prev,
          amount: "Amount must be greater than 0",
        }));
      } else {
        setErrors((prev) => ({ ...prev, amount: "" }));
      }
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.selectedCustomer)
      newErrors.selectedCustomer = "Customer is required";
    if (!form.invoiceNumber)
      newErrors.invoiceNumber = "Invoice Number is required";
    if (!form.destinationAccount)
      newErrors.destinationAccount = "Destination Account is required";
    if (!form.date) newErrors.date = "Date is required";
    if (!form.amount || parseFloat(form.amount) <= 0)
      newErrors.amount = "Valid amount is required";
    if (invoiceDueAmount > 0 && parseFloat(form.amount) > invoiceDueAmount)
      newErrors.amount = `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`;
    if (!form.customerName)
      newErrors.customerName = "Customer Name is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const destOpt = destinationOptions.find(
      (d) => d.value === form.destinationAccount,
    );
    const destinationName = destOpt?.label || "";
    const amount = parseFloat(form.amount);

    const payload = {
      categoryType: categoryLabel,
      transactionType: "credit collection",
      invoiceNo: form.invoiceNumber,
      sourceAccount: "",
      destination: destinationName,
      amount,
      exchangeLoss: 0,
      finalAmount: amount,
      date: form.date,
      invoiceDate: form.invoiceDate || undefined,
      customerName: form.customerName,
      customerAddress: form.customerAddress || "",
      accountType: destinationName || "Cash Balance",
      remarks:
        form.remarks || `Credit collection from invoice ${form.invoiceNumber}`,
    };

    setSubmitting(true);
    try {
      const response = await axios.post(
        `${backendUrl}/api/transactions`,
        payload,
      );
      if (response.data.success) {
        showToast(
          "success",
          `Transaction added — $${amount.toFixed(2)} collected from invoice ${form.invoiceNumber}`,
        );
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      console.error("Transaction submission error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to add transaction",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const day = d.getDate().toString().padStart(2, "0");
      const month = d.toLocaleString("en", { month: "short" });
      const year = d.getFullYear();
      return `${day} ${month} ${year}`;
    } catch {
      return dateStr;
    }
  };

  // Filtered customer list for search
  const filteredCustomers = customerOptions.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      String(c.code).toLowerCase().includes(customerSearch.toLowerCase()),
  );

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Add New Transaction - Cash Balance
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Type — locked */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Category Type <span className="text-red-500">*</span>
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm">
                {categoryLabel}
              </div>
            </div>

            {/* Customer Name — searchable dropdown */}
            <div className="space-y-1" ref={customerDropdownRef}>
              <label className="block text-sm font-medium text-gray-700">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setCustomerDropdownOpen(true);
                    if (!e.target.value) {
                      setForm((prev) => ({
                        ...prev,
                        selectedCustomer: null,
                        invoiceNumber: "",
                        invoiceDate: "",
                        amount: "",
                        customerName: "",
                        customerAddress: "",
                      }));
                      setInvoiceOptions([]);
                      setInvoiceDueAmount(0);
                    }
                  }}
                  onFocus={() => setCustomerDropdownOpen(true)}
                  placeholder={
                    loadingOptions
                      ? "Loading customers..."
                      : "Search customer..."
                  }
                  disabled={loadingOptions}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${
                    errors.selectedCustomer
                      ? "border-red-500"
                      : "border-gray-300"
                  } ${loadingOptions ? "bg-gray-50 cursor-not-allowed" : ""}`}
                />
                {customerDropdownOpen && filteredCustomers.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <div
                        key={c.code || c.name}
                        onClick={() => handleCustomerSelect(c)}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.code && (
                          <span className="ml-2 text-gray-400 text-xs">
                            ({c.code})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {customerDropdownOpen &&
                  customerSearch &&
                  filteredCustomers.length === 0 &&
                  !loadingOptions && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-sm text-gray-500 text-center">
                      No customers with outstanding invoices found
                    </div>
                  )}
              </div>
              {errors.selectedCustomer && (
                <p className="text-red-500 text-xs">
                  {errors.selectedCustomer}
                </p>
              )}
            </div>

            {/* Invoice Number */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <InvoiceDropdown
                value={form.invoiceNumber}
                onChange={handleInvoiceSelect}
                options={invoiceOptions}
                disabled={!form.selectedCustomer || loadingOptions}
                loading={loadingOptions}
              />
              {errors.invoiceNumber && (
                <p className="text-red-500 text-xs">{errors.invoiceNumber}</p>
              )}
              {form.selectedCustomer &&
                invoiceOptions.length <= 1 &&
                !loadingOptions && (
                  <p className="text-xs text-orange-500">
                    No outstanding invoices for this customer.
                  </p>
                )}
              {!form.selectedCustomer && (
                <p className="text-xs text-gray-400">Select a customer first</p>
              )}
            </div>

            {/* Destination Account */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Destination Account <span className="text-red-500">*</span>
              </label>
              <select
                value={form.destinationAccount}
                onChange={(e) =>
                  handleChange("destinationAccount", e.target.value)
                }
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${
                  errors.destinationAccount
                    ? "border-red-500"
                    : "border-gray-300"
                }`}
                disabled={loadingOptions}
              >
                <option value="">Select Destination Account</option>
                {destinationOptions.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label} (Balance: ${d.totalAmount.toFixed(2)})
                  </option>
                ))}
              </select>
              {errors.destinationAccount && (
                <p className="text-red-500 text-xs">
                  {errors.destinationAccount}
                </p>
              )}
            </div>

            {/* Date */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => handleChange("date", e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${
                  errors.date ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.date && (
                <p className="text-red-500 text-xs">{errors.date}</p>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Amount ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={invoiceDueAmount > 0 ? invoiceDueAmount : undefined}
                value={form.amount}
                onChange={(e) => handleChange("amount", e.target.value)}
                placeholder="Enter amount"
                disabled={!form.invoiceNumber}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${
                  errors.amount ? "border-red-500" : "border-gray-300"
                } ${!form.invoiceNumber ? "bg-gray-50" : ""}`}
              />
              {invoiceDueAmount > 0 && (
                <p className="text-xs text-orange-500">
                  Due Amount: <strong>${invoiceDueAmount.toFixed(2)}</strong> —
                  You can enter a partial amount
                </p>
              )}
              {errors.amount && (
                <p className="text-red-500 text-xs">{errors.amount}</p>
              )}
            </div>

            {/* Invoice Date — read-only */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Invoice Date
              </label>
              <input
                type="text"
                value={formatDateDisplay(form.invoiceDate)}
                readOnly
                placeholder="DD MMM YYYY"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>

            {/* Customer Address — read-only */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Customer Address
              </label>
              <input
                type="text"
                value={form.customerAddress}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>

            {/* Remarks — full width */}
            <div className="space-y-1 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                Remarks
              </label>
              <textarea
                value={form.remarks}
                onChange={(e) => handleChange("remarks", e.target.value)}
                rows={3}
                placeholder="Optional remarks..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-5 mt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingOptions}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              <Plus size={15} />
              {submitting ? "Adding..." : "+ Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// OutstandingCollection — main component
// ─────────────────────────────────────────────────────────────────────────────
const OutstandingCollection = () => {
  const [data, setData] = useState({
    summary: {
      totalOutstandingAmount: 0,
      totalOverdueAmount: 0,
      totalCustomers: 0,
      totalInvoices: 0,
    },
    records: [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState("all");
  const [showCustomFilter, setShowCustomFilter] = useState(false);
  const [customDateRange, setCustomDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [filter, setFilter] = useState({ customerName: "", status: "all" });
  const [searchTerm, setSearchTerm] = useState("");
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalRecords: 0,
    hasNext: false,
    hasPrev: false,
  });
  const [exportLoading, setExportLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const [customerOptions, setCustomerOptions] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // ── Add Transaction modal ──────────────────────────────────────────────────
  const [showAddTxModal, setShowAddTxModal] = useState(false);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );

  const getSerialNumber = (index) => {
    const itemsPerPage = 7;
    return (pagination.currentPage - 1) * itemsPerPage + index + 1;
  };

  const fetchCustomerOptions = async () => {
    setLoadingCustomers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/customers`);
      const customers = response.data.customers || [];
      setCustomerOptions(
        customers.map((customer) => ({
          value: customer.customerCode,
          label: customer.name || "Unnamed Customer",
          code: customer.customerCode,
          phone: customer.customerNumber,
          address: customer.address,
        })),
      );
    } catch (error) {
      console.error("Error fetching customers:", error);
      showToast("error", "Failed to fetch customer list");
      setCustomerOptions([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    fetchCustomerOptions();
  }, []);

  const getCurrentMonthName = () =>
    new Date().toLocaleString("default", { month: "long" });
  const getCurrentYear = () => new Date().getFullYear();
  const getPreviousMonthName = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("default", { month: "long" });
  };

  const getJanToPreviousMonthRange = () => {
    const currentYear = getCurrentYear();
    const currentMonth = new Date().getMonth();
    if (currentMonth === 0) {
      const previousYear = currentYear - 1;
      return {
        startDate: `${previousYear}-01-01`,
        endDate: `${previousYear}-12-31`,
        label: `Jan - Dec ${previousYear}`,
      };
    }
    const endDate = new Date(currentYear, currentMonth, 0);
    return {
      startDate: `${currentYear}-01-01`,
      endDate: endDate.toISOString().split("T")[0],
      label: `Jan - ${getPreviousMonthName()} ${currentYear}`,
    };
  };

  const getDateRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    switch (selectedTab) {
      case "currentMonth":
        return {
          startDate: new Date(currentYear, currentMonth, 1)
            .toISOString()
            .split("T")[0],
          endDate: new Date(currentYear, currentMonth + 1, 0)
            .toISOString()
            .split("T")[0],
        };
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange();
      case "custom":
        return {
          startDate: customDateRange.startDate
            ? customDateRange.startDate.toISOString().split("T")[0]
            : "",
          endDate: customDateRange.endDate
            ? customDateRange.endDate.toISOString().split("T")[0]
            : "",
        };
      default:
        return {};
    }
  };

  const fetchOutstandingCollections = async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const dateRange = getDateRange();
      let params = { page, limit: 7 };

      if (selectedTab !== "all") {
        if (
          selectedTab === "custom" &&
          (!dateRange.startDate || !dateRange.endDate)
        ) {
          setLoading(false);
          return;
        }
        params = {
          ...params,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
        };
      }

      if (search && search.trim() !== "") params.search = search.trim();

      if (selectedTab === "custom") {
        if (filter.customerName) params.customerCode = filter.customerName;
        if (filter.status !== "all") params.status = filter.status;
      }

      const response = await axios.get(
        `${backendUrl}/api/reports/outstanding-collections`,
        { params },
      );

      setData(response.data.data || { summary: {}, records: [] });
      setPagination(
        response.data.pagination || {
          currentPage: 1,
          totalPages: 1,
          totalRecords: 0,
          hasNext: false,
          hasPrev: false,
        },
      );
    } catch (error) {
      console.error("Error fetching outstanding collections:", error);
      showToast("error", "Failed to fetch outstanding collections data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      (!customDateRange.startDate || !customDateRange.endDate)
    )
      return;
    fetchOutstandingCollections(1);
  }, [selectedTab]);

  useEffect(() => {
    if (
      selectedTab === "custom" &&
      customDateRange.startDate &&
      customDateRange.endDate
    )
      fetchOutstandingCollections(1);
  }, [customDateRange.startDate, customDateRange.endDate]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= pagination.totalPages)
      fetchOutstandingCollections(page);
  };

  const handleSearchChange = (e) => setSearchTerm(e.target.value);
  const handleClearSearch = () => {
    setSearchTerm("");
    fetchOutstandingCollections(1, "");
  };
  const handleCustomDateChange = (name, date) =>
    setCustomDateRange((prev) => ({ ...prev, [name]: date }));
  const handleCustomerNameChange = (value) =>
    setFilter((prev) => ({ ...prev, customerName: value }));

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchOutstandingCollections(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  const handleSearch = (e) => {
    if (e.key === "Enter") fetchOutstandingCollections(1);
  };

  const handleApplyCustomFilter = () => {
    if (!customDateRange.startDate || !customDateRange.endDate) {
      showToast("warning", "Please select both start and end dates");
      return;
    }
    if (customDateRange.startDate > customDateRange.endDate) {
      showToast("warning", "Start date cannot be after end date");
      return;
    }
    setSelectedTab("custom");
    setShowCustomFilter(false);
    fetchOutstandingCollections(1);
  };

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    if (tab === "custom") {
      setShowCustomFilter(true);
    } else {
      setFilter({ customerName: "", status: "all" });
      setCustomDateRange({ startDate: null, endDate: null });
      fetchOutstandingCollections(1);
    }
  };

  const handleClearFilters = () => {
    setFilter({ customerName: "", status: "all" });
    setCustomDateRange({ startDate: null, endDate: null });
    setSearchTerm("");
    setSelectedTab("all");
    fetchOutstandingCollections(1);
  };

  const handleTxSuccess = () => {
    fetchOutstandingCollections(pagination.currentPage);
  };

  const exportToExcel = async () => {
    try {
      setExportLoading(true);
      const dateRange = getDateRange();
      if (
        selectedTab === "custom" &&
        (!dateRange.startDate || !dateRange.endDate)
      ) {
        showToast(
          "warning",
          "Please select both start and end dates for export",
        );
        setExportLoading(false);
        return;
      }
      if (data.records.length === 0) {
        showToast("warning", "No data available to export");
        setExportLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (dateRange.startDate) params.append("startDate", dateRange.startDate);
      if (dateRange.endDate) params.append("endDate", dateRange.endDate);
      if (searchTerm) params.append("search", searchTerm);
      if (selectedTab === "custom" && filter.customerName)
        params.append("customerCode", filter.customerName);

      const downloadUrl = `${backendUrl}/api/reports/outstanding-collections/export/excel?${params.toString()}`;
      const response = await axios.get(downloadUrl, { responseType: "blob" });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      let fileName = "outstanding-collections-report";
      if (dateRange.startDate && dateRange.endDate)
        fileName = `outstanding-collections-${dateRange.startDate.replace(
          /-/g,
          "",
        )}-to-${dateRange.endDate.replace(/-/g, "")}`;
      else
        fileName = `outstanding-collections-${new Date()
          .toISOString()
          .split("T")[0]
          .replace(/-/g, "")}`;
      fileName += ".xlsx";
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
      showToast("success", "Excel file downloaded successfully!");
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      if (error.response?.status === 400)
        showToast("error", "Invalid date format for export");
      else if (error.response?.status === 404)
        showToast("error", "Export service not available");
      else showToast("error", "Failed to export to Excel");
    } finally {
      setExportLoading(false);
    }
  };

  const handleImportClick = () => {
    setShowImportModal(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true,
          cellNF: false,
          cellText: false,
        });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true,
        });
        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          if (
            rows[i]?.[0]?.toString().trim().toLowerCase() === "invoice number"
          ) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          showToast(
            "error",
            "Header row not found. Make sure first column is 'Invoice Number'",
          );
          return;
        }
        const headers = rows[headerIdx].map((h) => h?.toString().trim() || "");
        const dataRows = rows.slice(headerIdx + 1);
        const json = dataRows
          .map((row) => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] !== undefined ? row[i] : "";
            });
            return obj;
          })
          .filter((o) => o["Invoice Number"]?.toString().trim() !== "");
        const validData = json
          .map((item) => ({
            invoiceNumber: item["Invoice Number"]?.toString().trim() || "",
            totalAmount: parseFloat(item["Total Amount"] || 0) || 0,
            paidAmount: parseFloat(item["Paid Amount"] || 0) || 0,
            creditDays: parseInt(item["Credit Days"] || 0) || 0,
            remarks: item["Remarks"]?.toString().trim() || "",
          }))
          .filter((item) => item.invoiceNumber && item.totalAmount > 0);
        if (validData.length === 0) {
          showToast("warning", "No valid records found in the Excel file");
          return;
        }
        setParsedData(validData);
      } catch (err) {
        console.error("Error parsing file:", err);
        showToast("error", "Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportSubmit = async () => {
    if (!parsedData.length) {
      showToast("warning", "Upload a valid file first");
      return;
    }
    setIsUploading(true);
    try {
      const response = await axios.post(
        `${backendUrl}/api/reports/outstanding-collections/bulk-update`,
        { updates: parsedData },
      );
      if (response.data.success) {
        showToast(
          "success",
          `Successfully updated ${response.data.successCount} sales. Failed: ${response.data.failedCount}`,
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchOutstandingCollections(1);
      } else {
        showToast("error", response.data.message || "Failed to update sales");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
      showToast(
        "error",
        error.response?.data?.message || "Failed to upload file",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const formatDateForDisplay = (date) =>
    date ? formatDateToReadable(date) : "";

  const getActiveFilterDisplay = () => {
    switch (selectedTab) {
      case "currentMonth":
        return `${getCurrentMonthName()} ${getCurrentYear()}`;
      case "janToPreviousMonth":
        return getJanToPreviousMonthRange().label;
      case "custom":
        if (customDateRange.startDate && customDateRange.endDate) {
          let display = `${formatDateForDisplay(
            customDateRange.startDate,
          )} to ${formatDateForDisplay(customDateRange.endDate)}`;
          if (filter.customerName) {
            const sc = customerOptions.find(
              (opt) => opt.value === filter.customerName,
            );
            display += ` | Customer: ${sc?.label || filter.customerName}`;
          }
          if (filter.status !== "all") display += ` | Status: ${filter.status}`;
          return display;
        }
        return "Select custom dates";
      default:
        return "All Records";
    }
  };

  const renderPagination = () => {
    if (!pagination.totalRecords || pagination.totalRecords === 0) return null;
    if (pagination.totalPages <= 1) return null;
    const itemsPerPage = 7;
    const startItem = (pagination.currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(
      pagination.currentPage * itemsPerPage,
      pagination.totalRecords,
    );
    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasPrev
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            ← Prev
          </button>
          <div className="flex items-center gap-1">
            {visiblePages.map((page, index) => (
              <button
                key={index}
                onClick={() =>
                  typeof page === "number" ? handlePageChange(page) : null
                }
                className={`min-w-[40px] px-3 py-2 rounded-lg ${
                  page === pagination.currentPage
                    ? "bg-indigo-600 text-white cursor-default"
                    : typeof page === "number"
                      ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                      : "bg-transparent text-gray-500 cursor-default"
                }`}
                disabled={typeof page !== "number"}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${
              pagination.hasNext
                ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            Next →
          </button>
        </div>
        <div className="text-sm text-gray-600">
          Showing {startItem} to {endItem} of {pagination.totalRecords} records
        </div>
      </div>
    );
  };

  const isExportDisabled =
    loading || exportLoading || data.records.length === 0;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="text-orange-500" size={28} />
          <h1 className="text-2xl font-bold">Outstanding Collection</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* ── Add New Transaction button ── */}
          <button
            onClick={() => setShowAddTxModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
          >
            <Plus size={16} />
            Add New Transaction
          </button>

          {/* Search */}
          <div className="relative flex items-center">
            <Search
              size={16}
              className="absolute left-3 text-gray-400"
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={handleSearchChange}
              onKeyDown={handleSearch}
              placeholder="Search by customer name"
              className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Upload Excel */}
          <button
            onClick={handleImportClick}
            disabled={isUploading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${
              isUploading
                ? "bg-purple-400 cursor-not-allowed"
                : "bg-purple-600 hover:bg-purple-700 cursor-pointer"
            }`}
          >
            <Upload size={16} />
            {isUploading ? "Uploading..." : "Upload Excel"}
          </button>

          {/* Export Excel */}
          <button
            onClick={exportToExcel}
            disabled={isExportDisabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
              isExportDisabled
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"
            }`}
          >
            <Download size={16} />
            {exportLoading ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button
          onClick={() => handleTabChange("all")}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === "all" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
        >
          All Records
        </button>
        <button
          onClick={() => handleTabChange("currentMonth")}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === "currentMonth" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
        >
          Current Month ({getCurrentMonthName()} {getCurrentYear()})
        </button>
        <button
          onClick={() => handleTabChange("janToPreviousMonth")}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === "janToPreviousMonth" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
        >
          {getJanToPreviousMonthRange().label}
        </button>
        <button
          onClick={() => handleTabChange("custom")}
          className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === "custom" ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
        >
          Custom Filter
        </button>
      </div>

      {/* Active Filter */}
      <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
        <Filter size={14} />
        <span>
          Active Filter: <strong>{getActiveFilterDisplay()}</strong> (
          {pagination.totalRecords} records found)
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="border border-orange-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Outstanding</p>
            <p className="text-2xl font-bold">
              ${(data.summary.totalOutstandingAmount || 0).toLocaleString()}
            </p>
          </div>
          <Receipt className="text-orange-400" size={36} />
        </div>
        <div className="border border-red-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Overdue</p>
            <p className="text-2xl font-bold">
              ${(data.summary.totalOverdueAmount || 0).toLocaleString()}
            </p>
          </div>
          <User className="text-red-400" size={36} />
        </div>
        <div className="border border-gray-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Customers</p>
            <p className="text-2xl font-bold">
              {data.summary.totalCustomers || 0}
            </p>
          </div>
          <User className="text-blue-400" size={36} />
        </div>
        <div className="border border-green-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Invoices</p>
            <p className="text-2xl font-bold">
              {data.summary.totalInvoices || 0}
            </p>
          </div>
          <Receipt className="text-green-400" size={36} />
        </div>
      </div>

      {/* Data Table — original columns, NO Action column */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Sr.No
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Customer Code
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Customer Name
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Contact
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">
                Total Outstanding ($)
              </th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">
                Overdue Amount ($)
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">
                Overdue Days
              </th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">
                Last Transaction
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : data.records.length > 0 ? (
              data.records.map((customer, index) => (
                <tr
                  key={customer.customerCode}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-600">
                    {getSerialNumber(index)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">
                    {customer.customerCode || "N/A"}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {customer.customerName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Phone size={12} />
                      {customer.phone || "N/A"}
                    </div>
                    {customer.email && (
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-1">
                        <Mail size={12} />
                        {customer.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${(customer.totalOutstandingAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    ${(customer.overdueAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-medium ${
                        customer.overdueDays > 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {customer.overdueDays > 0
                        ? `${customer.overdueDays} days`
                        : "On Time"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {customer.lastTransactionDate
                      ? formatDateToReadable(customer.lastTransactionDate)
                      : "N/A"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-500">
                  {selectedTab === "custom" &&
                  (!customDateRange.startDate || !customDateRange.endDate)
                    ? "Please select start and end dates"
                    : "No outstanding collections found"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {renderPagination()}

      {/* ── Add Transaction Modal ──────────────────────────────────────────── */}
      <AddCreditCollectionModal
        isOpen={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSuccess={handleTxSuccess}
      />

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[480px] p-6 relative">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                disabled={isUploading}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold mb-4">
                Import Outstanding Collection
              </h2>
              {isSampleFile && <OutstandingCollectionSampleExcelDownload />}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center mb-4">
                <Upload className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-sm text-gray-500 mb-2">
                  Download the template above, fill in your data, and upload
                  here.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                >
                  Choose File
                </label>
              </div>
              {parsedData.length > 0 ? (
                <p className="text-sm text-green-600 mb-4">
                  Rows to import: <strong>{parsedData.length}</strong>
                </p>
              ) : (
                <p className="text-sm text-gray-400 mb-4">No data to import</p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedData([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
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
                  onClick={handleImportSubmit}
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg text-white ${
                    isUploading || parsedData.length === 0
                      ? "bg-indigo-400 cursor-not-allowed"
                      : "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
                  }`}
                >
                  {isUploading ? "Uploading…" : `Upload (${parsedData.length})`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Custom Filter Modal */}
      {showCustomFilter &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-[520px] p-6 relative">
              <button
                onClick={() => setShowCustomFilter(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-bold mb-5">
                Outstanding Collection Filter
              </h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Start Date
                  </label>
                  <DatePicker
                    selected={customDateRange.startDate}
                    onChange={(date) =>
                      handleCustomDateChange("startDate", date)
                    }
                    selectsStart
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="Start date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    End Date
                  </label>
                  <DatePicker
                    selected={customDateRange.endDate}
                    onChange={(date) => handleCustomDateChange("endDate", date)}
                    selectsEnd
                    startDate={customDateRange.startDate}
                    endDate={customDateRange.endDate}
                    minDate={customDateRange.startDate}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholderText="End date"
                    dateFormat="yyyy-MM-dd"
                    isClearable
                  />
                </div>
              </div>
              <div className="mb-5">
                <label className="block text-sm font-medium mb-1">
                  Customer Name
                </label>
                {loadingCustomers && (
                  <p className="text-xs text-gray-400 mb-1">
                    Loading customers...
                  </p>
                )}
                {!loadingCustomers && customerOptions.length > 0 && (
                  <p className="text-xs text-gray-400 mb-1">
                    {customerOptions.length} customers available
                  </p>
                )}
                <CustomerDropdown
                  value={filter.customerName}
                  onChange={handleCustomerNameChange}
                  options={customerOptions}
                  placeholder="Select customer..."
                  disabled={loadingCustomers}
                />
              </div>
              <div className="flex justify-between items-center">
                <button
                  onClick={handleClearFilters}
                  className="text-sm text-red-500 hover:text-red-700 cursor-pointer"
                >
                  Clear All
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCustomFilter(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyCustomFilter}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default OutstandingCollection;
