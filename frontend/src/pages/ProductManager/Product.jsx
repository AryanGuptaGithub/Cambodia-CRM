import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  UserPlus,
  Upload,
  Trash2,
  Eye,
  X,
  Edit,
  Search,
  CheckCircle,
  AlertCircle,
  Download,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import SampleExcelDownloadProduct from "../../excels/SampleExcelDownloadProduct";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import {
  fetchProductTypes,
  fetchSuppliers,
  fetchProductPackingType,
} from "./common/fetchDropdown";
import { handleAxiosError } from "../../utils/errorHandler";
import { parseExcelDateValue } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";

// --- Axios Interceptor (auto attach token) ---
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
// ----------------------------------------------

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const formatDisplayText = (text) => {
  if (!text) return "";
  return text
    .toString()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};


/**
 * Format a date (string or Date) to "DD MMM YYYY" using UTC components.
 * If input is falsy, returns "--".
 */
const formatDateUTC = (dateInput) => {
  if (!dateInput) return "--";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "--";
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${monthNames[month - 1]} ${year}`;
};

// ================== ImportModal (for products) ==================
const ImportModal = ({ isOpen, onClose, isSampleFile }) => {
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [existingProducts, setExistingProducts] = useState([]);
  const [duplicateRows, setDuplicateRows] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  const getRowKey = (row) => {
    const fields = [
      row.productName || "",
      row.type || "",
      row.packing || "",
      row.supplierName || "",
    ];
    return fields.map((f) => f.toString().trim().toLowerCase()).join("||");
  };

  useEffect(() => {
    if (isOpen) {
      fetchExistingProducts();
    }
  }, [isOpen]);

  const fetchExistingProducts = async () => {
    setLoadingExisting(true);
    try {
      const res = await axios.get(`${backendUrl}/api/products/all-for-import`);
      if (Array.isArray(res.data)) {
        setExistingProducts(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch existing products", error);
      showToast("error", "Could not load existing products for duplicate check");
    } finally {
      setLoadingExisting(false);
    }
  };

  useEffect(() => {
    if (!parsedData.length) {
      setDuplicateRows([]);
      return;
    }

    const duplicateIndices = new Set();

    // 1. Intra‑file duplicates
    const keyCount = new Map();
    parsedData.forEach((row, idx) => {
      const key = getRowKey(row);
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    parsedData.forEach((row, idx) => {
      const key = getRowKey(row);
      if (keyCount.get(key) > 1) duplicateIndices.add(idx);
    });

    // 2. Database duplicates
    if (existingProducts.length > 0) {
      const existingKeys = new Set(
        existingProducts.map((p) =>
          getRowKey({
            productName: p.productName,
            type: p.type,
            packing: p.packing,
            supplierName: p.supplierName,
          })
        )
      );
      parsedData.forEach((row, idx) => {
        const key = getRowKey(row);
        if (existingKeys.has(key)) duplicateIndices.add(idx);
      });
    }

    const dupes = parsedData.filter((_, idx) => duplicateIndices.has(idx));
    setDuplicateRows(dupes);
  }, [parsedData, existingProducts]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseErrors([]);
    setParsedData([]);
    setDuplicateRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true,
          cellNF: false,
          cellText: false,
        });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true,
        });

        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }

        // Required headers (lowercase for matching)
        const requiredHeaders = [
          "product name",
          "type",
          "packing",
          "selling price (usd)",
          "lc (usd)",
          "quantity per box/strip",
          "supplier name",
          "drug registration license #",
          "drug registration license validity date",
        ];
        const optionalHeaders = ["fob (usd)", "tax selling price (usd)", "remarks"];
        const allHeaders = [...requiredHeaders, ...optionalHeaders];

        // Find header row
        let headerRowIndex = -1;
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const cleanedRow = (rows[i] || []).map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );
          const matchCount = requiredHeaders.filter((h) => cleanedRow.includes(h)).length;
          if (matchCount >= requiredHeaders.length * 0.8) {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast("error", "Could not find required headers in Excel file");
          return;
        }

        // Map column index → header name
        const headersMap = {};
        rows[headerRowIndex].forEach((headerText, colIndex) => {
          const cleaned = (headerText || "").toString().trim().toLowerCase();
          if (allHeaders.includes(cleaned)) {
            headersMap[colIndex] = cleaned;
          }
        });

        const dataRows = rows.slice(headerRowIndex + 1);
        const rowErrors = [];
        const validRows = [];

        dataRows.forEach((row, idx) => {
          const obj = {};
          Object.entries(headersMap).forEach(([colIdx, key]) => {
            obj[key] = row[parseInt(colIdx)] || "";
          });

          if (!Object.values(obj).some((v) => v.toString().trim() !== "")) return;

          const productName = (obj["product name"] || "").toString().trim();
          const type = (obj["type"] || "").toString().trim();
          const packing = (obj["packing"] || "").toString().trim();
          const supplierName = (obj["supplier name"] || "").toString().trim();

          if (!productName && !type && !packing && !supplierName) {
            rowErrors.push(`Row ${headerRowIndex + idx + 2}: Missing product data — skipped`);
            return;
          }

          // Parse date using UTC-aware function
          let licenseValidityDate = "";
          const dateVal = obj["drug registration license validity date"];
          if (dateVal) {
            licenseValidityDate = parseExcelDateValue(dateVal);
          }
          
          validRows.push({
            productName,
            type,
            packing,
            sellingPriceUSD: obj["selling price (usd)"],
            lcUSD: obj["lc (usd)"],
            fobUSD: obj["fob (usd)"] || "",
            taxSellingPriceUSD: obj["tax selling price (usd)"] || "",
            qtyPerBoxStrip: obj["quantity per box/strip"],
            supplierName,
            drugLicense: obj["drug registration license #"],
            licenseValidityDate,
            remarks: obj["remarks"] || "",
          });
        });

        if (validRows.length === 0) {
          showToast("warning", "No valid product records found.");
          return;
        }

        setParsedData(validRows);
        setParseErrors(rowErrors);
        if (rowErrors.length) {
          showToast("warning", `${validRows.length} valid rows, ${rowErrors.length} skipped`);
        }
      } catch (err) {
        console.error("Parse error:", err);
        showToast("error", "Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!parsedData.length) {
      showToast("warning", "Upload a valid file first");
      return;
    }

    const uniqueData = parsedData.filter((row) => !duplicateRows.includes(row));
    if (uniqueData.length === 0) {
      showToast("warning", "No unique records to import");
      return;
    }

    console.log('value of 416', uniqueData);

    setIsUploading(true);
    try {
      const res = await axios.post(`${backendUrl}/api/products/import`, uniqueData, {
        headers: { "Content-Type": "application/json" },
        timeout: 60000,
      });
      if (res.status === 200) {
        showToast("success", res.data.message || `Imported ${uniqueData.length} records successfully`);
        onClose(true); // true = refresh
      } else {
        showToast("info", res.data.message);
        onClose(true);
      }
    } catch (err) {
      console.error("Import error:", err);
      let msg = "Import failed";
      if (err.response?.data?.message) msg = err.response.data.message;
      else if (err.request) msg = "No response from server. Check network.";
      else msg = err.message || "Unknown error";
      showToast("error", msg);
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  const isDuplicateRow = (row) => duplicateRows.includes(row);

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-lg p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onClose(false)}
          disabled={isUploading}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>

        <h2 className="text-lg font-semibold mb-1">Import Products</h2>
        {isSampleFile && <SampleExcelDownloadProduct />}

        <div className="mb-4">
          <label className="block text-gray-700 mb-2 font-medium">Select File</label>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            className="block w-full border rounded-lg px-3 py-2 text-sm"
          />
          {fileName && <p className="text-xs text-gray-500 mt-1">📄 {fileName}</p>}
        </div>

        {loadingExisting && (
          <div className="mb-4 text-sm text-blue-600 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Loading existing products for duplicate check...
          </div>
        )}

        {duplicateRows.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} className="text-red-600" />
              <span className="text-sm font-medium text-red-800">
                {duplicateRows.length} duplicate row(s) found
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto text-xs text-red-700">
              {duplicateRows.slice(0, 5).map((row, i) => (
                <div key={i} className="mb-1">
                  • {row.productName} ({row.type} / {row.packing})
                </div>
              ))}
              {duplicateRows.length > 5 && <div>...and {duplicateRows.length - 5} more</div>}
            </div>
            <p className="text-xs text-red-600 mt-2">
              Duplicate rows are highlighted below. They will be skipped during import.
            </p>
          </div>
        )}

        {parsedData.length > 0 && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {parsedData.length} Total Records
                {duplicateRows.length > 0 && (
                  <span className="ml-2 text-red-600">
                    ({parsedData.length - duplicateRows.length} unique)
                  </span>
                )}
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-green-100">
                  <tr>
                    <th className="p-1 text-left">#</th>
                    <th className="p-1 text-left">Product</th>
                    <th className="p-1 text-left">Type</th>
                    <th className="p-1 text-left">Packing</th>
                    <th className="p-1 text-left">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 5).map((row, i) => {
                    const duplicate = isDuplicateRow(row);
                    return (
                      <tr
                        key={i}
                        className={`border-t ${duplicate ? "bg-red-100 text-red-800 font-medium" : ""}`}
                      >
                        <td className="p-1 text-gray-500">{i + 1}</td>
                        <td className="p-1">{row.productName || "—"}</td>
                        <td className="p-1">{row.type || "—"}</td>
                        <td className="p-1">{row.packing || "—"}</td>
                        <td className="p-1">{row.supplierName || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {parsedData.length > 5 && (
                <p className="text-xs text-gray-500 text-center mt-1">
                  ...and {parsedData.length - 5} more rows
                </p>
              )}
            </div>
          </div>
        )}

        {parseErrors.length > 0 && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-28 overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={14} className="text-yellow-600" />
              <span className="text-xs font-medium text-yellow-800">
                {parseErrors.length} rows skipped
              </span>
            </div>
            {parseErrors.slice(0, 5).map((err, i) => (
              <p key={i} className="text-xs text-yellow-700">{err}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <div className="flex gap-3">
            <button
              onClick={() => onClose(false)}
              disabled={isUploading}
              className="px-5 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 text-gray-700 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isUploading || parsedData.length === 0 || loadingExisting}
              className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Importing…
                </>
              ) : (
                "Import"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
// =================================================================

const Product = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedTab, setSelectedTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showImportModal, setShowImportModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [productTypes, setProductTypes] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);
  const [error, setError] = useState(null);
  const [paginationInfo, setPaginationInfo] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 9,
  });
  const inputRef = useRef(null);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const initialFormState = {
    productName: "",
    type: "",
    packing: "",
    qtyPerBoxStrip: "",
    supplierName: "",
    drugLicense: "",
    licenseValidityDate: "",
    remarks: "",
    _id: null,
  };
  const [form, setForm] = useState(initialFormState);

  const loadProductTypes = useCallback(async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/products/types`);
      if (res.data.success) {
        setTypes(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching product types:", err);
      showToast("error", "Failed to load product types.");
    }
  }, []);

  useEffect(() => {
    loadProductTypes();
  }, [loadProductTypes]);

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [typesResult, suppliersResult, packingResult] = await Promise.all([
          fetchProductTypes(),
          fetchSuppliers(),
          fetchProductPackingType(),
        ]);
        if (typesResult.success) {
          const transformedTypes = typesResult.data.map((item) => ({
            value: (typeof item === "string" ? item : item.name || item.value).toLowerCase(),
            label: formatDisplayText(typeof item === "string" ? item : item.name || item.value),
          }));
          setProductTypes(transformedTypes);
        }
        if (suppliersResult.success && suppliersResult.data) {
          const transformedSuppliers = suppliersResult.data.map((item) => ({
            value: (typeof item === "string" ? item : item.name || item.value).toLowerCase(),
            label: formatDisplayText(typeof item === "string" ? item : item.name || item.value),
          }));
          setSuppliers(transformedSuppliers);
        }
        if (packingResult.success) {
          const transformedPacking = packingResult.data.map((item) => ({
            value: (typeof item === "string" ? item : item.name || item.value).toLowerCase(),
            label: formatDisplayText(typeof item === "string" ? item : item.name || item.value),
          }));
          setPackingOptions(transformedPacking);
        }
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };
    fetchDropdownData();
  }, []);

  const fetchProducts = async (page = 1, search = searchTerm, type = selectedTab) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "9",
        search: search,
        type: type === "All" ? "" : type,
      });
      const response = await fetch(`${backendUrl}/api/products/paginated?` + params);
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = await response.json();
      if (data.success) {
        setProducts(data.data);
        setPaginationInfo(data.pagination);
        setSelected([]);
      }
    } catch (err) {
      setError(err.message);
      showToast("error", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchProducts(1, debouncedSearchTerm, selectedTab);
  }, [debouncedSearchTerm, selectedTab]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchProducts(page, searchTerm, selectedTab);
  };

  const toggleSelect = useCallback((product) => {
    setSelected((prev) =>
      prev.some((c) => c.id === product._id)
        ? prev.filter((c) => c.id !== product._id)
        : [...prev, { id: product._id }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? products.map((product) => ({ id: product._id }))
          : []
      );
    },
    [products]
  );

  const handleImportClick = () => {
    if (!suppliers || suppliers.length === 0) {
      showToast("error", "No suppliers found. Please add at least one supplier first.");
      return;
    }
    setShowImportModal(true);
  };

  const handleImportClose = (shouldRefresh) => {
    setShowImportModal(false);
    if (shouldRefresh) {
      fetchProducts(1);
      loadProductTypes();
    }
  };

  const handleView = (product) => {
    setForm({ ...product, licenseValidityDate: product.licenseValidityDate || "" });
    setIsViewModalOpen(true);
  };

  const handleEdit = (product) => {
    setForm({
      ...product,
      licenseValidityDate: product.licenseValidityDate || "",
      type: product.type?.toLowerCase() || "",
      supplierName: product.supplierName?.toLowerCase() || "",
      packing: product.packing?.toLowerCase() || "",
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setForm(initialFormState);
  };

  const closeViewModal = () => {
    setIsViewModalOpen(false);
    setForm(initialFormState);
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> product(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/products`, {
          data: { ids: selected.map((s) => s.id) },
        });
        showToast("success", res.data.message || "Products deleted successfully");
        fetchProducts(currentPage);
        loadProductTypes();
      } catch (err) {
        showToast("error", err.response?.data?.message || "Failed to delete products.");
      }
    }
  };

  const deleteProduct = async (product) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${product.productName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/products/${product._id}`);
        showToast("success", res.data.message || "Product deleted successfully");
        fetchProducts(currentPage);
        loadProductTypes();
      } catch (error) {
        showToast("error", error.response?.data?.message || "Failed to delete product");
      }
    }
  };

  const handleProductUpdate = async (e) => {
    e.preventDefault();
    try {
      const updateData = {
        ...form,
        productName: form.productName.toLowerCase(),
        type: form.type.toLowerCase(),
        packing: form.packing.toLowerCase(),
        supplierName: form.supplierName.toLowerCase(),
        drugLicense: form.drugLicense.toLowerCase(),
        remarks: form.remarks.toLowerCase(),
        // Date will be parsed on backend; send as YYYY-MM-DD string
      };
      const res = await axios.put(`${backendUrl}/api/products/${form._id}`, updateData);
      showToast("success", `Product <b>${res.data.productName}</b> updated successfully`);
      closeEditModal();
      fetchProducts(currentPage);
      loadProductTypes();
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update product.");
    }
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  const handleNumericInput = (e, field) => {
    const value = e.target.value;
    if (value === "" || /^\d+$/.test(value)) {
      setForm({ ...form, [field]: value });
    }
  };

  const handleTypeChange = useCallback((selectedValue) => {
    setForm((prev) => ({ ...prev, type: selectedValue }));
  }, []);
  const handleSupplierChange = useCallback((selectedValue) => {
    setForm((prev) => ({ ...prev, supplierName: selectedValue }));
  }, []);
  const handlePackingChange = useCallback((selectedValue) => {
    setForm((prev) => ({ ...prev, packing: selectedValue }));
  }, []);

  const getSelectedType = useMemo(() => form.type || "", [form.type]);
  const getSelectedSupplier = useMemo(() => form.supplierName || "", [form.supplierName]);
  const getSelectedPacking = useMemo(() => form.packing || "", [form.packing]);

  const handleTabChange = (tab) => {
    setSelectedTab(tab);
    setCurrentPage(1);
    fetchProducts(1, searchTerm, tab);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const visiblePages = getVisiblePages(currentPage, paginationInfo.totalPages);

  const handleDownloadAll = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/products`);
      const allProducts = response.data;

      if (!allProducts.length) {
        showToast("info", "No products to export.");
        return;
      }

      const rows = [
        ["Remarks", "", "", "", "", "", "", "", "", "", "", ""],
        ["Product List", "", "", "", "", "", "", "", "", "", "", ""],
        [
          "Product Name",
          "Type",
          "Packing",
          "Selling Price (USD)",
          "LC (USD)",
          "FOB (USD)",
          "Tax Selling Price (USD)",
          "Quantity per Box/Strip",
          "Supplier Name",
          "Drug Registration License #",
          "Drug Registration License Validity Date",
          "Remarks",
        ],
      ];

      allProducts.forEach((p) => {
        rows.push([
          p.productName || "",
          p.type || "",
          p.packing || "",
          p.sellingPrice ?? 0,
          p.lc ?? 0,
          p.fob ?? 0,
          p.taxSellingPrice ?? 0,
          p.qtyPerBoxStrip ?? "",
          p.supplierName || "",
          p.drugLicense || "",
          p.licenseValidityDate
            ? p.licenseValidityDate + " 00:00:00" // already YYYY-MM-DD from backend
            : "",
          p.remarks || "",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      XLSX.writeFile(wb, "products_export.xlsx");
    } catch (error) {
      console.error("Error downloading products:", error);
      showToast("error", "Failed to download products.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && currentPage === 1 && !debouncedSearchTerm)
    return <LoadingOverlay text="Loading products..." />;

  return (
    <div className="p-6">
      <ImportModal
        isOpen={showImportModal}
        onClose={handleImportClose}
        isSampleFile={isSampleFile}
      />

      <div className="container">
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3">
            <button
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={() => navigate("/productmanagerlayout/addproduct")}
            >
              <UserPlus size={18} /> Add New Product
            </button>
            <button
              onClick={handleImportClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Product
            </button>
            { isSampleDownloadFile  && (
              <button
                onClick={handleDownloadAll}
                disabled={loading}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer disabled:opacity-50"
              >
                <Download size={18} /> Export All
              </button>
            )}
            {selected.length > 0 && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete Selected ({selected.length})
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
          {types.length > 0 ? (
            <div className="flex gap-4 flex-wrap">
              <button
                key="All"
                onClick={() => handleTabChange("All")}
                className={`px-4 py-2 rounded-lg cursor-pointer ${
                  selectedTab === "All"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                All
              </button>
              {types.map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`px-4 py-2 rounded-lg cursor-pointer ${
                    selectedTab === tab
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 text-gray-700"
                  }`}
                >
                  {formatDisplayText(tab)}
                </button>
              ))}
            </div>
          ) : (
            <div />
          )}

          {products.length > 0 && (
            <div className="flex items-center gap-8">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                  {paginationInfo.totalItems}
                </span>
              </p>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={handleSearch}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
                {debouncedSearchTerm !== searchTerm && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {products.length > 0 && (
                      <input
                        type="checkbox"
                        checked={selected.length === products.length && products.length > 0}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span className="text-sm font-medium">Product Name</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Product Type</th>
                <th className="p-3 text-sm font-medium">Packing</th>
                <th className="p-3 text-sm font-medium">Quantity per Box/Strip</th>
                <th className="p-3 text-sm font-medium">Supplier</th>
                <th className="p-3 text-sm font-medium">Drug License</th>
                <th className="p-3 text-sm font-medium">License Validity</th>
                <th className="p-3 text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-gray-500">
                    {loading ? "Loading..." : "No products found."}
                  </td>
                </tr>
              ) : (
                products.map((product, index) => (
                  <tr
                    key={product._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % paginationInfo.itemsPerPage === 0 ||
                      index + 1 === products.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === product._id)}
                          onChange={() => toggleSelect(product)}
                        />
                        <span>{product.productName}</span>
                      </div>
                    </td>
                    <td className="p-3">{product.type}</td>
                    <td className="p-3">{product.packing}</td>
                    <td className="p-3">{product.qtyPerBoxStrip}</td>
                    <td className="p-3">{product.supplierName || "--"}</td>
                    <td className="p-3">{product.drugLicense || "--"}</td>
                    <td className="p-3">
                      {formatDateUTC(product.licenseValidityDate)}
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => handleView(product)}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEdit(product)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => deleteProduct(product)}
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

          {paginationInfo.totalPages > 1 && (
            <div className="mt-4 p-5 flex justify-start gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                ← Prev
              </button>
              {visiblePages.map((page) => (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className={`px-3 py-1 rounded cursor-pointer ${
                    currentPage === page
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === paginationInfo.totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* View Modal */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={closeViewModal}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold text-gray-800 mb-4">View Product</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Product Name</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.productName}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Type</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.type}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Packing</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.packing}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Quantity per Box/Strip</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.qtyPerBoxStrip || "--"}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Supplier Name</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.supplierName || "--"}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">Drug License</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.drugLicense || "--"}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600">License Validity Date</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">
                      {formatDateUTC(form.licenseValidityDate)}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-600">Remarks</label>
                    <p className="border px-3 py-2 rounded-lg bg-gray-100">{form.remarks || "—"}</p>
                  </div>
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
            document.body
          )}

        {/* Edit Modal */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={closeEditModal}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold mb-4">Edit Product</h2>
                <form onSubmit={handleProductUpdate}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Product Name <span className="text-red-500">*</span>
                      </label>
                      <InputField
                        type="text"
                        value={form.productName}
                        onChange={(e) => setForm({ ...form, productName: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Type</label>
                      <SearchableDropdown
                        value={getSelectedType}
                        onChange={handleTypeChange}
                        options={productTypes}
                        placeholder="Select Type"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Packing</label>
                      <SearchableDropdown
                        value={getSelectedPacking}
                        onChange={handlePackingChange}
                        options={packingOptions}
                        placeholder="Select Packing"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Quantity per Box/Strip
                      </label>
                      <InputField
                        type="text"
                        value={form.qtyPerBoxStrip}
                        onChange={(e) => handleNumericInput(e, "qtyPerBoxStrip")}
                        placeholder="Enter numbers only"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Supplier Name</label>
                      <SearchableDropdown
                        value={getSelectedSupplier}
                        onChange={handleSupplierChange}
                        options={suppliers}
                        placeholder="Select Supplier"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">Drug License</label>
                      <InputField
                        type="text"
                        value={form.drugLicense}
                        onChange={(e) => setForm({ ...form, drugLicense: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">License Validity Date</label>
                      <div className="rounded-lg border border-gray-300">
                        <DatePicker
                          selected={
                            form.licenseValidityDate
                              ? (() => {
                                  // Create UTC noon Date from YYYY-MM-DD string
                                  const [y, m, d] = form.licenseValidityDate.split('-').map(Number);
                                  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
                                })()
                              : null
                          }
                          onChange={(date) => {
                            if (date) {
                              // Use local date components to build YYYY-MM-DD
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              setForm({ ...form, licenseValidityDate: `${year}-${month}-${day}` });
                            } else {
                              setForm({ ...form, licenseValidityDate: '' });
                            }
                          }}
                          dateFormat="yyyy-MM-dd"
                          placeholderText="Select date"
                          className="w-full px-3 py-2 border-none rounded-lg focus:ring-0"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">Remarks</label>
                      <div className="border border-gray-300 rounded-lg bg-white">
                        <textarea
                          value={form.remarks}
                          onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                          className="w-full px-3 py-2 border-none rounded-lg focus:ring-0 resize-none"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeEditModal}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
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
    </div>
  );
};

export default Product;