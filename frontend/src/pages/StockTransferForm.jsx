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
  DollarSign,
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

// ─────────────────────────────────────────────────────────────────────────────
// Excel Template Download Helper
// ─────────────────────────────────────────────────────────────────────────────
const downloadExcelTemplate = (availableProducts = []) => {
  const wb = XLSX.utils.book_new();

  const templateHeaders = [["Product Name", "Send Quantity"]];
  const templateRows =
    availableProducts.length > 0
      ? availableProducts.map((p) => [p.productName, 0])
      : [
          ["Example Product A", 5],
          ["Example Product B", 10],
        ];

  const templateData = [...templateHeaders, ...templateRows];
  const ws = XLSX.utils.aoa_to_sheet(templateData);
  ws["!cols"] = [{ wch: 40 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, "Transfer Data");

  const instructions = [
    ["STOCK TRANSFER TO MR — EXCEL UPLOAD INSTRUCTIONS"],
    [""],
    ["HOW TO USE THIS TEMPLATE:"],
    ["1. Fill in the 'Send Quantity' column in the 'Transfer Data' sheet."],
    ["2. Do NOT change the 'Product Name' column headers."],
    ["3. Only rows with Send Quantity > 0 will be imported."],
    ["4. Save the file and upload it on the Create Stock Transfer page."],
    ["5. You can delete rows for products you don't want to send."],
    [""],
    ["COLUMNS EXPLAINED:"],
    ["Product Name", "Name of the product (must match exactly)"],
    ["Send Quantity", "Number of boxes to send to the MR (integer, ≥ 0)"],
    [""],
    [
      "NOTE: Products listed are those currently available in the warehouse (stock > 0).",
    ],
  ];
  const wsInstr = XLSX.utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 55 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "Instructions");

  XLSX.writeFile(wb, "StockTransferToMR_Template.xlsx");
};

