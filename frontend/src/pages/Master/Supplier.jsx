import { useNavigate } from "react-router-dom";
import { UserPlus, Upload, Search, Eye, Edit, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import axios from "axios";
import { confirmDialog } from "../../utils/confirmationDialog";
import { showToast } from "../../utils/toast";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil";
import { useVisiblePages } from "../../utils/useVisiblePages";
import SampleExcelDownloadSupplier from "../../excels/SampleExcelDownloadSuppiler";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const suppliersPerPage = 9;

const Supplier = () => {
  const navigate = useNavigate();

  const [supplier, setSupplier] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selected, setSelected] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    address: "",
    siteRegistrationDate: "",
    siteRegistrationExpiryDate: "",
    enabled: "",
  });

  // Enhanced date parsing function
  const parseExcelDate = (value) => {
    if (!value && value !== 0) return null;
    
    console.log("Raw date value:", value, "Type:", typeof value);
    
    // If it's an Excel serial number
    if (typeof value === "number") {
      try {
        // Excel date (number of days since 1900-01-01)
        // Adjust for Excel's leap year bug (treats 1900 as leap year)
        const days = value > 60 ? value - 1 : value;
        const excelEpoch = new Date(1900, 0, 1);
        const jsDate = new Date(excelEpoch.getTime() + days * 86400 * 1000);
        
        // Validate the date
        if (isNaN(jsDate.getTime())) {
          console.warn("Invalid date from Excel serial:", value);
          return null;
        }
        
        console.log("Converted Excel serial to date:", jsDate);
        return jsDate; // Return Date object instead of string
      } catch (error) {
        console.error("Error converting Excel date:", error);
        return null;
      }
    }
    
    // If it's a string, try to parse it with multiple formats
    if (typeof value === "string") {
      const trimmedValue = value.trim();
      if (!trimmedValue) return null;

      // Try different date formats
      const dateFormats = [
        new Date(trimmedValue), // Standard format
        new Date(trimmedValue.replace(/(\d+)\/(\d+)\/(\d+)/, '$2/$1/$3')), // DD/MM/YYYY to MM/DD/YYYY
        new Date(trimmedValue.replace(/(\d+)-(\d+)-(\d+)/, '$2/$1/$3')), // DD-MM-YYYY to MM-DD-YYYY
        new Date(trimmedValue.replace(/(\d+)\.(\d+)\.(\d+)/, '$2/$1/$3')), // DD.MM.YYYY to MM/DD/YYYY
      ];

      for (const date of dateFormats) {
        if (!isNaN(date.getTime())) {
          console.log("Parsed string date:", date);
          return date; // Return Date object
        }
      }

      console.warn("Could not parse date string:", trimmedValue);
      return null;
    }

    // If it's already a Date object, validate it
    if (value instanceof Date) {
      return !isNaN(value.getTime()) ? value : null;
    }

    console.warn("Unhandled date format:", value, typeof value);
    return null;
  };

  // Fetch suppliers
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await fetch(`${backendUrl}/api/suppliers`);
        if (!response.ok) throw new Error("Failed to fetch suppliers");
        const data = await response.json();
        setSupplier(data);
      } catch (err) {
        setError(err.message || "Something went wrong");
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
  }, []);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, search]);

  const filteredSuppliers = useMemo(() => {
    const lowerSearch = search.toLowerCase();

    return supplier.filter((s) => {
      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Enabled" && s.enabled === true) ||
        (activeTab === "Disabled" && s.enabled === false);

      const nameMatch = s.name?.toLowerCase().includes(lowerSearch);
      const addressMatch = s.address?.toLowerCase().includes(lowerSearch);
      const siteMatch = formatDateToReadable(s.siteRegistrationDate)
        ?.toLowerCase()
        .includes(lowerSearch);
      const ExpiryMatch = formatDateToReadable(s.siteRegistrationExpiryDate)
        ?.toLowerCase()
        .includes(lowerSearch);

      return (
        matchesTab && (nameMatch || addressMatch || siteMatch || ExpiryMatch)
      );
    });
  }, [supplier, activeTab, search]);

  // Pagination logic
  const totalPages = Math.ceil(filteredSuppliers.length / suppliersPerPage);
  const currentSuppliers = filteredSuppliers.slice(
    (currentPage - 1) * suppliersPerPage,
    currentPage * suppliersPerPage
  );

  const toggleSelect = useCallback((staff) => {
    setSelected((prev) =>
      prev.some((c) => c.id === staff._id)
        ? prev.filter((c) => c.id !== staff._id)
        : [...prev, { id: staff._id }]
    );
  }, []);

  // Select / Deselect all visible staff
  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentSuppliers.map((s) => ({
              id: s._id,
            }))
          : []
      );
    },
    [currentSuppliers]
  );

  const handleView = (supplier) => {
    setForm(supplier);
    setIsViewModalOpen(true);
  };

  const handleEdit = (supplier) => {
    setForm(supplier);
    setIsEditModalOpen(true);
  };

  // Delete selected
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> suppliers?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/suppliers`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast("success", "Suppliers  deleted successfully");
          const refreshed = await fetch(`${backendUrl}/api/suppliers`);
          const updated = await refreshed.json();
          setSupplier(updated);
          setSelected([]);
        }
      } catch (err) {
        showToast("error", "Failed to delete suppliers.");
      }
    } else {
      setSelected([]); // uncheck all if user cancels
    }
  };

  // Delete one
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
          setSupplier(updated);
        }
      } catch (err) {
        showToast("error", error.message);
      }
    }
  };

  const EXPECTED_HEADERS = [
    "product name",
    "address",
    "site registration date",
    "site registration expiry date",
  ];

  const normalizeHeader = (header) => header?.toString().trim().toLowerCase();

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

      let headerRowIndex = -1;
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i].map(normalizeHeader);
        const isMatch = EXPECTED_HEADERS.every((header) =>
          row.includes(header)
        );
        if (isMatch) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        alert("Required headers not found in the file.");
        return;
      }

      const headers = allRows[headerRowIndex];
      const dataRows = allRows.slice(headerRowIndex + 1);

      const parsedData = dataRows.map((row) => {
        const obj = {};
        headers.forEach((header, idx) => {
          obj[normalizeHeader(header)] = row[idx];
        });

        // Parse dates and ensure they're valid
        const siteRegistrationDate = parseExcelDate(obj["site registration date"]);
        const siteRegistrationExpiryDate = parseExcelDate(obj["site registration expiry date"]);

        return {
          name: obj["product name"]?.toString().trim() || "",
          address: obj["address"]?.toString().trim() || "",
          siteRegistrationDate: siteRegistrationDate && !isNaN(siteRegistrationDate.getTime()) 
            ? siteRegistrationDate.toISOString() 
            : null,
          siteRegistrationExpiryDate: siteRegistrationExpiryDate && !isNaN(siteRegistrationExpiryDate.getTime()) 
            ? siteRegistrationExpiryDate.toISOString() 
            : null,
        };
      }).filter(item => {
        // Filter out items with invalid required dates
        const hasValidDates = item.siteRegistrationDate !== null && item.siteRegistrationExpiryDate !== null;
        const hasRequiredFields = item.name && item.address;
        
        if (!hasValidDates) {
          console.warn("Skipping item with invalid dates:", item);
        }
        
        return hasRequiredFields && hasValidDates;
      });

      console.log("Final parsed data:", parsedData);
      setParsedData(parsedData);
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Excel File is Empty");
      return;
    }
    
    // Additional validation before import
    const invalidDates = parsedData.filter(item => !item.siteRegistrationDate || !item.siteRegistrationExpiryDate);
    if (invalidDates.length > 0) {
      showToast("warning", `Found ${invalidDates.length} records with invalid dates. Please check your Excel file.`);
      console.log("Records with invalid dates:", invalidDates);
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
        setShowImportModal(false);
        const updated = await fetch(`${backendUrl}/api/suppliers`);
        setSupplier(await updated.json());
        setParsedData([]); // Clear parsed data after successful import
      }
    } catch (err) {
      console.error("Import error:", err);

      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast("error", cleanMessage || "Failed to import suppliers.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handlerEnabledSupplier = async (id) => {
    const selectedSupplier = supplier.find((c) => c._id === id);
    if (!selectedSupplier) return;

    try {
      const res = await axios.put(`${backendUrl}/api/suppliers/${id}`, {
        enabled: !selectedSupplier.enabled,
      });

      if (res.status === 200) {
        setSupplier((prev) =>
          prev.map((c) =>
            c._id === id ? { ...c, enabled: res.data.enabled } : c
          )
        );
      }
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to update supplier status.");
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        inputRef.current.classList.remove("highlight");
      }, 1000);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/masterlayout/supplier/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Supplier
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        {/* Tabs (conditionally rendered) */}
        {supplier.length > 0 ? (
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
          <div></div>
        )}

        {/* Total Count & Search (always visible) */}
        <div className="flex items-center gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredSuppliers.length}
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
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
            />
          </div>
        </div>
      </div>

      {/* Table */}
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
                  <span>Product Name</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Address</th>
              <th className="p-3 text-sm font-medium">Site Registration Date</th>
              <th className="p-3 text-sm font-medium">Site Registration Expiry Date</th>
              <th className="p-3 text-sm font-medium">Enabled</th>
              <th className="p-3 text-sm font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentSuppliers.map((supplier, index) => (
              <tr
                key={supplier._id}
                className={`hover:bg-gray-50 ${
                  (index + 1) % suppliersPerPage === 0 ||
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
                      onChange={() => toggleSelect(supplier)} // Toggle on click
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

        {currentSuppliers.length > 0 && (
          <div className="mt-4 flex justify-start gap-2 p-5">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
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
              )
            )}

            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Import CSV Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowImportModal(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              {/* Close */}
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Supplier
              </h2>

              {isSampleFile && <SampleExcelDownloadSupplier />}

              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  disabled={isUploading || parsedData.length === 0}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              {/* Close Button */}
              <button
                onClick={() => setIsViewModalOpen(false)}
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
                  <label className="block text-sm font-medium text-gray-600">Status</label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.enabled == true ? "Enabled" : "Disabled"}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen">
              {/* Close Button */}
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Supplier
              </h2>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    const res = await axios.put(
                      `${backendUrl}/api/suppliers/${form._id}`,
                      form
                    );
                    if (res.status === 200) {
                      showToast("success", "Supplier updated successfully");
                      setIsEditModalOpen(false);

                      const updated = await fetch(
                        `${backendUrl}/api/suppliers`
                      );
                      setSupplier(await updated.json());
                    }
                  } catch (err) {
                    console.error("Update error:", err);
                    showToast("error", "Failed to update supplier.");
                  }
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Address</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm({ ...form, address: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
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
                      date
                        ? setForm({
                            ...form,
                            siteRegistrationDate: date.toISOString(),
                          })
                        : null
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select registration date"
                    className="w-full border px-3 py-2 rounded-lg"
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
                      date
                        ? setForm({
                            ...form,
                            siteRegistrationExpiryDate: date.toISOString(),
                          })
                        : null
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select expiry date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium">Status</label>
                  <select
                    value={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.value === "true" })}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  >
                    <option value="true">Enabled</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
              </form>

              {/* Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async (e) => {
                    e.preventDefault();
                    try {
                      const res = await axios.put(
                        `${backendUrl}/api/suppliers/${form._id}`,
                        form
                      );
                      if (res.status === 200) {
                        showToast("success", "Supplier updated successfully");
                        setIsEditModalOpen(false);

                        const updated = await fetch(
                          `${backendUrl}/api/suppliers`
                        );
                        setSupplier(await updated.json());
                      }
                    } catch (err) {
                      console.error("Update error:", err);
                      showToast("error", "Failed to update supplier.");
                    }
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Update
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Supplier;