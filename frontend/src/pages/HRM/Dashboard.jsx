import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Eye,
  Edit,
  Trash2,
  UserPlus,
  Search,
  X,
  Download,
  Upload,
  Users,
  UserCheck,
  UserX,
  Building,
  Calendar,
  DollarSign,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import axios from "axios";
import * as XLSX from "xlsx";
import { formatDateToReadable } from "../../utils/dateUtil";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { fetchWholeMRList, fetchHRMSalary } from "../../utils/customerUtil";
import SampleExcelDownloadStaff from "../../excels/SampleExcelDownloadStaff";
import { parseExcelDate } from "../../utils/excelUtility";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

// Function to format date as "MMM YYYY" (e.g., "Oct 2025")
const formatMonthYear = (date) => {
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
};

// Function to format date as "DD MMM YYYY" (e.g., "13 Mar 2025")
const formatDateToDDMMMYYYY = (dateString) => {
  if (!dateString) return "";

  try {
    let date;

    // Check if it's already a Date object
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === "string") {
      // Try to parse the date string
      // First, check for DD/MM/YYYY format
      const ddmmyyyyMatch = dateString.match(
        /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
      );
      if (ddmmyyyyMatch) {
        const day = parseInt(ddmmyyyyMatch[1], 10);
        const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // Months are 0-indexed
        const year = parseInt(ddmmyyyyMatch[3], 10);
        date = new Date(year, month, day);
      } else {
        // Try parsing as ISO string or other formats
        date = new Date(dateString);
      }
    } else {
      date = new Date(dateString);
    }

    if (isNaN(date.getTime())) {
      console.error("Invalid date:", dateString);
      return dateString || "--";
    }

    const months = [
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

    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();

    return `${day} ${month} ${year}`;
  } catch (error) {
    console.error("Error formatting date:", error, dateString);
    return dateString || "--";
  }
};

