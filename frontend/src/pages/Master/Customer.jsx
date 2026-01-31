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
  LoaderPinwheelIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import axios from "axios";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { getVisiblePages } from "../../utils/useVisiblePages";
import SampleExcelDownloadCustomer from "../../excels/SampleExcelDownloadCustomer";
import SearchableDropdown from "../../components/common/SearchableDropdown";
import InputField from "../../components/common/InputField";
import LoadingOverlay from "../../components/Loading";

// Import API functions
import {
  fetchProvinces as fetchProvincesAPI,
  fetchMRList as fetchMRListAPI,
  fetchZones as fetchZonesAPI,
  fetchBusinessTypes as fetchBusinessTypesAPI,
} from "../../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const customersPerPage = 10; // Changed to match backend default

/* ────────────────────── Custom hook for form ────────────────────── */
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
  
  // Helper to convert to title case for display
  const toTitleCase = (str) => {
    if (!str) return "";
    return str
      .toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };
  
  // Helper to convert to lowercase for saving
  const toLowerCase = (str) => {
    if (!str) return "";
    return str.toLowerCase();
  };

  const handleChange = useCallback(
    (name, value) => {
      setForm((prev) => ({ ...prev, [name]: value }));
      if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
    },
    [errors]
  );
  
  const handleDropdownChange = useCallback(
    (field, option) => {
      const value = option ? option.value : "";
      handleChange(field, value);
    },
    [handleChange]
  );
  
  const handleNumericInput = useCallback(
    (e, field) => {
      const value = e.target.value;
      if (value === "" || /^\d+$/.test(value)) {
        handleChange(field, value);
      }
    },
    [handleChange]
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
    handleDropdownChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
    toTitleCase,
    toLowerCase,
  };
};

