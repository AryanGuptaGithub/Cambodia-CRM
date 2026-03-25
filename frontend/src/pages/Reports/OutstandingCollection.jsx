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
  Wallet,
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
// Module-level cache — survives re-renders, cleared on page reload only
// ─────────────────────────────────────────────────────────────────────────────
const _cache = {
  customers: null,
  destinations: null,
  categoryLabel: null,
  ts: 0,
};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─────────────────────────────────────────────────────────────────────────────
// CustomerDropdown
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
// InvoiceDropdown
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
// pickAddress helper
// ─────────────────────────────────────────────────────────────────────────────
const pickAddress = (obj) => {
  if (!obj) return "";
  const candidates = [
    obj.address,
    obj.customerAddress,
    obj.billingAddress,
    obj.shippingAddress,
    obj.deliveryAddress,
    obj.custAddress,
    obj.customer_address,
    obj.billing_address,
    obj.permanentAddress,
    obj.contactAddress,
  ];
  for (const c of candidates) {
    if (c && String(c).trim() !== "") return String(c).trim();
  }
  return "";
};

// ─────────────────────────────────────────────────────────────────────────────
// Build customer lookup maps from raw customer array
// ─────────────────────────────────────────────────────────────────────────────
const buildCustomerMaps = (custRaw) => {
  const byId = {},
    byCode = {},
    byName = {};
  if (!Array.isArray(custRaw)) return { byId, byCode, byName };
  custRaw.forEach((c) => {
    const addr = pickAddress(c);
    if (c._id)
      byId[String(c._id)] = { addr, name: c.name, phone: c.customerNumber };
    if (c.customerCode) {
      byCode[String(c.customerCode)] = addr;
      byCode[String(c.customerCode).replace(/^0+/, "") || "0"] = addr;
    }
    if (c.name) byName[c.name.toLowerCase().trim()] = addr;
  });
  return { byId, byCode, byName };
};

