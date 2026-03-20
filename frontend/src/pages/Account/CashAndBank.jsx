import {
  Search,
  Download,
  X,
  Plus,
  Trash2,
  Edit,
  Settings,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import ReactDOM from "react-dom";
import axios from "axios";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { useVisiblePages } from "../../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../../utils/dateUtil.js";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const ITEMS_PER_PAGE = 7;

const formatDateForInput = (dateString) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("en", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateString;
  }
};

const parseDateFromInput = (dateString) => {
  if (!dateString) return "";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return dateString;
    const parts = dateString.split(" ");
    if (parts.length === 3) {
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
        (m) => m.toLowerCase() === parts[1].toLowerCase(),
      );
      if (monthIndex !== -1) {
        const date = new Date(parts[2], monthIndex, parts[0]);
        return date.toISOString().split("T")[0];
      }
    }
    return dateString;
  } catch {
    return dateString;
  }
};

const getDisplayValue = (value, options) => {
  try {
    if (!value && value !== 0) return "--";
    if (typeof value === "object" && value !== null)
      return (
        value.name || value.label || value.title || value.toString() || "--"
      );
    if (typeof value === "string" && options && Array.isArray(options)) {
      const option = options.find(
        (opt) => opt.value === value || opt.value?.toString() === value,
      );
      return option ? option.label : value;
    }
    if (typeof value === "number") return value.toString();
    return value ? value.toString() : "--";
  } catch {
    return "--";
  }
};

