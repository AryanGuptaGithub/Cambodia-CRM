import React, { useState, useEffect, useMemo } from "react";
import {
  Eye,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  LogIn,
  LogOut,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import axios from "axios";

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
  const [currentAttendanceId, setCurrentAttendanceId] = useState(null);
  const [loginTime, setLoginTime] = useState(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  
  // New state for date range in modal
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchMRList();
    fetchAttendanceRecords();
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

  const fetchAttendanceRecords = async () => {
    try {
      const response = await axios.get(`${backendUrl}/api/attendance`);
      setAttendanceRecords(response.data || []);
    } catch (err) {
      console.error("Failed to fetch attendance records:", err);
    }
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
  const isSunday = (date) => date.getDay() === 0;

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

  // Check if navigation to next month/year is allowed (not beyond current date)
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

    // Calculate attendance percentage (based on working days)
    const totalWorkingDays = getWorkingDaysInMonth(currentYear, currentMonth);
    const attendancePercentage = totalWorkingDays > 0 
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

  // Helper function to get working days in a month (excluding Sundays)
  const getWorkingDaysInMonth = (year, month) => {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    let workingDays = 0;

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      if (date.getDay() !== 0) { // Not Sunday
        workingDays++;
      }
    }

    return workingDays;
  };

  // Render monthly calendar
  const renderMonthlyCalendar = () => {
    const days = getDaysInMonth();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const attendanceStats = selectedMr
      ? getAttendanceStats(selectedMr._id)
      : { monthly: 0, annual: 0, percentage: 0, currentStatus: "Logged Out" };

    const today = new Date();
    const isCurrentMonthAndYear =
      currentMonth === today.getMonth() && currentYear === today.getFullYear();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {selectedMr?.medicalRepName} - Attendance Calendar
          </h2>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                Monthly Attendance: {attendanceStats.monthly}
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-green-800">
                Current Status: {attendanceStats.currentStatus}
              </div>
            </div>
            <button
              onClick={() => navigateMonth("prev")}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-semibold">
              {monthNames[currentMonth]} {currentYear}
              {isCurrentMonthAndYear}
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
            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === new Date().toDateString();
            const isFuture = isFutureDate(date);

            // Determine cell style based on conditions
            let cellStyle =
              "h-12 flex items-center justify-center rounded-lg border-2 ";

            if (attendance) {
              // Attendance recorded - green
              cellStyle += "bg-green-500 text-white border-green-600 ";
            } else if (isSundayDay) {
              // Sundays - gray
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

            return (
              <div
                key={date.toISOString()}
                className={cellStyle.trim()}
                title={
                  attendance
                    ? `Login: ${new Date(
                        attendance.loginTime
                      ).toLocaleTimeString()} ${
                        attendance.logoutTime
                          ? `\nLogout: ${new Date(
                              attendance.logoutTime
                            ).toLocaleTimeString()}`
                          : ""
                      }`
                    : "No attendance"
                }
              >
                {date.getDate()}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col md:flex-row justify-between items-center bg-gray-50 rounded-lg p-4 gap-6">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 items-center text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-green-500 rounded border-2 border-green-600"></div>
              <span>Present</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-gray-400 rounded border-2 border-gray-500"></div>
              <span>Sunday</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-gray-50 rounded border-2 border-gray-200"></div>
              <span>Working Day</span>
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
          </div>
        </div>
      </div>
    );
  };

  // Render annual calendar
  const renderAnnualCalendar = () => {
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const attendanceStats = selectedMr
      ? getAttendanceStats(selectedMr._id)
      : { monthly: 0, annual: 0, percentage: 0, currentStatus: "Logged Out" };

    const today = new Date();
    const currentYearToday = today.getFullYear();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {selectedMr?.medicalRepName} - Attendance Calendar
          </h2>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                Annual Attendance: {attendanceStats.annual}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-green-800">
                Current Status: {attendanceStats.currentStatus}
              </div>
            </div>

            <button
              onClick={() => navigateYear("prev")}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-lg font-semibold">
              {currentYear}
              {currentYear === currentYearToday}
            </span>
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
          {monthNames.map((monthName, monthIndex) => {
            const monthDays = getDaysInMonth(currentYear, monthIndex);
            const today = new Date();
            const isCurrentMonth =
              monthIndex === today.getMonth() &&
              currentYear === today.getFullYear();
            const isFutureYear = currentYear > today.getFullYear();
            const isFutureMonth =
              currentYear === today.getFullYear() &&
              monthIndex > today.getMonth();

            return (
              <div
                key={monthName}
                className={`border rounded-lg p-4 ${
                  isCurrentMonth
                    ? "border-blue-500 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white"
                } ${isFutureMonth || isFutureYear ? "opacity-50" : ""}`}
              >
                <h3
                  className={`text-lg font-semibold text-center mb-3 ${
                    isCurrentMonth ? "text-blue-800" : "text-gray-800"
                  }`}
                >
                  {monthName}
                  {isCurrentMonth && (
                    <span className="block text-xs font-normal text-blue-600 mt-1">
                      (Current)
                    </span>
                  )}
                </h3>

                <div className="grid grid-cols-7 gap-1 mb-2">
                  {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                    <div
                      key={day}
                      className={`text-center text-xs font-medium ${
                        index === 0 ? "text-red-600" : "text-gray-600"
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((date, index) => {
                    if (date === null) {
                      return <div key={`empty-${index}`} className="h-6" />;
                    }

                    const attendance = getAttendanceForDate(
                      date,
                      selectedMr?._id
                    );
                    const isSundayDay = isSunday(date);
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const isFuture = isFutureDate(date);

                    // Determine cell style
                    let cellStyle =
                      "h-6 flex items-center justify-center rounded text-xs ";

                    if (isFuture) {
                      cellStyle += "bg-gray-100 opacity-40 ";
                    } else if (attendance) {
                      cellStyle += "bg-green-500 text-white ";
                    } else if (isSundayDay) {
                      cellStyle += "bg-gray-400 text-white ";
                    } else if (isToday) {
                      cellStyle += "bg-blue-500 text-white ";
                    } else {
                      cellStyle += "bg-gray-100 ";
                    }

                    return (
                      <div
                        key={date.toISOString()}
                        className={cellStyle.trim()}
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
    );
  };

  // Handle view action - open calendar for specific MR
  const handleView = (mr) => {
    setSelectedMr(mr);
    setShowCalendarView(true);
    setCalendarViewType("monthly");
    // Set to current date when opening calendar view
    const today = new Date();
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  // Handle add attendance action
  const handleAddAttendance = () => {
    if (!selectedAttendanceMr) {
      alert("Please select an MR first");
      return;
    }
    
    setShowAddAttendanceModal(true);
    
    // Check if user is currently logged in
    const todayRecord = attendanceRecords.find((record) => {
      const recordDate = new Date(record.loginTime);
      return (
        record.userId?._id === selectedAttendanceMr &&
        recordDate.toDateString() === new Date().toDateString() &&
        !record.logoutTime
      );
    });

    if (todayRecord) {
      setCurrentAttendanceId(todayRecord._id);
      setLoginTime(new Date(todayRecord.loginTime));
    } else {
      setCurrentAttendanceId(null);
      setLoginTime(null);
    }

    // Set default dates to today
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    setStartDate(todayString);
    setEndDate(todayString);
  };

  // Handle login
  const handleLogin = async () => {
    if (!selectedAttendanceMr) return;

    try {
      setAttendanceLoading(true);
      const now = new Date();
      
      const loginData = {
        userId: selectedAttendanceMr,
        loginTime: now.toISOString()
      };

      const response = await axios.post(`${backendUrl}/api/attendance/login`, loginData);
      
      if (response.data.success) {
        setLoginTime(now);
        setCurrentAttendanceId(response.data.attendance._id);
        alert(`Login recorded at ${now.toLocaleTimeString()}`);
        
        // Refresh attendance records
        fetchAttendanceRecords();
      }
    } catch (err) {
      alert("Failed to record login: " + (err.response?.data?.message || err.message));
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    if (!currentAttendanceId) {
      alert("You are not logged in!");
      return;
    }

    try {
      setAttendanceLoading(true);
      const now = new Date();
      
      const logoutData = {
        logoutTime: now.toISOString()
      };

      const response = await axios.put(
        `${backendUrl}/api/attendance/logout/${currentAttendanceId}`, 
        logoutData
      );
      
      if (response.data.success) {
        setLoginTime(null);
        setCurrentAttendanceId(null);
        
        const totalTime = response.data.attendance.totalTime;
        alert(`Logout recorded at ${now.toLocaleTimeString()}\nTotal time: ${totalTime}`);
        
        // Refresh attendance records
        fetchAttendanceRecords();
      }
    } catch (err) {
      alert("Failed to record logout: " + (err.response?.data?.message || err.message));
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Clear all records
  const clearRecords = async () => {
    if (window.confirm("Are you sure you want to clear all attendance records?")) {
      try {
        await axios.delete(`${backendUrl}/api/attendance`);
        setAttendanceRecords([]);
        alert("All attendance records cleared successfully");
      } catch (err) {
        alert("Failed to clear records: " + err.response?.data?.message);
      }
    }
  };

  if (loading) return <div className="p-6 text-center">Loading MR List...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      {/* Add Attendance Modal */}
      {showAddAttendanceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">
              Record Attendance
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

            {/* Date Range Selection */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="mb-4">
              <p>
                Current Status:{" "}
                <strong>{currentAttendanceId ? "Logged In" : "Logged Out"}</strong>
              </p>
              {loginTime && (
                <p>
                  Login Time:{" "}
                  <strong>{new Date(loginTime).toLocaleString()}</strong>
                </p>
              )}
            </div>

            <div className="flex gap-3 mb-4">
              <button
                onClick={handleLogin}
                disabled={!!currentAttendanceId || attendanceLoading || !selectedAttendanceMr}
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  currentAttendanceId || attendanceLoading || !selectedAttendanceMr
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700"
                } text-white`}
              >
                <LogIn size={16} />
                {attendanceLoading ? "Processing..." : "Login"}
              </button>
              
              <button
                onClick={handleLogout}
                disabled={!currentAttendanceId || attendanceLoading || !selectedAttendanceMr}
                className={`flex-1 py-2 px-4 rounded-lg flex items-center justify-center gap-2 ${
                  !currentAttendanceId || attendanceLoading || !selectedAttendanceMr
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700"
                } text-white`}
              >
                <LogOut size={16} />
                {attendanceLoading ? "Processing..." : "Logout"}
              </button>
            </div>

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

      {!showCalendarView && (
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">MR Attendance Records</h1>

          <div className="flex items-center gap-4">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {filteredMRList.length}
              </span>
            </p>
            
            {/* Add Attendance Button */}
            <button
              onClick={handleAddAttendance}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg cursor-pointer"
            >
              <Clock size={16} />
              Add Attendance
            </button>

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
                className="pl-10 pr-4 py-2 w-full border rounded-lg shadow-sm focus:ring focus:ring-indigo-200"
              />
            </div>
          </div>
        </div>
      )}

      {showCalendarView ? (
        /* Calendar View */
        <div>
          {/* Back Button and Tabs */}
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

          {/* Calendar Display */}
          {calendarViewType === "monthly"
            ? renderMonthlyCalendar()
            : renderAnnualCalendar()}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-x-auto shadow rounded-2xl border border-gray-200">
          <div className="flex justify-between items-center p-4 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold">Attendance Records</h2>
            {attendanceRecords.length > 0 && (
              <button
                onClick={clearRecords}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg cursor-pointer"
              >
                Clear All Records
              </button>
            )}
          </div>

          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b text-sm">
              <tr>
                <th className="p-3">Sr No</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">MR Email</th>
                <th className="p-3">MR Contact</th>
                <th className="p-3">Attendance (Monthly)</th>
                <th className="p-3">Attendance (Annual)</th>
                <th className="p-3">Attendance Percent</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
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
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                          {attendanceStats.monthly}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm font-medium">
                          {attendanceStats.annual}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-sm font-medium">
                          {attendanceStats.percentage}%
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

          {/* Pagination */}
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

export default Attendance;