import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  ShoppingCart,
  Trash2,
  Edit,
  Upload,
  X,
  Eye,
  Search,
  Package,
} from "lucide-react";
import ReactDOM from "react-dom";
import PurchaseSampleExcelDownload from "../../excels/PurchaseSampleExcelDownload";
import PurchaseInventoryExcelDownload from "../../excels/download/PurchaseInventoryExcelDownload";
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
import dayjs from "dayjs";
import {
  fetchProductDropdownPurchase as fetchProductsAPI,
  fetchSuppliers as fetchSuppliersAPI,
} from "../../pages/ProductManager/common/fetchDropdown";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import LoadingOverlay from "../../components/Loading";
import InputField from "../../components/common/InputField";
import { parseExcelDate } from "../../utils/excelUtility";
import SaleExcelDownload from "../../excels/download/ExcelDownload";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const initialFormState = {
  _id: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  expiryDate: "",
  productId: "",
  productName: "",
  supplierName: "",
  quantityPerBoxStrip: 0,
  fob: 0,
  cif: 0,
  lcNumber: "",
  remarks: "",
  amount: 0,
  products: [],
};

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
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedPurchaseProduct, setSelectedPurchaseProduct] = useState(null);
  const inputRef = useRef(null);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);

  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Product edit modal states
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);

  const PURCHASES_PER_PAGE = 9;

  // Updated column configuration to include supplierName
  const tableColumns = useMemo(
    () => [
      "invoiceNumber",
      "invoiceDate",
      "deliveryNumber",
      "supplierName",
      "amount",
      "productCount",
      "actions",
    ],
    []
  );

  const allFields = useMemo(
    () => [
      {
        id: "invoiceNumber",
        name: "Invoice No",
        dbName: "invoiceNumber",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "deliveryNumber",
        name: "Delivery No",
        dbName: "deliveryNumber",
      },
      {
        id: "supplierName",
        name: "Supplier Name",
        dbName: "supplierName",
      },
      {
        id: "productCount",
        name: "Product",
        dbName: "productCount",
      },
      {
        id: "amount",
        name: "Total Amount ($)",
        dbName: "totalAmount",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Validation function
  const validateSuppliersAndProducts = () => {
    if (!supplierOptions.length && !productOptions.length) {
      showToast(
        "error",
        "No suppliers and products found. Please add at least one supplier and one product first."
      );
      return false;
    } else if (!supplierOptions.length) {
      showToast(
        "error",
        "No suppliers found. Please add at least one supplier first."
      );
      return false;
    } else if (!productOptions.length) {
      showToast(
        "error",
        "No products found. Please add at least one product first."
      );
      return false;
    }
    return true;
  };

  const handleImportClick = () => {
    if (!validateSuppliersAndProducts()) {
      return;
    }
    setShowImportModal(true);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        setIsUploading(true);
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get all sheet data
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          raw: false,
        });

        if (jsonData.length === 0) {
          showToast("warning", "Excel file is empty");
          setIsUploading(false);
          return;
        }

        // Find header row by looking for common headers
        let headerRowIndex = -1;
        let headers = [];

        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i];
          if (!Array.isArray(row)) continue;

          const rowText = row.join(" ").toLowerCase();
          const hasInvoice = rowText.includes("invoice");
          const hasProduct = rowText.includes("product");
          const hasSupplier = rowText.includes("supplier");

          if (
            (hasInvoice && hasProduct) ||
            (hasInvoice && hasSupplier) ||
            (hasProduct && hasSupplier)
          ) {
            headerRowIndex = i;
            headers = row.map((h) => h?.toString().trim() || "");
            break;
          }
        }

        if (headerRowIndex === -1) {
          // Use first row as headers
          headerRowIndex = 0;
          headers = jsonData[0].map((h) => h?.toString().trim() || "");
        }

        // Create a mapping of column index to normalized header name
        const headerMap = {};
        headers.forEach((header, index) => {
          if (!header) return;
          const normalized = header.toLowerCase().trim();

          // Map various header names to standard field names
          if (
            normalized.includes("invoice no") ||
            normalized.includes("invoice number")
          ) {
            headerMap.invoiceNumber = index;
          } else if (normalized.includes("invoice date")) {
            headerMap.invoiceDate = index;
          } else if (
            normalized.includes("delivery") &&
            (normalized.includes("no") || normalized.includes("number"))
          ) {
            headerMap.deliveryNumber = index;
          } else if (normalized.includes("received date")) {
            headerMap.receivedDate = index;
          } else if (
            normalized.includes("product name") ||
            normalized.includes("product")
          ) {
            headerMap.productName = index;
          } else if (
            normalized.includes("supplier name") ||
            normalized.includes("supplier")
          ) {
            headerMap.supplierName = index;
          } else if (
            normalized.includes("expiry date") ||
            normalized.includes("expiry")
          ) {
            headerMap.expiryDate = index;
          } else if (
            normalized.includes("quantity") ||
            normalized.includes("qty")
          ) {
            headerMap.quantityPerBoxStrip = index;
          } else if (normalized.includes("fob")) {
            headerMap.fob = index;
          } else if (normalized.includes("cif")) {
            headerMap.cif = index;
          } else if (normalized.includes("lc")) {
            headerMap.lc = index;
          } else if (
            normalized.includes("remarks") ||
            normalized.includes("note")
          ) {
            headerMap.remarks = index;
          }
        });

        // Create product map for looking up FOB, CIF, LC values
        const productMap = new Map();
        productOptions.forEach((product) => {
          if (product.productName) {
            const key = product.productName.toLowerCase().trim();
            const firstBatch =
              product.batches && product.batches.length > 0
                ? product.batches[0]
                : {};

            productMap.set(key, {
              lc: firstBatch.lc || product.lc || 0,
              fob: firstBatch.fob || product.fob || 0,
              cif: firstBatch.cif || product.cif || 0,
              type: product.type || "Tablet",
            });
          }
        });

        // Object to group by invoice number and supplier
        const invoiceGroups = {};

        // Process data rows and group by invoice number + supplier
        for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (
            !Array.isArray(row) ||
            row.every((cell) => !cell || cell.toString().trim() === "")
          ) {
            continue;
          }

          const getValue = (field) => {
            const index = headerMap[field];
            return index !== undefined && row[index] !== undefined
              ? row[index]
              : "";
          };

          const parseDate = (value) => {
            if (!value) return null;

            // Handle Excel date numbers
            if (typeof value === "number") {
              try {
                const excelEpoch = new Date(1899, 11, 30);
                const date = new Date(excelEpoch.getTime() + value * 86400000);
                return date.toISOString().split("T")[0];
              } catch (e) {
                return null;
              }
            }

            // Handle string dates
            const str = value.toString().trim();
            if (!str) return null;

            // Try common date formats
            const formats = [
              "YYYY-MM-DD",
              "DD/MM/YYYY",
              "MM/DD/YYYY",
              "YYYY/MM/DD",
              "DD-MM-YYYY",
              "MM-DD-YYYY",
            ];

            for (const format of formats) {
              try {
                const parsed = dayjs(str, format);
                if (parsed.isValid()) {
                  return parsed.format("YYYY-MM-DD");
                }
              } catch (e) {
                // Continue to next format
              }
            }

            return null;
          };

          const parseNumber = (value) => {
            if (!value && value !== 0) return 0;
            if (typeof value === "number") return value;

            const str = value.toString().trim();
            if (!str || str.toLowerCase() === "n/a") return 0;

            // Remove non-numeric characters except decimal point and minus
            const cleaned = str.replace(/[^\d.-]/g, "");
            if (cleaned === "") return 0;

            const num = parseFloat(cleaned);
            return isNaN(num) ? 0 : num;
          };

          // Get values from Excel
          let invoiceNumber = getValue("invoiceNumber")?.toString().trim();
          let invoiceDate = parseDate(getValue("invoiceDate"));
          let deliveryNumber = getValue("deliveryNumber")?.toString().trim();
          const receivedDate = parseDate(getValue("receivedDate"));
          const productName = getValue("productName")?.toString().trim();
          let supplierName = getValue("supplierName")?.toString().trim();
          const expiryDate = parseDate(getValue("expiryDate"));
          const quantityPerBoxStrip = parseNumber(
            getValue("quantityPerBoxStrip")
          );
          let fob = parseNumber(getValue("fob"));
          let cif = parseNumber(getValue("cif"));
          let lc = parseNumber(getValue("lc"));
          const remarks = getValue("remarks")?.toString().trim() || "";

          // Skip only if product name is missing (essential field)
          if (!productName) {
            continue;
          }

          // If FOB, CIF, or LC is 0, try to fetch from product database
          if (fob === 0 || cif === 0 || lc === 0) {
            const productKey = productName.toLowerCase().trim();
            const productInfo = productMap.get(productKey);

            if (productInfo) {
              if (fob === 0) fob = productInfo.fob;
              if (cif === 0) cif = productInfo.cif;
              if (lc === 0) lc = productInfo.lc;
            }
          }

          // Handle missing supplier name
          if (!supplierName) {
            supplierName = "Not Provided";
          }

          // Generate invoice number if missing
          if (!invoiceNumber) {
            // Create a unique key for supplier without invoice
            const supplierKey = supplierName;
            if (!invoiceGroups[`NO_INVOICE_${supplierKey}`]) {
              // Generate invoice number for this supplier
              const lastInvoiceNumber = Object.keys(invoiceGroups).filter(
                (key) => key.startsWith(`INC_${supplierKey}`)
              ).length;

              invoiceNumber = `INC${String(lastInvoiceNumber + 1).padStart(
                5,
                "0"
              )}`;
            } else {
              // Use existing generated invoice number for this supplier
              invoiceNumber =
                invoiceGroups[`NO_INVOICE_${supplierKey}`].invoiceNumber;
            }
          }

          if (!deliveryNumber) {
            deliveryNumber = invoiceNumber;
          }

          if (!invoiceDate) {
            invoiceDate = dayjs().format("YYYY-MM-DD");
          }

          // Calculate amount
          const amount = quantityPerBoxStrip * lc;

          // Create a unique key for grouping: invoiceNumber + supplierName
          const groupKey = `${invoiceNumber}_${supplierName}`;

          // Initialize invoice group if not exists
          if (!invoiceGroups[groupKey]) {
            invoiceGroups[groupKey] = {
              invoiceNumber,
              invoiceDate: invoiceDate || dayjs().format("YYYY-MM-DD"),
              deliveryNumber: deliveryNumber || invoiceNumber,
              receivedDate:
                receivedDate || invoiceDate || dayjs().format("YYYY-MM-DD"),
              supplierName,
              remarks,
              products: [],
            };
          }

          // Add product to the invoice group
          invoiceGroups[groupKey].products.push({
            productName,
            expiryDate,
            quantityPerBoxStrip,
            fob,
            cif,
            lc,
            lcNumber: lc,
            remarks,
            type: "Tablet",
            amount,
          });
        }

        // Convert grouped data to array
        const groupedData = Object.values(invoiceGroups);
        setParsedData(groupedData);

        if (groupedData.length === 0) {
          showToast(
            "warning",
            "No valid data found in the file. Please check the format."
          );
        } else {
          const totalProducts = groupedData.reduce(
            (sum, invoice) => sum + invoice.products.length,
            0
          );
        }
      } catch (error) {
        console.error("Error reading Excel file:", error);
        showToast("error", `Failed to process the file: ${error.message}`);
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const parseNumber = (numStr) => {
    if (!numStr && numStr !== 0) return 0;
    if (typeof numStr === "number") return numStr;

    // Handle string representations
    const str = numStr.toString().trim();
    if (str === "" || str.toLowerCase() === "n/a") return 0;

    // Remove non-numeric characters except decimal point and minus sign
    const cleaned = str.replace(/[^\d.-]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Handle purchase import
  const handlePurchaseImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }

    // Validation before import
    if (!validateSuppliersAndProducts()) {
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
        setParsedData([]);
        fetchPurchaseDetails();
      }
    } catch (err) {
      handleAxiosError(err, showToast);
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddNewPurchase = () => {
    if (!validateSuppliersAndProducts()) {
      return;
    }
    navigate("/purchaselayout/purchase/new");
  };

  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (string) => {
    if (!string) return "--";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  // Get field value from purchase object
  const getFieldValue = (purchase, dbName) => {
    if (!purchase || typeof purchase !== "object") return "--";

    // Date fields
    if (["receivedDate", "expiryDate", "invoiceDate"].includes(dbName)) {
      return formatDateToReadable(purchase[dbName]) || "--";
    }

    // Supplier Name field
    if (dbName === "supplierName") {
      return purchase.supplierName || "--";
    }

    // Numeric fields
    if (dbName === "amount") {
      const amount = Number(purchase.amount) || 0;
      return formatNumber(amount);
    }

    if (dbName === "quantityPerBoxStrip") {
      const qty = Number(purchase.quantityPerBoxStrip) || 0;
      return qty;
    }

    if (dbName === "lcNumber") {
      const lc = parseFloat(purchase.lcNumber) || 0;
      return formatNumber(lc);
    }

    if (dbName === "fob" || dbName === "cif") {
      const val = parseFloat(purchase[dbName]) || 0;
      return formatNumber(val);
    }

    // Default fallback
    const value = purchase[dbName];
    if (value === null || value === undefined || value === "") return "--";

    return value;
  };

  const handleProductCountClick = (purchase) => {
    setSelectedPurchaseProduct(purchase);
    setIsProductModalOpen(true);
  };

  // Fetch products and suppliers
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

  const fetchPurchaseDetails = async () => {
    try {
      setLoading(true);
      const purchaseRes = await fetch(`${backendUrl}/api/purchase`);

      if (!purchaseRes.ok) throw new Error("Failed to fetch purchase details");
      const purchaseData = await purchaseRes.json();

      // Handle different response structures safely
      let purchaseArray = [];

      if (Array.isArray(purchaseData)) {
        purchaseArray = purchaseData;
      } else if (
        purchaseData.purchases &&
        Array.isArray(purchaseData.purchases)
      ) {
        purchaseArray = purchaseData.purchases;
      } else if (purchaseData.data && Array.isArray(purchaseData.data)) {
        purchaseArray = purchaseData.data;
      } else if (purchaseData.result && Array.isArray(purchaseData.result)) {
        purchaseArray = purchaseData.result;
      }

      const typeSet = new Set();
      if (Array.isArray(purchaseArray) && purchaseArray.length > 0) {
        purchaseArray.forEach((purchase) => {
          // Check if purchase has products array
          if (purchase.products && Array.isArray(purchase.products)) {
            purchase.products.forEach((product) => {
              const type = product.productType || product.type;
              if (type && type.trim() && type.toLowerCase() !== "unknown") {
                typeSet.add(type.trim());
              }
            });
          }
        });
      }

      setPurchases(purchaseArray);
      setTypes(["All", ...Array.from(typeSet).sort()]);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching purchase details");
      setTypes(["All"]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseDetails();
    fetchProducts();
    fetchSuppliers();
  }, []);

  const handleClick = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
  };

  // Filter purchases based on tab + search
  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      if (searchTerm.trim() === "") return true;
      const lowerSearch = searchTerm.toLowerCase();

      return (
        purchase.invoiceNumber?.toLowerCase().includes(lowerSearch) ||
        formatDateToReadable(purchase.receivedDate)
          .toLowerCase()
          .includes(lowerSearch) ||
        purchase.deliveryNumber?.toLowerCase().includes(lowerSearch) ||
        purchase.lcNumber?.toLowerCase().includes(lowerSearch) ||
        purchase.supplierName?.toLowerCase().includes(lowerSearch) ||
        (purchase.products &&
          Array.isArray(purchase.products) &&
          purchase.products.some((product) =>
            product.productName?.toLowerCase().includes(lowerSearch)
          ))
      );
    });
  }, [purchases, searchTerm, selectedTab]);

  // Current page purchases
  const currentPurchases = useMemo(() => {
    const start = (currentPage - 1) * PURCHASES_PER_PAGE;
    return filteredPurchases.slice(start, start + PURCHASES_PER_PAGE);
  }, [filteredPurchases, currentPage]);

  // Total pages calculation
  const totalPages = useMemo(() => {
    return Math.ceil(filteredPurchases.length / PURCHASES_PER_PAGE);
  }, [filteredPurchases.length]);

  // Visible pages for pagination
  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTab]);

  const formatNumber = (num) => {
    if (num === null || num === undefined || num === "") return "--";
    const numberValue = typeof num === "string" ? parseFloat(num) : num;
    if (isNaN(numberValue)) return "--";
    return numberValue.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const toggleSelect = (purchase) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === purchase._id);
      if (exists) {
        return prev.filter((c) => c.id !== purchase._id);
      } else {
        return [...prev, { id: purchase._id }];
      }
    });
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

  const handleView = (purchase) => {
    setForm({ ...purchase });
    setIsViewModalOpen(true);
  };

  const editPurchase = (purchase) => {
    setForm({
      _id: purchase._id || "",
      invoiceNumber: purchase.invoiceNumber || "",
      invoiceDate: purchase.invoiceDate || "",
      deliveryNumber: purchase.deliveryNumber || "",
      receivedDate: purchase.receivedDate || "",
      expiryDate: purchase.expiryDate || "",
      supplierName: purchase.supplierName || "",
      remarks: purchase.remarks || "",
      amount: purchase.amount || 0,
      products: purchase.products || [],
    });
    setIsEditModalOpen(true);
  };

  const deletePurchase = async (purchase) => {
    if (!purchase._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${purchase?.invoiceNumber}</b>?`,
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
            `Purchase <b>${purchase?.invoiceNumber}</b> deleted successfully`
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
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        // Extract just the ID strings from the selected array
        const selectedIds = selected.map((item) => item.id);

        const res = await axios.delete(`${backendUrl}/api/purchase`, {
          data: { ids: selectedIds }, // Send array of ID strings
        });
        if (res.status === 200) {
          showToast(
            "success",
            `Selected <b>${selected.length}</b> purchase(s) deleted successfully`
          );
          fetchPurchaseDetails();
          setSelected([]);
        }
      } catch (error) {
        console.error("Delete error:", error);
        showToast("error", "Failed to delete selected purchases.");
      }
    } else {
      setSelected([]);
    }
  };
  const deleteSelectedPurchases = async () => {
    try {
      // Ensure selected is an array of IDs
      const selectedIds = selected.map((item) => item.id);

      if (!selectedIds || selectedIds.length === 0) {
        alert("No purchases selected");
        return;
      }

      const response = await fetch(`${backendUrl}/api/purchase`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: selectedIds }), // Ensure this is { ids: [...] }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete purchases");
      }

      alert(data.message);

      // Refresh purchases list
      fetchPurchaseDetails();
      setSelected([]); // Clear selection
    } catch (error) {
      console.error("Delete error:", error);
      alert(`Failed to delete purchases: ${error.message}`);
    }
  };
  // Form handlers
  const enhancedHandleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      let processedValue = value;

      // Handle numeric fields
      const numericFields = ["quantityPerBoxStrip", "fob", "cif", "amount"];
      const integerFields = ["quantityPerBoxStrip"];

      if (numericFields.includes(name)) {
        if (value === "" || value === "-") {
          processedValue = value;
        } else if (integerFields.includes(name)) {
          const intValue = parseInt(value);
          processedValue = isNaN(intValue) ? 0 : intValue;
        } else {
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

      return updatedForm;
    });
  }, []);

  const handleNumericInputChange = (e, updateFunc) => {
    const { name, value } = e.target;
    const numericFields = ["quantityPerBoxStrip", "fob", "cif", "amount"];
    const integerFields = ["quantityPerBoxStrip"];

    if (numericFields.includes(name)) {
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
      updateFunc(e);
    }
  };

  const handleSupplierChange = useCallback((selectedValue) => {
    setForm((prev) => ({
      ...prev,
      supplierName: selectedValue,
    }));
  }, []);

  const handlePurchaseUpdate = async (e) => {
    e.preventDefault();
    try {
      const updateData = {
        invoiceNumber: form.invoiceNumber,
        invoiceDate: form.invoiceDate,
        deliveryNumber: form.deliveryNumber,
        receivedDate: form.receivedDate,
        expiryDate: form.expiryDate,
        supplierName: form.supplierName,
        remarks: form.remarks,
        amount: productTotals.totalAmount,
        products: form.products || [],
      };
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

  const handleDateChange = (date, fieldName) => {
    setForm((prev) => ({
      ...prev,
      [fieldName]: date ? date.toISOString().split("T")[0] : "",
    }));
  };

  const updateFormField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const toggleProductView = (index) => {
    setExpandedProductIndex(expandedProductIndex === index ? -1 : index);
  };

  // Product edit modal functions
  const openProductEditModal = (product, index) => {
    setCurrentProduct({
      ...product,
      productId: product.productId || product._id,
      _id: product.productId || product._id,
      lc: product.lc || 0,
      fob: product.fob || 0,
      cif: product.cif || 0,
      quantityPerBoxStrip: product.quantityPerBoxStrip || 0,
      amount: product.amount || 0,
    });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
  };

  const handleProductEditChange = (e) => {
    const { name, value } = e.target;
    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProductNumericChange = (e) => {
    const { name, value } = e.target;

    if (name === "quantityPerBoxStrip") {
      if (value === "" || /^\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseInt(value) || 0;
        setCurrentProduct((prev) => {
          const updatedProduct = {
            ...prev,
            [name]: processedValue,
          };

          const lcValue = parseFloat(updatedProduct.lc) || 0;
          const quantityValue =
            parseFloat(updatedProduct.quantityPerBoxStrip) || 0;
          updatedProduct.amount =
            Math.round(lcValue * quantityValue * 100) / 100;

          return updatedProduct;
        });
      }
    } else if (["lc", "fob", "cif", "amount"].includes(name)) {
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseFloat(value) || 0;
        setCurrentProduct((prev) => {
          const updatedProduct = {
            ...prev,
            [name]: processedValue,
          };

          if (name === "lc") {
            const lcValue = parseFloat(updatedProduct.lc) || 0;
            const quantityValue =
              parseFloat(updatedProduct.quantityPerBoxStrip) || 0;
            updatedProduct.amount =
              Math.round(lcValue * quantityValue * 100) / 100;
          }

          return updatedProduct;
        });
      }
    } else {
      setCurrentProduct((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const updateProductInForm = () => {
    if (!currentProduct?.productName) {
      showToast("error", "Please select a product name");
      return;
    }

    setForm((prev) => {
      const updatedProducts = [...prev.products];

      const updatedProduct = {
        ...currentProduct,
        productId: currentProduct.productId || currentProduct._id,
        _id: currentProduct.productId || currentProduct._id,
        lc: parseFloat(currentProduct.lc) || 0,
        fob: parseFloat(currentProduct.fob) || 0,
        cif: parseFloat(currentProduct.cif) || 0,
        quantityPerBoxStrip: parseInt(currentProduct.quantityPerBoxStrip) || 0,
        amount: parseFloat(currentProduct.amount) || 0,
      };

      updatedProducts[currentProductIndex] = updatedProduct;

      return {
        ...prev,
        products: updatedProducts,
      };
    });

    showToast("success", "Product updated successfully");
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  // Calculate product totals
  const calculateProductTotals = (products) => {
    if (!products || !Array.isArray(products)) return { totalAmount: 0 };

    const totals = products.reduce(
      (acc, product) => {
        acc.totalAmount += parseFloat(product.amount || 0);
        return acc;
      },
      { totalAmount: 0 }
    );

    return totals;
  };

  const productTotals = calculateProductTotals(form.products);

  // Filtered products in modal
  const filteredProductsInModal = useMemo(() => {
    if (!selectedPurchaseProduct || !selectedPurchaseProduct.products) {
      return [];
    }

    const invoiceProducts = selectedPurchaseProduct.products || [];

    let filtered = invoiceProducts;
    if (selectedTab !== "All") {
      filtered = invoiceProducts.filter((p) => p.productType === selectedTab);
    }

    if (searchTerm.trim() !== "") {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.productName?.toLowerCase().includes(lowerSearch) ||
          selectedPurchaseProduct.supplierName
            ?.toLowerCase()
            .includes(lowerSearch) ||
          p.productType?.toLowerCase().includes(lowerSearch)
      );
    }

    return filtered;
  }, [selectedPurchaseProduct, selectedTab, searchTerm]);

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={handleAddNewPurchase}
            >
              <ShoppingCart size={18} /> Add New Purchase
            </button>

            <button
              onClick={handleImportClick}
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

          {/* RIGHT SIDE: TOTAL + DOWNLOAD + SEARCH */}
          {purchases && purchases.length > 0 && (
            <div className="flex items-center gap-6 flex-wrap justify-end">
              <p className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredPurchases.length}
                </span>
              </p>

              {purchases.length > 0 && (
                <SaleExcelDownload
                  type="purchases"
                  modalTitle="Download Purchase Report"
                  buttonText="Download Purchase Excel"
                  successMessage="Purchase Excel downloaded successfully!"
                  filePrefix="purchase_summary"
                />
              )}

              {/* SEARCH BOX */}
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={() => inputRef.current?.focus()}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search invoice, product, supplier..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200 mt-5">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item, index) => (
                    <th
                      key={`header-${item.id}-${index}`}
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
                    key={purchase._id || `row-${index}`}
                    className={`hover:bg-gray-50 ${
                      index < currentPurchases.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item, cellIndex) => (
                        <td
                          key={`${purchase._id}-${item.id}-${cellIndex}`}
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
                          ) : item.id === "productCount" ? (
                            <button
                              onClick={() => handleProductCountClick(purchase)}
                              className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
                              title="View Product Details"
                            >
                              <Package size={14} />
                              <span className="font-medium">View Product</span>
                            </button>
                          ) : item.id === "supplierName" ? (
                            <span className="capitalize">
                              {purchase.supplierName || "--"}
                            </span>
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

          {/* Enhanced Pagination Controls */}
          {filteredPurchases.length > PURCHASES_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCurrentPage((prev) => {
                      const prevPage = Math.max(prev - 1, 1);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return prevPage;
                    });
                  }}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  ← Prev
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
                      key={`page-${page}-${idx}`}
                      onClick={() => {
                        setCurrentPage(page);
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
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
                    setCurrentPage((prev) => {
                      const nextPage = Math.min(prev + 1, totalPages);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return nextPage;
                    });
                  }}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* VIEW MODAL */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsViewModalOpen(false)}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  View Purchase Record
                </h2>

                {/* Record Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Record Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Invoice Number
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.invoiceNumber || "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Invoice Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.invoiceDate
                          ? formatDateToReadable(form.invoiceDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Delivery Number
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.deliveryNumber || "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Received Date
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.receivedDate
                          ? formatDateToReadable(form.receivedDate)
                          : "-"}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Supplier Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.supplierName || "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Total Amount ($)
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {formatNumber(form.totalAmount)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Product Information Section */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Product Information
                  </h3>

                  {form.products && form.products.length > 0 ? (
                    <div className="space-y-4">
                      {form.products.map((product, index) => (
                        <div
                          key={`product-${index}`}
                          className="border rounded-lg p-4 bg-gray-50"
                        >
                          {/* Product Header with Name and View Button */}
                          <div className="flex justify-between items-center mb-2">
                            {/* Product Name on Left */}
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold text-gray-800 capitalize">
                                {product.productName || `Product ${index + 1}`}
                              </h4>
                            </div>

                            {/* View/Hide Button on Right */}
                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer text-sm"
                              onClick={() => toggleProductView(index)}
                            >
                              {expandedProductIndex === index
                                ? "Hide Details"
                                : "View Details"}
                            </button>
                          </div>

                          {/* Product Details - Conditionally Rendered */}
                          {expandedProductIndex === index && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                              {[
                                ["Product Name", "productName"],
                                ["Product Type", "productType"],
                                [
                                  "Quantity Per Box/Strip",
                                  "quantityPerBoxStrip",
                                ],
                                ["LC (USD)", "lc"],
                                ["FOB (USD)", "fob"],
                                ["CIF (USD)", "cif"],
                                ["Amount ($)", "amount"],
                                ["Expiry Date", "expiryDate"],
                              ].map(([label, key], fieldIndex) => (
                                <div key={`${index}-${key}-${fieldIndex}`}>
                                  <label className="block text-sm font-medium text-gray-600">
                                    {label}
                                  </label>
                                  <p className="border px-3 py-2 rounded-lg bg-white">
                                    {key === "productType"
                                      ? capitalizeFirstLetter(
                                          product[key] || "unknown"
                                        )
                                      : ["fob", "cif", "amount"].includes(key)
                                      ? formatNumber(product[key])
                                      : key === "expiryDate"
                                      ? product[key]
                                        ? formatDateToReadable(product[key])
                                        : "--"
                                      : product[key] ?? "--"}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border rounded-lg p-4 bg-gray-50 text-center text-gray-500">
                      No products found
                    </div>
                  )}
                </div>

                {/* Remarks Section */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-600 mb-2">
                    Remarks
                  </label>
                  <textarea
                    value={form.remarks || "-"}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-100 capitalize"
                    rows={3}
                    disabled
                  />
                </div>

                <div className="mt-6 flex justify-end border-t border-gray-300 pt-4">
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

        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsEditModalOpen(false)}
              />
              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Purchase Record
                </h2>

                <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                  {/* Invoice Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Invoice Number
                    </label>
                    <InputField
                      type="text"
                      name="invoiceNumber"
                      value={form.invoiceNumber}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Invoice Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Invoice Date
                    </label>
                    <DatePicker
                      selected={
                        form.invoiceDate ? new Date(form.invoiceDate) : null
                      }
                      onChange={(date) => handleDateChange(date, "invoiceDate")}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Delivery Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Delivery Number
                    </label>
                    <InputField
                      type="text"
                      name="deliveryNumber"
                      value={form.deliveryNumber}
                      onChange={(e) =>
                        handleNumericInputChange(e, enhancedHandleChange)
                      }
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Received Date
                    </label>
                    <DatePicker
                      selected={
                        form.receivedDate ? new Date(form.receivedDate) : null
                      }
                      onChange={(date) =>
                        handleDateChange(date, "receivedDate")
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Supplier Name - Using SearchableDropdown */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Supplier Name
                    </label>
                    <SearchableDropdown
                      options={supplierOptions.map((supplier) => ({
                        value: supplier.label,
                        label: supplier.label,
                      }))}
                      value={form.supplierName}
                      onChange={(value) =>
                        updateFormField("supplierName", value)
                      }
                      placeholder="Select Supplier"
                      className="w-full"
                    />
                  </div>

                  {/* Total Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Total Amount ($)
                    </label>
                    <InputField
                      type="text"
                      value={productTotals.totalAmount.toFixed(2)}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  {/* Products List */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Products ({form.products?.length || 0})
                    </label>
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      {form.products && form.products.length > 0 ? (
                        form.products.map((product, index) => (
                          <div
                            key={`edit-product-${index}`}
                            className="flex items-center justify-between p-3 bg-white rounded border border-gray-300"
                          >
                            <div className="flex-1">
                              <span className="font-medium text-gray-700 capitalize">
                                {product.productName || `Product ${index + 1}`}
                              </span>
                              <div className="text-sm text-gray-500 mt-1">
                                Qty: {product.quantityPerBoxStrip || 0} | LC: $
                                {(product.lc || 0).toFixed(2)} | FOB: $
                                {(product.fob || 0).toFixed(2)} | CIF: $
                                {(product.cif || 0).toFixed(2)} | Amount: $
                                {(product.amount || 0).toFixed(2)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                openProductEditModal(product, index)
                              }
                              className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm cursor-pointer"
                            >
                              Edit Details
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="text-center text-gray-500 py-4">
                          No products added
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Remarks
                    </label>
                    <textarea
                      name="remarks"
                      value={form.remarks}
                      onChange={enhancedHandleChange}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg"
                      rows={3}
                      placeholder="Enter remarks..."
                    />
                  </div>

                  {/* Footer buttons */}
                  <div className="md:col-span-3 mt-4 flex justify-end gap-3 border-t border-gray-300 pt-4">
                    <button
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                      onClick={handlePurchaseUpdate}
                    >
                      Update
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

        {/* PRODUCT MODAL */}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsProductModalOpen(false)}
              />
              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Product Details -{" "}
                  {selectedPurchaseProduct?.invoiceNumber || "Purchase"}
                </h2>

                {/* Filter Capsules Section */}
                {selectedPurchaseProduct &&
                  selectedPurchaseProduct.products &&
                  selectedPurchaseProduct.products.length > 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-wrap gap-2">
                          {(() => {
                            const invoiceProducts =
                              selectedPurchaseProduct.products || [];

                            if (
                              !invoiceProducts ||
                              invoiceProducts.length === 0
                            ) {
                              return (
                                <button className="px-4 py-2 rounded-full bg-indigo-600 text-white shadow-md text-sm font-medium">
                                  All
                                </button>
                              );
                            }

                            const uniqueTypes = [
                              ...new Set(
                                invoiceProducts
                                  .map((p) => p?.productType)
                                  .filter(Boolean)
                              ),
                            ];

                            return ["All", ...uniqueTypes].map(
                              (type, typeIndex) => (
                                <button
                                  key={`filter-${type}-${typeIndex}`}
                                  onClick={() => handleClick(type)}
                                  className={`px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                                    selectedTab === type
                                      ? "bg-indigo-600 text-white shadow-md"
                                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                  }`}
                                >
                                  {capitalizeFirstLetter(type)}
                                </button>
                              )
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}

                {/* Products Table */}
                {selectedPurchaseProduct && selectedPurchaseProduct.products ? (
                  <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                    <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                      <thead className="bg-gray-100 text-gray-700 border-b">
                        <tr>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Product Name
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Product Type
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Box Qty
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            LC (USD)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Amount ($)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            FOB (USD)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            CIF (USD)
                          </th>
                          <th className="p-3 whitespace-nowrap min-w-[120px] text-sm font-medium">
                            Supplier
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProductsInModal.length > 0 ? (
                          filteredProductsInModal.map((product, index) => (
                            <tr
                              key={product._id || `product-${index}`}
                              className={`hover:bg-gray-50 ${
                                index < filteredProductsInModal.length - 1
                                  ? "border-b"
                                  : ""
                              }`}
                            >
                              <td className="p-3 whitespace-nowrap min-w-[120px] capitalize">
                                {product.productName || "--"}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    product.productType === "physical"
                                      ? "bg-blue-100 text-blue-800"
                                      : product.productType === "digital"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {capitalizeFirstLetter(
                                    product.productType || "unknown"
                                  )}
                                </span>
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {product.quantityPerBoxStrip || 0}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {formatNumber(product.lc || product.lcNumber)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px] font-semibold">
                                {formatNumber(product.amount)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {formatNumber(product.fob)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {formatNumber(product.cif)}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px] capitalize">
                                {selectedPurchaseProduct.supplierName || "--"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan={8}
                              className="p-4 text-center text-gray-500"
                            >
                              No products found for the selected filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>

                    {/* Summary Section */}
                    <div className="bg-gray-50 p-4 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Total Products
                          </p>
                          <p className="text-lg font-bold text-indigo-600">
                            {filteredProductsInModal.length}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Total Amount
                          </p>
                          <p className="text-lg font-bold text-green-600">
                            $
                            {filteredProductsInModal
                              .reduce(
                                (sum, p) => sum + (Number(p.amount) || 0),
                                0
                              )
                              .toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Invoice Date
                          </p>
                          <p className="text-lg font-bold text-blue-600">
                            {formatDateToReadable(
                              selectedPurchaseProduct.invoiceDate
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No product details found.
                  </p>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* PRODUCT EDIT MODAL */}
        {isProductEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsProductEditModalOpen(false)}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setIsProductEditModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  {currentProduct?.productName
                    ? `Edit Product - ${currentProduct.productName}`
                    : "Edit Product"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name - Using SearchableDropdown */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Product Name <span className="text-red-500">*</span>
                    </label>
                    <SearchableDropdown
                      options={productOptions.map((product) => ({
                        value: product.id,
                        label: product.productName || product.label,
                        ...product,
                      }))}
                      value={
                        currentProduct?.productId || currentProduct?.id || ""
                      }
                      onChange={(selectedValue) => {
                        const selectedProduct = productOptions.find(
                          (product) => product.id === selectedValue
                        );

                        if (selectedProduct) {
                          setCurrentProduct((prev) => {
                            const firstBatch =
                              selectedProduct.batches &&
                              selectedProduct.batches.length > 0
                                ? selectedProduct.batches[0]
                                : {};

                            const updatedProduct = {
                              productId: selectedProduct.id,
                              id: selectedProduct.id,
                              _id: selectedProduct.id,
                              productName:
                                selectedProduct.productName ||
                                selectedProduct.label,
                              productType:
                                selectedProduct.productType ||
                                selectedProduct.type ||
                                prev?.productType ||
                                "",
                              quantityPerBoxStrip:
                                prev?.quantityPerBoxStrip || 0,
                              lc:
                                firstBatch.lc ||
                                selectedProduct.lc ||
                                prev?.lc ||
                                0,
                              fob:
                                firstBatch.fob ||
                                selectedProduct.fob ||
                                prev?.fob ||
                                0,
                              cif:
                                firstBatch.cif ||
                                selectedProduct.cif ||
                                prev?.cif ||
                                0,
                              expiryDate:
                                firstBatch.expiryDate || prev?.expiryDate || "",
                              amount: prev?.amount || 0,
                            };

                            const lcValue = parseFloat(updatedProduct.lc) || 0;
                            const quantityValue =
                              parseFloat(updatedProduct.quantityPerBoxStrip) ||
                              0;
                            updatedProduct.amount =
                              Math.round(lcValue * quantityValue * 100) / 100;

                            return updatedProduct;
                          });
                        } else {
                          setCurrentProduct((prev) => ({
                            ...prev,
                            productId: "",
                            id: "",
                            _id: "",
                            productName: "",
                            productType: "",
                            lc: 0,
                            fob: 0,
                            cif: 0,
                          }));
                        }
                      }}
                      placeholder="Select Product"
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Product Type
                    </label>
                    <InputField
                      type="text"
                      name="productType"
                      value={currentProduct?.productType || ""}
                      onChange={handleProductEditChange}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Quantity Per Box/Strip{" "}
                      <span className="text-red-500">*</span>
                    </label>
                    <InputField
                      type="text"
                      name="quantityPerBoxStrip"
                      value={currentProduct?.quantityPerBoxStrip || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^\d*$/.test(value)) {
                          const validatedEvent = {
                            target: {
                              name: e.target.name,
                              value: value === "" ? "" : parseInt(value) || 0,
                            },
                          };
                          handleProductEditChange(validatedEvent);

                          setTimeout(() => {
                            setCurrentProduct((prev) => {
                              if (!prev) return prev;
                              const lcValue = parseFloat(prev.lc) || 0;
                              const quantityValue =
                                parseFloat(validatedEvent.target.value) || 0;
                              const newAmount =
                                Math.round(lcValue * quantityValue * 100) / 100;
                              return {
                                ...prev,
                                amount: newAmount,
                              };
                            });
                          }, 100);
                        }
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                      placeholder="Enter quantity"
                    />
                  </div>

                  {/* LC Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      LC (USD) <span className="text-red-500">*</span>
                    </label>
                    <InputField
                      type="text"
                      name="lc"
                      value={currentProduct?.lc || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                          const validatedEvent = {
                            target: {
                              name: e.target.name,
                              value: value,
                            },
                          };
                          handleProductEditChange(validatedEvent);

                          setTimeout(() => {
                            setCurrentProduct((prev) => {
                              if (!prev) return prev;
                              const lcValue = parseFloat(value) || 0;
                              const quantityValue =
                                parseFloat(prev.quantityPerBoxStrip) || 0;
                              const newAmount =
                                Math.round(lcValue * quantityValue * 100) / 100;
                              return {
                                ...prev,
                                amount: newAmount,
                              };
                            });
                          }, 100);
                        }
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </div>

                  {/* FOB Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      FOB (USD)
                    </label>
                    <InputField
                      type="text"
                      name="fob"
                      value={currentProduct?.fob || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                          handleProductEditChange({
                            target: {
                              name: e.target.name,
                              value: value,
                            },
                          });
                        }
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </div>

                  {/* CIF Field */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      CIF (USD)
                    </label>
                    <InputField
                      type="text"
                      name="cif"
                      value={currentProduct?.cif || ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
                          handleProductEditChange({
                            target: {
                              name: e.target.name,
                              value: value,
                            },
                          });
                        }
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Amount ($) <span className="text-red-500">*</span>
                    </label>
                    <InputField
                      type="text"
                      name="amount"
                      value={currentProduct?.amount || ""}
                      className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-700 border-gray-300"
                      disabled
                      placeholder="0.00"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Expiry Date
                    </label>
                    <DatePicker
                      selected={
                        currentProduct?.expiryDate
                          ? new Date(currentProduct.expiryDate)
                          : null
                      }
                      onChange={(date) =>
                        setCurrentProduct((prev) => ({
                          ...prev,
                          expiryDate: date
                            ? date.toISOString().split("T")[0]
                            : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select expiry date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>

                  {/* Batch Information Display */}
                  {currentProduct?.batches &&
                    currentProduct.batches.length > 0 && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Batch Information
                        </label>
                        <div className="border rounded-lg p-3 bg-blue-50">
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="font-medium">Batch Date:</span>
                              <p>
                                {formatDateToReadable(
                                  currentProduct.batches[0].date
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Expiry:</span>
                              <p>
                                {formatDateToReadable(
                                  currentProduct.batches[0].expiryDate
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Boxes:</span>
                              <p>{currentProduct.batches[0].boxes}</p>
                            </div>
                          </div>
                          <div className="mt-2 text-xs text-gray-600">
                            Note: LC, FOB, CIF values are linked to the selected
                            batch
                          </div>
                        </div>
                      </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-3 border-t border-gray-300 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsProductEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed"
                    onClick={updateProductInForm}
                    disabled={
                      !currentProduct?.productName ||
                      !currentProduct?.quantityPerBoxStrip
                    }
                  >
                    Update Product
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 flex justify-center items-center z-50">
              {/* Background Overlay */}
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => !isUploading && setShowImportModal(false)}
              />

              {/* Modal Content */}
              <div
                className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative z-10"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <button
                  onClick={() => !isUploading && setShowImportModal(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                  disabled={isUploading}
                >
                  <X size={20} />
                </button>

                {/* Header */}
                <h2 className="text-lg font-semibold mb-4">Import Purchase</h2>
                {isSampleFile && <PurchaseSampleExcelDownload />}

                {/* File Input */}
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2">
                    Select File
                  </label>
                  <input
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileUpload}
                    className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                    disabled={isUploading}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Supported formats: Excel (.xlsx, .xls) or CSV
                  </p>
                </div>

                {/* Row Count Display */}
                <div className="flex justify-between items-center mb-6">
                  <div className="text-gray-700">
                    {parsedData.length > 0 ? (
                      <>
                        Rows to import:{" "}
                        <span className="font-semibold text-blue-600">
                          {parsedData.length}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">No data to import</span>
                    )}
                  </div>
                  <div className="flex gap-3">
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
                      disabled={isUploading || parsedData.length === 0}
                      className={`px-5 py-2 rounded-lg cursor-pointer ${
                        isUploading || parsedData.length === 0
                          ? "bg-blue-400 text-white cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {isUploading
                        ? "Uploading…"
                        : `Upload (${parsedData.length})`}
                    </button>
                  </div>
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
