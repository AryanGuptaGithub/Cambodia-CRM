import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { Plus, Trash2, Edit, Save, Search, X, Eye } from "lucide-react";
import axios from "axios";
import { showToast } from "../utils/toast";
import { getVisiblePages } from "../utils/useVisiblePages";
import CustomDropdown from "./Utility/customDropdown";
import { fetchProducts } from "./ProductManager/common/fetchDropdown.jsx";
import { confirmDialog } from "../utils/confirmationDialog.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  ITEMS_PER_PAGE: 9,
  ADJUSTMENT_TYPES: [
    { value: "add", label: "Add" },
    { value: "remove", label: "Remove" },
  ],
  DEFAULT_QUANTITY: 1,
  MESSAGES: {
    DELETE_SUCCESS: "Stock adjustment deleted successfully",
    DELETE_ERROR: "Failed to delete stock adjustment",
    CREATE_SUCCESS: "Stock adjustment created successfully",
    CREATE_ERROR: "Failed to create stock adjustment",
    UPDATE_SUCCESS: "Stock adjustment updated successfully",
    UPDATE_ERROR: "Failed to update stock adjustment",
    NO_DATA: "No stock adjustments found",
    SELECT_PRODUCT: "Please select a product",
    ENTER_BOX_QUANTITY: "Please enter box quantity",
    SELECT_TYPE: "Please select adjustment type",
    NO_PRODUCTS: "No products available for stock adjustment",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (v) => {
  const n = parseFloat(v) || 0;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const StockAdjustment = () => {
  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [productStock, setProductStock] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState(null);
  const [isProductsEmpty, setIsProductsEmpty] = useState(false);
  const [remarksModalVisible, setRemarksModalVisible] = useState(false);
  const [viewingRemarks, setViewingRemarks] = useState("");

  // ── Warehouse summary now tracks totalAmount correctly ────────────────────
  const [warehouseSummary, setWarehouseSummary] = useState({
    totalAmount: 0,
    totalProducts: 0,
  });

  // ── Last adjustment result (shown in success banner) ─────────────────────
  const [lastAdjustment, setLastAdjustment] = useState(null);

  const inputRef = useRef(null);

  const [formData, setFormData] = useState({
    product: "",
    boxQuantity: "",
    adjustmentType: "add",
    remarks: "",
    unitCost: "", // optional cost override for "add"
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchAdjustments();
    fetchProductsData();
    fetchProductStock();
    fetchWarehouseSummary();
  }, []);

  useEffect(() => {
    setIsProductsEmpty(!loading && products.length === 0);
  }, [products, loading]);

  // ── Fetch warehouse summary ───────────────────────────────────────────────
  const fetchWarehouseSummary = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/stock-adjustment/summary/warehouse`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.data?.success) {
        setWarehouseSummary(response.data.warehouseSummary);
      }
    } catch (error) {
      console.error("Fetch warehouse summary error:", error);
    }
  };

  // Update warehouse summary from any API response that returns warehouseSummary
  const updateWarehouseSummaryFromResponse = (responseData) => {
    if (responseData?.warehouseSummary) {
      setWarehouseSummary(responseData.warehouseSummary);
    }
  };

  // ── Fetch adjustments ─────────────────────────────────────────────────────
  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/stock-adjustment`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        setAdjustments(response.data.data);
        updateWarehouseSummaryFromResponse(response.data);
      } else {
        showToast("error", "Failed to fetch adjustments");
      }
    } catch (error) {
      console.error("Fetch adjustments error:", error);
      showToast("error", "Failed to fetch adjustments");
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch products ────────────────────────────────────────────────────────
  const fetchProductsData = async () => {
    try {
      const data = await fetchProducts(backendUrl);
      setProducts(data.data);
    } catch (err) {
      console.error("Fetch products error:", err);
      showToast("error", "Failed to fetch products");
    }
  };

  // ── Fetch product stock ───────────────────────────────────────────────────
  const fetchProductStock = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/stock-adjustment/in-stock`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      if (response.data?.success) {
        setProductStock(response.data.data || []);
        updateWarehouseSummaryFromResponse(response.data);
      } else if (Array.isArray(response.data)) {
        setProductStock(response.data);
      } else {
        setProductStock([]);
      }
    } catch (error) {
      console.error("Error fetching product stock:", error);
      showToast("error", "Failed to fetch stock information");
      setProductStock([]);
    }
  };

  // ── Product stock map ─────────────────────────────────────────────────────
  const productStockMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(productStock)) {
      productStock.forEach((item) => {
        if (item?._id) {
          map.set(item._id, {
            boxes: item.inStock?.boxes || 0,
            amount: item.inStock?.amount || 0,
          });
        }
      });
    }
    return map;
  }, [productStock]);

  const getCurrentStock = useCallback(
    (productId) => {
      if (!productId) return { boxes: 0, amount: 0 };
      return productStockMap.get(productId) || { boxes: 0, amount: 0 };
    },
    [productStockMap],
  );

  // ── Filtered / paginated adjustments ─────────────────────────────────────
  const filteredAdjustments = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    return adjustments.filter((adj) => {
      if (!lowerSearch) return true;
      const productName = adj.productId?.productName || "";
      return (
        productName.toLowerCase().includes(lowerSearch) ||
        adj.boxQuantity.toString().includes(lowerSearch) ||
        adj.adjustmentType.toLowerCase().includes(lowerSearch) ||
        (adj.remarks || "").toLowerCase().includes(lowerSearch)
      );
    });
  }, [adjustments, searchTerm]);

  const paginatedAdjustments = useMemo(() => {
    const start = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    return filteredAdjustments.slice(start, start + CONFIG.ITEMS_PER_PAGE);
  }, [filteredAdjustments, currentPage]);

  const totalPages = useMemo(
    () => Math.ceil(filteredAdjustments.length / CONFIG.ITEMS_PER_PAGE),
    [filteredAdjustments],
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const productOptions = useMemo(() => {
    if (isProductsEmpty)
      return [{ value: "", label: "No Products Available", disabled: true }];
    return [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: product.productName,
        product: product,
      })),
    ];
  }, [products, isProductsEmpty]);

  const handleFormChange = (field, value) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const formatCurrentStockDisplay = (productId) => {
    const stock = getCurrentStock(productId);
    return `${stock.boxes} boxes  /  ${fmt$(stock.amount)}`;
  };

  // ── Selection handlers ────────────────────────────────────────────────────
  const toggleSelect = (adjustment) => {
    setSelectedIds((prev) =>
      prev.includes(adjustment._id)
        ? prev.filter((id) => id !== adjustment._id)
        : [...prev, adjustment._id],
    );
  };

  const toggleSelectAll = (checked) => {
    setSelectedIds(checked ? paginatedAdjustments.map((adj) => adj._id) : []);
  };

  const handleNumericInput = (field, value) => {
    const numeric = value.replace(/[^0-9.]/g, "");
    handleFormChange(field, numeric === "" ? "" : numeric);
  };

  const handleNumericBlur = (field, value) => {
    if (!value || value === "" || isNaN(value)) handleFormChange(field, 0);
  };

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      showToast("error", "Please select at least one adjustment to delete.");
      return;
    }

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selectedIds.length}</b> stock adjustment(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        setLoading(true);
        const token = localStorage.getItem("token");
        const response = await axios.delete(
          `${backendUrl}/api/stock-adjustment/bulk`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            data: { ids: selectedIds },
          },
        );

        if (response.data.success) {
          showToast("success", response.data.message);
          updateWarehouseSummaryFromResponse(response.data);
          await fetchAdjustments();
          await fetchProductStock();
          setSelectedIds([]);
          setLastAdjustment(null);
        } else {
          showToast("error", response.data.message);
        }
      } catch (error) {
        const errorMsg =
          error.response?.data?.message ||
          "An error occurred while deleting adjustments.";
        showToast("error", errorMsg);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Single delete ─────────────────────────────────────────────────────────
  const handleDelete = async (id, productName = "") => {
    const confirmDelete = await confirmDialog({
      title: "Delete Stock Adjustment",
      text: `Are you sure you want to delete stock adjustment${productName ? ` for <b>${productName}</b>` : ""}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.delete(
          `${backendUrl}/api/stock-adjustment/${id}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (response.data.success) {
          updateWarehouseSummaryFromResponse(response.data);
          await fetchAdjustments();
          await fetchProductStock();
          setSelectedIds((prev) => prev.filter((sid) => sid !== id));
          setLastAdjustment(null);
          showToast("success", CONFIG.MESSAGES.DELETE_SUCCESS);
        }
      } catch (error) {
        const errorMsg =
          error.response?.data?.message ||
          "An error occurred while deleting adjustment.";
        showToast("error", errorMsg);
      }
    }
  };

  const handleEdit = (adjustment) => {
    if (isProductsEmpty) {
      showToast("error", CONFIG.MESSAGES.NO_PRODUCTS);
      return;
    }
    setEditingAdjustment(adjustment);
    setFormData({
      product: adjustment.productId?._id || adjustment.productId,
      boxQuantity: adjustment.boxQuantity || 0,
      adjustmentType: adjustment.adjustmentType,
      remarks: adjustment.remarks || "",
      unitCost: "",
    });
    setModalVisible(true);
  };

  const handleViewRemarks = (remarks) => {
    setViewingRemarks(remarks || "No remarks provided");
    setRemarksModalVisible(true);
  };

  const handleModalCancel = () => {
    setFormData({
      product: "",
      boxQuantity: 0,
      adjustmentType: "add",
      remarks: "",
      unitCost: "",
    });
    setModalVisible(false);
    setEditingAdjustment(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleModalSubmit = async (e) => {
    e.preventDefault();

    if (isProductsEmpty) {
      showToast("error", CONFIG.MESSAGES.NO_PRODUCTS);
      return;
    }
    if (!formData.product) {
      showToast("error", CONFIG.MESSAGES.SELECT_PRODUCT);
      return;
    }

    const boxQty = parseInt(formData.boxQuantity) || 0;
    if (boxQty <= 0) {
      showToast("error", "Please enter valid box quantity");
      return;
    }
    if (!formData.adjustmentType) {
      showToast("error", CONFIG.MESSAGES.SELECT_TYPE);
      return;
    }

    try {
      const product = products.find((p) => p._id === formData.product);
      const qtyPerCarton = product?.qtyPerCarton || 1;
      const totalPieces = boxQty * qtyPerCarton;

      const adjustmentData = {
        productId: formData.product,
        boxQuantity: boxQty,
        totalQuantity:
          formData.adjustmentType === "remove" ? -totalPieces : totalPieces,
        adjustmentType: formData.adjustmentType,
        remarks: formData.remarks,
        ...(formData.unitCost
          ? { unitCost: parseFloat(formData.unitCost) }
          : {}),
      };

      const token = localStorage.getItem("token");

      if (editingAdjustment) {
        const response = await axios.put(
          `${backendUrl}/api/stock-adjustment/${editingAdjustment._id}`,
          adjustmentData,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.data.success) {
          updateWarehouseSummaryFromResponse(response.data);
          setLastAdjustment(response.data.updatedWarehouseStock);
          await fetchAdjustments();
          await fetchProductStock();
          showToast("success", CONFIG.MESSAGES.UPDATE_SUCCESS);
        }
      } else {
        const response = await axios.post(
          `${backendUrl}/api/stock-adjustment`,
          adjustmentData,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.data.success) {
          updateWarehouseSummaryFromResponse(response.data);
          setLastAdjustment(response.data.updatedWarehouseStock);
          await fetchAdjustments();
          await fetchProductStock();
          showToast("success", CONFIG.MESSAGES.CREATE_SUCCESS);
        }
      }

      handleModalCancel();
    } catch (error) {
      const errorMsg =
        error.response?.data?.message ||
        "An error occurred while saving adjustment.";
      showToast("error", errorMsg);
    }
  };

  // ── Format currency (INR display — change locale/currency as needed) ───────
  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6">
      <div className="container">
        {/* ── Warehouse Summary Cards ── */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Total Inventory Value */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg shadow-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">
                  Total Warehouse Inventory Value
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(warehouseSummary.totalAmount)}
                </p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Products in Stock */}
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg shadow-lg p-4 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium opacity-90">
                  Products In Warehouse Stock
                </p>
                <p className="text-2xl font-bold mt-1">
                  {warehouseSummary.totalProducts}
                </p>
              </div>
              <div className="bg-white/20 rounded-full p-3">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* ── Last Adjustment Result Banner ── */}
        {lastAdjustment && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              lastAdjustment.adjustment?.type === "add"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3
                  className={`text-sm font-semibold mb-2 ${
                    lastAdjustment.adjustment?.type === "add"
                      ? "text-green-800"
                      : "text-red-800"
                  }`}
                >
                  {lastAdjustment.adjustment?.type === "add"
                    ? "✅ Stock Added"
                    : "📤 Stock Removed"}{" "}
                  — {lastAdjustment.productName}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div className="bg-white rounded p-2 shadow-sm">
                    <p className="text-gray-500 text-xs">Boxes Adjusted</p>
                    <p className="font-bold text-gray-800">
                      {lastAdjustment.adjustment?.type === "add" ? "+" : "-"}
                      {lastAdjustment.adjustment?.boxes?.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-white rounded p-2 shadow-sm">
                    <p className="text-gray-500 text-xs">Cost Per Box</p>
                    <p className="font-bold text-gray-800">
                      {fmt$(lastAdjustment.adjustment?.costPerBox)}
                    </p>
                  </div>
                  <div className="bg-white rounded p-2 shadow-sm">
                    <p className="text-gray-500 text-xs">
                      {lastAdjustment.adjustment?.type === "add"
                        ? "Amount Added"
                        : "Amount Deducted"}
                    </p>
                    <p
                      className={`font-bold ${
                        lastAdjustment.adjustment?.type === "add"
                          ? "text-green-700"
                          : "text-red-700"
                      }`}
                    >
                      {lastAdjustment.adjustment?.type === "add" ? "+" : "-"}
                      {fmt$(lastAdjustment.adjustment?.absAmount)}
                    </p>
                  </div>
                  <div className="bg-white rounded p-2 shadow-sm">
                    <p className="text-gray-500 text-xs">New Total Stock</p>
                    <p className="font-bold text-blue-700">
                      {lastAdjustment.totalBoxes?.toLocaleString()} boxes
                      &nbsp;/&nbsp;
                      {fmt$(lastAdjustment.totalAmount)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-gray-500">New Avg Price:</span>
                  <span className="text-xs font-semibold text-gray-700">
                    {fmt$(lastAdjustment.averagePrice)} / box
                  </span>
                  <span
                    className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${
                      lastAdjustment.status === "In Stock"
                        ? "bg-green-100 text-green-700"
                        : lastAdjustment.status === "Low Stock"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {lastAdjustment.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setLastAdjustment(null)}
                className="text-gray-400 hover:text-gray-600 ml-4"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Empty products warning ── */}
        {isProductsEmpty && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg
                className="h-5 w-5 text-red-400 mr-3"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-red-800">
                  No Products Available
                </h3>
                <p className="mt-1 text-sm text-red-700">
                  You need to add at least one product before creating stock
                  adjustments.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Toolbar ── */}
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 flex-wrap">
            <button
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors duration-200 ${
                isProductsEmpty
                  ? "bg-gray-400 text-white opacity-50 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
              }`}
              onClick={() => setModalVisible(true)}
              disabled={isProductsEmpty}
            >
              <Plus size={18} /> Add New Adjustment
            </button>

            {selectedIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 cursor-pointer"
              >
                <Trash2 size={18} /> Delete Selected ({selectedIds.length})
              </button>
            )}
          </div>

          {adjustments.length > 0 && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredAdjustments.length}
                </span>
              </p>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={() => inputRef.current?.focus()}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search by Product Name, Type..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  disabled={isProductsEmpty}
                  className={`pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 ${
                    isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                  }`}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex justify-left gap-3">
                    {paginatedAdjustments.length > 0 && (
                      <input
                        type="checkbox"
                        aria-label="Select all adjustments"
                        checked={
                          paginatedAdjustments.length > 0 &&
                          paginatedAdjustments.every((adj) =>
                            selectedIds.includes(adj._id),
                          )
                        }
                        ref={(input) => {
                          if (input) {
                            input.indeterminate =
                              selectedIds.length > 0 &&
                              selectedIds.length < paginatedAdjustments.length;
                          }
                        }}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="cursor-pointer"
                        disabled={isProductsEmpty}
                      />
                    )}
                    <span className="text-sm font-medium">Product Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Box Qty</th>
                <th className="p-3 text-sm font-medium">Type</th>
                <th className="p-3 text-sm font-medium">Remarks</th>
                <th className="p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    {loading ? "Loading..." : CONFIG.MESSAGES.NO_DATA}
                  </td>
                </tr>
              ) : (
                paginatedAdjustments.map((adj, index) => {
                  const productName = adj.productId?.productName || "N/A";
                  return (
                    <tr
                      key={adj._id}
                      className={`hover:bg-gray-50 ${index < paginatedAdjustments.length - 1 ? "border-b" : ""}`}
                    >
                      <td className="p-3 text-sm">
                        <div className="flex gap-4 items-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(adj._id)}
                            onChange={() => toggleSelect(adj)}
                            className={`rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 ${
                              isProductsEmpty
                                ? "cursor-not-allowed opacity-50"
                                : "cursor-pointer"
                            }`}
                            disabled={isProductsEmpty}
                          />
                          <span className="font-medium">{productName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm">{adj.boxQuantity}</td>
                      <td className="p-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            adj.adjustmentType === "add"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {adj.adjustmentType === "add"
                            ? "Add Stock"
                            : "Remove Stock"}
                        </span>
                      </td>
                      <td className="p-3 flex items-center justify-center">
                        {adj.remarks ? (
                          <button
                            onClick={() => handleViewRemarks(adj.remarks)}
                            className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 cursor-pointer"
                          >
                            <Eye size={16} />
                            <span>View</span>
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            className={`${isProductsEmpty ? "text-gray-400 cursor-not-allowed" : "text-indigo-600 hover:text-indigo-800 cursor-pointer"}`}
                            onClick={() => handleEdit(adj)}
                            disabled={isProductsEmpty}
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            className="text-red-600 hover:text-red-800 cursor-pointer"
                            onClick={() => handleDelete(adj._id, productName)}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* ── Pagination ── */}
          {paginatedAdjustments.length > 0 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1 || isProductsEmpty}
                className={`px-3 py-1 rounded hover:bg-gray-300 ${
                  currentPage === 1 || isProductsEmpty
                    ? "bg-gray-200 opacity-50 cursor-not-allowed"
                    : "bg-gray-200 cursor-pointer"
                }`}
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
                    disabled={isProductsEmpty}
                    className={`px-3 py-1 rounded w-10 text-center transition ${
                      currentPage === page
                        ? "bg-indigo-600 text-white"
                        : isProductsEmpty
                          ? "bg-gray-200 opacity-50 cursor-not-allowed"
                          : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
                    }`}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages || isProductsEmpty}
                className={`px-3 py-1 rounded hover:bg-gray-300 ${
                  currentPage === totalPages || isProductsEmpty
                    ? "bg-gray-200 opacity-50 cursor-not-allowed"
                    : "bg-gray-200 cursor-pointer"
                }`}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* ── Add / Edit Modal ── */}
        {modalVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingAdjustment ? "Edit Adjustment" : "Add New Adjustment"}
                </h2>
                <button
                  onClick={handleModalCancel}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleModalSubmit} className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Product */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Product <span className="text-red-500">*</span>
                    </label>
                    <CustomDropdown
                      value={formData.product}
                      onChange={(value) => {
                        handleFormChange("product", value);
                        handleFormChange("boxQuantity", 0);
                        handleFormChange("unitCost", "");
                      }}
                      disabled={!!editingAdjustment || isProductsEmpty}
                      placeholder={
                        isProductsEmpty
                          ? "No Products Available"
                          : "Select Product"
                      }
                      options={productOptions}
                      required
                    />
                  </div>

                  {/* Adjustment Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Adjustment Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.adjustmentType}
                      onChange={(e) =>
                        handleFormChange("adjustmentType", e.target.value)
                      }
                      disabled={isProductsEmpty}
                      className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isProductsEmpty
                          ? "bg-gray-100 cursor-not-allowed"
                          : "cursor-pointer"
                      }`}
                      required
                    >
                      {CONFIG.ADJUSTMENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  {/* Current Stock (read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Stock (Boxes / Value)
                    </label>
                    <input
                      type="text"
                      value={
                        formData.product
                          ? formatCurrentStockDisplay(formData.product)
                          : "—"
                      }
                      readOnly
                      disabled
                      className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                    />
                    {formData.product && (
                      <p className="mt-1 text-xs text-gray-500">
                        Stock as per warehouse (ReportInHand)
                      </p>
                    )}
                  </div>

                  {/* Box Quantity */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Box Quantity <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.boxQuantity}
                      onChange={(e) =>
                        handleNumericInput("boxQuantity", e.target.value)
                      }
                      onBlur={(e) =>
                        handleNumericBlur("boxQuantity", e.target.value)
                      }
                      disabled={isProductsEmpty}
                      className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                      placeholder="Enter box quantity"
                      required
                    />
                  </div>
                </div>

                {/* Unit Cost (only for "add") */}
                {formData.adjustmentType === "add" && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cost Per Box ($){" "}
                      <span className="text-gray-400 text-xs font-normal">
                        (optional — leave blank to use existing average price)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={formData.unitCost}
                      onChange={(e) =>
                        handleNumericInput("unitCost", e.target.value)
                      }
                      onBlur={(e) =>
                        handleNumericBlur("unitCost", e.target.value)
                      }
                      disabled={isProductsEmpty}
                      className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                      placeholder="e.g. 1.75"
                    />
                    {/* Live preview of total amount to be added */}
                    {formData.boxQuantity > 0 && (
                      <p className="mt-1 text-xs text-green-700 font-medium">
                        ≈ Amount to add:{" "}
                        {fmt$(
                          parseFloat(formData.boxQuantity || 0) *
                            parseFloat(
                              formData.unitCost ||
                                getCurrentStock(formData.product)?.amount /
                                  (getCurrentStock(formData.product)?.boxes ||
                                    1) ||
                                0,
                            ),
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Remarks */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Remarks
                  </label>
                  <textarea
                    value={formData.remarks}
                    onChange={(e) =>
                      handleFormChange("remarks", e.target.value)
                    }
                    rows="3"
                    disabled={isProductsEmpty}
                    className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-vertical ${
                      isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                    }`}
                    placeholder="Enter remarks (optional)"
                  />
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    disabled={isProductsEmpty}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors duration-200 flex-1 justify-center ${
                      isProductsEmpty
                        ? "bg-gray-400 text-white opacity-50 cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                    }`}
                  >
                    <Save size={16} />
                    {editingAdjustment
                      ? "Update Adjustment"
                      : "Create Adjustment"}
                  </button>
                  <button
                    type="button"
                    onClick={handleModalCancel}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── View Remarks Modal ── */}
        {remarksModalVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Remarks</h2>
                <button
                  onClick={() => setRemarksModalVisible(false)}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div className="bg-gray-50 p-4 rounded-lg min-h-[150px]">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {viewingRemarks}
                  </p>
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setRemarksModalVisible(false)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockAdjustment;
