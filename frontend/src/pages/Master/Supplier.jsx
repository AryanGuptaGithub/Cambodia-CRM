import { useNavigate } from "react-router-dom";
import {
  UserPlus,
  Upload,
  Search,
  Eye,
  Edit,
  Trash2,
  X,
  CheckCircle,
  AlertCircle,
  Download,
} from "lucide-react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil";
import SampleExcelDownloadSupplier from "../../excels/SampleExcelDownloadSuppiler";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import LoadingOverlay from "../../components/Loading";
import { parseExcelDateValue } from "../../utils/dateUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadEnabled = import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";
const SUPPLIERS_PER_PAGE = 10;

// --- Axios Interceptor to automatically attach token ---
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);


const formatDateToYYYYMMDD = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function capitalizeFirstLetter(str) {
  if (!str) return "";
  str = str.toString();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Helper to convert to title case for display
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Helper to convert to lowercase for storage
const toLowerCase = (str) => {
  if (!str) return "";
  return str.toLowerCase();
};

// Helper to display value with title case
const displayValue = (value) => (value ? toTitleCase(value) : "--");

// Subcomponents
const TopBar = ({
  onAddNew,
  onImport,
  onDownloadAll,
  onDeleteSelected,
  selectedCount,
  showSampleDownload,
  showExportButton,
}) => (
  <div className="flex justify-between items-center mb-4">
    <div className="flex gap-3">
      <button
        onClick={onAddNew}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
      >
        <UserPlus size={18} /> Add New Supplier
      </button>
      <button
        onClick={onImport}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
      >
        <Upload size={18} /> Import CSV
      </button>
      {showExportButton && (
        <button
          onClick={onDownloadAll}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
        >
          <Download size={18} /> Export All
        </button>
      )}
      {selectedCount > 0 && (
        <button
          onClick={onDeleteSelected}
          className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
        >
          <Trash2 size={18} /> Delete
        </button>
      )}
    </div>
  </div>
);

const Tabs = ({
  activeTab,
  setActiveTab,
  totalSuppliers,
  hasEnabled,
  hasDisabled,
}) => (
  <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
    {totalSuppliers > 0 ? (
      <div className="flex gap-4">
        <button
          onClick={() => setActiveTab("All")}
          className={`px-4 py-2 rounded-lg cursor-pointer ${
            activeTab === "All"
              ? "bg-indigo-600 text-white"
              : "bg-gray-200 text-gray-700"
          }`}
        >
          All
        </button>
        {hasEnabled && (
          <button
            onClick={() => setActiveTab("Enabled")}
            className={`px-4 py-2 rounded-lg cursor-pointer ${
              activeTab === "Enabled"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Enabled
          </button>
        )}
        {hasDisabled && (
          <button
            onClick={() => setActiveTab("Disabled")}
            className={`px-4 py-2 rounded-lg cursor-pointer ${
              activeTab === "Disabled"
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            Disabled
          </button>
        )}
      </div>
    ) : (
      <div />
    )}
  </div>
);

const SearchBar = ({
  search,
  setSearch,
  setCurrentPage,
  inputRef,
  handleIconClick,
  handleSearchChange,
}) => (
  <div className="relative w-full md:w-72">
    <Search
      className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
      size={16}
      onClick={handleIconClick}
    />
    <input
      ref={inputRef}
      type="text"
      placeholder="Search by name or address..."
      value={search}
      onChange={handleSearchChange}
      className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
    />
  </div>
);

const SupplierTable = ({
  currentSuppliers,
  selected,
  toggleSelect,
  toggleSelectAll,
  handleView,
  handleEdit,
  deleteSupplier,
  handlerEnabledSupplier,
  formatDateToReadable,
}) => (
  <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
    <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
      <thead className="bg-gray-100 text-gray-700 border-b">
        <tr>
          <th className="p-3 text-sm font-medium">
            <div className="flex items-center gap-4">
              {currentSuppliers.length > 0 && (
                <input
                  type="checkbox"
                  checked={
                    selected.length === currentSuppliers.length &&
                    currentSuppliers.length > 0
                  }
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                />
              )}
              <span>Supplier Name</span>
            </div>
          </th>
          <th className="p-3 text-sm font-medium">Address</th>
          <th className="p-3 text-sm font-medium">Site Registration Date</th>
          <th className="p-3 text-sm font-medium">
            Site Registration Expiry Date
          </th>
          <th className="p-3 text-sm font-medium">Status</th>
          <th className="p-3 text-sm font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {currentSuppliers.map((supplier, index) => (
          <tr
            key={supplier._id}
            className={`hover:bg-gray-50 ${
              (index + 1) % SUPPLIERS_PER_PAGE === 0 ||
              index + 1 === currentSuppliers.length
                ? ""
                : "border-b"
            }`}
          >
            <td className="p-3">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selected.some((s) => s.id === supplier._id)}
                  onChange={() => toggleSelect(supplier)}
                />
                <span className="capitalize">
                  {displayValue(supplier.name)}
                </span>
              </div>
            </td>
            <td className="p-3">{displayValue(supplier.address)}</td>
            <td className="p-3">
              {formatDateToReadable(supplier.siteRegistrationDate)}
            </td>
            <td className="p-3">
              {formatDateToReadable(supplier.siteRegistrationExpiryDate)}
            </td>
            <td className="p-3">
              <button
                onClick={() => handlerEnabledSupplier(supplier._id)}
                className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                  supplier.enabled
                    ? "bg-green-100 text-green-600"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {supplier.enabled ? "Enabled" : "Disabled"}
              </button>
            </td>
            <td className="p-3 flex items-center justify-center gap-3">
              <button
                onClick={() => handleView(supplier)}
                className="text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                <Eye size={18} />
              </button>
              <button
                onClick={() => handleEdit(supplier)}
                className="text-green-600 hover:text-green-800 cursor-pointer"
              >
                <Edit size={18} />
              </button>
              <button
                onClick={() => deleteSupplier(supplier)}
                className="text-red-600 hover:text-red-800 cursor-pointer"
              >
                <Trash2 size={18} />
              </button>
            </td>
          </tr>
        ))}
        {currentSuppliers.length === 0 && (
          <tr>
            <td colSpan={6} className="text-center p-6 text-gray-500">
              No Supplier found.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
);

const Pagination = ({ currentPage, totalPages, setCurrentPage }) => {
  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      if (currentPage <= 3) {
        start = 2;
        end = 4;
      }
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }
      if (start > 2) {
        pages.push("...");
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < totalPages - 1) {
        pages.push("...");
      }
      pages.push(totalPages);
    }
    return pages;
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="mt-4 p-5 flex gap-2">
      <button
        onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
        disabled={currentPage === 1}
        className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        ← Prev
      </button>
      {visiblePages.map((page, index) => (
        <button
          key={index}
          onClick={() => typeof page === "number" && setCurrentPage(page)}
          disabled={page === "..."}
          className={`px-4 py-2 rounded ${
            page === "..."
              ? "bg-gray-200 cursor-not-allowed"
              : currentPage === page
                ? "bg-indigo-600 text-white cursor-pointer"
                : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
        disabled={currentPage === totalPages}
        className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        Next →
      </button>
    </div>
  );
};

// --- Self-contained Import Modal ---
const ImportModal = ({ show, onClose, isSampleFile }) => {
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [existingSuppliers, setExistingSuppliers] = useState([]);
  const [duplicateRows, setDuplicateRows] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    if (show) {
      fetchExistingSuppliers();
    }
  }, [show]);

  const fetchExistingSuppliers = async () => {
    setLoadingExisting(true);
    try {
      const res = await axios.get(`${backendUrl}/api/suppliers?limit=10000`);
      if (res.data.success || res.data.ok) {
        const suppliers = res.data.data || res.data.suppliers || [];
        setExistingSuppliers(suppliers.map((s) => ({ name: s.name })));
      }
    } catch (error) {
      console.error("Failed to fetch existing suppliers", error);
      showToast("error", "Could not load existing suppliers for duplicate check");
    } finally {
      setLoadingExisting(false);
    }
  };

  const getRowKey = (row) => {
    const fields = [
      row.supplierName || "",
      row.address || "",
      row.siteRegistrationDate || "",
      row.siteRegistrationExpiryDate || "",
    ];
    return fields.map((f) => f.toString().trim().toLowerCase()).join("||");
  };

  useEffect(() => {
    if (!parsedData.length) {
      setDuplicateRows([]);
      return;
    }

    const duplicateIndices = new Set();

    // Intra-file duplicates (full row equality)
    const keyCount = new Map();
    parsedData.forEach((row) => {
      const key = getRowKey(row);
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    parsedData.forEach((row, idx) => {
      const key = getRowKey(row);
      if (keyCount.get(key) > 1) duplicateIndices.add(idx);
    });

    // Database duplicates by supplier name (case-insensitive)
    if (existingSuppliers.length > 0) {
      const existingNames = new Set(
        existingSuppliers
          .map((s) => s.name?.trim().toLowerCase())
          .filter(Boolean),
      );
      parsedData.forEach((row, idx) => {
        const name = row.supplierName?.trim().toLowerCase();
        if (name && existingNames.has(name)) {
          duplicateIndices.add(idx);
        }
      });
    }

    const dupes = parsedData.filter((_, idx) => duplicateIndices.has(idx));
    setDuplicateRows(dupes);
  }, [parsedData, existingSuppliers]);

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
        // ✅ FIX: Use cellDates: true so XLSX returns real Date objects
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true,
        });

        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }

        // Find header row containing "supplier name"
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          for (let j = 0; j < (rows[i]?.length || 0); j++) {
            const cell = rows[i]?.[j]?.toString().trim().toLowerCase();
            if (cell === "supplier name") {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx !== -1) break;
        }

        if (headerIdx === -1) {
          showToast("error", "Header row with 'Supplier Name' not found.");
          return;
        }

        const headers = rows[headerIdx].map((h) => h.toString().trim());
        const dataRows = rows.slice(headerIdx + 1);

        const getValue = (obj, keys) => {
          for (const key of keys) {
            for (const k in obj) {
              if (
                k.toLowerCase() === key.toLowerCase() &&
                obj[k]?.toString().trim() !== ""
              ) {
                return obj[k];
              }
            }
          }
          return "";
        };

        const rowErrors = [];
        const validRows = [];

        dataRows.forEach((row, idx) => {
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i] !== undefined ? row[i] : "";
          });

          if (!Object.values(obj).some((v) => v.toString().trim() !== ""))
            return;

          const supplierName = capitalizeFirstLetter(
            String(getValue(obj, ["Supplier Name", "Name"]) || "").trim(),
          );

          if (!supplierName) {
            rowErrors.push(
              `Row ${headerIdx + idx + 2}: Missing supplier name — skipped`,
            );
            return;
          }

          const address = String(getValue(obj, ["Address"]) || "").trim();
          const siteRegistrationDateRaw = getValue(obj, [
            "Site Registration Date",
            "Registration Date",
          ]);
          const siteRegistrationExpiryDateRaw = getValue(obj, [
            "Site Registration Expiry Date",
            "Expiry Date",
          ]);

          const dataObj = {
            supplierName: supplierName.toLowerCase(),
            address: address.toLowerCase(),
          };

          // ✅ FIX: Pass the raw value directly (Date object or string/number)
          const parsedRegDate = parseExcelDateValue(siteRegistrationDateRaw);
          if (parsedRegDate) dataObj.siteRegistrationDate = parsedRegDate;

          const parsedExpDate = parseExcelDateValue(siteRegistrationExpiryDateRaw);
          if (parsedExpDate) dataObj.siteRegistrationExpiryDate = parsedExpDate;

          validRows.push(dataObj);
        });

        if (validRows.length === 0) {
          showToast("warning", "No valid supplier records found.");
          return;
        }

        setParsedData(validRows);
        setParseErrors(rowErrors);
        if (rowErrors.length) {
          showToast(
            "warning",
            `${validRows.length} valid rows, ${rowErrors.length} skipped`,
          );
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
      const res = await axios.post(
        `${backendUrl}/api/suppliers/import`,
        uniqueData,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 60000,
        },
      );
      if (res.status === 200 || res.status === 201) {
        showToast(
          "success",
          res.data.message ||
            `Imported ${uniqueData.length} records successfully`,
        );
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

  if (!show) return null;

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

        <h2 className="text-lg font-semibold mb-1">Import Suppliers</h2>
        {isSampleFile && <SampleExcelDownloadSupplier />}

        <div className="mb-4">
          <label className="block text-gray-700 mb-2 font-medium">
            Select File
          </label>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={handleFileUpload}
            className="block w-full border rounded-lg px-3 py-2 text-sm"
          />
          {fileName && (
            <p className="text-xs text-gray-500 mt-1">📄 {fileName}</p>
          )}
        </div>

        {loadingExisting && (
          <div className="mb-4 text-sm text-blue-600 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            Loading existing suppliers for duplicate check...
          </div>
        )}

        {duplicateRows.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle size={16} className="text-red-600" />
              <span className="text-sm font-medium text-red-800">
                {duplicateRows.length} duplicate row(s) found
                {existingSuppliers.length > 0 && " (by name or full match)"}
              </span>
            </div>
            <div className="max-h-24 overflow-y-auto text-xs text-red-700">
              {duplicateRows.slice(0, 5).map((row, i) => (
                <div key={i} className="mb-1">
                  • {displayValue(row.supplierName)}
                </div>
              ))}
              {duplicateRows.length > 5 && (
                <div>...and {duplicateRows.length - 5} more</div>
              )}
            </div>
            <p className="text-xs text-red-600 mt-2">
              Duplicate rows are highlighted in red below. They will be skipped
              during import.
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
                    <th className="p-1 text-left">Supplier Name</th>
                    <th className="p-1 text-left">Address</th>
                    <th className="p-1 text-left">Reg. Date</th>
                    <th className="p-1 text-left">Expiry Date</th>
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
                        <td className="p-1">
                          {displayValue(row.supplierName) || "—"}
                        </td>
                        <td className="p-1">
                          {displayValue(row.address) || "—"}
                        </td>
                        <td className="p-1">
                          {formatDateToReadable(row.siteRegistrationDate) || "—"}
                        </td>
                        <td className="p-1">
                          {formatDateToReadable(row.siteRegistrationExpiryDate) || "—"}
                        </td>
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
              <p key={i} className="text-xs text-yellow-700">
                {err}
              </p>
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
                `Import`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// View Modal
const ViewModal = ({ show, onClose, form, formatDateToReadable }) =>
  show &&
  ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          View Supplier
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Supplier Name
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
              {displayValue(form.name)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Site Registration Date
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100">
              {formatDateToReadable(form.siteRegistrationDate)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Site Registration Expiry Date
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100">
              {formatDateToReadable(form.siteRegistrationExpiryDate)}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Status
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
              {form.enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-600">
            Address
          </label>
          <textarea
            readOnly
            value={displayValue(form.address)}
            className="w-full border px-3 py-2 rounded-lg bg-gray-100 resize-none"
            rows={3}
          />
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );

// Edit Modal
const EditModal = ({
  show,
  onClose,
  form,
  setForm,
  onSubmit,
  formatDateToReadable,
}) =>
  show &&
  ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">
          Edit Supplier
        </h2>
        <form onSubmit={onSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium">Supplier Name</label>
              <input
                type="text"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border px-3 py-2 rounded-lg border-gray-300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                Site Registration Date
              </label>
              <DatePicker
                selected={
                  form.siteRegistrationDate
                    ? new Date(form.siteRegistrationDate)
                    : null
                }
                onChange={(date) =>
                  setForm({
                    ...form,
                    siteRegistrationDate: date ? date.toISOString() : "",
                  })
                }
                dateFormat="yyyy-MM-dd"
                placeholderText="Select registration date"
                className="w-full border px-3 py-2 rounded-lg border-gray-300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">
                Site Registration Expiry Date
              </label>
              <DatePicker
                selected={
                  form.siteRegistrationExpiryDate
                    ? new Date(form.siteRegistrationExpiryDate)
                    : null
                }
                onChange={(date) =>
                  setForm({
                    ...form,
                    siteRegistrationExpiryDate: date ? date.toISOString() : "",
                  })
                }
                dateFormat="yyyy-MM-dd"
                placeholderText="Select expiry date"
                className="w-full border px-3 py-2 rounded-lg border-gray-300"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Status</label>
              <select
                value={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.value === "true" })
                }
                className="w-full border px-3 py-2 rounded-lg capitalize border-gray-300"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium">Address</label>
            <textarea
              value={form.address || ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full border px-3 py-2 rounded-lg border-gray-300 resize-none"
              rows={3}
              required
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
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
    document.body,
  );

// Main Supplier Component
const Supplier = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalSuppliers, setTotalSuppliers] = useState(0);
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    siteRegistrationDate: "",
    siteRegistrationExpiryDate: "",
    enabled: "",
  });
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setLoading(true);
        const params = {
          page: currentPage,
          limit: SUPPLIERS_PER_PAGE,
        };
        if (search && search.trim() !== "") {
          params.search = search.trim();
        }

        const response = await axios.get(`${backendUrl}/api/suppliers`, {
          params: params,
          timeout: 10000,
        });

        if (response.data) {
          if (response.data.success || response.data.ok) {
            const data = response.data.data || response.data.suppliers || [];
            const total = response.data.total || response.data.count || 0;
            const totalPages =
              response.data.totalPages ||
              Math.ceil(total / SUPPLIERS_PER_PAGE) ||
              1;

            setSuppliers(data);
            setTotalSuppliers(total);
            setTotalPages(totalPages);
            setError(null);
          } else if (Array.isArray(response.data)) {
            setSuppliers(response.data);
            setTotalSuppliers(response.data.length);
            setTotalPages(Math.ceil(response.data.length / SUPPLIERS_PER_PAGE));
            setError(null);
          } else {
            setSuppliers(response.data.suppliers || []);
            setTotalSuppliers(response.data.total || 0);
            setTotalPages(response.data.totalPages || 1);
            setError(null);
          }
        } else {
          setError("No data received from server");
        }
      } catch (err) {
        console.error("Error fetching suppliers:", err);
        if (err.response) {
          setError(
            `Server error: ${err.response.status} - ${err.response.data?.message || "Unknown error"}`,
          );
          showToast("error", `Failed to fetch suppliers: ${err.response.status}`);
        } else if (err.request) {
          setError("No response from server. Check backend connection.");
          showToast("error", "Cannot connect to server. Please try again.");
        } else {
          setError(`Request error: ${err.message}`);
          showToast("error", `Failed to fetch suppliers: ${err.message}`);
        }
        setSuppliers([]);
        setTotalSuppliers(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, [currentPage, search, activeTab, refreshKey]);

  // Debounced search
  useEffect(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
    const timeout = setTimeout(() => {
      if (search !== "") {
        setCurrentPage(1);
      }
    }, 500);
    setSearchTimeout(timeout);
    return () => clearTimeout(timeout);
  }, [search]);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  const hasEnabled = useMemo(
    () => suppliers.some((s) => s.enabled),
    [suppliers],
  );
  const hasDisabled = useMemo(
    () => suppliers.some((s) => !s.enabled),
    [suppliers],
  );

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Enabled" && s.enabled) ||
        (activeTab === "Disabled" && !s.enabled);
      return matchesTab;
    });
  }, [suppliers, activeTab]);

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
  };

  const toggleSelect = useCallback((supplier) => {
    setSelected((prev) =>
      prev.some((s) => s.id === supplier._id)
        ? prev.filter((s) => s.id !== supplier._id)
        : [...prev, { id: supplier._id }],
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked ? filteredSuppliers.map((s) => ({ id: s._id })) : [],
      );
    },
    [filteredSuppliers],
  );

  const handleView = (supplier) => {
    setForm(supplier);
    setIsOpen("view");
  };

  const handleEdit = (supplier) => {
    setForm(supplier);
    setIsOpen("edit");
  };

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> suppliers?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const idsToDelete = selected.map((s) => s.id);
        const res = await axios.delete(`${backendUrl}/api/suppliers`, {
          data: { ids: idsToDelete },
        });

        if (res.status === 200 || res.status === 204) {
          showToast("success", "Suppliers deleted successfully");
          setSuppliers((prev) =>
            prev.filter((s) => !idsToDelete.includes(s._id)),
          );
          setTotalSuppliers((prev) => prev - selected.length);
          setSelected([]);
        }
      } catch (err) {
        console.error("Delete error:", err.response?.data || err.message);
        showToast(
          "error",
          err.response?.data?.message || "Failed to delete suppliers.",
        );
      }
    }
  };

  const deleteSupplier = async (supplier) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${displayValue(supplier.name)}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/suppliers/${supplier._id}`,
        );
        if (res.status === 200 || res.status === 204) {
          showToast(
            "success",
            res.data?.message || "Supplier deleted successfully",
          );
          setSuppliers((prev) => prev.filter((s) => s._id !== supplier._id));
          setTotalSuppliers((prev) => prev - 1);
        }
      } catch (err) {
        showToast(
          "error",
          err.response?.data?.message || "Failed to delete supplier",
        );
      }
    }
  };

  const handlerEnabledSupplier = async (id) => {
    const selectedSupplier = suppliers.find((s) => s._id === id);
    if (!selectedSupplier) return;

    try {
      const res = await axios.put(`${backendUrl}/api/suppliers/${id}`, {
        enabled: !selectedSupplier.enabled,
      });

      if (res.status === 200) {
        showToast(
          "success",
          `Supplier ${res.data.supplier.enabled ? "enabled" : "disabled"} successfully`,
        );
        setRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update supplier status.",
      );
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => inputRef.current.classList.remove("highlight"), 1000);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();

    try {
      const updateData = {
        ...form,
        name: toLowerCase(form.name),
        address: toLowerCase(form.address),
      };

      const res = await axios.put(
        `${backendUrl}/api/suppliers/${form._id}`,
        updateData,
      );

      if (res.status === 200) {
        showToast("success", "Supplier updated successfully");
        setIsOpen(null);
        setRefreshKey((prev) => prev + 1);
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update supplier.",
      );
    }
  };

  // Download all suppliers as Excel
  const handleDownloadAll = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/suppliers/export`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "suppliers_export.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", "Failed to download supplier list");
      console.error(err);
    }
  };

  if (loading && suppliers.length === 0)
    return <LoadingOverlay text="Please wait..." />;
  if (error && suppliers.length === 0)
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700 font-medium">Error: {error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              setCurrentPage(1);
            }}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="p-6">
      <TopBar
        onAddNew={() => navigate("/masterlayout/supplier/new")}
        onImport={() => setIsOpen("import")}
        onDownloadAll={handleDownloadAll}
        onDeleteSelected={handleDeleteSelected}
        selectedCount={selected.length}
        showSampleDownload={isSampleDownloadEnabled}
        showExportButton={isSampleDownloadEnabled}
      />

      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <Tabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalSuppliers={totalSuppliers}
          hasEnabled={hasEnabled}
          hasDisabled={hasDisabled}
        />

        {totalSuppliers > 0 && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {totalSuppliers}
              </span>
            </p>
            <SearchBar
              search={search}
              setSearch={setSearch}
              setCurrentPage={setCurrentPage}
              inputRef={inputRef}
              handleIconClick={handleIconClick}
              handleSearchChange={handleSearchChange}
            />
          </div>
        )}
      </div>

      {search && totalSuppliers > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            Searching for: <span className="font-semibold">"{search}"</span>
            <span className="ml-4">
              Found: <span className="font-bold">{totalSuppliers}</span>{" "}
              supplier(s)
            </span>
          </p>
        </div>
      )}

      {search && totalSuppliers === 0 && suppliers.length === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-700">
            No suppliers found for:{" "}
            <span className="font-semibold">"{search}"</span>
            <span className="ml-4">
              <button
                onClick={() => setSearch("")}
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Clear search
              </button>
            </span>
          </p>
        </div>
      )}

      <SupplierTable
        currentSuppliers={filteredSuppliers}
        selected={selected}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        handleView={handleView}
        handleEdit={handleEdit}
        deleteSupplier={deleteSupplier}
        handlerEnabledSupplier={handlerEnabledSupplier}
        formatDateToReadable={formatDateToReadable}
      />

      {filteredSuppliers.length > 0 && totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />
      )}

      <ImportModal
        show={isOpen === "import"}
        onClose={(shouldRefresh) => {
          setIsOpen(null);
          if (shouldRefresh) setRefreshKey((prev) => prev + 1);
        }}
        isSampleFile={isSampleFile}
      />
      <ViewModal
        show={isOpen === "view"}
        onClose={() => setIsOpen(null)}
        form={form}
        formatDateToReadable={formatDateToReadable}
      />
      <EditModal
        show={isOpen === "edit"}
        onClose={() => setIsOpen(null)}
        form={form}
        setForm={setForm}
        onSubmit={handleEditSubmit}
        formatDateToReadable={formatDateToReadable}
      />
    </div>
  );
};

export default Supplier;
