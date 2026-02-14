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
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedAttendanceMr, setSelectedAttendanceMr] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const inputRef = useRef(null);

  // State for date range in modal - Attendance
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // State for leave application
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [leaveType, setLeaveType] = useState("unpaid"); // Added leaveType state
  const [leaveLoading, setLeaveLoading] = useState(false);

  // State for Extra Hours Conversion
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

  // Holiday state
  const [holidays, setHolidays] = useState([]);

  // Leave data
  const [mrLeaves, setMrLeaves] = useState({});

  // Helper function to calculate remaining time after converting to days
  const calculateRemainingTime = (totalMinutes) => {
    const totalHours = totalMinutes / 60;
    const fullDays = Math.floor(totalMinutes / 480); // 480 minutes = 8 hours
    const remainingMinutes = totalMinutes % 480;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;

    return {
      days: fullDays,
      hours: remainingHours,
      minutes: remainingMins,
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalMinutes: totalMinutes,
    };
  };

  // Get today's date in YYYY-MM-DD format
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

  // Helper function to get date string in YYYY-MM-DD format from a Date object
  const getDateString = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  useEffect(() => {
    fetchMRList();
    fetchAttendanceRecords();
    fetchHolidays();
    fetchLeaves();
  }, []);

  // Fetch extra hours when MR is selected in extra hours modal
  useEffect(() => {
    if (selectedAttendanceMr && showExtraHoursModal) {
      fetchExtraHoursData(selectedAttendanceMr);
    } else {
      resetExtraHoursData();
    }
  }, [selectedAttendanceMr, showExtraHoursModal]);

  const fetchMRList = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${backendUrl}/api/staff`);
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
      const records = response.data || [];
      setAttendanceRecords(records);

      // If we have a selected MR in extra hours modal, refresh their data too
      if (selectedAttendanceMr && showExtraHoursModal) {
        await fetchExtraHoursData(selectedAttendanceMr);
      }
    } catch (err) {
      console.error("❌ Failed to fetch attendance records:", err);
      showToast("error", "Failed to refresh attendance data");
    }
  };

  const fetchLeaves = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/leaves`);
      const leavesData = response.data || [];

      // Group leaves by user ID
      const leavesByUser = {};
      leavesData.forEach((leave) => {
        if (leave.status === "approved") {
          let userId;
          if (typeof leave.userId === "object" && leave.userId !== null) {
            userId = leave.userId._id;
          } else {
            userId = leave.userId;
          }

          if (!leavesByUser[userId]) {
            leavesByUser[userId] = [];
          }
          leavesByUser[userId].push(leave);
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
      const response = await axios.get(`${backendUrl}/api/holidays`);
      let holidaysData = response.data.holidays || response.data || [];

      // Transform holiday data to have a consistent format
      if (Array.isArray(holidaysData)) {
        // If holidays have startDate/endDate, convert them to date field
        const transformedHolidays = holidaysData
          .map((holiday) => {
            // Use date field if it exists, otherwise use startDate
            const holidayDate = holiday.date || holiday.startDate;

            // For multi-day holidays, we'll create an entry for each day
            const startDate = new Date(holiday.startDate || holiday.date);
            const endDate = new Date(holiday.endDate || holiday.date);

            const holidays = [];

            // Create a date for each day in the range
            const currentDate = new Date(startDate);
            while (currentDate <= endDate) {
              holidays.push({
                ...holiday,
                date: new Date(currentDate), // Store as Date object
                name: holiday.name,
              });
              currentDate.setDate(currentDate.getDate() + 1);
            }

            return holidays;
          })
          .flat(); // Flatten the array

        setHolidays(transformedHolidays);
      } else {
        console.warn("Holidays API did not return an array:", holidaysData);
        setHolidays([]);
      }
    } catch (err) {
      console.error("Failed to fetch holidays:", err);
      setHolidays([]);
    }
  };

  // Reset extra hours data
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

  // Fetch extra hours data
  const fetchExtraHoursData = async (mrId) => {
    try {
      setExtraHoursData((prev) => ({ ...prev, loading: true }));

      const today = new Date();
      const response = await axios.get(
        `${backendUrl}/api/attendance/extra-hours/${mrId}`,
        {
          params: {
            year: today.getFullYear(),
            month: today.getMonth(),
          },
        },
      );

      if (response.data.success) {
        const data = response.data.data;

        // Get total and monthly minutes from the response
        const totalMinutes = data.totalExtraMinutes || 0;
        const monthlyMinutes = data.monthlyExtraMinutes || 0;

        // Calculate for total minutes
        const totalCalc = calculateRemainingTime(totalMinutes);

        // Calculate for monthly minutes
        const monthlyCalc = calculateRemainingTime(monthlyMinutes);

        setExtraHoursData({
          totalExtraHours: totalCalc.totalHours,
          totalExtraMinutes: totalMinutes,
          leaveDaysAvailable: totalCalc.days,
          remainingMinutes: totalCalc.minutes + totalCalc.hours * 60,
          monthlyExtraHours: monthlyCalc.totalHours,
          monthlyLeaveDaysAvailable: monthlyCalc.days,
          monthlyRemainingMinutes: monthlyCalc.minutes + monthlyCalc.hours * 60,
          loading: false,
          useMonthlyOnly: extraHoursData.useMonthlyOnly,
        });
      } else {
        throw new Error(response.data.message);
      }
    } catch (err) {
      console.error("Failed to fetch extra hours data:", err);
      resetExtraHoursData();
      showToast("error", "Failed to load extra hours data");
    }
  };

  // Calculate display values based on current mode (monthly or total)
  const getDisplayValues = () => {
    const { useMonthlyOnly, totalExtraMinutes, monthlyExtraMinutes } =
      extraHoursData;

    const minutesToUse = useMonthlyOnly
      ? monthlyExtraMinutes
      : totalExtraMinutes;
    const hoursToUse = minutesToUse / 60;
    const totalHours = parseFloat(hoursToUse.toFixed(2));

    const displayCalc = calculateRemainingTime(minutesToUse);

    return {
      showExtraHours: totalHours,
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
    const adjustedMonths = daysInMonth >= 30 ? months : Math.max(0, months - 1);

    return Math.max(0, adjustedMonths);
  };

  const calculatePaidLeaves = (joinDate) => {
    const monthsOfService = getMonthsOfService(joinDate);
    return (monthsOfService * 1.25).toFixed(2);
  };

  // Check if date is Sunday
  const isSunday = (date) => {
    const day = new Date(date).getDay();
    return day === 0;
  };

  // Check if date is holiday - FIXED: Now handles both date formats
  const isHoliday = (date) => {
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return false;
    }

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    return holidays.some((holiday) => {
      if (!holiday) return false;

      // Get the holiday date from either 'date' or 'startDate' field
      const holidayDateObj = holiday.date
        ? new Date(holiday.date)
        : holiday.startDate
          ? new Date(holiday.startDate)
          : null;

      if (!holidayDateObj) return false;

      const holidayDate = new Date(holidayDateObj);
      holidayDate.setHours(0, 0, 0, 0);

      return holidayDate.getTime() === checkDate.getTime();
    });
  };

  // Get holiday name for a date - FIXED: Now handles both date formats
  const getHolidayName = (date) => {
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return null;
    }

    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    const holiday = holidays.find((holiday) => {
      if (!holiday) return false;

      // Get the holiday date from either 'date' or 'startDate' field
      const holidayDateObj = holiday.date
        ? new Date(holiday.date)
        : holiday.startDate
          ? new Date(holiday.startDate)
          : null;

      if (!holidayDateObj) return false;

      const holidayDate = new Date(holidayDateObj);
      holidayDate.setHours(0, 0, 0, 0);

      return holidayDate.getTime() === checkDate.getTime();
    });

    return holiday ? holiday.name : null;
  };

  // Filter MR list based on search
  const filteredMRList = mrList.filter(
    (mr) =>
      mr.medicalRepName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mr.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mr.contactNo?.includes(searchTerm),
  );

  // Pagination
  const totalPages = Math.ceil(filteredMRList.length / itemsPerPage);
  const currentMRs = filteredMRList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Get attendance for a specific date and MR
  const getAttendanceForDate = (date, mrId) => {
    if (!mrId || !date) return null;

    // Create date object for comparison (ignore time)
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // Handle both object and string userId
    const records = attendanceRecords.filter((record) => {
      const recordUserId = record.userId?._id || record.userId;
      if (recordUserId !== mrId) return false;

      if (!record.loginTime) return false;

      // Create date from record's loginTime (which is in UTC)
      const recordDate = new Date(record.loginTime);
      recordDate.setHours(0, 0, 0, 0);

      // Compare dates (ignoring time)
      return recordDate.getTime() === checkDate.getTime();
    });

    return records.length > 0 ? records[0] : null;
  };

  // Enhanced isLeave function to properly handle all leave types
  const isLeave = (date, mrId) => {
    if (!mrId) return { isLeave: false, type: null };

    const leaves = mrLeaves[mrId] || [];

    // Create date object for comparison (ignore time)
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    // Check if there's a leave in the Leave collection
    for (let leave of leaves) {
      if (!leave.leaveDate || leave.status !== "approved") continue;

      // Create date from leave's leaveDate
      const leaveDate = new Date(leave.leaveDate);
      leaveDate.setHours(0, 0, 0, 0);

      // Compare dates (ignoring time)
      if (leaveDate.getTime() === checkDate.getTime()) {
        // Return the actual leaveType from the leave record
        return { 
          isLeave: true, 
          type: leave.leaveType || "unpaid",
          leaveDate: leave.leaveDate,
          reason: leave.reason
        };
      }
    }

    // Check attendance records for converted leaves (isLeaveDay = true)
    const attendance = getAttendanceForDate(date, mrId);
    if (attendance && attendance.isLeaveDay) {
      // Check if there's a corresponding swapleave in the leaves collection
      const swapLeave = leaves.find(leave => {
        if (!leave.leaveDate || leave.status !== "approved" || leave.leaveType !== "swapleave") 
          return false;
        
        const leaveDate = new Date(leave.leaveDate);
        leaveDate.setHours(0, 0, 0, 0);
        return leaveDate.getTime() === checkDate.getTime();
      });

      if (swapLeave) {
        return { isLeave: true, type: "swapleave", fromAttendance: true };
      }
      
      // If it's a leave day from attendance but no swapleave record, it's a paid leave
      return { isLeave: true, type: "paid", fromAttendance: true };
    }

    return { isLeave: false, type: null };
  };

  // Get leave counts with proper user ID matching - ONLY count unpaid leaves
  const getLeaveCounts = (mrId, joinDate) => {
    // Get leaves for this MR - mrId should match the userId in leaves data
    const leaves = mrLeaves[mrId] || [];

    // Filter only approved UNPAID leaves (not swapleave or paid)
    const approvedUnpaidLeaves = leaves.filter(
      (leave) => leave.status === "approved" && leave.leaveType === "unpaid"
    );

    // Also get swapleave leaves separately for display
    const swapLeaves = leaves.filter(
      (leave) => leave.status === "approved" && leave.leaveType === "swapleave"
    );

    // Get paid leaves (from attendance conversion but not recorded in leaves collection)
    const paidLeaves = leaves.filter(
      (leave) => leave.status === "approved" && leave.leaveType === "paid"
    );

    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Filter unpaid leaves to include only past and current dates
    const validUnpaidLeaves = approvedUnpaidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      date.setHours(0, 0, 0, 0);
      return date <= currentDate;
    });

    // Filter swap leaves
    const validSwapLeaves = swapLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      date.setHours(0, 0, 0, 0);
      return date <= currentDate;
    });

    // Filter paid leaves
    const validPaidLeaves = paidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      date.setHours(0, 0, 0, 0);
      return date <= currentDate;
    });

    // Monthly unpaid leaves count
    const monthlyUnpaidLeaves = validUnpaidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).length;

    // Monthly swap leaves count
    const monthlySwapLeaves = validSwapLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).length;

    // Monthly paid leaves count
    const monthlyPaidLeaves = validPaidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).length;

    // Annual unpaid leaves count
    const annualUnpaidLeaves = validUnpaidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= yearStart && date <= yearEnd;
    }).length;

    // Annual swap leaves count
    const annualSwapLeaves = validSwapLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= yearStart && date <= yearEnd;
    }).length;

    // Annual paid leaves count
    const annualPaidLeaves = validPaidLeaves.filter((leave) => {
      const date = new Date(leave.leaveDate);
      return date >= yearStart && date <= yearEnd;
    }).length;

    // Calculate paid leaves based on months of service
    const paidLeavesEntitlement = calculatePaidLeaves(joinDate);

    return {
      monthly: monthlyUnpaidLeaves,
      annual: annualUnpaidLeaves,
      paid: parseFloat(paidLeavesEntitlement),
      total: validUnpaidLeaves.length, // Total approved UNPAID leaves only
      swapLeaves: validSwapLeaves.length, // Total swap leaves
      paidLeaves: validPaidLeaves.length, // Total paid leaves
      monthlySwapLeaves: monthlySwapLeaves,
      annualSwapLeaves: annualSwapLeaves,
      monthlyPaidLeaves: monthlyPaidLeaves,
      annualPaidLeaves: annualPaidLeaves,
    };
  };

  // Calculate remaining paid leaves correctly - only deduct unpaid leaves
  const getRemainingPaidLeaves = (mrId, joinDate) => {
    const leaveCounts = getLeaveCounts(mrId, joinDate);
    // Only deduct unpaid leaves from the paid leave entitlement
    const remaining = leaveCounts.paid - leaveCounts.total;
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

  // Calculate attendance statistics - FIXED: Proper date comparison
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
      // Compare dates (ignoring time)
      const recordDateOnly = new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate(),
      );
      const monthStartOnly = new Date(
        currentMonthStart.getFullYear(),
        currentMonthStart.getMonth(),
        currentMonthStart.getDate(),
      );
      const monthEndOnly = new Date(
        currentMonthEnd.getFullYear(),
        currentMonthEnd.getMonth(),
        currentMonthEnd.getDate(),
      );

      return recordDateOnly >= monthStartOnly && recordDateOnly <= monthEndOnly;
    }).length;

    // Annual attendance count
    const annualAttendance = mrRecords.filter((record) => {
      const recordDate = new Date(record.loginTime);
      // Compare dates (ignoring time)
      const recordDateOnly = new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate(),
      );
      const yearStartOnly = new Date(
        yearStart.getFullYear(),
        yearStart.getMonth(),
        yearStart.getDate(),
      );
      const yearEndOnly = new Date(
        yearEnd.getFullYear(),
        yearEnd.getMonth(),
        yearEnd.getDate(),
      );

      return recordDateOnly >= yearStartOnly && recordDateOnly <= yearEndOnly;
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
      // Compare dates (ignoring time)
      const recordDateOnly = new Date(
        recordDate.getFullYear(),
        recordDate.getMonth(),
        recordDate.getDate(),
      );
      const todayOnly = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );

      return (
        recordDateOnly.getTime() === todayOnly.getTime() && !record.logoutTime
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
      showToast("error", "Please fill all fields");
      return;
    }

    if (startTime >= endTime) {
      showToast("error", "End time must be after start time");
      return;
    }

    // Check if date is in the future
    if (isFutureDate(startDate)) {
      showToast("error", "Cannot record attendance for future dates");
      return;
    }

    // Create date strings with timezone offset
    const loginDateTime = `${startDate}T${startTime}`;
    const logoutDateTime = `${startDate}T${endTime}`;

    // Get timezone offset
    const timezoneOffset = new Date().getTimezoneOffset();
    const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
    const offsetMinutes = Math.abs(timezoneOffset) % 60;
    const offsetSign = timezoneOffset > 0 ? "-" : "+";
    const timezoneString = `${offsetSign}${offsetHours.toString().padStart(2, "0")}:${offsetMinutes.toString().padStart(2, "0")}`;

    if (isSunday(startDate)) {
      showToast("error", "Cannot record attendance on Sunday");
      return;
    }

    // Check if holiday
    const holidayName = getHolidayName(startDate);
    if (isHoliday(startDate)) {
      showToast("error", `Cannot record attendance on holiday: ${holidayName}`);
      return;
    }

    const selectedDate = new Date(startDate);
    const leaveInfo = isLeave(selectedDate, selectedAttendanceMr);
    if (leaveInfo.isLeave) {
      showToast("error", "Cannot record attendance on a leave day");
      return;
    }

    try {
      setAttendanceLoading(true);

      // Send attendance data with timezone
      const attendanceData = {
        userId: selectedAttendanceMr,
        loginTime: `${loginDateTime}${timezoneString}`,
        logoutTime: `${logoutDateTime}${timezoneString}`,
        workingHoursPerDay: 8,
      };

      const response = await axios.post(
        `${backendUrl}/api/attendance/record`,
        attendanceData,
      );

      if (response.data.success) {
        showToast("success", "Attendance recorded successfully!");
        setShowAttendanceModal(false);
        setSelectedAttendanceMr(null);
        setStartDate("");
        setStartTime("");
        setEndTime("");

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

  // Handle leave application - UPDATED to include leaveType
  const handleApplyLeave = async () => {
    if (!selectedAttendanceMr || !leaveDate || !leaveReason || !leaveType) {
      showToast("error", "Please fill all required fields");
      return;
    }

    // Check if date is in the future
    if (isFutureDate(leaveDate)) {
      showToast("error", "Cannot apply for leave for future dates");
      return;
    }

    if (isSunday(leaveDate)) {
      showToast("error", "Cannot apply for leave on Sunday");
      return;
    }

    // Check if holiday
    const holidayName = getHolidayName(leaveDate);
    if (isHoliday(leaveDate)) {
      showToast("error", `Cannot apply for leave on holiday: ${holidayName}`);
      return;
    }

    const selectedDate = new Date(leaveDate);
    const attendanceOnDate = getAttendanceForDate(
      selectedDate,
      selectedAttendanceMr,
    );
    if (attendanceOnDate) {
      showToast(
        "error",
        "Cannot apply for leave on a day with existing attendance",
      );
      return;
    }

    // Check if user has enough paid leaves for paid leave type
    if (leaveType === "paid") {
      const mr = mrList.find(mr => mr._id === selectedAttendanceMr);
      const remainingPaid = getRemainingPaidLeaves(selectedAttendanceMr, mr?.date);
      if (parseFloat(remainingPaid) < 1) {
        showToast("error", "Insufficient paid leave balance. Please apply for unpaid leave.");
        return;
      }
    }

    try {
      setLeaveLoading(true);

      const leaveData = {
        userId: selectedAttendanceMr,
        leaveDate: new Date(leaveDate).toISOString(),
        reason: leaveReason,
        leaveType: leaveType, // Use the selected leaveType
        status: "approved",
      };

      const response = await axios.post(`${backendUrl}/api/leaves`, leaveData);

      if (response.data.success) {
        showToast("success", `${leaveType === 'paid' ? 'Paid' : 'Unpaid'} leave applied successfully!`);
        setShowLeaveModal(false);
        setSelectedAttendanceMr(null);
        setLeaveDate("");
        setLeaveReason("");
        setLeaveType("unpaid"); // Reset to default

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

    // Validate leave days
    if (extraHoursDays < 1) {
      showToast("error", "Please select at least 1 leave day");
      return;
    }

    // Get display values
    const displayValues = getDisplayValues();

    if (displayValues.showLeaveDaysAvailable < extraHoursDays) {
      const source = extraHoursData.useMonthlyOnly ? "monthly" : "total";
      showToast(
        "error",
        `Insufficient ${source} extra hours. Available: ${displayValues.showLeaveDaysAvailable} days, Required: ${extraHoursDays} days`,
      );
      return;
    }

    // Check if date is valid (not Sunday, not holiday)
    if (isSunday(extraHoursDate)) {
      showToast("error", "Cannot take leave on Sunday");
      return;
    }

    // Check if holiday
    const holidayName = getHolidayName(extraHoursDate);
    if (isHoliday(extraHoursDate)) {
      showToast("error", `Cannot take leave on holiday: ${holidayName}`);
      return;
    }

    // Check if there's already an attendance record for this date
    const existingAttendance = attendanceRecords.find((record) => {
      const recordUserId = record.userId?._id || record.userId;
      if (recordUserId !== selectedAttendanceMr) return false;

      if (!record.loginTime) return false;

      // Create dates for comparison (ignoring time)
      const recordDate = new Date(record.loginTime);
      recordDate.setHours(0, 0, 0, 0);

      const checkDate = new Date(extraHoursDate);
      checkDate.setHours(0, 0, 0, 0);

      return recordDate.getTime() === checkDate.getTime();
    });

    // If there's an existing attendance record that is NOT a leave day, we can't convert
    if (existingAttendance && !existingAttendance.isLeaveDay) {
      showToast("error", "Regular attendance already exists for this date");
      return;
    }

    // If there's already a paid leave attendance, we can't convert again
    if (existingAttendance && existingAttendance.isLeaveDay) {
      showToast("error", "This date is already marked as a leave day");
      return;
    }

    try {
      setConvertingExtraHours(true);

      const convertData = {
        userId: selectedAttendanceMr,
        date: extraHoursDate,
        leaveDays: extraHoursDays,
        useMonthlyOnly: extraHoursData.useMonthlyOnly,
        convertExtraHours: true,
      };

      const response = await axios.post(
        `${backendUrl}/api/attendance/convert-to-leave`,
        convertData,
      );

      if (response.data.success) {
        showToast(
          "success",
          `${extraHoursDays} leave day${extraHoursDays > 1 ? "s" : ""} successfully converted from extra hours!`,
        );

        await fetchAttendanceRecords();
        await fetchLeaves();
        if (selectedAttendanceMr) {
          await fetchExtraHoursData(selectedAttendanceMr);
        }

        // Reset form
        setExtraHoursDate("");
        setExtraHoursDays(1);
      } else {
        showToast(
          "error",
          response.data.message || "Failed to convert to leave",
        );
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      console.error("❌ Conversion error:", errorMessage);
      showToast("error", `Failed to convert to leave: ${errorMessage}`);
    } finally {
      setConvertingExtraHours(false);
    }
  };

  // Calculate extra hours for a specific MR
  const getExtraHoursForMR = (mrId) => {
    // Filter records for this MR
    const mrRecords = attendanceRecords.filter((record) => {
      const recordUserId = record.userId?._id || record.userId;
      return recordUserId === mrId && record.isLeaveDay !== true; // Exclude leave days
    });

    let totalExtraMinutes = 0;
    mrRecords.forEach((record, index) => {
      if (record.extraHoursInMinutes && record.extraHoursInMinutes > 0) {
        totalExtraMinutes += record.extraHoursInMinutes;
      }
    });

    const hours = totalExtraMinutes / 60;
    return hours;
  };

  // Open attendance modal
  const handleOpenAttendanceModal = () => {
    setShowAttendanceModal(true);
    setSelectedAttendanceMr(null);

    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    setStartDate(todayString);
    setStartTime("09:00");
    setEndTime("17:00");
  };

  // Open leave modal - UPDATED to reset leaveType
  const handleOpenLeaveModal = () => {
    setShowLeaveModal(true);
    setSelectedAttendanceMr(null);

    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    setLeaveDate(todayString);
    setLeaveReason("");
    setLeaveType("unpaid"); // Reset to default
  };

  // Open extra hours modal
  const handleOpenExtraHoursModal = () => {
    setShowExtraHoursModal(true);
    setSelectedAttendanceMr(null);

    const today = new Date();
    const todayString = today.toISOString().split("T")[0];
    setExtraHoursDate(todayString);
    setExtraHoursDays(1);
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
      {/* Attendance Modal */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Record Attendance</h2>

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
                      checked={true}
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
                  isLeave(new Date(startDate), selectedAttendanceMr).isLeave
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
                  isLeave(new Date(startDate), selectedAttendanceMr).isLeave
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <Clock size={16} />
                {attendanceLoading ? "Recording..." : "Record Attendance"}
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

      {/* Leave Modal - UPDATED with Leave Type dropdown */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Apply Leave</h2>

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

            {/* Leave Type Dropdown - NEW */}
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
                  Available paid leaves: {
                    mrList.find(mr => mr._id === selectedAttendanceMr) ? 
                    getRemainingPaidLeaves(selectedAttendanceMr, mrList.find(mr => mr._id === selectedAttendanceMr).date) 
                    : "0.00"
                  }
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
                      checked={true}
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
                  isFutureDate(leaveDate) || // Disable if future date
                  isSunday(leaveDate) ||
                  isHoliday(leaveDate) ||
                  getAttendanceForDate(
                    new Date(leaveDate),
                    selectedAttendanceMr,
                  )
                }
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  leaveLoading ||
                  !selectedAttendanceMr ||
                  !leaveDate ||
                  !leaveReason ||
                  !leaveType ||
                  isFutureDate(leaveDate) ||
                  isSunday(leaveDate) ||
                  isHoliday(leaveDate) ||
                  getAttendanceForDate(
                    new Date(leaveDate),
                    selectedAttendanceMr,
                  )
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                } text-white`}
              >
                <Calendar size={16} />
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

      {/* Extra Hours Modal */}
      {showExtraHoursModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              Convert Extra Hours to Leave
            </h2>

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

            {!selectedAttendanceMr ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <Briefcase size={48} className="mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500 font-medium">
                  Select an MR to view extra hours
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Extra hours will be calculated from attendance records
                </p>
              </div>
            ) : extraHoursData.loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-500 mt-3">
                  Loading extra hours data...
                </p>
              </div>
            ) : (
              <>
                {/* Mode Toggle */}
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
                  <p className="text-xs text-blue-600 mt-1 ml-6">
                    {extraHoursData.useMonthlyOnly
                      ? `Showing: Current month only (${new Date().toLocaleString("default", { month: "long" })} ${new Date().getFullYear()})`
                      : "Showing: All extra hours from all months"}
                  </p>
                </div>

                {/* Get display values */}
                {(() => {
                  const displayValues = getDisplayValues();
                  const hasExtraHours = displayValues.showTotalMinutes > 0;

                  return hasExtraHours ? (
                    <>
                      {/* Extra Hours Summary */}
                      <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <h3 className="font-semibold text-gray-800 mb-2">
                          Extra Hours Summary
                        </h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Hours:</span>
                            <span className="font-bold text-green-700">
                              {displayValues.showExtraHours.toFixed(2)} hrs
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">
                              Available Days:
                            </span>
                            <span className="font-bold text-purple-700">
                              {displayValues.showLeaveDaysAvailable} day
                              {displayValues.showLeaveDaysAvailable !== 1
                                ? "s"
                                : ""}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Remaining:</span>
                            <span className="font-bold text-gray-700">
                              {displayValues.showRemainingHours}h{" "}
                              {displayValues.showRemainingMinutes}m
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          8 extra hours = 1 leave day
                        </p>
                      </div>

                      {/* Convert Extra Hours to Leave Form */}
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
                                  checked={true}
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
                              max={displayValues.showLeaveDaysAvailable}
                              value={extraHoursDays}
                              onChange={(e) =>
                                setExtraHoursDays(parseInt(e.target.value) || 1)
                              }
                              className="w-24 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <span className="text-gray-600">day(s)</span>
                            <span className="text-gray-500 text-sm">
                              (Each day requires 8 extra hours)
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Available: {displayValues.showLeaveDaysAvailable}{" "}
                            days ({displayValues.showExtraHours.toFixed(2)}{" "}
                            hours)
                          </p>
                        </div>

                        <button
                          onClick={handleConvertExtraHoursToLeave}
                          disabled={
                            convertingExtraHours ||
                            !extraHoursDate ||
                            displayValues.showLeaveDaysAvailable <
                              extraHoursDays ||
                            extraHoursDays < 1 ||
                            isSunday(extraHoursDate) ||
                            isHoliday(extraHoursDate)
                          }
                          className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 ${
                            convertingExtraHours ||
                            !extraHoursDate ||
                            displayValues.showLeaveDaysAvailable <
                              extraHoursDays ||
                            extraHoursDays < 1 ||
                            isSunday(extraHoursDate) ||
                            isHoliday(extraHoursDate)
                              ? "bg-gray-400 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700"
                          } text-white font-medium transition-colors`}
                        >
                          {convertingExtraHours ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
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

                        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                          <AlertCircle size={12} className="inline mr-1" />
                          Each leave day requires 8 extra working hours. Leave
                          can be converted for any date (past, present, or
                          future) that is not Sunday or holiday.
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8 bg-gradient-to-r from-gray-50 to-slate-50 rounded-lg border border-gray-200">
                      <Clock size={48} className="mx-auto text-gray-400 mb-3" />
                      <p className="text-gray-500 font-medium">
                        No extra hours available
                      </p>
                      <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">
                        This MR hasn't worked beyond the standard 8-hour workday{" "}
                        {extraHoursData.useMonthlyOnly ? "this month" : "yet"}.
                        Extra hours are calculated when working hours exceed 8
                        hours per day.
                      </p>
                    </div>
                  );
                })()}
              </>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowExtraHoursModal(false);
                }}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
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
                    <span className="ml-2 text-lg font-normal">
                      (Unpaid Leave Taken: {getLeaveCounts(selectedMr._id, selectedMr.date).total}, 
                      Swap Leaves: {getLeaveCounts(selectedMr._id, selectedMr.date).swapLeaves})
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
                      { month: "long" },
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
                  ),
                )}

                {getDaysInMonth().map((date, index) => {
                  if (date === null) {
                    return <div key={`empty-${index}`} className="h-12" />;
                  }

                  const attendance = getAttendanceForDate(
                    date,
                    selectedMr?._id,
                  );
                  const leaveInfo = isLeave(date, selectedMr?._id);
                  const isLeaveDay = leaveInfo.isLeave;
                  const leaveType = leaveInfo.type;
                  const isSundayDay = isSunday(date);
                  const isHolidayDay = isHoliday(date);
                  const isCurrentMonth = date.getMonth() === currentMonth;
                  const isToday =
                    date.toDateString() === new Date().toDateString();

                  let cellStyle = "h-12 flex items-center justify-center rounded-lg border-2 ";
                  let titleText = "";

                  if (attendance && !attendance.isLeaveDay) {
                    // Regular attendance (not leave) - green
                    cellStyle += "bg-green-500 text-white border-green-600 ";
                    titleText = "Present";
                  } else if (isLeaveDay) {
                    // It's a leave day
                    if (leaveType === "swapleave") {
                      // Leave swap (converted from extra hours) - purple
                      cellStyle += "bg-purple-500 text-white border-purple-600 ";
                      titleText = "Leave Swap (Converted from extra hours)";
                    } else if (leaveType === "paid") {
                      // Paid leave (converted from extra hours via attendance) - blue
                      cellStyle += "bg-blue-500 text-white border-blue-600 ";
                      titleText = "Paid Leave (From extra hours)";
                    } else {
                      // Unpaid leave - red
                      cellStyle += "bg-red-500 text-white border-red-600 ";
                      titleText = "Unpaid Leave";
                    }
                  } else if (isSundayDay) {
                    cellStyle += "bg-red-400 text-white border-red-500 ";
                    titleText = "Sunday";
                  } else if (isHolidayDay) {
                    cellStyle += "bg-gray-400 text-white border-gray-500 ";
                    titleText = `Holiday: ${getHolidayName(date)}`;
                  } else if (isToday) {
                    cellStyle += "border-blue-500 bg-blue-50 ";
                    titleText = "Today - Working Day";
                  } else {
                    cellStyle += "border-gray-200 bg-gray-50 ";
                    titleText = "Working Day";
                  }

                  if (!isCurrentMonth) {
                    cellStyle += "opacity-40 ";
                  }

                  return (
                    <div
                      key={date.toISOString()}
                      className={cellStyle.trim()}
                      title={titleText}
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
                  <div className="w-4 h-4 bg-purple-500 rounded border-2 border-purple-600"></div>
                  <span>Leave Swap</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-500 rounded border-2 border-blue-600"></div>
                  <span>Paid Leave</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-600"></div>
                  <span>Unpaid Leave</span>
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
                    <span className="ml-2 text-lg font-normal">
                      (Unpaid Leave Taken: {getLeaveCounts(selectedMr._id, selectedMr.date).total}, 
                      Swap Leaves: {getLeaveCounts(selectedMr._id, selectedMr.date).swapLeaves})
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
                    monthIndex,
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
                          ),
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
                            selectedMr?._id,
                          );
                          const leaveInfo = isLeave(date, selectedMr?._id);
                          const isLeaveDay = leaveInfo.isLeave;
                          const leaveType = leaveInfo.type;
                          const isSundayDay = isSunday(date);
                          const isHolidayDay = isHoliday(date);

                          let cellStyle =
                            "h-6 flex items-center justify-center rounded text-xs ";

                          if (attendance && !attendance.isLeaveDay) {
                            cellStyle += "bg-green-500 text-white ";
                          } else if (isLeaveDay) {
                            if (leaveType === "swapleave") {
                              cellStyle += "bg-purple-500 text-white ";
                            } else if (leaveType === "paid") {
                              cellStyle += "bg-blue-500 text-white ";
                            } else {
                              cellStyle += "bg-red-500 text-white ";
                            }
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
                                    ? leaveType === "swapleave"
                                      ? "Leave Swap"
                                      : leaveType === "paid"
                                        ? "Paid Leave"
                                        : "Unpaid Leave"
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
              <div className="flex gap-2">
                <button
                  onClick={handleOpenAttendanceModal}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
                >
                  <Clock size={16} />
                  Record Attendance
                </button>
                <button
                  onClick={handleOpenLeaveModal}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg cursor-pointer"
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
                <th className="p-3">Sr No</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">MR Email</th>
                <th className="p-3">MR Contact</th>
                <th className="p-3">Paid Leave</th>
                <th className="p-3">Leave Taken</th>
                <th className="p-3">Remaining Paid</th>
                <th className="p-3">Extra Hours</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const leaveCounts = getLeaveCounts(mr._id, mr.date);
                  const remainingPaid = getRemainingPaidLeaves(mr._id, mr.date);
                  const leaveTaken = leaveCounts.total; // This now only counts unpaid leaves
                  const attendanceStats = getAttendanceStats(mr._id);

                  // Calculate extra hours
                  const totalExtraHours = getExtraHoursForMR(mr._id);
                  const extraHoursCalc = calculateRemainingTime(
                    totalExtraHours * 60,
                  );
                  const extraHoursDaysAvailable = extraHoursCalc.days;

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
                        {leaveCounts.swapLeaves > 0 && (
                          <span className="ml-2 bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm font-medium">
                            +{leaveCounts.swapLeaves} swap
                          </span>
                        )}
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

                      <td className="p-3">
                        {totalExtraHours > 0 ? (
                          <div className="flex flex-col items-center gap-1">
                            {/* Days in blue badge */}
                            {extraHoursCalc.days > 0 && (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">
                                <Clock size={10} />
                                {extraHoursCalc.days} day
                                {extraHoursCalc.days !== 1 ? "s" : ""}
                              </span>
                            )}

                            {/* Remaining hours in yellow badge */}
                            {(extraHoursCalc.hours > 0 ||
                              extraHoursCalc.minutes > 0) && (
                              <span className="inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">
                                <Clock size={10} />
                                {extraHoursCalc.hours}h {extraHoursCalc.minutes}
                                m
                              </span>
                            )}

                            {/* Total hours in small text */}
                            <span className="text-xs text-gray-500">
                              Total: {totalExtraHours.toFixed(2)} hours
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">
                            No extra hours
                          </span>
                        )}
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
                  <td colSpan={9} className="p-3 text-center text-gray-500">
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
                ),
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