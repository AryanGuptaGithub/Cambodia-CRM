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
  Calendar,
  DollarSign,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../../utils/toast";
import { confirmDialog } from "../../utils/confirmationDialog";
import axios from "axios";
import * as XLSX from "xlsx";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import ReactDOM from "react-dom";
import { fetchWholeMRList } from "../../utils/customerUtil";
import SampleExcelDownloadStaff from "../../excels/SampleExcelDownloadStaff";
import { parseExcelDate } from "../../utils/excelUtility";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
const isSampleFile = import.meta.env.VITE_IS_SAMPLE_FILE === "true";

const formatMonthYear = (date) =>
  date.toLocaleString("en-US", { month: "short", year: "numeric" });

const formatDateToDDMMMYYYY = (dateString) => {
  if (!dateString) return "";
  try {
    let date;
    if (dateString instanceof Date) {
      date = dateString;
    } else if (typeof dateString === "string") {
      const m = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      date = m
        ? new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
        : new Date(dateString);
    } else {
      date = new Date(dateString);
    }
    if (isNaN(date.getTime())) return dateString || "--";
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
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  } catch {
    return dateString || "--";
  }
};

const parseDateFromString = (dateString) => {
  if (!dateString) return null;
  try {
    if (dateString instanceof Date) return dateString;
    if (typeof dateString === "number") return parseExcelDate(dateString);
    const s = dateString.toString().trim();
    const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m1)
      return new Date(parseInt(m1[3]), parseInt(m1[2]) - 1, parseInt(m1[1]));
    const m2 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (m2)
      return new Date(parseInt(m2[1]), parseInt(m2[2]) - 1, parseInt(m2[3]));
    const p = new Date(s);
    return isNaN(p.getTime()) ? null : p;
  } catch {
    return null;
  }
};

