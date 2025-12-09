import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Plus,
  Trash2,
  Eye,
  X,
  Search,
  Package,
  CheckCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const returnsPerPage = 9;

// Create Stock Return Component
const CreateStockReturn = ({ onClose, onSuccess, mrList }) => {
  const [selectedMr, setSelectedMr] = useState("");
  const [mrStock, setMrStock] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [returnQty, setReturnQty] = useState(1);
  const [returnDate, setReturnDate] = useState(new Date());
  const [returnItems, setReturnItems] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch MR stock when MR is selected
  const fetchMrStock = useCallback(
    async (mrName) => {
      try {
        setLoading(true);
        setMrStock([]);
        setSelectedProduct(null);

        // Find MR to get correct name
        const selectedMrObj = mrList.find(
          (mr) => mr.mrName === mrName || mr.mrCode === mrName
        );

        if (!selectedMrObj) {
          toast.error("Selected MR not found");
          return;
        }

        const actualMrName = selectedMrObj.mrName;

        const response = await axios.get(
          `${backendUrl}/api/mr-stock/${actualMrName}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        if (response.data.success) {
          const transformedData = transformStockData(response.data.data);
          setMrStock(transformedData);
        } else {
          toast.error(response.data.message || "Failed to load MR stock");
          setMrStock([]);
        }
      } catch (error) {
        toast.error(error.response?.data?.message || "Failed to load MR stock");
        setMrStock([]);
      } finally {
        setLoading(false);
      }
    },
    [mrList]
  );

  // Transform stock data from API
  const transformStockData = (apiData) => {
    if (!apiData || !Array.isArray(apiData)) return [];

    return apiData.map((item) => ({
      stockRecordId: item._id || item.productId,
      productId: item.productId || item._id,
      productCode: item.productCode || "N/A",
      productName: item.productName || "Unknown Product",
      batch: item.batch || "N/A",
      expiry: item.expiry || item.expiryDate || "N/A",
      remainingQty: item.remainingQty || item.assignedQty || 0,
      costPrice: item.costPrice || 0,
      unit: item.unit,
      assignedDate: item.assignedDate,
    }));
  };

  // Handle MR selection
  const handleMrChange = (value) => {
    setSelectedMr(value);
    setSelectedProduct(null);
    setMrStock([]);
    setReturnItems([]);
    if (value) fetchMrStock(value);
  };

  // Handle product selection
  const handleProductChange = (value) => {
    if (!value) {
      setSelectedProduct(null);
      return;
    }

    const product = mrStock.find((p) => p.stockRecordId === value);
    setSelectedProduct(product);
    setReturnQty(1);
  };

  // Add item to return list
  const handleAddItem = () => {
    if (!selectedProduct) {
      toast.error("Select a product");
      return;
    }

    if (returnQty < 1 || returnQty > selectedProduct.remainingQty) {
      toast.error(
        `Invalid quantity. Available: ${selectedProduct.remainingQty}`
      );
      return;
    }

    if (!returnDate) {
      toast.error("Select return date");
      return;
    }

    // Check if product already exists in return items
    const existingItemIndex = returnItems.findIndex(
      (item) => item.stockRecordId === selectedProduct.stockRecordId
    );

    if (existingItemIndex > -1) {
      // Update existing item
      const updatedItems = [...returnItems];
      const newQty = updatedItems[existingItemIndex].returnQty + returnQty;

      if (newQty > selectedProduct.remainingQty) {
        toast.error(
          `Total quantity exceeds available stock: ${selectedProduct.remainingQty}`
        );
        return;
      }

      updatedItems[existingItemIndex].returnQty = newQty;
      setReturnItems(updatedItems);
      toast.success(
        `Updated ${selectedProduct.productName} quantity to ${newQty}`
      );
    } else {
      // Add new item
      const item = {
        stockRecordId: selectedProduct.stockRecordId,
        productId: selectedProduct.productId,
        productName: selectedProduct.productName,
        returnQty: returnQty,
        returnDate: returnDate.toISOString().split("T")[0],
        remarks: "",
      };
      console.log("setReturnItems", returnItems);
      setReturnItems([...returnItems, item]);
      toast.success(`${selectedProduct.productName} added to return list`);
    }

    // Reset form for next item
    setSelectedProduct(null);
    setReturnQty(1);
    setReturnDate(new Date());
  };

  // Remove item from return list
  const handleRemoveItem = (index) => {
    confirmDialog({
      text: "Remove this item from return list?",
      icon: "warning",
    }).then((res) => {
      if (res.isConfirmed) {
        setReturnItems((prev) => prev.filter((_, i) => i !== index));
        toast.success("Item removed");
      }
    });
  };

  // Submit return to backend
  const handleSubmit = async () => {
    if (!selectedMr) {
      toast.error("Select an MR");
      return;
    }

    if (returnItems.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    // Get MR details
    const selectedMrObj = mrList.find(
      (mr) => mr.mrName === selectedMr || mr.mrCode === selectedMr
    );

    if (!selectedMrObj) {
      toast.error("MR not found");
      return;
    }

    const mrNameToUse = selectedMrObj.mrName;

    try {
      setSubmitting(true);

      const returnData = {
        mrName: mrNameToUse,
        items: returnItems.map((item) => ({
          stockRecordId: item.stockRecordId,
          productId: item.productId,
          productName: item.productName,
          returnQty: parseInt(item.returnQty),
          returnDate: item.returnDate,
          remarks: item.remarks || "",
        })),
        remarks: remarks,
        returnDate: returnDate.toISOString().split("T")[0],
      };

      const response = await axios.post(
        `${backendUrl}/api/stock-returns`,
        returnData,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      
      if (response.data.success) {
        toast.success("Stock return created successfully!");
        onSuccess();
        onClose();
      } else {
        toast.error(response.data.message || "Failed to create return");
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to create stock return"
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate totals
  const totalQuantity = returnItems.reduce(
    (sum, item) => sum + item.returnQty,
    0
  );
  const totalValue = returnItems.reduce(
    (sum, item) => sum + item.returnQty * (item.costPrice || 0),
    0
  );

  // Prepare options for dropdowns
  const mrOptions = mrList.map((mr) => ({
    value: mr.mrName,
    label: `${mr.mrName} ${mr.mrCode ? `(${mr.mrCode})` : ""}`,
  }));

  const productOptions = mrStock
    .filter((item) => item.remainingQty > 0)
    .map((p) => ({
      value: p.stockRecordId,
      label: `${p.productName} (${p.productCode}) - Batch: ${p.batch} - Avail: ${p.remainingQty} ${p.unit}`,
      disabled: p.remainingQty <= 0,
    }));

  return (
    <div className="bg-white p-6 rounded-xl max-w-4xl w-full">
      <h2 className="text-2xl font-bold mb-6">New Stock Return</h2>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Select MR</label>
        <SearchableDropdown
          options={mrOptions}
          value={selectedMr}
          onChange={handleMrChange}
          placeholder="Select MR"
        />
      </div>

      {selectedMr && (
        <>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Select Product
            </label>
            <SearchableDropdown
              options={productOptions}
              value={selectedProduct ? selectedProduct.stockRecordId : ""}
              onChange={handleProductChange}
              placeholder={loading ? "Loading..." : "Select Product"}
              loading={loading}
              disabled={mrStock.length === 0}
            />

            {mrStock.length === 0 && !loading && (
              <p className="mt-2 text-sm text-gray-500">
                No available stock found for this MR
              </p>
            )}
          </div>

          {selectedProduct && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Quantity (1 - {selectedProduct.remainingQty})
                </label>
                <input
                  type="number"
                  min={1}
                  max={selectedProduct.remainingQty}
                  value={returnQty}
                  onChange={(e) => setReturnQty(parseInt(e.target.value) || 1)}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Return Date
                </label>
                <DatePicker
                  selected={returnDate}
                  onChange={setReturnDate}
                  dateFormat="yyyy-MM-dd"
                  maxDate={new Date()}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddItem}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"
                >
                  <Plus size={18} /> Add Item
                </button>
              </div>
            </div>
          )}

          {returnItems.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  Added Items ({returnItems.length})
                </h3>
                <div className="text-sm text-gray-600">
                  Total: {totalQuantity} items | Value: ${totalValue.toFixed(2)}
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-3 text-left">Product</th>
                    <th className="p-3 text-left">Qty</th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {returnItems.map((item, index) => (
                    <tr key={index} className="border-b">
                      <td className="p-3">{item.productName}</td>
                      <td className="p-3">
                        {item.returnQty} {item.unit}
                      </td>
                      <td className="p-3">
                        {formatDateToReadable(item.returnDate)}
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-600"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">
          Remarks (Optional)
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2"
          placeholder="Add any notes about this return..."
        />
      </div>

      <div className="flex justify-end gap-4">
        <button
          onClick={onClose}
          disabled={submitting}
          className="px-5 py-2 border rounded-lg hover:bg-gray-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || returnItems.length === 0}
          className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {submitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Processing...
            </>
          ) : (
            <>
              <CheckCircle size={18} /> Submit
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// Main StockReturn component
const StockReturn = () => {
  const [returnsHistory, setReturnsHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [mrList, setMrList] = useState([]);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);

  // Fetch MR list
  const fetchMRList = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/mrs`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (response.data.success) {
        setMrList(response.data.data || []);
      } else {
        toast.error("Failed to load MR list");
      }
    } catch (error) {
      toast.error("Failed to load MR list");
    }
  }, []);

  // Fetch stock returns
  const fetchReturnsHistory = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/stock-returns`, {
        params: {
          page: currentPage,
          limit: returnsPerPage,
          search: searchTerm || undefined,
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      console.log("response", response);
      if (response.data.success) {
        const data = response.data.data || [];
        setReturnsHistory(data);
      } else {
        toast.error(response.data.message || "Failed to load returns history");
        setReturnsHistory([]);
      }
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Failed to load returns history"
      );
      setReturnsHistory([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  // Initial data load
  useEffect(() => {
    fetchMRList();
  }, []);

  useEffect(() => {
    fetchReturnsHistory();
  }, [fetchReturnsHistory]);

  // Handle viewing products
  const handleViewProducts = (returnItem) => {
    if (!returnItem || !Array.isArray(returnItem.items)) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(returnItem.items);
    }
    setIsProductModalOpen(true);
  };

  // Filter returns locally
  const filteredReturns = useMemo(() => {
    if (!searchTerm) return returnsHistory;

    const lowerSearch = searchTerm.toLowerCase();
    return returnsHistory.filter(
      (r) =>
        r.mrName?.toLowerCase().includes(lowerSearch) ||
        r.mrCode?.toLowerCase().includes(lowerSearch) ||
        r.returnId?.toLowerCase().includes(lowerSearch) ||
        r.status?.toLowerCase().includes(lowerSearch)
    );
  }, [returnsHistory, searchTerm]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredReturns.length / returnsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentReturns = filteredReturns.slice(
    (currentPage - 1) * returnsPerPage,
    currentPage * returnsPerPage
  );

  // Selection handlers
  const toggleSelect = useCallback((returnItem) => {
    setSelected((prev) =>
      prev.some((r) => r.id === returnItem._id)
        ? prev.filter((r) => r.id !== returnItem._id)
        : [...prev, { id: returnItem._id, name: returnItem.mrName }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentReturns.map((r) => ({ id: r._id, name: r.mrName }))
          : []
      );
    },
    [currentReturns]
  );

  // Delete selected returns
  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      toast.error("Please select returns to delete");
      return;
    }

    // Check if all selected are pending
    const pendingReturns = selected.filter((s) => {
      const returnItem = returnsHistory.find((r) => r._id === s.id);
      return returnItem?.status === "Pending";
    });

    if (pendingReturns.length !== selected.length) {
      toast.error("Only pending returns can be deleted");
      return;
    }

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${selected.length} pending return(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const response = await axios.delete(
          `${backendUrl}/api/stock-returns/bulk`,
          {
            data: { ids: selected.map((s) => s.id) },
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        if (response.data.success) {
          toast.success(response.data.message);
          fetchReturnsHistory();
          setSelected([]);
        }
      } catch (error) {
        toast.error(
          error.response?.data?.message || "Failed to delete selected returns."
        );
      }
    }
  };

  // Delete single return
  const deleteReturn = async (returnItem) => {
    if (returnItem.status !== "Pending") {
      toast.error("Only pending returns can be deleted");
      return;
    }

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete return ${returnItem.returnId}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const response = await axios.delete(
          `${backendUrl}/api/stock-returns/${returnItem._id}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          }
        );

        if (response.data.success) {
          toast.success(response.data.message);
          fetchReturnsHistory();
        }
      } catch (error) {
        toast.error(
          error.response?.data?.message || "Failed to delete return."
        );
      }
    }
  };

  // View return details
  const handleView = useCallback((returnItem) => {
    setSelectedReturn(returnItem);
    setIsViewModalOpen(true);
  }, []);

  // Handle status update
  const handleStatusUpdate = async (status, rejectedReason = "") => {
    if (!selectedReturn) return;

    try {
      const response = await axios.put(
        `${backendUrl}/api/stock-returns/${selectedReturn._id}/status`,
        { status, rejectedReason },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );

      if (response.data.success) {
        toast.success(response.data.message);
        fetchReturnsHistory();
        setIsViewModalOpen(false);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to update status");
    }
  };

  // Format date helper
  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return formatDateToReadable(dateString);
  };

  // Display value helper
  const displayValue = (value) => (value ? value : "--");

  // Status badge component
  const StatusBadge = ({ status }) => {
    const getStatusColor = (status) => {
      switch (status) {
        case "Approved":
          return "bg-green-100 text-green-800";
        case "Rejected":
          return "bg-red-100 text-red-800";
        case "Pending":
          return "bg-yellow-100 text-yellow-800";
        default:
          return "bg-gray-100 text-gray-800";
      }
    };

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs ${getStatusColor(status)}`}
      >
        {status}
      </span>
    );
  };

  // Format currency helper
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "0.00";
    const num = parseFloat(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Helper to get currentCash value from return item
  const getCurrentCash = (returnItem) => {
    // Try to get from mrCashDetails first, then from root level
    return returnItem.mrCashDetails?.currentCash || returnItem.currentCash || 0;
  };

  // Check if currentCash is greater than 1000
  const isCashAboveThreshold = (returnItem) => {
    const currentCash = getCurrentCash(returnItem);
    return currentCash > 1000;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading returns data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="container">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={18} /> New Stock Return
            </button>
            {selected.length > 0 && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
          {returnsHistory.length > 0 && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Returns:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {filteredReturns.length}
                </span>
              </p>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search returns..."
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

        {/* Returns History Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {currentReturns.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === currentReturns.length &&
                          currentReturns.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span className="text-sm font-medium">MR Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Return Date</th>
                <th className="p-3 text-sm font-medium"># Products</th>
                <th className="p-3 text-sm font-medium">Total Qty</th>
                <th className="p-3 text-sm font-medium">Total Value</th>
                <th className="p-3 text-sm font-medium">Current Cash</th>
                <th className="p-3 text-sm font-medium">Status</th>
                <th className="p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentReturns.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
                    No returns found.
                  </td>
                </tr>
              ) : (
                currentReturns.map((returnItem, idx) => {
                  const productCount = returnItem.items?.length || 0;
                  const totalQty =
                    returnItem.items?.reduce(
                      (sum, item) => sum + (item.returnQty || 0),
                      0
                    ) || 0;
                  const totalValue = returnItem.totalValue || 0;
                  const currentCash = getCurrentCash(returnItem);

                  return (
                    <tr
                      key={returnItem._id}
                      className={`hover:bg-gray-50 ${
                        idx < currentReturns.length - 1 ? "border-b" : ""
                      }`}
                    >
                      <td className="p-3">
                        <div className="flex items-center gap-4">
                          <input
                            type="checkbox"
                            checked={selected.some(
                              (s) => s.id === returnItem._id
                            )}
                            onChange={() => toggleSelect(returnItem)}
                            disabled={returnItem.status !== "Pending"}
                          />
                          <span className="capitalize">
                            {displayValue(returnItem.mrName)}
                          </span>
                        </div>
                      </td>

                      <td className="p-3">
                        {formatDate(returnItem.returnDate) || "--"}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-3">
                          <span className="font-medium">{productCount}</span>
                          <button
                            className="text-purple-600 hover:text-purple-800 cursor-pointer"
                            onClick={() => handleViewProducts(returnItem)}
                            title="View Products"
                          >
                            <Package size={18} />
                          </button>
                        </div>
                      </td>
                      <td className="p-3">{totalQty}</td>
                      <td className="p-3">
                        <span className="font-medium text-green-700">
                          ${formatCurrency(totalValue)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-medium ${
                          currentCash > 1000 
                            ? "text-green-700" 
                            : "text-red-600"
                        }`}>
                          ${formatCurrency(currentCash)}
                          {currentCash <= 1000 && (
                            <span className="text-xs text-red-500 block mt-1">
                              Below $1,000
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={returnItem.status} />
                      </td>
                      <td className="p-3 flex items-center justify-center gap-3">
                        <button
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => handleView(returnItem)}
                          title="View"
                        >
                          <Eye size={18} />
                        </button>
                        {returnItem.status === "Pending" && (
                          <button
                            className="text-red-600 hover:text-red-800 cursor-pointer"
                            onClick={() => deleteReturn(returnItem)}
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {filteredReturns.length > returnsPerPage && (
            <div className="mt-4 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t">
              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * returnsPerPage + 1} to{" "}
                {Math.min(currentPage * returnsPerPage, filteredReturns.length)}{" "}
                of {filteredReturns.length} entries
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
                >
                  Prev
                </button>
                {visiblePages.map((p, index) => (
                  <button
                    key={index}
                    onClick={() => typeof p === "number" && setCurrentPage(p)}
                    disabled={p === "..."}
                    className={`px-3 py-1 rounded ${
                      p === "..."
                        ? "bg-gray-200 cursor-not-allowed"
                        : currentPage === p
                        ? "bg-blue-600 text-white cursor-pointer"
                        : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {isCreateModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
              <div className="bg-white p-6 rounded-xl max-w-4xl w-full relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>
                <CreateStockReturn
                  onClose={() => setIsCreateModalOpen(false)}
                  onSuccess={fetchReturnsHistory}
                  mrList={mrList}
                />
              </div>
            </div>,
            document.body
          )}

        {/* View Modal */}
        {isViewModalOpen &&
          selectedReturn &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
              <div className="bg-white p-6 rounded-xl max-w-4xl w-full relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>

                <h2 className="text-2xl font-bold mb-6">Return Details</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Return ID
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50 font-mono">
                      {displayValue(selectedReturn.returnId)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      MR Name
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50">
                      {displayValue(selectedReturn.mrName)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      MR Code
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50">
                      {displayValue(selectedReturn.mrCode)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Return Date
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50">
                      {formatDate(selectedReturn.returnDate)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Status
                    </label>
                    <div className="border rounded-lg px-3 py-2 bg-gray-50">
                      <StatusBadge status={selectedReturn.status} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Total Value
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50 font-medium text-green-700">
                      ${formatCurrency(selectedReturn.totalValue)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Current Cash
                    </label>
                    <p className={`border rounded-lg px-3 py-2 bg-gray-50 font-medium ${
                      isCashAboveThreshold(selectedReturn) 
                        ? "text-green-700" 
                        : "text-red-600"
                    }`}>
                      ${formatCurrency(getCurrentCash(selectedReturn))}
                      {!isCashAboveThreshold(selectedReturn) && (
                        <span className="text-xs text-red-500 block mt-1">
                          Must be above $1,000 to approve
                        </span>
                      )}
                    </p>
                  </div>
                  {selectedReturn.approvedAt && (
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Approved At
                      </label>
                      <p className="border rounded-lg px-3 py-2 bg-gray-50">
                        {formatDate(selectedReturn.approvedAt)}
                      </p>
                    </div>
                  )}
                  {selectedReturn.rejectedReason && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">
                        Rejection Reason
                      </label>
                      <p className="border rounded-lg px-3 py-2 bg-gray-50">
                        {selectedReturn.rejectedReason}
                      </p>
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-semibold mb-4">
                  Return Items ({selectedReturn.items?.length || 0})
                </h3>
                <table className="w-full mb-6">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left">Product</th>
                      <th className="p-3 text-left">Batch</th>
                      <th className="p-3 text-left">Return Qty</th>
                      <th className="p-3 text-left">Return Date</th>
                      <th className="p-3 text-left">Cost Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedReturn.items?.map((item, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{item.productName}</p>
                          </div>
                        </td>

                        <td className="p-3">{item.batch}</td>
                        <td className="p-3">{item.returnQty}</td>
                        <td className="p-3">{formatDate(item.returnDate)}</td>
                        <td className="p-3">
                          <span className="text-green-700">
                            ${formatCurrency(item.costPrice)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selectedReturn.remarks && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium mb-1">
                      Remarks
                    </label>
                    <p className="border rounded-lg px-3 py-2 bg-gray-50 whitespace-pre-line">
                      {selectedReturn.remarks}
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t">
                  <button
                    onClick={() => setIsViewModalOpen(false)}
                    className="px-5 py-2 border rounded-lg hover:bg-gray-100"
                  >
                    Close
                  </button>

                  {selectedReturn.status === "Pending" && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          const reason = prompt("Enter rejection reason:");
                          if (reason) {
                            handleStatusUpdate("Rejected", reason);
                          }
                        }}
                        className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleStatusUpdate("Approved")}
                        disabled={!isCashAboveThreshold(selectedReturn)}
                        className={`px-5 py-2 text-white rounded-lg flex items-center gap-2 ${
                          isCashAboveThreshold(selectedReturn)
                            ? "bg-green-600 hover:bg-green-700 cursor-pointer"
                            : "bg-gray-400 cursor-not-allowed"
                        }`}
                        title={
                          !isCashAboveThreshold(selectedReturn)
                            ? "Current cash must be greater than $1,000 to approve"
                            : ""
                        }
                      >
                        <CheckCircle size={18} />
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body
          )}
        {isProductModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50">
              <div className="bg-white p-6 rounded-xl max-w-4xl w-full relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
                >
                  <X size={24} />
                </button>

                <h2 className="text-2xl font-bold mb-6">Product Details</h2>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                    <thead className="bg-gray-100 text-gray-700 border-b">
                      <tr>
                        <th className="p-3">Product Name</th>
                        <th className="p-3">Product Code</th>
                        <th className="p-3">Batch</th>
                        <th className="p-3">Return Qty</th>
                        <th className="p-3">Return Date</th>
                        <th className="p-3">Cost Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProducts.length > 0 ? (
                        selectedProducts.map((item, index) => (
                          <tr
                            key={index}
                            className={`${
                              index === selectedProducts.length - 1
                                ? ""
                                : "border-b"
                            }`}
                          >
                            <td className="p-3">{item.productName}</td>
                            <td className="p-3">{item.productCode}</td>
                            <td className="p-3">{item.batch}</td>
                            <td className="p-3">{item.returnQty}</td>
                            <td className="p-3">
                              {formatDate(item.returnDate)}
                            </td>
                            <td className="p-3">
                              <span className="text-green-700">
                                ${formatCurrency(item.costPrice)}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={6}
                            className="p-4 text-center text-gray-500"
                          >
                            No products found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setIsProductModalOpen(false)}
                    className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg"
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

export default StockReturn;