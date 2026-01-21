import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import {
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Upload,
  X,
  Search,
  DollarSign,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import SampleExcelDownloadPayroll from "../../excels/SampleExcelDownloadPayroll";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const payrollsPerPage = 7;

const MrBasicPayroll = () => {
  const navigate = useNavigate();

  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef(null);

  // Fetch MR Basic Payrolls
  const fetchMrBasicPayrolls = async () => {
    try {
      setLoading(true);
      setError(null);

      const url = `${backendUrl}/api/mr-basic-payrolls`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch MR basic payrolls");
      const data = await response.json();

      const payrollData = data.data || [];
      setPayrolls(payrollData);
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load MR basic payroll data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMrBasicPayrolls();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredPayrolls = useMemo(() => {
    if (!payrolls.length) return [];

    return payrolls.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.employeeId?.medicalRepName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.month?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.year?.toString().includes(searchTerm)
    );
  }, [payrolls, searchTerm]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredPayrolls.length / payrollsPerPage);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const currentPayrolls = filteredPayrolls.slice(
    (currentPage - 1) * payrollsPerPage,
    currentPage * payrollsPerPage
  );

  function getVisiblePages(currentPage, totalPages) {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, "...", totalPages];
    }

    if (currentPage >= totalPages - 2) {
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    }

    return [1, "...", currentPage, "...", totalPages];
  }

  // Select/unselect a payroll by id
  const toggleSelect = (payroll) => {
    setSelected((prev) => {
      const exists = prev.some((p) => p.id === payroll._id);

      if (exists) {
        return prev.filter((p) => p.id !== payroll._id);
      } else {
        return [...prev, { id: payroll._id, name: payroll.employeeName }];
      }
    });
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      const allSelected = currentPayrolls.map((s) => ({
        id: s._id,
        name: s.employeeName,
      }));
      setSelected(allSelected);
    } else {
      setSelected([]);
    }
  };

  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> MR basic payroll records`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/mr-basic-payrolls`, {
          data: { ids: selected.map((s) => s.id) },
        });

        if (res.status === 200) {
          showToast("success", "Selected MR basic payroll records deleted successfully");
          await fetchMrBasicPayrolls();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected MR basic payroll records.");
      }
    } else {
      setSelected([]);
    }
  };

  // Delete single payroll
  const deletePayroll = async (payroll) => {
    if (!payroll._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete MR basic payroll record for <b>${payroll.employeeName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/mr-basic-payrolls/${payroll._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `MR basic payroll record for <b>${payroll.employeeName}</b> deleted successfully`
          );
          await fetchMrBasicPayrolls();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete MR basic payroll record.");
      }
    }
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    const validTypes = [".csv", ".xlsx", ".xls"];
    const fileExtension = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(fileExtension)) {
      showToast("error", "Please upload a valid Excel or CSV file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("error", "File size must be less than 10MB");
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
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

        // Parse the data (you'll need to adjust this based on your Excel structure)
        const mappedData = rows.slice(1) // Skip header
          .filter(row => row.length > 0)
          .map(row => ({
            employeeId: row[0] || "",
            employeeName: row[1] || "",
            month: row[2] || "",
            year: row[3] || "",
            basicSalary: parseFloat(row[4]) || 0,
            remarks: row[5] || "",
          }));

        setParsedData(mappedData);
        showToast(
          "success",
          `Successfully parsed ${mappedData.length} MR basic payroll records`
        );
      } catch (error) {
        console.error("File parsing error:", error);
        showToast("error", "Error parsing file. Please check the format.");
      }
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  // Import parsed payrolls to backend
  const handleImport = async () => {
    if (parsedData.length === 0) {
      showToast("warning", "Please upload a valid file first");
      return;
    }
    setIsUploading(true);

    try {
      const res = await axios.post(
        `${backendUrl}/api/mr-basic-payrolls/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "MR basic payroll records imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        await fetchMrBasicPayrolls();
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");
        showToast("error", cleanMessage || "Failed to import MR basic payroll records.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  if (loading)
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );

  if (error)
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: {error}</p>
          <button
            onClick={fetchMrBasicPayrolls}
            className="mt-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );

  return (
    <div className="p-6">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => navigate("/hrmlayout/mr-basic-payroll/new")}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
          >
            <UserPlus size={18} /> Add New MR Basic Payroll
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={18} /> Delete Selected ({selected.length})
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <p className="text-sm font-medium text-blue-800">
              Total Count:{" "}
              <span className="font-bold">{filteredPayrolls.length}</span>
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
              size={16}
              onClick={handleIconClick}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search MR basic payrolls..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* MR Basic Payroll Table */}
      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-left">
                <div className="flex items-center gap-4">
                  {currentPayrolls.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentPayrolls.length &&
                        currentPayrolls.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  )}
                  <span className="text-sm font-medium">MR Name</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Month</th>
              <th className="p-3 text-sm font-medium">Year</th>
              <th className="p-3 text-sm font-medium">Basic Salary ($)</th>
              <th className="p-3 text-sm font-medium">Remarks</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPayrolls.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  No MR basic payroll records found.
                </td>
              </tr>
            ) : (
              currentPayrolls.map((payroll, idx) => (
                <tr
                  key={payroll._id}
                  className={`hover:bg-gray-50 ${
                    idx < currentPayrolls.length - 1 ? "border-b" : ""
                  }`}
                >
                  <td className="p-3 text-left">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selected.some((s) => s.id === payroll._id)}
                        onChange={() => toggleSelect(payroll)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-medium text-gray-900 capitalize">
                        {payroll.employeeName || payroll.employeeId?.medicalRepName}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-600 font-medium">
                    {payroll.month}
                  </td>
                  <td className="p-3 text-gray-600">{payroll.year}</td>
                  <td className="p-3 text-gray-600">
                    {formatCurrency(payroll.basicSalary)}
                  </td>
                  <td className="p-3 text-gray-600">
                    {payroll.remarks || "-"}
                  </td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button
                      onClick={() => navigate(`/hrmlayout/mr-basic-payroll/${payroll._id}/edit`)}
                      className="text-green-600 hover:text-green-800 cursor-pointer"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deletePayroll(payroll)}
                      className="text-red-600 hover:text-red-800 cursor-pointer"
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

        {/* Pagination */}
        {currentPayrolls.length > 0 && (
          <div className="mt-4 p-5 flex justify-start gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Prev
            </button>
            {visiblePages.map((p, index) => (
              <button
                key={index}
                onClick={() => typeof p === "number" && setCurrentPage(p)}
                disabled={p === "..."}
                className={`px-3 py-1 rounded ${
                  p === "..."
                    ? "bg-gray-200 cursor-not-allowed"
                    : currentPage === p
                    ? "bg-indigo-600 text-white cursor-pointer"
                    : "bg-gray-200 hover:bg-gray-300 cursor-pointer"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Import MR Basic Payroll
              </h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isUploading}
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {isSampleFile && <SampleExcelDownloadPayroll />}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload File
                </label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={isUploading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Supported formats: CSV, XLSX, XLS (Max 10MB)
                </p>
                {parsedData.length > 0 && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ {parsedData.length} records ready to import
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                }}
                disabled={isUploading}
                className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={isUploading || parsedData.length === 0}
                className="px-5 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? "Uploading..." : "Import Records"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MrBasicPayroll;