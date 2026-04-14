import React, { useState, useEffect, useRef } from "react";
import {
  Eye,
  Edit,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  AlertCircle,
  CalendarDays,
  Clock4,
  Briefcase,
  Calendar as CalendarIcon,
  CalendarRange,
  Info,
  User,
  Users,
  X,
  ChevronsLeft,
  ChevronsRight,
  Menu,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Shared half-day helper (mirrors backend logic) ───────────────────────────
// 4 h ≤ worked < 7 h → half day
// worked ≥ 7 h        → full day
const getAttendanceTypeClient = (totalMinutesWorked) => {
  if (totalMinutesWorked >= 7 * 60)
    return { type: "full", expectedMinutes: 8 * 60 };
  if (totalMinutesWorked >= 4 * 60)
    return { type: "half", expectedMinutes: 4 * 60 };
  return { type: "short", expectedMinutes: 8 * 60 };
};

// Parse "HH:MM:SS" → total minutes
const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h = 0, m = 0] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  records = [],
  confirmLabel = "Confirm",
  confirmColor = "bg-red-600 hover:bg-red-700",
  loading = false,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-red-100 p-2 rounded-full flex-shrink-0">
            <AlertCircle size={22} className="text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        <p className="text-gray-600 mb-4 text-sm leading-relaxed">{message}</p>
        {records.length > 0 && (
          <div className="mb-5 border border-red-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
            <div className="bg-red-50 px-3 py-2 border-b border-red-200">
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                Records to be deleted ({records.length})
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {records.map((rec, idx) => (
                <li
                  key={rec._id || idx}
                  className="flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-800">
                      {rec.displayDate}
                    </span>
                    {rec.isLeaveDay ? (
                      <span className="text-xs text-purple-600 font-medium">
                        Leave Day (swap / extra hours)
                      </span>
                    ) : rec.timeInfo ? (
                      <span className="text-xs text-gray-500">
                        {rec.timeInfo}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    {rec.isLeaveDay ? (
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        Leave
                      </span>
                    ) : (
                      <>
                        {rec.isHalfDay && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            Half Day
                          </span>
                        )}
                        {rec.totalTime && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            {rec.totalTime}
                          </span>
                        )}
                        {rec.extraHoursInMinutes > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            +{Math.floor(rec.extraHoursInMinutes / 60)}h{" "}
                            {rec.extraHoursInMinutes % 60}m extra
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-red-500 mb-5 flex items-center gap-1.5">
          <AlertCircle size={12} className="flex-shrink-0" />
          This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 ${confirmColor} text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2`}
          >
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {loading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const CustomDropdown = ({
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select MR",
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-gray-400"} ${!value ? "text-gray-500" : "text-gray-900"}`}
      >
        <span className="truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {!disabled && (
          <span className="text-gray-400 flex-shrink-0 ml-2">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </button>
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              No options available
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value);
                    setIsOpen(false);
                  }
                }}
                className={`w-full px-3 py-2 text-left hover:bg-indigo-50 hover:text-indigo-900 transition-colors duration-150 ${value === option.value ? "bg-indigo-100 text-indigo-900 font-medium" : "text-gray-900"} ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const LeaveAttendance = () => {
  const [mrList, setMrList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Mobile states
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [selectedMr, setSelectedMr] = useState(null);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarViewType, setCalendarViewType] = useState("monthly");

  const currentDate = new Date();
  const [currentMonth, setCurrentMonth] = useState(currentDate.getMonth());
  const [currentYear, setCurrentYear] = useState(currentDate.getFullYear());

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedAttendanceMr, setSelectedAttendanceMr] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const inputRef = useRef(null);

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Live duration preview for attendance modal
  const [durationPreview, setDurationPreview] = useState(null);

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveType, setLeaveType] = useState("unpaid");
  const [leaveLoading, setLeaveLoading] = useState(false);

  const [showExtraHoursModal, setShowExtraHoursModal] = useState(false);
  const [extraHoursDate, setExtraHoursDate] = useState("");
  const [extraHoursDays, setExtraHoursDays] = useState(1);
  const [convertingExtraHours, setConvertingExtraHours] = useState(false);
  const [extraHoursData, setExtraHoursData] = useState({
    totalExtraHours: 0,
    totalExtraMinutes: 0,
    leaveDaysAvailable: 0,
    remainingMinutes: 0,
    monthlyExtraHours: 0,
    monthlyLeaveDaysAvailable: 0,
    monthlyRemainingMinutes: 0,
    loading: false,
    useMonthlyOnly: false,
  });

  const [showDeleteAttendanceModal, setShowDeleteAttendanceModal] =
    useState(false);
  const [deleteSelectedMr, setDeleteSelectedMr] = useState(null);
  const [deletableDates, setDeletableDates] = useState([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState([]);
  const [loadingDeletableDates, setLoadingDeletableDates] = useState(false);
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [hideMrSelector, setHideMrSelector] = useState(false);

  const [showCalendarDeleteModal, setShowCalendarDeleteModal] = useState(false);
  const [calendarDeleteData, setCalendarDeleteData] = useState({
    userId: null,
    date: null,
  });
  const [calendarDeleteLoading, setCalendarDeleteLoading] = useState(false);

  const [holidays, setHolidays] = useState([]);
  const [mrLeaves, setMrLeaves] = useState({});

  // Detect mobile view
  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const calculateRemainingTime = (totalMinutes) => {
    const fullDays = Math.floor(totalMinutes / 480);
    const remaining = totalMinutes % 480;
    const remainingHours = Math.floor(remaining / 60);
    const remainingMins = remaining % 60;
    return {
      days: fullDays,
      hours: remainingHours,
      minutes: remainingMins,
      totalHours: parseFloat((totalMinutes / 60).toFixed(2)),
      totalMinutes,
    };
  };

  const getTodayDate = () => new Date().toISOString().split("T")[0];

  const isFutureDate = (dateString) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const input = new Date(dateString);
    input.setHours(0, 0, 0, 0);
    return input > today;
  };

  const getDateString = (date) => {
    if (!date) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Compute live duration preview for attendance modal
  useEffect(() => {
    if (!startDate || !startTime || !endTime) {
      setDurationPreview(null);
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const end = new Date(`${startDate}T${endTime}`);
    if (end <= start) {
      setDurationPreview(null);
      return;
    }
    const totalMinutes = Math.floor((end - start) / 60000);
    const { type, expectedMinutes } = getAttendanceTypeClient(totalMinutes);
    const extraMinutes = Math.max(0, totalMinutes - expectedMinutes);
    setDurationPreview({ totalMinutes, type, extraMinutes });
  }, [startDate, startTime, endTime]);

  // ─── MR navigation ──────────────────────────────────────────────────────────
  const getCurrentMRIndex = () =>
    !selectedMr ? -1 : mrList.findIndex((mr) => mr._id === selectedMr._id);
  const handleNextMR = () => {
    const idx = getCurrentMRIndex();
    if (idx < mrList.length - 1) {
      setSelectedMr(mrList[idx + 1]);
      const t = new Date();
      setCurrentMonth(t.getMonth());
      setCurrentYear(t.getFullYear());
    }
  };
  const handlePreviousMR = () => {
    const idx = getCurrentMRIndex();
    if (idx > 0) {
      setSelectedMr(mrList[idx - 1]);
      const t = new Date();
      setCurrentMonth(t.getMonth());
      setCurrentYear(t.getFullYear());
    }
  };

  // ─── Data fetching ───────────────────────────────────────────────────────────
  const fetchMRList = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mrs-list`,
      );
      // Filter only active MRs where isActive is true
      const activeMRs = (res.data || []).filter((mr) => mr.isActive === true);
      setMrList(activeMRs);
    } catch (err) {
      setError(err.message || "Failed to fetch MR list");
    } finally {
      setLoading(false);
    }
  };

  const handleIconClick = () => {
    inputRef.current?.focus();
    inputRef.current?.classList.add("highlight");
    setTimeout(() => inputRef.current?.classList.remove("highlight"), 1000);
  };

  const fetchAttendanceRecords = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/hrm/leaves/attendance`);
      setAttendanceRecords(res.data || []);
      if (selectedAttendanceMr && showExtraHoursModal)
        await fetchExtraHoursData(selectedAttendanceMr);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
      showToast("error", "Failed to refresh attendance data");
    }
  };

  const fetchLeaves = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/hrm/leaves`);
      const leavesByUser = {};
      (res.data || []).forEach((leave) => {
        if (leave.status === "approved") {
          const uid = leave.userId;
          if (!leavesByUser[uid]) leavesByUser[uid] = [];
          leavesByUser[uid].push(leave);
        }
      });
      setMrLeaves(leavesByUser);
    } catch (err) {
      console.error("Failed to fetch leaves:", err);
      setMrLeaves({});
    }
  };

  const fetchHolidays = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/hrm/holidays`);
      const raw = res.data.holidays || res.data || [];
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
      console.error("Failed to fetch holidays:", err);
      setHolidays([]);
    }
  };

  const fetchDeletableDates = async (mrId) => {
    setLoadingDeletableDates(true);
    setDeletableDates([]);
    setSelectedDeleteIds([]);
    try {
      const records = attendanceRecords.filter((r) => r.userId === mrId);
      const sorted = [...records].sort(
        (a, b) => new Date(b.loginTime) - new Date(a.loginTime),
      );
      const formatted = sorted.map((rec) => {
        const loginDate = new Date(rec.loginTime);
        const isLeave = rec.isLeaveDay === true;
        const workedMin = parseTimeToMinutes(rec.totalTime);
        const { type } = getAttendanceTypeClient(workedMin);
        const isHalfDay = !isLeave && type === "half";
        let timeInfo = "";
        if (!isLeave && rec.loginTime && rec.logoutTime) {
          const login = new Date(rec.loginTime);
          const logout = new Date(rec.logoutTime);
          timeInfo = `${login.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} – ${logout.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
          if (isHalfDay) timeInfo += " (Half Day)";
        }
        return {
          _id: rec._id,
          dateStr: getDateString(rec.loginTime),
          displayDate: formatDateDisplay(loginDate),
          timeInfo,
          isLeaveDay: isLeave,
          isHalfDay,
          attendanceType: rec.attendanceType || type,
          totalTime: rec.totalTime,
          extraHoursInMinutes: rec.extraHoursInMinutes || 0,
        };
      });
      setDeletableDates(formatted);
    } catch (err) {
      console.error("Error fetching deletable dates:", err);
      showToast("error", "Failed to load attendance records");
    } finally {
      setLoadingDeletableDates(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedDeleteIds.length === 0) {
      showToast("warning", "Please select at least one record to delete");
      return;
    }
    setConfirmDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    setDeleteLoading(true);
    let successCount = 0,
      errorCount = 0,
      deletedDates = [];
    for (const id of selectedDeleteIds) {
      try {
        const res = await axios.delete(
          `${backendUrl}/api/hrm/leaves/attendance/${id}`,
        );
        if (res.data.success) {
          successCount++;
          if (res.data.warning) {
            showToast("warning", res.data.warning);
            await new Promise((r) => setTimeout(r, 600));
          }
          if (res.data.deletedDate) deletedDates.push(res.data.deletedDate);
        } else {
          errorCount++;
          showToast("error", `Failed to delete: ${res.data.message}`);
        }
      } catch (err) {
        errorCount++;
        showToast(
          "error",
          `Failed to delete: ${err.response?.data?.message || err.message}`,
        );
      }
    }
    if (successCount > 0) {
      const datesPart =
        deletedDates.length > 0 && deletedDates.length <= 3
          ? `: ${deletedDates.join(", ")}`
          : "";
      showToast("success", `${successCount} record(s) deleted${datesPart}.`);
    }
    if (errorCount > 0)
      showToast("error", `${errorCount} record(s) failed to delete.`);
    setConfirmDeleteModal(false);
    setSelectedDeleteIds([]);
    await fetchAttendanceRecords();
    if (deleteSelectedMr) fetchDeletableDates(deleteSelectedMr);
    setDeleteLoading(false);
  };

  const handleDeleteFromCalendar = async () => {
    const { userId, date } = calendarDeleteData;
    if (!userId || !date) return;
    setCalendarDeleteLoading(true);
    try {
      const res = await axios.delete(
        `${backendUrl}/api/hrm/leaves/attendance/date/${userId}/${date}`,
      );
      if (res.data.success) {
        showToast(
          "success",
          `Attendance record for ${formatDateDisplay(date)} deleted successfully.`,
        );
        if (res.data.warning) showToast("warning", res.data.warning);
        setShowCalendarDeleteModal(false);
        await fetchAttendanceRecords();
        await fetchLeaves();
        if (selectedMr) setSelectedMr({ ...selectedMr });
        if (showDeleteAttendanceModal && deleteSelectedMr)
          fetchDeletableDates(deleteSelectedMr);
      } else {
        showToast("error", res.data.message || "Failed to delete attendance");
      }
    } catch (err) {
      showToast(
        "error",
        "Failed to delete attendance: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setCalendarDeleteLoading(false);
    }
  };

  const resetExtraHoursData = () => {
    setExtraHoursData({
      totalExtraHours: 0,
      totalExtraMinutes: 0,
      leaveDaysAvailable: 0,
      remainingMinutes: 0,
      monthlyExtraHours: 0,
      monthlyLeaveDaysAvailable: 0,
      monthlyRemainingMinutes: 0,
      loading: false,
      useMonthlyOnly: false,
    });
  };

  const fetchExtraHoursData = async (mrId) => {
    try {
      setExtraHoursData((prev) => ({ ...prev, loading: true }));
      const today = new Date();
      const res = await axios.get(
        `${backendUrl}/api/hrm/leaves/attendance/extra-hours/${mrId}`,
        {
          params: { year: today.getFullYear(), month: today.getMonth() },
        },
      );
      if (res.data.success) {
        const data = res.data.data;
        const totalMinutes = data.totalExtraMinutes || 0;
        const monthlyMins = data.monthlyExtraMinutes || 0;
        const totalCalc = calculateRemainingTime(totalMinutes);
        const monthlyCalc = calculateRemainingTime(monthlyMins);
        setExtraHoursData((prev) => ({
          totalExtraHours: totalCalc.totalHours,
          totalExtraMinutes: totalMinutes,
          leaveDaysAvailable: totalCalc.days,
          remainingMinutes: totalCalc.minutes + totalCalc.hours * 60,
          monthlyExtraHours: monthlyCalc.totalHours,
          monthlyLeaveDaysAvailable: monthlyCalc.days,
          monthlyRemainingMinutes: monthlyCalc.minutes + monthlyCalc.hours * 60,
          loading: false,
          useMonthlyOnly: prev.useMonthlyOnly,
        }));
      } else {
        throw new Error(res.data.message);
      }
    } catch (err) {
      console.error("Failed to fetch extra hours data:", err);
      resetExtraHoursData();
      showToast("error", "Failed to load extra hours data");
    }
  };

  const getDisplayValues = () => {
    const { useMonthlyOnly, totalExtraMinutes, monthlyExtraMinutes } =
      extraHoursData;
    const minutesToUse = useMonthlyOnly
      ? monthlyExtraMinutes || 0
      : totalExtraMinutes || 0;
    const displayCalc = calculateRemainingTime(minutesToUse);
    return {
      showExtraHours: parseFloat((minutesToUse / 60).toFixed(2)),
      showLeaveDaysAvailable: displayCalc.days,
      showRemainingHours: displayCalc.hours,
      showRemainingMinutes: displayCalc.minutes,
      showTotalMinutes: minutesToUse,
    };
  };

  const getMonthsOfService = (joinDate) => {
    if (!joinDate) return 0;
    const join = new Date(joinDate);
    const today = new Date();
    const months =
      (today.getFullYear() - join.getFullYear()) * 12 +
      (today.getMonth() - join.getMonth());
    const daysInMonth = today.getDate() - join.getDate();
    return Math.max(0, daysInMonth >= 30 ? months : Math.max(0, months - 1));
  };

  const calculatePaidLeaves = (joinDate) =>
    (getMonthsOfService(joinDate) * 1).toFixed(2);

  const isSunday = (date) => new Date(date).getDay() === 0;
  const isHoliday = (date) => {
    if (!Array.isArray(holidays) || holidays.length === 0) return false;
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return holidays.some((h) => {
      const hd = new Date(h.date || h.startDate);
      hd.setHours(0, 0, 0, 0);
      return hd.getTime() === checkDate.getTime();
    });
  };
  const getHolidayName = (date) => {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const h = holidays.find((h) => {
      const hd = new Date(h.date || h.startDate);
      hd.setHours(0, 0, 0, 0);
      return hd.getTime() === checkDate.getTime();
    });
    return h ? h.name : null;
  };

  const filteredMRList = mrList.filter(
    (mr) =>
      mr.isActive === true &&
      (mr.medicalRepName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mr.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mr.contactNo?.includes(searchTerm)),
  );

  const totalPages = Math.ceil(filteredMRList.length / itemsPerPage);
  const currentMRs = filteredMRList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const getAttendanceForDate = (date, mrId) => {
    if (!mrId || !date) return null;
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const records = attendanceRecords.filter((rec) => {
      if (rec.userId !== mrId || !rec.loginTime) return false;
      const rd = new Date(rec.loginTime);
      rd.setHours(0, 0, 0, 0);
      return rd.getTime() === checkDate.getTime();
    });
    return records.length > 0 ? records[0] : null;
  };

  // ─── Check if a date is a half-day attendance ─────────────────────────────
  const isHalfDayAttendance = (date, mrId) => {
    const att = getAttendanceForDate(date, mrId);
    if (!att || att.isLeaveDay) return false;
    // Prefer stored attendanceType, fall back to computed
    if (att.attendanceType === "half") return true;
    const workedMin = parseTimeToMinutes(att.totalTime);
    return getAttendanceTypeClient(workedMin).type === "half";
  };

  const isLeave = (date, mrId) => {
    if (!mrId) return { isLeave: false, type: null };
    const leaves = mrLeaves[mrId] || [];
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    for (const leave of leaves) {
      if (!leave.leaveDate || leave.status !== "approved") continue;
      const ld = new Date(leave.leaveDate);
      ld.setHours(0, 0, 0, 0);
      if (ld.getTime() === checkDate.getTime())
        return {
          isLeave: true,
          type: leave.leaveType || "unpaid",
          leaveDate: leave.leaveDate,
          reason: leave.reason,
        };
    }
    const attendance = getAttendanceForDate(date, mrId);
    if (attendance?.isLeaveDay) {
      const swapLeave = leaves.find((leave) => {
        if (
          !leave.leaveDate ||
          leave.status !== "approved" ||
          leave.leaveType !== "swapleave"
        )
          return false;
        const ld = new Date(leave.leaveDate);
        ld.setHours(0, 0, 0, 0);
        return ld.getTime() === checkDate.getTime();
      });
      return swapLeave
        ? { isLeave: true, type: "swapleave", fromAttendance: true }
        : { isLeave: true, type: "paid", fromAttendance: true };
    }
    return { isLeave: false, type: null };
  };

  const getLeaveCounts = (mrId, joinDate) => {
    const leaves = mrLeaves[mrId] || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const approvedUnpaid = leaves.filter(
      (l) => l.status === "approved" && l.leaveType === "unpaid",
    );
    const swapLeaves = leaves.filter(
      (l) => l.status === "approved" && l.leaveType === "swapleave",
    );
    const paidLeaves = leaves.filter(
      (l) => l.status === "approved" && l.leaveType === "paid",
    );
    const valid = (arr) =>
      arr.filter((l) => {
        const d = new Date(l.leaveDate);
        d.setHours(0, 0, 0, 0);
        return d <= today;
      });
    return {
      monthly: 0,
      annual: 0,
      paid: parseFloat(calculatePaidLeaves(joinDate)),
      total: valid(approvedUnpaid).length,
      swapLeaves: valid(swapLeaves).length,
      paidLeaves: valid(paidLeaves).length,
    };
  };

  const getRemainingPaidLeaves = (mrId, joinDate) => {
    const counts = getLeaveCounts(mrId, joinDate);
    return Math.max(0, counts.paid - counts.total).toFixed(2);
  };

  const getDaysInMonth = (year = currentYear, month = currentMonth) => {
    const days = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    for (let i = 0; i < firstDay.getDay(); i++) days.push(null);
    for (let i = 1; i <= lastDay.getDate(); i++)
      days.push(new Date(year, month, i));
    return days;
  };

  const canNavigateNext = (direction, type = "monthly") => {
    const today = new Date();
    if (type === "monthly" && direction === "next") {
      return (
        currentYear < today.getFullYear() ||
        (currentYear === today.getFullYear() && currentMonth < today.getMonth())
      );
    }
    if (type === "annual" && direction === "next")
      return currentYear < today.getFullYear();
    return true;
  };

  const navigateMonth = (direction) => {
    if (direction === "prev") {
      setCurrentMonth((m) =>
        m === 0 ? (setCurrentYear((y) => y - 1), 11) : m - 1,
      );
    } else {
      if (canNavigateNext("next", "monthly")) {
        setCurrentMonth((m) =>
          m === 11 ? (setCurrentYear((y) => y + 1), 0) : m + 1,
        );
      }
    }
  };
  const navigateYear = (direction) => {
    if (direction === "prev") setCurrentYear((y) => y - 1);
    else if (canNavigateNext("next", "annual")) setCurrentYear((y) => y + 1);
  };

  const getAttendanceStats = (mrId) => {
    const mrRecords = attendanceRecords.filter((r) => r.userId === mrId);
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const monthlyCount = mrRecords.filter((r) => {
      const d = new Date(r.loginTime);
      return d >= monthStart && d <= monthEnd;
    }).length;
    const annualCount = mrRecords.filter((r) => {
      const d = new Date(r.loginTime);
      return d.getFullYear() === currentYear;
    }).length;
    const totalWorkingDays = getWorkingDaysInMonth(currentYear, currentMonth);
    return {
      monthly: monthlyCount,
      annual: annualCount,
      percentage:
        totalWorkingDays > 0
          ? ((monthlyCount / totalWorkingDays) * 100).toFixed(1)
          : 0,
    };
  };

  const getWorkingDaysInMonth = (year, month) => {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    let count = 0;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) count++;
    }
    return count;
  };

  const handleRecordAttendance = async () => {
    if (!selectedAttendanceMr || !startDate || !startTime || !endTime) {
      showToast("error", "Please fill all fields");
      return;
    }
    if (startTime >= endTime) {
      showToast("error", "End time must be after start time");
      return;
    }
    if (isFutureDate(startDate)) {
      showToast("error", "Cannot record attendance for future dates");
      return;
    }
    if (isSunday(startDate)) {
      showToast("error", "Cannot record attendance on Sunday");
      return;
    }
    if (isHoliday(startDate)) {
      showToast(
        "error",
        `Cannot record attendance on holiday: ${getHolidayName(startDate)}`,
      );
      return;
    }
    if (isLeave(new Date(startDate), selectedAttendanceMr).isLeave) {
      showToast("error", "Cannot record attendance on a leave day");
      return;
    }

    const tz = new Date().getTimezoneOffset();
    const sign = tz > 0 ? "-" : "+";
    const tzStr = `${sign}${String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0")}:${String(Math.abs(tz) % 60).padStart(2, "0")}`;

    try {
      setAttendanceLoading(true);
      const res = await axios.post(
        `${backendUrl}/api/hrm/leaves/attendance/record`,
        {
          userId: selectedAttendanceMr,
          loginTime: `${startDate}T${startTime}${tzStr}`,
          logoutTime: `${startDate}T${endTime}${tzStr}`,
          workingHoursPerDay: 8,
        },
      );
      if (res.data.success) {
        const att = res.data.attendance;
        const msg = att.isHalfDay
          ? `Half-day attendance recorded! (${att.totalTime} worked, ${att.extraHoursInMinutes} extra min)`
          : "Attendance recorded successfully!";
        showToast("success", msg);
        setShowAttendanceModal(false);
        setSelectedAttendanceMr(null);
        setStartDate("");
        setStartTime("");
        setEndTime("");
        setDurationPreview(null);
        fetchAttendanceRecords();
      }
    } catch (err) {
      showToast(
        "error",
        "Failed to record attendance: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleApplyLeave = async () => {
    if (!selectedAttendanceMr || !leaveDate || !leaveReason || !leaveType) {
      showToast("error", "Please fill all required fields");
      return;
    }
    if (isFutureDate(leaveDate)) {
      showToast("error", "Cannot apply for leave for future dates");
      return;
    }
    if (isSunday(leaveDate)) {
      showToast("error", "Cannot apply for leave on Sunday");
      return;
    }
    if (isHoliday(leaveDate)) {
      showToast(
        "error",
        `Cannot apply for leave on holiday: ${getHolidayName(leaveDate)}`,
      );
      return;
    }
    if (getAttendanceForDate(new Date(leaveDate), selectedAttendanceMr)) {
      showToast(
        "error",
        "Cannot apply for leave on a day with existing attendance",
      );
      return;
    }
    if (leaveType === "paid") {
      const mr = mrList.find((m) => m._id === selectedAttendanceMr);
      if (
        parseFloat(getRemainingPaidLeaves(selectedAttendanceMr, mr?.date)) < 1
      ) {
        showToast("error", "Insufficient paid leave balance.");
        return;
      }
    }
    try {
      setLeaveLoading(true);
      const res = await axios.post(`${backendUrl}/api/hrm/leaves`, {
        userId: selectedAttendanceMr,
        leaveDate: new Date(leaveDate).toISOString(),
        reason: leaveReason,
        leaveType,
        status: "approved",
      });
      if (res.data.success) {
        showToast(
          "success",
          `${leaveType === "paid" ? "Paid" : "Unpaid"} leave applied successfully!`,
        );
        setShowLeaveModal(false);
        setSelectedAttendanceMr(null);
        setLeaveDate("");
        setLeaveReason("");
        setLeaveType("unpaid");
        fetchLeaves();
      }
    } catch (err) {
      showToast(
        "error",
        "Failed to apply leave: " +
          (err.response?.data?.message || err.message),
      );
    } finally {
      setLeaveLoading(false);
    }
  };

  const handleConvertExtraHoursToLeave = async () => {
    if (!selectedAttendanceMr || !extraHoursDate) {
      showToast("error", "Please select MR and date for leave");
      return;
    }
    const displayValues = getDisplayValues();
    if (extraHoursDays < 1) {
      showToast("error", "Please select at least 1 leave day");
      return;
    }
    if (displayValues.showLeaveDaysAvailable < extraHoursDays) {
      showToast(
        "error",
        `Insufficient extra hours. Available: ${displayValues.showLeaveDaysAvailable} days`,
      );
      return;
    }
    if (isSunday(extraHoursDate)) {
      showToast("error", "Cannot take leave on Sunday");
      return;
    }
    if (isHoliday(extraHoursDate)) {
      showToast(
        "error",
        `Cannot take leave on holiday: ${getHolidayName(extraHoursDate)}`,
      );
      return;
    }
    const existing = attendanceRecords.find((rec) => {
      if (rec.userId !== selectedAttendanceMr || !rec.loginTime) return false;
      const rd = new Date(rec.loginTime);
      rd.setHours(0, 0, 0, 0);
      const cd = new Date(extraHoursDate);
      cd.setHours(0, 0, 0, 0);
      return rd.getTime() === cd.getTime();
    });
    if (existing && !existing.isLeaveDay) {
      showToast("error", "Regular attendance already exists for this date");
      return;
    }
    if (existing && existing.isLeaveDay) {
      showToast("error", "This date is already marked as a leave day");
      return;
    }

    try {
      setConvertingExtraHours(true);
      const res = await axios.post(
        `${backendUrl}/api/hrm/leaves/attendance/convert-to-leave`,
        {
          userId: selectedAttendanceMr,
          date: extraHoursDate,
          leaveDays: extraHoursDays,
          useMonthlyOnly: extraHoursData.useMonthlyOnly,
        },
      );
      if (res.data.success) {
        showToast(
          "success",
          `${extraHoursDays} leave day${extraHoursDays > 1 ? "s" : ""} successfully converted from extra hours!`,
        );
        await Promise.all([
          fetchAttendanceRecords(),
          fetchLeaves(),
          fetchExtraHoursData(selectedAttendanceMr),
        ]);
        setShowExtraHoursModal(false);
        setExtraHoursDate("");
        setExtraHoursDays(1);
      } else {
        showToast("error", res.data.message || "Failed to convert to leave");
      }
    } catch (err) {
      showToast(
        "error",
        `Failed to convert to leave: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setConvertingExtraHours(false);
    }
  };

  const getExtraHoursForMR = (mrId) => {
    return (
      attendanceRecords
        .filter((r) => r.userId === mrId && r.isLeaveDay !== true)
        .reduce((sum, r) => sum + (r.extraHoursInMinutes || 0), 0) / 60
    );
  };

  const handleOpenDeleteAttendanceModal = (mrId = null) => {
    setShowDeleteAttendanceModal(true);
    setDeleteSelectedMr(mrId);
    setHideMrSelector(mrId !== null);
    setDeletableDates([]);
    setSelectedDeleteIds([]);
  };

  const handleOpenAttendanceModal = () => {
    setShowAttendanceModal(true);
    setSelectedAttendanceMr(null);
    const today = new Date();
    setStartDate(today.toISOString().split("T")[0]);
    setStartTime("09:00");
    setEndTime("17:00");
    setDurationPreview(null);
  };

  const handleOpenLeaveModal = () => {
    setShowLeaveModal(true);
    setSelectedAttendanceMr(null);
    setLeaveDate(new Date().toISOString().split("T")[0]);
    setLeaveReason("");
    setLeaveType("unpaid");
  };

  const handleOpenExtraHoursModal = () => {
    setShowExtraHoursModal(true);
    setSelectedAttendanceMr(null);
    setExtraHoursDate(new Date().toISOString().split("T")[0]);
    setExtraHoursDays(1);
  };

  const mrOptions = mrList
    .filter((mr) => mr.isActive === true)
    .map((mr) => ({
      value: mr._id,
      label: `${mr.medicalRepName} (${mr.MRId})`,
    }));

  const handleView = (mr) => {
    setSelectedMr(mr);
    setShowCalendarView(true);
    setCalendarViewType("monthly");
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  useEffect(() => {
    fetchMRList();
    fetchAttendanceRecords();
    fetchHolidays();
    fetchLeaves();
  }, []);

  useEffect(() => {
    if (selectedAttendanceMr && showExtraHoursModal)
      fetchExtraHoursData(selectedAttendanceMr);
    else resetExtraHoursData();
  }, [selectedAttendanceMr, showExtraHoursModal]);

  useEffect(() => {
    if (deleteSelectedMr && showDeleteAttendanceModal)
      fetchDeletableDates(deleteSelectedMr);
    else {
      setDeletableDates([]);
      setSelectedDeleteIds([]);
    }
  }, [deleteSelectedMr, showDeleteAttendanceModal, attendanceRecords]);

  if (loading) return <div className="p-6 text-center">Loading MR List...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  // ─── Calendar cell style ───────────────────────────────────────────────────
  const getCalendarCellStyle = (date, mrId) => {
    if (!date)
      return {
        cellStyle:
          "h-12 flex items-center justify-center rounded-lg border-2 border-transparent",
        titleText: "",
        isDeletable: false,
      };

    const attendance = getAttendanceForDate(date, mrId);
    const leaveInfo = isLeave(date, mrId);
    const isSundayDay = isSunday(date);
    const isHolidayDay = isHoliday(date);
    const isToday = date.toDateString() === new Date().toDateString();
    const halfDay =
      attendance && !attendance.isLeaveDay && isHalfDayAttendance(date, mrId);

    let cellStyle =
      "h-12 flex items-center justify-center rounded-lg border-2 ";
    let titleText = "";
    let isDeletable = false;

    if (attendance && !attendance.isLeaveDay) {
      if (halfDay) {
        cellStyle +=
          "bg-orange-400 text-white border-orange-500 cursor-pointer hover:opacity-80";
        titleText = "Half Day (click to delete)";
      } else {
        cellStyle +=
          "bg-green-500 text-white border-green-600 cursor-pointer hover:opacity-80";
        titleText = "Present (click to delete)";
      }
      isDeletable = true;
    } else if (leaveInfo.isLeave) {
      if (leaveInfo.type === "swapleave") {
        cellStyle +=
          "bg-purple-500 text-white border-purple-600 cursor-pointer hover:opacity-80";
        titleText = "Swap Leave (click to delete)";
      } else if (leaveInfo.type === "paid") {
        cellStyle +=
          "bg-blue-500 text-white border-blue-600 cursor-pointer hover:opacity-80";
        titleText = "Paid Leave (click to delete)";
      } else {
        cellStyle +=
          "bg-red-500 text-white border-red-600 cursor-pointer hover:opacity-80";
        titleText = "Unpaid Leave (click to delete)";
      }
      isDeletable = true;
    } else if (isSundayDay) {
      cellStyle += "bg-red-400 text-white border-red-500 cursor-default";
      titleText = "Sunday";
    } else if (isHolidayDay) {
      cellStyle += "bg-gray-400 text-white border-gray-500 cursor-default";
      titleText = `Holiday: ${getHolidayName(date)}`;
    } else if (isToday) {
      cellStyle += "border-blue-500 bg-blue-50 cursor-default";
      titleText = "Today";
    } else {
      cellStyle += "border-gray-200 bg-gray-50 cursor-default";
      titleText = "Working Day";
    }

    return { cellStyle: cellStyle.trim(), titleText, isDeletable };
  };

  // Annual view cell (compact)
  const getAnnualCellStyle = (date, mrId) => {
    const attendance = getAttendanceForDate(date, mrId);
    const leaveInfo = isLeave(date, mrId);
    const halfDay =
      attendance && !attendance.isLeaveDay && isHalfDayAttendance(date, mrId);

    let cellStyle = "h-6 flex items-center justify-center rounded text-xs ";
    let isDeletable = false;
    let titleText = "";

    if (attendance && !attendance.isLeaveDay) {
      cellStyle += halfDay
        ? "bg-orange-400 text-white cursor-pointer hover:opacity-80"
        : "bg-green-500 text-white cursor-pointer hover:opacity-80";
      titleText = halfDay
        ? "Half Day (click to delete)"
        : "Present (click to delete)";
      isDeletable = true;
    } else if (leaveInfo.isLeave) {
      if (leaveInfo.type === "swapleave")
        cellStyle += "bg-purple-500 text-white cursor-pointer hover:opacity-80";
      else if (leaveInfo.type === "paid")
        cellStyle += "bg-blue-500 text-white cursor-pointer hover:opacity-80";
      else cellStyle += "bg-red-500 text-white cursor-pointer hover:opacity-80";
      titleText = `${leaveInfo.type === "swapleave" ? "Swap" : leaveInfo.type === "paid" ? "Paid" : "Unpaid"} Leave (click to delete)`;
      isDeletable = true;
    } else if (isSunday(date)) {
      cellStyle += "bg-red-400 text-white cursor-default";
      titleText = "Sunday";
    } else if (isHoliday(date)) {
      cellStyle += "bg-gray-400 text-white cursor-default";
      titleText = `Holiday: ${getHolidayName(date)}`;
    } else {
      cellStyle += "bg-gray-100 cursor-default";
      titleText = "Working Day";
    }

    return { cellStyle: cellStyle.trim(), titleText, isDeletable };
  };

  // Mobile FAB Menu
  const MobileFabMenu = () => (
    <div className="fixed bottom-6 right-6 z-40">
      <div className="relative">
        {mobileMenuOpen && (
          <div className="absolute bottom-16 right-0 mb-2 space-y-2">
            <button
              onClick={() => {
                handleOpenAttendanceModal();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
            >
              <Clock size={16} /> Attendance
            </button>
            <button
              onClick={() => {
                handleOpenLeaveModal();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
            >
              <Calendar size={16} /> Leave
            </button>
            <button
              onClick={() => {
                handleOpenExtraHoursModal();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
            >
              <Clock4 size={16} /> Extra Hours
            </button>
            <button
              onClick={() => {
                handleOpenDeleteAttendanceModal();
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl shadow-lg cursor-pointer w-full justify-center text-sm"
            >
              <Trash2 size={16} /> Delete
            </button>
          </div>
        )}
        {/* <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
        >
          <PlusCircle size={24} />
        </button> */}
      </div>
    </div>
  );

  return (
    <div className={`${isMobileView ? "px-3" : "p-6"} relative`}>
      {/* Sidebar for mobile */}
      {isMobileView && (
        <Sidebar
          isOpen={sidebarOpen}
          toggleSidebar={() => setSidebarOpen(false)}
          isMobile={true}
        />
      )}

      <ConfirmationModal
        isOpen={confirmDeleteModal}
        onClose={() => setConfirmDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        title="Delete Attendance Records"
        message={`Are you sure you want to delete ${selectedDeleteIds.length} selected record(s)?`}
        confirmLabel="Delete All"
        confirmColor="bg-red-600 hover:bg-red-700"
      />
      <ConfirmationModal
        isOpen={showCalendarDeleteModal}
        onClose={() => setShowCalendarDeleteModal(false)}
        onConfirm={handleDeleteFromCalendar}
        loading={calendarDeleteLoading}
        title="Delete Attendance from Calendar"
        message={`Are you sure you want to delete the attendance record for ${calendarDeleteData.date ? formatDateDisplay(calendarDeleteData.date) : ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="bg-red-600 hover:bg-red-700"
      />

      {/* ── Delete Attendance Modal (keep existing code) ── */}
      {showDeleteAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Trash2 size={20} className="text-red-500" /> Delete Attendance
              </h2>
              <button
                onClick={() => {
                  setShowDeleteAttendanceModal(false);
                  setDeleteSelectedMr(null);
                  setHideMrSelector(false);
                  setDeletableDates([]);
                  setSelectedDeleteIds([]);
                }}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            {!hideMrSelector && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Medical Representative
                </label>
                <CustomDropdown
                  value={deleteSelectedMr}
                  onChange={setDeleteSelectedMr}
                  options={mrOptions}
                  placeholder="Select MR to view attendance"
                  required
                />
              </div>
            )}
            <div className="flex-1 overflow-y-auto min-h-0">
              {!deleteSelectedMr ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                  <User size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">
                    Select an MR to view attendance records
                  </p>
                </div>
              ) : loadingDeletableDates ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500 mx-auto" />
                  <p className="text-gray-500 mt-3 text-sm">
                    Loading attendance records...
                  </p>
                </div>
              ) : deletableDates.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                  <Calendar size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 font-medium">
                    No attendance records found
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">
                      {deletableDates.length} record
                      {deletableDates.length !== 1 ? "s" : ""} found
                    </p>
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={
                          selectedDeleteIds.length === deletableDates.length &&
                          deletableDates.length > 0
                        }
                        onChange={(e) =>
                          setSelectedDeleteIds(
                            e.target.checked
                              ? deletableDates.map((d) => d._id)
                              : [],
                          )
                        }
                        className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                      <span>Select All</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    {deletableDates.map((record) => (
                      <div
                        key={record._id}
                        className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${selectedDeleteIds.includes(record._id) ? "border-red-400 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedDeleteIds.includes(record._id)}
                            onChange={(e) =>
                              setSelectedDeleteIds(
                                e.target.checked
                                  ? [...selectedDeleteIds, record._id]
                                  : selectedDeleteIds.filter(
                                      (id) => id !== record._id,
                                    ),
                              )
                            }
                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-800 text-sm">
                              {record.displayDate}
                            </p>
                            {record.isLeaveDay ? (
                              <span className="text-xs text-purple-600 font-medium">
                                Leave Day (converted from extra hours)
                              </span>
                            ) : record.timeInfo ? (
                              <span className="text-xs text-gray-500">
                                {record.timeInfo}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-right">
                            {record.isLeaveDay ? (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                Leave
                              </span>
                            ) : (
                              <>
                                {record.isHalfDay && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium block mb-1">
                                    Half Day
                                  </span>
                                )}
                                {record.totalTime && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium block mb-1">
                                    {record.totalTime}
                                  </span>
                                )}
                                {record.extraHoursInMinutes > 0 && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium block">
                                    +
                                    {Math.floor(
                                      record.extraHoursInMinutes / 60,
                                    )}
                                    h {record.extraHoursInMinutes % 60}m extra
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowDeleteAttendanceModal(false);
                  setDeleteSelectedMr(null);
                  setHideMrSelector(false);
                  setDeletableDates([]);
                  setSelectedDeleteIds([]);
                }}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={selectedDeleteIds.length === 0}
                className={`flex-1 px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 ${selectedDeleteIds.length > 0 ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
              >
                <Trash2 size={16} /> Delete Selected ({selectedDeleteIds.length}
                )
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Attendance Modal (keep existing code) ── */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Record Attendance</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Medical Representative
              </label>
              <CustomDropdown
                value={selectedAttendanceMr}
                onChange={setSelectedAttendanceMr}
                options={mrOptions}
                placeholder="Select MR"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={getTodayDate()}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {startDate && (
              <div className="mb-4">
                {isFutureDate(startDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot record attendance for future dates
                    </p>
                  </div>
                ) : isSunday(startDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot record attendance on Sunday
                    </p>
                  </div>
                ) : isHoliday(startDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot record attendance on holiday:{" "}
                      {getHolidayName(startDate)}
                    </p>
                  </div>
                ) : isLeave(new Date(startDate), selectedAttendanceMr)
                    .isLeave ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot record attendance on leave day
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="validWorkingDay"
                      checked
                      readOnly
                      className="mr-2 h-4 w-4 text-green-600 rounded"
                    />
                    <label
                      htmlFor="validWorkingDay"
                      className="text-green-700 text-sm font-medium"
                    >
                      Valid working day
                    </label>
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Duration preview */}
            {durationPreview && (
              <div
                className={`mb-4 p-3 rounded-lg border text-sm ${
                  durationPreview.type === "half"
                    ? "bg-orange-50 border-orange-200 text-orange-800"
                    : durationPreview.type === "short"
                      ? "bg-red-50 border-red-200 text-red-700"
                      : "bg-green-50 border-green-200 text-green-800"
                }`}
              >
                {durationPreview.type === "short" && (
                  <p className="font-medium">
                    ⚠️ Duration {Math.floor(durationPreview.totalMinutes / 60)}h{" "}
                    {durationPreview.totalMinutes % 60}m — less than 4 hours
                    (minimum for attendance)
                  </p>
                )}
                {durationPreview.type === "half" && (
                  <>
                    <p className="font-semibold">
                      🌓 Half Day —{" "}
                      {Math.floor(durationPreview.totalMinutes / 60)}h{" "}
                      {durationPreview.totalMinutes % 60}m worked
                    </p>
                    <p className="text-xs mt-1">
                      Base: 4 hours · Extra:{" "}
                      {Math.floor(durationPreview.extraMinutes / 60)}h{" "}
                      {durationPreview.extraMinutes % 60}m added to your bank
                    </p>
                  </>
                )}
                {durationPreview.type === "full" && (
                  <>
                    <p className="font-semibold">
                      ✅ Full Day —{" "}
                      {Math.floor(durationPreview.totalMinutes / 60)}h{" "}
                      {durationPreview.totalMinutes % 60}m worked
                    </p>
                    {durationPreview.extraMinutes > 0 && (
                      <p className="text-xs mt-1">
                        Extra: {Math.floor(durationPreview.extraMinutes / 60)}h{" "}
                        {durationPreview.extraMinutes % 60}m added to your bank
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <button
                onClick={handleRecordAttendance}
                disabled={
                  attendanceLoading ||
                  !selectedAttendanceMr ||
                  !startDate ||
                  !startTime ||
                  !endTime ||
                  isFutureDate(startDate) ||
                  isSunday(startDate) ||
                  isHoliday(startDate) ||
                  isLeave(new Date(startDate), selectedAttendanceMr).isLeave ||
                  (durationPreview && durationPreview.type === "short")
                }
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  attendanceLoading ||
                  !selectedAttendanceMr ||
                  !startDate ||
                  !startTime ||
                  !endTime ||
                  isFutureDate(startDate) ||
                  isSunday(startDate) ||
                  isHoliday(startDate) ||
                  isLeave(new Date(startDate), selectedAttendanceMr).isLeave ||
                  (durationPreview && durationPreview.type === "short")
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <Clock size={16} />
                {attendanceLoading
                  ? "Recording..."
                  : durationPreview?.type === "half"
                    ? "Record Half Day"
                    : "Record Attendance"}
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAttendanceModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply Leave Modal (keep existing code) ── */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Apply Leave</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Medical Representative
              </label>
              <CustomDropdown
                value={selectedAttendanceMr}
                onChange={setSelectedAttendanceMr}
                options={mrOptions}
                placeholder="Select MR"
                required
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Leave Date
              </label>
              <input
                type="date"
                value={leaveDate}
                onChange={(e) => setLeaveDate(e.target.value)}
                max={getTodayDate()}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Leave Type
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="unpaid">Unpaid Leave</option>
                <option value="paid">Paid Leave</option>
              </select>
              {selectedAttendanceMr && leaveType === "paid" && (
                <p className="text-xs text-gray-500 mt-1">
                  Available paid leaves:{" "}
                  {mrList.find((mr) => mr._id === selectedAttendanceMr)
                    ? getRemainingPaidLeaves(
                        selectedAttendanceMr,
                        mrList.find((mr) => mr._id === selectedAttendanceMr)
                          .date,
                      )
                    : "0.00"}
                </p>
              )}
            </div>
            {leaveDate && (
              <div className="mb-4">
                {isFutureDate(leaveDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot apply for leave for future dates
                    </p>
                  </div>
                ) : isSunday(leaveDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot apply for leave on Sunday
                    </p>
                  </div>
                ) : isHoliday(leaveDate) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot apply for leave on holiday:{" "}
                      {getHolidayName(leaveDate)}
                    </p>
                  </div>
                ) : getAttendanceForDate(
                    new Date(leaveDate),
                    selectedAttendanceMr,
                  ) ? (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-700 text-sm font-medium">
                      ⚠️ Cannot apply for leave on a day with existing
                      attendance
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="validLeaveDay"
                      checked
                      readOnly
                      className="mr-2 h-4 w-4 text-green-600 rounded"
                    />
                    <label
                      htmlFor="validLeaveDay"
                      className="text-green-700 text-sm font-medium"
                    >
                      Valid leave day
                    </label>
                  </div>
                )}
              </div>
            )}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                rows="3"
                placeholder="Enter reason for leave"
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-3 mb-4">
              <button
                onClick={handleApplyLeave}
                disabled={
                  leaveLoading ||
                  !selectedAttendanceMr ||
                  !leaveDate ||
                  !leaveReason ||
                  !leaveType ||
                  isFutureDate(leaveDate) ||
                  isSunday(leaveDate) ||
                  isHoliday(leaveDate) ||
                  !!getAttendanceForDate(
                    new Date(leaveDate),
                    selectedAttendanceMr,
                  )
                }
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${leaveLoading || !selectedAttendanceMr || !leaveDate || !leaveReason || !leaveType || isFutureDate(leaveDate) || isSunday(leaveDate) || isHoliday(leaveDate) || !!getAttendanceForDate(new Date(leaveDate), selectedAttendanceMr) ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"} text-white`}
              >
                <Calendar size={16} />{" "}
                {leaveLoading ? "Applying..." : "Apply Leave"}
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Convert Extra Hours Modal (keep existing code) ── */}
      {showExtraHoursModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Convert Extra Hours to Leave
            </h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Medical Representative
              </label>
              <CustomDropdown
                value={selectedAttendanceMr}
                onChange={setSelectedAttendanceMr}
                options={mrOptions}
                placeholder="Select MR"
                required
              />
            </div>
            {!selectedAttendanceMr ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <Briefcase size={48} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500 font-medium">
                  Select an MR to view extra hours
                </p>
              </div>
            ) : extraHoursData.loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
                <p className="text-gray-500 mt-3">
                  Loading extra hours data...
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={extraHoursData.useMonthlyOnly}
                      onChange={(e) =>
                        setExtraHoursData((prev) => ({
                          ...prev,
                          useMonthlyOnly: e.target.checked,
                        }))
                      }
                      className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-blue-700 font-medium text-sm">
                      Use only this month's extra hours
                    </span>
                  </label>
                </div>
                {(() => {
                  const dv = getDisplayValues();
                  return dv.showTotalMinutes > 0 ? (
                    <>
                      <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="font-semibold text-gray-800 mb-2">
                          Extra Hours Summary
                        </h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Hours:</span>
                            <span className="font-bold text-green-700">
                              {dv.showExtraHours.toFixed(2)} hrs
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Available Days:
                            </span>
                            <span className="font-bold text-purple-700">
                              {dv.showLeaveDaysAvailable} day
                              {dv.showLeaveDaysAvailable !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Remaining:</span>
                            <span className="font-bold text-gray-700">
                              {dv.showRemainingHours}h {dv.showRemainingMinutes}
                              m
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          8 extra hours = 1 leave day
                        </p>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Date for Leave
                          </label>
                          <input
                            type="date"
                            value={extraHoursDate}
                            onChange={(e) => setExtraHoursDate(e.target.value)}
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </div>
                        {extraHoursDate && (
                          <div className="mb-4">
                            {isSunday(extraHoursDate) ? (
                              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <p className="text-red-700 text-sm font-medium">
                                  ⚠️ Cannot take leave on Sunday
                                </p>
                              </div>
                            ) : isHoliday(extraHoursDate) ? (
                              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <p className="text-red-700 text-sm font-medium">
                                  ⚠️ Cannot take leave on holiday:{" "}
                                  {getHolidayName(extraHoursDate)}
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center">
                                <input
                                  type="checkbox"
                                  id="validConvertDay"
                                  checked
                                  readOnly
                                  className="mr-2 h-4 w-4 text-green-600 rounded"
                                />
                                <label
                                  htmlFor="validConvertDay"
                                  className="text-green-700 text-sm font-medium"
                                >
                                  Valid day for leave conversion
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Convert 8 Hours to 1 Leave Day
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="1"
                              max={dv.showLeaveDaysAvailable}
                              value={extraHoursDays}
                              onChange={(e) =>
                                setExtraHoursDays(parseInt(e.target.value) || 1)
                              }
                              className="w-24 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <span className="text-gray-600">day(s)</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Available: {dv.showLeaveDaysAvailable} days (
                            {dv.showExtraHours.toFixed(2)} hours)
                          </p>
                        </div>
                        <button
                          onClick={handleConvertExtraHoursToLeave}
                          disabled={
                            convertingExtraHours ||
                            !extraHoursDate ||
                            dv.showLeaveDaysAvailable < extraHoursDays ||
                            extraHoursDays < 1 ||
                            isSunday(extraHoursDate) ||
                            isHoliday(extraHoursDate)
                          }
                          className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 ${convertingExtraHours || !extraHoursDate || dv.showLeaveDaysAvailable < extraHoursDays || extraHoursDays < 1 || isSunday(extraHoursDate) || isHoliday(extraHoursDate) ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"} text-white font-medium`}
                        >
                          {convertingExtraHours ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <PlusCircle size={18} />
                              Convert {extraHoursDays * 8} Hours to{" "}
                              {extraHoursDays} Leave Day
                              {extraHoursDays > 1 ? "s" : ""}
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                      <Clock size={48} className="mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500 font-medium">
                        No extra hours available
                      </p>
                    </div>
                  );
                })()}
              </>
            )}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowExtraHoursModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Header */}
      {isMobileView && !showCalendarView && (
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
            >
              <Menu size={20} className="text-gray-700" />
            </button>
            {/* <CalendarIcon className="w-5 h-5 text-blue-600" /> */}
            <h1 className="text-base font-bold text-gray-800">
              MR Leave & Attendance
            </h1>
          </div>
          {mrList.length > 0 && (
            <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
              Total: {filteredMRList.length}
            </div>
          )}
        </div>
      )}

      {/* Desktop Header */}
      {!showCalendarView && !isMobileView && (
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            MR Leave & Attendance
          </h1>
          {mrList.length > 0 && (
            <div className="flex items-center gap-4">
              <p className="text-lg font-semibold text-gray-700">
                Total Count:{" "}
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                  {filteredMRList.length}
                </span>
              </p>
              <div className="relative w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400 cursor-pointer"
                  size={16}
                  onClick={handleIconClick}
                />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Search MRs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mobile Search */}
      {isMobileView && !showCalendarView && mrList.length > 0 && (
        <div className="mb-4">
          <div className="relative w-full">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
              size={15}
              onClick={handleIconClick}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search MRs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200 text-sm"
            />
          </div>
        </div>
      )}

      {showCalendarView ? (
        <div>
          {isMobileView && (
            <div className="flex justify-between items-center mb-2 bg-white rounded-2xl shadow border border-gray-200 p-3">
              <div className="flex gap-2">
                <button
                  onClick={handlePreviousMR}
                  disabled={getCurrentMRIndex() <= 0}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${getCurrentMRIndex() <= 0 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={() => setShowCalendarView(false)}
                  className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg cursor-pointer text-sm"
                >
                  <ChevronLeft size={18} /> Back
                </button>
              </div>
              <div>
                <button
                  onClick={handleNextMR}
                  disabled={getCurrentMRIndex() >= mrList.length - 1}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${getCurrentMRIndex() >= mrList.length - 1 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )}
          {/* Calendar top nav */}
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4 bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-4">
            {/* Left side - for desktop only */}
            {!isMobileView && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handlePreviousMR}
                  disabled={getCurrentMRIndex() <= 0}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${getCurrentMRIndex() <= 0 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  onClick={() => setShowCalendarView(false)}
                  className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 md:px-4 py-2 rounded-lg cursor-pointer text-sm md:text-base"
                >
                  <ChevronLeft size={18} /> Back to MR List
                </button>

                <button
                  onClick={() =>
                    handleOpenDeleteAttendanceModal(selectedMr?._id)
                  }
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Trash2 size={16} />
                  Delete Attendance
                </button>
              </div>
            )}

            {/* Right side - for both mobile and desktop */}
            <div className="flex gap-2">
              <button
                onClick={() => setCalendarViewType("monthly")}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium cursor-pointer text-sm md:text-base ${calendarViewType === "monthly" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCalendarViewType("annual")}
                className={`px-3 md:px-4 py-1.5 md:py-2 rounded-lg font-medium cursor-pointer text-sm md:text-base ${calendarViewType === "annual" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
              >
                Annual
              </button>
              {!isMobileView && (
                <button
                  onClick={handleNextMR}
                  disabled={getCurrentMRIndex() >= mrList.length - 1}
                  className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${getCurrentMRIndex() >= mrList.length - 1 ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                >
                  <ChevronsRight size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Mobile-specific layout with justify-between */}

          {/* Monthly Calendar - shown on both mobile and desktop */}
          {calendarViewType === "monthly" && (
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-6">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-base md:text-xl font-bold text-gray-800">
                  {selectedMr?.medicalRepName}{" "}
                  {!isMobileView && "- Calendar View"}
                  {selectedMr && !isMobileView && (
                    <span className="ml-2 text-sm md:text-lg font-normal">
                      (Unpaid:{" "}
                      {getLeaveCounts(selectedMr._id, selectedMr.date).total},
                      Swap:{" "}
                      {
                        getLeaveCounts(selectedMr._id, selectedMr.date)
                          .swapLeaves
                      }
                      )
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => navigateMonth("prev")}
                    className="p-1 md:p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    <ChevronLeft size={isMobileView ? 16 : 20} />
                  </button>
                  <span className="text-sm md:text-lg font-semibold">
                    {new Date(currentYear, currentMonth).toLocaleString(
                      "default",
                      { month: "short" },
                    )}{" "}
                    {currentYear}
                  </span>
                  <button
                    onClick={() => navigateMonth("next")}
                    disabled={!canNavigateNext("next", "monthly")}
                    className={`p-1 md:p-2 rounded-lg cursor-pointer ${canNavigateNext("next", "monthly") ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-100 opacity-40 cursor-not-allowed"}`}
                  >
                    <ChevronRight size={isMobileView ? 16 : 20} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 md:gap-2 mb-4 md:mb-6">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      key={day}
                      className={`text-center font-semibold py-1 md:py-2 text-[10px] md:text-base ${day === "Sun" ? "text-red-600" : "text-gray-700"}`}
                    >
                      {isMobileView ? day.charAt(0) : day}
                    </div>
                  ),
                )}
                {getDaysInMonth().map((date, index) => {
                  if (!date)
                    return (
                      <div key={`empty-${index}`} className="h-8 md:h-12" />
                    );
                  const { cellStyle, titleText, isDeletable } =
                    getCalendarCellStyle(date, selectedMr?._id);
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  return (
                    <div
                      key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                      className={`${cellStyle}${!isCurrentMonth ? " opacity-40" : ""} text-xs md:text-base h-8 md:h-12`}
                      title={titleText}
                      onClick={() => {
                        if (isDeletable && selectedMr && !isMobileView) {
                          setCalendarDeleteData({
                            userId: selectedMr._id,
                            date: getDateString(date),
                          });
                          setShowCalendarDeleteModal(true);
                        }
                      }}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-2 md:gap-4 items-center justify-center text-[10px] md:text-sm bg-gray-50 rounded-lg p-2 md:p-4">
                {[
                  ["bg-green-500", "Present"],
                  ["bg-orange-400", "Half Day"],
                  ["bg-purple-500", "Swap Leave"],
                  ["bg-blue-500", "Paid Leave"],
                  ["bg-red-500", "Unpaid Leave"],
                  ["bg-red-400", "Sunday"],
                  ["bg-gray-400", "Holiday"],
                  ["bg-blue-50 border-blue-500", "Today"],
                ].map(([cls, label]) => (
                  <div key={label} className="flex items-center gap-1 md:gap-2">
                    <div className={`w-2 h-2 md:w-4 md:h-4 rounded ${cls}`} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Annual Calendar - shown on both mobile and desktop */}
          {calendarViewType === "annual" && (
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-3 md:p-6">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-base md:text-xl font-bold text-gray-800">
                  {selectedMr?.medicalRepName}{" "}
                  {!isMobileView && "- Annual Calendar"}
                </h2>
                <div className="flex items-center gap-2 md:gap-3">
                  <button
                    onClick={() => navigateYear("prev")}
                    className="p-1 md:p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    <ChevronLeft size={isMobileView ? 16 : 20} />
                  </button>
                  <span className="text-sm md:text-lg font-semibold">
                    {currentYear}
                  </span>
                  <button
                    onClick={() => navigateYear("next")}
                    disabled={!canNavigateNext("next", "annual")}
                    className={`p-1 md:p-2 rounded-lg cursor-pointer ${canNavigateNext("next", "annual") ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-100 opacity-40 cursor-not-allowed"}`}
                  >
                    <ChevronRight size={isMobileView ? 16 : 20} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-6">
                {Array.from({ length: 12 }, (_, mi) => {
                  const monthName = new Date(currentYear, mi).toLocaleString(
                    "default",
                    { month: "short" },
                  );
                  const monthDays = getDaysInMonth(currentYear, mi);
                  return (
                    <div
                      key={monthName}
                      className="border border-gray-200 rounded-lg p-2 md:p-4 bg-white"
                    >
                      <h3 className="text-sm md:text-lg font-semibold text-center mb-2 md:mb-3 text-gray-800">
                        {monthName}
                      </h3>
                      <div className="grid grid-cols-7 gap-0.5 md:gap-1 mb-1 md:mb-2">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div
                            key={`${d}-${i}`}
                            className={`text-center text-[8px] md:text-xs font-medium ${i === 0 ? "text-red-600" : "text-gray-600"}`}
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-0.5 md:gap-1">
                        {monthDays.map((date, index) => {
                          if (!date)
                            return (
                              <div
                                key={`empty-${index}`}
                                className="h-4 md:h-6"
                              />
                            );
                          const { cellStyle, titleText, isDeletable } =
                            getAnnualCellStyle(date, selectedMr?._id);
                          return (
                            <div
                              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                              className={cellStyle}
                              title={titleText}
                              onClick={() => {
                                if (
                                  isDeletable &&
                                  selectedMr &&
                                  !isMobileView
                                ) {
                                  setCalendarDeleteData({
                                    userId: selectedMr._id,
                                    date: getDateString(date),
                                  });
                                  setShowCalendarDeleteModal(true);
                                }
                              }}
                            >
                              {date.getDate()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Legend for Annual view on mobile */}
              {isMobileView && (
                <div className="mt-4 flex flex-wrap gap-2 items-center justify-center text-[10px] bg-gray-50 rounded-lg p-2">
                  {[
                    ["bg-green-500", "Present"],
                    ["bg-orange-400", "Half"],
                    ["bg-purple-500", "Swap"],
                    ["bg-blue-500", "Paid"],
                    ["bg-red-500", "Unpaid"],
                    ["bg-red-400", "Sun"],
                    ["bg-gray-400", "Hol"],
                  ].map(([cls, label]) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded ${cls}`} />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* MR list table */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          {/* Desktop Action Buttons */}
          {!isMobileView && mrList.length > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleOpenAttendanceModal}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Clock size={16} />
                  Record Attendance
                </button>
                <button
                  onClick={handleOpenLeaveModal}
                  className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Calendar size={16} />
                  Apply Leave
                </button>
                <button
                  onClick={handleOpenExtraHoursModal}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Clock4 size={16} />
                  Convert Extra Hours
                </button>
              </div>
            </div>
          )}

          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b text-sm">
              <tr>
                <th className="p-2 md:p-3">Sr No</th>
                <th className="p-2 md:p-3 text-left">MR Name</th>
                <th className="p-2 md:p-3 hidden sm:table-cell">MR Email</th>
                <th className="p-2 md:p-3 hidden md:table-cell">MR Contact</th>
                <th className="p-2 md:p-3">Paid Leave</th>
                <th className="p-2 md:p-3">Leave Taken</th>
                <th className="p-2 md:p-3 hidden lg:table-cell">
                  Remaining Paid
                </th>
                {!isMobileView && (
                  <th className="p-2 md:p-3 hidden xl:table-cell">
                    Extra Hours
                  </th>
                )}
                <th className="p-2 md:p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const leaveCounts = getLeaveCounts(mr._id, mr.date);
                  const remainingPaid = getRemainingPaidLeaves(mr._id, mr.date);
                  const totalExtraHours = getExtraHoursForMR(mr._id);
                  const extraHoursCalc = calculateRemainingTime(
                    totalExtraHours * 60,
                  );

                  const halfDayCount = attendanceRecords.filter((rec) => {
                    if (rec.userId !== mr._id || rec.isLeaveDay) return false;
                    if (rec.attendanceType === "half") return true;
                    return (
                      getAttendanceTypeClient(parseTimeToMinutes(rec.totalTime))
                        .type === "half"
                    );
                  }).length;

                  return (
                    <tr
                      key={mr._id}
                      className={`hover:bg-gray-50 ${(index + 1) % itemsPerPage === 0 || index + 1 === currentMRs.length ? "" : "border-b"}`}
                    >
                      <td className="p-2 md:p-3">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="p-2 md:p-3 text-left">
                        <span className="font-medium text-gray-800 capitalize text-sm md:text-base">
                          {mr.medicalRepName}
                        </span>
                      </td>
                      <td className="p-2 md:p-3 hidden sm:table-cell text-gray-600 text-sm">
                        {mr.email}
                      </td>
                      <td className="p-2 md:p-3 hidden md:table-cell text-gray-600 text-sm">
                        {mr.contactNo}
                      </td>
                      <td className="p-2 md:p-3">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs md:text-sm font-medium">
                          {leaveCounts.paid}
                        </span>
                      </td>
                      <td className="p-2 md:p-3">
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs md:text-sm font-medium">
                          {leaveCounts.total}
                        </span>
                        {leaveCounts.swapLeaves > 0 && (
                          <span className="ml-1 md:ml-2 bg-purple-100 text-purple-800 px-1 md:px-2 py-1 rounded-full text-[10px] md:text-sm font-medium">
                            +{leaveCounts.swapLeaves}
                          </span>
                        )}
                        { !isMobileView && halfDayCount > 0 && (
                          <span className="ml-1 md:ml-2 bg-orange-100 text-orange-800 px-1 md:px-2 py-1 rounded-full text-[10px] md:text-sm font-medium">
                            {halfDayCount}h
                          </span>
                        )}
                      </td>
                      <td className="p-2 md:p-3 hidden lg:table-cell">
                        <span
                          className={`px-2 py-1 rounded-full text-xs md:text-sm font-medium ${parseFloat(remainingPaid) > 5 ? "bg-green-100 text-green-800" : parseFloat(remainingPaid) > 2 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}
                        >
                          {remainingPaid}
                        </span>
                      </td>
                      {!isMobileView && (
                        <td className="p-2 md:p-3 hidden xl:table-cell">
                          {totalExtraHours > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {extraHoursCalc.days > 0 && (
                                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                  {extraHoursCalc.days}d
                                </span>
                              )}
                              {(extraHoursCalc.hours > 0 ||
                                extraHoursCalc.minutes > 0) && (
                                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-medium">
                                  {extraHoursCalc.hours}h{" "}
                                  {extraHoursCalc.minutes}m
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 md:p-3">
                        <button
                          onClick={() => handleView(mr)}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 md:px-3 py-1 rounded-lg cursor-pointer text-xs md:text-sm"
                          title="View Calendar"
                        >
                          <Calendar size={isMobileView ? 14 : 16} />
                          {!isMobileView && "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={!isMobileView ? 9 : 8}
                    className="p-3 text-center text-gray-500"
                  >
                    No MR records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {currentMRs.length > 0 && totalPages > 1 && (
            <div className="mt-4 p-3 md:p-5 flex justify-center gap-1 md:gap-2 flex-wrap">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-2 md:px-3 py-1 rounded w-8 md:w-10 text-center transition cursor-pointer text-sm ${currentPage === page ? "bg-indigo-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
                  >
                    {page}
                  </button>
                ),
              )}
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-2 md:px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer text-sm"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mobile FAB Menu */}
      {isMobileView && !showCalendarView && <MobileFabMenu />}
    </div>
  );
};

export default LeaveAttendance;
