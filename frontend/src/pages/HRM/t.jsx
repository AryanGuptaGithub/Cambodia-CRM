import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  User,
  X,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  CalendarDays,
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";
import Sidebar from "../../components/Sidebar";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// ─── Shared half-day helper ───────────────────────────────────────────────────
const getAttendanceTypeClient = (totalMinutesWorked) => {
  if (totalMinutesWorked >= 7 * 60)
    return { type: "full", expectedMinutes: 8 * 60 };
  if (totalMinutesWorked >= 4 * 60)
    return { type: "half", expectedMinutes: 4 * 60 };
  return { type: "short", expectedMinutes: 8 * 60 };
};

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h = 0, m = 0] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

const LeaveAttendance = () => {
  const [mrList, setMrList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [selectedMr, setSelectedMr] = useState(null);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarViewType, setCalendarViewType] = useState("monthly");

  const currentDate = new Date();
  const [currentMonth, setCurrentMonth] = useState(currentDate.getMonth());
  const [currentYear, setCurrentYear] = useState(currentDate.getFullYear());

  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const inputRef = useRef(null);

  const [holidays, setHolidays] = useState([]);
  const [mrLeaves, setMrLeaves] = useState({});

  // ── Mobile detection ──────────────────────────────────────────────────────
  const [isMobileView, setIsMobileView] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobileView(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // ─── Helpers ──────────────────────────────────────────────────────────────
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

  // ─── MR navigation ────────────────────────────────────────────────────────
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

  // ─── Data fetching ─────────────────────────────────────────────────────────
  const fetchMRList = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `${backendUrl}/api/stock-transfer-to-mr/mrs-list`
      );
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
  };

  const fetchAttendanceRecords = async () => {
    try {
      const res = await axios.get(`${backendUrl}/api/hrm/leaves/attendance`);
      setAttendanceRecords(res.data || []);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
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
        mr.contactNo?.includes(searchTerm))
  );

  const totalPages = Math.ceil(filteredMRList.length / itemsPerPage);
  const currentMRs = filteredMRList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
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

  const isHalfDayAttendance = (date, mrId) => {
    const att = getAttendanceForDate(date, mrId);
    if (!att || att.isLeaveDay) return false;
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
      (l) => l.status === "approved" && l.leaveType === "unpaid"
    );
    const swapLeaves = leaves.filter(
      (l) => l.status === "approved" && l.leaveType === "swapleave"
    );
    const paidLeaves = leaves.filter(
      (l) => l.status === "approved" && l.leaveType === "paid"
    );
    const valid = (arr) =>
      arr.filter((l) => {
        const d = new Date(l.leaveDate);
        d.setHours(0, 0, 0, 0);
        return d <= today;
      });
    const getMonthsOfService = (jd) => {
      if (!jd) return 0;
      const join = new Date(jd);
      const now = new Date();
      const months =
        (now.getFullYear() - join.getFullYear()) * 12 +
        (now.getMonth() - join.getMonth());
      const daysInMonth = now.getDate() - join.getDate();
      return Math.max(0, daysInMonth >= 30 ? months : Math.max(0, months - 1));
    };
    const paid = parseFloat((getMonthsOfService(joinDate) * 1).toFixed(2));
    return {
      paid,
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
        m === 0 ? (setCurrentYear((y) => y - 1), 11) : m - 1
      );
    } else {
      if (canNavigateNext("next", "monthly")) {
        setCurrentMonth((m) =>
          m === 11 ? (setCurrentYear((y) => y + 1), 0) : m + 1
        );
      }
    }
  };
  const navigateYear = (direction) => {
    if (direction === "prev") setCurrentYear((y) => y - 1);
    else if (canNavigateNext("next", "annual")) setCurrentYear((y) => y + 1);
  };

  const getExtraHoursForMR = (mrId) => {
    return (
      attendanceRecords
        .filter((r) => r.userId === mrId && r.isLeaveDay !== true)
        .reduce((sum, r) => sum + (r.extraHoursInMinutes || 0), 0) / 60
    );
  };

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

  if (loading) return <div className="p-6 text-center">Loading MR List...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  // ─── Calendar cell style ───────────────────────────────────────────────────
  const getCalendarCellStyle = (date, mrId) => {
    if (!date)
      return {
        cellStyle:
          "h-12 flex items-center justify-center rounded-lg border-2 border-transparent",
        titleText: "",
      };

    const attendance = getAttendanceForDate(date, mrId);
    const leaveInfo = isLeave(date, mrId);
    const isSundayDay = isSunday(date);
    const isHolidayDay = isHoliday(date);
    const isToday = date.toDateString() === new Date().toDateString();
    const halfDay =
      attendance && !attendance.isLeaveDay && isHalfDayAttendance(date, mrId);

    let cellStyle = "h-12 flex items-center justify-center rounded-lg border-2 ";
    let titleText = "";

    if (attendance && !attendance.isLeaveDay) {
      if (halfDay) {
        cellStyle += "bg-orange-400 text-white border-orange-500";
        titleText = "Half Day";
      } else {
        cellStyle += "bg-green-500 text-white border-green-600";
        titleText = "Present";
      }
    } else if (leaveInfo.isLeave) {
      if (leaveInfo.type === "swapleave") {
        cellStyle += "bg-purple-500 text-white border-purple-600";
        titleText = "Swap Leave";
      } else if (leaveInfo.type === "paid") {
        cellStyle += "bg-blue-500 text-white border-blue-600";
        titleText = "Paid Leave";
      } else {
        cellStyle += "bg-red-500 text-white border-red-600";
        titleText = "Unpaid Leave";
      }
    } else if (isSundayDay) {
      cellStyle += "bg-red-400 text-white border-red-500";
      titleText = "Sunday";
    } else if (isHolidayDay) {
      cellStyle += "bg-gray-400 text-white border-gray-500";
      titleText = `Holiday: ${getHolidayName(date)}`;
    } else if (isToday) {
      cellStyle += "border-blue-500 bg-blue-50";
      titleText = "Today";
    } else {
      cellStyle += "border-gray-200 bg-gray-50";
      titleText = "Working Day";
    }

    return { cellStyle: cellStyle.trim(), titleText };
  };

  const getAnnualCellStyle = (date, mrId) => {
    const attendance = getAttendanceForDate(date, mrId);
    const leaveInfo = isLeave(date, mrId);
    const halfDay =
      attendance && !attendance.isLeaveDay && isHalfDayAttendance(date, mrId);

    let cellStyle = "h-6 flex items-center justify-center rounded text-xs ";
    let titleText = "";

    if (attendance && !attendance.isLeaveDay) {
      cellStyle += halfDay
        ? "bg-orange-400 text-white"
        : "bg-green-500 text-white";
      titleText = halfDay ? "Half Day" : "Present";
    } else if (leaveInfo.isLeave) {
      if (leaveInfo.type === "swapleave")
        cellStyle += "bg-purple-500 text-white";
      else if (leaveInfo.type === "paid") cellStyle += "bg-blue-500 text-white";
      else cellStyle += "bg-red-500 text-white";
      titleText = `${leaveInfo.type === "swapleave" ? "Swap" : leaveInfo.type === "paid" ? "Paid" : "Unpaid"} Leave`;
    } else if (isSunday(date)) {
      cellStyle += "bg-red-400 text-white";
      titleText = "Sunday";
    } else if (isHoliday(date)) {
      cellStyle += "bg-gray-400 text-white";
      titleText = `Holiday: ${getHolidayName(date)}`;
    } else {
      cellStyle += "bg-gray-100";
      titleText = "Working Day";
    }

    return { cellStyle: cellStyle.trim(), titleText };
  };

  // ─── Pagination renderer (like DailyReports) ──────────────────────────────
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const visiblePages = [];
    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= currentPage - 1 && i <= currentPage + 1)
      ) {
        visiblePages.push(i);
      } else if (
        (i === currentPage - 2 && currentPage > 3) ||
        (i === currentPage + 2 && currentPage < totalPages - 2)
      ) {
        visiblePages.push("...");
      }
    }

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

      {/* ── List view header ── */}
      {!showCalendarView && (
        <>
          {/* MOBILE Header */}
          {isMobileView && (
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="p-2 rounded-full bg-gray-100 active:bg-gray-200"
                >
                  <Menu size={20} className="text-gray-700" />
                </button>
                <CalendarDays className="w-5 h-5 text-indigo-600" />
                <h1 className="text-base font-bold text-gray-800">
                  Leave & Attendance
                </h1>
              </div>
              <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                Total: {filteredMRList.length}
              </div>
            </div>
          )}

          {/* DESKTOP Header */}
          {!isMobileView && (
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

          {/* MOBILE Search */}
          {isMobileView && (
            <div className="relative mb-3">
              <input
                type="text"
                placeholder="Search MRs..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-9 pr-9 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full text-sm"
              />
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                size={15}
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </>
      )}

      {showCalendarView ? (
        <div>
          {/* ── Calendar top nav ── */}
          <div
            className={`flex justify-between items-center mb-4 bg-white rounded-2xl shadow border border-gray-200 ${isMobileView ? "p-3 flex-col gap-3" : "p-4"}`}
          >
            <div className="flex gap-2 w-full">
              <button
                onClick={handlePreviousMR}
                disabled={getCurrentMRIndex() <= 0}
                className={`flex items-center gap-1 px-2 py-2 rounded-lg transition-colors ${
                  getCurrentMRIndex() <= 0
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                <ChevronsLeft size={16} />
              </button>
              <button
                onClick={() => setShowCalendarView(false)}
                className={`flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg cursor-pointer ${isMobileView ? "text-xs flex-1" : "px-4"}`}
              >
                <ChevronLeft size={16} />{" "}
                {isMobileView ? "Back" : "Back to MR List"}
              </button>
            </div>
            <div className={`flex gap-2 ${isMobileView ? "w-full" : ""}`}>
              <button
                onClick={() => setCalendarViewType("monthly")}
                className={`${isMobileView ? "flex-1 text-xs py-2" : "px-4 py-2"} rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "monthly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setCalendarViewType("annual")}
                className={`${isMobileView ? "flex-1 text-xs py-2" : "px-4 py-2"} rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "annual"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Annual
              </button>
              <button
                onClick={handleNextMR}
                disabled={getCurrentMRIndex() >= mrList.length - 1}
                className={`flex items-center gap-1 px-2 py-2 rounded-lg transition-colors ${
                  getCurrentMRIndex() >= mrList.length - 1
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>

          {calendarViewType === "monthly" ? (
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-4 md:p-6">
              <div className="flex justify-between items-start md:items-center mb-4 md:mb-6 gap-2">
                <div>
                  <h2 className={`font-bold text-gray-800 ${isMobileView ? "text-base" : "text-xl"}`}>
                    {selectedMr?.medicalRepName}
                  </h2>
                  {selectedMr && (
                    <p className="text-xs md:text-sm text-gray-500 mt-0.5">
                      Unpaid: {getLeaveCounts(selectedMr._id, selectedMr.date).total} &nbsp;·&nbsp;
                      Swap: {getLeaveCounts(selectedMr._id, selectedMr.date).swapLeaves}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateMonth("prev")}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={`font-semibold text-center ${isMobileView ? "text-sm w-28" : "text-lg"}`}>
                    {new Date(currentYear, currentMonth).toLocaleString(
                      "default",
                      { month: isMobileView ? "short" : "long" }
                    )}{" "}
                    {currentYear}
                  </span>
                  <button
                    onClick={() => navigateMonth("next")}
                    disabled={!canNavigateNext("next", "monthly")}
                    className={`p-2 rounded-lg cursor-pointer ${
                      canNavigateNext("next", "monthly")
                        ? "bg-gray-100 hover:bg-gray-200"
                        : "bg-gray-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-4 md:mb-6">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    className={`text-center font-semibold py-1 md:py-2 ${day === "Sun" ? "text-red-600" : "text-gray-700"} ${isMobileView ? "text-xs" : "text-sm"}`}
                  >
                    {isMobileView ? day.slice(0, 1) : day}
                  </div>
                ))}
                {getDaysInMonth().map((date, index) => {
                  if (!date)
                    return (
                      <div
                        key={`empty-${index}`}
                        className={isMobileView ? "h-9" : "h-12"}
                      />
                    );
                  const { cellStyle, titleText } = getCalendarCellStyle(
                    date,
                    selectedMr?._id
                  );
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  return (
                    <div
                      key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                      className={`${cellStyle}${!isCurrentMonth ? " opacity-40" : ""} ${isMobileView ? "h-9 text-xs" : "h-12 text-sm"}`}
                      title={titleText}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div className={`flex flex-wrap gap-2 md:gap-4 items-center text-xs md:text-sm bg-gray-50 rounded-lg ${isMobileView ? "p-3" : "p-4"}`}>
                {[
                  ["bg-green-500  border-green-600", "Present"],
                  ["bg-orange-400 border-orange-500", "Half Day"],
                  ["bg-purple-500 border-purple-600", "Swap Leave"],
                  ["bg-blue-500   border-blue-600", "Paid Leave"],
                  ["bg-red-500    border-red-600", "Unpaid Leave"],
                  ["bg-red-400    border-red-500", "Sunday"],
                  ["bg-gray-400   border-gray-500", "Holiday"],
                  ["bg-blue-50    border-blue-500", "Today"],
                ].map(([cls, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 md:w-4 md:h-4 rounded border-2 ${cls}`} />
                    <span className="text-gray-600">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Annual view */
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-4 md:p-6">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <div>
                  <h2 className={`font-bold text-gray-800 ${isMobileView ? "text-base" : "text-xl"}`}>
                    {selectedMr?.medicalRepName} — Annual
                  </h2>
                  {selectedMr && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Unpaid: {getLeaveCounts(selectedMr._id, selectedMr.date).total} · Swap:{" "}
                      {getLeaveCounts(selectedMr._id, selectedMr.date).swapLeaves}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigateYear("prev")}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className={`font-semibold ${isMobileView ? "text-sm" : "text-lg"}`}>
                    {currentYear}
                  </span>
                  <button
                    onClick={() => navigateYear("next")}
                    disabled={!canNavigateNext("next", "annual")}
                    className={`p-2 rounded-lg cursor-pointer ${
                      canNavigateNext("next", "annual")
                        ? "bg-gray-100 hover:bg-gray-200"
                        : "bg-gray-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 12 }, (_, mi) => {
                  const monthName = new Date(currentYear, mi).toLocaleString(
                    "default",
                    { month: "short" }
                  );
                  const monthDays = getDaysInMonth(currentYear, mi);
                  return (
                    <div
                      key={monthName}
                      className="border border-gray-200 rounded-lg p-2 md:p-4 bg-white"
                    >
                      <h3 className={`font-semibold text-center mb-2 text-gray-800 ${isMobileView ? "text-sm" : "text-base"}`}>
                        {monthName}
                      </h3>
                      <div className="grid grid-cols-7 gap-0.5 mb-1">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div
                            key={`${d}-${i}`}
                            className={`text-center font-medium ${isMobileView ? "text-[9px]" : "text-xs"} ${i === 0 ? "text-red-600" : "text-gray-600"}`}
                          >
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-0.5">
                        {monthDays.map((date, index) => {
                          if (!date)
                            return (
                              <div
                                key={`empty-${index}`}
                                className={isMobileView ? "h-5" : "h-6"}
                              />
                            );
                          const { cellStyle, titleText } = getAnnualCellStyle(
                            date,
                            selectedMr?._id
                          );
                          return (
                            <div
                              key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                              className={`${cellStyle} ${isMobileView ? "h-5 text-[9px]" : "h-6 text-xs"}`}
                              title={titleText}
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
            </div>
          )}
        </div>
      ) : (
        /* ── MR list table ── */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <table
            className={`w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm ${isMobileView ? "min-w-[480px]" : ""}`}
          >
            <thead className={`bg-gray-100 text-gray-700 border-b ${isMobileView ? "text-xs" : "text-sm"}`}>
              <tr>
                <th className="p-2 md:p-3">Sr No</th>
                <th className="p-2 md:p-3">MR Name</th>
                {!isMobileView && <th className="p-3">MR Email</th>}
                {!isMobileView && <th className="p-3">MR Contact</th>}
                <th className="p-2 md:p-3">Paid Leave</th>
                <th className="p-2 md:p-3">Leave Taken</th>
                <th className="p-2 md:p-3">Remaining</th>
                {!isMobileView && <th className="p-3">Extra Hours</th>}
                <th className="p-2 md:p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const leaveCounts = getLeaveCounts(mr._id, mr.date);
                  const remainingPaid = getRemainingPaidLeaves(mr._id, mr.date);
                  const totalExtraHours = getExtraHoursForMR(mr._id);
                  const extraHoursCalc = calculateRemainingTime(totalExtraHours * 60);

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
                      className="hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <td className="p-2 md:p-3 text-xs md:text-sm">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>
                      <td className="p-2 md:p-3 text-xs md:text-sm">
                        <span className="font-medium text-gray-800 capitalize">
                          {mr.medicalRepName}
                        </span>
                        {isMobileView && mr.contactNo && (
                          <div className="text-xs text-gray-400 mt-0.5">
                            {mr.contactNo}
                          </div>
                        )}
                      </td>
                      {!isMobileView && (
                        <td className="p-3 text-sm text-gray-600">{mr.email}</td>
                      )}
                      {!isMobileView && (
                        <td className="p-3 text-sm text-gray-600">{mr.contactNo}</td>
                      )}
                      <td className="p-2 md:p-3">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                          {leaveCounts.paid}
                        </span>
                      </td>
                      <td className="p-2 md:p-3">
                        <div className="flex flex-col items-center gap-1">
                          <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-xs font-medium">
                            {leaveCounts.total}
                          </span>
                          {leaveCounts.swapLeaves > 0 && (
                            <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              {leaveCounts.swapLeaves} swap
                            </span>
                          )}
                          {halfDayCount > 0 && (
                            <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full text-xs font-medium">
                              {halfDayCount} half
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2 md:p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            parseFloat(remainingPaid) > 5
                              ? "bg-green-100 text-green-800"
                              : parseFloat(remainingPaid) > 2
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {remainingPaid}
                        </span>
                      </td>
                      {!isMobileView && (
                        <td className="p-3">
                          {totalExtraHours > 0 ? (
                            <div className="flex flex-col items-center gap-1">
                              {extraHoursCalc.days > 0 && (
                                <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                  <Clock size={10} />
                                  {extraHoursCalc.days}d
                                </span>
                              )}
                              {(extraHoursCalc.hours > 0 || extraHoursCalc.minutes > 0) && (
                                <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                                  <Clock size={10} />
                                  {extraHoursCalc.hours}h {extraHoursCalc.minutes}m
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">—</span>
                          )}
                        </td>
                      )}
                      <td className="p-2 md:p-3">
                        <button
                          onClick={() => handleView(mr)}
                          className={`flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer mx-auto ${isMobileView ? "px-2 py-1 text-xs" : "px-3 py-1 text-sm"}`}
                          title="View Calendar"
                        >
                          <Calendar size={isMobileView ? 12 : 16} />
                          {isMobileView ? "View" : "View Calendar"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={isMobileView ? 6 : 9}
                    className="p-6 text-center text-gray-500 text-sm"
                  >
                    No MR records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {renderPagination()}
        </div>
      )}
    </div>
  );
};

export default LeaveAttendance;
