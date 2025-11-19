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
  Package,
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
import LoadingOverlay from "../../components/Loading";
import InputField from "../../components/common/InputField";

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

  // Fixed fetchPurchaseDetails function
  const fetchPurchaseDetails = async () => {
    try {
      setLoading(true);
      const purchaseRes = await fetch(`${backendUrl}/api/purchase`);

      if (!purchaseRes.ok) throw new Error("Failed to fetch purchase details");
      const purchaseData = await purchaseRes.json();

      // Handle different response structures safely
      const purchaseArray =
        purchaseData.purchases || purchaseData.data || purchaseData || [];

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
      // Set empty arrays to prevent further errors
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

  // Filter purchases based on tab + search - FIXED VERSION
  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      // Check if purchase matches the selected tab
      const matchesType =
        selectedTab.toLowerCase() === "all" ||
        (purchase.products &&
          Array.isArray(purchase.products) &&
          purchase.products.some((product) => {
            const productType = product.productType || product.type;
            return productType?.toLowerCase() === selectedTab.toLowerCase();
          }));

      if (!matchesType) return false;

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
        // Also search in product names
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
      productId: purchase?.productId || purchase.productName || "",
      productName: purchase?.productName || purchase.productName || "",
      supplierName: purchase.supplierName || "",
      quantityPerBoxStrip: purchase.quantityPerBoxStrip || 0,
      fob: purchase.fob || 0,
      cif: purchase.cif || 0,
      lcNumber: purchase.lcNumber || "",
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
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/purchase`, {
          data: { ids: selected },
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
        showToast("error", "Failed to delete selected purchases.");
      }
    } else {
      setSelected([]);
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

      // Auto-calculate amount
      if (name === "lcNumber" || name === "quantityPerBoxStrip") {
        const lcValue = parseFloat(updatedForm.lcNumber) || 0;
        const quantityValue = parseFloat(updatedForm.quantityPerBoxStrip) || 0;
        updatedForm.amount = Math.round(lcValue * quantityValue * 100) / 100;
      }

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

  const handleProductChange = (selectedProductId) => {
    const selectedProduct = productOptions.find(
      (product) => product._id === selectedProductId
    );
    if (selectedProduct) {
      setForm((prev) => ({
        ...prev,
        productId: selectedProduct.value,
        productName: selectedProduct.label,
      }));
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
        productName: form.productName,
        supplierName: form.supplierName,
        quantityPerBoxStrip: Number(form.quantityPerBoxStrip) || 0,
        fob: Number(form.fob) || 0,
        cif: Number(form.cif) || 0,
        lcNumber: form.lcNumber,
        remarks: form.remarks,
        amount: Number(form.amount) || 0,
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
    setCurrentProduct({ ...product });
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
    if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
      setCurrentProduct((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const updateProductInForm = () => {
    setForm((prev) => {
      const updatedProducts = [...prev.products];
      updatedProducts[currentProductIndex] = currentProduct;

      return {
        ...prev,
        products: updatedProducts,
      };
    });
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

  // Add this useMemo hook for filtered products in modal
  const filteredProductsInModal = useMemo(() => {
    if (!selectedPurchaseProduct || !selectedPurchaseProduct.products) {
      return [];
    }

    const invoiceProducts = selectedPurchaseProduct.products || [];

    // Apply type filter
    let filtered = invoiceProducts;
    if (selectedTab !== "All") {
      filtered = invoiceProducts.filter((p) => p.productType === selectedTab);
    }

    // Apply search filter
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
              <UserPlus size={18} /> Add New Purchase
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
              {/* Total Count */}
              <p className="text-lg font-semibold text-gray-700 whitespace-nowrap">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredPurchases.length}
                </span>
                {filteredPurchases.length > PURCHASES_PER_PAGE && (
                  <span className="ml-2 text-sm text-gray-600">
                    (Showing{" "}
                    {Math.min(PURCHASES_PER_PAGE, currentPurchases.length)} of{" "}
                    {filteredPurchases.length} on page {currentPage})
                  </span>
                )}
              </p>

              {purchases.length > 0 && <PurchaseInventoryExcelDownload />}

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
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200 mt-5">
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
                      index < currentPurchases.length - 1 ? "border-b" : ""
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
              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * PURCHASES_PER_PAGE + 1} to{" "}
                {Math.min(
                  currentPage * PURCHASES_PER_PAGE,
                  filteredPurchases.length
                )}{ " "}
                of {filteredPurchases.length} entries
              </div>

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
                      key={page}
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
                                {form.totalAmount}
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
                                  key={index}
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
                                      ].map(([label, key]) => (
                                        <div key={key}>
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

                <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh]">
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
                      onChange={(date) => handleDateChange(date, "receivedDate")}
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
                      onChange={(value) => updateFormField("supplierName", value)}
                      placeholder="Select Supplier"
                      className="w-full"
                    />
                  </div>

                  {/* Products List */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium mb-2">
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
                              <span className="font-medium text-gray-700">
                                {product.productName || `Product ${index + 1}`}
                              </span>
                              <div className="text-sm text-gray-500 mt-1">
                                Qty: {product.quantityPerBoxStrip || 0} | 
                                FOB: ${(product.fob || 0).toFixed(2)} | 
                                CIF: ${(product.cif || 0).toFixed(2)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => openProductEditModal(product, index)}
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

                  {/* Financial Summary */}
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-300">
                    <div>
                      <label className="block text-sm font-medium">
                        Total Amount
                      </label>
                      <InputField
                        type="text"
                        value={productTotals.totalAmount.toFixed(2)}
                        className="w-full border px-3 py-2 rounded-lg bg-gray-200 text-gray-700 border-gray-300"
                        disabled
                      />
                    </div>
                  </div>

                  {/* Product Information */}
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Product Name - Using SearchableDropdown */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Product Name
                      </label>
                      <SearchableDropdown
                        options={productOptions}
                        value={form.productId}
                        onChange={handleProductChange}
                        placeholder="Select Product"
                        className="w-full"
                      />
                    </div>

                    {/* Quantity Per Box/Strip */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Quantity Per Box/Strip
                      </label>
                      <InputField
                        type="text"
                        name="quantityPerBoxStrip"
                        value={form.quantityPerBoxStrip}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    {/* LC Number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        LC Number
                      </label>
                      <InputField
                        type="text"
                        name="lcNumber"
                        value={form.lcNumber}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    {/* FOB */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        FOB (USD)
                      </label>
                      <InputField
                        type="text"
                        name="fob"
                        value={form.fob}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    {/* CIF */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        CIF (USD)
                      </label>
                      <InputField
                        type="text"
                        name="cif"
                        value={form.cif}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>

                    {/* Total Amount */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Total Amount ($)
                      </label>
                      <InputField
                        type="text"
                        name="amount"
                        value={form.amount}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border px-3 py-2 rounded-lg border-gray-300"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* Expiry Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Expiry Date
                    </label>
                    <DatePicker
                      selected={
                        form.expiryDate ? new Date(form.expiryDate) : null
                      }
                      onChange={(date) => handleDateChange(date, "expiryDate")}
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
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
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg capitalize"
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

        {/* Product Edit Modal */}
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
                  Edit Product - {currentProduct?.productName || "Product"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Product Name
                    </label>
                    <InputField
                      type="text"
                      name="productName"
                      value={currentProduct?.productName || ""}
                      onChange={handleProductEditChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Product Type
                    </label>
                    <select
                      name="productType"
                      value={currentProduct?.productType || ""}
                      onChange={handleProductEditChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    >
                      <option value="physical">Physical</option>
                      <option value="digital">Digital</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Quantity Per Box/Strip
                    </label>
                    <InputField
                      type="text"
                      name="quantityPerBoxStrip"
                      value={currentProduct?.quantityPerBoxStrip || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      LC Number
                    </label>
                    <InputField
                      type="text"
                      name="lcNumber"
                      value={currentProduct?.lcNumber || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
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
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
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
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Amount ($)
                    </label>
                    <InputField
                      type="text"
                      name="amount"
                      value={currentProduct?.amount || ""}
                      onChange={handleProductNumericChange}
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                      autoComplete="off"
                    />
                  </div>

                  <div>
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
                          expiryDate: date ? date.toISOString().split("T")[0] : "",
                        }))
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select a date"
                      className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    />
                  </div>
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
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    onClick={updateProductInForm}
                  >
                    Update Product
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ... (rest of the modals remain the same) */}
      </div>
    </div>
  );
}

export default Purchase;