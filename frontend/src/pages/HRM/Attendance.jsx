import React, { useState, useEffect } from "react";
import {
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
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

const Attendance = () => {
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

  // State for date range in modal
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Holiday state
  const [holidays, setHolidays] = useState([]);

  // Extra hours and leave management states
  const [extraHoursData, setExtraHoursData] = useState({
    totalExtraHours: 0,
    totalExtraMinutes: 0,
    leaveDaysAvailable: 0,
    remainingMinutes: 0,
    monthlyExtraHours: 0,
    monthlyExtraMinutes: 0,
    monthlyLeaveDaysAvailable: 0,
    monthlyRemainingMinutes: 0,
    attendanceRecordsWithExtraHours: [],
    monthlyRecordsWithExtraHours: [],
    loading: false,
    useMonthlyOnly: true, // Default to using monthly extra hours only
  });
  const [selectedDateForLeave, setSelectedDateForLeave] = useState("");
  const [convertingLeave, setConvertingLeave] = useState(false);

  useEffect(() => {
    fetchMRList();
    fetchAttendanceRecords();
    fetchHolidays();
  }, []);

  // Fetch extra hours data when MR is selected
  useEffect(() => {
    if (selectedAttendanceMr) {
      fetchExtraHoursData(selectedAttendanceMr);
    } else {
      // Reset extra hours data when no MR is selected
      setExtraHoursData({
        totalExtraHours: 0,
        totalExtraMinutes: 0,
        leaveDaysAvailable: 0,
        remainingMinutes: 0,
        monthlyExtraHours: 0,
        monthlyExtraMinutes: 0,
        monthlyLeaveDaysAvailable: 0,
        monthlyRemainingMinutes: 0,
        attendanceRecordsWithExtraHours: [],
        monthlyRecordsWithExtraHours: [],
        loading: false,
        useMonthlyOnly: true,
      });
    }
  }, [selectedAttendanceMr]);

  // Fetch extra hours for calendar view when MR is selected
  useEffect(() => {
    if (selectedMr && showCalendarView) {
      fetchExtraHoursData(selectedMr._id);
    }
  }, [selectedMr, showCalendarView, currentMonth, currentYear]);

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

  const fetchAttendanceRecords = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/attendance`);
      setAttendanceRecords(response.data || []);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
    }
  };

  const fetchHolidays = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/holidays`);
      setHolidays(response.data.holidays || []);
    } catch (err) {
      console.error("Failed to fetch holidays:", err);
      setHolidays([]);
    }
  };

  // Fetch extra hours data for selected MR from backend - UPDATED
  const fetchExtraHoursData = async (mrId) => {
    try {
      setExtraHoursData((prev) => ({ ...prev, loading: true }));

      // Get monthly extra hours for the current view month
      const response = await axios.get(
        `${backendUrl}/api/attendance/extra-hours/${mrId}`,
        {
          params: {
            year: currentYear,
            month: currentMonth,
          },
        }
      );

      if (response.data.success) {
        const data = response.data.data;

        // Determine which leave days available to show
        const showLeaveDaysAvailable = data.isMonthly
          ? data.monthlyLeaveDaysAvailable
          : data.leaveDaysAvailable;

        // Determine which extra hours to show
        const showExtraHours = data.isMonthly
          ? data.monthlyExtraHours
          : data.totalExtraHours;

        // Determine which minutes to show
        const showExtraMinutes = data.isMonthly
          ? data.monthlyExtraMinutes
          : data.totalExtraMinutes;

        // Determine which remaining minutes to show
        const showRemainingMinutes = data.isMonthly
          ? data.monthlyRemainingMinutes
          : data.remainingMinutes;

        setExtraHoursData({
          totalExtraHours: data.totalExtraHours || 0,
          totalExtraMinutes: data.totalExtraMinutes || 0,
          leaveDaysAvailable: data.leaveDaysAvailable || 0,
          remainingMinutes: data.remainingMinutes || 0,
          monthlyExtraHours: data.monthlyExtraHours || 0,
          monthlyExtraMinutes: data.monthlyExtraMinutes || 0,
          monthlyLeaveDaysAvailable: data.monthlyLeaveDaysAvailable || 0,
          monthlyRemainingMinutes: data.monthlyRemainingMinutes || 0,
          attendanceRecordsWithExtraHours: data.recordsWithExtraHours || [],
          monthlyRecordsWithExtraHours: data.monthlyRecordsWithExtraHours || [],
          loading: false,
          useMonthlyOnly: extraHoursData.useMonthlyOnly,
          showLeaveDaysAvailable,
          showExtraHours,
          showExtraMinutes,
          showRemainingMinutes,
          isMonthlyData: data.isMonthly,
        });
      } else {
        throw new Error(response.data.message);
      }
    } catch (err) {
      console.error("Failed to fetch extra hours data:", err);
      setExtraHoursData({
        totalExtraHours: 0,
        totalExtraMinutes: 0,
        leaveDaysAvailable: 0,
        remainingMinutes: 0,
        monthlyExtraHours: 0,
        monthlyExtraMinutes: 0,
        monthlyLeaveDaysAvailable: 0,
        monthlyRemainingMinutes: 0,
        attendanceRecordsWithExtraHours: [],
        monthlyRecordsWithExtraHours: [],
        loading: false,
        useMonthlyOnly: true,
        showLeaveDaysAvailable: 0,
        showExtraHours: 0,
        showExtraMinutes: 0,
        showRemainingMinutes: 0,
        isMonthlyData: false,
      });
      showToast("error", "Failed to load extra hours data");
    }
  };

  // Toggle between monthly and total extra hours
  const toggleUseMonthlyOnly = () => {
    setExtraHoursData((prev) => {
      const useMonthlyOnly = !prev.useMonthlyOnly;

      // Determine which values to show based on toggle
      const showLeaveDaysAvailable = useMonthlyOnly
        ? prev.monthlyLeaveDaysAvailable
        : prev.leaveDaysAvailable;

      const showExtraHours = useMonthlyOnly
        ? prev.monthlyExtraHours
        : prev.totalExtraHours;

      const showExtraMinutes = useMonthlyOnly
        ? prev.monthlyExtraMinutes
        : prev.totalExtraMinutes;

      const showRemainingMinutes = useMonthlyOnly
        ? prev.monthlyRemainingMinutes
        : prev.remainingMinutes;

      return {
        ...prev,
        useMonthlyOnly,
        showLeaveDaysAvailable,
        showExtraHours,
        showExtraMinutes,
        showRemainingMinutes,
      };
    });
  };

  // Format minutes to time string
  const formatMinutesToTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:00`;
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Calculate total extra hours from records
  const calculateTotalExtraHours = (records) => {
    if (!records || !Array.isArray(records)) return 0;
    return (
      records.reduce((total, record) => {
        return total + (record.extraHoursInMinutes || 0);
      }, 0) / 60
    );
  };

  // Convert extra hours to leave - UPDATED
  const handleConvertToLeave = async () => {
    if (!selectedAttendanceMr || !selectedDateForLeave) {
      showToast("error", "Please select MR and date for leave");
      return;
    }

    // Check which leave days are available based on selection
    const availableLeaveDays = extraHoursData.useMonthlyOnly
      ? extraHoursData.monthlyLeaveDaysAvailable
      : extraHoursData.leaveDaysAvailable;

    if (availableLeaveDays < 1) {
      const source = extraHoursData.useMonthlyOnly ? "monthly" : "total";
      showToast(
        "error",
        `Insufficient ${source} extra hours. Minimum 9 hours required for 1 leave day.`
      );
      return;
    }

    // Check if date is valid (not Sunday, not holiday)
    if (isSunday(selectedDateForLeave)) {
      showToast("error", "Cannot take leave on Sunday");
      return;
    }

    if (isHoliday(selectedDateForLeave)) {
      const holidayName = getHolidayName(selectedDateForLeave);
      showToast("error", `Cannot take leave on holiday: ${holidayName}`);
      return;
    }

    // Check if date is in the future
    const selectedDate = new Date(selectedDateForLeave);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      showToast("error", "Cannot convert leave for past dates");
      return;
    }

    try {
      setConvertingLeave(true);

      const convertData = {
        userId: selectedAttendanceMr,
        date: selectedDateForLeave,
        hoursToConvert: 9, // Convert 9 hours to 1 leave day
        useMonthlyOnly: extraHoursData.useMonthlyOnly,
      };

      const response = await axios.post(
        `${backendUrl}/api/attendance/convert-to-leave`,
        convertData
      );

      if (response.data.success) {
        // Update extra hours data locally
        if (extraHoursData.useMonthlyOnly) {
          // Deduct from monthly hours
          const updatedMonthlyMinutes =
            extraHoursData.monthlyExtraMinutes - 9 * 60;
          const updatedMonthlyLeaveDays = Math.max(
            0,
            Math.floor(updatedMonthlyMinutes / 540)
          );
          const updatedMonthlyRemainingMinutes = updatedMonthlyMinutes % 540;

          // Also update total (since monthly is part of total)
          const updatedTotalMinutes = extraHoursData.totalExtraMinutes - 9 * 60;
          const updatedTotalLeaveDays = Math.max(
            0,
            Math.floor(updatedTotalMinutes / 540)
          );
          const updatedTotalRemainingMinutes = updatedTotalMinutes % 540;

          setExtraHoursData((prev) => ({
            ...prev,
            monthlyExtraMinutes: updatedMonthlyMinutes,
            monthlyExtraHours: parseFloat(
              (updatedMonthlyMinutes / 60).toFixed(2)
            ),
            monthlyLeaveDaysAvailable: updatedMonthlyLeaveDays,
            monthlyRemainingMinutes: updatedMonthlyRemainingMinutes,
            totalExtraMinutes: updatedTotalMinutes,
            totalExtraHours: parseFloat((updatedTotalMinutes / 60).toFixed(2)),
            leaveDaysAvailable: updatedTotalLeaveDays,
            remainingMinutes: updatedTotalRemainingMinutes,
            showLeaveDaysAvailable: updatedMonthlyLeaveDays,
            showExtraHours: parseFloat((updatedMonthlyMinutes / 60).toFixed(2)),
            showExtraMinutes: updatedMonthlyMinutes,
            showRemainingMinutes: updatedMonthlyRemainingMinutes,
          }));
        } else {
          // Deduct from total hours
          const updatedTotalMinutes = extraHoursData.totalExtraMinutes - 9 * 60;
          const updatedTotalLeaveDays = Math.max(
            0,
            Math.floor(updatedTotalMinutes / 540)
          );
          const updatedTotalRemainingMinutes = updatedTotalMinutes % 540;

          // Also try to update monthly if possible
          const selectedDateObj = new Date(selectedDateForLeave);
          const selectedMonth = selectedDateObj.getMonth();
          const selectedYear = selectedDateObj.getFullYear();

          let updatedMonthlyMinutes = extraHoursData.monthlyExtraMinutes;
          let updatedMonthlyLeaveDays =
            extraHoursData.monthlyLeaveDaysAvailable;
          let updatedMonthlyRemainingMinutes =
            extraHoursData.monthlyRemainingMinutes;

          // If the leave date is in the current month, deduct from monthly too
          if (selectedMonth === currentMonth && selectedYear === currentYear) {
            updatedMonthlyMinutes = Math.max(
              0,
              extraHoursData.monthlyExtraMinutes - 9 * 60
            );
            updatedMonthlyLeaveDays = Math.max(
              0,
              Math.floor(updatedMonthlyMinutes / 540)
            );
            updatedMonthlyRemainingMinutes = updatedMonthlyMinutes % 540;
          }

          setExtraHoursData((prev) => ({
            ...prev,
            totalExtraMinutes: updatedTotalMinutes,
            totalExtraHours: parseFloat((updatedTotalMinutes / 60).toFixed(2)),
            leaveDaysAvailable: updatedTotalLeaveDays,
            remainingMinutes: updatedTotalRemainingMinutes,
            monthlyExtraMinutes: updatedMonthlyMinutes,
            monthlyExtraHours: parseFloat(
              (updatedMonthlyMinutes / 60).toFixed(2)
            ),
            monthlyLeaveDaysAvailable: updatedMonthlyLeaveDays,
            monthlyRemainingMinutes: updatedMonthlyRemainingMinutes,
            showLeaveDaysAvailable: updatedTotalLeaveDays,
            showExtraHours: parseFloat((updatedTotalMinutes / 60).toFixed(2)),
            showExtraMinutes: updatedTotalMinutes,
            showRemainingMinutes: updatedTotalRemainingMinutes,
          }));
        }

        showToast("success", "Leave successfully converted from extra hours!");
        setSelectedDateForLeave("");

        // Refresh attendance records
        fetchAttendanceRecords();

        // Refresh extra hours data
        if (selectedAttendanceMr) {
          fetchExtraHoursData(selectedAttendanceMr);
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      showToast("error", `Failed to convert to leave: ${errorMessage}`);
    } finally {
      setConvertingLeave(false);
    }
  };

  // Helper functions for date calculations
  const isSunday = (date) => {
    const day = new Date(date).getDay();
    return day === 0;
  };

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

  // Convert mrList to dropdown options
  const mrOptions = mrList.map((mr) => ({
    value: mr._id,
    label: `${mr.medicalRepName} (${mr.MRId})`,
  }));

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

  // Calendar functions
  const getAttendanceForDate = (date, mrId) => {
    if (!mrId) return null;
    const dateString = date.toISOString().split("T")[0];
    const records = attendanceRecords.filter(
      (record) =>
        record.userId?._id === mrId &&
        new Date(record.loginTime).toDateString() === date.toDateString()
    );
    return records.length > 0 ? records[0] : null;
  };

  const isFutureDate = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date > today;
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
    const mrRecords = attendanceRecords.filter(
      (record) => record.userId?._id === mrId
    );

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

    // Calculate extra hours for this MR
    const mrExtraHoursRecords = mrRecords.filter(
      (record) => record.extraHoursInMinutes && record.extraHoursInMinutes > 0
    );

    const totalExtraMinutes = mrExtraHoursRecords.reduce(
      (sum, record) => sum + (record.extraHoursInMinutes || 0),
      0
    );

    const extraHoursAvailable = totalExtraMinutes / 60;
    const extraLeaveDaysAvailable = Math.floor(totalExtraMinutes / 540);

    return {
      monthly: monthlyAttendance,
      annual: annualAttendance,
      percentage: attendancePercentage,
      currentStatus: todayRecord ? "Logged In" : "Logged Out",
      currentAttendanceId: todayRecord?._id,
      extraHoursAvailable: parseFloat(extraHoursAvailable.toFixed(2)),
      extraLeaveDaysAvailable,
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
      showToast("error", "Please fill all fields");
      return;
    }

    // Validate time
    if (startTime >= endTime) {
      showToast("error", "End time must be after start time");
      return;
    }

    // Check if date is Sunday
    if (isSunday(startDate)) {
      showToast("error", "Cannot record attendance on Sunday");
      return;
    }

    // Check if date is holiday
    if (isHoliday(startDate)) {
      const holidayName = getHolidayName(startDate);
      showToast("error", `Cannot record attendance on holiday: ${holidayName}`);
      return;
    }

    try {
      setAttendanceLoading(true);

      const loginDateTime = new Date(`${startDate}T${startTime}`);
      const logoutDateTime = new Date(`${startDate}T${endTime}`);

      const attendanceData = {
        userId: selectedAttendanceMr,
        loginTime: loginDateTime.toISOString(),
        logoutTime: logoutDateTime.toISOString(),
        workingHoursPerDay: 9, // 9 hours per day
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

        // Refresh attendance records and extra hours data
        fetchAttendanceRecords();
        if (selectedAttendanceMr) {
          fetchExtraHoursData(selectedAttendanceMr);
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      showToast("error", `Failed to record attendance: ${errorMessage}`);
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Initialize modal when opened
  const handleAddAttendance = () => {
    setShowAddAttendanceModal(true);
    setSelectedAttendanceMr(null);
    setSelectedDateForLeave("");

    // Set default dates to today
    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    setStartDate(todayString);

    // Set default times (9 AM to 5 PM)
    setStartTime("09:00");
    setEndTime("17:00");
  };

  // Get month name
  const getMonthName = (month) => {
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
    return monthNames[month];
  };

  // Render monthly calendar - UPDATED WITH EXTRA HOURS INFO
  const renderMonthlyCalendar = () => {
    const days = getDaysInMonth();
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

    const attendanceStats = selectedMr
      ? getAttendanceStats(selectedMr._id)
      : {
          monthly: 0,
          annual: 0,
          percentage: 0,
          currentStatus: "Logged Out",
          extraHoursAvailable: 0,
          extraLeaveDaysAvailable: 0,
        };

    const today = new Date();
    const isCurrentMonthAndYear =
      currentMonth === today.getMonth() && currentYear === today.getFullYear();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">
              {selectedMr?.medicalRepName} - Attendance Calendar
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {monthNames[currentMonth]} {currentYear}
              {isCurrentMonthAndYear && " (Current Month)"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                Monthly Attendance: {attendanceStats.monthly}
              </div>
            </div>

            {attendanceStats.extraLeaveDaysAvailable > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                <div className="text-sm font-medium text-green-800">
                  Extra Leave Days: {attendanceStats.extraLeaveDaysAvailable}
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-gray-800">
                Status: {attendanceStats.currentStatus}
              </div>
            </div>

            <button
              onClick={() => navigateMonth("prev")}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={20} />
            </button>

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

        {/* Extra Hours Summary for Calendar View */}
        {extraHoursData.totalExtraHours > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="text-blue-600" size={20} />
                <div>
                  <h3 className="font-semibold text-blue-800">
                    Extra Hours Summary for {getMonthName(currentMonth)}
                  </h3>
                  <p className="text-sm text-blue-600">
                    Monthly: {extraHoursData.monthlyExtraHours.toFixed(2)} hours
                    • Total: {extraHoursData.totalExtraHours.toFixed(2)} hours
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-green-700">
                  {extraHoursData.monthlyLeaveDaysAvailable} Leave Days
                  Available
                </div>
                <div className="text-sm text-gray-600">
                  (9 hours = 1 leave day)
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-7 gap-2 mb-6">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className={`text-center font-semibold py-2 ${
                day === "Sun" ? "text-red-600" : "text-gray-700"
              }`}
            >
              {day}
            </div>
          ))}

          {days.map((date, index) => {
            if (date === null) {
              return <div key={`empty-${index}`} className="h-12" />;
            }

            const attendance = getAttendanceForDate(date, selectedMr?._id);
            const isSundayDay = isSunday(date);
            const isHolidayDay = isHoliday(date);

            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === new Date().toDateString();
            const isFuture = isFutureDate(date);

            // Determine cell style
            let cellStyle =
              "h-12 flex items-center justify-center rounded-lg border-2 relative ";

            if (attendance) {
              if (attendance.isLeaveDay) {
                // Leave day - purple
                cellStyle += "bg-purple-500 text-white border-purple-600 ";
              } else if (attendance.extraHoursInMinutes > 0) {
                // Has extra hours - dark green
                cellStyle += "bg-green-600 text-white border-green-700 ";
              } else {
                // Regular attendance - light green
                cellStyle += "bg-green-400 text-white border-green-500 ";
              }
            } else if (isSundayDay) {
              // Sundays - red
              cellStyle += "bg-red-400 text-white border-red-500 ";
            } else if (isHolidayDay) {
              // Holidays - gray
              cellStyle += "bg-gray-400 text-white border-gray-500 ";
            } else if (isToday) {
              // Today - blue highlight
              cellStyle += "border-blue-500 bg-blue-50 ";
            } else {
              // Normal working days
              cellStyle += "border-gray-200 bg-gray-50 ";
            }

            if (!isCurrentMonth) {
              cellStyle += "opacity-40 ";
            }

            // Show extra hours badge
            const hasExtraHours =
              attendance && attendance.extraHoursInMinutes > 0;
            const extraHoursDisplay = hasExtraHours
              ? `+${Math.floor(attendance.extraHoursInMinutes / 60)}h${
                  attendance.extraHoursInMinutes % 60
                }m`
              : "";

            return (
              <div
                key={date.toISOString()}
                className={cellStyle.trim()}
                title={
                  isHolidayDay
                    ? `Holiday: ${getHolidayName(date)}`
                    : attendance
                    ? `${
                        attendance.isLeaveDay ? "Leave Day" : "Present"
                      }\nLogin: ${new Date(
                        attendance.loginTime
                      ).toLocaleTimeString()} ${
                        attendance.logoutTime
                          ? `\nLogout: ${new Date(
                              attendance.logoutTime
                            ).toLocaleTimeString()}`
                          : ""
                      }${
                        attendance.extraHoursInMinutes > 0
                          ? `\nExtra Hours: ${attendance.extraHours}`
                          : ""
                      }`
                    : isSundayDay
                    ? "Sunday"
                    : "No attendance"
                }
              >
                {date.getDate()}
                {hasExtraHours && (
                  <div className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    +
                  </div>
                )}
                {extraHoursDisplay && (
                  <div className="absolute bottom-1 left-0 right-0 text-xs font-bold">
                    {extraHoursDisplay}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col md:flex-row justify-between items-center bg-gray-50 rounded-lg p-4 gap-6">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 items-center text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-green-400 rounded border-2 border-green-500"></div>
              <span>Present</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-green-600 rounded border-2 border-green-700"></div>
              <span>Present with Extra Hours</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-purple-500 rounded border-2 border-purple-600"></div>
              <span>Leave Day</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-red-400 rounded border-2 border-red-500"></div>
              <span>Sunday</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-gray-400 rounded border-2 border-gray-500"></div>
              <span>Holiday</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-blue-50 rounded border-2 border-blue-500"></div>
              <span>Today</span>
            </label>
          </div>

          {/* Summary */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="text-lg font-semibold text-gray-700">
              Annual Attendance:{" "}
              <span className="text-2xl font-bold text-green-600">
                {attendanceStats.annual}
              </span>
            </div>
            <div className="text-lg font-semibold text-gray-700">
              Attendance %:{" "}
              <span className="text-2xl font-bold text-blue-600">
                {attendanceStats.percentage}%
              </span>
            </div>
            {attendanceStats.extraHoursAvailable > 0 && (
              <div className="text-lg font-semibold text-gray-700">
                Extra Hours:{" "}
                <span className="text-2xl font-bold text-yellow-600">
                  {attendanceStats.extraHoursAvailable}h
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Handle view action
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto mx-4">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">Record Attendance</h2>
              <button
                onClick={() => {
                  setShowAddAttendanceModal(false);
                  setSelectedAttendanceMr(null);
                  setSelectedDateForLeave("");
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date
                </label>
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-gray-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <div className="mb-6">
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

                {startDate && (
                  <div className="mb-6">
                    {isSunday(startDate) ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                        <AlertCircle
                          size={20}
                          className="text-red-600 flex-shrink-0 mt-0.5"
                        />
                        <div>
                          <p className="text-red-700 text-sm font-medium">
                            Cannot record attendance on Sunday
                          </p>
                          <p className="text-red-600 text-xs mt-1">
                            Sundays are non-working days
                          </p>
                        </div>
                      </div>
                    ) : isHoliday(startDate) ? (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start gap-2">
                        <AlertCircle
                          size={20}
                          className="text-red-600 flex-shrink-0 mt-0.5"
                        />
                        <div>
                          <p className="text-red-700 text-sm font-medium">
                            Cannot record attendance on holiday
                          </p>
                          <p className="text-red-600 text-xs mt-1">
                            {getHolidayName(startDate)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded-md p-3 flex items-start gap-2">
                        <CalendarDays
                          size={20}
                          className="text-green-600 flex-shrink-0 mt-0.5"
                        />
                        <div>
                          <p className="text-green-700 text-sm font-medium">
                            Valid working day
                          </p>
                          <p className="text-green-600 text-xs mt-1">
                            You can record attendance on this date
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Start & End Time */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Time
                    </label>
                    <div className="flex items-center gap-2">
                      <Clock size={18} className="text-gray-400" />
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <div className="flex items-center gap-2">
                      <Clock4 size={18} className="text-gray-400" />
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Time Info */}
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase size={16} className="text-blue-600" />
                    <p className="text-sm font-medium text-blue-800">
                      Standard Working Hours: 9 hours per day (9 AM - 6 PM)
                    </p>
                  </div>
                  <p className="text-xs text-blue-600">
                    Hours worked beyond 9 hours will be counted as extra hours.
                    9 extra hours = 1 leave day.
                  </p>
                </div>

                {/* Attendance Button */}
                <button
                  onClick={handleRecordAttendance}
                  disabled={
                    attendanceLoading ||
                    !selectedAttendanceMr ||
                    !startDate ||
                    !startTime ||
                    !endTime ||
                    isSunday(startDate) ||
                    isHoliday(startDate)
                  }
                  className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 ${
                    attendanceLoading ||
                    !selectedAttendanceMr ||
                    !startDate ||
                    !startTime ||
                    !endTime ||
                    isSunday(startDate) ||
                    isHoliday(startDate)
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                  } text-white font-medium transition-colors`}
                >
                  <Clock size={18} />
                  {attendanceLoading ? "Recording..." : "Record Attendance"}
                </button>
              </div>

              {/* Right side: Extra Hours & Leave Management - UPDATED */}
              <div>
                <h3 className="text-lg font-bold mb-4 text-gray-800">
                  Extra Hours & Leave Management
                </h3>

                {!selectedAttendanceMr ? (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <Briefcase
                      size={48}
                      className="mx-auto text-gray-400 mb-3"
                    />
                    <p className="text-gray-500 font-medium">
                      Select an MR to view extra hours
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Extra hours will be calculated after recording attendance
                    </p>
                  </div>
                ) : extraHoursData.loading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-gray-500 mt-3">
                      Loading extra hours data...
                    </p>
                  </div>
                ) : extraHoursData.showExtraHours > 0 ? (
                  <>
                    {/* Toggle between Monthly and Total */}
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CalendarRange size={18} className="text-blue-600" />
                        <span className="font-medium text-gray-700">
                          {extraHoursData.useMonthlyOnly
                            ? "Monthly Extra Hours"
                            : "Total Extra Hours"}
                        </span>
                      </div>
                      <button
                        onClick={toggleUseMonthlyOnly}
                        className="flex items-center gap-2 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-md text-sm transition-colors"
                      >
                        <CalendarIcon size={14} />
                        {extraHoursData.useMonthlyOnly
                          ? "Show Total"
                          : "Show Monthly"}
                      </button>
                    </div>

                    {/* Extra Hours Summary */}
                    <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5">
                      <h3 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                        <Clock size={20} />
                        {extraHoursData.useMonthlyOnly
                          ? "Monthly"
                          : "Total"}{" "}
                        Extra Working Hours Summary
                      </h3>

                      <div className="space-y-4">
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                          <div>
                            <p className="text-gray-700 font-medium">
                              {extraHoursData.useMonthlyOnly
                                ? "Monthly"
                                : "Total"}{" "}
                              Extra Hours
                            </p>
                            <p className="text-xs text-gray-500">
                              {extraHoursData.useMonthlyOnly
                                ? "Hours beyond 9-hour workday this month"
                                : "Total hours beyond 9-hour workday"}
                            </p>
                          </div>
                          <span className="text-2xl font-bold text-blue-700">
                            {extraHoursData.showExtraHours.toFixed(2)} hrs
                          </span>
                        </div>

                        <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                          <div>
                            <p className="text-gray-700 font-medium">
                              Leave Days Available
                            </p>
                            <p className="text-xs text-gray-500">
                              9 hours = 1 leave day
                            </p>
                          </div>
                          <span className="text-2xl font-bold text-green-700">
                            {extraHoursData.showLeaveDaysAvailable} days
                          </span>
                        </div>

                        <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                          <div>
                            <p className="text-gray-700 font-medium">
                              Remaining Hours
                            </p>
                            <p className="text-xs text-gray-500">
                              After leave conversion
                            </p>
                          </div>
                          <span className="text-xl font-bold text-gray-700">
                            {Math.floor(
                              extraHoursData.showRemainingMinutes / 60
                            )}
                            h {extraHoursData.showRemainingMinutes % 60}m
                          </span>
                        </div>

                        {/* Total vs Monthly Comparison */}
                        {extraHoursData.useMonthlyOnly && (
                          <div className="mt-3 pt-3 border-t border-blue-100">
                            <div className="flex items-center gap-2 text-sm text-blue-600">
                              <Info size={14} />
                              <span>
                                Total available extra hours:{" "}
                                {extraHoursData.totalExtraHours.toFixed(2)}{" "}
                                hours
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Convert to Leave Section */}
                    <div className="mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-5">
                      <h3 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
                        <PlusCircle size={20} />
                        Convert Extra Hours to Leave
                      </h3>

                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Select Date for Leave
                          </label>
                          <input
                            type="date"
                            value={selectedDateForLeave}
                            onChange={(e) =>
                              setSelectedDateForLeave(e.target.value)
                            }
                            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                            min={new Date().toISOString().split("T")[0]}
                          />
                        </div>

                        {selectedDateForLeave && (
                          <div>
                            {isSunday(selectedDateForLeave) ? (
                              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <p className="text-red-700 text-sm font-medium">
                                  ⚠️ Cannot take leave on Sunday
                                </p>
                              </div>
                            ) : isHoliday(selectedDateForLeave) ? (
                              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                <p className="text-red-700 text-sm font-medium">
                                  ⚠️ Cannot take leave on holiday:{" "}
                                  {getHolidayName(selectedDateForLeave)}
                                </p>
                              </div>
                            ) : (
                              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                                <p className="text-green-700 text-sm font-medium">
                                  ✅ Valid date for leave
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          <Info size={14} />
                          <span>
                            Using{" "}
                            {extraHoursData.useMonthlyOnly
                              ? "monthly"
                              : "total"}{" "}
                            extra hours for conversion
                          </span>
                        </div>

                        <button
                          onClick={handleConvertToLeave}
                          disabled={
                            convertingLeave ||
                            !selectedDateForLeave ||
                            extraHoursData.showLeaveDaysAvailable < 1 ||
                            isSunday(selectedDateForLeave) ||
                            isHoliday(selectedDateForLeave)
                          }
                          className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 ${
                            convertingLeave ||
                            !selectedDateForLeave ||
                            extraHoursData.showLeaveDaysAvailable < 1 ||
                            isSunday(selectedDateForLeave) ||
                            isHoliday(selectedDateForLeave)
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700"
                          } text-white font-medium transition-colors`}
                        >
                          {convertingLeave ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              Processing...
                            </>
                          ) : (
                            <>
                              <PlusCircle size={18} />
                              Convert 9 Hours to 1 Leave Day
                            </>
                          )}
                        </button>

                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          <AlertCircle size={12} className="inline mr-1" />
                          Each leave day requires 9 extra working hours. After
                          conversion, the leave day will be marked in attendance
                          records.
                        </div>
                      </div>
                    </div>

                    {/* Extra Hours Breakdown */}
                    {extraHoursData.attendanceRecordsWithExtraHours.length >
                      0 && (
                      <div className="mt-4">
                        <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                          <Calendar size={16} />
                          {extraHoursData.useMonthlyOnly
                            ? "Monthly"
                            : "Total"}{" "}
                          Extra Hours Breakdown
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                          {(extraHoursData.useMonthlyOnly
                            ? extraHoursData.monthlyRecordsWithExtraHours
                            : extraHoursData.attendanceRecordsWithExtraHours
                          )
                            .slice(0, 10)
                            .map((record, index) => (
                              <div
                                key={index}
                                className="flex justify-between items-center text-sm bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border border-blue-100"
                              >
                                <div>
                                  <span className="font-medium text-gray-700">
                                    {formatDate(record.date)}
                                  </span>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Extra hours earned
                                  </p>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-blue-700 text-lg">
                                    +
                                    {formatMinutesToTime(
                                      record.extraHoursInMinutes
                                    ).slice(0, 5)}
                                  </span>
                                  <p className="text-xs text-gray-500 mt-1">
                                    Total: {record.totalTime}
                                  </p>
                                </div>
                              </div>
                            ))}
                          {(extraHoursData.useMonthlyOnly
                            ? extraHoursData.monthlyRecordsWithExtraHours.length
                            : extraHoursData.attendanceRecordsWithExtraHours
                                .length) > 10 && (
                            <div className="text-center text-xs text-gray-500 bg-gray-100 p-2 rounded">
                              +
                              {(extraHoursData.useMonthlyOnly
                                ? extraHoursData.monthlyRecordsWithExtraHours
                                    .length
                                : extraHoursData.attendanceRecordsWithExtraHours
                                    .length) - 10}{" "}
                              more records
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
                    <Clock size={48} className="mx-auto text-gray-400 mb-3" />
                    <p className="text-gray-500 font-medium">
                      No extra hours available
                    </p>
                    <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                      This MR hasn't worked beyond the standard 9-hour workday
                      yet. Extra hours are calculated when working hours exceed
                      9 hours per day.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!showCalendarView && (
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            MR Attendance Records
          </h1>
          {mrList.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg">
                <span className="font-bold">{filteredMRList.length}</span> Total
                MRs
              </div>

              <div className="relative w-72">
                <Search
                  className="absolute top-1/2 left-3 -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="text"
                  placeholder="Search MRs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showCalendarView ? (
        /* Calendar View */
        <div>
          {/* Back Button and Tabs */}
          <div className="flex justify-between items-center mb-6 bg-white rounded-2xl shadow border border-gray-200 p-4">
            <button
              onClick={() => setShowCalendarView(false)}
              className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={18} /> Back to MR List
            </button>

            <div className="flex gap-2">
              <button
                onClick={() => setCalendarViewType("monthly")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
                  calendarViewType === "monthly"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Monthly View
              </button>
              <button
                onClick={() => setCalendarViewType("annual")}
                className={`px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors ${
                  calendarViewType === "annual"
                    ? "bg-blue-600 text-white shadow-md"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Annual View
              </button>
            </div>
          </div>

          {/* Calendar Display */}
          {calendarViewType === "monthly"
            ? renderMonthlyCalendar()
            : renderAnnualCalendar()}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto shadow-lg rounded-2xl border border-gray-200">
          {mrList.length > 0 && (
            <div className="flex justify-between items-center p-4 bg-gradient-to-r from-gray-50 to-slate-50 border-b">
              <button
                onClick={handleAddAttendance}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-md"
              >
                <Clock size={16} />
                Record Attendance
              </button>
              <div className="text-sm text-gray-500">
                Showing {Math.min(itemsPerPage, currentMRs.length)} of{" "}
                {filteredMRList.length} MRs
              </div>
            </div>
          )}
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center">
            <thead className="bg-gradient-to-r from-gray-100 to-slate-100 text-gray-700 border-b">
              <tr>
                <th className="p-4 font-semibold">Sr No</th>
                <th className="p-4 font-semibold">MR Name</th>
                <th className="p-4 font-semibold">MR Email</th>
                <th className="p-4 font-semibold">MR Contact</th>
                <th className="p-4 font-semibold">Monthly Attendance</th>
                <th className="p-4 font-semibold">Annual Attendance</th>
                <th className="p-4 font-semibold">Attendance %</th>
                <th className="p-4 font-semibold">Extra Hours</th>
                <th className="p-4 font-semibold">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const attendanceStats = getAttendanceStats(mr._id);

                  return (
                    <tr
                      key={mr._id}
                      className={`hover:bg-gray-50 transition-colors ${
                        index % 2 === 0 ? "bg-gray-50/50" : "bg-white"
                      }`}
                    >
                      <td className="p-4 font-medium">
                        {(currentPage - 1) * itemsPerPage + index + 1}
                      </td>

                      <td className="p-4">
                        <span className="font-medium text-gray-800 capitalize">
                          {mr.medicalRepName}
                        </span>
                      </td>

                      <td className="p-4 text-gray-600">{mr.email}</td>
                      <td className="p-4 text-gray-600">{mr.contactNo}</td>

                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                          <Calendar size={14} />
                          {attendanceStats.monthly}
                        </span>
                      </td>

                      <td className="p-4">
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                          <CalendarDays size={14} />
                          {attendanceStats.annual}
                        </span>
                      </td>

                      <td className="p-4">
                        <div className="relative">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
                              parseFloat(attendanceStats.percentage) >= 80
                                ? "bg-green-100 text-green-800"
                                : parseFloat(attendanceStats.percentage) >= 60
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {attendanceStats.percentage}%
                          </span>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            Monthly attendance percentage
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        {attendanceStats.extraHoursAvailable > 0 ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                              <Clock size={12} />
                              {attendanceStats.extraHoursAvailable}h
                            </span>
                            {attendanceStats.extraLeaveDaysAvailable > 0 && (
                              <span className="text-xs text-green-600 mt-1">
                                ({attendanceStats.extraLeaveDaysAvailable} leave
                                days)
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">
                            No extra hours
                          </span>
                        )}
                      </td>

                      <td className="p-4">
                        <button
                          onClick={() => handleView(mr)}
                          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm"
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
                  <td colSpan={9} className="p-8 text-center">
                    <div className="text-gray-400 mb-2">
                      <Search size={48} className="mx-auto" />
                    </div>
                    <p className="text-gray-500 text-lg font-medium">
                      No MR records found
                    </p>
                    <p className="text-gray-400 text-sm mt-1">
                      Try adjusting your search criteria
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination */}
          {currentMRs.length > 0 && totalPages > 1 && (
            <div className="mt-4 p-5 flex items-center justify-between border-t">
              <div className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors flex items-center gap-1"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>

                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-4 py-2 rounded-lg w-12 text-center transition cursor-pointer ${
                          currentPage === pageNum
                            ? "bg-indigo-600 text-white shadow-md"
                            : "bg-gray-200 hover:bg-gray-300"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 disabled:opacity-50 cursor-pointer transition-colors flex items-center gap-1"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Attendance;
