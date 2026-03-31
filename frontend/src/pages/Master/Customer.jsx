import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  UserPlus,
  Upload,
  Trash2,
  Eye,
  X,
  Edit,
  Search,
  Download,
  Menu,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import SampleExcelDownloadCustomer from "../../excels/SampleExcelDownloadCustomer";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";
import {
  fetchProvinces as fetchProvincesAPI,
  fetchMRList as fetchMRListAPI,
  fetchZones as fetchZonesAPI,
  fetchBusinessTypes as fetchBusinessTypesAPI,
} from "../../utils/customerUtil";
import Sidebar from "../../components/Sidebar";
// ==================== CRITICAL FIX - XLSX IMPORT ====================
import * as XLSX from "xlsx";
const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";
const isWithCustomerCode =
  import.meta.env.VITE_IS_WITH_CUSTOMER_CODE === "true";
const customersPerPage = 10;
// Axios Interceptors
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);
function capitalizeFirstLetter(str) {
  if (!str) return "";
  str = str.toString();
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
const formatDateToYYYYMMDD = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const formatDateForDisplay = (dateString) => {
  if (!dateString) return "--";
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const match = String(dateString).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match.map(Number);
    if (month >= 1 && month <= 12) return `${day} ${MONTHS[month - 1]} ${year}`;
  }
  return "--";
};
// ===================== CUSTOM HOOK =====================
const useCustomerForm = (initialCustomerCode = "") => {
  const [form, setForm] = useState({
    customerCode: initialCustomerCode || "",
    date: "",
    medicalRepName: "",
    medicalRepId: "",
    name: "",
    typeOfBusiness: "",
    customerNumber: "",
    address: "",
    zone: "",
    province: "",
    remark: "",
    _id: null,
  });
  const [errors, setErrors] = useState({});
  const handleChange = useCallback(
    (name, value) => {
      if (name === "name") value = capitalizeFirstLetter(value);
      setForm((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    },
    [errors],
  );
  const handleNumericInput = useCallback(
    (e, field) => {
      const value = e.target.value;
      if (value === "" || /^\d+$/.test(value)) handleChange(field, value);
    },
    [handleChange],
  );
  const validateForm = useCallback(() => {
    const newErrors = {};
    if (!form.name?.trim()) newErrors.name = "Customer name is required";
    if (!form.typeOfBusiness)
      newErrors.typeOfBusiness = "Business type is required";
    if (!form.medicalRepId)
      newErrors.medicalRepId = "Medical representative is required";
    if (!form.zone) newErrors.zone = "Zone is required";
    if (!form.province) newErrors.province = "Province is required";
    if (!form.date) newErrors.date = "Date is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);
  const resetForm = useCallback(() => {
    setForm({
      customerCode: initialCustomerCode || "",
      date: "",
      medicalRepName: "",
      medicalRepId: "",
      name: "",
      typeOfBusiness: "",
      customerNumber: "",
      address: "",
      zone: "",
      province: "",
      remark: "",
      _id: null,
    });
    setErrors({});
  }, [initialCustomerCode]);
  return {
    form,
    errors,
    handleChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
  };
};
// ===================== IMPORT MODAL =====================
const ImportModal = ({ isOpen, onClose, isSampleFile, mrList }) => {
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [parseErrors, setParseErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [existingCustomers, setExistingCustomers] = useState([]);
  const [duplicateRows, setDuplicateRows] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const getRowKey = (row) => {
    return [
      (row.name || "").trim().toLowerCase(),
      (row.typeOfBusiness || "").trim().toLowerCase(),
      (row.customerNumber || "").trim().toLowerCase(),
      (row.medicalRepName || "").trim().toLowerCase(),
    ].join("||");
  };
  useEffect(() => {
    if (isOpen) fetchExistingCustomers();
  }, [isOpen]);
  const fetchExistingCustomers = async () => {
    setLoadingExisting(true);
    try {
      const res = await axios.get(`${backendUrl}/api/customers`);
      console.log('values of res', res);
      setExistingCustomers(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Failed to fetch existing customers", error);
      showToast(
        "error",
        "Could not load existing customers for duplicate check",
      );
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
    const keyCount = new Map();
    parsedData.forEach((row) => {
      const key = getRowKey(row);
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });
    parsedData.forEach((row, idx) => {
      if (keyCount.get(getRowKey(row)) > 1) duplicateIndices.add(idx);
    });
    if (existingCustomers.length > 0) {
      const existingKeys = new Set(
        existingCustomers.map((c) =>
          getRowKey({
            name: c.name || "",
            typeOfBusiness: c.typeOfBusiness || "",
            customerNumber: c.customerNumber || "",
            medicalRepName: c.medicalRepName || "",
          }),
        ),
      );
      parsedData.forEach((row, idx) => {
        if (existingKeys.has(getRowKey(row))) duplicateIndices.add(idx);
      });
    }
    setDuplicateRows(parsedData.filter((_, idx) => duplicateIndices.has(idx)));
  }, [parsedData, existingCustomers]);
  const parseExcelDateValue = (dateValue) => {
    if (!dateValue && dateValue !== 0) return formatDateToYYYYMMDD(new Date());
    if (dateValue instanceof Date) return formatDateToYYYYMMDD(dateValue);
    if (typeof dateValue === "number") {
      const adjusted = dateValue >= 60 ? dateValue - 1 : dateValue;
      const date = new Date((adjusted - 25569) * 86400 * 1000);
      return formatDateToYYYYMMDD(date);
    }
    if (typeof dateValue === "string") {
      const trimmed = dateValue.trim();
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) return formatDateToYYYYMMDD(parsed);
    }
    return formatDateToYYYYMMDD(new Date());
  };
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
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }
        // Helper to safely convert any value to a trimmed string
        const safeString = (value) => {
          if (value === undefined || value === null) return "";
          return String(value).trim();
        };
        let headerIdx = -1;
        const requiredHeaders = [
          "date",
          "medical representative name",
          "customer name in english",
          "types of business",
          "customer number",
          "customer address",
          "zone",
          "province",
        ];
        for (let i = 0; i < Math.min(rows.length, 15); i++) {
          const lowerRow = (rows[i] || []).map((c) =>
            safeString(c).toLowerCase(),
          );
          if (requiredHeaders.every((h) => lowerRow.includes(h))) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          showToast("error", "Could not find required headers in Excel file");
          return;
        }
        const headers = rows[headerIdx].map((h) => safeString(h));
        const dataRows = rows.slice(headerIdx + 1);
        const validRows = [];
        const rowErrors = [];
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const obj = {};
          headers.forEach((h, idx) => {
            obj[h] = row[idx] !== undefined ? row[idx] : "";
          });
          const dateVal = safeString(
            obj["Date"] || obj["date"] || obj["Joining Date"] || "",
          );
          const medicalRepName = safeString(
            obj["Medical Representative Name"] ||
              obj["medical representative name"] ||
              "",
          );
          const name = safeString(
            obj["Customer Name in English"] ||
              obj["customer name in english"] ||
              "",
          );
          const typeOfBusiness = safeString(
            obj["Types of Business"] || obj["types of business"] || "",
          );
          const customerNumber = safeString(
            obj["Customer Number"] || obj["customer number"] || "",
          );
          const address = safeString(
            obj["Customer Address"] || obj["customer address"] || "",
          );
          const zone = safeString(obj["Zone"] || obj["zone"] || "");
          const province = safeString(obj["Province"] || obj["province"] || "");
          const remark = safeString(obj["Remark"] || obj["remark"] || "");
          if (!name && !customerNumber) {
            rowErrors.push(
              `Row ${headerIdx + i + 2}: Missing name or customer number — skipped`,
            );
            continue;
          }
          validRows.push({
            date: parseExcelDateValue(dateVal),
            medicalRepName,
            name,
            typeOfBusiness,
            customerNumber,
            address,
            zone,
            province,
            remark,
          });
        }
        setParsedData(validRows);
        setParseErrors(rowErrors);
        if (rowErrors.length) {
          showToast(
            "warning",
            `${validRows.length} valid rows, ${rowErrors.length} skipped`,
          );
        } else if (validRows.length > 0) {
          showToast(
            "success",
            `${validRows.length} records loaded successfully`,
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
    const uniqueData = parsedData.filter(
      (row) => !duplicateRows.some((d) => getRowKey(d) === getRowKey(row)),
    );
    if (uniqueData.length === 0) {
      showToast("warning", "No unique records to import");
      return;
    }
    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        uniqueData,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 60000,
        },
      );
      showToast(
        "success",
        res.data.message ||
          `Imported ${uniqueData.length} records successfully`,
      );
      onClose(true);
    } catch (err) {
      console.error("Import error:", err);
      showToast("error", err.response?.data?.message || "Import failed");
    } finally {
      setIsUploading(false);
    }
  };
  if (!isOpen) return null;
  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white w-full max-w-lg p-6 rounded-xl shadow-lg relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={() => onClose(false)}
          disabled={isUploading}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
        >
          <X size={20} />
        </button>
        <h2 className="text-lg font-semibold mb-1">Import Customers</h2>
        {isSampleFile && <SampleExcelDownloadCustomer />}
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
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
            Loading existing customers for duplicate check...
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
            <p className="text-xs text-red-600">
              Duplicate rows will be skipped during import.
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
          </div>
        )}
        <div className="flex justify-end mt-4 gap-3">
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
            className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50 flex items-center gap-2"
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
    </div>,
    document.body,
  );
};
// ===================== MAIN COMPONENT =====================
const Customer = () => {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [showImportModal, setShowImportModal] = useState(false);
  const [nextCustomerCode, setNextCustomerCode] = useState(null);
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [isDropdownsLoading, setIsDropdownsLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isDuplicateNumber, setIsDuplicateNumber] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const inputRef = useRef(null);
  const {
    form,
    errors,
    handleChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
  } = useCustomerForm();
  const displayValue = (value) => (value ? capitalizeFirstLetter(value) : "--");
  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  useEffect(() => {
    if (searchTerm) setCurrentPage(1);
  }, [searchTerm]);
  useEffect(() => {
    fetchCustomers();
  }, [currentPage, searchTerm]);
  useEffect(() => {
    fetchDropdownData();
  }, []);
  const fetchDropdownData = async () => {
    try {
      setIsDropdownsLoading(true);
      const [pRes, mrRes, zRes, btRes] = await Promise.all([
        fetchProvincesAPI(),
        fetchMRListAPI(),
        fetchZonesAPI(),
        fetchBusinessTypesAPI(),
      ]);
      if (pRes.success) setProvinces(pRes.data || []);
      if (mrRes.success) setMrList(mrRes.data || []);
      if (zRes.success) setZones(zRes.data || []);
      if (btRes.success) setBusinessTypes(btRes.data || []);
    } catch (err) {
      showToast("error", "Failed to load dropdown data");
    } finally {
      setIsDropdownsLoading(false);
    }
  };
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/customers`, {
        params: {
          page: currentPage,
          limit: customersPerPage,
          search: searchTerm,
        },
      });
      if (response.data.ok) {
        setCustomers(response.data.customers || []);
        setTotalCustomers(response.data.total || 0);
        setTotalPages(response.data.totalPages || 1);
        setNextCustomerCode(response.data.nextCustomerCode || null);
      }
    } catch (err) {
      showToast("error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };
  const toggleSelect = useCallback((customer) => {
    setSelected((prev) =>
      prev.some((c) => c.id === customer._id)
        ? prev.filter((c) => c.id !== customer._id)
        : [...prev, { id: customer._id, name: customer.name }],
    );
  }, []);
  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked ? customers.map((c) => ({ id: c._id, name: c.name })) : [],
      );
    },
    [customers],
  );
  const handleDeleteSelected = async () => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${selected.length}</b> customer(s)?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(`${backendUrl}/api/customers`, {
          data: { ids: selected.map((s) => s.id) },
        });
        if (res.status === 200) {
          showToast("success", "Selected customers deleted successfully");
          fetchCustomers();
          setSelected([]);
        }
      } catch (error) {
        showToast("error", "Failed to delete selected customers.");
      }
    }
  };
  const deleteCustomer = async (customer) => {
    const confirm = await confirmDialog({
      text: `Are you sure you want to delete <b>${customer.name}</b> (Code: ${customer.customerCode})?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`,
        );
        if (res.status === 200) {
          showToast("success", `${customer.name} deleted successfully`);
          fetchCustomers();
        }
      } catch (error) {
        showToast("error", "Failed to delete customer.");
      }
    }
  };
  const handleView = useCallback(
    (customer) => {
      setForm(customer);
      setIsViewModalOpen(true);
    },
    [setForm],
  );
  const handleEdit = useCallback(
    (customer) => {
      let actualMrId = customer.medicalRepId || "";
      if (!actualMrId && customer.medicalRepName && mrList.length) {
        const found = mrList.find(
          (mr) =>
            (mr.medicalRepName || "").toLowerCase() ===
            customer.medicalRepName.toLowerCase(),
        );
        actualMrId = found?._id || "";
      }
      setForm({
        customerCode: customer.customerCode || "",
        date: customer.date || "",
        medicalRepName: customer.medicalRepName || "",
        medicalRepId: actualMrId,
        name: capitalizeFirstLetter(customer.name || ""),
        typeOfBusiness: customer.typeOfBusiness || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        province: customer.province || "",
        remark: customer.remark || "",
        _id: customer._id || null,
      });
      setIsDuplicateNumber(false);
      setIsEditModalOpen(true);
    },
    [mrList, setForm],
  );
  const handleCustomerUpdate = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast("error", "Please fill all required fields");
      return;
    }
    if (isDuplicateNumber) {
      showToast(
        "error",
        "Customer number already exists. Please use a unique number.",
      );
      return;
    }
    try {
      const payload = {
        date: form.date,
        medicalRepName: form.medicalRepName.toLowerCase(),
        medicalRepId: form.medicalRepId,
        name: form.name,
        typeOfBusiness: form.typeOfBusiness.toLowerCase(),
        customerNumber: form.customerNumber,
        address: form.address.toLowerCase(),
        zone: form.zone.toLowerCase(),
        province: form.province.toLowerCase(),
        remark: form.remark.toLowerCase(),
      };
      const res = await axios.put(
        `${backendUrl}/api/customers/${form._id}`,
        payload,
      );
      if (res.status === 200) {
        showToast("success", `${form.name} updated successfully`);
        setIsEditModalOpen(false);
        resetForm();
        fetchCustomers();
      }
    } catch (err) {
      showToast(
        "error",
        err.response?.data?.message || "Failed to update customer.",
      );
    }
  };
  const handleImportClose = (shouldRefresh) => {
    setShowImportModal(false);
    if (shouldRefresh) fetchCustomers();
  };
  const handleIconClick = () => inputRef.current?.focus();
  const handleDownloadAll = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/customers/export`, {
        params: { withCode: isWithCustomerCode },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "customer_list.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", "Failed to download customer list");
    }
  };
  const provinceOptions = useMemo(
    () =>
      provinces.map((p) => ({
        value: p.name.toLowerCase(),
        label: capitalizeFirstLetter(p.name),
      })),
    [provinces],
  );
  const mrOptions = useMemo(
    () =>
      mrList.map((mr) => ({
        value: mr._id,
        label: capitalizeFirstLetter(mr.medicalRepName),
      })),
    [mrList],
  );
  const zoneOptions = useMemo(
    () =>
      zones.map((z) => ({
        value: (typeof z === "string" ? z : z.name || "").toLowerCase(),
        label: capitalizeFirstLetter(typeof z === "string" ? z : z.name || ""),
      })),
    [zones],
  );
  const businessTypeOptions = useMemo(
    () =>
      businessTypes.map((t) => ({
        value: (typeof t === "string" ? t : t.name || "").toLowerCase(),
        label: capitalizeFirstLetter(typeof t === "string" ? t : t.name || ""),
      })),
    [businessTypes],
  );
  const visiblePages = getVisiblePages(currentPage, totalPages);
  if (loading && customers.length === 0)
    return <LoadingOverlay text="Please wait..." />;
  return (
    <div className="p-4 md:p-6 relative">
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}
      <ImportModal
        isOpen={showImportModal}
        onClose={handleImportClose}
        isSampleFile={isSampleFile}
        mrList={mrList}
      />
      <div className="container mx-auto">
        {/* Mobile Header */}
        {isMobileView && (
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
              Total Customer: {totalCustomers}
            </div>
          </div>
        )}
        {/* Desktop Action Bar */}
        <div className="flex flex-wrap justify-between items-center mb-4 gap-3">
          <div className="flex flex-wrap gap-3">
            {!isMobileView && (
              <>
                <button
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                  onClick={() =>
                    navigate("/masterlayout/customer/new", {
                      state: { customerCode: nextCustomerCode },
                    })
                  }
                >
                  <UserPlus size={18} /> Add New Customer
                </button>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                >
                  <Upload size={18} /> Import Customer
                </button>
              </>
            )}
            {!isMobileView && isSampleDownloadFile && (
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
              >
                <Download size={18} /> Download All Customers
              </button>
            )}
            {selected.length > 0 && !isMobileView && (
              <button
                className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <Trash2 size={18} /> Delete
              </button>
            )}
          </div>
          {!isMobileView && (
            <div className="flex items-center gap-8">
              <div className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium shadow-sm">
                Total Customer: {totalCustomers}
              </div>
              <div className="relative w-full md:w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search by name, business type, MR, address, zone, province, code, or number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>
        {/* Mobile Search */}
        {isMobileView && (
          <div className="relative mt-2">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              autoFocus
            />
          </div>
        )}
        {searchTerm && (
          <p className="text-xs text-gray-500 mt-2">
            Showing results for "{searchTerm}" – {totalCustomers} customer(s)
            found.
          </p>
        )}
        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                {!isMobileView && customers.length > 0 && (
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={
                        selected.length === customers.length &&
                        customers.length > 0
                      }
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                )}
                <th
                  className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                >
                  Customer Code
                </th>
                {[
                  "Name",
                  "Business Type",
                  "MR Name",
                  "Address",
                  "Zone",
                  "Province",
                  "Joining Date",
                ].map((h) => (
                  <th
                    key={h}
                    className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                  >
                    {h}
                  </th>
                ))}
                {!isMobileView && (
                  <>
                    <th className="p-3 text-sm font-medium whitespace-nowrap">
                      Status
                    </th>
                    <th className="p-3 text-sm font-medium whitespace-nowrap">
                      Action
                    </th>
                  </>
                )}
                {isMobileView && (
                  <th
                    className={`p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
                  >
                    Action
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={!isMobileView ? 10 : 9}
                    className="p-4 text-center text-gray-500"
                  >
                    {loading
                      ? "Loading..."
                      : searchTerm
                        ? "No customers found matching your search."
                        : "No customers found. Add your first customer."}
                  </td>
                </tr>
              ) : (
                customers.map((customer, idx) => (
                  <tr
                    key={customer._id}
                    className={`hover:bg-gray-50 ${idx < customers.length - 1 ? "border-b" : ""}`}
                  >
                    {!isMobileView && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === customer._id)}
                          onChange={() => toggleSelect(customer)}
                        />
                      </td>
                    )}
                    <td
                      className={`p-3 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      <span className="font-mono font-semibold text-blue-600">
                        {customer.customerCode}
                      </span>
                    </td>
                    <td
                      className={`p-3 ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {capitalizeFirstLetter(customer.name)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.typeOfBusiness)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.medicalRepName)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.address)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.zone)}
                    </td>
                    <td
                      className={`p-3 capitalize ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {displayValue(customer.province)}
                    </td>
                    <td
                      className={`p-3 whitespace-nowrap ${isMobileView ? "text-[9px]" : "text-sm"}`}
                    >
                      {customer.date
                        ? formatDateForDisplay(customer.date)
                        : "--"}
                    </td>
                    {!isMobileView && (
                      <>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              /* handleStatusToggle if needed */
                            }}
                            className={`px-3 py-1 rounded-full text-sm cursor-pointer ${customer.enabled ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-600"}`}
                          >
                            {customer.enabled ? "Enabled" : "Disabled"}
                          </button>
                        </td>
                        <td className="p-3 flex items-center justify-center gap-3">
                          <button
                            onClick={() => handleView(customer)}
                            className="text-blue-600 hover:text-blue-800"
                            title="View"
                          >
                            <Eye size={18} />
                          </button>
                          <button
                            onClick={() => handleEdit(customer)}
                            className="text-green-600 hover:text-green-800"
                            title="Edit"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => deleteCustomer(customer)}
                            className="text-red-600 hover:text-red-800"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </>
                    )}
                    {isMobileView && (
                      <td className="p-3">
                        <button
                          onClick={() => handleView(customer)}
                          className="text-blue-600 hover:text-blue-800"
                          title="View"
                        >
                          <Eye size={18} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {customers.length > 0 && totalPages > 1 && (
          <div
            className={`mt-4 p-5 flex gap-2 ${isMobileView ? "justify-center" : "justify-start"}`}
          >
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              ← Prev
            </button>
            {visiblePages.map((p, index) => (
              <button
                key={index}
                onClick={() => typeof p === "number" && setCurrentPage(p)}
                className={`px-4 py-2 rounded ${currentPage === p ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
        {/* VIEW MODAL */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold mb-4">View Customer</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    [
                      "Customer Code",
                      <span className="font-mono font-semibold text-blue-600">
                        {form.customerCode}
                      </span>,
                    ],
                    ["Name", capitalizeFirstLetter(form.name)],
                    ["Customer Number", displayValue(form.customerNumber)],
                    ["Type of Business", displayValue(form.typeOfBusiness)],
                    [
                      "Medical Representative",
                      displayValue(form.medicalRepName),
                    ],
                    ["Zone", displayValue(form.zone)],
                    ["Province", displayValue(form.province)],
                    [
                      "Joining Date",
                      form.date ? formatDateForDisplay(form.date) : "--",
                    ],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-gray-700 font-medium">{label}</p>
                      <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                        {val}
                      </p>
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <p className="text-gray-700 font-medium">Address</p>
                    <textarea
                      value={displayValue(form.address)}
                      className="w-full rounded-lg border border-gray-300 p-3 bg-gray-50 resize-none"
                      rows={2}
                      disabled
                    />
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-gray-700 font-medium">Remarks</p>
                    <textarea
                      value={displayValue(form.remark)}
                      className="w-full rounded-lg border border-gray-300 p-3 bg-gray-50 resize-none"
                      rows={3}
                      disabled
                    />
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
            document.body,
          )}
        {/* EDIT MODAL */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-[90vh]">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    resetForm();
                  }}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold mb-4">Edit Customer</h2>
                <form onSubmit={handleCustomerUpdate}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <InputField
                        label="Customer Code"
                        value={form.customerCode}
                        disabled
                        className="bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <InputField
                        type="text"
                        value={form.name || ""}
                        onChange={(e) => handleChange("name", e.target.value)}
                        error={errors.name}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Customer Number
                      </label>
                      <InputField
                        type="text"
                        value={form.customerNumber || ""}
                        onChange={(e) =>
                          handleNumericInput(e, "customerNumber")
                        }
                        placeholder="Numbers only"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Types of Business{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.typeOfBusiness?.toLowerCase() || ""}
                        onChange={(val) => handleChange("typeOfBusiness", val)}
                        options={businessTypeOptions}
                        placeholder="Select Business Type"
                        required
                        error={errors.typeOfBusiness}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Medical Representative{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.medicalRepId || ""}
                        onChange={(val) => handleChange("medicalRepId", val)}
                        options={mrOptions}
                        placeholder="Select MR"
                        required
                        error={errors.medicalRepId}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Zone <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.zone?.toLowerCase() || ""}
                        onChange={(val) => handleChange("zone", val)}
                        options={zoneOptions}
                        placeholder="Select Zone"
                        required
                        error={errors.zone}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Province <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.province?.toLowerCase() || ""}
                        onChange={(val) => handleChange("province", val)}
                        options={provinceOptions}
                        placeholder="Select Province"
                        required
                        error={errors.province}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Joining Date <span className="text-red-500">*</span>
                      </label>
                      <DatePicker
                        selected={
                          form.date ? new Date(form.date + "T12:00:00") : null
                        }
                        onChange={(date) =>
                          handleChange(
                            "date",
                            date ? formatDateToYYYYMMDD(date) : "",
                          )
                        }
                        dateFormat="yyyy-MM-dd"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        isClearable
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Address
                      </label>
                      <textarea
                        value={form.address || ""}
                        onChange={(e) =>
                          handleChange("address", e.target.value)
                        }
                        className="w-full rounded-lg border border-gray-300 p-3 resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Remarks
                      </label>
                      <textarea
                        value={form.remark || ""}
                        onChange={(e) => handleChange("remark", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-3 resize-none"
                        rows={3}
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditModalOpen(false);
                        resetForm();
                      }}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                    >
                      Update Customer
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};
export default Customer;
