import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Edit,
  Save,
  Search,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../utils/toast";

// Configuration constants
const CONFIG = {
  ITEMS_PER_PAGE: 10,
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
const CustomDropdown = ({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select Product",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer hover:border-gray-400"
        } ${!value ? "text-gray-500" : "text-gray-900"}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {!disabled && (
          <span className="text-gray-400 flex-shrink-0 ml-2">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-indigo-50 hover:text-indigo-900 transition-colors duration-150 ${
                  value === option.value
                    ? "bg-indigo-100 text-indigo-900 font-medium"
                    : "text-gray-900"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
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
  const [formData, setFormData] = useState({
    product: "",
    boxQuantity: 0,
    quantityPerCarton: 0, // Will be auto-filled from selected product
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
      const response = await axios.get(
        `${backendUrl}/api/stock-adjustments/products`
      );
      if (response.data && response.data.success) {
        setProducts(response.data.data);
      } else {
        showToast("error", "Failed to load products");
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      showToast("error", "Error fetching products");
    }
  };

  // Filter and pagination
  const filteredAdjustments = adjustments.filter((adj) =>
    adj.productName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(
    filteredAdjustments.length / CONFIG.ITEMS_PER_PAGE
  );
  const paginatedAdjustments = filteredAdjustments.slice(
    (currentPage - 1) * CONFIG.ITEMS_PER_PAGE,
    currentPage * CONFIG.ITEMS_PER_PAGE
  );

  // Selection handlers
  const handleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(paginatedAdjustments.map((adj) => adj._id));
    } else {
      setSelectedIds([]);
    }
  };

  // CRUD operations
  const handleBulkDelete = async () => {
    try {
      await axios.delete(`${backendUrl}/api/stock-adjustments/bulk`, {
        data: { ids: selectedIds },
      });

      setAdjustments((prev) =>
        prev.filter((adj) => !selectedIds.includes(adj._id))
      );
      setSelectedIds([]);
      showToast(
        "success",
        `${selectedIds.length} adjustment(s) deleted successfully`
      );
    } catch (error) {
      showToast("error", CONFIG.MESSAGES.DELETE_ERROR);
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${backendUrl}/api/stock-adjustments/${id}`);

      setAdjustments((prev) => prev.filter((adj) => adj._id !== id));
      showToast("success", CONFIG.MESSAGES.DELETE_SUCCESS);
    } catch (error) {
      showToast("error", CONFIG.MESSAGES.DELETE_ERROR);
    }
  };

  const handleEdit = (adjustment) => {
    setEditingAdjustment(adjustment);
    setFormData({
      product: adjustment.productId,
      boxQuantity: adjustment.boxQuantity || 1,
      quantityPerCarton: adjustment.quantityPerCarton || 0,
      adjustmentType: adjustment.adjustmentType,
      notes: adjustment.notes,
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
    if (!currentFormData.boxQuantity && !currentFormData.quantityPerCarton) return 0;

    const piecesPerBox = getQtyPerCarton(currentFormData.product);
    const boxQty = currentFormData.boxQuantity || 0;
    const openPieces = currentFormData.quantityPerCarton || 0;

    const total = boxQty * piecesPerBox + openPieces;
    return currentFormData.adjustmentType === "remove" ? -total : total;
  };

  const handleFormChange = (field, value) => {
    const updatedFormData = {
      ...formData,
      [field]: value,
    };

    // When product is selected, auto-fill the quantityPerCarton from product data
    if (field === "product" && value) {
      const selectedProduct = products.find((p) => p._id === value);
      if (selectedProduct) {
        updatedFormData.quantityPerCarton = selectedProduct.qtyPerCarton || 0;
      }
    }

    setFormData(updatedFormData);
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
      if (field === "boxQuantity") {
        handleFormChange(field, 1);
      } else {
        handleFormChange(field, 0);
      }
    }
  };

  const handleModalCancel = () => {
    setFormData({
      product: "",
      boxQuantity: 1,
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

  // Update the handleModalSubmit function to use the new calculation:
  const handleModalSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!formData.product) {
      showToast("error", CONFIG.MESSAGES.SELECT_PRODUCT);
      return;
    }
    if (
      (!formData.boxQuantity && !formData.quantityPerCarton) ||
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
        quantityPerCarton: openPieces, // Now stores open pieces
        piecesPerBox: piecesPerBox, // Store pieces per box for reference
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
                    productName: products.find(
                      (p) => p._id === formData.product
                    )?.productName,
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
            productName: products.find((p) => p._id === formData.product)
              ?.productName,
            currentStock:
              products.find((p) => p._id === formData.product)?.currentStock ||
              0,
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

  return (
    <div className="max-w-8xl p-6 bg-white rounded-xl shadow">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Stock Adjustment
      </div>

      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex gap-3 flex-wrap">
          <button
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors duration-200"
            onClick={() => setModalVisible(true)}
          >
            <Plus size={18} /> Add New Adjustment
          </button>

          {selectedIds.length > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors duration-200"
            >
              <Trash2 size={18} /> Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-1/3">
          <input
            type="text"
            placeholder="Search product..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full border border-gray-300 rounded-md pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-left border border-gray-200 rounded-lg overflow-hidden">
          <thead className="bg-gray-100 text-gray-700 font-semibold">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={
                    paginatedAdjustments.length > 0 &&
                    selectedIds.length === paginatedAdjustments.length
                  }
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="px-4 py-3">Product Name</th>
              <th className="px-4 py-3">Box Quantity</th>
              <th className="px-4 py-3">Open Pieces</th>
              <th className="px-4 py-3">Total Quantity</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedAdjustments.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-6 text-gray-500">
                  {loading ? "Loading..." : CONFIG.MESSAGES.NO_DATA}
                </td>
              </tr>
            ) : (
              paginatedAdjustments.map((adj) => (
                <tr
                  key={adj._id}
                  className="hover:bg-gray-50 transition-colors duration-150"
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(adj._id)}
                      onChange={() => handleSelect(adj._id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {adj.productName}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{adj.boxQuantity}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {adj.quantityPerCarton}
                  </td>
                  <td
                    className={`px-4 py-3 font-medium ${getQuantityColor(
                      adj.totalQuantity
                    )}`}
                  >
                    {getQuantityDisplay(adj.totalQuantity)}
                  </td>
                  <td className="px-4 py-3 capitalize">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        adj.adjustmentType === "add"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {adj.adjustmentType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {adj.notes || "-"}
                  </td>
                  <td className="px-4 py-3 flex gap-3">
                    <button
                      className="text-indigo-600 hover:text-indigo-800 transition-colors duration-200"
                      onClick={() => handleEdit(adj)}
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(adj._id)}
                      className="text-red-600 hover:text-red-800 transition-colors duration-200"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              Previous
            </button>

            <div className="flex space-x-2">
              {Array.from({ length: totalPages }, (_, index) => (
                <button
                  key={index + 1}
                  onClick={() => setCurrentPage(index + 1)}
                  className={`px-3 py-1 rounded transition-colors duration-200 ${
                    currentPage === index + 1
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
            >
              Next
            </button>
          </div>
        )}
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
                  {/* Left Column */}
                  <div className="space-y-4">
                    {/* Product Selection */}
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
                        This value is automatically set from the selected product
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

                {/* Buttons - Full width at bottom */}
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