// AttendanceCalendarModal Component
const AttendanceCalendarModal = ({ mr, onClose }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  useEffect(() => {
    const fetchAll = async () => {
      setLoadingData(true);
      try {
        const [attRes, leaveRes, holRes] = await Promise.all([
          axios.get(`${backendUrl}/api/hrm/leaves/attendance`),
          axios.get(`${backendUrl}/api/hrm/leaves`),
          axios.get(`${backendUrl}/api/hrm/holidays`),
        ]);

        setAttendanceRecords(
          (attRes.data || []).filter((r) => r.userId === mr._id),
        );

        setLeaves(
          (leaveRes.data || []).filter(
            (l) => l.userId === mr._id && l.status === "approved",
          ),
        );

        const raw = holRes.data?.holidays || holRes.data || [];
        const flat = [];
        raw.forEach((h) => {
          const start = new Date(h.startDate || h.date);
          const end = new Date(h.endDate || h.date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            flat.push({ ...h, date: new Date(d) });
          }
        });
        setHolidays(flat);
      } catch (err) {
        console.error("Calendar fetch error:", err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchAll();
  }, [mr._id]);

  const isSunday = (d) => d.getDay() === 0;
  const isHoliday = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return holidays.some((h) => {
      const hd = new Date(h.date);
      hd.setHours(0, 0, 0, 0);
      return hd.getTime() === t.getTime();
    });
  };
  const getHolidayName = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    const h = holidays.find((h) => {
      const hd = new Date(h.date);
      hd.setHours(0, 0, 0, 0);
      return hd.getTime() === t.getTime();
    });
    return h?.name || null;
  };

  const getAttendance = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return (
      attendanceRecords.find((r) => {
        const rd = new Date(r.loginTime);
        rd.setHours(0, 0, 0, 0);
        return rd.getTime() === t.getTime();
      }) || null
    );
  };

  const getLeaveInfo = (d) => {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    for (const l of leaves) {
      const ld = new Date(l.leaveDate);
      ld.setHours(0, 0, 0, 0);
      if (ld.getTime() === t.getTime())
        return { isLeave: true, type: l.leaveType };
    }
    const att = getAttendance(d);
    if (att?.isLeaveDay) return { isLeave: true, type: "swapleave" };
    return { isLeave: false, type: null };
  };

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const getCellStyle = (date) => {
    if (!date) return { cls: "", title: "", text: "" };
    const attendance = getAttendance(date);
    const leaveInfo = getLeaveInfo(date);
    const isSun = isSunday(date);
    const isHol = isHoliday(date);
    const isToday = date.toDateString() === new Date().toDateString();

    if (attendance && !attendance.isLeaveDay) {
      return {
        cls: "bg-green-500 text-white border-2 border-green-600 cursor-default",
        title: "Present",
      };
    }
    if (leaveInfo.isLeave) {
      if (leaveInfo.type === "swapleave")
        return {
          cls: "bg-purple-500 text-white border-2 border-purple-600 cursor-default",
          title: "Leave Swap",
        };
      if (leaveInfo.type === "paid")
        return {
          cls: "bg-blue-500 text-white border-2 border-blue-600 cursor-default",
          title: "Paid Leave",
        };
      return {
        cls: "bg-red-500 text-white border-2 border-red-600 cursor-default",
        title: "Unpaid Leave",
      };
    }
    if (isSun)
      return {
        cls: "bg-red-400 text-white border-2 border-red-500 cursor-default",
        title: "Sunday",
      };
    if (isHol)
      return {
        cls: "bg-gray-400 text-white border-2 border-gray-500 cursor-default",
        title: `Holiday: ${getHolidayName(date)}`,
      };
    if (isToday)
      return {
        cls: "border-2 border-blue-500 bg-blue-50 text-blue-700 cursor-default",
        title: "Today",
      };
    return {
      cls: "border-2 border-gray-200 bg-gray-50 text-gray-500 cursor-default",
      title: "Working Day",
    };
  };

  const presentCount = cells.filter((d) => {
    if (!d || d.getMonth() !== month) return false;
    const att = getAttendance(d);
    return att && !att.isLeaveDay;
  }).length;
  const absentCount = cells.filter((d) => {
    if (!d || d.getMonth() !== month) return false;
    const li = getLeaveInfo(d);
    return li.isLeave;
  }).length;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 flex justify-center items-center z-[60]">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl relative mx-4 overflow-hidden">
        <div className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold text-sm">
              {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
            </div>
            <div>
              <p className="font-semibold capitalize">{mr.medicalRepName}</p>
              <p className="text-xs text-indigo-200">
                {mr.teamName || "No Team"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <span className="bg-green-500/30 text-white px-2 py-0.5 rounded-full font-medium">
                {presentCount} Present
              </span>
              <span className="bg-red-400/30 text-white px-2 py-0.5 rounded-full font-medium">
                {absentCount} Leave
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <span className="font-semibold text-gray-800">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        <div className="p-4">
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 mb-2">
                {dayNames.map((d) => (
                  <div
                    key={d}
                    className={`text-center text-xs font-semibold py-2 ${d === "Sun" ? "text-red-600" : "text-gray-600"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((date, idx) => {
                  if (!date) return <div key={`e-${idx}`} className="h-10" />;
                  const { cls, title } = getCellStyle(date);
                  return (
                    <div
                      key={date.toISOString()}
                      title={title}
                      className={`h-10 flex items-center justify-center rounded-lg text-sm font-medium transition-all select-none ${cls}`}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100">
                {[
                  ["bg-green-500 border-green-600", "Present"],
                  ["bg-purple-500 border-purple-600", "Leave Swap"],
                  ["bg-blue-500 border-blue-600", "Paid Leave"],
                  ["bg-red-500 border-red-600", "Unpaid Leave"],
                  ["bg-red-400 border-red-500", "Sunday"],
                  ["bg-gray-400 border-gray-500", "Holiday"],
                  ["bg-blue-50 border-blue-500", "Today"],
                ].map(([cls, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3.5 h-3.5 rounded border-2 ${cls}`} />
                    <span className="text-xs text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef(null);

  const [mrList, setMrList] = useState([]);
  const [allTeams, setAllTeams] = useState([]);
  const [parsedData, setParsedData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const staffPerPage = 5;
  const [activeTab, setActiveTab] = useState("Active MRs");

  const [previousMonthLabel, setPreviousMonthLabel] = useState("");
  const [payrollData, setPayrollData] = useState([]);
  const [totalPayroll, setTotalPayroll] = useState(0);

  const [user, setUser] = useState({ name: "", role: "", initials: "" });
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

  // Attendance state
  const [attendanceMap, setAttendanceMap] = useState({});
  const [calendarMR, setCalendarMR] = useState(null);

  // Dynamic attendance date (yesterday)
  const ATTENDANCE_DATE = new Date();
  ATTENDANCE_DATE.setDate(ATTENDANCE_DATE.getDate() - 1);
  const ATT_KEY_PREFIX = `${ATTENDANCE_DATE.getFullYear()}_${String(ATTENDANCE_DATE.getMonth() + 1).padStart(2, "0")}_${String(ATTENDANCE_DATE.getDate()).padStart(2, "0")}`;
  const getAttendanceKey = useCallback(
    (mrId) => `${mrId}_${ATT_KEY_PREFIX}`,
    [ATT_KEY_PREFIX],
  );

  const fetchYesterdayAttendance = async () => {
    try {
      const yesterdayStr = ATTENDANCE_DATE.toISOString().split("T")[0];
      const response = await axios.get(
        `${backendUrl}/api/hrm/leaves/attendance`,
        { params: { date: yesterdayStr } },
      );

      const attendanceData = {};

      if (response.data?.success && Array.isArray(response.data.data)) {
        response.data.data.forEach((record) => {
          const key = getAttendanceKey(record.userId);
          const recordDate = new Date(record.loginTime || record.date);
          const recordDateStr = recordDate.toISOString().split("T")[0];
          if (recordDateStr === yesterdayStr) {
            attendanceData[key] = record.isLeaveDay ? "absent" : "present";
          }
        });
      } else if (Array.isArray(response.data)) {
        response.data.forEach((record) => {
          const key = getAttendanceKey(record.userId);
          const recordDate = new Date(record.loginTime || record.date);
          const recordDateStr = recordDate.toISOString().split("T")[0];
          if (recordDateStr === yesterdayStr) {
            attendanceData[key] = record.isLeaveDay ? "absent" : "present";
          }
        });
      }

      setAttendanceMap(attendanceData);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    }
  };

  const handleExport = async () => {
    try {
      const currentDate = new Date();
      const previousMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        1,
      );
      const year = previousMonth.getFullYear();
      const month = previousMonth.getMonth() + 1;
      const res = await fetch(
        `${backendUrl}/api/export-mr-data?year=${year}&month=${month}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);
      const cd = res.headers.get("Content-Disposition");
      let filename = `MR_Payroll_${year}_${month}.xlsx`;
      if (cd) {
        const m = cd.match(/filename="(.+)"/);
        if (m) filename = m[1];
      }
      const blob = await res.blob();
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
      showToast("error", error.message || "Failed to export data.");
    }
  };

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
      const res = await axios.get(`${backendUrl}/api/hrm/payroll`, {
        params: { period: `${year}-${month}` },
      });
      if (res.data?.success) {
        setPayrollData(res.data.data || []);
        setTotalPayroll(
          (res.data.data || []).reduce((s, i) => s + (i.netSalary || 0), 0),
        );
      } else {
        setPayrollData([]);
        setTotalPayroll(0);
      }
    } catch {
      setPayrollData([]);
      setTotalPayroll(0);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await fetchUserData();
        const mrData = await fetchWholeMRList();
        setMrList(mrData.data);
        const currentDate = new Date();
        const previousMonthDate = new Date(
          currentDate.getFullYear(),
          currentDate.getMonth() - 1,
          1,
        );
        setPreviousMonthLabel(formatMonthYear(previousMonthDate));
        await fetchPayrollData();
        await fetchTeams();
        await fetchYesterdayAttendance();
      } catch (err) {
        showToast("error", err.message || "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const fetchUserData = async () => {
    try {
      const token = localStorage.getItem("token");
      const storedUsername = localStorage.getItem("username");
      if (!token) throw new Error("No authentication token found");
      const payload = JSON.parse(atob(token.split(".")[1]));
      const userRole = payload.role || "User";
      const username =
        storedUsername || `User-${payload.username || "Unknown"}`;
      const getInitials = (name) => {
        if (!name) return "U";
        const words = name.trim().split(/\s+/);
        return words.length === 1
          ? words[0].substring(0, 2).toUpperCase()
          : (words[0][0] + words[words.length - 1][0]).toUpperCase();
      };
      setUser({
        name: username,
        role: userRole,
        initials: getInitials(username),
      });
    } catch {
      setUser({ name: "User", role: "User", initials: "U" });
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

  const activeMRs = useMemo(
    () => mrList.filter((mr) => mr.isActive === true),
    [mrList],
  );

  const dashboardStats = useMemo(
    () => ({
      totalMRs: mrList.length,
      enabledMRs: mrList.filter((mr) => mr.isActive).length,
      disabledMRs: mrList.filter((mr) => !mr.isActive).length,
      totalTeams: [...new Set(mrList.map((mr) => mr.teamName).filter(Boolean))]
        .length,
    }),
    [mrList],
  );

  const filteredMR = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    const base =
      activeTab === "Inactive MRs"
        ? mrList.filter((mr) => !mr.isActive)
        : activeTab === "Total MRs"
          ? mrList
          : mrList.filter((mr) => mr.isActive);
    return base.filter(
      (mr) =>
        !lower ||
        mr.medicalRepName?.toLowerCase().includes(lower) ||
        mr.teamName?.toLowerCase().includes(lower) ||
        mr.contactNo?.toLowerCase().includes(lower) ||
        mr.email?.toLowerCase().includes(lower),
    );
  }, [mrList, activeTab, searchTerm]);

  const teamSuggestions = useMemo(() => {
    if (!form.teamName) return [];
    return allTeams.filter((t) =>
      t.toLowerCase().includes(form.teamName.toLowerCase()),
    );
  }, [form.teamName, allTeams]);

  const totalPages = useMemo(
    () => Math.ceil(filteredMR.length / staffPerPage),
    [filteredMR.length],
  );
  const currentMR = useMemo(() => {
    const start = (currentPage - 1) * staffPerPage;
    return filteredMR.slice(start, start + staffPerPage);
  }, [filteredMR, currentPage]);

  const visiblePages = useMemo(() => {
    if (totalPages <= 5) return [...Array(totalPages).keys()].map((i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, "...", totalPages];
    if (currentPage >= totalPages - 2)
      return [1, "...", totalPages - 2, totalPages - 1, totalPages];
    return [1, "...", currentPage, "...", totalPages];
  }, [currentPage, totalPages]);

  const formatCurrency = (amount) =>
    new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);

  const toggleMRSelect = useCallback((mr) => {
    setSelected((prev) =>
      prev.some((c) => c.id === mr._id)
        ? prev.filter((c) => c.id !== mr._id)
        : [...prev, { id: mr._id, name: mr.medicalRepName }],
    );
  }, []);

  const handleMRView = useCallback((mr) => {
    setForm({
      ...mr,
      isActive: mr.isActive,
      date: mr.date ? parseDateFromString(mr.date) : null,
    });
    setIsViewModalOpen(true);
  }, []);

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
      const d = await fetchWholeMRList();
      setMrList(d.data);
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
        showToast(
          "success",
          isBulk
            ? res.data.message
            : `MR <b>${mrName}</b> deleted successfully`,
        );
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

  const deleteSelectedMR = async () =>
    await handleMRDelete({ mrIds: selected.map((s) => s.id), isBulk: true });
  const deleteMR = async (mr) => {
    if (!mr?._id) return;
    await handleMRDelete({
      mrIds: [mr._id],
      mrName: mr.medicalRepName,
      isBulk: false,
    });
  };

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
          `MR <b>${mr.medicalRepName}</b> ${newStatus ? "enabled" : "disabled"} successfully`,
        );
      }
    } catch {
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
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        let headerRowIndex = -1,
          headersMap = {};
        for (let i = 0; i < rows.length; i++) {
          const nr = rows[i].map((c) => c.toString().trim().toLowerCase());
          const ok =
            nr.some(
              (h) =>
                h.includes("mr name") ||
                h.includes("medicalrepname") ||
                h.includes("name"),
            ) &&
            nr.some((h) => h.includes("team") && h.includes("name")) &&
            nr.some((h) => h.includes("contact") || h.includes("phone")) &&
            nr.some((h) => h.includes("email")) &&
            (nr.some((h) => h.includes("joining") && h.includes("date")) ||
              nr.some((h) => h.includes("instance"))) &&
            nr.some((h) => h.includes("password"));
          if (ok) {
            headerRowIndex = i;
            headersMap = nr.reduce((a, h, idx) => {
              a[idx] = h;
              return a;
            }, {});
            break;
          }
        }
        if (headerRowIndex === -1) {
          showToast("error", "Required headers missing!");
          return;
        }

        const mappedData = rows
          .slice(headerRowIndex + 1)
          .map((row) => {
            const item = {};
            Object.entries(headersMap).forEach(([idx, key]) => {
              item[key] = row[idx] || "";
            });
            let jdk =
              item["joining date"] !== undefined && item["joining date"] !== ""
                ? "joining date"
                : item["instance of joining date"] !== undefined &&
                    item["instance of joining date"] !== ""
                  ? "instance of joining date"
                  : Object.keys(item).find(
                      (k) => k.toLowerCase().includes("date") && item[k],
                    ) || "";
            const rawDate = jdk ? item[jdk] : "";
            let parsedDate = null;
            if (rawDate) {
              if (rawDate instanceof Date) parsedDate = rawDate;
              else if (typeof rawDate === "string") {
                const ds = rawDate.toString().trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(ds)) parsedDate = new Date(ds);
                else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(ds)) {
                  const [m, d, y] = ds.split("/");
                  parsedDate = new Date(
                    `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`,
                  );
                } else if (!isNaN(ds) && ds > 0) {
                  const dd = new Date((parseInt(ds) - 25569) * 86400 * 1000);
                  if (!isNaN(dd.getTime())) parsedDate = dd;
                }
                if (!parsedDate || isNaN(parsedDate.getTime()))
                  parsedDate = new Date(ds);
              }
            }
            return {
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
              isActive: true,
            };
          })
          .filter((e) => e.name?.trim() && e.teamName?.trim());

        setParsedData(mappedData);
      } catch (error) {
        showToast("error", "Error parsing Excel file: " + error.message);
      }
    };
    reader.onerror = () => showToast("error", "Error reading file");
    reader.readAsArrayBuffer(file);
  };

  const handleImport = async () => {
    if (!parsedData.length)
      return showToast("warning", "Please upload a valid file first");
    setIsUploading(true);
    try {
      const validData = parsedData
        .map((item) => ({
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
          isActive: item.isActive !== undefined ? item.isActive : true,
        }))
        .filter((item) => item.medicalRepName?.trim() && item.teamName?.trim());

      if (!validData.length) {
        showToast("error", "No valid records found.");
        setIsUploading(false);
        return;
      }
      const res = await axios.post(
        `${backendUrl}/api/staff/import`,
        validData,
        { headers: { "Content-Type": "application/json" } },
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
      let msg = "Failed to import MRs.";
      if (err.response?.data?.duplicates) {
        const d = err.response.data.duplicates;
        const msgs = [];
        if (d.names?.length) msgs.push(`Names: ${d.names.join(", ")}`);
        if (d.emails?.length) msgs.push(`Emails: ${d.emails.join(", ")}`);
        if (d.contacts?.length) msgs.push(`Contacts: ${d.contacts.join(", ")}`);
        msg = `Duplicate entries found: ${msgs.join("; ")}`;
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      showToast("error", msg);
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
    if (name === "teamName") setShowSuggestions(true);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || !teamSuggestions.length) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((p) =>
          p < teamSuggestions.length - 1 ? p + 1 : 0,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((p) =>
          p > 0 ? p - 1 : teamSuggestions.length - 1,
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0)
          handleSelect(teamSuggestions[highlightedIndex]);
        break;
      case "Escape":
        setShowSuggestions(false);
        break;
    }
  };

  const handleSelect = (team) => {
    setForm((prev) => ({ ...prev, teamName: team }));
    setShowSuggestions(false);
  };

  const handleSearchIconClick = () => {
    searchInputRef.current?.focus();
    searchInputRef.current?.classList.add("highlight");
    setTimeout(
      () => searchInputRef.current?.classList.remove("highlight"),
      1000,
    );
  };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const formattedDate = yesterday.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Dashboard Cards Component
  const DashboardCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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

  // Attendance Panel Component
  const AttendancePanel = () => {
    const presentCount = activeMRs.filter((mr) => {
      const key = getAttendanceKey(mr._id);
      return attendanceMap[key] === "present";
    }).length;

    const absentCount = activeMRs.filter((mr) => {
      const key = getAttendanceKey(mr._id);
      return attendanceMap[key] === "absent";
    }).length;

    const notMarkedCount = activeMRs.length - presentCount - absentCount;

    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                Attendance - {formattedDate}
              </h3>
            </div>
            {activeMRs.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold text-green-600">
                      {presentCount}
                    </span>{" "}
                    Present
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold text-red-500">
                      {notMarkedCount}
                    </span>{" "}
                    Absent
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                  <span className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-500">
                      {notMarkedCount}
                    </span>{" "}
                    Not Marked
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
          {activeMRs.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">
              No active MRs
            </p>
          ) : (
            activeMRs.map((mr) => {
              const key = getAttendanceKey(mr._id);
              const status = attendanceMap[key];
              return (
                <div
                  key={mr._id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                      {mr.medicalRepName?.substring(0, 2).toUpperCase() || "MR"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 capitalize truncate">
                        {mr.medicalRepName}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {mr.teamName || "No Team"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {status === "present" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Present
                      </span>
                    )}
                    {status === "absent" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Absent
                      </span>
                    )}
                    {!status && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Not Marked
                      </span>
                    )}

                    <button
                      onClick={() => setCalendarMR(mr)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                      title="View attendance calendar"
                    >
                      <Calendar size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Payroll Table Component
  const PayrollTable = () => (
    <div className="bg-white rounded-xl shadow-md border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-xl font-semibold text-gray-800">
          Payroll Details - {previousMonthLabel}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {[
                "MR Name",
                "Contact No",
                "Email",
                "Basic Salary ($)",
                "Allowances ($)",
                "Deductions ($)",
                "Net Salary ($)",
              ].map((h) => (
                <th
                  key={h}
                  className="p-4 text-sm font-semibold text-gray-700 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payrollData.map((item, index) => (
              <tr key={item._id || index} className="hover:bg-gray-50">
                <td className="p-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                      {item.employeeId?.medicalRepName
                        ?.substring(0, 2)
                        .toUpperCase() || "MR"}
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
                <td className="p-4 text-sm font-semibold text-blue-700">
                  {formatCurrency(item.basicSalary || 0)}
                </td>
                <td className="p-4 text-sm font-semibold text-green-700">
                  {formatCurrency(item.totalAllowance || 0)}
                </td>
                <td className="p-4 text-sm font-semibold text-red-700">
                  {formatCurrency(item.deductions || 0)}
                </td>
                <td className="p-4 text-sm font-semibold text-purple-700">
                  {formatCurrency(item.netSalary || 0)}
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
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                    onClick={() => setShowImportModal(true)}
                  >
                    <Upload size={18} /> Import MR
                  </button>
                </>
              )}
              {selected.length > 0 && (
                <button
                  onClick={deleteSelectedMR}
                  className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Trash2 size={18} /> Delete ({selected.length})
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
              {[
                "MR Name",
                "Team",
                "Contact No",
                "Email",
                "Joining Date",
                "Status",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="p-4 text-sm font-semibold text-gray-700 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((item, index) => (
              <tr
                key={item._id || index}
                className="hover:bg-gray-50 transition-colors"
              >
                {selectable && (
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selected.some((s) => s.id === item._id)}
                      onChange={() => toggleMRSelect(item)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                )}
                <td className="p-4 text-sm text-gray-700">
                  <div className="flex items-center gap-3 justify-start">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-sm font-semibold">
                      {item.medicalRepName?.substring(0, 2).toUpperCase() ||
                        "MR"}
                    </div>
                    <span className="capitalize">
                      {item.medicalRepName || "Unknown"}
                    </span>
                  </div>
                </td>
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                  {item.teamName || "No Team"}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.contactNo || "N/A"}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {item.email || "N/A"}
                </td>
                <td className="p-4 text-sm text-gray-600 whitespace-nowrap">
                  {item.date ? formatDateToDDMMMYYYY(item.date) : "No Date"}
                </td>
                <td className="p-4">
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
                </td>
                <td className="p-4">
                  <div className="flex gap-2 justify-center">
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
    const getButtonMode = () =>
      activeTab === "Total MRs"
        ? "all"
        : activeTab === "Active MRs" || activeTab === "Inactive MRs"
          ? "deleteOnly"
          : "none";

    return (
      <div className="space-y-6">
        <DashboardCards />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <AttendancePanel />
          </div>
          <div className="lg:col-span-2">
            {activeTab === "Total Payroll" ? (
              <PayrollTable />
            ) : (
              <>
                <DataTable
                  data={currentMR}
                  onEdit={handleMREdit}
                  onDelete={deleteMR}
                  onAdd={() => navigate("/hrmlayout/dashboard/new")}
                  onExport={handleExport}
                  selectable={true}
                  showButtons={activeTab !== "Total Payroll"}
                  buttonMode={getButtonMode()}
                />
                {filteredMR.length > 0 && (
                  <div className="mt-4 flex justify-start gap-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
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
                        setCurrentPage((p) => Math.min(p + 1, totalPages));
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

        <main className="p-6">
          <MRManagement />
        </main>
      </div>

      {/* Attendance Calendar Modal */}
      {calendarMR && (
        <AttendanceCalendarModal
          mr={calendarMR}
          onClose={() => setCalendarMR(null)}
        />
      )}

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
                {[
                  ["MR Name", form.medicalRepName, "capitalize"],
                  ["Team Name", form.teamName, "capitalize"],
                  ["Contact No", form.contactNo],
                  ["Email", form.email],
                  [
                    "Joining Date",
                    form.date ? formatDateToDDMMMYYYY(form.date) : "--",
                  ],
                  ["Status", form.isActive ? "Enabled" : "Disabled"],
                ].map(([label, value, extra = ""]) => (
                  <div key={label}>
                    <label className="block text-sm font-medium text-gray-600">
                      {label}
                    </label>
                    <p
                      className={`border px-3 py-2 rounded-lg bg-gray-100 ${extra}`}
                    >
                      {value || "--"}
                    </p>
                  </div>
                ))}
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