// Improved date parsing function for Excel data
const parseDateFromString = (dateString) => {
  if (!dateString) return null;

  try {
    // If it's already a Date object
    if (dateString instanceof Date) {
      return dateString;
    }

    // If it's a number (Excel serial date)
    if (typeof dateString === "number") {
      return parseExcelDate(dateString);
    }

    // Try different date formats
    const dateStr = dateString.toString().trim();

    // Format: DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyyMatch = dateStr.match(
      /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/,
    );
    if (ddmmyyyyMatch) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10) - 1; // Months are 0-indexed
      const year = parseInt(ddmmyyyyMatch[3], 10);
      return new Date(year, month, day);
    }

    // Format: YYYY-MM-DD (ISO)
    const yyyymmddMatch = dateStr.match(
      /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/,
    );
    if (yyyymmddMatch) {
      const year = parseInt(yyyymmddMatch[1], 10);
      const month = parseInt(yyyymmddMatch[2], 10) - 1;
      const day = parseInt(yyyymmddMatch[3], 10);
      return new Date(year, month, day);
    }

    // Try Date.parse for other formats
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }

    return null;
  } catch (error) {
    console.error("Error parsing date:", error, dateString);
    return null;
  }
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef(null);

  // MR List State
  const [mrList, setMrList] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const staffPerPage = 5;
  const [activeTab, setActiveTab] = useState("Total MRs");

  // Payroll State
  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);

  // User State
  const [user, setUser] = useState({
    name: "",
    role: "",
    initials: "",
  });

  // Form State - using isActive directly from staff
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    isActive: true,
    _id: null,
  });

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Export function
  const handleExport = async () => {
    try {
      // Calculate previous month
      const currentDate = new Date();
      const previousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const year = previousMonth.getFullYear();
      const month = previousMonth.getMonth() + 1;

      const response = await fetch(
        `${backendUrl}/api/export-mr-data?year=${year}&month=${month}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("No data found for the specified period");
        } else if (response.status === 400) {
          throw new Error("Invalid parameters");
        } else {
          throw new Error(`Export failed: ${response.statusText}`);
        }
      }

      const contentType = response.headers.get("content-type");
      const isExcelFile =
        contentType &&
        (contentType.includes("spreadsheet") ||
          contentType.includes("excel") ||
          contentType.includes(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ));

      if (!isExcelFile) {
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || "Invalid response format");
        } catch (jsonError) {
          throw new Error("Server returned an invalid response");
        }
      }

      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `MR_Payroll_${year}_${month}.xlsx`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast("success", "MR data exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      showToast(
        "error",
        error.message || "Failed to export data. Please try again.",
      );
    }
  };

  // Fetch payroll data function
  const fetchPayrollData = async () => {
    try {
      const currentDate = new Date();
      const previousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const year = previousMonth.getFullYear();
      const month = String(previousMonth.getMonth() + 1).padStart(2, "0");
      const period = `${year}-${month}`;

      const response = await axios.get(`${backendUrl}/api/hrm/payroll`, {
        params: { period },
      });
      if (response.data && response.data.success) {
        setPayrollData(response.data.data || []);

        // Calculate total payroll
        const total = response.data.data.reduce((sum, item) => {
          return sum + (item.netSalary || 0);
        }, 0);
        setTotalPayroll(total);
      } else {
        setPayrollData([]);
        setTotalPayroll(0);
      }
    } catch (error) {
      console.error("Error fetching payroll data:", error);
      setPayrollData([]);
      setTotalPayroll(0);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch user data
        await fetchUserData();
        // Fetch MR List
        const mrData = await fetchWholeMRList();
        setMrList(mrData.data);

        // Calculate previous month label
        const currentDate = new Date();
        const previousMonthDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1,
        );
        const formattedPreviousMonth = formatMonthYear(previousMonthDate);
        setPreviousMonthLabel(formattedPreviousMonth);

        // Fetch Payroll Data
        await fetchPayrollData();

        await fetchTeams();
      } catch (err) {
        showToast("error", err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Function to fetch user data
  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("token");
      const storedUsername = localStorage.getItem("username");

      if (!token) {
        throw new Error("No authentication token found");
      }

      // Decode token to get role
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userRole = payload.role || "User";
      const username =
        storedUsername || `User-${payload.username || "Unknown"}`;

      // Generate initials
      const getInitials = (name) => {
        if (!name) return "U";
        const words = name.trim().split(/\s+/);
        if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
      };

      setUser({
        name: username,
        role: userRole,
        initials: getInitials(username),
      });
    } catch (err) {
      console.error("Error fetching user data:", err);
      setUser({
        name: "User",
        role: "User",
        initials: "U",
      });
    }
  };

  const fetchTeams = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/staff/teams`);
      setAllTeams(res.data.map((t) => t.trim()).filter(Boolean));
    } catch (err) {
      console.error("Error loading teams:", err);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // ✅ FIXED: Use mr.isActive (staff's own field)
  const dashboardStats = useMemo(() => {
    const totalMRs = mrList.length;
    const enabledMRs = mrList.filter((mr) => mr.isActive).length;
    const disabledMRs = mrList.filter((mr) => !mr.isActive).length;
    const totalTeams = [
      ...new Set(mrList.map((mr) => mr.teamName).filter(Boolean)),
    ].length;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentJoins = mrList.filter((mr) => {
      if (!mr.date) return false;
      const joinDate = parseDateFromString(mr.date);
      return joinDate && joinDate >= thirtyDaysAgo;
    }).length;

    return {
      totalMRs,
      enabledMRs,
      disabledMRs,
      totalTeams,
      recentJoins,
    };
  }, [mrList]);

  // ✅ FIXED: Filter using mr.isActive
  const filteredMR = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    let filteredData = mrList;

    // Apply tab filter using mr.isActive
    if (activeTab === "Active MRs") {
      filteredData = filteredData.filter((mr) => mr.isActive === true);
    } else if (activeTab === "Inactive MRs") {
      filteredData = filteredData.filter((mr) => mr.isActive === false);
    }

    // Apply search filter
    return filteredData.filter((mr) => {
      const repMatch = mr.medicalRepName?.toLowerCase().includes(lowerSearch);
      const teamMatch = mr.teamName?.toLowerCase().includes(lowerSearch);
      const contactMatch = mr.contactNo?.toLowerCase().includes(lowerSearch);
      const emailMatch = mr.email?.toLowerCase().includes(lowerSearch);

      return repMatch || teamMatch || contactMatch || emailMatch;
    });
  }, [mrList, activeTab, searchTerm]);

  const teamSuggestions = useMemo(() => {
    if (!form.teamName) return [];
    return allTeams.filter((team) =>
      team.toLowerCase().includes(form.teamName.toLowerCase()),
    );
  }, [form.teamName, allTeams]);

  const totalPages = useMemo(
    () => Math.ceil(filteredMR.length / staffPerPage),
    [filteredMR.length, staffPerPage],
  );

  const currentMR = useMemo(() => {
    const startIndex = (currentPage - 1) * staffPerPage;
    return filteredMR.slice(startIndex, startIndex + staffPerPage);
  }, [filteredMR, currentPage, staffPerPage]);

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) return [...Array(totalPages).keys()].map((i) => i + 1);

    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2)
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];

    return [1, "...", currentPage, "...", totalPages];
  }, [currentPage, totalPages]);

  // Format currency function
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // MR Functions
  const toggleMRSelect = useCallback((mr) => {
    setSelected((prev) =>
      prev.some((c) => c.id === mr._id)
        ? prev.filter((c) => c.id !== mr._id)
        : [...prev, { id: mr._id, name: mr.medicalRepName }],
    );
  }, []);

  const toggleMRSelectAll = useCallback(
    (checked) => {
      setSelected(
        checked
          ? currentMR.map((mr) => ({
              id: mr._id,
              name: mr.medicalRepName,
              team: mr.teamName,
            }))
          : [],
      );
    },
    [currentMR],
  );

  // ✅ FIXED: Use mr.isActive
  const handleMRView = useCallback((mr) => {
    setForm({
      ...mr,
      isActive: mr.isActive,
      date: mr.date ? parseDateFromString(mr.date) : null,
    });
    setIsViewModalOpen(true);
  }, []);

  // ✅ FIXED: Use mr.isActive
  const handleMREdit = useCallback((mr) => {
    setForm({
      ...mr,
      isActive: mr.isActive,
      date: mr.date ? parseDateFromString(mr.date) : null,
    });
    setIsEditModalOpen(true);
  }, []);

  const refreshMRList = async () => {
    try {
      const mrData = await fetchWholeMRList();
      setMrList(mrData.data);
      setSelected([]);
    } catch (err) {
      console.error("Error refreshing MR list:", err);
    }
  };

  const handleMRDelete = async ({
    mrIds = [],
    mrName = "",
    isBulk = false,
  }) => {
    const confirm = await confirmDialog({
      title: "Delete",
      text: isBulk
        ? `Are you sure you want to delete <b>${mrIds.length}</b> MR(s)?`
        : `Are you sure you want to delete <b>${mrName}</b>?`,
      icon: "warning",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
    });

    if (!confirm.isConfirmed) {
      setSelected([]);
      return;
    }

    try {
      const endpoint = isBulk
        ? `${backendUrl}/api/staff`
        : `${backendUrl}/api/staff/${mrIds[0]}`;

      const config = isBulk ? { data: mrIds } : undefined;
      const res = await axios.delete(endpoint, config);

      if (res.status === 200) {
        const message = isBulk
          ? res.data.message
          : `MR <b>${mrName}</b> deleted successfully`;

        showToast("success", message);
        await refreshMRList();
        await fetchTeams();
      }
    } catch (err) {
      showToast(
        "error",
        err?.response?.data?.message || "Failed to delete MR.",
      );
    }
  };

  const deleteSelectedMR = async () => {
    const mrIds = selected.map((s) => s.id);
    await handleMRDelete({ mrIds, isBulk: true });
  };

  const deleteMR = async (mr) => {
    if (!mr?._id) return;
    await handleMRDelete({
      mrIds: [mr._id],
      mrName: mr.medicalRepName,
      isBulk: false,
    });
  };

  // ✅ FIXED: Status toggle updates mr.isActive (staff field)
  const handleStatusToggle = async (mr) => {
    try {
      const newStatus = !mr.isActive;

      const res = await axios.put(`${backendUrl}/api/staff/status/${mr._id}`, {
        isActive: newStatus,
      });

      if (res.status === 200) {
        setMrList((prev) =>
          prev.map((item) =>
            item._id === mr._id ? { ...item, isActive: newStatus } : item,
          ),
        );
        showToast(
          "success",
          `MR <b>${mr.medicalRepName}</b> ${
            newStatus ? "enabled" : "disabled"
          } successfully`,
        );
      }
    } catch (err) {
      console.error("Status toggle error:", err);
      showToast("error", "Failed to update MR status.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          defval: "",
        });

        let headerRowIndex = -1;
        let headersMap = {};

        // Find header row including PASSWORD
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const normalizedRow = row.map((cell) =>
            cell.toString().trim().toLowerCase(),
          );

          // Look for exact header names (case-insensitive)
          const hasRequiredHeaders =
            normalizedRow.some(
              (h) =>
                h.includes("mr name") ||
                h.includes("medicalrepname") ||
                h.includes("name"),
            ) &&
            normalizedRow.some(
              (h) => h.includes("team") && h.includes("name"),
            ) &&
            normalizedRow.some(
              (h) => h.includes("contact") || h.includes("phone"),
            ) &&
            normalizedRow.some((h) => h.includes("email")) &&
            (normalizedRow.some(
              (h) => h.includes("joining") && h.includes("date"),
            ) ||
              normalizedRow.some((h) => h.includes("instance"))) &&
            normalizedRow.some((h) => h.includes("password"));

          if (hasRequiredHeaders) {
            headerRowIndex = i;
            headersMap = normalizedRow.reduce((acc, header, index) => {
              acc[index] = header;
              return acc;
            }, {});
            break;
          }
        }

        if (headerRowIndex === -1) {
          showToast(
            "error",
            "Required headers missing! Please include: MR Name, Team Name, Contact No, Email, Joining Date, Password",
          );
          return;
        }

        const mappedData = rows
          .slice(headerRowIndex + 1)
          .map((row, rowIndex) => {
            const item = {};
            Object.entries(headersMap).forEach(([index, key]) => {
              item[key] = row[index] || "";
            });

            // Find joining date field (handle different column names)
            let joiningDateKey = "";
            if (
              item["joining date"] !== undefined &&
              item["joining date"] !== ""
            ) {
              joiningDateKey = "joining date";
            } else if (
              item["instance of joining date"] !== undefined &&
              item["instance of joining date"] !== ""
            ) {
              joiningDateKey = "instance of joining date";
            } else {
              // Try to find any column containing "date"
              const dateKey = Object.keys(item).find(
                (key) => key.toLowerCase().includes("date") && item[key],
              );
              if (dateKey) joiningDateKey = dateKey;
            }

            const rawDate = joiningDateKey ? item[joiningDateKey] : "";

            // Parse date - handle multiple formats
            let parsedDate = null;
            if (rawDate) {
              if (rawDate instanceof Date) {
                parsedDate = rawDate;
              } else if (typeof rawDate === "string") {
                // Try different date formats
                const dateStr = rawDate.toString().trim();

                // Format 1: YYYY-MM-DD
                if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                  parsedDate = new Date(dateStr);
                }
                // Format 2: MM/DD/YYYY
                else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
                  const [month, day, year] = dateStr.split("/");
                  parsedDate = new Date(
                    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
                  );
                }
                // Format 3: Excel serial number
                else if (!isNaN(dateStr) && dateStr > 0) {
                  // Excel dates are numbers where 1 = Jan 1, 1900
                  const excelDate = parseInt(dateStr);
                  const date = new Date((excelDate - 25569) * 86400 * 1000);
                  if (!isNaN(date.getTime())) {
                    parsedDate = date;
                  }
                }

                // If parsing failed, try native Date parsing
                if (!parsedDate || isNaN(parsedDate.getTime())) {
                  parsedDate = new Date(dateStr);
                }
              }
            }

            const result = {
              name: (item["mr name"] || item["medicalrepname"] || "")
                .toString()
                .trim(),
              teamName: (item["team name"] || "").toString().trim(),
              phone: (
                item["contact no"] ||
                item["phone"] ||
                item["contact"] ||
                ""
              )
                .toString()
                .trim(),
              email: (item["email"] || "").toString().trim().toLowerCase(),
              password: (item["password"] || "123456").toString().trim(),
              date:
                parsedDate && !isNaN(parsedDate.getTime())
                  ? parsedDate.toISOString().split("T")[0]
                  : new Date().toISOString().split("T")[0],
              isActive: true, // Default to active when importing
              rawDate: rawDate,
            };

            return result;
          })
          .filter(
            (entry) =>
              entry.name &&
              entry.name.trim() !== "" &&
              entry.teamName &&
              entry.teamName.trim() !== "",
          );

        setParsedData(mappedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        showToast("error", "Error parsing Excel file: " + error.message);
      }
    };

    reader.onerror = () => {
      showToast("error", "Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!parsedData.length) {
      return showToast("warning", "Please upload a valid file first");
    }
    setIsUploading(true);
    try {
      // Validate all required fields
      const validData = parsedData
        .map((item) => {
          return {
            medicalRepName: item.name || item["MR Name"] || item["mr name"],
            teamName: item.teamName || item["Team Name"] || item["team name"],
            contactNo:
              item.phone ||
              item.contactNo ||
              item["Contact No"] ||
              item["contact no"],
            email: item.email || item.Email,
            password: item.password || item.Password || "123456",
            date:
              item.date ||
              item.Date ||
              item["Joining Date"] ||
              item["joining date"],
            isActive: item.isActive !== undefined ? item.isActive : true, // Use isActive
          };
        })
        .filter(
          (item) =>
            item.medicalRepName &&
            item.medicalRepName.trim() !== "" &&
            item.teamName &&
            item.teamName.trim() !== "",
        );

      if (validData.length === 0) {
        showToast(
          "error",
          "No valid records found. Check that all required fields are filled.",
        );
        setIsUploading(false);
        return;
      }

      // Send as direct array (not wrapped in data property)
      const res = await axios.post(
        `${backendUrl}/api/staff/import`,
        validData, // Direct array
        {
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (res.data.success) {
        showToast(
          "success",
          res.data.message || `${validData.length} MRs imported successfully!`,
        );
        setShowImportModal(false);
        setParsedData([]);
        await refreshMRList();
        await fetchTeams();
      }
    } catch (err) {
      console.error("Import error:", err);

      let errorMessage = "Failed to import MRs.";

      if (err.response) {
        const data = err.response.data;

        if (data.duplicates) {
          // Handle duplicate errors
          const duplicateMessages = [];
          if (data.duplicates.names && data.duplicates.names.length > 0) {
            duplicateMessages.push(
              `Names: ${data.duplicates.names.join(", ")}`,
            );
          }
          if (data.duplicates.emails && data.duplicates.emails.length > 0) {
            duplicateMessages.push(
              `Emails: ${data.duplicates.emails.join(", ")}`,
            );
          }
          if (data.duplicates.contacts && data.duplicates.contacts.length > 0) {
            duplicateMessages.push(
              `Contacts: ${data.duplicates.contacts.join(", ")}`,
            );
          }

          errorMessage = `Duplicate entries found: ${duplicateMessages.join(
            "; ",
          )}`;
        } else if (data.message) {
          errorMessage = data.message;
        }
      } else if (err.request) {
        errorMessage =
          "No response from server. Please check network connection.";
      } else {
        errorMessage = err.message;
      }

      showToast("error", errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const updateMR = async (e) => {
    e.preventDefault();
    if (!form._id) return;

    try {
      const updatedData = {
        medicalRepName: form.medicalRepName,
        teamName: form.teamName,
        contactNo: form.contactNo,
        email: form.email,
        date: form.date ? new Date(form.date).toISOString() : null,
        isActive: form.isActive,
      };

      const res = await axios.put(
        `${backendUrl}/api/staff/${form._id}`,
        updatedData,
      );

      if (res.status === 200) {
        showToast("success", "MR updated successfully");
        setIsEditModalOpen(false);
        await refreshMRList();
        await fetchTeams();
      }
    } catch (err) {
      showToast("error", err.response?.data?.message || "Failed to update MR.");
    }
  };

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [teamSuggestions]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (name === "teamName") {
      setShowSuggestions(true);
    }
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || teamSuggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < teamSuggestions.length - 1 ? prev + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : teamSuggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0) {
          handleSelect(teamSuggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
      default:
        break;
    }
  };

  const handleSelect = (team) => {
    setForm((prev) => ({ ...prev, teamName: team }));
    setShowSuggestions(false);
  };

  // Search icon click handler
  const handleSearchIconClick = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.classList.add("highlight");
    setTimeout(
      () => searchInputRef.current?.classList.remove("highlight"),
      1000,
    );
  };

  // Dashboard Cards Component
  const DashboardCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {/* Total MRs Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Total MRs" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Total MRs")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total MRs</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">
              {dashboardStats.totalMRs}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              All medical representatives
            </p>
          </div>
          <div className="p-3 bg-blue-100 rounded-full">
            <Users className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Active MRs Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Active MRs" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Active MRs")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Active MRs</p>
            <p className="text-3xl font-bold text-green-600 mt-2">
              {dashboardStats.enabledMRs}
            </p>
            <p className="text-xs text-gray-500 mt-1">Currently working</p>
          </div>
          <div className="p-3 bg-green-100 rounded-full">
            <UserCheck className="w-6 h-6 text-green-600" />
          </div>
        </div>
      </div>

      {/* Inactive MRs Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Inactive MRs" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Inactive MRs")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Inactive MRs</p>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {dashboardStats.disabledMRs}
            </p>
            <p className="text-xs text-gray-500 mt-1">Not active</p>
          </div>
          <div className="p-3 bg-red-100 rounded-full">
            <UserX className="w-6 h-6 text-red-600" />
          </div>
        </div>
      </div>

      {/* Total Payroll Card */}
      <div
        className={`rounded-xl shadow-md border border-gray-200 p-6 cursor-pointer transition-all ${
          activeTab === "Total Payroll" ? "bg-gray-200" : "bg-white"
        }`}
        onClick={() => setActiveTab("Total Payroll")}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Total Payroll</p>
            <p className="text-3xl font-bold text-purple-600 mt-2">
              ${formatCurrency(totalPayroll)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{previousMonthLabel}</p>
          </div>
          <div className="p-3 bg-purple-100 rounded-full">
            <DollarSign className="w-6 h-6 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  );

  // Recent Activity Component
  const RecentActivity = () => {
    const recentMRs = useMemo(() => {
      return mrList
        .filter((mr) => mr.date)
        .sort((a, b) => {
          const dateA = parseDateFromString(a.date);
          const dateB = parseDateFromString(b.date);
          return dateB - dateA;
        })
        .slice(0, 5);
    }, [mrList]);

    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Recent Joins</h3>
          <Calendar className="w-5 h-5 text-gray-400" />
        </div>
        <div className="space-y-3">
          {recentMRs.length > 0 ? (
            recentMRs.map((mr, index) => (
              <div
                key={mr._id || index}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                    {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {mr.medicalRepName || "Unknown"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {mr.teamName || "No Team"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {mr.date ? formatDateToDDMMMYYYY(mr.date) : "No Date"}
                  </p>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs ${
                      mr.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {mr.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">No recent activity</p>
          )}
        </div>
      </div>
    );
  };

  // Payroll Table Component
  const PayrollTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-semibold text-gray-800">
            Payroll Details - {previousMonthLabel}
          </h3>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-4 text-sm font-semibold text-gray-700">
                MR Name
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Contact No
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">Email</th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Basic Salary ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Allowances ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Deductions ($)
              </th>
              <th className="p-4 text-sm font-semibold text-gray-700">
                Net Salary ($)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payrollData.map((item, index) => (
              <tr
                key={item._id || index}
                className="hover:bg-gray-50 transition-colors"
              >
                <td className="p-4 text-sm text-gray-600">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                      {item.employeeId?.medicalRepName
                        ? item.employeeId.medicalRepName
                            .substring(0, 2)
                            .toUpperCase()
                        : "MR"}
                    </div>
                    <span className="capitalize">
                      {item.employeeId?.medicalRepName || "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.contactNo || "N/A"}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.email || "N/A"}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-blue-700">
                    {item.basicSalary
                      ? formatCurrency(item.basicSalary)
                      : "0.00"}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-green-700">
                    {item.totalAllowance
                      ? formatCurrency(item.totalAllowance)
                      : "0.00"}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-red-700">
                    {item.deductions ? formatCurrency(item.deductions) : "0.00"}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-purple-700">
                    {item.netSalary ? formatCurrency(item.netSalary) : "0.00"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {payrollData.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {loading ? "Loading..." : "No payroll data found"}
          </div>
        )}
      </div>
    </div>
  );

  // DataTable Component
  const DataTable = ({
    data,
    columns,
    onEdit,
    onDelete,
    onAdd,
    onExport,
    selectable = false,
    showButtons = false,
    buttonMode = "all",
  }) => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-semibold text-gray-800">MR Management</h3>
          {showButtons && (
            <div className="flex gap-3">
              {buttonMode === "all" && (
                <>
                  <button
                    onClick={onExport}
                    className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <Download size={18} /> Export
                  </button>
                  {onAdd && (
                    <button
                      onClick={onAdd}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                    >
                      <UserPlus size={18} /> Add New
                    </button>
                  )}
                  <button
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                    onClick={() => setShowImportModal(true)}
                  >
                    <Upload size={18} /> Import MR
                  </button>
                </>
              )}

              {selected.length > 0 && (
                <button
                  onClick={deleteSelectedMR}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl shadow-md cursor-pointer"
                >
                  <Trash2 size={18} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && data.length > 0 && (
                <th className="p-4">
                  <input
                    type="checkbox"
                    checked={selected.length === data.length && data.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allSelected = data.map((item) => ({
                          id: item._id,
                          name: item.medicalRepName,
                        }));
                        setSelected(allSelected);
                      } else {
                        setSelected([]);
                      }
                    }}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="p-4 text-sm font-semibold text-gray-700"
                >
                  {column.title}
                </th>
              ))}
              <th className="p-4 text-sm font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr
                key={item._id || index}
                className="hover:bg-gray-50 transition-colors"
              >
                {selectable && data.length > 0 && (
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selected.some((s) => s.id === item._id)}
                      onChange={() => toggleMRSelect(item)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td key={column.key} className="p-4 text-sm text-gray-600">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
                <td className="p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMRView(item)}
                      className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50 cursor-pointer"
                      title="View"
                    >
                      <Eye size={18} />
                    </button>
                    <button
                      onClick={() => handleMREdit(item)}
                      className="text-blue-600 hover:text-blue-800 transition-colors p-1 rounded hover:bg-blue-50 cursor-pointer"
                      title="Edit"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deleteMR(item)}
                      className="text-red-600 hover:text-red-800 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            {loading ? "Loading..." : "No MR found"}
          </div>
        )}
      </div>
    </div>
  );

  // MRManagement Component
  const MRManagement = () => {
    const columns = [
      {
        key: "medicalRepName",
        title: "MR Name",
        render: (item) => (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
              {item.medicalRepName
                ? item.medicalRepName.substring(0, 2).toUpperCase()
                : "MR"}
            </div>
            <span className="capitalize">
              {item.medicalRepName || "Unknown"}
            </span>
          </div>
        ),
      },
      {
        key: "teamName",
        title: "Team",
        render: (item) => item.teamName || "No Team",
      },
      {
        key: "contactNo",
        title: "Contact No",
        render: (item) => item.contactNo || "N/A",
      },
      { key: "email", title: "Email", render: (item) => item.email || "N/A" },
      {
        key: "date",
        title: "Joining Date",
        render: (item) =>
          item.date ? formatDateToDDMMMYYYY(item.date) : "No Date",
      },
      {
        key: "status",
        title: "Status",
        render: (item) => (
          <button
            onClick={() => handleStatusToggle(item)}
            className={`px-3 py-1 rounded-full text-sm font-medium cursor-pointer transition-colors ${
              item.isActive
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-red-100 text-red-800 hover:bg-red-200"
            }`}
          >
            {item.isActive ? "Enabled" : "Disabled"}
          </button>
        ),
      },
    ];

    const getButtonMode = () => {
      if (activeTab === "Total MRs") return "all";
      if (activeTab === "Active MRs" || activeTab === "Inactive MRs")
        return "deleteOnly";
      return "none";
    };

    return (
      <div className="space-y-6">
        <DashboardCards />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <RecentActivity />
          </div>

          <div className="lg:col-span-2">
            {activeTab === "Total Payroll" ? (
              <PayrollTable />
            ) : (
              <>
                <DataTable
                  data={currentMR}
                  columns={columns}
                  onEdit={handleMREdit}
                  onDelete={deleteMR}
                  onAdd={() => navigate("/hrmlayout/dashboard/new")}
                  onExport={handleExport}
                  selectable={true}
                  showButtons={activeTab !== "Total Payroll"}
                  buttonMode={getButtonMode()}
                />

                {activeTab !== "Total Payroll" && filteredMR.length > 0 && (
                  <div className="mt-4 p-5 flex justify-start gap-2">
                    <button
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(prev - 1, 1))
                      }
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
                    >
                      Prev
                    </button>
                    {visiblePages.map((page, idx) =>
                      page === "..." ? (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-3 py-1 text-gray-500 select-none"
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
                      ),
                    )}
                    <button
                      onClick={() => {
                        setCurrentPage((prev) =>
                          Math.min(prev + 1, totalPages),
                        );
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="container">
        <div className="flex justify-between items-center bg-white shadow-sm border-b border-gray-200 mb-2 px-3 py-3">
          <div>
            <h2 className="text-2xl font-semibold text-gray-800">
              MR Management Dashboard
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative w-full md:w-72">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                size={16}
                onClick={handleSearchIconClick}
              />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search MR..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
              />
            </div>

            {/* User Info */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-semibold">
                {user.initials}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {user.name}
                </div>
                <div className="text-xs text-gray-600">{user.role}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <main className="p-6">
          <MRManagement />
        </main>
      </div>

      {/* View Modal */}
      {isViewModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
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
                View MR
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    MR Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.medicalRepName || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Team Name
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.teamName || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Contact No
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.contactNo || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Email
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.email || "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Joining Date
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100">
                    {form.date ? formatDateToDDMMMYYYY(form.date) : "--"}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <p className="border px-3 py-2 rounded-lg bg-gray-100 capitalize">
                    {form.isActive ? "Enabled" : "Disabled"}
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
          document.body,
        )}

      {/* Edit Modal */}
      {isEditModalOpen &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsEditModalOpen(false)}
            />
            <div className="bg-white w-full max-w-2xl p-6 rounded-xl shadow-lg relative max-h-screen overflow-y-auto">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <X size={20} />
              </button>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">
                Edit MR
              </h2>

              <form onSubmit={updateMR}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      MR Name
                    </label>
                    <input
                      type="text"
                      name="medicalRepName"
                      value={form.medicalRepName}
                      onChange={handleChange}
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Team Name
                    </label>
                    <input
                      type="text"
                      name="teamName"
                      value={form.teamName}
                      onChange={handleChange}
                      onKeyDown={handleKeyDown}
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      placeholder="Type or select a team"
                      autoComplete="off"
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => setShowSuggestions(false), 150)
                      }
                      required
                    />

                    {showSuggestions && teamSuggestions.length > 0 && (
                      <ul className="absolute z-10 bg-white border w-full max-h-40 overflow-y-auto mt-1 rounded shadow">
                        {teamSuggestions.map((team, index) => (
                          <li
                            key={index}
                            onMouseDown={() => handleSelect(team)}
                            className={`px-4 py-2 cursor-pointer ${
                              highlightedIndex === index
                                ? "bg-blue-100"
                                : "hover:bg-gray-100"
                            } ${
                              index !== teamSuggestions.length - 1
                                ? "border-b"
                                : ""
                            }`}
                          >
                            {team}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Contact No
                    </label>
                    <input
                      type="text"
                      name="contactNo"
                      value={form.contactNo}
                      onChange={handleChange}
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Email
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Joining Date
                    </label>
                    <DatePicker
                      selected={
                        form.date ? parseDateFromString(form.date) : null
                      }
                      onChange={(date) =>
                        date
                          ? setForm({ ...form, date: date.toISOString() })
                          : null
                      }
                      dateFormat="dd/MM/yyyy"
                      placeholderText="DD/MM/YYYY"
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600">
                      Status
                    </label>
                    <select
                      value={form.isActive}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          isActive: e.target.value === "true",
                        })
                      }
                      className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                    >
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {/* Import Modal */}
      {showImportModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 bg-transparent bg-opacity-40 flex justify-center items-center z-50">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowImportModal(false)}
            />
            <div className="bg-white w-full max-w-md p-6 rounded-xl shadow-lg relative">
              <button
                onClick={() => setShowImportModal(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 cursor-pointer"
                disabled={isUploading}
              >
                <X size={20} />
              </button>

              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                Import MR
              </h2>
              {isSampleFile && <SampleExcelDownloadStaff />}

              <div className="mb-6">
                <label className="block text-gray-700 mb-2">File</label>
                <input
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  className="block w-full border rounded-lg px-3 py-2 cursor-pointer"
                />
                {parsedData.length > 0 && (
                  <p className="text-sm text-green-600 mt-2">
                    Found {parsedData.length} records
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
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
                  type="button"
                  onClick={handleImport}
                  disabled={isUploading || parsedData.length === 0}
                  className={`px-5 py-2 rounded-lg cursor-pointer ${
                    isUploading || parsedData.length === 0
                      ? "bg-blue-400 text-white cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
                >
                  {isUploading ? "Uploading…" : `Upload (${parsedData.length})`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default Dashboard;
