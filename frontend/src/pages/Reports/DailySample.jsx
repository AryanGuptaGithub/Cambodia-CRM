import React, { useState, useEffect } from "react";
import { Search, UserPlus, Upload, X, Eye, Edit, Trash2 } from "lucide-react";
import SampleExcelDownloadDailySample from "../../excels/SampleExcelDownloadDailySample";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import { useNavigate } from "react-router-dom";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const dailySamplePerPage = 10;

const DailySample = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dailySampleData, setDailySampleData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [parsedData, setParsedData] = useState([]);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({
    _id: "",
    requestNumber: "",
    date: "",
    mrName: "",
    description: "",
    productName: "",
    qtyBigBox: 0,
    qtySmallBox: 0,
    totalQty: 0,
    qtyPerBox: 0,
    remark: "",
  });

  const filteredDailySamples = dailySampleData.filter(
    (item) =>
      item.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.qtyBigBox?.toString().includes(searchTerm.toLowerCase()) ||
      item.qtySmallBox?.toString().includes(searchTerm.toLowerCase()) ||
      item.qtyPerBox?.toString().includes(searchTerm.toLowerCase()) ||
      item.requestNumber?.toString().includes(searchTerm.toLowerCase()) ||
      item.mrName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(
    filteredDailySamples.length / dailySamplePerPage
  );
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentDailySamples = filteredDailySamples.slice(
    (currentPage - 1) * dailySamplePerPage,
    currentPage * dailySamplePerPage
  );

  const fetchDailySampleReports = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/dailysample`);
      if (!res.ok) throw new Error("Failed to fetch daily sample reports");

      const data = await res.json();
      setDailySampleData(data.reports);
    } catch (error) {
      console.error("❌ Fetch Daily Sample Reports Error:", error);
      showToast(
        "error",
        error.message || "Error fetching daily sample reports"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDailySampleReports();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
      });

      if (rows.length === 0) {
        showToast("warning", "Excel file is empty");
        return;
      }

      // ✅ Required headers
      const requiredHeaders = [
        "request #",
        "date",
        "mr name",
        "description",
        "product name",
      ];

      let headerRowIndex = -1;
      let matchedHeaders = [];

      // 🔍 Find header row (first 10 rows max)
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((cell) =>
          cell?.toString().trim().toLowerCase()
        );
        const matched = requiredHeaders.filter((header) =>
          row.includes(header)
        );
        if (matched.length >= 4) {
          headerRowIndex = i;
          matchedHeaders = matched;
          break;
        }
      }

      if (
        headerRowIndex === -1 ||
        matchedHeaders.length < requiredHeaders.length
      ) {
        const missing = requiredHeaders.filter(
          (h) => !matchedHeaders.includes(h)
        );
        showToast("error", `❌ Missing headers: ${missing.join(", ")}`);
        return;
      }

      // ✅ Map header keys to column indexes
      const rawHeaders = rows[headerRowIndex];
      const headersMap = {};
      rawHeaders.forEach((header, index) => {
        if (!header) return;
        const cleaned = header.toString().trim().toLowerCase();
        headersMap[index] = cleaned;
      });

      // ✅ Extract data rows
      const dataRows = rows.slice(headerRowIndex + 1);
      if (dataRows.length === 0) {
        showToast("warning", "No data rows found in Excel file.");
        return;
      }

      const mappedData = dataRows
        .map((row) => {
          const item = {};
          Object.entries(headersMap).forEach(([index, key]) => {
            item[key] = row[index] || "";
          });

          return {
            requestNumber: item["request #"],
            date: parseExcelDate(item["date"]),
            mrName: item["mr name"],
            description: item["description"],
            productName: item["product name"],
          };
        })
        .filter((entry) => !!entry.requestNumber);

      setParsedData(mappedData);
    };

    reader.readAsArrayBuffer(file);
  };

  const parseExcelDate = (value) => {
    if (!value) return null;
    if (typeof value === "number") {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      return jsDate.toISOString();
    }
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/dailysample/import`,
        parsedData
      );

      // If import is successful
      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Daily Sample Report imported successfully!"
        );
        setShowImportModal(false);
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");

        showToast(
          "error",
          cleanMessage || "Failed to import daily sample reports."
        );
        fetchDailySampleReports();
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const editDailySample = (dailySampleData) => {
    setForm({ ...dailySampleData });
    setIsOpen(true);
    setIsEditModalOpen(true);
  };

  // Open view modal with selected customer data
  const handleView = (DailySample) => {
    setForm({ ...DailySample });
    setIsOpen(true);
    setIsViewModalOpen(true);
  };

  const onUpdate = async (formData) => {
    try {
      const res = await axios.put(
        `${backendUrl}/api/dailysample/${formData._id}`,
        formData
      );

      if (res.status === 200) {
        showToast("success", "Daily Sample Report updated successfully");
        setIsEditModalOpen(false);
        fetchDailySampleReports();
      }
    } catch (err) {
      console.error("Update failed:", err);
      showToast("error", "Failed to update the report.");
    }
  };

  const deleteDailySample = async (dailySampleData) => {
    if (!dailySampleData._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete <b>${dailySampleData.productName} - ${dailySampleData.mrName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/dailysample/${dailySampleData._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Daily sample reports <b>${dailySampleData.productName} - ${dailySampleData.mrName}</b> deleted successfully`
          );
          fetchDailySampleReports();
        }
      } catch (error) {
        showToast("error", "Failed to delete daily sample reports.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> daily sample reports`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/dailysample`, {
          data: { ids: selected },
        });

        if (res.status === 200) {
          showToast(
            "success",
            `Selected <b>${selected.length}</b> daily sample reports deleted successfully`
          );
          fetchDailySampleReports();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected daily sample reports.");
      }
    } else {
      setSelected([]);
    }
  };

  const toggleSelect = (sale) => {
    setSelected((prev) => {
      const exists = prev.some((c) => c.id === sale._id);

      if (exists) {
        return prev.filter((c) => c.id !== sale._id);
      } else {
        return [...prev, { id: sale._id }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentDailySamples.map((s) => ({ id: s._id }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 md:gap-6">
        {/* Left: Action Buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/reportlayout/dailysample/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Daily Sample 
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
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md"
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>

        {/* Right: Total Count & Search Input */}
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6 w-full md:w-auto justify-end">
          {/* Total Count */}
          <p className="text-sm font-medium text-gray-700 whitespace-nowrap">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold shadow-sm">
              {filteredDailySamples.length}
            </span>
          </p>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search by Product, Item Code or Brand"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
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
          <thead className="bg-gray-100 text-gray-700 text-sm border-b">
            <tr>
              <th className="p-3">
                <div className="flex items-center gap-4">
                  {currentDailySamples.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentDailySamples.length &&
                        currentDailySamples.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span>Product Name</span>
                </div>
              </th>
              <th className="p-3">Reference Number</th>
              <th className="p-3">MR Name</th>
              <th className="p-3">Description</th>
              <th className="p-3">Big Box(Q)</th>
              <th className="p-3">Small Box(Q)</th>
              <th className="p-3">Strip</th>
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentDailySamples.length > 0 ? (
              currentDailySamples.map((item, index) => {
                return (
                  <tr
                    key={item._id}
                    className={`hover:bg-gray-50 ${
                      (index + 1) % dailySamplePerPage === 0 ||
                      index + 1 === currentDailySamples.length
                        ? ""
                        : "border-b"
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === item._id)}
                          onChange={() => toggleSelect(item)}
                        />
                        <span className="capitalize">{item.productName}</span>
                      </div>
                    </td>
                    <td className="p-3">{item.requestNumber}</td>
                    <td className="p-3">{item.mrName}</td>
                    <td className="p-3">{item.description}</td>
                    <td className="p-3">{item.qtyBigBox}</td>
                    <td className="p-3">{item.qtySmallBox}</td>
                    <td className="p-3">{item.qtySmallBox}</td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button className="text-blue-600 hover:text-blue-800 cursor-pointer">
                        <Eye onClick={() => handleView(item)} size={18} />
                      </button>
                      <button className="text-green-600 hover:text-green-800 cursor-pointer">
                        <Edit onClick={() => editDailySample(item)} size={18} />
                      </button>
                      <button
                        onClick={() => deleteDailySample(item)}
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="8" className="text-center py-4 text-gray-500">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filteredDailySamples.length > 0 && (
        <div className="mt-4 p-5 flex justify-start gap-2">
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Prev
          </button>
          {visiblePages.map((page, idx) =>
            page === "..." ? (
              <span
                key={`ellipsis-${idx}`}
                className="px-3 py-1 text-gray-500 select-none cursor-pointer"
              >
                ...
              </span>
            ) : (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-1 rounded w-10 text-center transition cursor-pointer ${
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
            onClick={() => {
              setCurrentPage((prev) => Math.min(prev + 1, totalPages));
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
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
                Import Customer
              </h2>
              {isSampleFile && <SampleExcelDownloadDailySample />}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowImportModal(false)}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-gray-300 hover:bg-gray-400 text-gray-700"
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={isUploading}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading
                      ? "bg-blue-400 text-white cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isUploading ? "Uploading…" : "Upload"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                ✕
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Daily Sample Report
              </h2>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdate(form);
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium">
                    Request Number
                  </label>
                  <input
                    type="text"
                    name="requestNumber"
                    value={form.requestNumber}
                    onChange={(e) =>
                      setForm({ ...form, requestNumber: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Date</label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : null}
                    onChange={(date) =>
                      setForm({ ...form, date: date ? date.toISOString() : "" })
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">MR Name</label>
                  <input
                    type="text"
                    name="mrName"
                    value={form.mrName}
                    onChange={(e) =>
                      setForm({ ...form, mrName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Description
                  </label>
                  <input
                    type="text"
                    name="description"
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Product Name
                  </label>
                  <input
                    type="text"
                    name="productName"
                    value={form.productName}
                    onChange={(e) =>
                      setForm({ ...form, productName: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    required
                  />
                </div>

                {/* Quantity (Big Box) */}
                <div>
                  <label className="block text-sm font-medium">
                    Quantity (Big Box)
                  </label>
                  <input
                    type="number"
                    name="qtyBigBox"
                    value={form.qtyBigBox}
                    onChange={(e) =>
                      setForm({ ...form, qtyBigBox: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                {/* Quantity (Small Box) */}
                <div>
                  <label className="block text-sm font-medium">
                    Quantity (Small Box)
                  </label>
                  <input
                    type="number"
                    name="qtySmallBox"
                    value={form.qtySmallBox}
                    onChange={(e) =>
                      setForm({ ...form, qtySmallBox: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                {/* Total Qty */}
                <div>
                  <label className="block text-sm font-medium">
                    Total Quantity
                  </label>
                  <input
                    type="number"
                    name="totalQty"
                    value={form.totalQty}
                    onChange={(e) =>
                      setForm({ ...form, totalQty: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                {/* Qty per Box (Strip) */}
                <div>
                  <label className="block text-sm font-medium">
                    Qty per Box (Strip)
                  </label>
                  <input
                    type="number"
                    name="qtyPerBox"
                    value={form.qtyPerBox}
                    onChange={(e) =>
                      setForm({ ...form, qtyPerBox: Number(e.target.value) })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                    min={0}
                  />
                </div>

                {/* Remark */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">Remark</label>
                  <input
                    type="text"
                    name="remark"
                    value={form.remark}
                    onChange={(e) =>
                      setForm({ ...form, remark: e.target.value })
                    }
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>

                {/* Buttons */}
                <div className="md:col-span-2 flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
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
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            {/* Background Overlay */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsViewModalOpen(false)}
            />

            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Daily Sample Report
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Request Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Request Number
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.requestNumber}
                  </p>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? formatDateToReadable(form.date) : "—"}
                  </p>
                </div>

                {/* MR Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.mrName}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Description
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.description || "—"}
                  </p>
                </div>

                {/* Product Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Product Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.productName}
                  </p>
                </div>

                {/* Quantity (Big Box) */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Quantity (Big Box)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtyBigBox}
                  </p>
                </div>

                {/* Quantity (Small Box) */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Quantity (Small Box)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtySmallBox}
                  </p>
                </div>

                {/* Total Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Total Quantity
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.totalQty}
                  </p>
                </div>

                {/* Qty per Box */}
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Qty per Box (Strip)
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.qtyPerBox}
                  </p>
                </div>

                {/* Remark */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remark
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.remark?.trim() ? form.remark : "No Remark"}
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
    </div>
  );
};

export default DailySample;
