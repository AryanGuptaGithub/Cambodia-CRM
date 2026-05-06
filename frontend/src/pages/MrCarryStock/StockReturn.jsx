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
  Menu,
  Filter,
} from "lucide-react";
import { showToast } from "../../utils/toast";
import ReactDOM from "react-dom";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import axios from "axios";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import { getVisiblePages } from "../../utils/useVisiblePages";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const returnsPerPage = 9;

// ==================== HELPER: SAFE COST PRICE EXTRACTION ====================
// Handles lc=0, lc=0.41, null, undefined correctly
const extractCostPrice = (product) => {

  const candidates = [
    product.lc,
    product.costPrice,
    product.price,
    product.unitCost,
    product.cost,
  ];

  for (const val of candidates) {
    if (val !== null && val !== undefined && val !== "") {
      const num = Number(val);
      if (isFinite(num) && num >= 0) return num;
    }
  }

  return 0;
  
};

// ==================== HELPER: ROBUST CURRENCY FORMATTING ====================
const formatCurrency = (value) => {
  if (value === null || value === undefined) return "0.00";
  const num = Number(value);
  if (!isFinite(num)) return "0.00";
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// ==================== CREATE STOCK RETURN MODAL ====================
const CreateStockReturn = ({ onClose, onSuccess, mrList, isMobileView }) => {
  const [selectedMr, setSelectedMr] = useState("");
  const [mrStock, setMrStock] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [returnQty, setReturnQty] = useState("1");
  const [returnDate, setReturnDate] = useState(new Date());
  const [returnItems, setReturnItems] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedMrId, setSelectedMrId] = useState("");

  // Quantity input handlers (validated)
  const handleQtyChange = (e) => {
    const numericValue = e.target.value.replace(/[^0-9]/g, "");
    if (!numericValue) {
      setReturnQty("");
      return;
    }
    const num = parseInt(numericValue, 10);
    if (selectedProduct) {
      if (num > selectedProduct.remainingQty) {
        setReturnQty(selectedProduct.remainingQty.toString());
      } else if (num < 1) {
        setReturnQty("1");
      } else {
        setReturnQty(numericValue);
      }
    } else {
      setReturnQty(numericValue);
    }
  };

  const handleQtyBlur = () => {
    if (!returnQty || returnQty.trim() === "") {
      setReturnQty("1");
      return;
    }
    const num = parseInt(returnQty, 10);
    if (isNaN(num) || num < 1) setReturnQty("1");
    else if (selectedProduct && num > selectedProduct.remainingQty)
      setReturnQty(selectedProduct.remainingQty.toString());
  };

  // Fetch MR stock from backend (uses correct endpoint)
  const fetchMrStock = async (mrId, mrName) => {
    try {
      setLoading(true);
      setMrStock([]);
      setSelectedProduct(null);
      const token = localStorage.getItem("token");
      const response = await axios.get(
        `${backendUrl}/api/stock-return/mr-stock/${mrId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        const products = response.data.data.productsInHand || [];
        const transformed = products.map((p) => ({
          stockRecordId: p._id,
          productId: p._id,
          productName: p.productName || "Unknown Product",
          remainingQty: p.quantity || 0,
          costPrice: extractCostPrice(p),
          unit: p.unit || "box",
          batch: p.batch,
          expiry: p.expiry,
        }));
        setMrStock(transformed);
        if (transformed.length === 0) {
          showToast("info", `No available stock for ${mrName}`);
        }
      } else {
        showToast("error", response.data.message || "Failed to load MR stock");
      }
    } catch (error) {
      console.error("Error fetching MR stock:", error);
      showToast("error", "Failed to load MR stock");
    } finally {
      setLoading(false);
    }
  };

  // Handle MR selection
  const handleMrChange = (value) => {
    const mrValue = value?.value || value;
    setSelectedMr(mrValue);
    setSelectedProduct(null);
    setMrStock([]);
    setReturnItems([]);
    setReturnQty("1");
    setSelectedMrId("");

    if (!mrValue) return;
    const mrObj = mrList.find(
      (mr) => mr.mrName === mrValue || mr.mrCode === mrValue
    );
    if (!mrObj) {
      showToast("error", "Selected MR not found");
      return;
    }
    const mrId = mrObj._id || mrObj.mrId;
    if (!mrId) {
      showToast("error", "MR ID not found");
      return;
    }
    setSelectedMrId(mrId);
    fetchMrStock(mrId, mrValue);
  };

  // Handle product selection
  const handleProductChange = (value) => {
    if (!value) {
      setSelectedProduct(null);
      return;
    }
    const product = mrStock.find((p) => p.stockRecordId === value);
    if (product && product.remainingQty > 0) {
      setSelectedProduct(product);
      setReturnQty("1");
    } else {
      showToast("error", "Selected product has no available stock");
      setSelectedProduct(null);
    }
  };

  // Add item to return list
  const handleAddItem = () => {
    if (!selectedProduct) {
      showToast("error", "Please select a product");
      return;
    }
    const parsedQty = parseInt(returnQty, 10);
    if (isNaN(parsedQty) || parsedQty < 1) {
      showToast("error", "Please enter a valid quantity");
      return;
    }
    if (parsedQty > selectedProduct.remainingQty) {
      showToast(
        "error",
        `Quantity cannot exceed available stock: ${selectedProduct.remainingQty}`
      );
      return;
    }
    if (!returnDate) {
      showToast("error", "Please select a return date");
      return;
    }
    if (!selectedProduct.productId) {
      showToast("error", "Product ID missing. Please re-select.");
      return;
    }

    const existingIndex = returnItems.findIndex(
      (item) => item.productId === selectedProduct.productId
    );
    if (existingIndex > -1) {
      const updated = [...returnItems];
      const newQty = updated[existingIndex].returnQty + parsedQty;
      if (newQty > selectedProduct.remainingQty) {
        showToast(
          "error",
          `Total quantity exceeds available stock: ${selectedProduct.remainingQty}`
        );
        return;
      }
      updated[existingIndex].returnQty = newQty;
      setReturnItems(updated);
      showToast(
        "success",
        `Updated ${selectedProduct.productName} quantity to ${newQty}`
      );
    } else {
      const newItem = {
        productId: selectedProduct.productId,
        productName: selectedProduct.productName,
        returnQty: parsedQty,
        returnDate: returnDate.toISOString().split("T")[0],
        remarks: "",
        costPrice: selectedProduct.costPrice,
        batch: selectedProduct.batch,
        unit: selectedProduct.unit,
      };
      setReturnItems([...returnItems, newItem]);
      showToast("success", `${selectedProduct.productName} added to return list`);
    }

    setSelectedProduct(null);
    setReturnQty("1");
  };

  const handleRemoveItem = (index) => {
    confirmDialog({
      text: "Remove this item from return list?",
      icon: "warning",
    }).then((res) => {
      if (res.isConfirmed) {
        setReturnItems((prev) => prev.filter((_, i) => i !== index));
        showToast("success", "Item removed successfully");
      }
    });
  };

  // Submit return
  const handleSubmit = async () => {
    if (!selectedMr) {
      showToast("error", "Please select an MR");
      return;
    }
    if (returnItems.length === 0) {
      showToast("error", "Please add at least one item to return");
      return;
    }
    if (!selectedMrId) {
      showToast("error", "MR ID not found. Please select MR again.");
      return;
    }

    const mrObj = mrList.find(
      (mr) => mr.mrName === selectedMr || mr.mrCode === selectedMr
    );
    if (!mrObj) {
      showToast("error", "MR not found");
      return;
    }

    const missingProductId = returnItems.some((item) => !item.productId);
    if (missingProductId) {
      showToast(
        "error",
        "Some items are missing product ID. Please remove and re-add them."
      );
      return;
    }

    try {
      setSubmitting(true);
      const validItems = returnItems.map((item) => ({
        productId: item.productId.toString(),
        productName: item.productName,
        returnQty: parseInt(item.returnQty, 10),
        returnDate: item.returnDate,
        remarks: item.remarks || "",
        costPrice: Number(item.costPrice) || 0,
        batch: item.batch,
        unit: item.unit,
      }));

      const returnData = {
        mrId: selectedMrId.toString(),
        mrName: mrObj.mrName,
        items: validItems,
        remarks: remarks,
        returnDate: returnDate.toISOString().split("T")[0],
      };

      const token = localStorage.getItem("token");
      const response = await axios.post(`${backendUrl}/api/stock-return`, returnData, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        showToast("success", "Stock return created successfully!");
        onSuccess();
        onClose();
      } else {
        showToast("error", response.data.message || "Failed to create return");
      }
    } catch (error) {
      console.error("Submit error:", error);
      showToast(
        "error",
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to create stock return"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const totalQuantity = returnItems.reduce((sum, item) => sum + item.returnQty, 0);
  const totalValue = returnItems.reduce(
    (sum, item) => sum + item.returnQty * Number(item.costPrice || 0),
    0
  );

  const mrOptions = mrList.map((mr) => ({
    value: mr.mrName,
    label: `${mr.mrName}${mr.mrCode ? ` (${mr.mrCode})` : ""}`,
  }));

  const productOptions = mrStock
    .filter((item) => item.remainingQty > 0)
    .map((p) => ({
      value: p.stockRecordId,
      label: `${p.productName} — Available: ${p.remainingQty} ${p.unit} — LC: ${formatCurrency(p.costPrice)}`,
    }));

  return (
    <div
      className={`${isMobileView ? "p-4" : "p-6"} bg-white rounded-xl max-w-4xl w-full`}
    >
      <h2 className={`${isMobileView ? "text-lg" : "text-2xl"} font-bold mb-4`}>
        New Stock Return
      </h2>

      <div className="mb-4">
        <label className={`block ${isMobileView ? "text-xs" : "text-sm"} font-medium mb-2`}>
          Select MR
        </label>
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
            <label className={`block ${isMobileView ? "text-xs" : "text-sm"} font-medium mb-2`}>
              Select Product
            </label>
            <SearchableDropdown
              options={productOptions}
              value={selectedProduct ? selectedProduct.stockRecordId : ""}
              onChange={handleProductChange}
              placeholder={loading ? "Loading stock…" : "Select Product"}
              loading={loading}
              disabled={mrStock.length === 0}
            />
            {!loading && mrStock.length === 0 && (
              <p className="mt-2 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 p-2 rounded">
                ⚠️ No available stock found for this MR.
              </p>
            )}
          </div>

          {selectedProduct && (
            <div
              className={`grid ${isMobileView ? "grid-cols-1 gap-3" : "grid-cols-3 gap-4"} mb-4`}
            >
              <div>
                <label className="block text-sm font-medium mb-2">
                  Quantity (1 – {selectedProduct.remainingQty})
                </label>
                <input
                  type="text"
                  value={returnQty}
                  onChange={handleQtyChange}
                  onBlur={handleQtyBlur}
                  className="w-full border rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Unit Cost (LC) = {formatCurrency(selectedProduct.costPrice)}
                </label>
                <input
                  type="text"
                  value={formatCurrency(selectedProduct.costPrice)}
                  readOnly
                  className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-700 cursor-not-allowed font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Total = {parseInt(returnQty || 1, 10)} ×{" "}
                  {formatCurrency(selectedProduct.costPrice)} ={" "}
                  {formatCurrency(parseInt(returnQty || 1, 10) * selectedProduct.costPrice)}
                </label>
                <button
                  onClick={handleAddItem}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700"
                >
                  <Plus size={18} /> Add Item
                </button>
              </div>
            </div>
          )}

          {returnItems.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <h3 className={`${isMobileView ? "text-sm" : "text-lg"} font-semibold`}>
                  Added Items ({returnItems.length})
                </h3>
                <div className={`${isMobileView ? "text-xs" : "text-sm"} text-gray-600`}>
                  Total Qty: {totalQuantity} | Total Value: {formatCurrency(totalValue)}
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-left`}>
                        Product
                      </th>
                      <th className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-left`}>
                        Qty
                      </th>
                      <th className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-left`}>
                        Unit Cost (LC)
                      </th>
                      <th className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-left`}>
                        Total (Qty × LC)
                      </th>
                      <th className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-left`}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnItems.map((item, index) => {
                      const itemTotal = item.returnQty * Number(item.costPrice || 0);
                      return (
                        <tr key={index} className="border-b hover:bg-gray-50">
                          <td className={`${isMobileView ? "p-2 text-xs" : "p-3"} font-medium`}>
                            {item.productName}
                          </td>
                          <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>
                            {item.returnQty} {item.unit || "box"}(es)
                          </td>
                          <td className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-blue-700 font-medium`}>
                            {formatCurrency(item.costPrice)}
                          </td>
                          <td className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-green-700 font-medium`}>
                            {formatCurrency(itemTotal)}
                          </td>
                          <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>
                            <button
                              onClick={() => handleRemoveItem(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold">
                    <tr>
                      <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>Total</td>
                      <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>{totalQuantity}</td>
                      <td className={`${isMobileView ? "p-2 text-xs" : "p-3"}`}>—</td>
                      <td className={`${isMobileView ? "p-2 text-xs" : "p-3"} text-green-700`}>
                        {formatCurrency(totalValue)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mb-4">
        <label className={`block ${isMobileView ? "text-xs" : "text-sm"} font-medium mb-2`}>
          Remarks (Optional)
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
          className="w-full border rounded px-3 py-2"
          placeholder="Add any notes about this return…"
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
          disabled={submitting || returnItems.length === 0 || !selectedMrId}
          className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {submitting ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Processing…
            </>
          ) : (
            <>
              <CheckCircle size={18} /> Submit Return
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// ==================== MAIN STOCK RETURN COMPONENT ====================
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
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Mobile detection
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch MR list
  const fetchMRList = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) setMrList(response.data.data || []);
      else showToast("error", "Failed to load MR list");
    } catch (error) {
      showToast("error", "Failed to load MR list");
    }
  }, []);

  // Fetch stock returns (with pagination)
  const fetchReturnsHistory = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await axios.get(`${backendUrl}/api/stock-return`, {
        params: {
          page: currentPage,
          limit: returnsPerPage,
          search: searchTerm || undefined,
        },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data.success) {
        setReturnsHistory(response.data.data || []);
        setTotal(response.data.pagination?.total || 0);
        setTotalPages(response.data.pagination?.pages || 1);
      } else {
        showToast("error", response.data.message || "Failed to load returns history");
        setReturnsHistory([]);
      }
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to load returns history");
      setReturnsHistory([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchMRList();
  }, [fetchMRList]);
  useEffect(() => {
    fetchReturnsHistory();
  }, [fetchReturnsHistory]);

  const handleViewProducts = (returnItem) => {
    setSelectedProducts(returnItem?.items || []);
    setIsProductModalOpen(true);
  };

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

  const paginatedTotalPages = Math.ceil(filteredReturns.length / returnsPerPage);
  const visiblePages = getVisiblePages(currentPage, paginatedTotalPages);
  const currentReturns = filteredReturns.slice(
    (currentPage - 1) * returnsPerPage,
    currentPage * returnsPerPage
  );

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
        checked ? currentReturns.map((r) => ({ id: r._id, name: r.mrName })) : []
      );
    },
    [currentReturns]
  );

  const handleDeleteSelected = async () => {
    if (selected.length === 0) {
      showToast("error", "Please select returns to delete");
      return;
    }
    const pendingReturns = selected.filter((s) => {
      const returnItem = returnsHistory.find((r) => r._id === s.id);
      return returnItem?.status === "Pending";
    });
    if (pendingReturns.length !== selected.length) {
      showToast("error", "Only pending returns can be deleted");
      return;
    }
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete ${selected.length} pending return(s)?`,
      icon: "warning",
    });
    if (confirm.isConfirmed) {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.delete(`${backendUrl}/api/stock-return/bulk/delete`, {
          data: { ids: selected.map((s) => s.id) },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.data.success) {
          showToast("success", response.data.message);
          fetchReturnsHistory();
          setSelected([]);
        }
      } catch (error) {
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete selected returns."
        );
      }
    }
  };

  const deleteReturn = async (returnItem) => {
    if (returnItem.status !== "Pending") {
      showToast("error", "Only pending returns can be deleted");
      return;
    }
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete return ${returnItem.returnId}?`,
      icon: "warning",
    });
    if (confirm.isConfirmed) {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.delete(`${backendUrl}/api/stock-return/${returnItem._id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.data.success) {
          showToast("success", response.data.message);
          fetchReturnsHistory();
        }
      } catch (error) {
        showToast("error", error.response?.data?.message || "Failed to delete return.");
      }
    }
  };

  const handleView = useCallback((returnItem) => {
    setSelectedReturn(returnItem);
    setIsViewModalOpen(true);
  }, []);

  const handleStatusUpdate = async (status, rejectedReason = "") => {
    if (!selectedReturn) return;
    try {
      const token = localStorage.getItem("token");
      const response = await axios.put(
        `${backendUrl}/api/stock-return/${selectedReturn._id}/status`,
        { status, rejectedReason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.success) {
        showToast("success", response.data.message);
        fetchReturnsHistory();
        setIsViewModalOpen(false);
      }
    } catch (error) {
      showToast("error", error.response?.data?.message || "Failed to update status");
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return formatDateToReadable(dateString);
  };
  const displayValue = (value) => (value ? value : "--");

  const StatusBadge = ({ status }) => {
    const colors = {
      Approved: "bg-green-100 text-green-800",
      Rejected: "bg-red-100 text-red-800",
      Pending: "bg-yellow-100 text-yellow-800",
    };
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs ${colors[status] || "bg-gray-100"}`}
      >
        {status}
      </span>
    );
  };

  if (loading && returnsHistory.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading returns data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* Mobile Sidebar */}
      {isMobileView && (
        <Sidebar isOpen={sidebarOpen} toggleSidebar={() => setSidebarOpen(false)} isMobile={true} />
      )}

      {/* Mobile Header */}
      {isMobileView && (
        <div className="bg-gray-200 shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-40 rounded-2xl mb-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-full bg-gray-100 active:bg-gray-200">
              <Menu size={20} className="text-gray-700" />
            </button>
            <h1 className="text-sm font-bold text-gray-800">Stock Returns</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-blue-50 text-blue-700 px-1 py-0.5 rounded-full text-sm font-medium">
              Total: {filteredReturns.length}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Search */}
      {isMobileView && filteredReturns.length > 0 && (
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Search returns..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 pr-9 py-2 border rounded-lg w-full text-sm"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          {searchTerm && (
            <button onClick={() => { setSearchTerm(""); setCurrentPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Desktop Header */}
      {!isMobileView && (
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl shadow-md"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={18} /> New Stock Return
            </button>
            {selected.length > 0 && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete ({selected.length})
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-lg font-semibold text-gray-700">
              Total Returns:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {total}
              </span>
            </p>
            <div className="relative w-72">
              <Search className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search returns…"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Delete Button */}
      {isMobileView && selected.length > 0 && (
        <div className="mb-3">
          <button
            className="flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm"
            onClick={handleDeleteSelected}
          >
            <Trash2 size={16} /> Delete Selected ({selected.length})
          </button>
        </div>
      )}

      {/* Returns Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center ${isMobileView ? "min-w-[600px]" : ""}`}>
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3"}`}>
                <div className="flex items-center gap-2">
                  {currentReturns.length > 0 && (
                    <input
                      type="checkbox"
                      checked={selected.length === currentReturns.length && currentReturns.length > 0}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span className={`${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}>MR Name</span>
                </div>
              </th>
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`}>Return Date</th>
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`}>Products</th>
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`}>Total Qty</th>
              {!isMobileView && <th className="p-3 text-sm font-medium">Total Value</th>}
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`}>Status</th>
              <th className={`${isMobileView ? "p-2 text-[10px]" : "p-3 text-sm"} font-medium`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentReturns.length === 0 ? (
              <tr>
                <td colSpan={isMobileView ? 6 : 8} className="p-8 text-center text-gray-500">
                  <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  No returns found.
                </td>
              </tr>
            ) : (
              currentReturns.map((returnItem, idx) => {
                const productCount = returnItem.items?.length || 0;
                const totalQty =
                  returnItem.totalQuantity ||
                  returnItem.items?.reduce((sum, item) => sum + (item.returnQty || 0), 0) ||
                  0;
                const totalValue =
                  returnItem.totalValue ||
                  returnItem.items?.reduce(
                    (sum, item) => sum + (item.returnQty || 0) * Number(item.costPrice || 0),
                    0
                  ) ||
                  0;
                return (
                  <tr key={returnItem._id} className={`hover:bg-gray-50 ${idx < currentReturns.length - 1 ? "border-b" : ""}`}>
                    <td className={`${isMobileView ? "p-2" : "p-3"}`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === returnItem._id)}
                          onChange={() => toggleSelect(returnItem)}
                          disabled={returnItem.status !== "Pending"}
                        />
                        <span className={`capitalize font-medium ${isMobileView ? "text-[10px]" : "text-sm"}`}>
                          {displayValue(returnItem.mrName)}
                        </span>
                      </div>
                    </td>
                    <td className={`${isMobileView ? "p-2 text-[10px]" : "p-3"}`}>
                      {formatDate(returnItem.returnDate)}
                    </td>
                    <td className={`${isMobileView ? "p-2" : "p-3"}`}>
                      <div className="flex items-center justify-center gap-2">
                        <span className={`font-medium ${isMobileView ? "text-[10px]" : "text-sm"}`}>{productCount}</span>
                        <button
                          className="text-purple-600 hover:text-purple-800"
                          onClick={() => handleViewProducts(returnItem)}
                          title="View Products"
                        >
                          <Package size={isMobileView ? 14 : 18} />
                        </button>
                      </div>
                    </td>
                    <td className={`${isMobileView ? "p-2 text-[10px]" : "p-3"}`}>{totalQty}</td>
                    {!isMobileView && (
                      <td className="p-3">
                        <span className="font-medium text-green-700">{formatCurrency(totalValue)}</span>
                      </td>
                    )}
                    <td className={`${isMobileView ? "p-2" : "p-3"}`}>
                      <StatusBadge status={returnItem.status} />
                    </td>
                    <td className={`${isMobileView ? "p-2" : "p-3"} flex items-center justify-center gap-2`}>
                      <button
                        className="text-blue-600 hover:text-blue-800"
                        onClick={() => handleView(returnItem)}
                        title="View"
                      >
                        <Eye size={isMobileView ? 14 : 18} />
                      </button>
                      {returnItem.status === "Pending" && (
                        <button
                          className="text-red-600 hover:text-red-800"
                          onClick={() => deleteReturn(returnItem)}
                          title="Delete"
                        >
                          <Trash2 size={isMobileView ? 14 : 18} />
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
          <div className={`p-5 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 border-t ${isMobileView ? "flex-col" : ""}`}>
            {!isMobileView && (
              <div className="text-sm text-gray-600">
                Showing {(currentPage - 1) * returnsPerPage + 1} to{" "}
                {Math.min(currentPage * returnsPerPage, filteredReturns.length)} of {filteredReturns.length} entries
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
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
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, paginatedTotalPages))}
                disabled={currentPage === paginatedTotalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals (Create, View, Product) */}
      {isCreateModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
            <div className={`bg-white rounded-xl relative overflow-y-auto max-h-[90vh] ${isMobileView ? "max-w-full w-full" : "max-w-4xl"}`}>
              <button onClick={() => setIsCreateModalOpen(false)} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 z-10">
                <X size={24} />
              </button>
              <CreateStockReturn
                onClose={() => setIsCreateModalOpen(false)}
                onSuccess={fetchReturnsHistory}
                mrList={mrList}
                isMobileView={isMobileView}
              />
            </div>
          </div>,
          document.body
        )}

      {isViewModalOpen &&
        selectedReturn &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
            <div className={`bg-white p-6 rounded-xl relative overflow-y-auto max-h-[90vh] ${isMobileView ? "max-w-full w-full" : "max-w-4xl"}`}>
              <button onClick={() => setIsViewModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
              <h2 className="text-2xl font-bold mb-6">Return Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div><label className="block text-sm font-medium mb-1">Return ID</label><p className="border rounded-lg px-3 py-2 bg-gray-50 font-mono">{displayValue(selectedReturn.returnId)}</p></div>
                <div><label className="block text-sm font-medium mb-1">MR Name</label><p className="border rounded-lg px-3 py-2 bg-gray-50">{displayValue(selectedReturn.mrName)}</p></div>
                <div><label className="block text-sm font-medium mb-1">Return Date</label><p className="border rounded-lg px-3 py-2 bg-gray-50">{formatDate(selectedReturn.returnDate)}</p></div>
                <div><label className="block text-sm font-medium mb-1">Status</label><div className="border rounded-lg px-3 py-2 bg-gray-50"><StatusBadge status={selectedReturn.status} /></div></div>
                <div><label className="block text-sm font-medium mb-1">Total Value</label><p className="border rounded-lg px-3 py-2 bg-gray-50 font-medium text-green-700">{formatCurrency(selectedReturn.totalValue)}</p></div>
                {selectedReturn.approvedAt && <div><label className="block text-sm font-medium mb-1">Approved At</label><p className="border rounded-lg px-3 py-2 bg-gray-50">{formatDate(selectedReturn.approvedAt)}</p></div>}
                {selectedReturn.rejectedReason && <div className="col-span-2"><label className="block text-sm font-medium mb-1">Rejection Reason</label><p className="border rounded-lg px-3 py-2 bg-gray-50">{selectedReturn.rejectedReason}</p></div>}
              </div>
              <h3 className="text-lg font-semibold mb-4">Return Items ({selectedReturn.items?.length || 0})</h3>
              <div className="overflow-x-auto mb-6">
                <table className="w-full border-collapse">
                  <thead className="bg-gray-100"><tr><th className="p-3 text-left">Product</th><th className="p-3 text-left">Return Qty</th><th className="p-3 text-left">Return Date</th><th className="p-3 text-left">Unit Cost (LC)</th><th className="p-3 text-left">Total (Qty × LC)</th></tr></thead>
                  <tbody>
                    {selectedReturn.items?.map((item, idx) => {
                      const cost = Number(item.costPrice || 0);
                      const itemTotal = (item.returnQty || 0) * cost;
                      return <tr key={idx} className="border-b"><td className="p-3 font-medium">{item.productName}</td><td className="p-3">{item.returnQty} box(es)</td><td className="p-3">{formatDate(item.returnDate)}</td><td className="p-3 text-blue-700 font-medium">{formatCurrency(cost)}</td><td className="p-3 text-green-700 font-medium">{formatCurrency(itemTotal)}</td></tr>;
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50"><tr><td colSpan="4" className="p-3 text-right font-bold">Grand Total:</td><td className="p-3 font-bold text-green-700">{formatCurrency(selectedReturn.totalValue)}</td></tr></tfoot>
                </table>
              </div>
              {selectedReturn.remarks && <div className="mb-6"><label className="block text-sm font-medium mb-1">Remarks</label><p className="border rounded-lg px-3 py-2 bg-gray-50">{selectedReturn.remarks}</p></div>}
              <div className="flex justify-between items-center pt-4 border-t">
                <button onClick={() => setIsViewModalOpen(false)} className="px-5 py-2 border rounded-lg hover:bg-gray-100">Close</button>
                {selectedReturn.status === "Pending" && (
                  <div className="flex gap-3">
                    <button onClick={() => { const reason = prompt("Enter rejection reason:"); if (reason) handleStatusUpdate("Rejected", reason); }} className="px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Reject</button>
                    <button onClick={() => handleStatusUpdate("Approved")} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2"><CheckCircle size={18} /> Approve</button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {isProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-50 p-4">
            <div className={`bg-white p-6 rounded-xl relative overflow-y-auto max-h-[90vh] ${isMobileView ? "max-w-full w-full" : "max-w-4xl"}`}>
              <button onClick={() => setIsProductModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"><X size={24} /></button>
              <h2 className="text-2xl font-bold mb-6">Product Details</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
                  <thead className="bg-gray-100"><tr><th className="p-3">Product Name</th><th className="p-3">Return Qty</th><th className="p-3">Return Date</th><th className="p-3">Unit Cost (LC)</th><th className="p-3">Total (Qty × LC)</th></tr></thead>
                  <tbody>
                    {selectedProducts.length > 0 ? selectedProducts.map((item, idx) => {
                      const cost = Number(item.costPrice || 0);
                      const itemTotal = (item.returnQty || 0) * cost;
                      return <tr key={idx} className={idx === selectedProducts.length - 1 ? "" : "border-b"}><td className="p-3 font-medium">{item.productName}</td><td className="p-3">{item.returnQty} box(es)</td><td className="p-3">{formatDate(item.returnDate)}</td><td className="p-3 text-blue-700 font-medium">{formatCurrency(cost)}</td><td className="p-3 text-green-700 font-medium">{formatCurrency(itemTotal)}</td></tr>;
                    }) : <tr><td colSpan={5} className="p-4 text-center text-gray-500">No products found</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 flex justify-end"><button onClick={() => setIsProductModalOpen(false)} className="px-5 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg">Close</button></div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default StockReturn;