// src/components/Supplier.js
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
const SUPPLIERS_PER_PAGE = 9;

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
}) => (
  <div className="flex items-center gap-8">
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
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setCurrentPage(1);
        }}
        className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
      />
    </div>
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
          <th className="p-3 text-sm font-medium">Enabled</th>
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
                <span className="capitalize">{supplier.name}</span>
              </div>
            </td>
            <td className="p-3">{supplier.address}</td>
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

const Pagination = ({ currentPage, totalPages, setCurrentPage }) => (
  <div className="mt-4 flex justify-start gap-2 p-5">
    <button
      onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
      disabled={currentPage === 1}
      className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
    >
      Prev
    </button>
    {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
      <button
        key={page}
        onClick={() => setCurrentPage(page)}
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
      onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
      disabled={currentPage === totalPages}
      className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
    >
      Next
    </button>
  </div>
);

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
              Product Name
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
              {form.name}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600">
              Address
            </label>
            <p className="border px-3 py-2 rounded-lg bg-gray-100">
              {form.address}
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
            <label className="block text-sm font-medium">Product Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border px-3 py-2 rounded-lg border-gray-300"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Address</label>
            <input
              type="text"
              value={form.address}
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

  // Fetch suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/suppliers`);
        if (!response.ok) throw new Error("Failed to fetch suppliers");
        const data = await response.json();
        setSuppliers(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search]);

  // Filter suppliers
  const filteredSuppliers = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    return suppliers.filter((s) => {
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Enabled" && s.enabled) ||
        (activeTab === "Disabled" && !s.enabled);
      const nameMatch = s.name?.toLowerCase().includes(lowerSearch);
      const addressMatch = s.address?.toLowerCase().includes(lowerSearch);
      const siteMatch = formatDateToReadable(s.siteRegistrationDate)
        ?.toLowerCase()
        .includes(lowerSearch);
      const expiryMatch = formatDateToReadable(s.siteRegistrationExpiryDate)
        ?.toLowerCase()
        .includes(lowerSearch);
      return (
        matchesTab && (nameMatch || addressMatch || siteMatch || expiryMatch)
      );
    });
  }, [suppliers, activeTab, search]);

  // Pagination
  const totalPages = Math.ceil(filteredSuppliers.length / SUPPLIERS_PER_PAGE);
  const currentSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * SUPPLIERS_PER_PAGE,
    currentPage * SUPPLIERS_PER_PAGE
  );

  // Handlers
  const toggleSelect = useCallback((supplier) => {
    setSelected((prev) =>
      prev.some((s) => s.id === supplier._id)
        ? prev.filter((s) => s.id !== supplier._id)
        : [...prev, { id: supplier._id }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(checked ? currentSuppliers.map((s) => ({ id: s._id })) : []);
    },
    [currentSuppliers]
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
          const refreshed = await fetch(`${backendUrl}/api/suppliers`);
          const updated = await refreshed.json();
          setSuppliers(updated);
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
      text: `Are you sure you want to delete <b>${supplier.name}</b>?`,
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
          const refreshed = await fetch(`${backendUrl}/api/suppliers`);
          const updated = await refreshed.json();
          setSuppliers(updated);
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
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      console.log("Raw Excel rows:", allRows);

      // Remove empty rows
      const cleanedRows = allRows.filter(
        (row) =>
          row.length > 0 &&
          row.some((cell) => cell && cell.toString().trim() !== "")
      );

      // Check if first row is header
      const firstRow = cleanedRows[0];
      const hasHeader = firstRow.some(
        (cell) =>
          (typeof cell === "string" &&
            cell.toLowerCase().includes("supplier")) ||
          cell.toLowerCase().includes("name") ||
          cell.toLowerCase().includes("address")
      );

      // If header exists, remove it
      const dataRows = hasHeader ? cleanedRows.slice(1) : cleanedRows;

      // Map the data correctly
      const parsedData = dataRows.map((row, index) => {
        const supplierName = (row[0] || "").toString().trim();
        const address = (row[1] || "").toString().trim();
        const siteRegistrationNumber = (row[2] || "").toString().trim();
        const expiryDateStr = (row[3] || "").toString().trim();

        // Parse expiry date if available
        let parsedExpiryDate = null;
        if (expiryDateStr) {
          // Try DD/MM/YYYY format
          const parts = expiryDateStr.split("/");
          if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const year = parseInt(parts[2], 10);
            parsedExpiryDate = new Date(year, month, day);
          } else {
            // Try other date formats
            parsedExpiryDate = new Date(expiryDateStr);
          }
        }

        // Prepare the data object
        const dataObj = {
          supplierName,
          address,
        };

        // Only add dates if they're valid
        if (parsedExpiryDate && !isNaN(parsedExpiryDate.getTime())) {
          dataObj.siteRegistrationExpiryDate = parsedExpiryDate.toISOString();
        }

        // Note: siteRegistrationDate will be set by the backend to current date if not provided

        return dataObj;
      });

      // Filter out rows without supplier name
      const validData = parsedData.filter(
        (item) => item.supplierName && item.supplierName.trim() !== ""
      );

      console.log("Parsed data:", validData);

      // Count missing data for warning
      const missingExpiryDates = validData.filter(
        (item) => !item.siteRegistrationExpiryDate
      ).length;

      if (missingExpiryDates > 0) {
        showToast(
          "warning",
          `${missingExpiryDates} supplier(s) have missing/invalid expiry dates. Default values will be applied.`
        );
      }

      setParsedData(validData);

      if (validData.length === 0) {
        showToast(
          "warning",
          "No valid data found in the Excel file. Please check the format."
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Excel File is Empty");
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/suppliers/import`,
        parsedData
      );
      if (res.status === 200) {
        let toastMessage = res.data.message || "Suppliers imported successfully!";
        
        // Show warnings if any
        if (res.data.warnings && res.data.warnings.length > 0) {
          setImportWarnings(res.data.warnings);
          toastMessage += " Some rows had warnings.";
          
          // Show first 3 warnings as a toast
          if (res.data.warnings.length <= 3) {
            res.data.warnings.forEach(warning => {
              showToast("warning", warning);
            });
          } else {
            showToast("warning", `${res.data.warnings.length} rows had warnings. Check console for details.`);
            console.warn("Import warnings:", res.data.warnings);
          }
        }
        
        showToast("success", toastMessage);
        
        // Only close modal if no errors
        if (res.data.errorCount === 0) {
          setIsOpen(null);
          setImportWarnings([]);
        }
        
        // Refresh suppliers
        const updated = await fetch(`${backendUrl}/api/suppliers`);
        setSuppliers(await updated.json());
        setParsedData([]);
      }
    } catch (err) {
      const message =
        err.response?.data?.message?.replace(/<[^>]+>/g, "") ||
        "Failed to import suppliers.";
      showToast("error", message);
      
      // Store warnings if any
      if (err.response?.data?.warnings) {
        setImportWarnings(err.response.data.warnings);
      }
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
        setSuppliers((prev) =>
          prev.map((s) =>
            s._id === id ? { ...s, enabled: res.data.enabled } : s
          )
        );
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
      const res = await axios.put(
        `${backendUrl}/api/suppliers/${form._id}`,
        form
      );
      if (res.status === 200) {
        showToast("success", "Supplier updated successfully");
        setIsOpen(null);
        const updated = await fetch(`${backendUrl}/api/suppliers`);
        setSuppliers(await updated.json());
      }
    } catch (err) {
      showToast("error", "Failed to update supplier.");
    }
  };

  if (loading) return <LoadingOverlay text="Please wait..." />;
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
          totalSuppliers={suppliers.length}
        />
        {suppliers.length > 0 && (
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {filteredSuppliers.length}
              </span>
            </p>
            <SearchBar
              search={search}
              setSearch={setSearch}
              setCurrentPage={setCurrentPage}
              inputRef={inputRef}
              handleIconClick={handleIconClick}
            />
          </div>
        )}
      </div>
      <SupplierTable
        currentSuppliers={currentSuppliers}
        selected={selected}
        toggleSelect={toggleSelect}
        toggleSelectAll={toggleSelectAll}
        handleView={handleView}
        handleEdit={handleEdit}
        deleteSupplier={deleteSupplier}
        handlerEnabledSupplier={handlerEnabledSupplier}
        formatDateToReadable={formatDateToReadable}
      />
      {currentSuppliers.length > 0 && (
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