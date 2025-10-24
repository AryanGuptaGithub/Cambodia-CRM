import React, { useState, useEffect, useRef, useMemo } from "react";
import {Plus,Trash2,Edit,Save,Search,X,} from "lucide-react";
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
  },
};

// Custom Dropdown Component

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
  const [selected, setSelected] = useState([]);
  const inputRef = useRef(null);

  const [formData, setFormData] = useState({
    product: "",
    boxQuantity: 0,
    quantityPerCarton: 0,
    adjustmentType: "add",
    notes: "",
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Fetch initial data
  useEffect(() => {
    fetchAdjustments();
    fetchProducts();
  }, []);

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
      const response = await fetch(`${backendUrl}/api/products`);
      const data = await response.json();

      setProducts(data);
      setSelected([]);
    } catch (err) {
      handleError(err);
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
        adj.notes,
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
    setEditingAdjustment(adjustment);
    setFormData({
      product: adjustment.productId?._id || adjustment.productId,
      boxQuantity: adjustment.boxQuantity || 0,
      quantityPerCarton: adjustment.quantityPerCarton || 0,
      adjustmentType: adjustment.adjustmentType,
      notes: adjustment.notes || "",
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
      notes: "",
    });
    setModalVisible(false);
    setEditingAdjustment(null);
  };

  const getCurrentStock = (productId) => {
    const product = products.find((p) => p._id === productId);
    return product ? product.currentStock : "-";
  };

  // Get quantity display with sign
  const getQuantityDisplay = (quantity) => {
    return quantity > 0 ? `+${quantity}` : quantity.toString();
  };

  // Get quantity color class
  const getQuantityColor = (quantity) => {
    return quantity < 0 ? "text-red-600" : "text-green-600";
  };

  // Prepare product options for dropdown
  const productOptions = [
    { value: "", label: "Select Product" },
    ...products.map((product) => ({
      value: product._id,
      label: product.productName,
    })),
  ];

  const handleModalSubmit = async (e) => {
    e.preventDefault();

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
        notes: formData.notes,
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
    { id: "notes", name: "Notes" },
    { id: "actions", name: "Actions" },
  ];

  const tableColumns = [
    "productName",
    "boxQuantity",
    "openPieces",
    "totalQuantity",
    "adjustmentType",
    "notes",
    "actions",
  ];

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
          <div className="flex gap-3 flex-wrap">
            <button
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-200 cursor-pointer"
              onClick={() => setModalVisible(true)}
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
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
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
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
                          ) : item.id === "notes" ? (
                            adj.notes || "-"
                          ) : item.id === "actions" ? (
                            <div className="flex items-center justify-center gap-3 min-w-[150px]">
                              <button
                                className="text-indigo-600 hover:text-indigo-800 cursor-pointer"
                                onClick={() => handleEdit(adj)}
                                title="Edit"
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Product <span className="text-red-500">*</span>
                      </label>
                      <CustomDropdown
                        value={formData.product}
                        onChange={(value) => handleFormChange("product", value)}
                        disabled={!!editingAdjustment}
                        placeholder="Select Product"
                        options={productOptions}
                        required
                      />
                    </div>

                    {/* Current Stock */}
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

                    {/* Pieces per Box - Read Only */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Pieces per Box
                      </label>
                      <input
                        type="text"
                        value={getQtyPerCarton()}
                        readOnly
                        disabled
                        className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This value is automatically set from the selected
                        product
                      </p>
                    </div>
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
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
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter box quantity"
                        required
                      />
                    </div>

                    {/* Open Pieces */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Open Pieces <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.quantityPerCarton}
                        onChange={(e) =>
                          handleNumericInput(
                            "quantityPerCarton",
                            e.target.value
                          )
                        }
                        onBlur={(e) =>
                          handleNumericBlur("quantityPerCarton", e.target.value)
                        }
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="Enter open pieces"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Enter the number of individual pieces (not in boxes)
                      </p>
                    </div>

                    {/* Total Quantity Display */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Total Quantity
                      </label>
                      <div
                        className={`w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-50 font-medium ${
                          calculateTotalQuantity() < 0
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        {getQuantityDisplay(calculateTotalQuantity())}
                        <div className="text-xs text-gray-500 mt-1">
                          (Box Qty: {formData.boxQuantity} × Pieces/Box:{" "}
                          {getQtyPerCarton()}) + Open Pieces:{" "}
                          {formData.quantityPerCarton}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Full width fields */}
                <div className="mt-6 space-y-4">
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
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent cursor-pointer"
                      required
                    >
                      {CONFIG.ADJUSTMENT_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes
                    </label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) =>
                        handleFormChange("notes", e.target.value)
                      }
                      rows="3"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-vertical"
                      placeholder="Enter notes (optional)"
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-6 mt-6 border-t border-gray-200">
                  <button
                    type="submit"
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-200 flex-1 justify-center cursor-pointer"
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
