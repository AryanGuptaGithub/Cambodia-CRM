import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import { Plus, Trash2, Search, Eye, Edit, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getVisiblePages } from "../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../utils/dateUtil.js";
import CustomDropdown from "./Utility/customDropdown.jsx";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import { confirmDialog } from "../utils/confirmationDialog.js";

const ITEMS_PER_PAGE = 9;
const backendUrl = import.meta.env.VITE_BACKEND_URL;

const StockTransfer = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("send");
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [stockTransferData, setStockTransferData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Modal states
  const [isOpen, setIsOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const inputRef = useRef(null);

  // Form state
  const [form, setForm] = useState({
    invoiceNo: "",
    date: "",
    items: [],
    remarks: "",
    notes: "",
    status: "",
    transferType: "send",
    shipping: 0,
    totalExpenses: 0,
    grandTotal: 0,
  });

  const productOptions = useMemo(
    () => [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: product.productName,
        qtyPerCarton: product.qtyPerCarton,
      })),
    ],
    [products]
  );

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products`);
      setProducts(response.data);
    } catch (err) {
      console.error("Error fetching products:", err);
      showToast("error", "Failed to fetch products");
    }
  }, []);

  // Fetch stock transfers
  const fetchStockTransfers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/stock-transfers`);
      if (!response.ok) {
        throw new Error("Failed to fetch stock transfers");
      }
      const data = await response.json();
      setStockTransferData(data.data || []);
    } catch (err) {
      setError(err.message || "Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStockTransfers();
  }, [activeTab]);
  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handle deleting item
  const handleDeleteItem = (index) => {
    if (window.confirm("Are you sure you want to remove this item?")) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  // Enhanced handleChange for main form fields
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Enhanced numeric input handler
  const handleNumericInputChange = (e, onChangeFunc) => {
    const { name, value } = e.target;
    // Allow only numbers and decimal points
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      const syntheticEvent = {
        target: {
          name,
          value:
            value === ""
              ? ""
              : name === "shipping" ||
                name === "totalExpenses" ||
                name === "grandTotal"
              ? parseFloat(value) || 0
              : value,
        },
      };
      onChangeFunc(syntheticEvent);
    }
  };

  const handleUpdateStockTransfer = async (e, formData) => {
    e.preventDefault();
    try {
      // Transform the data before sending to match backend schema
      const transformedData = {
        ...formData,
        items: formData.items.map((item) => {
          // For new items with CustomDropdown
          if (item._id && item._id.startsWith("new-") && item.product) {
            return {
              productId: item.product.value, // Use the product ID from dropdown
              productName: item.product.label, // Use the product name from dropdown
              boxQuantity: parseInt(item.boxQuantity) || 0,
              openPieces: parseInt(item.openPieces) || 0,
              qtyPerCarton: parseInt(item.qtyPerCarton) || 0,
              totalPieces: parseInt(item.totalPieces) || 0,
              expenses: parseFloat(item.expenses) || 0,
            };
          }

          // For existing items
          return {
            productId: item.productId, // Keep existing productId
            productName: item.productName, // Keep existing productName
            boxQuantity: parseInt(item.boxQuantity) || 0,
            openPieces: parseInt(item.openPieces) || 0,
            qtyPerCarton: parseInt(item.qtyPerCarton) || 0,
            totalPieces: parseInt(item.totalPieces) || 0,
            expenses: parseFloat(item.expenses) || 0,
          };
        }),
      };

      const response = await fetch(
        `${backendUrl}/api/stock-transfers/${formData._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(transformedData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update stock transfer");
      }

      await fetchStockTransfers();
      setIsEditModalOpen(false);
      showToast("success", "Stock transfer updated successfully");
    } catch (err) {
      showToast("error", `Error updating stock transfer: ${err.message}`);
    }
  };

  // Filter by tab and search
  const filteredStockTransfers = useMemo(() => {
    const lowerSearch = searchTerm.trim().toLowerCase();
    return stockTransferData.filter((st) => {
      const matchesTab = st.transferType === activeTab;
      const matchesSearch =
        st.invoiceNo?.toLowerCase().includes(lowerSearch) ||
        (st.remarks?.toLowerCase().includes(lowerSearch) ?? false);
      return matchesTab && (!lowerSearch || matchesSearch);
    });
  }, [stockTransferData, activeTab, searchTerm]);

  const currentStockTransfers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredStockTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredStockTransfers, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredStockTransfers.length / ITEMS_PER_PAGE);
  }, [filteredStockTransfers]);

  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };
  // Add these handler functions to your component

  // Handle adding new item - now with CustomDropdown
  const handleAddNewItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product: "", // For CustomDropdown
          productName: "", // For existing items
          boxQuantity: 0,
          openPieces: 0,
          qtyPerCarton: 0,
          totalPieces: 0,
          expenses: 0,
          _id: `new-${Date.now()}`, // Mark as new item
        },
      ],
    }));
  };

  // Handle product selection from CustomDropdown for new items
  const handleItemProductChange = (index, productValue) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      const selectedProduct = productOptions.find(
        (opt) => opt.value === productValue
      );

      updatedItems[index] = {
        ...updatedItems[index],
        product: {
          value: productValue, // Store the product ID
          label: selectedProduct?.label || productValue, // Store the product name
          qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        },
        productName: selectedProduct?.label || productValue,
        qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
      };

      // Auto-calculate totalPieces when product is selected
      const boxQuantity = updatedItems[index].boxQuantity || 0;
      const openPieces = updatedItems[index].openPieces || 0;
      const qtyPerCarton = selectedProduct?.qtyPerCarton || 0;

      updatedItems[index].totalPieces =
        parseInt(boxQuantity) * parseInt(qtyPerCarton) + parseInt(openPieces);

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };
  // Enhanced handleItemChange with auto-calculation
  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value,
      };

      // Auto-calculate totalPieces if boxQuantity, openPieces, or qtyPerCarton changes
      if (
        field === "boxQuantity" ||
        field === "openPieces" ||
        field === "qtyPerCarton"
      ) {
        const boxQuantity =
          field === "boxQuantity"
            ? value
            : updatedItems[index].boxQuantity || 0;
        const openPieces =
          field === "openPieces" ? value : updatedItems[index].openPieces || 0;
        const qtyPerCarton =
          field === "qtyPerCarton"
            ? value
            : updatedItems[index].qtyPerCarton || 0;

        updatedItems[index].totalPieces =
          parseInt(boxQuantity) * parseInt(qtyPerCarton) + parseInt(openPieces);
      }

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(currentStockTransfers.map((row) => row._id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleDelete = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selectedRows.length}</b> Stock Transfers`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selectedRows,
    });

    if (confirm.isConfirmed) {
      try {
        await Promise.all(
          selectedRows.map((id) =>
            fetch(`${backendUrl}/api/stock-transfers/${id}`, {
              method: "DELETE",
            })
          )
        );
        await fetchStockTransfers();
        setSelectedRows([]);
        showToast("success", "Selected items deleted");
      } catch (err) {
        showToast("error", error.message || "Error deleting items");
      }
    }
  };

  const handleDeleteSingle = async (stockTransferData) => {
    if (!stockTransferData._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete stock trannsers <b>${stockTransferData.invoiceNo}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/stock-transfers/${stockTransferData._id}`
        );
        if (res.status === 200) {
          showToast(
            "success",
            `Stock Transfer <b>${stockTransferData.invoiceNo}</b> deleted successfully`
          );
          await fetchStockTransfers();
        }
      } catch (error) {
        showToast("error", "Failed to delete stock transfer.");
      }
    }
  };

  const handleView = (stockTransfer) => {
    setForm({ ...stockTransfer });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const handleEdit = (stockTransfer) => {
    setForm({ ...stockTransfer });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRows([]);
    setCurrentPage(1);
    setSearchTerm("");
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Stock Transfer
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

      {/* Header / Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/stocktransferform")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Plus size={18} /> Add New Stock Transfer
          </button>
          {selectedRows.length > 0 && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Trash2 size={18} /> Delete Selected ({selectedRows.length})
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-row justify-between items-center gap-4 mb-6">
        {/* Tabs Section */}
        <div className="flex gap-3">
          {["send", "receive"].map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-5 py-2 rounded-lg capitalize font-medium transition-colors cursor-pointer ${
                activeTab === tab
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Right Section - Total Count and Search */}
        <div className="flex items-center gap-4">
          {/* Total Count */}
          <div className="flex items-center">
            <p className="text-base font-semibold text-gray-700 whitespace-nowrap">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                {filteredStockTransfers.length}
              </span>
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-60">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={() => inputRef.current?.focus()}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search by Invoice or Remarks"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentStockTransfers.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        selectedRows.length === currentStockTransfers.length &&
                        currentStockTransfers.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  )}
                  <span>Transfer No</span>
                </div>
              </th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Date</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Grand Total ($)</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Total Expenses ($)</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Shipping ($)</th>
              <th className="p-3 min-w-[120px] text-sm font-medium"># Products</th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentStockTransfers.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  {searchTerm
                    ? "No matching records found"
                    : "No data available"}
                </td>
              </tr>
            ) : (
              currentStockTransfers.map((item, index) => {
                const productCount = Array.isArray(item.items)
                  ? item.items.length
                  : 0;

                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % ITEMS_PER_PAGE === 0 ||
                      index + 1 === currentStockTransfers.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3 min-w-[120px]">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item._id)}
                          onChange={() => handleSelectRow(item._id)}
                        />
                        <span className="capitalize">{item.invoiceNo}</span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {formatDateToReadable(item.date)}
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {item.grandTotal ?? 0}
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {item.totalExpenses ?? 0}
                    </td>
                    <td className="p-3 min-w-[120px]">{item.shipping ?? 0}</td>
                    <td className="p-3 min-w-[120px]">{productCount}</td>
                    <td className="p-3 min-w-[150px]">
                      <div className="flex items-center justify-center gap-3">
                        <button
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => handleView(item)}
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          onClick={() => handleEdit(item)}
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          onClick={() => handleDeleteSingle(item)}
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

        {currentStockTransfers.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Prev
            </button>
            <div className="flex gap-1">
              {visiblePages.map((pg) => (
                <button
                  key={pg}
                  onClick={() => setCurrentPage(pg)}
                  className={`px-3 py-2 rounded-lg min-w-[40px] cursor-pointer ${
                    currentPage === pg
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {pg}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Stock Transfer
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                {/* Main Information - 3 columns */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Transfer No
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.invoiceNo || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? new Date(form.date).toLocaleDateString() : "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Transfer Type
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.transferType || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.status || "-"}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Shipping ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.shipping ?? 0}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Expenses ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalExpenses ?? 0}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Grand Total ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.grandTotal ?? 0}
                  </p>
                </div>

                {/* Remarks - Full width */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remarks || "-"}
                  </p>
                </div>

                {/* Notes - Full width */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-600">
                    Notes
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.notes || "-"}
                  </p>
                </div>

                {/* Items Section - Full width */}
                <div className="md:col-span-3">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Products
                  </h3>
                  <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                    {form.items && form.items.length > 0 ? (
                      form.items.map((item, index) => (
                        <div
                          key={item._id || index}
                          className="border-b pb-4 last:border-b-0"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Product Name
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.productName || "-"}
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Box Quantity
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.boxQuantity || 0}
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Open Pieces
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.openPieces || 0}
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Quantity Per Carton
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.qtyPerCarton || 0}
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Total Pieces
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.totalPieces || 0}
                              </p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-600">
                                Expenses
                              </label>
                              <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                {item.expenses || 0}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center">No items</p>
                    )}
                  </div>
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
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Stock Transfer
              </h2>

              <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                {/* Invoice Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Transfer No
                  </label>
                  <input
                    type="text"
                    name="invoiceNo"
                    value={form.invoiceNo || ""}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    autoComplete="off"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Date
                  </label>
                  <input
                    type="date"
                    name="date"
                    value={form.date ? form.date.split("T")[0] : ""}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Transfer Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Transfer Type
                  </label>
                  <select
                    name="transferType"
                    value={form.transferType || "send"}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  >
                    <option value="send">Send</option>
                    <option value="receive">Receive</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    name="status"
                    value={form.status || ""}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg"
                  >
                    <option value="">Select Status</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Shipping */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Shipping ($)
                  </label>
                  <input
                    type="text"
                    name="shipping"
                    value={form.shipping || 0}
                    onChange={(e) => handleNumericInputChange(e, handleChange)}
                    className="w-full border px-3 py-2 rounded-lg"
                    autoComplete="off"
                  />
                </div>

                {/* Total Expenses */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Total Expenses ($)
                  </label>
                  <input
                    type="text"
                    name="totalExpenses"
                    value={form.totalExpenses || 0}
                    onChange={(e) => handleNumericInputChange(e, handleChange)}
                    className="w-full border px-3 py-2 rounded-lg"
                    autoComplete="off"
                  />
                </div>

                {/* Grand Total */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Grand Total ($)
                  </label>
                  <input
                    type="text"
                    name="grandTotal"
                    value={form.grandTotal || 0}
                    onChange={(e) => handleNumericInputChange(e, handleChange)}
                    className="w-full border px-3 py-2 rounded-lg"
                    autoComplete="off"
                  />
                </div>

                {/* Remarks */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Remarks
                  </label>
                  <input
                    type="text"
                    name="remarks"
                    value={form.remarks || ""}
                    onChange={handleChange}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    autoComplete="off"
                  />
                </div>

                {/* Notes */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <textarea
                    name="notes"
                    value={form.notes || ""}
                    onChange={handleChange}
                    rows={3}
                    className="w-full border px-3 py-2 rounded-lg capitalize resize-none"
                    autoComplete="off"
                  />
                </div>

                {/* Items Section */}
                <div className="md:col-span-3">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Products
                  </h3>
                  <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                    {form.items && form.items.length > 0 ? (
                      form.items.map((item, index) => (
                        <div
                          key={item._id || index}
                          className="border-b pb-4 last:border-b-0"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Product Name - Show CustomDropdown for new items, input for existing */}
                            <div className="md:col-span-3">
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Product <span className="text-red-500">*</span>
                              </label>
                              {item._id && item._id.startsWith("new-") ? (
                                // Show CustomDropdown for new items
                                <CustomDropdown
                                  value={item.product || ""}
                                  onChange={(value) =>
                                    handleItemProductChange(index, value)
                                  }
                                  placeholder="Select Product"
                                  options={productOptions}
                                  required
                                />
                              ) : (
                                // Show text input for existing items
                                <input
                                  type="text"
                                  value={item.productName || ""}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "productName",
                                      e.target.value
                                    )
                                  }
                                  className="w-full border px-3 py-2 rounded-lg"
                                  placeholder="Enter product name"
                                />
                              )}
                            </div>

                            {/* Box Quantity */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Box Quantity
                              </label>
                              <input
                                type="text"
                                value={item.boxQuantity || 0}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "boxQuantity",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full border px-3 py-2 rounded-lg"
                              />
                            </div>

                            {/* Open Pieces */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Open Pieces
                              </label>
                              <input
                                type="text"
                                value={item.openPieces || 0}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "openPieces",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full border px-3 py-2 rounded-lg"
                              />
                            </div>

                            {/* Quantity Per Carton */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Quantity Per Carton
                              </label>
                              <input
                                type="text"
                                value={item.qtyPerCarton || 0}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "qtyPerCarton",
                                    parseInt(e.target.value) || 0
                                  )
                                }
                                className="w-full border px-3 py-2 rounded-lg bg-gray-100"
                                readOnly
                                disabled
                              />
                            </div>

                            {/* Total Pieces */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Total Pieces
                              </label>
                              <input
                                type="text"
                                value={item.totalPieces || 0}
                                className="w-full border px-3 py-2 rounded-lg bg-gray-100"
                                readOnly
                                disabled
                              />
                            </div>

                            {/* Expenses */}
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Expenses ($)
                              </label>
                              <input
                                type="text"
                                value={item.expenses || 0}
                                onChange={(e) =>
                                  handleItemChange(
                                    index,
                                    "expenses",
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full border px-3 py-2 rounded-lg"
                              />
                            </div>
                          </div>

                          {/* Delete Item Button */}
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(index)}
                              className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={16} />
                              Remove Item
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-center">No items</p>
                    )}
                  </div>

                  {/* Add New Item Button */}
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={handleAddNewItem}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                    >
                      <Plus size={16} />
                      Add New Product
                    </button>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="md:col-span-3 mt-4 flex justify-end gap-3">
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
                    onClick={(e) => handleUpdateStockTransfer(e, form)}
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default StockTransfer;
