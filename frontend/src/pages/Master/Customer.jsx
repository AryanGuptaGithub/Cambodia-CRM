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
  CheckCircle,
  AlertCircle,
  Download,
  Menu,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
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

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";
const isSampleDownloadFile =
  import.meta.env.VITE_IS_SAMPLE_DOWNLOAD_FILE === "true";
const isWithCustomerCode =
  import.meta.env.VITE_IS_WITH_CUSTOMER_CODE === "true";

const customersPerPage = 10;

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

const toTitleCase = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

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

const isFutureDate = (dateStr) => {
  if (!dateStr) return false;
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = new Date(
    parseInt(match[1]),
    parseInt(match[2]) - 1,
    parseInt(match[3]),
  );
  return parsed > today;
};

// ===================== CUSTOM FORM HOOK =====================
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

  const toLowerCase = (str) => (str ? str.toLowerCase() : "");

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
    if (form.date && isFutureDate(form.date)) {
      newErrors.date = "Joining date cannot be a future date";
    }
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
    toLowerCase,
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
  const [futureDateRows, setFutureDateRows] = useState([]);
  const [invalidDateRows, setInvalidDateRows] = useState([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [importWithCode, setImportWithCode] = useState(false);

  // Excel serial-date conversion
  const excelSerialToDateStr = (serial) => {
    if (serial === null || serial === undefined) {
      console.log(`❌ Serial is null or undefined`);
      return null;
    }
    if (typeof serial !== "number") {
      console.log(`❌ Serial is not a number: ${typeof serial}`);
      return null;
    }
    if (serial <= 0) {
      console.log(`❌ Serial <= 0: ${serial}`);
      return null;
    }
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + serial * 86400000);
    if (isNaN(date.getTime())) {
      console.log(`❌ Invalid date from serial: ${serial}`);
      return null;
    }
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const result = `${year}-${month}-${day}`;
    console.log(`✅ Converted serial ${serial} to date: ${result}`);
    return result;
  };

  // Parse date value - supports multiple formats
  const parseDateValue = (val) => {
    console.log(`📅 Parsing date value:`, val, typeof val);
    if (val === null || val === undefined || val === "") {
      console.log(`❌ Date value is empty/null/undefined`);
      return null;
    }

    // Excel serial number
    if (typeof val === "number") {
      console.log(`📅 Value is Excel serial number: ${val}`);
      return excelSerialToDateStr(val);
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      console.log(`📅 Parsing string date: "${trimmed}"`);
      if (!trimmed) {
        console.log(`❌ Empty string after trim`);
        return null;
      }

      // Already YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        console.log(`✅ Valid YYYY-MM-DD format: ${trimmed}`);
        return trimmed;
      }

      // Split on / . or -
      const parts = trimmed.split(/[\/.\-]/);
      if (parts.length === 3) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const p2 = parseInt(parts[2], 10);

        let year, month, day;

        if (parts[0].length === 4) {
          year = p0;
          month = p1;
          day = p2;
          console.log(
            `📅 Format: YYYY/MM/DD → year=${year}, month=${month}, day=${day}`,
          );
        } else if (parts[2].length === 4) {
          year = p2;

          if (p0 > 12) {
            day = p0;
            month = p1;
            console.log(
              `📅 Format: DD/MM/YYYY (p0>12) → year=${year}, month=${month}, day=${day}`,
            );
          } else if (p1 > 12) {
            month = p0;
            day = p1;
            console.log(
              `📅 Format: MM/DD/YYYY (p1>12) → year=${year}, month=${month}, day=${day}`,
            );
          } else {
            day = p0;
            month = p1;
            console.log(
              `📅 Format: DD/MM/YYYY (ambiguous, defaulting) → year=${year}, month=${month}, day=${day}`,
            );
          }
        } else {
          console.log(
            `❌ Cannot determine date format (no 4-digit year): ${trimmed}`,
          );
          year = month = day = null;
        }

        if (
          year &&
          month &&
          day &&
          month >= 1 &&
          month <= 12 &&
          day >= 1 &&
          day <= 31
        ) {
          const result = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          console.log(`✅ Parsed split date: ${result}`);
          return result;
        }
      }

      // Last resort: native Date parsing
      const d = new Date(trimmed);
      if (!isNaN(d.getTime())) {
        const result = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        console.log(`✅ Parsed via Date object: ${trimmed} -> ${result}`);
        return result;
      }
    }

    console.log(`❌ Cannot parse date value: ${val}`);
    return null;
  };

  const getRowKey = (row) => {
    const fields = [
      row.date || "",
      row.medicalRepName || "",
      row.name || "",
      row.typeOfBusiness || "",
      row.customerNumber || "",
      row.customerAddress || "",
      row.zone || "",
      row.province || "",
      row.remark || "",
    ];
    return fields.map((f) => f.toString().trim().toLowerCase()).join("||");
  };

  useEffect(() => {
    if (isOpen) fetchExistingCustomers();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setParsedData([]);
      setParseErrors([]);
      setFileName("");
      setDuplicateRows([]);
      setFutureDateRows([]);
      setInvalidDateRows([]);
      setImportWithCode(false);
    }
  }, [isOpen]);

  const fetchExistingCustomers = async () => {
    setLoadingExisting(true);
    try {
      const res = await axios.get(`${backendUrl}/api/customers?limit=10000`);
      if (res.data.ok) {
        const customers = (res.data.customers || []).map((c) => ({
          customerNumber: c.customerNumber,
          name: c.name,
          customerCode: c.customerCode,
        }));
        setExistingCustomers(customers);
      }
    } catch (error) {
      console.error("❌ Failed to load existing customers:", error);
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
      setFutureDateRows([]);
      setInvalidDateRows([]);
      return;
    }

    const future = parsedData.filter((row) => {
      const isFuture = isFutureDate(row.date);
      if (isFuture)
        console.log(`⚠️ Future date found: ${row.name} - ${row.date}`);
      return isFuture;
    });
    const invalid = parsedData.filter((row) => {
      const isInvalid = !row.date || row.date.trim() === "";
      if (isInvalid) console.log(`⚠️ Invalid/missing date found: ${row.name}`);
      return isInvalid;
    });

    console.log(
      `📊 Results: ${future.length} future dates, ${invalid.length} invalid/missing dates`,
    );
    setFutureDateRows(future);
    setInvalidDateRows(invalid);
  }, [parsedData]);

  useEffect(() => {
    if (!parsedData.length) {
      setDuplicateRows([]);
      return;
    }

    console.log(
      `📊 Checking for duplicates among ${parsedData.length} rows...`,
    );
    const duplicateIndices = new Set();
    const keyCount = new Map();

    parsedData.forEach((row) => {
      const key = getRowKey(row);
      keyCount.set(key, (keyCount.get(key) || 0) + 1);
    });

    parsedData.forEach((row, idx) => {
      if (keyCount.get(getRowKey(row)) > 1) {
        console.log(`⚠️ Duplicate found at index ${idx}: ${row.name}`);
        duplicateIndices.add(idx);
      }
    });

    if (existingCustomers.length > 0) {
      console.log(
        `📊 Checking against ${existingCustomers.length} existing customers...`,
      );
      const existingNumbers = new Set(
        existingCustomers
          .map((c) => c.customerNumber?.trim().toLowerCase())
          .filter(Boolean),
      );
      const existingCodes = new Set(
        existingCustomers
          .map((c) => c.customerCode?.trim().toLowerCase())
          .filter(Boolean),
      );

      parsedData.forEach((row, idx) => {
        const num = row.customerNumber?.trim().toLowerCase();
        if (num && existingNumbers.has(num)) {
          console.log(
            `⚠️ Duplicate number found: ${row.customerNumber} for ${row.name}`,
          );
          duplicateIndices.add(idx);
        }
        if (importWithCode && row.customerCode) {
          const code = row.customerCode?.trim().toLowerCase();
          if (code && existingCodes.has(code)) {
            console.log(
              `⚠️ Duplicate code found: ${row.customerCode} for ${row.name}`,
            );
            duplicateIndices.add(idx);
          }
        }
      });
    }

    const duplicates = parsedData.filter((_, idx) => duplicateIndices.has(idx));
    console.log(`📊 Found ${duplicates.length} duplicate rows`);
    setDuplicateRows(duplicates);
  }, [parsedData, existingCustomers, importWithCode]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseErrors([]);
    setParsedData([]);
    setDuplicateRows([]);
    setFutureDateRows([]);
    setInvalidDateRows([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: false,
          cellNF: false,
          cellText: false,
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
          raw: true,
        });

        if (!rows.length) {
          showToast("warning", "Excel file is empty");
          return;
        }

        let headerIdx = -1;
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          for (let j = 0; j < (rows[i]?.length || 0); j++) {
            const cell = rows[i]?.[j]?.toString().trim().toLowerCase();
            if (cell === "date" || cell === "joining date") {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx !== -1) break;
        }

        if (headerIdx === -1) {
          showToast(
            "error",
            "Header row not found. Please ensure 'Date' or 'Joining Date' column exists.",
          );
          return;
        }

        const headers = rows[headerIdx].map((h) => h.toString().trim());
        const dataRows = rows.slice(headerIdx + 1);
        const getValue = (obj, keys) => {
          for (const key of keys) {
            for (const k in obj) {
              if (
                k.toLowerCase() === key.toLowerCase() &&
                obj[k] !== undefined &&
                obj[k] !== null &&
                obj[k].toString().trim() !== ""
              )
                return obj[k];
            }
          }
          return "";
        };

        const rowErrors = [];
        const validRows = [];

        dataRows.forEach((row, idx) => {
          const rowNumber = headerIdx + idx + 2;
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = row[i] !== undefined ? row[i] : "";
          });

          if (!Object.values(obj).some((v) => v.toString().trim() !== "")) {
            return;
          }

          const name = capitalizeFirstLetter(
            String(
              getValue(obj, [
                "Customer Name in English",
                "Customer Name",
                "Name",
              ]) || "",
            ).trim(),
          );
          const customerNumber = String(
            getValue(obj, [
              "Customer Number",
              "Customer Phone Number",
              "Phone",
              "Contact",
            ]) || "",
          ).trim();

          if (!name && !customerNumber) {
            const error = `Row ${rowNumber}: Missing name and number — skipped`;
            console.log(`❌ ${error}`);
            rowErrors.push(error);
            return;
          }

          const rawDate = getValue(obj, ["Date", "Joining Date"]);
          console.log(`📅 Raw date value: "${rawDate}"`);

          const dateStr = parseDateValue(rawDate);

          // If a value was present but couldn't be parsed → error, skip row
          if (
            rawDate !== "" &&
            rawDate !== null &&
            rawDate !== undefined &&
            dateStr === null
          ) {
            const error = `Row ${rowNumber} (${name || "Unknown"}): Invalid date format "${rawDate}" — please use YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, or Excel date format`;
            console.log(`❌ ${error}`);
            rowErrors.push(error);
            return;
          }

          // Create row data object
          const rowData = {
            date: dateStr || "",
            medicalRepName: String(
              getValue(obj, [
                "Medical Representative Name",
                "Medical Rep Name",
                "MR Name",
              ]) || "",
            ).trim(),
            name,
            typeOfBusiness: String(
              getValue(obj, ["Types of Business", "Business Type", "Type"]) ||
                "",
            ).trim(),
            customerNumber,
            customerAddress: String(
              getValue(obj, ["Customer Address", "Address"]) || "",
            ).trim(),
            zone: String(getValue(obj, ["Zone"]) || "").trim(),
            province: String(getValue(obj, ["Province"]) || "").trim(),
            remark: String(
              getValue(obj, ["Remark", "Notes", "Comments"]) || "",
            ).trim(),
          };

          if (isWithCustomerCode && importWithCode) {
            const code = String(
              getValue(obj, ["Customer Code", "Code"]) || "",
            ).trim();
            if (code) {
              rowData.customerCode = code;
              console.log(`📝 Added customer code: ${code}`);
            }
          }

          // Check for future date and add error but still include the row (marked as invalid for import)
          if (dateStr && isFutureDate(dateStr)) {
            const error = `Row ${rowNumber} (${name || "Unknown"}): Joining date "${dateStr}" is a future date — not allowed. Please correct the date in your Excel file.`;
            console.log(`❌ ${error}`);
            rowErrors.push(error);
            // Still add to validRows but it will be filtered out during import
            // This allows the user to see the row in the preview with the future date warning
          }

          console.log(`✅ Row ${rowNumber} processed:`, rowData);
          validRows.push(rowData);
        });

        console.log(
          `\n📊 Validation complete: ${validRows.length} rows processed, ${rowErrors.length} errors`,
        );

        if (validRows.length === 0) {
          showToast("warning", "No customer records found in the file.");
          return;
        }

        setParsedData(validRows);
        setParseErrors(rowErrors);

        const futureDateErrorCount = rowErrors.filter((e) =>
          e.toLowerCase().includes("future date"),
        ).length;
        const invalidDateErrorCount = rowErrors.filter((e) =>
          e.toLowerCase().includes("invalid date"),
        ).length;

        if (futureDateErrorCount > 0) {
          showToast(
            "error",
            `${futureDateErrorCount} row(s) have future joining dates. Please correct them before importing.`,
          );
        } else if (invalidDateErrorCount > 0) {
          showToast(
            "error",
            `${invalidDateErrorCount} row(s) have invalid date formats. Please fix them.`,
          );
        } else if (rowErrors.length) {
          showToast(
            "warning",
            `${validRows.length} rows loaded, ${rowErrors.length} warnings.`,
          );
        } else {
          showToast("success", `${validRows.length} rows loaded successfully`);
        }
      } catch (err) {
        console.error("❌ Parse error:", err);
        showToast("error", "Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    console.log("\n🚀 Starting import process...");
    console.log(`📊 Total rows loaded: ${parsedData.length}`);
    console.log(`📊 Future date rows: ${futureDateRows.length}`);
    console.log(`📊 Invalid date rows: ${invalidDateRows.length}`);
    console.log(`📊 Duplicate rows: ${duplicateRows.length}`);

    if (!parsedData.length) {
      showToast("warning", "No data to import. Please upload a file first.");
      return;
    }

    // Check for future dates - these cannot be imported
    if (futureDateRows.length > 0) {
      const futureDatesList = futureDateRows
        .map((row) => `${row.name} (${row.date})`)
        .join(", ");
      showToast(
        "error",
        `Cannot import: ${futureDateRows.length} row(s) have future joining dates.\n\nPlease correct these dates in your Excel file:\n${futureDatesList.substring(0, 200)}`,
        8000,
      );
      return;
    }

    // Check for invalid/missing dates
    if (invalidDateRows.length > 0) {
      showToast(
        "error",
        `Cannot import: ${invalidDateRows.length} row(s) have missing or invalid dates. Please fix your file.`,
      );
      return;
    }

    // Filter out duplicate rows
    const uniqueData = parsedData.filter((row) => !duplicateRows.includes(row));
    console.log(`📊 Unique data count: ${uniqueData.length}`);

    if (uniqueData.length === 0) {
      showToast(
        "warning",
        "No unique records to import. All rows are duplicates.",
      );
      return;
    }

    setIsUploading(true);
    try {
      const payload = {
        customers: uniqueData,
        importWithCode: isWithCustomerCode && importWithCode,
      };
      console.log(
        "📤 Sending import request with",
        uniqueData.length,
        "records",
      );

      const res = await axios.post(
        `${backendUrl}/api/customers/import`,
        payload,
        { headers: { "Content-Type": "application/json" }, timeout: 60000 },
      );

      console.log("✅ Import response:", res.data);

      if (res.status === 200) {
        let successMessage =
          res.data.message ||
          `Imported ${uniqueData.length} records successfully`;
        if (res.data.importedCount !== uniqueData.length) {
          successMessage = `Imported ${res.data.importedCount} out of ${uniqueData.length} records. ${res.data.duplicateCount || 0} duplicates skipped.`;
        }
        showToast("success", successMessage);
        onClose(true);
      }
    } catch (err) {
      console.error("❌ Import failed:", err);
      let msg = "Import failed";
      if (err.response?.data?.message) {
        msg = err.response.data.message;
        console.error("❌ Server error:", msg);
      } else if (err.request) {
        msg = "No response from server. Please check your network connection.";
        console.error("❌ No response from server");
      } else {
        msg = err.message || "Unknown error occurred";
        console.error("❌ Error:", err.message);
      }
      showToast("error", msg);
    } finally {
      setIsUploading(false);
      console.log("🏁 Import process completed");
    }
  };

  if (!isOpen) return null;
  const isDuplicateRow = (row) => duplicateRows.includes(row);
  const isFutureDateRow = (row) => futureDateRows.includes(row);
  const isInvalidDateRow = (row) => invalidDateRows.includes(row);
  const hasBlockingIssues =
    futureDateRows.length > 0 || invalidDateRows.length > 0;

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
        <h2 className="text-lg font-semibold mb-1">Import Customers</h2>
        {isSampleFile && <SampleExcelDownloadCustomer />}

        {isWithCustomerCode && (
          <div className="mb-3 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <input
              type="checkbox"
              id="importWithCode"
              checked={importWithCode}
              onChange={(e) => {
                setImportWithCode(e.target.checked);
                setParsedData([]);
                setParseErrors([]);
                setFileName("");
                setDuplicateRows([]);
                setFutureDateRows([]);
                setInvalidDateRows([]);
              }}
              className="w-4 h-4 text-blue-600 cursor-pointer"
            />
            <label
              htmlFor="importWithCode"
              className="text-sm font-medium text-blue-800 cursor-pointer select-none"
            >
              Import with Customer Code
              <span className="block text-xs text-blue-600 font-normal mt-0.5">
                If checked, the "Customer Code" column from your file will be
                used instead of auto-generating codes.
              </span>
            </label>
          </div>
        )}

        {futureDateRows.length > 0 && (
          <div className="mb-4 bg-red-50 border border-red-300 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-red-800">
                ⚠️ {futureDateRows.length} row(s) have a future joining date
              </span>
            </div>
            <p className="text-xs text-red-700 mb-2">
              Joining dates cannot be in the future. Please correct your Excel
              file and re-upload.
            </p>
            <div className="max-h-20 overflow-y-auto text-xs text-red-700 space-y-0.5">
              {futureDateRows.slice(0, 5).map((row, i) => (
                <div key={i}>
                  • <strong>{row.name || "Unknown"}</strong> — date:{" "}
                  <span className="font-mono">{row.date}</span>
                </div>
              ))}
              {futureDateRows.length > 5 && (
                <div>...and {futureDateRows.length - 5} more</div>
              )}
            </div>
          </div>
        )}

        {invalidDateRows.length > 0 && (
          <div className="mb-4 bg-orange-50 border border-orange-300 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle
                size={16}
                className="text-orange-600 flex-shrink-0"
              />
              <span className="text-sm font-semibold text-orange-800">
                ⚠️ {invalidDateRows.length} row(s) have missing or invalid date
              </span>
            </div>
            <p className="text-xs text-orange-700 mb-2">
              Please ensure all rows have a valid date (YYYY-MM-DD, DD/MM/YYYY,
              MM/DD/YYYY, or Excel date format). Rows without a date cannot be
              imported.
            </p>
          </div>
        )}

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
          <p className="text-xs text-gray-400 mt-1">
            ℹ️ Supported date formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, or
            Excel date. Joining dates cannot be in the future.
          </p>
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
            <div className="max-h-24 overflow-y-auto text-xs text-red-700">
              {duplicateRows.slice(0, 5).map((row, i) => (
                <div key={i} className="mb-1">
                  • {row.name} ({row.customerNumber})
                  {row.customerCode ? ` [${row.customerCode}]` : ""}
                </div>
              ))}
              {duplicateRows.length > 5 && (
                <div>...and {duplicateRows.length - 5} more</div>
              )}
            </div>
            <p className="text-xs text-red-600 mt-2">
              Duplicate rows will be skipped during import.
            </p>
          </div>
        )}

        {parsedData.length > 0 && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {parsedData.length} Records Loaded
                {duplicateRows.length > 0 && (
                  <span className="ml-2 text-red-600">
                    ({parsedData.length - duplicateRows.length} unique)
                  </span>
                )}
                {futureDateRows.length > 0 && (
                  <span className="ml-2 text-red-600">
                    ⚠️ {futureDateRows.length} future date(s)
                  </span>
                )}
                {invalidDateRows.length > 0 && (
                  <span className="ml-2 text-orange-600">
                    ⚠️ {invalidDateRows.length} missing date(s)
                  </span>
                )}
              </span>
            </div>
            <div className="max-h-36 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-green-100">
                  <tr>
                    <th className="p-1 text-left">#</th>
                    {isWithCustomerCode && importWithCode && (
                      <th className="p-1 text-left">Code</th>
                    )}
                    <th className="p-1 text-left">Name</th>
                    <th className="p-1 text-left">MR</th>
                    <th className="p-1 text-left">Number</th>
                    <th className="p-1 text-left">Date</th>
                    <th className="p-1 text-left">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedData.slice(0, 5).map((row, i) => {
                    const duplicate = isDuplicateRow(row);
                    const futureDate = isFutureDateRow(row);
                    const invalidDate = isInvalidDateRow(row);
                    return (
                      <tr
                        key={i}
                        className={`border-t ${
                          futureDate
                            ? "bg-red-100 text-red-800 font-medium"
                            : invalidDate
                              ? "bg-orange-100 text-orange-800 font-medium"
                              : duplicate
                                ? "bg-red-100 text-red-800 font-medium"
                                : ""
                        }`}
                      >
                        <td className="p-1 text-gray-500">{i + 1}</td>
                        {isWithCustomerCode && importWithCode && (
                          <td className="p-1 font-mono">
                            {row.customerCode || "—"}
                          </td>
                        )}
                        <td className="p-1">{row.name || "—"}</td>
                        <td className="p-1">{row.medicalRepName || "—"}</td>
                        <td className="p-1">{row.customerNumber || "—"}</td>
                        <td className="p-1">
                          {row.date || (
                            <span className="text-orange-600 font-bold">
                              ⚠️ Missing
                            </span>
                          )}
                          {futureDate && (
                            <span className="ml-1 text-red-600 font-bold">
                              ⚠️ Future
                            </span>
                          )}
                        </td>
                        <td className="p-1">{row.zone || "—"}</td>
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
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 max-h-36 overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={14} className="text-yellow-600" />
              <span className="text-xs font-medium text-yellow-800">
                {parseErrors.length} issue(s) found
              </span>
            </div>
            {parseErrors.slice(0, 10).map((err, i) => (
              <p
                key={i}
                className={`text-xs ${
                  err.toLowerCase().includes("future date") ||
                  err.toLowerCase().includes("invalid date")
                    ? "text-red-700 font-medium"
                    : "text-yellow-700"
                }`}
              >
                {err.toLowerCase().includes("future date") ||
                err.toLowerCase().includes("invalid date")
                  ? "❌ "
                  : "⚠️ "}
                {err}
              </p>
            ))}
            {parseErrors.length > 10 && (
              <p className="text-xs text-gray-500 mt-1">
                ...and {parseErrors.length - 10} more
              </p>
            )}
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
            disabled={
              isUploading ||
              parsedData.length === 0 ||
              loadingExisting ||
              hasBlockingIssues
            }
            title={
              hasBlockingIssues
                ? "Please fix future date or invalid date issues before importing"
                : "Import customers"
            }
            className={`px-5 py-2 rounded-lg text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              hasBlockingIssues
                ? "bg-gray-400"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isUploading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Importing…
              </>
            ) : hasBlockingIssues ? (
              "Fix Issues to Import"
            ) : (
              `Import ${parsedData.length - duplicateRows.length} Records`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ===================== MAIN CUSTOMER COMPONENT =====================
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
  const inputRef = useRef(null);

  const [selectedBusinessTab, setSelectedBusinessTab] = useState("All");
  const [businessTypeTabs, setBusinessTypeTabs] = useState([]);

  const [provinces, setProvinces] = useState([]);
  const [mrList, setMrList] = useState([]);
  const [zones, setZones] = useState([]);
  const [businessTypes, setBusinessTypes] = useState([]);
  const [isDropdownsLoading, setIsDropdownsLoading] = useState(true);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [errors, setErrors] = useState({});

  const [isDuplicateNumber, setIsDuplicateNumber] = useState(false);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const duplicateCheckTimeoutRef = useRef(null);

  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    form,
    handleChange,
    handleNumericInput,
    validateForm,
    resetForm,
    setForm,
    toLowerCase,
  } = useCustomerForm();

  const displayValue = (value) => (value ? toTitleCase(value) : "--");

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (!isEditModalOpen) {
      setIsDuplicateNumber(false);
      setCheckingDuplicate(false);
      if (duplicateCheckTimeoutRef.current)
        clearTimeout(duplicateCheckTimeoutRef.current);
    }
  }, [isEditModalOpen]);

  useEffect(() => {
    if (!searchTerm) return;
    const timer = setTimeout(() => setCurrentPage(1), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    fetchCustomers();
  }, [currentPage, searchTerm, selectedBusinessTab]);

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
      if (btRes.success) {
        const types = btRes.data || [];
        setBusinessTypes(types);
        setBusinessTypeTabs(
          types.map((t) => {
            const name =
              typeof t === "string" ? t : t.name || t.label || "Unknown";
            return name;
          }),
        );
      }
    } catch (err) {
      showToast("error", "Failed to load dropdown data");
    } finally {
      setIsDropdownsLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: customersPerPage,
        search: searchTerm,
      };
      if (selectedBusinessTab !== "All") {
        params.businessType = selectedBusinessTab;
      }
      const response = await axios.get(`${backendUrl}/api/customers`, {
        params,
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

  const handleTabChange = (tab) => {
    setSelectedBusinessTab(tab);
    setCurrentPage(1);
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
        showToast(
          "error",
          error.response?.data?.message ||
            "Failed to delete selected customers.",
        );
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
        showToast(
          "error",
          error.response?.data?.message || "Failed to delete customer.",
        );
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
            (mr.medicalRepName || mr.staffName || "").toLowerCase() ===
            customer.medicalRepName.toLowerCase(),
        );
        actualMrId = found?._id || found?.id || "";
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

  const handleStatusToggle = async (id) => {
    try {
      const customerToToggle = customers.find((c) => c._id === id);
      if (!customerToToggle) {
        showToast("error", "Customer not found");
        return;
      }
      const newStatus = !customerToToggle.enabled;
      setCustomers((prev) =>
        prev.map((c) => (c._id === id ? { ...c, enabled: newStatus } : c)),
      );
      await axios.put(`${backendUrl}/api/customers/${id}`, {
        enabled: newStatus,
      });
      showToast(
        "success",
        `Customer <b>${customerToToggle.name}</b> ${newStatus ? "enabled" : "disabled"} successfully`,
      );
    } catch (error) {
      fetchCustomers();
      showToast(
        "error",
        error.response?.data?.message || "Failed to update status.",
      );
    }
  };

  const handleMRChange = useCallback(
    (option) => {
      const mrId = option || "";
      const selectedMR = mrList.find((mr) => mr._id === mrId);
      setForm((prev) => ({
        ...prev,
        medicalRepId: mrId,
        medicalRepName: selectedMR?.medicalRepName || "",
      }));
      if (errors.medicalRepId)
        setErrors((prev) => ({ ...prev, medicalRepId: "" }));
    },
    [mrList, errors],
  );

  const handleBusinessTypeChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, typeOfBusiness: option || "" }));
      if (errors.typeOfBusiness)
        setErrors((prev) => ({ ...prev, typeOfBusiness: "" }));
    },
    [errors],
  );

  const handleZoneChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, zone: option || "" }));
      if (errors.zone) setErrors((prev) => ({ ...prev, zone: "" }));
    },
    [errors],
  );

  const handleProvinceChange = useCallback(
    (option) => {
      setForm((prev) => ({ ...prev, province: option || "" }));
      if (errors.province) setErrors((prev) => ({ ...prev, province: "" }));
    },
    [errors],
  );

  const performDuplicateCheck = useCallback(
    async (number) => {
      if (!number) {
        setIsDuplicateNumber(false);
        return;
      }
      setCheckingDuplicate(true);
      try {
        const res = await axios.get(`${backendUrl}/api/customers`, {
          params: { search: number, limit: 100 },
        });
        if (res.data.ok) {
          const found = res.data.customers.find(
            (c) => c.customerNumber === number && c._id !== form._id,
          );
          setIsDuplicateNumber(!!found);
        }
      } catch (err) {
        setIsDuplicateNumber(false);
      } finally {
        setCheckingDuplicate(false);
      }
    },
    [form._id],
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
        medicalRepName: toLowerCase(form.medicalRepName),
        medicalRepId: form.medicalRepId,
        name: form.name,
        typeOfBusiness: toLowerCase(form.typeOfBusiness),
        customerNumber: form.customerNumber,
        address: toLowerCase(form.address),
        zone: toLowerCase(form.zone),
        province: toLowerCase(form.province),
        remark: toLowerCase(form.remark),
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
        label: toTitleCase(p.name),
      })),
    [provinces],
  );
  const mrOptions = useMemo(
    () =>
      mrList.map((mr) => ({
        value: mr._id,
        label: toTitleCase(mr.medicalRepName),
      })),
    [mrList],
  );
  const zoneOptions = useMemo(
    () =>
      zones.map((z, i) => {
        const val = typeof z === "string" ? z : z.name || `Zone ${i + 1}`;
        return { value: val.toLowerCase(), label: toTitleCase(val) };
      }),
    [zones],
  );
  const businessTypeOptions = useMemo(
    () =>
      businessTypes.map((t) => {
        const name = typeof t === "string" ? t : t.name || t.label || "Unknown";
        return { value: name.toLowerCase(), label: toTitleCase(name) };
      }),
    [businessTypes],
  );
  const visiblePages = getVisiblePages(currentPage, totalPages);

  if (loading && customers.length === 0)
    return <LoadingOverlay text="Please wait..." />;

  return (
    <div className="p-4 md:p-6 relative pb-20 md:pb-6">
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
        {isMobileView && (
          <div className="flex justify-between items-center mb-3 bg-gray-200 rounded-2xl p-2">
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
                  onClick={() => inputRef.current?.focus()}
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

        {isMobileView && (
          <div className="relative mb-3">
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

        {businessTypeTabs.length > 0 && (
          <div
            className={`mb-4 ${isMobileView ? "overflow-x-auto whitespace-nowrap scrollbar-hide" : ""}`}
          >
            <div className="flex items-center gap-2 flex-wrap pb-1">
              <button
                onClick={() => handleTabChange("All")}
                className={`${
                  isMobileView
                    ? "px-3 py-1.5 rounded-lg text-[10px]"
                    : "px-4 py-2 rounded-lg text-sm"
                } font-medium transition whitespace-nowrap ${
                  selectedBusinessTab === "All"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                All
              </button>
              {businessTypeTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`${
                    isMobileView
                      ? "px-3 py-1.5 rounded-lg text-[10px]"
                      : "px-4 py-2 rounded-lg text-sm"
                  } font-medium transition whitespace-nowrap ${
                    selectedBusinessTab === tab
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {toTitleCase(tab)}
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedBusinessTab !== "All" && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-gray-500">Filtering by:</span>
            <span className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
              {toTitleCase(selectedBusinessTab)}
              <button
                onClick={() => handleTabChange("All")}
                className="hover:text-indigo-600 ml-0.5"
              >
                <X size={13} />
              </button>
            </span>
            <span className="text-sm text-gray-400">
              ({totalCustomers} records)
            </span>
          </div>
        )}

        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table className="min-w-[800px] md:min-w-full w-full border-collapse bg-white rounded-2xl text-center">
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
                {[
                  "Customer Code",
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
                    className={`p-2 md:p-3 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
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
                    className={`p-2 whitespace-nowrap ${isMobileView ? "text-[10px]" : "text-sm"} font-medium`}
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
                    className="p-8 text-center text-gray-500"
                  >
                    {loading
                      ? "Loading..."
                      : searchTerm
                        ? "No customers found matching your search."
                        : selectedBusinessTab !== "All"
                          ? `No customers found for business type "${toTitleCase(selectedBusinessTab)}".`
                          : "No customers found. Add your first customer using the 'Add New Customer' button above."}
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
                      className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      <span className="font-mono font-semibold text-blue-600">
                        {customer.customerCode}
                      </span>
                    </td>
                    <td
                      className={`p-2 md:p-3 ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {capitalizeFirstLetter(customer.name)}
                    </td>
                    <td
                      className={`p-2 md:p-3 capitalize ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {displayValue(customer.typeOfBusiness)}
                    </td>
                    <td
                      className={`p-2 md:p-3 capitalize ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {displayValue(customer.medicalRepName)}
                    </td>
                    <td
                      className={`p-2 md:p-3 capitalize ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {displayValue(customer.address)}
                    </td>
                    <td
                      className={`p-2 md:p-3 capitalize ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {displayValue(customer.zone)}
                    </td>
                    <td
                      className={`p-2 md:p-3 capitalize ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {displayValue(customer.province)}
                    </td>
                    <td
                      className={`p-2 md:p-3 whitespace-nowrap ${isMobileView ? "text-[8px]" : "text-sm"}`}
                    >
                      {customer.date
                        ? formatDateForDisplay(customer.date)
                        : "--"}
                    </td>
                    {!isMobileView && (
                      <>
                        <td className="p-3">
                          <button
                            onClick={() => handleStatusToggle(customer._id)}
                            className={`px-3 py-1 rounded-full text-sm cursor-pointer ${customer.enabled ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-600"}`}
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
                      </>
                    )}
                    {isMobileView && (
                      <td className="p-2">
                        <button
                          onClick={() => handleView(customer)}
                          className="text-blue-600 hover:text-blue-800"
                          title="View"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {customers.length > 0 && totalPages > 1 && (
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
              visiblePages.map((p, index) => (
                <button
                  key={index}
                  onClick={() => typeof p === "number" && setCurrentPage(p)}
                  className={`px-4 py-2 rounded text-sm ${
                    p === "..."
                      ? "bg-gray-200 cursor-not-allowed"
                      : currentPage === p
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  {p}
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
                      <label className="block text-sm font-medium text-gray-600">
                        Customer Code
                      </label>
                      <div className="bg-gray-100 text-gray-700 border rounded px-3 py-2 border-gray-300 font-mono font-semibold">
                        {form.customerCode}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Customer code cannot be changed
                      </p>
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
                        className="px-3 py-2 border-gray-300 border rounded-lg w-full"
                        placeholder="Enter customer name"
                      />
                      {errors.name && (
                        <p className="text-red-500 text-sm mt-1">
                          {errors.name}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Customer Number
                      </label>
                      <InputField
                        type="text"
                        value={form.customerNumber || ""}
                        onChange={(e) => {
                          handleNumericInput(e, "customerNumber");
                          if (duplicateCheckTimeoutRef.current)
                            clearTimeout(duplicateCheckTimeoutRef.current);
                          duplicateCheckTimeoutRef.current = setTimeout(
                            () => performDuplicateCheck(e.target.value),
                            500,
                          );
                        }}
                        placeholder="Numbers only"
                        className="px-3 py-2 border-gray-300 border rounded-lg w-full"
                      />
                      {checkingDuplicate && (
                        <p className="text-gray-500 text-sm mt-1">
                          Checking uniqueness...
                        </p>
                      )}
                      {isDuplicateNumber && (
                        <p className="text-red-500 text-sm mt-1">
                          This customer number is already used by another
                          customer.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600">
                        Types of Business{" "}
                        <span className="text-red-500">*</span>
                      </label>
                      <SearchableDropdown
                        value={
                          form.typeOfBusiness
                            ? form.typeOfBusiness.toLowerCase()
                            : ""
                        }
                        onChange={handleBusinessTypeChange}
                        options={businessTypeOptions}
                        placeholder="Select Business Type"
                        required
                        loading={isDropdownsLoading}
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
                        onChange={handleMRChange}
                        options={mrOptions}
                        placeholder="Select MR"
                        required
                        loading={isDropdownsLoading}
                        error={errors.medicalRepId}
                      />
                    </div>
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
                        placeholderText="Select date"
                        maxDate={new Date()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-200"
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
                        className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-indigo-200 resize-none"
                        rows={2}
                        placeholder="Enter address"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-600">
                        Remarks
                      </label>
                      <textarea
                        value={form.remark || ""}
                        onChange={(e) => handleChange("remark", e.target.value)}
                        className="w-full rounded-lg border border-gray-300 p-3 focus:ring-2 focus:ring-indigo-200 resize-none"
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
                      disabled={isDuplicateNumber || checkingDuplicate}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg cursor-pointer disabled:opacity-50"
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
