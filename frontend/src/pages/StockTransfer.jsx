import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import ReactDOM from "react-dom";
import {
  Plus,
  Trash2,
  Search,
  Eye,
  Edit,
  X,
  Package,
  Users,
  Truck,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getVisiblePages } from "../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../utils/dateUtil.js";
import CustomDropdown from "./Utility/customDropdown.jsx";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import { confirmDialog } from "../utils/confirmationDialog.js";

const ITEMS_PER_PAGE = 9, backendUrl = import.meta.env.VITE_BACKEND_URL;

const StockTransfer = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("general");
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [generalTransfers, setGeneralTransfers] = useState([]);
  const [mrTransfers, setMrTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  // Modal states
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const inputRef = useRef(null);

  // Form state - separate for general and mr
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
    // For general transfers
    source: "",
    destination: "",
    // For MR transfers
    mrName: "",
    mrId: "",
  });

  // Helper function to format numbers to 2 decimal places
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "0.00";
    const num = parseFloat(value);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  // Helper function to calculate total cost from items
  const calculateTotalTransferCost = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    const total = items.reduce((sum, item) => {
      const itemCost =
        item.productCost || (item.lc || 0) * (item.boxQuantity || 0);
      return sum + parseFloat(itemCost);
    }, 0);
    return parseFloat(total.toFixed(2));
  };

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

  // Fetch General Stock Transfers
  const fetchGeneralTransfers = useCallback(async () => {
    if (activeTab !== "general") return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/stock-transfers`);
      if (!response.ok) {
        throw new Error("Failed to fetch general transfers");
      }
      const data = await response.json();
      setGeneralTransfers(data.data || data || []);
    } catch (err) {
      setError(err.message || "Error fetching general transfers");
      showToast("error", err.message || "Failed to fetch general transfers");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Fetch MR Stock Transfers
  const fetchMRTransfers = useCallback(async () => {
    if (activeTab !== "mr") return;

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${backendUrl}/api/stock-transfers-to-mr`);
      if (!response.ok) {
        throw new Error("Failed to fetch MR transfers");
      }
      const data = await response.json();
      // Ensure all transfers have calculated totals if missing
      const updatedData = data.map((transfer) => {
        if (!transfer.totalTransferCost || transfer.totalTransferCost === 0) {
          return {
            ...transfer,
            totalTransferCost: calculateTotalTransferCost(transfer.items),
          };
        }
        return transfer;
      });
      setMrTransfers(updatedData || []);
    } catch (err) {
      setError(err.message || "Error fetching MR transfers");
      showToast("error", err.message || "Failed to fetch MR transfers");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Fetch data based on active tab
  useEffect(() => {
    if (activeTab === "general") {
      fetchGeneralTransfers();
    } else if (activeTab === "mr") {
      fetchMRTransfers();
    }
  }, [activeTab, fetchGeneralTransfers, fetchMRTransfers]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Handle deleting item from form
  const handleDeleteItem = (index) => {
    if (window.confirm("Are you sure you want to remove this item?")) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  // Handle form field changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleViewProducts = (transfer) => {
    // Calculate product cost for each item if not present
    const productsWithCost = transfer.items.map((item) => ({
      ...item,
      productCost: item.productCost || (item.lc || 0) * (item.boxQuantity || 0),
    }));
    setSelectedProducts(productsWithCost || []);
    setIsProductModalOpen(true);
  };

  // Numeric input handler
  const handleNumericInputChange = (e, onChangeFunc) => {
    const { name, value } = e.target;
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

  // Update transfer based on type
  const handleUpdateTransfer = async (e, formData) => {
    e.preventDefault();
    try {
      let url;
      let requestData = { ...formData };

      if (activeTab === "general") {
        url = `${backendUrl}/api/stock-transfers/${formData._id}`;
        // Remove MR fields from general transfer data
        delete requestData.mrName;
        delete requestData.mrId;
      } else {
        url = `${backendUrl}/api/stock-transfers-to-mr/${formData._id}`;
        // Remove general transfer fields from MR data
        delete requestData.transferType;
        delete requestData.source;
        delete requestData.destination;
      }

      // Transform items data with calculated costs
      requestData.items = formData.items.map((item) => {
        const itemData = {
          productId: item.productId || item.product?.value,
          productName: item.productName || item.product?.label,
          boxQuantity: parseInt(item.boxQuantity) || 0,
          openPieces: parseInt(item.openPieces) || 0,
          qtyPerCarton: parseInt(item.qtyPerCarton) || 0,
          totalPieces: parseInt(item.totalPieces) || 0,
          expenses: parseFloat(item.expenses) || 0,
        };

        // If we have lc, calculate productCost
        if (item.lc) {
          itemData.lc = parseFloat(item.lc);
          itemData.productCost = parseFloat(
            (item.lc * (item.boxQuantity || 0)).toFixed(2)
          );
        }

        return itemData;
      });

      // Calculate total transfer cost
      requestData.totalTransferCost = calculateTotalTransferCost(
        requestData.items
      );

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update transfer");
      }

      // Refresh data based on active tab
      if (activeTab === "general") {
        await fetchGeneralTransfers();
      } else {
        await fetchMRTransfers();
      }

      setIsEditModalOpen(false);
      showToast("success", "Transfer updated successfully");
    } catch (err) {
      showToast("error", `Error updating transfer: ${err.message}`);
    }
  };

  // Get current data based on active tab
  const getCurrentData = () => {
    return activeTab === "general" ? generalTransfers : mrTransfers;
  };

  // Filter data based on search term
  const filteredTransfers = useMemo(() => {
    const data = getCurrentData();
    const lowerSearch = searchTerm.trim().toLowerCase();

    if (!lowerSearch) return data;

    return data.filter((transfer) => {
      // Common search fields
      const matchesInvoice = transfer.invoiceNo
        ?.toLowerCase()
        .includes(lowerSearch);
      const matchesRemarks = transfer.remarks
        ?.toLowerCase()
        .includes(lowerSearch);

      if (activeTab === "general") {
        const matchesSourceDest =
          (transfer.transferType === "send"
            ? transfer.destination?.toLowerCase().includes(lowerSearch)
            : transfer.source?.toLowerCase().includes(lowerSearch)) ?? false;

        return matchesInvoice || matchesRemarks || matchesSourceDest;
      } else {
        const matchesMRName = transfer.mrName
          ?.toLowerCase()
          .includes(lowerSearch);
        return matchesInvoice || matchesRemarks || matchesMRName;
      }
    });
  }, [activeTab, getCurrentData, searchTerm]);

  const currentTransfers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTransfers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTransfers, currentPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE);
  }, [filteredTransfers]);

  const visiblePages = useMemo(() => {
    return getVisiblePages(currentPage, totalPages);
  }, [currentPage, totalPages]);

  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Handle adding new item to form
  const handleAddNewItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          product: "",
          productName: "",
          boxQuantity: 0,
          openPieces: 0,
          qtyPerCarton: 0,
          totalPieces: 0,
          expenses: 0,
          lc: 0,
          productCost: 0,
          _id: `new-${Date.now()}`,
        },
      ],
    }));
  };

  // Handle product selection from dropdown
  const handleItemProductChange = (index, productValue) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      const selectedProduct = productOptions.find(
        (opt) => opt.value === productValue
      );

      updatedItems[index] = {
        ...updatedItems[index],
        product: {
          value: productValue,
          label: selectedProduct?.label || productValue,
          qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
        },
        productName: selectedProduct?.label || productValue,
        qtyPerCarton: selectedProduct?.qtyPerCarton || 0,
      };

      // Auto-calculate totalPieces
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

  // Handle item field changes
  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[index] = {
        ...updatedItems[index],
        [field]: value,
      };

      // Auto-calculate totalPieces
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

      // If boxQuantity or lc changes, recalculate productCost
      if (field === "boxQuantity" || field === "lc") {
        const lc = updatedItems[index].lc || 0;
        const boxQty = updatedItems[index].boxQuantity || 0;
        updatedItems[index].productCost = parseFloat((lc * boxQty).toFixed(2));
      }

      return {
        ...prev,
        items: updatedItems,
      };
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedRows(currentTransfers.map((row) => row._id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleDelete = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selectedRows.length}</b> ${
        activeTab === "general" ? "General Transfers" : "MR Transfers"
      }`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        await Promise.all(
          selectedRows.map((id) => {
            const url =
              activeTab === "general"
                ? `${backendUrl}/api/stock-transfers/${id}`
                : `${backendUrl}/api/stock-transfers-to-mr/${id}`;
            return fetch(url, {
              method: "DELETE",
            });
          })
        );

        // Refresh data
        if (activeTab === "general") {
          await fetchGeneralTransfers();
        } else {
          await fetchMRTransfers();
        }

        setSelectedRows([]);
        showToast("success", "Selected items deleted");
      } catch (err) {
        showToast("error", err.message || "Error deleting items");
      }
    }
  };

  const handleDeleteSingle = async (transferData) => {
    if (!transferData._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete ${
        activeTab === "general" ? "stock transfer" : "MR transfer"
      } <b>${transferData.invoiceNo}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const url =
          activeTab === "general"
            ? `${backendUrl}/api/stock-transfers/${transferData._id}`
            : `${backendUrl}/api/stock-transfers-to-mr/${transferData._id}`;

        const res = await axios.delete(url);
        if (res.status === 200) {
          showToast(
            "success",
            `${activeTab === "general" ? "Stock Transfer" : "MR Transfer"} <b>${
              transferData.invoiceNo
            }</b> deleted successfully`
          );

          // Refresh data
          if (activeTab === "general") {
            await fetchGeneralTransfers();
          } else {
            await fetchMRTransfers();
          }
        }
      } catch (error) {
        showToast(
          "error",
          `Failed to delete ${
            activeTab === "general" ? "stock transfer" : "MR transfer"
          }.`
        );
      }
    }
  };

  const handleView = (transfer) => {
    setForm({ ...transfer });
    setIsViewModalOpen(true);
  };

  const handleEdit = (transfer) => {
    setForm({ ...transfer });
    setIsEditModalOpen(true);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedRows([]);
    setCurrentPage(1);
    setSearchTerm("");
  };

  const handleNavigateToForm = () => {
    navigate("/stocktransferform");
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
            onClick={handleNavigateToForm}
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

      {/* Tabs and Search Section */}
      <div className="flex flex-row justify-between items-center gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => handleTabChange("general")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "general"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Truck size={18} /> General Transfer
          </button>
          <button
            onClick={() => handleTabChange("mr")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === "mr"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            <Users size={18} /> Stock Transfered To MR
          </button>
        </div>

        <div className="flex items-center gap-4">
          {/* Total Count */}
          <div className="flex items-center">
            <p className="text-base font-semibold text-gray-700 whitespace-nowrap">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                {filteredTransfers.length}
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
              placeholder={
                activeTab === "general"
                  ? "Search by Invoice, Remarks, Source/Destination"
                  : "Search by Invoice, Remarks, MR Name"
              }
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

      {/* Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentTransfers.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={
                        selectedRows.length === currentTransfers.length &&
                        currentTransfers.length > 0
                      }
                      onChange={handleSelectAll}
                    />
                  )}
                  <span>Transfer No</span>
                </div>
              </th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                {activeTab === "general" ? "Source/Destination" : "MR Name"}
              </th>
              <th className="p-3 min-w-[100px] text-sm font-medium">Type</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Date</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                Total Cost ($)
              </th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                # Products
              </th>
              <th className="p-3 min-w-[150px] text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentTransfers.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">
                  {searchTerm
                    ? "No matching records found"
                    : "No data available"}
                </td>
              </tr>
            ) : (
              currentTransfers.map((item, index) => {
                const productCount = Array.isArray(item.items)
                  ? item.items.length
                  : 0;

                // Calculate total from items to ensure consistency
                const calculatedTotal = calculateTotalTransferCost(item.items);
                const displayTotal = item.totalTransferCost || calculatedTotal;

                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % ITEMS_PER_PAGE === 0 ||
                      index + 1 === currentTransfers.length
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
                      {activeTab === "general"
                        ? item.transferType === "send"
                          ? item.destination || "Main Warehouse"
                          : item.source || "Main Warehouse"
                        : item.stockTransferToMr || "-"}
                    </td>
                    <td className="p-3 min-w-[100px]">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.transferType === "send"
                            ? "bg-green-100 text-green-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {item.transferType === "send" ? "Send" : "Receive"}
                      </span>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {formatDateToReadable(item.date)}
                    </td>
                    <td className="p-3 min-w-[120px]">
                      ${formatCurrency(displayTotal)}
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div className="flex items-center justify-center gap-3">
                        {productCount}{" "}
                        <button
                          className="text-purple-600 hover:text-purple-800 cursor-pointer"
                          onClick={() => handleViewProducts(item)}
                          title="View Products"
                        >
                          <Package size={18} />
                        </button>
                      </div>
                    </td>
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

        {currentTransfers.length > 0 && (
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

      {/* View Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />

            <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                {/* Transfer No */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Transfer No
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.invoiceNo || "-"}
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? new Date(form.date).toLocaleDateString() : "-"}
                  </p>
                </div>

                {/* Type-specific fields */}
                {activeTab === "general" ? (
                  <>
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
                        {form.transferType === "send"
                          ? "Destination"
                          : "Source"}
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {form.transferType === "send"
                          ? form.destination || "-"
                          : form.source || "-"}
                      </p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                      {form.stockTransferToMr || "-"}
                    </p>
                  </div>
                )}

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.status || "-"}
                  </p>
                </div>

                {/* Shipping */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Shipping ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${formatCurrency(form.shipping)}
                  </p>
                </div>

                {/* Total Expenses */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Expenses ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${formatCurrency(form.totalExpenses)}
                  </p>
                </div>

                {/* Grand Total */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Grand Total ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${formatCurrency(form.grandTotal)}
                  </p>
                </div>

                {/* Calculated Total Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Total ($)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    ${formatCurrency(calculateTotalTransferCost(form.items))}
                  </p>
                </div>

                {/* Remarks */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remarks || "-"}
                  </p>
                </div>

                {/* Notes */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-600">
                    Notes
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.notes || "-"}
                  </p>
                </div>

                {/* Items Section */}
                <div className="md:col-span-3">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">
                    Products
                  </h3>
                  <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                    {form.items && form.items.length > 0 ? (
                      form.items.map((item, index) => {
                        const productCost =
                          item.productCost ||
                          (item.lc || 0) * (item.boxQuantity || 0);
                        return (
                          <div
                            key={item._id || index}
                            className="border-b pb-4 last:border-b-0"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                                  LC ($)
                                </label>
                                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                  ${formatCurrency(item.lc)}
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-600">
                                  Product Cost ($)
                                </label>
                                <p className="border px-3 py-2 rounded-lg bg-gray-100">
                                  ${formatCurrency(productCost)}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })
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

      {/* Edit Modal - Similar structure with form fields */}
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
                Edit{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
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

                {/* Conditional fields based on activeTab */}
                {activeTab === "general" ? (
                  <>
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
                    {form.transferType === "send" ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Destination
                        </label>
                        <input
                          type="text"
                          name="destination"
                          value={form.destination || ""}
                          onChange={handleChange}
                          className="w-full border px-3 py-2 rounded-lg capitalize"
                          autoComplete="off"
                          placeholder="Enter destination"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Source
                        </label>
                        <input
                          type="text"
                          name="source"
                          value={form.source || ""}
                          onChange={handleChange}
                          className="w-full border px-3 py-2 rounded-lg capitalize"
                          autoComplete="off"
                          placeholder="Enter source"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      MR Name
                    </label>
                    <input
                      type="text"
                      name="mrName"
                      value={form.stockTransferToMr || ""}
                      onChange={handleChange}
                      className="w-full border px-3 py-2 rounded-lg capitalize"
                      autoComplete="off"
                      placeholder="Enter MR name"
                    />
                  </div>
                )}

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
                      form.items.map((item, index) => {
                        console.log("item", item);
                        const productCost =
                          item.productCost ||
                          (item.lc || 0) * (item.boxQuantity || 0);
                        return (
                          <div
                            key={item._id || index}
                            className="border-b pb-4 last:border-b-0"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                              <div className="md:col-span-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Product{" "}
                                  <span className="text-red-500">*</span>
                                </label>
                                {item._id && item._id.startsWith("new-") ? (
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

                              <div>
                                <label className="block text-sm font-medium text-gray-700">
                                  LC ($)
                                </label>
                                <input
                                  type="text"
                                  value={item.lc || 0}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "lc",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-full border px-3 py-2 rounded-lg"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700">
                                  Product Cost ($)
                                </label>
                                <input
                                  type="text"
                                  value={formatCurrency(productCost)}
                                  readOnly
                                  className="w-full border px-3 py-2 rounded-lg bg-gray-100"
                                />
                              </div>
                            </div>

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
                        );
                      })
                    ) : (
                      <p className="text-gray-500 text-center">No items</p>
                    )}
                  </div>

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
                    onClick={(e) => handleUpdateTransfer(e, form)}
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Product Modal */}
      {isProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsProductModalOpen(false)}
            />

            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-lg relative flex flex-col border border-gray-200">
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold text-gray-800">
                  Product Details
                </h2>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                  <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                    <thead className="bg-gray-100 text-gray-700 border-b">
                      <tr>
                        <th className="p-3 min-w-[200px] text-sm font-medium">
                          Product Name
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          Box Quantity
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          LC ($)
                        </th>
                        <th className="p-3 min-w-[120px] text-sm font-medium">
                          Product Cost ($)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts.length > 0 ? (
                        selectedProducts.map((product, index) => {
                          console.log('product', product);
                          const productCost =
                            product.itemCost ||
                            (product.lc || 0) * (product.boxQuantity || 0);

                          return (
                            <tr
                              key={product._id || index}
                              className={`hover:bg-gray-50 ${
                                (index + 1) % ITEMS_PER_PAGE === 0 ||
                                index + 1 === selectedProducts.length
                                  ? ""
                                  : "border-b"
                              }`}
                            >
                              <td className="p-3 min-w-[200px] capitalize">
                                {product.productName || "-"}
                              </td>
                              <td className="p-3 min-w-[120px]">
                                {product.boxQuantity || 0}
                              </td>
                              <td className="p-3 min-w-[120px]">
                                ${formatCurrency(product.lc)}
                              </td>
                              <td className="p-3 min-w-[120px]">
                                ${formatCurrency(productCost)}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={4}
                            className="p-4 text-center text-gray-500"
                          >
                            No products found
                          </td>
                        </tr>
                      )}
                      {selectedProducts.length > 0 && (
                        <tr className="bg-gray-50 font-semibold">
                          <td
                            className="p-3 min-w-[200px] text-right"
                            colSpan={3}
                          >
                            Total:
                          </td>
                          <td className="p-3 min-w-[120px]">
                            $
                            {formatCurrency(
                              selectedProducts.reduce((sum, product) => {
                                const cost =
                                  product.itemCost ||
                                  (product.lc || 0) *
                                    (product.boxQuantity || 0);
                                return sum + cost;
                              }, 0)
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end p-6 border-t">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-6 py-2 rounded-lg cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default StockTransfer;