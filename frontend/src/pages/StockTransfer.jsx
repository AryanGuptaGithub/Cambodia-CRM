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
  Pencil,
  DollarSign,
  Box,
  ArrowDownCircle,
  User,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { getVisiblePages } from "../utils/useVisiblePages.jsx";
import { formatDateToReadable } from "../utils/dateUtil.js";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import { confirmDialog } from "../utils/confirmationDialog.js";
import SearchableDropdown from "../components/common/SearchableDropdown";

const ITEMS_PER_PAGE = 9;
const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ── Helper: case-insensitive receive check ───────────────────────────────────
const isReceiveType = (transferType) =>
  String(transferType || "").toLowerCase() === "receive";

const StockTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(() => {
    if (location.state && location.state.activeTab)
      return location.state.activeTab;
    return localStorage.getItem("stockTransferActiveTab") || "general";
  });

  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [generalTransfers, setGeneralTransfers] = useState([]);
  const [mrTransfers, setMrTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productModalLoading, setProductModalLoading] = useState(false);
  const [productModalIsReceive, setProductModalIsReceive] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const inputRef = useRef(null);

  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({
    productId: "",
    productName: "",
    boxQuantity: "",
    lc: "",
    productCost: 0,
  });

  const [currentProduct, setCurrentProduct] = useState(null);
  const [currentProductIndex, setCurrentProductIndex] = useState(null);
  const [isProductEditModalOpen, setIsProductEditModalOpen] = useState(false);

  // ── MR list from stockInMRHand (separate from staff) ────────────────────
  const [mrListFromStock, setMrListFromStock] = useState([]);
  const [mrListFromStockLoading, setMrListFromStockLoading] = useState(false);

  // Original staff MR list (kept for general use)
  const [mrList, setMrList] = useState([]);
  const [mrListLoading, setMrListLoading] = useState(true);
  const [isMrListEmpty, setIsMrListEmpty] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState(null);

  // MR stock for view modal
  const [mrStockData, setMrStockData] = useState([]);
  const [mrStockLoading, setMrStockLoading] = useState(false);

  // MR stock for edit modal (receive transfers)
  const [mrStockDataForEdit, setMrStockDataForEdit] = useState([]);
  const [loadingMRStockForEdit, setLoadingMRStockForEdit] = useState(false);

  // MR Stock Selection Modal
  const [isMrStockSelectModalOpen, setIsMrStockSelectModalOpen] =
    useState(false);
  const [mrStockSelectData, setMrStockSelectData] = useState([]);

  // MR info for display in modals
  const [currentMRInfo, setCurrentMRInfo] = useState(null);

  // ── MR stock for CREATE modal (receive type, auto-loaded on MR select) ────
  const [createMRStockData, setCreateMRStockData] = useState([]);
  const [loadingCreateMRStock, setLoadingCreateMRStock] = useState(false);
  const [createMRInfo, setCreateMRInfo] = useState(null);

  // ── LC loading state for add product modal ────────────────────────────────
  const [lcLoading, setLcLoading] = useState(false);

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
    source: "",
    destination: "",
    mrName: "",
    mrId: "",
    stockTransferToMr: "",
    stockTransferFromMrToMain: "",
  });

  // ── Fetch MR stock directly from stockInMRHand by mrId ───────────────────
  const fetchMRStockByMrId = useCallback(async (mrId) => {
    if (!mrId) return null;
    try {
      const res = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-stock-by-mr-id/${mrId}`,
      );
      return res.data;
    } catch (err) {
      console.error("fetchMRStockByMrId error:", err);
      return null;
    }
  }, []);

  // ── Fetch MR list from stockInMRHand ─────────────────────────────────────
  const fetchMRListFromStock = useCallback(async () => {
    try {
      setMrListFromStockLoading(true);
      const res = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs`);
      setMrListFromStock(res.data?.data || []);
    } catch (err) {
      console.error("fetchMRListFromStock error:", err);
      setMrListFromStock([]);
    } finally {
      setMrListFromStockLoading(false);
    }
  }, []);

  // ── Fetch LC from ReportInHand for a product name ─────────────────────────
  const fetchLCFromReportInHand = useCallback(async (productName) => {
    if (!productName) return 0;
    try {
      const res = await axios.get(
        `${backendUrl}/api/report-in-hand?productName=${encodeURIComponent(productName)}`,
      );
      const data = res.data?.data || res.data || [];
      const productStock = Array.isArray(data)
        ? data.find(
            (p) => p.productName?.toLowerCase() === productName.toLowerCase(),
          )
        : data;
      if (!productStock || !productStock.batches?.length) return 0;
      const batchWithStock = [...productStock.batches]
        .reverse()
        .find((b) => b.boxes > 0);
      const batch =
        batchWithStock || productStock.batches[productStock.batches.length - 1];
      return batch?.lc || 0;
    } catch (err) {
      console.error("fetchLCFromReportInHand error:", err);
      return 0;
    }
  }, []);

  const getProductLc = useCallback((product) => {
    if (!product) return 0;
    if (
      product.batches &&
      Array.isArray(product.batches) &&
      product.batches.length > 0
    ) {
      const batchWithLc = product.batches.find((b) => b.lc && b.lc > 0);
      if (batchWithLc) return batchWithLc.lc;
      if (product.batches[0].lc !== undefined)
        return product.batches[0].lc || 0;
    }
    return product.lc || 0;
  }, []);

  const fetchMRList = useCallback(async () => {
    try {
      setMrListLoading(true);
      const response = await axios.get(`${backendUrl}/api/staff`);
      const data = response.data || [];
      if (data && data.length > 0) {
        setMrList(data);
        setIsMrListEmpty(false);
      } else {
        setMrList([]);
        setIsMrListEmpty(true);
      }
    } catch (err) {
      setMrList([]);
      setIsMrListEmpty(true);
    } finally {
      setMrListLoading(false);
    }
  }, []);

  // Options from stockInMRHand for MR Transfer tab
  const mrOptionsFromStock = useMemo(() => {
    return mrListFromStock.map((mr) => ({
      value: mr.mrId || mr._id || mr.mrName,
      label: mr.mrName || `MR ${mr.mrId}`,
      mrData: mr,
    }));
  }, [mrListFromStock]);

  // Original staff options (used in general / fallback)
  const mrOptions = useMemo(() => {
    if (isMrListEmpty) return [];
    return mrList.map((mr) => ({
      value: mr._id,
      label: mr.medicalRepName || mr.employeeName || `MR ${mr._id}`,
      mrData: mr,
    }));
  }, [mrList, isMrListEmpty]);

  useEffect(() => {
    localStorage.setItem("stockTransferActiveTab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (location.state?.activeTab)
      window.history.replaceState({}, document.title);
  }, [location.state]);

  useEffect(() => {
    fetchMRList();
    fetchMRListFromStock();
  }, [fetchMRList, fetchMRListFromStock]);

  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "0.00";
    const num = parseFloat(value);
    if (isNaN(num)) return "0.00";
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const calculateTotalTransferCost = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    return parseFloat(
      items
        .reduce((sum, item) => {
          let itemCost = 0;
          if (item.productCost !== undefined && item.productCost !== null)
            itemCost = parseFloat(item.productCost);
          else if (item.lc && item.boxQuantity)
            itemCost = parseFloat(item.lc) * parseInt(item.boxQuantity);
          return sum + (isNaN(itemCost) ? 0 : itemCost);
        }, 0)
        .toFixed(2),
    );
  };

  const calculateGrandTotal = (items, shipping = 0, expenses = 0) => {
    return parseFloat(
      (
        calculateTotalTransferCost(items) +
        (parseFloat(shipping) || 0) +
        (parseFloat(expenses) || 0)
      ).toFixed(2),
    );
  };

  const extractNumberFromInvoice = (invoiceNo) => {
    if (!invoiceNo || typeof invoiceNo !== "string") return 0;
    const match = invoiceNo.match(/ST-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  };

  const getNextStockTransferNumber = useCallback(async () => {
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer/next-number`,
      );
      if (response.data.success) return response.data.nextNumber;
      throw new Error("Failed to get next number");
    } catch {
      const allTransfers = [...generalTransfers, ...mrTransfers];
      if (allTransfers.length === 0) return "ST-0001";
      const stNumbers = allTransfers
        .map((t) => t.invoiceNo)
        .filter(Boolean)
        .map(extractNumberFromInvoice)
        .filter((n) => !isNaN(n) && n > 0);
      if (stNumbers.length === 0) return "ST-0001";
      return `ST-${(Math.max(...stNumbers) + 1).toString().padStart(4, "0")}`;
    }
  }, [generalTransfers, mrTransfers]);

  const fetchProducts = useCallback(async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/products/dropdown`);
      const productsData = response.data?.data || [];
      if (!Array.isArray(productsData)) {
        showToast("error", "Invalid products data format");
        return;
      }
      const uniqueProductsMap = new Map();
      productsData.forEach((product) => {
        if (product && product._id && product.productName) {
          const name = product.productName.trim().toLowerCase();
          if (!uniqueProductsMap.has(name))
            uniqueProductsMap.set(name, product);
        }
      });
      setProducts(
        Array.from(uniqueProductsMap.values()).map((product) => ({
          id: product._id,
          _id: product._id,
          label: product.productName || `Product ${product._id}`,
          type: product.type,
          productName: product.productName,
          supplierName: product.supplierName,
          batches: product.batches || [],
          totalBoxes: product.totalBoxes || 0,
          totalAmount: product.totalAmount || 0,
          status: product.status || "Out of Stock",
          minStockLevel: product.minStockLevel || 0,
          lc: getProductLc(product),
          fob: product.fob || 0,
          cif: product.cif || 0,
          sellingPrice: product.sellingPrice,
          stockLastUpdated: product.stockLastUpdated || null,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt,
        })),
      );
    } catch {
      showToast("error", "Failed to fetch products");
    }
  }, [getProductLc]);

  // ── Product options filtered to exclude already-added products (MR transfer) ──
  const getAvailableProductOptions = useCallback(
    (currentItems = [], isForMRTransfer = false) => {
      const addedProductIds = new Set(
        (currentItems || [])
          .map((item) => {
            const id =
              item.productId?._id || item.productId || item.product?.value;
            return String(id || "");
          })
          .filter(Boolean),
      );

      const baseProducts = isForMRTransfer
        ? products.filter((p) => p.totalBoxes > 0)
        : products.filter((p) => p.totalBoxes > 0);

      return [
        { value: "", label: "Select Product" },
        ...baseProducts
          .filter((product) => !addedProductIds.has(String(product._id)))
          .map((product) => ({
            value: product._id,
            label: `${product.productName} (Stock: ${product.totalBoxes || 0} boxes)`,
            qtyPerCarton: product.qtyPerCarton || 0,
            lc: product.lc || 0,
            availableStock: product.totalBoxes || 0,
            productName: product.productName,
          })),
      ];
    },
    [products],
  );

  const productOptions = useMemo(
    () => [
      { value: "", label: "Select Product" },
      ...products
        .filter((p) => p.totalBoxes > 0)
        .map((product) => ({
          value: product._id,
          label: `${product.productName} (Stock: ${product.totalBoxes || 0} boxes, LC: $${formatCurrency(product.lc)})`,
          qtyPerCarton: product.qtyPerCarton || 0,
          lc: product.lc || 0,
          availableStock: product.totalBoxes || 0,
          productName: product.productName,
        })),
    ],
    [products],
  );

  const productOptionsForEdit = useMemo(
    () => [
      { value: "", label: "Select Product" },
      ...products.map((product) => ({
        value: product._id,
        label: `${product.productName} (Stock: ${product.totalBoxes || 0} boxes, LC: $${formatCurrency(product.lc)})`,
        qtyPerCarton: product.qtyPerCarton || 0,
        lc: product.lc || 0,
        availableStock: product.totalBoxes || 0,
        productName: product.productName,
      })),
    ],
    [products],
  );

  const fetchGeneralTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${backendUrl}/api/stock-transfer`);
      setGeneralTransfers(response.data.data || response.data || []);
    } catch (err) {
      setError(err.message);
      showToast("error", err.message || "Failed to fetch general transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMRTransfers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr`,
      );
      const data = response.data || [];
      setMrTransfers(
        data.map((t) =>
          !t.totalTransferCost || t.totalTransferCost === 0
            ? { ...t, totalTransferCost: calculateTotalTransferCost(t.items) }
            : t,
        ),
      );
    } catch (err) {
      setError(err.message);
      showToast("error", err.message || "Failed to fetch MR transfers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "general") fetchGeneralTransfers();
    else if (activeTab === "mr") fetchMRTransfers();
  }, [activeTab, fetchGeneralTransfers, fetchMRTransfers]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleDeleteItem = (index) => {
    if (window.confirm("Are you sure you want to remove this item?")) {
      setForm((prev) => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index),
      }));
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "invoiceNo") return;
    let newValue = value;
    if (
      name === "shipping" ||
      name === "totalExpenses" ||
      name === "grandTotal"
    ) {
      const num = parseFloat(value);
      newValue = isNaN(num) ? 0 : parseFloat(num.toFixed(2));
    }
    setForm((prev) => ({ ...prev, [name]: newValue }));
  };

  // ── Handle Transfer Type change in Edit modal ─────────────────────────────
  const handleTransferTypeChange = (e) => {
    const newType = e.target.value;
    setForm((prev) => ({ ...prev, transferType: newType }));
  };

  const handleViewProducts = async (transfer) => {
    const isReceive =
      activeTab === "mr" && isReceiveType(transfer.transferType);
    setProductModalIsReceive(isReceive);

    const grouped = {};
    (transfer?.items || []).forEach((item) => {
      const id = item.productId?._id || item.productId || item._id;
      if (!grouped[id])
        grouped[id] = {
          _id: id,
          productId: id,
          productName: item.productName || "-",
          boxQuantity: 0,
          lc: parseFloat(item.lc) || 0,
        };
      grouped[id].boxQuantity += parseFloat(item.boxQuantity) || 0;
    });
    setSelectedProducts(
      Object.values(grouped).map((item) => ({
        ...item,
        productCost: parseFloat(
          ((item.lc || 0) * (item.boxQuantity || 0)).toFixed(2),
        ),
      })),
    );
    setIsProductModalOpen(true);
  };

  // ── Handle Add New Item for MR Transfer (send type) ───────────────────────
  const handleAddNewItem = () => {
    setNewProductForm({
      productId: "",
      productName: "",
      boxQuantity: "",
      lc: "",
      productCost: 0,
    });
    setIsAddProductModalOpen(true);
  };

  // ── Handle product select in Add Product Modal ────────────────────────────
  // For MR transfer: fetch LC from ReportInHand
  const handleNewProductSelectForMR = async (selectedValue) => {
    const availableOpts = getAvailableProductOptions(form.items, true);
    const sel = availableOpts.find((opt) => opt.value === selectedValue);
    if (sel && sel.value) {
      setNewProductForm((prev) => ({
        ...prev,
        productId: selectedValue,
        productName: sel.productName,
        lc: "",
        boxQuantity: "",
        productCost: 0,
      }));
      // Fetch LC from ReportInHand
      setLcLoading(true);
      try {
        const lcValue = await fetchLCFromReportInHand(sel.productName);
        setNewProductForm((prev) => ({
          ...prev,
          lc: lcValue || sel.lc || 0,
          productCost:
            prev.boxQuantity !== ""
              ? parseFloat(
                  (
                    (lcValue || sel.lc || 0) * parseInt(prev.boxQuantity || 0)
                  ).toFixed(2),
                )
              : 0,
        }));
      } catch {
        setNewProductForm((prev) => ({
          ...prev,
          lc: sel.lc || 0,
        }));
      } finally {
        setLcLoading(false);
      }
    }
  };

  const handleNewProductSelect = (selectedValue) => {
    const sel = productOptions.find((opt) => opt.value === selectedValue);
    if (sel && sel.value) {
      setNewProductForm((prev) => ({
        ...prev,
        productId: selectedValue,
        productName: sel.productName,
        lc: sel.lc || 0,
        boxQuantity: "",
        productCost: 0,
      }));
    }
  };

  // ── Box quantity change: text input accepting only numeric values ──────────
  const handleNewProductBoxQuantityChange = (e) => {
    const value = e.target.value;
    // Allow only digits (numeric only, text input)
    if (value === "" || /^\d+$/.test(value)) {
      const boxQty = value === "" ? "" : parseInt(value, 10);
      setNewProductForm((prev) => {
        const lc = parseFloat(prev.lc) || 0;
        const updated = { ...prev, boxQuantity: value }; // keep as string for text input
        updated.productCost =
          value !== "" && lc > 0
            ? parseFloat((lc * (parseInt(value, 10) || 0)).toFixed(2))
            : 0;
        return updated;
      });
    }
  };

  const handleAddProductToForm = () => {
    const boxQty = parseInt(newProductForm.boxQuantity, 10);
    if (
      !newProductForm.productId ||
      !newProductForm.boxQuantity ||
      isNaN(boxQty) ||
      boxQty <= 0
    ) {
      showToast(
        "error",
        "Please select a product and enter a valid box quantity",
      );
      return;
    }
    const availableOpts = getAvailableProductOptions(
      form.items,
      activeTab === "mr",
    );
    const sel = availableOpts.find(
      (opt) => opt.value === newProductForm.productId,
    );
    setForm((prev) => {
      const existingIndex = prev.items.findIndex(
        (item) =>
          (item.productId?._id || item.productId || item.product?.value) ===
          newProductForm.productId,
      );
      if (existingIndex >= 0) {
        const updatedItems = [...prev.items];
        const ex = updatedItems[existingIndex];
        const totalBoxQuantity = (parseInt(ex.boxQuantity) || 0) + boxQty;
        const lc = parseFloat(newProductForm.lc) || ex.lc || 0;
        updatedItems[existingIndex] = {
          ...ex,
          boxQuantity: totalBoxQuantity,
          lc,
          productCost: parseFloat((lc * totalBoxQuantity).toFixed(2)),
        };
        showToast("success", "Product quantity updated successfully");
        return { ...prev, items: updatedItems };
      } else {
        const lc = parseFloat(newProductForm.lc) || 0;
        const newItem = {
          productId: newProductForm.productId,
          productName: newProductForm.productName,
          boxQuantity: boxQty,
          lc,
          productCost: parseFloat((lc * boxQty).toFixed(2)),
          _id: `new-${Date.now()}`,
          product: {
            value: newProductForm.productId,
            label: newProductForm.productName,
            qtyPerCarton: sel?.qtyPerCarton || 0,
          },
          openPieces: 0,
          qtyPerCarton: sel?.qtyPerCarton || 0,
          totalPieces: boxQty * (sel?.qtyPerCarton || 0),
          expenses: 0,
        };
        showToast("success", "Product added successfully");
        return { ...prev, items: [...prev.items, newItem] };
      }
    });
    setIsAddProductModalOpen(false);
    setNewProductForm({
      productId: "",
      productName: "",
      boxQuantity: "",
      lc: "",
      productCost: 0,
    });
  };

  const handleUpdateTransfer = async (e, formData) => {
    e.preventDefault();
    const isReceive =
      activeTab === "mr" && isReceiveType(formData.transferType);

    if (isReceive) {
      const selected = mrStockDataForEdit.filter((p) => p.returnQuantity > 0);
      if (selected.length === 0) {
        showToast("error", "Please select at least one product to return");
        return;
      }
    } else {
      if (!formData.items || formData.items.length === 0) {
        showToast("error", "Cannot update transfer with no items");
        return;
      }
    }

    const token = localStorage.getItem("token");
    try {
      let url;
      let requestData = { ...formData };
      if (activeTab === "general") {
        url = `${backendUrl}/api/stock-transfer/${formData._id}`;
        delete requestData.stockTransferToMr;
        delete requestData.stockTransferFromMrToMain;
        delete requestData.mrName;
        delete requestData.mrId;
      } else {
        url = `${backendUrl}/api/stock-transfer-to-mr/${formData._id}`;
        delete requestData.source;
        delete requestData.destination;
        if (requestData.stockTransferToMr)
          requestData.mrName = requestData.stockTransferToMr;
      }

      if (isReceive) {
        requestData.items = mrStockDataForEdit
          .filter((p) => p.returnQuantity > 0)
          .map((p) => ({
            productId: p.productId,
            productName: p.productName,
            boxQuantity: p.returnQuantity,
            lc: p.lc,
            productCost: p.lc * p.returnQuantity,
            expenses: 0,
          }));
      } else {
        requestData.items = formData.items
          .map((item) => {
            const productId =
              item.productId?._id || item.productId || item.product?.value;
            const boxQuantity = parseInt(item.boxQuantity) || 0;
            const lc = parseFloat(item.lc) || 0;
            return {
              productId,
              productName: item.productName || item.product?.label || "",
              boxQuantity,
              lc: parseFloat(lc.toFixed(4)),
              productCost:
                lc > 0
                  ? parseFloat((lc * boxQuantity).toFixed(2))
                  : parseFloat(item.productCost) || 0,
              expenses: parseFloat(item.expenses) || 0,
            };
          })
          .filter((item) => item.productId && item.boxQuantity > 0);
      }

      if (requestData.items.length === 0) {
        showToast("error", "Cannot update transfer with no valid items");
        return;
      }
      requestData.totalTransferCost = calculateTotalTransferCost(
        requestData.items,
      );
      requestData.grandTotal = calculateGrandTotal(
        requestData.items,
        requestData.shipping,
        requestData.totalExpenses,
      );

      const response = await axios.put(url, requestData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 200) {
        if (activeTab === "general") await fetchGeneralTransfers();
        else await fetchMRTransfers();
        setIsEditModalOpen(false);
        setEditingTransfer(null);
        showToast(
          "success",
          `Transfer updated successfully with ${requestData.items.length} products`,
        );
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.err ||
          err.response?.data?.message ||
          "Failed to update transfer",
      );
    }
  };

  const getCurrentData = () =>
    activeTab === "general" ? generalTransfers : mrTransfers;
  const getMRName = (transfer) =>
    transfer.stockTransferToMr ||
    transfer.stockTransferFromMrToMain ||
    transfer.mrName ||
    "-";

  const filteredTransfers = useMemo(() => {
    const data = getCurrentData();
    const lowerSearch = searchTerm.trim().toLowerCase();
    if (!lowerSearch) return data;
    return data.filter((transfer) => {
      const matchesInvoice = (transfer.invoiceNo || "")
        .toLowerCase()
        .includes(lowerSearch);
      const matchesRemarks = (transfer.remarks || "")
        .toLowerCase()
        .includes(lowerSearch);
      if (activeTab === "general") {
        const matchesSourceDest = (
          transfer.transferType === "send"
            ? transfer.destination || ""
            : transfer.source || ""
        )
          .toLowerCase()
          .includes(lowerSearch);
        return matchesInvoice || matchesRemarks || matchesSourceDest;
      }
      return (
        matchesInvoice ||
        matchesRemarks ||
        getMRName(transfer).toLowerCase().includes(lowerSearch)
      );
    });
  }, [activeTab, getCurrentData, searchTerm]);

  const currentTransfers = useMemo(
    () =>
      filteredTransfers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE,
      ),
    [filteredTransfers, currentPage],
  );
  const totalPages = useMemo(
    () => Math.ceil(filteredTransfers.length / ITEMS_PER_PAGE),
    [filteredTransfers],
  );
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages],
  );

  const handleSelectRow = (id) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const updatedItems = [...prev.items];
      let newValue = value;
      if (field === "lc" || field === "expenses") {
        const num = parseFloat(value);
        newValue = isNaN(num) ? 0 : parseFloat(num.toFixed(2));
      } else if (
        field === "boxQuantity" ||
        field === "openPieces" ||
        field === "qtyPerCarton"
      ) {
        const num = parseInt(value);
        newValue = isNaN(num) ? 0 : num;
      }
      updatedItems[index] = { ...updatedItems[index], [field]: newValue };
      if (
        field === "boxQuantity" ||
        field === "openPieces" ||
        field === "qtyPerCarton"
      ) {
        updatedItems[index].totalPieces =
          (updatedItems[index].boxQuantity || 0) *
            (updatedItems[index].qtyPerCarton || 0) +
          (updatedItems[index].openPieces || 0);
      }
      if (field === "boxQuantity" || field === "lc") {
        updatedItems[index].productCost = parseFloat(
          (
            (parseFloat(updatedItems[index].lc) || 0) *
            (parseInt(updatedItems[index].boxQuantity) || 0)
          ).toFixed(2),
        );
      }
      return { ...prev, items: updatedItems };
    });
  };

  const handleSelectAll = (e) =>
    e.target.checked
      ? setSelectedRows(currentTransfers.map((r) => r._id))
      : setSelectedRows([]);

  const handleDelete = async () => {
    if (selectedRows.length === 0) return;
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selectedRows.length}</b> ${activeTab === "general" ? "General Transfers" : "MR Transfers"}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      const token = localStorage.getItem("token");
      try {
        await Promise.all(
          selectedRows.map((id) =>
            axios.delete(
              `${backendUrl}/api/${activeTab === "general" ? "stock-transfer" : "stock-transfer-to-mr"}/${id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            ),
          ),
        );
        if (activeTab === "general") await fetchGeneralTransfers();
        else await fetchMRTransfers();
        setSelectedRows([]);
        showToast("success", "Selected items deleted");
      } catch (err) {
        showToast(
          "error",
          err.response?.data?.err ||
            err.response?.data?.message ||
            err.message ||
            "Error deleting items",
        );
      }
    }
  };

  const handleDeleteSingle = async (transferData) => {
    if (!transferData._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete ${activeTab === "general" ? "stock transfer" : "MR transfer"} <b>${transferData.invoiceNo}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirmDelete.isConfirmed) {
      const token = localStorage.getItem("token");
      try {
        const response = await axios.delete(
          `${backendUrl}/api/${activeTab === "general" ? "stock-transfer" : "stock-transfer-to-mr"}/${transferData._id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (response.status === 200) {
          showToast(
            "success",
            `${activeTab === "general" ? "Stock Transfer" : "MR Transfer"} <b>${transferData.invoiceNo}</b> deleted successfully`,
          );
          if (activeTab === "general") await fetchGeneralTransfers();
          else await fetchMRTransfers();
        }
      } catch (err) {
        showToast(
          "error",
          err.response?.data?.err ||
            err.response?.data?.message ||
            "Failed to delete.",
        );
      }
    }
  };

  const handleView = async (transfer) => {
    setForm({
      ...transfer,
      mrName: getMRName(transfer),
      stockTransferToMr: transfer.stockTransferToMr || transfer.mrName || "",
      stockTransferFromMrToMain: transfer.stockTransferFromMrToMain || "",
      shipping: parseFloat(transfer.shipping || 0).toFixed(2),
      totalExpenses: parseFloat(transfer.totalExpenses || 0).toFixed(2),
      grandTotal: parseFloat(transfer.grandTotal || 0).toFixed(2),
      mrId: transfer.mrId || "",
    });
    if (
      activeTab === "mr" &&
      isReceiveType(transfer.transferType) &&
      transfer.mrId
    ) {
      setMrStockLoading(true);
      try {
        const result = await fetchMRStockByMrId(transfer.mrId);
        // Only show products with quantity > 0
        const filtered = (result?.products || []).filter((p) => p.quantity > 0);
        setMrStockData(filtered);
        setCurrentMRInfo(result?.data || null);
      } catch {
        showToast("error", "Could not load MR stock details");
        setMrStockData([]);
      } finally {
        setMrStockLoading(false);
      }
    } else {
      setMrStockData([]);
      setCurrentMRInfo(null);
    }
    setIsViewModalOpen(true);
  };

  // ── MR Stock Select Modal handlers ────────────────────────────────────────
  const handleStockSelectReturnQtyChange = (productId, value) => {
    const num = parseInt(value) || 0;
    setMrStockSelectData((prev) =>
      prev.map((p) =>
        p.productId === productId
          ? { ...p, returnQuantity: Math.min(num, p.availableQty) }
          : p,
      ),
    );
  };

  const handleConfirmMrStockSelection = () => {
    setMrStockDataForEdit(mrStockSelectData.map((p) => ({ ...p })));
    setIsMrStockSelectModalOpen(false);
  };

  // ── Load MR stock for EDIT modal ──────────────────────────────────────────
  const loadMRStockForEdit = useCallback(
    async (mrId, mrName, existingItems = []) => {
      if (!mrId) {
        setMrStockDataForEdit([]);
        setMrStockSelectData([]);
        setCurrentMRInfo(null);
        return;
      }
      setLoadingMRStockForEdit(true);
      try {
        const result = await fetchMRStockByMrId(mrId);
        const allProducts = result?.products || [];
        const mrInfo = result?.data || { mrId, mrName };
        setCurrentMRInfo(mrInfo);

        const mapped = allProducts.map((p) => {
          const existingItem = existingItems.find(
            (item) =>
              item.productId === p.productId ||
              item.productId === p.productId?.toString(),
          );
          return {
            productId: p.productId,
            productName: p.productName,
            lc: p.lc || 0,
            availableQty: p.quantity || 0,
            assignedQty: p.assignedQuantity || 0,
            returnQuantity: existingItem
              ? existingItem.boxQuantity
              : p.quantity || 0,
          };
        });

        setMrStockDataForEdit(mapped);
        setMrStockSelectData(mapped.map((p) => ({ ...p })));
      } catch {
        showToast("error", "Could not load MR stock");
        setMrStockDataForEdit([]);
        setMrStockSelectData([]);
        setCurrentMRInfo(null);
      } finally {
        setLoadingMRStockForEdit(false);
      }
    },
    [fetchMRStockByMrId],
  );

  // ── Load MR stock for CREATE modal (auto on MR select, receive type) ──────
  const loadMRStockForCreate = useCallback(
    async (mrId, mrName) => {
      if (!mrId) {
        setCreateMRStockData([]);
        setCreateMRInfo(null);
        return;
      }
      setLoadingCreateMRStock(true);
      try {
        const result = await fetchMRStockByMrId(mrId);
        const mrInfo = result?.data || { mrId, mrName };
        setCreateMRInfo(mrInfo);
        // Only show products with quantity > 0
        const filtered = (result?.products || []).filter((p) => p.quantity > 0);
        setCreateMRStockData(
          filtered.map((p) => ({
            productId: p.productId,
            productName: p.productName,
            assignedQuantity: p.assignedQuantity || 0,
            quantity: p.quantity || 0,
            lc: p.lc || 0,
            returnQuantity: p.quantity || 0,
          })),
        );
      } catch {
        showToast("error", "Could not load MR stock");
        setCreateMRStockData([]);
        setCreateMRInfo(null);
      } finally {
        setLoadingCreateMRStock(false);
      }
    },
    [fetchMRStockByMrId],
  );

  const handleEdit = async (transfer) => {
    const clonedItems = (transfer.items || []).map((item) => ({
      ...item,
      productId: item.productId?._id || item.productId,
      productName: item.productName || "",
      boxQuantity: item.boxQuantity || 0,
      lc: item.lc || 0,
      productCost: item.productCost || (item.lc || 0) * (item.boxQuantity || 0),
      expenses: item.expenses || 0,
    }));
    const formData = {
      ...transfer,
      items: clonedItems,
      mrName: getMRName(transfer),
      stockTransferToMr: transfer.stockTransferToMr || transfer.mrName || "",
      stockTransferFromMrToMain: transfer.stockTransferFromMrToMain || "",
      shipping: parseFloat(transfer.shipping || 0).toFixed(2),
      totalExpenses: parseFloat(transfer.totalExpenses || 0).toFixed(2),
      grandTotal: parseFloat(transfer.grandTotal || 0).toFixed(2),
      mrId: transfer.mrId || "",
    };
    setEditingTransfer(transfer);
    setForm(formData);

    if (activeTab === "mr" && isReceiveType(transfer.transferType)) {
      await loadMRStockForEdit(transfer.mrId, getMRName(transfer), clonedItems);
      setIsMrStockSelectModalOpen(true);
    } else {
      setMrStockDataForEdit([]);
      setMrStockSelectData([]);
      setCurrentMRInfo(null);
    }
    setIsEditModalOpen(true);
  };

  const openProductEditModal = (product, index) => {
    setCurrentProduct({
      ...product,
      productId:
        product.productId?._id ||
        product.productId ||
        product._id ||
        product.product?.value,
      _id: product.productId?._id || product.productId || product._id,
      productName: product.productName || product.product?.label,
      boxQuantity: product.boxQuantity || 0,
      lc: product.lc || 0,
      productCost: product.productCost || 0,
    });
    setCurrentProductIndex(index);
    setIsProductEditModalOpen(true);
  };

  const handleProductNumericChange = (e, isInteger = false) => {
    const { name, value } = e.target;
    if (isInteger) {
      if (value === "" || /^\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseInt(value) || 0;
        setCurrentProduct((prev) => {
          const u = { ...prev, [name]: processedValue };
          if (name === "boxQuantity")
            u.productCost = parseFloat(
              (
                (parseFloat(u.lc) || 0) * (parseInt(processedValue) || 0)
              ).toFixed(2),
            );
          return u;
        });
      }
    } else {
      if (value === "" || /^-?\d*\.?\d*$/.test(value)) {
        const processedValue = value === "" ? "" : parseFloat(value) || 0;
        setCurrentProduct((prev) => {
          const u = { ...prev, [name]: processedValue };
          if (name === "lc")
            u.productCost = parseFloat(
              (
                (parseFloat(processedValue) || 0) *
                (parseInt(u.boxQuantity) || 0)
              ).toFixed(2),
            );
          return u;
        });
      }
    }
  };

  const handleProductSelectChange = (selectedValue) => {
    const sel = productOptionsForEdit.find(
      (opt) => opt.value === selectedValue,
    );
    if (sel) {
      setCurrentProduct((prev) => ({
        ...prev,
        productId: selectedValue,
        _id: selectedValue,
        productName: sel.productName || sel.label,
        product: {
          value: selectedValue,
          label: sel.label,
          qtyPerCarton: sel.qtyPerCarton,
        },
        qtyPerCarton: sel.qtyPerCarton || 0,
        lc: sel.lc || 0,
        boxQuantity: prev.boxQuantity || 0,
        productCost: parseFloat(
          ((sel.lc || 0) * (prev.boxQuantity || 0)).toFixed(2),
        ),
      }));
    }
  };

  const updateProductInForm = () => {
    if (!currentProduct?.productName) {
      showToast("error", "Please select a product name");
      return;
    }
    setForm((prev) => {
      const updatedItems = [...prev.items];
      updatedItems[currentProductIndex] = {
        ...currentProduct,
        product: currentProduct.product || {
          value: currentProduct.productId,
          label: currentProduct.productName,
          qtyPerCarton: currentProduct.qtyPerCarton,
        },
        boxQuantity: parseInt(currentProduct.boxQuantity) || 0,
        openPieces: parseInt(currentProduct.openPieces) || 0,
        qtyPerCarton: parseInt(currentProduct.qtyPerCarton) || 0,
        totalPieces:
          (parseInt(currentProduct.boxQuantity) || 0) *
            (parseInt(currentProduct.qtyPerCarton) || 0) +
          (parseInt(currentProduct.openPieces) || 0),
        lc: parseFloat(currentProduct.lc) || 0,
        productCost: parseFloat(currentProduct.productCost) || 0,
      };
      return { ...prev, items: updatedItems };
    });
    showToast("success", "Product updated successfully");
    setIsProductEditModalOpen(false);
    setCurrentProduct(null);
    setCurrentProductIndex(null);
  };

  // ── Handle MR Name change in EDIT modal ───────────────────────────────────
  const handleMRNameChange = async (selectedValue) => {
    const sel = mrOptions.find((mr) => mr.value === selectedValue);
    const newMrName = sel?.label || "";
    setForm((prev) => ({
      ...prev,
      mrId: selectedValue,
      stockTransferToMr: newMrName,
      mrName: newMrName,
    }));
    if (
      activeTab === "mr" &&
      isReceiveType(form.transferType) &&
      selectedValue
    ) {
      await loadMRStockForEdit(selectedValue, newMrName, []);
      setIsMrStockSelectModalOpen(true);
    }
  };

  // ── Handle MR Name change in CREATE modal (from stockInMRHand list) ───────
  const handleCreateMRNameChange = async (selectedValue) => {
    const sel = mrOptionsFromStock.find((mr) => mr.value === selectedValue);
    const newMrName = sel?.label || "";
    setForm((prev) => ({
      ...prev,
      mrId: selectedValue,
      stockTransferToMr: newMrName,
      mrName: newMrName,
    }));
    if (isReceiveType(form.transferType) && selectedValue) {
      await loadMRStockForCreate(selectedValue, newMrName);
    }
  };

  // ── Handle Transfer Type change in CREATE modal ───────────────────────────
  const handleCreateTransferTypeChange = (e) => {
    const newType = e.target.value;
    setForm((prev) => ({ ...prev, transferType: newType }));
    // Clear MR stock data if switching away from receive
    if (!isReceiveType(newType)) {
      setCreateMRStockData([]);
      setCreateMRInfo(null);
    } else if (isReceiveType(newType) && form.mrId) {
      loadMRStockForCreate(form.mrId, form.mrName);
    }
  };

  // ── Update return qty in create modal ─────────────────────────────────────
  const handleCreateReturnQtyChange = (productId, value) => {
    const num = parseInt(value) || 0;
    setCreateMRStockData((prev) =>
      prev.map((p) =>
        p.productId === productId
          ? { ...p, returnQuantity: Math.min(num, p.quantity) }
          : p,
      ),
    );
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem("stockTransferActiveTab", tab);
    setSelectedRows([]);
    setCurrentPage(1);
    setSearchTerm("");
  };

  const handleNavigateToForm = async () => {
    try {
      const formTab = activeTab === "mr" ? "toMR" : "general";
      const nextNumber = await getNextStockTransferNumber();
      navigate("/createstocktransfer", {
        state: { nextStockTransferNo: nextNumber, activeTab: formTab },
      });
    } catch {
      showToast("error", "Failed to generate next stock transfer number");
      navigate("/createstocktransfer", {
        state: { activeTab: activeTab === "mr" ? "toMR" : "general" },
      });
    }
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setMrStockData([]);
    setCurrentMRInfo(null);
  };

  if (loading)
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="text-gray-600">Loading...</div>
      </div>
    );

  // ── Computed totals ────────────────────────────────────────────────────────
  const receiveSelectedItems = mrStockDataForEdit.filter(
    (p) => p.returnQuantity > 0,
  );
  const receiveSelectModalItems = mrStockSelectData.filter(
    (p) => p.returnQuantity > 0,
  );
  const receiveTotalValue = mrStockSelectData.reduce(
    (sum, p) => sum + p.lc * p.returnQuantity,
    0,
  );
  const editReceiveTotalValue = mrStockDataForEdit.reduce(
    (sum, p) => sum + p.lc * p.returnQuantity,
    0,
  );
  const createReceiveTotalValue = createMRStockData.reduce(
    (sum, p) => sum + p.lc * (p.returnQuantity || p.quantity || 0),
    0,
  );

  // Available product options for MR transfer add product modal (excluding already added)
  const mrAddProductOptions = getAvailableProductOptions(form.items, true);

  return (
    <div className="p-6">
      <div className="mb-4 text-gray-600 text-sm">
        Dashboard <span className="mx-2">{">"}</span> Stock Transfer
      </div>
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          Error: {error}
        </div>
      )}

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

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex gap-3">
          <button
            onClick={() => handleTabChange("general")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${activeTab === "general" ? "bg-indigo-600 text-white shadow-md" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            <Truck size={18} /> General Transfer
          </button>
          <button
            onClick={() => handleTabChange("mr")}
            className={`px-5 py-2 rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-2 ${activeTab === "mr" ? "bg-indigo-600 text-white shadow-md" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          >
            <Users size={18} /> Stock Transfer To MR
          </button>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <p className="text-base font-semibold text-gray-700 whitespace-nowrap">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
              {filteredTransfers.length}
            </span>
          </p>
          <div className="relative w-full lg:w-60">
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
                  ? "Search by Stock Transfer No, Remarks, Source/Destination"
                  : "Search by Stock Transfer No, Remarks, MR Name"
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

      {/* ── Main Table ───────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 min-w-[150px] text-sm font-medium">
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
                  <span>Stock Transfer No</span>
                </div>
              </th>
              <th className="p-3 min-w-[150px] text-sm font-medium">
                {activeTab === "general" ? "Source/Destination" : "MR Name"}
              </th>
              <th className="p-3 min-w-[100px] text-sm font-medium">Type</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">Date</th>
              <th className="p-3 min-w-[120px] text-sm font-medium">
                Total LC Cost ($)
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
                <td colSpan={8} className="p-4 text-center text-gray-500">
                  {searchTerm
                    ? "No matching records found"
                    : "No data available"}
                </td>
              </tr>
            ) : (
              currentTransfers.map((item, index) => {
                const productCount = Array.isArray(item.items)
                  ? new Set(
                      item.items.map((i) =>
                        String(i.productId?._id || i.productId),
                      ),
                    ).size
                  : 0;
                const displayTotal =
                  item.totalTransferCost ||
                  calculateTotalTransferCost(item.items);
                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${index + 1 === currentTransfers.length ? "" : "border-b"}`}
                  >
                    <td className="p-3 min-w-[150px]">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedRows.includes(item._id)}
                          onChange={() => handleSelectRow(item._id)}
                        />
                        <span className="font-medium text-indigo-600">
                          {item.invoiceNo || "N/A"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[150px]">
                      {activeTab === "general"
                        ? item.transferType === "send"
                          ? item.destination || "Main Warehouse"
                          : item.source || "Main Warehouse"
                        : getMRName(item)}
                    </td>
                    <td className="p-3 min-w-[100px]">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${item.transferType === "send" ? "bg-green-100 text-green-800" : isReceiveType(item.transferType) ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"}`}
                      >
                        {item.transferType === "send"
                          ? "Send"
                          : isReceiveType(item.transferType)
                            ? "Receive"
                            : activeTab === "mr"
                              ? "MR Transfer"
                              : "General"}
                      </span>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      {formatDateToReadable(item.date)}
                    </td>
                    <td className="p-3 min-w-[120px] font-medium">
                      <div className="flex items-center justify-center gap-1">
                        <DollarSign size={14} className="text-green-600" />
                        <span className="text-green-700">
                          {formatCurrency(displayTotal)}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 min-w-[120px]">
                      <div className="flex items-center justify-center gap-3">
                        <span className="font-medium">{productCount}</span>
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
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          className="text-green-600 hover:text-green-800 cursor-pointer"
                          onClick={() => handleEdit(item)}
                          title="Edit"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-800 cursor-pointer"
                          onClick={() => handleDeleteSingle(item)}
                          title="Delete"
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
          <div className="mt-4 p-5 flex flex-wrap justify-start gap-2">
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
                  className={`px-3 py-2 rounded-lg min-w-[40px] cursor-pointer ${currentPage === pg ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
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

      {/* ═══════════════════════════════════════════════════════════════════════
          MR STOCK SELECT MODAL (Edit flow)
      ════════════════════════════════════════════════════════════════════════ */}
      {isMrStockSelectModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex justify-center items-center z-[60]">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setIsMrStockSelectModalOpen(false)}
            />
            <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white">
                <div className="flex items-center gap-3">
                  <ArrowDownCircle size={22} />
                  <div>
                    <h2 className="text-lg font-semibold">
                      Select Return Quantities
                    </h2>
                    <p className="text-blue-100 text-xs">
                      Receive stock back from MR to warehouse
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMrStockSelectModalOpen(false)}
                  className="text-white hover:text-blue-200 cursor-pointer"
                >
                  <X size={22} />
                </button>
              </div>

              <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-4">
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base flex-shrink-0">
                  <User size={20} />
                </div>
                <div>
                  <p className="font-bold text-blue-900 text-base">
                    {currentMRInfo?.mrName ||
                      form.stockTransferToMr ||
                      form.mrName ||
                      "Medical Representative"}
                  </p>
                  {currentMRInfo?.mrId && (
                    <p className="text-xs text-blue-500 font-mono">
                      MR ID: {currentMRInfo.mrId}
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-0.5">
                    {mrStockSelectData.length} product(s) in hand
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingMRStockForEdit ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="text-gray-500 animate-pulse text-sm">
                      Loading MR stock...
                    </div>
                  </div>
                ) : mrStockSelectData.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <Package size={40} className="mx-auto mb-3 text-gray-300" />
                    <p>No products found for this MR.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-2 px-2">
                      <div className="col-span-4">Product</div>
                      <div className="col-span-2 text-center">Assigned</div>
                      <div className="col-span-2 text-center">Available</div>
                      <div className="col-span-2 text-center">LC ($)</div>
                      <div className="col-span-2 text-center">Return Qty</div>
                    </div>
                    {mrStockSelectData.map((product) => (
                      <div
                        key={product.productId}
                        className={`grid grid-cols-12 gap-2 items-center py-3 px-3 rounded-lg border transition-colors ${product.returnQuantity > 0 ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}
                      >
                        <div className="col-span-4">
                          <p className="font-medium text-gray-800 text-sm leading-tight">
                            {product.productName}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Total:{" "}
                            <span className="text-green-700 font-medium">
                              $
                              {formatCurrency(
                                product.lc * product.returnQuantity,
                              )}
                            </span>
                          </p>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-1 rounded-full">
                            {product.assignedQty}
                          </span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span
                            className={`inline-flex items-center justify-center text-xs font-semibold px-2 py-1 rounded-full ${product.availableQty > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                          >
                            {product.availableQty}
                          </span>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="text-sm text-gray-700 font-medium">
                            ${formatCurrency(product.lc)}
                          </span>
                        </div>
                        <div className="col-span-2 text-center">
                          <input
                            type="number"
                            min="0"
                            max={product.availableQty}
                            value={product.returnQuantity}
                            onChange={(e) =>
                              handleStockSelectReturnQtyChange(
                                product.productId,
                                e.target.value,
                              )
                            }
                            className={`w-full text-center border rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-400 outline-none ${product.returnQuantity > 0 ? "border-blue-400 bg-white font-semibold text-blue-700" : "border-gray-300 bg-white"} ${product.availableQty === 0 ? "opacity-40 cursor-not-allowed" : ""}`}
                            placeholder="0"
                            disabled={product.availableQty === 0}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between gap-4">
                <div className="text-sm text-gray-600">
                  <span className="font-semibold text-blue-700">
                    {receiveSelectModalItems.length}
                  </span>{" "}
                  product(s) selected ·{" "}
                  <span className="font-semibold text-green-700">
                    ${formatCurrency(receiveTotalValue)}
                  </span>{" "}
                  total value
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsMrStockSelectModalOpen(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmMrStockSelection}
                    disabled={receiveSelectModalItems.length === 0}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <ArrowDownCircle size={16} />
                    Confirm ({receiveSelectModalItems.length} products)
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── View Modal ────────────────────────────────────────────────────────── */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeViewModal}
            />
            <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={closeViewModal}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
              </h2>
              {activeTab === "mr" &&
                isReceiveType(form.transferType) &&
                mrStockLoading && (
                  <div className="text-center text-gray-500 py-2">
                    Loading MR stock details...
                  </div>
                )}
              {activeTab === "mr" && currentMRInfo && (
                <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-blue-900">
                      {currentMRInfo.mrName}
                    </p>
                    <p className="text-xs text-blue-500 font-mono">
                      MR ID: {currentMRInfo.mrId}
                    </p>
                  </div>
                  <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded-full capitalize">
                    {form.transferType}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Stock Transfer No
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600">
                    {form.invoiceNo || "-"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? formatDateToReadable(form.date) : "-"}
                  </p>
                </div>
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
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Transfer Type
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                        {isReceiveType(form.transferType) ? "Receive" : "Send"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR Name
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100">
                        {form.stockTransferToMr ||
                          form.stockTransferFromMrToMain ||
                          form.mrName ||
                          "-"}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        MR ID
                      </label>
                      <p className="border px-3 py-2 rounded-lg bg-gray-100 font-mono text-gray-600 text-xs">
                        {form.mrId || "-"}
                      </p>
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remarks || "-"}
                  </p>
                </div>

                {/* ── View: MR Receive type — show stockInMRHand table ─────────── */}
                {activeTab === "mr" && isReceiveType(form.transferType) ? (
                  <div className="md:col-span-2">
                    <h3 className="text-lg font-medium text-gray-800 mb-3">
                      Stock In MR Hand (qty &gt; 0)
                    </h3>
                    {mrStockLoading ? (
                      <div className="text-center py-4 text-gray-500 animate-pulse">
                        Loading MR stock...
                      </div>
                    ) : mrStockData.length === 0 ? (
                      <div className="text-center py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                        <Package
                          size={32}
                          className="mx-auto mb-2 text-gray-300"
                        />
                        No stock with quantity &gt; 0 found for this MR.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border rounded-lg">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50 text-blue-800">
                            <tr>
                              <th className="px-4 py-2 text-left font-semibold">
                                Product Name
                              </th>
                              <th className="px-4 py-2 text-center font-semibold">
                                Assigned Qty
                              </th>
                              <th className="px-4 py-2 text-center font-semibold">
                                Quantity (in hand)
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {mrStockData.map((p, idx) => (
                              <tr
                                key={p.productId || idx}
                                className={`border-t ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                              >
                                <td className="px-4 py-2 font-medium text-gray-800">
                                  {p.productName}
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className="inline-flex items-center justify-center bg-purple-100 text-purple-700 text-xs font-semibold px-2 py-1 rounded-full">
                                    {p.assignedQuantity || 0}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-center">
                                  <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">
                                    {p.quantity || 0}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Also show the transferred items */}
                    <h3 className="text-lg font-medium text-gray-800 mt-5 mb-3">
                      Returned Products ({form.items?.length || 0})
                    </h3>
                    <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                      {form.items && form.items.length > 0 ? (
                        form.items.map((item, index) => {
                          const productCost =
                            item.itemCost ||
                            (item.lc || 0) * (item.boxQuantity || 0);
                          return (
                            <div
                              key={item._id || index}
                              className="border-b pb-4 last:border-b-0 bg-blue-50 p-3 rounded-lg"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Product Name
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white">
                                    {item.productName || "-"}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Returned Qty
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                    <Box size={14} className="text-gray-500" />
                                    {item.boxQuantity || 0}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    LC ($)
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                    <DollarSign
                                      size={14}
                                      className="text-green-600"
                                    />
                                    {formatCurrency(item.lc)}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Total Cost ($)
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white font-medium text-green-700">
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
                ) : (
                  /* ── View: non-receive — normal items list ───────────────────── */
                  <div className="md:col-span-2">
                    <h3 className="text-lg font-medium text-gray-800 mb-3">
                      Products ({form.items?.length || 0})
                    </h3>
                    <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                      {form.items && form.items.length > 0 ? (
                        form.items.map((item, index) => {
                          const productCost =
                            item.itemCost ||
                            (item.lc || 0) * (item.boxQuantity || 0);
                          return (
                            <div
                              key={item._id || index}
                              className="border-b pb-4 last:border-b-0 bg-gray-50 p-3 rounded-lg"
                            >
                              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Product Name
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white">
                                    {item.productName || "-"}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Box Quantity
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                    <Box size={14} className="text-gray-500" />
                                    {item.boxQuantity || 0}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    LC ($)
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white flex items-center gap-1">
                                    <DollarSign
                                      size={14}
                                      className="text-green-600"
                                    />
                                    {formatCurrency(item.lc)}
                                  </p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-600">
                                    Total Cost ($)
                                  </label>
                                  <p className="px-3 py-2 rounded bg-white font-medium text-green-700">
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
                )}
              </div>
              <div className="mt-6 flex justify-end">
                <button
                  onClick={closeViewModal}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Edit Modal ────────────────────────────────────────────────────────── */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => {
                setIsEditModalOpen(false);
                setEditingTransfer(null);
              }}
            />
            <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingTransfer(null);
                }}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Edit{" "}
                {activeTab === "general" ? "Stock Transfer" : "MR Transfer"}
              </h2>

              {activeTab === "mr" && isReceiveType(form.transferType) && (
                <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-blue-900 text-sm">
                      {currentMRInfo?.mrName ||
                        form.stockTransferToMr ||
                        form.mrName ||
                        "Medical Representative"}
                    </p>
                    {(currentMRInfo?.mrId || form.mrId) && (
                      <p className="text-xs text-blue-500 font-mono">
                        MR ID: {currentMRInfo?.mrId || form.mrId}
                      </p>
                    )}
                  </div>
                  <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded-full">
                    Receive Transfer
                  </span>
                </div>
              )}

              <p className="text-sm text-gray-500 mb-4">
                Total products:{" "}
                <span className="font-semibold text-indigo-600">
                  {activeTab === "mr" && isReceiveType(form.transferType)
                    ? receiveSelectedItems.length
                    : form.items?.length || 0}
                </span>
              </p>
              <form className="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto">
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Stock Transfer No
                      </label>
                      <input
                        type="text"
                        name="invoiceNo"
                        value={form.invoiceNo || ""}
                        readOnly
                        className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-indigo-600"
                      />
                    </div>
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
                  </div>
                </div>
                <div className="md:col-span-1">
                  {activeTab === "general" ? (
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
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        MR Name
                      </label>
                      {/* Only show MR dropdown for non-receive; for receive show read-only */}
                      {isReceiveType(form.transferType) ? (
                        <input
                          type="text"
                          value={form.stockTransferToMr || form.mrName || ""}
                          readOnly
                          className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-700"
                        />
                      ) : (
                        <SearchableDropdown
                          value={form.mrId || ""}
                          onChange={(value) => handleMRNameChange(value)}
                          options={mrOptions}
                          placeholder={
                            isMrListEmpty ? "No MRs Available" : "Select MR"
                          }
                          required={true}
                          loading={mrListLoading}
                          disabled={isMrListEmpty}
                        />
                      )}
                    </div>
                  )}
                </div>
                {activeTab === "general" ? (
                  <div className="md:col-span-3">
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
                          placeholder="Enter source"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700">
                      MR ID (Reference)
                    </label>
                    <input
                      type="text"
                      name="mrId"
                      value={form.mrId || ""}
                      readOnly
                      className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-mono text-gray-600 text-xs"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Automatically linked to the selected MR
                    </p>
                  </div>
                )}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    readOnly
                    value={
                      activeTab === "mr" && isReceiveType(form.transferType)
                        ? editReceiveTotalValue.toFixed(2)
                        : calculateTotalTransferCost(form.items)
                    }
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated automatically (LC × Box Quantity)
                  </p>
                </div>
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
                    placeholder="Enter remarks"
                  />
                </div>

                {/* ── Products Section ─────────────────────────────────────────── */}
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-gray-800">
                      Products (
                      {activeTab === "mr" && isReceiveType(form.transferType)
                        ? receiveSelectedItems.length
                        : form.items?.length || 0}
                      )
                    </h3>
                    {activeTab === "mr" && isReceiveType(form.transferType) && (
                      <button
                        type="button"
                        onClick={() => setIsMrStockSelectModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                      >
                        <ArrowDownCircle size={14} /> Edit Stock Selection
                      </button>
                    )}
                  </div>

                  {activeTab === "mr" && isReceiveType(form.transferType) ? (
                    /* ── RECEIVE: show selected products from MR stock (NO Add Product) */
                    loadingMRStockForEdit ? (
                      <div className="text-center py-4 text-gray-500">
                        Loading MR stock...
                      </div>
                    ) : receiveSelectedItems.length === 0 ? (
                      <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                        <ArrowDownCircle
                          size={32}
                          className="mx-auto text-gray-400 mb-2"
                        />
                        <p className="text-gray-500 text-sm">
                          No products selected for return.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsMrStockSelectModalOpen(true)}
                          className="mt-2 text-blue-600 hover:underline text-sm cursor-pointer"
                        >
                          Click "Edit Stock Selection" to select products
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto border rounded-lg p-4">
                        {receiveSelectedItems.map((product) => (
                          <div
                            key={product.productId}
                            className="bg-blue-50 border border-blue-200 p-3 rounded-lg"
                          >
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                              <div className="md:col-span-2">
                                <p className="font-medium text-gray-800 text-sm">
                                  {product.productName}
                                </p>
                                <p className="text-xs text-gray-500">
                                  Available: {product.availableQty} · Assigned:{" "}
                                  {product.assignedQty} · LC: $
                                  {formatCurrency(product.lc)}
                                </p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-gray-500 mb-1">
                                  Return Qty
                                </p>
                                <span className="inline-flex items-center justify-center bg-blue-600 text-white text-sm font-bold px-3 py-1 rounded-full">
                                  {product.returnQuantity}
                                </span>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-500 mb-1">
                                  Total
                                </p>
                                <span className="text-sm font-semibold text-green-700">
                                  $
                                  {formatCurrency(
                                    product.lc * product.returnQuantity,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    /* ── SEND: editable items list WITH Add Products button ──────── */
                    <div>
                      <div className="space-y-4 max-h-60 overflow-y-auto border rounded-lg p-4">
                        {form.items && form.items.length > 0 ? (
                          form.items.map((item, index) => {
                            const productCost =
                              item.productCost ||
                              (item.lc || 0) * (item.boxQuantity || 0);
                            return (
                              <div
                                key={item._id || index}
                                className="border-b pb-4 last:border-b-0 bg-white p-4 rounded-lg shadow-sm"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h4 className="font-medium text-gray-800 capitalize">
                                      {item.productName || "Product"}
                                    </h4>
                                    <p className="text-sm text-gray-600">
                                      Boxes: {item.boxQuantity || 0} | LC:{" "}
                                      <span className="text-green-600 font-medium">
                                        ${formatCurrency(item.lc)}
                                      </span>{" "}
                                      | Total:{" "}
                                      <span className="text-green-700 font-medium">
                                        ${formatCurrency(productCost)}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openProductEditModal(item, index)
                                      }
                                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1 cursor-pointer"
                                    >
                                      <Pencil size={16} /> Edit Details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(index)}
                                      className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1 cursor-pointer"
                                    >
                                      <Trash2 size={16} /> Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-gray-500 text-center">No items</p>
                        )}
                      </div>
                      {/* Add Products button — only for send type */}
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={handleAddNewItem}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                        >
                          <Plus size={16} /> Add New Product
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-3 mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingTransfer(null);
                    }}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    onClick={(e) => handleUpdateTransfer(e, form)}
                  >
                    Update (
                    {activeTab === "mr" && isReceiveType(form.transferType)
                      ? receiveSelectedItems.length
                      : form.items?.length || 0}{" "}
                    products)
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Add Product Modal — MR Transfer (send type) ───────────────────────
          Uses separate MR list from stockInMRHand, LC from ReportInHand,
          text input for box qty (numeric only), selected products excluded
      ════════════════════════════════════════════════════════════════════════ */}
      {isAddProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsAddProductModalOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setIsAddProductModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Add New Product
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Current transfer has{" "}
                <span className="font-semibold text-indigo-600">
                  {form.items?.length || 0}
                </span>{" "}
                products.
                {activeTab === "mr" && mrAddProductOptions.length <= 1 && (
                  <span className="ml-1 text-orange-500 font-medium">
                    (All products already added)
                  </span>
                )}
              </p>
              <div className="space-y-4">
                {/* ── Product Dropdown (excludes already added products) ─────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  {activeTab === "mr" ? (
                    <>
                      <SearchableDropdown
                        value={newProductForm.productId}
                        onChange={(value) => handleNewProductSelectForMR(value)}
                        placeholder={
                          mrAddProductOptions.length <= 1
                            ? "All products added"
                            : "Select Product"
                        }
                        options={mrAddProductOptions}
                        required
                        disabled={mrAddProductOptions.length <= 1}
                      />
                      {newProductForm.productId && (
                        <p className="text-xs text-gray-500 mt-1">
                          Available:{" "}
                          {mrAddProductOptions.find(
                            (p) => p.value === newProductForm.productId,
                          )?.availableStock || 0}{" "}
                          boxes
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <SearchableDropdown
                        value={newProductForm.productId}
                        onChange={(value) => handleNewProductSelect(value)}
                        placeholder="Select Product"
                        options={productOptions}
                        required
                        disabled={productOptions.length === 0}
                      />
                      {newProductForm.productId && (
                        <p className="text-xs text-gray-500 mt-1">
                          Available:{" "}
                          {productOptions.find(
                            (p) => p.value === newProductForm.productId,
                          )?.availableStock || 0}{" "}
                          boxes | LC: $
                          {formatCurrency(
                            productOptions.find(
                              (p) => p.value === newProductForm.productId,
                            )?.lc || 0,
                          )}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* ── Box Quantity: text input, numeric only ─────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Box Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newProductForm.boxQuantity}
                    onChange={handleNewProductBoxQuantityChange}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Enter box quantity (numbers only)"
                  />
                  {newProductForm.boxQuantity !== "" &&
                    !/^\d+$/.test(String(newProductForm.boxQuantity)) && (
                      <p className="text-xs text-red-500 mt-1">
                        Only whole numbers allowed
                      </p>
                    )}
                </div>

                {/* ── LC: auto-filled from ReportInHand ─────────────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    LC ($) Per Box
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={
                        lcLoading
                          ? "Loading..."
                          : newProductForm.lc !== "" && newProductForm.lc !== 0
                            ? `$${formatCurrency(newProductForm.lc)}`
                            : "$0.00"
                      }
                      className={`w-full border px-3 py-2 rounded-lg text-green-700 ${lcLoading ? "bg-yellow-50 border-yellow-300" : "bg-gray-100"}`}
                      readOnly
                      disabled
                    />
                    {lcLoading && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-yellow-600 animate-pulse">
                        Fetching LC...
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {activeTab === "mr"
                      ? "Auto-filled from ReportInHand batches"
                      : "Auto-filled from product batches data"}
                  </p>
                </div>

                {/* ── Total LC Cost (per product, calculated) ───────────────── */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="text"
                    value={`$${formatCurrency(newProductForm.productCost)}`}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: LC × Box Quantity ={" "}
                    <span className="font-semibold text-green-700">
                      ${formatCurrency(parseFloat(newProductForm.lc) || 0)} ×{" "}
                      {parseInt(newProductForm.boxQuantity, 10) || 0} = $
                      {formatCurrency(newProductForm.productCost)}
                    </span>
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-gray-300 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddProductModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed"
                  onClick={handleAddProductToForm}
                  disabled={
                    !newProductForm.productId ||
                    !newProductForm.boxQuantity ||
                    !/^\d+$/.test(String(newProductForm.boxQuantity)) ||
                    parseInt(newProductForm.boxQuantity, 10) <= 0 ||
                    lcLoading
                  }
                >
                  Add Product
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Product Edit Modal ────────────────────────────────────────────────── */}
      {isProductEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsProductEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setIsProductEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Product
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <SearchableDropdown
                    value={currentProduct?.productId || ""}
                    onChange={(value) => handleProductSelectChange(value)}
                    options={productOptionsForEdit}
                    placeholder="Select Product"
                    required
                    disabled={productOptionsForEdit.length === 0}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Box Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="boxQuantity"
                    value={currentProduct?.boxQuantity || ""}
                    onChange={(e) => handleProductNumericChange(e, true)}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    LC ($) Per Box <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="lc"
                    value={currentProduct?.lc || ""}
                    onChange={(e) => handleProductNumericChange(e, false)}
                    className="w-full border px-3 py-2 rounded-lg border-gray-300 text-green-700"
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Landed Cost per box from product batches
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Total LC Cost ($)
                  </label>
                  <input
                    type="text"
                    value={`$${formatCurrency(currentProduct?.productCost || 0)}`}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 font-medium text-green-700"
                    readOnly
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Calculated: LC × Box Quantity
                  </p>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:bg-blue-400 disabled:cursor-not-allowed"
                  onClick={updateProductInForm}
                  disabled={
                    !currentProduct?.productName ||
                    !currentProduct?.boxQuantity ||
                    currentProduct?.boxQuantity <= 0
                  }
                >
                  Update Product
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Product View Modal ────────────────────────────────────────────────── */}
      {isProductModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsProductModalOpen(false)}
            />
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-lg relative flex flex-col border border-gray-200">
              <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center gap-3">
                  {productModalIsReceive ? (
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
                      <ArrowDownCircle size={18} />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-purple-600 text-white flex items-center justify-center flex-shrink-0">
                      <Package size={18} />
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-semibold text-gray-800">
                      {productModalIsReceive
                        ? "Returned Products"
                        : "Product Details with LC (Landed Cost)"}
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {productModalIsReceive
                        ? "Stock received back from MR to warehouse"
                        : "Products included in this transfer"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsProductModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {productModalLoading ? (
                  <div className="flex justify-center items-center h-40">
                    <div className="text-gray-500 animate-pulse">
                      Loading...
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
                    <table className="w-full min-w-max border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
                      <thead
                        className={`border-b ${productModalIsReceive ? "bg-blue-50 text-blue-800" : "bg-gray-100 text-gray-700"}`}
                      >
                        <tr>
                          <th className="p-3 min-w-[200px] text-sm font-medium text-left">
                            Product Name
                          </th>
                          <th className="p-3 min-w-[140px] text-sm font-medium">
                            {productModalIsReceive
                              ? "Returned Qty"
                              : "Box Quantity"}
                          </th>
                          <th className="p-3 min-w-[120px] text-sm font-medium">
                            LC ($) Per Box
                          </th>
                          <th className="p-3 min-w-[140px] text-sm font-medium">
                            Total LC Cost ($)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedProducts.length > 0 ? (
                          <>
                            {selectedProducts.map((product, index) => {
                              const productCost =
                                product.productCost ||
                                (product.lc || 0) * (product.boxQuantity || 0);
                              return (
                                <tr
                                  key={product._id || index}
                                  className={`hover:bg-gray-50 ${index + 1 === selectedProducts.length ? "" : "border-b"} ${productModalIsReceive ? "bg-blue-50/30" : ""}`}
                                >
                                  <td className="p-3 min-w-[200px] capitalize text-left font-medium text-gray-800">
                                    {product.productName || "-"}
                                  </td>
                                  <td className="p-3 min-w-[140px]">
                                    <div className="flex items-center justify-center gap-1">
                                      {productModalIsReceive ? (
                                        <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 text-xs font-semibold px-3 py-1 rounded-full gap-1">
                                          <ArrowDownCircle size={12} />
                                          {product.boxQuantity || 0}
                                        </span>
                                      ) : (
                                        <>
                                          <Box
                                            size={14}
                                            className="text-gray-500"
                                          />
                                          {product.boxQuantity || 0}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                  <td className="p-3 min-w-[120px]">
                                    <div className="flex items-center justify-center gap-1">
                                      <DollarSign
                                        size={14}
                                        className="text-green-600"
                                      />
                                      {formatCurrency(product.lc)}
                                    </div>
                                  </td>
                                  <td className="p-3 min-w-[140px] font-medium">
                                    <div className="flex items-center justify-center gap-1">
                                      <DollarSign
                                        size={14}
                                        className="text-green-700"
                                      />
                                      {formatCurrency(productCost)}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            <tr
                              className={`font-semibold border-t-2 ${productModalIsReceive ? "bg-blue-50" : "bg-gray-50"}`}
                            >
                              <td
                                className="p-3 min-w-[200px] text-right"
                                colSpan={3}
                              >
                                {productModalIsReceive
                                  ? "Total Return Value:"
                                  : "Total:"}
                              </td>
                              <td className="p-3 min-w-[140px]">
                                <div className="flex items-center justify-center gap-1">
                                  <DollarSign
                                    size={14}
                                    className={
                                      productModalIsReceive
                                        ? "text-blue-700"
                                        : "text-green-800"
                                    }
                                  />
                                  <span
                                    className={
                                      productModalIsReceive
                                        ? "text-blue-700"
                                        : "text-green-800"
                                    }
                                  >
                                    {formatCurrency(
                                      selectedProducts.reduce(
                                        (sum, p) =>
                                          sum +
                                          (p.productCost ||
                                            (p.lc || 0) * (p.boxQuantity || 0)),
                                        0,
                                      ),
                                    )}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td
                              colSpan={4}
                              className="p-8 text-center text-gray-500"
                            >
                              <Package
                                size={36}
                                className="mx-auto mb-2 text-gray-300"
                              />
                              No products found in this transfer
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
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
          document.body,
        )}
    </div>
  );
};

export default StockTransfer;