// ─────────────────────────────────────────────────────────────────────────────
// AddCreditCollectionModal
// ─────────────────────────────────────────────────────────────────────────────
const AddCreditCollectionModal = ({ isOpen, onClose, onSuccess }) => {
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [categoryLabel, setCategoryLabel] = useState("Credit Collection");
  const [allSales, setAllSales] = useState([]);
  const [usedInvoices, setUsedInvoices] = useState(new Set());
  const [allInvoiceOptions, setAllInvoiceOptions] = useState([]);

  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [staticLoading, setStaticLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerById, setCustomerById] = useState({});
  const [customerByCode, setCustomerByCode] = useState({});
  const [customerByName, setCustomerByName] = useState({});

  const [mrCashInfo, setMrCashInfo] = useState(null);
  const [isMrInStockTransfer, setIsMrInStockTransfer] = useState(false);
  const [mrCashLoading, setMrCashLoading] = useState(false);

  // Track the selected sale for dueAmount updates
  const [selectedSale, setSelectedSale] = useState(null);

  const [form, setForm] = useState({
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

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    loadData();
  }, [isOpen]);

  const resetForm = () => {
    setForm({
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
    setAllInvoiceOptions([]);
    setMrCashInfo(null);
    setIsMrInStockTransfer(false);
    setSelectedSale(null);
  };

  const loadData = async () => {
    setInvoicesLoading(true);
    try {
      const [salesRes, txRes] = await Promise.all([
        axios.get(`${backendUrl}/api/sales/all`),
        axios.get(`${backendUrl}/api/transactions`),
      ]);

      const allTx = txRes.data?.data || [];

      // ── FIX: Build a map of invoiceNo → total collected so far ──────────
      const collectedMap = {};
      allTx
        .filter((tx) => tx.invoiceNo && tx.invoiceNo !== "NA")
        .forEach((tx) => {
          const inv = tx.invoiceNo;
          collectedMap[inv] = (collectedMap[inv] || 0) + (tx.amount || 0);
        });

      const allSalesData = salesRes.data?.summaries || [];
      setAllSales(allSalesData);

      // ── FIX: Show invoice if effective dueAmount > 0 (after subtracting
      //    already-collected amounts from transactions) ────────────────────
      const invoiceOpts = allSalesData
        .filter((s) => {
          const ps = (s.paymentStatus || "").toLowerCase();
          const isCredit =
            ps === "credit" ||
            ps === "partial paid" ||
            ps === "unpaid" ||
            ps === "due";
          const notPaid = (s.pendingAmountPaid || "").toLowerCase() !== "paid";
          const collected = collectedMap[s.invoiceNumber] || 0;
          const effectiveDue = Math.max(0, (s.dueAmount || 0) - collected);
          return isCredit && notPaid && effectiveDue > 0 && s.invoiceNumber;
        })
        .map((s) => {
          const collected = collectedMap[s.invoiceNumber] || 0;
          const effectiveDue = Math.max(0, (s.dueAmount || 0) - collected);
          return {
            value: s.invoiceNumber,
            label: `${s.invoiceNumber} — Due: $${effectiveDue.toFixed(2)}`,
            effectiveDue,
          };
        });

      setUsedInvoices(collectedMap);
      setAllInvoiceOptions([
        { value: "", label: "Select Invoice Number" },
        ...invoiceOpts,
      ]);
    } catch (err) {
      console.error("Phase 1 load error:", err);
      showToast("error", "Failed to load invoices");
    } finally {
      setInvoicesLoading(false);
    }

    const now = Date.now();
    const cacheValid = _cache.ts && now - _cache.ts < CACHE_TTL;

    if (cacheValid && _cache.customers && _cache.destinations) {
      const { byId, byCode, byName } = _cache.customers;
      setCustomerById(byId);
      setCustomerByCode(byCode);
      setCustomerByName(byName);
      setDestinationOptions(_cache.destinations);
      if (_cache.categoryLabel) setCategoryLabel(_cache.categoryLabel);
      return;
    }

    setStaticLoading(true);
    try {
      const [destRes, catRes, custRes] = await Promise.all([
        axios.get(`${backendUrl}/api/accounts/destinations`),
        axios.get(`${backendUrl}/api/accounts/category-type`),
        axios.get(`${backendUrl}/api/customers`),
      ]);

      let destinations = [];
      if (destRes.data && Array.isArray(destRes.data))
        destinations = destRes.data;
      else if (destRes.data?.data) destinations = destRes.data.data;
      const destOpts = destinations.map((d) => ({
        value: d._id,
        label: d.name,
        totalAmount: d.totalAmount || 0,
      }));
      setDestinationOptions(destOpts);
      _cache.destinations = destOpts;

      let categories = [];
      if (catRes.data && Array.isArray(catRes.data)) categories = catRes.data;
      else if (catRes.data?.data) categories = catRes.data.data;
      const creditCat = categories.find((c) =>
        c.name?.toLowerCase().includes("credit collection"),
      );
      const label = creditCat?.name || "Credit Collection";
      setCategoryLabel(label);
      _cache.categoryLabel = label;

      const custRaw =
        custRes.data?.customers ||
        custRes.data?.data ||
        (Array.isArray(custRes.data) ? custRes.data : []);
      const maps = buildCustomerMaps(custRaw);
      setCustomerById(maps.byId);
      setCustomerByCode(maps.byCode);
      setCustomerByName(maps.byName);
      _cache.customers = maps;
      _cache.ts = Date.now();
    } catch (err) {
      console.error("Phase 2 load error:", err);
    } finally {
      setStaticLoading(false);
    }
  };

  const resolveAddress = (sale, byId, byCode, byName) => {
    const fromSale = pickAddress(sale);
    if (fromSale) return fromSale;

    if (sale.customerId) {
      const rec = byId[String(sale.customerId)];
      if (rec?.addr) return rec.addr;
      if (typeof rec === "string" && rec) return rec;
    }

    if (sale.customerCode) {
      const raw = String(sale.customerCode);
      const stripped = raw.replace(/^0+/, "") || "0";
      if (byCode[raw]) return byCode[raw];
      if (byCode[stripped]) return byCode[stripped];
    }

    if (sale.customerName) {
      const byNameAddr = byName[sale.customerName.toLowerCase().trim()];
      if (byNameAddr) return byNameAddr;
    }

    return "";
  };

  const handleAmountChange = (e) => {
    const raw = e.target.value;
    const cleaned = raw.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    const sanitized =
      parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;

    setForm((prev) => ({ ...prev, amount: sanitized }));

    if (invoiceDueAmount > 0) {
      const amt = parseFloat(sanitized) || 0;
      if (sanitized !== "" && amt > invoiceDueAmount) {
        setErrors((prev) => ({
          ...prev,
          amount: `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`,
        }));
      } else if (sanitized !== "" && amt <= 0) {
        setErrors((prev) => ({
          ...prev,
          amount: "Amount must be greater than 0",
        }));
      } else {
        setErrors((prev) => ({ ...prev, amount: "" }));
      }
    } else {
      if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
    }
  };

  const handleInvoiceSelect = async (invoiceNumber) => {
    if (!invoiceNumber) {
      setForm((prev) => ({
        ...prev,
        invoiceNumber: "",
        invoiceDate: "",
        amount: "",
        customerName: "",
        customerAddress: "",
        destinationAccount: "",
      }));
      setInvoiceDueAmount(0);
      setMrCashInfo(null);
      setIsMrInStockTransfer(false);
      setSelectedSale(null);
      return;
    }

    const sale = allSales.find((s) => s.invoiceNumber === invoiceNumber);
    if (!sale) return;

    // ── FIX: Calculate effective due (subtract already-collected amounts) ──
    const alreadyCollected =
      typeof usedInvoices === "object" && !(usedInvoices instanceof Set)
        ? usedInvoices[invoiceNumber] || 0
        : 0;
    const effectiveDue = Math.max(0, (sale.dueAmount || 0) - alreadyCollected);

    if (effectiveDue <= 0) {
      showToast(
        "error",
        `Invoice "${invoiceNumber}" has no outstanding due amount.`,
      );
      return;
    }

    setInvoiceDueAmount(effectiveDue);
    setSelectedSale(sale);

    const resolvedAddress = resolveAddress(
      sale,
      customerById,
      customerByCode,
      customerByName,
    );

    setForm((prev) => ({
      ...prev,
      invoiceNumber,
      invoiceDate: sale.invoiceDate ? sale.invoiceDate.split("T")[0] : "",
      customerName: sale.customerName || "",
      customerAddress: resolvedAddress,
      amount: effectiveDue.toFixed(2),
      destinationAccount: "",
    }));
    setErrors((prev) => ({
      ...prev,
      invoiceNumber: "",
      customerName: "",
      destinationAccount: "",
      amount: "",
    }));

    if (!resolvedAddress && sale.customerId && !staticLoading) {
      try {
        const res = await axios.get(
          `${backendUrl}/api/customers/${sale.customerId}`,
        );
        const cust = res.data?.customer || res.data?.data || res.data;
        if (cust) {
          const addr = pickAddress(cust);
          if (addr) {
            setForm((prev) => ({ ...prev, customerAddress: addr }));
            setCustomerById((prev) => ({
              ...prev,
              [String(sale.customerId)]: { addr },
            }));
          }
        }
      } catch (fetchErr) {
        console.warn("Address fetch by ID failed:", fetchErr.message);
      }
    }

    const mrName = sale.mrName;
    if (mrName && mrName.trim() !== "" && mrName.toLowerCase() !== "unknown") {
      setMrCashLoading(true);
      try {
        const mrCashRes = await axios.get(`${backendUrl}/api/mr-cash`);
        const allMrCaches = mrCashRes.data?.data || [];
        const mrCashRecord = allMrCaches.find(
          (m) => m.mrName?.toLowerCase().trim() === mrName.toLowerCase().trim(),
        );
        if (mrCashRecord) {
          setIsMrInStockTransfer(true);
          setMrCashInfo({
            _id: mrCashRecord._id,
            mrName: mrCashRecord.mrName,
            currentCash: mrCashRecord.currentCash || 0,
          });
        } else {
          setIsMrInStockTransfer(false);
          setMrCashInfo(null);
        }
      } catch (err) {
        console.error("MR cash fetch error:", err);
        setIsMrInStockTransfer(false);
        setMrCashInfo(null);
      } finally {
        setMrCashLoading(false);
      }
    } else {
      setIsMrInStockTransfer(false);
      setMrCashInfo(null);
    }
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const validate = () => {
    const newErrors = {};
    if (!form.invoiceNumber)
      newErrors.invoiceNumber = "Invoice Number is required";
    if (!form.customerName)
      newErrors.customerName = "Customer Name is required";
    if (!isMrInStockTransfer && !form.destinationAccount)
      newErrors.destinationAccount = "Destination Account is required";
    if (!form.date) newErrors.date = "Date is required";
    const amtNum = parseFloat(form.amount);
    if (!form.amount || isNaN(amtNum) || amtNum <= 0)
      newErrors.amount = "Valid amount is required";
    else if (invoiceDueAmount > 0 && amtNum > invoiceDueAmount)
      newErrors.amount = `Cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    const amount = parseFloat(form.amount);
    let destinationName = "";

    if (isMrInStockTransfer && mrCashInfo) {
      destinationName = mrCashInfo.mrName;
    } else {
      const destOpt = destinationOptions.find(
        (d) => d.value === form.destinationAccount,
      );
      destinationName = destOpt?.label || "";
    }

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
      accountType: isMrInStockTransfer
        ? "MR Cash"
        : destinationName || "Cash Balance",
      remarks:
        form.remarks || `Credit collection from invoice ${form.invoiceNumber}`,
    };

    setSubmitting(true);
    try {
      // ── Step 1: Post the transaction ─────────────────────────────────────
      const response = await axios.post(
        `${backendUrl}/api/transactions`,
        payload,
      );

      if (!response.data.success) {
        throw new Error(response.data.message || "Transaction failed");
      }

      // ── Step 2: Update the sale's paidAmount / dueAmount ─────────────────
      // Calculate new paid and due amounts for this sale
      if (selectedSale) {
        const currentPaid = parseFloat(selectedSale.paidAmount) || 0;
        const currentTotal = parseFloat(selectedSale.totalAmount) || 0;
        const newPaidAmount = Math.min(currentPaid + amount, currentTotal);
        const newDueAmount = Math.max(0, currentTotal - newPaidAmount);

        try {
          await axios.post(
            `${backendUrl}/api/reports/outstanding-collections/bulk-update`,
            {
              updates: [
                {
                  invoiceNumber: form.invoiceNumber,
                  totalAmount: currentTotal,
                  paidAmount: newPaidAmount,
                  creditDays: selectedSale.creditDays || 30,
                  remarks: `Payment collected: $${amount.toFixed(2)} on ${form.date}`,
                },
              ],
            },
          );
        } catch (updateErr) {
          // Don't fail the whole operation — transaction was saved successfully.
          // Log it and warn the user to refresh.
          console.error("Sale due amount update failed:", updateErr);
          showToast(
            "warning",
            "Transaction saved but sale amount update failed. Please refresh.",
          );
        }
      }

      _cache.ts = 0;
      showToast(
        "success",
        `Transaction added — $${amount.toFixed(2)} collected from invoice ${form.invoiceNumber}`,
      );
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Transaction submission error:", err);
      showToast(
        "error",
        err.response?.data?.message ||
          err.message ||
          "Failed to add transaction",
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

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative z-10 shadow-2xl">
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
            {/* ① Category Type */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Category Type <span className="text-red-500">*</span>
              </label>
              <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm">
                {categoryLabel}
              </div>
            </div>

            {/* ② Invoice Number */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Invoice Number <span className="text-red-500">*</span>
              </label>
              <InvoiceDropdown
                value={form.invoiceNumber}
                onChange={handleInvoiceSelect}
                options={allInvoiceOptions}
                disabled={invoicesLoading}
                loading={invoicesLoading}
              />
              {errors.invoiceNumber && (
                <p className="text-red-500 text-xs">{errors.invoiceNumber}</p>
              )}
              {allInvoiceOptions.length <= 1 && !invoicesLoading && (
                <p className="text-xs text-orange-500">
                  No outstanding invoices found.
                </p>
              )}
            </div>

            {/* ③ Customer Name */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Customer Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.customerName}
                readOnly
                placeholder="Auto-filled on invoice selection"
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-gray-50 cursor-not-allowed ${
                  errors.customerName ? "border-red-500" : "border-gray-200"
                } text-gray-700`}
              />
              {errors.customerName && (
                <p className="text-red-500 text-xs">{errors.customerName}</p>
              )}
              {!form.invoiceNumber && (
                <p className="text-xs text-gray-400">Select an invoice first</p>
              )}
            </div>

            {/* ④ Destination Account OR MR Cash balance */}
            <div className="space-y-1">
              {mrCashLoading ? (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Destination
                  </label>
                  <div className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm animate-pulse">
                    Checking MR cash...
                  </div>
                </>
              ) : isMrInStockTransfer && mrCashInfo ? (
                <>
                  <label className="block text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Wallet size={14} className="text-indigo-500" />
                    MR Cash Balance
                  </label>
                  <div className="w-full px-3 py-3 border border-indigo-200 rounded-lg bg-indigo-50 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-indigo-800">
                        {mrCashInfo.mrName}
                      </p>
                      <div className="text-right">
                        <p className="text-xs text-indigo-500">Current Cash</p>
                        <p className="text-lg font-bold text-indigo-700">
                          $
                          {mrCashInfo.currentCash.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-indigo-500">
                    Collection will be added to this MR's current cash
                  </p>
                </>
              ) : (
                <>
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
                    disabled={staticLoading || !form.invoiceNumber}
                  >
                    <option value="">
                      {staticLoading
                        ? "Loading accounts..."
                        : "Select Destination Account"}
                    </option>
                    {destinationOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label} (Balance: ${d.totalAmount.toFixed(2)})
                      </option>
                    ))}
                  </select>
                  {!form.invoiceNumber && !staticLoading && (
                    <p className="text-xs text-gray-400">
                      Select an invoice first
                    </p>
                  )}
                  {errors.destinationAccount && (
                    <p className="text-red-500 text-xs">
                      {errors.destinationAccount}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* ⑤ Date */}
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

            {/* ⑥ Amount */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Amount ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={handleAmountChange}
                placeholder="Enter amount"
                disabled={!form.invoiceNumber}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 ${
                  errors.amount ? "border-red-500" : "border-gray-300"
                } ${!form.invoiceNumber ? "bg-gray-50 cursor-not-allowed" : ""}`}
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

            {/* ⑦ Invoice Date */}
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

            {/* ⑧ Customer Address */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Customer Address
              </label>
              <input
                type="text"
                value={form.customerAddress}
                readOnly
                placeholder={
                  form.invoiceNumber
                    ? "No address on record"
                    : "Auto-filled on invoice selection"
                }
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
              />
            </div>

            {/* ⑨ Remarks */}
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
              disabled={submitting || invoicesLoading || mrCashLoading}
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
  const [showAddTxModal, setShowAddTxModal] = useState(false);

  const visiblePages = useVisiblePages(
    pagination.currentPage,
    pagination.totalPages,
  );
  const getSerialNumber = (index) =>
    (pagination.currentPage - 1) * 7 + index + 1;

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

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchOutstandingCollections(1, searchTerm);
    }, 500);
    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

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
      let fileName =
        dateRange.startDate && dateRange.endDate
          ? `outstanding-collections-${dateRange.startDate.replace(/-/g, "")}-to-${dateRange.endDate.replace(/-/g, "")}`
          : `outstanding-collections-${new Date().toISOString().split("T")[0].replace(/-/g, "")}`;
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
          .filter((item) => item.invoiceNumber);
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
          let display = `${formatDateForDisplay(customDateRange.startDate)} to ${formatDateForDisplay(customDateRange.endDate)}`;
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
    if (
      !pagination.totalRecords ||
      pagination.totalRecords === 0 ||
      pagination.totalPages <= 1
    )
      return null;
    const startItem = (pagination.currentPage - 1) * 7 + 1;
    const endItem = Math.min(
      pagination.currentPage * 7,
      pagination.totalRecords,
    );
    return (
      <div className="flex items-center justify-between mt-4 px-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handlePageChange(pagination.currentPage - 1)}
            disabled={!pagination.hasPrev}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasPrev ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
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
                className={`min-w-[40px] px-3 py-2 rounded-lg ${page === pagination.currentPage ? "bg-indigo-600 text-white cursor-default" : typeof page === "number" ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-transparent text-gray-500 cursor-default"}`}
                disabled={typeof page !== "number"}
              >
                {page}
              </button>
            ))}
          </div>
          <button
            onClick={() => handlePageChange(pagination.currentPage + 1)}
            disabled={!pagination.hasNext}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg ${pagination.hasNext ? "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="text-orange-500" size={28} />
          <h1 className="text-2xl font-bold">Outstanding Collection</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddTxModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
          >
            <Plus size={16} /> Add New Transaction
          </button>
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
              placeholder="Search by invoice or customer"
              className="pl-9 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-60"
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
          <button
            onClick={handleImportClick}
            disabled={isUploading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${isUploading ? "bg-purple-400 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700 cursor-pointer"}`}
          >
            <Upload size={16} />
            {isUploading ? "Uploading..." : "Upload Excel"}
          </button>
          <button
            onClick={exportToExcel}
            disabled={isExportDisabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg ${isExportDisabled ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-200 hover:bg-gray-300 text-gray-700 cursor-pointer"}`}
          >
            <Download size={16} />
            {exportLoading ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {["all", "currentMonth", "janToPreviousMonth", "custom"].map((tab) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors ${selectedTab === tab ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            {tab === "all"
              ? "All Records"
              : tab === "currentMonth"
                ? `Current Month (${getCurrentMonthName()} ${getCurrentYear()})`
                : tab === "janToPreviousMonth"
                  ? getJanToPreviousMonthRange().label
                  : "Custom Filter"}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 text-sm text-gray-600">
        <Filter size={14} />
        <span>
          Active Filter: <strong>{getActiveFilterDisplay()}</strong> (
          {pagination.totalRecords} records found)
        </span>
      </div>

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
            <p className="text-sm text-gray-500">Total Invoices</p>
            <p className="text-2xl font-bold">
              {data.summary.totalInvoices || 0}
            </p>
          </div>
          <User className="text-blue-400" size={36} />
        </div>
        <div className="border border-green-300 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Total Records</p>
            <p className="text-2xl font-bold">{pagination.totalRecords || 0}</p>
          </div>
          <Receipt className="text-green-400" size={36} />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Sr.No
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Invoice Number
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Invoice Date
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
              data.records.map((record, index) => (
                <tr
                  key={record.invoiceNumber || index}
                  className="border-b hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-600">
                    {getSerialNumber(index)}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-indigo-700">
                    {record.invoiceNumber || "N/A"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm">
                    {record.invoiceDate
                      ? formatDateToReadable(record.invoiceDate)
                      : "N/A"}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <div>{record.customerName}</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {record.customerCode || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Phone size={12} />
                      {record.phone || "N/A"}
                    </div>
                    {record.email && record.email !== "N/A" && (
                      <div className="flex items-center gap-1 text-gray-500 text-xs mt-1">
                        <Mail size={12} />
                        {record.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    ${(record.totalOutstandingAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-600">
                    ${(record.overdueAmount || 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-medium ${record.overdueDays > 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {record.overdueDays > 0
                        ? `${record.overdueDays} days`
                        : "On Time"}
                    </span>
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

      <AddCreditCollectionModal
        isOpen={showAddTxModal}
        onClose={() => setShowAddTxModal(false)}
        onSuccess={handleTxSuccess}
      />

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
                  className={`px-5 py-2 rounded-lg cursor-pointer ${isUploading ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-gray-300 hover:bg-gray-400 text-gray-700"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSubmit}
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg text-white ${isUploading || parsedData.length === 0 ? "bg-indigo-400 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 cursor-pointer"}`}
                >
                  {isUploading ? "Uploading…" : `Upload (${parsedData.length})`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

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