const useDropdownOptions = () => {
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [sourceOptions, setSourceOptions] = useState([]);
  const [destinationOptions, setDestinationOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDropdownOptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const categoryResponse = await axios.get(
        `${backendUrl}/api/accounts/category-type`,
      );
      let categoriesData = [];
      if (categoryResponse.data && Array.isArray(categoryResponse.data))
        categoriesData = categoryResponse.data;
      else if (
        categoryResponse.data?.data &&
        Array.isArray(categoryResponse.data.data)
      )
        categoriesData = categoryResponse.data.data;
      setCategoryOptions(
        categoriesData.map((cat) => ({ value: cat._id, label: cat.name })),
      );

      const destinationResponse = await axios.get(
        `${backendUrl}/api/accounts/destinations`,
      );
      let destinationsData = [];
      if (destinationResponse.data && Array.isArray(destinationResponse.data))
        destinationsData = destinationResponse.data;
      else if (
        destinationResponse.data?.data &&
        Array.isArray(destinationResponse.data.data)
      )
        destinationsData = destinationResponse.data.data;
      const destinations = destinationsData.map((dest) => ({
        value: dest._id,
        label: dest.name,
        totalAmount: dest.totalAmount || 0,
      }));
      setDestinationOptions(destinations);
      setSourceOptions(destinations);

      const supplierResponse = await axios.get(`${backendUrl}/api/suppliers`);
      let suppliers = [];
      if (supplierResponse.data && Array.isArray(supplierResponse.data))
        suppliers = supplierResponse.data;
      else if (
        supplierResponse.data?.data &&
        Array.isArray(supplierResponse.data.data)
      )
        suppliers = supplierResponse.data.data;
      setSupplierOptions(
        suppliers.map((s) => ({ value: s._id, label: s.name })),
      );
    } catch (err) {
      setError(err.message);
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
        className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 text-left ${error ? "border-red-500" : "border-gray-300"} ${disabled ? "bg-gray-200 cursor-not-allowed" : "bg-white cursor-pointer"}`}
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
          {options.map((option) => (
            <div
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`p-2 cursor-pointer hover:bg-indigo-50 ${value === option.value ? "bg-indigo-100 text-indigo-700" : ""}`}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// useInvoiceOptions — filters out already-used and fully-paid invoices
// ============================================================================
const useInvoiceOptions = (categoryName = "", editInvoiceNumber = "") => {
  const [sales, setSales] = useState([]);
  const [usedInvoiceNumbers, setUsedInvoiceNumbers] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSales = async () => {
    setLoading(true);
    try {
      const [salesRes, txRes] = await Promise.all([
        axios.get(`${backendUrl}/api/sales/all`),
        axios.get(`${backendUrl}/api/transactions`),
      ]);
      const allSales = salesRes.data?.summaries || [];
      setSales(allSales);

      const allTx = txRes.data?.data || [];
      const usedSet = new Set(
        allTx
          .filter((tx) => tx.invoiceNo && tx.invoiceNo !== "NA")
          .map((tx) => tx.invoiceNo),
      );
      if (editInvoiceNumber) usedSet.delete(editInvoiceNumber);
      setUsedInvoiceNumbers(usedSet);
      setError(null);
    } catch (err) {
      setError(err.message);
      setSales([]);
      setUsedInvoiceNumbers(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const getInvoiceOptions = useCallback(() => {
    if (loading)
      return [{ value: "", label: "Loading invoices...", disabled: true }];
    if (error || sales.length === 0)
      return [{ value: "", label: "No invoices available", disabled: true }];

    let filteredSales = sales;
    const cat = categoryName?.toLowerCase() || "";

    if (cat.includes("cash sale")) {
      filteredSales = sales.filter((s) => {
        const ps = s.paymentStatus?.toLowerCase() || "";
        return ps === "cash" || ps === "paid";
      });
    } else if (cat.includes("credit collection")) {
      filteredSales = sales.filter((s) => {
        const ps = s.paymentStatus?.toLowerCase() || "";
        const isPending = s.pendingAmountPaid?.toLowerCase() !== "paid";
        return (
          isPending &&
          (ps === "credit" ||
            ps === "partial paid" ||
            ps === "unpaid" ||
            ps === "due")
        );
      });
    }

    const uniqueInvoices = [
      ...new Set(
        filteredSales
          .map((s) => s.invoiceNumber)
          .filter(Boolean)
          .filter((inv) => !usedInvoiceNumbers.has(inv)),
      ),
    ];

    return [
      { value: "", label: "Select Invoice Number" },
      ...uniqueInvoices.map((inv) => ({ value: inv, label: inv })),
    ];
  }, [sales, loading, error, categoryName, usedInvoiceNumbers]);

  const getFilteredSales = useCallback(() => {
    const cat = categoryName?.toLowerCase() || "";
    if (cat.includes("cash sale"))
      return sales.filter((s) => {
        const ps = s.paymentStatus?.toLowerCase() || "";
        return ps === "cash" || ps === "paid";
      });
    if (cat.includes("credit collection"))
      return sales.filter((s) => {
        const ps = s.paymentStatus?.toLowerCase() || "";
        const isPending = s.pendingAmountPaid?.toLowerCase() !== "paid";
        return (
          isPending &&
          (ps === "credit" ||
            ps === "partial paid" ||
            ps === "unpaid" ||
            ps === "due")
        );
      });
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

// ============================================================================
// AddTransactionModal
// KEY CHANGE: For Credit Collection, Amount field shows dueAmount (not totalAmount)
//             and is editable (user can enter partial amount ≤ dueAmount)
// ============================================================================
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
  const [destinationAccountBalance, setDestinationAccountBalance] = useState(0);
  const [originalAmount, setOriginalAmount] = useState(0);
  const [invoiceGloballyChecked, setInvoiceGloballyChecked] = useState(false);
  const [invoiceCheckLoading, setInvoiceCheckLoading] = useState(false);
  // For credit collection: track the invoice's dueAmount to enforce max
  const [invoiceDueAmount, setInvoiceDueAmount] = useState(0);

  const getCategoryName = useMemo(() => {
    if (!form.categoryType) return "";
    const cat = categoryOptions.find((c) => c.value === form.categoryType);
    return cat ? cat.label : "";
  }, [form.categoryType, categoryOptions]);

  const isCreditCollection = useMemo(
    () => getCategoryName.toLowerCase().includes("credit collection"),
    [getCategoryName],
  );

  const editInvoiceNumber =
    isEdit && editData?.invoiceNumber ? editData.invoiceNumber : "";
  const {
    sales,
    filteredSales,
    loading: salesLoading,
    getInvoiceOptions,
    refetch: refetchSales,
  } = useInvoiceOptions(getCategoryName, editInvoiceNumber);

  const requiresSupplier = useMemo(() => {
    const cn = getCategoryName.toLowerCase();
    return cn.includes("payment inward") || cn.includes("remittance");
  }, [getCategoryName]);
  const isRemittance = useMemo(
    () => getCategoryName.toLowerCase().includes("remittance"),
    [getCategoryName],
  );
  const isPaymentInward = useMemo(
    () => getCategoryName.toLowerCase().includes("payment inward"),
    [getCategoryName],
  );
  const isPaymentOutward = useMemo(
    () => getCategoryName.toLowerCase().includes("payment outward"),
    [getCategoryName],
  );
  const isDepositOrWithdraw = useMemo(() => {
    const cn = getCategoryName.toLowerCase();
    return cn.includes("withdraw") || cn.includes("deposit");
  }, [getCategoryName]);
  const isDeposit = useMemo(
    () => getCategoryName.toLowerCase().includes("deposit"),
    [getCategoryName],
  );
  const isWithdraw = useMemo(
    () => getCategoryName.toLowerCase().includes("withdraw"),
    [getCategoryName],
  );
  const requiresInvoiceDropdown = useMemo(() => {
    const cn = getCategoryName.toLowerCase();
    return cn.includes("cash sale") || cn.includes("credit collection");
  }, [getCategoryName]);
  const requiresInvoiceFields = useMemo(() => {
    if (!form.categoryType) return false;
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

  const getFilteredSourceOptions = useMemo(() => {
    if (!isDepositOrWithdraw) return sourceOptions;
    return sourceOptions.filter(
      (s) => !form.destination || s.value !== form.destination,
    );
  }, [sourceOptions, form.destination, isDepositOrWithdraw]);

  const getFilteredDestinationOptions = useMemo(() => {
    if (!isDepositOrWithdraw) return destinationOptions;
    return destinationOptions.filter(
      (d) => !form.source || d.value !== form.source,
    );
  }, [destinationOptions, form.source, isDepositOrWithdraw]);

  const invoiceOptions = useMemo(
    () => getInvoiceOptions(),
    [getInvoiceOptions],
  );

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
        // For credit collection: show dueAmount hint and allow partial
        hint:
          isCreditCollection && invoiceDueAmount > 0
            ? `Max (Due Amount): $${invoiceDueAmount.toFixed(2)}`
            : null,
      },
    ];

    if (requiresSupplier) {
      baseFields.splice(1, 0, {
        key: "supplier",
        label: "Supplier Name",
        type: "select",
        required: true,
        options: supplierOptions,
        layout: "half",
      });
      if (isRemittance)
        baseFields.splice(2, 0, {
          key: "source",
          label: "Source Account",
          type: "select",
          required: true,
          options: sourceOptions,
          layout: "half",
        });
      else if (isPaymentInward)
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: destinationOptions,
          layout: "half",
        });
    } else if (isPaymentOutward) {
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
    } else if (isDepositOrWithdraw) {
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
    } else {
      if (requiresInvoiceDropdown) {
        baseFields.splice(1, 0, {
          key: "invoiceNumber",
          label: "Invoice Number",
          type: "invoiceDropdown",
          required: true,
          options: invoiceOptions,
          layout: "half",
        });
      } else if (requiresInvoiceFields) {
        baseFields.splice(1, 0, {
          key: "invoiceNumber",
          label: "Invoice Number",
          type: "text",
          required: true,
          layout: "half",
        });
      }
      if (requiresInvoiceDropdown || requiresInvoiceFields) {
        baseFields.splice(2, 0, {
          key: "destination",
          label: "Destination Account",
          type: "select",
          required: true,
          options: destinationOptions,
          layout: "half",
        });
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
          },
        );
      }
    }

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
    isCreditCollection,
    invoiceDueAmount,
  ]);

  const initializeFormData = () => {
    const initialData = {};
    formFields.forEach((field) => {
      if (field.type === "date")
        initialData[field.key] = new Date().toISOString().split("T")[0];
      else if (field.key === "finalAmount") initialData[field.key] = "0.00";
      else initialData[field.key] = "";
    });
    return initialData;
  };

  useEffect(() => {
    if (isOpen) {
      if (isEdit && editData) {
        const findIdByLabel = (options, label) => {
          if (!label || label === "--") return null;
          const opt = options.find((o) => o.label === label);
          return opt ? opt.value : null;
        };
        const categoryId =
          editData.categoryType &&
          (categoryOptions.find((o) => o.value === editData.categoryType)
            ? editData.categoryType
            : findIdByLabel(categoryOptions, editData.categoryType));
        const sourceId =
          (editData.source || editData.sourceAccount) &&
          (sourceOptions.find(
            (o) => o.value === (editData.source || editData.sourceAccount),
          )
            ? editData.source || editData.sourceAccount
            : findIdByLabel(
                sourceOptions,
                editData.source || editData.sourceAccount,
              ));
        const destId =
          editData.destination &&
          editData.destination !== "--" &&
          (destinationOptions.find((o) => o.value === editData.destination)
            ? editData.destination
            : findIdByLabel(destinationOptions, editData.destination));
        const supplierId =
          editData.supplier &&
          (supplierOptions.find((o) => o.value === editData.supplier)
            ? editData.supplier
            : findIdByLabel(supplierOptions, editData.supplier));
        setForm({
          ...editData,
          categoryType: categoryId || editData.categoryType,
          source: sourceId || editData.source || editData.sourceAccount,
          destination: destId || editData.destination,
          supplier: supplierId || editData.supplier,
          remarks: editData.remarks || "",
        });
        setInvoiceDataFetched(true);
        setOriginalAmount(editData.amount || 0);
        setInvoiceGloballyChecked(true);
      } else {
        setForm(initializeFormData());
        setInvoiceDataFetched(false);
        setSourceAccountBalance(0);
        setDestinationAccountBalance(0);
        setOriginalAmount(0);
        setInvoiceGloballyChecked(false);
        setInvoiceDueAmount(0);
      }
      setErrors({});
      refetchSales();
    }
  }, [
    isOpen,
    isEdit,
    editData,
    activeTab,
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
  ]);

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

  useEffect(() => {
    if (form.source) {
      const selected = sourceOptions.find((o) => o.value === form.source);
      setSourceAccountBalance(selected?.totalAmount || 0);
    } else setSourceAccountBalance(0);
  }, [form.source, sourceOptions]);

  useEffect(() => {
    if (form.destination) {
      const selected = destinationOptions.find(
        (o) => o.value === form.destination,
      );
      setDestinationAccountBalance(selected?.totalAmount || 0);
    } else setDestinationAccountBalance(0);
  }, [form.destination, destinationOptions]);

  useEffect(() => {
    if (form.categoryType) {
      setForm((prev) => {
        const newForm = { ...prev };
        if (!requiresSupplier && !isPaymentOutward && newForm.supplier)
          newForm.supplier = "";
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
        if (
          !isDepositOrWithdraw &&
          !isPaymentOutward &&
          !isRemittance &&
          newForm.source
        )
          newForm.source = "";
        if (!isDeposit) {
          if (newForm.exchangeLoss) newForm.exchangeLoss = "";
          if (newForm.finalAmount) newForm.finalAmount = "0.00";
        }
        return newForm;
      });
      setInvoiceDataFetched(false);
      setInvoiceGloballyChecked(false);
      setSourceAccountBalance(0);
      setDestinationAccountBalance(0);
      setOriginalAmount(0);
      setInvoiceDueAmount(0);
    }
  }, [form.categoryType]);

  const findSaleByInvoice = (invoiceNumber) =>
    filteredSales.find((s) => s.invoiceNumber === invoiceNumber) ||
    sales.find((s) => s.invoiceNumber === invoiceNumber);

  const checkInvoiceGlobally = async (invoiceNumber) => {
    if (!invoiceNumber || invoiceNumber.trim() === "") return true;
    try {
      setInvoiceCheckLoading(true);
      const excludeId = isEdit && editData?._id ? editData._id : undefined;
      const params = { invoiceNumber: invoiceNumber.trim() };
      if (excludeId) params.excludeId = excludeId;
      const response = await axios.get(
        `${backendUrl}/api/transactions/check-invoice`,
        { params },
      );
      if (response.data.exists) {
        const existing = response.data.existingTransaction;
        showToast(
          "error",
          `Invoice "${invoiceNumber}" already has a transaction in "${existing.accountType || "another tab"}" (${existing.categoryType}).`,
        );
        setInvoiceGloballyChecked(false);
        return false;
      }
      setInvoiceGloballyChecked(true);
      return true;
    } catch {
      setInvoiceGloballyChecked(true);
      return true;
    } finally {
      setInvoiceCheckLoading(false);
    }
  };

  const fetchSalesData = async (invoiceNumber) => {
    if (
      !invoiceNumber ||
      invoiceNumber.trim() === "" ||
      (!requiresInvoiceFields && !requiresInvoiceDropdown)
    )
      return;
    try {
      setIsFetchingSales(true);
      if (requiresInvoiceDropdown) {
        const saleRecord = findSaleByInvoice(invoiceNumber);
        if (saleRecord) {
          const isGloballyUnique = await checkInvoiceGlobally(invoiceNumber);
          if (!isGloballyUnique) {
            setForm((prev) => ({
              ...prev,
              invoiceNumber: "",
              invoiceDate: "",
              customerName: "",
              customerAddress: "",
              amount: "",
            }));
            setInvoiceDataFetched(false);
            setInvoiceDueAmount(0);
            return;
          }

          // KEY FIX: For credit collection use dueAmount; for cash sale use totalAmount
          const amountToSet = isCreditCollection
            ? saleRecord.dueAmount || saleRecord.totalAmount || ""
            : saleRecord.totalAmount || saleRecord.amount || "";

          setInvoiceDueAmount(
            isCreditCollection ? saleRecord.dueAmount || 0 : 0,
          );

          setForm((prev) => ({
            ...prev,
            invoiceNumber: saleRecord.invoiceNumber || "",
            invoiceDate:
              saleRecord.invoiceDate?.split("T")[0] ||
              new Date().toISOString().split("T")[0],
            customerName:
              saleRecord.customerName || saleRecord.customer?.name || "",
            customerAddress:
              saleRecord.customerAddress ||
              saleRecord.customer?.address ||
              saleRecord.billingAddress ||
              saleRecord.shippingAddress ||
              saleRecord.address ||
              "",
            amount: amountToSet,
          }));
          setInvoiceDataFetched(true);
        } else {
          showToast(
            "error",
            `Invoice ${invoiceNumber} not found or not available for ${getCategoryName}`,
          );
          setForm((prev) => ({
            ...prev,
            invoiceDate: "",
            customerName: "",
            customerAddress: "",
            amount: "",
          }));
          setInvoiceDataFetched(false);
          setInvoiceDueAmount(0);
        }
      } else if (requiresInvoiceFields) {
        const salesResponse = await axios.get(
          `${backendUrl}/api/accounts/alternative?invoiceNumber=${invoiceNumber}`,
        );
        const salesData = salesResponse.data;
        if (salesData.data && salesData.data.length > 0) {
          const isGloballyUnique = await checkInvoiceGlobally(invoiceNumber);
          if (!isGloballyUnique) {
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
            customerName:
              saleRecord.customerName || saleRecord.customer?.name || "",
            customerAddress:
              saleRecord.customerAddress ||
              saleRecord.customer?.address ||
              saleRecord.billingAddress ||
              saleRecord.shippingAddress ||
              "",
            amount: saleRecord.amount || saleRecord.totalAmount || "",
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
      if (requiresInvoiceFields)
        showToast("error", "Error fetching invoice details");
    } finally {
      setIsFetchingSales(false);
    }
  };

  const getAvailableBalanceForUpdate = useCallback(() => {
    if (!form.source) return sourceAccountBalance;
    if (isEdit && (isDeposit || isWithdraw))
      return sourceAccountBalance + originalAmount;
    return sourceAccountBalance;
  }, [
    isEdit,
    form.source,
    sourceAccountBalance,
    originalAmount,
    isDeposit,
    isWithdraw,
  ]);

  const handleInputChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));

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
      setInvoiceGloballyChecked(false);
      setSourceAccountBalance(0);
      setDestinationAccountBalance(0);
      setOriginalAmount(0);
      setInvoiceDueAmount(0);
    }

    if (field === "source" && value) {
      const selected = sourceOptions.find((o) => o.value === value);
      if (selected) setSourceAccountBalance(selected.totalAmount || 0);
    }
    if (field === "destination" && value) {
      const selected = destinationOptions.find((o) => o.value === value);
      if (selected) setDestinationAccountBalance(selected.totalAmount || 0);
    }

    if (field === "invoiceNumber" && value) {
      setInvoiceGloballyChecked(false);
      fetchSalesData(value);
    }
    if (field === "invoiceNumber" && !value) {
      setInvoiceGloballyChecked(false);
      setInvoiceDataFetched(false);
      setInvoiceDueAmount(0);
    }

    // For credit collection, validate amount against dueAmount
    if (
      field === "amount" &&
      value &&
      isCreditCollection &&
      invoiceDueAmount > 0
    ) {
      const amountValue = parseFloat(value) || 0;
      if (amountValue > invoiceDueAmount) {
        setErrors((prev) => ({
          ...prev,
          amount: `Amount cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`,
        }));
      } else if (errors.amount) {
        setErrors((prev) => ({ ...prev, amount: "" }));
      }
    }

    if (
      field === "amount" &&
      value &&
      form.source &&
      (isDeposit || isWithdraw)
    ) {
      const amountValue = parseFloat(value) || 0;
      const availableBalance = getAvailableBalanceForUpdate();
      if (amountValue > availableBalance)
        setErrors((prev) => ({
          ...prev,
          amount: `Amount cannot exceed available balance of $${availableBalance.toFixed(2)}`,
        }));
      else if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
    }

    if (field === "exchangeLoss" && value && isDeposit && form.amount) {
      const amountValue = parseFloat(form.amount) || 0;
      const exchangeLossValue = parseFloat(value) || 0;
      if (exchangeLossValue > amountValue)
        setErrors((prev) => ({
          ...prev,
          exchangeLoss: "Exchange loss cannot exceed amount",
        }));
      else if (errors.exchangeLoss)
        setErrors((prev) => ({ ...prev, exchangeLoss: "" }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    formFields.forEach((field) => {
      if (field.readonly || field.disabled) return;
      if (field.required && !form[field.key])
        newErrors[field.key] = `${field.label} is required`;
      if (field.key === "amount" && form[field.key]) {
        const amountValue = parseFloat(form[field.key]);
        if (isNaN(amountValue) || amountValue <= 0)
          newErrors[field.key] =
            `${field.label} must be a valid positive number`;
        // For credit collection: enforce max = dueAmount
        if (
          isCreditCollection &&
          invoiceDueAmount > 0 &&
          amountValue > invoiceDueAmount
        )
          newErrors[field.key] =
            `Amount cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`;
        if ((isDeposit || isWithdraw) && form.source) {
          const available = getAvailableBalanceForUpdate();
          if (amountValue > available)
            newErrors[field.key] =
              `Amount cannot exceed available balance of $${available.toFixed(2)}`;
        }
      }
      if (field.key === "exchangeLoss" && form[field.key] && isDeposit) {
        const v = parseFloat(form[field.key]);
        const a = parseFloat(form.amount) || 0;
        if (isNaN(v) || v < 0)
          newErrors[field.key] =
            `${field.label} must be a valid positive number`;
        if (v > a) newErrors[field.key] = `Exchange loss cannot exceed amount`;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    if (
      (requiresInvoiceDropdown || requiresInvoiceFields) &&
      form.invoiceNumber
    ) {
      if (!invoiceGloballyChecked && !invoiceCheckLoading) {
        const isUnique = await checkInvoiceGlobally(form.invoiceNumber);
        if (!isUnique) return;
      }
    }

    const amount = parseFloat(form.amount) || 0;
    const exchangeLoss = parseFloat(form.exchangeLoss) || 0;
    const finalAmount = isDeposit ? amount - exchangeLoss : amount;

    const categoryOption = categoryOptions.find(
      (opt) => opt.value === form.categoryType,
    );
    const categoryName = categoryOption ? categoryOption.label : "";

    let transactionType = "sale";
    const catLower = categoryName.toLowerCase();
    if (catLower.includes("deposit")) transactionType = "deposit";
    else if (catLower.includes("withdraw")) transactionType = "withdraw";
    else if (catLower.includes("remittance")) transactionType = "remittance";
    else if (catLower.includes("payment inward"))
      transactionType = "payment inward";
    else if (catLower.includes("payment outward"))
      transactionType = "payment outward";
    else if (catLower.includes("cash sale")) transactionType = "cash sale";
    else if (catLower.includes("credit collection"))
      transactionType = "credit collection";

    const categoryTypeForPayload = categoryName;

    let sourceAccountName = "";
    if (form.source) {
      const sourceOpt = sourceOptions.find((opt) => opt.value === form.source);
      sourceAccountName = sourceOpt ? sourceOpt.label : "";
    }

    let destinationName = "";
    if (form.destination) {
      const destOpt = destinationOptions.find(
        (opt) => opt.value === form.destination,
      );
      destinationName = destOpt ? destOpt.label : "";
    }

    let supplierName = "";
    if (form.supplier) {
      const suppOpt = supplierOptions.find(
        (opt) => opt.value === form.supplier,
      );
      supplierName = suppOpt ? suppOpt.label : "";
    }

    const payload = {
      categoryType: categoryTypeForPayload,
      date: form.date,
      amount,
      exchangeLoss,
      finalAmount,
      accountType: activeTab,
      remarks: form.remarks || "",
      transactionType,
    };

    if (requiresInvoiceDropdown || requiresInvoiceFields) {
      payload.invoiceNo = form.invoiceNumber || "";
      payload.sourceAccount = "";
      payload.destination = destinationName;
      payload.invoiceDate = form.invoiceDate;
      payload.customerName = form.customerName;
      payload.customerAddress = form.customerAddress;
    } else if (requiresSupplier) {
      payload.supplier = supplierName;
      payload.invoiceNo = "NA";
      if (isRemittance) {
        payload.sourceAccount = sourceAccountName;
        payload.destination = "--";
      } else if (isPaymentInward) {
        payload.sourceAccount = "";
        payload.destination = destinationName;
      }
    } else if (isPaymentOutward) {
      payload.supplier = supplierName;
      payload.sourceAccount = sourceAccountName;
      payload.destination = "--";
      payload.invoiceNo = "NA";
    } else if (isDepositOrWithdraw) {
      payload.sourceAccount = sourceAccountName;
      payload.destination = destinationName || "--";
      payload.invoiceNo = "NA";
    } else {
      payload.invoiceNo = form.invoiceNumber || "NA";
      payload.destination = destinationName;
    }

    try {
      let response;
      if (isEdit && editData) {
        response = await axios.put(
          `${backendUrl}/api/transactions/${editData._id}`,
          payload,
        );
      } else {
        response = await axios.post(`${backendUrl}/api/transactions`, payload);
      }
      if (response.data.success) {
        onAddTransaction(response.data.data, isEdit);
        onClose();
      }
    } catch (err) {
      console.error("Transaction submission error:", err);
      showToast(
        "error",
        err.response?.data?.message || "Failed to submit transaction",
      );
    }
  };

  const handleNumericInputChange = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      // For credit collection: block input above dueAmount
      if (field === "amount" && isCreditCollection && invoiceDueAmount > 0) {
        const numericValue = parseFloat(value);
        if (!isNaN(numericValue) && numericValue > invoiceDueAmount) {
          setErrors((prev) => ({
            ...prev,
            amount: `Amount cannot exceed due amount of $${invoiceDueAmount.toFixed(2)}`,
          }));
          return;
        }
        if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
      }
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
            amount: `Amount cannot exceed available balance of $${availableBalance.toFixed(2)}`,
          }));
          return;
        }
        if (errors.amount) setErrors((prev) => ({ ...prev, amount: "" }));
      }
      handleInputChange(field, value);
    }
  };

  const handleDateInputChange = (e, field) => {
    handleInputChange(field, parseDateFromInput(e.target.value));
  };

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
            {field.key === "destination" &&
              value &&
              destinationAccountBalance > 0 && (
                <div className="mt-1 text-xs text-blue-600 font-medium">
                  Current Balance: ${destinationAccountBalance.toFixed(2)}
                </div>
              )}
            {field.key === "source" && value && sourceAccountBalance > 0 && (
              <div className="mt-1 text-xs text-green-600 font-medium">
                Current Balance: ${sourceAccountBalance.toFixed(2)}
              </div>
            )}
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
            {(isFetchingSales || invoiceCheckLoading) && (
              <div className="mt-1 text-xs text-gray-500">
                {invoiceCheckLoading
                  ? "Checking invoice availability..."
                  : "Fetching invoice details..."}
              </div>
            )}
          </div>
        );
      case "date":
        return field.key === "date" ? (
          <input
            type="date"
            value={value}
            onChange={(e) => handleDateInputChange(e, field.key)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${fieldError ? "border-red-500" : "border-gray-300"} ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
            disabled={field.disabled || false}
          />
        ) : (
          <input
            type="text"
            value={formatDateForInput(value)}
            onChange={(e) => handleDateInputChange(e, field.key)}
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${fieldError ? "border-red-500" : "border-gray-300"} ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
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
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${fieldError ? "border-red-500" : "border-gray-300"} ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
              disabled={field.disabled || false}
              placeholder={field.placeholder || ""}
            />
            {/* Credit collection: show due amount hint and allow partial payment */}
            {field.key === "amount" &&
              isCreditCollection &&
              invoiceDueAmount > 0 && (
                <div className="mt-1 text-xs text-orange-600">
                  Due Amount: ${invoiceDueAmount.toFixed(2)} — You can enter a
                  partial amount
                </div>
              )}
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
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${fieldError ? "border-red-500" : "border-gray-300"}`}
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
            className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 ${fieldError ? "border-red-500" : "border-gray-300"} ${field.disabled ? "bg-gray-200 cursor-not-allowed" : ""}`}
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
                className={`space-y-2 ${field.layout === "full" ? "md:col-span-2" : "md:col-span-1"}`}
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
                categoryOptions.length === 0 ||
                destinationOptions.length === 0 ||
                invoiceCheckLoading
              }
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              {invoiceCheckLoading
                ? "Checking..."
                : `${isEdit ? "Update" : "Add"} Transaction`}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// ImportExcelModal — unchanged from original
const ImportExcelModal = ({ isOpen, onClose, activeTab, onImportComplete }) => {
  const [uploading, setUploading] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [step, setStep] = useState(1);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const fileInputRef = useRef(null);

  const downloadTemplate = () => {
    const templateUrl = `${backendUrl}/api/transactions/import-template?accountType=${encodeURIComponent(activeTab)}`;
    const link = document.createElement("a");
    link.href = templateUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.download = `transaction-import-template-${activeTab.toLowerCase().replace(/\s+/g, "-")}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("success", "Template download started");
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      showToast("error", "Please upload Excel or CSV files only");
      return;
    }
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      setImportPreview(jsonData.slice(0, 5));
      setStep(2);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!importFile) {
      showToast("error", "Please select a file first");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", importFile);
    formData.append("accountType", activeTab);
    try {
      const response = await axios.post(
        `${backendUrl}/api/transactions/import`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      if (response.data.success) {
        setImportSummary(response.data.summary);
        setStep(3);
        showToast("success", "Import completed successfully");
      }
    } catch (error) {
      showToast(
        "error",
        error.response?.data?.message || "Failed to import transactions",
      );
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setImportFile(null);
    setImportPreview([]);
    setImportSummary(null);
    onClose();
    if (onImportComplete) onImportComplete();
  };
  const resetImport = () => {
    setStep(1);
    setImportFile(null);
    setImportPreview([]);
    setImportSummary(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (!isOpen) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative z-10">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-800">
            Import Transactions - {activeTab}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {step === 1 && (
            <div className="text-center">
              <FileSpreadsheet className="mx-auto text-gray-400" size={48} />
              <h3 className="text-lg font-semibold mt-4 mb-2">
                Upload Excel File
              </h3>
              <p className="text-gray-600 mb-4">
                Upload an Excel file with transaction data.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer mb-4"
              >
                <Download size={16} />
                Download Template
              </button>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-indigo-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mx-auto text-gray-400 mb-4" size={32} />
                <p className="text-gray-700 mb-2">
                  Click to upload or drag and drop
                </p>
                <p className="text-gray-500 text-sm">
                  Excel (.xlsx, .xls) or CSV files only
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
              {importFile && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700">
                    Selected: {importFile.name} (
                    {(importFile.size / 1024).toFixed(2)} KB)
                  </p>
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Preview Data</h3>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      {importPreview.length > 0 &&
                        Object.keys(importPreview[0]).map((key) => (
                          <th
                            key={key}
                            className="p-3 text-left text-sm font-medium"
                          >
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        {Object.values(row).map((value, idx) => (
                          <td key={idx} className="p-3 text-sm">
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <button
                  onClick={resetImport}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={resetImport}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={uploading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Importing...
                      </>
                    ) : (
                      "Confirm Import"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
          {step === 3 && importSummary && (
            <div>
              <h3 className="text-lg font-semibold mb-4 text-green-600">
                Import Successful!
              </h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {importSummary.successCount || 0}
                    </div>
                    <div className="text-sm text-gray-600">Successful</div>
                  </div>
                  <div className="text-center p-3 bg-white rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {importSummary.errorCount || 0}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetImport}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  Import Another File
                </button>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ============================================================================
// CashAndBank — main component (same as before, no changes needed here)
// ============================================================================
const CashAndBank = () => {
  const [activeTab, setActiveTab] = useState("Cash Balance");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [exportLoading, setExportLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
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

  const {
    categoryOptions,
    sourceOptions,
    destinationOptions,
    supplierOptions,
    loading: optionsLoading,
    error: optionsError,
    refetch: refetchDropdownOptions,
  } = useDropdownOptions();
  const visiblePages = useVisiblePages(currentPage, totalPages);

  const allFields = useMemo(
    () => [
      { id: "invoiceNumber", name: "Invoice No", dbName: "invoiceNumber" },
      { id: "categoryType", name: "Category Type", dbName: "categoryType" },
      { id: "source", name: "Source Account", dbName: "source" },
      { id: "destination", name: "Destination Account", dbName: "destination" },
      { id: "invoiceDate", name: "Invoice Date", dbName: "invoiceDate" },
      { id: "customerName", name: "Customer Name", dbName: "customerName" },
      {
        id: "customerAddress",
        name: "Customer Address",
        dbName: "customerAddress",
      },
      { id: "amount", name: "Amount", dbName: "amount" },
      { id: "exchangeLoss", name: "Exchange Loss", dbName: "exchangeLoss" },
      { id: "finalAmount", name: "Final Amount", dbName: "finalAmount" },
      { id: "date", name: "Date", dbName: "date" },
      { id: "description", name: "Description", dbName: "description" },
      { id: "remarks", name: "Remarks", dbName: "remarks" },
      { id: "actions", name: "Actions", dbName: "actions" },
    ],
    [],
  );

  const requiredColumns = ["invoiceNumber", "actions"];
  const availableColumns = useMemo(
    () => allFields.filter((item) => !tableColumns.includes(item.id)),
    [allFields, tableColumns],
  );
  const removableColumns = useMemo(
    () =>
      allFields.filter(
        (item) =>
          tableColumns.includes(item.id) && !requiredColumns.includes(item.id),
      ),
    [allFields, tableColumns],
  );
  const chunkedItems = useMemo(() => {
    const items =
      activeColumnTab === "add" ? availableColumns : removableColumns;
    const chunks = [];
    for (let i = 0; i < items.length; i += 2)
      chunks.push(items.slice(i, i + 2));
    return chunks;
  }, [activeColumnTab, availableColumns, removableColumns]);

  const toggleItem = (id) => {
    if (id === "all") {
      if (allSelected) {
        setSelectedItems([]);
        setAllSelected(false);
      } else {
        setSelectedItems(chunkedItems.flat().map((item) => item.id));
        setAllSelected(true);
      }
    } else {
      const updated = selectedItems.includes(id)
        ? selectedItems.filter((i) => i !== id)
        : [...selectedItems, id];
      setSelectedItems(updated);
      setAllSelected(updated.length === chunkedItems.flat().length);
    }
  };
  const handleColumnSave = () => {
    if (activeColumnTab === "add")
      setTableColumns([...tableColumns, ...selectedItems]);
    else
      setTableColumns(
        tableColumns.filter(
          (id) => !selectedItems.includes(id) || requiredColumns.includes(id),
        ),
      );
    setSelectedItems([]);
    setAllSelected(false);
    setIsColumnModalOpen(false);
  };
  const handleColumnReset = () => {
    setSelectedItems([]);
    setAllSelected(false);
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
  useEffect(() => {
    const current = chunkedItems.flat();
    setAllSelected(
      current.length > 0 && selectedItems.length === current.length,
    );
  }, [selectedItems, chunkedItems]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/transactions`);
      if (response.data.success) {
        const { data: transactions, destinations } = response.data;
        const normalized = transactions.map((tx) => ({
          ...tx,
          invoiceNumber:
            tx.invoiceNo && tx.invoiceNo !== "NA"
              ? tx.invoiceNo
              : tx.invoiceNumber || "NA",
          source: tx.sourceAccount || tx.source || null,
          destination: tx.destination || tx.destinationAccount || null,
          categoryType: tx.categoryType || null,
          amount: Number(tx.amount) || 0,
          finalAmount: Number(tx.finalAmount) || 0,
        }));

        const filteredData = normalized.filter((tx) => {
          let txType = tx.transactionType?.toLowerCase() || "";
          if (txType === "expense") txType = "withdraw";
          let sourceName = tx.source
            ? typeof tx.source === "object"
              ? tx.source.name?.toLowerCase() || ""
              : tx.source.toString().toLowerCase()
            : "";
          let destinationName = tx.destination
            ? typeof tx.destination === "object"
              ? tx.destination.name?.toLowerCase() || ""
              : tx.destination.toString().toLowerCase()
            : "";
          const activeTabLower = activeTab.toLowerCase();
          if (txType === "deposit" || txType === "withdraw")
            return (
              sourceName === activeTabLower ||
              destinationName === activeTabLower
            );
          else if (txType === "remittance")
            return sourceName === activeTabLower;
          else return destinationName === activeTabLower;
        });

        const matchingDestination = destinations?.find(
          (dest) => dest.name.toLowerCase() === activeTab.toLowerCase(),
        );
        setTotalAmountTab(matchingDestination?.totalAmount || 0);
        const totalCount = filteredData.length;
        setTotalPages(Math.ceil(totalCount / ITEMS_PER_PAGE));
        setTotalCount(totalCount);
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        setData(filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE));
      }
    } catch (error) {
      console.error("Fetch error:", error);
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
          `${backendUrl}/api/transactions/${editingTransaction._id}`,
          transactionData,
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
    } catch {
      showToast("error", "Failed to save transaction");
    }
  };

  const handleEdit = (transaction) => {
    setEditingTransaction(transaction);
    setIsEditModalOpen(true);
  };
  const handleDelete = async (transaction) => {
    const confirm = await confirmDialog({
      title: "Delete Transaction",
      text: `Are you sure you want to delete <b>${transaction.title || "This transaction"}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (!confirm.isConfirmed) return;
    try {
      const response = await axios.delete(
        `${backendUrl}/api/transactions/${transaction._id}`,
      );
      if (response.data.success) {
        showToast("success", "Transaction deleted successfully");
        fetchTransactions();
        refetchDropdownOptions();
      } else showToast("error", "Failed to delete transaction");
    } catch {
      showToast("error", "Failed to delete transaction");
    }
  };

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
        `${selected.length} transaction(s) deleted successfully`,
      );
      setSelected([]);
      fetchTransactions();
      refetchDropdownOptions();
    } catch {
      showToast("error", "Failed to delete some transactions");
    }
  };

  const toggleSelect = (item) =>
    setSelected((prev) =>
      prev.some((s) => s === item._id)
        ? prev.filter((s) => s !== item._id)
        : [...prev, item._id],
    );
  const toggleSelectAll = (checked) => {
    if (checked) setSelected(currentData.map((r) => r._id));
    else setSelected([]);
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
      const displayVal =
        typeof value === "string"
          ? value
          : getDisplayValue(value, categoryOptions);
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
          {displayVal || "--"}
        </span>
      );
    }
    if (field.dbName === "amount")
      return (
        <span className="font-medium text-black">
          {(value || 0).toFixed(2)}
        </span>
      );
    if (field.dbName === "finalAmount") {
      const txType = item.transactionType?.toLowerCase() || "";
      const sourceName =
        typeof item.source === "object"
          ? item.source?.name?.toLowerCase() || ""
          : (item.source || "").toLowerCase();
      const destName =
        typeof item.destination === "object"
          ? item.destination?.name?.toLowerCase() || ""
          : (item.destination || "").toLowerCase();
      const activeTabLower = activeTab.toLowerCase();
      const isNeg =
        txType === "remittance" ||
        ((txType === "withdraw" || txType === "deposit") &&
          sourceName === activeTabLower);
      const isPos =
        (txType === "withdraw" || txType === "deposit") &&
        destName === activeTabLower;
      const val = value || 0;
      return (
        <span
          className={`font-medium ${isNeg ? "text-red-600" : isPos ? "text-green-700" : val >= 0 ? "text-green-700" : "text-red-600"}`}
        >
          {val.toFixed(2)}
        </span>
      );
    }
    if (field.dbName === "source" || field.dbName === "destination") {
      const colorClass =
        field.dbName === "source"
          ? "bg-green-50 text-green-700"
          : "bg-purple-50 text-purple-700";
      const displayVal =
        typeof value === "string"
          ? value
          : getDisplayValue(
              value,
              field.dbName === "source" ? sourceOptions : destinationOptions,
            );
      return (
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}
        >
          {displayVal || "--"}
        </span>
      );
    }
    if (field.dbName === "date" || field.dbName === "invoiceDate")
      return value ? formatDateToReadable(value) : "--";
    if (field.dbName === "remarks")
      return value ? (
        <div className="max-w-xs truncate" title={value}>
          {value}
        </div>
      ) : (
        "--"
      );
    return value ? value.toString() : "--";
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const response = await axios.get(
        `${backendUrl}/api/transactions/export`,
        {
          params: {
            accountType: activeTab,
            ...(searchTerm && { search: searchTerm }),
          },
          responseType: "blob",
        },
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute(
        "download",
        `transactions_${activeTab}_${new Date().toISOString().split("T")[0]}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("success", "Export completed successfully");
    } catch {
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
        {optionsError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <span className="text-red-700">
              Error loading dropdown options: {optionsError}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={optionsLoading || categoryOptions.length === 0}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={18} /> Add New Transaction
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Excel
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
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
            >
              <Download size={18} />
              {exportLoading ? "Exporting..." : "Export"}
            </button>
          </div>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div className="flex gap-2 flex-1">
            {accountTypes.map((tab) => (
              <button
                key={`tab-${tab}`}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-2 rounded-lg capitalize transition-colors ${activeTab === tab ? "bg-indigo-600 text-white shadow-md" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
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
                  placeholder="Search by Invoice Number or Customer"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border">
          <h3 className="text-lg font-semibold text-gray-800 mb-1">
            {activeTab} Summary
          </h3>
          <div className="text-2xl font-bold text-indigo-700">
            ${totalAmountTab.toFixed(2)}
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
                              aria-label="Select all"
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
                    className={`hover:bg-gray-50 ${index < currentData.length - 1 ? "border-b" : ""}`}
                  >
                    {allFields
                      .filter((f) => tableColumns.includes(f.id))
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
                    className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
                  >
                    {page}
                  </button>
                ),
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
                  <button
                    onClick={() => {
                      setActiveColumnTab("add");
                      setSelectedItems([]);
                      setAllSelected(false);
                    }}
                    className={`w-1/2 px-4 py-2 font-medium text-center rounded-lg ${activeColumnTab === "add" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700"}`}
                  >
                    Add Columns ({availableColumns.length})
                  </button>
                  <button
                    onClick={() => {
                      setActiveColumnTab("remove");
                      setSelectedItems([]);
                      setAllSelected(false);
                    }}
                    className={`w-1/2 px-4 py-2 font-medium text-center rounded-lg ${activeColumnTab === "remove" ? "bg-red-600 text-white" : "bg-gray-200 text-gray-700"}`}
                  >
                    Remove Columns ({removableColumns.length})
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {chunkedItems.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3">
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
            document.body,
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
        <ImportExcelModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          activeTab={activeTab}
          onImportComplete={() => {
            fetchTransactions();
            refetchDropdownOptions();
          }}
        />
      </div>
    </div>
  );
};

export default CashAndBank;
