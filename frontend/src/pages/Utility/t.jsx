import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Plus,
  Trash2,
  Eye,
  X,
  Package,
  Box,
  ArrowDownCircle,
  ArrowUpCircle,
  User,
  ChevronLeft,
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../utils/toast.jsx";
import SearchableDropdown from "../components/common/SearchableDropdown";
import * as XLSX from "xlsx";

const backendUrl = import.meta.env.VITE_BACKEND_URL;



// Main Component
const CreateStockTransfer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);

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

  const [products, setProducts] = useState([]);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewProductData, setViewProductData] = useState(null);

  const [sendMrTableData, setSendMrTableData] = useState([]);
  const [allSendProducts, setAllSendProducts] = useState([]);

  const [showAddRow, setShowAddRow] = useState(false);
  const [addRowProductId, setAddRowProductId] = useState("");
  const [addRowQty, setAddRowQty] = useState("");

  const [sendMrList, setSendMrList] = useState([]);
  const [sendMrListLoading, setSendMrListLoading] = useState(true);
  const [receiveMrList, setReceiveMrList] = useState([]);
  const [receiveMrListLoading, setReceiveMrListLoading] = useState(false);
  const [mrStockData, setMrStockData] = useState([]);
  const [mrStockLoading, setMrStockLoading] = useState(false);
  const [mrInfo, setMrInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [excelMode, setExcelMode] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelParsing, setExcelParsing] = useState(false);
  const [excelErrors, setExcelErrors] = useState([]);
  const [excelImported, setExcelImported] = useState(false);

  // Fetch invoice number
  useEffect(() => {
    if (!form.invoiceNo) fetchNextInvoiceNo();
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
    } catch {}
  };

  // Fetch MR Lists
  useEffect(() => {
    const fetchSendMRList = async () => {
      try {
        setSendMrListLoading(true);
        const res = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs-list`);
        setSendMrList(res.data || []);
      } catch {
        setSendMrList([]);
      } finally {
        setSendMrListLoading(false);
      }
    };
    fetchSendMRList();
  }, []);

  useEffect(() => {
    if (activeTab !== "toMR") return;
    const fetchReceiveMRList = async () => {
      try {
        setReceiveMrListLoading(true);
        const res = await axios.get(`${backendUrl}/api/stock-transfer-to-mr/mrs`);
        setReceiveMrList(res.data?.data || []);
      } catch {
        setReceiveMrList([]);
      } finally {
        setReceiveMrListLoading(false);
      }
    };
    fetchReceiveMRList();
  }, [activeTab]);

  const mrOptions = useMemo(() => {
    if (isReceiveType(form.transferType)) {
      return receiveMrList.map((mr) => ({
        value: mr.mrId?.toString() || mr.mrName,
        label: mr.mrName || `MR ${mr.mrId}`,
        mrId: mr.mrId?.toString(),
        mrName: mr.mrName,
      }));
    } else {
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

  // Fetch Products
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

  const fetchMRStock = useCallback(async (mrId, mrName) => {
    if (!mrId) {
      setMrStockData([]);
      setMrInfo(null);
      return;
    }
    setMrStockLoading(true);
    try {
      const res = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mr-stock-by-mr-id/${mrId}`
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
        }))
      );
    } catch {
      showToast("error", "Could not load MR stock");
      setMrStockData([]);
      setMrInfo(null);
    } finally {
      setMrStockLoading(false);
    }
  }, []);

  const buildSendTableFromProducts = useCallback((productList) => {
    return productList
      .filter((p) => (p.totalBoxes || 0) > 0)
      .map((p) => ({
        productId: p._id,
        productName: p.productName,
        totalBoxes: p.totalBoxes || 0,
        lc: p.lc || 0,
        sendQuantity: 0,
      }));
  }, []);

  const handleMRSelect = async (selectedValue) => {
    const sel = mrOptions.find((m) => m.value === selectedValue);
    const mrName = sel?.mrName || sel?.label || "";
    const actualMrId = sel?.mrId || selectedValue;

    setForm((prev) => ({
      ...prev,
      mrId: actualMrId,
      mrName,
      items: [],
      stockTransferToMr: isReceiveType(prev.transferType) ? "" : mrName,
      stockTransferFromMrToMain: isReceiveType(prev.transferType) ? mrName : "",
    }));

    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    setShowAddRow(false);
    setAddRowProductId("");
    setAddRowQty("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (isReceiveType(form.transferType) && actualMrId) {
      setSendMrTableData([]);
      setAllSendProducts([]);
      await fetchMRStock(actualMrId, mrName);
    } else if (!isReceiveType(form.transferType) && actualMrId) {
      setMrStockData([]);
      setMrInfo(null);
      if (!excelMode) {
        const rows = buildSendTableFromProducts(products);
        setSendMrTableData(rows);
        setAllSendProducts(rows.map((r) => ({ ...r })));
      } else {
        setSendMrTableData([]);
        setAllSendProducts([]);
      }
    } else {
      setMrStockData([]);
      setMrInfo(null);
      setSendMrTableData([]);
      setAllSendProducts([]);
    }
  };

  const handleTransferTypeChange = (e) => {
    const newType = e.target.value;
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
    setSendMrTableData([]);
    setAllSendProducts([]);
    setShowAddRow(false);
    setAddRowProductId("");
    setAddRowQty("");
    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // FIXED: Send Quantity Change Handler
  const handleSendQtyChange = useCallback((productId, rawValue) => {
    const numericStr = rawValue.replace(/[^0-9]/g, "");

    setSendMrTableData((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;

        let newQty = 0;
        if (numericStr !== "") {
          const parsed = parseInt(numericStr, 10);
          newQty = Math.min(Math.max(0, parsed), p.totalBoxes || 0);
        }
        return { ...p, sendQuantity: newQty };
      })
    );
  }, []);

  const handleRemoveSendItem = (productId) => {
    setSendMrTableData((prev) => prev.filter((p) => p.productId !== productId));
  };

  const deletedSendProductOptions = useMemo(() => {
    const visibleIds = new Set(sendMrTableData.map((p) => p.productId));
    return [
      { value: "", label: "Select product to restore" },
      ...allSendProducts
        .filter((p) => !visibleIds.has(p.productId))
        .map((p) => ({
          value: p.productId,
          label: `${p.productName} (Stock: ${p.totalBoxes || 0})`,
          productName: p.productName,
          lc: p.lc || 0,
          totalBoxes: p.totalBoxes || 0,
        })),
    ];
  }, [allSendProducts, sendMrTableData]);

  const hasDeletedSendRows = useMemo(
    () => deletedSendProductOptions.length > 1,
    [deletedSendProductOptions]
  );

  const handleConfirmAddRow = () => {
    if (!addRowProductId) {
      showToast("error", "Please select a product");
      return;
    }
    const qty = parseInt(addRowQty, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast("error", "Please enter a valid quantity");
      return;
    }
    const sel = deletedSendProductOptions.find((o) => o.value === addRowProductId);
    if (!sel) return;
    if (qty > sel.totalBoxes) {
      showToast("error", `Qty cannot exceed available stock (${sel.totalBoxes})`);
      return;
    }
    setSendMrTableData((prev) => [
      ...prev,
      {
        productId: addRowProductId,
        productName: sel.productName,
        totalBoxes: sel.totalBoxes,
        lc: sel.lc || 0,
        sendQuantity: qty,
      },
    ]);
    setAddRowProductId("");
    setAddRowQty("");
    setShowAddRow(false);
    showToast("success", "Product restored");
  };

  const handleReturnQtyChange = (productId, rawValue) => {
    const numericStr = rawValue.replace(/[^0-9]/g, "");
    const numeric = numericStr === "" ? 0 : parseInt(numericStr, 10);
    setMrStockData((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;
        const clamped = Math.min(Math.max(0, numeric), p.quantity);
        return { ...p, returnQuantity: clamped };
      })
    );
  };

  const selectedReturnItems = useMemo(
    () => mrStockData.filter((p) => (p.returnQuantity || 0) > 0),
    [mrStockData]
  );

  const selectedSendItems = useMemo(
    () => sendMrTableData.filter((p) => (p.sendQuantity || 0) > 0),
    [sendMrTableData]
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "invoiceNo") return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const [selectedProductId, setSelectedProductId] = useState("");

  const generalProductOptions = useMemo(() => {
    const addedIds = new Set(form.items.map((i) => i.productId));
    return [
      { value: "", label: "Search and select products..." },
      ...products
        .filter((p) => (p.totalBoxes || 0) > 0 && !addedIds.has(p._id))
        .map((p) => ({
          value: p._id,
          label: `${p.productName} (Stock: ${p.totalBoxes || 0})`,
          productName: p.productName,
          lc: p.lc || 0,
          totalBoxes: p.totalBoxes || 0,
        })),
    ];
  }, [products, form.items]);

  const handleAddProductGeneral = () => {
    if (!selectedProductId) {
      showToast("error", "Please select a product");
      return;
    }
    const sel = generalProductOptions.find((p) => p.value === selectedProductId);
    if (!sel || !sel.value) return;

    setForm((prev) => {
      const existing = prev.items.findIndex((i) => i.productId === selectedProductId);
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

  const handleItemQtyChange = (index, rawValue) => {
    const numericStr = rawValue.replace(/[^0-9]/g, "");
    const qty = numericStr === "" ? 0 : parseInt(numericStr, 10);
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

  const handleExcelModeToggle = (enabled) => {
    setExcelMode(enabled);
    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    setShowAddRow(false);
    setAddRowProductId("");
    setAddRowQty("");
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (enabled) {
      setSendMrTableData([]);
      setAllSendProducts([]);
    } else if (form.mrId) {
      const rows = buildSendTableFromProducts(products);
      setSendMrTableData(rows);
      setAllSendProducts(rows.map((r) => ({ ...r })));
    } else {
      setSendMrTableData([]);
      setAllSendProducts([]);
    }
  };

  const handleTemplateDownload = () => {
    const availableProds = products.filter((p) => (p.totalBoxes || 0) > 0);
    downloadExcelTemplate(availableProds);
    showToast("success", "Template downloaded successfully!");
  };

  





  // Send Product Table



};

export default CreateStockTransfer;