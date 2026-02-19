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
import { parseExcelDate } from "../../utils/excelUtility";
import { handleAxiosError } from "../../utils/errorHandler";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// --- Axios Interceptor ---
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
// -------------------------

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

// ---------------- ImportModal Component (for products) ----------------
const ImportModal = ({ isOpen, onClose, isSampleFile }) => {
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [existingProducts, setExistingProducts] = useState([]);
  const [duplicateRows, setDuplicateRows] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  // Normalise a row for duplicate comparison (key = productName+type+packing+supplierName)
  const getRowKey = (row) => {
    const fields = [
      row.productName || "",
      row.type || "",
      row.packing || "",
      row.supplierName || "",
    ];
    return fields.map((f) => f.toString().trim().toLowerCase()).join("||");
  };

  // Fetch existing products for duplicate preview
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
      } else {
        console.error("Unexpected response format:", res.data);
      }
    } catch (error) {
      console.error("Failed to fetch existing products", error);
      showToast("error", "Could not load existing products for duplicate check");
    } finally {
      setLoadingExisting(false);
    }
  };

  // Compute duplicates whenever parsedData or existingProducts changes
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

    // 2. Database duplicates (by product key)
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
        let headerRow = [];
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const cleanedRow = (rows[i] || []).map((cell) =>
            (cell || "").toString().trim().toLowerCase()
          );
          const matchCount = requiredHeaders.filter((h) => cleanedRow.includes(h)).length;
          if (matchCount >= requiredHeaders.length * 0.8) {
            headerRowIndex = i;
            headerRow = cleanedRow;
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

          // Skip empty rows
          if (!Object.values(obj).some((v) => v.toString().trim() !== "")) return;

          const productName = (obj["product name"] || "").toString().trim();
          const type = (obj["type"] || "").toString().trim();
          const packing = (obj["packing"] || "").toString().trim();
          const supplierName = (obj["supplier name"] || "").toString().trim();

          if (!productName && !type && !packing && !supplierName) {
            rowErrors.push(`Row ${headerRowIndex + idx + 2}: Missing product data — skipped`);
            return;
          }

          // Parse date
          let licenseValidityDate = "";
          const dateVal = obj["drug registration license validity date"];
          if (dateVal) {
            const parsed = parseExcelDate(dateVal.toString().trim());
            if (parsed) {
              licenseValidityDate = parsed.toISOString().split("T")[0];
            } else {
              licenseValidityDate = dateVal.toString().trim(); // keep raw, backend will try
            }
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
        // handle 207 partial success
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
// ----------------------------------------------------------------------

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

  // Fetch dropdown data (same as before)
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

  // Fetch products (unchanged)
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
    if (shouldRefresh) fetchProducts(1);
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
      };
      const res = await axios.put(`${backendUrl}/api/products/${form._id}`, updateData);
      showToast("success", `Product <b>${res.data.productName}</b> updated successfully`);
      closeEditModal();
      fetchProducts(currentPage);
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
            <div></div>
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

        {/* Table and other UI (unchanged) ... */}
        {/* I'll keep the table and modals exactly as you had them, they are already correct */}
        {/* ... (table, pagination, view/edit modals) ... */}

        {/* (We'll skip the full table rendering here for brevity – keep your existing code) */}
        {/* But ensure you use the updated ImportModal and have the interceptor. */}
      </div>
    </div>
  );
};

export default Product;