// ─────────────────────────────────────────────────────────────────────────────
// Parse uploaded Excel file → array of { productName, sendQuantity }
// ─────────────────────────────────────────────────────────────────────────────
const parseExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });

        const sheetName = wb.SheetNames.includes("Transfer Data")
          ? "Transfer Data"
          : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

        const parsed = [];
        for (const row of rows) {
          const keys = Object.keys(row);
          const nameKey = keys.find((k) =>
            k.trim().toLowerCase().includes("product name"),
          );
          const qtyKey = keys.find((k) =>
            k.trim().toLowerCase().includes("quantity"),
          );

          if (!nameKey || !qtyKey) continue;

          const productName = String(row[nameKey] || "").trim();
          const rawQty = row[qtyKey];
          const sendQuantity = parseInt(
            String(rawQty).replace(/[^0-9]/g, ""),
            10,
          );

          if (!productName) continue;
          if (isNaN(sendQuantity) || sendQuantity <= 0) continue;

          parsed.push({ productName, sendQuantity });
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
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
  const [selectedProductId, setSelectedProductId] = useState("");
  const [viewModalOpen, setViewModalOpen] = useState(false);

  // ── SEND: only products the user explicitly adds (sendQuantity > 0) ────
  // sendMrTableData holds ONLY the rows the user has added/imported
  const [sendMrTableData, setSendMrTableData] = useState([]);

  const [sendMrList, setSendMrList] = useState([]);
  const [sendMrListLoading, setSendMrListLoading] = useState(true);
  const [receiveMrList, setReceiveMrList] = useState([]);
  const [receiveMrListLoading, setReceiveMrListLoading] = useState(false);

  const [mrStockData, setMrStockData] = useState([]);
  const [mrStockLoading, setMrStockLoading] = useState(false);
  const [mrInfo, setMrInfo] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  // ── Excel upload state ──────────────────────────────────────────────────
  const [excelMode, setExcelMode] = useState(false);
  const [excelFile, setExcelFile] = useState(null);
  const [excelParsing, setExcelParsing] = useState(false);
  const [excelErrors, setExcelErrors] = useState([]);
  const [excelImported, setExcelImported] = useState(false);

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

  // ── Fetch Send MR list ──────────────────────────────────────────────────
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

  // ── Fetch Receive MR list ───────────────────────────────────────────────
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

  // ── Fetch products ──────────────────────────────────────────────────────
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

  // ── Fetch MR Stock (receive) ────────────────────────────────────────────
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

      // Only show products with quantity > 0, and pre-fill returnQuantity = quantity (full return)
      const filtered = allProducts.filter((p) => (p.quantity || 0) > 0);
      setMrStockData(
        filtered.map((p) => ({
          productId: p.productId,
          productName: p.productName,
          assignedQuantity: p.assignedQuantity || 0,
          quantity: p.quantity || 0,
          lc: p.lc || 0,
          // ✅ Pre-fill full return quantity so all products are returned by default
          returnQuantity: p.quantity || 0,
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
      items: [],
      stockTransferToMr: isReceiveType(prev.transferType) ? "" : mrName,
      stockTransferFromMrToMain: isReceiveType(prev.transferType) ? mrName : "",
    }));

    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (isReceiveType(form.transferType) && actualMrId) {
      setSendMrTableData([]);
      await fetchMRStock(actualMrId, mrName);
    } else if (!isReceiveType(form.transferType) && actualMrId) {
      setMrStockData([]);
      setMrInfo(null);
      // ✅ Start with empty table — user adds products manually or via Excel
      setSendMrTableData([]);
    } else {
      setMrStockData([]);
      setMrInfo(null);
      setSendMrTableData([]);
    }
  };

  // ── Handle Transfer Type change ─────────────────────────────────────────
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
    setSelectedProductId("");
    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Send qty change ─────────────────────────────────────────────────────
  const handleSendQtyChange = (productId, rawValue) => {
    const numeric = rawValue.replace(/[^0-9]/g, "");
    setSendMrTableData((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;
        if (numeric === "") {
          return { ...p, sendQuantity: 0, sendQuantityDisplay: "" };
        }
        const parsed = parseInt(numeric, 10);
        const clamped = Math.min(Math.max(0, parsed), p.totalBoxes);
        return {
          ...p,
          sendQuantity: clamped,
          sendQuantityDisplay: String(clamped),
        };
      }),
    );
  };

  const handleRemoveSendItem = (productId) => {
    setSendMrTableData((prev) => prev.filter((p) => p.productId !== productId));
  };

  // ── Product dropdown (excludes already-added products) ──────────────────
  const productOptions = useMemo(() => {
    const tableIds = new Set(sendMrTableData.map((p) => p.productId));
    return [
      { value: "", label: "Search and select products..." },
      ...products
        .filter((p) => (p.totalBoxes || 0) > 0 && !tableIds.has(p._id))
        .map((p) => ({
          value: p._id,
          label: `${p.productName} (Stock: ${p.totalBoxes || 0})`,
          productName: p.productName,
          lc: p.lc || 0,
          totalBoxes: p.totalBoxes || 0,
        })),
    ];
  }, [products, sendMrTableData]);

  // ── Add product to send table ───────────────────────────────────────────
  const handleAddProduct = () => {
    if (!selectedProductId) {
      showToast("error", "Please select a product");
      return;
    }
    const sel = productOptions.find((p) => p.value === selectedProductId);
    if (!sel || !sel.value) return;
    const alreadyExists = sendMrTableData.some(
      (p) => p.productId === selectedProductId,
    );
    if (alreadyExists) {
      showToast("info", "Product already in the table.");
      return;
    }
    setSendMrTableData((prev) => [
      ...prev,
      {
        productId: sel.value,
        productName: sel.productName,
        totalBoxes: sel.totalBoxes,
        lc: sel.lc || 0,
        sendQuantity: 1,
        sendQuantityDisplay: "1",
      },
    ]);
    setSelectedProductId("");
  };

  // ── Return qty change (receive) ─────────────────────────────────────────
  const handleReturnQtyChange = (productId, rawValue) => {
    const numeric = rawValue.replace(/[^0-9]/g, "");
    setMrStockData((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;
        if (numeric === "") {
          return { ...p, returnQuantity: 0, returnQuantityDisplay: "" };
        }
        const parsed = parseInt(numeric, 10);
        const clamped = Math.min(Math.max(0, parsed), p.quantity);
        return {
          ...p,
          returnQuantity: clamped,
          returnQuantityDisplay: String(clamped),
        };
      }),
    );
  };

  // ✅ All products in mrStockData already have quantity > 0 (filtered on fetch)
  // returnQuantity is pre-filled to full quantity, so all are selected by default
  const selectedReturnItems = useMemo(
    () => mrStockData.filter((p) => (p.returnQuantity || 0) > 0),
    [mrStockData],
  );

  // ✅ Only products with sendQuantity > 0 (user explicitly set)
  const selectedSendItems = useMemo(
    () => sendMrTableData.filter((p) => (p.sendQuantity || 0) > 0),
    [sendMrTableData],
  );

  // ── Form change ─────────────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "invoiceNo") return;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ── General tab product handling ────────────────────────────────────────
  const handleAddProductGeneral = () => {
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

  // ── Excel Upload Handlers ───────────────────────────────────────────────
  const handleExcelModeToggle = (enabled) => {
    setExcelMode(enabled);
    setExcelFile(null);
    setExcelErrors([]);
    setExcelImported(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!enabled) {
      // ✅ When switching back to manual, clear imported items (no stale data)
      setSendMrTableData([]);
    }
  };

  const handleTemplateDownload = () => {
    const availableProds = products.filter((p) => (p.totalBoxes || 0) > 0);
    downloadExcelTemplate(availableProds);
    showToast("success", "Template downloaded successfully!");
  };

  const handleExcelFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isValidType =
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls");

    if (!isValidType) {
      showToast("error", "Please upload a valid Excel file (.xlsx or .xls)");
      return;
    }

    setExcelFile(file);
    setExcelParsing(true);
    setExcelErrors([]);
    setExcelImported(false);

    try {
      const parsedRows = await parseExcelFile(file);

      if (parsedRows.length === 0) {
        showToast("error", "No valid rows found. Make sure Send Quantity > 0.");
        setExcelParsing(false);
        return;
      }

      const warehouseMap = new Map();
      products.forEach((p) => {
        warehouseMap.set(p.productName.trim().toLowerCase(), p);
      });

      const matched = [];
      const errors = [];

      for (const row of parsedRows) {
        const key = row.productName.toLowerCase();
        const warehouseProd = warehouseMap.get(key);

        if (!warehouseProd) {
          errors.push({
            productName: row.productName,
            reason: "Product not found in warehouse",
          });
          continue;
        }
        if ((warehouseProd.totalBoxes || 0) <= 0) {
          errors.push({
            productName: row.productName,
            reason: "No stock available in warehouse",
          });
          continue;
        }

        const clamped = Math.min(row.sendQuantity, warehouseProd.totalBoxes);
        if (clamped < row.sendQuantity) {
          errors.push({
            productName: row.productName,
            reason: `Requested ${row.sendQuantity} but only ${warehouseProd.totalBoxes} available — clamped to ${clamped}`,
          });
        }

        // ✅ Only add rows where sendQuantity > 0 after clamping
        if (clamped > 0) {
          matched.push({
            productId: warehouseProd._id,
            productName: warehouseProd.productName,
            totalBoxes: warehouseProd.totalBoxes,
            lc: warehouseProd.lc || 0,
            sendQuantity: clamped,
            sendQuantityDisplay: String(clamped),
          });
        }
      }

      if (matched.length === 0) {
        showToast(
          "error",
          "No products from the Excel file matched warehouse stock.",
        );
        setExcelErrors(errors);
        setExcelParsing(false);
        return;
      }

      // ✅ Replace table with ONLY matched rows (all have sendQuantity > 0)
      setSendMrTableData(matched);

      setExcelErrors(errors);
      setExcelImported(true);
      showToast(
        "success",
        `Imported ${matched.length} product(s) from Excel${errors.length > 0 ? ` (${errors.length} skipped)` : ""}`,
      );
    } catch (err) {
      showToast(
        "error",
        "Failed to parse Excel file. Please check the format.",
      );
      console.error(err);
    } finally {
      setExcelParsing(false);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    const isReceive = isReceiveType(form.transferType) && activeTab === "toMR";
    const isSendToMR =
      !isReceiveType(form.transferType) && activeTab === "toMR";

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
    } else if (isSendToMR) {
      if (selectedSendItems.length === 0) {
        showToast("error", "Please set send quantity for at least one product");
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
      // ── Excel mode: send as multipart/form-data to /import-excel ─────
      if (excelMode && excelFile && isSendToMR) {
        const formData = new FormData();
        formData.append("file", excelFile);
        formData.append("mrId", form.mrId);
        formData.append("mrName", form.mrName);
        formData.append("date", form.date);
        formData.append("remarks", form.remarks || "");
        formData.append("invoiceNo", form.invoiceNo || "");

        const res = await axios.post(
          `${backendUrl}/api/stock-transfer-to-mr/import-excel`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "multipart/form-data",
            },
          },
        );

        if (res.data.warnings?.length > 0) {
          showToast(
            "info",
            `Transfer created with ${res.data.warnings.length} warning(s). Some quantities were adjusted.`,
          );
        } else {
          showToast(
            "success",
            "Stock transfer created from Excel successfully!",
          );
        }

        navigate("/stocktransfer", { state: { activeTab: "mr" } });
        return;
      }

      // ── Manual / Receive mode: send as JSON ───────────────────────────
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
          : selectedSendItems.map((p) => ({
              productId: p.productId,
              productName: p.productName,
              boxQuantity: p.sendQuantity,
              lc: p.lc,
              productCost: p.lc * p.sendQuantity,
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
  const isMRSend = activeTab === "toMR" && !isReceiveType(form.transferType);

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
              setSendMrTableData([]);
              setExcelFile(null);
              setExcelErrors([]);
              setExcelImported(false);
              setExcelMode(false);
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
              setSendMrTableData([]);
              setExcelFile(null);
              setExcelErrors([]);
              setExcelImported(false);
              setExcelMode(false);
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

          {/* Row 2: Date + MR Name / Source/Dest */}
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

          {/* ── MR RECEIVE ──────────────────────────────────────────────── */}
          {isMRReceive && (
            <div>
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
                      Receiving all stock back from MR to warehouse
                    </p>
                  </div>
                  <span className="ml-auto text-xs bg-blue-600 text-white px-2 py-1 rounded-full">
                    Receive Transfer
                  </span>
                </div>
              )}

              <h3 className="text-base font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <ArrowDownCircle size={18} className="text-blue-600" />
                Stock Being Returned to Warehouse
                {mrStockData.length > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-1">
                    {mrStockData.length} product(s) — all will be returned
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
                    No products with stock found for this MR
                  </p>
                </div>
              ) : (
                <>
                  {/* Info banner — all stock will be returned */}
                  <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
                    <AlertCircle
                      size={14}
                      className="flex-shrink-0 text-amber-500"
                    />
                    <span>
                      All products below will be returned to the warehouse. You
                      can adjust individual return quantities if needed.
                    </span>
                  </div>

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

                  {/* Return summary */}
                  <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    Returning <strong>{selectedReturnItems.length}</strong>{" "}
                    product(s) with total{" "}
                    <strong>
                      {selectedReturnItems.reduce(
                        (s, p) => s + p.returnQuantity,
                        0,
                      )}
                    </strong>{" "}
                    boxes back to warehouse
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── MR SEND ─────────────────────────────────────────────────── */}
          {isMRSend && (
            <div>
              {/* MR Info Banner */}
              {form.mrId && (
                <div className="mb-4 flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-indigo-900 text-sm">
                      {form.mrName}
                    </p>
                    <p className="text-xs text-indigo-500">
                      Sending stock from warehouse to MR
                    </p>
                  </div>
                  <span className="ml-auto text-xs bg-indigo-600 text-white px-2 py-1 rounded-full">
                    Send Transfer
                  </span>
                </div>
              )}

              {/* Section header + mode toggle */}
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                  <ArrowUpCircle size={18} className="text-indigo-600" />
                  Products to Send
                  {sendMrTableData.length > 0 && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full ml-1">
                      {sendMrTableData.length} product(s)
                    </span>
                  )}
                </h3>

                {form.mrId && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTemplateDownload}
                      className="flex items-center gap-1.5 text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      <Download size={13} />
                      Download Template
                    </button>

                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5 border border-gray-200">
                      <button
                        type="button"
                        onClick={() => handleExcelModeToggle(false)}
                        className={`text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          !excelMode
                            ? "bg-white text-indigo-600 shadow font-semibold"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExcelModeToggle(true)}
                        className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-md transition-colors cursor-pointer ${
                          excelMode
                            ? "bg-white text-indigo-600 shadow font-semibold"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        <FileSpreadsheet size={12} />
                        Excel Upload
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Excel Upload Panel ──────────────────────────────────── */}
              {excelMode && form.mrId && (
                <div className="mb-5">
                  <div className="border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50 p-5">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                        <FileSpreadsheet
                          size={24}
                          className="text-indigo-600"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-indigo-800">
                          Upload Excel File
                        </p>
                        <p className="text-xs text-indigo-500 mt-0.5">
                          Use the template above. Only rows with Send Quantity
                          &gt; 0 will be imported.
                        </p>
                      </div>

                      <label className="cursor-pointer">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleExcelFileChange}
                          className="hidden"
                        />
                        <span className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                          <Upload size={15} />
                          {excelFile ? "Change File" : "Choose File"}
                        </span>
                      </label>

                      {excelFile && (
                        <div className="flex items-center gap-2 text-xs text-gray-600 bg-white border rounded-lg px-3 py-1.5">
                          <FileSpreadsheet
                            size={13}
                            className="text-green-600"
                          />
                          <span className="font-medium">{excelFile.name}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setExcelFile(null);
                              setExcelErrors([]);
                              setExcelImported(false);
                              setSendMrTableData([]);
                              if (fileInputRef.current)
                                fileInputRef.current.value = "";
                            }}
                            className="ml-1 text-gray-400 hover:text-red-500 cursor-pointer"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      )}

                      {excelParsing && (
                        <p className="text-xs text-indigo-600 animate-pulse">
                          Parsing file…
                        </p>
                      )}
                    </div>
                  </div>

                  {excelImported && (
                    <div className="mt-3 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                      <CheckCircle2
                        size={16}
                        className="text-green-600 mt-0.5 flex-shrink-0"
                      />
                      <div>
                        <p className="font-semibold">
                          Excel imported — {sendMrTableData.length} product(s)
                          with quantity &gt; 0 loaded below.
                        </p>
                        <p className="text-xs text-green-600 mt-0.5">
                          You can still edit quantities manually before
                          submitting.
                        </p>
                      </div>
                    </div>
                  )}

                  {excelErrors.length > 0 && (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold mb-2">
                        <AlertCircle size={15} />
                        {excelErrors.length} row(s) skipped or adjusted:
                      </div>
                      <ul className="space-y-1">
                        {excelErrors.map((err, i) => (
                          <li
                            key={i}
                            className="text-xs text-amber-700 flex items-start gap-1.5"
                          >
                            <span className="text-amber-400 mt-0.5">•</span>
                            <span>
                              <span className="font-medium">
                                {err.productName}
                              </span>
                              {" — "}
                              {err.reason}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* ── Manual Add Product Row ────────────────────────────── */}
              {!excelMode && form.mrId && (
                <div className="flex gap-3 items-end mb-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Add Product
                    </label>
                    <SearchableDropdown
                      value={selectedProductId}
                      onChange={setSelectedProductId}
                      options={productOptions}
                      placeholder="Search and select a product to add..."
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
              )}

              {/* ── Send Product Table ────────────────────────────────── */}
              {/* ✅ Always shown (both manual and excel mode) once items exist */}
              {sendMrTableData.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-gray-300 rounded-lg text-gray-500">
                  {!form.mrId ? (
                    <>
                      <User size={36} className="mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">
                        Select an MR above to get started
                      </p>
                    </>
                  ) : excelMode ? (
                    <>
                      <FileSpreadsheet
                        size={36}
                        className="mx-auto mb-2 text-gray-300"
                      />
                      <p className="text-sm">
                        Upload an Excel file above to load products
                      </p>
                    </>
                  ) : (
                    <>
                      <Package
                        size={36}
                        className="mx-auto mb-2 text-gray-300"
                      />
                      <p className="text-sm">Search and add products above</p>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto border rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-indigo-50 text-indigo-800">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">
                            Product Name
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            Available Stock
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            Send Quantity
                          </th>
                          <th className="px-4 py-3 text-center font-semibold">
                            Remove
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sendMrTableData.map((p, idx) => (
                          <tr
                            key={p.productId || idx}
                            className={`border-t transition-colors ${
                              idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                            }`}
                          >
                            <td className="px-4 py-3 font-medium text-gray-800">
                              {p.productName}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center justify-center bg-green-100 text-green-700 text-xs font-semibold px-2 py-1 rounded-full">
                                {p.totalBoxes}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={
                                  p.sendQuantityDisplay ??
                                  String(p.sendQuantity)
                                }
                                onChange={(e) =>
                                  handleSendQtyChange(
                                    p.productId,
                                    e.target.value,
                                  )
                                }
                                className="w-24 text-center border border-indigo-400 bg-white rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-700 focus:ring-2 focus:ring-indigo-400 outline-none mx-auto block transition-colors"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveSendItem(p.productId)
                                }
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

                  {/* Summary */}
                  <div className="mt-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
                    <strong>{selectedSendItems.length}</strong> product(s)
                    selected to send with total{" "}
                    <strong>
                      {selectedSendItems.reduce(
                        (s, p) => s + p.sendQuantity,
                        0,
                      )}
                    </strong>{" "}
                    boxes
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── GENERAL TAB ─────────────────────────────────────────────── */}
          {activeTab === "general" && (
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
                    options={generalProductOptions}
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
                  onClick={handleAddProductGeneral}
                  disabled={!selectedProductId}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg cursor-pointer disabled:cursor-not-allowed transition-colors"
                >
                  <Plus size={16} /> Add
                </button>
              </div>

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
                          className={`border-t ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
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
                                );
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
                  : isMRSend
                    ? !form.mrId || selectedSendItems.length === 0
                    : form.items.length === 0)
              }
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg cursor-pointer disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {submitting ? (
                <span className="animate-pulse">Saving...</span>
              ) : isMRReceive ? (
                <>
                  <ArrowDownCircle size={16} /> Receive from{" "}
                  {form.mrName || "MR"}
                </>
              ) : isMRSend ? (
                <>
                  <ArrowUpCircle size={16} /> Send to {form.mrName || "MR"}
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

      {/* ── View Product Modal ──────────────────────────────────────────── */}
      {viewModalOpen &&
        selectedProductId &&
        (() => {
          const opts =
            activeTab === "general" ? generalProductOptions : productOptions;
          const sel = opts.find((p) => p.value === selectedProductId);
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
