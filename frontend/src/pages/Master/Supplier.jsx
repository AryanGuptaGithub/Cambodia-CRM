import { useNavigate } from "react-router-dom";
import { UserPlus, Upload, Search, Eye, Edit, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil";
import { parseExcelDate } from "../../utils/excelUtility";
import SampleExcelDownloadSupplier from "../../excels/SampleExcelDownloadSuppiler";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import LoadingOverlay from "../../components/Loading";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const SUPPLIERS_PER_PAGE = 10; // Match backend default

// Helper to convert to title case for display
const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
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
const TopBar = ({ onAddNew, onImport, onDeleteSelected, selectedCount }) => (
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

const Tabs = ({ activeTab, setActiveTab, totalSuppliers }) => (
  <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
    {totalSuppliers > 0 ? (
      <div className="flex gap-4">
        {["All", "Enabled", "Disabled"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg cursor-pointer ${
              activeTab === tab
                ? "bg-indigo-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
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
                <span className="capitalize">{displayValue(supplier.name)}</span>
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
  // Generate visible page numbers
  const getVisiblePages = () => {
    const pages = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      // Calculate start and end
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      
      // Adjust if near the beginning
      if (currentPage <= 3) {
        start = 2;
        end = 4;
      }
      
      // Adjust if near the end
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }
      
      // Add ellipsis if needed
      if (start > 2) {
        pages.push("...");
      }
      
      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      // Add ellipsis if needed
      if (end < totalPages - 1) {
        pages.push("...");
      }
      
      // Always show last page
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

const ImportModal = ({
  show,
  onClose,
  isUploading,
  onFileUpload,
  onImport,
  parsedData,
  isSampleFile,
}) =>
  show &&
  ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
          disabled={isUploading}
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Import Supplier
        </h2>
        {isSampleFile && <SampleExcelDownloadSupplier />}
        <div className="mb-6">
          <label className="block text-gray-700 mb-2">File</label>
          <input
            type="file"
            accept=".csv, .xlsx"
            onChange={onFileUpload}
            className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
          />
        </div>
        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">
            {parsedData.length > 0 ? (
              <>
                Rows to import:{" "}
                <span className="font-semibold text-blue-600">
                  {parsedData.length}
                </span>
              </>
            ) : (
              <span className="text-gray-500">No data to import</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button
              onClick={onImport}
              className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
              disabled={isUploading || parsedData.length === 0}
            >
              {isUploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );

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
              Address
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100">
              {displayValue(form.address)}
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
    document.body
  );

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e);
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
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
            <label className="block text-sm font-medium">Address</label>
            <input
              type="text"
              value={form.address || ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
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
          <div className="md:col-span-2 mt-4 flex justify-end gap-3">
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
    document.body
  );

const Supplier = () => {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  // State
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
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    siteRegistrationDate: "",
    siteRegistrationExpiryDate: "",
    enabled: "",
  });
  const [importWarnings, setImportWarnings] = useState([]);
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Fetch suppliers with pagination
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${backendUrl}/api/suppliers`, {
          params: {
            page: currentPage,
            limit: SUPPLIERS_PER_PAGE,
            search: search
          }
        });
        
        if (response.data.ok) {
          setSuppliers(response.data.suppliers || []);
          setTotalSuppliers(response.data.total || 0);
          setTotalPages(response.data.totalPages || 1);
        } else {
          setError("Failed to fetch suppliers");
        }
      } catch (err) {
        setError(err.message || "Something went wrong");
        showToast("error", "Failed to fetch suppliers");
      } finally {
        setLoading(false);
      }
    };
    
    fetchSuppliers();
  }, [currentPage, search]); // Refetch when page or search changes

  // Add debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for search
    const timeout = setTimeout(() => {
      if (search !== "") {
        setCurrentPage(1); // Reset to first page when searching
      }
    }, 500); // 500ms delay for search

    setSearchTimeout(timeout);

    // Cleanup
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [search]);

  // Reset page when tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab]);

  // Filter suppliers based on active tab
  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((s) => {
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Enabled" && s.enabled) ||
        (activeTab === "Disabled" && !s.enabled);
      return matchesTab;
    });
  }, [suppliers, activeTab]);

  // Handlers
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearch(value);
    // Don't reset page here, let the useEffect handle it with debounce
  };

  const toggleSelect = useCallback((supplier) => {
    setSelected((prev) =>
      prev.some((s) => s.id === supplier._id)
        ? prev.filter((s) => s.id !== supplier._id)
        : [...prev, { id: supplier._id }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(checked ? filteredSuppliers.map((s) => ({ id: s._id })) : []);
    },
    [filteredSuppliers]
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

        if (res.status === 200) {
          showToast("success", "Suppliers deleted successfully");
          // Refresh data
          const response = await axios.get(`${backendUrl}/api/suppliers`, {
            params: {
              page: currentPage,
              limit: SUPPLIERS_PER_PAGE,
              search: search
            }
          });
          
          if (response.data.ok) {
            setSuppliers(response.data.suppliers || []);
            setTotalSuppliers(response.data.total || 0);
            setTotalPages(response.data.totalPages || 1);
          }
          setSelected([]);
        }
      } catch (err) {
        console.error("Delete error:", err.response?.data || err.message);
        showToast("error", "Failed to delete suppliers.");
      }
    } else {
      setSelected([]);
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
          `${backendUrl}/api/suppliers/${supplier._id}`
        );
        if (res.status === 200) {
          showToast("success", res.data.message);
          // Refresh data
          const response = await axios.get(`${backendUrl}/api/suppliers`, {
            params: {
              page: currentPage,
              limit: SUPPLIERS_PER_PAGE,
              search: search
            }
          });
          
          if (response.data.ok) {
            setSuppliers(response.data.suppliers || []);
            setTotalSuppliers(response.data.total || 0);
            setTotalPages(response.data.totalPages || 1);
          }
        }
      } catch (err) {
        showToast("error", err.message || "Failed to delete supplier");
      }
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Convert entire sheet to array of arrays
        const rawData = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
          raw: false,
        });

        // Find the header row (the row with "Supplier Name" in first column)
        let headerRowIndex = -1;
        for (let i = 0; i < rawData.length; i++) {
          const firstCell =
            rawData[i] && rawData[i][0] ? rawData[i][0].toString().trim() : "";
          if (firstCell.toLowerCase() === "supplier name") {
            headerRowIndex = i;
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast("error", "Could not find header row with 'Supplier Name'");
          return;
        }

        // Get data rows starting from the row after the header
        const dataRows = rawData.slice(headerRowIndex + 1);

        // Parse data rows
        const parsedData = dataRows
          .map((row, index) => {
            try {
              // Skip empty rows
              if (!row || !Array.isArray(row) || row.length === 0) {
                return null;
              }

              const supplierName = (row[0] || "").toString().trim();
              const address = (row[1] || "").toString().trim();
              const siteRegistrationDateStr = (row[2] || "").toString().trim();
              const siteRegistrationExpiryDateStr = (row[3] || "")
                .toString()
                .trim();

              // Skip rows without supplier name
              if (!supplierName || supplierName.trim() === "") {
                return null;
              }

              const dataObj = {
                supplierName: supplierName.toLowerCase(), // Convert to lowercase
                address: address.toLowerCase(), // Convert to lowercase
              };

              // Helper function to parse date
              const parseDateValue = (dateStr) => {
                if (!dateStr || dateStr.trim() === "") {
                  return null;
                }

                // Try parsing as Excel serial number
                if (!isNaN(dateStr)) {
                  const serialDate = parseFloat(dateStr);
                  const date = parseExcelDate(serialDate);
                  if (date && !isNaN(date.getTime())) {
                    return date.toISOString();
                  }
                }

                // Try parsing as DD/MM/YYYY format
                if (dateStr.includes("/")) {
                  const parts = dateStr.split("/");
                  if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1;
                    const year = parseInt(parts[2], 10);
                    // Handle 2-digit years
                    const fullYear = year < 100 ? 2000 + year : year;
                    const date = new Date(fullYear, month, day);
                    if (!isNaN(date.getTime())) {
                      return date.toISOString();
                    }
                  }
                }

                // Try standard Date parsing
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                  return date.toISOString();
                }

                return null;
              };

              // Parse site registration date
              if (
                siteRegistrationDateStr &&
                siteRegistrationDateStr.trim() !== ""
              ) {
                const parsedDate = parseDateValue(siteRegistrationDateStr);
                if (parsedDate) {
                  dataObj.siteRegistrationDate = parsedDate;
                }
              }

              // Parse site registration expiry date
              if (
                siteRegistrationExpiryDateStr &&
                siteRegistrationExpiryDateStr.trim() !== ""
              ) {
                const parsedDate = parseDateValue(
                  siteRegistrationExpiryDateStr
                );
                if (parsedDate) {
                  dataObj.siteRegistrationExpiryDate = parsedDate;
                }
              }

              return dataObj;
            } catch (err) {
              console.error(`Error parsing row ${index}:`, err);
              return null;
            }
          })
          .filter((item) => item !== null); // Remove null items

        // Filter out rows without supplier name (just in case)
        const validData = parsedData.filter(
          (item) => item.supplierName && item.supplierName.trim() !== ""
        );

        if (validData.length === 0) {
          showToast(
            "warning",
            "No valid data found in the Excel file. Please check the format."
          );
        }

        setParsedData(validData);
      } catch (error) {
        console.error("Error processing file:", error);
        showToast("error", "Error processing file. Please check the format.");
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "No valid data to import");
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/suppliers/import`,
        parsedData
      );
      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Suppliers imported successfully!"
        );

        // Refresh suppliers
        const response = await axios.get(`${backendUrl}/api/suppliers`, {
          params: {
            page: currentPage,
            limit: SUPPLIERS_PER_PAGE,
            search: search
          }
        });
        
        if (response.data.ok) {
          setSuppliers(response.data.suppliers || []);
          setTotalSuppliers(response.data.total || 0);
          setTotalPages(response.data.totalPages || 1);
        }
        
        setParsedData([]);
        setIsOpen(null);
      }
    } catch (err) {
      const message =
        err.response?.data?.message || "Failed to import suppliers.";
      showToast("error", message);
    } finally {
      setIsUploading(false);
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
        // Update local state
        setSuppliers((prev) =>
          prev.map((s) =>
            s._id === id ? { ...s, enabled: res.data.enabled } : s
          )
        );
        showToast("success", `Supplier ${res.data.enabled ? "enabled" : "disabled"} successfully`);
      }
    } catch (err) {
      showToast("error", "Failed to update supplier status.");
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
      // Convert name and address to lowercase before sending
      const updateData = {
        ...form,
        name: toLowerCase(form.name),
        address: toLowerCase(form.address)
      };
      
      const res = await axios.put(
        `${backendUrl}/api/suppliers/${form._id}`,
        updateData
      );
      if (res.status === 200) {
        showToast("success", "Supplier updated successfully");
        setIsOpen(null);
        
        // Refresh data
        const response = await axios.get(`${backendUrl}/api/suppliers`, {
          params: {
            page: currentPage,
            limit: SUPPLIERS_PER_PAGE,
            search: search
          }
        });
        
        if (response.data.ok) {
          setSuppliers(response.data.suppliers || []);
          setTotalSuppliers(response.data.total || 0);
          setTotalPages(response.data.totalPages || 1);
        }
      }
    } catch (err) {
      showToast("error", "Failed to update supplier.");
    }
  };

  if (loading && suppliers.length === 0) return <LoadingOverlay text="Please wait..." />;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <TopBar
        onAddNew={() => navigate("/masterlayout/supplier/new")}
        onImport={() => setIsOpen("import")}
        onDeleteSelected={handleDeleteSelected}
        selectedCount={selected.length}
      />
      
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <Tabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalSuppliers={totalSuppliers}
        />
        
        {/* Only show total count and search when there are suppliers */}
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
      
      {/* Search results info - only show when searching and there are suppliers */}
      {search && totalSuppliers > 0 && (
        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-700">
            Searching for: <span className="font-semibold">"{search}"</span> 
            <span className="ml-4">Found: <span className="font-bold">{totalSuppliers}</span> supplier(s)</span>
          </p>
        </div>
      )}
      
      {/* Search results info - when searching but no suppliers found */}
      {search && totalSuppliers === 0 && (
        <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-700">
            No suppliers found for: <span className="font-semibold">"{search}"</span>
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
        onClose={() => {
          setIsOpen(null);
          setImportWarnings([]);
        }}
        isUploading={isUploading}
        onFileUpload={handleFileUpload}
        onImport={handleImport}
        parsedData={parsedData}
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