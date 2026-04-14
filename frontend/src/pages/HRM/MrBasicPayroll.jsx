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
  Save,
  Calendar,
  Menu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import SampleExcelDownloadMRBasicPayroll from "../../excels/SampleExcelDownloadMRBasicPayroll";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const payrollsPerPage = 11;

const MrBasicPayroll = () => {
  const navigate = useNavigate();
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPayroll, setEditingPayroll] = useState(null);
  const [editFormData, setEditFormData] = useState({
    employeeName: "",
    basicSalary: "",
    effectiveFrom: "",
    remarks: "",
  });
  const [selectedPayrollForDetail, setSelectedPayrollForDetail] =
    useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const inputRef = useRef(null);

  // Check if mobile view
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch MR Basic Payrolls
  const fetchMrBasicPayrolls = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = `${backendUrl}/api/hrm/mr-basic-payrolls`;
      const response = await axios.get(url);
      if (response.data.success) {
        const payrollData = response.data.data || [];
        setPayrolls(payrollData);
      } else {
        throw new Error(
          response.data.message || "Failed to fetch MR basic payrolls",
        );
      }
    } catch (err) {
      setError(err.message || "Something went wrong");
      showToast("error", "Failed to load MR basic payroll data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMrBasicPayrolls();
  }, [fetchMrBasicPayrolls]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Helper function to get employee name
  const getEmployeeName = useCallback((payroll) => {
    if (payroll.employeeName) return payroll.employeeName;
    if (payroll.employeeId && typeof payroll.employeeId === "object") {
      return (
        payroll.employeeId.medicalRepName ||
        payroll.employeeId.name ||
        payroll.employeeId.fullName ||
        `${payroll.employeeId.firstName || ""} ${payroll.employeeId.lastName || ""}`.trim()
      );
    }
    if (payroll.employeeId && typeof payroll.employeeId === "string") {
      return payroll.employeeId;
    }
    return "Unknown";
  }, []);

  // Helper function to get effective date
  const getEffectiveDate = useCallback((payroll) => {
    if (payroll.currentEffectiveFrom) return payroll.currentEffectiveFrom;
    if (payroll.salaryHistory && payroll.salaryHistory.length > 0) {
      const sortedHistory = [...payroll.salaryHistory].sort(
        (a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom),
      );
      return sortedHistory[0]?.effectiveFrom || "";
    }
    return "";
  }, []);

  const filteredPayrolls = useMemo(() => {
    if (!payrolls.length) return [];

    return payrolls.filter((payroll) => {
      const employeeName = getEmployeeName(payroll).toLowerCase();
      const searchLower = searchTerm.toLowerCase();

      return employeeName.includes(searchLower);
    });
  }, [payrolls, searchTerm, getEmployeeName]);

  // Pagination calculations
  const totalPages = Math.max(
    1,
    Math.ceil(filteredPayrolls.length / payrollsPerPage),
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

  const visiblePages = getVisiblePages(currentPage, totalPages);

  const currentPayrolls = useMemo(() => {
    const startIndex = (currentPage - 1) * payrollsPerPage;
    const endIndex = startIndex + payrollsPerPage;
    return filteredPayrolls.slice(startIndex, endIndex);
  }, [filteredPayrolls, currentPage]);

  // Select/unselect a payroll by id
  const toggleSelect = useCallback(
    (payroll) => {
      setSelected((prev) => {
        const exists = prev.some((p) => p.id === payroll._id);
        if (exists) {
          return prev.filter((p) => p.id !== payroll._id);
        } else {
          return [
            ...prev,
            {
              id: payroll._id,
              name: getEmployeeName(payroll),
            },
          ];
        }
      });
    },
    [getEmployeeName],
  );

  const toggleSelectAll = useCallback(
    (checked) => {
      if (checked) {
        const allSelected = currentPayrolls.map((payroll) => ({
          id: payroll._id,
          name: getEmployeeName(payroll),
        }));
        setSelected(allSelected);
      } else {
        setSelected([]);
      }
    },
    [currentPayrolls, getEmployeeName],
  );

  const handleDeleteSelected = async () => {
    if (selected.length === 0) return;

    const confirm = await confirmDialog({
      title: "Confirm Delete",
      text: `Are you sure you want to delete ${selected.length} MR basic payroll record(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/hrm/mr-basic-payrolls`,
          {
            data: { ids: selected.map((s) => s.id) },
          },
        );

        if (res.data.success) {
          showToast(
            "success",
            "Selected MR basic payroll records deleted successfully",
          );
          await fetchMrBasicPayrolls();
          setSelected([]);
        } else {
          throw new Error(res.data.message);
        }
      } catch (error) {
        showToast(
          "error",
          error.message || "Failed to delete selected MR basic payroll records",
        );
      }
    }
  };

  // Delete single payroll
  const deletePayroll = async (payroll) => {
    if (!payroll._id) return;

    const employeeName = getEmployeeName(payroll);
    const confirmDelete = await confirmDialog({
      title: "Confirm Delete",
      text: `Are you sure you want to delete MR basic payroll record for ${employeeName}?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (confirmDelete.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/hrm/mr-basic-payrolls/${payroll._id}`,
        );

        if (res.data.success) {
          showToast(
            "success",
            `MR basic payroll record for ${employeeName} deleted successfully`,
          );
          await fetchMrBasicPayrolls();
          setSelected((prev) => prev.filter((p) => p.id !== payroll._id));
        } else {
          throw new Error(res.data.message);
        }
      } catch (error) {
        showToast(
          "error",
          error.message || "Failed to delete MR basic payroll record",
        );
      }
    }
  };

  // Handle numeric input for basic salary
  const handleNumericInputChange = useCallback((e, fieldName) => {
    const { value } = e.target;
    if (value === "" || /^\d*\.?\d{0,2}$/.test(value)) {
      setEditFormData((prev) => ({
        ...prev,
        [fieldName]: value,
      }));
    }
  }, []);

  // Handle date change
  const handleDateChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }, []);

  // Handle edit button click
  const handleEditClick = (payroll) => {
    setEditingPayroll(payroll);
    setEditFormData({
      employeeName: getEmployeeName(payroll),
      basicSalary: payroll.currentBasicSalary
        ? payroll.currentBasicSalary.toString()
        : "",
      effectiveFrom:
        getEffectiveDate(payroll) || new Date().toISOString().split("T")[0],
      remarks: payroll.remarks || "",
    });
    setShowEditModal(true);
  };

  // Handle view details
  const handleViewDetails = (payroll) => {
    setSelectedPayrollForDetail(payroll);
    setShowDetailModal(true);
  };

  // Handle edit form input change
  const handleEditInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "basicSalary") {
      handleNumericInputChange(e, name);
    } else if (name === "effectiveFrom") {
      handleDateChange(e);
    } else {
      setEditFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  // Save edited payroll
  const handleSaveEdit = async () => {
    if (!editingPayroll) return;

    if (!editFormData.basicSalary || editFormData.basicSalary.trim() === "") {
      showToast("error", "Basic Salary is required");
      return;
    }

    const basicSalary = parseFloat(editFormData.basicSalary);
    if (isNaN(basicSalary) || basicSalary <= 0) {
      showToast("error", "Basic Salary must be a positive number");
      return;
    }

    if (
      !editFormData.effectiveFrom ||
      editFormData.effectiveFrom.trim() === ""
    ) {
      showToast("error", "Effective From date is required");
      return;
    }

    const selectedDate = new Date(editFormData.effectiveFrom);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      showToast("error", "Effective date cannot be in the past");
      return;
    }

    try {
      const updateData = {
        basicSalary: basicSalary,
        effectiveFrom: editFormData.effectiveFrom,
        remarks: editFormData.remarks || "",
      };

      const res = await axios.put(
        `${backendUrl}/api/hrm/mr-basic-payrolls/${editingPayroll._id}`,
        updateData,
      );

      if (res.data.success) {
        showToast("success", "MR basic payroll updated successfully");
        setShowEditModal(false);
        await fetchMrBasicPayrolls();
      } else {
        throw new Error(res.data.message);
      }
    } catch (error) {
      console.error("Update error:", error);
      showToast(
        "error",
        error.response?.data?.message ||
          error.message ||
          "Failed to update MR basic payroll",
      );
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

  // File upload and parsing logic for import
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    const fileExtension = file.name
      .toLowerCase()
      .slice(file.name.lastIndexOf("."));

    if (
      !validTypes.includes(file.type) &&
      ![".csv", ".xlsx", ".xls"].includes(fileExtension)
    ) {
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
          header: ["employeeName", "basicSalary", "effectiveFrom", "remarks"],
          defval: "",
          raw: false,
        });

        const dataRows = rows.slice(1);

        const mappedData = dataRows
          .filter((row) => row && row.employeeName)
          .map((row) => {
            let basicSalary = 0;
            if (row.basicSalary) {
              const salaryStr = String(row.basicSalary).replace(/,/g, "");
              basicSalary = parseFloat(salaryStr) || 0;
            }

            let effectiveFrom = "";
            if (row.effectiveFrom) {
              const date = new Date(row.effectiveFrom);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, "0");
                const day = String(date.getDate()).padStart(2, "0");
                effectiveFrom = `${year}-${month}-${day}`;
              }
            }

            return {
              employeeName: row.employeeName?.toString()?.trim() || "",
              basicSalary: basicSalary,
              effectiveFrom:
                effectiveFrom || new Date().toISOString().split("T")[0],
              remarks: row.remarks?.toString()?.trim() || "",
            };
          });

        if (mappedData.length === 0) {
          showToast("warning", "No valid data found in the file");
          return;
        }

        setParsedData(mappedData);
        showToast(
          "success",
          `Successfully parsed ${mappedData.length} MR basic payroll records`,
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
        `${backendUrl}/api/hrm/mr-basic-payrolls/import`,
        { payrolls: parsedData },
      );

      if (res.data.success) {
        showToast(
          "success",
          res.data.message || "MR basic payroll records imported successfully!",
        );
        setShowImportModal(false);
        setParsedData([]);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        await fetchMrBasicPayrolls();
      } else {
        throw new Error(res.data.message);
      }
    } catch (err) {
      console.error("Import error:", err);
      if (err.response) {
        const message =
          err.response.data?.message ||
          "Failed to import MR basic payroll records";
        showToast("error", message.replace(/<[^>]+>/g, ""));
      } else if (err.request) {
        showToast("error", "Network error. Please check your connection.");
      } else {
        showToast("error", "An unexpected error occurred.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Reset import modal
  const resetImportModal = () => {
    setShowImportModal(false);
    setParsedData([]);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  // Reset edit modal
  const resetEditModal = () => {
    setShowEditModal(false);
    setEditingPayroll(null);
    setEditFormData({
      employeeName: "",
      basicSalary: "",
      effectiveFrom: "",
      remarks: "",
    });
  };

  // Format currency
  const formatCurrency = (amount) => {
    let numAmount;
    if (typeof amount === "string") {
      const cleanStr = amount.replace(/[^0-9.]/g, "");
      numAmount = parseFloat(cleanStr);
    } else {
      numAmount = Number(amount);
    }

    if (isNaN(numAmount)) return "$0.00";

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numAmount);
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "-";

      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "-";
    }
  };

  // Helper to parse basic salary for display in table
  const parseBasicSalary = (salary) => {
    if (typeof salary === "string") {
      const cleanStr = salary.replace(/,/g, "");
      return parseFloat(cleanStr) || 0;
    }
    return salary || 0;
  };

  // Get max date for effective date in edit modal
  const getMaxDate = () => {
    const today = new Date();
    const nextYear = new Date(
      today.getFullYear() + 1,
      today.getMonth(),
      today.getDate(),
    );
    const year = nextYear.getFullYear();
    const month = String(nextYear.getMonth() + 1).padStart(2, "0");
    const day = String(nextYear.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Mobile Card View Component
  const MobilePayrollCard = ({ payroll, index }) => {
    const employeeName = getEmployeeName(payroll);
    const effectiveDate = getEffectiveDate(payroll);

    return (
      <div className="bg-white rounded-lg shadow-md mb-3 p-4 border border-gray-200">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 text-base capitalize">
              {employeeName}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              <Calendar size={12} className="inline mr-1" />
              Effective: {formatDate(effectiveDate)}
            </p>
          </div>
          {/* View button only on mobile (no edit/delete) */}
          <button
            onClick={() => handleViewDetails(payroll)}
            className="text-blue-600 hover:text-blue-800 p-1"
            title="View Details"
          >
            <Eye size={18} />
          </button>
        </div>

        <div className="border-t pt-3 mt-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Basic Salary:</span>
            <span className="font-semibold text-indigo-600">
              {formatCurrency(parseBasicSalary(payroll.currentBasicSalary))}
            </span>
          </div>
          {payroll.remarks && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-gray-600">Remarks:</span>
              <span className="text-sm text-gray-700">{payroll.remarks}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render pagination (like DailyReports)
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div
        className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center items-center" : "justify-start"}`}
      >
        <button
          onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          ← Prev
        </button>
        {!isMobileView ? (
          visiblePages.map((page, idx) => (
            <button
              key={idx}
              onClick={() => typeof page === "number" && setCurrentPage(page)}
              disabled={page === "..."}
              className={`px-4 py-2 rounded text-sm ${
                page === "..."
                  ? "bg-gray-200 cursor-not-allowed"
                  : currentPage === page
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300"
              }`}
            >
              {page}
            </button>
          ))
        ) : (
          <span className="px-3 py-1 text-sm text-gray-700 font-medium">
            Page {currentPage} of {totalPages}
          </span>
        )}
        <button
          onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
          disabled={currentPage === totalPages}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
        >
          Next →
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
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
  }

  return (
    <div className={`${isMobileView ? "p-3 pb-20" : "p-6"} relative`}>
      {/* ── Sidebar (mobile only) ── */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      {/* ── MOBILE Header ── */}
      {isMobileView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <DollarSign className="w-5 h-5 text-green-600" />
            <h1 className="text-base font-bold text-gray-800">
              MR Basic Payroll
            </h1>
          </div>
          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
            Total: {filteredPayrolls.length}
          </div>
        </div>
      )}

      {/* ── DESKTOP Header ── */}
      {!isMobileView && (
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/hrmlayout/mrbasicpayroll/new")}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
            >
              <UserPlus size={18} /> Add New MR Basic Payroll
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md transition-colors"
            >
              <Upload size={18} /> Import Excel
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
      )}

      {/* MOBILE Search Bar */}
      {isMobileView && (
        <div className="relative mb-4">
          <Search
            className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
            size={14}
          />
          <input
            type="text"
            placeholder="Search MR basic payrolls..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="pl-9 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 text-sm"
          />
        </div>
      )}

      {/* Desktop Table View - Hidden on Mobile */}
      <div className="hidden md:block overflow-x-auto shadow rounded-2xl border border-gray-200">
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
              <th className="p-3 text-sm font-medium">Basic Salary</th>
              <th className="p-3 text-sm font-medium">Effective From</th>
              <th className="p-3 text-sm font-medium">Remarks</th>
              <th className="p-3 text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentPayrolls.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-500">
                  No MR basic payroll records found.
                </td>
              </tr>
            ) : (
              currentPayrolls.map((payroll, idx) => {
                const employeeName = getEmployeeName(payroll);
                const effectiveDate = getEffectiveDate(payroll);

                return (
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
                          {employeeName}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {formatCurrency(
                        parseBasicSalary(payroll.currentBasicSalary),
                      )}
                    </td>
                    <td className="p-3 text-gray-600">
                      <div className="flex items-center justify-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        {formatDate(effectiveDate)}
                      </div>
                    </td>
                    <td className="p-3 text-gray-600">
                      {payroll.remarks || "-"}
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        onClick={() => handleEditClick(payroll)}
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
                );
              })
            )}
          </tbody>
        </table>

        {/* Desktop Pagination */}
        {renderPagination()}
      </div>

      {/* Mobile Card View - Visible only on Mobile */}
      <div className="md:hidden">
        {currentPayrolls.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            No MR basic payroll records found.
          </div>
        ) : (
          <>
            {currentPayrolls.map((payroll, idx) => (
              <MobilePayrollCard
                key={payroll._id}
                payroll={payroll}
                index={idx}
              />
            ))}
            {/* Mobile Pagination */}
            {renderPagination()}
          </>
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
                onClick={resetImportModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={isUploading}
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {isSampleFile && <SampleExcelDownloadMRBasicPayroll />}

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload File *
                </label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  disabled={isUploading}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={resetImportModal}
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

      {/* Edit Modal */}
      {showEditModal && editingPayroll && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Edit MR Basic Payroll
              </h2>
              <button
                onClick={resetEditModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MR Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.employeeName}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Basic Salary ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="basicSalary"
                    value={editFormData.basicSalary}
                    onChange={handleEditInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter numeric value only. Current:{" "}
                    {formatCurrency(editFormData.basicSalary)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Effective From <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="effectiveFrom"
                    value={editFormData.effectiveFrom}
                    onChange={handleEditInputChange}
                    min={new Date().toISOString().split("T")[0]}
                    max={getMaxDate()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Date when this salary becomes effective
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks
                  </label>
                  <textarea
                    name="remarks"
                    value={editFormData.remarks}
                    onChange={handleEditInputChange}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-200 focus:border-blue-500"
                    placeholder="Enter remarks"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={resetEditModal}
                className="px-5 py-2 text-gray-700 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
              >
                <Save size={18} /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal for Mobile */}
      {showDetailModal && selectedPayrollForDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-[100] p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-lg relative">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-800">
                Payroll Details
              </h2>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    MR Name
                  </label>
                  <p className="text-gray-900 capitalize">
                    {getEmployeeName(selectedPayrollForDetail)}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Basic Salary
                  </label>
                  <p className="text-indigo-600 font-semibold">
                    {formatCurrency(
                      parseBasicSalary(
                        selectedPayrollForDetail.currentBasicSalary,
                      ),
                    )}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Effective From
                  </label>
                  <p className="text-gray-900">
                    {formatDate(getEffectiveDate(selectedPayrollForDetail))}
                  </p>
                </div>

                {selectedPayrollForDetail.remarks && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Remarks
                    </label>
                    <p className="text-gray-900">
                      {selectedPayrollForDetail.remarks}
                    </p>
                  </div>
                )}

                {selectedPayrollForDetail.salaryHistory &&
                  selectedPayrollForDetail.salaryHistory.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Salary History
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {selectedPayrollForDetail.salaryHistory.map(
                          (history, idx) => (
                            <div
                              key={idx}
                              className="bg-gray-50 p-2 rounded text-sm"
                            >
                              <div className="flex justify-between">
                                <span className="font-medium">Salary:</span>
                                <span>
                                  {formatCurrency(history.basicSalary)}
                                </span>
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="font-medium">Effective:</span>
                                <span>{formatDate(history.effectiveFrom)}</span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            </div>
            {!isMobileView && (
              <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleEditClick(selectedPayrollForDetail);
                  }}
                  className="px-5 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Edit size={18} /> Edit
                </button>
                <button
                  onClick={() => {
                    setShowDetailModal(false);
                    deletePayroll(selectedPayrollForDetail);
                  }}
                  className="px-5 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Trash2 size={18} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MrBasicPayroll;
