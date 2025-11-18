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
import { fetchMRList, fetchHRMSalary } from "../../utils/customerUtil";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Function to format date as "MMM YYYY" (e.g., "Oct 2025")
const formatMonthYear = (date) => {
  return date.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
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

  // Payroll State - Changed from number to array

  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);

  // User State
  const [user, setUser] = useState({
    name: "",
    role: "",
    initials: "",
  });

  // Form State
  const [form, setForm] = useState({
    medicalRepName: "",
    teamName: "",
    contactNo: "",
    email: "",
    date: "",
    enabled: "",
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
        1
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
        }
      );

      if (!response.ok) {
        // Handle different error statuses
        if (response.status === 404) {
          throw new Error("No data found for the specified period");
        } else if (response.status === 400) {
          throw new Error("Invalid parameters");
        } else {
          throw new Error(`Export failed: ${response.statusText}`);
        }
      }

      // Check if response is Excel file - FIXED CONTENT TYPE CHECK
      const contentType = response.headers.get("content-type");
      const isExcelFile =
        contentType &&
        (contentType.includes("spreadsheet") ||
          contentType.includes("excel") ||
          contentType.includes(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          ));

      if (!isExcelFile) {
        // If not Excel, try to read as JSON error
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || "Invalid response format");
        } catch (jsonError) {
          throw new Error("Server returned an invalid response");
        }
      }

      // Get the filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `MR_Payroll_${year}_${month}.xlsx`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create blob and download
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
        error.message || "Failed to export data. Please try again."
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
        1
      );
      const year = previousMonth.getFullYear();
      const month = String(previousMonth.getMonth() + 1).padStart(2, "0");
      const period = `${year}-${month}`;

      const response = await axios.get(`${backendUrl}/api/payrolls`, {
        params: { period },
      });

      if (response.data && response.data.success) {
        setPayrollData(response.data.data || []);
      } else {
        setPayrollData([]);
      }
    } catch (error) {
      console.error("Error fetching payroll data:", error);
      setPayrollData([]);
      showToast("error", "Failed to fetch payroll data");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch user data
        await fetchUserData();
        // Fetch MR List
        const mrData = await fetchMRList();
        setMrList(mrData.data);

        // Calculate previous month label
        const currentDate = new Date();
        const previousMonthDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
        );
        const formattedPreviousMonth = formatMonthYear(previousMonthDate);
        setPreviousMonthLabel(formattedPreviousMonth);

        // Fetch Payroll Data
        const salaryData = await fetchHRMSalary();

        if (salaryData && salaryData.success && salaryData.data) {
          setTotalPayroll(salaryData.data.previousMonth);
        } else {
          // Set default value if no data
          setTotalPayroll(0);
        }

        await fetchTeams();
      } catch (err) {
        showToast("error", err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch user data
        await fetchUserData();
        // Fetch MR List
        const mrData = await fetchMRList();
        setMrList(mrData.data);

        // Calculate previous month label
        const currentDate = new Date();
        const previousMonthDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1
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

  // Calculate dashboard stats
  const dashboardStats = useMemo(() => {
    const totalMRs = mrList.length;
    const enabledMRs = mrList.filter((mr) => mr.enabled).length;
    const disabledMRs = mrList.filter((mr) => !mr.enabled).length;
    const totalTeams = [
      ...new Set(mrList.map((mr) => mr.teamName).filter(Boolean)),
    ].length;

    // Recent joins (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentJoins = mrList.filter((mr) => {
      const joinDate = new Date(mr.date);
      return joinDate >= thirtyDaysAgo;
    }).length;

    return {
      totalMRs,
      enabledMRs,
      disabledMRs,
      totalTeams,
      recentJoins,
    };
  }, [mrList, payrollData]);

  // Filter MR data based on active tab
  const filteredMR = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();

    let filteredData = mrList;

    // Apply tab filter
    if (activeTab === "Active MRs") {
      filteredData = filteredData.filter((mr) => mr.enabled === true);
    } else if (activeTab === "Inactive MRs") {
      filteredData = filteredData.filter((mr) => mr.enabled === false);
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
      team.toLowerCase().includes(form.teamName.toLowerCase())
    );
  }, [form.teamName, allTeams]);

  const totalPages = useMemo(
    () => Math.ceil(filteredMR.length / staffPerPage),
    [filteredMR.length, staffPerPage]
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
        : [...prev, { id: mr._id, name: mr.medicalRepName }]
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
          : []
      );
    },
    [currentMR]
  );

  const handleMRView = useCallback((mr) => {
    setForm(mr);
    setIsViewModalOpen(true);
  }, []);

  const handleMREdit = useCallback((mr) => {
    setForm(mr);
    setIsEditModalOpen(true);
  }, []);

  const refreshMRList = async () => {
    try {
      const mrData = await fetchMRList();
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
        ? `${backendUrl}/api/staffs`
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
        err?.response?.data?.message || "Failed to delete MR."
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

  // Status toggle function
  const handleStatusToggle = async (mr) => {
    try {
      const res = await axios.put(`${backendUrl}/api/staff/${mr._id}`, {
        enabled: !mr.enabled,
      });

      if (res.status === 200) {
        setMrList((prev) =>
          prev.map((item) =>
            item._id === mr._id ? { ...item, enabled: !item.enabled } : item
          )
        );
        showToast(
          "success",
          `MR <b>${mr.medicalRepName}</b> ${
            !mr.enabled ? "enabled" : "disabled"
          } successfully`
        );
      }
    } catch (err) {
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

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const normalizedRow = row.map((cell) =>
            cell.toString().trim().toLowerCase()
          );

          if (
            normalizedRow.includes("mr name") &&
            normalizedRow.includes("team name") &&
            normalizedRow.includes("contact no") &&
            normalizedRow.includes("email") &&
            (normalizedRow.includes("joining date") ||
              normalizedRow.includes("instance of joining date"))
          ) {
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
            "Required headers not found in Excel file. Please ensure columns: MR Name, Team Name, Contact No, Email, Joining Date"
          );
          return;
        }

        const mappedData = rows
          .slice(headerRowIndex + 1)
          .map((row) => {
            const item = {};
            Object.entries(headersMap).forEach(([index, key]) => {
              item[key] = row[index] || "";
            });

            const joiningDateKey =
              item["joining date"] !== undefined
                ? "joining date"
                : "instance of joining date";
            const rawDate = item[joiningDateKey];
            const parsedDate = rawDate ? new Date(rawDate) : null;

            return {
              medicalRepName: item["mr name"],
              teamName: item["team name"],
              contactNo: item["contact no"],
              email: item["email"],
              date: parsedDate ? parsedDate.toISOString() : null,
            };
          })
          .filter(
            (entry) =>
              entry.medicalRepName ||
              entry.teamName ||
              entry.contactNo ||
              entry.email
          );
        setParsedData(mappedData);
      } catch (error) {
        console.error("Error parsing file:", error);
        showToast("error", "Error parsing Excel file");
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
      const res = await axios.post(
        `${backendUrl}/api/staffs/import`,
        parsedData
      );

      if (res.status === 200) {
        showToast("success", res.data.message || "MR imported successfully!");
        setShowImportModal(false);
        setParsedData([]);
        await refreshMRList();
        await fetchTeams();
      }
    } catch (err) {
      const cleanMessage =
        err?.response?.data?.message?.replace(/<[^>]+>/g, "") ||
        "Failed to import MR.";
      showToast("error", cleanMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const updateMR = async (e) => {
    e.preventDefault();
    if (!form._id) return;

    try {
      const res = await axios.put(`${backendUrl}/api/staff/${form._id}`, form);

      if (res.status === 200) {
        showToast("success", "MR updated successfully");
        setIsEditModalOpen(false);
        await refreshMRList();
        await fetchTeams();
      }
    } catch (err) {
      showToast("error", "Failed to update MR.");
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
          prev < teamSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : teamSuggestions.length - 1
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
      1000
    );
  };

  // Dashboard Cards Component - Now clickable
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
        .sort((a, b) => new Date(b.date) - new Date(a.date))
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
                key={mr._id}
                className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                    {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 capitalize">
                      {mr.medicalRepName}
                    </p>
                    <p className="text-xs text-gray-500">{mr.teamName}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">
                    {formatDateToReadable(mr.date)}
                  </p>
                  <span
                    className={`inline-block px-2 py-1 rounded-full text-xs ${
                      mr.enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {mr.enabled ? "Active" : "Inactive"}
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

  // Payroll Table Component - Updated to use actual payroll data

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
              <tr key={item._id} className="hover:bg-gray-50 transition-colors">
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
                      {item.employeeId?.medicalRepName}
                    </span>
                  </div>
                </td>

                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.contactNo}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.employeeId?.email}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-blue-700">
                    {item.basicSalary || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-green-700">
                    {item.totalAllowance || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-red-700">
                    {item.deductions || 0}
                  </span>
                </td>
                <td className="p-4 text-sm text-gray-600">
                  <span className="font-semibold text-purple-700">
                    {item.netSalary || 0}
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
  const DataTable = ({
    data,
    columns,
    onEdit,
    onDelete,
    onAdd,
    onExport,
    selectable = false,
    showButtons = false,
    buttonMode = "all", // "all" or "deleteOnly"
  }) => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="text-xl font-semibold text-gray-800">MR Management</h3>
          {showButtons && (
            <div className="flex gap-3">
              {/* Show Export, Add New, Import only in "all" mode (Total MRs tab) */}
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

              {/* Show delete button when there are selected items - Available in all modes */}
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
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {/* Only show checkbox column header if there's data AND it's selectable */}
              {selectable && data.length > 0 && (
                <th className="p-4 text-left">
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
                  className="p-4 text-left text-sm font-semibold text-gray-700"
                >
                  {column.title}
                </th>
              ))}
              <th className="p-4 text-left text-sm font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                {/* Only show checkbox cell if there's data AND it's selectable */}
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
            <span className="capitalize">{item.medicalRepName}</span>
          </div>
        ),
      },
      { key: "teamName", title: "Team" },
      { key: "contactNo", title: "Contact No" },
      { key: "email", title: "Email" },
      {
        key: "date",
        title: "Joining Date",
        render: (item) => formatDateToReadable(item.date),
      },
      {
        key: "enabled",
        title: "Status",
        render: (item) => (
          <button
            onClick={() => handleStatusToggle(item)}
            className={`px-3 py-1 rounded-full text-sm font-medium cursor-pointer transition-colors ${
              item.enabled
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-red-100 text-red-800 hover:bg-red-200"
            }`}
          >
            {item.enabled ? "Enabled" : "Disabled"}
          </button>
        ),
      },
    ];

    // Determine button mode based on active tab
    const getButtonMode = () => {
      if (activeTab === "Total MRs") return "all";
      if (activeTab === "Active MRs" || activeTab === "Inactive MRs")
        return "deleteOnly";
      return "none";
    };

    return (
      <div className="space-y-6">
        {/* Dashboard Cards */}
        <DashboardCards />

        {/* Recent Activity and Stats Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <div className="lg:col-span-1">
            <RecentActivity />
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Conditionally render MR Table or Payroll Table */}
            {activeTab === "Total Payroll" ? (
              <PayrollTable />
            ) : (
              <DataTable
                data={currentMR}
                columns={columns}
                onEdit={handleMREdit}
                onDelete={deleteMR}
                onAdd={() => navigate("/hrmlayout/dashboard/new")}
                onExport={handleExport}
                selectable={true}
                // Show buttons for all MR tabs (Total MRs, Active MRs, Inactive MRs)
                showButtons={activeTab !== "Total Payroll"}
                // Control which buttons to show based on tab
                buttonMode={getButtonMode()}
              />
            )}

            {/* Pagination - Only show for MR tables, not payroll */}
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

      {/* Rest of your modals remain the same */}
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
                    {form.date ? formatDateToReadable(form.date) : "--"}
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
                    onBlur={() =>
                      setTimeout(() => setShowSuggestions(false), 150)
                    }
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
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Joining Date
                  </label>
                  <DatePicker
                    selected={form.date ? new Date(form.date) : null}
                    onChange={(date) =>
                      date
                        ? setForm({ ...form, date: date.toISOString() })
                        : null
                    }
                    dateFormat="yyyy-MM-dd"
                    placeholderText="Select a date"
                    className="w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600">
                    Status
                  </label>
                  <select
                    value={form.enabled}
                    onChange={(e) =>
                      setForm({ ...form, enabled: e.target.value === "true" })
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
                  onClick={() => setIsEditModalOpen(false)}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-5 py-2 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={updateMR}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg cursor-pointer"
                >
                  Update
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

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
          document.body
        )}
    </div>
  );
};

export default Dashboard;
