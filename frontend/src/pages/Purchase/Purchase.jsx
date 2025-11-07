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
import PurchaseInventoryExcelDownload from "../../excels/SampleExcelDownloadPurcharsing";
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
import {
  fetchProducts as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../../pages/ProductManager/common/fetchDropdown";
import SearchableDropdown from "../../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// CORRECTED: Added productId field to store the actual product ID
const initialFormState = {
  _id: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiryDate: "",
  productId: "", // NEW: Store product ID separately
  productName: "", // Store product name for display
  supplierName: "",
  quantityPerBoxStrip: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  remarks: "",
  amount: 0,
};

const requiredHeaders = [
  "invoice #",
  "invoice date",
  "delivery #",
  "received date",
  "expiry date",
  "product name",
  "supplier name",
  "qty box",
  "fob",
  "cif",
  "lc number",
  "remarks",
];

// Define which fields should be treated as numbers
const numericFields = ["quantityPerBoxStrip", "fob", "cif", "amount"];
const integerFields = ["quantityPerBoxStrip"];

function Purchase() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);
  const [activeTab, setActiveTab] = useState("add");
  const [allSelected, setAllSelected] = useState(false);
  const inputRef = useRef(null);

  // New states for dropdowns
  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  const purchasesPerPage = 10;

  // Column configuration
  const [tableColumns, setTableColumns] = useState([
    "invoiceNumber",
    "deliveryNumber",
    "productName",
    "supplierName",
    "quantityPerBoxStrip",
    "lcNumber",
    "amount",
    "actions",
  ]);

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice Number",
        dbName: "invoiceNumber",
      },
      {
        id: "deliveryNumber",
        name: "Delivery Number",
        dbName: "deliveryNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "receivedDate",
        name: "Received Date",
        dbName: "receivedDate",
      },
      {
        id: "expiryDate",
        name: "Expiry Date",
        dbName: "expiryDate",
      },
      {
        id: "productName",
        name: "Product Name",
        dbName: "productName",
      },
      {
        id: "supplierName",
        name: "Supplier Name",
        dbName: "supplierName",
      },
      {
        id: "quantityPerBoxStrip",
        name: "Box Qty",
        dbName: "quantityPerBoxStrip",
      },
      {
        id: "lcNumber",
        name: "LC (USD)",
        dbName: "lcNumber",
      },
      {
        id: "fob",
        name: "FOB (USD)",
        dbName: "fob",
      },
      {
        id: "cif",
        name: "CIF (USD)",
        dbName: "cif",
      },
      {
        id: "amount",
        name: "Amount ($)",
        dbName: "amount",
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

  const requiredColumns = ["invoiceNumber", "productName", "actions"];

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
      "deliveryNumber",
      "invoiceDate",
      "receivedDate",
      "productName",
      "supplierName",
      "quantityPerBoxStrip",
      "lcNumber",
      "fob",
      "amount",
      "actions",
    ]);
  };

  const handleCancelEvent = () => {
    setSelectedItems([]);
    setAllSelected(false);
    setIsModalOpen(false);
  };

  // Fetch products and suppliers for dropdowns
  useEffect(() => {
    if (isEditModalOpen) {
      fetchProducts();
      fetchSuppliers();
    }
  }, [isEditModalOpen]);

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const result = await fetchProductsAPI();
      if (result.success) {
        setProductOptions(result.data);
      } else {
        showToast("error", result.error || "Failed to load products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      showToast("error", "Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const result = await fetchSuppliersAPI();
      if (result.success) {
        setSupplierOptions(result.data);
      } else {
        showToast("error", result.error || "Failed to load suppliers");
      }
    } catch (error) {
      console.error("Error fetching suppliers:", error);
      showToast("error", "Failed to load suppliers");
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Get field value from purchase object
  const getFieldValue = (purchase, dbName) => {
    if (!purchase || typeof purchase !== "object") return "--";

    // ✅ Date fields
    if (["receivedDate", "expiryDate", "invoiceDate"].includes(dbName)) {
      return formatDateToReadable(purchase[dbName]) || "--";
    }

    // ✅ Amount: ensure number & round properly
    if (dbName === "amount") {
      const amount = Number(purchase.amount) || 0;
      return formatNumber(amount);
    }

    // ✅ Quantity fields - use consistent field names
    if (dbName === "quantityPerBoxStrip") {
      const qty = Number(purchase.quantityPerBoxStrip) || 0;
      return qty;
    }

    // ✅ LC Number — numeric but stored as string sometimes
    if (dbName === "lcNumber") {
      const lc = parseFloat(purchase.lcNumber) || 0;
      return formatNumber(lc);
    }

    // ✅ FOB / CIF
    if (dbName === "fob" || dbName === "cif") {
      const val = parseFloat(purchase[dbName]) || 0;
      return formatNumber(val);
    }

    // ✅ Default fallback
    const value = purchase[dbName];
    if (value === null || value === undefined || value === "") return "--";

    return value;
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

  // Filter purchases based on tab + search
  const filteredPurchases = purchases.filter((p) => {
    const matchesType =
      selectedTab.toLowerCase() === "all" ||
      p.productType?.toLowerCase() === selectedTab.toLowerCase();

    if (!matchesType) return false;

    if (searchTerm.trim() === "") return true;
    const lowerSearch = searchTerm.toLowerCase();

    return (
      matchesType &&
      (p.invoiceNumber?.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(p.receivedDate)
          .toLowerCase()
          .includes(lowerSearch) ||
        p.productName?.toLowerCase().includes(lowerSearch) ||
        p.deliveryNumber?.toLowerCase().includes(lowerSearch) ||
        p.lcNumber?.toLowerCase().includes(lowerSearch) ||
        p.supplierName?.toLowerCase().includes(lowerSearch))
    );
  });

  const fetchPurchaseDetails = async () => {
    try {
      setLoading(true);

      const purchaseRes = await fetch(`${backendUrl}/api/purchase`);
      if (!purchaseRes.ok) throw new Error("Failed to fetch purchase details");
      const purchaseData = await purchaseRes.json();

      // Extract unique types from both productType and type fields
      const typeSet = new Set();
      purchaseData.reports.forEach((item) => {
        const type = item.productType || item.type;
        if (type && type.trim() && type.toLowerCase() !== "unknown") {
          typeSet.add(type.trim());
        }
      });

      const uniqueTypes = Array.from(typeSet).sort();

      setTypes(["All", ...uniqueTypes]);
      setPurchases(purchaseData.reports || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      alert(error.message || "Error fetching purchase details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseDetails();
  }, []);

  const handleClick = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
  };

  const parseNumber = (val) => {
    if (typeof val === "number") return val;
    if (typeof val === "string") {
      const cleaned = val.replace(/,/g, "").trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const parseDate = (val) => {
    if (!val) return null;

    // If it's already a Date
    if (val instanceof Date && !isNaN(val)) return val;

    // Handle Excel serial numbers (e.g. 45567)
    if (typeof val === "number") {
      const excelEpoch = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(excelEpoch)) return excelEpoch;
      return null;
    }

    // Handle strings
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed || trimmed.toUpperCase() === "N/A") return null;

      // Try built-in Date parsing
      let parsed = new Date(trimmed);
      if (!isNaN(parsed)) return parsed;

      // Try known formats manually (like DD/MM/YYYY, DD-MM-YYYY, etc.)
      const patterns = [
        /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/, // 05/11/2025 or 5-11-25
        /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/, // 2025-11-05
        /^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})$/, // 05 Nov 2025
      ];

      for (const p of patterns) {
        const m = trimmed.match(p);
        if (m) {
          let day, month, year;
          if (p === patterns[0]) {
            [, day, month, year] = m;
          } else if (p === patterns[1]) {
            [, year, month, day] = m;
          } else {
            [, day, month, year] = m;
            const monthIndex = new Date(`${month} 1, 2000`).getMonth(); // convert "Nov" → 10
            if (!isNaN(monthIndex)) month = monthIndex + 1;
          }

          day = parseInt(day);
          month = parseInt(month) - 1; // JS months are 0-based
          year = parseInt(year);
          if (year < 100) year += 2000; // handle 2-digit years

          const d = new Date(year, month, day);
          if (!isNaN(d)) return d;
        }
      }
    }

    return null;
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
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

        const requiredHeaders = [
          "invoice number",
          "invoice date",
          "delivery no.",
          "received date",
          "product name",
          "supplier name",
          "expiry date",
          "quantity per box/strip",
          "fob (usd)",
          "cif (usd)",
          "lc (usd)",
          "remarks",
        ];

        // Step 1: Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );
          const matched = requiredHeaders.filter((hdr) => row.includes(hdr));
          if (matched.length >= 8) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast("error", "Header row not found or missing columns");
          return;
        }

        // Step 2: Map columns to headers
        const rawHeaders = rows[headerRowIndex];
        const headersMap = {};
        rawHeaders.forEach((headerText, colIndex) => {
          const cleaned = headerText?.toString().trim().toLowerCase();
          if (requiredHeaders.includes(cleaned)) {
            headersMap[colIndex] = cleaned;
          }
        });

        // Step 3: Map rows to structured data
        const dataRows = rows.slice(headerRowIndex + 1);
        const mappedData = dataRows
          .map((row) => {
            const item = {};
            Object.entries(headersMap).forEach(([colIndex, key]) => {
              let cellVal = row[colIndex] || "";
              if (typeof cellVal === "string") {
                if (cellVal.toUpperCase() === "N/A" || cellVal.trim() === "") {
                  cellVal = "";
                }
              }
              item[key] = cellVal;
            });

            return {
              invoiceNumber: item["invoice number"] || "",
              invoiceDate: parseDate(item["invoice date"]),
              deliveryNumber: item["delivery no."] || "",
              receivedDate: parseDate(item["received date"]),
              productName: item["product name"] || "",
              supplierName: item["supplier name"] || "",
              expiryDate: parseDate(item["expiry date"]),
              quantityPerBoxStrip: parseNumber(item["quantity per box/strip"]),
              fob: parseNumber(item["fob (usd)"]),
              cif: parseNumber(item["cif (usd)"]),
              lc: parseNumber(item["lc (usd)"]),
              remarks: item["remarks"] || "",
            };
          })
          .filter(
            (entry) =>
              entry.invoiceNumber !== "" ||
              entry.productName !== "" ||
              entry.deliveryNumber !== ""
          );
        setParsedData(mappedData);
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", "Failed to process the file.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handlePurchaseImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/purchase/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Purchase Inventory imported successfully!"
        );
        setShowImportModal(false);
        fetchPurchaseDetails();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  // CORRECTED: Enhanced editPurchase function with proper product ID handling
  const editPurchase = (purchase) => {
    console.log("values of pur", purchase);

    setForm({
      _id: purchase._id || "",
      invoiceNumber: purchase.invoiceNumber || "",
      invoiceDate: purchase.invoiceDate || "",
      deliveryNumber: purchase.deliveryNumber || "",
      receivedDate: purchase.receivedDate || "",
      expiryDate: purchase.expiryDate || "",
      productId: purchase?._id || purchase.productName || "",
      productName: purchase?.productName || purchase.productName || "", // Store product name
      supplierName: purchase.supplierName || "",
      quantityPerBoxStrip: purchase.quantityPerBoxStrip || 0,
      fob: purchase.fob || 0,
      cif: purchase.cif || 0,
      lcNumber: purchase.lcNumber || "",
      remarks: purchase.remarks || "",
      amount: purchase.amount || 0,
    });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleView = (purchases) => {
    setForm({ ...purchases });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const deletePurchase = async (purchase) => {
    if (!purchase._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${purchase.productName}-${purchase?.invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/purchase/${purchase._id}`
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Purchase <b>${purchase.productName}-${purchase?.invoiceNumber}</b> deleted successfully`
          );
          fetchPurchaseDetails();
        }
      } catch (error) {
        showToast("error", "Failed to delete purchase.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/purchase`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast(
            "success",
            `Selected <b>${selected.length}</b> purchase deleted successfully`
          );
          fetchPurchaseDetails();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected .");
      }
    } else {
      setSelected([]);
    }
  };

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

  const formatNumber = (num) => {
    if (num === null || num === undefined || num === "") return "--";

    const numberValue = typeof num === "string" ? parseFloat(num) : num;

    if (isNaN(numberValue)) return "--";

    return numberValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalPages = Math.ceil(filteredPurchases.length / purchasesPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPurchases = filteredPurchases.slice(
    (currentPage - 1) * purchasesPerPage,
    currentPage * purchasesPerPage
  );

  function capitalizeFirstLetter(str) {
    if (!str) return "";
    str = str.toString(); // ensure it's a string
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  // CORRECTED: Enhanced handlePurchaseUpdate function with proper product handling
  const handlePurchaseUpdate = async (e) => {
    e.preventDefault();
    console.log("Updating purchase with data:", form);

    try {
      // ✅ Prepare data with correct field names matching backend
      const updateData = {
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        deliveryNumber: form.deliveryNumber,
        receivedDate: form.receivedDate,
        expiryDate: form.expiryDate,
        productName: form.productName, // Send the actual product name, not ID
        supplierName: form.supplierName,
        quantityPerBoxStrip: Number(form.quantityPerBoxStrip) || 0,
        fob: Number(form.fob) || 0,
        cif: Number(form.cif) || 0,
        lcNumber: form.lcNumber,
        remarks: form.remarks,
        amount: Number(form.amount) || 0,
      };

      console.log("Sending update data:", updateData);

      const res = await axios.put(
        `${backendUrl}/api/purchase/${form._id}`,
        updateData
      );

      if (res.status === 200) {
        showToast("success", "Purchase updated successfully");
        setIsEditModalOpen(false);
        setForm(initialFormState);
        fetchPurchaseDetails();
      }
    } catch (err) {
      console.error("Update error:", err);
      showToast(
        "error",
        "Failed to update purchase: " +
          (err.response?.data?.message || err.message)
      );
    }
  };

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentPurchases.map((purchase) => ({
              id: purchase._id,
            }))
          : []
      );
    },
    [currentPurchases]
  );

  // CORRECTED: Enhanced amount calculation effect
  useEffect(() => {
    if (isEditModalOpen) {
      const lcValue = parseFloat(form.lcNumber) || 0;
      const quantityPerBoxStripValue =
        parseFloat(form.quantityPerBoxStrip) || 0;

      // ✅ CORRECT CALCULATION: LC × Box Qty
      const calculatedAmount = lcValue * quantityPerBoxStripValue;

      // Round to 2 decimal places
      const roundedAmount = Math.round(calculatedAmount * 100) / 100;

      // Only update if the calculated value is different from current
      if (Math.abs(roundedAmount - (parseFloat(form.amount) || 0)) > 0.01) {
        setForm((prev) => ({
          ...prev,
          amount: roundedAmount,
        }));
      }
    }
  }, [form.lcNumber, form.quantityPerBoxStrip, isEditModalOpen]);

  // CORRECTED: Numeric input handler for integer and decimal fields
  const handleNumericInputChange = (e, updateFunc) => {
    const { name, value } = e.target;

    if (numericFields.includes(name)) {
      // For integer fields, allow only whole numbers
      if (integerFields.includes(name)) {
        if (value === "" || /^\d*$/.test(value)) {
          const validatedEvent = {
            target: {
              name: name,
              value: value === "" ? "" : parseInt(value) || 0,
            },
          };
          updateFunc(validatedEvent);
        }
      } else {
        // For decimal fields, allow numbers and decimal point
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          const validatedEvent = {
            target: {
              name: name,
              value: value,
            },
          };
          updateFunc(validatedEvent);
        }
      }
    } else {
      // For non-numeric fields, pass through directly
      updateFunc(e);
    }
  };

  // CORRECTED: Enhanced handle change with proper number conversion
  const enhancedHandleChange = useCallback((e) => {
    const { name, value } = e.target;
    console.log(`Field ${name} changed to:`, value);

    setForm((prev) => {
      let processedValue = value;

      // Convert numeric fields to proper types
      if (numericFields.includes(name)) {
        if (value === "" || value === "-") {
          processedValue = value;
        } else if (integerFields.includes(name)) {
          // For integer fields, convert to whole number
          const intValue = parseInt(value);
          processedValue = isNaN(intValue) ? 0 : intValue;
        } else {
          // For decimal fields, convert to float with 2 decimal places
          if (!value.endsWith(".")) {
            const numValue = parseFloat(value);
            processedValue = isNaN(numValue)
              ? 0
              : Math.round(numValue * 100) / 100;
          }
        }
      }

      const updatedForm = {
        ...prev,
        [name]: processedValue,
      };

      console.log("Updated form:", updatedForm);
      return updatedForm;
    });
  }, []);

  // CORRECTED: Format numeric values for display in edit modal
  const getDisplayValue = (fieldName, value) => {
    if (!numericFields.includes(fieldName)) return value || "";

    if (value === null || value === undefined) return "";

    // For integer fields, don't show decimal places
    if (integerFields.includes(fieldName)) {
      if (typeof value === "number") {
        return value.toString();
      }
      return value || "";
    }

    // If it's a number and we're not in the middle of typing a decimal
    if (typeof value === "number") {
      return value.toString();
    }

    // If it's a string (like during input), return as is
    return value;
  };

  // CORRECTED: Handle product selection - store both ID and name
  const handleProductChange = (selectedProductId) => {
    const selectedProduct = productOptions.find(
      (product) => product._id === selectedProductId
    );
    if (selectedProduct) {
      setForm((prev) => ({
        ...prev,
        productId: selectedProduct.value, // Store the actual product ID
        productName: selectedProduct.label, // Store the product name
      }));
    }
  };

  const handleSupplierChange = useCallback((selectedValue) => {
    setForm((prev) => ({
      ...prev,
      supplierName: selectedValue,
    }));
  }, []);

  // CORRECTED: Initialize form with proper product data when products are loaded
  useEffect(() => {
    if (isEditModalOpen && productOptions.length > 0 && form.productId) {
      // If we have productId but productName might be missing, find the product
      const product = productOptions.find((p) => p.value === form.productId);
      if (product && form.productName !== product.label) {
        setForm((prev) => ({
          ...prev,
          productName: product.label,
        }));
      }
    }
  }, [isEditModalOpen, productOptions, form.productId]);

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/purchaselayout/purchase/new")}
            >
              <UserPlus size={18} /> Add New Purchase
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Purchase
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
        </div>
        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {purchases.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="flex gap-4">
                {types.map((tab) => (
                  <button
                    key={tab}
                    onClick={() => handleClick(tab)}
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
                {filteredPurchases.length}
              </span>
            </p>
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={handleIconClick}
              />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search invoice,Product Name , Received Date..."
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

        {/* Table */}
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
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {currentPurchases.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all purchases"
                              checked={
                                selected.length === currentPurchases.length &&
                                currentPurchases.length > 0
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
              {currentPurchases.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    No purchases found.
                  </td>
                </tr>
              ) : (
                currentPurchases.map((purchase, index) => (
                  <tr
                    key={purchase._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % purchasesPerPage === 0 ||
                      index + 1 === currentPurchases.length
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
                                  (s) => s.id === purchase._id
                                )}
                                onChange={() => toggleSelect(purchase)}
                              />
                              <span>{purchase.invoiceNumber || "--"}</span>
                            </div>
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                                <Eye
                                  onClick={() => handleView(purchase)}
                                  size={18}
                                />
                              </button>
                              <button
                                className="text-green-600 hover:text-green-800 cursor-pointer"
                                onClick={() => editPurchase(purchase)}
                                title="Edit"
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() => deletePurchase(purchase)}
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            getFieldValue(purchase, item.dbName)
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {currentPurchases.length > 0 && (
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
                    className="px-3 py-1 text-gray-500 select-none cursor-pointer"
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
                onClick={() => {
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Add/Remove Column Modal */}
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

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              {/* Background Overlay */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setShowImportModal(false)}
              />
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                {/* Close */}
                <button
                  onClick={() => setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>

                <h2 className="text-lg font-semibold text-gray-800 mb-4">
                  Import Purchase
                </h2>
                {isSampleFile && <PurchaseInventoryExcelDownload />}
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2">File</label>
                  <input
                    type="file"
                    accept=".csv, .xlsx"
                    onChange={handleFileUpload}
                    className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowImportModal(false)}
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
                    onClick={handlePurchaseImport}
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

        {/* VIEW MODAL */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />

              <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-6">
                  View Purchase Details
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="block font-medium text-gray-600">
                      Invoice Number
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.invoiceNumber || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Delivery Number
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.deliveryNumber || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Invoice Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatDateToReadable(form.invoiceDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Received Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatDateToReadable(form.receivedDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Expiry Date
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatDateToReadable(form.expiryDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Product Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.productName || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Supplier Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.supplierName || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Box Quantity
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.quantityPerBoxStrip || 0}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      FOB (USD)
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatNumber(form.fob)}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      CIF (USD)
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatNumber(form.cif)}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      LC Number
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatNumber(Number(form.lcNumber)) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-600">
                      Amount (USD)
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatNumber(form.amount)}
                    </p>
                  </div>

                  {/* Remarks - Full width */}
                  <div className="md:col-span-3">
                    <label className="block font-medium text-gray-600">
                      Remarks
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {form.remarks || "—"}
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

        {/* EDIT MODAL - CORRECTED */}
        {/* EDIT MODAL - CORRECTED */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setForm(initialFormState);
                }}
              />
              <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setForm(initialFormState);
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Purchase
                </h2>

                <form
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                  onSubmit={handlePurchaseUpdate}
                >
                  {/* Invoice Number */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Invoice Number
                    </label>
                    <input
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Delivery Number */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Delivery Number
                    </label>
                    <input
                      type="text"
                      name="deliveryNumber"
                      value={form.deliveryNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Invoice Date */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Invoice Date
                    </label>
                    <DatePicker
                      selected={
                        form.invoiceDate ? new Date(form.invoiceDate) : null
                      }
                      onChange={(date) =>
                        setForm({
                          ...form,
                          invoiceDate: date ? date.toISOString() : "",
                        })
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Received Date
                    </label>
                    <DatePicker
                      selected={
                        form.receivedDate ? new Date(form.receivedDate) : null
                      }
                      onChange={(date) =>
                        setForm({
                          ...form,
                          receivedDate: date ? date.toISOString() : "",
                        })
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Expiry Date
                    </label>
                    <DatePicker
                      selected={
                        form.expiryDate ? new Date(form.expiryDate) : null
                      }
                      onChange={(date) =>
                        setForm({
                          ...form,
                          expiryDate: date ? date.toISOString() : "",
                        })
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* ---------- PRODUCT NAME (searchable dropdown) ---------- */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Product Name
                    </label>
                    <SearchableDropdown
                      value={form.productId} // <-- uses the stored productId
                      onChange={handleProductChange} // sets both productId & productName
                      options={productOptions}
                      placeholder="Select Product"
                      loading={loadingProducts}
                      label=""
                    />
                    {/* {form.productName && (
                      <p className="text-xs text-gray-500 mt-1">
                        Selected: {form.productName}
                      </p>
                    )} */}
                  </div>

                  {/* ---------- SUPPLIER NAME (searchable dropdown – FIXED) ---------- */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Supplier Name
                    </label>
                    <SearchableDropdown
                      value={form.supplierName} // <-- plain string (supplier name)
                      onChange={handleSupplierChange} // updates supplierName only
                      options={supplierOptions}
                      placeholder="Select Supplier"
                      loading={loadingSuppliers}
                      label=""
                    />
                  </div>

                  {/* Box Quantity */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Box Quantity
                    </label>
                    <input
                      type="text"
                      name="quantityPerBoxStrip"
                      value={getDisplayValue(
                        "quantityPerBoxStrip",
                        form.quantityPerBoxStrip
                      )}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* FOB */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      FOB (USD)
                    </label>
                    <input
                      type="text"
                      name="fob"
                      value={getDisplayValue("fob", form.fob)}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* CIF */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      CIF (USD)
                    </label>
                    <input
                      type="text"
                      name="cif"
                      value={getDisplayValue("cif", form.cif)}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* LC Number */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      LC (USD)
                    </label>
                    <input
                      type="text"
                      name="lcNumber"
                      value={form.lcNumber || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Amount – read-only calculated */}
                  <div>
                    <label className="block font-medium text-gray-600">
                      Amount (USD)
                    </label>
                    <input
                      type="text"
                      name="amount"
                      value={formatNumber(form.amount)}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300 bg-gray-100 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Remarks – full width */}
                  <div className="md:col-span-3">
                    <label className="block font-medium text-gray-600">
                      Remarks
                    </label>
                    <textarea
                      name="remarks"
                      value={form.remarks || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      rows={3}
                    />
                  </div>
                </form>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setForm(initialFormState);
                    }}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handlePurchaseUpdate}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}

export default Purchase;