/* ────────────────────── Main Component ────────────────────── */
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
  const [isUploading, setIsUploading] = useState(false);
  const [parsedData, setParsedData] = useState([]);
  const [nextCustomerCode, setNextCustomerCode] = useState(null);
  const inputRef = useRef(null);
  const [searchTimeout, setSearchTimeout] = useState(null);
  // Dropdown data
  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [isDropdownsLoading, setIsDropdownsLoading] = useState(true);
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [errors, setErrors] = useState({});
  
  const {
    form,
    handleChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
    toTitleCase,
    toLowerCase,
  } = useCustomerForm();

  /* ──────── Helper: Display -- for empty values ──────── */
  const displayValue = (value) => (value ? toTitleCase(value) : "--");

  /* ──────── Helper function to format date for display ──────── */
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "--";

    try {
      // If it's already in YYYY-MM-DD format
      if (
        typeof dateString === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(dateString)
      ) {
        const parts = dateString.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const monthNames = [
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
        return `${day} ${monthNames[month]} ${year}`;
      }

      return formatDateToReadable(dateString);
    } catch (error) {
      console.error("Error formatting date:", error);
      return "--";
    }
  };

  /* ──────── Helper function to format Date to YYYY-MM-DD ──────── */
  const formatDateToYYYYMMDD = (date) => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  /* ──────── Data fetching ──────── */
  useEffect(() => {
    fetchCustomers();
    fetchDropdownData();
  }, [currentPage, searchTerm]); // Refetch when page or search changes

  // Add debounced search effect
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for search
    const timeout = setTimeout(() => {
      if (searchTerm !== "") {
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
  }, [searchTerm]);

  const fetchDropdownData = async () => {
    try {
      setIsDropdownsLoading(true);
      const [provincesResult, mrResult, zonesResult, businessTypesResult] =
        await Promise.all([
          fetchProvincesAPI(),
          fetchMRListAPI(),
          fetchZonesAPI(),
          fetchBusinessTypesAPI(),
        ]);
      if (provincesResult.success) setProvinces(provincesResult.data || []);
      if (mrResult.success) setMrList(mrResult.data || []);
      if (zonesResult.success) setZones(zonesResult.data || []);
      if (businessTypesResult.success)
        setBusinessTypes(businessTypesResult.data || []);
    } catch (error) {
      console.error("Error fetching dropdown data:", error);
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
          search: searchTerm
        }
      });
      
      if (response.data.ok) {
        setCustomers(response.data.customers || []);
        setTotalCustomers(response.data.total || 0);
        setTotalPages(response.data.totalPages || 1);
        setNextCustomerCode(response.data.nextCustomerCode || null);
      }
    } catch (err) {
      console.error("Error fetching customers:", err);
      showToast("error", err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  /* ──────── Search Handler ──────── */
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    // Don't reset page here, let the useEffect handle it with debounce
  };

  /* ──────── Selection ──────── */
  const toggleSelect = useCallback((customer) => {
    setSelected((prev) =>
      prev.some((c) => c.id === customer._id)
        ? prev.filter((c) => c.id !== customer._id)
        : [...prev, { id: customer._id, name: customer.name }]
    );
  }, []);

  const toggleSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? customers.map((c) => ({ id: c._id, name: c.name }))
          : []
      );
    },
    [customers]
  );

  /* ──────── Delete ──────── */
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
      text: `Are you sure you want to delete <b>${customer.name}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });
    if (confirm.isConfirmed) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/customers/${customer._id}`
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

  /* ──────── View / Edit ──────── */
  const handleView = useCallback(
    (customer) => {
      setForm(customer);
      setIsViewModalOpen(true);
    },
    [setForm]
  );

  const handleEdit = useCallback(
    (customer) => {
      let actualMrId = customer.medicalRepId || "";
      if (!actualMrId && customer.medicalRepName && mrList.length) {
        const found = mrList.find(
          (mr) =>
            (mr.medicalRepName || mr.staffName || "").toLowerCase() ===
            customer.medicalRepName.toLowerCase()
        );
        actualMrId = found?._id || found?.id || "";
      }
      setForm({
        customerCode: customer.customerCode || "",
        date: customer.date || "",
        medicalRepName: customer.medicalRepName || "",
        medicalRepId: actualMrId,
        name: customer.name || "",
        typeOfBusiness: customer.typeOfBusiness || "",
        customerNumber: customer.customerNumber || "",
        address: customer.address || "",
        zone: customer.zone || "",
        province: customer.province || "",
        remark: customer.remark || "",
        _id: customer._id || null,
      });
      setIsEditModalOpen(true);
    },
    [mrList, setForm]
  );

  const handleStatusToggle = async (id) => {
    try {
      // Store original customers for rollback
      const originalCustomers = [...customers];

      // Find the customer to toggle
      const customerToToggle = originalCustomers.find((c) => c._id === id);

      if (!customerToToggle) {
        showToast("error", "Customer not found");
        return;
      }

      const newStatus = !customerToToggle.enabled;
      const customerName = customerToToggle.name;

      // Optimistic UI update
      setCustomers(
        customers.map((c) => (c._id === id ? { ...c, enabled: newStatus } : c))
      );

      // API call
      await axios.put(`${backendUrl}/api/customers/${id}`, {
        enabled: newStatus,
      });

      showToast(
        "success",
        `Customer <b>${customerName}</b> ${
          newStatus ? "enabled" : "disabled"
        } successfully`
      );
    } catch (err) {
      // Revert on error
      fetchCustomers();
      showToast("error", "Failed to update status");
    }
  };

  /* ──────── Dropdown Change Handlers ──────── */
  const handleMRChange = useCallback(
    (option) => {
      const mrId = option ? option : "";
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      setForm((prev) => ({
        ...prev,
        medicalRepId: mrId,
        medicalRepName: selectedMR?.medicalRepName,
      }));
      if (errors.medicalRepId)
        setErrors((prev) => ({ ...prev, medicalRepId: "" }));
    },
    [mrList, errors]
  );

  const handleBusinessTypeChange = useCallback(
    (option) => {
      const value = option ? option : "";
      setForm((prev) => ({ ...prev, typeOfBusiness: value }));
      if (errors.typeOfBusiness)
        setErrors((prev) => ({ ...prev, typeOfBusiness: "" }));
    },
    [errors]
  );

  const handleZoneChange = useCallback(
    (option) => {
      const value = option ? option : "";
      setForm((prev) => ({ ...prev, zone: value }));
      if (errors.zone) setErrors((prev) => ({ ...prev, zone: "" }));
    },
    [errors]
  );

  const handleProvinceChange = useCallback(
    (option) => {
      const value = option ? option : "";
      setForm((prev) => ({ ...prev, province: value }));
      if (errors.province) setErrors((prev) => ({ ...prev, province: "" }));
    },
    [errors]
  );

  /* ──────── Update ──────── */
  const handleCustomerUpdate = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      showToast("error", "Please fill all required fields");
      return;
    }
    try {
      // Convert string fields to lowercase before sending
      const payload = {
        customerCode: form.customerCode,
        date: form.date,
        medicalRepName: toLowerCase(form.medicalRepName),
        medicalRepId: form.medicalRepId,
        name: toLowerCase(form.name),
        typeOfBusiness: toLowerCase(form.typeOfBusiness),
        customerNumber: form.customerNumber,
        address: toLowerCase(form.address),
        zone: toLowerCase(form.zone),
        province: toLowerCase(form.province),
        remark: toLowerCase(form.remark),
      };
      
      const res = await axios.put(
        `${backendUrl}/api/customers/${form._id}`,
        payload
      );
      if (res.status === 200) {
        showToast("success", `${form.name} updated successfully`);
        setIsEditModalOpen(false);
        resetForm();
        fetchCustomers();
      }
    } catch (err) {
      showToast("error", "Failed to update customer.");
    }
  };

  /* ──────── Import Logic ──────── */
  const handleImportClick = () => {
    if (!mrList.length) {
      showToast(
        "error",
        "No Medical Representatives found. Please add at least one MR first."
      );
      return;
    }
    setShowImportModal(true);
  };

  /* ──────── Date Parsing Functions ──────── */
  const excelSerialToDateString = (serial) => {
    if (!serial && serial !== 0) return "";

    // Handle both number and string numbers
    const num = typeof serial === "string" ? parseFloat(serial) : serial;
    if (isNaN(num)) return "";

    // Excel date system: 1 = Jan 1, 1900 (with bug for Feb 29, 1900)
    // Important: Excel incorrectly treats 1900 as a leap year
    // So we need to adjust for the phantom day (Feb 29, 1900)

    // If it's 60 or above, it's on or after the phantom Feb 29, 1900
    // So we need to subtract 1 to skip that phantom day
    const adjustedNum = num >= 60 ? num - 1 : num;

    // JavaScript Date: Jan 1, 1900 is serial 2 (because Jan 0, 1900 = serial 1)
    // So we use Jan 0, 1900 as our base
    const excelEpoch = new Date(1900, 0, 0); // Jan 0, 1900 (same as Dec 31, 1899)

    // Calculate the date by adding days
    const date = new Date(excelEpoch.getTime() + (adjustedNum - 1) * 86400000);

    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  const parseExcelDateValue = (dateValue) => {
    if (!dateValue && dateValue !== 0 && dateValue !== "") {
      // Return today's date if no date provided
      const today = new Date();
      return formatDateToYYYYMMDD(today);
    }

    // 1. If it's already a Date object (from XLSX with cellDates: true)
    if (dateValue instanceof Date) {
      // Get the Excel serial number equivalent
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's zero date)
      const diff = dateValue - excelEpoch;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));

      // Check if this is the Excel date bug (Feb 29, 1900)
      const adjustedDays = days >= 60 ? days + 1 : days;

      // Reconstruct the date from the serial number
      const excelZero = new Date(1899, 11, 31); // Dec 31, 1899 (Excel's day 1)
      const reconstructedDate = new Date(
        excelZero.getTime() + (adjustedDays - 1) * 86400000
      );

      const year = reconstructedDate.getFullYear();
      const month = String(reconstructedDate.getMonth() + 1).padStart(2, "0");
      const day = String(reconstructedDate.getDate()).padStart(2, "0");

      return `${year}-${month}-${day}`;
    }

    // 2. If it's a number (Excel serial date)
    if (typeof dateValue === "number") {
      return excelSerialToDateString(dateValue);
    }

    // 3. If it's a string
    if (typeof dateValue === "string") {
      const trimmed = dateValue.trim();
      if (!trimmed) return "";

      // Check if it's a string number (e.g., "44378" for Jun 1, 2021)
      const asNumber = parseFloat(trimmed);
      if (!isNaN(asNumber)) {
        return excelSerialToDateString(asNumber);
      }

      // Try to parse common date formats
      // First try: MM/DD/YY or MM/DD/YYYY (common in US Excel)
      const usFormatMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (usFormatMatch) {
        let month = parseInt(usFormatMatch[1], 10);
        let day = parseInt(usFormatMatch[2], 10);
        let year = parseInt(usFormatMatch[3], 10);

        if (year < 100) year += 2000;

        return `${year}-${String(month).padStart(2, "0")}-${String(
          day
        ).padStart(2, "0")}`;
      }

      // Try other formats
      const dateFormats = [
        // "1-Jun-21", "01-Jun-2021"
        /^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{2,4})$/i,
        // "2021-06-01", "2021/06/01"
        /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
        // "01-06-2021", "1-6-21" (DD-MM-YYYY)
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/,
      ];

      for (const format of dateFormats) {
        const match = trimmed.match(format);
        if (match) {
          try {
            let year, month, day;

            if (format === dateFormats[0]) {
              // "1-Jun-21" format
              day = parseInt(match[1], 10);
              const monthStr = match[2].toLowerCase().substring(0, 3);
              year = parseInt(match[3], 10);

              if (year < 100) year += 2000;

              const monthMap = {
                jan: 1,
                feb: 2,
                mar: 3,
                apr: 4,
                may: 5,
                jun: 6,
                jul: 7,
                aug: 8,
                sep: 9,
                oct: 10,
                nov: 11,
                dec: 12,
              };

              month = monthMap[monthStr];
              if (month === undefined) continue;
            } else if (format === dateFormats[1]) {
              // "2021-06-01" format
              year = parseInt(match[1], 10);
              month = parseInt(match[2], 10);
              day = parseInt(match[3], 10);
            } else {
              // "01-06-2021" format - assume DD-MM-YYYY (international)
              day = parseInt(match[1], 10);
              month = parseInt(match[2], 10);
              year = parseInt(match[3], 10);
              if (year < 100) year += 2000;
            }

            return `${year}-${String(month).padStart(2, "0")}-${String(
              day
            ).padStart(2, "0")}`;
          } catch (e) {
            console.warn("Failed to parse date string:", trimmed, e);
          }
        }
      }

      // Last resort: try JavaScript Date constructor
      try {
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          // For date strings with timezone, extract just the date
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          return `${year}-${month}-${day}`;
        }
      } catch (e) {
        console.warn("JavaScript Date constructor failed for:", trimmed);
      }
    }

    // Fallback: return today's date
    const today = new Date();
    return formatDateToYYYYMMDD(today);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: true, // Let XLSX try to parse dates
          cellNF: false,
          cellText: false,
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Get ALL rows as they appear in Excel
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true, // Get raw values (numbers, dates)
        });

        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }

        // Find header row - check multiple columns for date header
        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          // Check the first column for "date"
          const firstCell = rows[i]?.[0]?.toString().trim().toLowerCase();
          if (firstCell === "date" || firstCell === "joining date") {
            headerIdx = i;
            break;
          }
          // Also check other columns for date header
          for (let j = 0; j < rows[i]?.length; j++) {
            const cell = rows[i]?.[j]?.toString().trim().toLowerCase();
            if (cell === "date" || cell === "joining date") {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx !== -1) break;
        }

        if (headerIdx === -1) {
          showToast("error", "Header row not found.");
          return;
        }

        const headers = rows[headerIdx].map((h) => h.toString().trim());
        const dataRows = rows.slice(headerIdx + 1);

        // Convert to objects
        const json = dataRows
          .map((row) => {
            const obj = {};
            headers.forEach((h, i) => {
              obj[h] = row[i] !== undefined ? row[i] : "";
            });
            return obj;
          })
          .filter((o) =>
            Object.values(o).some((v) => v.toString().trim() !== "")
          );

        const final = json.map((item) => {
          const getValue = (keys) => {
            for (const key of keys) {
              for (const itemKey in item) {
                if (
                  itemKey.toLowerCase() === key.toLowerCase() &&
                  item[itemKey] !== undefined &&
                  item[itemKey] !== null &&
                  item[itemKey].toString().trim() !== ""
                ) {
                  return item[itemKey];
                }
              }
            }
            return "";
          };

          const dateVal = getValue([
            "Date",
            "date",
            "Joining Date",
            "joining date",
          ]);

          const formattedDate = parseExcelDateValue(dateVal);

          return {
            date: formattedDate,
            medicalRepName: getValue([
              "Medical Representative Name",
              "medical representative name",
              "Medical Rep Name",
              "medical rep name",
              "MR Name",
              "mr name",
            ]),
            name: getValue([
              "Customer Name in English",
              "customer name in english",
              "Customer Name",
              "customer name",
              "Name",
            ]),
            typeOfBusiness: getValue([
              "Types of Business",
              "types of business",
              "Business Type",
              "business type",
              "Type",
            ]),
            customerNumber: getValue([
              "Customer Number",
              "customer number",
              "Customer Phone Number",
              "customer phone number",
              "Phone",
              "phone",
              "Contact",
              "contact",
            ]),
            customerAddress: getValue([
              "Customer Address",
              "customer address",
              "Address",
              "address",
            ]),
            zone: getValue(["Zone", "zone"]),
            province: getValue(["Province", "province"]),
            remark: getValue([
              "Remark",
              "remark",
              "Notes",
              "notes",
              "Comments",
              "comments",
            ]),
          };
        });

        const validData = final.filter(
          (item) => item.name.trim() !== "" || item.customerNumber.trim() !== ""
        );

        if (validData.length === 0) {
          showToast("warning", "No valid customer records found.");
          return;
        }

        setParsedData(validData);
      } catch (err) {
        console.error("Error parsing file:", err);
        showToast("error", "Failed to parse file: " + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleCustomerImport = async () => {
    if (!parsedData.length) {
      showToast("warning", "Upload a valid file first");
      return;
    }

    setIsUploading(true);
    try {
      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        parsedData,
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 300000, // 5 minutes timeout
        }
      );

      if (res.status === 200) {
        showToast(
          "success",
          res.data.message ||
            `Imported ${parsedData.length} records successfully`
        );
        setShowImportModal(false);
        setParsedData([]);
        fetchCustomers();
      }
    } catch (err) {
      console.error("Import error:", err);

      let errorMsg = "Import failed";
      if (err.response) {
        errorMsg =
          err.response.data?.message || `Server error: ${err.response.status}`;

        if (err.response.data?.errors) {
          errorMsg += `. ${err.response.data.errors.length} records have validation issues.`;
        }

        if (err.response.data?.duplicates) {
          errorMsg += ` ${err.response.data.duplicates.length} duplicate records found.`;
        }
      } else if (err.request) {
        errorMsg = "No response from server. Check network connection.";
      } else {
        errorMsg = err.message || "Unknown error occurred";
      }

      showToast("error", errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  /* ──────── Dropdown Options (memoized) ──────── */
  const provinceOptions = useMemo(
    () =>
      provinces.map((p) => ({
        value: p.name.toLowerCase(),
        label: toTitleCase(p.name),
      })),
    [provinces]
  );
  
  const mrOptions = useMemo(
    () =>
      mrList.map((mr) => {
        const id = mr._id;
        const name = mr.medicalRepName;
        return { value: id, label: toTitleCase(name) };
      }),
    [mrList]
  );
  
  const zoneOptions = useMemo(
    () =>
      zones.map((z, i) => {
        const val = typeof z === "string" ? z : z.name || `Zone ${i + 1}`;
        return { value: val.toLowerCase(), label: toTitleCase(val) };
      }),
    [zones]
  );
  
  const businessTypeOptions = useMemo(
    () =>
      businessTypes.map((t) => {
        const name = typeof t === "string" ? t : t.name || t.label || "Unknown";
        return { value: name.toLowerCase(), label: toTitleCase(name) };
      }),
    [businessTypes]
  );

  const visiblePages = getVisiblePages(currentPage, totalPages);

  if (loading && customers.length === 0) return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-6">
      <div className="container">
        {/* Header - REMOVED CONDITIONAL RENDERING FOR SEARCH SECTION */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex gap-3">
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
              onClick={handleImportClick}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
            >
              <Upload size={18} /> Import Customer
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
          
          {/* SEARCH SECTION - ALWAYS VISIBLE NOW */}
          <div className="flex items-center gap-8">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium shadow-sm">
                {totalCustomers}
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
                placeholder="Search by name, business type, MR, address, zone, province, code, or number..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>

        {/* Search results info */}
        {searchTerm && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              Showing results for: <span className="font-semibold">"{searchTerm}"</span> 
              <span className="ml-4">Found: <span className="font-bold">{totalCustomers}</span> customer(s)</span>
            </p>
            {totalCustomers === 0 && (
              <p className="text-sm text-gray-600 mt-1">
                No customers found matching your search. Try different keywords.
              </p>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow text-center">
            <thead className="bg-gray-100 text-gray-700 border-b">
              <tr>
                <th className="p-3">
                  <div className="flex items-center gap-4">
                    {customers.length > 0 && (
                      <input
                        type="checkbox"
                        checked={
                          selected.length === customers.length &&
                          customers.length > 0
                        }
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                      />
                    )}
                    <span className="text-sm font-medium">Customer Code</span>
                  </div>
                </th>
                <th className="p-3 text-sm font-medium">Name</th>
                <th className="p-3 text-sm font-medium">Business Type</th>
                <th className="p-3 text-sm font-medium">MR Name</th>
                <th className="p-3 text-sm font-medium">Address</th>
                <th className="p-3 text-sm font-medium">Zone</th>
                <th className="p-3 text-sm font-medium">Province</th>
                <th className="p-3 text-sm font-medium">Joining Date</th>
                <th className="p-3 text-sm font-medium">Status</th>
                <th className="p-3 text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-gray-500">
                    {loading ? "Loading..." : searchTerm ? (
                      <>
                        No customers found matching your search. 
                        <br />
                        <button
                          onClick={() => setSearchTerm("")}
                          className="text-blue-600 hover:text-blue-800 underline mt-2"
                        >
                          Clear search to see all customers
                        </button>
                      </>
                    ) : (
                      "No customers found. Add your first customer using the 'Add New Customer' button above."
                    )}
                  </td>
                </tr>
              ) : (
                customers.map((customer, idx) => (
                  <tr
                    key={customer._id}
                    className={`hover:bg-gray-50 ${
                      idx < customers.length - 1 ? "border-b" : ""
                    }`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selected.some((s) => s.id === customer._id)}
                          onChange={() => toggleSelect(customer)}
                        />
                        <span className="capitalize">
                          {displayValue(customer.customerCode)}
                        </span>
                      </div>
                    </td> <td className="p-3 capitalize">
                      {displayValue(customer.name)}
                    </td>
                    <td className="p-3 capitalize">
                      {displayValue(customer.typeOfBusiness)}
                    </td>
                    <td className="p-3 capitalize">
                      {displayValue(customer.medicalRepName)}
                    </td>
                    <td className="p-3 capitalize">
                      {displayValue(customer.address)}
                    </td>
                    <td className="p-3 capitalize">
                      {displayValue(customer.zone)}
                    </td>
                    <td className="p-3 capitalize">
                      {displayValue(customer.province)}
                    </td>
                    <td className="p-3">
                      {customer.date
                        ? formatDateForDisplay(customer.date)
                        : "--"}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => handleStatusToggle(customer._id)}
                        className={`px-3 py-1 rounded-full text-sm cursor-pointer ${
                          customer.enabled
                            ? "bg-green-100 text-green-600"
                            : "bg-gray-200 text-gray-600"
                        }`}
                      >
                        {customer.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td className="p-3 flex items-center justify-center gap-3">
                      <button
                        className="text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => handleView(customer)}
                        title="View"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        className="text-green-600 hover:text-green-800 cursor-pointer"
                        onClick={() => handleEdit(customer)}
                        title="Edit"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        className="text-red-600 hover:text-red-800 cursor-pointer"
                        onClick={() => deleteCustomer(customer)}
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
          {customers.length > 0 && totalPages > 1 && (
            <div className="mt-4 p-5 flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                ← Prev
              </button>

              {visiblePages.map((p, index) => (
                <button
                  key={index}
                  onClick={() => typeof p === "number" && setCurrentPage(p)}
                  disabled={p === "..."}
                  className={`px-4 py-2 rounded ${
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
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                Next →
              </button>
            </div>
          )}
        </div>

        {/* Import Modal */}
        {showImportModal &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
                <button
                  onClick={() => setShowImportModal(false)}
                  disabled={isUploading}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Import Customer</h2>
                {isSampleFile && <SampleExcelDownloadCustomer />}
                <div className="mb-6">
                  <label className="block text-gray-700 mb-2">File</label>
                  <input
                    type="file"
                    accept=".csv, .xlsx"
                    onChange={handleFileUpload}
                    className="block w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div className="flex justify-between items-center mt-6">
                  <div className="text-gray-700">
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
                      onClick={handleCustomerImport}
                      disabled={isUploading || parsedData.length === 0}
                      className={`px-5 py-2 rounded-lg cursor-pointer ${
                        isUploading || parsedData.length === 0
                          ? "bg-blue-400 text-white cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      {isUploading
                        ? "Uploading…"
                        : `Upload (${parsedData.length})`}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* ────────────────────── VIEW MODAL ────────────────────── */}
        {isViewModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
                <button
                  onClick={() => setIsViewModalOpen(false)}
                  className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                >
                  <X size={20} />
                </button>
                <h2 className="text-xl font-semibold mb-4">View Customer</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-700 font-medium">Customer Code</p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.customerCode)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">Name</p>
                    <p className="capitalize bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.name)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">Customer Number</p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.customerNumber)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">
                      Type of Business
                    </p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.typeOfBusiness)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">
                      Medical Representative
                    </p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.medicalRepName)}
                    </p>
                  </div>

                  <div>
                    <p className="text-gray-700 font-medium">Zone</p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.zone)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">Province</p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {displayValue(form.province)}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-700 font-medium">Joining Date</p>
                    <p className="bg-gray-100 rounded-lg px-3 py-2 border border-gray-300">
                      {form.date ? formatDateForDisplay(form.date) : "--"}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-gray-700 font-medium">Address</p>
                    <textarea
                      value={displayValue(form.address)}
                      className="w-full rounded-lg border border-gray-300 p-3 bg-gray-50 resize-none"
                      rows={2}
                      disabled
                    />
                  </div>
                  {/* REMARKS (still after address) */}
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
            document.body
          )}

        {/* ────────────────────── EDIT MODAL ────────────────────── */}
        {isEditModalOpen &&
          ReactDOM.createPortal(
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50">
              <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative overflow-y-auto max-h-screen">
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
                    {/* Customer Code */}
                    <div>
                      <InputField
                        label="Customer Code"
                        name="customerCode"
                        value={displayValue(form.customerCode)}
                        disabled
                        className="bg-gray-100 text-gray-700 border rounded px-3 py-2 border-gray-300"
                      />
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <InputField
                        type="text"
                        value={form.name || ""}
                        onChange={(e) => handleChange("name", e.target.value)}
                        error={errors.name}
                        className="capitalize px-3 py-2 border-gray-300 border rounded-lg w-full"
                        placeholder="Enter customer name"
                      />
                      {errors.name && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.name}
                        </p>
                      )}
                    </div>

                    {/* Customer Number */}
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
                        className="px-3 py-2 border-gray-300 border rounded-lg w-full"
                      />
                    </div>

                    {/* Type of Business */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Types of Business{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.typeOfBusiness ? form.typeOfBusiness.toLowerCase() : ""}
                        onChange={handleBusinessTypeChange}
                        options={businessTypeOptions}
                        placeholder="Select Business Type"
                        required
                        loading={isDropdownsLoading}
                        error={errors.typeOfBusiness}
                      />
                    </div>

                    {/* Medical Representative */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Medical Representative{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.medicalRepId || ""}
                        onChange={handleMRChange}
                        options={mrOptions}
                        placeholder="Select MR"
                        required
                        loading={isDropdownsLoading}
                        error={errors.medicalRepId}
                      />
                    </div>

                    {/* Zone */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Zone <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.zone ? form.zone.toLowerCase() : ""}
                        onChange={handleZoneChange}
                        options={zoneOptions}
                        placeholder="Select Zone"
                        required
                        loading={isDropdownsLoading}
                        error={errors.zone}
                      />
                    </div>

                    {/* Province */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Province <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={form.province ? form.province.toLowerCase() : ""}
                        onChange={handleProvinceChange}
                        options={provinceOptions}
                        placeholder="Select Province"
                        required
                        loading={isDropdownsLoading}
                        error={errors.province}
                      />
                    </div>

                    {/* Joining Date */}
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
                            date ? formatDateToYYYYMMDD(date) : ""
                          )
                        }
                        dateFormat="yyyy-MM-dd"
                        placeholderText="Select date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                        isClearable
                      />
                      {errors.date && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.date}
                        </p>
                      )}
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
                        className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 resize-none"
                        rows={2}
                        placeholder="Enter address"
                      />
                    </div>

                    {/* REMARKS – after Address */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Remarks
                      </label>
                      <textarea
                        value={form.remark || ""}
                        onChange={(e) => handleChange("remark", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500 resize-none"
                        rows={3}
                        placeholder="Enter any remarks"
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
            document.body
          )}
      </div>
    </div>
  );
};

export default Customer;