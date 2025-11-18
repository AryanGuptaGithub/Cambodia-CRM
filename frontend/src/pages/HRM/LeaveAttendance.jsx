import React, { useState, useEffect, useMemo, useRef } from "react";
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
} from "lucide-react";
import axios from "axios";
import { showToast } from "../../utils/toast";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Custom Dropdown Component
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
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
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
        className={`w-full border border-gray-300 rounded-md px-3 py-2 text-left focus:outline-none focus:ring-2
           focus:ring-indigo-500 disabled:bg-gray-100 flex justify-between items-center ${
             disabled
               ? "cursor-not-allowed opacity-60"
               : "cursor-pointer hover:border-gray-400"
           } ${!value ? "text-gray-500" : "text-gray-900"}`}
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
                className={`w-full px-3 py-2 text-left hover:bg-indigo-50 hover:text-indigo-900 transition-colors duration-150 ${
                  value === option.value
                    ? "bg-indigo-100 text-indigo-900 font-medium"
                    : "text-gray-900"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
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

  // Calendar view states
  const [selectedMr, setSelectedMr] = useState(null);
  const [showCalendarView, setShowCalendarView] = useState(false);
  const [calendarViewType, setCalendarViewType] = useState("monthly");

  // Set initial state to current date
  const currentDate = new Date();
  const [currentMonth, setCurrentMonth] = useState(currentDate.getMonth());
  const [currentYear, setCurrentYear] = useState(currentDate.getFullYear());

  // Attendance data
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [showAddAttendanceModal, setShowAddAttendanceModal] = useState(false);
  const [selectedAttendanceMr, setSelectedAttendanceMr] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const inputRef = useRef(null);

  // Modal tab state
  const [modalActiveTab, setModalActiveTab] = useState("attendance");

  // State for date range in modal - Attendance
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // State for leave application
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveType, setLeaveType] = useState("paid");
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Holiday state
  const [holidays, setHolidays] = useState([]);

  // Leave data
  const [mrLeaves, setMrLeaves] = useState({});

  // Get today's date in YYYY-MM-DD format for max date attribute
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  };

  // Check if a date is in the future
  const isFutureDate = (dateString) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inputDate = new Date(dateString);
    inputDate.setHours(0, 0, 0, 0);
    return inputDate > today;
  };

  useEffect(() => {
    fetchMRList();
    fetchAttendanceRecords();
    fetchHolidays();
    fetchLeaves();
  }, []);

  const fetchMRList = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/staffs`);
      setMrList(response.data || []);
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
      const response = await axios.get(`${backendUrl}/api/attendance`);
      setAttendanceRecords(response.data || []);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
    }
  };

  // CORRECTED: Fetch leaves with proper user ID matching
  const fetchLeaves = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/leaves`);
      const leavesData = response.data || [];

      // Group leaves by user ID - handle both object and string userId
      const leavesByUser = {};
      leavesData.forEach((leave) => {
        if (leave.status === "approved") {
          // Handle both cases: userId as object or string
          let userId;
          if (typeof leave.userId === "object" && leave.userId !== null) {
            userId = leave.userId._id; // Extract _id from object
          } else {
            userId = leave.userId; // Use string directly
          }

          if (!leavesByUser[userId]) {
            leavesByUser[userId] = [];
          }
          leavesByUser[userId].push(leave);
        }
      });

      console.log("Processed mrLeaves:", leavesByUser);
      setMrLeaves(leavesByUser);
    } catch (err) {
      console.error("Failed to fetch leaves:", err);
      setMrLeaves({});
    }
  };

  const fetchHolidays = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/holidays`);
      const holidaysData = response.data.holidays;
      if (Array.isArray(holidaysData)) {
        setHolidays(holidaysData);
      } else {
        console.warn("Holidays API did not return an array:", holidaysData);
        setHolidays([]);
      }
    } catch (err) {
      console.error("Failed to fetch holidays:", err);
      setHolidays([]);
    }
  };

  // Calculate months of service for paid leave calculation
  const getMonthsOfService = (joinDate) => {
    if (!joinDate) return 0;

    const join = new Date(joinDate);
    const today = new Date();

    const months =
      (today.getFullYear() - join.getFullYear()) * 12 +
      (today.getMonth() - join.getMonth());

    const daysInMonth = today.getDate() - join.getDate();
    const adjustedMonths = daysInMonth >= 30 ? months : Math.max(0, months - 1);

    return Math.max(0, adjustedMonths);
  };

  // Calculate paid leaves based on months of service (1.25 days per month)
  const calculatePaidLeaves = (joinDate) => {
    const monthsOfService = getMonthsOfService(joinDate);
    return (monthsOfService * 1.25).toFixed(2);
  };

  // Calculate all dates between start and end date
  const getDatesBetween = (startDateStr, endDateStr) => {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const dates = [];

    if (start.toDateString() === end.toDateString()) {
      return [start];
    }

    const current = new Date(start);
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  };

  // Check if date is Sunday
  const isSunday = (date) => {
    const day = new Date(date).getDay();
    return day === 0;
  };

  // Check if date is holiday
  const isHoliday = (date) => {
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return false;
    }

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    return holidays.some((holiday) => {
      if (!holiday || !holiday.date) return false;

      const holidayDate = new Date(holiday.date);
      holidayDate.setHours(0, 0, 0, 0);

      return holidayDate.getTime() === checkDate.getTime();
    });
  };

  // Check if any date in range is holiday
  const isDateRangeHasHoliday = (startDateStr, endDateStr) => {
    const datesInRange = getDatesBetween(startDateStr, endDateStr);
    return datesInRange.some((date) => isHoliday(date));
  };

  // Get holiday name for a date
  const getHolidayName = (date) => {
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return null;
    }

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    const holiday = holidays.find((holiday) => {
      if (!holiday || !holiday.date) return false;

      const holidayDate = new Date(holiday.date);
      holidayDate.setHours(0, 0, 0, 0);

      return holidayDate.getTime() === checkDate.getTime();
    });

    return holiday ? holiday.name : null;
  };

  // Get all holiday names in date range
  const getHolidayNamesInRange = (startDateStr, endDateStr) => {
    const datesInRange = getDatesBetween(startDateStr, endDateStr);
    const holidayNames = [];

    datesInRange.forEach((date) => {
      const holidayName = getHolidayName(date);
      if (holidayName && !holidayNames.includes(holidayName)) {
        holidayNames.push(holidayName);
      }
    });

    return holidayNames;
  };

  // Filter MR list based on search
  const filteredMRList = mrList.filter(
    (mr) =>
      mr.medicalRepName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mr.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mr.contactNo?.includes(searchTerm)
  );

  // Pagination
  const totalPages = Math.ceil(filteredMRList.length / itemsPerPage);
  const currentMRs = filteredMRList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // CORRECTED: Calendar functions to handle string userId
  const getAttendanceForDate = (date, mrId) => {
    if (!mrId) return null;
    const dateString = date.toISOString().split("T")[0];

    // Handle both object and string userId
    const records = attendanceRecords.filter((record) => {
      const recordUserId = record.userId?._id || record.userId; // Handle both populated and string ID
      const recordDate = new Date(record.loginTime).toISOString().split("T")[0];
      return recordUserId === mrId && recordDate === dateString;
    });

    return records.length > 0 ? records[0] : null;
  };

  // CORRECTED: Get leave count for a specific MR - count only approved leaves
  const getLeaveCountForMr = (mrId) => {
    if (!mrId) return 0;
    const leaves = mrLeaves[mrId] || [];

    // Count only approved leaves
    const approvedLeaves = leaves.filter(
      (leave) => leave.status === "approved"
    );

    return approvedLeaves.length;
  };

  // CORRECTED: Check if date is leave using actual leave data - only approved leaves
  const isLeave = (date, mrId) => {
    if (!mrId) return false;

    const leaves = mrLeaves[mrId] || [];
    const dateString = date.toISOString().split("T")[0];

    return leaves.some((leave) => {
      const leaveDate = new Date(leave.leaveDate).toISOString().split("T")[0];
      return leaveDate === dateString && leave.status === "approved";
    });
  };

  // CORRECTED: Get leave details for tooltip - only for approved leaves
  const getLeaveDetails = (date, mrId) => {
    if (!mrId) return null;

    const leaves = mrLeaves[mrId] || [];
    const dateString = date.toISOString().split("T")[0];

    const leaveOnDate = leaves.find((leave) => {
      const leaveDate = new Date(leave.leaveDate).toISOString().split("T")[0];
      return leaveDate === dateString && leave.status === "approved";
    });

    return leaveOnDate
      ? {
          reason: leaveOnDate.reason,
          type: leaveOnDate.leaveType,
          status: leaveOnDate.status,
        }
      : null;
  };

  // CORRECTED: Get leave counts with proper user ID matching
  const getLeaveCounts = (mrId, joinDate) => {
    // Get leaves for this MR - mrId should match the userId in leaves data
    const leaves = mrLeaves[mrId] || [];

    // Filter only approved leaves
    const approvedLeaves = leaves.filter(
      (leave) => leave.status === "approved"
    );

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Filter leaves to include only past and current dates
    const validLeaves = approvedLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      date.setHours(0, 0, 0, 0);
      return date <= currentDate;
    });

    // Monthly leaves count
    const monthlyLeaves = validLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).length;

    // Annual leaves count
    const annualLeaves = validLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= yearStart && date <= yearEnd;
    }).length;

    // Calculate paid leaves based on months of service
    const paidLeavesEntitlement = calculatePaidLeaves(joinDate);

    return {
      monthly: monthlyLeaves,
      annual: annualLeaves,
      paid: parseFloat(paidLeavesEntitlement),
      total: validLeaves.length, // Total approved leaves
    };
  };

  // CORRECTED: Calculate remaining paid leaves correctly
  const getRemainingPaidLeaves = (mrId, joinDate) => {
    const leaveCounts = getLeaveCounts(mrId, joinDate);
    const remaining = leaveCounts.paid - leaveCounts.total; // Use total approved leaves
    return Math.max(0, remaining).toFixed(2);
  };

  const getDaysInMonth = (year = currentYear, month = currentMonth) => {
    const days = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  // Check if navigation to next month/year is allowed
  const canNavigateNext = (direction, type = "monthly") => {
    const today = new Date();
    const currentYearToday = today.getFullYear();
    const currentMonthToday = today.getMonth();

    if (type === "monthly") {
      if (direction === "next") {
        return (
          currentYear < currentYearToday ||
          (currentYear === currentYearToday && currentMonth < currentMonthToday)
        );
      }
    } else {
      if (direction === "next") {
        return currentYear < currentYearToday;
      }
    }
    return true;
  };

  const navigateMonth = (direction) => {
    if (direction === "prev") {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else {
      if (canNavigateNext("next", "monthly")) {
        if (currentMonth === 11) {
          setCurrentMonth(0);
          setCurrentYear(currentYear + 1);
        } else {
          setCurrentMonth(currentMonth + 1);
        }
      }
    }
  };

  const navigateYear = (direction) => {
    if (direction === "prev") {
      setCurrentYear(currentYear - 1);
    } else {
      if (canNavigateNext("next", "annual")) {
        setCurrentYear(currentYear + 1);
      }
    }
  };

  // Calculate attendance statistics
  const getAttendanceStats = (mrId) => {
    // Handle both object and string userId
    const mrRecords = attendanceRecords.filter((record) => {
      const recordUserId = record.userId?._id || record.userId;
      return recordUserId === mrId;
    });

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Monthly attendance count
    const monthlyAttendance = mrRecords.filter((record) => {
      const recordDate = new Date(record.loginTime);
      return recordDate >= currentMonthStart && recordDate <= currentMonthEnd;
    }).length;

    // Annual attendance count
    const annualAttendance = mrRecords.filter((record) => {
      const recordDate = new Date(record.loginTime);
      return recordDate >= yearStart && recordDate <= yearEnd;
    }).length;

    // Calculate attendance percentage
    const totalWorkingDays = getWorkingDaysInMonth(currentYear, currentMonth);
    const attendancePercentage =
      totalWorkingDays > 0
        ? ((monthlyAttendance / totalWorkingDays) * 100).toFixed(1)
        : 0;

    const today = new Date();
    const todayRecord = mrRecords.find((record) => {
      const recordDate = new Date(record.loginTime);
      return (
        recordDate.toDateString() === today.toDateString() && !record.logoutTime
      );
    });

    return {
      monthly: monthlyAttendance,
      annual: annualAttendance,
      percentage: attendancePercentage,
      currentStatus: todayRecord ? "Logged In" : "Logged Out",
      currentAttendanceId: todayRecord?._id,
    };
  };

  // Helper function to get working days in a month
  const getWorkingDaysInMonth = (year, month) => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    let workingDays = 0;

    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      if (date.getDay() !== 0) {
        workingDays++;
      }
    }

    return workingDays;
  };

  // Handle manual attendance record
  const handleRecordAttendance = async () => {
    if (!selectedAttendanceMr || !startDate || !startTime || !endTime) {
      alert("Please fill all fields");
      return;
    }

    if (startTime >= endTime) {
      alert("End time must be after start time");
      return;
    }

    // Check if date is in the future
    if (isFutureDate(startDate)) {
      alert("Cannot record attendance for future dates");
      return;
    }

    const loginDateTime = new Date(`${startDate}T${startTime}`);
    const logoutDateTime = new Date(`${startDate}T${endTime}`);

    if (isSunday(startDate)) {
      alert("Cannot record attendance on Sunday");
      return;
    }

    if (isDateRangeHasHoliday(startDate, startDate)) {
      const holidayNames = getHolidayNamesInRange(startDate, startDate);
      alert(`Cannot record attendance on holiday: ${holidayNames.join(", ")}`);
      return;
    }

    const selectedDate = new Date(startDate);
    if (isLeave(selectedDate, selectedAttendanceMr)) {
      alert("Cannot record attendance on a leave day");
      return;
    }

    try {
      setAttendanceLoading(true);

      const attendanceData = {
        userId: selectedAttendanceMr,
        loginTime: loginDateTime.toISOString(),
        logoutTime: logoutDateTime.toISOString(),
      };

      const response = await axios.post(
        `${backendUrl}/api/attendance/record`,
        attendanceData
      );

      if (response.data.success) {
        showToast("success", "Attendance recorded successfully!");
        setShowAddAttendanceModal(false);
        setSelectedAttendanceMr(null);
        setStartDate("");
        setStartTime("");
        setEndTime("");

        fetchAttendanceRecords();
      }
    } catch (err) {
      alert(
        "Failed to record attendance: " +
          (err.response?.data?.message || err.message)
      );
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Handle leave application
  const handleApplyLeave = async () => {
    if (!selectedAttendanceMr || !leaveDate || !leaveReason) {
      alert("Please fill all required fields");
      return;
    }

    // Check if date is in the future
    if (isFutureDate(leaveDate)) {
      alert("Cannot apply for leave for future dates");
      return;
    }

    if (isSunday(leaveDate)) {
      alert("Cannot apply for leave on Sunday");
      return;
    }

    if (isHoliday(leaveDate)) {
      alert(`Cannot apply for leave on holiday: ${getHolidayName(leaveDate)}`);
      return;
    }

    const selectedDate = new Date(leaveDate);
    if (getAttendanceForDate(selectedDate, selectedAttendanceMr)) {
      alert("Cannot apply for leave on a day with existing attendance");
      return;
    }

    try {
      setLeaveLoading(true);

      const leaveData = {
        userId: selectedAttendanceMr,
        leaveDate: new Date(leaveDate).toISOString(),
        reason: leaveReason,
        leaveType: leaveType,
        status: "approved",
      };

      const response = await axios.post(`${backendUrl}/api/leaves`, leaveData);

      if (response.data.success) {
        showToast("success", "Leave applied successfully!");
        setShowAddAttendanceModal(false);
        setSelectedAttendanceMr(null);
        setLeaveDate("");
        setLeaveReason("");
        setLeaveType("paid");

        fetchLeaves();
      }
    } catch (err) {
      alert(
        "Failed to apply leave: " + (err.response?.data?.message || err.message)
      );
    } finally {
      setLeaveLoading(false);
    }
  };

  // Initialize modal with current date when opened
  const handleAddAttendance = () => {
    setShowAddAttendanceModal(true);
    setModalActiveTab("attendance");
    setSelectedAttendanceMr(null);

    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    setStartDate(todayString);
    setLeaveDate(todayString);

    setStartTime("09:00");
    setEndTime("17:00");

    setLeaveReason("");
    setLeaveType("paid");
  };

  // Convert mrList to dropdown options
  const mrOptions = mrList.map((mr) => ({
    value: mr._id,
    label: `${mr.medicalRepName} (${mr.MRId})`,
  }));

  // Handle view action - open calendar for specific MR
  const handleView = (mr) => {
    setSelectedMr(mr);
    setShowCalendarView(true);
    setCalendarViewType("monthly");
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  if (loading) return <div className="p-6 text-center">Loading MR List...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      {showAddAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">
              {modalActiveTab === "attendance"
                ? "Record Attendance"
                : "Apply Leave"}
            </h2>

            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => setModalActiveTab("attendance")}
                className={`flex-1 py-2 px-4 text-center font-medium ${
                  modalActiveTab === "attendance"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Attendance
              </button>
              <button
                onClick={() => setModalActiveTab("leave")}
                className={`flex-1 py-2 px-4 text-center font-medium ${
                  modalActiveTab === "leave"
                    ? "border-b-2 border-blue-500 text-blue-600"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Leave
              </button>
            </div>

            {/* MR Selection Dropdown */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Medical Representative
              </label>
              <CustomDropdown
                value={selectedAttendanceMr}
                onChange={setSelectedAttendanceMr}
                options={mrOptions}
                placeholder="Select MR"
                required={true}
              />
            </div>

            {modalActiveTab === "attendance" ? (
              /* Attendance Tab Content */
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    max={getTodayDate()} // Prevent future date selection
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
                    ) : isLeave(new Date(startDate), selectedAttendanceMr) ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <p className="text-red-700 text-sm font-medium">
                          ⚠️ Cannot record attendance on leave day
                        </p>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-green-700 text-sm font-medium">
                          ✅ Valid working day
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-6">
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

                <div className="flex gap-3 mb-4">
                  <button
                    onClick={handleRecordAttendance}
                    disabled={
                      attendanceLoading ||
                      !selectedAttendanceMr ||
                      !startDate ||
                      !startTime ||
                      !endTime ||
                      isFutureDate(startDate) || // Disable if future date
                      isSunday(startDate) ||
                      isHoliday(startDate) ||
                      isLeave(new Date(startDate), selectedAttendanceMr)
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
                      isLeave(new Date(startDate), selectedAttendanceMr)
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                    } text-white`}
                  >
                    <Clock size={16} />
                    {attendanceLoading ? "Recording..." : "Record Attendance"}
                  </button>
                </div>
              </>
            ) : (
              /* Leave Tab Content */
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Leave Date
                  </label>
                  <input
                    type="date"
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    max={getTodayDate()} // Prevent future date selection
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
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
                        selectedAttendanceMr
                      ) ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3">
                        <p className="text-red-700 text-sm font-medium">
                          ⚠️ Cannot apply for leave on a day with existing
                          attendance
                        </p>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3">
                        <p className="text-green-700 text-sm font-medium">
                          ✅ Valid leave day
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Leave Type
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="paid">Paid Leave</option>
                    <option value="unpaid">Unpaid Leave</option>
                    <option value="sick">Sick Leave</option>
                  </select>
                </div>

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
                      isFutureDate(leaveDate) || // Disable if future date
                      isSunday(leaveDate) ||
                      isHoliday(leaveDate) ||
                      getAttendanceForDate(
                        new Date(leaveDate),
                        selectedAttendanceMr
                      )
                    }
                    className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                      leaveLoading ||
                      !selectedAttendanceMr ||
                      !leaveDate ||
                      !leaveReason ||
                      isFutureDate(leaveDate) ||
                      isSunday(leaveDate) ||
                      isHoliday(leaveDate) ||
                      getAttendanceForDate(
                        new Date(leaveDate),
                        selectedAttendanceMr
                      )
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    } text-white`}
                  >
                    <Calendar size={16} />
                    {leaveLoading ? "Applying..." : "Apply Leave"}
                  </button>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAddAttendanceModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rest of the component remains the same */}
      {!showCalendarView && (
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

      {showCalendarView ? (
        <div>
          <div className="flex justify-between items-center mb-4 bg-white rounded-2xl shadow border border-gray-200 p-4">
            <button
              onClick={() => setShowCalendarView(false)}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg cursor-pointer"
            >
              <ChevronLeft size={18} /> Back to MR List
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setCalendarViewType("monthly")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "monthly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Monthly View
              </button>
              <button
                onClick={() => setCalendarViewType("annual")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer ${
                  calendarViewType === "annual"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Annual View
              </button>
            </div>
          </div>

          {calendarViewType === "monthly" ? (
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedMr?.medicalRepName} - Calendar View
                  {selectedMr && (
                    <span className="ml-2 text-lg font-normal text-red-600">
                      (Leave Taken:{" "}
                      {getLeaveCounts(selectedMr._id, selectedMr.date).total})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigateMonth("prev")}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-lg font-semibold">
                    {new Date(currentYear, currentMonth).toLocaleString(
                      "default",
                      { month: "long" }
                    )}{" "}
                    {currentYear}
                  </span>
                  <button
                    onClick={() => navigateMonth("next")}
                    disabled={!canNavigateNext("next", "monthly")}
                    className={`p-2 rounded-lg cursor-pointer transition-colors ${
                      canNavigateNext("next", "monthly")
                        ? "bg-gray-100 hover:bg-gray-200"
                        : "bg-gray-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-6">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      key={day}
                      className={`text-center font-semibold py-2 ${
                        day === "Sun" ? "text-red-600" : "text-gray-700"
                      }`}
                    >
                      {day}
                    </div>
                  )
                )}

                {getDaysInMonth().map((date, index) => {
                  if (date === null) {
                    return <div key={`empty-${index}`} className="h-12" />;
                  }

                  const attendance = getAttendanceForDate(
                    date,
                    selectedMr?._id
                  );
                  const isLeaveDay = isLeave(date, selectedMr?._id);
                  const leaveDetails = getLeaveDetails(date, selectedMr?._id);
                  const isSundayDay = isSunday(date);
                  const isHolidayDay = isHoliday(date);
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  const isToday =
                    date.toDateString() === new Date().toDateString();

                  let cellStyle =
                    "h-12 flex items-center justify-center rounded-lg border-2 ";

                  if (isLeaveDay) {
                    cellStyle += "bg-red-500 text-white border-red-600 ";
                  } else if (attendance) {
                    cellStyle += "bg-green-500 text-white border-green-600 ";
                  } else if (isSundayDay) {
                    cellStyle += "bg-red-400 text-white border-red-500 ";
                  } else if (isHolidayDay) {
                    cellStyle += "bg-gray-400 text-white border-gray-500 ";
                  } else if (isToday) {
                    cellStyle += "border-blue-500 bg-blue-50 ";
                  } else {
                    cellStyle += "border-gray-200 bg-gray-50 ";
                  }

                  if (!isCurrentMonth) {
                    cellStyle += "opacity-40 ";
                  }

                  return (
                    <div
                      key={date.toISOString()}
                      className={cellStyle.trim()}
                      title={
                        isHolidayDay
                          ? `Holiday: ${getHolidayName(date)}`
                          : isLeaveDay
                          ? `Leave: ${
                              leaveDetails?.reason || "No reason provided"
                            } (${leaveDetails?.type})`
                          : attendance
                          ? "Present"
                          : isSundayDay
                          ? "Sunday"
                          : "Working Day"
                      }
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-4 items-center text-sm bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500 rounded border-2 border-green-600"></div>
                  <span>Present</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-600"></div>
                  <span>Leave</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-400 rounded border-2 border-red-500"></div>
                  <span>Sunday</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-400 rounded border-2 border-gray-500"></div>
                  <span>Holiday</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-50 rounded border-2 border-blue-500"></div>
                  <span>Today</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedMr?.medicalRepName} - Annual Calendar
                  {selectedMr && (
                    <span className="ml-2 text-lg font-normal text-red-600">
                      (Leave Taken:{" "}
                      {getLeaveCounts(selectedMr._id, selectedMr.date).total})
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigateYear("prev")}
                    className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-lg font-semibold">{currentYear}</span>
                  <button
                    onClick={() => navigateYear("next")}
                    disabled={!canNavigateNext("next", "annual")}
                    className={`p-2 rounded-lg cursor-pointer transition-colors ${
                      canNavigateNext("next", "annual")
                        ? "bg-gray-100 hover:bg-gray-200"
                        : "bg-gray-100 opacity-40 cursor-not-allowed"
                    }`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 12 }, (_, monthIndex) => {
                  const monthName = new Date(
                    currentYear,
                    monthIndex
                  ).toLocaleString("default", { month: "short" });
                  const monthDays = getDaysInMonth(currentYear, monthIndex);

                  return (
                    <div
                      key={monthName}
                      className="border border-gray-200 rounded-lg p-4 bg-white"
                    >
                      <h3 className="text-lg font-semibold text-center mb-3 text-gray-800">
                        {monthName}
                      </h3>
                      <div className="grid grid-cols-7 gap-1 mb-2">
                        {["S", "M", "T", "W", "T", "F", "S"].map(
                          (day, index) => (
                            <div
                              key={day}
                              className={`text-center text-xs font-medium ${
                                index === 0 ? "text-red-600" : "text-gray-600"
                              }`}
                            >
                              {day}
                            </div>
                          )
                        )}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {monthDays.map((date, index) => {
                          if (date === null) {
                            return (
                              <div key={`empty-${index}`} className="h-6" />
                            );
                          }

                          const attendance = getAttendanceForDate(
                            date,
                            selectedMr?._id
                          );
                          const isLeaveDay = isLeave(date, selectedMr?._id);
                          const isSundayDay = isSunday(date);
                          const isHolidayDay = isHoliday(date);

                          let cellStyle =
                            "h-6 flex items-center justify-center rounded text-xs ";

                          if (isLeaveDay) {
                            cellStyle += "bg-red-500 text-white ";
                          } else if (attendance) {
                            cellStyle += "bg-green-500 text-white ";
                          } else if (isSundayDay) {
                            cellStyle += "bg-red-400 text-white ";
                          } else if (isHolidayDay) {
                            cellStyle += "bg-gray-400 text-white ";
                          } else {
                            cellStyle += "bg-gray-100 ";
                          }

                          return (
                            <div
                              key={date.toISOString()}
                              className={cellStyle.trim()}
                              title={
                                isHolidayDay
                                  ? `Holiday: ${getHolidayName(date)}`
                                  : isLeaveDay
                                  ? "Leave"
                                  : attendance
                                  ? "Present"
                                  : isSundayDay
                                  ? "Sunday"
                                  : "Working Day"
                              }
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
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          {mrList.length > 0 && (
            <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
              <button
                onClick={handleAddAttendance}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
              >
                <Clock size={16} />
                Record Attendance / Leave
              </button>
            </div>
          )}
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b text-sm">
              <tr>
                <th className="p-3">Sr No</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">MR Email</th>
                <th className="p-3">MR Contact</th>
                <th className="p-3">Paid Leave</th>
                <th className="p-3">Leave Taken</th>
                <th className="p-3">Remaining Paid</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const leaveCounts = getLeaveCounts(mr._id, mr.date);
                  const remainingPaid = getRemainingPaidLeaves(mr._id, mr.date);
                  const leaveTaken = leaveCounts.total; // Use total from leaveCounts
                  const attendanceStats = getAttendanceStats(mr._id);

                  return (
                    <tr
                      key={mr._id}
                      className={`hover:bg-gray-50 ${
                        (index + 1) % itemsPerPage === 0 ||
                        index + 1 === currentMRs.length
                          ? ""
                          : "border-b"
                      }`}
                    >
                      <td className="p-3">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>

                      <td className="p-3">
                        <span className="font-medium text-gray-800 capitalize">
                          {mr.medicalRepName}
                        </span>
                      </td>

                      <td className="p-3 text-gray-600">{mr.email}</td>
                      <td className="p-3 text-gray-600">{mr.contactNo}</td>

                      <td className="p-3">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm font-medium">
                          {leaveCounts.paid}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-sm font-medium">
                          {leaveTaken}
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2 py-1 rounded-full text-sm font-medium ${
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

                      <td className="p-3 flex items-center justify-center gap-3">
                        <button
                          onClick={() => handleView(mr)}
                          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg cursor-pointer text-sm"
                          title="View Calendar"
                        >
                          <Calendar size={16} /> View Calendar
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-3 text-center text-gray-500">
                    No MR records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {currentMRs.length > 0 && (
            <div className="mt-4 p-5 flex gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
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
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-50 cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveAttendance;
