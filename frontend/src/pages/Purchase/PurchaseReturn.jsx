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
  X,
  Eye,
  Search,
  Package,
  MessageSquare,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateToReadable } from "../../utils/dateUtil";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import axios from "axios";
import { getVisiblePages } from "../../utils/useVisiblePages";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const INITIAL_FORM_STATE = {
  _id: null,
  recordingDate: "",
  invoiceNumber: "",
  invoiceDate: "",
  deliveryNumber: "",
  receivedDate: "",
  supplierId: "",
  supplierName: "",
  lcNumber: "",
  amount: 0,
  returnReason: "",
  remarks: "",
  status: "pending",
  products: [
    {
      productId: "",
      productName: "",
      purchaseQty: 0,
      returnQuantity: 0,
      usedQty: 0,
      fob: 0,
      cif: 0,
      lc: 0,
      amount: 0,
      returnAmount: 0,
      expiredDate: "",
    },
  ],
};

const PurchaseReturn = () => {
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  // Single modal state to ensure only one modal is open at a time
  const [activeModal, setActiveModal] = useState(null); // null, 'view', 'edit', 'products', 'returnReason'

  const [selectedPurchaseReturn, setSelectedPurchaseReturn] = useState(null);
  const [selectedReturnReason, setSelectedReturnReason] = useState("");
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // States for dropdown data
  const [productOptions, setProductOptions] = useState([]);
  const [supplierOptions, setSupplierOptions] = useState([]);
  const [purchaseOptions, setPurchaseOptions] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  // New states for filtered options based on selected invoice
  const [filteredProductOptions, setFilteredProductOptions] = useState([]);
  const [filteredSupplierOptions, setFilteredSupplierOptions] = useState([]);
  const [originalPurchaseData, setOriginalPurchaseData] = useState(null);

  // State for expanded product details in view modal - now using object to track multiple products
  const [expandedProducts, setExpandedProducts] = useState({});

  // Product edit modal states (like in Purchase component)
  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);

  const returnsPerPage = 10;

  // Fixed table columns
  const tableColumns = useMemo(
    () => [
      "recordingDate",
      "invoiceDate",
      "deliveryNumber",
      "invoiceNumber",
      "supplierName",
      "totalReturnAmount",
      "productCount",
      "returnReason",
      "actions",
    ],
    []
  );

  // Define all available table columns
  const allFields = useMemo(
    () => [
      {
        id: "recordingDate",
        name: "Recording Date",
        dbName: "recordingDate",
      },
      {
        id: "invoiceDate",
        name: "Invoice Date",
        dbName: "invoiceDate",
      },
      {
        id: "deliveryNumber",
        name: "Delivery Number",
        dbName: "deliveryNumber",
      },
      {
        id: "invoiceNumber",
        name: "Invoice Number",
        dbName: "invoiceNumber",
      },
      {
        id: "supplierName",
        name: "Supplier Name",
        dbName: "supplierName",
      },
      {
        id: "totalReturnAmount",
        name: "Total Return Amount ($)",
        dbName: "totalReturnAmount",
      },
      {
        id: "productCount",
        name: "Products",
        dbName: "productCount",
      },
      {
        id: "returnReason",
        name: "Return Reason",
        dbName: "returnReason",
      },
      {
        id: "actions",
        name: "Actions",
        dbName: "actions",
      },
    ],
    []
  );

  // Toggle product details in view modal
  const toggleProductDetails = useCallback((index) => {
    setExpandedProducts((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  }, []);

  // Close all modals
  const closeAllModals = () => {
    setActiveModal(null);
    setForm(INITIAL_FORM_STATE);
    setExpandedProducts({});
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  // Enhanced modal open function to ensure only one modal is open
  const openModal = (modalType, purchaseReturn = null) => {
    closeAllModals(); // Close any existing modals first
    if (purchaseReturn) {
      setForm(purchaseReturn);
    }
    setActiveModal(modalType);
  };

  // Fetch original purchase data by invoice number
  const fetchOriginalPurchaseData = async (invoiceNumber) => {
    if (!invoiceNumber) return null;

    try {
      const response = await axios.get(`${backendUrl}/api/purchase`);
      const purchases = response.data.reports || [];
      const originalPurchase = purchases.find(
        (purchase) => purchase.invoiceNumber === invoiceNumber
      );

      return originalPurchase;
    } catch (error) {
      console.error("Error fetching original purchase data:", error);
      return null;
    }
  };

  // Filter products and suppliers based on original purchase data
  const filterOptionsByOriginalPurchase = useCallback(
    (originalPurchase) => {
      if (!originalPurchase) {
        setFilteredProductOptions(productOptions);
        setFilteredSupplierOptions(supplierOptions);
        return;
      }

      const originalSupplier = supplierOptions.find(
        (supplier) => supplier.label === originalPurchase.supplierName
      );

      if (originalSupplier) {
        setFilteredSupplierOptions([originalSupplier]);
      } else {
        setFilteredSupplierOptions([]);
      }

      const originalProductNames = [];

      if (
        originalPurchase.products &&
        Array.isArray(originalPurchase.products)
      ) {
        originalPurchase.products.forEach((product) => {
          if (product.productName) {
            originalProductNames.push(product.productName);
          }
        });
      } else if (originalPurchase.productName) {
        originalProductNames.push(originalPurchase.productName);
      }

      const filteredProducts = productOptions.filter((product) =>
        originalProductNames.includes(product.label)
      );

      setFilteredProductOptions(filteredProducts);
    },
    [productOptions, supplierOptions]
  );

  // Fetch products, suppliers, and purchases for dropdowns
  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const response = await axios.get(`${backendUrl}/api/products`);
      const transformedProducts = response.data.map((product) => ({
        value: product._id,
        label: product.productName,
      }));
      setProductOptions(transformedProducts);
      setFilteredProductOptions(transformedProducts);
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
      setProductOptions([]);
      setFilteredProductOptions([]);
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers`);
      const transformedSuppliers = response.data.map((supplier) => ({
        value: supplier._id,
        label: supplier.supplierName || supplier.name,
      }));
      setSupplierOptions(transformedSuppliers);
      setFilteredSupplierOptions(transformedSuppliers);
    } catch (err) {
      console.error("Error fetching suppliers:", err);
      showToast("error", "Failed to fetch suppliers");
      setSupplierOptions([]);
      setFilteredSupplierOptions([]);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const fetchPurchases = async () => {
    setLoadingPurchases(true);
    try {
      const response = await axios.get(`${backendUrl}/api/purchase`);
      const transformedPurchases =
        response.data.reports?.map((purchase) => ({
          value: purchase._id,
          label: `${purchase.invoiceNumber} - ${purchase.productName}`,
        })) || [];
      setPurchaseOptions(transformedPurchases);
    } catch (err) {
      console.error("Error fetching purchases:", err);
      showToast("error", "Failed to fetch purchases");
      setPurchaseOptions([]);
    } finally {
      setLoadingPurchases(false);
    }
  };

  // Load dropdown data when component mounts
  useEffect(() => {
    fetchProducts();
    fetchSuppliers();
    fetchPurchases();
  }, []);

  // Load dropdown data and filter options when edit modal opens
  useEffect(() => {
    if (activeModal === "edit" && form.invoiceNumber) {
      fetchProducts();
      fetchSuppliers();
      fetchPurchases();

      fetchOriginalPurchaseData(form.invoiceNumber).then((originalPurchase) => {
        setOriginalPurchaseData(originalPurchase);
        filterOptionsByOriginalPurchase(originalPurchase);
      });
    } else if (activeModal === "edit") {
      setFilteredProductOptions(productOptions);
      setFilteredSupplierOptions(supplierOptions);
    }
  }, [
    activeModal,
    form.invoiceNumber,
    filterOptionsByOriginalPurchase,
    productOptions,
    supplierOptions,
  ]);

  // Handle supplier selection from dropdown
  const handleSupplierChange = useCallback(
    (supplierId) => {
      const selectedSupplier = filteredSupplierOptions.find(
        (supplier) => supplier.value === supplierId
      );
      if (selectedSupplier) {
        setForm((prev) => ({
          ...prev,
          supplierId: selectedSupplier.value,
          supplierName: selectedSupplier.label,
        }));
      }
    },
    [filteredSupplierOptions]
  );

  // Handle product selection for a specific product in the array
  const handleProductChange = useCallback(
    (productIndex, productId) => {
      const selectedProduct = filteredProductOptions.find(
        (product) => product.value === productId
      );
      if (selectedProduct) {
        setForm((prev) => {
          const updatedProducts = [...prev.products];
          updatedProducts[productIndex] = {
            ...updatedProducts[productIndex],
            productId: selectedProduct.value,
            productName: selectedProduct.label,
          };
          return {
            ...prev,
            products: updatedProducts,
          };
        });
      }
    },
    [filteredProductOptions]
  );

  // Remove product from the form
  const removeProduct = useCallback((index) => {
    setForm((prev) => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  }, []);

  // Fetch purchase returns
  const fetchPurchaseReturn = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/purchase-return`);
      if (!res.ok) throw new Error("Failed to fetch purchase returns");
      const data = await res.json();
      setPurchaseReturns(data.data || []);
    } catch (error) {
      console.error("❌ Fetch error:", error);
      showToast("error", error.message || "Error fetching purchase returns");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchPurchaseReturn();
  }, []);

  // Enhanced handle change for form fields
  const enhancedHandleChange = (e) => {
    const { name, value } = e.target;
    setForm((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));
  };

  // Handle numeric input changes
  const handleNumericInputChange = (e, updateFunc) => {
    const { name, value } = e.target;
    const numericFields = [
      "amount",
      "purchaseQty",
      "returnQuantity",
      "fob",
      "cif",
      "lc",
    ];

    if (numericFields.includes(name)) {
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        const validatedEvent = {
          target: {
            name: name,
            value: value,
          },
        };
        updateFunc(validatedEvent);
      }
    } else {
      updateFunc(e);
    }
  };

  // Handle product field changes
  const handleProductFieldChange = (productIndex, fieldName, value) => {
    setForm((prevForm) => {
      const updatedProducts = [...prevForm.products];
      const currentProduct = { ...updatedProducts[productIndex] };

      // Update the field
      currentProduct[fieldName] = value;

      // Calculate dependent fields
      if (fieldName === "purchaseQty" || fieldName === "returnQuantity") {
        const purchaseQty = parseFloat(currentProduct.purchaseQty) || 0;
        const returnQuantity = parseFloat(currentProduct.returnQuantity) || 0;
        currentProduct.usedQty = Math.max(
          0,
          purchaseQty - returnQuantity
        ).toFixed(2);
      }

      if (fieldName === "returnQuantity" || fieldName === "fob") {
        const returnQuantity = parseFloat(currentProduct.returnQuantity) || 0;
        const fob = parseFloat(currentProduct.fob) || 0;
        currentProduct.returnAmount = (returnQuantity * fob).toFixed(2);
      }

      updatedProducts[productIndex] = currentProduct;

      return {
        ...prevForm,
        products: updatedProducts,
      };
    });
  };

  const handleDateChange = (date, fieldName) => {
    setForm((prevForm) => ({
      ...prevForm,
      [fieldName]: date ? date.toISOString() : "",
    }));
  };

  const handleProductDateChange = (productIndex, date, fieldName) => {
    setForm((prevForm) => {
      const updatedProducts = [...prevForm.products];
      updatedProducts[productIndex] = {
        ...updatedProducts[productIndex],
        [fieldName]: date ? date.toISOString() : "",
      };
      return {
        ...prevForm,
        products: updatedProducts,
      };
    });
  };

  const handleUpdatePurchaseReturn = async (e, formData) => {
    e.preventDefault();
    try {
      const response = await fetch(
        `${backendUrl}/api/purchase-return/${formData._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) throw new Error("Failed to update purchase return");

      const result = await response.json();
      showToast("success", "Purchase return updated successfully");
      closeAllModals();
      fetchPurchaseReturn();
    } catch (error) {
      console.error("Update error:", error);
      showToast("error", error.message || "Error updating purchase return");
    }
  };

  // Enhanced add new purchase return handler
  const handleAddNewPurchaseReturn = () => {
    navigate("/purchaselayout/purchasereturn/new");
  };

  // Filtering logic
  const filteredReturns = purchaseReturns.filter((r) => {
    if (searchTerm.trim() === "") return true;
    const lower = searchTerm.toLowerCase();
    return (
      r.invoiceNumber?.toLowerCase().includes(lower) ||
      r.deliveryNumber?.toLowerCase().includes(lower) ||
      r.returnReason?.toLowerCase().includes(lower) ||
      r.supplierName?.toLowerCase().includes(lower) ||
      r.products?.some((product) =>
        product.productName?.toLowerCase().includes(lower)
      )
    );
  });

  // Calculate total return amount for an invoice
  const calculateTotalReturnAmount = (purchaseReturn) => {
    if (!purchaseReturn.products || !Array.isArray(purchaseReturn.products))
      return "0.00";
    return purchaseReturn.products
      .reduce(
        (total, product) => total + (parseFloat(product.returnAmount) || 0),
        0
      )
      .toFixed(2);
  };

  // Pagination
  const indexOfLast = currentPage * returnsPerPage;
  const indexOfFirst = indexOfLast - returnsPerPage;
  const currentReturns = filteredReturns.slice(indexOfFirst, indexOfLast);
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);

  const toggleSelect = (ret) => {
    setSelected((prev) => {
      return prev.some((s) => s === ret._id)
        ? prev.filter((s) => s !== ret._id)
        : [...prev, ret._id];
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelected(currentReturns.map((r) => r._id));
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> purchase returns?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/purchase-return`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast(
            "success",
            "Selected purchase returns deleted successfully"
          );
          fetchPurchaseReturn();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected purchase returns.");
      }
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSingle = async (id, invoiceNumber) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete purchase return <b>${invoiceNumber}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/purchase-return/${id}`
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Purchase return <b>${invoiceNumber}</b> deleted successfully`
          );
          fetchPurchaseReturn();
        }
      } catch (error) {
        showToast("error", "Failed to delete purchase return.");
      }
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelected([]);
    setCurrentPage(1);
  };

  const editPurchaseReturn = async (purchaseReturn) => {
    openModal("edit", purchaseReturn);

    if (purchaseReturn.invoiceNumber) {
      const originalPurchase = await fetchOriginalPurchaseData(
        purchaseReturn.invoiceNumber
      );
      setOriginalPurchaseData(originalPurchase);
      filterOptionsByOriginalPurchase(originalPurchase);
    }
  };

  const viewPurchaseReturn = (purchaseReturn) => {
    openModal("view", purchaseReturn);
    setExpandedProducts({}); // Reset expanded products when opening view modal
  };

  // Handle product count click
  const handleProductCountClick = (purchaseReturn) => {
    setSelectedPurchaseReturn(purchaseReturn);
    openModal("products");
  };

  // Handle return reason click
  const handleReturnReasonClick = (purchaseReturn) => {
    setSelectedReturnReason(
      purchaseReturn.returnReason || "No reason provided"
    );
    openModal("returnReason");
  };

  // Product edit modal functions (like in Purchase component)
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
      const processedValue = value === "" ? "" : parseFloat(value) || 0;
      setCurrentProduct((prev) => {
        const updatedProduct = {
          ...prev,
          [name]: processedValue,
        };

        // Auto-calculate return amount when returnQuantity or fob changes
        if (name === "returnQuantity" || name === "fob") {
          const returnQuantity = parseFloat(updatedProduct.returnQuantity) || 0;
          const fob = parseFloat(updatedProduct.fob) || 0;
          updatedProduct.returnAmount = (returnQuantity * fob).toFixed(2);
        }

        // Auto-calculate used quantity when purchaseQty or returnQuantity changes
        if (name === "purchaseQty" || name === "returnQuantity") {
          const purchaseQty = parseFloat(updatedProduct.purchaseQty) || 0;
          const returnQuantity = parseFloat(updatedProduct.returnQuantity) || 0;
          updatedProduct.usedQty = Math.max(
            0,
            purchaseQty - returnQuantity
          ).toFixed(2);
        }

        return updatedProduct;
      });
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

  // Get field value from purchase return object
  const getFieldValue = (purchaseReturn, dbName) => {
    if (!purchaseReturn || typeof purchaseReturn !== "object") return "--";

    // Date fields
    if (["recordingDate", "invoiceDate", "receivedDate"].includes(dbName)) {
      return formatDateToReadable(purchaseReturn[dbName]) || "--";
    }

    // Total return amount
    if (dbName === "totalReturnAmount") {
      return `$${calculateTotalReturnAmount(purchaseReturn)}`;
    }

    // Product count
    if (dbName === "productCount") {
      const productCount = purchaseReturn.products?.length || 0;
      return (
        <button
          onClick={() => handleProductCountClick(purchaseReturn)}
          className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full hover:bg-blue-200 transition-colors cursor-pointer mx-auto"
          title="View Products"
        >
          <Package size={14} />
          <span className="font-medium">{productCount} Products</span>
        </button>
      );
    }

    // Return Reason with click to view
    if (dbName === "returnReason") {
      const returnReason = purchaseReturn.returnReason || "--";
      const displayReason =
        returnReason.length > 50
          ? `${returnReason.substring(0, 50)}...`
          : returnReason;

      return (
        <button
          onClick={() => handleReturnReasonClick(purchaseReturn)}
          className="flex items-center justify-center gap-2 bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors cursor-pointer mx-auto"
          title="View Return Reason"
        >
          <MessageSquare size={14} />
          <span className="font-medium">View Reason</span>
        </button>
      );
    }

    // Default fallback
    const value = purchaseReturn[dbName];
    if (value === null || value === undefined || value === "") return "--";

    return value;
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

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  // Calculate product totals
  const calculateProductTotals = (products) => {
    if (!products || !Array.isArray(products))
      return {
        totalReturnAmount: 0,
        totalReturnQuantity: 0,
      };

    const totals = products.reduce(
      (acc, product) => {
        acc.totalReturnAmount += parseFloat(product.returnAmount || 0);
        acc.totalReturnQuantity += parseFloat(product.returnQuantity || 0);
        return acc;
      },
      { totalReturnAmount: 0, totalReturnQuantity: 0 }
    );

    return totals;
  };

  const productTotals = calculateProductTotals(form.products);

  if (loadingData) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-lg">Loading purchase returns...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
          <div className="flex gap-3 items-center">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow cursor-pointer transition-colors"
              onClick={handleAddNewPurchaseReturn}
            >
              <UserPlus size={18} /> Add New Purchase Return
            </button>

            {selected.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow cursor-pointer transition-colors"
              >
                <Trash2 size={18} /> Delete Selected
              </button>
            )}
          </div>

          {purchaseReturns.length > 0 && (
            <div className="flex items-center gap-6">
              <div className="text-lg font-semibold text-gray-700">
                Total:{" "}
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {filteredReturns.length}
                </span>
              </div>
              <div className="relative w-full md:w-80">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={18}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search invoice, delivery, product..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                />
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {allFields
                    .filter((item) => tableColumns.includes(item.id))
                    .map((item) => (
                      <th
                        key={item.id}
                        className="p-4 text-sm font-semibold text-gray-700 whitespace-nowrap"
                      >
                        {item.id === "recordingDate" ? (
                          <div className="flex items-center gap-3">
                            {currentReturns.length > 0 && (
                              <input
                                type="checkbox"
                                aria-label="Select all return purchases"
                                checked={
                                  selected.length === currentReturns.length &&
                                  currentReturns.length > 0
                                }
                                onChange={(e) =>
                                  toggleSelectAll(e.target.checked)
                                }
                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
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
              <tbody className="divide-y divide-gray-200">
                {currentReturns.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableColumns.length}
                      className="p-8 text-center text-gray-500"
                    >
                      No purchase returns found.
                    </td>
                  </tr>
                ) : (
                  currentReturns.map((ret, index) => (
                    <tr
                      key={ret._id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      {allFields
                        .filter((item) => tableColumns.includes(item.id))
                        .map((item) => (
                          <td
                            key={item.id}
                            className="p-4 text-sm text-gray-900 whitespace-nowrap"
                          >
                            {item.id === "recordingDate" ? (
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={selected.includes(ret._id)}
                                  onChange={() => toggleSelect(ret)}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                />
                                <span className="capitalize">
                                  {getFieldValue(ret, item.dbName)}
                                </span>
                              </div>
                            ) : item.id === "actions" ? (
                              <div className="flex items-center gap-2">
                                <button
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded transition-colors cursor-pointer"
                                  onClick={() => viewPurchaseReturn(ret)}
                                  title="View"
                                >
                                  <Eye size={16} />
                                </button>
                                <button
                                  className="p-1.5 text-green-600 hover:text-green-800 hover:bg-green-100 rounded transition-colors cursor-pointer"
                                  onClick={() => editPurchaseReturn(ret)}
                                  title="Edit"
                                >
                                  <Edit size={16} />
                                </button>
                                <button
                                  className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-100 rounded transition-colors cursor-pointer"
                                  onClick={() =>
                                    handleDeleteSingle(
                                      ret._id,
                                      ret.invoiceNumber
                                    )
                                  }
                                  title="Delete"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              getFieldValue(ret, item.dbName)
                            )}
                          </td>
                        ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {currentReturns.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                >
                  Previous
                </button>
                {visiblePages.map((page, idx) =>
                  page === "..." ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-3 py-1.5 text-gray-500 select-none"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1.5 border rounded-md text-sm transition cursor-pointer ${
                        currentPage === page
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white border-gray-300 hover:bg-gray-50"
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
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* View Modal - FIXED with proper product expansion */}
        {activeModal === "view" &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={closeAllModals}
              />

              <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={closeAllModals}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-6">
                  Purchase Return Details
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Recording Date
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatDateToReadable(form.recordingDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Invoice Number
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {form.invoiceNumber || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Invoice Date
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatDateToReadable(form.invoiceDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Delivery Number
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {form.deliveryNumber || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Received Date
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatDateToReadable(form.receivedDate) || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Supplier Name
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 capitalize">
                      {form.supplierName || "--"}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Total Return Quantity
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50">
                      {formatNumber(form.totalReturnQuantity)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Total Return Amount
                    </label>
                    <p className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 font-semibold text-lg">
                      ${calculateTotalReturnAmount(form)}
                    </p>
                  </div>

                  <div className="md:col-span-3"></div>
                </div>

                {/* Products Summary - FIXED with proper expansion */}
                <div className="mb-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Products ({form.products?.length || 0})
                  </h3>
                  <div className="space-y-3">
                    {form.products && form.products.length > 0 ? (
                      form.products.map((product, index) => (
                        <div
                          key={index}
                          className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                        >
                          <div className="flex justify-between items-start">
                            <h4 className="font-medium text-gray-900 text-lg capitalize">
                              {product.productName || `Product ${index + 1}`}
                            </h4>
                            <button
                              onClick={() => toggleProductDetails(index)}
                              className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm cursor-pointer transition-colors"
                            >
                              {expandedProducts[index]
                                ? "Hide Details"
                                : "View Details"}
                            </button>
                          </div>

                          {expandedProducts[index] && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                              {[
                                ["Purchase Qty", "purchaseQty"],
                                ["Return Qty", "returnQuantity"],
                                ["Used Qty", "usedQty"],
                                ["FOB ($)", "fob"],
                                ["CIF ($)", "cif"],
                                ["LC ($)", "lc"],
                                ["Amount ($)", "amount"],
                                ["Return Amount ($)", "returnAmount"],
                                ["Expiry Date", "expiredDate"],
                              ].map(([label, key], fieldIndex) => (
                                <div key={`${index}-${key}-${fieldIndex}`}>
                                  <label className="block text-sm font-medium text-gray-600">
                                    {label}
                                  </label>
                                  <p
                                    className={`border px-3 py-2 rounded-lg bg-white ${
                                      key === "returnAmount"
                                        ? "text-green-600"
                                        : ""
                                    }`}
                                  >
                                    {[
                                      "fob",
                                      "cif",
                                      "lc",
                                      "amount",
                                      "returnAmount",
                                    ].includes(key)
                                      ? formatNumber(product[key])
                                      : key === "expiredDate"
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
                      ))
                    ) : (
                      <div className="text-center text-gray-500 py-4">
                        No products found
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Return Reason
                  </label>
                  <div className="border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 min-h-[60px]">
                    {form.returnReason || "—"}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={closeAllModals}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Edit Modal */}
        {activeModal === "edit" &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={closeAllModals}
              />
              <div className="bg-white w-full max-w-6xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={closeAllModals}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Edit Purchase Return
                </h2>

                <form
                  onSubmit={(e) => handleUpdatePurchaseReturn(e, form)}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh]"
                >
                  {/* Recording Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Recording Date
                    </label>
                    <DatePicker
                      selected={
                        form.recordingDate ? new Date(form.recordingDate) : null
                      }
                      onChange={(date) =>
                        handleDateChange(date, "recordingDate")
                      }
                      dateFormat="yyyy-MM-dd"
                      placeholderText="Select date"
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    />
                  </div>

                  {/* Invoice Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Invoice Number
                    </label>
                    <InputField
                      type="text"
                      value={form.invoiceNumber || ""}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Invoice Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Invoice Date
                    </label>
                    <InputField
                      type="text"
                      value={formatDateToReadable(form.invoiceDate) || "--"}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Delivery Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Delivery Number
                    </label>
                    <InputField
                      type="text"
                      value={form.deliveryNumber || ""}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Received Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Received Date
                    </label>
                    <InputField
                      type="text"
                      value={formatDateToReadable(form.receivedDate) || "--"}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Supplier Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Supplier Name
                    </label>
                    <InputField
                      type="text"
                      value={form.supplierName || ""}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed capitalize"
                      readOnly
                      disabled
                    />
                  </div>

                  {/* Products Section */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Products ({form.products?.length || 0})
                    </label>
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      {form.products && form.products.length > 0 ? (
                        form.products.map((product, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-white rounded border border-gray-300"
                          >
                            <div className="flex-1">
                              <span className="font-medium text-gray-700 capitalize">
                                {product.productName || `Product ${index + 1}`}
                              </span>
                              <div className="text-sm text-gray-500 mt-1">
                                Purchase: {product.purchaseQty || 0} | Return:{" "}
                                {product.returnQuantity || 0} | FOB: $
                                {(product.fob || 0).toFixed(2)}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  openProductEditModal(product, index)
                                }
                                className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm cursor-pointer"
                              >
                                Edit Details
                              </button>
                              {form.products.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeProduct(index)}
                                  className="ml-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm cursor-pointer"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
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
                  <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-300">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Total Return Quantity
                      </label>
                      <InputField
                        type="text"
                        name="totalReturnQuantity"
                        value={form.totalReturnQuantity || ""}
                        onChange={(e) =>
                          handleNumericInputChange(e, enhancedHandleChange)
                        }
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                        autoComplete="off"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Total Return Amount
                      </label>
                      <InputField
                        type="text"
                        value={`$${calculateTotalReturnAmount(form)}`}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-50 cursor-not-allowed font-semibold text-lg"
                        readOnly
                        disabled
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Calculated Return Amount
                      </label>
                      <InputField
                        type="text"
                        value={`$${productTotals.totalReturnAmount.toFixed(2)}`}
                        className="w-full border border-gray-300 px-3 py-2 rounded-lg bg-gray-200 text-gray-700"
                        disabled
                      />
                    </div>
                  </div>

                  {/* Return Reason Section */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Return Reason
                    </label>
                    <textarea
                      name="returnReason"
                      value={form.returnReason || ""}
                      onChange={enhancedHandleChange}
                      className="w-full border border-gray-300 px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      rows={3}
                      placeholder="Add return reason here..."
                    />
                  </div>

                  {/* Footer buttons */}
                  <div className="md:col-span-3 mt-4 flex justify-end gap-3 border-t border-gray-300 pt-4">
                    <button
                      type="button"
                      onClick={closeAllModals}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Update Purchase Return
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )}

        {/* Product Edit Modal */}
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
                  Edit Product - {currentProduct?.productName || "Product"}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Product Name - Using SearchableDropdown with ONLY invoice products */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Product Name
                    </label>
                    <SearchableDropdown
                      options={
                        form.products?.map((product, index) => ({
                          value: product.productName || `Product ${index + 1}`,
                          label: product.productName || `Product ${index + 1}`,
                          ...product,
                        })) || []
                      }
                      value={currentProduct?.productName || ""}
                      onChange={(selectedValue) => {
                        // Find the selected product from the current invoice's products
                        const selectedProduct = form.products?.find(
                          (product) => product.productName === selectedValue
                        );
                        if (selectedProduct) {
                          setCurrentProduct((prev) => ({
                            ...prev,
                            productName: selectedProduct.productName,
                            productId: selectedProduct.productId,
                            productType: selectedProduct.productType,
                            // Keep existing values if they exist, otherwise use selected product values
                            quantityPerBoxStrip:
                              prev?.quantityPerBoxStrip ||
                              selectedProduct.quantityPerBoxStrip,
                            lc: prev?.lc || selectedProduct.lc,
                            fob: prev?.fob || selectedProduct.fob,
                            cif: prev?.cif || selectedProduct.cif,
                            amount: prev?.amount || selectedProduct.amount,
                            expiryDate:
                              prev?.expiryDate || selectedProduct.expiryDate,
                          }));
                        } else {
                          // If product not found (shouldn't happen with our filtered list), keep current values
                          setCurrentProduct((prev) => ({
                            ...prev,
                            productName: selectedValue,
                          }));
                        }
                      }}
                      placeholder="Select Product from this invoice"
                      className="w-full"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Only products from this invoice are shown
                    </p>
                  </div>

                  {/* <div>
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
                  </div> */}

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      LC (USD)
                    </label>
                    <InputField
                      type="text"
                      name="lc"
                      value={currentProduct?.lc || ""}
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
                      className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-700 border-gray-300"
                      disabled
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Expiry Date
                    </label>
                    <DatePicker
                      selected={
                        currentProduct?.expiredDate
                          ? formatDateToReadable(currentProduct?.expiredDate)
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

        {/* Return Reason Modal */}
        {activeModal === "returnReason" &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={closeAllModals}
              />
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={closeAllModals}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Return Reason
                </h2>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Return Reason Details
                  </label>
                  <textarea
                    readOnly
                    value={selectedReturnReason}
                    className="w-full border border-gray-300 px-3 py-2 rounded-lg resize-vertical min-h-[120px] bg-gray-50"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={closeAllModals}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}

        {activeModal === "products" &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={closeAllModals}
              />
              <div className="bg-white w-full max-w-7xl p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button
                  onClick={closeAllModals}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>

                <h2 className="text-xl font-semibold text-gray-800 mb-4">
                  Product Details -{" "}
                  {selectedPurchaseReturn?.invoiceNumber || "Purchase Return"}
                </h2>

                {selectedPurchaseReturn && (
                  <>
                    <div className="overflow-x-auto shadow rounded-xl border border-gray-200 mb-6">
                      <table className="w-full border-collapse bg-white rounded-xl overflow-hidden text-center">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Product Name
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Purchase Qty
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Return Qty
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Used Qty
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              FOB (USD)
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Return Amount ($)
                            </th>
                            <th className="p-4 text-sm font-semibold text-gray-700">
                              Expired Date
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedPurchaseReturn.products?.map(
                            (product, index) => (
                              <tr key={index} className="hover:bg-gray-50">
                                <td className="p-4 text-sm text-gray-900 capitalize">
                                  {product.productName || "--"}
                                </td>
                                <td className="p-4 text-sm text-gray-900">
                                  {product.purchaseQty || 0}
                                </td>
                                <td className="p-4 text-sm text-gray-900">
                                  {product.returnQuantity || 0}
                                </td>
                                <td className="p-4 text-sm text-gray-900">
                                  {product.usedQty || 0}
                                </td>
                                <td className="p-4 text-sm text-gray-900">
                                  ${formatNumber(product.fob)}
                                </td>
                                <td className="p-4 text-sm text-gray-900 font-semibold">
                                  ${formatNumber(product.returnAmount)}
                                </td>
                                <td className="p-4 text-sm text-gray-900">
                                  {product.expiredDate
                                    ? formatDateToReadable(product.expiredDate)
                                    : "--"}
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Invoice Number
                          </p>
                          <p className="text-lg font-bold text-indigo-600">
                            {selectedPurchaseReturn.invoiceNumber}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Supplier Name
                          </p>
                          <p className="text-lg font-bold text-green-600 capitalize">
                            {selectedPurchaseReturn.supplierName}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Total Return Amount
                          </p>
                          <p className="text-lg font-bold text-red-600">
                            $
                            {calculateTotalReturnAmount(selectedPurchaseReturn)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-gray-600 font-medium">
                            Return Reason
                          </p>
                          <p className="text-lg font-bold text-blue-600 capitalize">
                            {selectedPurchaseReturn.returnReason || "--"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={closeAllModals}
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
};

export default PurchaseReturn;
