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
  const [isOpen, setIsOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedPurchaseProduct, setSelectedPurchaseProduct] = useState(null);
  const inputRef = useRef(null);

  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

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
    setIsOpen(true);
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
      productId: purchase?._id || purchase.productName || "",
      productName: purchase?.productName || purchase.productName || "",
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

  const getDisplayValue = (fieldName, value) => {
    const numericFields = ["quantityPerBoxStrip", "fob", "cif", "amount"];
    const integerFields = ["quantityPerBoxStrip"];

    if (!numericFields.includes(fieldName)) return value || "";
    if (value === null || value === undefined) return "";

    if (integerFields.includes(fieldName)) {
      if (typeof value === "number") {
        return value.toString();
      }
      return value || "";
    }

    if (typeof value === "number") {
      return value.toString();
    }

    return value;
  };

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

        {/* Table */}
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
                )}{" "}
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

        {/* PRODUCT MODAL */}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setIsOpen(false)}
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

                {/* Filter Capsules Section - Only show types present in this invoice */}
                {selectedPurchaseProduct &&
                  selectedPurchaseProduct.products &&
                  selectedPurchaseProduct.products.length > 0 && (
                    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-wrap gap-2">
                          {/* Get unique product types from this specific invoice */}
                          {(() => {
                            const invoiceProducts =
                              selectedPurchaseProduct.products || [];

                            // Safety check for empty array
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

                            return ["All", ...uniqueTypes].map((type) => (
                              <button
                                key={type}
                                onClick={() => handleClick(type)}
                                className={`px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                                  selectedTab === type
                                    ? "bg-indigo-600 text-white shadow-md"
                                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                                }`}
                              >
                                {capitalizeFirstLetter(type)}
                              </button>
                            ));
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
                              key={product._id || index}
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
                                {product.quantityPerBoxStrip ||
                                  product.productQtyPerBoxStrip ||
                                  0}
                              </td>
                              <td className="p-3 whitespace-nowrap min-w-[120px]">
                                {formatNumber(product.lcNumber || product.lc)}
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

                    {/* Summary Section - FIXED: Now uses filteredProductsInModal */}
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
      </div>
    </div>
  );
}

export default Purchase;
