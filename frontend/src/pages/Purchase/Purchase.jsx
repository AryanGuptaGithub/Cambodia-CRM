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
  CheckCircle,
  AlertCircle,
  Download,
  Menu,
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
import SaleExcelDownload from "../../excels/download/ExcelDownload";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";

export const parseExcelDateValue = (value) => {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    if (isNaN(value.getTime())) {
      return "";
    }

    let year = value.getFullYear();
    let month = value.getMonth();
    let day = value.getDate();

    if (value.getHours() >= 23) {
      const temp = new Date(year, month, day + 1);
      year = temp.getFullYear();
      month = temp.getMonth();
      day = temp.getDate();
    }

    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  if (typeof value === "number") {
    return excelSerialToDate(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const ddmmyyyy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (ddmmyyyy) {
      const day = parseInt(ddmmyyyy[1], 10);
      const month = parseInt(ddmmyyyy[2], 10);
      let year = parseInt(ddmmyyyy[3], 10);

      if (year < 100) {
        year += year < 30 ? 2000 : 1900;
      }

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }

    const namedMonth = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i);
    if (namedMonth) {
      const monthMap = {
        january: 1,
        jan: 1,
        february: 2,
        feb: 2,
        march: 3,
        mar: 3,
        april: 4,
        apr: 4,
        may: 5,
        june: 6,
        jun: 6,
        july: 7,
        jul: 7,
        august: 8,
        aug: 8,
        september: 9,
        sep: 9,
        october: 10,
        oct: 10,
        november: 11,
        nov: 11,
        december: 12,
        dec: 12,
      };

      const day = parseInt(namedMonth[1], 10);
      const month = monthMap[namedMonth[2].toLowerCase()];
      const year = parseInt(namedMonth[3], 10);

      if (month && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
  }

  console.warn("Unrecognized date format:", value);
  return "";
};

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

const parseXLSXDate = (val) => {
  if (!val && val !== 0) return "";

  if (val instanceof Date) {
    return isNaN(val.getTime()) ? "" : val.toISOString().split("T")[0];
  }

  if (typeof val === "number") {
    const excelEpoch = new Date(1900, 0, 0);
    const date = new Date(excelEpoch.getTime() + (val - 1) * 86400000);
    return isNaN(date.getTime()) ? "" : date.toISOString().split("T")[0];
  }

  const d = dayjs(val.toString().trim());
  return d.isValid() ? d.format("YYYY-MM-DD") : "";
};

function Purchase() {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [form, setForm] = useState(initialFormState);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedPurchaseProduct, setSelectedPurchaseProduct] = useState(null);
  const inputRef = useRef(null);
  const [expandedProductIndex, setExpandedProductIndex] = useState(-1);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Mobile view states
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Product edit modal states
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);

  const PURCHASES_PER_PAGE = 9;

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

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
    [],
  );

  const allFields = useMemo(
    () => [
      { id: "invoiceNumber", name: "Invoice No", dbName: "invoiceNumber" },
      { id: "invoiceDate", name: "Invoice Date", dbName: "invoiceDate" },
      { id: "deliveryNumber", name: "Delivery No", dbName: "deliveryNumber" },
      { id: "supplierName", name: "Supplier Name", dbName: "supplierName" },
      { id: "productCount", name: "Product", dbName: "productCount" },
      { id: "amount", name: "Total Amount ($)", dbName: "totalAmount" },
      { id: "actions", name: "Actions", dbName: "actions" },
    ],
    [],
  );

  const validateSuppliersAndProducts = () => {
    if (!supplierOptions.length && !productOptions.length) {
      showToast(
        "error",
        "No suppliers and products found. Please add at least one supplier and one product first.",
      );
      return false;
    } else if (!supplierOptions.length) {
      showToast(
        "error",
        "No suppliers found. Please add at least one supplier first.",
      );
      return false;
    } else if (!productOptions.length) {
      showToast(
        "error",
        "No products found. Please add at least one product first.",
      );
      return false;
    }
    return true;
  };

  const handleImportClick = () => {
    if (!validateSuppliersAndProducts()) return;
    setShowImportModal(true);
  };

  const handleDownloadAllExcel = async () => {
    setIsDownloadingAll(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.post(
        `${backendUrl}/api/purchase/download-excel`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: "blob",
        },
      );

      const contentDisposition = response.headers["content-disposition"];
      let fileName = `PurchaseInventory_${dayjs().format("DD-MM-YYYY")}.xlsx`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) fileName = match[1];
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast("success", "Purchase inventory downloaded successfully!");
    } catch (error) {
      console.error("Download error:", error);
      if (error.response && error.response.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = JSON.parse(reader.result);
            showToast("error", json.message || "Failed to download");
          } catch {
            showToast("error", "Failed to download purchase inventory");
          }
        };
        reader.readAsText(error.response.data);
      } else {
        showToast(
          "error",
          error.response?.data?.message ||
            "Failed to download purchase inventory",
        );
      }
    } finally {
      setIsDownloadingAll(false);
    }
  };

  const capitalizeFirstLetter = (string) => {
    if (!string) return "--";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const getFieldValue = (purchase, dbName) => {
    if (!purchase || typeof purchase !== "object") return "--";
    if (["receivedDate", "expiryDate", "invoiceDate"].includes(dbName)) {
      return formatDateToReadable(purchase[dbName]) || "--";
    }
    if (dbName === "supplierName") return purchase.supplierName || "--";
    if (dbName === "amount") return formatNumber(Number(purchase.amount) || 0);
    if (dbName === "quantityPerBoxStrip")
      return Number(purchase.quantityPerBoxStrip) || 0;
    if (dbName === "lcNumber")
      return formatNumber(parseFloat(purchase.lcNumber) || 0);
    if (dbName === "fob" || dbName === "cif")
      return formatNumber(parseFloat(purchase[dbName]) || 0);
    const value = purchase[dbName];
    if (value === null || value === undefined || value === "") return "--";
    return value;
  };

  const handleProductCountClick = (purchase) => {
    setSelectedPurchaseProduct(purchase);
    setIsProductModalOpen(true);
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const result = await fetchProductsAPI();
      if (result.success) setProductOptions(result.data);
      else showToast("error", result.error || "Failed to load products");
    } catch (error) {
      showToast("error", "Failed to load products");
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const result = await fetchSuppliersAPI();
      if (result.success) setSupplierOptions(result.data);
      else showToast("error", result.error || "Failed to load suppliers");
    } catch (error) {
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
      let purchaseArray = [];

      if (Array.isArray(purchaseData)) purchaseArray = purchaseData;
      else if (purchaseData.purchases && Array.isArray(purchaseData.purchases))
        purchaseArray = purchaseData.purchases;
      else if (purchaseData.data && Array.isArray(purchaseData.data))
        purchaseArray = purchaseData.data;
      else if (purchaseData.result && Array.isArray(purchaseData.result))
        purchaseArray = purchaseData.result;

      const typeSet = new Set();
      if (Array.isArray(purchaseArray) && purchaseArray.length > 0) {
        purchaseArray.forEach((purchase) => {
          if (purchase.products && Array.isArray(purchase.products)) {
            purchase.products.forEach((product) => {
              const type = product.productType;
              if (type && type.trim() && type.toLowerCase() !== "unknown")
                typeSet.add(type.trim());
            });
          }
        });
      }
      setPurchases(purchaseArray);
      setTypes(["All", ...Array.from(typeSet).sort()]);
    } catch (error) {
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
            product.productName?.toLowerCase().includes(lowerSearch),
          ))
      );
    });
  }, [purchases, searchTerm, selectedTab]);

  const currentPurchases = useMemo(() => {
    const start = (currentPage - 1) * PURCHASES_PER_PAGE;
    return filteredPurchases.slice(start, start + PURCHASES_PER_PAGE);
  }, [filteredPurchases, currentPage]);

  const totalPages = useMemo(
    () => Math.ceil(filteredPurchases.length / PURCHASES_PER_PAGE),
    [filteredPurchases.length],
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  );

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
      return exists
        ? prev.filter((c) => c.id !== purchase._id)
        : [...prev, { id: purchase._id }];
    });
  };

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentPurchases.map((purchase) => ({ id: purchase._id }))
          : [],
      );
    },
    [currentPurchases],
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
        const token = localStorage.getItem("token");
        const res = await axios.delete(
          `${backendUrl}/api/purchase/${purchase._id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Purchase <b>${purchase?.invoiceNumber}</b> deleted successfully`,
          );
          fetchPurchaseDetails();
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete purchase.",
        );
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
        const token = localStorage.getItem("token");
        const selectedIds = selected.map((item) => item.id);
        const res = await axios.delete(`${backendUrl}/api/purchase`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { ids: selectedIds },
        });
        if (res.status === 200) {
          showToast(
            "success",
            `Selected <b>${selected.length}</b> purchase(s) deleted successfully`,
          );
          fetchPurchaseDetails();
          setSelected([]);
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message ||
            "Failed to delete selected purchases.",
        );
      }
    } else {
      setSelected([]);
    }
  };

  const enhancedHandleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      let processedValue = value;
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
      return { ...prev, [name]: processedValue };
    });
  }, []);

  const handleNumericInputChange = (e, updateFunc) => {
    const { name, value } = e.target;
    const numericFields = ["quantityPerBoxStrip", "fob", "cif", "amount"];
    const integerFields = ["quantityPerBoxStrip"];
    if (numericFields.includes(name)) {
      if (integerFields.includes(name)) {
        if (value === "" || /^\d*$/.test(value)) {
          updateFunc({
            target: { name, value: value === "" ? "" : parseInt(value) || 0 },
          });
        }
      } else {
        if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
          updateFunc({ target: { name, value } });
        }
      }
    } else {
      updateFunc(e);
    }
  };

  const handleSupplierChange = useCallback((selectedValue) => {
    setForm((prev) => ({ ...prev, supplierName: selectedValue }));
  }, []);

  const handlePurchaseUpdate = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem("token");
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
        updateData,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (res.status === 200) {
        showToast("success", "Purchase updated successfully");
        setIsEditModalOpen(false);
        setForm(initialFormState);
        fetchPurchaseDetails();
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update purchase.",
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
    setCurrentProduct((prev) => ({ ...prev, [name]: value }));
  };

  const handleProductNumericChange = (e) => {
    const { name, value } = e.target;
    if (name === "quantityPerBoxStrip") {
      if (value === "" || /^\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseInt(value) || 0;
        setCurrentProduct((prev) => {
          const updatedProduct = { ...prev, [name]: processedValue };
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
          const updatedProduct = { ...prev, [name]: processedValue };
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
      setCurrentProduct((prev) => ({ ...prev, [name]: value }));
    }
  };

  const updateProductInForm = () => {
    if (!currentProduct?.productName) {
      showToast("error", "Please select a product name");
      return;
    }
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[currentProductIndex] = {
        ...currentProduct,
        productId: currentProduct.productId || currentProduct._id,
        _id: currentProduct.productId || currentProduct._id,
        lc: parseFloat(currentProduct.lc) || 0,
        fob: parseFloat(currentProduct.fob) || 0,
        cif: parseFloat(currentProduct.cif) || 0,
        quantityPerBoxStrip: parseInt(currentProduct.quantityPerBoxStrip) || 0,
        amount: parseFloat(currentProduct.amount) || 0,
      };
      return { ...prev, products: updatedProducts };
    });
    showToast("success", "Product updated successfully");
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  const calculateProductTotals = (products) => {
    if (!products || !Array.isArray(products)) return { totalAmount: 0 };
    return products.reduce(
      (acc, product) => {
        acc.totalAmount += parseFloat(product.amount || 0);
        return acc;
      },
      { totalAmount: 0 },
    );
  };

  const productTotals = calculateProductTotals(form.products);

  const filteredProductsInModal = useMemo(() => {
    if (!selectedPurchaseProduct || !selectedPurchaseProduct.products)
      return [];
    const invoiceProducts = selectedPurchaseProduct.products || [];
    let filtered = invoiceProducts;
    if (selectedTab !== "All") {
      filtered = invoiceProducts.filter(
        (p) => p.productType === selectedTab || p.type === selectedTab,
      );
    }
    if (searchTerm.trim() !== "") {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.productName?.toLowerCase().includes(lowerSearch) ||
          selectedPurchaseProduct.supplierName
            ?.toLowerCase()
            .includes(lowerSearch) ||
          p.productType?.toLowerCase().includes(lowerSearch) ||
          p.type?.toLowerCase().includes(lowerSearch),
      );
    }
    return filtered;
  }, [selectedPurchaseProduct, selectedTab, searchTerm]);

  // ========== IMPORT MODAL ==========
  const ImportModal = ({ isOpen, onClose, isSampleFile }) => {
    const [parsedData, setParsedData] = useState([]);
    const [isUploading, setIsUploading] = useState(false);
    const [parseErrors, setParseErrors] = useState([]);
    const [fileName, setFileName] = useState("");
    const [existingInvoices, setExistingInvoices] = useState([]);
    const [duplicateRows, setDuplicateRows] = useState([]);
    const [loadingExisting, setLoadingExisting] = useState(false);

    const getRowKey = (group) =>
      `${group.invoiceNumber || ""}||${group.supplierName || ""}||${group.deliveryNumber || ""}`
        .toLowerCase()
        .trim();

    useEffect(() => {
      if (isOpen) fetchExistingInvoices();
    }, [isOpen]);

    const fetchExistingInvoices = async () => {
      setLoadingExisting(true);
      try {
        const res = await axios.get(`${backendUrl}/api/purchase/invoice`);
        if (Array.isArray(res.data)) setExistingInvoices(res.data);
      } catch (error) {
        showToast(
          "error",
          "Could not load existing invoices for duplicate check",
        );
      } finally {
        setLoadingExisting(false);
      }
    };

    useEffect(() => {
      if (!parsedData.length) {
        setDuplicateRows([]);
        return;
      }
      const duplicateIndices = new Set();
      const keyCount = new Map();
      parsedData.forEach((group) => {
        const key = getRowKey(group);
        keyCount.set(key, (keyCount.get(key) || 0) + 1);
      });
      parsedData.forEach((group, idx) => {
        if (keyCount.get(getRowKey(group)) > 1) duplicateIndices.add(idx);
      });
      if (existingInvoices.length > 0) {
        const existingKeys = new Set(
          existingInvoices.map((inv) =>
            `${inv.invoiceNumber}||${inv.supplierName || ""}`
              .toLowerCase()
              .trim(),
          ),
        );
        parsedData.forEach((group, idx) => {
          const shortKey =
            `${group.invoiceNumber || ""}||${group.supplierName || ""}`
              .toLowerCase()
              .trim();
          if (existingKeys.has(shortKey)) duplicateIndices.add(idx);
        });
      }
      setDuplicateRows(
        parsedData.filter((_, idx) => duplicateIndices.has(idx)),
      );
    }, [parsedData, existingInvoices]);

    const handleFileUpload = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      setParseErrors([]);
      setParsedData([]);
      setDuplicateRows([]);

      const reader = new FileReader();
      reader.onload = (evt) => {
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

          let headerRowIndex = -1;
          for (let i = 0; i < Math.min(rows.length, 15); i++) {
            const rowText = (rows[i] || []).join(" ").toLowerCase();
            if (
              rowText.includes("invoice") &&
              rowText.includes("supplier") &&
              rowText.includes("product")
            ) {
              headerRowIndex = i;
              break;
            }
          }
          if (headerRowIndex === -1) {
            showToast(
              "error",
              "Could not find header row containing 'Invoice', 'Supplier', and 'Product'",
            );
            return;
          }

          const headers = rows[headerRowIndex].map(
            (h) => h?.toString().trim() || "",
          );
          const dataRows = rows.slice(headerRowIndex + 1);

          const getValue = (obj, keys) => {
            for (const key of keys) {
              for (const k in obj) {
                if (
                  k.toLowerCase().trim() === key.toLowerCase().trim() &&
                  obj[k] !== "" &&
                  obj[k] !== null &&
                  obj[k] !== undefined
                )
                  return obj[k];
              }
            }
            return "";
          };

          const parseNumber = (val) => {
            if (!val && val !== 0) return 0;
            if (typeof val === "number") return val;
            const num = parseFloat(val.toString().trim().replace(/[$,]/g, ""));
            return isNaN(num) ? 0 : num;
          };

          const rowErrors = [];
          const validRowsMap = new Map();

          dataRows.forEach((row, idx) => {
            const obj = {};
            headers.forEach((h, i) => {
              if (h) obj[h] = row[i] !== undefined ? row[i] : "";
            });
            if (
              !Object.values(obj).some((v) => {
                if (v === "" || v === null || v === undefined) return false;
                if (typeof v === "string" && v.trim() === "") return false;
                return true;
              })
            )
              return;

            const invoiceNumber =
              getValue(obj, ["Invoice Number", "Invoice No", "Invoice"])
                ?.toString()
                .trim() || "";
            const supplierName =
              getValue(obj, ["Supplier Name", "Supplier"])?.toString().trim() ||
              "";
            const productName =
              getValue(obj, ["Product Name", "Product"])?.toString().trim() ||
              "";
            const quantity = parseNumber(
              getValue(obj, [
                "Quantity Per Box/Strip",
                "Quantity per Box/Strip",
                "Quantity",
                "Qty",
              ]),
            );
            const lc = parseNumber(getValue(obj, ["LC (USD)", "LC", "Lc"]));
            const fob = parseNumber(getValue(obj, ["FOB (USD)", "FOB", "Fob"]));
            const cif = parseNumber(getValue(obj, ["CIF (USD)", "CIF", "Cif"]));

            const invoiceDate = parseExcelDateValue(
              getValue(obj, ["Invoice Date"]),
            );
            const deliveryNumber =
              getValue(obj, ["Delivery Number", "Delivery No.", "Delivery No"])
                ?.toString()
                .trim() || invoiceNumber;
            const receivedDate =
              parseExcelDateValue(getValue(obj, ["Received Date"])) ||
              invoiceDate;
            const expiryDate = parseExcelDateValue(
              getValue(obj, ["Expiry Date"]),
            );
            const remarks =
              getValue(obj, ["Remarks", "Note"])?.toString().trim() || "";

            if (!productName) {
              rowErrors.push(
                `Row ${headerRowIndex + idx + 2}: Missing product name — skipped`,
              );
              return;
            }

            const groupKey = `${invoiceNumber}||${supplierName}||${deliveryNumber}`;

            if (!validRowsMap.has(groupKey)) {
              validRowsMap.set(groupKey, {
                invoiceNumber: invoiceNumber || `TEMP_${Date.now()}_${idx}`,
                invoiceDate,
                deliveryNumber,
                receivedDate,
                supplierName: supplierName || "Unknown",
                remarks,
                products: [],
              });
            }

            validRowsMap.get(groupKey).products.push({
              productName,
              expiryDate,
              quantityPerBoxStrip: quantity,
              fob,
              cif,
              lc,
              amount: quantity * lc,
            });
          });

          const groupedData = Array.from(validRowsMap.values());

          if (groupedData.length === 0) {
            showToast("warning", "No valid invoice records found.");
            return;
          }
          groupedData.forEach((group) => {
            group.totalAmount = group.products.reduce(
              (sum, p) => sum + (p.amount || 0),
              0,
            );
            group.productCount = group.products.length;
          });
          setParsedData(groupedData);
          setParseErrors(rowErrors);
          if (rowErrors.length)
            showToast(
              "warning",
              `${groupedData.length} valid invoice group(s), ${rowErrors.length} row(s) skipped`,
            );
        } catch (err) {
          showToast("error", "Failed to parse file: " + err.message);
        }
      };
      reader.readAsArrayBuffer(file);
    };

    const handleImport = async () => {
      if (!parsedData.length) {
        showToast("warning", "Upload a valid file first");
        return;
      }
      const uniqueData = parsedData.filter(
        (row) => !duplicateRows.includes(row),
      );
      if (uniqueData.length === 0) {
        showToast("warning", "No unique records to import");
        return;
      }
      setIsUploading(true);
      try {
        const res = await axios.post(
          `${backendUrl}/api/purchase/import`,
          uniqueData,
          {
            headers: { "Content-Type": "application/json" },
            timeout: 60000,
          },
        );
        if (res.status === 200) {
          showToast(
            "success",
            res.data.message ||
              `Imported ${uniqueData.length} invoices successfully`,
          );
          onClose(true);
        } else {
          showToast("info", res.data.message);
          onClose(true);
        }
      } catch (err) {
        let msg = "Import failed";
        if (err.response?.data?.message) msg = err.response.data.message;
        else if (err.request) msg = "No response from server. Check network.";
        else msg = err.message || "Unknown error";
        showToast("error", msg);
      } finally {
        setIsUploading(false);
      }
    };

    if (!isOpen) return null;
    const isDuplicateRow = (row) => duplicateRows.includes(row);

    return ReactDOM.createPortal(
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
        <div className="bg-white w-full max-w-lg p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
          <button
            onClick={() => onClose(false)}
            disabled={isUploading}
            className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            <X size={20} />
          </button>
          <h2 className="text-lg font-semibold mb-1">
            Import Purchase Invoices
          </h2>
          {isSampleFile && <PurchaseSampleExcelDownload />}
          <div className="mb-4">
            <label className="block text-gray-700 mb-2 font-medium">
              Select File
            </label>
            <input
              type="file"
              accept=".csv,.xlsx"
              onChange={handleFileUpload}
              className="block w-full border rounded-lg px-3 py-2 text-sm"
            />
            {fileName && (
              <p className="text-xs text-gray-500 mt-1">📄 {fileName}</p>
            )}
          </div>
          {loadingExisting && (
            <div className="mb-4 text-sm text-blue-600 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Loading existing invoices for duplicate check...
            </div>
          )}
          {duplicateRows.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-red-600" />
                <span className="text-sm font-medium text-red-800">
                  {duplicateRows.length} duplicate invoice(s) found
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto text-xs text-red-700">
                {duplicateRows.slice(0, 5).map((row, i) => (
                  <div key={i} className="mb-1">
                    • {row.invoiceNumber} ({row.supplierName}) —{" "}
                    {row.deliveryNumber} — {row.productCount} products
                  </div>
                ))}
                {duplicateRows.length > 5 && (
                  <div>...and {duplicateRows.length - 5} more</div>
                )}
              </div>
              <p className="text-xs text-red-600 mt-2">
                Duplicate invoices are highlighted below. They will be skipped
                during import.
              </p>
            </div>
          )}
          {parsedData.length > 0 && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  {parsedData.length} Total Invoice Groups
                  {duplicateRows.length > 0 && (
                    <span className="ml-2 text-red-600">
                      ({parsedData.length - duplicateRows.length} unique)
                    </span>
                  )}
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-green-100">
                    <tr>
                      <th className="p-1 text-left">#</th>
                      <th className="p-1 text-left">Invoice</th>
                      <th className="p-1 text-left">Supplier</th>
                      <th className="p-1 text-left">Delivery</th>
                      <th className="p-1 text-left">Date</th>
                      <th className="p-1 text-left">Prods</th>
                      <th className="p-1 text-left">Total ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 8).map((row, i) => {
                      const duplicate = isDuplicateRow(row);
                      return (
                        <tr
                          key={i}
                          className={`border-t ${duplicate ? "bg-red-100 text-red-800 font-medium" : ""}`}
                        >
                          <td className="p-1 text-gray-500">{i + 1}</td>
                          <td className="p-1">{row.invoiceNumber || "—"}</td>
                          <td className="p-1 truncate max-w-[80px]">
                            {row.supplierName || "—"}
                          </td>
                          <td className="p-1">{row.deliveryNumber || "—"}</td>
                          <td className="p-1">{row.invoiceDate || "—"}</td>
                          <td className="p-1">{row.productCount || 0}</td>
                          <td className="p-1">
                            {row.totalAmount?.toFixed(2) || "0.00"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {parsedData.length > 8 && (
                  <p className="text-xs text-gray-500 text-center mt-1">
                    ...and {parsedData.length - 8} more invoice groups
                  </p>
                )}
              </div>
            </div>
          )}
          {parseErrors.length > 0 && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-28 overflow-y-auto">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={14} className="text-yellow-600" />
                <span className="text-xs font-medium text-yellow-800">
                  {parseErrors.length} rows skipped
                </span>
              </div>
              {parseErrors.slice(0, 5).map((err, i) => (
                <p key={i} className="text-xs text-yellow-700">
                  {err}
                </p>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-4 gap-3">
            <button
              onClick={() => onClose(false)}
              disabled={isUploading}
              className="px-5 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-700 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={
                isUploading || parsedData.length === 0 || loadingExisting
              }
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  };

  if (loading) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-4 md:p-6 relative">
      {/* Sidebar for mobile */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      <ImportModal
        isOpen={showImportModal}
        onClose={(shouldRefresh) => {
          setShowImportModal(false);
          if (shouldRefresh) fetchPurchaseDetails();
        }}
        isSampleFile={isSampleFile}
      />

      <div className="container">
        {/* ── MOBILE header ── */}
        {isMobileView && (
          <div className="flex justify-between items-center mb-4 rounded-2xl p-2 bg-gray-200">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} />
            </button>
            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
              Total Purchase: {filteredPurchases.length}
            </div>
          </div>
        )}

        {/* ── DESKTOP action bar ── */}
        {!isMobileView && (
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 w-full mb-4">
            <div className="flex gap-3 items-center flex-wrap">
              <button
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={() => {
                  if (validateSuppliersAndProducts())
                    navigate("/purchaselayout/purchase/new");
                }}
              >
                <ShoppingCart size={18} /> Add New Purchase
              </button>

              <button
                onClick={handleImportClick}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Upload size={18} /> Import Purchase
              </button>

              {isSampleDownloadFile && (
                <button
                  onClick={handleDownloadAllExcel}
                  disabled={isDownloadingAll}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl shadow-md cursor-pointer transition-colors"
                  title="Download all purchase entries as Excel"
                >
                  {isDownloadingAll ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Downloading…
                    </>
                  ) : (
                    <>
                      <Download size={18} /> Download All Excel
                    </>
                  )}
                </button>
              )}

              {selected.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                >
                  <Trash2 size={18} /> Delete
                </button>
              )}
            </div>

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
                    type="purchase"
                    modalTitle="Download Purchase Report"
                    buttonText="Download Purchase Excel"
                    successMessage="Purchase Excel downloaded successfully!"
                    filePrefix="purchase_summary"
                  />
                )}

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
        )}

        {/* ── MOBILE search ── */}
        {isMobileView && (
          <div className="relative mb-3">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search invoice, product, supplier..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm text-sm"
            />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200 mt-2">
          <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item, index) => (
                    <th
                      key={`header-${item.id}-${index}`}
                      className={`p-3 whitespace-nowrap min-w-[120px] font-medium ${
                        isMobileView ? "text-[10px]" : "text-sm"
                      }`}
                    >
                      {item.id === "invoiceNumber" ? (
                        <div className="flex items-center gap-4">
                          {!isMobileView && currentPurchases.length > 0 && (
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
                          className={`p-3 whitespace-nowrap min-w-[120px] ${
                            isMobileView ? "text-[9px]" : "text-sm"
                          }`}
                        >
                          {item.id === "invoiceNumber" ? (
                            <div className="flex items-center gap-4">
                              {!isMobileView && (
                                <input
                                  type="checkbox"
                                  checked={selected.some(
                                    (s) => s.id === purchase._id,
                                  )}
                                  onChange={() => toggleSelect(purchase)}
                                />
                              )}
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
                            <div className="flex items-center justify-center gap-3 min-w-[80px]">
                              {/* View — always visible */}
                              <button
                                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                                onClick={() => handleView(purchase)}
                                title="View"
                              >
                                <Eye size={isMobileView ? 16 : 18} />
                              </button>
                              {/* Edit & Delete — desktop only */}
                              {!isMobileView && (
                                <>
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
                                </>
                              )}
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

          {filteredPurchases.length > PURCHASES_PER_PAGE && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => {
                      const p = Math.max(prev - 1, 1);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return p;
                    })
                  }
                  disabled={currentPage === 1}
                  className="px-2 md:px-4 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
                >
                  ← Prev
                </button>
                {!isMobileView ? (
                  visiblePages.map((page, idx) =>
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
                        className={`px-2 md:px-4 py-1 rounded w-10 text-center transition cursor-pointer ${
                          currentPage === page
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-200 hover:bg-gray-300"
                        }`}
                      >
                        {page}
                      </button>
                    ),
                  )
                ) : (
                  <span className="px-3 py-1 text-sm text-gray-700 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                )}
                <button
                  onClick={() =>
                    setCurrentPage((prev) => {
                      const p = Math.min(prev + 1, totalPages);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                      return p;
                    })
                  }
                  disabled={currentPage === totalPages}
                  className="px-2 md:px-4 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer flex items-center gap-1"
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
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-700 mb-3">
                    Record Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      ["Invoice Number", form.invoiceNumber || "-"],
                      [
                        "Invoice Date",
                        form.invoiceDate
                          ? formatDateToReadable(form.invoiceDate)
                          : "-",
                      ],
                      ["Delivery Number", form.deliveryNumber || "-"],
                      [
                        "Received Date",
                        form.receivedDate
                          ? formatDateToReadable(form.receivedDate)
                          : "-",
                      ],
                      ["Supplier Name", form.supplierName || "-"],
                      ["Total Amount ($)", formatNumber(form.totalAmount)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <label className="block text-sm font-medium text-gray-600">
                          {label}
                        </label>
                        <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
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
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="text-lg font-semibold text-gray-800 capitalize">
                              {product.productName || `Product ${index + 1}`}
                            </h4>
                            <button
                              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer text-sm"
                              onClick={() => toggleProductView(index)}
                            >
                              {expandedProductIndex === index
                                ? "Hide Details"
                                : "View Details"}
                            </button>
                          </div>
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
                                          product[key] || "unknown",
                                        )
                                      : ["fob", "cif", "amount"].includes(key)
                                        ? formatNumber(product[key])
                                        : key === "expiryDate"
                                          ? product[key]
                                            ? formatDateToReadable(product[key])
                                            : "--"
                                          : (product[key] ?? "--")}
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
            document.body,
          )}

        {/* EDIT MODAL */}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Supplier Name
                    </label>
                    <SearchableDropdown
                      options={supplierOptions.map((s) => ({
                        value: s.label,
                        label: s.label,
                      }))}
                      value={form.supplierName}
                      onChange={(value) =>
                        updateFormField("supplierName", value)
                      }
                      placeholder="Select Supplier"
                      className="w-full"
                    />
                  </div>
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
            document.body,
          )}

        {/* PRODUCT MODAL */}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsProductModalOpen(false)}
              />
              <div
                className={`bg-white w-full max-w-6xl ${
                  isMobileView ? "mx-4 p-4" : "p-6"
                } rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto`}
              >
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2
                  className={`${isMobileView ? "text-sm" : "text-xl"} font-semibold text-gray-800 mb-4`}
                >
                  Product Details -{" "}
                  {selectedPurchaseProduct?.invoiceNumber || "Purchase"}
                </h2>
                {selectedPurchaseProduct?.products?.length > 0 && (
                  <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                    <div className="flex flex-wrap gap-2">
                      {(() => {
                        const invoiceProducts =
                          selectedPurchaseProduct.products || [];
                        const uniqueTypes = [
                          ...new Set(
                            invoiceProducts
                              .map((p) => p?.productType || p?.type)
                              .filter(Boolean),
                          ),
                        ];
                        return ["All", ...uniqueTypes].map(
                          (type, typeIndex) => (
                            <button
                              key={`filter-${type}-${typeIndex}`}
                              onClick={() => handleClick(type)}
                              className={`${
                                isMobileView
                                  ? "px-2 py-1 text-[10px]"
                                  : "px-4 py-2 text-sm"
                              } rounded-lg cursor-pointer transition-colors font-medium ${
                                selectedTab === type
                                  ? "bg-indigo-600 text-white shadow-md"
                                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                              }`}
                            >
                              {capitalizeFirstLetter(type)}
                            </button>
                          ),
                        );
                      })()}
                    </div>
                  </div>
                )}
                {selectedPurchaseProduct?.products ? (
                  <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                    <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                      <thead className="bg-gray-100 text-gray-700 border-b">
                        <tr>
                          {[
                            "Product Name",
                            "Product Type",
                            "Box Qty",
                            "LC (USD)",
                            "Amount ($)",
                            "FOB (USD)",
                            "CIF (USD)",
                            "Supplier",
                          ].map((h) => (
                            <th
                              key={h}
                              className={`p-3 whitespace-nowrap min-w-[120px] font-medium ${
                                isMobileView ? "text-[10px]" : "text-sm"
                              }`}
                            >
                              {h}
                            </th>
                          ))}
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
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] capitalize ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {product.productName || "--"}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                <span
                                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    product.productType === "physical" ||
                                    product.type === "physical"
                                      ? "bg-blue-100 text-blue-800"
                                      : product.productType === "digital" ||
                                          product.type === "digital"
                                        ? "bg-purple-100 text-purple-800"
                                        : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {capitalizeFirstLetter(
                                    product.productType ||
                                      product.type ||
                                      "unknown",
                                  )}
                                </span>
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {product.quantityPerBoxStrip || 0}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {formatNumber(product.lc || product.lcNumber)}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] font-semibold ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {formatNumber(product.amount)}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {formatNumber(product.fob)}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
                                {formatNumber(product.cif)}
                              </td>
                              <td
                                className={`p-3 whitespace-nowrap min-w-[120px] capitalize ${
                                  isMobileView ? "text-[7px]" : "text-sm"
                                }`}
                              >
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
                                0,
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
                              selectedPurchaseProduct.invoiceDate,
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
            document.body,
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
                          (product) => product.id === selectedValue,
                        );
                        if (selectedProduct) {
                          setCurrentProduct((prev) => {
                            const firstBatch =
                              selectedProduct.batches?.length > 0
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
                              return {
                                ...prev,
                                amount:
                                  Math.round(lcValue * quantityValue * 100) /
                                  100,
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
                          handleProductEditChange({
                            target: { name: e.target.name, value },
                          });
                          setTimeout(() => {
                            setCurrentProduct((prev) => {
                              if (!prev) return prev;
                              const lcValue = parseFloat(value) || 0;
                              const quantityValue =
                                parseFloat(prev.quantityPerBoxStrip) || 0;
                              return {
                                ...prev,
                                amount:
                                  Math.round(lcValue * quantityValue * 100) /
                                  100,
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
                        if (value === "" || /^-?\d*\.?\d*$/.test(value))
                          handleProductEditChange({
                            target: { name: e.target.name, value },
                          });
                      }}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                      placeholder="0.00"
                    />
                  </div>
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
                        if (value === "" || /^-?\d*\.?\d*$/.test(value))
                          handleProductEditChange({
                            target: { name: e.target.name, value },
                          });
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
                  {currentProduct?.batches?.length > 0 && (
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
                                currentProduct.batches[0].date,
                              )}
                            </p>
                          </div>
                          <div>
                            <span className="font-medium">Expiry:</span>
                            <p>
                              {formatDateToReadable(
                                currentProduct.batches[0].expiryDate,
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
            document.body,
          )}
      </div>
    </div>
  );
}

export default Purchase;
