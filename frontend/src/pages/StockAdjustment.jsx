import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Trash2, Edit, Save, Search, X } from "lucide-react";
import axios from "axios";
import { showToast } from "../utils/toast";
import { getVisiblePages } from "../utils/useVisiblePages";
import CustomDropdown from "./Utility/customDropdown";

// Configuration constants
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
    ENTER_QTY_PER_CARTON: "Please enter quantity per carton",
    SELECT_TYPE: "Please select adjustment type",
    NO_PRODUCTS: "No products available for stock adjustment",
  },
};

// Helper function to validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return /^[0-9a-fA-F]{24}$/.test(id);
};

const StockAdjustment = () => {
  const [adjustments, setAdjustments] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState(null);
  const [isProductsEmpty, setIsProductsEmpty] = useState(false);
  const inputRef = useRef(null);

  const [formData, setFormData] = useState({
    product: "",
    boxQuantity: "",
    quantityPerCarton: "",
    adjustmentType: "add",
    remarks: "",
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Fetch initial data
  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
  }, []);

  // Check if products are empty
  useEffect(() => {
    if (!loading && products.length === 0) {
      setIsProductsEmpty(true);
    } else {
      setIsProductsEmpty(false);
    }
  }, [products, loading]);

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${backendUrl}/api/stock-adjustments`);
      if (response.data && response.data.success) {
        setAdjustments(response.data.data);
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

  const fetchProducts = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/products-with-in-stock`);
      const data = await response.json();
      setProducts(data);
    } catch (err) {
      console.error("Fetch products error:", err);
      showToast("error", "Failed to fetch products");
    }
  };

  // Memoized filtered adjustments
  const filteredAdjustments = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();

    return adjustments.filter((adj) => {
      if (!lowerSearch) return true;

      const fields = [
        adj.quantityPerCarton,
        adj.boxQuantity,
        adj.adjustmentType,
        adj.totalQuantity,
        adj.productId?.productName,
        adj.remarks,
      ];

      return fields.some((field) =>
        (field ?? "").toString().toLowerCase().includes(lowerSearch)
      );
    });
  }, [adjustments, searchTerm]);

  // Memoized paginated data
  const paginatedAdjustments = useMemo(() => {
    const start = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
    return filteredAdjustments.slice(start, start + CONFIG.ITEMS_PER_PAGE);
  }, [filteredAdjustments, currentPage]);

  // Memoized total pages
  const totalPages = useMemo(() => {
    return Math.ceil(filteredAdjustments.length / CONFIG.ITEMS_PER_PAGE);
  }, [filteredAdjustments]);

  // Memoized visible pagination pages
  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  // Get current stock for a product
  const getCurrentStock = (productId) => {
    if (!productId) return "-";
    const product = products.find((p) => p._id === productId);
    if (!product) return "-";

    if (product.inStock) {
      return `${product.inStock.boxes}`;
    }

    return product.currentStock || "-";
  };

  // Prepare product options for dropdown with current stock
  const productOptions = useMemo(() => {
    if (isProductsEmpty) {
      return [
        {
          value: "",
          label: "No Products Available",
          disabled: true,
        },
      ];
    }

    return [
      { value: "", label: "Select Product" },
      ...products.map((product) => {
        const stockInfo = getCurrentStock(product._id);
        return {
          value: product._id,
          label: `${product.productName}`,
          product: product,
        };
      }),
    ];
  }, [products, isProductsEmpty]);

  // Selection handlers
  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      showToast("error", "Please select adjustments to delete.");
      return;
    }

    // Validate IDs before sending
    const invalidIds = selectedIds.filter((id) => !isValidObjectId(id));
    if (invalidIds.length > 0) {
      console.error("❌ Invalid IDs found:", invalidIds);
      showToast(
        "error",
        `Invalid adjustment IDs detected. Please refresh the page and try again.`
      );
      return;
    }

    try {
      const response = await axios.delete(
        `${backendUrl}/api/stock-adjustments/bulk`,
        {
          data: { ids: selectedIds },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      fetchAdjustments();

      showToast(
        "success",
        response.data?.message || "Adjustments deleted successfully."
      );
    } catch (error) {
      console.error("❌ Bulk delete error:", error);

      if (error.response) {
        console.error("🔍 Response data: 278", error.response.data);
        console.error("🔍 Status:", error.response.status);

        // Show specific error message from backend
        if (error.response.data.invalidIds) {
          showToast(
            "error",
            `Invalid IDs: ${error.response.data.invalidIds.join(", ")}`
          );
        } else {
          showToast(
            "error",
            error.response.data.message || "Failed to delete adjustments."
          );
        }
      } else {
        showToast("error", "Failed to delete adjustments.");
      }
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${backendUrl}/api/stock-adjustments/${id}`);

      setAdjustments((prev) => prev.filter((adj) => adj._id !== id));
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
      showToast("success", CONFIG.MESSAGES.DELETE_SUCCESS);
    } catch (error) {
      showToast("error", CONFIG.MESSAGES.DELETE_ERROR);
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
      quantityPerCarton: adjustment.quantityPerCarton || 0,
      adjustmentType: adjustment.adjustmentType,
      remarks: adjustment.remarks || "",
    });
    setModalVisible(true);
  };

  // Get qtyPerCarton for the selected product
  const getQtyPerCarton = (productId = formData.product) => {
    if (!productId) return 0;
    const selectedProduct = products.find((p) => p._id === productId);
    return selectedProduct?.qtyPerCarton || 0;
  };

  // Calculate total quantity for display: (Box Quantity × Pieces per Box) + Open Pieces
  const calculateTotalQuantity = (currentFormData = formData) => {
    if (!currentFormData.boxQuantity && !currentFormData.quantityPerCarton)
      return 0;

    const piecesPerBox = getQtyPerCarton(currentFormData.product);
    const boxQty = currentFormData.boxQuantity || 0;
    const openPieces = currentFormData.quantityPerCarton || 0;

    const total = boxQty * piecesPerBox + openPieces;
    return currentFormData.adjustmentType === "remove" ? -total : total;
  };

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const toggleSelect = (adjustment) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(adjustment._id);
      if (exists) {
        return prev.filter((id) => id !== adjustment._id);
      } else {
        return [...prev, adjustment._id];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = paginatedAdjustments.map((adj) => adj._id);
      setSelectedIds(allSelected);
    } else {
      setSelectedIds([]);
    }
  };

  // Handle numeric input with validation
  const handleNumericInput = (field, value) => {
    // Remove any non-numeric characters
    const numericValue = value.replace(/[^0-9]/g, "");

    // If empty, set to empty string (don't convert to number yet)
    if (numericValue === "") {
      handleFormChange(field, "");
    } else {
      // Convert to number
      const finalValue = parseInt(numericValue, 10);
      handleFormChange(field, finalValue);
    }
  };

  // Handle blur event for numeric inputs
  const handleNumericBlur = (field, value) => {
    // If empty or invalid, set to default value
    if (!value || value === "" || isNaN(value)) {
      handleFormChange(field, 0);
    }
  };

  const handleModalCancel = () => {
    setFormData({
      product: "",
      boxQuantity: 0,
      quantityPerCarton: 0,
      adjustmentType: "add",
      remarks: "",
    });
    setModalVisible(false);
    setEditingAdjustment(null);
  };

  // Get quantity display with sign
  const getQuantityDisplay = (quantity) => {
    return quantity > 0 ? `+${quantity}` : quantity.toString();
  };

  // Get quantity color class
  const getQuantityColor = (quantity) => {
    return quantity < 0 ? "text-red-600" : "text-green-600";
  };

  const handleModalSubmit = async (e) => {
    e.preventDefault();

    if (isProductsEmpty) {
      showToast("error", CONFIG.MESSAGES.NO_PRODUCTS);
      return;
    }

    // Basic validation
    if (!formData.product) {
      showToast("error", CONFIG.MESSAGES.SELECT_PRODUCT);
      return;
    }
    if (
      (formData.boxQuantity === 0 && formData.quantityPerCarton === 0) ||
      formData.boxQuantity < 0 ||
      formData.quantityPerCarton < 0
    ) {
      showToast("error", "Please enter valid box quantity or open pieces");
      return;
    }
    if (!formData.adjustmentType) {
      showToast("error", CONFIG.MESSAGES.SELECT_TYPE);
      return;
    }

    try {
      // Calculate total quantity: (Box Quantity × Pieces per Box) + Open Pieces
      const piecesPerBox = getQtyPerCarton();
      const boxQty = formData.boxQuantity || 0;
      const openPieces = formData.quantityPerCarton || 0;
      const totalQuantity = boxQty * piecesPerBox + openPieces;

      const adjustmentData = {
        productId: formData.product,
        boxQuantity: boxQty,
        quantityPerCarton: openPieces,
        totalQuantity:
          formData.adjustmentType === "remove" ? -totalQuantity : totalQuantity,
        adjustmentType: formData.adjustmentType,
        remarks: formData.remarks,
      };

      if (editingAdjustment) {
        // Update existing adjustment
        const response = await axios.put(
          `${backendUrl}/api/stock-adjustments/${editingAdjustment._id}`,
          adjustmentData
        );

        if (response.data.success) {
          setAdjustments((prev) =>
            prev.map((adj) =>
              adj._id === editingAdjustment._id
                ? {
                    ...adj,
                    ...adjustmentData,
                    productId: {
                      ...adj.productId,
                      productName: products.find(
                        (p) => p._id === formData.product
                      )?.productName,
                    },
                  }
                : adj
            )
          );
          showToast("success", CONFIG.MESSAGES.UPDATE_SUCCESS);
        }
      } else {
        // Create new adjustment
        const response = await axios.post(
          `${backendUrl}/api/stock-adjustments`,
          adjustmentData
        );

        if (response.data.success) {
          const newAdjustment = {
            _id: response.data.data._id,
            ...adjustmentData,
            productId: {
              _id: formData.product,
              productName: products.find((p) => p._id === formData.product)
                ?.productName,
            },
            createdAt: new Date().toISOString(),
          };
          setAdjustments((prev) => [newAdjustment, ...prev]);
          showToast("success", CONFIG.MESSAGES.CREATE_SUCCESS);
        }
      }

      handleModalCancel();
    } catch (error) {
      console.error("Error saving adjustment:", error);
      showToast(
        "error",
        editingAdjustment
          ? CONFIG.MESSAGES.UPDATE_ERROR
          : CONFIG.MESSAGES.CREATE_ERROR
      );
    }
  };

  const allFields = [
    { id: "select", name: "" },
    { id: "productName", name: "Product Name" },
    { id: "boxQuantity", name: "Box Quantity" },
    { id: "openPieces", name: "Open Pieces" },
    { id: "totalQuantity", name: "Total Quantity" },
    { id: "adjustmentType", name: "Type" },
    { id: "remarks", name: "Remarks" },
    { id: "actions", name: "Actions" },
  ];

  const tableColumns = [
    "productName",
    "boxQuantity",
    "openPieces",
    "totalQuantity",
    "adjustmentType",
    "remarks",
    "actions",
  ];

  return (
    <div className="p-6">
      <div className="container">
        {/* Warning message if products are empty */}
        {isProductsEmpty && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  No Products Available
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>
                    You need to add at least one product before creating stock adjustments. 
                    Add products in the product management section first.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

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
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors duration-200 cursor-pointer"
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
                  placeholder="Search by Product Name,Box Quantity....."
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

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {allFields
                  .filter((item) => tableColumns.includes(item.id))
                  .map((item) => (
                    <th key={item.id} className="p-3">
                      {item.id === "productName" ? (
                        <div className="flex justify-left gap-3">
                          {paginatedAdjustments.length > 0 && (
                            <input
                              type="checkbox"
                              aria-label="Select all adjustments"
                              checked={
                                paginatedAdjustments.length > 0 &&
                                paginatedAdjustments.every((adj) =>
                                  selectedIds.includes(adj._id)
                                )
                              }
                              ref={(input) => {
                                if (input) {
                                  input.indeterminate =
                                    selectedIds.length > 0 &&
                                    selectedIds.length <
                                      paginatedAdjustments.length;
                                }
                              }}
                              onChange={(e) =>
                                toggleSelectAll(e.target.checked)
                              }
                              className="cursor-pointer"
                              disabled={isProductsEmpty}
                            />
                          )}
                          <span className="text-sm font-medium">
                            {item.name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">{item.name}</span>
                      )}
                    </th>
                  ))}
              </tr>
            </thead>

            <tbody>
              {paginatedAdjustments.length === 0 ? (
                <tr>
                  <td
                    colSpan={tableColumns.length}
                    className="p-4 text-center text-gray-500"
                  >
                    {loading ? "Loading..." : CONFIG.MESSAGES.NO_DATA}
                  </td>
                </tr>
              ) : (
                paginatedAdjustments.map((adj, index) => (
                  <tr
                    key={adj._id}
                    className={`hover:bg-gray-50 ${
                      index < paginatedAdjustments.length - 1 ? "border-b" : ""
                    }`}
                  >
                    {allFields
                      .filter((item) => tableColumns.includes(item.id))
                      .map((item) => (
                        <td key={item.id} className="p-3 text-sm">
                          {item.id === "productName" ? (
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
                              <span className="font-medium text-left">
                                {adj.productId?.productName || "N/A"}
                              </span>
                            </div>
                          ) : item.id === "boxQuantity" ? (
                            adj.boxQuantity
                          ) : item.id === "openPieces" ? (
                            adj.quantityPerCarton
                          ) : item.id === "totalQuantity" ? (
                            <span
                              className={`font-medium ${getQuantityColor(
                                adj.totalQuantity
                              )}`}
                            >
                              {getQuantityDisplay(adj.totalQuantity)}
                            </span>
                          ) : item.id === "adjustmentType" ? (
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                adj.adjustmentType === "add"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {adj.adjustmentType}
                            </span>
                          ) : item.id === "remarks" ? (
                            adj.remarks || "-"
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className={`${
                                  isProductsEmpty
                                    ? "text-gray-400 cursor-not-allowed"
                                    : "text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                }`}
                                onClick={() => handleEdit(adj)}
                                title="Edit"
                                disabled={isProductsEmpty}
                              >
                                <Edit size={18} />
                              </button>
                              <button
                                className="text-red-600 hover:text-red-800 cursor-pointer"
                                onClick={() => handleDelete(adj._id)}
                                title="Delete"
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                      ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

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
                )
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

        {modalVisible && (
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">
                  {editingAdjustment ? "Edit Adjustment" : "Add New Adjustment"}
                </h2>
                <button
                  onClick={handleModalCancel}
                  className="text-gray-400 hover:text-gray-600 transition-colors duration-200 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleModalSubmit} className="p-6">
                {/* First Row: Product and Adjustment Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Product <span className="text-red-500">*</span>
                    </label>
                    <CustomDropdown
                      value={formData.product}
                      onChange={(value) => handleFormChange("product", value)}
                      disabled={!!editingAdjustment || isProductsEmpty}
                      placeholder={isProductsEmpty ? "No Products Available" : "Select Product"}
                      options={productOptions}
                      required
                    />
                  </div>

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
                      className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : "cursor-pointer"
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

                {/* Second Row: Current Stock and Box Quantity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Current Stock
                    </label>
                    <input
                      type="text"
                      value={
                        formData.product
                          ? getCurrentStock(formData.product)
                          : "-"
                      }
                      readOnly
                      disabled
                      className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                    />
                  </div>

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
                      className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                        isProductsEmpty ? "bg-gray-100 cursor-not-allowed" : ""
                      }`}
                      placeholder="Enter box quantity"
                      required
                    />
                  </div>
                </div>

                {/* Remarks Field - Full Width */}
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
                    className={`w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-vertical ${
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
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors duration-200 flex-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StockAdjustment;