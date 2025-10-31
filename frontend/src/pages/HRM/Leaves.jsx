import React, { useState, useEffect, useMemo } from "react";
import {
  Eye,
  Edit,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from "lucide-react";
import axios from "axios";

const backendUrl = import.meta.env.VITE_BACKEND_URL;

const Leaves = () => {
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

  // Mock leave data - replace with actual API calls
  const [mrLeaves, setMrLeaves] = useState({});

  useEffect(() => {
    fetchMRList();
  }, []);

  const fetchMRList = async () => {
    try {
      setLoading(true);
      // Replace with actual API endpoint
      const response = await axios.get(`${backendUrl}/api/staffs`);

      setMrList(response.data || []);

      // Mock leave data - replace with actual leave API calls
      const mockLeaves = {};
      response.data.forEach((mr) => {
        mockLeaves[mr._id] = generateMockLeaves();
      });
      setMrLeaves(mockLeaves);
    } catch (err) {
      setError(err.message || "Failed to fetch MR list");
    } finally {
      setLoading(false);
    }
  };

  // Generate mock leave data for demonstration - ONLY PAST AND CURRENT DATES
  const generateMockLeaves = () => {
    const leaves = [];
    return leaves;
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

  // Calendar functions
  const isSunday = (date) => date.getDay() === 0;

  const isLeave = (date, mrId) => {
    if (!mrId) return false;
    const dateString = date.toISOString().split("T")[0];
    const leaves = mrLeaves[mrId] || [];
    return leaves.includes(dateString);
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
        // Don't allow navigation beyond current month
        return (
          currentYear < currentYearToday ||
          (currentYear === currentYearToday && currentMonth < currentMonthToday)
        );
      }
    } else {
      // annual view
      if (direction === "next") {
        // Don't allow navigation beyond current year
        return currentYear < currentYearToday;
      }
    }
    return true; // Always allow previous navigation
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
      // Only allow next if not beyond current date
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
      // Only allow next if not beyond current year
      if (canNavigateNext("next", "annual")) {
        setCurrentYear(currentYear + 1);
      }
    }
  };

  // Fixed leave counts calculation
  const getLeaveCounts = (mrId) => {
    const leaves = mrLeaves[mrId] || [];
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);
    const yearStart = new Date(currentYear, 0, 1);
    const yearEnd = new Date(currentYear, 11, 31);

    // Filter leaves to include only past and current dates
    const validLeaves = leaves.filter((leaveDate) => {
      const date = new Date(leaveDate);
      date.setHours(0, 0, 0, 0);
      return date <= currentDate;
    });

    // Monthly leaves count
    const monthlyLeaves = validLeaves.filter((leaveDate) => {
      const date = new Date(leaveDate);
      return date >= currentMonthStart && date <= currentMonthEnd;
    }).length;

    // Annual leaves count
    const annualLeaves = validLeaves.filter((leaveDate) => {
      const date = new Date(leaveDate);
      return date >= yearStart && date <= yearEnd;
    }).length;

    // Calculate paid leaves (1.25 days per month)
    const currentMonthNumber = new Date().getMonth() + 1; // Current month (1–12)
    const paidLeaves = (currentMonthNumber * 1.25).toFixed(2);

    return {
      monthly: monthlyLeaves,
      annual: annualLeaves,
      paid: parseFloat(paidLeaves),
    };
  };

  // Calculate remaining paid leaves
  const getRemainingPaidLeaves = (mrId) => {
    const leaveCounts = getLeaveCounts(mrId);
    const remaining = leaveCounts.paid - leaveCounts.annual;
    return Math.max(0, remaining).toFixed(2);
  };

  // Render monthly calendar
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

    const leaveCounts = selectedMr
      ? getLeaveCounts(selectedMr._id)
      : { monthly: 0, annual: 0, paid: 0 };
    const remainingPaid = selectedMr
      ? getRemainingPaidLeaves(selectedMr._id)
      : 0;

    const today = new Date();
    const isCurrentMonthAndYear =
      currentMonth === today.getMonth() && currentYear === today.getFullYear();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {selectedMr?.medicalRepName}
          </h2>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                Monthly Leaves: {leaveCounts.monthly}
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-green-800">
                Paid Leaves: {leaveCounts.paid}
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

            const isLeaveDay = isLeave(date, selectedMr?._id);
            const isSundayDay = isSunday(date);
            const isCurrentMonth = date.getMonth() === currentMonth;
            const isToday = date.toDateString() === new Date().toDateString();
            const isFuture = isFutureDate(date);

            // Determine cell style based on conditions
            let cellStyle =
              "h-12 flex items-center justify-center rounded-lg border-2 ";

            if (isLeaveDay) {
              // Leave days - red
              cellStyle += "bg-red-500 text-white border-red-600 ";
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
              <div key={date.toISOString()} className={cellStyle.trim()}>
                {date.getDate()}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-col md:flex-row justify-between items-center bg-gray-50 rounded-lg p-4 gap-6">
          {/* ✅ Left side: Legend with checkboxes */}
          <div className="flex flex-wrap gap-4 items-center text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <div className="w-4 h-4 bg-red-500 rounded border-2 border-red-600"></div>
              <span>Leave Day</span>
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

          {/* ✅ Right side: Summary */}
          <div className="flex  sm:flex-row items-center gap-6">
            <div className="text-lg font-semibold text-gray-700">
              Annual Leaves :{" "}
              <span className="text-2xl font-bold text-red-600">
                {leaveCounts.annual}
              </span>
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold text-gray-700">
                Remaining Paid Leaves :{" "}
                <span className="text-2xl font-bold text-green-600">
                  {remainingPaid}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render annual calendar
  const renderAnnualCalendar = () => {
    const monthNames = [
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

    const leaveCounts = selectedMr
      ? getLeaveCounts(selectedMr._id)
      : { monthly: 0, annual: 0, paid: 0 };
    const remainingPaid = selectedMr
      ? getRemainingPaidLeaves(selectedMr._id)
      : 0;

    const today = new Date();
    const currentYearToday = today.getFullYear();

    return (
      <div className="bg-white rounded-2xl shadow border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {selectedMr?.medicalRepName}
          </h2>

          <div className="flex items-center gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-blue-800">
                Annual Leaves: {leaveCounts.annual}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <div className="text-sm font-medium text-green-800">
                Remaining Paid: {remainingPaid}
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

                    const isLeaveDay = isLeave(date, selectedMr?._id);
                    const isSundayDay = isSunday(date);
                    const isToday =
                      date.toDateString() === new Date().toDateString();
                    const isFuture = isFutureDate(date);

                    // Determine cell style
                    let cellStyle =
                      "h-6 flex items-center justify-center rounded text-xs ";

                    if (isFuture) {
                      cellStyle += "bg-gray-100 opacity-40 ";
                    } else if (isLeaveDay) {
                      cellStyle += "bg-red-500 text-white ";
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

  if (loading) return <div className="p-6 text-center">Loading MR List...</div>;
  if (error) return <div className="p-6 text-red-500 text-center">{error}</div>;

  return (
    <div className="p-6">
      {!showCalendarView && (
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">MR List</h1>

          <div className="flex items-center gap-4">
            <p className="text-lg font-semibold text-gray-700">
              Total Count:{" "}
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                {filteredMRList.length}
              </span>
            </p>
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
          <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden text-center shadow-sm">
            <thead className="bg-gray-100 text-gray-700 border-b text-sm">
              <tr>
                <th className="p-3">Sr No</th>
                <th className="p-3">MR Name</th>
                <th className="p-3">MR Email</th>
                <th className="p-3">MR Contact</th>
                <th className="p-3">Leave Count (Annual)</th>
                <th className="p-3">Leave Count (Monthly)</th>
                <th className="p-3">Paid Leave</th>
                <th className="p-3">Remaining Paid</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>

            <tbody>
              {currentMRs.length > 0 ? (
                currentMRs.map((mr, index) => {
                  const leaveCounts = getLeaveCounts(mr._id);
                  const remainingPaid = getRemainingPaidLeaves(mr._id);

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
                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-sm font-medium">
                          {leaveCounts.annual}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm font-medium">
                          {leaveCounts.monthly}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-sm font-medium">
                          {leaveCounts.paid}
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
                          <Eye size={16} /> View Leave
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

export default Leaves;
