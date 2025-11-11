import React, { useState, useEffect, useMemo, useRef } from "react";
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
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { parseExcelDate } from "../../utils/excelUtility";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const payrollsPerPage = 7;

const Payroll = () => {
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
  const [nextPayrollCode, setNextPayrollCode] = useState(null);
  const inputRef = useRef(null);

  const [form, setForm] = useState({
    employeeName: "",
    department: "",
    designation: "",
    basicSalary: "",
    allowances: "",
    deductions: "",
    netSalary: "",
    remarks: "",
    _id: null,
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  useEffect(() => {
    fetchPayrolls();
  }, []);

  const fetchPayrolls = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/payrolls`);
      if (!response.ok) throw new Error("Failed to fetch payrolls");
      const data = await response.json();

      setPayrolls(data.data || []);
      if (data.nextPayrollCode) {
        setNextPayrollCode(data.nextPayrollCode);
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const filteredPayrolls = useMemo(() => {
    if (!payrolls.length) return [];
    
    return payrolls.filter(
      (r) =>
        r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.designation?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.paymentMethod?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.payrollCode?.toLowerCase().includes(searchTerm.toLowerCase())
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
      text: `Are you sure you want to delete <b>${selected.length}</b> payroll records`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      selected,
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/payrolls`, {
          data: { ids: selected.map(s => s.id) }, // Fix: Send only IDs
        });

        if (res.status === 200) {
          showToast("success", "Selected payroll records deleted successfully");
          await fetchPayrolls(); // Use the refetch function
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected payroll records.");
      }
    } else {
      setSelected([]);
    }
  };

  // Open edit modal with selected payroll data
  const editPayroll = (payroll) => {
    setForm({ ...payroll });
    setIsEditModalOpen(true);
  };

  // Open view modal with selected payroll data
  const handleView = (payroll) => {
    setForm({ ...payroll });
    setIsViewModalOpen(true);
  };

  const deletePayroll = async (payroll) => {
    if (!payroll._id) return;
    const confirmDelete = await confirmDialog({
      title: "Delete",
      text: `Are you sure you want to delete payroll record for <b>${payroll.employeeName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/payrolls/${payroll._id}`
        );

        if (res.status === 200) {
          showToast(
            "success",
            `Payroll record for <b>${payroll.employeeName}</b> deleted successfully`
          );
          await fetchPayrolls(); // Use the refetch function
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete payroll record.");
      }
    }
  };

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

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

        // ✅ Expected headers for payroll
        const requiredHeaders = [
          "payroll code",
          "date",
          "employee name",
          "department",
          "designation",
          "basic salary",
          "allowances",
          "deductions",
          "net salary",
          "payment method",
          "bank account",
          "payment date",
          "status",
          "remarks",
        ];

        let headerRowIndex = -1;
        let matchedHeaders = [];

        // ✅ Find header row (first 10 rows max)
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i].map((cell) =>
            cell?.toString().trim().toLowerCase()
          );
          const matched = requiredHeaders.filter((header) =>
            row.includes(header)
          );
          if (matched.length >= 5) {
            headerRowIndex = i;
            matchedHeaders = matched;
            break;
          }
        }

        // ❌ If required headers not found
        if (
          headerRowIndex === -1 ||
          matchedHeaders.length < requiredHeaders.length
        ) {
          const missingHeaders = requiredHeaders.filter(
            (header) => !matchedHeaders.includes(header)
          );
          const errorMsg = `❌ Required headers not found in Excel file:\n\n${missingHeaders.join(
            ", "
          )}`;
          showToast("error", errorMsg);
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

        // ✅ Parse data rows
        const dataRows = rows.slice(headerRowIndex + 1);
        if (dataRows.length === 0) {
          showToast("warning", "No data rows found in Excel file");
          return;
        }

        const mappedData = dataRows
          .map((row, rowIndex) => {
            const item = {};
            Object.entries(headersMap).forEach(([index, key]) => {
              item[key] = row[index] || "";
            });

            // Calculate net salary if not provided
            const basicSalary = parseFloat(item["basic salary"]) || 0;
            const allowances = parseFloat(item["allowances"]) || 0;
            const deductions = parseFloat(item["deductions"]) || 0;
            const netSalary = parseFloat(item["net salary"]) || (basicSalary + allowances - deductions);

            return {
              payrollCode: item["payroll code"]?.toString().trim(),
              date: parseExcelDate(item["date"]),
              employeeName: item["employee name"]?.toString().trim(),
              department: item["department"]?.toString().trim(),
              designation: item["designation"]?.toString().trim(),
              basicSalary: basicSalary,
              allowances: allowances,
              deductions: deductions,
              netSalary: netSalary,
              paymentMethod: item["payment method"]?.toString().trim(),
              bankAccount: item["bank account"]?.toString().trim(),
              paymentDate: parseExcelDate(item["payment date"]),
              status: (item["status"] || "pending")?.toString().trim(),
              remarks: item["remarks"]?.toString().trim(),
            };
          })
          .filter((entry, index) => {
            const keep = !!entry.payrollCode && !!entry.employeeName;
            if (!keep) {
              console.warn(`Skipping row ${index + headerRowIndex + 2}: Missing payrollCode or employeeName`);
            }
            return keep;
          });

        if (mappedData.length === 0) {
          showToast("warning", "No valid data found after parsing");
          return;
        }

        setParsedData(mappedData);
        showToast("success", `Successfully parsed ${mappedData.length} records`);
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
        `${backendUrl}/api/payrolls/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message || "Payroll records imported successfully!"
        );
        setShowImportModal(false);
        setParsedData([]);
        await fetchPayrolls();
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const { message } = err.response.data;
        const cleanMessage = message.replace(/<[^>]+>/g, "");
        showToast("error", cleanMessage || "Failed to import payroll records.");
      } else {
        showToast("error", "Network error. Please try again.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Update payroll on backend
  const handleUpdatePayroll = async (e) => {
    e.preventDefault();
    try {
      // Calculate net salary before sending
      const basicSalary = parseFloat(form.basicSalary) || 0;
      const allowances = parseFloat(form.allowances) || 0;
      const deductions = parseFloat(form.deductions) || 0;
      const netSalary = basicSalary + allowances - deductions;

      const updatedForm = {
        ...form,
        netSalary: netSalary
      };

      const res = await axios.put(
        `${backendUrl}/api/payrolls/${form._id}`,
        updatedForm
      );
      if (res.status === 200) {
        showToast(
          "success",
          `Payroll record for <b>${form.employeeName}</b> updated successfully`
        );
        setIsEditModalOpen(false);
        await fetchPayrolls();
      }
    } catch (err) {
      showToast("error", "Failed to update payroll record.");
    }
  };

  const handlerEnabledPayroll = async (id) => {
    try {
      const payroll = payrolls.find((p) => p._id === id);
      if (!payroll) return;
      const updatedPayroll = { ...payroll, enabled: !payroll.enabled };
      const response = await fetch(`${backendUrl}/api/payrolls/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: updatedPayroll.enabled }),
      });

      if (!response.ok) throw new Error("Failed to update payroll");

      const data = await response.json();
      setPayrolls((prev) =>
        prev.map((p) => (p._id === id ? { ...p, enabled: data.enabled } : p))
      );
    } catch (err) {
      console.error("Error updating payroll:", err);
      showToast("error", "Failed to update payroll status");
    }
  };

  const handleIconClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.classList.add("highlight");
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.classList.remove("highlight");
        }
      }, 1000);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  // Handle form input changes for edit modal
  const handleFormChange = (field, value) => {
    setForm(prev => {
      const updatedForm = { ...prev, [field]: value };
      
      // Auto-calculate net salary when financial fields change
      if (['basicSalary', 'allowances', 'deductions'].includes(field)) {
        const basicSalary = parseFloat(updatedForm.basicSalary) || 0;
        const allowances = parseFloat(updatedForm.allowances) || 0;
        const deductions = parseFloat(updatedForm.deductions) || 0;
        updatedForm.netSalary = basicSalary + allowances - deductions;
      }
      
      return updatedForm;
    });
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-3">
          <button
            onClick={() =>
              navigate("/hrmlayout/payroll/new", {
                state: { payrollCode: nextPayrollCode },
              })
            }
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <UserPlus size={18} /> Add New Payroll
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
          >
            <Upload size={18} /> Import CSV
          </button>
          {selected.length > 0 && (
            <button
              className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              onClick={handleDeleteSelected}
            >
              <Trash2 size={18} /> Delete
            </button>
          )}
        </div>
        <div className="flex justify-between items-center mb-4 gap-8">
          <p className="text-lg font-semibold text-gray-700">
            Total Count:{" "}
            <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
              {filteredPayrolls.length}
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
        <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
          <thead className="bg-gray-100 text-gray-700 border-b">
            <tr>
              <th className="p-3 text-sm font-medium">
                <div className="flex items-center gap-4">
                  {currentPayrolls.length > 0 && (
                    <input
                      type="checkbox"
                      checked={
                        selected.length === currentPayrolls.length &&
                        currentPayrolls.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  )}
                  <span>Employee</span>
                </div>
              </th>
              <th className="p-3 text-sm font-medium">Department</th>
              <th className="p-3 text-sm font-medium">Designation</th>
              <th className="p-3 text-sm font-medium">Basic Salary</th>
              <th className="p-3 text-sm font-medium">Allowances</th>
              <th className="p-3 text-sm font-medium">Deductions</th>
              <th className="p-3 text-sm font-medium">Net Salary</th>
              <th className="p-3 text-sm font-medium">Payment Date</th>
              <th className="p-3 text-sm font-medium">Status</th>
              <th className="p-3 text-sm font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {currentPayrolls.length > 0 ? (
              currentPayrolls.map((payroll, index) => (
                <tr
                  key={payroll._id}
                  className={`hover:bg-gray-50 ${
                    (index + 1) % payrollsPerPage === 0 ||
                    index + 1 === currentPayrolls.length
                      ? ""
                      : "border-b"
                  }`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={selected.some((s) => s.id === payroll._id)}
                        onChange={() => toggleSelect(payroll)}
                      />
                      <span className="capitalize">{payroll.employeeName}</span>
                    </div>
                  </td>
                  <td className="p-3 capitalize">{payroll.department}</td>
                  <td className="p-3 capitalize">{payroll.designation}</td>
                  <td className="p-3">{formatCurrency(payroll.basicSalary)}</td>
                  <td className="p-3">{formatCurrency(payroll.allowances)}</td>
                  <td className="p-3">{formatCurrency(payroll.deductions)}</td>
                  <td className="p-3 font-semibold">
                    {formatCurrency(payroll.netSalary)}
                  </td>
                  <td className="p-3">
                    {formatDateToReadable(payroll.paymentDate)}
                  </td>
                  <td>
                    <button
                      onClick={() => handlerEnabledPayroll(payroll._id)}
                      className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                        payroll.enabled
                          ? "bg-green-100 text-green-600"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {payroll.enabled ? "Enabled" : "Disabled"}
                    </button>
                  </td>
                  <td className="p-3 flex items-center justify-center gap-3">
                    <button 
                      onClick={() => handleView(payroll)}
                      className="text-blue-600 hover:text-blue-800 cursor-pointer"
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={() => editPayroll(payroll)}
                      className="text-green-600 hover:text-green-800 cursor-pointer"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deletePayroll(payroll)}
                      className="text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="p-3 text-center">
                  No payroll records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {currentPayrolls.length > 0 && (
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
      </div>

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setParsedData([]);
                }}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import Payroll
              </h2>
              {isSampleFile && <SampleExcelDownloadPayroll />}
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                  disabled={isUploading}
                />
                {parsedData.length > 0 && (
                  <p className="text-sm text-green-600 mt-2">
                    ✅ {parsedData.length} records ready to import
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setParsedData([]);
                  }}
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
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading || parsedData.length === 0
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

      {/* Edit Payroll Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit Payroll
              </h2>
              <form
                onSubmit={handleUpdatePayroll}
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Payroll Code
                  </label>
                  <input
                    type="text"
                    value={form.payrollCode || ""}
                    onChange={(e) => handleFormChange('payrollCode', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Employee Name
                  </label>
                  <input
                    type="text"
                    value={form.employeeName || ""}
                    onChange={(e) => handleFormChange('employeeName', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Department
                  </label>
                  <input
                    type="text"
                    value={form.department || ""}
                    onChange={(e) => handleFormChange('department', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Designation
                  </label>
                  <input
                    type="text"
                    value={form.designation || ""}
                    onChange={(e) => handleFormChange('designation', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg capitalize"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Basic Salary
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.basicSalary || ""}
                    onChange={(e) => handleFormChange('basicSalary', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Allowances
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.allowances || ""}
                    onChange={(e) => handleFormChange('allowances', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Deductions
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.deductions || ""}
                    onChange={(e) => handleFormChange('deductions', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Net Salary
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.netSalary || ""}
                    onChange={(e) => handleFormChange('netSalary', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg bg-gray-100"
                    disabled
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Payment Method
                  </label>
                  <select
                    value={form.paymentMethod || ""}
                    onChange={(e) => handleFormChange('paymentMethod', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="check">Check</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Bank Account
                  </label>
                  <input
                    type="text"
                    value={form.bankAccount || ""}
                    onChange={(e) => handleFormChange('bankAccount', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">
                    Payment Date
                  </label>
                  <DatePicker
                    selected={
                      form.paymentDate ? new Date(form.paymentDate) : null
                    }
                    onChange={(date) =>
                      handleFormChange('paymentDate', date ? date.toISOString() : null)
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select payment date"
                    className="w-full border px-3 py-2 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium">Status</label>
                  <select
                    value={form.status || "pending"}
                    onChange={(e) => handleFormChange('status', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium">Remarks</label>
                  <textarea
                    value={form.remarks || ""}
                    onChange={(e) => handleFormChange('remarks', e.target.value)}
                    className="w-full border px-3 py-2 rounded-lg"
                    rows="3"
                  />
                </div>
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

      {/* View Payroll Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
              <button
                onClick={() => setIsViewModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>
              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                View Payroll
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Payroll Code
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.payrollCode}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Employee Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.employeeName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Department
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.department}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Designation
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.designation}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Basic Salary
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatCurrency(form.basicSalary)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Allowances
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatCurrency(form.allowances)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Deductions
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatCurrency(form.deductions)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Net Salary
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 font-semibold">
                    {formatCurrency(form.netSalary)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Payment Method
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.paymentMethod}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Bank Account
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.bankAccount || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Payment Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {formatDateToReadable(form.paymentDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <p
                    className={`border px-3 py-2 rounded-lg bg-gray-100 capitalize ${
                      form.status === "paid"
                        ? "text-green-600"
                        : form.status === "pending"
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    {form.status}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-600">
                    Remarks
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 min-h-[80px]">
                    {form.remarks?.trim() ? form.remarks : "No Remarks"}
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

export default Payroll;