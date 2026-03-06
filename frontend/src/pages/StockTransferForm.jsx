import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Plus,
  Trash2,
  Eye,
  X,
  Package,
  DollarSign,
  Box,
  ArrowDownCircle,
  User,
  ChevronLeft,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import SearchableDropdown from "../components/common/SearchableDropdown";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const isReceiveType = (transferType) =>
  String(transferType || "").toLowerCase() === "receive";

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === "") return "0.00";
  const num = parseFloat(value);
  if (isNaN(num)) return "0.00";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const CreateStockTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab = location.state?.activeTab || "toMR";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [form, setForm] = useState({
    invoiceNo: location.state?.nextStockTransferNo || "",
    date: new Date().toISOString().split("T")[0],
    transferType: "send",
    mrId: "",
    mrName: "",
    stockTransferToMr: "",
    stockTransferFromMrToMain: "",
    source: "",
    destination: "",
    remarks: "",
    items: [],
  });

  // Products for send type
  const [products, setProducts] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // Separate MR lists: send = from /api/staff, receive = from stockInMRHand
  const [sendMrList, setSendMrList] = useState([]);
  const [sendMrListLoading, setSendMrListLoading] = useState(true);
  const [receiveMrList, setReceiveMrList] = useState([]);
  const [receiveMrListLoading, setReceiveMrListLoading] = useState(false);

  // MR Stock for receive type
  const [mrStockData, setMrStockData] = useState([]);
  const [mrStockLoading, setMrStockLoading] = useState(false);
  const [mrInfo, setMrInfo] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // ── Fetch invoice number ────────────────────────────────────────────────
  useEffect(() => {
    if (!form.invoiceNo) {
      fetchNextInvoiceNo();
    }
  }, []);

  const fetchNextInvoiceNo = async () => {
    try {
      const endpoint =
        activeTab === "general"
          ? `${backendUrl}/api/stock-transfer/next-number`
          : `${backendUrl}/api/stock-transfer-to-mr/next-number`;
      const res = await axios.get(endpoint);
      if (res.data.success) {
        setForm((prev) => ({ ...prev, invoiceNo: res.data.nextNumber }));
      }
    } catch {
      // fallback
    }
  };

  // ── Fetch Send MR list (staff) ──────────────────────────────────────────
  useEffect(() => {
    const fetchSendMRList = async () => {
      try {
        setSendMrListLoading(true);
        const res = await axios.get(`${backendUrl}/api/staff`);
        setSendMrList(res.data || []);
      } catch {
        setSendMrList([]);
      } finally {
        setSendMrListLoading(false);
      }
    };
    fetchSendMRList();
  }, []);

  // ── Fetch Receive MR list (stockInMRHand via /mrs) ──────────────────────
  useEffect(() => {
    if (activeTab !== "toMR") return;
    const fetchReceiveMRList = async () => {
      try {
        setReceiveMrListLoading(true);
        const res = await axios.get(
          `${backendUrl}/api/stock-transfer-to-mr/mrs`,
        );
        setReceiveMrList(res.data?.data || []);
      } catch {
        setReceiveMrList([]);
      } finally {
        setReceiveMrListLoading(false);
      }
    };
    fetchReceiveMRList();
  }, [activeTab]);

  // Build MR dropdown options based on current transfer type
  const mrOptions = useMemo(() => {
    if (isReceiveType(form.transferType)) {
      // Receive: only MRs that have stock in stockInMRHand
      return receiveMrList.map((mr) => ({
        value: mr.mrId?.toString() || mr.mrName,
        label: mr.mrName || `MR ${mr.mrId}`,
        mrId: mr.mrId?.toString(),
        mrName: mr.mrName,
      }));
    } else {
      // Send: all staff MRs
      return sendMrList.map((mr) => ({
        value: mr._id,
        label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
        mrId: mr._id,
        mrName: mr.medicalRepName || mr.employeeName || "",
      }));
    }
  }, [form.transferType, sendMrList, receiveMrList]);

  const mrListLoading = isReceiveType(form.transferType)
    ? receiveMrListLoading
    : sendMrListLoading;

  // ── Fetch products (for send type) ─────────────────────────────────────
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await axios.get(`${backendUrl}/api/products/dropdown`);
        const data = res.data?.data || [];
        const uniqueMap = new Map();
        data.forEach((p) => {
          if (p?._id && p?.productName) {
            const key = p.productName.trim().toLowerCase();
            if (!uniqueMap.has(key)) uniqueMap.set(key, p);
          }
        });
        setProducts(Array.from(uniqueMap.values()));
      } catch {
        showToast("error", "Failed to fetch products");
      }
    };
    fetchProducts();
  }, []);

  const productOptions = useMemo(
    () => [
      { value: "", label: "Search and select products..." },
      ...products
        .filter((p) => (p.totalBoxes || 0) > 0)
        .map((p) => ({
          value: p._id,
          label: `${p.productName} (Stock: ${p.totalBoxes || 0})`,
          productName: p.productName,
          lc: p.lc || 0,
          totalBoxes: p.totalBoxes || 0,
        })),
    ],
    [products],
  );

  // ── Fetch MR Stock by mrId ──────────────────────────────────────────────
  const fetchMRStock = useCallback(async (mrId, mrName) => {
    if (!mrId) {
      setMrStockData([]);
      setMrInfo(null);
      return;
    }
    setMrStockLoading(true);
    try {
      const res = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-stock-by-mr-id/${mrId}`,
      );
      const allProducts = res.data?.products || [];
      setMrInfo(res.data?.data || { mrId, mrName });
      const filtered = allProducts.filter((p) => (p.quantity || 0) > 0);
      setMrStockData(
        filtered.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          assignedQuantity: p.assignedQuantity || 0,
          quantity: p.quantity || 0,
          lc: p.lc || 0,
          returnQuantity: p.quantity || 0,
          // separate display string so user can clear and retype freely
          returnQuantityDisplay: String(p.quantity || 0),
        })),
      );
    } catch {
      showToast("error", "Could not load MR stock");
      setMrStockData([]);
      setMrInfo(null);
    } finally {
      setMrStockLoading(false);
    }
  }, []);

  // ── Handle MR selection ─────────────────────────────────────────────────
  const handleMRSelect = async (selectedValue) => {
    const sel = mrOptions.find((m) => m.value === selectedValue);
    const mrName = sel?.mrName || sel?.label || "";
    const actualMrId = sel?.mrId || selectedValue;

    setForm((prev) => ({
      ...prev,
      mrId: actualMrId,
      mrName,
      stockTransferToMr: isReceiveType(prev.transferType) ? "" : mrName,
      stockTransferFromMrToMain: isReceiveType(prev.transferType) ? mrName : "",
    }));

    if (isReceiveType(form.transferType) && actualMrId) {
      await fetchMRStock(actualMrId, mrName);
    } else {
      setMrStockData([]);
      setMrInfo(null);
    }
  };

  // ── Handle Transfer Type change ─────────────────────────────────────────
  const handleTransferTypeChange = (e) => {
    const newType = e.target.value;
    // Reset MR selection and items when switching — lists are different
    setForm((prev) => ({
      ...prev,
      transferType: newType,
      items: [],
      mrId: "",
      mrName: "",
      stockTransferToMr: "",
      stockTransferFromMrToMain: "",
    }));
    setMrStockData([]);
    setMrInfo(null);
  };

  // ── Handle return quantity change (text input, numeric-only) ───────────
  const handleReturnQtyChange = (productId, rawValue) => {
    // Allow only digits
    const numeric = rawValue.replace(/[^0-9]/g, "");

    setMrStockData((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;
        if (numeric === "") {
          // Keep display empty so user can clear and retype
          return { ...p, returnQuantity: 0, returnQuantityDisplay: "" };
        }
        const parsed = parseInt(numeric, 10);
        // Clamp to max available quantity
        const clamped = Math.min(Math.max(0, parsed), p.quantity);
        return {
          ...p,
          returnQuantity: clamped,
          returnQuantityDisplay: String(clamped),
        };
      }),
    );
  };

  // ── Add product to items (send type) ────────────────────────────────────
  const handleAddProduct = () => {
    if (!selectedProductId) {
      showToast("error", "Please select a product");
      return;
    }
    const sel = productOptions.find((p) => p.value === selectedProductId);
    if (!sel || !sel.value) return;

    setForm((prev) => {
      const existing = prev.items.findIndex(
        (i) => i.productId === selectedProductId,
      );
      if (existing >= 0) {
        showToast("info", "Product already added. Edit quantity below.");
        return prev;
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId: sel.value,
            productName: sel.productName,
            boxQuantity: 1,
            lc: sel.lc || 0,
            productCost: sel.lc || 0,
          },
        ],
      };
    });
    setSelectedProductId("");
  };

  const handleItemQtyChange = (index, value) => {
    const qty = parseInt(value) || 0;
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = {
        ...items[index],
        boxQuantity: qty,
        productCost: parseFloat(((items[index].lc || 0) * qty).toFixed(2)),
      };
      return { ...prev, items };
    });
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  // Items with returnQuantity > 0 (used for submit validation + payload)
  const selectedReturnItems = useMemo(
    () => mrStockData.filter((p) => (p.returnQuantity || 0) > 0),
    [mrStockData],
  );

  // ── Handle form change ──────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "invoiceNo") return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    const isReceive = isReceiveType(form.transferType) && activeTab === "toMR";

    if (activeTab === "toMR" && !form.mrId) {
      showToast("error", "Please select an MR");
      return;
    }
    if (isReceive) {
      if (selectedReturnItems.length === 0) {
        showToast(
          "error",
          "Please set return quantity for at least one product",
        );
        return;
      }
    } else {
      if (form.items.length === 0) {
        showToast("error", "Please add at least one product");
        return;
      }
    }

    setSubmitting(true);
    try {
      let payload;
      let url;

      if (activeTab === "toMR") {
        url = `${backendUrl}/api/stock-transfer-to-mr`;
        const items = isReceive
          ? selectedReturnItems.map((p) => ({
              productId: p.productId,
              productName: p.productName,
              boxQuantity: p.returnQuantity,
              lc: p.lc,
              productCost: p.lc * p.returnQuantity,
            }))
          : form.items.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              boxQuantity: i.boxQuantity,
              lc: i.lc,
              productCost: i.lc * i.boxQuantity,
            }));

        payload = {
          invoiceNo: form.invoiceNo,
          date: form.date,
          transferType: form.transferType,
          mrId: form.mrId,
          mrName: form.mrName,
          stockTransferToMr: isReceive ? "" : form.mrName,
          stockTransferFromMrToMain: isReceive ? form.mrName : "",
          remarks: form.remarks,
          items,
        };
      } else {
        url = `${backendUrl}/api/stock-transfer`;
        payload = {
          invoiceNo: form.invoiceNo,
          date: form.date,
          transferType: form.transferType,
          source: form.source,
          destination: form.destination,
          remarks: form.remarks,
          items: form.items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            boxQuantity: i.boxQuantity,
            lc: i.lc,
            productCost: i.lc * i.boxQuantity,
          })),
        };
      }

      await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      showToast("success", "Stock transfer created successfully!");
      navigate("/stocktransfer", {
        state: { activeTab: activeTab === "toMR" ? "mr" : "general" },
      });
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to create transfer",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isMRReceive = activeTab === "toMR" && isReceiveType(form.transferType);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-4 text-gray-600 text-sm flex items-center gap-2">
        <button
          onClick={() => navigate("/stocktransfer")}
          className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 cursor-pointer"
        >
          <ChevronLeft size={16} /> Stock Transfer
        </button>
        <span>{">"}</span>
        <span>Create New Transfer</span>
      </div>

      <div className="bg-white rounded-2xl shadow border border-gray-200 overflow-hidden">
        {/* Tab Header */}
        <div className="flex border-b">
          <button
            onClick={() => {
              setActiveTab("toMR");
              setForm((prev) => ({
                ...prev,
                transferType: "send",
                items: [],
                mrId: "",
                mrName: "",
              }));
              setMrStockData([]);
              setMrInfo(null);
            }}
            className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition-colors cursor-pointer ${
              activeTab === "toMR"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <User size={16} /> MR Transfer
          </button>
          <button
            onClick={() => {
              setActiveTab("general");
              setForm((prev) => ({
                ...prev,
                transferType: "send",
                mrId: "",
                mrName: "",
                items: [],
              }));
              setMrStockData([]);
              setMrInfo(null);
            }}
            className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition-colors cursor-pointer ${
              activeTab === "general"
                ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Package size={16} /> General Transfer
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Row 1: Transfer No + Transfer Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transfer No
              </label>
              <input
                type="text"
                name="invoiceNo"
                value={form.invoiceNo}
                readOnly
                className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transfer Type <span className="text-red-500">*</span>
              </label>
              <select
                name="transferType"
                value={form.transferType}
                onChange={handleTransferTypeChange}
                className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-300 outline-none"
                required
              >
                <option value="send">Send</option>
                <option value="receive">Receive</option>
              </select>
            </div>
          </div>

          {/* Row 2: Date + MR Name (toMR) or Source/Dest (general) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transfer Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-300 outline-none"
                required
              />
            </div>
            {activeTab === "toMR" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  MR Name <span className="text-red-500">*</span>
                  {isReceiveType(form.transferType) && (
                    <span className="ml-2 text-xs text-blue-500 font-normal">
                      (MRs with stock only)
                    </span>
                  )}
                </label>
                <SearchableDropdown
                  value={form.mrId}
                  onChange={handleMRSelect}
                  options={mrOptions}
                  placeholder={
                    mrListLoading
                      ? "Loading MRs..."
                      : isReceiveType(form.transferType)
                        ? "Select MR with stock..."
                        : "Select MR"
                  }
                  required
                  loading={mrListLoading}
                  disabled={mrOptions.length === 0 && !mrListLoading}
                />
                {isReceiveType(form.transferType) &&
                  !mrListLoading &&
                  mrOptions.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">
                      No MRs with stock found
                    </p>
                  )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.transferType === "send" ? "Destination" : "Source"}
                </label>
                <input
                  type="text"
                  name={form.transferType === "send" ? "destination" : "source"}
                  value={
                    form.transferType === "send"
                      ? form.destination
                      : form.source
                  }
                  onChange={handleChange}
                  className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-300 outline-none"
                  placeholder={
                    form.transferType === "send"
                      ? "Enter destination"
                      : "Enter source"
                  }
                />
              </div>
            )}
          </div>

          {/* ── MR Receive: Stock In MR Hand Table ─────────────────────────── */}
          {isMRReceive ? (
            <div>
              {/* MR Info Banner */}
              {mrInfo && (
                <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-blue-900 text-sm">
                      {mrInfo.mrName || form.mrName}
                    </p>
                    <p className="text-xs text-blue-500">
                      Receiving stock back from MR to warehouse
                    </p>
                  </div>
                  <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded-full">
                    Receive Transfer
                  </span>
                </div>
              )}

              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <ArrowDownCircle size={18} className="text-blue-600" />
                Stock In MR Hand
                {mrStockData.length > 0 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-1">
                    {mrStockData.length} product(s)
                  </span>
                )}
              </h3>

              {!form.mrId ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                  <User size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">
                    Select an MR above to view their stock
                  </p>
                </div>
              ) : mrStockLoading ? (
                <div className="text-center py-10 text-gray-500 animate-pulse">
                  <Package size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Loading MR stock...</p>
                </div>
              ) : mrStockData.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                  <Package size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">
                    No products with stock &gt; 0 found for this MR
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-50 text-blue-800">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">
                          Product Name
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          Assigned Qty
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          In Hand
                        </th>
                        <th className="px-4 py-3 text-center font-semibold">
                          Return Quantity
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mrStockData.map((p, idx) => (
                        <tr
                          key={p.productId || idx}
                          className={`border-t transition-colors ${
                            (p.returnQuantity || 0) > 0
                              ? "bg-blue-50"
                              : idx % 2 === 0
                                ? "bg-white"
                                : "bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {p.productName}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-1 rounded-full">
                              {p.assignedQuantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">
                              {p.quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={
                                p.returnQuantityDisplay ??
                                String(p.returnQuantity)
                              }
                              onChange={(e) =>
                                handleReturnQtyChange(
                                  p.productId,
                                  e.target.value,
                                )
                              }
                              className={`w-24 text-center border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 outline-none mx-auto block transition-colors ${
                                (p.returnQuantity || 0) > 0
                                  ? "border-blue-400 bg-white font-semibold text-blue-700"
                                  : "border-gray-300"
                              }`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* ── Send type (or general): Add Products section ──────────────── */
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-3">
                Add Products
              </h3>
              <div className="flex gap-3 items-end mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Products <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={selectedProductId}
                    onChange={setSelectedProductId}
                    options={productOptions}
                    placeholder="Search and select products..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setViewModalOpen(true)}
                  disabled={!selectedProductId}
                  className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <Eye size={16} /> View
                </button>
                <button
                  type="button"
                  onClick={handleAddProduct}
                  disabled={!selectedProductId}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={16} /> Add
                </button>
              </div>

              {/* Items list */}
              {form.items.length > 0 ? (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">
                          Product Name
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                          Box Qty
                        </th>
                        <th className="px-4 py-3 text-center font-medium">
                          Remove
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, idx) => (
                        <tr
                          key={item.productId || idx}
                          className={`border-t ${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {item.productName}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.boxQuantity}
                              onChange={(e) => {
                                const value = e.target.value.replace(
                                  /[^0-9]/g,
                                  "",
                                ); // allow only numbers
                                handleItemQtyChange(idx, value);
                              }}
                              className="w-20 text-center border rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-indigo-300 outline-none mx-auto block border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-red-500 hover:text-red-700 cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-xl text-gray-500">
                  <Package size={36} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">
                    No products added yet. Select and add products above.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Remarks
            </label>
            <textarea
              name="remarks"
              value={form.remarks}
              onChange={handleChange}
              rows={3}
              placeholder="Enter any additional remarks or notes"
              className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-300 outline-none resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={() => navigate("/stocktransfer")}
              className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                (isMRReceive
                  ? !form.mrId || selectedReturnItems.length === 0
                  : form.items.length === 0 ||
                    (activeTab === "toMR" && !form.mrId))
              }
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg cursor-pointer disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {submitting ? (
                <span className="animate-pulse">Saving...</span>
              ) : isMRReceive ? (
                <>
                  <ArrowDownCircle size={16} />+ Receive from{" "}
                  {form.mrName || "MR"}
                </>
              ) : (
                <>
                  <Plus size={16} /> Create Transfer
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* ── View Product Modal ──────────────────────────────────────────────── */}
      {viewModalOpen &&
        selectedProductId &&
        (() => {
          const sel = productOptions.find((p) => p.value === selectedProductId);
          return sel ? (
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setViewModalOpen(false)}
              />
              <div className="bg-white w-full max-w-sm p-6 rounded-xl shadow-xl relative">
                <button
                  onClick={() => setViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Product Details
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Product Name</span>
                    <span className="text-sm font-medium">
                      {sel.productName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">
                      Available Stock
                    </span>
                    <span className="text-sm font-medium flex items-center gap-1">
                      <Box size={13} className="text-gray-500" />
                      {sel.totalBoxes} boxes
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    onClick={() => setViewModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg cursor-pointer text-sm"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null;
        })()}
    </div>
  );
};

export default CreateStockTransfer;
